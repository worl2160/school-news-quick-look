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

/** The home page's announcement boards, most likely primary first. */
export function rankBoards(deployMap) {
  const name = (m) => (m.setting && m.setting.name) || "";
  // Name first (an announcements-like name wins, a side-topic name loses), then the newer
  // module type, then the order on the page.
  const rank = (m) => [
    /媒體|榮譽|研習|人事|學籍|文件|防疫|甄聘|徵才/.test(name(m)),
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
  return candidates.map((m) => ({ mid: m.mid, sid: m.sid, board_name: name(m).trim() || "公告" }));
}

/** The home page's primary announcement board by name and position alone, or null. */
export function pickBoard(deployMap) {
  return rankBoards(deployMap)[0] || null;
}

const FRESH_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Among ranked boards, the first whose newest post is under 60 days old; else the one
 * updated most recently; else (nothing readable) the top-ranked one.
 * `newestOf(board)` resolves to an ISO time or null.
 */
export async function chooseBoard(ranked, newestOf, now) {
  let latest = null;
  for (const board of ranked) {
    let newest = null;
    try {
      newest = await newestOf(board);
    } catch {
      continue;
    }
    if (!newest) continue;
    if (now - new Date(newest) < FRESH_MS) return board;
    if (!latest || newest > latest.newest) latest = { board, newest };
  }
  return latest ? latest.board : ranked[0] || null;
}
