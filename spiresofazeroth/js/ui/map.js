// Spire map (stage-native, StS2 style): parchment scroll, ONE tavern start at the bottom centre, 2-3 inked lanes, big plates.
// Engine calls kept as they were: reachableNodes / enterNode, abandon sets run.screen = "end".
import { h, icon, tip } from "./dom.js";
import { enterNode, reachableNodes, prepareZonePick } from "../engine/run.js";
import { generateSpire } from "../engine/map.js";
import { heroicMods } from "../engine/heroic.js";
import { cssReady, ico, btn, dark } from "./kit.js";
import { runBar } from "./runbar.js";
import { drawPath } from "./mapPath.js";

export const stageNative = true;

// [icon, label, plate colour]. Seven distinct silhouettes: swords, skull+flame, ?-scroll, coin bag, campfire, chest, boss portrait.
export const NODE_ICON = {
  fight: ["ability_dualwield", "Fight", "red"], elite: ["spell_shadow_skull", "Elite", "purple"], event: ["inv_scroll_03", "Event", "blue"],
  vendor: ["inv_misc_bag_10", "Vendor", "gold"], rest: ["spell_fire_fire", "Campfire", "green"], treasure: ["inv_misc_treasurechest01b", "Treasure", "bronze"],
  boss: ["achievement_boss_ragnaros", "Boss", "red"],
};
const NODE_NOTE = { fight: "A fight against the spire's denizens.", elite: "A tougher foe. A relic waits for the victor.", rest: "Rest, or upgrade a card.", vendor: "Spend your gold.", event: "Something happens.", treasure: "A chest with gold and a relic.", boss: "The spire's master." };

// stable 0..1 hash so the hand-drawn wobble never changes between redraws
const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return ((x >>> 0) % 1000) / 1000; };

function bossInfo(app, zone) {
  const { data } = app;
  const fb = zone && zone.finalBoss && data.finalBosses.find((b) => b.id === zone.finalBoss);
  if (fb) return { name: fb.name, ic: fb.icon };
  if (zone && app.run.act >= 6 && data.finalBosses.length) return { name: "The Final Foe", ic: data.finalBosses[0].icon };
  const id = zone && zone.encounters && zone.encounters.boss && zone.encounters.boss[0] && zone.encounters.boss[0][0];
  const def = id && zone.enemyDefs && zone.enemyDefs[id];
  return def ? { name: def.name, ic: def.icon } : { name: "Spire Boss", ic: NODE_ICON.boss[0] };
}

const startInfo = (zone) => (zone && zone.start) || { name: "The Inn", icon: "inv_misc_beer_01" };

export async function render(app) {
  await cssReady;
  const { run, data, stage } = app;
  if (!run) return app.go("title");
  if (!run.zoneId) {
    await prepareZonePick(run, data);
    return app.go("zonepick");
  }
  if (!run.map || !run.map.floors) {
    const mods = heroicMods(run.heroic || 0);
    run.map = generateSpire(run.seed, `${run.act}:${run.zoneId}`, { eliteBonus: mods.eliteBonus, profile: data.mapProfile ? data.mapProfile(run.zoneId) : null });
  }
  stage.setBackdrop(run.zoneId || "default", { tint: { primary: "#d9b25c", secondary: "#2b1c0a", accent: "#f0d68a" } });
  const zone = data.zone(run.zoneId);
  const map = run.map;
  const portrait = !!stage.portrait;
  const FL = map.floors.length;
  const reachList = reachableNodes(run);
  const reach = new Set(reachList.map((n) => n.id));
  const st = startInfo(zone);
  const start = map.start || { id: "start", floor: -1, col: -1, lane: 1, x: 0.5, next: map.floors[0].map((n) => n.col) };
  const atStart = run.floor < 0;

  const land = !portrait; // landscape: the whole spire on ONE screen, left (inn) to right (boss); portrait keeps the tall scroll
  const ROW = portrait ? 262 : 214, TOP = 400, BOT = portrait ? 420 : 380, PADX = portrait ? 200 : 210;
  const P = portrait ? 190 : 152, PB = portrait ? 300 : 250; // portrait plate sizes (stage px); the boss plate is bigger
  const FX0 = 0.165, FXB = 0.9, PF = 0.78 * ((FXB - FX0) / Math.max(1, FL - 1)); // landscape: floor pitch fraction of sheet width, plate = 78% of the pitch
  // landscape positions are FRACTIONS of the sheet (dim is measured after layout); portrait positions are stage px
  const dim = { W: portrait ? 960 : 1796, H: portrait ? TOP + FL * ROW + BOT : 780 };
  const W = dim.W, H = dim.H;
  const fpos = (n) => {
    if (n.floor < 0) return [0.085, 0.5];
    if (n.floor === FL - 1) return [FXB, 0.5];
    return [FX0 + n.floor * ((FXB - FX0) / Math.max(1, FL - 1)), 0.5 + (n.x - 0.5) * 0.5 + (hash(n.id + "y") - 0.5) * 0.03];
  };
  const pos = (n) => {
    if (land) { const f = fpos(n); return [f[0] * dim.W, f[1] * dim.H]; }
    if (n.floor < 0) return [W / 2, TOP + FL * ROW];
    const top = n.floor === FL - 1;
    return [PADX + n.x * (W - 2 * PADX) + (top ? 0 : (hash(n.id) - 0.5) * 22), TOP + (FL - 1 - n.floor) * ROW + (top ? 0 : (hash(n.id + "y") - 0.5) * 18)];
  };
  const at = (n) => { if (!land) { const [x, y] = pos(n); return { left: `${x}px`, top: `${y}px` }; } const f = fpos(n); return { left: `${f[0] * 100}%`, top: `${f[1] * 100}%` }; };
  const boss = bossInfo(app, zone);
  const kids = (n) => (n.floor < 0 ? map.floors[0] : n.next.map((c) => map.floors[n.floor + 1][c]));

  // the taken path (start + nodes entered); old saves without history walk back along the first parent
  let trail = run.spire && run.spire.path;
  if (!trail) { trail = []; let f = run.floor, c = run.col; while (f >= 0) { trail.unshift(`f${f}c${c}`); c = map.floors[f][c].prev[0]; f--; } }
  const taken = new Set(["start", ...trail]);
  const here = atStart ? start : map.floors[run.floor][run.col];
  const live = new Set(); // everything still reachable by walking forward from where we stand
  const walk = (n) => { for (const k of kids(n)) if (!live.has(k.id)) { live.add(k.id); walk(k); } };
  walk(here);

  const sheet = h("div", { class: `sx-map__sheet ${land ? "sx-map__sheet--land" : ""}`.trim(), style: land ? `--pf:${PF}` : `width:${W}px;height:${H}px;--P:${P}px;--PB:${PB}px` });
  const canvas = h("canvas", { class: "sx-map__ink", "aria-hidden": "true" });
  sheet.append(canvas);
  for (let f = 0; f < FL - 1; f++) {
    sheet.append(land ? h("span", { class: `sx-map__floor sx-map__floor--h ${f === run.floor ? "cur" : ""}`.trim(), style: { left: `${fpos({ floor: f, x: 0.5, id: "" })[0] * 100}%` } }, f + 1)
      : h("span", { class: "sx-map__floor", style: { top: `${TOP + (FL - 1 - f) * ROW}px` } }, f + 1));
  }

  const pc = { W, H, map, pos, start, taken, live, here, hover: null, kids };
  const redraw = () => { if (land) { pc.W = dim.W = sheet.clientWidth || dim.W; pc.H = dim.H = sheet.clientHeight || dim.H; } drawPath(canvas, pc); };
  const order = reachList.slice().sort((a, b) => a.lane - b.lane);

  for (const row of map.floors) for (const n of row) {
    const [ic0, label, ringKind] = NODE_ICON[n.type];
    const isBoss = n.type === "boss";
    const done = taken.has(n.id);
    const can = reach.has(n.id);
    const dead = !done && !live.has(n.id);
    const key = can ? order.indexOf(n) + 1 : 0;
    const b = h("button", {
      class: `sx-node sx-node--${n.type} k-${ringKind} ${can ? "reach" : ""} ${done ? "done" : ""} ${here.id === n.id ? "here" : ""} ${dead ? "dead" : ""}`.trim(), type: "button", disabled: !can,
      style: at(n), "data-label": isBoss ? boss.name : label,
      "aria-label": `Floor ${n.floor + 1}: ${isBoss ? `Boss, ${boss.name}` : label}${can ? `, available, key ${key}` : ""}${done ? ", visited" : ""}`,
      onClick: () => { enterNode(run, data, n.col); app.save(); app.route(); },
    }, h("span", { class: "sx-plate" }, ico(isBoss ? boss.ic : ic0, { size: isBoss ? "boss" : "node", ring: ringKind, alt: label })),
      n.type === "elite" ? icon("spell_fire_flamebolt", "sx-node__flame", "") : null,
      n.type === "event" ? h("span", { class: "sx-node__q", "aria-hidden": "true" }, "?") : null,
      done ? h("span", { class: "sx-node__stamp", "aria-hidden": "true" }) : null,
      key ? h("span", { class: "sx-node__key", "aria-hidden": "true" }, String(key)) : null);
    if (can) {
      const on = (id) => () => { pc.hover = id; redraw(); };
      b.addEventListener("mouseenter", on(n.id)); b.addEventListener("focus", on(n.id));
      b.addEventListener("mouseleave", on(null)); b.addEventListener("blur", on(null));
    }
    tip(b, `<b>${isBoss ? `Boss: ${boss.name}` : label}</b><br>${NODE_NOTE[n.type]}`);
    sheet.append(b);
  }
  const bossN = map.floors[FL - 1][0];
  if (land) sheet.append(h("div", { class: "sx-map__bossname", style: { left: at(bossN).left, top: "calc(50% + var(--PB) / 2 + 8px)" } }, boss.name));
  else { const [bx, by] = pos(bossN); sheet.append(h("div", { class: "sx-map__bossname", style: { left: `${bx}px`, top: `${by + PB / 2 + 8}px` } }, boss.name)); }

  // the zone inn: every climb begins here (free, no encounter); large tavern plate, name beneath
  sheet.append(h("div", { class: `sx-start ${atStart ? "here" : "done"}`, style: at(start) },
    h("span", { class: `sx-plate sx-plate--inn ${atStart ? "you-are-here" : ""}`.trim() }, ico(st.icon, { size: "node", ring: "gold", alt: st.name })),
    atStart ? null : h("span", { class: "sx-node__stamp", "aria-hidden": "true" }),
    h("span", { class: "sx-start__name" }, st.name)));

  // player marker: ON the tavern plate before the first pick, then on the current node
  const cls = data.classObj(run.classId) || {};
  if (!atStart) sheet.append(h("div", { class: "sx-marker", style: at(here), "aria-hidden": "true" }, icon(cls.icon, "", "")));

  const scroller = h("div", { class: "sx-map__scroll", tabindex: "-1" }, sheet);
  const mech = zone && zone.zoneMechanic;
  const choice = mech && mech.choices ? mech.choices.find((c) => c.id === run.spire.mech) : null;
  const abandon = btn("Abandon run", () => { if (confirm("Abandon this run?")) { run.screen = "end"; run.result = "defeat"; run.pending = { type: "end", cause: "abandoned" }; app.save(); app.route(); } }, { size: "sm", cls: "sx-map__abandon" });
  const side = dark("sx-map__side",
    h("p", { class: "sx-eyebrow" }, `Act ${Math.max(1, run.act)} of 6`),
    h("h2", {}, zone ? zone.name : "The Spire"),
    h("h3", {}, (zone && zone.spire && zone.spire.name) || "The Spire"),
    h("div", { class: "sx-map__prog", role: "img", "aria-label": `Floor ${Math.max(0, run.floor + 1)} of ${FL}` }, h("span", {}, `Floor ${Math.max(0, run.floor + 1)} / ${FL}`), h("i", { style: `--p:${Math.round(((run.floor + 1) / FL) * 100)}%` })),
    zone && zone.spire && zone.spire.lore ? h("p", { class: "sx-map__lore" }, zone.spire.lore) : null,
    mech ? h("div", { class: "sx-map__mech" }, ico(mech.icon, { size: "sm" }), h("p", {}, h("b", {}, (choice || mech).name || mech.name), " ", (choice || mech).text)) : null,
    abandon);
  const lg = (ic, ring, l) => h("div", { class: "sx-map__lg" }, ico(ic, { size: "xs", ring }), h("span", {}, l));
  const legend = dark("sx-map__legend", h("h4", {}, "The road"),
    lg(st.icon, "gold", "Inn"), ...["fight", "elite", "event", "vendor", "rest", "treasure"].map((k) => lg(NODE_ICON[k][0], NODE_ICON[k][2], NODE_ICON[k][1])), lg(boss.ic, "red", "Boss"));

  const el = h("section", { class: "sx-screen sx-map" }, runBar(app), h("div", { class: "sx-map__main" }, side, scroller, legend));

  // keyboard: 1 / 2 / 3 take the reachable lanes left to right
  if (window.__sxMapKey) document.removeEventListener("keydown", window.__sxMapKey);
  window.__sxMapKey = (e) => {
    if (!el.isConnected) { document.removeEventListener("keydown", window.__sxMapKey); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-3]$/.test(e.key)) return;
    const n = order[Number(e.key) - 1];
    if (n) { e.preventDefault(); enterNode(run, data, n.col); app.save(); app.route(); }
  };
  document.addEventListener("keydown", window.__sxMapKey);

  // draw after layout, scroll to where we stand (smooth, instant when motion is reduced)
  if (land) { const off = stage.onResize(() => { if (!el.isConnected) return off(); redraw(); }); requestAnimationFrame(() => requestAnimationFrame(redraw)); }
  requestAnimationFrame(() => {
    redraw();
    if (land) return; // landscape: nothing scrolls
    const max = Math.max(0, pos(here)[1] - scroller.clientHeight * 0.58);
    if (app.reduced()) scroller.scrollTop = max;
    else { scroller.scrollTop = Math.min(H, max + 520); setTimeout(() => scroller.scrollTo({ top: max, behavior: "smooth" }), 120); }
  });
  return el;
}
