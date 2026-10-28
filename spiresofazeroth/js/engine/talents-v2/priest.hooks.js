// Talents V2 hook RUNTIME for the priest. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talpriest (C is one combat).
import { tv } from "../talentHooks.js?v=20261028e";
import { applyStatus } from "../status.js?v=20261028e";
import { gainBlock, healEntity, isAlive, dealStatusDamage, dealDamage, fx } from "../damage.js?v=20261028e";
import { drawCards } from "../deck.js?v=20261028e";
import { PRI } from "./priest.defs.js?v=20261028e";

const S = (C) => C.talpriest || (C.talpriest = { first: false, silenced: false, healsTurn: 0, insp: 0, weave: 0 });
const isHealSpell = (d) => !!d && d.type === "skill" && (d.effects || []).some((e) => e && e.op === "heal");
const isShadowSpell = (d) => !!d && d.archetype === "shadow" && (d.type === "attack" || d.type === "skill");
const dotted = (e) => !!e && !!e.st && (e.st.poison > 0 || e.st.disease > 0);
/** Energy a card cost to play (form adjusted), for refunds */
function paid(C, d) {
  let c = typeof d.cost === "number" ? d.cost : 0;
  const f = C.player.form;
  if (d.formCost && typeof d.formCost === "object" && f && d.formCost[f] !== undefined) c += d.formCost[f]; // delta, same as deck.js cardCost
  return Math.max(0, c);
}

export default {
  fire(C, name, extra = {}) {
    const p = C.player;
    if (!p) return;
    if (name === "on_combat_start") {
      const s = S(C);
      s.first = false; s.silenced = false; s.healsTurn = 0; s.insp = 0; s.weave = 0;
      const vamp = tv(C, "pri_vamp"); if (vamp > 0) applyStatus(C, p, "vampiric_embrace", vamp);
    } else if (name === "on_turn_start") {
      const s = S(C);
      s.healsTurn = 0; s.insp = 0; s.weave = 0;
      const ob = tv(C, "pri_open_block"); if (ob > 0 && C.turn <= 1) gainBlock(C, p, ob, { raw: true });
      const inf = tv(C, "pri_infusion");
      if (inf > 0 && C.turn <= PRI.infusionTurns) gainBlock(C, p, inf, { raw: true });
      const od = tv(C, "pri_opening_draw"); if (od > 0 && C.turn <= 1) drawCards(C, od);
      const tap = tv(C, "pri_tap");
      if (tap > 0) { const n = C.enemies.filter((e) => isAlive(e) && dotted(e)).length; if (n > 0) healEntity(C, p, tap * n); }
      const amp = tv(C, "pri_dot_amp");
      if (amp > 0) for (const e of C.enemies) if (isAlive(e) && dotted(e) && !C.result) dealStatusDamage(C, e, amp, "shadow");
      if (tv(C, "pri_lightwell") > 0 && p.st.regen > 0) {
        const d = Math.min(PRI.lightwellCap, p.st.regen);
        for (const e of C.enemies) if (isAlive(e) && !C.result) dealStatusDamage(C, e, d, "holy");
      }
    } else if (name === "on_card_played") {
      const d = extra.card; if (!d) return;
      const s = S(C);
      const refund = tv(C, "pri_inner_focus");
      if (refund > 0 && !s.first) { s.first = true; const r = Math.min(refund, paid(C, d)); if (r > 0) p.energy += r; }
      s.first = true;
      if (d.type === "skill") {
        const sb = tv(C, "pri_skill_block"); if (sb > 0) gainBlock(C, p, sb, { raw: true });
        const sd = tv(C, "pri_skill_dmg"), tg = extra.enemy && isAlive(extra.enemy) ? extra.enemy : C.enemies.find(isAlive);
        if (sd > 0 && tg && !C.result) dealDamage(C, p, tg, sd, { school: "holy", kind: "effect" });
      }
      if (isHealSpell(d)) {
        const amp = tv(C, "pri_heal_amp"); if (amp > 0) healEntity(C, p, amp);
        const hb = tv(C, "pri_heal_block"); if (hb > 0) gainBlock(C, p, hb, { raw: true });
        const ins = tv(C, "pri_inspire"); if (ins > 0) s.insp = ins;
        const rf = tv(C, "pri_heal_refund");
        if (rf > 0 && s.healsTurn < rf && paid(C, d) > 0) p.energy += 1;
        s.healsTurn++;
      }
      if (d.id === "power-word-shield") {
        const pb = tv(C, "pri_pws_block"); if (pb > 0) gainBlock(C, p, pb, { raw: true });
        const ph = tv(C, "pri_pws_heal"); if (ph > 0) healEntity(C, p, ph);
      }
      const ch = tv(C, "pri_card_heal", d.id); if (ch > 0) healEntity(C, p, ch);
      if (isShadowSpell(d)) {
        const sb = tv(C, "pri_shadow_block"); if (sb > 0) gainBlock(C, p, sb, { raw: true });
        const sil = tv(C, "pri_silence"), en = extra.enemy;
        if (sil > 0 && !s.silenced && en && isAlive(en)) { s.silenced = true; applyStatus(C, en, "silence", sil); applyStatus(C, en, "weak", sil); }
        const w = tv(C, "pri_weaving"); if (w > 0) s.weave += w;
      }
    } else if (name === "on_attack") {
      S(C).insp = 0;
    } else if (name === "on_hp_loss") {
      const br = tv(C, "pri_brace");
      if (br > 0 && (extra.amount | 0) >= PRI.braceHit && isAlive(p)) gainBlock(C, p, br, { raw: true });
    }
  },

  deal(C, src, tgt, amt, o, base) {
    if (!src || src.kind !== "player" || !tgt || tgt.kind !== "enemy") return amt;
    const s = S(C), school = o.school, d = o.card;
    let a = amt;
    const inf = tv(C, "pri_infusion"); if (inf > 0 && d && C.turn <= PRI.infusionTurns) a += inf;
    if (school === "holy") {
      const hd = tv(C, "pri_holy_dmg"); if (hd > 0) a += src.st.regen > 0 ? hd * 2 : hd;
      const cr = tv(C, "pri_holy_crit");
      if (cr > 0 && !o.dry && C.rng && C.rng.chance(cr / 100)) {
        a *= 2; fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });
        const sg = tv(C, "pri_surge"); if (sg > 0) gainBlock(C, src, sg, { raw: true });
      }
    }
    if (school === "shadow") {
      const sd = tv(C, "pri_shadow_dmg"); if (sd > 0) a += tgt.st && tgt.st.poison > 0 ? sd * 2 : sd;
      a += s.weave;
      const fp = tv(C, "pri_form_power"); if (fp > 0 && src.form === "shadowform") a += fp;
    }
    if (s.insp > 0 && d && d.type === "attack") a += s.insp;
    return a;
  },

  taken(C, tgt, taken, src, o) {
    if (tv(C, "pri_form_power") > 0 && C.player.form === "shadowform" && taken > 0) {
      return Math.max(1, taken - Math.floor(taken * PRI.formTaken / 100));
    }
    return taken;
  },
};
