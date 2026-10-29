// Gameplay analytics (anonymous, consent-gated, aggregate-only). One home for every Spires event the admin "Spires play" page counts.
// No ids of any kind leave the browser: events are batched and the server only increments daily counters (spires_events_app.py).
// Off unless the player accepted analytics consent AND the page is served over http(s) (the desktop / Android builds never send).
import { BUILD } from "./version.js?v=20261029a";

const ENDPOINT = "https://api.thewowdb.com/api/spires/events";
const FLUSH_AT = 12, FLUSH_MS = 20000, MAX_QUEUE = 80;
let queue = [], timer = 0, hooked = false;
const seenFunnel = new Set();

function allowed() {
  try {
    if (!/^https?:$/.test(location.protocol)) return false;
    if (window.WGF_CONSENT && typeof window.WGF_CONSENT.get === "function") return window.WGF_CONSENT.get() === "granted";
    return localStorage.getItem("wgfConsent") === "granted";
  } catch (e) { return false; }
}

export function flush() {
  clearTimeout(timer); timer = 0;
  if (!queue.length) return;
  const batch = queue; queue = [];
  try {
    const body = new Blob([JSON.stringify({ b: BUILD, e: batch })], { type: "text/plain;charset=UTF-8" });
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    fetch(ENDPOINT, { method: "POST", mode: "cors", credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: body, keepalive: true }).catch(() => {});
  } catch (e) { /* offline or blocked: drop silently */ }
}

// kind: run_start | card_reward | fight_end | run_end | funnel (fields documented in spires_events_app.py)
export function sp(kind, fields) {
  try {
    if (!allowed()) return;
    if (!hooked) { hooked = true; addEventListener("pagehide", flush); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); }); }
    if (queue.length < MAX_QUEUE) queue.push(Object.assign({ k: kind }, fields));
    if (kind === "run_end" || queue.length >= FLUSH_AT) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch (e) { /* analytics must never break the game */ }
}

// once per page load per step (a screen revisit is not a second funnel entry)
export function funnel(step, once) {
  if (once !== false) { if (seenFunnel.has(step)) return; seenFunnel.add(step); }
  sp("funnel", { step });
}

// ids only: lowercase [a-z0-9_:.+-], max 48 chars (the server rejects anything else)
export const encKey = (enc) => (Array.isArray(enc) ? enc.join("+") : String(enc || "")).toLowerCase().replace(/[^a-z0-9_:.+-]+/g, "_").slice(0, 48);
