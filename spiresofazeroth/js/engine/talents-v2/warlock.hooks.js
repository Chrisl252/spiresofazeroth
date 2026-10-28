// Talents V2 hook RUNTIME for the warlock. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_turn_end, on_kill ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talwarlock (C is one combat).
// Keys (all "wlk_", text in warlock.defs.js): Affliction pulse/drain/spread/Nightfall, Demonology shards/demon/Soul Link, Destruction crit/burn.
import { tv } from "../talentHooks.js?v=20261028e";
import { applyStatus } from "../status.js?v=20261028e";
import { gainBlock, healEntity, isAlive, fx, dealDamage, dealStatusDamage } from "../damage.js?v=20261028e";
import { drawCards } from "../deck.js?v=20261028e";
import { addRes, getRes } from "../resources.js?v=20261028e";

const BOLT = "shadow-bolt", NIGHTFALL_CARDS = ["corruption", "drain-life", "drain-soul"];
const DRAINS = ["drain-life", "drain-soul", "drain-mana", "siphon-life"];
const SHARDS_PER_DMG = 3, BOLT_BASE = 9;
const isSummon = (id) => id.startsWith("summon-") || id === "ritual-of-doom" || id === "inferno";

/** per-fight state; false (cached) when this run carries no warlock hook, so every entry point is a cheap no-op */
function S(C) {
  if (C.talwarlock !== undefined) return C.talwarlock;
  const t = C.run && C.run.talents;
  C.talwarlock = t && Object.keys(t).some((k) => k.startsWith("wlk_") && t[k] > 0)
    ? { atk: 0, drew: false, freeUsed: false, mark: {}, conflBurn: 0, inTrance: false } : false;
  return C.talwarlock;
}
const petUp = (C) => !!(C.player.pet && isAlive(C.player.pet));
const live = (C) => C.enemies.filter((e) => isAlive(e));

function fire(C, name, extra = {}) {
  const s = S(C); if (!s) return;
  const p = C.player;
  if (name === "on_combat_start") {
    const sh = tv(C, "wlk_shard_start"); if (sh > 0) addRes(C, "soul_shards", sh);
  } else if (name === "on_turn_start") {
    s.atk = 0; s.drew = false; s.mark = {};
    const heal = tv(C, "wlk_pet_regen"); if (heal > 0 && petUp(C)) healEntity(C, p.pet, heal);
    const ag = tv(C, "wlk_aegis"); if (ag > 0 && (p.st.armor | 0) > 0) gainBlock(C, p, ag, { raw: true });
  } else if (name === "on_attack") {
    s.atk++;
    const ib = tv(C, "wlk_intensity"); if (ib > 0 && s.atk === 2) gainBlock(C, p, ib, { raw: true });
  } else if (name === "on_card_played") {
    cardPlayed(C, s, extra.card, extra.enemy);
  } else if (name === "on_turn_end") {
    const pulse = tv(C, "wlk_dot_pulse"), sip = tv(C, "wlk_siphon");
    const burn = tv(C, "wlk_burn_pulse"), weak = tv(C, "wlk_burn_weak");
    let poisoned = 0;
    for (const e of live(C)) {
      if (e.st && e.st.poison > 0) { poisoned++; if (pulse > 0) dealStatusDamage(C, e, pulse, "poison"); }
      if (e.st && e.st.burn > 0 && isAlive(e)) {
        if (burn > 0) dealStatusDamage(C, e, burn, "burn");
        if (weak > 0 && isAlive(e)) applyStatus(C, e, "weak", weak);
      }
    }
    if (sip > 0 && poisoned > 0) healEntity(C, p, sip * poisoned);
  } else if (name === "on_kill") {
    const sp = tv(C, "wlk_spread"), dead = extra.enemy;
    if (sp > 0 && dead && dead.st && dead.st.poison > 0) {
      const others = live(C).filter((e) => e !== dead);
      const n = Math.floor(dead.st.poison * sp / 100);
      if (others.length && n > 0) applyStatus(C, others.reduce((a, b) => (b.hp < a.hp ? b : a)), "poison", n);
    }
  }
}

function cardPlayed(C, s, def, enemy) {
  if (!def) return;
  const id = def.id || "", p = C.player;
  const g = (key) => tv(C, key);
  if (isSummon(id)) {
    const hp = g("wlk_void_hp");
    if (hp > 0 && id === "summon-voidwalker" && petUp(C) && p.pet.id === "voidwalker") { p.pet.maxHp += hp; p.pet.hp += hp; }
    const fb = g("wlk_summon_block"); if (fb > 0) gainBlock(C, p, fb, { raw: true });
    const dr = g("wlk_summon_draw"); if (dr > 0 && !s.drew) { s.drew = true; drawCards(C, dr); }
    const free = g("wlk_free_summon");
    if (free > 0 && !s.freeUsed) { s.freeUsed = true; p.energy += Math.min(free, Math.max(0, def.cost | 0)); }
  }
  if (id === "healthstone") { const h = g("wlk_healthstone"); if (h > 0) healEntity(C, p, h); }
  if (id === "life-tap") {
    const h = g("wlk_tap_heal"); if (h > 0) healEntity(C, p, h);
    const b = g("wlk_tap_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
  }
  if (DRAINS.includes(id)) {
    const h = g("wlk_drain_heal"); if (h > 0) healEntity(C, p, h);
    const b = g("wlk_drain_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
  }
  if (id === "dark-pact") {
    const b = g("wlk_pact_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
    const h = g("wlk_pact_pet"); if (h > 0 && petUp(C)) healEntity(C, p.pet, h);
  }
  if (id === "demonic-sacrifice") {
    const b = g("wlk_sac_block"); if (b > 0) gainBlock(C, p, b, { raw: true });
    const st = g("wlk_sac_str"); if (st > 0) applyStatus(C, p, "strength", st);
  }
  if (id === BOLT && enemy && isAlive(enemy)) { const m = g("wlk_isb"); if (m > 0) s.mark[enemy.uid] = m; }
  if (id === "conflagrate") {
    const keep = g("wlk_confl_keep"), b = s.conflBurn;
    s.conflBurn = 0;
    if (keep > 0 && b > 0 && enemy && isAlive(enemy)) applyStatus(C, enemy, "burn", Math.ceil(b * keep / 100));
  }
  const nf = g("wlk_nightfall");
  if (nf > 0 && !s.inTrance && NIGHTFALL_CARDS.includes(id) && enemy && isAlive(enemy) && C.rng && C.rng.chance(nf / 100)) {
    const bolt = C.data && C.data.card ? C.data.card(BOLT, C.run && C.run.classId) : null;
    s.inTrance = true;
    fx(C, { t: "miss", uid: enemy.uid, text: "SHADOW TRANCE", kind: "gold" });
    dealDamage(C, p, enemy, BOLT_BASE, { school: "shadow", kind: "attack", cardId: BOLT, card: bolt || undefined });
    s.inTrance = false;
  }
}

function deal(C, src, tgt, amt, o, base) {
  const s = S(C); if (!s || !src || (src.kind !== "player" && src.kind !== "pet")) return amt;
  const g = (key) => tv(C, key), school = o.school || (o.card && o.card.school) || "physical";
  let a = amt;
  const poisoned = tgt.st && tgt.st.poison > 0;
  if (school === "shadow") {
    a += g("wlk_shadow_dmg");
    if (poisoned) a += g("wlk_shadow_poison");
  }
  if (school === "fire") a += g("wlk_fire_dmg");
  if (o.aoe && src.kind === "player") a += g("wlk_aoe_dmg");
  if (src.kind === "pet") {
    a += g("wlk_pet_dmg");
    const sd = g("wlk_pet_shard_dmg"); if (sd > 0) a += Math.min(sd, Math.floor(getRes(C, "soul_shards") / SHARDS_PER_DMG));
    return a;
  }
  if (school !== "physical" && petUp(C)) a += g("wlk_demon_dmg");
  const mark = s.mark[tgt.uid];
  if (mark > 0 && !(o.card && o.card.id === BOLT) && school === "shadow") { a += mark; if (!o.dry) delete s.mark[tgt.uid]; }
  const def = o.card;
  if (def && def.id === "conflagrate" && !o.dry && tgt.st && tgt.st.burn > 0) s.conflBurn = tgt.st.burn;
  if (def && def.type === "attack" && !o.dry) {
    const cr = g("wlk_crit") + (def.id === "searing-pain" ? g("wlk_sp_crit") : 0);
    if (cr > 0 && C.rng && C.rng.chance(Math.min(100, cr) / 100)) {
      a = Math.floor(a * (200 + g("wlk_crit_mult")) / 100);
      fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });
    }
  }
  return a;
}

function taken(C, tgt, amount, src, o) {
  const s = S(C); if (!s || amount <= 0) return amount;
  let a = amount;
  const dd = tv(C, "wlk_demon_def"); if (dd > 0 && petUp(C)) a = Math.max(1, a - dd);
  const link = tv(C, "wlk_link");
  if (link > 0 && !o.dry && petUp(C) && a > 1) {
    const share = Math.min(a - 1, Math.floor(a * link / 100));
    if (share > 0) {
      a -= share;
      dealDamage(C, null, C.player.pet, share, { noMods: true, kind: "effect", school: "shadow" });
    }
  }
  return a;
}

export default { fire, deal, taken };
