// Enemy construction + AI: weighted moves with cooldowns, fixed patterns, phases, cast intents, and family traits.
//  - beast  : pack (+1 Strength per other living pack beast, status.packBonus)
//  - undead : revive once at 25% (only when def.traits has "revive"; damage.checkDeaths)
//  - elemental: resist:<school> trait halves that school (status.modifyTaken)
//  - mechanical: starts with Armor 2, immune to poison/bleed
//  - dragonkin: "breath" trait -> telegraphed breath every 4th action
//  - giant  : alternates a wind-up turn with a heavy action
//  - humanoid casters: cast intents, interruptible (cast_interrupt op) and fizzled by Silence
//  - summoner: summon moves are skipped while 5+ enemies live or this unit already has 2 minions
import { runEffects } from "./effects.js";
import { fireTraps } from "./resources.js";
import { applyStatus, hasTrait, skipsAction, modifyDealt, modifyTaken, onAction, turnEnd } from "./status.js";
import { isAlive, fx, log } from "./damage.js";
import { resolveImmunity } from "./immunity.js";

const FAMILY_TRAITS = { mechanical: ["immune:poison", "immune:bleed"], beast: ["pack"] };

export function buildEnemy(C, def, o = {}) {
  C.uidSeq = (C.uidSeq || 0) + 1;
  const hm = C.heroicMods || {};
  const [lo, hi] = Array.isArray(def.hp) ? def.hp : [def.hp || 10, def.hp || 10];
  let hp = C.rng.int(lo, hi);
  hp = Math.max(1, Math.round(hp * (hm.enemyHpMult || 1) * (def.tier === "boss" ? 1 : 1)));
  const traits = Array.from(new Set([...(def.traits || []), ...(FAMILY_TRAITS[def.family] || [])]));
  const imm = resolveImmunity(def);
  const e = {
    immune: imm.immune, resist: imm.resist,
    kind: "enemy", uid: "e" + C.uidSeq, id: def.id, def, name: def.name, icon: def.icon, tier: def.tier || "normal",
    family: def.family, type: def.type, level: def.level, npcId: def.npcId, hp, maxHp: hp, block: 0, st: {}, traits,
    movesById: Object.fromEntries((def.moves || []).map((m) => [m.id, m])), cursor: 0, cd: {}, phaseIdx: 0,
    pattern: def.pattern || null, acts: 0, skipTurns: 0, castProg: 0, aim: "player", intent: null, fresh: {},
  };
  if (def.family === "mechanical") e.st.armor = 2;
  if (hasTrait(e, "stealth")) e.st.stealth = 1;
  const extraStr = (e.tier === "normal" ? hm.normalStrength : e.tier === "elite" ? hm.eliteStrength : hm.bossStrength) || 0;
  if (extraStr) e.st.strength = extraStr;
  if (o.summoner) e.summonedBy = o.summoner.uid;
  return e;
}

export function spawnEnemy(C, id, summoner) {
  const def = C.enemyDefs && C.enemyDefs[id];
  if (!def) { log(C, `[summon: unknown enemy ${id}]`); return null; }
  if (summoner && C.enemies.filter((e) => e.summonedBy === summoner.uid && isAlive(e)).length >= 2) return null;
  const e = buildEnemy(C, def, { summoner });
  e.justSummoned = true;
  C.enemies.push(e);
  fx(C, { t: "summon", uid: e.uid });
  chooseMove(C, e);
  return e;
}

// ---- move selection -----------------------------------------------------------------
function isSummonMove(m) {
  return (m.effects || []).some((x) => x.op === "summon");
}
function breathMove(C, e) {
  const own = e.movesById.breath;
  if (own) return own;
  const dmg = Math.round(6 + e.maxHp / 8);
  return { id: "breath", name: "Breath", intent: "attack_multi", effects: [{ op: "damage", amount: dmg, target: "all_enemies", school: "fire" }] };
}

function checkPhase(C, e) {
  const phases = e.def.phases;
  if (!phases || e.phaseIdx >= phases.length) return false;
  const ph = phases[e.phaseIdx];
  if ((e.hp / e.maxHp) * 100 >= ph.hpBelowPct) return false;
  e.phaseIdx++;
  if (ph.pattern) { e.pattern = ph.pattern; e.cursor = 0; }
  if (ph.moves) for (const m of ph.moves) e.movesById[m.id] = m;
  fx(C, { t: "phase", uid: e.uid });
  log(C, `${e.name} enters a new phase!`);
  if (ph.onEnter) runEffects({ C, src: e, srcKind: "enemy", target: C.player, move: null }, ph.onEnter);
  return true;
}

export function checkPhases(C) {
  for (const e of C.enemies) {
    if (isAlive(e) && checkPhase(C, e)) { e.castProg = 0; e.interrupted = false; chooseMove(C, e); }
  }
}

export function chooseMove(C, e) {
  if (!isAlive(e)) return null;
  checkPhase(C, e);
  e.wasInterrupted = false;
  for (const k of Object.keys(e.cd)) if (e.cd[k] > 0) e.cd[k]--;
  let move = null;
  if (hasTrait(e, "breath") && e.acts > 0 && (e.acts + 1) % 4 === 0) move = breathMove(C, e);
  else if ((e.family === "giant" || hasTrait(e, "giant")) && e.heavyNext) {
    e.heavyNext = false;
    move = { id: "windup", name: "Winding up", intent: "unknown", effects: [] };
  }
  const moves = e.def.moves || [];
  const livingMinions = C.enemies.filter((o) => o.summonedBy === e.uid && isAlive(o)).length;
  const summonOk = C.enemies.filter(isAlive).length < 5 && livingMinions < 2;
  if (!move && e.pattern && e.pattern.length) {
    for (let tries = 0; tries < e.pattern.length && !move; tries++) {
      const id = e.pattern[e.cursor % e.pattern.length];
      e.cursor++;
      const m = e.movesById[id];
      if (m && (summonOk || !isSummonMove(m))) move = m;
    }
  }
  if (!move) {
    let pool = moves.filter((m) => !(e.cd[m.id] > 0) && (summonOk || !isSummonMove(m)));
    if (!pool.length) pool = moves.filter((m) => summonOk || !isSummonMove(m));
    if (!pool.length) pool = moves;
    // avoid the exact same move three times in a row
    if (e.lastMoves && e.lastMoves.length >= 2 && e.lastMoves[0] === e.lastMoves[1]) {
      const alt = pool.filter((m) => m.id !== e.lastMoves[0]);
      if (alt.length) pool = alt;
    }
    move = C.rng.weighted(pool, (m) => (m.weight === undefined ? 1 : m.weight));
  }
  if (!move) move = { id: "idle", name: "Watches", intent: "unknown", effects: [] };
  if (move.cooldown) e.cd[move.id] = move.cooldown;
  (e.lastMoves || (e.lastMoves = [])).unshift(move.id);
  e.lastMoves.length = Math.min(e.lastMoves.length, 2);
  if (e.family === "giant" && move.id !== "windup") e.heavyNext = true;
  // who will it hit?
  e.aim = "player";
  const p = C.player;
  if (p.pet && isAlive(p.pet) && (p.pet.guardian || (!(C.modes[p.aspect] || {}).petUntargetable && C.rng.chance(0.25)))) e.aim = "pet";
  else {
    const tots = Object.values(p.totems || {}).filter((t) => t && t.hp > 0);
    if (tots.length && C.rng.chance(0.2)) e.aim = C.rng.pick(tots).uid;
  }
  e.intent = { kind: move.intent || "unknown", move, name: move.name, total: move.castTurns || 1 };
  if (move.intent === "cast" && !(e.castProg > 0)) e.castProg = 0;
  return move;
}

// ---- preview ---------------------------------------------------------------------------
export function intentInfo(C, e) {
  const it = e && e.intent;
  if (!it) return null;
  const info = { kind: it.kind, name: it.name, dmg: 0, hits: 0, block: 0, statuses: [], debuff: null, summon: false, aoe: false, aim: e.aim, cast: null };
  const walk = (effs) => {
    for (const x of effs || []) {
      if (x.op === "damage" || x.op === "aoe") {
        let base = typeof x.amount === "number" ? x.amount : (x.amount && x.amount.base) || 0;
        let a = modifyDealt(C, e, base);
        if (x.target === "self") continue;
        const t = C.player;
        a = modifyTaken(C, t, a, x.school || "physical");
        const times = typeof x.times === "number" ? x.times : 1;
        info.dmg += a * times;
        info.hits += times;
        if (x.target === "all_enemies" || x.op === "aoe") info.aoe = true;
        info.perHit = a;
      } else if (x.op === "block") info.block += x.amount || 0;
      else if (x.op === "apply") info.statuses.push({ id: x.status, stacks: x.stacks || 1, self: x.target === "self" });
      else if (x.op === "summon") info.summon = true;
      else if (x.op === "conditional") { walk(x.then); }
      else if (x.op === "repeat") walk(x.effects);
    }
  };
  walk(it.move.effects);
  const dbf = info.statuses.find((x) => !x.self && (x.id === "stun" || x.id === "frozen"));
  if (dbf) info.debuff = dbf.id; // UI draws the stun/frozen icon under the intent
  if (it.kind === "cast") info.cast = { prog: e.castProg || 0, total: it.total };
  return info;
}

// ---- acting -----------------------------------------------------------------------------
function done(C, e) {
  e.acts++;
  onAction(C, e);
  turnEnd(C, e);
}

// One enemy takes its turn. Called by combat.enemyPhase, one enemy at a time.
export function enemyAct(C, e) {
  if (!isAlive(e) || C.result) return;
  if (e.justSummoned) { e.justSummoned = false; return; }
  if (checkPhase(C, e)) { e.castProg = 0; chooseMove(C, e); }
  if (e.skipTurns > 0) { e.skipTurns--; fx(C, { t: "skip", uid: e.uid, why: "dazed" }); return afterAct(C, e, false); }
  const why = skipsAction(C, e);
  if (why) {
    fx(C, { t: "skip", uid: e.uid, why });
    log(C, `${e.name} is ${why === "fear" ? "feared" : why === "frozen" ? "frozen" : why === "sleep" ? "asleep" : "stunned"}.`);
    e.castProg = 0;
    return afterAct(C, e, why === "sleep" ? false : true);
  }
  const it = e.intent;
  if (!it) return afterAct(C, e, true);
  const mv = it.move;
  if (it.kind === "cast") {
    if (e.interrupted) {
      e.interrupted = false; e.castProg = 0; e.wasInterrupted = true;
      fx(C, { t: "interrupted", uid: e.uid });
      log(C, `${e.name}'s ${mv.name} is interrupted.`);
      return afterAct(C, e, true);
    }
    if (e.st.silence > 0) {
      e.castProg = 0;
      log(C, `${e.name} is silenced.`);
      return afterAct(C, e, true);
    }
    if ((e.castProg || 0) + 1 < (mv.castTurns || 1)) {
      e.castProg = (e.castProg || 0) + 1;
      fx(C, { t: "casting", uid: e.uid });
      return afterAct(C, e, false);
    }
    e.castProg = 0;
  }
  if (e.interrupted) { e.interrupted = false; return afterAct(C, e, true); }
  const attacky = it.kind === "attack" || it.kind === "attack_multi";
  if (attacky && C.traps.length) {
    if (fireTraps(C, e)) { e.interrupted = false; fx(C, { t: "interrupted", uid: e.uid }); return afterAct(C, e, true); }
    if (!isAlive(e) || C.result) return;
  }
  fx(C, { t: "act", uid: e.uid, name: mv.name, kind: it.kind });
  C.actionId++;
  runEffects({ C, src: e, srcKind: "enemy", target: C.player, move: mv }, mv.effects);
  afterAct(C, e, true);
}

function afterAct(C, e, rechoose) {
  if (isAlive(e)) { done(C, e); if (isAlive(e) && !(e.castProg > 0)) chooseMove(C, e); }
}

export { applyStatus };
