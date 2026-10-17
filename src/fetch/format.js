import sanitizeHtml from "sanitize-html";

const TAIPEI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Milliseconds since the epoch as Taipei wall-clock time, e.g. "2026-10-16T16:04:00+08:00". */
export function toTaipeiIso(ms) {
  const p = Object.fromEntries(TAIPEI.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}

/** Resolve `url` against `base`; absolute URLs come back unchanged. */
export function absolutize(url, base) {
  return new URL(url, base).href;
}

const ALLOWED_TAGS = [
  "p", "br", "div", "span", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td", "a", "img", "h1", "h2", "h3", "h4", "blockquote",
];

function absolutizeAttr(attribs, name, base) {
  if (!attribs[name]) return attribs;
  try {
    return { ...attribs, [name]: absolutize(attribs[name], base) };
  } catch {
    const { [name]: _dropped, ...rest } = attribs;
    return rest;
  }
}

/** Clean announcement HTML from a school site: basic tags only, absolute links, no scripts or styles. */
export function sanitizeContent(html, base) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...absolutizeAttr(attribs, "href", base), target: "_blank", rel: "noopener noreferrer" },
      }),
      img: (tagName, attribs) => ({ tagName, attribs: absolutizeAttr(attribs, "src", base) }),
    },
  });
}
