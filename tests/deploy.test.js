import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("each deploy gives the service worker a new cache name", () => {
  assert.match(read("../site/sw.js"), /const CACHE = "snql-__BUILD__";/);
  assert.match(read("../.github/workflows/update.yml"), /sed -i "s\/__BUILD__\/\$\{GITHUB_SHA\}\/" out\/sw\.js/);
});

test("the service worker installs fresh copies, not HTTP-cached ones", () => {
  assert.match(read("../site/sw.js"), /new Request\(u, \{ cache: "reload" \}\)/);
});
