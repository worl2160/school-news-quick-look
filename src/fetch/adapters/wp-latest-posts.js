// WordPress "Latest Posts" block on a school's home page (政大實小): reads the post links
// listed under one heading. Used where robots.txt opens only the home page, so items carry
// a title and a link to the original but no date, body or attachments.
import { parseDocument, DomUtils } from "htmlparser2";
import { absolutize } from "../format.js";
import { AdapterError } from "./nss.js";

const LIST_CLASS = "wp-block-latest-posts__list";
const hasClass = (el, name) => (el.attribs.class || "").split(/\s+/).includes(name);
const text = (el) => DomUtils.textContent(el).replace(/\s+/g, " ").trim();

/** The { url, title } posts of the Latest Posts list right after `heading`, or null if there is none. */
export function parseLatestPosts(html, heading, base) {
  const doc = parseDocument(html);
  const title = DomUtils.findOne((el) => /^h[1-6]$/.test(el.name) && text(el) === heading, doc.children);
  if (!title) return null;
  let next = title.next;
  while (next && next.type !== "tag") next = next.next;
  if (!next) return null;
  const list = hasClass(next, LIST_CLASS) ? next : DomUtils.findOne((el) => hasClass(el, LIST_CLASS), next.children);
  if (!list) return null;
  const posts = [];
  for (const li of DomUtils.getElementsByTagName("li", list)) {
    const a = DomUtils.getElementsByTagName("a", li)[0];
    if (!a || !a.attribs.href) continue;
    try {
      const url = absolutize(a.attribs.href, base);
      if (/^https?:$/.test(new URL(url).protocol)) posts.push({ url, title: text(a) });
    } catch {
      // an unparsable link is left out
    }
  }
  return posts;
}

/** Read the home page once and turn the posts under `params.heading` into title-only items. */
export async function fetchWpLatestPosts(school, http) {
  const posts = parseLatestPosts(await http.getText(`${school.url}/`), school.params.heading, school.url);
  if (!posts) throw new AdapterError(`wp-latest-posts: no post list under ${school.params.heading}`);
  return posts.map((p) => {
    const num = p.url.match(/\/(\d+)\/?$/);
    return {
      id: "wplp:" + (num ? num[1] : p.url),
      title: p.title,
      unit: null,
      published_at: null,
      expires_at: null,
      pinned: false,
      content_html: "",
      attachments: [],
      source_url: p.url,
    };
  });
}
