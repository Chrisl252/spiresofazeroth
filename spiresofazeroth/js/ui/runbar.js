// Top bar for the non-combat screens: class plate, HP, gold, act/zone, relics, potions, deck. Stage-native.
import { h, icon, tip, esc, qClass } from "./dom.js";
import { btn } from "./kit.js";
import { gearStrip } from "./gearStrip.js";
import { installBagKey } from "./gearBag.js";
import { installCharKey, openCharSheet } from "./charSheet.js";
import { talentState } from "../engine/talents.js";
import { BUILD } from "../version.js";

export function runBar(app) {
  const { run, data } = app;
  if (!run) return null;
  installBagKey(app); // the B key toggles the Backpack (idempotent)
  installCharKey(app); // the C key toggles the Character window (ui/charSheet.js)
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
  const pct = Math.max(0, Math.min(100, Math.round((run.hp / Math.max(1, run.maxHp)) * 100)));
  return h("header", { class: "sx-bar" },
    h("div", { class: "sx-bar__who" }, h("span", { class: "sx-bar__cls" }, icon(cls.icon, "", cls.name)),
      h("div", {}, h("b", { style: { color: cls.color } }, cls.name || "Hero"), h("small", {}, zone ? zone.name : "Azeroth"))),
    h("div", { class: "sx-bar__hp", role: "img", "aria-label": `HP ${run.hp} of ${run.maxHp}` }, h("i", { style: { width: `${pct}%` } }), h("span", {}, `${run.hp} / ${run.maxHp}`)),
    h("div", { class: "sx-bar__gold" }, icon("inv_misc_coin_01", "", ""), h("b", {}, run.gold)),
    h("div", { class: "sx-bar__act" }, "Act ", h("b", {}, `${Math.max(1, run.act)}/6`), "  Floor ", h("b", {}, Math.max(0, run.floor + 1))),
    relics, pots,
    btn("Character", () => openCharSheet(app), { size: "sm", cls: "sx-bar__char", title: "Character: gear, stats, racial, talents (C)" }),
    btn(`Bag ${run.gearBag ? run.gearBag.length : 0}`, () => app.showGear(), { size: "sm", cls: "sx-bar__gear", title: "Backpack (B)" }),
    btn(`Deck ${run.deck.length}`, () => app.showDeck(), { size: "sm", cls: "sx-bar__deck" }),
    // mid-run talents (engine/talentsMidRun.js): solo only (a co-op partner would wait on a menu), and only from the map so no node is half-resolved
    !(app.coop && app.coop.active && app.coop.active()) && run.screen === "map" && app.meta ? (() => { const n = talentState(app.meta, run.classId).available;
      return btn(n > 0 ? `Talents ${n}` : "Talents", () => app.go("talents", { cls: run.classId, midRun: true, back: "map" }), { size: "sm", cls: `sx-bar__tal${n > 0 ? " sx-bar__tal--new" : ""}`, title: "Spend talent points (learned ranks make this run's enemies tougher)" }); })() : null,
    run.screen !== "map" && run.screen !== "end" ? btn("Map", () => import(`./map.js?v=${BUILD}`).then((m) => m.openMapOverlay(app)), { size: "sm", cls: "sx-bar__map", title: "View the spire map" }) : null, // 10-30 report: no Map at the campfire
    btn("Settings", () => app.showMenu(), { size: "sm", cls: "sx-bar__set", title: "Settings" }),
    btn("⛶", () => app.stage.toggleFullscreen(), { size: "sm", cls: "sx-bar__fs", title: "Fullscreen (F)" }));
}
