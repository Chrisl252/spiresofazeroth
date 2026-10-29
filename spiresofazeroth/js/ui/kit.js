// Stage-native widgets shared by the non-combat screens (map, class select, reward, shop, rest, event, run end, codex, settings).
// Look lives in css/screens.css (.sx-*). Nothing here touches the engine.
import { h, icon, cardEl, tip, esc } from "./dom.js?v=20261029d";
import { BUILD } from "../version.js?v=20261029d";

export const ART = "/assets/loading-screens/";

// Stylesheets for these screens are linked from here (one registration point, no index.html edit). Screens await cssReady before render.
export const cssReady = Promise.all(["../../css/screens.css", "../../css/map.css", "../../css/gear.css", "../../css/talents.css", "../../css/menus.css"].map((rel) => new Promise((res) => {
  const href = `${new URL(rel, import.meta.url).href}?v=${BUILD}`; // the build cache-buster, like index.html's own stylesheets
  if (typeof document === "undefined" || document.querySelector(`link[href="${href}"]`)) return res();
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.onload = l.onerror = () => res();
  document.head.append(l);
})));

// Nine-slice red WoW button (css/stage.css .sp-wowbtn). size: "" | "sm" | "lg".
export function btn(label, onClick, { size = "", cls = "", disabled = false, auto = false, title } = {}) {
  return h("button", { class: `sp-wowbtn ${size ? `sp-wowbtn--${size}` : ""} ${cls}`.trim(), type: "button", onClick, disabled, title, ...(auto ? { "data-autofocus": "" } : {}) }, label);
}

// Toggle chip (aria-pressed) for pickers: continent, heroic level, pet, tabs.
export function tog(label, pressed, onClick, { cls = "", role } = {}) {
  return h("button", { class: `sx-tog ${cls}`.trim(), type: "button", "aria-pressed": String(!!pressed), role, onClick }, label);
}

// WoW icon in a gold frame (or a coloured ring for map nodes). size: sm 56 | md 88 | lg 128 | xl 200.
export function ico(slug, { size = "md", ring = "", q = "", alt = "" } = {}) {
  return h("span", { class: `sx-ico sx-ico--${size} ${ring ? `ring-${ring}` : ""} ${q}`.trim() }, icon(slug, "", alt));
}

// Gold banner heading with a rule, morpheus lettering.
export function banner(title, sub, { cls = "" } = {}) {
  return h("div", { class: `sx-banner ${cls}`.trim() }, h("h2", {}, title), sub ? h("p", {}, sub) : null);
}

// Parchment scroll panel inside the wood frame.
export const scroll = (cls, ...kids) => h("div", { class: `sx-wood sx-parch ${cls || ""}`.trim() }, ...kids);
// Dark wood panel (HUD style).
export const dark = (cls, ...kids) => h("div", { class: `sx-wood sx-dark ${cls || ""}`.trim() }, ...kids);

// A plate: icon + title + text, clickable. kind adds a tint (gold, relic quality via q).
export function plate({ ic, title, text, onClick, disabled = false, q = "", cls = "", extra = null, size = "md", auto = false, ring = "" }) {
  const b = h(onClick ? "button" : "div", { class: `sx-plate ${cls}`.trim(), ...(onClick ? { type: "button", onClick, disabled } : {}), ...(auto ? { "data-autofocus": "" } : {}) },
    ico(ic, { size, q, ring }),
    h("div", { class: "sx-plate__body" }, h("b", { class: `sx-plate__t ${q}`.trim() }, title), text ? h("span", { class: "sx-plate__x" }, text) : null, extra));
  return b;
}

// Fixed-size slot for a cardEl (the cards agent restyles .sp-card; the slot keeps the layout stable).
export function cardSlot(def, opts = {}, { rot = 0, lift = true, delay = 0, cls = "" } = {}) {
  const el = cardEl(def, opts);
  const slot = h("div", { class: `sx-cardslot ${lift ? "lift" : ""} ${cls}`.trim(), style: { "--rot": `${rot}deg`, "--d": `${delay}ms` } }, el);
  return slot;
}

export function coin(n, { afford = true } = {}) {
  return h("span", { class: `sx-coin ${afford ? "" : "short"}`.trim() }, icon("inv_misc_coin_01", "sx-coin__i", ""), String(n));
}

// Stage-native modal (scales with the 1920x1080 space, unlike dom.js modal which lives on <body>).
export function stageModal(app, title, body, { onClose } = {}) {
  const back = h("div", { class: "sx-modal-back", role: "dialog", "aria-modal": "true", "aria-label": title });
  const close = () => { back.remove(); document.removeEventListener("keydown", key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", key);
  const box = scroll("sx-modal", h("div", { class: "sx-modal__head" }, h("h3", {}, title), btn("Close", close, { size: "sm" })), h("div", { class: "sx-modal__body" }, body));
  back.append(box);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  app.root.append(back);
  return close;
}

let backdropTable = null;
// zone id -> {fdid, crop, theme}; same file the stage reads, fetched once.
export async function zoneArt(id) {
  if (!backdropTable) {
    try { backdropTable = (await (await fetch(new URL("../../data/backdrops.json", import.meta.url))).json()).zones || {}; } catch (e) { backdropTable = {}; }
  }
  return backdropTable[id] || backdropTable.default || null;
}

export { h, icon, tip, esc };
