// Co-op difficulty (2026-11-01): the shipped numbers on top of COOP_HP_MUL. Pure data, no DOM. Applied in combat.js startCombat when a co-op pack is built (o.hpMul > 0),
// so engine/coop.js needs no change; tools/spires/coop-sim.mjs measures exactly these values.
export const COOP_TUNING = {
  hpExtra: 1.6,                                      // extra enemy-HP multiplier on top of COOP_HP_MUL (1.6)
  strength: { normal: 0, elite: 1, boss: 1 },        // extra permanent Strength per enemy tier (flat damage per hit)
  actScale: 0,                                       // extra Strength every act past 1 (all tiers), rounded
};
/** heroicMods -> heroicMods for a two-hero pack. `t` lets tools override COOP_TUNING. */
export function coopTune(hm, run, t = COOP_TUNING) {
  const act = Math.max(1, (run && run.act) | 0), a = Math.round((act - 1) * (t.actScale || 0));
  return {
    ...hm,
    enemyHpMult: hm.enemyHpMult * (t.hpExtra || 1),
    normalStrength: (hm.normalStrength || 0) + (t.strength.normal || 0) + a,
    eliteStrength: (hm.eliteStrength || 0) + (t.strength.elite || 0) + a,
    bossStrength: (hm.bossStrength || 0) + (t.strength.boss || 0) + a,
  };
}
