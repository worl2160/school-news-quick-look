import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMoeCsv } from "../src/schools/moe.js";
import { parseSiteData, pickBoard, siteUpath } from "../src/schools/nss-site.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const site = (n) => parseSiteData(read(`./fixtures/nss/home-${n}.html`));

test("parses Taipei rows only, strips 市立, keeps origin", () => {
  const rows = parseMoeCsv(read("./fixtures/moe-sample.csv"));
  assert.deepEqual(rows, [
    { code: "313601", name: "松山國小", type: "public", district: "松山區", url: "https://www.ssps.tp.edu.tw" },
    { code: "381603", name: "再興小學", type: "private", district: "文山區", url: "https://www.tsps.tp.edu.tw" },
  ]);
});

test("reads the site path from siteserverData", () => {
  assert.equal(siteUpath(site("ssps")), "main");
});

test("picks the primary board", () => {
  const pick = (n) => pickBoard(site(n).deployMap);
  assert.deepEqual(pick("ssps"), { mid: "5abf2d62aa93092cee58ceb4", sid: "1AvhodR1985", board_name: "最新消息" });
  assert.deepEqual(pick("bhps"), { mid: "5a9759adef37531ea27bf1b0", sid: "Wj69zXD7195", board_name: "最新消息" });
  assert.equal(pick("ynes").board_name, "雨農布告欄");
  assert.equal(pick("zhps").board_name, "日新公告");
});

test("ignores recycled modules and RSS modules", () => {
  const map = [
    { sid: "a", mid: "5abf2d62aa93092cee58ceb4", anchor: "recycle", setting: { name: "最新消息", seq: 1 } },
    { sid: "b", mid: "5aa1039cb33e9e6bc6c92a7e", anchor: "middle", setting: { name: "教育局公告", seq: 2 } },
  ];
  assert.equal(pickBoard(map), null);
});

test("parseSiteData returns null when the page has no site data", () => {
  assert.equal(parseSiteData("<html><body>hi</body></html>"), null);
});

const NEW = "5abf2d62aa93092cee58ceb4";
const OLD = "5a9759adef37531ea27bf1b0";
const mod = (sid, mid, name, seq) => ({ sid, mid, anchor: "middle", setting: { name, seq } });

test("a board named like announcements beats a newer module named otherwise", () => {
  const map = [mod("all", OLD, "所有公告", 1), mod("t", NEW, "教師研習", 2), mod("h", NEW, "榮譽榜", 3)];
  assert.equal(pickBoard(map).sid, "all");
});

test("公布欄 and 快訊 count as announcements; 學籍 and 人事 boards lose", () => {
  assert.equal(
    pickBoard([mod("r", NEW, "榮譽榜", 2), mod("p", NEW, "人事會計公告事項", 3), mod("b", NEW, "公布欄", 1)]).sid,
    "b",
  );
  assert.equal(pickBoard([mod("k", NEW, "實踐快訊", 1), mod("x", NEW, "學生學籍與升學", 0)]).sid, "k");
});

test("an unnamed board is called 公告", () => {
  const got = pickBoard([mod("b", NEW, "", 2), mod("a", NEW, "", 1)]);
  assert.deepEqual(got, { mid: NEW, sid: "a", board_name: "公告" });
});
