// Heroic I-X difficulty (ascension). Level 0 = Normal. Pure data -> modifier object.
export const HEROIC_NAMES = ["Normal", "Heroic I", "Heroic II", "Heroic III", "Heroic IV", "Heroic V", "Heroic VI", "Heroic VII", "Heroic VIII", "Heroic IX", "Heroic X"];
export const MAX_HEROIC = 10;

export function heroicName(level) {
  return HEROIC_NAMES[Math.max(0, Math.min(MAX_HEROIC, level | 0))];
}

export function heroicMods(level) {
  const L = Math.max(0, Math.min(MAX_HEROIC, level | 0));
  return {
    level: L,
    enemyHpMult: 1.15 + 0.04 * L,  // 2026-10-18: Normal base +15% (sim act-1 clear was 87%, act-2 96%)
    normalStrength: L >= 7 ? 1 : 0,
    eliteStrength: L >= 3 ? (L >= 9 ? 2 : 1) : 0,
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
