// Talents V2 hook RUNTIME for the hunter. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talhunter (C is one combat).
// Seams used: traps are armed in C.traps ({name, effects}); on arming we append effect ops to the new trap (it springs through runEffects,
// so Weak / damage land on the attacker). Pet hits reach deal() with src.kind === "pet" and no o.card. The pet acts at the end of the player turn.
import { tv } from "../talentHooks.js?v=20261029d";
import { applyStatus } from "../status.js?v=20261029d";
import { gainBlock, healEntity, isAlive, fx } from "../damage.js?v=20261029d";
import { drawCards } from "../deck.js?v=20261029d";
import { revivePet, petAct } from "../resources.js?v=20261029d";

const KEYS = ["hun_pet_hp", "hun_hawk_dmg", "hun_hawk_start", "hun_pet_block", "hun_open_block", "hun_pet_dmg", "hun_pet_revive", "hun_pet_crit", "hun_bond_heal",
  "hun_pet_swift", "hun_frenzy", "hun_pack_dmg", "hun_wrath", "hun_wrath_start", "hun_first_shot", "hun_shot_crit", "hun_crit_bonus", "hun_shot_block", "hun_shot_dmg",
  "hun_marked_dmg", "hun_silence", "hun_aura_crit", "hun_slayer", "hun_trap_weak", "hun_melee_crit", "hun_kill_heal", "hun_trap_block", "hun_trap_draw", "hun_trap_dmg", "hun_slay_all"];
const active = (C) => { const t = C && C.run && C.run.talents; if (!t) return false; for (const k of KEYS) if (t[k]) return true; return false; };
const S = (C) => C.talhunter || (C.talhunter = { shotTurn: -1, hawkTurn: -1, revived: false });
const atk = (o) => !!(o && o.card && o.card.type === "attack");
const ranged = (o) => atk(o) && o.card.range === "ranged";
const livePet = (C) => { const p = C.player && C.player.pet; return p && !p.down && p.hp > 0 ? p : null; };
const critFx = (C, tgt) => fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });

export default {
  fire(C, name, extra = {}) {
    if (!active(C)) return;
    const st = S(C), p = C.player, pet = p.pet;
    if (name === "on_combat_start") {
      const hp = tv(C, "hun_pet_hp");
      if (hp > 0 && pet) { pet.maxHp += hp; pet.hp += hp; }
      if (tv(C, "hun_hawk_start") > 0 && !p.aspect) p.aspect = "hawk";
      const ws = tv(C, "hun_wrath_start"); if (ws > 0 && pet) applyStatus(C, pet, "enrage", ws);
    } else if (name === "on_turn_start") {
      if (extra.first) { const ob = tv(C, "hun_open_block"); if (ob > 0) gainBlock(C, p, ob, { raw: true }); }
      const rv = tv(C, "hun_pet_revive");
      if (rv > 0 && pet && pet.down && !st.revived) { st.revived = true; revivePet(C, rv); fx(C, { t: "miss", uid: "pet", text: "REVIVED", kind: "gold" }); }
      const lp = livePet(C);
      const pb = tv(C, "hun_pet_block"); if (pb > 0 && lp) lp.block += pb;
      const bh = tv(C, "hun_bond_heal");
      if (bh > 0) { if (lp) healEntity(C, lp, bh * 2); else healEntity(C, p, bh); }
      if (extra.first) { const sw = tv(C, "hun_pet_swift"); for (let i = 0; i < sw; i++) petAct(C); }
    } else if (name === "on_card_played") {
      const def = extra.card;
      if (!def) return;
      if (def.trap) { // the trap armed by this card is the newest entry
        const tr = C.traps && C.traps[C.traps.length - 1];
        if (tr) {
          const add = [], weak = tv(C, "hun_trap_weak"), dmg = tv(C, "hun_trap_dmg");
          if (dmg > 0) add.push({ op: "damage", amount: dmg, target: "attacker" });
          if (weak > 0) add.push({ op: "apply", status: "weak", stacks: weak, target: "attacker" });
          if (add.length) tr.effects = [...tr.effects, ...add];
        }
        const tb = tv(C, "hun_trap_block"); if (tb > 0) gainBlock(C, p, tb, { raw: true });
        const td = tv(C, "hun_trap_draw"); if (td > 0) drawCards(C, td);
      }
      if (def.type === "attack" && p.aspect === "hawk") st.hawkTurn = C.turn;
      if (def.type === "attack" && def.range === "ranged") {
        const sb = tv(C, "hun_shot_block"); if (sb > 0) gainBlock(C, p, sb, { raw: true });
        const en = extra.enemy, sil = tv(C, "hun_silence");
        if (st.shotTurn !== C.turn && sil > 0 && en && isAlive(en)) {
          if (en.intent && en.intent.kind === "cast") { en.interrupted = true; fx(C, { t: "interrupt", uid: en.uid }); }
          applyStatus(C, en, "marked", sil);
        }
        st.shotTurn = C.turn; // spends the first-shot bonuses for this turn
      }
    } else if (name === "on_kill") {
      const kh = tv(C, "hun_kill_heal"); if (kh > 0) healEntity(C, p, kh);
    }
  },

  deal(C, src, tgt, amt, o, base) {
    if (!active(C) || !src) return amt;
    const st = S(C), dry = !!o.dry;
    let a = amt;
    if (src.kind === "pet") {
      a += tv(C, "hun_pet_dmg");
      const wr = tv(C, "hun_wrath"); if (wr > 0 && src.st && src.st.enrage > 0) a += Math.ceil(a * wr / 100);
      if (!dry) {
        const pc = tv(C, "hun_pet_crit");
        if (pc > 0 && C.rng && C.rng.chance(pc / 100)) { a *= 2; critFx(C, tgt); }
        const fr = tv(C, "hun_frenzy"); if (fr > 0) gainBlock(C, C.player, fr, { raw: true });
      }
      return a;
    }
    if (src.kind !== "player" || !atk(o)) return a;
    if (C.player.aspect === "hawk" && st.hawkTurn !== C.turn) { a += tv(C, "hun_hawk_dmg"); }
    a += tv(C, "hun_slay_all");
    if (livePet(C)) a += tv(C, "hun_pack_dmg");
    if (tgt.st && tgt.st.marked > 0) a += tv(C, "hun_marked_dmg");
    if (tgt.tier === "elite" || tgt.tier === "boss") a += tv(C, "hun_slayer");
    if (ranged(o)) {
      a += tv(C, "hun_shot_dmg");
      if (st.shotTurn !== C.turn) a += tv(C, "hun_first_shot");
      const cr = tv(C, "hun_shot_crit") + tv(C, "hun_aura_crit");
      if (cr > 0 && !dry && C.rng && C.rng.chance(cr / 100)) { a = a * 2 + tv(C, "hun_crit_bonus"); critFx(C, tgt); }
    } else if (o.card.range === "melee") {
      const mc = tv(C, "hun_melee_crit");
      if (mc > 0 && !dry && C.rng && C.rng.chance(mc / 100)) { a *= 2; critFx(C, tgt); }
    }
    return a;
  },
};
