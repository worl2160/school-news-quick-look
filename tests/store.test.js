import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../site/store.js";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const broken = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};
const items = [{ id: "nss:a" }, { id: "nss:b" }, { id: "nss:c" }];

test("store survives a throwing localStorage", () => {
  const s = createStore(broken);
  assert.deepEqual(s.followed(), []);
  assert.equal(s.newCount("313601", items), 3);
  assert.doesNotThrow(() => s.follow("313601"));
  assert.deepEqual(s.followed(), ["313601"]);
});

test("newCount ignores read ids", () => {
  const s = createStore(memoryStorage());
  s.markRead("313601", ["nss:a", "nss:b"]);
  assert.equal(s.newCount("313601", items), 1);
  assert.deepEqual([...s.readIds("313601")].sort(), ["nss:a", "nss:b"]);
});

test("follow and unfollow persist across store instances", () => {
  const storage = memoryStorage();
  createStore(storage).follow("313601");
  createStore(storage).follow("333607");
  createStore(storage).unfollow("313601");
  assert.deepEqual(createStore(storage).followed(), ["333607"]);
});

test("store starts when reading localStorage itself throws", () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("SecurityError"); },
  });
  try {
    const s = createStore();
    s.follow("313601");
    assert.deepEqual(s.followed(), ["313601"]);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});

test("the first look at a school takes the current posts as the baseline", () => {
  const s = createStore(memoryStorage());
  s.ensureBaseline("313601", items);
  assert.equal(s.newCount("313601", items), 0);
  s.ensureBaseline("313601", [{ id: "nss:z" }, ...items]);
  assert.equal(s.newCount("313601", [{ id: "nss:z" }, ...items]), 1);
});
