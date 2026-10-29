// Combat loop: start, play card, end turn (player phase -> enemy phase generator -> round end -> next player turn), potions, finish.
import { runEffects, evalCond, resolveTargets } from "./effects.js?v=20261029d";
import { fx, log, isAlive, gainBlock, checkDeaths } from "./damage.js?v=20261029d";
import {
  buildPiles, drawCards, endTurnCleanup, whyUnplayable, cardCost, toDiscard, toExhaust, hasFlag, removeFrom,
} from "./deck.js?v=20261029d";
import { initResources, startOfTurn, endOfTurn, extraDraw, extraEnergy, armTrap, spendRes } from "./resources.js?v=20261029d";
import { buildEnemy, chooseMove, enemyAct, checkPhases } from "./intents.js?v=20261029d";
import { applyStatus, turnStart, turnEnd, roundEnd, modeOf } from "./status.js?v=20261029d";
import { fire } from "./relics.js?v=20261029d";
import { makeRng } from "./rng.js?v=20261029d";
import { heroicMods, noviceOf } from "./heroic.js?v=20261029d";
import { talentCarryBlock, talentNoExhaust, talentSweep } from "./talentHooks.js?v=20261029d";

// map-profile tuning (data/map-profiles.json combatMods) layered on the heroic modifiers: hp multiplies, strengths add
function composeMods(h, z, tier, nov = 1) {
  if (!z) return nov !== 1 ? { ...h, enemyHpMult: h.enemyHpMult * nov } : h;
  const hp = typeof z.enemyHpMult === "object" && z.enemyHpMult ? z.enemyHpMult[tier] || 1 : z.enemyHpMult || 1; // number = all tiers, or { normal, elite, boss }
  return { ...h, enemyHpMult: h.enemyHpMult * hp * nov, normalStrength: h.normalStrength + (z.normalStrength || 0), eliteStrength: h.eliteStrength + (z.eliteStrength || 0), bossStrength: h.bossStrength + (z.bossStrength || 0) };
}

export const BASE_DRAW = 5;

// opts: { data, run, zone, encounter:[enemyId], tier, rng, interactive, nodeApplies, enemyDefs, finalBoss }
export function startCombat(o) {
  const { data, run } = o;
  const cls = data.classObj(run.classId);
  const C = {
    data, run, cls, classId: run.classId, zone: o.zone || null, tier: o.tier || "normal", rng: o.rng || makeRng(run.seed + "|combat"),
    enemyDefs: o.enemyDefs || {}, interactive: !!o.interactive, heroicMods: composeMods(heroicMods(run.heroic || 0), o.zoneMods, o.tier, run.talents ? 1 : noviceOf(cls, run.act).enemyHp),
    turn: 0, phase: "setup", result: null, log: [], fx: [], uidSeq: 0, actionId: 0, enemies: [], relics: run.relics.slice(),
    potions: run.potions, stats: { damageDealt: 0, damageTaken: 0, cardsPlayed: 0, kills: 0, turns: 0 }, pending: [], powers: [],
    lastSchool: null, lastCardId: null, lastTarget: null, coldDrain: 0, endTurnRequested: false,
  };
  if (o.hpMul > 0) C.heroicMods = { ...C.heroicMods, enemyHpMult: C.heroicMods.enemyHpMult * o.hpMul }; // co-op (engine/coop.js): one pack for two heroes
  if (o.uidBase > 0) C.uidSeq = o.uidBase; // co-op: the second hero's summons and cards never reuse the first hero's uids
  C.player = {
    kind: "player", uid: "player", name: cls ? cls.name : "Hero", icon: cls && cls.icon, hp: run.hp, maxHp: run.maxHp, block: 0,
    st: {}, fresh: {}, energy: 0, energyNext: 0, res: {}, traits: [], dblNext: false,
  };
  initResources(C);
  Object.assign(C.player.res, (run.spire && run.spire.res) || {});
  const carry = run.carry || {};
  for (const [id, n] of Object.entries(carry)) applyStatus(C, C.player, id, n);
  run.carry = {};
  if (run.disease > 0) C.player.st.disease = run.disease;
  if (o.sharedEnemies) C.enemies = o.sharedEnemies; // co-op: the second hero fights the pack the first hero's combat built (same array)
  else for (const id of o.encounter) {
    const def = C.enemyDefs[id];
    if (!def) continue;
    C.enemies.push(buildEnemy(C, def));
  }
  if (o.nodeApplies && !o.sharedEnemies) {
    for (const a of o.nodeApplies) {
      const t = C.enemies.find((e) => e.tier === "elite") || C.enemies[0];
      if (t) { applyStatus(C, t, a.status, a.stacks); t.bountyMark = true; }
    }
  }
  buildPiles(C, run.deck);
  C.phase = "player";
  applyTalentsStart(C, run.talents);
  fire(C, "on_combat_start", {});
  if (!o.sharedEnemies) for (const e of C.enemies) chooseMove(C, e);
  startPlayerTurn(C, true);
  applyTalentsFirstTurn(C, run.talents);
  return C;
}

// Account talents (engine/talents.js talentMods, stamped on run.talents by newRun). Statuses + resource + first-turn energy before the
// combat-start relics fire; block + draw after the first hand is dealt. Absent (headless sim, old saves) = no-op.
const TALENT_STATUS = {
  str: "strength",
  dex: "dexterity",
  thorns: "thorns",
  metal: "metallicize",
  spell_power: "spell_power",
  armor: "armor",
  shield: "shield",
  rage_gen: "rage_gen",
  feral: "feral",
  stealth: "stealth",
  vampiric: "vampiric_embrace",
  reincarnation: "reincarnation",
  windfury: "weapon_imbue_windfury",
  free_cast: "free_cast",
  retain_block: "retain_block",
}; // regen joins after the first turn starts, or its first tick is wasted at full HP
function applyTalentsStart(C, T) {
  if (!T) return;
  const p = C.player;
  for (const [k, id] of Object.entries(TALENT_STATUS)) if (T[k] > 0) applyStatus(C, p, id, T[k] | 0);
  if (T.energy1 > 0) p.energyNext = (p.energyNext || 0) + (T.energy1 | 0);
  if (T.res > 0) {
    const r = (C.cls && C.cls.resource) || {};
    if (r.id) p.res[r.id] = Math.min(r.max > 0 ? r.max : 999, (p.res[r.id] || 0) + (T.res | 0));
  }
}
function applyTalentsFirstTurn(C, T) {
  if (!T) return;
  if (T.block > 0) gainBlock(C, C.player, T.block | 0, { raw: true });
  if (T.draw1 > 0) drawCards(C, T.draw1 | 0);
  if (T.regen > 0) applyStatus(C, C.player, "regen", T.regen | 0);
}

export function livingEnemies(C) { return C.enemies.filter(isAlive); }

export function startPlayerTurn(C, first = false) {
  const p = C.player;
  C.turn++;
  C.stats.turns++;
  C.phase = "player";
  C.endTurnRequested = false;
  C.cardsThisTurn = 0;
  C.effectDraws = 0; C.drawBlocked = null; // per-turn cap on effect-driven draws (effects.js MAX_EFFECT_DRAWS_PER_TURN)
  p.windfuryUsed = false;
  if (p.st.retain_block > 0) { p.st.retain_block -= 1; if (p.st.retain_block <= 0) delete p.st.retain_block; }
  else if (!first) p.block = talentCarryBlock(C, p.block); // 0 unless Improved Shield Block (Talents V2); turn 1 keeps combat-start block (gear/relics)
  p.tauntRound = false;
  const r = (C.cls && C.cls.resource) || {};
  const pre = { next: p.energyNext, en: p.st.energized, cold: C.coldDrain, ex: extraEnergy(C), stun: p.st.stun, fr: p.st.frozen };
  let energy = (r.energyPerTurn || 3) + (p.energyNext || 0) + (p.st.energized || 0) + extraEnergy(C) - (C.coldDrain || 0);
  let draw = BASE_DRAW + extraDraw(C);
  C.coldDrain = 0;
  p.energyNext = 0;
  delete p.st.energized;
  const stunned = !!p.st.stun;
  if (p.st.stun) { energy -= 1; delete p.st.stun; }
  const frozenHit = !!p.st.frozen;
  if (p.st.frozen) { energy -= 1; delete p.st.frozen; }
  if ((stunned || frozenHit) && (r.energyPerTurn || 3) > 0) energy = Math.max(1, energy); // stun + frozen never push below 1
  if (p.st.fear) { draw -= 2; delete p.st.fear; }
  // Sleep on the hero: this turn is lost (0 energy, cards unplayable, turn can still be ended). One stack is consumed per turn; damage wakes the hero early.
  const asleep = p.st.sleep > 0;
  p.asleep = asleep;
  if (asleep) { p.st.sleep -= 1; if (p.st.sleep <= 0) delete p.st.sleep; energy = 0; }
  p.energy = Math.max(0, energy);
  if (asleep) { log(C, "Asleep: you cannot act this turn."); fx(C, { t: "miss", uid: "player", text: "ASLEEP", kind: "gold" }); }
  else if (stunned) { log(C, "Stunned: -1 energy this turn."); fx(C, { t: "miss", uid: "player", text: "STUNNED -1", kind: "gold" }); }
  else if (frozenHit) log(C, "Frozen: -1 energy this turn.");
  if (p.energy <= 0) { // regression telemetry: 0 energy at turn start must be explained by a visible stun
    if (!stunned && !asleep) C.stats.zeroEnergyTurns = (C.stats.zeroEnergyTurns || 0) + 1;
    if (globalThis.__spiresDbg) globalThis.__spiresDbg({ C, energy, pre, stunned });
  }
  turnStart(C, p);
  if (C.result) return;
  startOfTurn(C);
  if (C.result) return;
  drawCards(C, Math.max(1, draw));
  fire(C, "on_turn_start", { first });
  if (!first) fx(C, { t: "turn", n: C.turn });
}

export function canPlayWhy(C, inst) {
  const why = whyUnplayable(C, inst);
  if (why) return why;
  const req = inst.def.requires;
  if (req && !evalCond({ C, src: C.player, srcKind: "player", target: null }, req)) {
    return req.type === "form_is" ? `Requires ${req.value} form` : req.type === "pet_alive" ? "Requires a demon" : "Requirement not met";
  }
  return null;
}

export function cardNeedsTarget(C, inst) {
  const t = inst.def.target;
  // Slay the Spire rule: every enemy-targeted card aims (drag arrow / click-then-enemy), with ANY number of living enemies, even one.
  return (t === "enemy" || t === undefined) && inst.def.type !== "power" && livingEnemies(C).length > 0;
}

function hasSchool(effs, school) {
  return (effs || []).some((e) => e && ((e.op === "damage" && e.school === school) || (e.op === "conditional" && (hasSchool(e.then, school) || hasSchool(e.else, school)))));
}

function applyImbues(C, ctx, def) {
  const st = C.player.st;
  if (def.type !== "attack") return;
  const t = ctx.target;
  if (st.weapon_imbue_rockbiter) gainBlock(C, C.player, 2, { raw: true });
  if (t && isAlive(t)) {
    if (st.weapon_imbue_flametongue) runEffects(ctx, [{ op: "damage", amount: 2, school: "fire", target: "target" }]);
    if (st.weapon_imbue_flametongue_2) runEffects(ctx, [{ op: "damage", amount: 4, school: "fire", target: "target" }]);
    if (st.weapon_imbue_frostbrand) runEffects(ctx, [{ op: "apply", status: "weak", stacks: 1, target: "target" }]);
    if (st.weapon_imbue_frostbrand_2) runEffects(ctx, [{ op: "apply", status: "weak", stacks: 2, target: "target" }]);
  }
  if ((st.weapon_imbue_windfury || st.weapon_imbue_windfury_2) && !C.player.windfuryUsed) {
    C.player.windfuryUsed = true;
    const bonus = st.weapon_imbue_windfury_2 ? 2 : 0; // Rank 2: the extra strike hits for +2
    const dmg = (def.effects || []).filter((e) => e.op === "damage").map((e) => (bonus && typeof e.amount === "number" ? { ...e, amount: e.amount + bonus } : e));
    if (dmg.length && t && isAlive(t)) runEffects(ctx, dmg);
  }
}

export function pickDefaultTarget(C) {
  const l = livingEnemies(C);
  const t = l.filter((e) => !e.st.stealth);
  const pool = t.length ? t : l;
  return pool.length ? pool.reduce((a, b) => (b.hp < a.hp ? b : a)) : null;
}

// A clicked/dragged target is honoured unless it is stealthed while a visible enemy exists (same rule as auto-target; co-op seats resolve it identically).
function chooseTarget(C, targetUid) {
  const t = targetUid && C.enemies.find((e) => e.uid === targetUid && isAlive(e));
  if (t && !(t.st.stealth && livingEnemies(C).some((e) => !e.st.stealth))) return t;
  return pickDefaultTarget(C);
}

export function playCard(C, uid, targetUid) {
  const p = C.player;
  const inst = C.pile.hand.find((c) => c.uid === uid);
  if (!inst) return { ok: false, why: "Card not in hand" };
  const why = canPlayWhy(C, inst);
  if (why) return { ok: false, why };
  const def = inst.def;
  let target = null;
  if (def.target === "enemy" || def.target === undefined) {
    target = chooseTarget(C, targetUid);
  }
  // pay
  let cost = cardCost(C, inst);
  let X = 0;
  if (cost === "X") { X = p.energy; cost = X; }
  if (cost > 0 && p.st.free_cast > 0) {
    cost = 0;
    p.st.free_cast -= 1;
    if (p.st.free_cast <= 0) delete p.st.free_cast;
  }
  p.energy -= cost;
  if (def.resourceCost) for (const [rid, amt] of Object.entries(def.resourceCost)) spendRes(C, rid, amt);
  removeFrom(C, inst);
  C.actionId++;
  C.stats.cardsPlayed++;
  C.cardsThisTurn++;
  { const k = C.typeCounts || (C.typeCounts = {}); k[def.type] = (k[def.type] || 0) + 1; }
  if (target) C.lastTarget = target;
  fx(C, { t: "play", uid: inst.uid, id: def.id });
  if (C.result) return { ok: true, endTurn: false };
  let fizzled = false;
  if (p.st.madness > 0 && C.rng.chance(Math.min(0.75, p.st.madness * 0.05))) {
    fizzled = true;
    log(C, `${def.name} fizzles (madness).`);
    fx(C, { t: "fizzle", uid: inst.uid });
  }
  const ctx = { C, src: p, srcKind: "player", target, card: def, cardInst: inst, X, spent: {}, isCardPrimary: true, cardId: def.id };
  if (!fizzled) {
    if (def.trap) armTrap(C, def);
    else { runEffects(ctx, def.effects); if (!C.result) talentSweep(C, ctx, def); }
    if (!C.result) applyImbues(C, ctx, def);
    if (!C.result && p.st.frostbite && hasSchool(def.effects, "frost")) gainBlock(C, p, p.st.frostbite, { raw: true });
    if (!C.result && hasSchool(def.effects, "holy")) for (const en of C.enemies) delete en.st.veiled;
    if (def.breaksForm && (p.form === "bear" || p.form === "cat")) p.form = "caster";
  }
  C.lastCardId = def.id;
  // dispose (a transformed or created-in-effects card may already be elsewhere)
  if (!C.pile.hand.includes(inst) && !C.pile.discard.includes(inst) && !C.pile.exhaust.includes(inst) && !C.pile.draw.includes(inst)) {
    if (def.type === "power" || def.type === "token_power") C.powers.push(inst);
    else if (hasFlag(inst, "exhaust") && !talentNoExhaust(C, def)) { toExhaust(C, inst); C.lastExhausted = inst; }
    else if (hasFlag(inst, "returns")) { inst.thrownTurn = C.turn; C.pile.hand.push(inst); } // Throw: back to hand, once per turn
else toDiscard(C, inst);
  }
  if (!C.result) {
    fire(C, "on_card_played", { card: def, enemy: target });
    if (def.type === "attack") fire(C, "on_attack", { card: def, enemy: target });
    checkPhases(C);
    checkDeaths(C);
  }
  return { ok: true, endTurn: !!C.endTurnRequested };
}

export function resolvePending(C, uids) {
  const pd = C.pending.shift();
  if (!pd) return false;
  const chosen = (uids || []).slice(0, pd.count);
  if (pd.type === "scry") {
    for (const u of chosen) {
      const c = C.pile.draw.find((x) => x.uid === u);
      if (c) { C.pile.draw.splice(C.pile.draw.indexOf(c), 1); C.pile.discard.push(c); }
    }
    if (pd.after) { runEffects(pd.after.ctx, pd.after.effects); checkDeaths(C); } // the card's remaining effects (Detect Magic: draw 1)
    return true;
  }
  for (const u of chosen) {
    const c = C.pile.hand.find((x) => x.uid === u);
    if (!c) continue;
    if (pd.type === "exhaust") { toExhaust(C, c); C.lastExhausted = c; } else toDiscard(C, c);
  }
  return true;
}

export function usePotion(C, idx, targetUid) {
  const id = C.potions[idx];
  const pot = id && C.data.potion(id);
  if (!pot || C.result || C.phase !== "player") return { ok: false };
  let target = null;
  if (pot.target === "enemy") target = chooseTarget(C, targetUid);
  C.potions.splice(idx, 1);
  C.actionId++;
  runEffects({ C, src: C.player, srcKind: "potion", target }, pot.effects);
  checkDeaths(C);
  return { ok: true };
}

// ---- turn end / enemy phase ----------------------------------------------------------
export function endPlayerTurn(C) {
  if (C.phase !== "player" || C.result) return;
  fire(C, "on_turn_end", {});
  turnEnd(C, C.player);
  if (!C.result) endOfTurn(C);
  endTurnCleanup(C);
  C.phase = "enemy";
}

export function* enemyPhase(C) {
  C.phase = "enemy";
  for (const e of C.enemies.slice()) {
    if (C.result) return;
    if (!isAlive(e)) continue;
    e.block = 0;
    turnStart(C, e);
    if (!isAlive(e)) continue;
    enemyAct(C, e);
    yield e;
  }
}

export function finishRound(C) {
  if (C.result) return;
  const p = C.player;
  roundEnd(C, p);
  for (const e of C.enemies) if (isAlive(e)) roundEnd(C, e);
  if (p.pet && isAlive(p.pet)) roundEnd(C, p.pet);
  for (const t of Object.values(p.totems)) if (t) roundEnd(C, t);
  checkDeaths(C);
  if (!C.result) startPlayerTurn(C);
}

export function endTurn(C) {
  endPlayerTurn(C);
  if (C.result) return;
  // eslint-disable-next-line no-unused-vars
  for (const _e of enemyPhase(C));
  finishRound(C);
}

// ---- finish -----------------------------------------------------------------------------
// Spare a spareable enemy (hp <= 35%): it leaves the fight, the zone's on_spare hook fires, and it does not count as a kill.
export function canSpare(C, e) { return !!(e && isAlive(e) && (e.def.spareable || e.traits.includes("spareable")) && e.hp <= e.maxHp * 0.35); }
export function spareEnemy(C, uid) {
  const e = C.enemies.find((x) => x.uid === uid);
  if (!canSpare(C, e)) return false;
  e.dead = true; e.hp = 0; e.block = 0; e.intent = null; e.spared = true;
  fx(C, { t: "spare", uid: e.uid });
  log(C, `You spare ${e.name}.`);
  fire(C, "on_spare", { enemy: e });
  if (!livingEnemies(C).length) C.result = "win";
  return true;
}

export function finishCombat(C) {
  const run = C.run;
  if (C.result === "win") fire(C, "on_combat_end", {});
  const p = C.player;
  run.maxHp = Math.max(1, p.maxHp - (C.tempMaxHp || 0)); // combat-only max HP (max_hp {combat:true}) ends with the fight
  run.hp = Math.max(0, Math.min(run.maxHp, p.hp));
  run.disease = Math.max(0, (p.st.disease || 0) - 1);
  { // zone-scope resources (e.g. tribute) persist for the whole spire
    const own = new Set([(C.cls && C.cls.resource && C.cls.resource.id), ...(((C.cls && C.cls.extraResources) || []).map((x) => x.id))]);
    const keep = (run.spire && run.spire.res) || {};
    for (const [id, v] of Object.entries(p.res)) if (!own.has(id) && v > 0) keep[id] = v;
    if (run.spire) run.spire.res = keep;
  }
  return { result: C.result, stats: C.stats, turns: C.turn, hp: run.hp };
}

export { resolveTargets, modeOf };
