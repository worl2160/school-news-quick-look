// NetView WordPress theme (網威 school sites, e.g. 大佳、懷生): reads the announcement
// category's list pages, then the post page of each post not seen before, and turns them
// into the unified item format. The site's REST API is closed to visitors; these pages are not.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";
import { FetchError } from "../http.js";

const MAX_PAGES = 5;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const byClass = (name, root) =>
  DomUtils.findAll((el) => (el.attribs.class || "").split(/\s+/).includes(name), [].concat(root));
const text = (el) => (el ? DomUtils.textContent(el).replace(/\s+/g, " ").trim() : "");

/** The rows of one list page: { nid, url, title, date, unit, pinned }, in page order. */
export function parseList(html, base) {
  const doc = parseDocument(html);
  const rows = [];
  for (const table of byClass("nt_table", doc.children)) {
    for (const tr of DomUtils.getElementsByTagName("tr", table)) {
      const a = byClass("news_title", tr)[0];
      if (!a || !a.attribs.nid || !a.attribs.href) continue;
      for (const label of byClass("sticky_text", a)) DomUtils.removeElement(label);
      const date = text(byClass("nt_date", tr)[0]);
      rows.push({
        nid: a.attribs.nid,
        url: absolutize(a.attribs.href, base),
        title: text(a),
        date: DATE_RE.test(date) ? date : null,
        unit: text(byClass("nt_unit", tr)[0]) || null,
        pinned: (tr.attribs.class || "").split(/\s+/).includes("sticky"),
      });
    }
  }
  return rows;
}

/** A post page's body and attachments (the no-script download links, one per file). */
export function parseArticle(html, base) {
  const doc = parseDocument(html);
  const body = byClass("news_content", doc.children)[0];
  const content = body && byClass("content", body)[0];
  const attachments = [];
  for (const list of byClass("nojs_modal_list", doc.children)) {
    for (const a of DomUtils.getElementsByTagName("a", list)) {
      try {
        const url = absolutize(a.attribs.href || "", base);
        if (/^https?:$/.test(new URL(url).protocol)) attachments.push({ name: text(a) || url, url });
      } catch {
        // an unparsable link is left out
      }
    }
  }
  return {
    content_html: sanitizeContent(content ? DomUtils.getInnerHTML(content) : "", base),
    attachments,
  };
}

/**
 * Read list pages until REGULAR_KEEP unpinned posts (pins are on page 1), then each new
 * post's page; posts already in `previous` keep their stored body and attachments.
 */
export async function fetchWpNetview(school, http, now, previous = []) {
  const base = school.url;
  const path = school.params.list_path;
  const pins = [];
  const regular = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES && regular.length < REGULAR_KEEP; page++) {
    let html;
    try {
      html = await http.getText(page === 1 ? `${base}${path}` : `${base}${path}page/${page}/`);
    } catch (e) {
      // WordPress answers 404 past the last page.
      if (page > 1 && e instanceof FetchError && e.status === 404) break;
      throw e;
    }
    const rows = parseList(html, base);
    if (!rows.length) {
      if (page === 1) throw new AdapterError("wp-netview: no announcement table on the list page");
      break;
    }
    for (const r of rows) {
      if (seen.has(r.nid)) continue;
      seen.add(r.nid);
      (r.pinned ? pins : regular).push(r);
    }
  }
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of [...pins, ...regular.slice(0, REGULAR_KEEP)]) {
    const id = "wpnv:" + r.nid;
    const kept = old.get(id);
    const body = kept && typeof kept.content_html === "string" ? kept : parseArticle(await http.getText(r.url), base);
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
