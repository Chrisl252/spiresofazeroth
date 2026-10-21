// Loot screen (GEAR_SPEC section 2): between the combat result and the reward cards. A Classic treasure chest drops onto the enemy lane, the lid opens,
// a gold fountain + light shaft + sparkles erupt with the coin sound, then the classic WoW LootFrame opens beside the chest: a dark panel with the
// corpse (skull ring) or chest portrait, an "Items" tab, a red X, and a vertical list of rows (coin line first, then the gear piece). Click a row (or
// shift-click / Loot all / X / Enter) to take it: the row slides out with the coin sound; the last row closes the frame and the reward step follows.
// Gear rows show the item tooltip on hover. Also used by the map TREASURE node (pd.type === "treasure": chest portrait, gear + gold are the loot).
//   needsLoot(pd) -> bool          showLoot(app, host, pd, done) -> Promise   (host = the reward screen section; done() runs on continue)
import { h, icon, tip, esc, toast } from "./dom.js";
import { banner, btn } from "./kit.js";
import { gearCss, gearStrip, gearTip } from "./gearStrip.js";
import { gearLevel } from "../engine/gear.js";
import { takeRelic, takePotion } from "../engine/run.js";
import { heroicMods } from "../engine/heroic.js";
import { sfx } from "../audio.js";
import { getKit, clearStage, lanesFor, watchLeave } from "./combatKit.js";

export const needsLoot = (pd) => !!(pd && !pd.lootSeen && (pd.gear || (pd.type === "treasure" && (pd.gold || pd.relic))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One LootFrame row: 64 px icon (quality border, optional quantity badge) + name coloured by quality.
function row({ ic, name, q = "common", qty = 0, cls = "", tipHtml = null }) {
  const el = h("button", { class: `lf-row ${cls}`, type: "button" },
    h("span", { class: `lf-ico q-${q}` }, icon(ic, "", ""), qty > 1 ? h("i", { class: "lf-qty" }, String(qty)) : null),
    h("span", { class: `lf-name q-${q}` }, name));
  if (tipHtml) tip(el, tipHtml);
  return el;
}

// ---- VICTORY LOOT FRAME (inline, no chest): every drop of a combat win as one WoW LootFrame panel -----------------------------------------------
// buildLootFrame(app, pd, { onTake(kind), tag }) -> { el, rows, takeAll(), pending() }
//   rows: coin (already in the purse - the click is the pickup), gear (already equipped), relics (relicChoose = take ONE, the others drop away), potion (-> belt; refuses when full).
//   takeAll() collects everything that can be collected without a decision (never picks between relics); pending() = true while a relic CHOICE is still open.
export function buildLootFrame(app, pd, { onTake = () => {}, tag = "Spoils" } = {}) {
  const { run, data } = app, reduced = app.reduced();
  const rows = [];
  const list = h("div", { class: "lf-list" });
  const add = (el, kind, take, group = null) => {
    const o = { el, kind, take, group, done: false };
    el.addEventListener("click", (e) => { e.stopPropagation(); if (e.shiftKey) takeAll(); else takeRow(o); });
    rows.push(o); list.append(el); return o;
  };
  const drop = (o) => { o.done = true; o.el.classList.add("gone"); o.el.disabled = true; };
  const takeRow = (o) => {
    if (o.done) return false;
    if (o.take && o.take() === false) return false;
    drop(o);
    if (o.group) rows.forEach((x) => { if (x.group === o.group && !x.done) drop(x); }); // choose-one: the rest are left behind
    sfx.play(o.kind === "coin" ? "coinSmall" : "coin", { volume: 0.6 });
    updatePotionStatus();
    onTake(o.kind, o);
    return true;
  };
  const pt = pd.taken || {};
  if (pd.gold) add(row({ ic: "inv_misc_coin_17", name: `${pd.gold} Gold`, cls: "lf-row--coin" }), "coin", null);
  if (pd.gear) { const g = pd.gear, r = data.relic(g.id); if (r) add(row({ ic: r.icon, name: g.upgrade ? `Upgrade: ${r.name}` : r.name, q: r.rarity || "common", tipHtml: (g.upgrade ? `<b style="color:#1eff00">Upgraded</b> - replaces your ${esc(r.name)} with the stronger version.<br>` : "") + gearTip(r, run, data) }), "gear", null); }
  if (pd.relics && pd.relics.length && !pt.relic) {
    const ids = pd.relicChoose ? pd.relics : pd.relics.slice(0, 1);
    for (const id of ids) { const r = data.relic(id); if (r) add(row({ ic: r.icon, name: r.name, q: r.rarity || "common", tipHtml: gearTip(r, run, data), cls: pd.relicChoose ? "lf-row--choose" : "" }), "relic", () => takeRelic(run, data, id), pd.relicChoose ? "relic" : null); }
  }
  if (pd.potion && !pt.potion) {
    const p = data.potion(pd.potion);
    if (p) add(row({ ic: p.icon, name: p.name, q: "uncommon", cls: "lf-row--potion", tipHtml: `<b>${esc(p.name)}</b><br>${esc(p.text)}` }), "potion", () => { if (takePotion(run, data, pd.potion)) return true; toast("Potion belt is full."); return false; });
  }
  const takeAll = async () => {
    for (const o of rows) { if (o.done || o.group) continue; if (takeRow(o) && !reduced) await new Promise((r) => setTimeout(r, 140)); }
  };
  const all = btn("Take all", (e) => { e.stopPropagation(); takeAll(); }, { size: "mini", cls: "lf-all" });
  const foot = h("div", { class: "lf-foot" }, all, h("span", { class: "lf-hint" }, "Click a row to loot it"));
  const portrait = h("div", { class: "lf-portrait" }, icon("inv_misc_bone_humanskull_01", "", "Slain enemy"));
  const el = h("div", { class: `lf lf--inline ${rows.length > 4 ? "lf--tight" : ""} ${reduced ? "lf--still" : ""}`, role: "region", "aria-label": "Loot" }, portrait, h("div", { class: "lf-tab" }, tag), list, foot);
  const updatePotionStatus = () => {
    const potRow = rows.find((r) => r.kind === "potion" && !r.done);
    if (!potRow) return;
    const slots = heroicMods(run.heroic).potionSlots;
    const full = run.potions.length >= slots;
    potRow.el.classList.toggle("lf-row--belt-full", full);
  };
  updatePotionStatus();
  return { el, foot, rows, takeAll, pending: () => rows.some((o) => o.group && !o.done), left: () => rows.filter((o) => !o.done).length, refresh: updatePotionStatus };
}

export async function showLoot(app, host, pd, done) {
  await gearCss;
  const { stage, run, data } = app;
  const g = pd.gear;
  const treasure = pd.type === "treasure";
  const reduced = app.reduced();
  const title = treasure ? "Treasure" : pd.tier === "boss" || pd.tier === "raid" ? "Boss slain" : pd.tier === "elite" ? "Elite slain" : "Victory";
  const shaft = h("div", { class: "lt-shaft", "aria-hidden": "true" });
  const strip = h("div", { class: "lt-strip" });
  const root = h("section", { class: "sx-screen lt", "aria-live": "polite" }, banner(title, treasure ? "The chest creaks open." : "Spoils of the fight"), shaft, strip);
  host.replaceChildren(root);

  let skipped = false, finished = false, closing = false, kit = null, chest = null, frame = null;
  const wait = async (ms) => { const end = performance.now() + app.delay(ms); while (!skipped && performance.now() < end) await sleep(30); };
  const cleanup = () => { try { if (chest) chest.dispose(); } catch (e) { /* noop */ } chest = null; document.removeEventListener("keydown", onKey); };
  const close = async () => {
    if (closing) return; closing = true;
    if (frame) { frame.classList.add("out"); await sleep(reduced ? 0 : 320); }
    cleanup(); pd.lootSeen = true; app.save(); done();
  };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (finished) lootAll(); else skipped = true; } };
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", () => { if (!finished) skipped = true; });
  watchLeave(app, root, cleanup);

  // ---- the LootFrame ----
  const rows = []; // { el, take, done }
  const takeRow = (r) => {
    if (r.done) return; r.done = true;
    if (r.take) r.take();
    r.el.classList.add("gone"); r.el.disabled = true;
    sfx.play("coinSmall", { volume: 0.6 });
    setTimeout(() => { if (rows.every((x) => x.done)) close(); }, reduced ? 0 : 380);
  };
  const lootAll = async () => {
    for (const r of rows) { if (r.done) continue; takeRow(r); if (!reduced) await sleep(150); }
    if (!rows.length) close();
  };
  const lane = lanesFor(stage).enemy(0, 1);
  const W = stage.size.w, H = stage.size.h, FW = stage.portrait ? Math.round(W * 0.88) : 560;
  const cx = stage.portrait ? lane.x : Math.min(lane.x, W - FW - 50 - 230), groundY = lane.y + 10; // landscape: the chest sits left of the frame
  const finalState = () => {
    if (!g && !pd.relic && !pd.gold) { close(); return; }
    const list = h("div", { class: "lf-list" });
    const add = (el, take) => { const o = { el, take, done: false }; el.addEventListener("click", (e) => { e.stopPropagation(); if (e.shiftKey) lootAll(); else takeRow(o); }); rows.push(o); list.append(el); };
    if (pd.gold) add(row({ ic: "inv_misc_coin_17", name: `${pd.gold} Gold`, cls: "lf-row--coin" }), null);
    if (g) { const r = data.relic(g.id); if (r) add(row({ ic: r.icon, name: g.upgrade ? `Upgrade: ${r.name}` : r.name, q: r.rarity || "common", tipHtml: (g.upgrade ? `<b style="color:#1eff00">Upgraded</b> - replaces your ${esc(r.name)} with the stronger version.<br>` : "") + gearTip(r, run, data) }), null); }
    if (treasure && pd.relic && !g) { const r = data.relic(pd.relic); if (r) add(row({ ic: r.icon, name: r.name, q: r.rarity || "common", tipHtml: gearTip(r, run, data) }), () => { takeRelic(run, data, pd.relic); }); }
    const X = h("button", { class: "lf-x", type: "button", "aria-label": "Close and loot all", title: "Close (loots everything)" }, "X");
    X.addEventListener("click", (e) => { e.stopPropagation(); lootAll(); });
    const portrait = h("div", { class: "lf-portrait" }, icon(treasure ? "inv_misc_treasurechest01b" : "inv_misc_bone_humanskull_01", "", treasure ? "Treasure chest" : "Slain enemy"));
    const all = btn("Loot all", (e) => { e.stopPropagation(); lootAll(); }, { size: "mini", cls: "lf-all" });
    frame = h("div", { class: `lf ${stage.portrait ? "lf--portrait" : ""} ${reduced ? "lf--still" : ""}`, role: "dialog", "aria-label": "Loot" },
      portrait, h("div", { class: "lf-tab" }, "Items"), X, list, h("div", { class: "lf-foot" }, all, h("span", { class: "lf-hint" }, "Shift-click loots all")));
    frame.style.width = `${FW}px`;
    frame.style.left = `${stage.portrait ? Math.round((W - FW) / 2) : W - FW - 50}px`;
    frame.style.top = `${stage.portrait ? Math.round(groundY + 70) : 150}px`;
    root.append(frame);
    if (g) strip.replaceChildren(gearStrip(app, { flash: g.key }));
    finished = true;
  };

  try {
    kit = await getKit(app);
    if (kit.actors) { clearStage(kit); kit.actors.setHero({ classId: run.classId, gearMask: gearLevel(run) }); }
  } catch (e) { kit = null; }
  const fx = kit && kit.fx, P = fx && fx.particles;
  const chestSize = { fight: 330, elite: 380, boss: 440 }[pd.chest] || 330;
  try {
    const { mountChest } = await import("../stage/chest3d.js");
    chest = await mountChest(stage.layers.actors, { kind: pd.chest || "fight", x: cx, y: groundY, W, H, size: chestSize * (stage.portrait ? 0.8 : 1), reduced });
  } catch (e) { chest = null; }
  if (!chest) root.append(h("div", { class: "lt-flatchest", style: { left: `${cx}px`, top: `${groundY}px` } }, icon("inv_box_01", "", "Treasure chest")));
  const top = { x: cx, y: groundY - chestSize * 0.5 };
  const wake = () => { if (fx) fx.at(0.001, () => {}); };

  if (reduced || !chest) {
    if (chest) { await chest.drop(); await chest.open(); }
    finalState();
    return;
  }

  // 1. drop + dust
  await Promise.race([chest.drop(), wait(1500)]);
  if (fx && P && !skipped) {
    fx.kick(8);
    P.burst({ x: cx, y: groundY - 6, count: 14, cell: "puff", additive: false, speed: [90, 330], angle: [Math.PI * 1.02, Math.PI * 1.98], size: [50, 96], sizeEnd: 2.4, life: [0.6, 1.1], drag: 2.4, color: "#bba98a", alpha: 0.55 });
    wake();
  }
  await wait(380);
  // 2. lid opens (creak), then the explosion
  if (!skipped) { sfx.play("chest"); chest.shakeLid(); }
  await Promise.race([chest.open(), wait(1300)]);
  if (!skipped) {
    sfx.play("coin", { volume: 0.85 });
    shaft.style.cssText = `left:${top.x}px;top:${top.y}px`;
    shaft.classList.add("on");
    if (fx && P) {
      fx.kick(10); fx.flash && fx.flash(top, { alpha: 0.5 });
      P.fountain({ x: top.x, y: top.y, dur: 0.95, rate: 130, cone: 1.1, width: 90, speed: [700, 1250], gravity: 1500, drag: 0.35, cell: "dot", color: "#ffc933", size: [26, 48], sizeEnd: 0.8, life: [1.1, 1.7], alpha: 1 });
      P.fountain({ x: top.x, y: top.y, dur: 0.8, rate: 80, cone: 1.4, width: 70, speed: [450, 1000], gravity: 700, drag: 1.1, cell: "star", color: "#fff1b0", size: [30, 64], sizeEnd: 0.1, life: [0.7, 1.4], alpha: 0.95 });
      P.ring({ x: top.x, y: top.y, count: 28, radius: 24, speed: [500, 700], cell: "streak", align: true, stretch: 0.004, size: [12, 20], life: [0.3, 0.55], color: "#ffe58a", drag: 3 });
      P.drift({ x: top.x, y: top.y - 80, w: 260, h: 200, count: 26, cell: "ember", color: "#ffd34d", rise: 90, size: [8, 16], life: [1.0, 1.8], over: 1.2, gravity: -40 });
      wake();
    }
  }
  await wait(360);
  finalState();
}
