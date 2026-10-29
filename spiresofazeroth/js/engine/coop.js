// Co-op combat: two heroes (seat 0 = host, seat 1 = guest), each with an ordinary combat state C, fighting ONE shared enemy array.
// No DOM. Deterministic given (both runs, encounter, action list), so both browsers run it in lockstep and only actions cross the wire.
// Round: seat 0 plays, then seat 1 plays, then the enemies act (each enemy hits one hero), then both heroes start a new turn.
// A hero at 0 HP is DOWN (skipped by turns and enemies); the fight is won when the pack dies (downed heroes stand back up at 20% HP)
// and lost only when every hero still in the fight is down. A Hearthstone retreat takes that hero out of the fight (GONE).
import { beginCombat } from "./run.js?v=20261029a";
import { playCard, usePotion, spareEnemy, resolvePending, endPlayerTurn, startPlayerTurn, livingEnemies } from "./combat.js?v=20261029a";
import { isAlive, checkDeaths } from "./damage.js?v=20261029a";
import { enemyAct } from "./intents.js?v=20261029a";
import { turnStart, roundEnd } from "./status.js?v=20261029a";

export const COOP_HP_MUL = 1.6; // enemy HP for two heroes (one hero's damage alone would make every fight half as long)
export const COOP_UID_BASE = 50000;
export const REVIVE_PCT = 0.2;

// runs: [hostRun, guestRun]; each client passes its OWN live run in its seat and a JSON clone of the partner's (taken before either combat starts).
export function startCoop({ data, runs, mySeat, encounter }) {
  const Cs = [];
  for (let s = 0; s < 2; s++) {
    data.setClass(runs[s].classId);
    const coop = s === 0 ? { encounter, hpMul: COOP_HP_MUL } : { encounter, uidBase: COOP_UID_BASE, sharedEnemies: Cs[0].enemies };
    Cs.push(beginCombat(runs[s], data, { interactive: true, coop })); // both seats: a choose-a-card effect waits for its owner's "pending" action on BOTH browsers
  }
  const S = { data, Cs, mySeat, round: 1, phase: "player", active: 0, ended: [false, false], down: [false, false], gone: [false, false], over: false, log: [] };
  data.setClass(Cs[mySeat].classId);
  settle(S);
  return S;
}

export const inFight = (S, seat) => !S.down[seat] && !S.gone[seat];
export const canAct = (S, seat) => !S.over && S.phase === "player" && S.active === seat && inFight(S, seat);
export const partnerSeat = (S) => 1 - S.mySeat;

// run fn against one hero's combat with that hero's class loaded (card lookups and random class pools key off data.classId)
export function withSeat(S, seat, fn) {
  const C = S.Cs[seat];
  S.data.setClass(C.classId);
  try { return fn(C); } finally { S.data.setClass(S.Cs[S.mySeat].classId); }
}

// Fold each hero's engine verdict into the shared one. Engine "lose" on one hero = that hero is down while a partner still stands.
export function settle(S) {
  if (S.over) return;
  for (let s = 0; s < 2; s++) {
    const C = S.Cs[s];
    if (C.result === "retreat") { S.gone[s] = true; S.ended[s] = true; continue; }
    if (!S.gone[s] && (C.result === "lose" || C.player.hp <= 0)) {
      if (!S.down[s]) S.log.push({ t: "down", seat: s });
      S.down[s] = true; S.ended[s] = true;
      C.player.hp = 0; C.player.block = 0;
      if (C.result === "lose") C.result = null;
    }
  }
  if (!livingEnemies(S.Cs[0]).length) {
    S.over = true;
    for (let s = 0; s < 2; s++) {
      if (S.gone[s]) continue;
      const C = S.Cs[s];
      if (S.down[s]) C.player.hp = Math.max(1, Math.round(C.player.maxHp * REVIVE_PCT)); // back on your feet for the reward screen
      C.result = "win";
    }
    return;
  }
  const standing = [0, 1].filter((s) => inFight(S, s));
  if (!standing.length) {
    S.over = true;
    for (let s = 0; s < 2; s++) if (!S.gone[s]) S.Cs[s].result = "lose";
    return;
  }
  if (S.phase === "player") advance(S);
}

function advance(S) {
  const next = [0, 1].find((s) => inFight(S, s) && !S.ended[s]);
  if (next === undefined) { S.phase = "enemy"; S.active = -1; } else S.active = next;
}

// Which hero an enemy swings at this round: alternate across the pack (stable array index + round), or the only hero still standing.
export function targetSeat(S, e) {
  const standing = [0, 1].filter((s) => inFight(S, s));
  if (!standing.length) return -1;
  if (standing.length === 1) return standing[0];
  const i = S.Cs[0].enemies.indexOf(e);
  return (Math.max(0, i) + S.round) % 2;
}

// a = { seat, k: "play"|"potion"|"spare"|"pending"|"end", uid?, target?, idx?, uids? }. Returns the engine result ({ ok } for plays).
export function applyAction(S, a) {
  if (S.over || !a || (a.seat !== 0 && a.seat !== 1)) return null;
  if (a.k !== "end" && !canAct(S, a.seat)) return null;
  const r = withSeat(S, a.seat, (C) => {
    switch (a.k) {
      case "play": return playCard(C, a.uid, a.target || undefined);
      case "potion": return usePotion(C, a.idx, a.target || undefined);
      case "spare": return spareEnemy(C, a.uid);
      case "pending": return resolvePending(C, a.uids || []);
      case "end": {
        if (S.ended[a.seat]) return null;
        endPlayerTurn(C);
        S.ended[a.seat] = true;
        return true;
      }
      default: return null;
    }
  });
  settle(S);
  return r;
}

// Enemy phase, one enemy per step (the UI animates between steps). Yields { e, seat } after each enemy acts.
export function* enemyPhase(S) {
  if (S.over || S.phase !== "enemy") return;
  for (const e of S.Cs[0].enemies.slice()) {
    if (S.over) return;
    if (!isAlive(e)) continue;
    const seat = targetSeat(S, e);
    if (seat < 0) return;
    withSeat(S, seat, (C) => {
      e.block = 0;
      turnStart(C, e);
      if (isAlive(e)) enemyAct(C, e);
      checkDeaths(C);
    });
    settle(S);
    yield { e, seat };
  }
}

// Round end: both heroes tick, the pack ticks once, then every hero still in the fight starts a new turn.
export function finishRound(S) {
  if (S.over) return;
  const standing = [0, 1].filter((s) => inFight(S, s));
  for (const s of standing) withSeat(S, s, (C) => {
    const p = C.player;
    roundEnd(C, p);
    if (p.pet && isAlive(p.pet)) roundEnd(C, p.pet);
    for (const t of Object.values(p.totems || {})) if (t) roundEnd(C, t);
  });
  withSeat(S, standing[0], (C) => { for (const e of C.enemies) if (isAlive(e)) roundEnd(C, e); });
  for (const s of standing) withSeat(S, s, (C) => checkDeaths(C));
  settle(S);
  if (S.over) return;
  S.round++;
  S.phase = "player";
  S.ended = [0, 1].map((s) => !inFight(S, s));
  for (const s of [0, 1]) if (inFight(S, s)) withSeat(S, s, (C) => startPlayerTurn(C));
  settle(S);
  advance(S);
}

// Cheap desync probe: both browsers compare this after every round.
export function stateHash(S) {
  const parts = S.Cs[0].enemies.map((e) => `${e.uid}:${e.hp}:${e.block}:${e.dead ? 1 : 0}`);
  for (const C of S.Cs) parts.push(`${C.player.hp}:${C.player.block}:${C.player.energy}:${C.pending.length}:${C.pile.hand.length}:${C.pile.draw.length}`);
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
