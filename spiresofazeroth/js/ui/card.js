// Card element builder (v2). 260x380 stage px, full-art frame. Styling lives in css/cards.css.
// cardEl(def, opts) -> Element   opts: { C, inst, cost, data, color, mini, tag, cls, onClick, tips, state }
// The WoW icon is 64 px (56 px of art inside a baked bevel), so the art is built from two layers: a blurred, saturated, scaled copy as
// the painted backdrop, and a canvas-upscaled + unsharp-masked copy fading into it. Nothing here touches the engine.
import { renderText } from "../engine/cardtext.js";
import { tip, esc } from "./dom.js";
const HD = new URL("../../assets/icons-hd/", import.meta.url).href; // 256px upscaled icons, relative so dev + deploy both resolve

export const CARD_W = 260, CARD_H = 380, MINI_W = 130, MINI_H = 190;
const cap = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---- art: upscale + sharpen once per icon, cached --------------------------------------------------------------
const artCache = new Map();
export function sharpIcon(slug) {
  if (artCache.has(slug)) return artCache.get(slug);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const S = 256, cv = document.createElement("canvas");
        cv.width = cv.height = S;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
        if (img.naturalWidth >= 200) { // HD upscaled icon: just crop the baked rim, no resample chain / sharpen
          const hm = Math.round(img.naturalWidth * 0.0625);
          g.drawImage(img, hm, hm, img.naturalWidth - 2 * hm, img.naturalHeight - 2 * hm, 0, 0, S, S);
          return resolve(cv.toDataURL("image/jpeg", 0.95));
        }
        // two doublings are kinder than one 4x jump; the 4 px rim of every WoW icon is the baked bevel, so crop it
        const mid = document.createElement("canvas"); mid.width = mid.height = 128;
        const mg = mid.getContext("2d"); mg.imageSmoothingQuality = "high";
        const m = Math.round(img.naturalWidth * 0.0625);
        mg.drawImage(img, m, m, img.naturalWidth - 2 * m, img.naturalHeight - 2 * m, 0, 0, 128, 128);
        g.drawImage(mid, 0, 0, S, S);
        const src = g.getImageData(0, 0, S, S), out = g.createImageData(S, S), a = src.data, b = out.data, amt = 0.85;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          for (let c = 0; c < 3; c++) {
            const up = a[(Math.max(0, y - 1) * S + x) * 4 + c], dn = a[(Math.min(S - 1, y + 1) * S + x) * 4 + c];
            const lf = a[(y * S + Math.max(0, x - 1)) * 4 + c], rt = a[(y * S + Math.min(S - 1, x + 1)) * 4 + c];
            const v = a[i + c] + amt * (4 * a[i + c] - up - dn - lf - rt) * 0.5;
            b[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
          b[i + 3] = 255;
        }
        g.putImageData(out, 0, 0);
        resolve(cv.toDataURL("image/jpeg", 0.92));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => { if (img.dataset.fb) return resolve(null); img.dataset.fb = "1"; img.src = `/assets/icons/${slug}.jpg`; }; // HD webp missing -> 56/64px jpg
    img.src = `${HD}${slug}.webp`;
  });
  artCache.set(slug, p);
  return p;
}

// ---- keyword highlight -----------------------------------------------------------------------------------------
let kwRe = null, kwSize = -1;
const EXTRA_KW = ["Exhaust", "Innate", "Retain", "Ethereal", "Unplayable", "Energy", "Block", "Rage"];
function appData(data) { return data || (window.__spires && window.__spires.data) || null; }
function keywordRegex(data) {
  const d = appData(data);
  const names = d && d.keywords ? [...d.keywords.values()].map((k) => k.name) : [];
  if (kwRe && kwSize === names.length) return kwRe;
  const all = [...new Set([...names, ...EXTRA_KW])].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  kwRe = new RegExp(`\\b(${all.join("|")})\\b`, "gi"); kwSize = names.length;
  return kwRe;
}
export function cardTextHtml(text, data) {
  return esc(text).replace(keywordRegex(data), '<b class="spc-kw">$1</b>').replace(/(^|[^\w>])(\d+)(?![\w<])/g, '$1<b class="spc-num">$2</b>');
}
export function keywordLines(def, data) {
  const d = appData(data);
  if (!d || !d.keywords) return [];
  const ids = new Set(def.keywords || []);
  const text = (def.text || "").toLowerCase();
  const word = (n) => new RegExp("(^|[^a-z])" + n.toLowerCase().replace(/[^a-z0-9 ]/g, "") + "([^a-z]|$)");
  for (const k of d.keywords.values()) if (word(k.name).test(text)) ids.add(k.id);
  return [...ids].map((k) => d.status(k)).filter(Boolean).map((kw) => ({ name: kw.name, text: kw.text, icon: kw.icon }));
}
export function classColor(C, data) {
  if (C && C.cls && C.cls.color) return C.cls.color;
  const a = window.__spires;
  try { if (a && a.run) return (appData(data).classObj(a.run.classId) || {}).color; } catch (e) { /* ignore */ }
  return "#c9a24b";
}
export const costLabel = (def, cost) => {
  const c = cost !== undefined ? cost : def.cost;
  return c === "X" ? "X" : c < 0 ? "–" : String(c);
};

// ---- the card ----------------------------------------------------------------------------------------------------
export function cardEl(def, o = {}) {
  const { C, inst, cost, data, color, mini = false, tag = "button", cls = "", onClick } = o;
  const text = renderText(def, C);
  const up = !!(def.upgraded || (inst && inst.up));
  const rar = def.rarity || "common";
  const type = def.type || "skill";
  const card = mk("div", `spc spc--r-${rar} spc--t-${type}${up ? " spc--up" : ""}${text.length > 92 ? " spc--long" : ""}`);
  card.style.setProperty("--cc", color || classColor(C, data));
  if (inst) card.dataset.inst = inst.uid;
  if (def.id) card.dataset.card = def.id; // inspect panel + tests resolve the def from the element
  const art = mk("span", "spc__art");
  const blur = mk("i", "spc__blur"), hi = mk("i", "spc__hi"), shade = mk("i", "spc__shade");
  // weapon-art cards (Auto Shot) show the ranged weapon equipped in the main hand: bow, crossbow or gun
  let wslug = null;
  if (def.weaponIcon && C && C.run && C.run.gear && data && data.relicMap) { const w = data.relicMap.get(C.run.gear.mainHand); if (w && /inv_weapon_(bow|crossbow|gun|rifle)/i.test(w.icon || "")) wslug = w.icon; }
  const slug = wslug || def.icon || "inv_misc_questionmark";
  blur.style.backgroundImage = `url(${HD}${slug}.webp), url(/assets/icons/${slug}.jpg)`;
  hi.style.backgroundImage = `url(${HD}${slug}.webp), url(/assets/icons/${slug}.jpg)`;
  sharpIcon(slug).then((u) => { if (u) { hi.style.backgroundImage = `url(${u})`; blur.style.backgroundImage = `url(${u})`; } hi.classList.add("on"); });
  art.append(blur, hi, shade);
  const name = mk("span", "spc__name"); const nm = mk("span", "", up ? `${def.name.replace(/\s*\(Rank \d+\)\s*$/i, "")}+` : def.name); name.append(nm);
  const body = mk("span", "spc__body"); const tx = mk("span", "spc__text"); tx.innerHTML = cardTextHtml(text, data); body.append(tx);
  const frame = mk("span", "spc__frame");
  frame.append(art, name, mk("span", "spc__type", cap(type)), body, mk("span", "spc__shine"));
  const orb = mk("span", `spc__cost${def.cost < 0 && cost === undefined ? " spc__cost--none" : ""}`); orb.append(mk("span", "", costLabel(def, cost)));
  card.append(mk("span", "spc__glow"), frame, mk("span", "spc__gem"), orb);
  card.setAttribute("aria-label", `${def.name}, ${costLabel(def, cost)} cost, ${cap(type)}. ${text}`);

  let el = card;
  if (mini) {
    el = mk(tag === "button" ? "button" : tag, "spc-mini");
    if (tag === "button") el.type = "button";
    el.style.setProperty("--cc", card.style.getPropertyValue("--cc"));
    el.append(card);
    if (inst) el.dataset.inst = inst.uid;
    el.setAttribute("aria-label", card.getAttribute("aria-label"));
    card.removeAttribute("aria-label");
  }
  if (cls) el.className += ` ${cls}`;
  if (onClick) el.addEventListener("click", onClick);
  if (o.tips !== false && appData(data)) {
    const lines = keywordLines(def, data).map((k) => `<b>${esc(k.name)}</b>: ${esc(k.text)}`);
    if (lines.length) tip(el, lines.join("<br>"));
  }
  return el;
}

// Update the mutable bits of an existing (non-mini) card in place: cost, playable, text re-rendered with current Strength etc.
export function refreshCard(el, def, { C, cost, data, nope } = {}) {
  const orb = el.querySelector(".spc__cost > span");
  if (orb) { const l = costLabel(def, cost); if (orb.textContent !== l) { orb.textContent = l; el.querySelector(".spc__cost").classList.remove("punch"); void el.offsetWidth; el.querySelector(".spc__cost").classList.add("punch"); } }
  const tx = el.querySelector(".spc__text");
  if (tx) { const html = cardTextHtml(renderText(def, C), data); if (tx.innerHTML !== html) tx.innerHTML = html; }
  el.classList.toggle("is-nope", !!nope);
}
