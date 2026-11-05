// Character looks (skin colour / face / hair style / hair colour / facial hair): pure data, no DOM, no combat effect.
// run.character.looks = { skin, face, hair, hairColor, facial [, v:1] } - indices into the per-race/gender option lists baked from the
// datamine (tools/spires/bake_looks.py -> engine/looksData.js counts, assets/looks/<race>-<gender>.json elements). Index 0 is the client's
// first choice; `v:1` marks a character made on the new screen (the in-run hero then always composes its looks, even when all are 0).
// Old saves have no looks: every index defaults to 0 and, without `v`, the hero keeps its baked body unchanged.
import { LOOKS_DATA } from "./looksData.js";
export const LOOK_KEYS = ["skin", "face", "hair", "hairColor", "facial"];
export const looksSlug = (race, gender) => `${race}-${gender === "female" ? "female" : "male"}`;
// { labels: [5 row names], n: [5 variant counts] } or null for an unknown race
export const looksCounts = (race, gender) => LOOKS_DATA[looksSlug(race, gender)] || null;
const clampI = (v, n) => { const i = Math.floor(Number(v)); return Number.isFinite(i) && n > 0 ? Math.max(0, Math.min(n - 1, i)) : 0; };
// any stored thing -> valid looks for this race/gender (extra keys dropped, `v` kept)
export function cleanLooks(raw, race, gender) {
  const r = raw && typeof raw === "object" ? raw : {}, c = looksCounts(race, gender), out = {};
  LOOK_KEYS.forEach((k, i) => { out[k] = clampI(r[k], c ? c.n[i] : 1); });
  if (r.v) out.v = 1;
  return out;
}
export const looksActive = (l) => !!l && (l.v === 1 || LOOK_KEYS.some((k) => l[k] > 0));
export const looksKey = (l) => (l ? LOOK_KEYS.map((k) => l[k] | 0).join(".") + (l.v ? "v" : "") : "");
// rows a race/gender actually has (n > 1); the UI hides the rest
export const looksRows = (race, gender) => { const c = looksCounts(race, gender); return c ? LOOK_KEYS.map((key, i) => ({ key, label: c.labels[i], n: c.n[i], i })).filter((r) => r.n > 1) : []; };
export function cycleLook(looks, race, gender, key, dir) {
  const c = looksCounts(race, gender), i = LOOK_KEYS.indexOf(key);
  if (!c || i < 0 || c.n[i] < 2) return cleanLooks(looks, race, gender);
  const out = cleanLooks(looks, race, gender); out[key] = (out[key] + (dir < 0 ? -1 : 1) + c.n[i]) % c.n[i]; out.v = 1; return out;
}
export function randomLooks(race, gender, rng = Math.random) {
  const c = looksCounts(race, gender), out = { v: 1 };
  LOOK_KEYS.forEach((k, i) => { out[k] = c ? Math.min(c.n[i] - 1, Math.floor(rng() * c.n[i])) : 0; });
  return out;
}
// Mirror of hero_dress_plan.customization(): walk the options in order; an element applies when its related choice is none, the chosen
// Skin Color (rel 1) or the chosen Hair Color (rel 2). -> { geos: [geoset ids], targets: { textureTarget: bank file } }
// An element list keyed by Skin Color (rel 1) or Hair Color (rel 2) may not cover every colour; use the closest one that exists (lower first).
function nearest(lst, rel, want) {
  const have = [...new Set(lst.filter((e) => e[0] === rel).map((e) => e[1]))];
  if (!have.length || have.includes(want)) return want;
  return have.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) || (Math.abs(b - want) === Math.abs(a - want) && b < a) ? b : a));
}
export function resolveLooks(man, looks) {
  const l = cleanLooks(looks, ...String(man.slug).split("-")), geos = [], targets = {};
  const pick = { skin: l.skin, hairColor: l.hairColor }, roles = ["skin", "face", "hair", "hairColor", "extra"], idx = [l.skin, l.face, l.hair, l.hairColor, l.facial];
  roles.forEach((role, ri) => {
    const lst = (man.elems[role] || [])[idx[ri]] || [];
    const skin = nearest(lst, 1, pick.skin), hc = nearest(lst, 2, pick.hairColor); // 11-03 report: tauren-female faces exist for even skin colours only -> odd skins drew no face (no eyes)
    for (const e of lst) {
      if (e[0] === 1 && e[1] !== skin) continue;
      if (e[0] === 2 && e[1] !== hc) continue;
      if (e[2] === "g") geos.push(e[3]); else if (e[4]) targets[e[3]] = e[4];
    }
  });
  for (const ly of man.layers) { // a hair style with no texture of its own (bald / short) still needs the chosen colour for facial hair and horns
    if (ly.type === 1 || targets[ly.target]) continue;
    for (const lst of man.elems.hair || []) { const e = lst.find((x) => x[2] === "t" && x[3] === ly.target && x[4] && (x[0] === 0 || (x[0] === 2 && x[1] === pick.hairColor) || (x[0] === 1 && x[1] === pick.skin))); if (e) { targets[ly.target] = e[4]; break; } }
  }
  return { geos, targets };
}
