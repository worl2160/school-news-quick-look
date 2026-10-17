// php-xoops: a XOOPS site with the tadnews module (雙園). Reads the list the home page itself
// loads from the module's ajax_list_content.php, then the news page of each post not seen
// before, into the unified item format.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";

// Enough rows that REGULAR_KEEP remain after the pins, which the list puts first.
const LIST_ROWS = 50;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

const classes = (el) => (el.attribs.class || "").split(/\s+/);
const byClass = (name, root) => DomUtils.findAll((el) => classes(el).includes(name), [].concat(root));
const text = (el) => DomUtils.textContent(el).replace(/\s+/g, " ").trim();

function webUrl(href, base) {
  try {
    const url = new URL(absolutize(href || "", base));
    url.hash = "";
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** The list rows: { nsn, url, title, date, unit, pinned }, in list order. */
export function parseList(html, base) {
  const doc = parseDocument(html);
  const rows = [];
  for (const tr of DomUtils.getElementsByTagName("tr", doc.children)) {
    const links = DomUtils.getElementsByTagName("a", tr);
    const a = links.find((l) => /[?&]nsn=\d+/.test(l.attribs.href || ""));
    const url = a && webUrl(a.attribs.href, base);
    if (!url) continue;
    const poster = links.find((l) => /[?&]show_uid=\d+/.test(l.attribs.href || ""));
    const date = text(tr).match(DATE_RE);
    rows.push({
      nsn: new URL(url).searchParams.get("nsn"),
      url,
      title: text(a),
      date: date ? date[1] : null,
      unit: poster ? text(poster) || null : null,
      pinned: DomUtils.getElementsByTagName("img", tr).some((img) => img.attribs.alt === "置頂文章"),
    });
  }
  return rows;
}

/** A news page's body (without the unit/date/views line) and its attachment downloads. */
export function parseNews(html, base) {
  const doc = parseDocument(html);
  const body = byClass("news_page_content", doc.children)[0];
  if (body) for (const info of byClass("news_page_info", body)) DomUtils.removeElement(info);
  const attachments = [];
  for (const li of byClass("tuf-icon-item", doc.children)) {
    const a = DomUtils.getElementsByTagName("a", li).find((l) => /op=tufdl/.test(l.attribs.href || ""));
    const url = a && webUrl(a.attribs.href, base);
    if (url) attachments.push({ name: (a.attribs.title || "").trim() || url, url });
  }
  return { content_html: sanitizeContent(body ? DomUtils.getInnerHTML(body) : "", base), attachments };
}

/**
 * One list request for LIST_ROWS rows: every pin, then REGULAR_KEEP regular posts. Posts
 * already in `previous` keep their stored body and attachments.
 */
export async function fetchXoops(school, http, now, previous = []) {
  const html = await http.postForm(`${school.url}/modules/tadnews/ajax_list_content.php`, {
    num: LIST_ROWS,
    p: 0,
    summary_length: 0,
    title_length: 0,
    show_cover: 0,
    start_from: 0,
    show_ncsn: 1,
    display_mode: "table",
    show_button: 0,
    tag_sn: "",
    keyword: "",
    start_day: "",
    end_day: "",
  });
  const rows = parseList(html, school.url);
  if (!rows.length) throw new AdapterError("php-xoops: the news list has no posts");
  const seen = new Set();
  const pins = [];
  const regular = [];
  for (const r of rows) {
    if (seen.has(r.nsn)) continue;
    seen.add(r.nsn);
    (r.pinned ? pins : regular).push(r);
  }
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of [...pins, ...regular.slice(0, REGULAR_KEEP)]) {
    const id = "xoops:" + r.nsn;
    const kept = old.get(id);
    const body = kept && typeof kept.content_html === "string" ? kept : parseNews(await http.getText(r.url), school.url);
    items.push({
      id,
      title: r.title,
      unit: r.unit,
      published_at: r.date ? `${r.date}T00:00:00+08:00` : null,
      expires_at: null,
      pinned: r.pinned,
      content_html: body.content_html,
      attachments: body.attachments || [],
      source_url: r.url,
    });
  }
  return items;
}
