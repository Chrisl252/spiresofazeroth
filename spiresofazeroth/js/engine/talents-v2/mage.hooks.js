// Talents V2 hook RUNTIME for the mage. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talmage (C is one combat).
// Tooltips: mage.defs.js. Old-to-new table + sim numbers: docs/talents-v2/mage.md.
import { tv } from "../talentHooks.js?v=20261029a";
import { applyStatus } from "../status.js?v=20261029a";
import { addRes, getRes } from "../resources.js?v=20261029a";
import { gainBlock, healEntity, isAlive, fx } from "../damage.js?v=20261029a";
import { drawCards } from "../deck.js?v=20261029a";
import { MAG } from "./mage.defs.js?v=20261029a";

const M = (C) => C.talmage || (C.talmage = { turn: -1, impact: new Set(), pom: 0, last: null, absorbed: false, snapDrew: false, ign: 0 });
const isSpell = (o) => !!(o && o.card && o.card.type === "attack");

export function fire(C, name, extra = {}) {
  if (C.classId !== "mage") return;
  const p = C.player;
  if (name === "on_combat_start") {
    const ch = tv(C, "mag_charge_start"); if (ch > 0) addRes(C, "arcane_charges", ch);
    const ig = tv(C, "mag_ign_start"); if (ig > 0) addRes(C, "ignite", ig);
  } else if (name === "on_turn_start") {
    const S = M(C); S.turn = C.turn; S.impact = new Set(); S.pom = 0; S.last = null; S.absorbed = false; S.snapDrew = false;
    const sb = tv(C, "mag_soul"); if (sb > 0) gainBlock(C, p, sb + Math.floor(getRes(C, "ignite") / 3), { raw: true });
    const pm = tv(C, "mag_perma");
    if (pm > 0) { const n = C.enemies.filter((e) => isAlive(e) && e.st && (e.st.weak > 0 || e.st.frozen > 0)).length; if (n > 0) gainBlock(C, p, pm * n, { raw: true }); }
  } else if (name === "on_card_played") {
    const def = extra.card; if (!def) return;
    const S = M(C);
    const cc = tv(C, "mag_cardcharge", def.id); if (cc > 0) addRes(C, "arcane_charges", cc);
    if (def.archetype === "arcane") { const cl = tv(C, "mag_clear"); if (cl > 0 && C.rng && C.rng.chance(cl / 100)) addRes(C, "arcane_charges", 1); }
    if (def.id === "presence-of-mind") { const v = tv(C, "mag_pom"); if (v > 0) S.pom = v; }
    const el = tv(C, "mag_elements");
    if (def.archetype) { if (el > 0 && S.last && S.last !== def.archetype) gainBlock(C, p, el, { raw: true }); S.last = def.archetype; }
    if (def.id === "cold-snap") { const d = tv(C, "mag_snap"); if (d > 0 && !S.snapDrew) { S.snapDrew = true; drawCards(C, d); } }
    if (def.id === "ice-block") {
      const v = tv(C, "mag_iceblock");
      if (v > 0) { for (const e of C.enemies) if (isAlive(e)) applyStatus(C, e, "frozen", 1); healEntity(C, p, Math.ceil(p.maxHp * v / 100)); }
    }
    if ((def.id === "combustion" || def.id === "pyroblast") && S.ign > 0) { // Hot Streak: Burn from the Ignite the hit just spent
      const v = tv(C, "mag_comb"), n = Math.floor(S.ign * v / 100);
      if (v > 0 && n > 0 && extra.enemy && isAlive(extra.enemy)) applyStatus(C, extra.enemy, "burn", n);
    }
    S.ign = 0;
  } else if (name === "on_attack") {
    M(C).pom = 0; // Presence of Mind boosts the one Attack that follows it
  } else if (name === "on_hp_loss") {
    const ab = tv(C, "mag_absorb"), S = M(C);
    if (ab > 0 && !S.absorbed && isAlive(p)) { S.absorbed = true; gainBlock(C, p, ab, { raw: true }); }
  }
}

export function deal(C, src, tgt, amt, o, base) {
  if (C.classId !== "mage") return amt;
  if (!src || src.kind !== "player" || !isSpell(o) || !tgt || tgt.kind !== "enemy") return amt;
  const sch = o.school, S = M(C), dry = !!o.dry;
  let a = amt;
  const sp = tv(C, "mag_spow");
  if (sp > 0) { const k = `${C.actionId}:${tgt.uid}`; if (S.spowKey !== k) { a += sp; if (!dry) S.spowKey = k; } } // once per spell per target
  if (S.pom > 0) a += S.pom;
  let pct = 0;
  if (sch === "arcane") {
    if (o.card.id === "arcane-missiles") a += tv(C, "mag_focus");
    const ch = getRes(C, "arcane_charges");
    if (ch >= MAG.midCharges) { const mi = tv(C, "mag_mind"); if (mi > 0 && S.mindKey !== `${C.actionId}:${tgt.uid}`) { a += mi + 1; if (!dry) S.mindKey = `${C.actionId}:${tgt.uid}`; } }
    if (ch >= MAG.highCharges) pct += tv(C, "mag_apower");
  } else if (sch === "fire") {
    a += tv(C, "mag_firepower");
    const im = tv(C, "mag_impact");
    if (im > 0 && !S.impact.has(tgt.uid)) { a += im * 2; if (!dry) S.impact.add(tgt.uid); }
    if ((o.card.id === "combustion" || o.card.id === "pyroblast") && !dry) S.ign = getRes(C, "ignite");
    if (!dry) { const ig = tv(C, "mag_ignite"); if (ig > 0 && C.rng && C.rng.chance(ig / 100)) applyStatus(C, tgt, "burn", MAG.igniteBurn); }
  } else if (sch === "frost") {
    a += tv(C, "mag_pierce");
    if (tgt.st && tgt.st.weak > 0) a += tv(C, "mag_prec");
    if (!dry) { const fb = tv(C, "mag_frostbite"); if (fb > 0 && !(tgt.st && tgt.st.frozen > 0) && C.rng && C.rng.chance(fb / 100)) applyStatus(C, tgt, "frozen", 1); }
    if (tgt.st && tgt.st.frozen > 0) pct += tv(C, "mag_shatter");
  }
  if (pct > 0) a = Math.floor(a * (100 + pct) / 100);
  const cr = (sch === "fire" || sch === "frost") ? tv(C, "mag_crit", sch) : 0;
  if (cr > 0 && !dry && C.rng && C.rng.chance(cr / 100)) {
    a *= 2; fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });
    if (sch === "fire") addRes(C, "ignite", 1);
  }
  return a;
}

export function taken(C, tgt, amt, src, o) { return amt; }
export default { fire, deal, taken };
