// Map invariants over N seeds per profile: node tools/spires/map-check.mjs [--seeds 3000]
// Checks (every profile in data/map-profiles.json + FULL): floor count, 1 boss on the last floor, 1 campfire right before it, 2-3 live per
// choice floor, every node reachable from the inn and able to reach the boss, no crossing edges, edges only between neighbouring lanes,
// siblings at a fork differ on free floors, per-type budget counts inside the profile's [min,max]. Exit 1 on any violation.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateSpire, FULL_PROFILE } from "../../spiresofazeroth/js/engine/map.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? a.concat([[x.slice(2), all[i + 1]]]) : a), []));
const N = +(args.seeds || 3000);
const mp = JSON.parse(await readFile(path.join(here, "../../spiresofazeroth/data/map-profiles.json"), "utf8"));
const profiles = { ...mp.profiles, full: { ...FULL_PROFILE, ...mp.profiles.full } };
let total = 0;
for (const [id, P] of Object.entries(profiles)) {
  const bad = {}; const note = (k, seed) => { bad[k] = bad[k] || { n: 0, seed }; bad[k].n++; };
  const sum = { fights: 0, pathFights: 0, elite: 0, event: 0, vendor: 0, rest: 0, treasure: 0, nodes: 0 };
  for (let s = 0; s < N; s++) {
    const seed = `chk-${s}`;
    const m = generateSpire(seed, `1:test`, { profile: { ...P, id } });
    const F = m.floors, FL = P.floors, PRE = P.preBossRest;
    if (F.length !== FL) note("floor-count", seed);
    if (F[FL - 1].length !== 1 || F[FL - 1][0].type !== "boss") note("boss", seed);
    if (F[PRE].length !== 1 || F[PRE][0].type !== "rest") note("pre-boss-rest", seed);
    if (P.mode === "budget" && !F[0].every((n) => n.type === "fight")) note("floor0-fights", seed);
    for (let f = 0; f < FL; f++) if (f !== PRE && f !== FL - 1 && (F[f].length < 2 || F[f].length > 3)) note("live-2-3", seed);
    // reachability
    const fwd = new Set(m.start.next.map((c) => `0:${c}`)); const queue = [...fwd];
    while (queue.length) { const [f, c] = queue.shift().split(":").map(Number); for (const nc of F[f][c].next) { const k = `${f + 1}:${nc}`; if (!fwd.has(k)) { fwd.add(k); queue.push(k); } } }
    const back = new Set([`${FL - 1}:0`]); for (let f = FL - 1; f > 0; f--) for (const n of F[f]) if (back.has(`${f}:${n.col}`)) for (const pc of n.prev) back.add(`${f - 1}:${pc}`);
    for (const row of F) for (const n of row) {
      if (!fwd.has(`${n.floor}:${n.col}`)) note("unreachable", seed);
      if (!back.has(`${n.floor}:${n.col}`)) note("dead-end", seed);
      if (n.floor < FL - 1 && !n.next.length) note("no-next", seed);
      if (n.next.length > 2) note("fan-out>2", seed);
      for (const c of n.next) { if (Math.abs(F[n.floor + 1][c].lane - n.lane) > 1) note("lane-jump", seed); if (!F[n.floor + 1][c].prev.includes(n.col)) note("asym-edge", seed); }
    }
    for (let f = 0; f < FL - 1; f++) { const E = []; F[f].forEach((n) => n.next.forEach((c) => E.push([n.lane, F[f + 1][c].lane]))); for (const [a, b] of E) for (const [p, q] of E) if ((a < p && b > q)) note("crossing", seed); }
    // forks differ (free floors only)
    for (const from of [m.start, ...F.flat()]) {
      const kids = from.floor < 0 ? F[0] : from.next.map((c) => F[from.floor + 1][c]);
      if (kids.length < 2 || kids[0].floor === 0) continue;
      if (kids[0].floor === PRE || kids[0].floor === P.treasureFloor || kids[0].floor === FL - 1) continue;
      if (new Set(kids.map((k) => k.type)).size < kids.length) note("fork-same-type", seed);
    }
    const cnt = {}; for (const n of F.flat()) cnt[n.type] = (cnt[n.type] || 0) + 1;
    if (P.mode === "budget") for (const [t, [lo, hi]] of Object.entries(P.budget)) {
      const have = (cnt[t] || 0) - (t === "rest" ? 1 : 0) - (t === "treasure" && P.treasureFloor != null ? 1 : 0);
      if (t === "treasure" && P.treasureFloor != null) continue;
      if (have < lo || have > hi) note(`budget-${t}`, seed);
    }
    if (P.mode === "budget" && !F.flat().some((n) => n.type === "elite")) note("no-elite", seed);
    for (const t of ["elite", "event", "vendor", "rest", "treasure"]) sum[t] += cnt[t] || 0;
    sum.fights += cnt.fight || 0; sum.nodes += F.flat().length;
    // fights on the shortest-fight path
    const best = F.map((r) => r.map(() => 0)); for (const [f, r] of F.entries()) for (const n of r) { const here = n.type === "fight" || n.type === "elite" ? 1 : 0; const prev = f ? Math.min(...n.prev.map((c) => best[f - 1][c])) : 0; best[f][n.col] = prev + here; }
    sum.pathFights += best[FL - 1][0];
  }
  const avg = (k) => (sum[k] / N).toFixed(1);
  const fails = Object.entries(bad).map(([k, v]) => `${k}x${v.n}(${v.seed})`).join(" ");
  total += Object.keys(bad).length;
  console.log(`${id.padEnd(7)} floors=${P.floors} seeds=${N} ${fails ? "FAIL " + fails : "OK"}  avg/map: nodes=${avg("nodes")} fight=${avg("fights")} elite=${avg("elite")} event=${avg("event")} vendor=${avg("vendor")} rest=${avg("rest")} treasure=${avg("treasure")}  minFightsOnPath=${avg("pathFights")}`);
}
process.exit(total ? 1 : 0);
