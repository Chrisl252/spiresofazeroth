// Per-act balance table: node tools/spires/act-sim.mjs [--runs 200] [--acts 2] [--zone elwynn-forest] [--class all]
// Plays each class through the first N spires with the greedy sim policy and reports, per act:
//   clear% (boss beaten, of runs that entered the act), HP% / gold / gear worn / fights / floors at the boss.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createData } from "../../spiresofazeroth/js/engine/data.js";
import { simRun } from "../../spiresofazeroth/js/engine/sim.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? a.concat([[x.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]]) : a), []));
const dataDir = path.resolve(args.data || path.join(here, "../../spiresofazeroth/data"));
const fix = path.join(here, "fixtures");
const fetchJson = async (rel) => { for (const b of [dataDir, fix]) { try { return JSON.parse((await readFile(path.join(b, rel), "utf8")).replace(/^﻿/, "")); } catch (e) { /* next */ } } return null; };
const runs = +(args.runs || 200), acts = +(args.acts || 1), seed0 = args.seed || "b";
const zones = (args.zone || "elwynn-forest,dun-morogh,tirisfal-glades").split(","); // act-1 starter zones; runs are split across them
const deaths = {};
const data = createData({ fetchJson });
await data.load();
if (args.patch) for (const [k, v] of Object.entries(JSON.parse(args.patch))) Object.assign(data.mapProfiles.profiles[k], v); // --patch '{"short":{"tierCurve":[0.4,1]}}' for tuning
const classes = args.class && args.class !== "all" ? [args.class] : data.classIds;
const agg = Array.from({ length: acts + 1 }, () => ({ enter: 0, clear: 0, hp: 0, gold: 0, worn: 0, fights: 0, floors: 0 }));
for (const cid of classes) {
  if (!(await data.loadClass(cid))) continue;
  const row = Array.from({ length: acts + 1 }, () => ({ enter: 0, clear: 0 }));
  for (let i = 0; i < runs; i++) {
    const r = await simRun(data, { classId: cid, seed: `${seed0}-${i}`, firstZone: zones[i % zones.length], stopAfterAct: acts, maxSteps: 2500 });
    if (r.result === "defeat") { const nd = r.map && r.map.floors[r.floor] && r.map.floors[r.floor][r.col]; const k = `a${r.act}:${nd ? nd.type : "?"}:f${r.floor}`; deaths[k] = (deaths[k] || 0) + 1; }
    const reached = r.act; // acts entered
    for (let a = 1; a <= Math.min(acts, reached); a++) { row[a].enter++; agg[a].enter++; }
    for (const l of r.actLog) {
      if (l.act > acts) continue;
      row[l.act].clear++; const g = agg[l.act];
      g.clear++; g.hp += l.hp / l.maxHp; g.gold += l.gold; g.worn += l.worn; g.fights += l.fights; g.floors += l.floors;
    }
  }
  console.log(cid.padEnd(8), row.slice(1).map((x, k) => `act${k + 1} ${(100 * x.clear / Math.max(1, x.enter)).toFixed(0)}%`).join("  "));
}
for (let a = 1; a <= acts; a++) {
  const g = agg[a], n = Math.max(1, g.clear);
  console.log(`ACT${a} clear=${(100 * g.clear / Math.max(1, g.enter)).toFixed(1)}%  hp@boss=${(100 * g.hp / n).toFixed(0)}%  gold=${(g.gold / n).toFixed(0)}  worn=${(g.worn / n).toFixed(1)}  fights(cum)=${(g.fights / n).toFixed(1)}  floors(cum)=${(g.floors / n).toFixed(1)}  n=${g.enter}`);
}
console.log("deaths", Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(" "));
