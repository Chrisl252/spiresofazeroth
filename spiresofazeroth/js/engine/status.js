// Status registry. Every status id in SPEC section 2 has a row here (mode + hook semantics).
// keywords.json stays authoritative for name/icon/text; this file owns the MECHANICS.
// Entities (player, enemy, pet, totem) all carry `st: { id: number }`.
//  - duration statuses: number = turns left, tick down at ROUND END (fresh enemy->player debuffs skip the first tick).
//  - intensity statuses: number = stacks.
import { dealStatusDamage, healEntity, gainBlock, fx } from "./damage.js";
import { immuneToStatus } from "./immunity.js";
import { addRes } from "./resources.js";
import { runEffects } from "./effects.js";

export const STATUS_DEFS = {
  // duration
  vulnerable: { mode: "duration", kind: "debuff" },  // takes +50% damage
  weak: { mode: "duration", kind: "debuff" },        // deals -25% damage
  frail: { mode: "duration", kind: "debuff" },       // gains -25% block
  slow: { mode: "duration", kind: "debuff" },        // LEGACY (removed 2026-10-17, merged into Weak); kept so old saves load
  frozen: { mode: "duration", kind: "debuff" },      // skips its next action (consumed); shatter bonus for Frost
  stun: { mode: "duration", kind: "debuff" },        // skips its next action (consumed)
  fear: { mode: "duration", kind: "debuff" },        // flees: skips its next action (consumed)
  sleep: { mode: "duration", kind: "debuff" },       // skips actions until damaged
  silence: { mode: "duration", kind: "debuff" },     // cast intents fizzle; player cannot play spell cards
  veiled: { mode: "duration", kind: "debuff" },      // hides enemy intents (UI); any Holy card removes it from all enemies
  stealth: { mode: "duration", kind: "buff" },       // untargetable by single-target; enemy attacks on a stealthed player miss
  taunted: { mode: "duration", kind: "debuff" },     // single-target attacks go to pet/totem if one stands
  marked: { mode: "duration", kind: "debuff" },      // takes +2 flat per hit
  frostbite: { mode: "duration", kind: "debuff" },   // takes +50% from frost
  intangible: { mode: "duration", kind: "buff" },    // every hit reduced to 1
  // intensity
  poison: { mode: "intensity", kind: "debuff" },     // HP loss at its owner turn start, then -1
  bleed: { mode: "intensity", kind: "debuff" },      // HP loss each time its owner plays a card / acts; -1 per round
  burn: { mode: "intensity", kind: "debuff" },       // HP loss at its owner turn end, then -1
  strength: { mode: "intensity", kind: "buff", negative: true },
  dexterity: { mode: "intensity", kind: "buff", negative: true },
  thorns: { mode: "intensity", kind: "buff" },       // attackers take this much
  shield: { mode: "intensity", kind: "buff" },       // absorb pool (after Block), persists all combat
  regen: { mode: "intensity", kind: "buff" },        // heal at turn start, then -1
  disease: { mode: "intensity", kind: "debuff" },    // heals -50%; carries into the next combat (-1 per combat)
  curse: { mode: "intensity", kind: "debuff" },      // deals -1 damage per stack; -1 per round
  enrage: { mode: "intensity", kind: "buff" },       // +1 damage per stack
  armor: { mode: "intensity", kind: "buff" },        // mechanical: each hit reduced by stacks (min 1)
  cold: { mode: "intensity", kind: "debuff" },       // at 5+ stacks: lose 1 energy next turn, -5 stacks; -1 per round
  corrupted: { mode: "intensity", kind: "debuff" },  // lose ceil(stacks/2) HP at turn end
  madness: { mode: "intensity", kind: "debuff" },    // each card has 5% x stacks (max 75%) to fizzle
  feral: { mode: "intensity", kind: "buff" },        // +1 damage per stack
  metallicize: { mode: "intensity", kind: "buff" },  // block at turn end
  ritual: { mode: "intensity", kind: "buff" },       // +strength at turn start
  rage_gen: { mode: "intensity", kind: "buff" },     // player: +rage at turn start
  energized: { mode: "intensity", kind: "buff" },    // player: +energy next turn (consumed)
  vampiric_embrace: { mode: "intensity", kind: "buff" }, // shadow damage heals 25% per stack (damage.js)
  soul_link: { mode: "intensity", kind: "buff" },    // 30% of HP damage per stack goes to the demon (damage.js)
  amplify_curse: { mode: "intensity", kind: "buff" },// next Curse card doubles apply stacks (effects.js apply)
  delayed: { mode: "duration", kind: "debuff" },     // on expiry runs its payload effects on the holder (roundEnd)
  weapon_imbue_rockbiter: { mode: "intensity", kind: "buff" },   // +2 attack dmg, 2 Block per attack (resources.js / combat.js)
  weapon_imbue_flametongue: { mode: "intensity", kind: "buff" }, // +2 fire per attack (combat.js)
  weapon_imbue_flametongue_2: { mode: "intensity", kind: "buff" },// +4 fire per attack
  weapon_imbue_frostbrand: { mode: "intensity", kind: "buff" },  // Slow 1 per attack
  weapon_imbue_frostbrand_2: { mode: "intensity", kind: "buff" },// Slow 2 per attack
  weapon_imbue_windfury: { mode: "intensity", kind: "buff" },    // first attack each turn hits twice
  weapon_imbue_windfury_2: { mode: "intensity", kind: "buff" },
  spell_power: { mode: "intensity", kind: "buff" },  // +1 non-physical damage per stack
  reincarnation: { mode: "intensity", kind: "buff" },// at 0 HP return at 30% once (damage.js)
  free_cast: { mode: "intensity", kind: "buff" },    // next card(s) cost 0 (combat.js)
  retain_block: { mode: "intensity", kind: "buff" }, // Block is kept into next turn (combat.js)
  resist_fire: { mode: "duration", kind: "buff" },   // each fire hit reduced by stacks... see modifyTaken (value = flat reduction)
  resist_frost: { mode: "duration", kind: "buff" },
  resist_nature: { mode: "duration", kind: "buff" },
};

const ROUND_DECAY = { bleed: 1, curse: 1, cold: 1 };
const BOSS_TIERS = ["boss", "raid"];
const CONSUMED = ["stun", "fear", "frozen", "sleep"]; // consumed when the holder skips an action, not by the round clock

export const hasTrait = (e, t) => !!(e && Array.isArray(e.traits) && e.traits.includes(t));
export const getSt = (e, id) => (e && e.st && e.st[id]) || 0;
export const isEnemy = (e) => !!e && e.kind === "enemy";

export function modeOf(C, id) {
  const kw = C && C.data && C.data.status && C.data.status(id);
  if (kw && (kw.stackMode === "duration" || kw.stackMode === "intensity")) return kw.stackMode;
  return (STATUS_DEFS[id] && STATUS_DEFS[id].mode) || "intensity";
}

export function applyStatus(C, e, id, amount, o = {}) {
  if (!e || !id) return false;
  if (amount === undefined || amount === null) amount = 1;
  amount = Math.trunc(amount);
  if (!amount) return false;
  if (!e.st) e.st = {};
  const def = STATUS_DEFS[id] || {};
  if (amount > 0 && (hasTrait(e, "immune:" + id) || immuneToStatus(e, id, o.school, C && C.data && C.data.schoolsData && C.data.schoolsData.statusSchools))) {
    if (isEnemy(e)) fx(C, { t: "miss", uid: e.uid, text: "IMMUNE", kind: "gold" });
    return false;
  }
  if (amount > 0 && isEnemy(e) && BOSS_TIERS.includes(e.tier) && (id === "fear" || id === "sleep")) return false;
  if (amount > 0 && isEnemy(e) && BOSS_TIERS.includes(e.tier) && (id === "stun" || id === "frozen")) amount = Math.min(amount, 1);
  const mode = modeOf(C, id);
  if (mode === "duration") {
    const add = o.duration !== undefined && o.duration !== null ? o.duration : amount;
    e.st[id] = (e.st[id] || 0) + add;
    if (e.st[id] <= 0) delete e.st[id];
    else if (C && C.phase === "enemy" && e.kind === "player" && add > 0) (e.fresh || (e.fresh = {}))[id] = true;
  } else {
    if (o.duration > 0 && amount > 0) (e.tmp || (e.tmp = [])).push({ id, stacks: amount, turns: o.duration });
    e.st[id] = (e.st[id] || 0) + amount;
    if (e.st[id] === 0 || (e.st[id] < 0 && !def.negative)) delete e.st[id];
  }
  return true;
}

export function removeStatus(e, id) {
  if (e && e.st) delete e.st[id];
}

// ---- damage modifiers -------------------------------------------------------
export function packBonus(C, e) {
  if (!hasTrait(e, "pack") || !C || !C.enemies) return 0;
  let n = 0;
  for (const o of C.enemies) if (o !== e && o.hp > 0 && hasTrait(o, "pack")) n++;
  return n;
}

export function modifyDealt(C, src, amount) {
  if (!src) return amount;
  const st = src.st || {};
  let a = amount + (st.strength || 0) + (st.enrage || 0) + (st.feral || 0) - (st.curse || 0);
  if (src.kind === "enemy") a += packBonus(C, src);
  if (st.weak) a *= 0.75;
  return Math.max(0, Math.floor(a));
}

export function modifyTaken(C, tgt, amount, school, o = {}) {
  if (!tgt || amount <= 0) return Math.max(0, amount);
  const st = tgt.st || {};
  let a = amount;
  if (st.vulnerable) a *= 1.5;
  if (st.frostbite && school === "frost" && tgt.kind !== "player") a *= 1.5;
  if (st.marked) a += 2;
  if (school && tgt.resist) { if (tgt.resist[school] !== undefined) a *= tgt.resist[school]; } else if (school && hasTrait(tgt, "resist:" + school)) a *= 0.5;
  if (school && hasTrait(tgt, "weak:" + school)) a *= 1.5;
  if (school && st["resist_" + school]) a -= st["resist_" + school];
  a = Math.max(0, Math.floor(a));
  if (st.intangible) a = Math.min(a, 1);
  if (st.armor && !o.pierce) a = Math.max(1, a - st.armor);
  return Math.max(0, a);
}

export function gainBlockAmount(e, amount) {
  const st = e.st || {};
  let a = amount + (st.dexterity || 0);
  if (st.frail) a *= 0.75;
  return Math.max(0, Math.floor(a));
}

// ---- tick hooks ---------------------------------------------------------------
export function skipsAction(C, e) {
  // Returns the reason string and consumes one charge, or null.
  for (const id of ["stun", "fear", "frozen"]) {
    if (e.st[id] > 0) {
      e.st[id] -= 1;
      if (e.st[id] <= 0) delete e.st[id];
      return id;
    }
  }
  if (e.st.sleep > 0) return "sleep";
  return null;
}

export function turnStart(C, e) {
  const st = e.st;
  if (st.poison > 0) {
    dealStatusDamage(C, e, st.poison, "poison");
    st.poison -= 1;
    if (st.poison <= 0) delete st.poison;
  }
  if (e.hp > 0 && st.regen > 0) {
    healEntity(C, e, st.regen);
    if (!(e.tmp && e.tmp.some((t) => t.id === "regen"))) { st.regen -= 1; if (st.regen <= 0) delete st.regen; }
  }
  if (st.ritual) applyStatus(C, e, "strength", st.ritual);
  if (e.kind === "player") {
    if (st.rage_gen) addRes(C, "rage", st.rage_gen);
    if (st.cold >= 5) {
      C.coldDrain = (C.coldDrain || 0) + 1;
      st.cold -= 5;
      if (st.cold <= 0) delete st.cold;
    }
  }
}

export function onAction(C, e) {
  // bleed ticks whenever its owner plays a card (player) or acts (enemy)
  if (e.hp > 0 && e.st.bleed > 0) dealStatusDamage(C, e, e.st.bleed, "bleed");
}

export function turnEnd(C, e) {
  const st = e.st;
  if (e.hp > 0 && st.burn > 0) {
    dealStatusDamage(C, e, st.burn, "burn");
    st.burn -= 1;
    if (st.burn <= 0) delete st.burn;
  }
  if (e.hp > 0 && st.corrupted > 0) dealStatusDamage(C, e, Math.ceil(st.corrupted / 2), "corrupted");
  if (e.hp > 0 && st.metallicize > 0) gainBlock(C, e, st.metallicize, { raw: true });
}

export function roundEnd(C, e) {
  const st = e.st;
  const hadDelayed = st.delayed > 0;
  for (const id of Object.keys(st)) {
    if (modeOf(C, id) === "duration" && !CONSUMED.includes(id)) {
      if (e.fresh && e.fresh[id]) continue;
      st[id] -= 1;
      if (st[id] <= 0) delete st[id];
    } else if (ROUND_DECAY[id]) {
      st[id] -= ROUND_DECAY[id];
      if (st[id] <= 0) delete st[id];
    }
  }
  e.fresh = {};
  if (hadDelayed && !st.delayed && e.payloads && e.payloads.length) {
    const pl = e.payloads.shift();
    runEffects({ C, src: pl.source || C.player, srcKind: "player", target: e }, [].concat(pl.effects).map((x) => (x.op === "damage" && !x.target ? { ...x, target: "target" } : x)));
  }
  if (e.tmp && e.tmp.length) {
    const keep = [];
    for (const t of e.tmp) {
      t.turns -= 1;
      if (t.turns <= 0) { st[t.id] = (st[t.id] || 0) - t.stacks; if (!st[t.id]) delete st[t.id]; }
      else keep.push(t);
    }
    e.tmp = keep;
  }
  // stun/fear/frozen on the player are consumed by combat.startPlayerTurn (energy/draw penalties), not here.
}

export function wakeOnDamage(e) {
  if (e.st && e.st.sleep) delete e.st.sleep;
}

export function statusEntries(e) {
  return Object.entries((e && e.st) || {}).filter(([, v]) => v !== 0);
}
