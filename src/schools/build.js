// CLI: node src/schools/build.js --csv <path|url> --out schools/taipei.json
// Reads each school's home page once and records which board the fetcher should read.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { createHttp } from "../fetch/http.js";
import { parseMoeCsv } from "./moe.js";
import { parseSiteData, rankBoards, chooseBoard, siteUpath } from "./nss-site.js";
import { toTaipeiIso } from "../fetch/format.js";

const { values } = parseArgs({ options: { csv: { type: "string" }, out: { type: "string" } } });
if (!values.csv || !values.out) {
  console.error("usage: build.js --csv <path|url> --out <file>");
  process.exit(2);
}

const http = createHttp();
const now = new Date();

/** Newest visible post on a board, as ISO time, or null. One small read query. */
async function newestOf(origin, upath, board) {
  const reply = await http.postJson(`${origin}/nss/site/${upath}/storage/${board.mid}/${board.sid}/find`, {
    option: {
      number: 1,
      page: 1,
      sort: { stime: -1, ctime: -1 },
      query: [{ between: { max: "dtime", min: "stime", value: "now" }, match: { released: true, status: "passed", show: true } }],
    },
    vector: "private",
    static: false,
  });
  const row = reply && reply.error === 0 && reply.data && reply.data.result && reply.data.result[0];
  return row && row.data && row.data.stime ? toTaipeiIso(row.data.stime) : null;
}
const csv = /^https?:/.test(values.csv) ? await http.getText(values.csv) : await readFile(values.csv, "utf8");
const schools = [];
const table = ["| 代碼 | 校名 | 選中的公告版 |", "|---|---|---|"];
for (const row of parseMoeCsv(csv)) {
  let board = null;
  let upath = null;
  let origin = row.url;
  let note = "";
  try {
    const page = await http.getPage(row.url + "/");
    origin = new URL(page.url).origin;
    const site = parseSiteData(page.text);
    if (site) {
      upath = siteUpath(site);
      const ranked = rankBoards(site.deployMap).slice(0, 3);
      board = await chooseBoard(ranked, (b) => newestOf(origin, upath, b), now);
      if (!board) note = "NSS,首頁沒有公告模組";
    } else note = "不是 NSS";
  } catch (e) {
    note = `首頁讀取失敗:${e.message}`;
  }
  schools.push({
    code: row.code,
    name: row.name,
    city: "臺北市",
    district: row.district,
    type: row.type,
    url: origin,
    adapter: board ? "nss" : null,
    params: board ? { upath, ...board } : null,
    status: board ? "ok" : "unsupported",
  });
  table.push(`| ${row.code} | ${row.name} | ${board ? board.board_name : `(暫不支援:${note})`} |`);
  console.error(`${row.code} ${row.name}: ${board ? board.board_name : note}`);
}

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, JSON.stringify({ source: values.csv, schools }, null, 1) + "\n");
await writeFile(
  join(dirname(values.out), "README.md"),
  `# 學校名單\n\n由 \`src/schools/build.js\` 從教育部國民小學名錄產生。每校只讀首頁上的主要公告版;選錯時可直接修改 \`taipei.json\`。\n\n${table.join("\n")}\n`,
);
console.log(`${schools.length} schools, ${schools.filter((s) => s.adapter).length} supported`);
