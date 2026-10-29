import { BUILD } from "../version.js?v=20261029d";

const ENDPOINT = "https://api.thewowdb.com/api/spires/run-end";

function analyticsConsentGranted() {
  try {
    if (window.WGF_CONSENT && typeof window.WGF_CONSENT.get === "function") {
      return window.WGF_CONSENT.get() === "granted";
    }
    return localStorage.getItem("wgfConsent") === "granted";
  } catch (e) {
    return false;
  }
}

function talentBand(meta, classId) {
  const spent = Object.values((meta.talents && meta.talents[classId] && meta.talents[classId].spent) || {})
    .reduce((sum, rank) => sum + (Number.isInteger(rank) && rank > 0 ? rank : 0), 0);
  if (!spent) return 0;
  if (spent <= 10) return 1;
  if (spent <= 25) return 2;
  if (spent <= 50) return 3;
  return 4;
}

export function recordRunAggregate(run, meta) {
  if (!analyticsConsentGranted()) return false;
  const event = {
    build: BUILD,
    class: run.classId,
    heroic: Number.isInteger(run.heroic) ? run.heroic : 0,
    talent_band: talentBand(meta || {}, run.classId),
    act: run.act,
    floor: run.floor + 1,
    victory: run.result === "victory" ? 1 : 0,
  };
  const body = new Blob([JSON.stringify(event)], { type: "text/plain;charset=UTF-8" });
  if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return true;
  fetch(ENDPOINT, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(event),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.warn("Spires aggregate telemetry was not accepted:", response.status);
  }).catch((error) => {
    console.warn("Spires aggregate telemetry could not be sent:", error);
  });
  return true;
}
