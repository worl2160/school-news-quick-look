import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttp, FetchError, USER_AGENT } from "../src/fetch/http.js";

function fakeFetch(reply = () => new Response("{}", { status: 200 })) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return reply(url, init);
  };
  return { impl, calls };
}

test("sends the fixed User-Agent and JSON body", async () => {
  const f = fakeFetch();
  const http = createHttp({ fetchImpl: f.impl, sleep: async () => {} });
  await http.postJson("https://a.tw/x", { a: 1 });
  const h = new Headers(f.calls[0].init.headers);
  assert.equal(
    USER_AGENT,
    "school-news-quick-look/1.0 (+https://github.com/worl2160/school-news-quick-look)",
  );
  assert.equal(h.get("user-agent"), USER_AGENT);
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("cookie"), null);
  assert.equal(f.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { a: 1 });
});

test("waits at least minGapMs between requests", async () => {
  const f = fakeFetch(() => new Response("ok"));
  const waits = [];
  const http = createHttp({ fetchImpl: f.impl, sleep: async (ms) => waits.push(ms) });
  await http.getText("https://a.tw/1");
  await http.getText("https://a.tw/2");
  assert.equal(f.calls.length, 2);
  assert.ok(waits.some((ms) => ms >= 1000), `waits: ${waits}`);
});

test("non-JSON reply raises FetchError", async () => {
  const f = fakeFetch(() => new Response("<html>維護中</html>", { status: 200 }));
  const http = createHttp({ fetchImpl: f.impl, sleep: async () => {} });
  await assert.rejects(http.postJson("https://a.tw/x", {}), FetchError);
});

test("HTTP error status raises FetchError with the status", async () => {
  const f = fakeFetch(() => new Response("no", { status: 503 }));
  const http = createHttp({ fetchImpl: f.impl, sleep: async () => {} });
  await assert.rejects(http.getText("https://a.tw/x"), (e) => e instanceof FetchError && e.status === 503);
});
