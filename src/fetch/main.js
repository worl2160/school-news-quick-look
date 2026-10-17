// CLI: node src/fetch/main.js --out <dir> [--base <published data URL>] [--only code,code] [--schools <file>] [--tags <file>] [--reuse]
// --reuse copies the live data from --base (no school is contacted). A school whose live file
// cannot be read is deployed as stale with no items; if the index or more than 80% of the files
// cannot be read, the schools are fetched as usual. Tags come from the repo either way.
import { readFile, appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createHttp } from "./http.js";
import { adapters } from "./adapters/index.js";
import { applyTags, loadPrevious, loadPublished, runAll, writeOutput } from "./run.js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    base: { type: "string" },
    only: { type: "string" },
    schools: { type: "string", default: "schools/taipei.json" },
    tags: { type: "string", default: "schools/tags.json" },
    reuse: { type: "boolean", default: false },
  },
});
if (!values.out) {
  console.error("usage: main.js --out <dir> [--base <url>] [--only code,code] [--schools <file>]");
  process.exit(2);
}

let schools;
try {
  schools = JSON.parse(await readFile(values.schools, "utf8")).schools;
} catch (e) {
  console.error(`cannot read school list ${values.schools}: ${e.message}`);
  process.exit(2);
}
let tagTexts;
try {
  tagTexts = JSON.parse(await readFile(values.tags, "utf8"));
} catch (e) {
  console.error(`cannot read tag texts ${values.tags}: ${e.message}`);
  process.exit(2);
}

if (values.reuse && values.base) {
  const why = [];
  const live = await loadPublished(values.base, createHttp({ minGapMs: 0 }), (m) => why.push(m), schools);
  if (live) {
    applyTags(live.files, schools, tagTexts);
    await writeOutput(values.out, live);
    const lines = [`reused live data: ${live.files.size} school files, generated ${live.index.generated_at}`];
    if (live.missing.length) lines.push(`deployed as stale with no items (${live.missing.join(", ")}): ${why.join("; ")}`);
    console.log(lines.join("\n"));
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
    process.exit(0);
  }
  const line = `live data missing (${why.join("; ") || "unknown"}); fetching the schools instead`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, line + "\n");
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
const result = await runAll({ schools, previous, adapters, http: createHttp(), now, deadline, tagTexts });
await writeOutput(values.out, result);

const count = (status) => result.index.schools.filter((s) => s.status === status).length;
const lines = [
  `ok ${count("ok")}, stale ${count("stale")}, unsupported ${count("unsupported")} (of ${schools.length})`,
  ...[...result.files.values()].filter((f) => f.error).map((f) => `- ${f.school.code} ${f.school.name}: ${f.error}`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
