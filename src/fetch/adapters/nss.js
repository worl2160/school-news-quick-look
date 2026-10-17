// NSS (臺北市校網系統) adapter: reads one announcement board through the site's own
// read-only storage query and turns each row into the unified item format.
import { toTaipeiIso, absolutize, sanitizeContent } from "../format.js";

export const REGULAR_KEEP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Whether a pinned row is still inside its pin period (mirrors the site's isEffectiveTop). */
export function isEffectiveTop(data, now) {
  if (data.topEndDate && DATE_RE.test(data.topEndDate)) {
    const time = TIME_RE.test(data.topEndTime || "") ? data.topEndTime : "00:00";
    return new Date(`${data.topEndDate}T${time}:00+08:00`) > now;
  }
  if (data.topEndDay && data.stime) {
    return new Date(Number(data.stime) + Number(data.topEndDay) * DAY_MS) > now;
  }
  return false;
}

/** One NSS storage row as a unified item (not yet marked pinned). */
export function toItem(row, ctx) {
  const d = row.data || {};
  const time = (v) => (typeof v === "number" && v > 0 ? toTaipeiIso(v) : null);
  return {
    id: "nss:" + row._id,
    title: d.name || "",
    unit: d.annoName || null,
    published_at: time(d.stime),
    expires_at: d.unlimited === true ? null : time(d.dtime),
    pinned: false,
    content_html: sanitizeContent(d.content || "", ctx.host),
    attachments: (d.ext || [])
      .filter((a) => a && a.url)
      .map((a) => ({ name: a.name || a.url, url: absolutize(a.url, ctx.host) })),
    source_url: `${ctx.host}/nss/${ctx.upath}/freeze/${ctx.mid}/${ctx.sid}/${row._id}`,
  };
}

/** Effective pins first (newest first), then the newest REGULAR_KEEP other rows. */
export function mergeItems(topRows, regularRows, ctx, now) {
  const byNewest = (a, b) => (b.published_at || "").localeCompare(a.published_at || "");
  const pins = topRows
    .filter((r) => r.data && r.data.top && isEffectiveTop(r.data, now))
    .map((r) => ({ ...toItem(r, ctx), pinned: true }))
    .sort(byNewest);
  const pinned = new Set(pins.map((p) => p.id));
  const seen = new Set();
  const regular = [];
  for (const r of regularRows) {
    const item = toItem(r, ctx);
    if (pinned.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    regular.push(item);
  }
  regular.sort(byNewest);
  return [...pins, ...regular.slice(0, REGULAR_KEEP)];
}
