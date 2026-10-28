// Talent hooks RUNTIME (Talents V2). Talents stamp run modifiers on run.talents (engine/talents.js talentMods); this module turns the
// V2 hook keys (talentHookDefs.js) into combat behaviour. No parallel event system: it rides the relic trigger bus (relics.fire calls
// talentFire) plus six tiny inline seams where a number must change mid-calculation:
//   damage.js dealDamage  -> talentDamage (deal), talentTaken (receive), talentBlocked (revenge), talentThorns, talentBlock (card Block)
//   deck.js cardCost      -> talentCost          combat.js playCard -> talentSweep, talentNoExhaust      combat.js startPlayerTurn -> talentCarryBlock
//   effects.js apply/damage ops -> talentApplyBonus, talentSkipSelfHit                   run.js newRun -> addTalentGrants
// Everything is a no-op when run.talents has no V2 key (headless sim without talents, legacy classes, old saves, mock runs).
import { addRes, getRes } from "./resources.js?v=20261028e";
import { applyStatus } from "./status.js?v=20261028e";
import { gainBlock, healEntity, isAlive, fx, log, dealDamage } from "./damage.js?v=20261028e";
import { drawCards } from "./deck.js?v=20261028e";
import { runEffects, num } from "./effects.js?v=20261028e";
import { classFire, classDeal, classTaken } from "./talents-v2/hooks.js?v=20261028e"; // per-class V2 runtimes
import { HEAVY_HIT, ENRAGE_RAGE, GUARD_BLOCK, LAST_STAND, SWEEP_RAGE, RAGE_PER_DMG, WOUNDED_PCT } from "./talentHookDefs.js?v=20261028e";

const T = (C) => (C && C.run && C.run.talents) || null;
/** value of a hook (0 when absent); `arg` = card id or "card:status" */
export function tv(C, key, arg) { const t = T(C); return t ? (t[arg ? `${key}:${arg}` : key] | 0) : 0; }
const st = (C) => C.tal || (C.tal = { turn: 0, atk: 0, ramp: 0, boost: 0, drew: false, hurt: false, deflected: false, sweepTurn: -1, guarded: false, stunned: false });
const isAttack = (def) => !!def && def.type === "attack";
const usesRage = (C) => !!(C.cls && C.cls.resource && C.cls.resource.id === "rage");

// ---- relic-bus handler (relics.fire -> here, every event name) -------------------------------------------------------------------
export function talentFire(C, name, extra = {}) {
  if (!T(C)) return;
  classFire(C, name, extra);
  const S = st(C), p = C.player;
  if (name === "on_combat_start") {
    const armor = tv(C, "h_armor");
    if (armor > 0) applyStatus(C, p, "armor", armor);
    if (usesRage(C)) { const r = tv(C, "start_rage"); if (r > 0) addRes(C, "rage", r); }
  } else if (name === "on_turn_start") {
    S.turn = C.turn; S.atk = 0; S.ramp = 0; S.drew = false; S.hurt = false; S.deflected = false;
    const b = tv(C, "turn_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
    if (usesRage(C)) {
      const r = tv(C, "turn_rage"); if (r > 0) addRes(C, "rage", r);
      const rb = tv(C, "rage_block");
      if (rb > 0) { const g = Math.min(rb, Math.floor(getRes(C, "rage") / RAGE_PER_DMG)); if (g > 0) gainBlock(C, p, g, { raw: true }); }
    }
  } else if (name === "on_card_played") {
    const def = extra.card;
    if (def && usesRage(C)) { const r = tv(C, "card_rage", def.id); if (r > 0) addRes(C, "rage", r); }
    if (def && extra.enemy && isAlive(extra.enemy)) { // card_inflict: extra statuses on the card's target (Mortal Strike: Bleed)
      const t0 = T(C);
      for (const k of Object.keys(t0)) if (k.startsWith(`card_inflict:${def.id}:`)) applyStatus(C, extra.enemy, k.split(":")[2], t0[k] | 0);
    }
  } else if (name === "on_attack") {
    S.atk++;
    if (S.boost) S.boost = 0; // Enrage is spent by the Attack that just resolved
    const en = extra.enemy;
    const stun = tv(C, "first_stun");
    if (stun > 0 && !S.stunned && en && isAlive(en)) { S.stunned = true; applyStatus(C, en, "stun", stun); }
    const bleed = tv(C, "attack_bleed");
    if (bleed > 0 && en && isAlive(en)) applyStatus(C, en, "bleed", bleed);
    if (usesRage(C)) { const r = tv(C, "attack_rage"); if (r > 0) addRes(C, "rage", r); }
    const heal = tv(C, "attack_heal"); if (heal > 0) healEntity(C, p, heal);
    const ramp = tv(C, "attack_ramp"); if (ramp > 0) S.ramp += ramp;
    const need = tv(C, "attack_draw");
    if (need > 0 && !S.drew && S.atk >= need) { S.drew = true; drawCards(C, 1); }
  } else if (name === "on_hp_loss") {
    const hb = tv(C, "hurt_boost"); if (hb > 0) S.boost = hb;
    const hh = tv(C, "hurt_heal");
    if (hh > 0 && !S.hurt && isAlive(p)) { S.hurt = true; healEntity(C, p, hh); }
    if (tv(C, "low_hp_guard") > 0 && !S.guarded && isAlive(p) && p.hp <= p.maxHp * LAST_STAND.hpPct / 100) {
      S.guarded = true;
      gainBlock(C, p, LAST_STAND.block, { raw: true });
      healEntity(C, p, Math.ceil(p.maxHp * LAST_STAND.healPct / 100));
      log(C, "Last Stand!");
      fx(C, { t: "miss", uid: "player", text: "LAST STAND", kind: "gold" });
    }
  }
}

// ---- dealing damage (damage.js, after damageBonus; preview.js passes dry:true) ---------------------------------------------------
/** base = the hit's amount before any modifier. Returns the adjusted running amount. */
export function talentDamage(C, src, tgt, amt, o, base) {
  if (!T(C) || !tgt || tgt.kind !== "enemy" || o.kind === "thorns") return amt;
  amt = classDeal(C, src, tgt, amt, o, base); // per-class hooks see every hit (spells, pets, totems)
  if (!src || src.kind !== "player") return amt;
  const def = o.card;
  if (!isAttack(def)) return amt;
  const S = st(C), p = C.player;
  let a = amt;
  a += tv(C, "card_dmg", def.id);
  const hv = tv(C, "heavy_hit"); if (hv > 0 && base >= HEAVY_HIT) a += hv;
  const bd = tv(C, "bleed_dmg"); if (bd > 0 && tgt.st && tgt.st.bleed > 0) a += bd;
  const wd = tv(C, "wounded_dmg"); if (wd > 0 && tgt.hp <= tgt.maxHp * WOUNDED_PCT / 100) a += wd;
  if (usesRage(C)) {
    const rc = tv(C, "rage_dmg"); if (rc > 0) a += Math.min(rc, Math.floor(getRes(C, "rage") / RAGE_PER_DMG));
    const ed = tv(C, "enrage_dmg"); if (ed > 0 && getRes(C, "rage") >= ENRAGE_RAGE) a += ed;
  }
  const gd = tv(C, "guard_dmg"); if (gd > 0 && p.block >= GUARD_BLOCK) a += gd;
  a += S.ramp + S.boost;
  const dw = tv(C, "death_wish"); if (dw > 0) a = Math.floor(a * (100 + dw) / 100);
  const cr = tv(C, "crit");
  if (cr > 0 && !o.dry && C.rng && C.rng.chance(cr / 100)) { a *= 2; fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" }); }
  return a;
}
/** damage the player is about to take from an enemy attack (after takenAdjust) */
export function talentTaken(C, tgt, taken, src, o) {
  if (T(C) && tgt && tgt.kind === "player" && taken > 0) taken = classTaken(C, tgt, taken, src, o);
  if (!T(C) || !tgt || tgt.kind !== "player" || !src || src.kind !== "enemy" || (o.kind || "attack") !== "attack" || taken <= 0) return taken;
  let a = taken;
  const dw = tv(C, "death_wish"); if (dw > 0) a = Math.floor(a * (100 + Math.floor(dw / 2)) / 100);
  const df = tv(C, "deflect");
  if (df > 0 && !o.dry) { const S = st(C); if (!S.deflected) { S.deflected = true; a = Math.max(1, a - Math.floor(a * Math.min(90, df) / 100)); } }
  return a;
}
/** extra Thorns while Block is up (Defiance); `blocked`/`block` are evaluated after the hit so a hit that eats the last Block still counts */
export function talentThorns(C, tgt, blocked) {
  const v = tv(C, "block_thorns");
  return v > 0 && (blocked > 0 || tgt.block > 0) ? v : 0;
}
/** an enemy attack was fully absorbed by Block: Revenge */
export function talentBlocked(C, tgt, src, blocked, hpLoss, kind) {
  const v = tv(C, "block_revenge");
  if (v > 0 && kind === "attack" && src && src.kind === "enemy" && blocked > 0 && hpLoss === 0 && isAlive(src)) {
    dealDamage(C, tgt, src, v, { kind: "thorns", noMods: true, school: "physical" });
  }
}
/** + Block on a card's own Block (Shield Specialization) */
export function talentBlock(C, o) { return o && o.cardId ? tv(C, "card_block", o.cardId) : 0; }

// ---- card / turn seams -----------------------------------------------------------------------------------------------------------
export function talentCost(C, inst) { return T(C) && inst && inst.def ? tv(C, "card_cost", inst.def.id) : 0; }
export function talentNoExhaust(C, def) { return !!(T(C) && def && tv(C, "card_noexhaust", def.id) > 0); }
export function talentCarryBlock(C, block) { const v = tv(C, "block_carry"); return v > 0 ? Math.floor(block * Math.min(100, v) / 100) : 0; }
export function talentApplyBonus(ctx, status) {
  const C = ctx.C;
  if (!T(C) || ctx.srcKind !== "player" || !ctx.card) return 0;
  return tv(C, "card_apply", `${ctx.card.id}:${status}`);
}
export function talentSkipSelfHit(ctx) { return !!(ctx.C && T(ctx.C) && ctx.srcKind === "player" && ctx.card && tv(ctx.C, "card_nohurt", ctx.card.id) > 0); }
/** Sweeping Strikes: the first single-target Attack each turn also hits ONE other enemy for half its base damage (called right after the
 * card's effects). The splash carries no card, so card/bleed/Impale talent bonuses and on-attack procs don't repeat on it (2026-10-27:
 * the old full-copy-to-every-enemy splash one-shot whole Act 1 packs with a single Heroic Strike). */
export function talentSweep(C, ctx, def) {
  if (!T(C) || !isAttack(def) || tv(C, "first_aoe") <= 0) return;
  const S = st(C);
  if (S.sweepTurn === C.turn) return;
  S.sweepTurn = C.turn;
  if (usesRage(C)) addRes(C, "rage", SWEEP_RAGE);
  const dmg = (def.effects || []).filter((e) => e && (e.op === "damage" || e.op === "aoe") && e.target !== "self" && e.target !== "all_enemies" && e.op !== "aoe");
  if (!dmg.length) return;
  const en = C.enemies.find((x) => x !== ctx.target && isAlive(x));
  if (!en || C.result) return;
  const half = dmg.map((e) => ({ op: "damage", amount: Math.max(1, Math.floor(num(ctx, e.amount) / 2)), times: e.times, school: e.school || def.school, target: "target" }));
  runEffects({ ...ctx, card: null, target: en, isCardPrimary: false }, half);
}
/** talent-learned cards added to a fresh run's deck (run.js newRun) */
export function addTalentGrants(run, data) {
  const T0 = run && run.talents;
  if (!T0) return;
  for (const k of Object.keys(T0)) {
    if (!k.startsWith("grant:") || !(T0[k] > 0)) continue;
    const id = k.slice(6);
    if (data && data.card && !data.card(id, run.classId)) continue;
    run.deck.push({ id, up: false });
  }
}
