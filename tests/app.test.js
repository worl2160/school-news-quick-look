import { test } from "node:test";
import assert from "node:assert/strict";
import { renderApp, memoryStorage } from "./app-harness.js";

const school = {
  schema: 1,
  school: { code: "313601", name: "松山國小", url: "https://www.ssps.tp.edu.tw" },
  board: { name: "最新消息", url: "https://www.ssps.tp.edu.tw" },
  last_success_at: "2026-10-17T17:18:00+08:00",
  last_attempt_at: "2026-10-17T17:18:00+08:00",
  error: null,
  items: [
    { id: "nss:a", title: "甲公告", unit: "教務處", published_at: "2026-10-16T08:00:00+08:00", pinned: false, content_html: "", attachments: [], source_url: "https://www.ssps.tp.edu.tw/x" },
    { id: "nss:b", title: "乙公告", unit: "學務處", published_at: "2026-10-15T08:00:00+08:00", pinned: false, content_html: "", attachments: [], source_url: "https://www.ssps.tp.edu.tw/y" },
  ],
};
const index = {
  schema: 1,
  generated_at: "2026-10-17T17:18:00+08:00",
  schools: [{ code: "313601", name: "松山國小", city: "臺北市", district: "松山區", type: "public", board_name: "最新消息", status: "ok", latest_published_at: "2026-10-16T08:00:00+08:00", last_success_at: "2026-10-17T17:18:00+08:00" }],
};
const files = { "index.json": index, "313601.json": school };

test("the school screen shows no stray null text", async () => {
  const { document } = await renderApp("#/s/313601", files);
  const text = document.getElementById("view").textContent;
  assert.ok(text.includes("甲公告"), text);
  assert.ok(!/null/i.test(text), text);
});

test("the first visit to a school shows no new posts", async () => {
  const { document } = await renderApp("#/s/313601", files);
  const text = document.getElementById("view").textContent;
  assert.ok(text.includes("沒有新公告"), text);
  assert.equal(document.querySelectorAll(".tag.new").length, 0);
});

test("a post published after the first visit is shown as new", async () => {
  const storage = memoryStorage();
  await renderApp("#/s/313601", files, storage);
  const later = { ...school, items: [{ ...school.items[0], id: "nss:c", title: "丙公告" }, ...school.items] };
  const { document } = await renderApp("#/s/313601", { ...files, "313601.json": later }, storage);
  assert.equal(document.querySelectorAll(".tag.new").length, 1);
  assert.ok(document.getElementById("view").textContent.includes("1 則新公告"));
});

test("a newly followed school shows no new-post badge", async () => {
  const storage = memoryStorage({ "snql:followed": JSON.stringify(["313601"]) });
  const { document } = await renderApp("#/", files, storage);
  assert.equal(document.querySelectorAll(".badge").length, 0);
  assert.ok(document.getElementById("view").textContent.includes("已讀"));
});
