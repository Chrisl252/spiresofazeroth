// Tiny sound player (GEAR_SPEC section 2): HTMLAudio, unlocked on the first user gesture, default ON, mute remembered in localStorage.
// Files live in assets/sfx/ as .ogg + .mp3 (copied from the classic client: LootCoinLarge, LootCoinSmall, ChestOpen); the page never calls /sounds/.
//   sfx.play("coin" | "coinSmall" | "chest")   sfx.playUrl(url, {volume, cut})   sfx.preload(urls)   sfx.muted   sfx.setMuted(bool)
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
if (typeof fetch === "function") {
  fetch(`${SND_BASE}index.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { for (const id of (j && j.fdids) || []) bundled.add(String(id)); bundledReady = true; }).catch(() => { bundledReady = true; });
}
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

export const sfx = {
  get muted() { return muted; },
  get volume() { return gain; },
  setVolume(v) {
    gain = Math.max(0, Math.min(100, Math.round(+v) || 0));
    try { localStorage.setItem("spires.sfx.volume", String(gain)); } catch (e) { /* private mode */ }
    if (gain === 0) { muted = true; store.set("1"); }
    else if (muted && !FORCE_MUTE) { muted = false; store.set("0"); }
  },
  setMuted(v) { muted = !!v || FORCE_MUTE; store.set(muted ? "1" : "0"); },
  // preload(urls): fetch ahead, never blocks (idle-time, in small batches); silent if muted/unavailable.
  preload(urls) {
    const list = [...new Set(urls)].filter(Boolean);
    const step = () => { for (const u of list.splice(0, 4)) libEl(u); if (list.length) setTimeout(step, 120); };
    setTimeout(step, 400);
  },
  // playUrl(url, {volume, cut}): cut=true restarts a still-playing copy; otherwise overlapping plays use a clone.
  playUrl(url, { volume = 0.6, cut = false, label = "" } = {}) {
    if (!url || (muted && !FORCE_MUTE)) return false;
    if (FORCE_MUTE) { if (DEBUG()) console.log("[sfx]", label, url); return true; }
    const a = libEl(url);
    if (!a) return false;
    try {
      const t = cut || a.paused || a.ended ? a : a.cloneNode();
      t.currentTime = 0; t.volume = Math.min(1, volume * gain / 100);
      const p = t.play(); if (p && p.catch) p.catch(() => {});
      if (DEBUG()) console.log("[sfx]", label, url);
      return true;
    } catch (e) { return false; }
  },
  play(name, { volume = 0.7 } = {}) {
    if (muted || !FILES[name]) return false;
    const a = el(name);
    if (!a) return false;
    try { a.currentTime = 0; a.volume = Math.min(1, volume * gain / 100); const p = a.play(); if (p && p.catch) p.catch(() => {}); return true; } catch (e) { return false; }
  },
};
