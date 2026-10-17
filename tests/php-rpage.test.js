import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parsePost, fetchRpage } from "../src/fetch/adapters/php-rpage.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const read = (n) => readFileSync(new URL(`./fixtures/php-rpage/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.bjps.tp.edu.tw";
const SCHOOL = {
  code: "383611",
  name: "博嘉實驗國小",
  url: BASE,
  adapter: "php-rpage",
  params: { list_path: "/p/403-1000-13", board_name: "學校公告" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");
const EMPTY = "<html><body><div id='pageptlist'></div></body></html>";

/** Serves list pages 1 and 2, an empty page 3, and every post as the text post. */
function site() {
  const urls = [];
  const http = {
    getText: async (url) => {
      urls.push(url);
      if (url === `${BASE}/p/403-1000-13-1.php`) return read("bjps-list-1");
      if (url === `${BASE}/p/403-1000-13-2.php`) return read("bjps-list-2");
      if (url.includes("/p/403-")) return EMPTY;
      return read("bjps-post-text");
    },
  };
  return { http, urls };
}

test("parseList reads each row's date, title and link in site order", () => {
  const rows = parseList(read("bjps-list-1"), BASE);
  assert.equal(rows.length, 20);
  assert.deepEqual(rows[0], {
    id: "3168",
    url: `${BASE}/p/406-1000-3168,r13.php`,
    title: "115學年度第 1 學期學校日家長提問回覆彙整表",
    date: "2026-09-18",
  });
  assert.deepEqual(rows.slice(0, 4).map((r) => r.id), ["3168", "3010", "1627", "3247"]);
});

test("parseList gives no rows for a page past the last one", () => {
  assert.deepEqual(parseList(EMPTY, BASE), []);
});

test("parsePost keeps the body and lists each attachment by its file name", () => {
  const text = parsePost(read("bjps-post-text"), BASE);
  assert.match(text.content_html, /萬芳醫院舉辦韌性醫療實地演練/);
  assert.deepEqual(text.attachments, []);
  const files = parsePost(read("bjps-post-attach"), BASE);
  assert.equal(files.attachments.length, 1);
  assert.equal(files.attachments[0].name, "11510菜單.pdf");
  assert.ok(files.attachments[0].url.startsWith(`${BASE}/app/index.php?Action=downloadfile&file=`));
});

test("fetchRpage reads pages until 30 posts and keeps the site's order", async () => {
  const s = site();
  const items = await fetchRpage(SCHOOL, s.http, NOW);
  assert.deepEqual(s.urls.filter((u) => u.includes("/p/403-")), [`${BASE}/p/403-1000-13-1.php`, `${BASE}/p/403-1000-13-2.php`]);
  assert.equal(items.length, 30);
  assert.deepEqual(items.slice(0, 3).map((i) => i.id), ["rpage:3168", "rpage:3010", "rpage:1627"]);
  assert.equal(items[20].id, "rpage:3076");
  assert.ok(items.every((i) => !i.pinned && i.unit === null));
  assert.equal(items[2].published_at, "2024-10-25T00:00:00+08:00");
  assert.equal(items[0].source_url, `${BASE}/p/406-1000-3168,r13.php`);
});

test("fetchRpage stops at an empty page and keeps what it has", async () => {
  const s = site();
  s.http.getText = ((inner) => async (url) => (url.endsWith("-2.php") ? EMPTY : inner(url)))(s.http.getText);
  const items = await fetchRpage(SCHOOL, s.http, NOW);
  assert.equal(items.length, 20);
});

test("fetchRpage reads a post page only for posts it has not seen", async () => {
  const first = await fetchRpage(SCHOOL, site().http, NOW);
  const previous = first.slice(1).map((i) => ({ ...i, content_html: "<p>舊內容</p>" }));
  const s = site();
  const items = await fetchRpage(SCHOOL, s.http, NOW, previous);
  assert.deepEqual(s.urls.filter((u) => u.includes("/p/406-")), [`${BASE}/p/406-1000-3168,r13.php`]);
  assert.equal(items[1].content_html, "<p>舊內容</p>");
});

test("fetchRpage fails when the first page lists no posts", async () => {
  await assert.rejects(fetchRpage(SCHOOL, { getText: async () => EMPTY }, NOW), AdapterError);
});

test("the school list name php-rpage selects this adapter", () => {
  assert.equal(adapters["php-rpage"], fetchRpage);
});
