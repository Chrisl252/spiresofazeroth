// Card inspect panel (StS style): hover any card anywhere -> a column of keyword / stance / status explanations
// slides open beside it. Pure DOM, one document-level listener; the hand keeps its own lift + arrow logic.
// Glossary sources: data/keywords.json (statuses), class stance/seal/form/aspect/totem cards (their own text),
// the class resource tip. Explanations chain one level (Berserker Stance text -> its keywords).
import { iconUrl } from "../engine/data.js?v=20261029a";
import { overlayHost } from "./dom.js?v=20261029a";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SPECIAL = [ // rules words that are not statuses but players ask about
  { re: /\bexhaust\b/i, name: "Exhaust", icon: "spell_fire_fire", text: "Removed from your deck for the rest of this fight when played." },
  { re: /\bethereal\b/i, name: "Ethereal", icon: "spell_arcane_blink", text: "Exhausts if it is still in your hand at the end of your turn." },
  { re: /\binnate\b/i, name: "Innate", icon: "spell_holy_borrowedtime", text: "Starts in your opening hand every fight." },
  { re: /\bretain\b/i, name: "Retain", icon: "inv_misc_book_09", text: "Stays in your hand at the end of your turn instead of being discarded." },
  { re: /\breturns to your hand\b/i, name: "Returns", icon: "inv_throwingknife_04", text: "Comes back to your hand after you play it. Once per turn." },
  { re: /\bunplayable\b/i, name: "Unplayable", icon: "spell_shadow_curse", text: "Cannot be played. Clogs your hand until it leaves." },
  { re: /\benergy\b/i, name: "Energy", icon: "spell_arcane_arcane01", text: "Spent to play cards. Refills at the start of each turn." },
  { re: /\bblock\b/i, name: "Block", icon: "ability_defend", text: "Absorbs that much damage this turn. Gone at the start of your next turn." },
  { re: /\bstrength\b/i, name: "Strength", icon: "spell_nature_strength", text: "Each stack adds +1 damage to every attack you make." },
  { re: /\bdexterity\b/i, name: "Dexterity", icon: "ability_rogue_sprint", text: "Each stack adds +1 to every Block you gain." },
  { re: /\bthorns\b/i, name: "Thorns", icon: "spell_nature_thorns", text: "Attackers take that much damage when they hit you." },
  { re: /\bdraw\b/i, name: "Draw", icon: "inv_misc_note_01", text: "Take that many cards from the top of your draw pile into your hand." },
];

export function installCardInspect(app) {
  const panel = document.createElement("aside");
  panel.className = "spi"; panel.hidden = true; panel.setAttribute("aria-live", "polite");
  overlayHost().appendChild(panel);
  document.addEventListener("fullscreenchange", () => overlayHost().appendChild(panel)); // true fullscreen only paints its own subtree: follow it in and out
  let cur = null, raf = 0;

  const kwFor = (text, seen) => { // statuses + special words mentioned in text
    const out = [], d = app.data;
    const word = (n) => new RegExp("(^|[^a-z])" + n.toLowerCase().replace(/[^a-z0-9 ]/g, "") + "([^a-z]|$)", "i");
    if (d && d.keywords) for (const k of d.keywords.values()) if (!seen.has(k.id) && word(k.name).test(text)) { seen.add(k.id); out.push({ name: k.name, icon: k.icon, text: k.text, kind: k.kind }); }
    for (const s of SPECIAL) if (!seen.has(s.name) && s.re.test(text)) { seen.add(s.name); out.push(s); }
    return out;
  };
  const classOf = (def) => { // the run's class, else whichever class pool owns this card
    const d = app.data; if (app.run && app.run.classId) return app.run.classId;
    if (d.classId) return d.classId;
    for (const [cid, m] of d.classCards) if (m.has(def.id)) return cid;
    return null;
  };
  const modeCards = (def) => { // stance / seal / form / aspect / totem cards of the card's class: their names are the glossary
    const d = app.data; if (!d || !d.classCards) return [];
    const cid = classOf(def);
    const pool = [...((cid && d.classCards.get(cid)) || new Map()).values(), ...(d.neutralCards ? d.neutralCards.values() : [])];
    return pool.filter((c) => /^(stance|seal|form|aspect|totem)$/.test(c.type || ""));
  };
  const entriesFor = (def) => {
    const seen = new Set([def.id]), out = [];
    const text = `${def.name}. ${def.text || ""}`;
    for (const m of modeCards(def)) { // "Enter Berserker Stance" -> the stance's own text
      const stem = m.name.replace(/\s*\(Rank \d+\)/, "");
      if (stem !== def.name && new RegExp("\\b" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text) && !seen.has(m.id)) {
        seen.add(m.id); out.push({ name: stem, icon: m.icon, text: m.text, kind: m.type });
      }
    }
    out.push(...kwFor(text, seen));
    const r = app.data && app.data.classObj ? app.data.classObj(classOf(def)) : null;
    const res = r && r.resource;
    const resWord = res ? (res.name.split(/\s*[&(,]/)[0].trim() || res.id).replace(/[^\w ]/g, "") : ""; // "Rage & Stances" -> "Rage" (never matched before)
    if (res && new RegExp("\\b(" + resWord + "|" + res.id + ")\\b", "i").test(text) && !seen.has(res.id)) { seen.add(res.id); out.push({ name: res.name, icon: res.icon, text: res.tip || res.rules || "", kind: "resource" }); }
    for (const e of out.slice()) if (e.kind && /^(stance|seal|form|aspect|totem)$/.test(e.kind)) out.push(...kwFor(e.text || "", seen)); // chain once
    return out.slice(0, 8);
  };
  const defFor = (el) => {
    const id = el.dataset.card; if (!id) return null;
    const up = el.classList.contains("spc--up"), cid = app.run ? app.run.classId : null;
    let def = null;
    try { if (up) def = app.cardDef(id, true); } catch (e) { def = null; }
    if (!def || !def.text || def.text === "Unknown card.") def = (app.data && app.data.card(id, cid)) || def;
    return def && def.text ? def : null;
  };
  const place = (el) => {
    const r = el.getBoundingClientRect(), pw = panel.offsetWidth || 300, ph = panel.offsetHeight || 200, vw = innerWidth, vh = innerHeight;
    let x = r.right + 14; if (x + pw > vw - 8) x = r.left - pw - 14; if (x < 8) x = Math.min(vw - pw - 8, Math.max(8, r.right + 14));
    let y = Math.max(8, Math.min(vh - ph - 8, r.top + (r.height - ph) / 2));
    panel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const show = (el) => {
    const def = defFor(el); if (!def) return hide();
    const rows = entriesFor(def);
    if (!rows.length) return hide();
    panel.innerHTML = rows.map((e) => `<div class="spi__row spi__row--${esc(e.kind || "kw")}"><img class="spi__ico" alt="" src="${esc(iconUrl(e.icon))}"><div><b>${esc(e.name)}</b><span>${esc(e.text || "")}</span></div></div>`).join("");
    panel.hidden = false; cur = el; panel.classList.remove("on"); void panel.offsetWidth; panel.classList.add("on");
    place(el);
  };
  const hide = () => { cur = null; panel.hidden = true; panel.classList.remove("on"); };
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest && e.target.closest(".spc[data-card]");
    if (!el) { if (cur && !(e.target.closest && e.target.closest(".spi"))) hide(); return; }
    if (el === cur) return;
    if (e.buttons || el.closest(".spc-fly, .is-drag, .sp-hand .spc.is-drag")) return hide(); // a held button = a drag starting (pointer capture re-fires pointerover)
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => show(el));
  }, true);
  document.addEventListener("pointerdown", (e) => { if (!(e.target.closest && e.target.closest(".spi"))) hide(); }, true);
  document.addEventListener("pointerout", (e) => { if (cur && e.target === cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) hide(); }, true);
  addEventListener("scroll", () => { if (cur) place(cur); }, true);
  addEventListener("resize", hide);
  window.__spiresInspect = { entriesFor, defFor, show, hide }; // smoke tests
  return { hide, panel };
}
