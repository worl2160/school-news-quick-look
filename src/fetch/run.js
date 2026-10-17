// Fetch every school in list order, keep a school's previous data when it fails,
// and build the files the app reads.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toTaipeiIso } from "./format.js";

/** The currently published school files, keyed by code; unreadable ones are skipped. */
export async function loadPrevious(baseUrl, codes, http) {
  const previous = new Map();
  for (const code of codes) {
    try {
      previous.set(code, JSON.parse(await http.getText(`${baseUrl}/${code}.json`)));
    } catch {
      // 404 on the first deploy, or a broken file: start that school from nothing.
    }
  }
  return previous;
}

function latest(items) {
  return items.reduce((max, i) => (i.published_at && (!max || i.published_at > max) ? i.published_at : max), null);
}

/**
 * Fetch every school in order. Once `clock()` passes `deadline`, the remaining schools are
 * not fetched: they keep their previous data and are marked stale, so the run still deploys.
 * Each school's tags (from the school list) go into its file with their `tagTexts`.
 */
export async function runAll({ schools, previous, adapters, http, now, deadline = Infinity, clock = Date.now, tagTexts = {} }) {
  const nowIso = toTaipeiIso(now.getTime());
  const files = new Map();
  const entries = [];
  for (const s of schools) {
    const base = {
      code: s.code,
      name: s.name,
      city: s.city,
      district: s.district,
      type: s.type,
      board_name: s.params ? s.params.board_name : null,
    };
    const adapter = s.adapter ? adapters[s.adapter] : null;
    if (!adapter) {
      entries.push({ ...base, status: "unsupported", latest_published_at: null, last_success_at: null });
      continue;
    }
    const old = previous.get(s.code);
    let file;
    try {
      if (clock() >= deadline) throw new Error("skipped: run deadline");
      const items = await adapter(s, http, now, old ? old.items || [] : []);
      file = { items, last_success_at: nowIso, error: null };
    } catch (e) {
      file = {
        items: old ? old.items || [] : [],
        last_success_at: old ? old.last_success_at || null : null,
        error: e.message || String(e),
      };
    }
    files.set(s.code, {
      schema: 1,
      school: { code: s.code, name: s.name, url: s.url },
      board: { name: base.board_name, url: s.url },
      last_success_at: file.last_success_at,
      last_attempt_at: nowIso,
      error: file.error,
      tags: (s.tags || []).map((name) => ({ name, text: tagTexts[name] || "" })),
      items: file.items,
    });
    entries.push({
      ...base,
      status: file.error ? "stale" : "ok",
      latest_published_at: latest(file.items),
      last_success_at: file.last_success_at,
    });
  }
  return { index: { schema: 1, generated_at: nowIso, schools: entries }, files };
}

export async function writeOutput(dir, { index, files }) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.json"), JSON.stringify(index));
  for (const [code, file] of files) await writeFile(join(dir, `${code}.json`), JSON.stringify(file));
}

/** Above this share of unreadable school files, reuse gives up and the schools are fetched. */
export const MAX_MISSING_SHARE = 0.8;

/**
 * The live site's data as it is: index plus every school file it lists (unsupported
 * schools have none). Each file is read once. A school whose file cannot be read is kept
 * in the index as stale with an empty placeholder file (its url from `schools`), so the
 * next scheduled run fills it in. Null when the index cannot be read or more than
 * MAX_MISSING_SHARE of the files are missing, so the caller fetches instead; `log` hears
 * which file and why.
 */
export async function loadPublished(baseUrl, http, log = () => {}, schools = []) {
  const read = async (name) => {
    try {
      return JSON.parse(await http.getText(`${baseUrl}/${name}`));
    } catch (e) {
      log(`${name}: ${e.message}`);
      return undefined;
    }
  };
  const index = await read("index.json");
  if (!index) return null;
  const urls = new Map(schools.map((s) => [s.code, s.url]));
  const listed = (index.schools || []).filter((s) => s.status !== "unsupported");
  const files = new Map();
  const missing = [];
  for (const s of listed) {
    const file = await read(`${s.code}.json`);
    if (file) {
      files.set(s.code, file);
      continue;
    }
    missing.push(s.code);
    files.set(s.code, {
      schema: 1,
      school: { code: s.code, name: s.name, url: urls.get(s.code) || null },
      board: { name: s.board_name || null, url: urls.get(s.code) || null },
      last_success_at: s.last_success_at || null,
      last_attempt_at: index.generated_at || null,
      error: "live data file unreadable at deploy",
      items: [],
    });
  }
  if (missing.length > listed.length * MAX_MISSING_SHARE) return null;
  const gone = new Set(missing);
  const entries = (index.schools || []).map((s) =>
    gone.has(s.code) ? { ...s, status: "stale", latest_published_at: null } : s,
  );
  return { index: { ...index, schools: entries }, files, missing };
}
