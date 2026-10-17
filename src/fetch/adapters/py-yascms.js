// py-yascms: yascms, a Python (Pyramid) school CMS by 濱江國小 (source: https://github.com/bjes/yascms,
// AGPL-3.0). Reads the first /news/list page with q=30: every pin currently in its pin period
// (they appear on page 1 only), then 30 regular posts. Each post not seen before is read from
// /news/get/{id} for its full time, body and attachments. q is capped at 50 by the CMS
// (yascms/enum.py PageSize); the live theme may differ slightly from the repo's templates, so
// parse what the site serves and use the repo only as a reference.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /時間：\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/;

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

/** The list rows: { id, url, title, date, unit, pinned }, pins first as the site orders them. */
export function parseList(html, base) {
  const doc = parseDocument(html);
  const rows = [];
  for (const tr of DomUtils.getElementsByTagName("tr", doc.children)) {
    const a = DomUtils.getElementsByTagName("a", tr).find((l) => /\/news\/get\/\d+/.test(l.attribs.href || ""));
    const url = a && webUrl(a.attribs.href, base);
    if (!url) continue;
    // The title span is the first one; the second repeats the date for small screens.
    const span = DomUtils.getElementsByTagName("span", a)[0];
    const cells = DomUtils.getElementsByTagName("td", tr).map(text);
    rows.push({
      id: url.match(/\/news\/get\/(\d+)/)[1],
      url,
      title: text(span || a),
      date: DATE_RE.test(cells[0] || "") ? cells[0] : null,
      unit: cells[1] || null,
      pinned: DomUtils.getElementsByTagName("i", tr).some((i) => classes(i).includes("bi-pin")),
    });
  }
  return rows;
}

/** A news page: its full time (or null), body, and attachment links from the card footer. */
export function parseNews(html, base) {
  const doc = parseDocument(html);
  const main = DomUtils.findOne((el) => el.attribs.id === "main-content", doc.children) || doc;
  const roots = main.children || [main];
  const inFooter = (el) => {
    for (let p = el.parent; p; p = p.parent) if (p.attribs && classes(p).includes("card-footer")) return true;
    return false;
  };
  const body = byClass("card-body", roots).find((el) => !inFooter(el));
  const time = text(main).match(TIME_RE);
  const attachments = [];
  for (const footer of byClass("card-footer", roots)) {
    for (const a of DomUtils.getElementsByTagName("a", footer)) {
      const url = webUrl(a.attribs.href, base);
      if (url) attachments.push({ name: text(a) || url, url });
    }
  }
  return {
    published_at: time ? `${time[1]}T${time[2]}:00+08:00` : null,
    content_html: sanitizeContent(body ? DomUtils.getInnerHTML(body) : "", base),
    attachments,
  };
}

/**
 * One list request; posts already in `previous` keep their stored time, body and attachments.
 * A post whose page shows no time gets its list date at 00:00.
 */
export async function fetchYascms(school, http, now, previous = []) {
  const rows = parseList(await http.getText(`${school.url}/news/list?p=1&q=${REGULAR_KEEP}`), school.url);
  if (!rows.length) throw new AdapterError("py-yascms: the news list has no posts");
  const seen = new Set();
  const pins = [];
  const regular = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    (r.pinned ? pins : regular).push(r);
  }
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of [...pins, ...regular.slice(0, REGULAR_KEEP)]) {
    const id = "yascms:" + r.id;
    const kept = old.get(id);
    const page = kept && typeof kept.content_html === "string" ? kept : parseNews(await http.getText(r.url), school.url);
    items.push({
      id,
      title: r.title,
      unit: r.unit,
      published_at: page.published_at || (r.date ? `${r.date}T00:00:00+08:00` : null),
      expires_at: null,
      pinned: r.pinned,
      content_html: page.content_html,
      attachments: page.attachments || [],
      source_url: r.url,
    });
  }
  return items;
}
