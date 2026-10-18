import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parsePost, fetchIweb } from "../src/fetch/adapters/x-iweb.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const read = (n) => readFileSync(new URL(`./fixtures/x-iweb/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.hmps.tp.edu.tw";
const SCHOOL = {
  code: "331603",
  name: "新民小學",
  url: BASE,
  adapter: "x-iweb",
  params: { list_path: "/news1", board_name: "最新資訊" },
  status: "ok",
};
const NOW = new Date("2026-10-18T12:00:00+08:00");

/** Serves list pages 1-3 (page 3 links to itself as next) and every post as the file post. */
function site() {
  const urls = [];
  const http = {
    getText: async (url) => {
      urls.push(url);
      const page = url.match(/\/news1_(\d+)\.html$/);
      if (page) return read(`hmps-list-${Math.min(Number(page[1]), 3)}`);
      return read("hmps-post-file");
    },
  };
  return { http, urls };
}

test("parseList reads each post link and title, and the next page link", () => {
  const { rows, next } = parseList(read("hmps-list-1"), `${BASE}/news1_1.html`);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { id: "49", url: `${BASE}/news-49.html`, title: "115年 私立學校獎勵補助計畫" });
  assert.equal(next, `${BASE}/news1_2.html`);
});

test("parsePost lists only the site's file links as attachments and keeps the body", () => {
  const p = parsePost(read("hmps-post-mixed"), BASE);
  assert.match(p.content_html, /tpcityart\.tp\.edu\.tw/);
  assert.match(p.content_html, /<img/);
  assert.deepEqual(p.attachments, [
    {
      name: "115學年度學生五項藝術比賽活動時程表",
      url: `${BASE}/userfiles/files/115%E4%BA%94%E9%A0%85%E8%97%9D%E8%A1%93%E6%AF%94%E8%B3%BD-%E6%99%82%E7%A8%8B%E8%A1%A8.pdf`,
    },
  ]);
});

test("fetchIweb follows next links until a page repeats and keeps the site's order", async () => {
  const s = site();
  const items = await fetchIweb(SCHOOL, s.http, NOW);
  assert.deepEqual(s.urls.filter((u) => /news1_/.test(u)), [1, 2, 3].map((n) => `${BASE}/news1_${n}.html`));
  assert.equal(items.length, 25);
  assert.deepEqual(items.slice(0, 2).map((i) => i.id), ["iweb:49", "iweb:48"]);
  assert.equal(items[24].id, "iweb:2");
  assert.ok(items.every((i) => i.published_at === null && i.unit === null && !i.pinned));
  assert.equal(items[0].source_url, `${BASE}/news-49.html`);
  assert.equal(items[0].attachments.length, 1);
});

test("fetchIweb reads a post page only for posts it has not seen", async () => {
  const first = await fetchIweb(SCHOOL, site().http, NOW);
  const previous = first.slice(1).map((i) => ({ ...i, content_html: "<p>舊內容</p>" }));
  const s = site();
  const items = await fetchIweb(SCHOOL, s.http, NOW, previous);
  assert.deepEqual(s.urls.filter((u) => /news-\d+/.test(u)), [`${BASE}/news-49.html`]);
  assert.equal(items[1].content_html, "<p>舊內容</p>");
});

test("fetchIweb fails when the first page lists no posts", async () => {
  await assert.rejects(fetchIweb(SCHOOL, { getText: async () => "<html></html>" }, NOW), AdapterError);
});

test("the school list name x-iweb selects this adapter", () => {
  assert.equal(adapters["x-iweb"], fetchIweb);
});
