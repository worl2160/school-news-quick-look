// CLI: node src/fetch/main.js --out <dir> [--base <published data URL>] [--only code,code] [--schools <file>] [--reuse]
// --reuse copies the live data from --base unchanged (no school is contacted); if it cannot
// be read completely, the schools are fetched as usual.
import { readFile, appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createHttp } from "./http.js";
import { adapters } from "./adapters/index.js";
import { loadPrevious, loadPublished, runAll, writeOutput } from "./run.js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    base: { type: "string" },
    only: { type: "string" },
    schools: { type: "string", default: "schools/taipei.json" },
    reuse: { type: "boolean", default: false },
  },
});
if (!values.out) {
  console.error("usage: main.js --out <dir> [--base <url>] [--only code,code] [--schools <file>]");
  process.exit(2);
}

if (values.reuse && values.base) {
  const live = await loadPublished(values.base, createHttp({ minGapMs: 0 }));
  if (live) {
    await writeOutput(values.out, live);
    const line = `reused live data: ${live.files.size} school files, generated ${live.index.generated_at}`;
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, line + "\n");
    process.exit(0);
  }
  console.log("live data incomplete or missing; fetching the schools instead");
}

let schools;
try {
  schools = JSON.parse(await readFile(values.schools, "utf8")).schools;
} catch (e) {
  console.error(`cannot read school list ${values.schools}: ${e.message}`);
  process.exit(2);
}
if (values.only) {
  const only = new Set(values.only.split(","));
  schools = schools.filter((s) => only.has(s.code));
}

const now = new Date();
const previous = values.base
  ? await loadPrevious(values.base, schools.map((s) => s.code), createHttp({ minGapMs: 0 }))
  : new Map();
// Stop starting new schools after 20 minutes so a hung school network cannot outlast the
// 30-minute job and block the deploy.
const deadline = Date.now() + 20 * 60 * 1000;
const result = await runAll({ schools, previous, adapters, http: createHttp(), now, deadline });
await writeOutput(values.out, result);

const count = (status) => result.index.schools.filter((s) => s.status === status).length;
const lines = [
  `ok ${count("ok")}, stale ${count("stale")}, unsupported ${count("unsupported")} (of ${schools.length})`,
  ...[...result.files.values()].filter((f) => f.error).map((f) => `- ${f.school.code} ${f.school.name}: ${f.error}`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
