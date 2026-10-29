// Effect DSL interpreter. ONE function per op, table-dispatched (OPS). OP_NAMES is the single source of truth
// that tools/spires/validate-data.mjs imports.
//
// ctx = { C, src, srcKind, target, attacker, card, cardInst, relic, event, run, rng, spent, X, trapFiring }
//   srcKind: player | enemy | pet | totem | relic | potion | zone | event
//   C is null in run-mode (events, shop, rest, pickup): only run-level ops take effect (hp, gold, deck, max hp).
import { dealDamage, dealStatusDamage, gainBlock, healEntity, isAlive, fx, log } from "./damage.js?v=20261029a";
import { applyStatus, removeStatus, modeOf, STATUS_DEFS, hasTrait } from "./status.js?v=20261029a";
import { drawCards, addCards, toDiscard, toExhaust, makeInst, hasFlag, HAND_LIMIT } from "./deck.js?v=20261029a";
import {
  addRes, spendRes, summonAlly, placeTotem, petAct, judge, revivePet, sacrificePet, randomPetId, petTargetable,
} from "./resources.js?v=20261029a";
import { spawnEnemy } from "./intents.js?v=20261029a";
import { extraCond, installMoreOps } from "./effects-more.js?v=20261029a";
import { talentApplyBonus, talentSkipSelfHit } from "./talentHooks.js?v=20261029a";

const MUL_SCALES = new Set(["combo", "combo_points"]); // "N per point" reads as base + per * count; everything else base + floor(count / per)

// ---- helpers ---------------------------------------------------------------------
const rngOf = (ctx) => (ctx.C ? ctx.C.rng : ctx.rng || { next: () => 0.5, int: (a) => a, pick: (a) => a[0], chance: () => false, shuffle: (a) => a });
const playerOf = (ctx) => (ctx.C ? ctx.C.player : null);
const liveEnemies = (C) => C.enemies.filter(isAlive);
const targetableEnemies = (C) => {
  const l = liveEnemies(C);
  const t = l.filter((e) => !e.st.stealth);
  return t.length ? t : l;
};

function scaleValue(ctx, name) {
  if (name === "X") return ctx.X || 0;
  if (ctx.spent && ctx.spent[name] !== undefined) return ctx.spent[name];
  const C = ctx.C;
  if (!C) return 0;
  const p = C.player;
  if (p.res[name] !== undefined) return p.res[name];
  if (name === "hand") return C.pile.hand.length;
  if (name === "block") return p.block;
  const owner = ctx.src && ctx.src.st ? ctx.src : p;
  return owner.st[name] || p.st[name] || 0;
}

export function num(ctx, v, dflt = 0) {
  if (v === undefined || v === null) return dflt;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v === "X") return ctx.X || 0;
    if (v === "all") return 999;
    const n = Number(v);
    return Number.isNaN(n) ? dflt : n;
  }
  if (typeof v === "object") {
    let n = v.base || 0;
    if (v.scale) {
      const sv = v.of === "target" ? ((ctx.target && ctx.target.st && ctx.target.st[v.scale]) || 0) : scaleValue(ctx, v.scale);
      const per = v.per === undefined ? 1 : v.per;
      const isRes = ctx.C && ctx.C.player.res[v.scale] !== undefined;
      if (MUL_SCALES.has(v.scale) || !isRes) n += per * sv;
      else n += per > 0 ? Math.floor(sv / per) : sv;
    }
    if (v.max !== undefined && v.max !== null) n = Math.min(n, v.max);
    return n;
  }
  return dflt;
}

export function enemyAim(C, e) {
  // Where an enemy's single-target attack lands.
  const p = C.player;
  if (e.st.taunted > 0) {
    const others = liveEnemies(C).filter((o) => o !== e);
    return others.length ? C.rng.pick(others) : null;
  }
  const abs = [];
  if (p.pet && isAlive(p.pet) && petTargetable(C)) abs.push(p.pet);
  for (const t of Object.values(p.totems || {})) if (t && t.hp > 0) abs.push(t);
  if (p.tauntRound === "self") return p;
  if (typeof p.tauntRound === "string" && p.tauntRound.startsWith("totem-")) { const t = abs.find((a) => a.uid === p.tauntRound); if (t) return t; } // Stoneclaw: its own uid, while it stands
  if (p.tauntRound && abs.length) return C.rng.pick(abs);
  if (e.aim && e.aim !== "player") {
    const found = abs.find((a) => a.uid === e.aim);
    if (found) return found;
  }
  return p;
}

export function resolveTargets(ctx, spec, dflt) {
  const C = ctx.C;
  const p = C.player;
  const s = spec || dflt;
  const src = ctx.src || p;
  const fromEnemy = ctx.srcKind === "enemy";
  switch (s) {
    case "self": return isAlive(src) || src === p ? [src] : [];
    case "player": return [p];
    case "pet": return p.pet && isAlive(p.pet) ? [p.pet] : [];
    case "attacker": return ctx.attacker && isAlive(ctx.attacker) ? [ctx.attacker] : [];
    case "target": return ctx.target && isAlive(ctx.target) ? [ctx.target] : [];
    case "enemy": {
      if (fromEnemy) { const a = enemyAim(C, src); return a ? [a] : []; }
      if (ctx.trapFiring && ctx.attacker) return [ctx.attacker];
      if (ctx.target && isAlive(ctx.target)) return [ctx.target];
      const l = targetableEnemies(C);
      if (ctx.srcKind === "pet" || ctx.srcKind === "totem") return l.length ? [l[0]] : [];
      return l.length ? [C.lastTarget && isAlive(C.lastTarget) ? C.lastTarget : l[0]] : [];
    }
    case "all_enemies":
      if (fromEnemy) return [p].concat(p.pet && isAlive(p.pet) ? [p.pet] : [], Object.values(p.totems || {}).filter((t) => t && t.hp > 0));
      return liveEnemies(C);
    case "random_enemy": {
      if (fromEnemy) return [p];
      const l = targetableEnemies(C);
      return l.length ? [C.rng.pick(l)] : [];
    }
    case "random_elite": {
      const l = liveEnemies(C).filter((e) => e.tier === "elite");
      return l.length ? [C.rng.pick(l)] : [];
    }
    case "allies":
    case "all_allies": {
      if (fromEnemy) return liveEnemies(C).filter((e) => e !== src);
      const l = [];
      if (p.pet && isAlive(p.pet)) l.push(p.pet);
      for (const t of Object.values(p.totems || {})) if (t && t.hp > 0) l.push(t);
      return l;
    }
    case "ally": {
      const l = fromEnemy ? liveEnemies(C).filter((e) => e !== src) : [];
      return l.length ? [C.rng.pick(l)] : [];
    }
    case "all": return [p].concat(liveEnemies(C));
    default: return [];
  }
}

function cmp(c, actual) {
  if (c.eq !== undefined) return actual === c.eq;
  let ok = true;
  const lo = c.min ?? c.gte ?? c.at_least ?? c.atLeast;
  const hi = c.max ?? c.lte ?? c.at_most;
  if (lo !== undefined) ok = ok && actual >= lo;
  if (hi !== undefined) ok = ok && actual <= hi;
  if (c.gt !== undefined) ok = ok && actual > c.gt;
  if (c.lt !== undefined) ok = ok && actual < c.lt;
  return ok;
}

export function evalCond(ctx, c) {
  if (!c) return true;
  const C = ctx.C;
  let r = false;
  const val = c.value !== undefined ? c.value : c.name;
  const actor = () => (ctx.src && ctx.src.st ? ctx.src : C.player);
  const foe = () => (ctx.srcKind === "enemy" ? C.player : ctx.target || (C.lastTarget && isAlive(C.lastTarget) ? C.lastTarget : liveEnemies(C)[0]));
  switch (c.type) {
    case "chance": { const pr = c.p !== undefined ? (c.p <= 1 ? c.p * 100 : c.p) : (c.pct ?? c.value ?? 50); r = rngOf(ctx).next() * 100 < pr; break; }
    case "status_on_target": {
      if (c.family) { r = !!C && liveEnemies(C).some((en) => en.family === c.family && (en.st[c.status] || 0) >= (c.min || 1)); break; }
      const who = c.target === "self" ? actor() : c.target === "player" ? C.player : (ctx.target || foe());
      r = !!who && who.st && (who.st[c.status] || 0) >= (c.min || 1);
      break;
    }
    case "resource_at_least": r = !!C && (C.player.res[c.resource] || 0) >= (c.amount ?? c.value ?? 1); break;
    case "hp_below_pct": {
      const who = c.target === "enemy" ? foe() : c.target === "player" ? C.player : actor();
      r = !!who && who.maxHp > 0 && (who.hp / who.maxHp) * 100 < (c.pct ?? c.value ?? 50);
      break;
    }
    case "cards_in_hand": r = !!C && cmp(c.count !== undefined ? { eq: c.count } : c, C.pile.hand.length); break;
    case "enemy_intent": {
      const t = ctx.target || foe();
      const want = c.intent ?? val, kind = t && t.intent && t.intent.kind;
      r = !!kind && (kind === want || (want === "attack" && kind === "attack_multi")) && (!c.interrupted || !!t.wasInterrupted); // multi-hit attacks are attacks (Taunt)
      break;
    }
    case "turn_number": {
      const n = C ? C.turn : 0;
      if (c.firstAttack || c.firstSkill) { const k = (C && C.typeCounts) || {}; r = (k[c.firstAttack ? "attack" : "skill"] || 0) === 0; break; }
      if (c.parity) { r = n % 2 === (c.parity === "odd" ? 1 : 0); break; }
      const cc = { ...c };
      if (cc.equals !== undefined) cc.eq = cc.equals;
      if (cc.value !== undefined && cc.eq === undefined && cc.min === undefined) cc.eq = cc.value;
      r = cc.every ? n > 0 && n % cc.every === 0 : cmp(cc, n);
      if (r && c.enemyType) r = !!C && liveEnemies(C).some((en) => en.type === c.enemyType || en.family === c.enemyType);
      break;
    }
    case "pet_alive": r = !!C && !!C.player.pet && isAlive(C.player.pet); break;
    case "form_is": r = !!C && C.player.form === val; break;
    case "stance_is": r = !!C && C.player.stance === val; break;
    case "seal_is": r = !!C && (val === undefined || val === "any" ? !!C.player.seal : C.player.seal === val); break;
    case "aspect_is": r = !!C && C.player.aspect === val; break;
    case "school_last": {
      const v = String(c.school ?? val ?? "").toLowerCase();
      r = !!C && (C.lastSchool === v || (C.lastCardId || "") === v);
      break;
    }
    case "target_is_family": {
      const t = ctx.target || foe();
      const fam = c.family ?? val;
      const list = Array.isArray(fam) ? fam : [fam];
      r = !!t && (list.includes(t.family) || list.includes(t.type));
      if (r && c.oncePerEnemy) { const k = "fam:" + list.join(","); t.once = t.once || {}; if (t.once[k]) r = false; else t.once[k] = true; }
      break;
    }
    case "has_relic": r = !!C && C.relics.includes(val); break;
    default: { const x = extraCond(ctx, c, { cmp }); r = x === undefined ? false : x; }
  }
  return c.not ? !r : r;
}

// ---- ops -----------------------------------------------------------------------------
const OPS = {};
const op = (names, fn) => { for (const n of [].concat(names)) OPS[n] = fn; };

function runMode(ctx) { return !ctx.C; }
function carry(ctx) {
  const run = ctx.run;
  return run ? (run.carry || (run.carry = {})) : {};
}

op(["damage", "aoe"], (ctx, e) => {
  const spec = e.op === "aoe" ? "all_enemies" : e.target;
  if (runMode(ctx)) {
    if (!ctx.run) return;
    const amt = e.pct ? Math.floor(ctx.run.maxHp * e.pct / 100) : num(ctx, e.amount);
    ctx.run.hp = Math.max(1, ctx.run.hp - Math.max(0, amt));
    return;
  }
  const C = ctx.C;
  const times = Math.max(1, Math.floor(num(ctx, e.times, 1)));
  const kind = ctx.srcKind === "enemy" || ctx.srcKind === "player" || ctx.srcKind === "pet" || ctx.srcKind === "totem" ? "attack" : "effect";
  const p = C.player;
  let base = num(ctx, e.amount);
  const isSelf = spec === "self";
  for (let i = 0; i < times; i++) {
    let tgts = resolveTargets(ctx, spec, ctx.srcKind === "enemy" && !spec ? "enemy" : "enemy");
    if (ctx.card && (ctx.card.target === "enemy" || ctx.card.target === undefined) && e.op !== "aoe" && spec !== "all_enemies" && spec !== "all") {
      if (tgts.length > 1) tgts = [ctx.target || tgts[0]];
    }
    const aoe = tgts.length > 1;
    for (const t of tgts) {
      let amt = e.pct ? Math.floor(t.maxHp * e.pct / 100) : base;
      if (isSelf) {
        if (talentSkipSelfHit(ctx)) continue; // Talents V2: card_nohurt
        const loss = dealStatusDamage(C, t, amt, "self");
        if (loss > 0 && t === p) C.stats.selfDamage = (C.stats.selfDamage || 0) + loss;
        continue;
      }
      if (ctx.srcKind === "player" && p.dblNext && t.kind === "enemy") { amt *= 2; p.dblNext = false; if (p.st) delete p.st.double_next; }
      dealDamage(C, ctx.src || p, t, amt, {
        school: e.school || (ctx.card && ctx.card.school) || "physical",
        kind,
        aoe,
        primary: !!ctx.isCardPrimary,
        cardId: ctx.card ? ctx.card.id : undefined,
        card: ctx.card || undefined, // Talents V2 reads the card's type/id
      });
      if (C.result) return;
    }
  }
});

op("block", (ctx, e) => {
  if (runMode(ctx)) return;
  const C = ctx.C;
  for (const t of resolveTargets(ctx, e.target, "self")) gainBlock(C, t, num(ctx, e.amount), { card: !!ctx.cardInst, cardId: ctx.card ? ctx.card.id : undefined });
});

op("heal", (ctx, e) => {
  if (runMode(ctx)) {
    const run = ctx.run;
    if (!run) return;
    const amt = e.pct ? Math.floor(run.maxHp * e.pct / 100) : num(ctx, e.amount);
    run.hp = Math.min(run.maxHp, run.hp + (amt >= 999 ? run.maxHp : amt));
    return;
  }
  const C = ctx.C;
  for (const t of resolveTargets(ctx, e.target, "self")) {
    let amt = e.pct ? Math.floor(t.maxHp * e.pct / 100) : num(ctx, e.amount);
    if (amt >= 999) amt = t.maxHp;
    healEntity(C, t, amt);
  }
});

op("apply", (ctx, e) => {
  let stacks = e.stacks === undefined ? 1 : num(ctx, e.stacks);
  const dur = e.duration !== undefined && e.duration !== null ? num(ctx, e.duration) : undefined;
  if (runMode(ctx)) {
    if (!ctx.run || (e.target && e.target !== "self" && e.target !== "player")) {
      if (ctx.run && e.target === "random_elite") (ctx.run.spire.pendingApplies || (ctx.run.spire.pendingApplies = [])).push({ status: e.status, stacks });
      return;
    }
    const c = carry(ctx);
    c[e.status] = (c[e.status] || 0) + stacks;
    return;
  }
  const C = ctx.C;
  const p = C.player;
  if (stacks > 0) stacks += talentApplyBonus(ctx, e.status); // Talents V2: card_apply
  if (ctx.srcKind === "player" && ctx.card && /^curse/i.test(ctx.card.id || "") && p.st.amplify_curse && stacks > 0) {
    stacks *= 2;
    delete p.st.amplify_curse;
  }
  if (e.trigger) {
    const list = p.triggers[e.trigger] || (p.triggers[e.trigger] = []);
    const inner = { ...e };
    delete inner.trigger;
    delete inner.once;
    list.push({ once: !!e.once, effects: [inner] });
    return;
  }
  for (const t of resolveTargets(ctx, e.target, ctx.srcKind === "enemy" ? "player" : "enemy")) {
    if (e.filter && !((!e.filter.family || t.family === e.filter.family) && (!e.filter.trait || hasTrait(t, e.filter.trait)))) continue;
    if (e.onlyType && t.type !== e.onlyType && t.family !== e.onlyType) continue;
    if (applyStatus(C, t, e.status, stacks, { duration: dur, school: e.school || (ctx.card && ctx.card.school) || undefined }) && e.status === "delayed" && e.payload) {
      (t.payloads || (t.payloads = [])).push({ effects: e.payload, source: ctx.src || p });
    }
  }
});

op("remove", (ctx, e) => {
  if (runMode(ctx)) return;
  for (const t of resolveTargets(ctx, e.target, "self")) {
    if (e.status === "debuffs" || e.status === "buffs") {
      const kind = e.status === "debuffs" ? "debuff" : "buff";
      for (const id of Object.keys(t.st)) if ((STATUS_DEFS[id] || {}).kind === kind) removeStatus(t, id);
    } else removeStatus(t, e.status);
  }
});

// Engine backstop against thin-deck infinite loops (draw -> refund -> draw ...): card/effect-driven draws are capped per player turn.
// The turn-start hand and the opening hand are drawn by combat.js directly and are not counted. Reset in combat.startPlayerTurn.
export const MAX_EFFECT_DRAWS_PER_TURN = 10;
op("draw", (ctx, e) => {
  const C = ctx.C; if (!C) return;
  let n = Math.max(0, Math.floor(num(ctx, e.count, 1)));
  if (ctx.srcKind !== "enemy") {
    const left = Math.max(0, MAX_EFFECT_DRAWS_PER_TURN - (C.effectDraws || 0));
    if (n > left) C.drawBlocked = "cap"; // the combat UI tells the player why the draw stopped
    n = Math.min(n, left);
    C.effectDraws = (C.effectDraws || 0) + n;
  }
  if (n > 0) {
    const before = C.pile.hand.length;
    drawCards(C, n);
    if (ctx.srcKind !== "enemy" && C.pile.hand.length - before < n && C.pile.hand.length >= HAND_LIMIT) C.drawBlocked = "hand";
    else if (ctx.srcKind !== "enemy" && C.pile.hand.length - before < n && !C.pile.draw.length && !C.pile.discard.length) C.drawBlocked = "empty"; // 10-29 report: draws "stopped working" silently
  }
});

function pickCards(ctx, count, random, why) {
  const C = ctx.C;
  const hand = C.pile.hand.filter((c) => c !== ctx.cardInst);
  const n = Math.min(count, hand.length);
  if (!n) return [];
  if (random || !C.interactive) {
    if (random) return C.rng.shuffle(hand.slice()).slice(0, n);
    // headless/auto: throw away the least valuable (curses/status, then highest cost... cheapest value)
    return hand.slice().sort((a, b) => cardKeepValue(a) - cardKeepValue(b)).slice(0, n);
  }
  (C.pending || (C.pending = [])).push({ type: why, count: n, hand: hand.map((c) => c.uid) });
  return [];
}
export function cardKeepValue(c) {
  const t = c.def.type;
  if (t === "curse" || t === "status") return -5;
  let v = 0;
  for (const e of c.def.effects || []) v += e.op === "damage" || e.op === "block" ? 3 : 1;
  return v - (typeof c.def.cost === "number" ? c.def.cost * 0.5 : 0);
}
op("discard", (ctx, e) => {
  if (!ctx.C) return;
  for (const c of pickCards(ctx, Math.floor(num(ctx, e.count, 1)), e.random, "discard")) toDiscard(ctx.C, c);
});
op(["exhaust", "exhaust_hand"], (ctx, e) => {
  if (!ctx.C) return;
  const all = e.op === "exhaust_hand" && e.count === undefined;
  const cnt = all ? 99 : Math.floor(num(ctx, e.count, 1));
  for (const c of pickCards(ctx, cnt, all ? true : e.random, "exhaust")) { toExhaust(ctx.C, c); ctx.C.lastExhausted = c; }
});

op("gain_energy", (ctx, e) => { if (ctx.C) ctx.C.player.energy += Math.floor(num(ctx, e.amount)); });
op("energy_next_turn", (ctx, e) => { if (ctx.C) ctx.C.player.energyNext = (ctx.C.player.energyNext || 0) + Math.floor(num(ctx, e.amount)); });
op("gain_resource", (ctx, e) => { if (ctx.C) addRes(ctx.C, e.resource, Math.floor(num(ctx, e.amount))); });
op("spend_resource", (ctx, e) => {
  if (!ctx.C) return;
  const all = e.all === true || e.amount === "all";
  const amt = all ? 999 : Math.floor(num(ctx, e.amount));
  const spent = spendRes(ctx.C, e.resource, amt);
  (ctx.spent || (ctx.spent = {}))[e.resource] = (ctx.spent[e.resource] || 0) + spent;
});

op("summon", (ctx, e) => {
  if (!ctx.C) return;
  const C = ctx.C;
  const count = Math.max(1, Math.floor(num(ctx, e.count, 1)));
  if (ctx.srcKind === "enemy") {
    for (let i = 0; i < count; i++) {
      if (liveEnemies(C).length >= 6) break;
      spawnEnemy(C, e.unit, ctx.src);
    }
    return;
  }
  let unit = e.unit;
  if (e.side === "ally" && e.from === "target") {
    const t = ctx.target;
    if (!t || t.kind !== "enemy" || !isAlive(t) || t.tier === "boss") return;
    unit = "conv_" + t.id;
    (C.tempUnits || (C.tempUnits = {}))[unit] = { name: t.name, icon: t.icon, hp: Math.max(6, Math.ceil(t.hp)), moves: (t.def.moves || []).filter((m) => m.intent !== "cast").slice(0, 3) };
    if (e.removeTarget) { t.hp = 0; t.dead = true; t.block = 0; t.intent = null; t.converted = true; }
  }
  if (unit === "random_pet") unit = randomPetId(C);
  if (unit) summonAlly(C, unit);
});

op("transform", (ctx, e) => {
  const C = ctx.C;
  if (!C) return;
  let inst = null;
  if (e.target === "hand_random") inst = C.rng.pick(C.pile.hand.filter((c) => c !== ctx.cardInst));
  else inst = ctx.cardInst;
  if (!inst) return;
  const fresh = makeInst(C, e.card, inst.up);
  inst.id = fresh.id;
  inst.def = fresh.def;
});

op("add_card", (ctx, e) => {
  const to = e.to || "hand";
  const count = Math.max(1, Math.floor(num(ctx, e.count, 1)));
  let id = e.card;
  if (!ctx.C) { if (ctx.run && id && id !== "last_exhausted") for (let i = 0; i < count; i++) ctx.run.deck.push({ id, up: !!e.upgraded }); return; }
  const C = ctx.C;
  if (id === "last_exhausted") {
    const c = C.lastExhausted;
    if (!c || !C.pile.exhaust.includes(c)) return;
    C.pile.exhaust.splice(C.pile.exhaust.indexOf(c), 1);
    if (C.pile.hand.length < 10) C.pile.hand.push(c); else C.pile.discard.push(c);
    return;
  }
  addCards(C, id, to, count, !!e.upgraded);
});

op("random_card", (ctx, e) => {
  const data = (ctx.C && ctx.C.data) || ctx.data;
  if (!data || !data.randomCardPool) return;
  const pool = data.randomCardPool(e.pool || "any", e.rarity);
  if (!pool.length) return;
  const rng = rngOf(ctx);
  const to = e.to || "hand";
  const c = pool[Math.floor(rng.next() * pool.length)];
  if (!ctx.C) { if (ctx.run) ctx.run.deck.push({ id: c.id, up: false }); return; }
  if (to === "deck_permanent") { ctx.C.run && ctx.C.run.deck.push({ id: c.id, up: false }); return; }
  addCards(ctx.C, c.id, to, 1, false);
  if (e.cost !== undefined && to === "hand") {
    const inst = ctx.C.pile.hand[ctx.C.pile.hand.length - 1];
    if (inst && inst.id === c.id) inst.costSet = num(ctx, e.cost);
  }
});

op("conditional", (ctx, e) => {
  if (evalCond(ctx, e.if)) runEffects(ctx, e.then);
  else if (e.else) runEffects(ctx, e.else);
});
op("repeat", (ctx, e) => {
  const n = Math.max(0, Math.floor(num(ctx, e.times, 1)));
  for (let i = 0; i < n; i++) runEffects(ctx, e.effects);
});

op("set_form", (ctx, e) => { if (ctx.C) ctx.C.player.form = e.value === "none" || e.value === null ? null : e.value; });
op("set_stance", (ctx, e) => { if (ctx.C) ctx.C.player.stance = e.value === "none" ? null : e.value; });
op("set_aspect", (ctx, e) => { if (ctx.C) ctx.C.player.aspect = e.value === "none" ? null : e.value; });
// A Seal granted by gear/relics/talents has no card in ctx, so it borrows the Judgement payload of the Seal card
// that normally sets it (same id, same amounts). Without this the granted Seal was consumed for nothing.
function defaultSealFx(C, seal) {
  if (!seal || !C || !C.data || !C.data.allCards) return null;
  const hit = C.data.allCards().find((c) => c && c.type === "seal" && c.onJudge && (c.effects || []).some((x) => x.op === "set_seal" && x.value === seal));
  return hit ? hit.onJudge : null;
}
op("set_seal", (ctx, e) => {
  if (!ctx.C) return;
  const p = ctx.C.player;
  p.seal = e.value === "none" ? null : e.value;
  p.sealFx = ctx.card && ctx.card.onJudge ? ctx.card.onJudge : defaultSealFx(ctx.C, p.seal);
});
op("judgement", (ctx) => { if (ctx.C) judge(ctx.C, ctx); });
op("pet_action", (ctx, e) => {
  if (!ctx.C) return;
  if (e.action === "sacrifice") sacrificePet(ctx.C);
  else petAct(ctx.C);
});
op("totem", (ctx, e) => { if (ctx.C) placeTotem(ctx.C, e.slot, e.unit); });

op("scry", (ctx, e) => {
  const C = ctx.C;
  if (!C) return;
  const n = Math.min(Math.floor(num(ctx, e.count, 1)), C.pile.draw.length);
  if (!n) return;
  if (C.interactive) { (C.pending || (C.pending = [])).push({ type: "scry", count: n }); return; }
  const top = C.pile.draw.slice(-n);
  for (const c of top) if (cardKeepValue(c) < 0) { C.pile.draw.splice(C.pile.draw.indexOf(c), 1); C.pile.discard.push(c); }
});

op("gold", (ctx, e) => {
  const run = ctx.C ? ctx.C.run : ctx.run;
  if (run) run.gold = Math.max(0, run.gold + Math.floor(num(ctx, e.amount)));
});
op("max_hp", (ctx, e) => {
  const run = ctx.C ? ctx.C.run : ctx.run;
  const amt = Math.floor(num(ctx, e.amount));
  if (ctx.C && e.combat) { // "+N max HP this combat" (Dire Bear Form): the hero only; finishCombat takes it back (10-29 report: it stuck for the run)
    const p = ctx.C.player; p.maxHp = Math.max(1, p.maxHp + amt); p.hp = Math.min(p.maxHp, p.hp + (amt > 0 ? amt : 0)); ctx.C.tempMaxHp = (ctx.C.tempMaxHp || 0) + amt; return;
  }
  if (run) { run.maxHp = Math.max(1, run.maxHp + amt); run.hp = Math.min(run.maxHp, Math.max(1, run.hp + (amt > 0 ? amt : 0))); }
  if (ctx.C) { const p = ctx.C.player; p.maxHp = Math.max(1, p.maxHp + amt); p.hp = Math.min(p.maxHp, p.hp + (amt > 0 ? amt : 0)); }
});

op("double_block", (ctx) => { if (ctx.C) ctx.C.player.block *= 2; });
op("double_damage_next", (ctx) => { if (ctx.C) { const pl = ctx.C.player; pl.dblNext = true; pl.st = pl.st || {}; pl.st.double_next = 1; } });
// A cast bar, an explicitly interruptible move, or a caster's spell (heal / Polymorph-style debuff / buff / summon) can be interrupted.
const interruptible = (t) => { const it = t.intent, mv = it.move || {}; return it.kind === "cast" || !!mv.interruptible || (hasTrait(t, "caster") && ["heal", "debuff", "buff", "summon"].includes(it.kind)); };
op("cast_interrupt", (ctx, e) => {
  if (!ctx.C) return;
  const tg = ctx.trapFiring ? [ctx.attacker] : resolveTargets(ctx, e.target, "enemy");
  for (const t of tg) {
    if (t && t.intent && (interruptible(t) || ctx.trapFiring)) { t.interrupted = true; fx(ctx.C, { t: "interrupt", uid: t.uid }); }
    else if (t && !ctx.trapFiring && isAlive(t)) fx(ctx.C, { t: "miss", uid: t.uid, text: "Nothing to interrupt", kind: "gold" });
  }
});
// Taunt: single-target enemy attacks this round go to you (default: Target Dummy, Growl) or, with to:"pet", to your pet/totems (Distracting Shot)
op("taunt", (ctx, x) => { // a totem's taunt (Stoneclaw) pulls attacks onto THAT totem; it used to set "self" and send every hit to the hero (10-29 report)
  if (!ctx.C || ctx.srcKind === "enemy") return;
  ctx.C.player.tauntRound = ctx.srcKind === "totem" && ctx.src && ctx.src.uid ? ctx.src.uid : x && x.to === "pet" ? "pet" : "self";
});
op("revive", (ctx, e) => {
  const C = ctx.C;
  if (!C) return;
  const pct = num(ctx, e.pct, 50);
  if (ctx.srcKind === "enemy" && e.target !== "pet") {
    const dead = C.enemies.find((d) => d.dead && !d.noRevive);
    if (dead) { dead.dead = false; dead.hp = Math.max(1, Math.ceil(dead.maxHp * pct / 100)); dead.st = {}; dead.revived = true; dead.skipTurns = 1; fx(C, { t: "revive", uid: dead.uid }); }
    return;
  }
  if (e.target === "pet") { revivePet(C, pct); return; }
  C.player.reviveArmed = Math.max(C.player.reviveArmed || 0, pct); // once per combat; spent in damage.checkDeaths
});
op("end_turn", (ctx) => { if (ctx.C) ctx.C.endTurnRequested = true; });
// Hearthstone: in a fight it ends the combat now with no rewards (run.afterCombat sends the hero back to the map); in an event it flags the retreat
op("retreat", (ctx) => { if (ctx.C) { ctx.C.result = "retreat"; ctx.C.phase = "over"; } else if (ctx.run) ctx.run.retreat = true; });
// flags, not ops: tolerated so a stray flag in an effects array does not fail validation
op(["retain", "ethereal", "innate", "unplayable"], () => {});

installMoreOps(op, { num });
export const OP_NAMES = Object.keys(OPS);

export function runEffect(ctx, e) {
  if (!e || !e.op) return;
  const fn = OPS[e.op];
  if (!fn) {
    if (ctx.C) log(ctx.C, `[unknown op ${e.op}]`);
    return;
  }
  // end_turn from the Hearthstone card in run-mode means "retreat from event"
  if (e.op === "end_turn" && !ctx.C) { if (ctx.run) ctx.run.retreat = true; return; }
  fn(ctx, e);
}

export function runEffects(ctx, effects) {
  if (!effects) return;
  const C = ctx.C;
  for (let i = 0; i < effects.length; i++) {
    // a killing blow ends the fight, but the rest of the card still pays out self-heals (Death Coil)
    if (C && C.result && !(C.result === "win" && effects[i] && effects[i].op === "heal")) continue;
    const before = C && C.pending ? C.pending.length : 0;
    runEffect(ctx, effects[i]);
    // an interactive scry waits for the player's choice: the rest of the card (e.g. Detect Magic's draw) runs after it resolves
    const pd = C && C.pending && C.pending.length > before ? C.pending[C.pending.length - 1] : null;
    if (pd && pd.type === "scry" && i < effects.length - 1) { pd.after = { ctx, effects: effects.slice(i + 1) }; return; }
  }
}

export { hasFlag, hasTrait, modeOf };
