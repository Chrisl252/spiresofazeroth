// Spire floor graph (StS style): one start node (zone inn) at the bottom centre, then `profile.floors` floors on 3 lanes (2-3 live per
// floor), forks/merges, no crossings, deterministic from (seed, tag). Length and type budget come from data/map-profiles.json
// (short = act 1, medium = act 2, full = the original 15). Pure.
import { streamFor } from "./rng.js?v=20261029d";

export const FLOORS = 15; // the "full" profile; other lengths come from the profile passed to generateSpire
export const FULL_PROFILE = {
  id: "full", floors: 15, mode: "weighted", preBossRest: 13, treasureFloor: 7,
  laneSets: [[[0, 1, 2], 2], [[0, 1], 1], [[1, 2], 1], [[0, 2], 1]], startLanes: [[[0, 1, 2], 55], [[0, 1], 15], [[1, 2], 15], [[0, 2], 15]],
};
export const NODE_TYPES = ["fight", "elite", "rest", "vendor", "event", "treasure", "boss"];

const LANES = 3;
const cross = (E, a, b) => E.some(([p, q]) => (p < a && q > b) || (p > a && q < b));

// Lane layout (StS style): one start (the zone inn, floor -1) forks into 2-3 lanes, never more than 3 live columns.
// floors[f] holds only the LIVE nodes (index == col, used by run.js); n.lane 0..2 is the horizontal slot.
function pickLanes(rng, P, f) {
  if (f === P.floors - 1 || f === P.preBossRest) return [1];
  return rng.weighted(f === 0 ? P.startLanes : P.laneSets, (x) => x[1])[0].slice();
}

function linkFloor(rng, A, B) {
  // A, B = lane arrays. returns edges [[ai, bi]] with |dlane|<=1, no crossings, every node covered both ways.
  const cand = [];
  A.forEach((la, i) => B.forEach((lb, j) => { if (Math.abs(la - lb) <= 1) cand.push([i, j]); }));
  const E = [];
  const add = ([i, j]) => { if (!E.some(([p, q]) => p === i && q === j) && !cross(E, i, j)) { E.push([i, j]); return true; } return false; };
  const shuf = (xs) => xs.map((x) => [rng.next(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  for (let i = 0; i < A.length; i++) {
    const own = shuf(cand.filter(([p]) => p === i)).sort((p, q) => Math.abs(A[i] - B[p[1]]) - Math.abs(A[i] - B[q[1]]));
    if (own.length && !own.some(add)) return null;
    if (!own.length) return null;
  }
  for (let j = 0; j < B.length; j++) {
    if (E.some(([, q]) => q === j)) continue;
    if (!shuf(cand.filter(([, q]) => q === j)).some(add)) return null;
  }
  for (const c of shuf(cand)) if (rng.chance(0.4)) add(c); // forks and merges
  // a node may fan out to at most 2
  for (let i = 0; i < A.length; i++) { const own = E.filter(([p]) => p === i); while (own.length > 2) { const x = own.pop(); E.splice(E.indexOf(x), 1); } }
  for (let j = 0; j < B.length; j++) if (!E.some(([, q]) => q === j)) return null;
  return E;
}

export function generateSpire(seed, tag, opts = {}) {
  const P = opts.profile || FULL_PROFILE;
  const FL = P.floors, PRE = P.preBossRest;
  const rng = streamFor(seed, "map|" + tag);
  const eliteBonus = opts.eliteBonus || 1;
  const floors = [];
  let prevLanes = [1]; // the start node stands at the bottom centre
  for (let f = 0; f < FL; f++) {
    let L = null, E = null;
    for (let t = 0; t < 60 && !E; t++) {
      L = pickLanes(rng, P, f);
      E = f === 0 ? [] : linkFloor(rng, prevLanes, L);
    }
    if (!E) { L = prevLanes.length === 1 ? [1] : prevLanes.slice(); E = L.length === prevLanes.length ? prevLanes.map((_, i) => [i, i]) : null; }
    if (!E) { L = [1]; E = prevLanes.map((_, i) => [i, 0]); }
    if (f === PRE + 1) E = prevLanes.map((_, i) => [i, 0]);
    floors.push(L.map((lane, c) => ({ id: `f${f}c${c}`, floor: f, col: c, lane, x: lane / 2, type: "fight", next: [], prev: [] })));
    if (f > 0) for (const [i, j] of E) { floors[f - 1][i].next.push(j); floors[f][j].prev.push(i); }
    prevLanes = L;
  }
  for (const row of floors) for (const n of row) { n.next.sort((a, b) => a - b); n.prev.sort((a, b) => a - b); }
  const start = { id: "start", floor: -1, col: -1, lane: 1, x: 0.5, type: "start", next: floors[0].map((n) => n.col), prev: [] };
  const sib = (n) => (n.floor < 0 ? floors[0] : n.next.map((c) => floors[n.floor + 1][c]));
  const all = (pred) => floors.flat().filter(pred);
  const fixedFloor = (f) => f === 0 || f === FL - 1 || f === PRE || f === P.treasureFloor;
  for (const n of floors.flat()) {
    if (n.floor === FL - 1) n.type = "boss";
    else if (n.floor === PRE) n.type = "rest";
    else if (n.floor === P.treasureFloor) n.type = "treasure";
  }
  // types: a few deterministic attempts until every fork on a free floor offers different node types (best attempt kept)
  const forksOk = () => [start, ...floors.flat()].every((from) => {
    const kids = sib(from);
    return kids.length < 2 || kids[0].floor === 0 || fixedFloor(kids[0].floor) || new Set(kids.map((k) => k.type)).size === kids.length;
  });
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const n of floors.flat()) if (!fixedFloor(n.floor) || (n.floor === 0)) n.type = "fight";
    if (P.mode === "budget") assignBudget(rng, P, floors, all, eliteBonus);
    else assignWeighted(rng, P, floors, all, eliteBonus);
    // a fork must MEAN something: siblings at a fork differ in type (fight stays the fallback), and forks offer at most one elite
    for (const from of [start, ...floors.flat()]) {
      const kids = sib(from);
      if (kids.length < 2) continue;
      const seen = new Set();
      for (const k of kids) {
        if (seen.has(k.type) && k.floor > 0 && !fixedFloor(k.floor)) {
          const alt = ["fight", "event", "vendor", "rest", "elite"].filter((t) => !seen.has(t) && !(t === "elite" && k.floor < 3) && !(t === "vendor" && k.floor < 2) && !(t === "rest" && k.floor < 3) && !(P.mode === "budget" && atMax(P, floors, t)));
          const prevT = k.prev.map((c) => floors[k.floor - 1][c].type);
          const pick = alt.find((t) => !(["elite", "rest", "vendor"].includes(t) && prevT.includes(t)));
          if (pick) k.type = pick;
        }
        seen.add(k.type);
      }
    }
    if (P.mode !== "budget" || forksOk()) break;
  }
  return { floors, start, seedTag: tag, profile: P.id || null };
}

// budget maps: the fork pass may not push a budgeted type past its profile max
function atMax(P, floors, t) {
  const b = P.budget && P.budget[t];
  return !!b && floors.flat().filter((n) => n.type === t).length >= b[1];
}

// weighted mode (the full 15-floor spire): per-node type table, then minimums for elite / vendor / rest
function assignWeighted(rng, P, floors, all, eliteBonus) {
  for (let f = 0; f < P.floors; f++) {
    for (const n of floors[f]) {
      if (f === P.floors - 1 || f === P.preBossRest || f === P.treasureFloor) continue;
      if (f === 0) { n.type = "fight"; continue; }
      const parentTypes = n.prev.map((c) => floors[f - 1][c].type);
      const table = [["fight", 45], ["event", 22]];
      if (f >= 3) table.push(["elite", 9 * eliteBonus]);
      if (f >= 3) table.push(["rest", 12]);
      if (f >= 2) table.push(["vendor", 8]);
      const ok = table.filter(([t]) => !(["elite", "rest", "vendor"].includes(t) && parentTypes.includes(t)));
      n.type = rng.weighted(ok, (x) => x[1])[0];
    }
  }
  if (floors[0].length > 2) floors[0][rng.int(0, floors[0].length - 1)].type = "event";
  const convert = (to, pred, min) => {
    let have = all((n) => n.type === to).length;
    const pool = all((n) => n.type === "fight" && pred(n));
    while (have < min && pool.length) {
      const n = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      n.type = to;
      have++;
    }
  };
  convert("elite", (n) => n.floor >= 4 && n.floor <= 12, 2);
  convert("vendor", (n) => n.floor >= 2 && n.floor <= 12, 1);
  convert("rest", (n) => n.floor >= 3 && n.floor <= 12, 1);
}

// budget mode (short maps): exact map-wide counts per type drawn from [min,max], placed on random fight nodes inside each type's floor
// window, never next to the same elite / rest / vendor; everything left stays a fight.
function assignBudget(rng, P, floors, all, eliteBonus) {
  // siblings = the other children of any parent of n; a special prefers a node whose siblings are still plain fights so forks stay meaningful
  const sibs = (n) => n.prev.flatMap((c) => floors[n.floor - 1][c].next.map((k) => floors[n.floor][k])).filter((m) => m !== n);
  const place = (t, count) => {
    const [lo, hi] = P.where[t] || [1, P.floors - 3];
    for (let k = 0; k < count; k++) {
      let pool = all((n) => n.type === "fight" && n.floor > 0 && n.floor >= lo && n.floor <= hi &&
        !(["elite", "rest", "vendor"].includes(t) && [...n.prev.map((c) => floors[n.floor - 1][c]), ...n.next.map((c) => floors[n.floor + 1][c])].some((m) => m.type === t)));
      const fresh = pool.filter((n) => !sibs(n).some((m) => m.type === t));
      if (fresh.length) pool = fresh;
      const need = pool.filter((n) => sibs(n).some((m) => m.type === "fight"));
      if (need.length) pool = need;
      if (!pool.length) return;
      pool[rng.int(0, pool.length - 1)].type = t;
    }
  };
  const roll = (t) => { const [a, b] = P.budget[t] || [0, 0]; return rng.int(a, b); };
  place("elite", roll("elite") + (eliteBonus > 1 ? 1 : 0));
  place("vendor", roll("vendor"));
  place("treasure", roll("treasure"));
  place("rest", roll("rest"));
  place("event", roll("event"));
}

export function startNode(map) { return map.start; }
export function startNodes(map) { return map.floors[0]; }
export function nodeAt(map, floor, col) { return map.floors[floor] && map.floors[floor][col]; }
export function nextNodes(map, floor, col) {
  if (floor < 0) return map.floors[0];
  const n = nodeAt(map, floor, col);
  return n ? n.next.map((c) => map.floors[floor + 1][c]) : [];
}
