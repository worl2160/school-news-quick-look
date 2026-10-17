// Shared by the page and the service worker: which followed schools have unread posts.
// Counts only posts that are unread and not yet announced in an earlier notification.
export async function findNews({ followed, readIds, notifiedIds = async () => new Set(), fetchJson }) {
  const found = [];
  for (const code of followed) {
    try {
      const f = await fetchJson(`${code}.json`);
      const read = await readIds(code);
      const told = await notifiedIds(code);
      const ids = f.items.filter((i) => !read.has(i.id) && !told.has(i.id)).map((i) => i.id);
      if (ids.length) found.push({ code, name: f.school.name, count: ids.length, ids });
    } catch {
      // unreachable school file: say nothing about it
    }
  }
  return found;
}

export function newsMessage(found) {
  return found.map((f) => `${f.name} 有 ${f.count} 則新公告`).join("、");
}
