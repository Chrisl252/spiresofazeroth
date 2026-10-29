// Live-player heartbeat: while the tab is visible, ping every 30s so the WoWDex console can count players right now.
// Anonymous by design: a random id that lives only in this tab's memory (no cookie, no storage), plus build / screen / class.
// Wired by ONE line in js/main.js. Server side: wowgoldfarms spires_live_app.py (POST /api/spires/ping -> 204).
import { BUILD } from "../version.js?v=20261029a";

const ENDPOINT = "https://api.thewowdb.com/api/spires/ping", EVERY_MS = 30 * 1000;
const sid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

export function installPresence(app) {
  if (!/(^|\.)thewowdb\.com$/.test(location.hostname)) return; // dev servers and headless test runs are not players
  let last = 0;
  const ping = () => {
    if (document.hidden || Date.now() - last < 10000) return;
    last = Date.now();
    const body = JSON.stringify({ sid, build: BUILD, screen: app.screen || "title", cls: (app.run && app.run.classId) || null });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
      fetch(ENDPOINT, { method: "POST", mode: "cors", credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body, keepalive: true }).catch(() => {});
    } catch (e) { /* presence is best-effort */ }
  };
  setTimeout(ping, 3000);
  setInterval(ping, EVERY_MS);
  document.addEventListener("visibilitychange", ping);
}
