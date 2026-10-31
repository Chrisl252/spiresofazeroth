// Top bar for the non-combat screens: class plate (zone, act and floor under the name), HP, gold | gear strip + set badge | potions | Gear Bag, Deck, Settings, Fullscreen.
// Stage-native. The groups are split by thin gold rules (landscape only); Settings and Fullscreen are square icon buttons so the row keeps room for more buttons.
import { h, icon, tip, esc, qClass } from "./dom.js?v=20261029d";
import { btn } from "./kit.js?v=20261029d";
import { gearStrip } from "./gearStrip.js?v=20261029d";

// Inline stroke icons (no asset): the fullscreen glyph "⛶" is missing from the UI fonts and rendered as an empty red box.
const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const ICON_GEAR = SVG("M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z");
const ICON_FULL = SVG("M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5");

const iconBtn = (svg, label, onClick, cls) => {
  const b = btn("", onClick, { size: "sm", cls: `sx-bar__ico ${cls}`, title: label });
  b.setAttribute("aria-label", label);
  b.append(h("span", { class: "sx-bar__glyph", html: svg }));
  return b;
};

// Label + count pill ("Deck (21)"). setBarCount() updates the pill in place (reward.js after a card pick).
const countBtn = (label, n, onClick, cls) => {
  const b = btn(label, onClick, { size: "sm", cls: `sx-bar__count ${cls}` });
  b.append(h("span", { class: "sx-bar__n" }, String(n)));
  return b;
};
export function setBarCount(el, n) {
  const pill = el && el.querySelector(".sx-bar__n");
  if (pill) pill.textContent = String(n);
}

// HP bar fill + text + warning tier (orange under 55%, red pulse under 30%). Shared with healer.js, which animates the bar in place.
export function paintHp(el, hp, max) {
  if (!el) return;
  const pct = Math.max(0, Math.min(100, Math.round((hp / Math.max(1, max)) * 100)));
  const fill = el.querySelector("i"), txt = el.querySelector("span");
  if (fill) fill.style.width = `${pct}%`;
  if (txt) txt.textContent = `${hp} / ${max}`;
  el.classList.toggle("is-mid", pct >= 30 && pct < 55);
  el.classList.toggle("is-low", pct < 30);
  el.setAttribute("aria-label", `HP ${hp} of ${max}`);
}

export function runBar(app) {
  const { run, data } = app;
  if (!run) return null;
  const cls = data.classObj(run.classId) || {};
  const zone = run.zoneId ? data.zone(run.zoneId) : null;
  const relics = gearStrip(app); // gear strip: 16 paper-doll sockets + set badge (replaces the relic strip)
  const pots = h("div", { class: "sx-bar__strip sx-bar__pots" });
  const nPot = Math.max(3, run.potions.length); // 3 fixed slots like the combat belt: empty ones show the classic empty slot art
  for (let i = 0; i < nPot; i++) {
    const p = run.potions[i] && data.potion(run.potions[i]);
    if (!p) { pots.append(h("span", { class: "sx-bar__slot sx-bar__slot--empty", "aria-label": "Potion slot (empty)" })); continue; }
    const b = h("span", { class: "sx-bar__slot", tabindex: "0", "aria-label": p.name }, icon(p.icon, "", p.name));
    tip(b, `<b>${esc(p.name)}</b><br>${esc(p.text)}`);
    pots.append(b);
  }
  const hp = h("div", { class: "sx-bar__hp", role: "img" }, h("i"), h("span"));
  paintHp(hp, run.hp, run.maxHp);
  const sep = () => h("i", { class: "sx-bar__sep", "aria-hidden": "true" });
  return h("header", { class: "sx-bar" },
    h("div", { class: "sx-bar__who" }, h("span", { class: "sx-bar__cls" }, icon(cls.icon, "", cls.name)),
      h("div", {}, h("b", { style: { color: cls.color } }, cls.name || "Hero"),
        h("small", {}, zone ? zone.name : "Azeroth",
          h("span", { class: "sx-bar__act" }, " · Act ", h("b", {}, `${Math.max(1, run.act)}/6`), " · Floor ", h("b", {}, Math.max(0, run.floor + 1)))))),
    hp,
    h("div", { class: "sx-bar__gold" }, icon("inv_misc_coin_01", "", ""), h("b", {}, run.gold)),
    sep(), relics, sep(), pots,
    countBtn("Gear Bag", run.gearBag ? run.gearBag.length : 0, () => app.showGear(), "sx-bar__gear"),
    countBtn("Deck", run.deck.length, () => app.showDeck(), "sx-bar__deck"),
    iconBtn(ICON_GEAR, "Settings (Esc)", () => app.showMenu(), "sx-bar__set"),
    iconBtn(ICON_FULL, "Fullscreen (F)", () => app.stage.toggleFullscreen(), "sx-bar__fs"));
}
