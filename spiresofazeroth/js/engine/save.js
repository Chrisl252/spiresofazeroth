// Persistence: localStorage (always in try/catch, memory fallback), autosave, export/import string, meta progression.
// Meta: unlocked classes (first 3 in classes/index.json; every victory unlocks the next), Heroic I-X per class, codex seen-sets.
import { MAX_HEROIC } from "./heroic.js";
import { awardProgress } from "./talents.js";

const KEY_RUN = "spires.run.v1";
const KEY_META = "spires.meta.v1";
const mem = {};

function store() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      const k = "__spires_probe__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return localStorage;
    }
  } catch (e) { /* blocked */ }
  return null;
}
function read(key) {
  try {
    const s = store();
    const raw = s ? s.getItem(key) : mem[key];
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function write(key, val) {
  try {
    const raw = JSON.stringify(val);
    const s = store();
    if (s) s.setItem(key, raw); else mem[key] = raw;
    return true;
  } catch (e) { return false; }
}
function drop(key) {
  try { const s = store(); if (s) s.removeItem(key); else delete mem[key]; } catch (e) { /* ignore */ }
}

export const defaultMeta = () => ({
  v: 1, unlocked: [], heroic: {}, codex: { cards: {}, enemies: {}, relics: {} },
  settings: { speed: "normal", speedMul: null, musicVolume: null, sfxVolume: null, ambienceVolume: null, ambienceMode: "occasional", musicTrack: null, sound: false, reducedMotion: null, unlockAll: false },
  stats: { runs: 0, wins: 0, bestAct: 0 }, lastSeed: "",
  talents: {}, progress: {}, // engine/talents.js: per-class { earned, spent } and { xp, runs, wins }
});

export function loadMeta() {
  const m = read(KEY_META);
  const d = defaultMeta();
  if (!m) return d;
  return { ...d, ...m, codex: { ...d.codex, ...(m.codex || {}) }, settings: { ...d.settings, ...(m.settings || {}) }, stats: { ...d.stats, ...(m.stats || {}) }, heroic: m.heroic || {}, unlocked: m.unlocked || [], talents: m.talents || {}, progress: m.progress || {} };
}
export const saveMeta = (m) => write(KEY_META, m);
export const saveRun = (run) => (run ? write(KEY_RUN, run) : false);
export const loadRun = () => {
  const r = read(KEY_RUN);
  return r && r.v === 1 && r.screen && r.screen !== "end" ? r : null;
};
export const clearRun = () => drop(KEY_RUN);

export function isClassUnlocked(meta, classIds, id) {
  return classIds.indexOf(id) >= 0; // all classes open from the start (owner ruling 2026-10-17); meta.unlocked kept as data
}
export function unlockText(cls) {
  return (cls && cls.unlockText) || "Win a run to unlock the next class.";
}

export function mergeSeen(meta, run) {
  for (const kind of ["cards", "enemies", "relics"]) Object.assign(meta.codex[kind], run.seen ? run.seen[kind] : {});
}

// Called once when a run ends. Returns what was unlocked, for the run-end screen: class / heroic entries, then the talent points
// and card-unlock level from engine/talents.js (unlocks = data.unlocks; may be null).
export function recordRunEnd(meta, run, classIds, unlocks = null) {
  mergeSeen(meta, run);
  meta.stats.runs++;
  meta.stats.bestAct = Math.max(meta.stats.bestAct, run.act);
  meta.lastSeed = run.seed;
  const unlocked = [];
  if (run.result === "victory") {
    meta.stats.wins++;
    const next = classIds.find((id, i) => i >= 3 && !meta.unlocked.includes(id));
    if (next) { meta.unlocked.push(next); unlocked.push({ type: "class", id: next }); }
    const cur = meta.heroic[run.classId] || 0;
    if ((run.heroic || 0) >= cur && cur < MAX_HEROIC) {
      meta.heroic[run.classId] = Math.min(MAX_HEROIC, (run.heroic || 0) + 1);
      unlocked.push({ type: "heroic", id: run.classId, level: meta.heroic[run.classId] });
    }
  }
  const prog = awardProgress(meta, run, unlocks);
  if (prog.points > 0) unlocked.push({ type: "talent", id: run.classId, points: prog.points });
  if (prog.level > prog.prevLevel) unlocked.push({ type: "level", id: run.classId, level: prog.level, cards: prog.newCards });
  unlocked.push({ type: "xp", id: run.classId, xp: prog.xp, nextXp: prog.nextXp, level: prog.level });
  saveMeta(meta);
  return unlocked;
}

// ---- export / import (one pasteable string) ------------------------------------------------------
const PREFIX = "SPIRES1:";
const toB64 = (s) => {
  if (typeof btoa === "function") {
    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { /* fall through */ }
  }
  return Buffer.from(s, "utf8").toString("base64");
};
const fromB64 = (s) => {
  if (typeof atob === "function") {
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { /* fall through */ }
  }
  return Buffer.from(s, "base64").toString("utf8");
};

export function exportSave() {
  return PREFIX + toB64(JSON.stringify({ meta: loadMeta(), run: read(KEY_RUN) }));
}
// Pull the base64 payload out of whatever the player pasted: tolerates whitespace / line breaks / zero-width chars, wrapping quotes or
// extra text, a lower-case prefix, base64url (-_) and missing padding. Old 20261023a strings (plain base64, SPIRES1:) pass unchanged.
function extractPayload(str) {
  const raw = String(str || "").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  const m = /SPIRES1\s*:/i.exec(raw);
  if (!m) return null;
  let b = raw.slice(m.index + m[0].length).replace(/[^A-Za-z0-9+/_=-]/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (b.length % 4 === 1) return "!"; // cut off / not base64
  while (b.length % 4) b += "=";
  return b;
}
export function importSave(str) {
  const b64 = extractPayload(str);
  if (b64 === null) return { ok: false, error: String(str || "").trim() ? "That is not a Spires of Azeroth save string (it should start with SPIRES1:). Copy the whole string again." : "Paste a save string first." };
  let obj;
  try { obj = JSON.parse(fromB64(b64)); } catch (e) { return { ok: false, error: "That save string is damaged or cut off. Copy the whole string again and re-paste." }; }
  if (!obj || typeof obj !== "object" || !obj.meta || typeof obj.meta !== "object") return { ok: false, error: "That save string has no progress in it." };
  const d = defaultMeta(), m = obj.meta;
  const meta = { ...d, ...m, codex: { ...d.codex, ...(m.codex || {}) }, settings: { ...d.settings, ...(m.settings || {}) }, stats: { ...d.stats, ...(m.stats || {}) }, heroic: m.heroic || {}, unlocked: m.unlocked || [], talents: m.talents || {}, progress: m.progress || {} };
  if (!saveMeta(meta)) return { ok: false, error: "This browser would not let the game store the save (storage is blocked or full)." };
  const run = obj.run && obj.run.v === 1 && obj.run.screen && obj.run.screen !== "end" ? obj.run : null;
  if (run) { if (!saveRun(run)) return { ok: false, error: "Progress imported, but the run in it could not be stored (storage full)." }; } else clearRun();
  return { ok: true, run: run ? { classId: run.classId, act: run.act, seed: run.seed } : null };
}
