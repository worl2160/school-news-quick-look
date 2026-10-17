import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeContent } from "../src/fetch/format.js";

const BASE = "https://www.ssps.tp.edu.tw";

test("strips scripts, handlers, iframes and javascript links", () => {
  const out = sanitizeContent(
    '<p onclick="x()">a</p><script>alert(1)</script><iframe src="//e"></iframe>' +
      '<a href="javascript:alert(1)">b</a><img src="/u/i.png" onerror="x()">',
    BASE,
  );
  for (const bad of ["script", "onclick", "onerror", "iframe", "javascript:"]) {
    assert.ok(!out.includes(bad), `${bad} survived: ${out}`);
  }
  assert.ok(out.includes("<p>a</p>"), out);
});

test("makes links and images absolute", () => {
  const out = sanitizeContent('<a href="/uploads/a.pdf">a</a><img src="/u/i.png">', BASE);
  assert.ok(out.includes('href="https://www.ssps.tp.edu.tw/uploads/a.pdf"'), out);
  assert.ok(out.includes('src="https://www.ssps.tp.edu.tw/u/i.png"'), out);
});

test("drops inline styles", () => {
  const out = sanitizeContent('<span style="font-family:標楷體">x</span>', BASE);
  assert.ok(!out.includes("style="), out);
  assert.ok(out.includes("x"), out);
});
