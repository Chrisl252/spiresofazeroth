// Tiny sound player (GEAR_SPEC section 2): HTMLAudio, unlocked on the first user gesture, default ON, mute remembered in localStorage.
// Files live in assets/sfx/ as .ogg + .mp3 (copied from the classic client: LootCoinLarge, LootCoinSmall, ChestOpen); the page never calls /sounds/.
//   sfx.play("coin" | "coinSmall" | "chest")   sfx.playUrl(url, {volume, cut})   sfx.preload(urls)   sfx.muted   sfx.setMuted(bool)
import { BUILD } from "./version.js?v=20261028e";
import * as eng from "./audio/engine.js?v=20261028e";

const BASE = new URL("../assets/sfx/", import.meta.url).href;
const FILES = { coin: "loot-coin", coinSmall: "loot-coin-small", chest: "chest-open" };
const KEY = "spires.sfx.muted";
const store = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } } };

// ?mute=1 forces silence for test scenarios (never persisted); with the sfx debug flag the would-be plays are still logged.
const FORCE_MUTE = typeof location !== "undefined" && /[?&]mute=1/.test(location.search || "");
let muted = store.get() === "1" || FORCE_MUTE, unlocked = false, ext = null;
let gain = (() => { try { const n = parseInt(localStorage.getItem("spires.sfx.volume"), 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100; } catch (e) { return 100; } })();
const cache = new Map();

function format() {
  if (ext) return ext;
  try { ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? "ogg" : "mp3"; } catch (e) { ext = "mp3"; }
  return ext;
}
function el(name) {
  if (!cache.has(name)) {
    try { const a = new Audio(`${BASE}${FILES[name]}.${format()}`); a.preload = "auto"; cache.set(name, a); } catch (e) { cache.set(name, null); }
  }
  return cache.get(name);
}
function unlock() {
  if (unlocked) return;
  unlocked = true;
  eng.resume();
  for (const n of Object.keys(FILES)) el(n); // warm the cache inside the gesture so later plays are allowed
  document.removeEventListener("pointerdown", unlock, true);
  document.removeEventListener("keydown", unlock, true);
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

// ---- bundled copies: /media/sounds/<fdid>.<ext> is the site's library, which Cloudflare has challenged (no audio element can answer a
// challenge, so every card / draw / enemy sound was silent on the live page while the local assets/sfx coin kept playing). tools/spires/
// bundle-sounds.py copies the game's own sound files into assets/sounds/ and writes index.json {"fdids":[...]}; any url whose fdid is in
// that manifest is served from the game folder instead. No manifest (or not loaded yet) = the site path, exactly as before.
const SND_BASE = new URL("../assets/sounds/", import.meta.url).href;
const bundled = new Set();
let bundledReady = false;
export const soundsReady = (typeof fetch === "function")
  ? (import.meta.url.startsWith("file:") && typeof process !== "undefined"
      ? import("node:fs").then((fs) => {
          try {
            const p = new URL("../assets/sounds/index.json", import.meta.url);
            const j = JSON.parse(fs.readFileSync(p, "utf-8"));
            for (const id of (j && j.fdids) || []) bundled.add(String(id));
            bundledReady = true;
          } catch (e) { bundledReady = true; }
        }).catch(() => { bundledReady = true; })
      : fetch(`${SND_BASE}index.json?v=${BUILD}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => { for (const id of (j && j.fdids) || []) bundled.add(String(id)); bundledReady = true; })
          .catch(() => { bundledReady = true; })
    )
  : Promise.resolve();
export function resolveSoundUrl(url) {
  const m = /^\/media\/sounds\/(\d+)\.(mp3|ogg|m4r)$/.exec(String(url || ""));
  return m && bundled.has(m[1]) ? `${SND_BASE}${m[1]}.${m[2]}` : url;
}
export const soundsBundled = () => bundledReady && bundled.size > 0;

// ---- library sounds (v2): play(url, {volume, cut}) with a small LRU of decoded-ready elements. URLs are the site's own /media/sounds/<fdid>.mp3.
const LRU_MAX = 64, lru = new Map();
const DEBUG = () => { try { return localStorage.getItem("spires.sfx.debug") === "1"; } catch (e) { return false; } };
function libEl(url) {
  url = resolveSoundUrl(url);
  let a = lru.get(url);
  if (a) { lru.delete(url); lru.set(url, a); return a; }
  try { a = new Audio(url); a.preload = "auto"; } catch (e) { return null; }
  lru.set(url, a);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
  return a;
}

const COOLDOWN_MS = 45, PER_URL = 3, MAX_SFX = 14, lastPlay = new Map();
function htmlPlay(url, level, cut) {
  const a = libEl(url); if (!a) return false;
  try {
    const t = cut || a.paused || a.ended ? a : a.cloneNode();
    t.currentTime = 0; t.volume = level;
    const p = t.play(); if (p && p.catch) p.catch(() => {});
    return true;
  } catch (e) { return false; }
}

// Muting also cuts anything already playing (long VO lines, clones) so nothing audible outlives the switch.
function silence() {
  for (const v of eng.allVoices()) if (v.kind === "sfx") v.stop(0.04);
  for (const a of lru.values()) { try { a.pause(); } catch (e) { /* ignore */ } }
  for (const a of cache.values()) { try { if (a) a.pause(); } catch (e) { /* ignore */ } }
}

export const sfx = {
  get muted() { return muted; },
  get volume() { return gain; },
  setVolume(v) {
    const was = gain;
    gain = Math.max(0, Math.min(100, Math.round(+v) || 0));
    try { localStorage.setItem("spires.sfx.volume", String(gain)); } catch (e) { /* private mode */ }
    if (gain === 0) { muted = true; store.set("1"); silence(); }
    // only a slider raised OUT of zero un-mutes; re-applying a saved volume at boot must never override an explicit mute
    else if (muted && was === 0 && !FORCE_MUTE) { muted = false; store.set("0"); }
  },
  setMuted(v) { muted = !!v || FORCE_MUTE; store.set(muted ? "1" : "0"); if (muted) silence(); },
  // preload(urls): fetch ahead, never blocks (idle-time, in small batches); silent if muted/unavailable.
  preload(urls) {
    const list = [...new Set(urls)].filter(Boolean);
    const wa = eng.supported();
    const step = () => { for (const u of list.splice(0, 4)) { if (wa) eng.loadBuffer(resolveSoundUrl(u)); else libEl(u); } if (list.length) setTimeout(step, 120); };
    setTimeout(step, 400);
  },
  // playUrl(url, {volume, cut}): Web Audio voices from pre-decoded buffers (no decode latency), 6 ms fade-in / tail fade-out (no clicks),
  // per-url cooldown + 3 voices per url + 14 total (duplicate triggers can't machine-gun), all through the master limiter.
  // cut=true fades out a still-playing copy of the same url first. Falls back to HTMLAudio if Web Audio / the buffer isn't ready yet.
  playUrl(url, { volume = 0.6, cut = false, label = "" } = {}) {
    if (!url || (muted && !FORCE_MUTE)) return false;
    if (FORCE_MUTE) { if (DEBUG()) console.log("[sfx]", label, url); return true; }
    const ru = resolveSoundUrl(url), now = performance.now();
    if (!cut && now - (lastPlay.get(ru) || 0) < COOLDOWN_MS) { eng.trace("sfx-drop", { url: ru, why: "cooldown", label }); return false; }
    lastPlay.set(ru, now);
    if (lastPlay.size > 200) lastPlay.delete(lastPlay.keys().next().value);
    const level = Math.min(1, volume * gain / 100);
    if (eng.supported() && !eng.running()) { eng.resume(); eng.loadBuffer(ru); htmlPlay(ru, level, cut); return true; } // dead context: play via element, never into silence
    if (eng.supported()) {
      const same = eng.allVoices().filter((v) => v.kind === "sfx" && v.url === ru && !v.stopping);
      if (cut) same.forEach((v) => v.stop(0.04));
      else if (same.length >= PER_URL) same[0].stop(0.05);
      const all = eng.allVoices().filter((v) => v.kind === "sfx" && !v.stopping);
      if (all.length >= MAX_SFX) all[0].stop(0.05);
      if (eng.hasBuffer(ru)) {
        eng.loadBuffer(ru).then((buf) => { if (buf) { if (!(muted && !FORCE_MUTE)) eng.voice(buf, { gain: level, fadeIn: 0.006, fadeOut: 0.04, kind: "sfx", url: ru }); } else htmlPlay(ru, level, cut); });
        if (DEBUG()) console.log("[sfx]", label, url);
        return true;
      }
      eng.loadBuffer(ru);                                  // decode for next time; this first hit uses the element path
    }
    htmlPlay(ru, level, cut);
    if (DEBUG()) console.log("[sfx]", label, url);
    return true;
  },
  play(name, { volume = 0.7 } = {}) {
    if (muted || !FILES[name]) return false;
    const a = el(name);
    if (!a) return false;
    try { a.currentTime = 0; a.volume = Math.min(1, volume * gain / 100); const p = a.play(); if (p && p.catch) p.catch(() => {}); return true; } catch (e) { return false; }
  },
};
