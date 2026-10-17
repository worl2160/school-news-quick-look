import { test } from "node:test";
import assert from "node:assert/strict";
import { findNews } from "../site/check.js";

test("findNews reports unread counts per followed school and skips failures", async () => {
  const files = {
    "313601.json": { school: { name: "松山國小" }, items: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    "333607.json": { school: { name: "古亭國小" }, items: [{ id: "x" }] },
  };
  const got = await findNews({
    followed: ["313601", "333607", "999999"],
    readIds: async (code) => new Set(code === "313601" ? ["a"] : ["x"]),
    fetchJson: async (path) => {
      if (!files[path]) throw new Error("404");
      return files[path];
    },
  });
  assert.deepEqual(got, [{ code: "313601", name: "松山國小", count: 2 }]);
});

test("notification text names the school and the count", async () => {
  const { newsMessage } = await import("../site/check.js");
  assert.equal(newsMessage([{ name: "松山國小", count: 2 }]), "松山國小 有 2 則新公告");
  assert.equal(
    newsMessage([{ name: "松山國小", count: 2 }, { name: "古亭國小", count: 1 }]),
    "松山國小 有 2 則新公告、古亭國小 有 1 則新公告",
  );
});
