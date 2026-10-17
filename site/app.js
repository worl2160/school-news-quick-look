// 校訊即時通: three screens driven by the URL hash.
//   #/                 schools (followed, search, all)
//   #/s/<code>         one school's announcements
//   #/s/<code>/<id>    one announcement
import { createStore } from "./store.js";
import { cleanHtml } from "./sanitize.js";
import { idbSet } from "./idb.js";

const DATA = "./data/";
const BG_KEY = "snql:bg";
const local = createStore();
// The service worker reads follows and read marks from IndexedDB, so mirror every change there.
const store = {
  ...local,
  follow(code) { local.follow(code); idbSet("followed", local.followed()); },
  unfollow(code) { local.unfollow(code); idbSet("followed", local.followed()); },
  markRead(code, ids) { local.markRead(code, ids); idbSet(`read:${code}`, [...local.readIds(code)]); },
};
const view = document.getElementById("view");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const backEl = document.getElementById("back");

let indexCache = null;
const schoolCache = new Map();
let filter = { text: "", district: "" };

// ---- data -------------------------------------------------------------------

async function getJson(path) {
  const res = await fetch(DATA + path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadIndex(fresh = false) {
  if (!indexCache || fresh) indexCache = await getJson("index.json");
  return indexCache;
}

async function loadSchool(code, fresh = false) {
  if (!schoolCache.has(code) || fresh) schoolCache.set(code, await getJson(`${encodeURIComponent(code)}.json`));
  return schoolCache.get(code);
}

// ---- helpers ----------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const day = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");
const stamp = (iso) => (iso ? `${day(iso)} ${iso.slice(11, 16)}` : "");
const fullDate = (iso) => (iso ? iso.slice(0, 10).replaceAll("-", "/") : "");

function setHeader(title, subtitle, back) {
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  backEl.hidden = !back;
  if (back) backEl.href = back;
  document.title = title === "校訊即時通" ? title : `${title}|校訊即時通`;
}

function show(...nodes) {
  view.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function failed(e) {
  show(h("p", { class: "warn" }, "目前讀不到資料，請稍後再試。"), h("p", { class: "note" }, String(e.message || e)));
}

// ---- screen 1: schools ------------------------------------------------------

async function renderHome() {
  setHeader("校訊即時通", "臺北市國小・非學校官方 App", null);
  const index = await loadIndex();
  const byCode = new Map(index.schools.map((s) => [s.code, s]));
  const followed = store.followed().filter((c) => byCode.has(c));

  const followedList = h("ul", { class: "cards" });
  const followedSection = h(
    "section",
    {},
    h("h2", {}, "我追蹤的學校"),
    followed.length ? followedList : h("p", { class: "note" }, "還沒有追蹤學校。在下方搜尋學校，按「追蹤」。"),
  );
  for (const code of followed) {
    const s = byCode.get(code);
    const badge = h("span", { class: "note" }, "");
    followedList.append(
      h("li", {}, h("a", { class: "card", href: `#/s/${code}` },
        h("span", { class: "grow" }, h("span", { class: "name" }, s.name), h("span", { class: "meta" }, `${s.district || ""}・${s.board_name || "公告"}`)),
        badge)),
    );
    if (s.status !== "unsupported") {
      loadSchool(code)
        .then((f) => {
          const n = store.newCount(code, f.items);
          badge.replaceWith(n ? h("span", { class: "badge" }, `${n} 則新`) : h("span", { class: "note" }, "已讀"));
        })
        .catch(() => badge.replaceWith(h("span", { class: "note" }, "讀取失敗")));
    }
  }

  const districts = [...new Set(index.schools.map((s) => s.district).filter(Boolean))].sort();
  const input = h("input", { id: "q", type: "search", placeholder: "輸入校名，例如 松山", value: filter.text, autocomplete: "off" });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "行政區" });
  const rows = h("ul", { class: "rows" });
  const count = h("h2", {});

  const drawChips = () => {
    chips.replaceChildren(
      ...["", ...districts].map((d) =>
        h("button", {
          class: "chip",
          type: "button",
          "aria-pressed": String(filter.district === d),
          onclick: () => { filter.district = d; drawChips(); drawRows(); },
        }, d || "全部行政區"),
      ),
    );
  };
  const drawRows = () => {
    const q = filter.text.trim();
    const list = index.schools.filter((s) => (!filter.district || s.district === filter.district) && (!q || s.name.includes(q)));
    count.textContent = `所有學校(${list.length})`;
    rows.replaceChildren(
      ...list.map((s) => {
        const on = store.followed().includes(s.code);
        const label = h("span", { class: "grow" }, s.name, h("span", { class: "district" }, s.district || ""));
        const right =
          s.status === "unsupported"
            ? h("span", { class: "note" }, "暫不支援")
            : h("button", {
                class: "follow",
                type: "button",
                "aria-pressed": String(on),
                "aria-label": `${on ? "取消追蹤" : "追蹤"}${s.name}`,
                onclick: () => { on ? store.unfollow(s.code) : store.follow(s.code); renderHome(); },
              }, on ? "已追蹤" : "追蹤");
        return h("li", {}, label, right);
      }),
    );
  };
  input.addEventListener("input", () => { filter.text = input.value; drawRows(); });
  drawChips();
  drawRows();

  show(
    followedSection,
    h("section", { class: "search" }, h("label", { for: "q" }, "搜尋學校"), input, chips),
    h("section", {}, count, rows),
    settingsSection(),
  );
}

// ---- screen 2: announcements -------------------------------------------------

async function renderSchool(code) {
  const index = await loadIndex();
  const s = index.schools.find((x) => x.code === code);
  if (!s) return failed(new Error("找不到這所學校"));
  setHeader(s.name, `${s.board_name || "公告"}・載入中…`, "#/");
  const f = await loadSchool(code, true);
  setHeader(s.name, `${f.board.name || "公告"}・資料更新於 ${stamp(f.last_success_at) || "—"}`, "#/");

  const read = store.readIds(code);
  const fresh = f.items.filter((i) => !read.has(i.id)).length;
  const list = h("ul", { class: "cards" });
  for (const i of f.items) {
    const unread = !read.has(i.id);
    const meta = [i.unit, day(i.published_at), i.attachments.length ? `附件 ${i.attachments.length}` : null].filter(Boolean).join("・");
    list.append(
      h("li", {}, h("a", { class: `post${i.pinned ? " pinned" : ""}${unread ? " unread" : ""}`, href: `#/s/${code}/${encodeURIComponent(i.id)}` },
        h("span", { class: "tags" }, i.pinned ? h("span", { class: "tag pin" }, "置頂") : null, unread ? h("span", { class: "tag new" }, "新") : null),
        h("span", { class: "t" }, i.title),
        h("span", { class: "meta" }, meta))),
    );
  }
  show(
    f.error ? h("p", { class: "warn" }, `暫時無法更新，以下是 ${stamp(f.last_success_at) || "先前"} 的資料。`) : null,
    h("div", { class: "toolbar" },
      h("span", { class: "grow" }, fresh ? ["上次之後有 ", h("strong", {}, `${fresh} 則新公告`)] : "沒有新公告"),
      fresh ? h("button", { class: "plain", type: "button", onclick: () => { store.markRead(code, f.items.map((i) => i.id)); renderSchool(code); } }, "全部標為已讀") : null),
    f.items.length ? list : h("p", { class: "note" }, "目前沒有公告。"),
    h("p", { class: "note" }, h("a", { href: f.school.url, target: "_blank", rel: "noopener noreferrer" }, "前往學校官網")),
  );
}

// ---- screen 3: one announcement ---------------------------------------------

async function renderPost(code, id) {
  const f = await loadSchool(code);
  const i = f.items.find((x) => x.id === id);
  setHeader(f.school.name, f.board.name || "公告", `#/s/${code}`);
  if (!i) return show(h("p", { class: "note" }, "這則公告已下架或不在最新列表中。"), h("a", { class: "primary", href: `#/s/${code}` }, "回到公告列表"));
  store.markRead(code, [i.id]);
  const content = h("div", { class: "content" });
  content.append(cleanHtml(i.content_html, document));
  show(
    h("article", {},
      h("h2", {}, i.title),
      h("p", { class: "meta" }, [i.unit, i.published_at ? `公告於 ${fullDate(i.published_at)}` : null].filter(Boolean).join("・")),
      content,
      i.attachments.length
        ? h("section", {}, h("h2", {}, "附件(連到學校官網原檔)"),
            h("ul", { class: "files" }, i.attachments.map((a) => h("li", {}, h("a", { href: a.url, target: "_blank", rel: "noopener noreferrer" }, a.name)))))
        : null,
      h("a", { class: "primary", href: i.source_url, target: "_blank", rel: "noopener noreferrer" }, "在學校官網開啟原文")),
  );
}

// ---- settings (filled in by the PWA layer) -----------------------------------

const canBackground =
  "serviceWorker" in navigator && typeof ServiceWorkerRegistration !== "undefined" && "periodicSync" in ServiceWorkerRegistration.prototype;

function bgEnabled() {
  try {
    return localStorage.getItem(BG_KEY) === "1";
  } catch {
    return false;
  }
}

async function setBackground(on) {
  const reg = await navigator.serviceWorker.ready;
  if (on) {
    if ((await Notification.requestPermission()) !== "granted") return false;
    try {
      await reg.periodicSync.register("check-news", { minInterval: 6 * 60 * 60 * 1000 });
    } catch {
      return false; // the browser only allows it for an installed app
    }
  } else {
    await reg.periodicSync.unregister("check-news");
  }
  try {
    localStorage.setItem(BG_KEY, on ? "1" : "0");
  } catch {
    // remembered by the browser's registration anyway
  }
  return true;
}

function settingsSection() {
  if (!canBackground) {
    return h("section", { class: "settings" }, h("p", { class: "note" }, "這個瀏覽器不支援背景檢查(iPhone 也不支援),請打開 App 查看新公告。"));
  }
  const box = h("input", { type: "checkbox", id: "bg", checked: bgEnabled() });
  const msg = h("p", { class: "note" }, "開啟後，手機會不定時檢查追蹤學校的新公告並發通知，可能延遲數小時。需要先把 App 加到主畫面。");
  box.addEventListener("change", async () => {
    const ok = await setBackground(box.checked);
    if (!ok) {
      box.checked = false;
      msg.textContent = "無法開啟：請允許通知，並先把 App 加到主畫面後再試一次。";
    }
  });
  return h("section", { class: "settings" }, h("h2", {}, "設定"), h("label", { for: "bg" }, box, "背景檢查新公告"), msg);
}

// ---- router -----------------------------------------------------------------

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  try {
    if (parts[0] === "s" && parts[1] && parts[2]) await renderPost(parts[1], parts[2]);
    else if (parts[0] === "s" && parts[1]) await renderSchool(parts[1]);
    else await renderHome();
  } catch (e) {
    failed(e);
  }
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { type: "module" }).catch(() => {});
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    indexCache = null;
    schoolCache.clear();
    route();
  }
});
route();
