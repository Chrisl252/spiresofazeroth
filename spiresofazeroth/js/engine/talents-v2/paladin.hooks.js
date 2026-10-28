// Talents V2 hook RUNTIME for the paladin. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talpaladin (C is one combat).
import { tv } from "../talentHooks.js?v=20261028e";
import { gainBlock, healEntity, isAlive, dealDamage, fx, log } from "../damage.js?v=20261028e";
import { PAL_LOW_HP } from "./paladin.defs.js?v=20261028e";

const st = (C) => C.talpaladin || (C.talpaladin = { seal: null, fx: null, hb: 0, pend: 0 });
const hasHeal = (list) => Array.isArray(list) && list.some((e) => e && ((e.op === "heal" && (e.amount | 0) > 0) || hasHeal(e.then) || hasHeal(e.else)));
const isBlessing = (id) => /^blessing-of-/.test(id) || /-aura$/.test(id);

function fire(C, name, extra = {}) {
  if (!C || !C.run || !C.run.talents || !C.player) return;
  const p = C.player, S = st(C);
  if (name === "on_combat_start") { S.seal = p.seal || null; S.fx = p.sealFx || null; S.hb = 0; S.pend = 0; return; }
  if (name === "on_card_played") {
    const def = extra.card; if (!def) return;
    const isJudge = (def.effects || []).some((e) => e && e.op === "judgement");
    const healing = hasHeal(def.effects) || (isJudge && hasHeal(S.fx));
    if (healing) {
      const amp = tv(C, "pal_heal_amp"); if (amp > 0) healEntity(C, p, amp);
      const hb = tv(C, "pal_heal_block"); if (hb > 0) gainBlock(C, p, hb, { raw: true });
      const hd = tv(C, "pal_heal_dmg");
      if (hd > 0) { const t = extra.enemy && isAlive(extra.enemy) ? extra.enemy : C.enemies.find(isAlive); if (t && !C.result) dealDamage(C, p, t, hd, { kind: "effect", school: "holy" }); }
      const boost = tv(C, "pal_heal_boost"); if (boost > 0) { if (def.type === "attack") S.pend = boost; else S.hb = boost; }
    }
    if (isBlessing(def.id)) { const b = tv(C, "pal_bless_block"); if (b > 0) gainBlock(C, p, b, { raw: true }); }
    if (isJudge && !p.seal && S.seal) {
      const keep = tv(C, "pal_seal_keep");
      if (keep > 0 && C.rng && C.rng.chance(Math.min(100, keep) / 100)) {
        p.seal = S.seal; p.sealFx = S.fx; log(C, "Your Seal holds.");
        fx(C, { t: "miss", uid: "player", text: "SEAL KEPT", kind: "gold" });
      }
    }
    S.seal = p.seal || null; S.fx = p.sealFx || null;
  } else if (name === "on_attack") {
    S.hb = S.pend | 0; S.pend = 0; // the boost is spent by the Attack that just resolved; a heal on this very Attack arms the next one
  } else if (name === "on_damage_taken") {
    const a = extra.attacker, v = tv(C, "pal_retaliate");
    if (v > 0 && a && a.kind === "enemy" && isAlive(a) && !C.result) dealDamage(C, p, a, v, { kind: "thorns", noMods: true, school: "holy" });
  }
}

function deal(C, src, tgt, amt, o, base) {
  if (!C || !C.run || !C.run.talents || !src || src.kind !== "player" || !o || !o.card) return amt;
  const def = o.card, S = st(C);
  let a = amt;
  if (def.type === "seal") { if (base > 0) a += tv(C, "pal_seal_cast_dmg"); }
  else if (def.type === "attack") {
    if (C.player.seal) a += tv(C, "pal_seal_dmg");
    const sd = tv(C, "pal_stunned_dmg"); if (sd > 0 && tgt.st && (tgt.st.stun > 0 || tgt.st.sleep > 0)) a += sd;
    if (S.hb > 0) a += S.hb;
  }
  const sa = tv(C, "pal_sanctity");
  if (sa > 0 && (o.school || "physical") === "holy" && a > 0) a += Math.floor(a * sa / 100);
  return a;
}

function taken(C, tgt, amt, src, o) {
  if (!C || !C.run || !C.run.talents || !tgt || tgt.kind !== "player" || !src || src.kind !== "enemy" || (o.kind || "attack") !== "attack") return amt;
  const v = tv(C, "pal_ardent");
  if (v > 0 && tgt.hp <= tgt.maxHp * PAL_LOW_HP / 100) return Math.max(1, amt - Math.floor(amt * Math.min(90, v) / 100));
  return amt;
}

export default { fire, deal, taken };
