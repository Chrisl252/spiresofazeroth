// Talents V2 hook RUNTIME for the rogue. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_kill, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Per-fight state lives on C.talrogue. Keys are all "rog_*" (defs in rogue.defs.js); the generic hooks (card_dmg, crit, ...) run in talentHooks.js.
import { tv } from "../talentHooks.js";
import { addRes, getRes } from "../resources.js";
import { applyStatus } from "../status.js";
import { gainBlock, healEntity, isAlive, fx } from "../damage.js";

const PREP_MAX = 3; // Preparation: returns per fight
const NO_RETURN = new Set(["sprint", "preparation", "adrenaline-rush", "vigor", "premeditation", "distract"]);
const memo = new WeakMap();
const active = (C) => {
  let a = memo.get(C);
  if (a === undefined) { const t = C && C.run && C.run.talents; a = !!t && Object.keys(t).some((k) => k.startsWith("rog_")); memo.set(C, a); }
  return a;
};
const R = (C) => C.talrogue || (C.talrogue = { atk: 0, cp: 0, boost: 0, boostNext: 0, cbUsed: false, preps: 0, seal: false, init: false, prep: false });
const effs = (def) => (def && def.effects) || [];
const isFin = (def) => effs(def).some((e) => e && e.op === "spend_resource" && e.resource === "combo");
const isDmgFin = (def) => isFin(def) && effs(def).some((e) => e && e.op === "damage");
const isBuilder = (def) => effs(def).some((e) => e && e.op === "gain_resource" && e.resource === "combo");
const stealthed = (C) => (C.player.st.stealth | 0) > 0;
const chance = (C, pct) => pct > 0 && !!C.rng && C.rng.chance(Math.min(100, pct) / 100);
const addCombo = (C, n) => addRes(C, "combo", n);

function fire(C, name, extra = {}) {
  if (!active(C)) return;
  const rt = R(C), p = C.player;
  if (name === "on_combat_start") {
    const ss = tv(C, "rog_start_stealth"); if (ss > 0) applyStatus(C, p, "stealth", ss);
    const cs = tv(C, "rog_combo_start"); if (cs > 0) addCombo(C, cs);
    const pm = tv(C, "rog_premed"); if (pm > 0 && stealthed(C)) addCombo(C, pm);
  } else if (name === "on_turn_start") {
    rt.atk = 0; rt.seal = false; rt.init = false; rt.prep = false;
    if (rt.boostNext > 0) { rt.boost = Math.max(rt.boost, rt.boostNext); rt.boostNext = 0; }
    const sb = tv(C, "rog_stealth_block"); if (sb > 0 && stealthed(C)) gainBlock(C, p, sb, { raw: true });
    const rush = tv(C, "rog_rush"); if (rush > 0 && !rt.rushed && getRes(C, "combo") >= 5) { rt.rushed = true; p.energy += rush; fx(C, { t: "miss", uid: "player", text: "ADRENALINE RUSH", kind: "gold" }); }
  } else if (name === "on_kill") {
    const rem = tv(C, "rog_remorseless"); if (rem > 0) rt.boostNext = rem;
    const kh = tv(C, "rog_kill_heal"); if (kh > 0) healEntity(C, p, kh);
  } else if (name === "on_card_played") {
    const def = extra.card; if (!def) return;
    if (isFin(def)) {
      const spent = rt.cp;
      const fb = tv(C, "rog_finisher_block"); if (fb > 0 && spent > 0) gainBlock(C, p, fb * spent, { raw: true });
      if (spent > 0 && chance(C, tv(C, "rog_ruthless"))) addCombo(C, 1);
      if (isDmgFin(def) && tv(C, "rog_cold_blood") > 0) rt.cbUsed = true;
    }
    if (def.type === "attack") {
      if (!rt.seal) { rt.seal = true; if (chance(C, tv(C, "rog_seal_fate"))) addCombo(C, 1); }
      if (!rt.init && stealthed(C)) { rt.init = true; if (chance(C, tv(C, "rog_initiative"))) addCombo(C, 1); }
    }
    if (tv(C, "rog_prep") > 0 && !rt.prep && rt.preps < PREP_MAX && !NO_RETURN.has(def.id)) {
      const ex = C.pile.exhaust, last = ex[ex.length - 1];
      if (last && last.def && last.def.id === def.id) { ex.pop(); C.pile.discard.push(last); rt.prep = true; rt.preps++; fx(C, { t: "miss", uid: "player", text: "PREPARATION", kind: "gold" }); }
    }
  } else if (name === "on_attack") {
    rt.atk++;
    rt.boost = 0; // Remorseless Attacks is spent by the Attack that just resolved
    if (rt.boostNext > 0) { rt.boost = rt.boostNext; rt.boostNext = 0; }
    const en = extra.enemy, ap = tv(C, "rog_atk_poison");
    if (ap > 0 && en && isAlive(en)) applyStatus(C, en, "poison", ap);
  }
  rt.cp = getRes(C, "combo");
}

function deal(C, src, tgt, amt, o, base) {
  if (!active(C) || !src || src.kind !== "player" || !tgt || tgt.kind !== "enemy") return amt;
  const def = o && o.card; if (!def || def.type !== "attack") return amt;
  const rt = R(C), fin = isDmgFin(def);
  if (fin && !o.dry) rt.cp = getRes(C, "combo"); // Combo Points about to be spent (damage lands before the spend)
  let a = amt;
  if (fin) { const fd = tv(C, "rog_finisher_dmg"); if (fd > 0) a += fd * getRes(C, "combo"); }
  if (isBuilder(def)) a += tv(C, "rog_builder_dmg");
  if (tgt.st && tgt.st.poison > 0) a += tv(C, "rog_poison_dmg");
  if (tgt.st && (tgt.st.weak > 0 || tgt.st.vulnerable > 0 || tgt.st.stun > 0 || tgt.st.sleep > 0)) a += tv(C, "rog_debuff_dmg");
  if (stealthed(C)) a += tv(C, "rog_stealth_dmg");
  a += rt.atk >= 1 ? tv(C, "rog_second_strike") : tv(C, "rog_first_strike");
  a += rt.boost;
  if (fin) {
    if (tv(C, "rog_cold_blood") > 0 && !rt.cbUsed) a *= 2;
    const fc = tv(C, "rog_finisher_crit");
    if (fc > 0 && !o.dry && chance(C, fc)) { a *= 2; fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" }); }
  }
  return a;
}

function taken(C, tgt, amt, src, o) {
  if (!active(C) || !tgt || tgt.kind !== "player" || !src || src.kind !== "enemy" || (o.kind || "attack") !== "attack" || amt <= 0 || o.dry) return amt;
  if (chance(C, tv(C, "rog_dodge"))) { fx(C, { t: "miss", uid: "player", text: "DODGE", kind: "gold" }); return 0; }
  return amt;
}

export default { fire, deal, taken };
