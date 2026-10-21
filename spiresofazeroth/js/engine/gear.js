// Gear (GEAR_SPEC): relics ARE gear. A piece is a relic object (same triggers/DSL) plus slot/set/item/icon/displayId/tier, so the relic bus
// (relics.js fire/fireRun) runs it untouched. run.relics stays the array of owned ids; run.gear mirrors slot -> id. Set bonuses are
// synthetic relics `set:<setId>:<n>` kept in run.relics while enough pieces are worn. DOM-free (the sim imports this).
//   loadClassGear(d, classId, get)   data.js hook: registers a class's set pieces, weapon, `+` upgrades and set-bonus relics
//   ensureGear(run, data)            run.gear exists + legacy relic ids mapped (call when a saved run resumes)
//   equip(run, data, id)             -> { key, replaced } puts a piece on, swapping whatever held the slot
//   dropGear(run, data)              -> { id, key, slot, upgrade, replaced, setBefore, setAfter, bonuses } | null  (the post-combat drop)
//   setInfo(run, data)               -> { set, count, bonuses:[{pieces,name,text,active}], next }
export const PAPERDOLL = ["head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger1", "finger2", "trinket1", "trinket2", "mainHand", "offHand"];
export const SLOT_LABEL = { head: "Head", neck: "Neck", shoulder: "Shoulders", back: "Back", chest: "Chest", wrist: "Wrists", hands: "Hands", waist: "Waist", legs: "Legs", feet: "Feet",
  finger: "Finger", finger1: "Finger", finger2: "Finger", trinket: "Trinket", trinket1: "Trinket", trinket2: "Trinket", mainHand: "Main Hand", offHand: "Off Hand" };
export const DROP_ORDER = ["mainHand", "chest", "legs", "head", "shoulder", "hands", "feet", "waist", "wrist"];
const GROUPS = { finger: ["finger1", "finger2"], trinket: ["trinket1", "trinket2"] };
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
export const emptyGear = () => Object.fromEntries(PAPERDOLL.map((k) => [k, null]));
export const keysFor = (slot) => GROUPS[slot] || [slot];

// Zone relics carry no slot: classify by name/icon. Twin of jslot() in tools/spires/build-gear.py (which slots the global pool) - keep the regexes equal.
const WEAP = /inv_(sword|axe|mace|staff|dagger|hammer|wand|weapon|shield|spear|polearm|knife|fist|gun|bow|crossbow|throwingaxe|thrown)/;
export function slotOf(r) {
  if (r.slot) return r.slot;
  const nm = `${r.id} ${r.name}`.toLowerCase(), ic = String(r.icon || "").toLowerCase();
  if (/\b(cloak|cape|shroud|drape)\b/.test(nm) || ic.includes("inv_misc_cape")) return "back";
  if (/\b(ring|band|seal|signet|loop)\b/.test(nm) || ic.includes("_ring_")) return "finger";
  if (/\b(talisman|pendant|medallion|brooch|crest|necklace|amulet|locket|choker|charm|idol|totem|lens|eye|orb)\b/.test(nm) || /_jewelry_(talisman|necklace|amulet)/.test(ic)) return "neck";
  if (WEAP.test(ic)) return "offHand";
  return "trinket";
}

// ---- upgrades ("+" version: same item, green name, ~1.5x effects) ------------------------------------------------------
const up = (n) => Math.ceil(n * 1.5);
function scaleEffects(effs) {
  return effs.map((e) => {
    const o = { ...e };
    for (const k of ["amount", "stacks", "count"]) if (typeof o[k] === "number") o[k] = up(o[k]);
    if (o.if && o.if.type === "chance") o.if = { ...o.if, pct: Math.min(60, o.if.pct + 5) };
    if (o.then) o.then = scaleEffects(o.then);
    return o;
  });
}
const scaleText = (t) => t.replace(/below (\d+)%/g, "below @$1%").replace(/(\d+)%/g, (_, n) => `${Math.min(60, +n + 5)}%`).replace(/@(\d+)%/g, "$1%").replace(/(?<![\d@])(\d+)(?![\d%])/g, (_, n) => String(up(+n)));
export function makeUpgrade(p) {
  const triggers = {};
  for (const [k, v] of Object.entries(p.triggers || {})) triggers[k] = scaleEffects(v);
  return { ...p, id: `${p.id}+`, base: p.id, upgrade: true, rarity: "uncommon", triggers, text: scaleText(p.text || ""), stats: "Tier 1 upgrade" };
}

// ---- data hook ------------------------------------------------------------------------------------------------------
export async function loadClassGear(d, classId, get) {
  if (!d.gear) d.gear = { sets: new Map(), legacy: {} };
  if (d.gear.sets.has(classId)) return d.gear.sets.get(classId);
  const f = await get(`gear/${classId}.json`);
  if (!f || !f.set) return null;
  const pieces = (f.pieces || []).concat(f.weapon ? [f.weapon] : []);
  for (const p of pieces) { d.relicMap.set(p.id, { ...p, class: classId }); const u = makeUpgrade(p); d.relicMap.set(u.id, { ...u, class: classId }); }
  for (const b of f.set.bonuses || []) {
    d.relicMap.set(`set:${f.set.id}:${b.pieces}`, { id: `set:${f.set.id}:${b.pieces}`, name: b.name, icon: f.set.icon, rarity: "epic", text: b.text, triggers: b.triggers, bonus: true, setId: f.set.id, pieces: b.pieces, class: classId });
  }
  const st = await get("gear/starter.json");   // tier 0 starter outfit (white, text "Starter", no effects): occupies slots until a Tier 1 drop replaces it
  const starter = ((st && st[classId] && st[classId].items) || []).map((p) => ({ ...p, triggers: {}, class: classId }));
  for (const p of starter) d.relicMap.set(p.id, p);
  const info = { set: f.set, pieces: f.pieces || [], weapon: f.weapon || null, starter };
  d.gear.sets.set(classId, info);
  return info;
}
export async function loadLegacyMap(d, get) {
  if (!d.gear) d.gear = { sets: new Map(), legacy: {} };
  const m = await get("gear/legacy-map.json");
  if (m && m.map) d.gear.legacy = m.map;
}
export const classGear = (data, classId) => (data.gear && data.gear.sets.get(classId || data.classId)) || null;

// ---- the worn set -----------------------------------------------------------------------------------------------------
export const isStarter = (id) => typeof id === "string" && id.startsWith("starter-");
// Put the class's starter outfit on a fresh run (newRun). Idempotent per slot.
export function equipStarter(run, data) {
  const g = classGear(data, run.classId);
  for (const p of (g && g.starter) || []) if (!run.gear[p.slot]) { run.gear[p.slot] = p.id; if (!run.relics.includes(p.id)) run.relics.push(p.id); }
  return run;
}

export function setInfo(run, data) {
  const g = classGear(data, run.classId);
  if (!g) return { set: null, count: 0, bonuses: [], next: null };
  let count = 0;
  for (const id of Object.values(run.gear || {})) { const r = id && data.relic(id); if (r && r.set === g.set.id) count++; }
  const bonuses = g.set.bonuses.map((b) => ({ pieces: b.pieces, name: b.name, text: b.text, active: count >= b.pieces }));
  return { set: g.set, count, bonuses, next: bonuses.find((b) => !b.active) || null, size: g.pieces.length };
}
// Keep set-bonus relics in run.relics in step with the worn count. Returns the bonus ids that just switched on.
export function syncSetBonuses(run, data) {
  const { set, count } = setInfo(run, data);
  if (!set) return [];
  const added = [];
  for (const b of set.bonuses) {
    const id = `set:${set.id}:${b.pieces}`, has = run.relics.includes(id);
    if (count >= b.pieces && !has) { run.relics.push(id); added.push(id); }
    else if (count < b.pieces && has) run.relics.splice(run.relics.indexOf(id), 1);
  }
  return added;
}

// ---- equipping ---------------------------------------------------------------------------------------------------------
export function ensureGear(run, data) {
  if (run.gear) return run;
  run.gear = emptyGear();
  const old = run.relics.slice();
  run.relics = [];
  const map = (data.gear && data.gear.legacy) || {};
  for (const id of old) {
    const to = map[id] || id, r = data.relic(to);
    if (r && r.bonus) continue;
    if (r && r.slot) equip(run, data, to); else if (!run.relics.includes(to)) run.relics.push(to);
  }
  syncSetBonuses(run, data);
  return run;
}

function targetKey(run, data, r) {
  const keys = keysFor(slotOf(r));
  const empty = keys.find((k) => !run.gear[k]);
  if (empty) return empty;
  // full: replace the weakest (lowest rarity, earliest); an upgrade replaces its own base
  const base = keys.find((k) => run.gear[k] === r.base);
  if (base) return base;
  return keys.slice().sort((a, b) => (RANK[(data.relic(run.gear[a]) || {}).rarity] || 0) - (RANK[(data.relic(run.gear[b]) || {}).rarity] || 0))[0];
}

export function equip(run, data, id) {
  ensureGear(run, data);
  const r = data.relic(id);
  if (!r) return null;
  const key = targetKey(run, data, r);
  const replaced = run.gear[key] || null;
  if (replaced) { const i = run.relics.indexOf(replaced); if (i >= 0) run.relics.splice(i, 1); }
  run.gear[key] = id;
  if (!run.relics.includes(id)) run.relics.push(id);
  return { key, replaced };
}

export function dropGear(run, data) {
  ensureGear(run, data);
  const g = classGear(data, run.classId);
  if (!g) return null;
  const before = setInfo(run, data).count;
  const piece = (slot) => (slot === "mainHand" ? g.weapon : g.pieces.find((p) => p.slot === slot));
  let id = null, upgrade = false;
  const owned = (x) => run.relics.includes(x) || Object.values(run.gear).includes(x); // never the same item twice (owner report 2026-10-21)
  for (const s of DROP_ORDER) if ((!run.gear[s] || isStarter(run.gear[s])) && piece(s) && !owned(piece(s).id) && !owned(`${piece(s).id}+`)) { id = piece(s).id; break; }
  if (!id) {
    for (const s of DROP_ORDER) { const cur = run.gear[s]; if (cur && !isStarter(cur) && !String(cur).endsWith("+") && piece(s) && !owned(`${cur}+`)) { id = `${cur}+`; upgrade = true; break; } }
  }
  if (!id) { for (const s of DROP_ORDER) { const p = piece(s); if (p && !owned(p.id) && !owned(`${p.id}+`)) { id = p.id; break; } } } // a socket holding something else: the set piece still comes
  if (!id) { run.stats && (run.stats.gearDry = (run.stats.gearDry || 0) + 1); return null; }
  const r = data.relic(id);
  const { key, replaced } = equip(run, data, id);
  const bonuses = syncSetBonuses(run, data);
  return { id, key, slot: r.slot, upgrade, replaced, setBefore: before, setAfter: setInfo(run, data).count, bonuses };
}

// Run-level view for the strips: [{ key, id, r }] in paper-doll order (r null = empty socket)
export const worn = (run, data) => PAPERDOLL.map((key) => { const id = run.gear && run.gear[key]; return { key, id: id || null, r: id ? data.relic(id) : null }; });

// Dressing state for actors3d.setHero({ gearMask }): 0 naked .. 8 full (mainHand, chest, legs, head, shoulder, hands, feet, then waist/wrist as one step).
export function gearLevel(run) {
  const g = (run && run.gear) || {};
  const own = (s) => g[s] && !isStarter(g[s]);   // starter pieces are the base outfit (state 0), not progress
  return ["mainHand", "chest", "legs", "head", "shoulder", "hands", "feet"].filter(own).length + (own("waist") || own("wrist") ? 1 : 0);
}

// What an equip of `id` would push out (null when a socket is free) - for the "replaces" line on reward plates.
export function wouldReplace(run, data, id) {
  const r = data.relic(id);
  if (!r || !r.slot || !run.gear) return null;
  return run.gear[targetKey(run, data, r)] || null;
}
