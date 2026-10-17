// Offline copy of the app, fresh data when online, and the optional background check.
import { findNews, newsMessage } from "./check.js";
import { idbGet } from "./idb.js";

// The deploy workflow replaces __BUILD__ with the commit, so every deploy installs a new worker.
const CACHE = "snql-__BUILD__";
const SHELL = ["./", "index.html", "styles.css", "app.js", "store.js", "sanitize.js", "check.js", "idb.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.includes("/data/")) {
    // Network first: the newest announcements matter most; fall back to the last copy.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
  } else {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});

self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "check-news") return;
  e.waitUntil(
    (async () => {
      const found = await findNews({
        followed: (await idbGet("followed")) || [],
        readIds: async (code) => new Set((await idbGet(`read:${code}`)) || []),
        fetchJson: async (path) => {
          const res = await fetch(new URL(`data/${path}`, self.registration.scope), { cache: "no-cache" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      });
      if (found.length) {
        await self.registration.showNotification("校訊即時通", { body: newsMessage(found), tag: "news", icon: "icons/icon-192.png" });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(self.registration.scope));
});
