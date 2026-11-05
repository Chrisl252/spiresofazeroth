// Ascension (2026-11-01): after a victory the hero can climb again from act 1 KEEPING deck, gear, bag, relics, potions, gold and talents.
// Each Ascension stacks a big jump on top of the run's Heroic/Mythic level (numbers: engine/heroic.js ascensionMods). Pure engine, no DOM.
import { prepareZonePick } from "./run.js";
import { ascensionMods, heroicName } from "./heroic.js";

/** A victorious solo run may ascend. Co-op runs may not (the partner's run would desync). */
export const canAscend = (run, coopActive = false) => !!run && run.result === "victory" && !coopActive;

/** What the next Ascension adds, for the button / confirm copy. */
export function nextAscensionPreview(run) {
  const next = ((run && run.ascension) | 0) + 1;
  const cur = ascensionMods(next - 1), nx = ascensionMods(next);
  return { level: next, hpJump: Math.round((nx.hpMult / cur.hpMult - 1) * 100), strJump: nx.strength - cur.strength, base: heroicName((run && run.heroic) | 0) };
}

/** Turns the finished run into Ascension n+1 in place, at the act-1 zone pick. Returns the run. */
export async function ascendRun(run, data) {
  const n = (run.ascension | 0) + 1;
  run.ascension = n;
  run.seed = `${String(run.seed).replace(/~A\d+$/, "")}~A${n}`; // fresh maps / events, still reproducible
  run.act = 0; run.zoneId = null; run.zonesVisited = []; run.map = null; run.floor = -1; run.col = -1; run.spire = {};
  run.seenEvents = [];
  run.hp = run.maxHp; // a full heal at the gate
  run.result = null; run.pending = null; run.endRecorded = false; run.endLogged = false; run.unlocked = null;
  run.ascStats = (run.ascStats || []).concat([{ ...run.stats }]);
  run.startedAt = Date.now();
  run.screen = "zonepick";
  await prepareZonePick(run, data);
  return run;
}
