// php-rpage: Rpage school sites (博嘉, 光仁). Reads the board's plain list pages
// (<list_path>-<n>.php, the same rows the page's infinite scroll loads) until 30 posts, in
// the site's own order: Rpage shows manually ordered posts first but marks no pins. Each post
// not seen before is read from its page for the body and attachments. Lists carry only a
// date, so times are 00:00 and there is no unit.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";

const MAX_PAGES = 5;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const POST_RE = /\/p\/406-\d+-(\d+)/;

const classes = (el) => (el.attribs.class || "").split(/\s+/);
const byClass = (name, root) => DomUtils.findAll((el) => classes(el).includes(name), [].concat(root));
const text = (el) => DomUtils.textContent(el).replace(/\s+/g, " ").trim();

function webUrl(href, base) {
  try {
    const url = absolutize(href || "", base);
    return /^https?:$/.test(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

/** One list page's rows: { id, url, title, date }, in site order. */
export function parseList(html, base) {
  const doc = parseDocument(html);
  const rows = [];
  for (const m of byClass("mtitle", doc.children)) {
    const a = DomUtils.getElementsByTagName("a", m).find((l) => POST_RE.test(l.attribs.href || ""));
    const url = a && webUrl(a.attribs.href, base);
    if (!url) continue;
    const date = text(byClass("mdate", m)[0] || m).match(DATE_RE);
    rows.push({ id: url.match(POST_RE)[1], url, title: text(a), date: date ? date[1] : null });
  }
  return rows;
}

/** A post page's body and its attachment downloads. */
export function parsePost(html, base) {
  const doc = parseDocument(html);
  const detail = byClass("mpgdetail", doc.children)[0];
  const attachments = [];
  for (const list of byClass("mptattach", doc.children)) {
    for (const a of DomUtils.getElementsByTagName("a", list)) {
      const url = webUrl(a.attribs.href, base);
      if (url) attachments.push({ name: text(a) || url, url });
    }
  }
  return { content_html: sanitizeContent(detail ? DomUtils.getInnerHTML(detail) : "", base), attachments };
}

/** Read list pages until REGULAR_KEEP posts; posts already in `previous` keep their body and attachments. */
export async function fetchRpage(school, http, now, previous = []) {
  const rows = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES && rows.length < REGULAR_KEEP; page++) {
    const found = parseList(await http.getText(`${school.url}${school.params.list_path}-${page}.php`), school.url);
    if (!found.length) {
      if (page === 1) throw new AdapterError("php-rpage: no posts on the list page");
      break;
    }
    for (const r of found) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  }
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of rows.slice(0, REGULAR_KEEP)) {
    const id = "rpage:" + r.id;
    const kept = old.get(id);
    const body = kept && typeof kept.content_html === "string" ? kept : parsePost(await http.getText(r.url), school.url);
    items.push({
      id,
      title: r.title,
      unit: null,
      published_at: r.date ? `${r.date}T00:00:00+08:00` : null,
      expires_at: null,
      pinned: false,
      content_html: body.content_html,
      attachments: body.attachments || [],
      source_url: r.url,
    });
  }
  return items;
}
