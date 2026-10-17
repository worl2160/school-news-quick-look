// Reading an NSS school home page: its embedded site data and which board is the main one.
const NEW_BOARD = "5abf2d62aa93092cee58ceb4";
const OLD_BOARD = "5a9759adef37531ea27bf1b0";
const MARKER = "window.siteserverData = ";

/** The JSON object a NSS home page embeds as window.siteserverData, or null. */
export function parseSiteData(html) {
  const at = html.indexOf(MARKER);
  if (at < 0) return null;
  const text = html.slice(at + MARKER.length);
  // Find the end of the object literal by bracket depth, skipping string contents.
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(0, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function siteUpath(siteData) {
  return (siteData && siteData.siteSet && siteData.siteSet.upath) || "main";
}

/** The home page's primary announcement board, or null when it has none. */
export function pickBoard(deployMap) {
  const name = (m) => (m.setting && m.setting.name) || "";
  // Name first (an announcements-like name wins, a side-topic name loses), then the newer
  // module type, then the order on the page.
  const rank = (m) => [
    /媒體|榮譽|研習|人事|學籍|文件|防疫/.test(name(m)),
    !/公告|消息|布告|公布|公佈|快訊|訊息|新聞/.test(name(m)),
    m.mid !== NEW_BOARD,
    (m.setting && m.setting.seq) ?? 99,
  ];
  const cmp = (a, b) => {
    const x = rank(a);
    const y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  const candidates = (deployMap || [])
    .filter((m) => m.anchor !== "recycle" && !m.destroy && (m.mid === NEW_BOARD || m.mid === OLD_BOARD))
    .sort(cmp);
  if (!candidates.length) return null;
  const best = candidates[0];
  return { mid: best.mid, sid: best.sid, board_name: name(best).trim() || "公告" };
}
