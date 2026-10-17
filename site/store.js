// What this phone remembers: followed schools and the announcements already seen.
// Storage can be missing or throw (private mode, blocked site data); the app then
// keeps working from memory and treats everything as unread.
const FOLLOWED = "snql:followed";
const READ = (code) => `snql:read:${code}`;
const READ_KEEP = 500;

export function createStore(given) {
  let storage = given;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage; // the getter itself throws when site data is blocked
    } catch {
      storage = null;
    }
  }
  const memory = new Map();
  const load = (key, fallback) => {
    try {
      const v = storage && storage.getItem(key);
      if (v != null) return JSON.parse(v);
    } catch {
      // fall back to memory
    }
    return memory.has(key) ? memory.get(key) : fallback;
  };
  const save = (key, value) => {
    memory.set(key, value);
    try {
      storage && storage.setItem(key, JSON.stringify(value));
    } catch {
      // memory copy is enough for this visit
    }
  };

  return {
    followed: () => load(FOLLOWED, []),
    follow(code) {
      const list = load(FOLLOWED, []);
      if (!list.includes(code)) save(FOLLOWED, [...list, code]);
    },
    unfollow(code) {
      save(FOLLOWED, load(FOLLOWED, []).filter((c) => c !== code));
    },
    readIds: (code) => new Set(load(READ(code), [])),
    markRead(code, ids) {
      const merged = [...new Set([...load(READ(code), []), ...ids])];
      save(READ(code), merged.slice(-READ_KEEP));
    },
    newCount(code, items) {
      const read = new Set(load(READ(code), []));
      return items.filter((i) => !read.has(i.id)).length;
    },
  };
}
