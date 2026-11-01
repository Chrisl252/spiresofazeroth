// Mid-run talents (owner ruling 2026-10-30 "spend mid-run, never easier"). Pure engine: no DOM.
// (1) Points are PAID the moment they are earned (payMidRun, called on the map) instead of at run end; awardProgress (talents.js)
//     pays only the remainder, so the total pace is unchanged (run.talentPaid = points of runTalentPoints already credited).
// (2) Ranks learned DURING a run are stamped onto run.talents at once (restampRun) and each one costs Hardened Foes: enemies get
//     MID_TALENT_PRESSURE more HP per point for the rest of the run (combat.js startCombat). Mid-run is learn-only (no unlearn/reset),
//     so a build cannot be re-tailored per act. Measure with tools/spires/sim.mjs --talents P:N --midrun.
import { FLOORS_PER_POINT, POINTS_PER_ACT, TALENT_CAP, talentState, talentMods } from "./talents.js";
import { noviceOf } from "./heroic.js";

export const MID_TALENT_PRESSURE = 0.035; // +3.5% enemy HP per point learned mid-run (tuned with the sim, see DECISIONS_LOG 2026-10-30)

/** Points earned so far this run, by the same rule as runTalentPoints: floors cleared + acts cleared (victory is paid at run end).
 *  Only valid on the map (every entered floor is cleared there). */
export function midRunPoints(run) {
  const floors = Math.max(0, (run.stats && run.stats.floors) | 0);
  return Math.floor(floors / FLOORS_PER_POINT) + POINTS_PER_ACT * Math.max(0, (run.act | 0) - 1);
}
/** Credit points earned since the last call to meta.talents[cid].earned (capped). Returns the points actually added (0 = nothing). */
export function payMidRun(meta, run) {
  if (!meta || !run || run.screen !== "map") return 0;
  const due = midRunPoints(run) - (run.talentPaid | 0);
  if (due <= 0) return 0;
  run.talentPaid = (run.talentPaid | 0) + due;
  talentState(meta, run.classId); // creates the slot
  const s = meta.talents[run.classId], got = Math.max(0, Math.min(TALENT_CAP - (s.earned | 0), due));
  s.earned = (s.earned | 0) + got;
  run.talentGot = (run.talentGot | 0) + got;
  return got;
}
/** Remember how many points were spent when the run first opened the talent sheet (the Hardened Foes baseline). */
export function beginMidRun(meta, run) {
  if (run && run.talentBase === undefined) run.talentBase = talentState(meta, run.classId).used;
}
/** Points learned during this run (drives the enemy HP pressure). */
export const midRunSpent = (run) => Math.max(0, run.midTalents | 0);
export const midRunHpMult = (run) => 1 + MID_TALENT_PRESSURE * midRunSpent(run);

/** After a mid-run learn: re-stamp run.talents from meta, apply the Max HP difference (talent hp, or the Novice's Resolve cushion it
 *  replaces), add newly granted cards, and update the pressure count. Starting gold is a run-start bonus and is never paid late. */
export function restampRun(meta, run, data, tdef) {
  const cls = data.classObj(run.classId);
  const hpOf = (T) => (T ? (T.hp | 0) : noviceOf(cls).hp);
  const old = run.talents, next = talentMods(meta, run.classId, tdef);
  const dHp = hpOf(next) - hpOf(old);
  run.maxHp = Math.max(1, run.maxHp + dHp);
  run.hp = Math.max(1, Math.min(run.maxHp, run.hp + Math.max(0, dHp)));
  for (const k of Object.keys(next || {})) {
    if (!k.startsWith("grant:") || !(next[k] > 0) || (old && old[k] > 0)) continue;
    const id = k.slice(6);
    if (data.card && !data.card(id, run.classId)) continue;
    run.deck.push({ id, up: false });
  }
  run.talents = next;
  beginMidRun(meta, run);
  run.midTalents = Math.max(0, talentState(meta, run.classId).used - (run.talentBase | 0));
  return run.talents;
}
