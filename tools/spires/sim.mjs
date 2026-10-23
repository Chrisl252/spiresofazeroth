// Headless balance sim: node tools/spires/sim.mjs --class warrior --runs 50 --seed 1 [--heroic N] [--data dir]
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createData } from "../../spiresofazeroth/js/engine/data.js";
import { simRun } from "../../spiresofazeroth/js/engine/sim.js";
import { modsFromSpent } from "../../spiresofazeroth/js/engine/talents.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]]) : a), []));
const dataDir = path.resolve(args.data || path.join(here, "../../spiresofazeroth/data"));
const fix = path.join(here, "fixtures");
const fetchJson = async (rel) => {
  for (const base of [dataDir, fix]) {
    try { return JSON.parse((await readFile(path.join(base, rel), "utf8")).replace(/^﻿/, "")); } catch (e) { /* try next */ }
  }
  return null;
};
const classes = args.class && args.class !== "all" ? [args.class] : null;
const runs = +(args.runs || 20), seed0 = args.seed || "1", heroic = +(args.heroic || 0);
const data = createData({ fetchJson });
await data.load();
if (!data.classIds.length) data.classIds = ["warrior"];
let bad = 0, zeroTotal = 0;
for (const cid of classes || data.classIds) {
  if (!(await data.loadClass(cid))) { console.log(`${cid}: no class data`); continue; }
  const tally = { runs: 0, wins: 0, acts: 0, floors: 0, hp: 0, stalled: 0, errors: 0, drops: 0, worn: 0, set8: 0, bonus: 0, zeroE: 0 };
  const deaths = {};
  // --talents N[:P]: a character with P points (default 51) that fills tree N first, then the others in order (null = no talents)
  let tmods = null;
  if (args.talents !== undefined && args.talents !== "none") {
    const [tp, tn] = String(args.talents).split(":"), tdef = await fetchJson(`talents/${cid}.json`), primary = +tp || 0;
    if (tdef) {
      const spent = {}; let left = +(tn || 51);
      const order = [tdef.trees[primary], ...tdef.trees.filter((_, k) => k !== primary)].filter(Boolean);
      for (const tree of order) for (const t of tree.talents) {
        const r = Math.min(t.max || 1, left); if (r <= 0) break;
        spent[t.id] = r; left -= r;
      }
      tmods = modsFromSpent(tdef, spent); // same aggregation as the live game (engine/talents.js): flat keys + Talents V2 hooks
    }
  }
  for (let i = 0; i < runs; i++) {
    try {
      const r = await simRun(data, { classId: cid, seed: `${seed0}-${i}`, heroic, talents: tmods });
      tally.zeroE += r.stats.zeroEnergyTurns || 0;
      tally.runs++; tally.acts += r.act; tally.floors += r.stats.floors;
      const wornIds = Object.values(r.gear || {}).filter(Boolean); // gear: drops counted the same way the UI path does (afterCombat -> dropGear)
      tally.drops += r.stats.gearDrops || 0; tally.worn += wornIds.length; tally.bonus += r.relics.filter((x) => x.startsWith("set:")).length;
      if (r.relics.some((x) => x.endsWith(":8"))) tally.set8++;
      if (r.result === "victory") tally.wins++; else if (r.result === "stalled") tally.stalled++; else { const k = `${r.zoneId}`; deaths[k] = (deaths[k] || 0) + 1; }
    } catch (e) { tally.errors++; bad++; if (tally.errors <= 2) console.log(`  ERR ${cid} #${i}: ${e.stack.split("\n").slice(0, 4).join(" | ")}`); }
  }
  const top = Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" ");
  zeroTotal += tally.zeroE;
  console.log(`${cid.padEnd(8)} runs=${tally.runs} win=${tally.wins} avgAct=${(tally.acts / Math.max(1, tally.runs)).toFixed(2)} avgFloors=${(tally.floors / Math.max(1, tally.runs)).toFixed(1)} gear(drops=${(tally.drops / Math.max(1, tally.runs)).toFixed(1)} worn=${(tally.worn / Math.max(1, tally.runs)).toFixed(1)}/16 bonuses=${(tally.bonus / Math.max(1, tally.runs)).toFixed(1)} fullSet=${tally.set8}) stalled=${tally.stalled} zeroEnergyUnstunned=${tally.zeroE} errors=${tally.errors} deaths[${top}]`);
}
if (zeroTotal) { console.log(`FAIL: ${zeroTotal} turn starts with 0 energy and no visible stun`); bad++; }
process.exit(bad ? 1 : 0);
