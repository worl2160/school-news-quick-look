import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseForum, parseTopic, fetchPhpbb } from "../src/fetch/adapters/php-phpbb.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const read = (n) => readFileSync(new URL(`./fixtures/php-phpbb/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.ntueees.tp.edu.tw";
const FORUM = `${BASE}/phpBB/viewforum.php?f=2`;
const SCHOOL = {
  code: "330601",
  name: "國立臺北教大實小",
  url: BASE,
  adapter: "php-phpbb",
  params: { forum_path: "/phpBB/viewforum.php?f=2", board_name: "最新消息" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");

/** Serves forum pages 1 and 2 from fixtures and every topic as the attachment topic. */
function site() {
  const urls = [];
  const http = {
    getText: async (url) => {
      urls.push(url);
      if (url === FORUM) return read("ntueees-forum-1");
      if (url === `${FORUM}&start=25`) return read("ntueees-forum-2");
      if (url.startsWith(`${BASE}/phpBB/viewtopic.php`)) return read("ntueees-topic-attach");
      throw new Error(`unexpected ${url}`);
    },
  };
  return { http, urls };
}

test("parseForum reads each topic row and the next page link", () => {
  const { rows, next } = parseForum(read("ntueees-forum-1"), FORUM);
  assert.equal(rows.length, 25);
  assert.deepEqual(rows[0], {
    id: "8210",
    url: `${BASE}/phpBB/viewtopic.php?t=8210`,
    title: "國中小學生職業試探-工業4.0機械手臂體驗營",
    published_at: "2026-10-16T16:12:00+08:00",
    pinned: false,
  });
  assert.equal(next, `${FORUM}&start=25`);
});

test("parseForum gives no next link on a page without one", () => {
  const html = read("ntueees-forum-1").replaceAll('rel="next"', 'rel="x"');
  assert.equal(parseForum(html, FORUM).next, null);
});

test("parseForum marks sticky and announcement rows as pinned", () => {
  const html = read("ntueees-forum-1").replace('row-item topic_read', 'row-item sticky_read');
  assert.equal(parseForum(html, FORUM).rows[0].pinned, true);
});

test("parseTopic keeps the first post's body and its attachments", () => {
  const t = parseTopic(read("ntueees-topic-attach"), `${BASE}/phpBB/viewtopic.php?t=8210`);
  assert.match(t.content_html, /研習日期：115年11月7日/);
  assert.deepEqual(t.attachments, [
    { name: "「國中小學生職業試探-工業4.0機械手臂體驗營」實施計畫 .pdf", url: `${BASE}/phpBB/download/file.php?id=10375` },
  ]);
});

test("fetchPhpbb reads forum pages until 30 topics, newest first", async () => {
  const s = site();
  const items = await fetchPhpbb(SCHOOL, s.http, NOW);
  assert.deepEqual(s.urls.filter((u) => u.includes("viewforum")), [FORUM, `${FORUM}&start=25`]);
  assert.equal(items.length, 30);
  assert.equal(items[0].id, "phpbb:8210");
  assert.equal(items[25].id, "phpbb:8144");
  const times = items.map((i) => i.published_at);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(items[0].source_url, `${BASE}/phpBB/viewtopic.php?t=8210`);
  assert.equal(items[0].unit, null);
  assert.equal(items[0].attachments.length, 1);
});

test("fetchPhpbb reads a topic page only for topics it has not seen", async () => {
  const first = await fetchPhpbb(SCHOOL, site().http, NOW);
  const previous = first.slice(1).map((i) => ({ ...i, content_html: "<p>舊內容</p>" }));
  const s = site();
  const items = await fetchPhpbb(SCHOOL, s.http, NOW, previous);
  assert.deepEqual(s.urls.filter((u) => u.includes("viewtopic")), [`${BASE}/phpBB/viewtopic.php?t=8210`]);
  assert.equal(items[1].content_html, "<p>舊內容</p>");
});

test("fetchPhpbb fails when the first page lists no topics", async () => {
  await assert.rejects(fetchPhpbb(SCHOOL, { getText: async () => "<html></html>" }, NOW), AdapterError);
});

test("the school list name php-phpbb selects this adapter", () => {
  assert.equal(adapters["php-phpbb"], fetchPhpbb);
});
