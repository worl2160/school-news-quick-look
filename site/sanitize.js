// Second line of defence: rebuild announcement HTML from an allow-list before showing it.
// Parsing happens in an inert <template>, so nothing in the source runs or loads.
const TAGS = new Set([
  "P", "BR", "DIV", "SPAN", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "A", "IMG", "H1", "H2", "H3", "H4", "BLOCKQUOTE",
]);
const ATTRS = { A: ["href"], IMG: ["src", "alt"], TD: ["colspan", "rowspan"], TH: ["colspan", "rowspan"] };
const SAFE_URL = /^(https?:|mailto:)/i;

/** The URL itself when it is http, https or mailto; otherwise null. Use for every href built from data. */
export function safeUrl(url) {
  return typeof url === "string" && SAFE_URL.test(url) ? url : null;
}

function copy(node, doc) {
  if (node.nodeType === 3) return doc.createTextNode(node.nodeValue);
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toUpperCase();
  if (!TAGS.has(tag)) {
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") return null;
    const frag = doc.createDocumentFragment();
    for (const child of node.childNodes) {
      const c = copy(child, doc);
      if (c) frag.appendChild(c);
    }
    return frag;
  }
  const el = doc.createElement(tag.toLowerCase());
  for (const name of ATTRS[tag] || []) {
    const v = node.getAttribute(name);
    if (v == null) continue;
    if ((name === "href" || name === "src") && !SAFE_URL.test(v.trim())) continue;
    el.setAttribute(name, v);
  }
  if (tag === "A") {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  }
  for (const child of node.childNodes) {
    const c = copy(child, doc);
    if (c) el.appendChild(c);
  }
  return el;
}

export function cleanHtml(html, doc = document) {
  const tpl = doc.createElement("template");
  tpl.innerHTML = html || "";
  const out = doc.createDocumentFragment();
  for (const child of (tpl.content || tpl).childNodes) {
    const c = copy(child, doc);
    if (c) out.appendChild(c);
  }
  return out;
}
