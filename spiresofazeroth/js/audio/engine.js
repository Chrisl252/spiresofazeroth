// Web Audio engine shared by sfx (audio.js) and ambience (ambience.js): one AudioContext, a master limiter, a decoded-buffer cache and
// click-free voices (every start/stop is an enveloped ramp, never an abrupt cut). ?mute=1 -> no context is ever created.
// Trace hook for tests: set globalThis.__spiresAudioTrace = (event) => {...}; events: {t, ev, ...}. No hook = zero cost.
const MUTE = (() => { try { return new URLSearchParams(location.search).get("mute") === "1"; } catch (e) { return false; } })();
let ctx = null, master = null, hiddenSuspended = false;
const buffers = new Map();           // url -> Promise<AudioBuffer|null>, insertion order = LRU
const BUF_MAX = 80;
const voices = new Set();

export function trace(ev, extra) {
  const f = globalThis.__spiresAudioTrace;
  if (typeof f === "function") { try { f({ t: Math.round(performance.now()), ev, voices: voices.size, ...extra }); } catch (e) { /* ignore */ } }
}
export const supported = () => !MUTE && typeof (globalThis.AudioContext || globalThis.webkitAudioContext) === "function";

export function getCtx() {
  if (ctx || !supported()) return ctx;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor();     // limiter: stacked hits / loud library samples can no longer spike or clip
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
  } catch (e) { ctx = null; }
  return ctx;
}
export const bus = () => { getCtx(); return master; };
// Browsers start the context suspended until a gesture; call from the first pointerdown/keydown.
export function resume() { const c = getCtx(); if (c && c.state !== "running" && c.state !== "closed" && !hiddenSuspended) { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } }
// true only when Web Audio output is actually audible; a suspended / interrupted context swallows every voice silently
export const running = () => !!ctx && ctx.state === "running";
if (typeof document !== "undefined") {
  // a context the browser suspended later (device change, OS audio interruption, long background) is woken by the next gesture,
  // not only the first one: "game sounds aren't working anymore" (2026-10-28) was a context left suspended mid-run
  const wake = () => { if (ctx && ctx.state !== "running") resume(); };
  document.addEventListener("pointerdown", wake, true);
  document.addEventListener("keydown", wake, true);
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) { hiddenSuspended = true; try { ctx.suspend(); } catch (e) { /* ignore */ } }
    else { hiddenSuspended = false; try { ctx.resume(); } catch (e) { /* ignore */ } }
  });
}

export function loadBuffer(url) {
  const c = getCtx();
  if (!c || !url) return Promise.resolve(null);
  let p = buffers.get(url);
  if (p) { buffers.delete(url); buffers.set(url, p); return p; }
  p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab ? new Promise((res) => { try { const q = c.decodeAudioData(ab, res, () => res(null)); if (q && q.catch) q.catch(() => res(null)); } catch (e) { res(null); } }) : null))
    .catch(() => null)
    .then((b) => { if (!b) buffers.delete(url); return b; });
  buffers.set(url, p);
  while (buffers.size > BUF_MAX) buffers.delete(buffers.keys().next().value);
  return p;
}
export const hasBuffer = (url) => buffers.has(url);

// Equal-power ramp of an AudioParam (sin in, cos out): crossfading two uncorrelated sounds keeps constant loudness, no mid-fade dip.
export function ramp(param, from, to, dur, at) {
  const c = ctx; if (!c) return;
  const t0 = at == null ? c.currentTime : at;
  // A curve that started before t0 survives cancelScheduledValues(t0), and any new event inside it throws (silently caught), so a
  // slider dragged mid-fade lost its final value (ambience stayed audible at 0, 2026-10-28). Hold/cancel everything first.
  try { if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t0); else param.cancelScheduledValues(0); } catch (e) { try { param.cancelScheduledValues(0); } catch (e2) { /* ignore */ } }
  try {
    if (!(dur > 0.002)) { param.setValueAtTime(to, t0); return; }
    const N = 48, curve = new Float32Array(N), up = to >= from;
    for (let i = 0; i < N; i++) { const x = i / (N - 1); curve[i] = up ? from + (to - from) * Math.sin(x * Math.PI / 2) : to + (from - to) * Math.cos(x * Math.PI / 2); }
    param.setValueAtTime(from, t0);
    param.setValueCurveAtTime(curve, t0, dur);
  } catch (e) { try { param.cancelScheduledValues(0); param.value = to; } catch (e2) { /* ignore */ } }
}

// voice(buffer, {gain, fadeIn, fadeOut, offset, rate, kind, url, out}) -> {stop(fade), id, kind, url, startedAt, endsAt, onend}
let seq = 0;
export function voice(buffer, o = {}) {
  const c = getCtx(); if (!c || !buffer) return null;
  const { gain = 1, fadeIn = 0.006, fadeOut = 0.02, offset = 0, rate = 1, kind = "sfx", url = "", out = master } = o;
  const src = c.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
  const g = c.createGain();
  src.connect(g); g.connect(out || master);
  const now = c.currentTime + 0.005;
  const off = Math.max(0, Math.min(offset, buffer.duration - 0.05));
  const len = (buffer.duration - off) / rate;
  ramp(g.gain, 0, gain, fadeIn, now);
  const fo = Math.min(fadeOut, len * 0.5);
  // natural-end tail fade (so a clip never ends on a hard edge)
  const tailAt = now + len - fo;
  try { g.gain.setValueAtTime(gain, Math.max(now + fadeIn + 0.002, tailAt)); g.gain.linearRampToValueAtTime(0, now + len); } catch (e) { /* ignore */ }
  const v = { id: ++seq, kind, url, startedAt: now, endsAt: now + len, done: false, onend: null, g, src };
  v.stop = (fade = 0.03) => {
    if (v.done || v.stopping) return; v.stopping = true;
    const t = c.currentTime;
    try { const cur = g.gain.value; ramp(g.gain, cur, 0, fade, t); src.stop(t + fade + 0.02); } catch (e) { /* ignore */ }
    trace("stop", { kind, url, fade });
  };
  src.onended = () => { v.done = true; voices.delete(v); try { g.disconnect(); } catch (e) { /* ignore */ } trace("end", { kind, url }); if (v.onend) v.onend(v); };
  voices.add(v);
  src.start(now, off);
  trace("start", { kind, url, gain: +gain.toFixed(3), fadeIn, offset: +off.toFixed(2), rate: +rate.toFixed(3) });
  return v;
}
export const voiceCount = (kind) => { let n = 0; for (const v of voices) if (!v.stopping && (!kind || v.kind === kind)) n++; return n; };
export const allVoices = () => [...voices];
