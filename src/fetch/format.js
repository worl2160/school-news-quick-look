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
