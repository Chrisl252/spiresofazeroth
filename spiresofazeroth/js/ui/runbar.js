// Top bar for the non-combat screens: class plate, HP, gold, act/zone, relics, potions, deck. Stage-native.
import { h, icon, tip, esc, qClass } from "./dom.js";
import { btn } from "./kit.js";
import { gearStrip } from "./gearStrip.js";

export function runBar(app) {
  const { run, data } = app;
  if (!run) return null;
  const cls = data.classObj(run.classId) || {};
  const zone = run.zoneId ? data.zone(run.zoneId) : null;
  const relics = gearStrip(app); // gear strip: 16 paper-doll sockets + set badge (replaces the relic strip)
  const pots = h("div", { class: "sx-bar__strip sx-bar__pots" });
  for (const id of run.potions) {
    const p = data.potion(id);
    if (!p) continue;
    const b = h("span", { class: "sx-bar__slot", tabindex: "0", "aria-label": p.name }, icon(p.icon, "", p.name));
    tip(b, `<b>${esc(p.name)}</b><br>${esc(p.text)}`);
    pots.append(b);
  }
  const pct = Math.max(0, Math.min(100, Math.round((run.hp / Math.max(1, run.maxHp)) * 100)));
  return h("header", { class: "sx-bar" },
    h("div", { class: "sx-bar__who" }, h("span", { class: "sx-bar__cls" }, icon(cls.icon, "", cls.name)),
      h("div", {}, h("b", { style: { color: cls.color } }, cls.name || "Hero"), h("small", {}, zone ? zone.name : "Azeroth"))),
    h("div", { class: "sx-bar__hp", role: "img", "aria-label": `HP ${run.hp} of ${run.maxHp}` }, h("i", { style: { width: `${pct}%` } }), h("span", {}, `${run.hp} / ${run.maxHp}`)),
    h("div", { class: "sx-bar__gold" }, icon("inv_misc_coin_01", "", ""), h("b", {}, run.gold)),
    h("div", { class: "sx-bar__act" }, "Act ", h("b", {}, `${Math.max(1, run.act)}/6`), "  Floor ", h("b", {}, Math.max(0, run.floor + 1))),
    relics, pots,
    btn(`Gear Bag ${run.gearBag ? run.gearBag.length : 0}`, () => app.showGear(), { size: "sm", cls: "sx-bar__gear" }),
    btn(`Deck ${run.deck.length}`, () => app.showDeck(), { size: "sm", cls: "sx-bar__deck" }),
    btn("Settings", () => app.go("settings"), { size: "sm", cls: "sx-bar__set", title: "Settings" }),
    btn("⛶", () => app.stage.toggleFullscreen(), { size: "sm", cls: "sx-bar__fs", title: "Fullscreen (F)" }));
}
