import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseNews, fetchYascms } from "../src/fetch/adapters/py-yascms.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const read = (n) => readFileSync(new URL(`./fixtures/py-yascms/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.bjes.tp.edu.tw";
const SCHOOL = {
  code: "343611",
  name: "濱江國小",
  url: BASE,
  adapter: "py-yascms",
  params: { board_name: "最新消息" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");

/** Serves the list and every news page (as the attachment page) from fixtures. */
function site() {
  const urls = [];
  const http = {
    getText: async (url) => {
      urls.push(url);
      return read(url.includes("/news/list") ? "bjes-list" : "bjes-news-attach");
    },
  };
  return { http, urls };
}

test("parseList reads each row with its pin mark, date and unit", () => {
  const rows = parseList(read("bjes-list"), BASE);
  assert.equal(rows.length, 55);
  assert.equal(rows.filter((r) => r.pinned).length, 25);
  assert.deepEqual(rows[0], {
    id: "2780",
    url: `${BASE}/news/get/2780`,
    title: "115學年度第2學期第1次臺北市國民義務教育階段身心障礙學生在家教育申請",
    date: "2026-10-16",
    unit: "輔特組長",
    pinned: true,
  });
  assert.equal(rows.find((r) => !r.pinned).id, "2779");
});

test("parseNews reads the full time, the body and each attachment", () => {
  const n = parseNews(read("bjes-news-attach"), BASE);
  assert.equal(n.published_at, "2026-10-16T19:05:00+08:00");
  assert.match(n.content_html, /北市教特字第11330926351號/);
  assert.doesNotMatch(n.content_html, /發佈者/);
  assert.deepEqual(n.attachments, [
    {
      name: "臺北市國民義務教育階段身心障礙學生在家教育服務申請表.pdf",
      url: `${BASE}/uploads/news/2026/10/2780_txnr58ze.pdf`,
    },
  ]);
});

test("parseNews gives no attachments for a post without files", () => {
  const n = parseNews(read("bjes-news-plain"), BASE);
  assert.equal(n.published_at, "2026-10-15T07:29:00+08:00");
  assert.deepEqual(n.attachments, []);
});

test("fetchYascms reads the first list page once with q=30 and keeps every pin plus 30 posts", async () => {
  const s = site();
  const items = await fetchYascms(SCHOOL, s.http, NOW);
  assert.deepEqual(s.urls.filter((u) => u.includes("/news/list")), [`${BASE}/news/list?p=1&q=30`]);
  assert.equal(items.length, 55);
  assert.equal(items.filter((i) => i.pinned).length, 25);
  assert.equal(items[25].id, "yascms:2779");
  assert.equal(items[54].id, "yascms:2741");
  assert.equal(items[0].published_at, "2026-10-16T19:05:00+08:00");
  assert.equal(items[0].unit, "輔特組長");
  assert.equal(items[0].source_url, `${BASE}/news/get/2780`);
});

test("fetchYascms reads a news page only for posts it has not seen, keeping the stored time", async () => {
  const first = await fetchYascms(SCHOOL, site().http, NOW);
  const previous = first.slice(1).map((i) => ({ ...i, content_html: "<p>舊內容</p>", published_at: "2026-01-01T08:00:00+08:00" }));
  const s = site();
  const items = await fetchYascms(SCHOOL, s.http, NOW, previous);
  assert.deepEqual(s.urls.filter((u) => u.includes("/news/get/")), [`${BASE}/news/get/2780`]);
  assert.equal(items[1].content_html, "<p>舊內容</p>");
  assert.equal(items[1].published_at, "2026-01-01T08:00:00+08:00");
});

test("a news page without a time falls back to the list date", async () => {
  const http = {
    getText: async (url) => (url.includes("/news/list") ? read("bjes-list") : "<main><div class='card-body'>內容</div></main>"),
  };
  const items = await fetchYascms(SCHOOL, http, NOW);
  assert.equal(items[0].published_at, "2026-10-16T00:00:00+08:00");
});

test("fetchYascms fails when the list has no posts", async () => {
  await assert.rejects(fetchYascms(SCHOOL, { getText: async () => "<html></html>" }, NOW), AdapterError);
});

test("the school list name py-yascms selects this adapter", () => {
  assert.equal(adapters["py-yascms"], fetchYascms);
});
