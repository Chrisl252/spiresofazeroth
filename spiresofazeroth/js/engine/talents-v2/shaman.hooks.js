// Talents V2 hook RUNTIME for the shaman. Called by talentHooks.js for every run (no-op unless this class's keys are on run.talents):
//   fire(C, name, extra)              relic-bus events: on_combat_start, on_turn_start, on_card_played, on_attack, on_hp_loss, ...
//   deal(C, src, tgt, amt, o, base)   any non-thorns hit on an enemy (player, pet or totem source; o.card = card def; o.dry = preview, no side effects)
//   taken(C, tgt, taken, src, o)      damage the player is about to take; return the new amount
// Read values with tv(C, key, arg) from ../talentHooks.js; keep per-fight state on C.talshaman (C is one combat).
// Keys (defs in shaman.defs.js): Elemental = sha_crit / sha_fury / sha_focus / sha_mastery (spell crits), sha_shock_ramp, sha_fire_totem,
// sha_earth_block; Enhancement = sha_imbue_dmg, sha_wcrit, sha_windfury; Restoration = sha_heal, sha_tidal, sha_grace, sha_surge,
// sha_purify, sha_totem_block, sha_totem_place, sha_water_heal, sha_ankh.
import { tv } from "../talentHooks.js";
import { gainBlock, healEntity, isAlive, fx, dealDamage } from "../damage.js";
import { applyStatus } from "../status.js";

const SHOCKS = new Set(["earth-shock", "flame-shock", "frost-shock"]);
const HEALS = new Set(["healing-wave", "lesser-healing-wave", "chain-heal", "ancestral-spirit"]);
const CLEANSE = ["poison", "disease", "curse"]; // Purification cleanses these, in order
const S = (C) => C.talshaman || (C.talshaman = { shockRamp: 0, grace: 0, surge: 0, critAct: -1, critHit: false, focusTurn: -1, mastDone: false, wfTurn: -1, wfAct: -1, wfAmt: 0, wfTgt: null, ssAct: -1, ssAmt: 0, ssTgt: null, ssDone: false, ankh: false });
const standing = (C) => { const t = C.player && C.player.totems; return t ? Object.values(t).filter(Boolean).length : 0; };
const slotUp = (C, slot) => !!(C.player && C.player.totems && C.player.totems[slot]);
const hasImbue = (p) => Object.keys(p.st || {}).some((k) => k.startsWith("weapon_imbue_") && p.st[k] > 0);
const isSpell = (school) => !!school && school !== "physical";
const healBase = (def) => (def.effects || []).reduce((n, e) => n + (e && e.op === "heal" && typeof e.amount === "number" ? e.amount : 0), 0);

function fire(C, name, extra = {}) {
  const p = C.player;
  if (name === "on_turn_start") {
    const s = S(C);
    s.shockRamp = 0; s.grace = 0; s.surge = 0;
    const eb = tv(C, "sha_earth_block"); if (eb > 0 && slotUp(C, "earth")) gainBlock(C, p, eb, { raw: true });
    const tb = tv(C, "sha_totem_block"); if (tb > 0) { const n = standing(C); if (n > 0) gainBlock(C, p, tb * n, { raw: true }); }
    const wh = tv(C, "sha_water_heal"); if (wh > 0 && slotUp(C, "water")) healEntity(C, p, wh);
  } else if (name === "on_card_played") {
    const def = extra.card;
    if (!def) return;
    const s = S(C);
    if (SHOCKS.has(def.id)) s.shockRamp += tv(C, "sha_shock_ramp");
    if (def.type === "totem") { const b = tv(C, "sha_totem_place"); if (b > 0) gainBlock(C, p, b, { raw: true }); }
    if (HEALS.has(def.id)) {
      const h = tv(C, "sha_heal"); if (h > 0) healEntity(C, p, h);
      const tide = tv(C, "sha_tidal");
      if (tide > 0 && C.rng && C.rng.chance(tide / 100)) { healEntity(C, p, healBase(def) + h); fx(C, { t: "miss", uid: "player", text: "TIDAL", kind: "gold" }); }
      const g = tv(C, "sha_grace"); if (g > 0) s.grace = g;
      const su = tv(C, "sha_surge"); if (su > 0) s.surge = su;
      let n = tv(C, "sha_purify");
      for (const k of CLEANSE) { if (n <= 0) break; if (p.st && p.st[k]) { delete p.st[k]; n--; } }
    }
  } else if (name === "on_attack") {
    const s = S(C), en = extra.enemy;
    s.surge = 0; // the surge is spent by the Attack that just resolved
    const ss = tv(C, "sha_stormstrike");
    if (ss > 0 && s.ssAct === C.actionId && s.ssAmt > 0 && en && isAlive(en)) { // Stormstrike: the first Attack of the fight strikes twice and leaves the target Vulnerable
      const echo = s.ssAmt; s.ssAmt = 0; s.ssAct = -1; s.ssDone = true;
      fx(C, { t: "miss", uid: en.uid, text: "STORMSTRIKE", kind: "gold" });
      dealDamage(C, p, en, echo, { kind: "effect", school: "nature", noMods: true });
      if (isAlive(en)) applyStatus(C, en, "vulnerable", ss);
    }
    const wf = tv(C, "sha_windfury");
    if (wf > 0 && s.wfAct === C.actionId && s.wfAmt > 0 && en && isAlive(en)) { // Windfury: the first Attack each turn strikes again for wf%
      const echo = Math.max(1, Math.floor(s.wfAmt * wf / 100));
      s.wfAmt = 0; s.wfAct = -1;
      fx(C, { t: "miss", uid: en.uid, text: "WINDFURY", kind: "gold" });
      dealDamage(C, p, en, echo, { kind: "effect", school: "physical", noMods: true });
    }
  }
}

function deal(C, src, tgt, amt, o, base) {
  if (!src || amt <= 0) return amt;
  if (src.kind === "totem") {
    if (src.slot === "fire") { const v = tv(C, "sha_fire_totem"); if (v > 0) amt += v; }
    return amt;
  }
  const def = o.card;
  if (src.kind !== "player" || !def || def.type !== "attack") return amt;
  const s = S(C), school = o.school || "physical", spell = isSpell(school);
  if (SHOCKS.has(def.id)) amt += s.shockRamp;
  const imb = tv(C, "sha_imbue_dmg"); if (imb > 0 && hasImbue(C.player)) amt += imb;
  if (s.surge > 0) amt += s.surge;
  const cc = (spell ? tv(C, "sha_crit") : 0) + tv(C, "sha_wcrit") + tv(C, "sha_card_crit", def.id), mast = spell && tv(C, "sha_mastery") > 0;
  if (!o.dry && (cc > 0 || mast)) {
    if (s.critAct !== C.actionId) { // one crit roll per card play, shared by every hit of that play
      s.critAct = C.actionId;
      let hit = cc > 0 && !!C.rng && C.rng.chance(Math.min(100, cc) / 100);
      if (mast && !s.mastDone) { s.mastDone = true; hit = true; } // Elemental Mastery: the first spell of the fight always crits
      s.critHit = hit;
      if (hit && spell && tv(C, "sha_focus") > 0 && s.focusTurn !== C.turn) { s.focusTurn = C.turn; C.player.energy += tv(C, "sha_focus"); }
      if (hit) fx(C, { t: "miss", uid: tgt.uid, text: "CRIT!", kind: "gold" });
    }
    if (s.critHit) amt = tv(C, "sha_fury") > 0 ? Math.floor(amt * 9 / 4) : amt * 2;
  }
  if (!o.dry && tv(C, "sha_stormstrike") > 0 && !s.ssDone) { // total the first Attack of the fight for the Stormstrike echo
    if (s.ssAct !== C.actionId && s.ssAct === -1) { s.ssAct = C.actionId; s.ssAmt = 0; s.ssTgt = tgt.uid; }
    if (s.ssAct === C.actionId && s.ssTgt === tgt.uid) s.ssAmt += amt;
  }
  if (!o.dry && tv(C, "sha_windfury") > 0) { // total the first Attack each turn for the Windfury echo (reset once per card play)
    if (s.wfAct !== C.actionId && s.wfTurn !== C.turn) { s.wfTurn = C.turn; s.wfAct = C.actionId; s.wfAmt = 0; s.wfTgt = tgt.uid; }
    if (s.wfAct === C.actionId && s.wfTgt === tgt.uid) s.wfAmt += amt;
  }
  return amt;
}

function taken(C, tgt, amt, src, o) {
  if (!src || src.kind !== "enemy" || (o.kind || "attack") !== "attack" || o.dry) return amt;
  const s = C.talshaman, p = C.player;
  if (!s) return amt;
  if (s.grace > 0) { const g = s.grace; s.grace = 0; amt = Math.max(1, amt - g); }
  const ank = tv(C, "sha_ankh");
  if (ank > 0 && !s.ankh && !(C.run && C.run.shaAnkh) && amt >= p.hp + (p.block || 0)) { // Ankh: the killing blow leaves you at ank% HP, once per run
    s.ankh = true; if (C.run) C.run.shaAnkh = true;
    const keep = Math.max(1, Math.ceil(p.maxHp * ank / 100));
    p.block = 0;
    if (p.hp < keep) p.hp = keep;
    amt = p.hp - keep;
    fx(C, { t: "miss", uid: "player", text: "REINCARNATION", kind: "gold" });
  }
  return amt;
}

export default { fire, deal, taken };
