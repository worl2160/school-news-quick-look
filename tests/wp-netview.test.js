import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseList, parseArticle, fetchWpNetview } from "../src/fetch/adapters/wp-netview.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";
import { FetchError } from "../src/fetch/http.js";

const read = (n) => readFileSync(new URL(`./fixtures/wp-netview/${n}.html`, import.meta.url), "utf8");
const BASE = "https://www.djes.tp.edu.tw";
const SCHOOL = {
  code: "343606",
  name: "大佳國小",
  url: BASE,
  adapter: "wp-netview",
  params: { list_path: "/category/news/", board_name: "校園公告" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");
const PINNED = ["14447", "14444", "14201", "14148", "14091", "13996", "13948"];
const PAGE2_FIRST10 = ["14476", "14490", "14475", "14472", "14471", "14470", "14469", "14468", "14467", "14466"];

/** Serves list pages 1 and 2 from fixtures, every post page as the plain post, and 404 for the rest. */
function site({ page3 = false } = {}) {
  const urls = [];
  const http = {
    getText: async (url) => {
      urls.push(url);
      if (url === `${BASE}/category/news/`) return read("djes-list-1");
      if (url === `${BASE}/category/news/page/2/`) return read("djes-list-2");
      if (url === `${BASE}/category/news/page/3/` && page3) return read("djes-list-2");
      if (url.startsWith(`${BASE}/news/`)) return read("djes-post-plain");
      throw new FetchError(`${url}: HTTP 404`, 404);
    },
  };
  return { http, urls };
}

test("parseList reads every row, marks pins and drops the 置頂 label from the title", () => {
  const rows = parseList(read("djes-list-1"), BASE);
  assert.equal(rows.length, 27);
  assert.deepEqual(rows.filter((r) => r.pinned).map((r) => r.nid), PINNED);
  const pin = rows.find((r) => r.nid === "13948");
  assert.equal(pin.title, "大佳國小防疫小叮嚀~大佳(家)好健康!");
  assert.equal(pin.date, "2026-08-10");
  assert.equal(pin.unit, "衛生組");
  assert.ok(pin.url.startsWith(`${BASE}/news/`));
  const first = rows.find((r) => !r.pinned);
  assert.deepEqual([first.nid, first.date, first.unit, first.pinned], ["14498", "2026-10-16", "生活教育組", false]);
});

test("parseList gives no rows for a page without the announcement table", () => {
  assert.deepEqual(parseList("<html><body><p>維護中</p></body></html>", BASE), []);
});

test("parseArticle keeps the announcement body and no attachments when there are none", () => {
  const a = parseArticle(read("djes-post-plain"), BASE);
  assert.match(a.content_html, /依據教育部國民及學前教育署115年10月14日/);
  assert.doesNotMatch(a.content_html, /點閱次數|公告主旨/);
  assert.deepEqual(a.attachments, []);
});

test("parseArticle lists each attachment once with its file name and absolute link", () => {
  const a = parseArticle(read("djes-post-attach"), BASE);
  assert.deepEqual(a.attachments, [
    { name: "招生簡章.pdf", url: `${BASE}/wp-content/uploads/doc/djes111/${encodeURIComponent("招生簡章")}.pdf` },
  ]);
});

test("fetchWpNetview reads pages until 30 regular items, plus every pin", async () => {
  const s = site({ page3: true });
  const items = await fetchWpNetview(SCHOOL, s.http, NOW);
  const lists = s.urls.filter((u) => u.includes("/category/"));
  assert.deepEqual(lists, [`${BASE}/category/news/`, `${BASE}/category/news/page/2/`]);
  assert.equal(items.length, 37);
  assert.deepEqual(items.filter((i) => i.pinned).map((i) => i.id), PINNED.map((n) => `wpnv:${n}`));
  assert.deepEqual(items.slice(-10).map((i) => i.id), PAGE2_FIRST10.map((n) => `wpnv:${n}`));
  const pin = items.find((i) => i.id === "wpnv:13948");
  assert.equal(pin.published_at, "2026-08-10T00:00:00+08:00");
  assert.equal(pin.expires_at, null);
  assert.equal(pin.unit, "衛生組");
  assert.ok(pin.source_url.startsWith(`${BASE}/news/`));
  assert.match(pin.content_html, /依據教育部國民及學前教育署/);
});

test("fetchWpNetview reads a post page only for posts it has not seen", async () => {
  const first = await fetchWpNetview(SCHOOL, site().http, NOW);
  const previous = first.filter((i) => i.id !== "wpnv:14498").map((i) => ({ ...i, content_html: "<p>舊內容</p>" }));
  const s = site();
  const items = await fetchWpNetview(SCHOOL, s.http, NOW, previous);
  assert.equal(s.urls.filter((u) => u.startsWith(`${BASE}/news/`)).length, 1);
  assert.match(items.find((i) => i.id === "wpnv:14498").content_html, /依據教育部/);
  assert.equal(items.find((i) => i.id === "wpnv:14497").content_html, "<p>舊內容</p>");
});

test("fetchWpNetview stops at the last page and keeps what it has", async () => {
  const s = site();
  s.http.getText = ((inner) => async (url) => {
    if (url.endsWith("/page/2/")) throw new FetchError(`${url}: HTTP 404`, 404);
    return inner(url);
  })(s.http.getText);
  const items = await fetchWpNetview(SCHOOL, s.http, NOW);
  assert.equal(items.length, 27);
});

test("fetchWpNetview fails when the first page has no announcement table", async () => {
  const http = { getText: async () => "<html><body>維護中</body></html>" };
  await assert.rejects(fetchWpNetview(SCHOOL, http, NOW), AdapterError);
});

test("a pin repeated on a later page is listed once, as a pin", async () => {
  const s = site();
  const page2 = read("djes-list-2").replace('nid="14476"', 'nid="13948"');
  s.http.getText = ((inner) => async (url) => (url.endsWith("/page/2/") ? page2 : inner(url)))(s.http.getText);
  const items = await fetchWpNetview(SCHOOL, s.http, NOW);
  assert.equal(items.filter((i) => i.id === "wpnv:13948").length, 1);
  assert.equal(items.filter((i) => !i.pinned).length, 30);
});

test("the school list name wp-netview selects this adapter", () => {
  assert.equal(adapters["wp-netview"], fetchWpNetview);
});
