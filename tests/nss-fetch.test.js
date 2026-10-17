import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchNss, AdapterError } from "../src/fetch/adapters/nss.js";
import { adapters } from "../src/fetch/adapters/index.js";

const SCHOOL = {
  code: "313601",
  name: "松山國小",
  url: "https://www.ssps.tp.edu.tw",
  adapter: "nss",
  params: { upath: "main", mid: "5abf2d62aa93092cee58ceb4", sid: "1AvhodR1985", board_name: "最新消息" },
  status: "ok",
};
const VISITOR = {
  between: { max: "dtime", min: "stime", value: "now" },
  match: { released: true, status: "passed", show: true },
};

function recorder(reply) {
  const calls = [];
  return {
    calls,
    http: {
      getText: async () => "",
      postJson: async (url, body) => {
        calls.push({ url, body });
        return reply(calls.length);
      },
    },
  };
}

test("fetchNss sends the visitor query twice: pins then 40 newest", async () => {
  const r = recorder(() => ({ error: 0, msg: "ok", data: { result: [] } }));
  const items = await fetchNss(SCHOOL, r.http, new Date("2026-10-17T12:00:00+08:00"));
  assert.deepEqual(items, []);
  assert.equal(r.calls.length, 2);
  for (const c of r.calls) {
    assert.equal(c.url, "https://www.ssps.tp.edu.tw/nss/site/main/storage/5abf2d62aa93092cee58ceb4/1AvhodR1985/find");
    assert.equal(c.body.vector, "private");
    assert.equal(c.body.static, false);
    assert.deepEqual(c.body.option.query[0].between, VISITOR.between);
    for (const [k, v] of Object.entries(VISITOR.match)) assert.equal(c.body.option.query[0].match[k], v);
  }
  assert.equal(r.calls[0].body.option.query[0].match.top, true);
  assert.equal(r.calls[0].body.option.number, 999);
  assert.equal(r.calls[1].body.option.number, 40);
  assert.equal(r.calls[1].body.option.query[0].match.top, undefined);
  assert.deepEqual(r.calls[1].body.option.sort, { stime: -1, ctime: -1 });
});

test("nss error reply raises AdapterError", async () => {
  const r = recorder(() => ({ error: 1, msg: "Argument passed in must be..." }));
  await assert.rejects(fetchNss(SCHOOL, r.http, new Date()), (e) => e instanceof AdapterError && /nss error/.test(e.message));
});

test("the nss adapter is registered", () => {
  assert.equal(adapters.nss, fetchNss);
});
