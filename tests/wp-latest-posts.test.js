import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLatestPosts, fetchWpLatestPosts } from "../src/fetch/adapters/wp-latest-posts.js";
import { AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const HOME = readFileSync(new URL("./fixtures/wp-latest-posts/nccu-home.html", import.meta.url), "utf8");
const BASE = "https://www.es.nccu.edu.tw";
const SCHOOL = {
  code: "380601",
  name: "國立政大實小",
  url: BASE,
  adapter: "wp-latest-posts",
  params: { heading: "一般消息", board_name: "一般消息" },
  status: "ok",
};
const NOW = new Date("2026-10-17T12:00:00+08:00");

test("parseLatestPosts reads the posts listed under the named heading only", () => {
  const posts = parseLatestPosts(HOME, "一般消息", BASE);
  assert.equal(posts.length, 10);
  assert.deepEqual(posts[0], {
    url: `${BASE}/archives/27994`,
    title: "轉知衛生福利部修訂「115—116年度COVID—19疫苗接種計畫」",
  });
  assert.equal(posts[9].url, `${BASE}/archives/27951`);
  assert.ok(!posts.some((p) => p.title.startsWith("恭喜")), "榮譽 posts belong to another heading");
});

test("parseLatestPosts gives null when the heading is missing", () => {
  assert.equal(parseLatestPosts(HOME, "不存在的標題", BASE), null);
});

test("fetchWpLatestPosts reads the home page once and gives title-only items", async () => {
  const urls = [];
  const http = { getText: async (url) => (urls.push(url), HOME) };
  const items = await fetchWpLatestPosts(SCHOOL, http, NOW);
  assert.deepEqual(urls, [`${BASE}/`]);
  assert.equal(items.length, 10);
  assert.deepEqual(items[0], {
    id: "wplp:27994",
    title: "轉知衛生福利部修訂「115—116年度COVID—19疫苗接種計畫」",
    unit: null,
    published_at: null,
    expires_at: null,
    pinned: false,
    content_html: "",
    attachments: [],
    source_url: `${BASE}/archives/27994`,
  });
});

test("fetchWpLatestPosts fails when the heading is gone from the home page", async () => {
  const http = { getText: async () => "<html><body><h1>其他</h1></body></html>" };
  await assert.rejects(fetchWpLatestPosts(SCHOOL, http, NOW), AdapterError);
});

test("the school list name wp-latest-posts selects this adapter", () => {
  assert.equal(adapters["wp-latest-posts"], fetchWpLatestPosts);
});
