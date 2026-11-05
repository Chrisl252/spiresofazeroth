// Difficulty ladder (pure data -> modifier object). Level 0 = Normal, 1-10 = Heroic I-X, 11-20 = Mythic I-X.
// 2026-11-01 "big update": Mythic tier (a deliberate jump past Heroic X) + Ascension (endless post-victory loop that keeps your gear, deck and talents;
// each Ascension is a huge hump on top of the run's level). Players reported "not challenging after talents and full gear".
export const HEROIC_NAMES = ["Normal", "Heroic I", "Heroic II", "Heroic III", "Heroic IV", "Heroic V", "Heroic VI", "Heroic VII", "Heroic VIII", "Heroic IX", "Heroic X",
  "Mythic I", "Mythic II", "Mythic III", "Mythic IV", "Mythic V", "Mythic VI", "Mythic VII", "Mythic VIII", "Mythic IX", "Mythic X"];
export const MAX_HEROIC = 20;
export const MYTHIC_START = 11;
export const MIN_HEROIC_OPEN = 3; // 2026-10-27: Heroic I-III are selectable from the start; higher levels still need the win-to-unlock
/** Tier groups for the picker: [id, label, first level, last level]. */
export const TIERS = [["normal", "Normal", 0, 0], ["heroic", "Heroic", 1, 10], ["mythic", "Mythic", 11, 20]];
export const tierOf = (level) => (level >= MYTHIC_START ? "mythic" : level >= 1 ? "heroic" : "normal");
/** Highest Heroic level a character may pick: max(3, earned), capped at Mythic X. */
export function heroicOpen(meta, classId) { return Math.min(MAX_HEROIC, Math.max(MIN_HEROIC_OPEN, ((meta && meta.heroic && meta.heroic[classId]) | 0))); }

export function heroicName(level) {
  return HEROIC_NAMES[Math.max(0, Math.min(MAX_HEROIC, level | 0))];
}
/** "Mythic III" or "Mythic III + Ascension 2". */
export function difficultyLabel(level, asc = 0) {
  return heroicName(level) + ((asc | 0) > 0 ? ` + Ascension ${asc | 0}` : "");
}

function baseMods(L) {
  if (L >= MYTHIC_START) {
    const m = L - 10; // Mythic 1-10
    return {
      level: L,
      enemyHpMult: 1.65 + 0.30 + 0.06 * m, // the Mythic jump: Heroic X = 1.65, Mythic I = 2.01, Mythic X = 2.55
      normalStrength: 2 + (m >= 6 ? 1 : 0),
      eliteStrength: 4 + Math.floor(m / 4),
      bossStrength: 3 + Math.floor(m / 5),
      goldMult: 0.8,
      healMult: 0.7,
      startHpPenalty: 0.85,
      potionSlots: m >= 6 ? 1 : 2,
      eliteBonus: 1.35,
    };
  }
  return {
    level: L,
    enemyHpMult: 1.25 + 0.04 * L,  // 2026-10-27: Normal base +25% (was +15% from 10-18; players found Normal too easy)
    normalStrength: L >= 7 ? 1 : 0,
    eliteStrength: L >= 9 ? 3 : L >= 3 ? 2 : 1, // 2026-10-27: elites hit +1 harder at every level (Normal was 0)
    bossStrength: L >= 5 ? (L >= 10 ? 2 : 1) : 0,
    goldMult: L >= 2 ? 0.9 : 1,
    healMult: L >= 4 ? 0.85 : 1,       // rest sites heal less
    startHpPenalty: L >= 6 ? 0.9 : 1,
    potionSlots: L >= 8 ? 2 : 3,
    eliteBonus: L >= 1 ? 1.2 : 1,      // more elites on the map
  };
}

/** Ascension n (n >= 1) stacks on top of the level: enemy HP x1.6 at A1, then x1.3 per further Ascension; +3 Strength on every enemy at A1, +2 per further. */
export function ascensionMods(asc) {
  const n = Math.max(0, asc | 0);
  if (!n) return { hpMult: 1, strength: 0, healMult: 1, eliteMult: 1 };
  return { hpMult: 1.6 * Math.pow(1.3, n - 1), strength: 3 + 2 * (n - 1), healMult: Math.pow(0.85, Math.min(n, 3)), eliteMult: 1.25 };
}

export function heroicMods(level, asc = 0) {
  const L = Math.max(0, Math.min(MAX_HEROIC, level | 0));
  const b = baseMods(L);
  const a = ascensionMods(asc);
  if (a.strength === 0) return b;
  return {
    ...b,
    ascension: asc | 0,
    enemyHpMult: b.enemyHpMult * a.hpMult,
    normalStrength: b.normalStrength + a.strength,
    eliteStrength: b.eliteStrength + a.strength,
    bossStrength: b.bossStrength + a.strength,
    healMult: b.healMult * a.healMult,
    eliteBonus: b.eliteBonus * a.eliteMult,
  };
}

/** The picker's stat card: concrete numbers, so the gaps between levels are visible. */
export function heroicStats(level, asc = 0) {
  const m = heroicMods(level, asc);
  const pct = (x) => Math.round((x - 1) * 100);
  return {
    enemyHp: pct(m.enemyHpMult), normal: m.normalStrength, elite: m.eliteStrength, boss: m.bossStrength,
    gold: pct(m.goldMult), rest: pct(m.healMult), startHp: pct(m.startHpPenalty), potions: m.potionSlots, elites: pct(m.eliteBonus),
  };
}

/** One line for the difficulty picker. */
export function heroicBlurb(level) {
  const L = level | 0;
  const s = heroicStats(L);
  if (!L) return "Normal: the standard climb.";
  const bits = [`+${s.enemyHp}% enemy HP`, "more elites"];
  if (s.gold < 0) bits.push(`${s.gold}% gold`);
  if (s.rest < 0) bits.push(`rests heal ${s.rest}%`);
  if (s.startHp < 0) bits.push(`${s.startHp}% starting HP`);
  if (s.potions < 3) bits.push(`${s.potions} potion slot${s.potions === 1 ? "" : "s"}`);
  if (s.normal) bits.push(`normal foes +${s.normal} Str`);
  if (s.elite) bits.push(`elites +${s.elite} Str`);
  if (s.boss) bits.push(`bosses +${s.boss} Str`);
  return `${heroicName(L)}: ${bits.join(", ")}.`;
}

// Novice's Resolve (2026-10-23): a hero with NO talent points yet (run.talents == null) is a fresh player; they get a sturdier hero and softer enemies
// so the first runs are winnable-but-hard. The first spent talent point switches it off (talents then carry the power curve).
export const NOVICE = { hp: 10, enemyHp: 0.88 };
/** The class's own Novice's Resolve numbers (data/classes/<id>.json `novice`: { hp, enemyHp, lateEnemyHp }), else the defaults above.
 *  enemyHp applies in acts 1-3; lateEnemyHp (default = enemyHp) in acts 4-6, so a class that is strong late can front-load its cushion. */
export function noviceOf(cls, act = 1) {
  const n = (cls && cls.novice) || {};
  const early = typeof n.enemyHp === "number" ? n.enemyHp : NOVICE.enemyHp;
  return { hp: typeof n.hp === "number" ? n.hp : NOVICE.hp, enemyHp: act >= 4 && typeof n.lateEnemyHp === "number" ? n.lateEnemyHp : early };
}
