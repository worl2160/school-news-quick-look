import { test } from "node:test";
import assert from "node:assert/strict";
import { runAll, loadPrevious } from "../src/fetch/run.js";

const NOW = new Date("2026-10-17T13:05:00+08:00");
const NOW_ISO = "2026-10-17T13:05:00+08:00";

function school(code, adapter = "fake") {
  return {
    code,
    name: "校" + code,
    city: "臺北市",
    district: "松山區",
    type: "public",
    url: `https://s${code}.tp.edu.tw`,
    adapter,
    params: adapter ? { board_name: "最新消息" } : null,
    status: adapter ? "ok" : "unsupported",
  };
}
const item = (id, published_at) => ({ id, title: id, published_at, pinned: false });

test("a failing school keeps its previous items and is marked stale", async () => {
  const old = { schema: 1, items: [item("x", "2026-10-01T08:00:00+08:00")], last_success_at: "2026-10-16T10:05:00+08:00" };
  const fake = async (s) => {
    if (s.code === "B") throw new Error("timed out");
    return [item("a1", "2026-10-16T16:04:00+08:00")];
  };
  const { index, files } = await runAll({
    schools: [school("A"), school("B")],
    previous: new Map([["B", old]]),
    adapters: { fake },
    http: {},
    now: NOW,
  });
  const b = files.get("B");
  assert.deepEqual(b.items, old.items);
  assert.equal(b.error, "timed out");
  assert.equal(b.last_success_at, "2026-10-16T10:05:00+08:00");
  assert.equal(b.last_attempt_at, NOW_ISO);
  const byCode = Object.fromEntries(index.schools.map((s) => [s.code, s]));
  assert.equal(byCode.B.status, "stale");
  assert.equal(byCode.A.status, "ok");
  assert.equal(files.get("A").last_success_at, NOW_ISO);
  assert.equal(files.get("A").error, null);
  assert.equal(index.schema, 1);
  assert.equal(index.generated_at, NOW_ISO);
});

test("missing previous data is treated as empty", async () => {
  const { index, files } = await runAll({
    schools: [school("B")],
    previous: new Map(),
    adapters: { fake: async () => { throw new Error("boom"); } },
    http: {},
    now: NOW,
  });
  assert.deepEqual(files.get("B").items, []);
  assert.equal(files.get("B").last_success_at, null);
  assert.equal(index.schools[0].status, "stale");
});

test("unsupported schools are listed but not fetched", async () => {
  let called = 0;
  const { index, files } = await runAll({
    schools: [school("U", null)],
    previous: new Map(),
    adapters: { fake: async () => { called++; return []; } },
    http: {},
    now: NOW,
  });
  assert.equal(called, 0);
  assert.equal(index.schools[0].status, "unsupported");
  assert.equal(files.has("U"), false);
});

test("index carries latest_published_at and board_name", async () => {
  const { index } = await runAll({
    schools: [school("A")],
    previous: new Map(),
    adapters: {
      fake: async () => [item("p", "2026-10-02T08:00:00+08:00"), item("n", "2026-10-16T16:04:00+08:00")],
    },
    http: {},
    now: NOW,
  });
  assert.equal(index.schools[0].latest_published_at, "2026-10-16T16:04:00+08:00");
  assert.equal(index.schools[0].board_name, "最新消息");
});

test("loadPrevious skips schools that 404", async () => {
  const http = {
    getText: async (url) => {
      if (url.endsWith("/A.json")) return JSON.stringify({ schema: 1, items: [] });
      const e = new Error("HTTP 404");
      e.status = 404;
      throw e;
    },
  };
  const prev = await loadPrevious("https://x.github.io/app/data", ["A", "B"], http);
  assert.deepEqual([...prev.keys()], ["A"]);
});

test("schools left when the run deadline passes keep old data and are marked stale", async () => {
  let t = 0;
  const old = { items: [item("o", "2026-10-01T08:00:00+08:00")], last_success_at: "2026-10-16T10:05:00+08:00" };
  let fetched = [];
  const { index, files } = await runAll({
    schools: [school("A"), school("B"), school("C")],
    previous: new Map([["C", old]]),
    adapters: { fake: async (s) => { fetched.push(s.code); t += 600; return []; } },
    http: {},
    now: NOW,
    deadline: 1000,
    clock: () => t,
  });
  assert.deepEqual(fetched, ["A", "B"]);
  const c = files.get("C");
  assert.equal(c.error, "skipped: run deadline");
  assert.deepEqual(c.items, old.items);
  assert.equal(index.schools.find((s) => s.code === "C").status, "stale");
});

import { loadPublished } from "../src/fetch/run.js";

test("loadPublished returns the live index and every school file it lists", async () => {
  const live = {
    "index.json": { schema: 1, schools: [{ code: "A", status: "ok" }, { code: "U", status: "unsupported" }] },
    "A.json": { schema: 1, items: [] },
  };
  const http = {
    getText: async (url) => {
      const name = url.split("/").pop();
      if (!live[name]) throw new Error("HTTP 404");
      return JSON.stringify(live[name]);
    },
  };
  const got = await loadPublished("https://x.github.io/app/data", http);
  assert.deepEqual(got.index, live["index.json"]);
  assert.deepEqual([...got.files.keys()], ["A"]);
});

test("loadPublished gives null when the live index or a listed file is missing", async () => {
  const http = { getText: async () => { throw new Error("HTTP 404"); } };
  assert.equal(await loadPublished("https://x.github.io/app/data", http), null);
  const half = {
    getText: async (url) => {
      if (url.endsWith("index.json")) return JSON.stringify({ schools: [{ code: "A", status: "ok" }] });
      throw new Error("HTTP 404");
    },
  };
  assert.equal(await loadPublished("https://x.github.io/app/data", half), null);
});
