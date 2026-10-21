// Tiny DOM toolkit shared by every screen. No framework: h() builds elements, the rest are small widgets.
import { renderText } from "../engine/cardtext.js";
import { slugify } from "../engine/data.js";
import { cardEl as cardElV2 } from "./card.js";
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
let tipEl = null;
export function tip(el, html) {
  const show = (x, y) => {
    if (!tipEl) { tipEl = h("div", { class: "sp-tip", role: "tooltip" }); document.body.append(tipEl); }
    tipEl.innerHTML = html;
    tipEl.style.display = "block";
    const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    tipEl.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x + 12)) + "px";
    tipEl.style.top = Math.max(6, Math.min(window.innerHeight - hgt - 6, y + 14)) + "px";
  };
  const hide = () => { if (tipEl) tipEl.style.display = "none"; };
  el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(e.clientX, e.clientY); });
  el.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && tipEl && tipEl.style.display === "block") show(e.clientX, e.clientY); });
  el.addEventListener("pointerleave", hide);
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); show(r.left, r.bottom); });
  el.addEventListener("blur", hide);
  el.addEventListener("pointerdown", hide);
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
export { cardEl } from "./card.js";
export function codexLinks(def, kind) {
  const sl = slugify(def.name);
  if (kind === "spell" && def.spellId) return `/spell/${sl}-${def.spellId}/`;
  if (kind === "npc" && def.npcId) return `/npc/${sl}-${def.npcId}/`;
  return null;
}

// ---- floating text / feedback ----
export function floatText(host, text, kind) {
  if (!host) return;
  const f = h("div", { class: `sp-float ${kind || "dmg"}` }, text);
  host.append(f);
  setTimeout(() => f.remove(), 1000);
}
export function toast(msg, ms = 2200) {
  const t = h("div", { class: "sp-toast sp-frame", role: "status" }, msg);
  document.body.append(t);
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
  document.body.append(back);
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
