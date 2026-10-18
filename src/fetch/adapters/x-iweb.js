// x-iweb: school sites built by i-web 蘋果網頁 (新民); the server language is not visible.
// Reads the board's list pages (<list_path>_<n>.html) by their next links until 30 posts or a
// page repeats (the last page's next link points to itself), in the site's order, then each
// new post's page. The site shows no dates or units anywhere, and files are linked inside
// the body, so links to the site's /userfiles/ are also listed as attachments.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";

const MAX_PAGES = 5;
const POST_RE = /\/news-(\d+)\.html$/;

const classes = (el) => (el.attribs.class || "").split(/\s+/);
const text = (el) => DomUtils.textContent(el).replace(/\s+/g, " ").trim();

function webUrl(href, base) {
  try {
    const url = absolutize(href || "", base);
    return /^https?:$/.test(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

/** One list page: its posts ({ id, url, title }, each once, in page order) and the next page's URL. */
export function parseList(html, pageUrl) {
  const doc = parseDocument(html);
  const posts = new Map();
  for (const a of DomUtils.getElementsByTagName("a", doc.children)) {
    const url = webUrl(a.attribs.href, pageUrl);
    const m = url && new URL(url).pathname.match(POST_RE);
    if (!m) continue;
    const post = posts.get(m[1]) || { id: m[1], url, title: "" };
    // Each post has a bare "More" link and a full-card link whose title is the post title.
    if (!post.title) post.title = (a.attribs.title || "").trim();
    posts.set(m[1], post);
  }
  const next = DomUtils.findOne((el) => el.name === "a" && classes(el).includes("next"), doc.children);
  return { rows: [...posts.values()], next: next ? webUrl(next.attribs.href, pageUrl) : null };
}

/** A post page's body, with the site's own file links (/userfiles/) listed as attachments. */
export function parsePost(html, base) {
  const doc = parseDocument(html);
  const body = DomUtils.findOne((el) => classes(el).includes("Descrarticle"), doc.children);
  const origin = new URL(base).origin;
  const attachments = [];
  for (const a of body ? DomUtils.getElementsByTagName("a", body) : []) {
    const url = webUrl(a.attribs.href, base);
    if (!url) continue;
    const u = new URL(url);
    if (u.origin === origin && u.pathname.startsWith("/userfiles/")) attachments.push({ name: text(a) || url, url });
  }
  return { content_html: sanitizeContent(body ? DomUtils.getInnerHTML(body) : "", base), attachments };
}

/** Follow next links until REGULAR_KEEP posts or a repeat; known posts keep their body and attachments. */
export async function fetchIweb(school, http, now, previous = []) {
  const rows = [];
  const seen = new Set();
  const visited = new Set();
  let url = `${school.url}${school.params.list_path}_1.html`;
  for (let page = 1; url && !visited.has(url) && page <= MAX_PAGES && rows.length < REGULAR_KEEP; page++) {
    visited.add(url);
    const { rows: found, next } = parseList(await http.getText(url), url);
    if (page === 1 && !found.length) throw new AdapterError("x-iweb: no posts on the list page");
    const fresh = found.filter((r) => !seen.has(r.id));
    if (!fresh.length) break;
    for (const r of fresh) {
      seen.add(r.id);
      rows.push(r);
    }
    url = next;
  }
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of rows.slice(0, REGULAR_KEEP)) {
    const id = "iweb:" + r.id;
    const kept = old.get(id);
    const body = kept && typeof kept.content_html === "string" ? kept : parsePost(await http.getText(r.url), school.url);
    items.push({
      id,
      title: r.title,
      unit: null,
      published_at: null,
      expires_at: null,
      pinned: false,
      content_html: body.content_html,
      attachments: body.attachments || [],
      source_url: r.url,
    });
  }
  return items;
}
