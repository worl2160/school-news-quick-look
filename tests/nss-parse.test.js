import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEffectiveTop, toItem, mergeItems } from "../src/fetch/adapters/nss.js";

const ssps = JSON.parse(readFileSync(new URL("./fixtures/nss/ssps-regular.json", import.meta.url)));
const CTX = {
  host: "https://www.ssps.tp.edu.tw",
  upath: "main",
  mid: "5abf2d62aa93092cee58ceb4",
  sid: "1AvhodR1985",
};
const at = (s) => new Date(s);
const ms = (s) => new Date(s).getTime();

test("maps an NSS row to the unified item", () => {
  const row = ssps.data.result[0];
  const item = toItem(row, CTX);
  assert.equal(item.id, "nss:" + row._id);
  assert.equal(item.title, "國立臺灣師範大學科學教育中心辦理「115國中生物實驗營II」");
  assert.equal(item.unit, "學務處");
  assert.match(item.published_at, /^2026-10-16T.*\+08:00$/);
  assert.equal(item.attachments.length, 4);
  for (const a of item.attachments) assert.ok(a.url.startsWith("https://www.ssps.tp.edu.tw/uploads/"), a.url);
  assert.equal(
    item.source_url,
    "https://www.ssps.tp.edu.tw/nss/main/freeze/5abf2d62aa93092cee58ceb4/1AvhodR1985/" + row._id,
  );
  for (const k of ["owner", "person", "visit"]) assert.ok(!(k in item), k);
});

test("new-format pin is effective until topEndDate topEndTime", () => {
  const d = { top: true, topEndDate: "2026-10-20", topEndTime: "12:00" };
  assert.equal(isEffectiveTop(d, at("2026-10-20T11:59:00+08:00")), true);
  assert.equal(isEffectiveTop(d, at("2026-10-20T12:01:00+08:00")), false);
});

test("pin ending earlier today is no longer pinned", () => {
  const now = at("2026-10-17T15:00:00+08:00");
  assert.equal(isEffectiveTop({ top: true, topEndDate: "2026-10-17", topEndTime: "09:00" }, now), false);
  assert.equal(isEffectiveTop({ top: true, topEndDate: "2026-10-17" }, now), false);
  assert.equal(isEffectiveTop({ top: true, topEndDate: "2026-10-17" }, at("2026-10-16T23:59:00+08:00")), true);
});

test("old-format pin expires stime + topEndDay days later", () => {
  const d = { top: true, topEndDay: "3", stime: ms("2026-10-10T09:00:00+08:00") };
  assert.equal(isEffectiveTop(d, at("2026-10-13T08:59:00+08:00")), true);
  assert.equal(isEffectiveTop(d, at("2026-10-13T09:01:00+08:00")), false);
});

test("no end date and no days means not pinned", () => {
  assert.equal(isEffectiveTop({ top: true }, at("2026-10-17T00:00:00+08:00")), false);
});

function row(id, day, extra = {}) {
  return {
    _id: id,
    data: { name: "t" + id, annoName: "教務處", stime: ms(`2026-09-${day}T08:00:00+08:00`), content: "", ext: [], ...extra },
  };
}

test("merge puts effective pins first, drops duplicates, keeps 30 regular newest first", () => {
  const now = at("2026-10-17T12:00:00+08:00");
  const live = row("live", "01", { top: true, topEndDate: "2026-12-31" });
  const expired = row("old", "02", { top: true, topEndDate: "2026-10-01" });
  const regular = [];
  for (let d = 10; d < 30; d++) regular.push(row("r" + d, String(d)));
  for (let d = 10; d < 23; d++) regular.push(row("q" + d, String(d)));
  regular.push(live, expired);
  const items = mergeItems([live, expired], regular, CTX, now);
  assert.equal(items.length, 31);
  assert.equal(items[0].id, "nss:live");
  assert.equal(items[0].pinned, true);
  assert.equal(items.filter((i) => i.id === "nss:live").length, 1);
  const rest = items.slice(1);
  assert.ok(rest.every((i) => i.pinned === false));
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i - 1].published_at >= rest[i].published_at);
});
