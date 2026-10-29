// Tiny DOM toolkit shared by every screen. No framework: h() builds elements, the rest are small widgets.
import { renderText } from "../engine/cardtext.js?v=20261029a";
import { slugify } from "../engine/data.js?v=20261029a";
import { cardEl as cardElV2 } from "./card.js?v=20261029a";
const HD = new URL("../../assets/icons-hd/", import.meta.url).href; // 256px upscaled icons, relative so dev + deploy both resolve
const cardElMini = (def, inst) => cardElV2(def, { tag: "div", mini: true, inst });

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function icon(slug, cls = "", alt = "") {
  const img = h("img", { class: `sp-ico ${cls}`, src: `${HD}${slug || "inv_misc_questionmark"}.webp`, loading: "lazy", alt, width: 40, height: 40 });
  img.addEventListener("error", () => { img.onerror = null; img.src = `/assets/icons/${slug || "inv_misc_questionmark"}.jpg`; img.addEventListener("error", () => { img.src = "/assets/icons/inv_misc_questionmark.jpg"; }, { once: true }); }, { once: true });
  return img;
}
export const qClass = (rarity) => `q-${rarity || "common"}`;
export const cap = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

// ---- analytics (guarded; gtag may be blocked) ----
export function track(name, params) { try { if (window.gtag) window.gtag("event", name, params); } catch (e) { /* ignore */ } }

// ---- tooltip ----
let tipEl = null, tipPoint = null, tipFullscreenListener = false, tipOwner = null, tipGuard = 0;
// A tip whose owner left the DOM (map node clicked -> screen swapped) never gets pointerleave, so it stayed on screen over the next
// screen's cards (2026-10-28 reports). While a tip is up, a light guard hides it once the owner is gone or no longer hovered.
function hideTip() { if (tipEl) tipEl.style.display = "none"; tipOwner = null; if (tipGuard) { clearInterval(tipGuard); tipGuard = 0; } }
function guardTip() {
  if (tipGuard) return;
  tipGuard = setInterval(() => {
    const o = tipOwner;
    if (!o || !o.isConnected || (!o.matches(":hover") && document.activeElement !== o)) hideTip();
  }, 250);
}
function showTip(html, x, y) {
  if (!tipEl) tipEl = h("div", { class: "sp-tip", role: "tooltip" });
  const parent = overlayHost();
  if (tipEl.parentElement !== parent) parent.append(tipEl);
  tipPoint = { x, y };
  tipEl.innerHTML = html;
  tipEl.style.display = "block";
  const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
  tipEl.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x + 12)) + "px";
  tipEl.style.top = Math.max(6, Math.min(window.innerHeight - hgt - 6, y + 14)) + "px";
}
export function tip(el, html) {
  const show = (x, y) => showTip(typeof html === "function" ? html() : html, x, y); // html may be a getter for rows whose state changes (loot gear swap)
  if (!tipFullscreenListener) {
    document.addEventListener("fullscreenchange", () => {
      if (tipEl && tipEl.style.display === "block" && tipPoint) showTip(tipEl.innerHTML, tipPoint.x, tipPoint.y);
    });
    tipFullscreenListener = true;
  }
  const hide = () => { if (tipOwner === el || !tipOwner) hideTip(); };
  const own = () => { tipOwner = el; guardTip(); };
  el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { show(e.clientX, e.clientY); own(); } });
  el.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && tipEl && tipEl.style.display === "block") show(e.clientX, e.clientY); });
  el.addEventListener("pointerleave", hide);
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); show(r.left, r.bottom); own(); });
  el.addEventListener("blur", hide);
  el.addEventListener("pointerdown", hideTip);
  return el;
}
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- status chips ----
export function statusChips(data, st, { max = 12 } = {}) {
  const wrap = h("div", { class: "sp-statuses" });
  let n = 0;
  for (const [id, v] of Object.entries(st || {})) {
    if (!v || n++ >= max) continue;
    const kw = data.status(id) || { name: cap(id), text: "", icon: "inv_misc_questionmark", kind: "buff" };
    const chip = h("span", { class: `sp-chip sp-chip--${kw.kind || "buff"}`, tabindex: "0", "aria-label": `${kw.name} ${v}` }, icon(kw.icon, "sp-ico--sm"), typeof v === "number" && v !== 1 ? v : "");
    tip(chip, `<b>${esc(kw.name)}</b> ${typeof v === "number" ? v : ""}<br>${esc(kw.text)}`);
    wrap.append(chip);
  }
  return wrap;
}

// ---- cards ----
export function cardTypeLabel(def) { return [cap(def.type), def.rarity && def.rarity !== "basic" ? cap(def.rarity) : ""].filter(Boolean).join(" - "); }
export function cardCostLabel(def, cost) {
  if (cost !== undefined) return cost === "X" ? "X" : String(cost);
  return def.cost === "X" ? "X" : def.cost < 0 ? "-" : String(def.cost);
}
// v2: the card look lives in card.js (260x380 stage px, `mini: true` = 130x190). Same options as before: { C, inst, tag, cls, cost, onClick, data }.
export { cardEl } from "./card.js?v=20261029a";
export function codexLinks(def, kind) {
  const sl = slugify(def.name);
  if (kind === "spell" && def.spellId) return `/spell/${sl}-${def.spellId}/`;
  if (kind === "npc" && def.npcId) return `/npc/${sl}-${def.npcId}/`;
  return null;
}

// ---- floating text / feedback ----
// Real fullscreen only shows the fullscreen element's subtree, so anything mounted on document.body vanishes there: mount overlays here instead.
export function overlayHost() { return document.fullscreenElement || document.body; }
export function floatText(host, text, kind) {
  if (!host) return;
  const f = h("div", { class: `sp-float ${kind || "dmg"}` }, text);
  host.append(f);
  setTimeout(() => f.remove(), 1000);
}
export function toast(msg, ms = 2200) {
  const t = h("div", { class: "sp-toast sp-frame", role: "status" }, msg);
  overlayHost().append(t);
  setTimeout(() => t.remove(), ms);
}
export function modal(title, body, { onClose } = {}) {
  const back = h("div", { class: "sp-modal-back", role: "dialog", "aria-modal": "true", "aria-label": title });
  const close = () => { back.remove(); document.removeEventListener("keydown", key); if (onClose) onClose(); };
  const key = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", key);
  const box = h("div", { class: "sp-modal sp-frame" }, h("div", { class: "sp-row" }, h("h2", { class: "sp-title sp-grow" }, title), h("button", { class: "sp-btn sp-btn--small", type: "button", onClick: close }, "Close")), body);
  back.append(box);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  overlayHost().append(back);
  box.querySelector("button").focus();
  return close;
}

// ---- shared run HUD ----
export function hud(app) {
  const run = app.run;
  const data = app.data;
  if (!run) return null;
  const zone = data.zone(run.zoneId);
  const relics = h("div", { class: "sp-relics" });
  for (const id of run.relics) {
    const r = data.relic(id);
    if (!r) continue;
    const b = h("span", { tabindex: "0", "aria-label": r.name }, icon(r.icon, `sp-ico--sm ${qClass(r.rarity)}`));
    tip(b, `<b class="${qClass(r.rarity)}" style="color:var(--q)">${esc(r.name)}</b><br>${esc(r.text)}`);
    relics.append(b);
  }
  const pots = h("div", { class: "sp-potions" });
  for (const id of run.potions) {
    const p = data.potion(id);
    if (!p) continue;
    const b = h("span", { tabindex: "0" }, icon(p.icon, "sp-ico--sm"));
    tip(b, `<b>${esc(p.name)}</b><br>${esc(p.text)}`);
    pots.append(b);
  }
  return h("div", { class: "sp-hud sp-frame sp-frame--thin" },
    h("span", {}, "HP ", h("b", {}, `${run.hp}/${run.maxHp}`)),
    h("span", {}, "Gold ", h("b", {}, run.gold)),
    h("span", {}, "Act ", h("b", {}, `${run.act}/6`)),
    zone ? h("span", { class: "sp-dim" }, zone.name) : null,
    h("span", {}, "Floor ", h("b", {}, Math.max(0, run.floor + 1))),
    h("button", { class: "sp-btn sp-btn--small sp-btn--ghost", type: "button", onClick: () => app.showDeck() }, `Deck (${run.deck.length})`),
    relics, pots);
}

export function deckView(app, run = app.run) {
  const grid = h("div", { class: "spc-grid" });
  const sorted = run.deck.map((c, i) => ({ c, i })).sort((a, b) => (app.data.card(a.c.id, run.classId) || {}).name > (app.data.card(b.c.id, run.classId) || {}).name ? 1 : -1);
  for (const { c } of sorted) {
    const def = app.cardDef(c.id, c.up);
    grid.append(cardElMini(def, c));
  }
  return grid;
}

// Null-safe replaceChildren: skips null/false children instead of stringifying them.
export function fill(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); return el; }
