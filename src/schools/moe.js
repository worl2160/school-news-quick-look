// The Ministry of Education's elementary school directory (CSV) → Taipei schools.
import { parse } from "csv-parse/sync";

export function parseMoeCsv(text) {
  const rows = parse(text, { columns: true, bom: true, skip_empty_lines: true, trim: true });
  return rows
    .filter((r) => r["縣市名稱"].includes("臺北市"))
    .map((r) => ({
      code: r["代碼"],
      name: r["學校名稱"].replace(/^(市立|私立)/, ""),
      type: r["公/私立"] === "私立" ? "private" : "public",
      district: (r["地址"].match(/臺北市(.{1,3}?區)/) || [])[1] || null,
      url: new URL(r["網址"]).origin,
    }));
}
