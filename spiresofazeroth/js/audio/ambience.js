// Zone ambience bed (Web Audio). The library ambience clips are only ~5 s, so the old "replay one clip every 10-50 s" sounded like a
// loop with a hard seam. This plays a randomised POOL (zone day + night clips + same-biome zones' clips), never the same clip twice
// in a row, each pass with a random start offset and +-3 % pitch, equal-power overlapped (continuous) or sprinkled with random gaps
// (occasional). One bed per pool key: re-entering the same zone/pool (screen or fight changes) never restarts it; a different pool
// crossfades (old voices fade out while new ones fade in). Volume / mode / duck changes are smooth gain ramps on a single bus.
import { resolveSoundUrl } from "../audio.js?v=20261029a";
import { bus, getCtx, loadBuffer, voice, ramp, voiceCount, trace } from "./engine.js?v=20261029a";

const X = 1.6;                 // seconds, voice fade in / out and continuous overlap
const MAX_VOICES = 3;          // hard cap on simultaneous ambience voices (incl. fading-out ones)
let out = null, key = null, urls = [], token = 0, timer = 0, last = null, level = 0, mode = "occasional", active = [];

function outBus() {
  if (out) return out;
  const c = getCtx(); if (!c) return null;
  out = c.createGain(); out.gain.value = level; out.connect(bus());
  return out;
}
const rand = (a, b) => a + Math.random() * (b - a);
function pick() {
  const c = urls.filter((u) => u !== last);
  const u = (c.length ? c : urls)[Math.floor(Math.random() * (c.length ? c.length : urls.length))];
  last = u; return u;
}
function fadeAll(sec) { for (const v of active) v.stop(sec); active = []; }

async function step(tok) {
  timer = 0;
  if (tok !== token || !urls.length || mode === "off" || level <= 0) return;
  const u = pick(), buf = await loadBuffer(resolveSoundUrl(u));
  if (tok !== token) return;
  if (!buf) { timer = setTimeout(() => step(tok), 8000); return; }          // clip unavailable: try the pool again later
  active = active.filter((v) => !v.done && !v.stopping);
  if (active.length >= MAX_VOICES) { timer = setTimeout(() => step(tok), 1000); return; }
  const rate = rand(0.97, 1.03), off = rand(0, Math.min(1.2, buf.duration * 0.25));
  const v = voice(buf, { gain: rand(0.8, 1), fadeIn: X, fadeOut: X, offset: off, rate, kind: "amb", url: u, out: outBus() });
  if (!v) return;
  active.push(v);
  const len = v.endsAt - v.startedAt;                                          // seconds of audio actually played
  const gap = mode === "continuous" ? Math.max(0.8, len - X * 0.9) : len + rand(14, 38);
  timer = setTimeout(() => step(tok), gap * 1000);
}

export const ambience = {
  // set(poolKey, urls): same key + running = no-op (no restart); new key = crossfade to the new bed.
  set(k, list) {
    list = [...new Set((list || []).filter(Boolean))];
    if (k === key && (timer || active.length)) return false;
    const changed = k !== key;
    key = k; urls = list; last = null;
    token++; clearTimeout(timer); timer = 0;
    if (changed) { trace("amb-bed", { key: k, pool: list.length, fading: active.length }); fadeAll(X); }
    if (!list.length || mode === "off" || level <= 0) return true;
    timer = setTimeout(() => step(token), rand(300, 1500));
    return true;
  },
  // configure({level 0..1, mode, duck}) : smooth bus ramp, starts/stops the scheduler as needed.
  configure({ vol, m }) {
    mode = m; level = vol;
    const c = getCtx(); if (!c) return;
    const b = outBus();
    if (mode === "off" || level <= 0) { token++; clearTimeout(timer); timer = 0; fadeAll(0.6); ramp(b.gain, b.gain.value, 0, 0.6); return; }
    ramp(b.gain, b.gain.value, level, 0.5);
    if (!timer && !active.length && urls.length) { token++; timer = setTimeout(() => step(token), rand(200, 800)); }
  },
  get key() { return key; },
  get playing() { return voiceCount("amb") > 0; },
  get voices() { return voiceCount("amb"); },
};
