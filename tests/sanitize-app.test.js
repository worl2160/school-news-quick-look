import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { cleanHtml } from "../site/sanitize.js";

test("app sanitizer drops what the fetch side would", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const frag = cleanHtml(
    '<p onclick="x()">a</p><script>alert(1)</script><iframe src="//e"></iframe>' +
      '<a href="javascript:alert(1)">b</a><img src="https://s.tw/i.png" onerror="x()"><a href="https://s.tw/f.pdf">f</a>',
    document,
  );
  const box = document.createElement("div");
  box.appendChild(frag);
  const out = box.innerHTML;
  for (const bad of ["script", "onclick", "onerror", "iframe", "javascript:"]) {
    assert.ok(!out.includes(bad), `${bad} survived: ${out}`);
  }
  assert.ok(out.includes("<p>a</p>"), out);
  assert.ok(out.includes('href="https://s.tw/f.pdf"'), out);
  assert.ok(out.includes('src="https://s.tw/i.png"'), out);
});

import { safeUrl } from "../site/sanitize.js";

test("safeUrl only passes http, https and mailto URLs", () => {
  assert.equal(safeUrl("https://s.tw/f.pdf"), "https://s.tw/f.pdf");
  assert.equal(safeUrl(" javascript:alert(1)"), null);
  assert.equal(safeUrl("java\tscript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,x"), null);
  assert.equal(safeUrl(undefined), null);
});
