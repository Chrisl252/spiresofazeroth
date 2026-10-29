// Talents V2 hook RUNTIME for the druid. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.taldruid (C is one combat).
import { tv } from "../talentHooks.js?v=20261029d";
import { addRes, getRes } from "../resources.js?v=20261029d";
import { applyStatus } from "../status.js?v=20261029d";
import { gainBlock, healEntity, isAlive, fx, log } from "../damage.js?v=20261029d";
import { DRU } from "./druid.defs.js?v=20261029d";

const S = (C) => C.taldruid || (C.taldruid = { turn: -1, omen: false, wild: false, next: 0, pend: 0, swift: false });
const isSpellHit = (o) => !!o && !!o.card && o.card.type === "attack" && (o.school === "nature" || o.school === "arcane");
const isSpellDef = (def) => !!def && def.type === "attack" && (def.effects || []).some((e) => e && (e.school === "nature" || e.school === "arcane"));
const formOf = (def) => { const e = def && def.type === "form" ? (def.effects || []).find((x) => x && x.op === "set_form") : null; return e ? e.value : null; };

export default {
  fire(C, name, extra = {}) {
    const p = C.player;
    if (name === "on_combat_start") {
      const r = tv(C, "dru_start_regen"); if (r > 0) applyStatus(C, p, "regen", r);
    } else if (name === "on_turn_start") {
      const s = S(C); s.turn = C.turn; s.omen = false; s.wild = false; s.next = 0; s.pend = 0;
      if (p.st && p.st.regen > 0) {
        const b = tv(C, "dru_regen_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
        const h = tv(C, "dru_regen_tick"); if (h > 0) healEntity(C, p, h);
      }
    } else if (name === "on_card_played") {
      const def = extra.card; if (!def) return;
      const s = S(C);
      if (tv(C, "dru_omen") > 0 && !s.omen && (def.cost | 0) >= 2) { s.omen = true; p.energy += 1; fx(C, { t: "miss", uid: "player", text: "CLEARCAST", kind: "gold" }); }
      const heal = tv(C, "dru_heal", def.id); if (heal > 0) healEntity(C, p, heal);
      if (def.id === "swiftmend") { const k = tv(C, "dru_swiftmend"); if (k > 0) applyStatus(C, p, "regen", k); }
      if (isSpellDef(def)) { const d = tv(C, "dru_dream"); if (d > 0) gainBlock(C, p, d, { raw: true }); }
      const f = formOf(def);
      if (f) {
        const l = tv(C, "dru_leader"); if (l > 0) { healEntity(C, p, l); gainBlock(C, p, l, { raw: true }); }
        if (f === "bear") { const b = tv(C, "dru_bear_block"); if (b > 0) gainBlock(C, p, b, { raw: true }); }
      }
    } else if (name === "on_attack") {
      const def = extra.card, s = S(C), en = extra.enemy;
      if (isSpellDef(def)) { s.next = s.pend; s.pend = 0; }
      if (tv(C, "dru_wild") > 0 && !s.wild) {
        s.wild = true;
        if (p.form === "bear") gainBlock(C, p, DRU.wild.bearBlock, { raw: true });
        else if (p.form === "cat") addRes(C, "combo", DRU.wild.catCombo);
      }
      const cb = tv(C, "dru_cat_bleed");
      if (cb > 0 && p.form === "cat" && en && isAlive(en)) applyStatus(C, en, "bleed", cb);
    } else if (name === "on_hp_loss") {
      const s = S(C);
      if (tv(C, "dru_swift") > 0 && !s.swift && isAlive(p) && p.hp <= p.maxHp * DRU.swift.hpPct / 100) {
        s.swift = true;
        healEntity(C, p, DRU.swift.heal); applyStatus(C, p, "regen", DRU.swift.regen);
        log(C, "Nature's Swiftness!");
        fx(C, { t: "miss", uid: "player", text: "SWIFTNESS", kind: "gold" });
      }
    }
  },
  deal(C, src, tgt, amt, o) {
    if (!src || src.kind !== "player" || !o.card || o.card.type !== "attack") return amt;
    const p = C.player, s = S(C);
    let a = amt;
    const cd = tv(C, "dru_combo_dmg");
    if (cd > 0) a += cd * Math.floor(getRes(C, "combo") / DRU.comboStep);
    if (isSpellHit(o)) {
      const mk = tv(C, "dru_moonkin"); if (mk > 0 && p.form === "moonkin") a += mk;
      const bd = tv(C, "dru_burn_dmg"); if (bd > 0 && tgt.st && tgt.st.burn > 0) a += bd;
      a += s.next;
      const cr = tv(C, "dru_spellcrit");
      if (cr > 0 && !o.dry && C.rng && C.rng.chance(cr / 100)) {
        a = Math.floor(a * (200 + tv(C, "dru_critdmg")) / 100);
        s.pend = tv(C, "dru_grace");
        fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });
      }
    }
    return a;
  },
  taken(C, tgt, taken) { return taken; },
};
