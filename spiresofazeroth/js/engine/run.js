// Run state machine. The UI and the headless sim both drive the run through these functions, so routing lives in ONE place.
// run.screen: map | combat | reward | vendor | rest | event | treasure | hub | healer | zonepick | raidchoice | bosschoice | end
// Every random decision uses streamFor(seed, tag) with a node-specific tag, so a saved run resumes identically.
import { enterHealer } from "./healer.js";
import { streamFor } from "./rng.js";
import { generateSpire, nextNodes, nodeAt } from "./map.js";
import { startCombat, finishCombat } from "./combat.js";
import { runEffects } from "./effects.js";
import { fireRun } from "./relics.js";
import { heroicMods } from "./heroic.js";
import { canUpgrade } from "./deck.js";
import * as R from "./rewards.js";
import * as G from "./gear.js";

export const RUN_VERSION = 1;
export const TOTAL_ACTS = 6;
export const HUB_AFTER_ACTS = [3, 5];

export const rngFor = (run, tag) => streamFor(run.seed, tag);
const runCtx = (run, data, rng) => ({ C: null, run, rng, data, src: null, srcKind: "event" });

export function newRun(data, { classId, continent, seed, heroic = 0, pet = null, talents = null }) {
  const cls = data.classObj(classId);
  const mods = heroicMods(heroic);
  const T = talents && typeof talents === "object" ? talents : null; // account talents (engine/talents.js talentMods): hp + gold here, the rest in startCombat / rewards
  const maxHp = Math.max(1, Math.round((cls.startingHp || 70) * mods.startHpPenalty) + ((T && T.hp) | 0));
  const run = {
    v: RUN_VERSION, seed: String(seed), classId, continent: continent || cls.defaultContinent || "ek", heroic, pet,
    act: 0, zoneId: null, zonesVisited: [], map: null, floor: -1, col: -1, hp: maxHp, maxHp, gold: (cls.startingGold || 99) + ((T && T.gold) | 0), talents: T,
    deck: (cls.starterDeck || []).map((id) => ({ id, up: false })), relics: [], gear: G.emptyGear(), potions: [], carry: {}, disease: 0,
    potionMiss: 0, removals: 0, seenEvents: [], seen: { cards: {}, enemies: {}, relics: {} }, spire: {},
    screen: "zonepick", pending: null, result: null,
    stats: { floors: 0, fights: 0, elites: 0, bosses: 0, kills: 0, damageTaken: 0, turns: 0, goldEarned: 0 },
    startedAt: 0,
  };
  return G.equipStarter(run, data);
}

// codex keys: enemies are namespaced by zone (the same id appears in several zones with different stats)
const markSeen = (run, kind, id) => { if (id) run.seen[kind][kind === "enemies" ? `${run.zoneId}:${id}` : id] = 1; };
export const currentZone = (run, data) => data.zone(run.zoneId);
export const nodeOfRun = (run) => (run.map && run.floor >= 0 ? nodeAt(run.map, run.floor, run.col) : null);

// ---- spire start ---------------------------------------------------------------------
export async function startSpire(run, data, zoneId) {
  const zone = await data.loadZone(zoneId);
  if (!zone) return false;
  run.act += 1;
  run.zoneId = zoneId;
  run.zonesVisited.push(zoneId);
  run.floor = -1;
  run.col = -1;
  run.spire = { marks: [], path: [] };
  const mods = heroicMods(run.heroic);
  run.map = generateSpire(run.seed, `${run.act}:${zoneId}`, { eliteBonus: mods.eliteBonus, profile: data.mapProfile ? data.mapProfile(zoneId) : null });
  const rng = rngFor(run, `spire:${run.act}`);
  const hooks = zone.zoneMechanic && zone.zoneMechanic.hooks && zone.zoneMechanic.hooks.on_spire_start;
  if (hooks) {
    const ctx = runCtx(run, data, rng);
    run.spire.pendingApplies = [];
    runEffects(ctx, hooks);
    const elites = run.map.floors.flat().filter((n) => n.type === "elite");
    for (const a of run.spire.pendingApplies) {
      if (elites.length) run.spire.marks.push({ ...a, nodeId: rng.pick(elites).id });
    }
    delete run.spire.pendingApplies;
  }
  data.setClass(run.classId);
  run.screen = "map";
  run.pending = null;
  const zm = zone.zoneMechanic;
  if (run.spire.pendingChoice && zm && zm.choices && zm.choices.length) {
    delete run.spire.pendingChoice;
    run.pending = { type: "mechchoice", options: zm.choices.map((c) => c.id) };
    run.screen = "mechchoice";
  }
  return true;
}

// Zone mechanics with `choices` (Un'Goro pylons): the chosen entry's hooks replace the zone hooks for this spire.
export function chooseMechanic(run, data, id) {
  const zm = data.zone(run.zoneId).zoneMechanic;
  if (!zm || !(zm.choices || []).some((c) => c.id === id)) return false;
  run.spire.mech = id;
  run.pending = null;
  run.screen = "map";
  return true;
}

export function reachableNodes(run) {
  if (!run.map) return [];
  return nextNodes(run.map, run.floor, run.col);
}

// ---- encounters -------------------------------------------------------------------------
function enemyDefsFor(run, data, zone) {
  return Object.assign({}, zone ? zone.enemyDefs : {}, data.finalBossDefs());
}

function pickEncounter(run, data, zone, tier, rng) {
  const lists = (zone.encounters && zone.encounters[tier]) || [];
  let list = lists.filter((enc) => enc.every((id) => zone.enemyDefs[id]));
  if (!list.length) {
    const ids = Object.values(zone.enemyDefs).filter((e) => e.tier === tier || (tier === "boss" && e.tier === "boss")).map((e) => e.id);
    list = ids.length ? ids.map((i) => [i]) : Object.values(zone.enemyDefs).slice(0, 2).map((e) => [e.id]);
  }
  const P = data.mapProfile ? data.mapProfile(run.zoneId) : null; // act-length profile: short / medium spires reshape the enemy curve
  if (tier === "normal") {
    if (P && P.tierCurve) {
      // encounter lists run weakest -> strongest; the reachable slice widens from tierCurve[0] (first floor) to tierCurve[1] (last fight floor)
      const prog = Math.min(1, run.floor / Math.max(1, P.floors - 3));
      const lim = Math.max(1, Math.ceil(list.length * Math.min(1, P.tierCurve[0] + (P.tierCurve[1] - P.tierCurve[0]) * prog)));
      list = list.slice(0, lim);
    } else {
      const lim = Math.max(1, Math.ceil(list.length * Math.min(1, (run.floor + 4) / 12)));
      list = list.slice(0, lim);
    }
    if (P && P.encCount) {
      const [lo, hi] = run.floor <= P.encCount.earlyUntil ? P.encCount.early : P.encCount.late;
      const fit = list.filter((enc) => enc.length >= lo && enc.length <= hi);
      list = (fit.length ? fit : list).map((enc) => (enc.length > hi ? enc.slice(0, hi) : enc));
    }
  } else if (tier === "elite" && P && P.eliteTier) {
    list = list.slice(0, Math.max(1, Math.ceil(list.length * P.eliteTier))); // short spires meet the milder elites
  }
  const enc = rng.pick(list);
  const extra = (P && P.extra && P.extra[tier]) || 0; // escorts from the zone's own weaker normal packs (profile.extra = { elite: n, boss: n })
  if (extra && enc.length < 4) {
    const pool = [...new Set(((zone.encounters && zone.encounters.normal) || []).slice(0, 8).flat())].filter((id) => zone.enemyDefs[id] && zone.enemyDefs[id].tier === "normal" && !enc.includes(id));
    const add = [];
    for (let i = 0; i < extra && pool.length && enc.length + add.length < 4; i++) add.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    return enc.concat(add);
  }
  return enc;
}

export function enterNode(run, data, col) {
  const node = nextNodes(run.map, run.floor, run.col).find((n) => n.col === col);
  if (!node) return null;
  run.floor = node.floor;
  run.col = node.col;
  (run.spire.path || (run.spire.path = [])).push(node.id);
  run.stats.floors++;
  const zone = data.zone(run.zoneId);
  const rng = rngFor(run, `node:${run.act}:${node.floor}:${node.col}`);
  fireRun(run, data, rng, "on_floor");
  switch (node.type) {
    case "fight":
    case "elite":
    case "boss": {
      const tier = node.type === "fight" ? "normal" : node.type;
      const fb = zone.finalBoss && data.finalBosses.find((b) => b.id === zone.finalBoss);
      if (tier === "boss" && fb) { run.pending = { type: "bosschoice", options: [fb.id] }; run.screen = "bosschoice"; break; }
      if (tier === "boss" && run.act >= TOTAL_ACTS && data.finalBosses.length) {
        run.pending = { type: "bosschoice", options: data.finalBosses.map((b) => b.id) };
        run.screen = "bosschoice";
        break;
      }
      const enc = pickEncounter(run, data, zone, tier, rng);
      const marks = (run.spire.marks || []).filter((m) => m.nodeId === node.id);
      run.pending = { type: "combat", tier, encounter: enc, nodeId: node.id, marks };
      run.screen = "combat";
      for (const id of enc) markSeen(run, "enemies", id);
      break;
    }
    case "rest": run.pending = { type: "rest", used: {} }; run.screen = "rest"; break;
    case "vendor": run.pending = { type: "vendor", shop: R.buildShop(run, data, rng) }; run.screen = "vendor"; fireRun(run, data, rng, "on_shop"); break;
    case "treasure": {
      const gear = G.dropGear(run, data); // gear: the chest holds a piece (auto-equipped, shown by the loot screen); a maxed set falls back to a relic roll
      if (gear) { run.stats.gearDrops = (run.stats.gearDrops || 0) + 1; markSeen(run, "relics", gear.id.replace(/\+$/, "")); }
      const relic = gear ? null : R.rollRelics(run, data, rng, 1)[0] || null;
      const gold = Math.round(rng.int(25, 45) * ((data.mapProfile && (data.mapProfile(run.zoneId) || {}).goldMult) || 1));
      run.gold += gold;
      run.pending = { type: "treasure", relic, gear, chest: "fight", gold, taken: false };
      run.screen = "treasure";
      break;
    }
    case "event": {
      const flags = run.flags || {};
      const eligible = (e) => !(e.chainStep > 1 && !flags[`chain:${e.chainId}:${e.chainStep - 1}`]) && !(e.requires && e.requires.flag && !flags[e.requires.flag]);
      const pool = (zone.events || []).concat(data.eventsCommon).filter((e) => !run.seenEvents.includes(e.id) && eligible(e));
      const list = pool.length ? pool : (zone.events || []).concat(data.eventsCommon);
      const ev = list.length ? rng.pick(list) : null;
      if (!ev) { run.pending = null; run.screen = "map"; break; }
      run.seenEvents.push(ev.id);
      run.pending = { type: "event", eventId: ev.id, source: (zone.events || []).includes(ev) ? "zone" : "common", result: null };
      run.screen = "event";
      break;
    }
    default: run.screen = "map";
  }
  return node;
}

export function chooseFinalBoss(run, data, bossId, o = {}) {
  const b = data.finalBosses.find((x) => x.id === bossId);
  if (!b) return false;
  const enc = Array.isArray(b.encounter) ? b.encounter : [b.id];
  run.pending = { type: "combat", tier: "boss", encounter: enc, nodeId: o.raid ? "raid" : nodeOfRun(run).id, marks: [], final: true, raid: !!o.raid };
  run.screen = "combat";
  for (const id of enc) markSeen(run, "enemies", id);
  return true;
}

// ---- combat bridge --------------------------------------------------------------------------
export function beginCombat(run, data, { interactive = false } = {}) {
  data.setClass(run.classId);
  const zone = data.zone(run.zoneId);
  const pd = run.pending;
  const rng = rngFor(run, `combat:${run.act}:${run.floor}:${run.col}`);
  return startCombat({
    data, run, zone, tier: pd.tier, encounter: pd.encounter, rng, interactive, nodeApplies: pd.marks && pd.marks.length ? pd.marks : null,
    enemyDefs: enemyDefsFor(run, data, zone),
    zoneMods: (data.mapProfile && (data.mapProfile(run.zoneId) || {}).combatMods) || null,
  });
}

export function afterCombat(run, data, C) {
  const sum = finishCombat(C);
  run.stats.fights++;
  run.stats.kills += C.stats.kills;
  run.stats.damageTaken += C.stats.damageTaken;
  run.stats.turns += C.stats.turns;
  run.stats.zeroEnergyTurns = (run.stats.zeroEnergyTurns || 0) + (C.stats.zeroEnergyTurns || 0);
  const tier = run.pending.tier;
  if (tier === "elite") run.stats.elites++;
  if (tier === "boss") run.stats.bosses++;
  if (C.result !== "win") {
    run.screen = "end";
    run.result = "defeat";
    run.pending = { type: "end", cause: (C.enemies.find((e) => !e.dead) || {}).name || "unknown" };
    return sum;
  }
  const rng = rngFor(run, `reward:${run.act}:${run.floor}:${run.col}`);
  const rtier = run.pending.raid ? "raid" : tier;
  const gold = Math.round((R.rollGold(run, rng, rtier) * ((data.mapProfile && (data.mapProfile(run.zoneId) || {}).goldMult) || 1) + (run.pending.raid ? 60 : 0)) * (1 + (((run.talents || {}).goldpct | 0) / 100)));
  run.gold += gold;
  run.stats.goldEarned += gold;
  const cards = R.rollCardChoices(run, data, rng, { tier: rtier, count: 3 + ((run.talents || {}).choice | 0) });
  const potion = R.potionDrops(run, rng, tier) ? R.rollPotion(run, data, rng) : null;
  // gear: EVERY win drops a piece (auto-equipped); elite adds a choice of 2 jewellery pieces, boss a choice of 3 (rare+)
  const gRate = tier === "normal" && data.mapProfile ? (data.mapProfile(run.zoneId) || {}).normalGearRate : null; // short spires: fewer fights, so a normal win drops a piece with this chance
  const gear = gRate != null && gRate < 1 && rng.next() >= gRate ? null : G.dropGear(run, data);
  if (gear) { run.stats.gearDrops = (run.stats.gearDrops || 0) + 1; markSeen(run, "relics", gear.id.replace(/\+$/, "")); }
  let relics = [];
  if (tier === "elite") relics = R.rollRelics(run, data, rng, 2);
  else if (rtier === "boss" || rtier === "raid") relics = R.rollRelics(run, data, rng, 3, { minRarity: "rare" });
  const choose = tier === "elite" || rtier === "boss" || rtier === "raid";
  for (const id of cards) markSeen(run, "cards", id);
  run.pending = { type: "reward", tier: rtier, gold, cards, potion, relics, relicChoose: choose, gear, chest: rtier === "boss" || rtier === "raid" ? "boss" : tier === "elite" ? "elite" : "fight", taken: { card: false, potion: false, relic: false }, nodeTier: tier, raid: !!run.pending.raid };
  run.screen = "reward";
  return sum;
}

// ---- reward actions -----------------------------------------------------------------------------
export function takeCard(run, id, up = false) {
  run.deck.push({ id, up });
  if (run.pending && run.pending.taken) run.pending.taken.card = true;
}
export function takePotion(run, data, id) {
  const slots = heroicMods(run.heroic).potionSlots;
  if (run.potions.length >= slots) return false;
  run.potions.push(id);
  if (run.pending && run.pending.taken) run.pending.taken.potion = true;
  return true;
}
export function takeRelic(run, data, id) {
  if (run.relics.includes(id)) return false;
  const twin = data.gear && data.gear.legacy && data.gear.legacy[id];
  if (twin && twin !== id && (run.relics.includes(twin) || run.relics.includes(`${twin}+`))) return false; // already worn under its gear name
  const r = data.relic(id);
  const eq = r && r.slot ? G.equip(run, data, id) : null; // gear: jewellery/trinkets take a socket (swapping the weakest when full)
  if (!eq) run.relics.push(id);
  if (run.pending) run.pending.equipped = eq;
  markSeen(run, "relics", id);
  const effs = r && r.triggers && r.triggers.on_pickup;
  if (effs) runEffects(runCtx(run, data, rngFor(run, `pickup:${id}:${run.relics.length}`)), effs);
  if (run.pending && run.pending.taken) run.pending.taken.relic = true;
  if (run.pending && run.pending.type === "treasure") run.pending.taken = true;
  return true;
}

export async function leaveNode(run, data) {
  if (run.screen === "event" && takeFollowUp(run)) return run.screen;
  const node = nodeOfRun(run);
  const pd = run.pending;
  run.pending = null;
  if (pd && pd.raid) return proceedAfterSpire(run, data);
  if (node && node.type === "boss") return endOfSpire(run, data);
  run.screen = "map";
  return run.screen;
}

// Leave whatever screen the run is on (reward, vendor, rest, event, treasure, hub) and route onward.
export async function leaveScreen(run, data) {
  if (run.screen === "hub") return prepareZonePick(run, data);
  return leaveNode(run, data);
}

async function endOfSpire(run, data) {
  const zone = data.zone(run.zoneId);
  if (run.act < TOTAL_ACTS && zone && zone.raidFloors && zone.raidFloors.length) {
    run.pending = { type: "raidchoice", floors: zone.raidFloors.map((f) => f.id) };
    run.screen = "raidchoice";
    return run.screen;
  }
  return proceedAfterSpire(run, data);
}

export function enterRaidFloor(run, data, floorId) {
  const zone = data.zone(run.zoneId);
  const fl = zone.raidFloors.find((f) => f.id === floorId);
  if (!fl) return false;
  const rng = rngFor(run, `raid:${run.act}:${floorId}`);
  const enc = fl.encounters || {};
  if (typeof enc.finalBoss === "string" && data.finalBosses.some((b) => b.id === enc.finalBoss)) return chooseFinalBoss(run, data, enc.finalBoss, { raid: true });
  const list = (enc.boss && enc.boss.length ? enc.boss : enc.elite && enc.elite.length ? enc.elite : enc.normal) || [];
  const pick = rng.pick(list.filter((e) => e.every((id) => zone.enemyDefs[id])));
  if (!pick) return false;
  run.pending = { type: "combat", tier: "boss", encounter: pick, nodeId: "raid", marks: [], raid: true };
  run.screen = "combat";
  for (const id of pick) markSeen(run, "enemies", id);
  return true;
}

export async function proceedAfterSpire(run, data) {
  run.pending = null;
  if (run.act >= TOTAL_ACTS) {
    run.screen = "end";
    run.result = "victory";
    run.pending = { type: "end" };
    return run.screen;
  }
  if (enterHealer(run, data)) return run.screen; // act cleared: the healer scene heals to full once, its Continue calls proceedAfterSpire again (engine/healer.js)
  const hub = data.zoneIndex.find((z) => z.isHub);
  if (HUB_AFTER_ACTS.includes(run.act) && hub && (await data.loadZone(hub.id))) {
    run.pending = { type: "rest", hub: true, hubZone: hub.id, used: {} };
    run.hp = Math.min(run.maxHp, run.hp + Math.ceil((run.maxHp - run.hp) * 0.3)); // Sanctuary: entering restores 30% of missing HP
    run.screen = "hub";
    return run.screen;
  }
  return prepareZonePick(run, data);
}

export async function prepareZonePick(run, data) {
  const nextAct = run.act + 1;
  const rng = rngFor(run, `zonepick:${nextAct}`);
  const fresh = data.zoneIndex.filter((z) => !z.isHub && !run.zonesVisited.includes(z.id));
  const inAct = fresh.filter((z) => z.act === nextAct);
  const same = inAct.filter((z) => z.continent === run.continent);
  const other = inAct.filter((z) => z.continent !== run.continent);
  const shufSame = rng.shuffle(same.slice()).map((z) => z.id);
  const shufOther = rng.shuffle(other.slice()).map((z) => z.id);
  let opts = [];
  if (nextAct >= 3) {
    opts = shufSame.slice(0, 2).concat(shufOther.slice(0, 1));
    for (const id of shufSame.slice(2).concat(shufOther.slice(1))) if (opts.length < 3 && !opts.includes(id)) opts.push(id);
  } else {
    opts = shufSame.slice(0, 3);
    for (const id of shufOther) if (opts.length < 2) opts.push(id);
  }
  if (!opts.length) {
    // data not landed for that bracket: fall back to the nearest available acts
    for (const d of [0, 1, -1, 2, -2]) {
      const list = fresh.filter((z) => z.act === nextAct + d);
      if (list.length) { opts = rng.shuffle(list.slice()).slice(0, 3).map((z) => z.id); break; }
    }
  }
  if (!opts.length) {
    run.screen = "end";
    run.result = "victory";
    run.pending = { type: "end", note: "no further zones available" };
    return run.screen;
  }
  await Promise.all(opts.map((id) => data.loadZone(id)));
  run.pending = { type: "zonepick", options: opts };
  run.screen = "zonepick";
  return run.screen;
}

export async function chooseZone(run, data, zoneId) {
  const ok = await startSpire(run, data, zoneId);
  return ok;
}

// ---- rest / hub -------------------------------------------------------------------------------------
export function restHeal(run, data) {
  const mods = heroicMods(run.heroic);
  const amt = Math.floor(run.maxHp * 0.3 * mods.healMult * (1 + (((run.talents || {}).heal | 0) / 100)));
  run.hp = Math.min(run.maxHp, run.hp + amt);
  fireRun(run, data, rngFor(run, `rest:${run.floor}`), "on_rest");
  if (run.pending) run.pending.used.heal = true;
  return amt;
}
export function upgradeableCards(run, data) {
  data.setClass(run.classId);
  return run.deck.map((c, i) => ({ c, i })).filter(({ c }) => !c.up && canUpgrade(data, c.id, run.classId));
}
export function upgradeCard(run, idx) {
  const c = run.deck[idx];
  if (!c || c.up) return false;
  c.up = true;
  if (run.pending) run.pending.used.upgrade = true;
  return true;
}
export function restZoneAction(run, data) {
  const zone = data.zone(run.pending && run.pending.hub ? run.pending.hubZone : run.zoneId);
  if (!zone || !zone.rest) return false;
  runEffects(runCtx(run, data, rngFor(run, `restzone:${run.floor}`)), zone.rest.effects || []);
  if (run.pending) run.pending.used.zone = true;
  return true;
}
// Moonglade extras: class trainer (paid upgrade) and the Nighthaven vendor.
export function trainerUpgrade(run, data, idx) {
  const hub = data.zone(run.pending.hubZone);
  const cost = (hub && hub.trainer && hub.trainer.upgradeCost) || 75;
  if (run.gold < cost || run.pending.used.trainer || !upgradeCard(run, idx)) return false;
  run.gold -= cost;
  run.pending.used.trainer = true;
  return true;
}
export function openHubShop(run, data) {
  if (!run.pending.shop) run.pending.shop = R.buildShop(run, data, rngFor(run, `hubshop:${run.act}`));
  return run.pending.shop;
}
export function removeDeckCard(run, idx) {
  if (idx < 0 || idx >= run.deck.length) return false;
  run.deck.splice(idx, 1);
  return true;
}

// ---- vendor ----------------------------------------------------------------------------------------
export function buy(run, data, kind, idx) {
  const shop = run.pending.shop;
  const key = `${kind}${idx}`;
  if (shop.sold[key]) return false;
  const item = shop[kind === "card" ? "cards" : kind === "relic" ? "relics" : "potions"][idx];
  if (!item || run.gold < item.price) return false;
  if (kind === "potion" && run.potions.length >= heroicMods(run.heroic).potionSlots) return false;
  run.gold -= item.price;
  shop.sold[key] = true;
  if (kind === "card") { run.deck.push({ id: item.id, up: false }); markSeen(run, "cards", item.id); }
  else if (kind === "relic") takeRelic(run, data, item.id);
  else run.potions.push(item.id);
  return true;
}
export function buyRemoval(run, idx) {
  const shop = run.pending.shop;
  if (shop.removed || run.gold < shop.removePrice) return false;
  if (!removeDeckCard(run, idx)) return false;
  run.gold -= shop.removePrice;
  run.removals = (run.removals || 0) + 1;
  shop.removed = true;
  return true;
}

// ---- events ----------------------------------------------------------------------------------------------
export function eventDef(run, data) {
  const pd = run.pending;
  if (!pd || pd.type !== "event") return null;
  const zone = data.zone(run.zoneId);
  return (zone.events || []).concat(data.eventsCommon).find((e) => e.id === pd.eventId) || null;
}
export function optionAvailable(run, opt) {
  const q = opt.requires;
  if (!q) return true;
  if (q.gold !== undefined && run.gold < q.gold) return false;
  if (q.hp !== undefined && run.hp <= q.hp) return false;
  if (q.relic && !run.relics.includes(q.relic)) return false;
  if (q.class && q.class !== run.classId) return false;
  if (q.flag && !(run.flags || {})[q.flag]) return false;
  if (q.potion && run.potions.length === 0) return false;
  return true;
}
export function chooseEventOption(run, data, idx) {
  const ev = eventDef(run, data);
  const opt = ev && ev.options[idx];
  if (!opt || !optionAvailable(run, opt)) return false;
  const rng = rngFor(run, `event:${run.floor}:${run.col}:${idx}`);
  run.retreat = false;
  runEffects(runCtx(run, data, rng), opt.effects || []);
  run.pending.result = { label: opt.label };
  if (ev.chainId) (run.flags || (run.flags = {}))[`chain:${ev.chainId}:${ev.chainStep || 1}`] = true;
  if (run.openShop) {
    run.openShop = false;
    run.pending.followUp = { type: "vendor", shop: R.buildShop(run, data, rng) };
  } else if (run.startCombat) {
    const sc = run.startCombat;
    run.startCombat = null;
    const zone = data.zone(run.zoneId);
    const byName = Object.values(zone.enemyDefs);
    const ids = String(sc.encounter || "").split("|").map((n) => (byName.find((x) => x.id === n || x.name === n) || {}).id).filter(Boolean);
    if (ids.length) run.pending.followUp = { type: "combat", tier: sc.tier, encounter: ids, nodeId: "event", marks: [], eventFight: true };
  }
  return true;
}
// Event follow-ups (open_shop / start_combat) become the next screen when the player leaves the event.
export function takeFollowUp(run) {
  const f = run.pending && run.pending.followUp;
  if (!f) return false;
  run.pending = f;
  run.screen = f.type;
  if (f.type === "combat") for (const id of f.encounter) markSeen(run, "enemies", id);
  return true;
}
export function hasHearthstone(run) { return run.deck.some((c) => c.id === "hearthstone"); }
export function useHearthstone(run) {
  const i = run.deck.findIndex((c) => c.id === "hearthstone");
  if (i < 0) return false;
  run.pending.result = { label: "You retreat with your Hearthstone." };
  return true;
}

export function summarize(run, data) {
  const zones = run.zonesVisited.map((id) => (data.zone(id) || {}).name || id);
  return { victory: run.result === "victory", act: run.act, floor: run.floor, seed: run.seed, classId: run.classId, zones, stats: run.stats, heroic: run.heroic, deck: run.deck.length, relics: run.relics.length };
}
