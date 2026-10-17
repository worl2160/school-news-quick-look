// php-phpbb: a phpBB 3 forum used as a school bulletin board (教大實小). Reads the forum's topic list
// pages, then the first post of each topic not seen before, into the unified item format.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize, sanitizeContent, toTaipeiIso } from "../format.js";
import { REGULAR_KEEP, AdapterError } from "./nss.js";

const MAX_PAGES = 5;
const PIN_RE = /^(sticky|announce|global)_/;

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

/** One forum page: its topic rows ({ id, url, title, published_at, pinned }) and the next page's URL or null. */
export function parseForum(html, pageUrl) {
  const doc = parseDocument(html);
  const rows = [];
  for (const row of byClass("row-item", doc.children)) {
    const a = byClass("topictitle", row)[0];
    const url = a && webUrl(a.attribs.href, pageUrl);
    const id = url && new URL(url).searchParams.get("t");
    if (!id) continue;
    const poster = byClass("topic-poster", row)[0];
    const time = poster && DomUtils.getElementsByTagName("time", poster)[0];
    const ms = time ? Date.parse(time.attribs.datetime) : NaN;
    rows.push({
      id,
      url,
      title: text(a),
      published_at: Number.isNaN(ms) ? null : toTaipeiIso(ms),
      pinned: classes(row).some((c) => PIN_RE.test(c)),
    });
  }
  const next = DomUtils.findOne((el) => el.name === "a" && el.attribs.rel === "next", doc.children);
  return { rows, next: next ? webUrl(next.attribs.href, pageUrl) : null };
}

/** The first post of a topic page: its body and its attachment links. */
export function parseTopic(html, topicUrl) {
  const doc = parseDocument(html);
  const post = byClass("post", doc.children)[0];
  const content = post && byClass("content", post)[0];
  const attachments = [];
  for (const box of post ? byClass("attachbox", post) : []) {
    for (const a of byClass("postlink", box)) {
      const url = webUrl(a.attribs.href, topicUrl);
      if (url) attachments.push({ name: text(a) || url, url });
    }
  }
  return { content_html: sanitizeContent(content ? DomUtils.getInnerHTML(content) : "", topicUrl), attachments };
}

/**
 * Follow the forum's next-page links until REGULAR_KEEP unpinned topics, newest first by
 * first post; topics already in `previous` keep their stored body and attachments.
 */
export async function fetchPhpbb(school, http, now, previous = []) {
  const pins = [];
  const regular = [];
  const seen = new Set();
  let url = `${school.url}${school.params.forum_path}`;
  for (let page = 1; url && page <= MAX_PAGES && regular.length < REGULAR_KEEP; page++) {
    const { rows, next } = parseForum(await http.getText(url), url);
    if (page === 1 && !rows.length) throw new AdapterError("phpbb: no topics on the forum page");
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      (r.pinned ? pins : regular).push(r);
    }
    url = next;
  }
  regular.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  const old = new Map(previous.map((i) => [i.id, i]));
  const items = [];
  for (const r of [...pins, ...regular.slice(0, REGULAR_KEEP)]) {
    const id = "phpbb:" + r.id;
    const kept = old.get(id);
    const body = kept && typeof kept.content_html === "string" ? kept : parseTopic(await http.getText(r.url), r.url);
    items.push({
      id,
      title: r.title,
      unit: null,
      published_at: r.published_at,
      expires_at: null,
      pinned: r.pinned,
      content_html: body.content_html,
      attachments: body.attachments || [],
      source_url: r.url,
    });
  }
  return items;
}
