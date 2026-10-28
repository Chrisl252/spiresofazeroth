// Heroic I-X difficulty (ascension). Level 0 = Normal. Pure data -> modifier object.
export const HEROIC_NAMES = ["Normal", "Heroic I", "Heroic II", "Heroic III", "Heroic IV", "Heroic V", "Heroic VI", "Heroic VII", "Heroic VIII", "Heroic IX", "Heroic X"];
export const MAX_HEROIC = 10;
export const MIN_HEROIC_OPEN = 3; // 2026-10-27: Heroic I-III are selectable from the start; higher levels still need the win-to-unlock
/** Highest Heroic level a character may pick: max(3, earned), capped at X. */
export function heroicOpen(meta, classId) { return Math.min(MAX_HEROIC, Math.max(MIN_HEROIC_OPEN, ((meta && meta.heroic && meta.heroic[classId]) | 0))); }
/** One line for the difficulty picker. */
export function heroicBlurb(level) {
  const m = heroicMods(level);
  if (!level) return "Normal: the standard climb.";
  const bits = ["more elites", "+" + Math.round((m.enemyHpMult - heroicMods(0).enemyHpMult) * 100) + "% enemy HP"];
  if (m.goldMult < 1) bits.push("less gold");
  if (m.healMult < 1) bits.push("weaker rests");
  if (level >= 6) bits.push("lower starting HP");
  if (m.potionSlots < 3) bits.push("fewer potion slots");
  if (level >= 7) bits.push("tougher normal foes");
  if (level >= 3) bits.push(level >= 5 ? "elites and bosses hit harder" : "elites hit harder");
  return `${heroicName(level)}: ${bits.join(", ")}.`;
}

export function heroicName(level) {
  return HEROIC_NAMES[Math.max(0, Math.min(MAX_HEROIC, level | 0))];
}

export function heroicMods(level) {
  const L = Math.max(0, Math.min(MAX_HEROIC, level | 0));
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
