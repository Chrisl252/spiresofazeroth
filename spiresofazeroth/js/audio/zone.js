// Zone audio (v2): per-zone ambience loop + music playlist, crossfaded on zone change.
// Data: data/sounds/zones.json = {zoneId: {name, music:[url], ambience:{day,night?}}, _stingers:{victory,defeat,loot,boss:[url]}} built by tools/spires/build-zone-sounds.py.
// Seam: stage.setBackdrop(zoneId) -> zone.enter(zoneId) (one call site, stage.js); router -> zone.screen(name, app) (one call site, main.js).
// Browsers block audio until a gesture: enter() just records the zone; the first pointerdown/keydown starts everything.
// Honours the Settings "Sound effects" toggle (sfx.muted) and a separate Music volume (0-100, localStorage spires.music.volume).
import { resolveSoundUrl } from "../audio.js";
import { sfx } from "../audio.js";

const FADE = 1.2;            // seconds, crossfade both ways
const DUCK = 0.5;            // -6 dB music while a fight is on (ambience stays)
const AMB_LEVEL = 0.8;       // ambience relative to the Music slider
const VKEY = "spires.music.volume";
const store = { get() { try { return localStorage.getItem(VKEY); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(VKEY, String(v)); } catch (e) { /* private mode */ } } };

// ?mute=1 (owner rule for tests): no Audio element is ever created.
const MUTE = (() => { try { return new URLSearchParams(location.search).get("mute") === "1"; } catch (e) { return false; } })();
let table = null, loading = null, unlocked = false, hidden = false;
let want = null;                                   // last zone id asked for
let vol = (() => { const n = parseInt(store.get(), 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 60; })();
let duck = false, bossOn = false, curKey = null, curAmb = null, lastMode = "";
const music = [];                                  // voices: {el, g, t, kind}
const amb = [];
let timer = 0, lastT = 0, ext = null, forced = null; // forced = a music url picked in the Escape menu (null = zone default)

const canOgg = () => { if (ext === null) { try { ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? "ogg" : "mp3"; } catch (e) { ext = "mp3"; } } return ext === "ogg"; };
const fixUrl = (u) => (canOgg() ? u : u.replace(/\.ogg$/, ".mp3"));

function load() {
  if (!loading) loading = fetch(new URL("../../data/sounds/zones.json", import.meta.url)).then((r) => r.json()).then((j) => (table = j)).catch(() => (table = {}));
  return loading;
}
function level(kind) {
  if (hidden) return 0;
  const mVol = vol / 100;
  if (mVol <= 0) return 0;
  return mVol * (kind === "amb" ? AMB_LEVEL : 1);
}

function voice(list, url, kind, loop) {
  if (MUTE) return null;
  url = url ? fixUrl(url) : null;
  if (!url) return null;
  let el; try { el = new Audio(resolveSoundUrl(url)); } catch (e) { return null; }
  el.loop = !!loop; el.preload = "auto";
  const v = { el, g: 0, t: 1, kind, url, queued: false };
  list.push(v);
  el.volume = 0;
  const p = el.play(); if (p && p.catch) p.catch(() => { v.t = 0; v.dead = true; });
  startTick();
  return v;
}
function startTick() { if (!timer) { lastT = performance.now(); timer = setInterval(tick, 50); } }
function tick() {
  const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  for (const list of [music, amb]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      const step = dt / FADE;
      v.g = v.t > v.g ? Math.min(v.t, v.g + step) : Math.max(v.t, v.g - step);
      const d = v.kind === "music" && v.t > 0 && duck ? DUCK : 1;
      try { v.el.volume = Math.max(0, Math.min(1, v.g * d * level(v.kind))); } catch (e) { /* ignore */ }
      if (hidden && !v.el.paused) v.el.pause(); else if (!hidden && v.el.paused && v.t > 0 && !v.dead && unlocked && !v.el.ended) { const p = v.el.play(); if (p && p.catch) p.catch(() => {}); }
      if (v.kind === "music" && v.t > 0 && !v.queued && v.el.duration && v.el.duration - v.el.currentTime < FADE + 0.15) { v.queued = true; nextTrack(); }
      if (v.kind === "music" && v.t > 0 && !v.queued && v.el.ended) { v.queued = true; nextTrack(); }
      if (v.g <= 0 && v.t <= 0) { try { v.el.pause(); v.el.removeAttribute("src"); v.el.load(); } catch (e) { /* ignore */ } list.splice(i, 1); }
    }
  }
  if (!music.length && !amb.length) { clearInterval(timer); timer = 0; }
}

let playlist = [], pi = 0;
function nextTrack() {
  if (!playlist.length) return;
  for (const v of music) v.t = 0;
  pi = (pi + 1) % playlist.length;
  voice(music, playlist[pi], "music", false);
}
function setMusic(key, urls, randomFirst) {
  if (key === curKey) return;
  curKey = key;
  for (const v of music) v.t = 0;
  playlist = urls.slice();
  if (!playlist.length) return;
  pi = (randomFirst && playlist.length > 1) ? Math.floor(Math.random() * playlist.length) - 1 : -1;
  nextTrackFirst();
}
function nextTrackFirst() {
  pi = (pi + 1) % playlist.length;
  voice(music, playlist[pi], "music", false);
}
function setAmbience(url) {
  url = url ? fixUrl(url) : null;
  if (url === curAmb) return;
  curAmb = url;
  for (const v of amb) v.t = 0;
  if (url) { voice(amb, url, "amb", true); }
}

function resolveTarget() {
  if (!table) return null;
  if (bossOn && table._stingers && table._stingers.boss && table._stingers.boss.length) {
    const baseZ = (want && table[want]) || table["title"] || {};
    return {
      key: "boss",
      music: table._stingers.boss,
      ambience: baseZ.ambience ? baseZ.ambience.day : null,
      ordered: false,
      zoneId: want
    };
  }

  if (forced) {
    let targetZoneId = null;
    let trackIndex = -1;
    let explicitUrl = null;

    if (forced.startsWith("zone:")) {
      targetZoneId = forced.slice(5);
    } else if (forced.startsWith("track:")) {
      const rest = forced.slice(6);
      const colonIdx = rest.indexOf(":");
      if (colonIdx !== -1) {
        targetZoneId = rest.slice(0, colonIdx);
        const idxOrUrl = rest.slice(colonIdx + 1);
        const n = parseInt(idxOrUrl, 10);
        if (Number.isFinite(n)) trackIndex = n;
        else explicitUrl = idxOrUrl;
      } else {
        explicitUrl = rest;
      }
    } else if (table[forced]) {
      targetZoneId = forced;
    } else {
      explicitUrl = forced;
    }

    if (!targetZoneId && explicitUrl) {
      for (const [id, z] of Object.entries(table)) {
        if (id[0] === "_" || !z.music) continue;
        const idx = z.music.indexOf(explicitUrl);
        if (idx !== -1) {
          targetZoneId = id;
          trackIndex = idx;
          break;
        }
      }
    }

    const z = (targetZoneId && table[targetZoneId]) || (want && table[want]) || table["elwynn-forest"] || {};
    let urls = (z.music && z.music.slice()) || (explicitUrl ? [explicitUrl] : []);
    if (explicitUrl && !urls.includes(explicitUrl)) urls.unshift(explicitUrl);
    if (trackIndex >= 0 && trackIndex < urls.length) {
      urls = urls.slice(trackIndex).concat(urls.slice(0, trackIndex));
    }
    const key = "forced:" + (targetZoneId || "custom") + ":" + (explicitUrl || (trackIndex >= 0 ? trackIndex : "all"));
    return {
      key,
      music: urls,
      ambience: z.ambience ? z.ambience.day : null,
      ordered: true,
      zoneId: targetZoneId || want || null
    };
  }

  if (!want) return null;
  const z = table[want];
  if (!z) return null;
  return {
    key: z.set || (z.music || [])[0] || want,
    music: z.music || [],
    ambience: z.ambience ? z.ambience.day : null,
    ordered: false,
    zoneId: want
  };
}

function apply() {
  if (!unlocked || !table) return;
  const target = resolveTarget();
  if (!target) return;
  setMusic(target.key, target.music, !target.ordered);
  setAmbience(target.ambience);
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  document.removeEventListener("pointerdown", unlock, true);
  document.removeEventListener("keydown", unlock, true);
  load().then(apply);
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; startTick(); });
}

function stinger(url) {
  if (!url || sfx.muted || vol === 0) return;
  if (MUTE) return;
  try { const a = new Audio(resolveSoundUrl(url)); a.volume = Math.min(1, 0.35 + 0.65 * vol / 100); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
}

export const zone = {
  // enter(zoneId): the stage's zone-change seam. Unknown ids (map, default) keep whatever is playing.
  enter(zoneId) {
    if (!zoneId) return;
    if (!table) { load().then(() => zone.enter(zoneId)); return; }
    if (!table[zoneId]) return;
    want = zoneId;
    apply();
  },
  // screen(name, app): router hook. combat ducks the music; a boss fight swaps to the battle set; reward/end play stingers.
  screen(name, app) {
    const isCombat = name === "combat";
    const boss = isCombat && !!(app && app.C && (app.C.enemies || []).some((e) => e.tier === "boss" || e.tier === "raid"));
    const changed = duck !== isCombat || bossOn !== boss;
    duck = isCombat; bossOn = boss;
    const mode = name + (boss ? ":boss" : "");
    if (mode !== lastMode) {
      lastMode = mode;
      const s = table && table._stingers;
      if (s && (name === "reward" || name === "treasure")) stinger(s.loot);
      if (s && name === "end" && app && app.run) stinger(app.run.result === "victory" ? s.victory : s.defeat);
    }
    if (changed) apply();
  },
  get volume() { return vol; },
  setVolume(v) { vol = Math.max(0, Math.min(100, Math.round(+v) || 0)); store.set(vol); startTick(); },
  // Catalog of zones and their authentic audio for menus and selectors
  async catalog() {
    await load();
    const list = [];
    for (const [id, z] of Object.entries(table || {})) {
      if (id[0] === "_" || id === "title" || id === "classSelect") continue;
      if (!z.music || !z.music.length) continue;
      list.push({
        id,
        name: z.name || id,
        hasAmbience: !!(z.ambience && z.ambience.day),
        tracks: z.music.map((url, i) => ({
          index: i,
          value: `track:${id}:${i}`,
          name: `${z.name || id} - Track ${i + 1}`,
          url
        }))
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  },
  // Legacy seam: tracks() -> [{zone, zoneId, name, url, value}]
  async tracks() {
    const cat = await this.catalog();
    const out = [];
    for (const z of cat) {
      for (const t of z.tracks) {
        out.push({ zone: z.name, zoneId: z.id, name: t.name, url: t.url, value: t.value });
      }
    }
    return out;
  },
  get track() { return forced; },
  setTrack(val) {
    forced = val || null;
    curKey = null;
    if (!table) load().then(apply);
    else apply();
    startTick();
  },
  current() { const v = music.find((x) => x.t > 0); return v ? v.el.getAttribute("src") || v.url : null; },
  currentAmbience() { const v = amb.find((x) => x.t > 0); return v ? v.el.getAttribute("src") || v.url : null; },
  currentZone() {
    const t = resolveTarget();
    return t ? t.zoneId : want;
  },
  refresh() { startTick(); },
  get unlocked() { return unlocked; },
};
