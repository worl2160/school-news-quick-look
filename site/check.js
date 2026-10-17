// Shared by the page and the service worker: which followed schools have unread posts.
export async function findNews({ followed, readIds, fetchJson }) {
  const found = [];
  for (const code of followed) {
    try {
      const f = await fetchJson(`${code}.json`);
      const read = await readIds(code);
      const count = f.items.filter((i) => !read.has(i.id)).length;
      if (count) found.push({ code, name: f.school.name, count });
    } catch {
      // unreachable school file: say nothing about it
    }
  }
  return found;
}

export function newsMessage(found) {
  return found.map((f) => `${f.name} 有 ${f.count} 則新公告`).join("、");
}
