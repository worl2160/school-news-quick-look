// Renders site/app.js in a fake DOM with in-memory data files, for screen-level tests.
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
let run = 0;

export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

/** Load the app at `hash` with `files` ({"index.json": {...}, "313601.json": {...}}) and wait for it to settle. */
export async function renderApp(hash, files, storage = memoryStorage()) {
  const { document } = parseHTML(HTML);
  Object.assign(globalThis, {
    document,
    window: globalThis,
    location: { hash },
    localStorage: storage,
    scrollTo: () => {},
    scrollBy: () => {},
    addEventListener: () => {},
    fetch: async (url) => {
      const name = String(url).replace("./data/", "");
      if (!(name in files)) return new Response("", { status: 404 });
      return new Response(JSON.stringify(files[name]), { status: 200 });
    },
  });
  await import(`../site/app.js?run=${++run}`);
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (!document.getElementById("view").textContent.includes("載入中")) break;
  }
  await new Promise((r) => setTimeout(r, 30));
  return { document, storage };
}
