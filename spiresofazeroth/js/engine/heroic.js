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
