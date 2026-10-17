import { test } from "node:test";
import assert from "node:assert/strict";
import { toTaipeiIso, absolutize } from "../src/fetch/format.js";

test("toTaipeiIso renders Taipei wall-clock time with +08:00", () => {
  assert.equal(toTaipeiIso(1792137840000), "2026-10-16T16:04:00+08:00");
});

test("absolutize resolves a site-relative path against the school origin", () => {
  assert.equal(
    absolutize("/uploads/a.pdf", "https://www.ssps.tp.edu.tw"),
    "https://www.ssps.tp.edu.tw/uploads/a.pdf",
  );
});

test("absolutize leaves absolute URLs alone", () => {
  assert.equal(absolutize("https://x.tw/b", "https://www.ssps.tp.edu.tw"), "https://x.tw/b");
});
