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

export async function runAll({ schools, previous, adapters, http, now }) {
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
      const items = await adapter(s, http, now);
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
