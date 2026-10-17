import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseNews, fetchXoops } from "../src/fetch/adapters/php-xoops.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const read = (n) => readFileSync(new URL(`./fixtures/php-xoops/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.syps.tp.edu.tw";
const LIST = `${BASE}/modules/tadnews/ajax_list_content.php`;
const SCHOOL = {
  code: "373602",
  name: "雙園國小",
  url: BASE,
  adapter: "php-xoops",
  params: { board_name: "雙園公告區" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");

/** Serves the list endpoint and every news page (as the attachment page) from fixtures. */
function site() {
  const posts = [];
  const pages = [];
  const http = {
    postForm: async (url, fields) => {
      posts.push({ url, fields });
      return read("syps-list");
    },
    getText: async (url) => {
      pages.push(url);
      return read("syps-news-attach");
    },
  };
  return { http, posts, pages };
}

test("parseList reads each row with its pin mark, date, unit and link", () => {
  const rows = parseList(read("syps-list"), BASE);
  assert.equal(rows.length, 50);
  assert.deepEqual(rows.filter((r) => r.pinned).map((r) => r.nsn), ["3898", "3893"]);
  assert.deepEqual(rows[0], {
    nsn: "3898",
    url: `${BASE}/modules/tadnews/index.php?nsn=3898`,
    title: "臺北市萬華區雙園國民小學附設幼兒園 115 學年度第一學期 第 2 次幼兒園時薪制特教助理員甄選簡章",
    date: "2026-10-16",
    unit: "幼兒園",
    pinned: true,
  });
});

test("parseNews keeps the body without the info line, and each attachment by its file name", () => {
  const n = parseNews(read("syps-news-attach"), BASE);
  assert.match(n.content_html, /報名時間：115\/10\/21/);
  assert.doesNotMatch(n.content_html, /點閱數/);
  assert.deepEqual(n.attachments, [
    {
      name: "(1016)115學年度第一學期臺北市雙園附幼時薪制特教助理員簡章.pdf",
      url: `${BASE}/modules/tadnews/index.php?op=tufdl&files_sn=3492`,
    },
  ]);
});

test("parseNews gives no attachments for a post without files", () => {
  assert.deepEqual(parseNews(read("syps-news-plain"), BASE).attachments, []);
});

test("fetchXoops asks the list for 50 rows once and keeps pins plus 30 regular posts", async () => {
  const s = site();
  const items = await fetchXoops(SCHOOL, s.http, NOW);
  assert.equal(s.posts.length, 1);
  assert.equal(s.posts[0].url, LIST);
  assert.equal(s.posts[0].fields.num, 50);
  assert.equal(items.length, 32);
  assert.deepEqual(items.slice(0, 2).map((i) => [i.id, i.pinned]), [["xoops:3898", true], ["xoops:3893", true]]);
  assert.equal(items[2].id, "xoops:3897");
  assert.equal(items[31].id, "xoops:3867");
  assert.equal(items[0].published_at, "2026-10-16T00:00:00+08:00");
  assert.equal(items[0].unit, "幼兒園");
  assert.equal(items[0].source_url, `${BASE}/modules/tadnews/index.php?nsn=3898`);
  assert.equal(items[0].attachments.length, 1);
});

test("fetchXoops reads a news page only for posts it has not seen", async () => {
  const first = await fetchXoops(SCHOOL, site().http, NOW);
  const previous = first.slice(1).map((i) => ({ ...i, content_html: "<p>舊內容</p>" }));
  const s = site();
  const items = await fetchXoops(SCHOOL, s.http, NOW, previous);
  assert.deepEqual(s.pages, [`${BASE}/modules/tadnews/index.php?nsn=3898`]);
  assert.equal(items[1].content_html, "<p>舊內容</p>");
});

test("fetchXoops fails when the list has no posts", async () => {
  const http = { postForm: async () => "<p>no</p>", getText: async () => "" };
  await assert.rejects(fetchXoops(SCHOOL, http, NOW), AdapterError);
});

test("the school list name php-xoops selects this adapter", () => {
  assert.equal(adapters["php-xoops"], fetchXoops);
});
