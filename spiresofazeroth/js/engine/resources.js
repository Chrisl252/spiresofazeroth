// Per-class resource layer. Data-driven: class.resource carries ids/amounts, class.resource.modes can override the
// mode table below. Mechanics covered: rage, combo points, mana, seals + judgement, totems (4 slots), druid forms,
// stance/aspect switches, priest shadowform (card.formCost), soul shards + pet, hunter pet + traps, mage schools.
import { runEffects } from "./effects.js";
import { applyStatus } from "./status.js";
import { fx, log, isAlive } from "./damage.js";

// Default mode semantics (stance/aspect/form values). A class can override via class.resource.modes = { value: {...} }.
//   atkBonus: +flat damage on player attack-kind hits    spellBonus: +flat on non-physical hits
//   blockBonus: +flat on card block                      takenReduce: -flat per hit taken (min 1)
//   takenMult: multiplier on hits taken                  takenSchool: { school: extra reduction }
//   drawBonus: extra cards each turn                     petActs: extra pet actions per turn
//   petDmgBonus: flat on pet attacks                     petUntargetable: pet cannot be targeted
//   energyBonus: extra energy each turn                  thorns: thorns while active
export const DEFAULT_MODES = {
  hawk: { atkBonus: 2 }, monkey: { blockBonus: 3 }, pack: { petActs: 1 }, cheetah: { drawBonus: 1 },
  wild: { takenReduce: 1, takenSchool: { nature: 2 } }, beast: { petDmgBonus: 3 },
  moonkin: { spellBonus: 3 },
};

const MAX_DEFAULT = 99;
const MAX_CAPS = { combo: 5, combo_points: 5, ignite: 5, arcane_charges: 4 };
const modeOf = (C, v) => (v ? (C.modes[v] || {}) : {});
function activeModes(C) {
  const p = C.player;
  return [modeOf(C, p.form), modeOf(C, p.stance), modeOf(C, p.aspect)];
}
const sumMode = (C, key) => activeModes(C).reduce((n, m) => n + (m[key] || 0), 0);

// ---- resource accounting -------------------------------------------------------
export function resMax(C, id) {
  const r = C.cls && C.cls.resource;
  if (r && r.id === id && r.max > 0) return r.max;
  const x = ((C.cls && C.cls.extraResources) || []).find((q) => q.id === id);
  if (x && x.max > 0) return x.max;
  return MAX_CAPS[id] || MAX_DEFAULT;
}
export const getRes = (C, id) => C.player.res[id] || 0;
export function addRes(C, id, amount) {
  const cur = C.player.res[id] || 0;
  C.player.res[id] = Math.max(0, Math.min(resMax(C, id), cur + amount));
  return C.player.res[id] - cur;
}
export function spendRes(C, id, amount) {
  const cur = C.player.res[id] || 0;
  const spent = Math.min(cur, Math.max(0, amount));
  C.player.res[id] = cur - spent;
  return spent;
}

export function initResources(C) {
  const cls = C.cls || {};
  const r = cls.resource || {};
  C.modes = Object.assign({}, DEFAULT_MODES, r.modes || {});
  // Auto school rules (ignite/shatter chain) are OFF unless the class asks: current data awards them with explicit ops.
  C.mech = { schools: !!(r.mechanics && r.mechanics.includes("schools")) };
  const p = C.player;
  p.res = {};
  if (r.id) p.res[r.id] = Math.min(r.max > 0 ? r.max : MAX_DEFAULT, r.startOfCombat || 0);
  for (const x of cls.extraResources || []) p.res[x.id] = Math.min(x.max > 0 ? x.max : MAX_DEFAULT, x.startOfCombat || 0);
  p.form = p.stance = p.aspect = p.seal = null;
  if (r.forms && r.forms.caster !== undefined) p.form = "caster";
  p.triggers = {};
  p.reviveArmed = 0;
  p.windfuryUsed = false;
  p.sealFx = null;
  p.totems = { earth: null, fire: null, water: null, air: null };
  p.pet = null;
  C.traps = [];
  C.firedTargets = new Set();
  if (r.pet) {
    const id = (C.run && C.run.pet) || r.pet.default;
    if (id && cls.units && cls.units[id]) p.pet = makePet(C, id);
  }
}

// ---- pet ------------------------------------------------------------------------
export function makePet(C, unitId) {
  const u = (C.tempUnits && C.tempUnits[unitId]) || (C.cls && C.cls.units && C.cls.units[unitId]) || null;
  if (!u) return null;
  // Hunter pets are COSMETIC families (Osty rule): every pet shares the class pet.moves and a guardian HP pool of pet.hpPct % of hero max HP.
  const pr = (C.cls && C.cls.resource && C.cls.resource.pet) || {};
  // Warlock demons are GUARDIANS too (unit.guardian) but keep their own HP + moves; only the class-wide pet.guardian is cosmetic.
  const cosmetic = !!pr.guardian, guardian = cosmetic || !!u.guardian;
  const hp = cosmetic ? Math.max(8, Math.round(((C.player && C.player.maxHp) || 75) * (pr.hpPct || 30) / 100)) : (u.hp || 20);
  return {
    kind: "pet", id: unitId, uid: "pet", name: u.name || unitId, icon: u.icon, hp, maxHp: hp, block: 0, guardian,
    st: {}, moves: (cosmetic ? pr.moves : u.moves) || u.moves || [], pattern: u.pattern || null, expires: !!u.expiresAfterAct, cursor: 0, traits: u.traits || [], down: false,
  };
}
export function petDown(C, pet) {
  pet.down = true;
  pet.hp = 0;
  pet.block = 0;
  fx(C, { t: "die", uid: "pet" });
  log(C, `${pet.name} falls.`);
}
export function revivePet(C, pct) {
  const p = C.player.pet;
  if (!p || !p.down) return false;
  p.down = false;
  p.hp = Math.max(1, Math.ceil(p.maxHp * (pct || 50) / 100));
  fx(C, { t: "heal", uid: "pet", amount: p.hp });
  return true;
}
export function petAct(C, extraCtx = {}) {
  const pet = C.player.pet;
  if (!pet || pet.down || !pet.moves.length || C.result) return;
  const mv = nextMove(pet);
  if (!mv) return;
  const target = pickPetTarget(C);
  if (!target) return;
  fx(C, { t: "petmove", uid: "pet", name: mv.name });
  runEffects({ C, src: pet, srcKind: "pet", target, move: mv, ...extraCtx }, mv.effects || []);
}
function nextMove(u) {
  let mv;
  if (u.pattern && u.pattern.length) mv = u.moves.find((m) => m.id === u.pattern[u.cursor % u.pattern.length]);
  else mv = u.moves[u.cursor % u.moves.length];
  u.cursor++;
  return mv || u.moves[0];
}
export function sacrificePet(C) {
  const p = C.player.pet;
  if (!p || p.down) return false;
  C.player.pet = null;
  fx(C, { t: "die", uid: "pet" });
  return true;
}
export function randomPetId(C) {
  const ch = C.cls && C.cls.resource && C.cls.resource.pet && C.cls.resource.pet.choices;
  return ch && ch.length ? C.rng.pick(ch) : null;
}
function pickPetTarget(C) {
  const live = C.enemies.filter((e) => isAlive(e));
  if (!live.length) return null;
  if (C.lastTarget && isAlive(C.lastTarget)) return C.lastTarget;
  return live.reduce((a, b) => (b.hp < a.hp ? b : a));
}
export function unitFor(C, unitId) {
  return (C.tempUnits && C.tempUnits[unitId]) || (C.cls && C.cls.units && C.cls.units[unitId]) || null;
}
export function summonAlly(C, unitId) {
  if (!unitFor(C, unitId)) return false;
  C.player.pet = makePet(C, unitId);
  fx(C, { t: "summon", uid: "pet" });
  return true;
}

// ---- totems -----------------------------------------------------------------------
export function placeTotem(C, slot, unitId) {
  const u = unitFor(C, unitId);
  if (!u || !C.player.totems) return false;
  C.player.totems[slot] = {
    kind: "totem", id: unitId, uid: "totem-" + slot, slot, name: u.name || unitId, icon: u.icon,
    hp: u.hp || 10, maxHp: u.hp || 10, block: 0, st: {}, traits: [], moves: u.moves || null, pattern: u.pattern || null, expires: !!u.expiresAfterAct,
    effects: u.effects || u.onTurn || null, cursor: 0, turns: u.duration || 0,
  };
  fx(C, { t: "summon", uid: "totem-" + slot });
  return true;
}
function triggerTotems(C) {
  for (const slot of Object.keys(C.player.totems)) {
    const t = C.player.totems[slot];
    if (!t || C.result) continue;
    let effects = t.effects;
    if (!effects && t.moves && t.moves.length) {
      const mv = nextMove(t);
      effects = mv && mv.effects;
    }
    if (effects) runEffects({ C, src: t, srcKind: "totem", target: pickPetTarget(C) }, effects);
    if (t.expires) C.player.totems[slot] = null;
    if (t.turns > 0 && --t.turns <= 0) C.player.totems[slot] = null;
  }
}

// ---- seals ------------------------------------------------------------------------
export function judge(C, ctx) {
  const p = C.player;
  if (!p.seal) return false;
  const fxs = p.sealFx || [];
  p.seal = null;
  p.sealFx = null;
  runEffects({ ...ctx, C }, fxs);
  return true;
}

// ---- traps -------------------------------------------------------------------------
export function armTrap(C, card) {
  C.traps.push({ name: card.name, effects: card.apply || card.effects || [] });
  fx(C, { t: "trap", name: card.name });
}
export function fireTraps(C, attacker) {
  // Called when an enemy is about to attack. One armed trap springs per attack.
  const trap = C.traps.shift();
  if (!trap) return false;
  log(C, `${trap.name} springs on ${attacker.name}.`);
  runEffects({ C, src: C.player, srcKind: "player", target: attacker, attacker, trapFiring: true }, trap.effects);
  return !!attacker.interrupted;
}

// ---- damage hooks ------------------------------------------------------------------
export function damageBonus(C, src, school, o) {
  if (!src || o.kind === "thorns") return 0;
  if (src.kind === "player") {
    let b = 0;
    if (o.kind === "attack" || o.kind === "effect") {
      b += sumMode(C, "atkBonus");
      if (school !== "physical") b += sumMode(C, "spellBonus");
    }
    const st = C.player.st;
    if (school !== "physical") b += st.spell_power || 0;
    if (st.weapon_imbue_rockbiter && o.kind === "attack") b += 2;
    if (C.mech.schools) {
      if (school === "fire") b += C.player.res.ignite || 0;
      if (school === "arcane") b += C.player.res.arcane_charges || 0;
    }
    return b;
  }
  if (src.kind === "pet") return sumMode(C, "petDmgBonus");
  return 0;
}
export function damageMult(C, src, tgt, school) {
  if (src && src.kind === "player" && C.mech.schools && school === "frost" && tgt.st && tgt.st.frozen) return 1.5; // shatter
  return 1;
}
export function takenAdjust(C, tgt, amount, school) {
  if (!tgt || tgt.kind !== "player" || amount <= 0) return amount;
  let a = amount;
  for (const m of activeModes(C)) {
    if (m.takenMult) a = Math.floor(a * m.takenMult);
    if (m.takenReduce) a -= m.takenReduce;
    if (m.takenSchool && m.takenSchool[school]) a -= m.takenSchool[school];
  }
  return Math.max(a, 1);
}
export function blockBonus(C, o) {
  return o && o.card ? sumMode(C, "blockBonus") : 0;
}
export function petTargetable(C) {
  return !sumMode(C, "petUntargetable");
}
export function extraDraw(C) { return sumMode(C, "drawBonus"); }
export function extraEnergy(C) { return sumMode(C, "energyBonus"); }
export function modeThorns(C) { return sumMode(C, "thorns"); }

function actionKey(C, name) {
  if (C["_k_" + name] === C.actionId) return false;
  C["_k_" + name] = C.actionId;
  return true;
}
export function onDealt(C, tgt, hpLoss, school) {
  const r = (C.cls && C.cls.resource) || {};
  C.lastSchool = school;
  C.lastTarget = tgt;
  if (r.gainOnDamageDealt && actionKey(C, "dealt")) addRes(C, r.id, r.gainOnDamageDealt);
  if (!C.mech.schools) return;
  if (school === "fire") {
    if (actionKey(C, "ignite")) addRes(C, "ignite", 1);
    C.firedTargets.add(tgt);
  } else if (school === "frost") {
    if (tgt._frostAct !== C.actionId) {
      tgt._frostAct = C.actionId;
      if (tgt.st.frozen) { /* shatter bonus already applied */ }
      else if (tgt.st.weak) { delete tgt.st.weak; applyStatus(C, tgt, "frozen", 1); }
      else applyStatus(C, tgt, "weak", 1);
    }
  } else if (school === "arcane") {
    if (actionKey(C, "arcane")) addRes(C, "arcane_charges", 1);
  }
}
export function onTaken(C) {
  const r = (C.cls && C.cls.resource) || {};
  if (r.gainOnDamageTaken && actionKey(C, "taken")) addRes(C, r.id, r.gainOnDamageTaken);
}
export function onKillRes(C) {
  const r = (C.cls && C.cls.resource) || {};
  if (r.gainOnKill) addRes(C, r.id, r.gainOnKill);
}

// ---- turn boundaries --------------------------------------------------------------
export function startOfTurn(C) {
  const r = (C.cls && C.cls.resource) || {};
  const per = r.perTurn || r.gainPerTurn || 0;
  if (per && r.id) addRes(C, r.id, per);
  triggerTotems(C);
  const p = C.player;
  if (p.pet) { p.pet.block = 0; }
}
export function endOfTurn(C) {
  const r = (C.cls && C.cls.resource) || {};
  const p = C.player;
  if (r.decayPerTurn && r.id) addRes(C, r.id, -r.decayPerTurn);
  if (C.mech.schools) {
    for (const e of C.firedTargets) if (isAlive(e)) applyStatus(C, e, "burn", 1);
    C.firedTargets = new Set();
    if (p.res.ignite) p.res.ignite -= 1;
    p.res.arcane_charges = 0;
  }
  if (p.pet && !p.pet.down) {
    petAct(C);
    for (let i = 0; i < sumMode(C, "petActs"); i++) petAct(C);
  }
}
