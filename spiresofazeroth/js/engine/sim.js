// Headless greedy auto-player. Zero DOM. Used by tools/spires/sim.mjs and the e2e tests.
// Policy: play the highest value-per-energy card, target the lowest-HP enemy, drink a potion under 40% HP.
import * as Run from "./run.js?v=20261029a";
import { playCard, endTurn, usePotion, livingEnemies, pickDefaultTarget, canPlayWhy } from "./combat.js?v=20261029a";
import { intentInfo } from "./intents.js?v=20261029a";
import { cardCost } from "./deck.js?v=20261029a";
import { isAlive } from "./damage.js?v=20261029a";

const DEBUFF_VALUE = { vulnerable: 3, weak: 2.5, poison: 1.2, bleed: 1, burn: 1, stun: 6, frozen: 5, fear: 4, sleep: 3, slow: 1.5, marked: 2, silence: 1, curse: 1 };
const BUFF_VALUE = { strength: 4, dexterity: 3, thorns: 1.5, regen: 1.5, metallicize: 4, ritual: 5, stealth: 2, shield: 1, armor: 1, intangible: 6, energized: 3 };

function effValue(effs, ctx, depth = 0) {
  let dmg = 0, blk = 0, misc = 0;
  for (const e of effs || []) {
    if (!e) continue;
    const amt = typeof e.amount === "number" ? e.amount : e.amount && typeof e.amount === "object" ? (e.amount.base || 0) + (e.amount.scale ? 4 : 0) : 0;
    const times = typeof e.times === "number" ? e.times : e.times && e.times.base ? e.times.base : 1;
    switch (e.op) {
      case "damage": case "aoe":
        if (e.target === "self") misc -= amt * 0.7;
        else dmg += amt * times * (e.target === "all_enemies" || e.op === "aoe" ? Math.max(1, ctx.n) : 1);
        break;
      case "block": blk += amt; break;
      case "heal": misc += Math.min(amt, ctx.missing) * 0.8; break;
      case "draw": misc += 1.6 * (e.count || 1); break;
      case "gain_energy": misc += 2.2 * amt; break;
      case "energy_next_turn": misc += 1.5 * amt; break;
      case "apply": {
        const st = e.stacks && typeof e.stacks === "number" ? e.stacks : 1;
        if (e.target === "self" || e.target === "pet") misc += (BUFF_VALUE[e.status] || 1) * Math.min(st, 4) * 0.8;
        else misc += (DEBUFF_VALUE[e.status] || 1) * Math.min(st, 5) * (e.target === "all_enemies" ? ctx.n : 1);
        break;
      }
      case "gain_resource": misc += 1; break;
      case "totem": case "summon": misc += 5; break;
      case "pet_action": misc += 3; break;
      case "conditional": { const v = effValue(e.then, ctx, depth + 1); if (e.else && e.if && e.if.resource === "soul_shards") { dmg += v.dmg; blk += v.blk; misc += v.misc; break; } /* shard sinks: a Soul Shard is almost always on hand, so rate them by the shard branch */ dmg += v.dmg * 0.5; blk += v.blk * 0.5; misc += v.misc * 0.5; break; }
      case "repeat": { const v = effValue(e.effects, ctx, depth + 1); const n = e.times || 1; dmg += v.dmg * n; blk += v.blk * n; misc += v.misc * n; break; }
      default: misc += 0.5;
    }
  }
  return { dmg, blk, misc };
}

export function staticScore(def, n = 1) {
  const v = effValue(def.effects, { n, missing: 10 });
  const cost = typeof def.cost === "number" ? def.cost : 1;
  let s = v.dmg + v.blk + v.misc;
  if (def.type === "power") s += 6;
  return s - cost * 1.2 + (def.rarity === "rare" ? 2 : def.rarity === "epic" ? 3 : 0);
}

function cardScore(C, inst, incoming) {
  const d = inst.def;
  const lowest = pickDefaultTarget(C);
  const v = effValue(d.effects, { n: livingEnemies(C).length, missing: C.player.maxHp - C.player.hp });
  const needBlock = incoming > C.player.block;
  let val = v.dmg + v.blk * (needBlock ? 1.1 : 0.25) + v.misc;
  if (lowest && v.dmg >= lowest.hp + lowest.block) val += 25;
  if (d.type === "power") val += 8;
  let cost = cardCost(C, inst);
  if (cost === "X") cost = C.player.energy;
  return val / (cost + 0.4);
}

function incomingDamage(C) {
  let sum = 0;
  for (const e of livingEnemies(C)) {
    const info = intentInfo(C, e);
    if (info) sum += info.dmg;
  }
  return sum;
}

export function autoCombat(C, maxTurns = 45) {
  let guard = 0;
  while (!C.result && guard++ < maxTurns * 30) {
    if (C.turn > maxTurns) { C.result = "lose"; C.phase = "over"; break; }
    // potions
    const p = C.player;
    if (p.hp < p.maxHp * 0.4 && C.potions.length) {
      const i = C.potions.findIndex((id) => { const pot = C.data.potion(id); return pot && JSON.stringify(pot.effects).includes('"heal"'); });
      if (i >= 0) usePotion(C, i);
    } else if (C.turn === 1 && C.tier !== "normal" && C.potions.length) {
      const i = C.potions.findIndex((id) => { const pot = C.data.potion(id); return pot && !JSON.stringify(pot.effects).includes('"heal"') && pot.target !== "enemy"; });
      if (i >= 0) usePotion(C, i);
    }
    const incoming = incomingDamage(C);
    let best = null, bestScore = 0.01;
    for (const inst of C.pile.hand) {
      if (canPlayWhy(C, inst)) continue;
      const s = cardScore(C, inst, incoming);
      if (s > bestScore) { best = inst; bestScore = s; }
    }
    if (!best) { endTurn(C); continue; }
    const t = pickDefaultTarget(C);
    const r = playCard(C, best.uid, t && t.uid);
    if (!r.ok) { endTurn(C); continue; }
    if (r.endTurn) endTurn(C);
  }
  return C.result;
}

// ---- whole-run policy ------------------------------------------------------------------------
function nodeWeight(run, n) {
  const low = run.hp < run.maxHp * 0.5;
  const high = run.hp > run.maxHp * 0.75;
  const w = { fight: 3, event: 2.2, elite: high ? 2.4 : 0.4, rest: low ? 6 : 1.4, vendor: run.gold > 120 ? 2.5 : 0.8, treasure: 5, boss: 10 };
  return w[n.type] || 1;
}

export async function simRun(data, { classId, seed, heroic = 0, continent, maxSteps = 900, firstZone = null, stopAfterAct = 0, talents = null } = {}) {
  await data.loadClass(classId);
  data.setClass(classId);
  const run = Run.newRun(data, { classId, continent, seed, heroic, talents });
  await Run.prepareZonePick(run, data);
  let steps = 0;
  run.actLog = [];
  while (run.screen !== "end" && steps++ < maxSteps) {
    // balance tooling: snapshot the hero at the end of each spire (boss won, before the hub / next zone pick)
    if (run.act >= 1 && ["raidchoice", "healer", "hub", "zonepick"].includes(run.screen) && !run.actLog.some((a) => a.act === run.act)) {
      run.actLog.push({ act: run.act, hp: run.screen === "healer" && run.pending ? run.pending.hpBefore : run.hp, maxHp: run.maxHp, gold: run.gold, worn: Object.values(run.gear || {}).filter(Boolean).length, drops: run.stats.gearDrops || 0, fights: run.stats.fights, floors: run.stats.floors });
      if (stopAfterAct && run.act >= stopAfterAct) break;
    }
    const rng = Run.rngFor(run, "sim:" + steps);
    switch (run.screen) {
      case "zonepick": {
        const same = run.pending.options.filter((id) => (data.zoneEntry(id) || {}).continent === run.continent);
        const first = firstZone && run.act === 0 && run.pending.options.includes(firstZone) ? firstZone : null;
        await Run.chooseZone(run, data, first || (same.length ? same : run.pending.options)[0]);
        break;
      }
      case "map": {
        const opts = Run.reachableNodes(run);
        const n = rng.weighted(opts, (x) => nodeWeight(run, x));
        Run.enterNode(run, data, n.col);
        break;
      }
      case "bosschoice": Run.chooseFinalBoss(run, data, run.pending.options[0]); break;
      case "mechchoice": Run.chooseMechanic(run, data, run.pending.options[0]); break; // zone mechanics with choices (Un'Goro pylons): the UI picks one, so does the sim
      case "combat": {
        const C = Run.beginCombat(run, data);
        autoCombat(C);
        Run.afterCombat(run, data, C);
        break;
      }
      case "reward": {
        const pd = run.pending;
        if (pd.potion) Run.takePotion(run, data, pd.potion);
        if (pd.relics.length) Run.takeRelic(run, data, pd.relics[0]);
        if (pd.cards.length && run.deck.length < 32) {
          const scored = pd.cards.map((id) => ({ id, s: staticScore((data.card(id, run.classId) || { effects: [], cost: 1 }), 2) })).sort((a, b) => b.s - a.s);
          if (scored[0].s > 2) Run.takeCard(run, scored[0].id);
        }
        await Run.leaveNode(run, data);
        break;
      }
      case "vendor": {
        const shop = run.pending.shop;
        shop.relics.forEach((r, i) => { if (run.gold >= r.price) Run.buy(run, data, "relic", i); });
        const order = shop.cards.map((c, i) => ({ i, s: staticScore(data.card(c.id, run.classId) || { effects: [], cost: 1 }, 2), p: c.price })).sort((a, b) => b.s - a.s);
        for (const o of order) if (o.s > 4 && run.gold >= o.p && run.deck.length < 30) Run.buy(run, data, "card", o.i);
        shop.potions.forEach((p, i) => { if (run.potions.length < 2 && run.gold >= p.price + 60) Run.buy(run, data, "potion", i); });
        if (run.gold >= shop.removePrice) {
          const idx = run.deck.findIndex((c) => c.id !== "x" && ["curse", "status"].includes((data.card(c.id, run.classId) || {}).type));
          const basic = run.deck.findIndex((c) => (data.card(c.id, run.classId) || {}).rarity === "basic" && run.deck.length > 12);
          const pick = idx >= 0 ? idx : basic;
          if (pick >= 0) Run.buyRemoval(run, pick);
        }
        await Run.leaveNode(run, data);
        break;
      }
      case "rest":
      case "hub": {
        if (run.hp < run.maxHp * 0.7 || (run.screen === "hub")) Run.restHeal(run, data);
        if (run.screen === "hub" || run.hp >= run.maxHp * 0.7) {
          const ups = Run.upgradeableCards(run, data).map((u) => ({ ...u, s: staticScore(data.card(u.c.id, run.classId), 2) })).sort((a, b) => b.s - a.s);
          if (ups.length && !run.pending.used.upgrade) Run.upgradeCard(run, ups[0].i);
        }
        if (run.screen === "hub" && !run.pending.used.zone) Run.restZoneAction(run, data);
        await Run.leaveScreen(run, data);
        break;
      }
      case "event": {
        const ev = Run.eventDef(run, data);
        const opts = ev.options.map((o, i) => ({ o, i })).filter(({ o }) => Run.optionAvailable(run, o));
        const safe = opts.filter(({ o }) => !JSON.stringify(o.effects).includes('"self"') || run.hp > run.maxHp * 0.6 || JSON.stringify(o.effects).includes('"heal"'));
        const pick = (safe.length ? safe : opts)[0];
        if (pick) Run.chooseEventOption(run, data, pick.i);
        await Run.leaveNode(run, data);
        break;
      }
      case "treasure": {
        if (run.pending.relic) Run.takeRelic(run, data, run.pending.relic);
        await Run.leaveNode(run, data);
        break;
      }
      case "healer": await Run.proceedAfterSpire(run, data); break; // act-transition healer: the full heal already happened in enterHealer
      case "raidchoice": {
        if (run.hp > run.maxHp * 0.7 && Run.enterRaidFloor(run, data, run.pending.floors[0])) break;
        await Run.proceedAfterSpire(run, data);
        break;
      }
      default: run.screen = "end"; run.result = run.result || "defeat";
    }
    if (run.hp <= 0 && run.screen !== "end") { run.screen = "end"; run.result = "defeat"; }
  }
  if (run.screen !== "end") run.result = stopAfterAct && run.actLog.some((a) => a.act >= stopAfterAct) ? "actdone" : "stalled";
  return run;
}

export { isAlive };
