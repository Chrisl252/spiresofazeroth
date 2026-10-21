// Damage / block / heal pipeline + death handling. Every HP change in the game goes through here.
import { modifyDealt, modifyTaken, gainBlockAmount, hasTrait, wakeOnDamage } from "./status.js";
import { damageBonus, damageMult, takenAdjust, blockBonus, onDealt, onTaken, onKillRes, petDown, modeThorns } from "./resources.js";
import { fire } from "./relics.js";
import { runEffects } from "./effects.js";
import { immuneToSchool, resistMult } from "./immunity.js";

const ids = (e) => (e && (e.uid || e.kind)) || "?";
export function fx(C, ev) {
  if (C && C.fx) {
    C.fx.push(ev);
    if (C.fx.length > 400) C.fx.splice(0, 200);
  }
}
export function log(C, msg) {
  if (!C || !C.log) return;
  C.log.push(msg);
  if (C.log.length > 300) C.log.splice(0, 100);
}

export function isAlive(e) {
  return !!e && e.hp > 0 && !e.dead && !e.down;
}

// opts: { school, kind: 'attack'|'effect'|'thorns', pierce, noMods, aoe }
export function dealDamage(C, src, tgt, amount, o = {}) {
  if (!tgt || !isAlive(tgt) || C.result) return null;
  const school = o.school || "physical";
  const kind = o.kind || "attack";
  // Guardian pet (Osty rule): single-target enemy attacks aimed at the player hit the living pet first.
  if (tgt.kind === "player" && src && src.kind === "enemy" && kind === "attack" && !o.aoe && tgt.pet && tgt.pet.guardian && isAlive(tgt.pet)) {
    return dealDamage(C, src, tgt.pet, amount, o);
  }
  let amt = Math.max(0, amount);
  if (tgt.kind === "enemy" && amt > 0 && immuneToSchool(tgt, school)) { // classic immunity: the hit does nothing (Block is not spent)
    fx(C, { t: "miss", uid: ids(tgt), text: "IMMUNE", kind: "gold" });
    return { dealt: 0, hpLoss: 0, blocked: 0, immune: true };
  }
  if (tgt.kind === "enemy" && amt > 0 && resistMult(tgt, school) < 1) fx(C, { t: "miss", uid: ids(tgt), text: "RESIST", kind: "gold" });
  if (!o.noMods) {
    amt = modifyDealt(C, src, amt);
    amt += damageBonus(C, src, school, o);
    amt = Math.floor(amt * damageMult(C, src, tgt, school, o));
  }
  let taken = o.noMods ? amt : modifyTaken(C, tgt, amt, school, o);
  if (!o.noMods) taken = takenAdjust(C, tgt, taken, school);
  // a stealthed player is missed by single-target enemy attacks
  if (tgt.kind === "player" && tgt.st.stealth && src && src.kind === "enemy" && kind === "attack" && !o.aoe) {
    fx(C, { t: "miss", uid: ids(tgt) });
    return { dealt: 0, hpLoss: 0, blocked: 0, missed: true };
  }
  let blocked = 0;
  let rem = taken;
  if (!o.pierce) {
    blocked = Math.min(tgt.block, rem);
    tgt.block -= blocked;
    rem -= blocked;
  }
  let shielded = 0;
  if (rem > 0 && tgt.st.shield > 0) {
    shielded = Math.min(tgt.st.shield, rem);
    tgt.st.shield -= shielded;
    if (tgt.st.shield <= 0) delete tgt.st.shield;
    rem -= shielded;
  }
  let hpLoss = Math.min(tgt.hp, rem);
  tgt.hp -= hpLoss;
  const petOverflow = tgt.guardian && src && src.kind === "enemy" && kind === "attack" && !o.aoe ? rem - hpLoss : 0; // pet died this hit: the excess carries to the hero
  // Soul Link: 30% of HP damage per stack is moved to the demon
  if (tgt.kind === "player" && hpLoss > 0 && tgt.st.soul_link && tgt.pet !== undefined && isAlive(tgt.pet)) {
    const share = Math.floor(hpLoss * Math.min(1, 0.3 * tgt.st.soul_link));
    if (share > 0) { tgt.hp += share; hpLoss -= share; tgt.pet.hp -= share; fx(C, { t: "dmg", uid: "pet", amount: share, blocked: 0, school: "shadow" }); }
  }
  if (src && src.kind === "player" && school === "shadow" && hpLoss > 0 && src.st.vampiric_embrace) {
    healEntity(C, src, Math.max(1, Math.floor(hpLoss * 0.25 * src.st.vampiric_embrace)));
  }
  const dmgEv = { t: "dmg", uid: ids(tgt), amount: hpLoss, blocked: blocked + shielded, school, from: src ? ids(src) : null };
  if (o.primary !== undefined) dmgEv.primary = !!o.primary;
  if (o.cardId) dmgEv.cardId = o.cardId;
  if (o.proc || (!o.primary && !o.cardId && src && src.kind === "player")) dmgEv.proc = true;
  fx(C, dmgEv);
  if (taken > 0) wakeOnDamage(tgt);
  const thorns = (tgt.st.thorns || 0) + (tgt.kind === "player" ? modeThorns(C) : 0);
  if (src && src !== tgt && kind === "attack" && thorns > 0 && isAlive(src)) {
    dealDamage(C, tgt, src, thorns, { kind: "thorns", noMods: true, school: "physical" });
  }
  if (src && src.kind === "player" && tgt.kind === "enemy") onDealt(C, tgt, hpLoss, school);
  if (tgt.kind === "player" && taken > 0) onTaken(C, hpLoss);
  if (tgt.kind === "player") {
    C.stats.damageTaken += hpLoss;
    if (hpLoss > 0) {
      fire(C, "on_damage_taken", { attacker: src, amount: hpLoss });
      fire(C, "on_hp_loss", { amount: hpLoss });
    }
  } else if (tgt.kind === "enemy" && src && src.kind !== "enemy") {
    C.stats.damageDealt += hpLoss;
  }
  if (petOverflow > 0) dealDamage(C, src, C.player, petOverflow, { school, kind, noMods: true });
  checkDeaths(C);
  return { dealt: taken, hpLoss, blocked, shielded };
}

// Direct HP loss that ignores Block and modifiers (poison, burn, self-damage).
export function dealStatusDamage(C, e, amount, cause) {
  if (!e || !isAlive(e) || amount <= 0) return 0;
  const loss = Math.min(e.hp, Math.floor(amount));
  e.hp -= loss;
  fx(C, { t: "dmg", uid: ids(e), amount: loss, blocked: 0, school: cause || "status", status: true });
  if (e.kind === "player") {
    C.stats.damageTaken += loss;
    if (loss > 0) fire(C, "on_hp_loss", { amount: loss });
  } else if (e.kind === "enemy") C.stats.damageDealt += loss;
  checkDeaths(C);
  return loss;
}

export function gainBlock(C, e, amount, o = {}) {
  if (!e || !isAlive(e)) return 0;
  let a = o.raw ? Math.max(0, Math.floor(amount)) : gainBlockAmount(e, amount);
  if (!o.raw && e.kind === "player") a += blockBonus(C, o);
  if (a <= 0) return 0;
  e.block += a;
  fx(C, { t: "block", uid: ids(e), amount: a });
  if (e.kind === "player") fire(C, "on_block_gained", { amount: a });
  return a;
}

export function healEntity(C, e, amount) {
  if (!e || e.hp <= 0 || e.dead) return 0;
  let a = Math.floor(amount);
  if (e.st && e.st.disease) a = Math.floor(a / 2);
  if (a <= 0) return 0;
  const healed = Math.min(a, e.maxHp - e.hp);
  e.hp += healed;
  if (healed > 0) fx(C, { t: "heal", uid: ids(e), amount: healed });
  return healed;
}

function canRevive(C, e) {
  if (e.revived || e.tier === "boss" || e.tier === "raid") return false;
  return hasTrait(e, "revive");
}

export function checkDeaths(C) {
  if (C._dying) return;
  C._dying = true;
  try {
    let again = true;
    while (again) {
      again = false;
      for (const e of C.enemies) {
        if (e.hp > 0 || e.dead) continue;
        if (canRevive(C, e)) {
          e.revived = true;
          e.hp = Math.max(1, Math.ceil(e.maxHp * 0.25));
          e.st = {};
          e.block = 0;
          e.skipTurns = 1;
          fx(C, { t: "revive", uid: e.uid });
          log(C, `${e.name} rises again.`);
          again = true;
          continue;
        }
        e.dead = true;
        e.hp = 0;
        e.block = 0;
        e.intent = null;
        C.stats.kills++;
        fx(C, { t: "die", uid: e.uid });
        log(C, `${e.name} dies.`);
        onKillRes(C, e);
        if (e.converted) { again = true; continue; }
        if (e.def && e.def.onDeath) runEffects({ C, src: e, srcKind: "enemy", target: C.player }, e.def.onDeath);
        fire(C, "on_kill", { enemy: e });
        again = true;
      }
    }
    const p = C.player.pet;
    if (p && p.hp <= 0 && !p.down) petDown(C, p);
    const tot = C.player.totems;
    for (const slot of Object.keys(tot)) if (tot[slot] && tot[slot].hp <= 0) tot[slot] = null;
    if (!C.result) {
      if (C.player.hp <= 0) {
        const pl = C.player;
        if (pl.st.reincarnation > 0) { delete pl.st.reincarnation; pl.hp = Math.max(1, Math.ceil(pl.maxHp * 0.3)); log(C, "Reincarnation!"); }
        else if (pl.reviveArmed > 0) { pl.hp = Math.max(1, Math.ceil(pl.maxHp * pl.reviveArmed / 100)); pl.reviveArmed = 0; log(C, "You rise again."); }
      }
      if (C.player.hp <= 0) {
        fire(C, "on_death", {});
        if (C.player.hp <= 0) { C.result = "lose"; C.phase = "over"; }
      } else if (C.enemies.every((e) => e.dead)) {
        C.result = "win";
        C.phase = "over";
      }
    }
  } finally {
    C._dying = false;
  }
}

