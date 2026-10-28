// Offline play: registers sw.js (scope = the game folder). Skipped inside the desktop/Android apps and off http(s).
export function registerOffline(build) {
  try {
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol) || window.__TAURI__ || window.Capacitor) return;
    navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(build)}`, { scope: "./" }).catch(() => {});
    // No controllerchange reload on purpose: a new build takes over on the next page load, never mid-run.
  } catch (_) { /* offline support is optional */ }
}
