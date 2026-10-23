// Combat kit (v2 integration): mounts the shared 3D actors layer + VFX layer on the stage ONCE and reuses them across fights,
// the shop and the run-end screen. Everything is dynamic-import + try/catch so a missing three.js / WebGL never breaks a fight:
// kit.actors / kit.fx are null and the combat screen falls back to the HUD plates + legacy numbers.
//   getKit(app) -> Promise<kit>    kit = { actors|null, fx|null, key, W, H, portrait }
//   watchLeave(app, el, fn)        calls fn once when `el` leaves the DOM (screens have no dispose hook)
//   applySettings(app, kit)        combat speed + reduced motion -> fx.speed / fx.reduced / actors tween scale
//   safe(promise, label, ms)       resolves after ms (default 3000) and logs ONCE if the promise never settles
//   laneFor(stage, n)              portrait / landscape lanes (hero + enemies) in stage px

const warned = new Set();
export function logOnce(key, ...a) { if (warned.has(key)) return; warned.add(key); console.warn("[spires]", key, ...a); }

export function safe(p, label, ms = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; logOnce("timeout:" + label, "animation step timed out, continuing"); resolve(); } }, ms);
    Promise.resolve(p).then(() => { if (!done) { done = true; clearTimeout(t); resolve(); } }, (e) => { if (!done) { done = true; clearTimeout(t); logOnce("error:" + label, e && e.message); resolve(); } });
  });
}

export function speedMul(app) {
  if (app.reduced()) return 1;
  const d = app.delay(1000);
  return d > 0 ? 1000 / d : 1;
}

const ZOOM = 0.8; // StS2 framing: landscape actors at 80% so the scene reads zoomed out with room around the cast
export function lanesFor(stage) {
  const g = stage.groundY;
  if (!stage.portrait) { // StS2 layout: hero left, enemies on the right third, all feet on one band
    return {
      hero: { x: 560, y: g, s: ZOOM },
      enemy(i, n) {
        if (n <= 1) return { x: 1360, y: g, s: ZOOM };
        if (n === 2) return { x: [1260, 1480][i], y: g, s: ZOOM };
        if (n === 3) return { x: [1160, 1370, 1580][i], y: g, s: ZOOM };
        return { x: 1000 + i * (800 / (n - 1)), y: g, s: (n >= 6 ? 0.72 : n === 5 ? 0.8 : 0.88) * ZOOM }; // 4-6 enemies: fill the enemy side, shrink a little
      },
    };
  }
  return {
    hero: { x: 190, y: g, s: 0.8 },
    enemy(i, n) {
      if (n >= 4) { const x0 = n >= 5 ? 330 : 440; return { x: x0 + i * ((1000 - x0) / (n - 1)), y: g, s: n >= 5 ? 0.55 : 0.62 }; } // 4-6 enemies: one even row across the enemy side
      const x = Math.min(900, Math.max(470, 690 + (i - (n - 1) / 2) * 250));
      return { x, y: g, s: n > 2 ? 0.7 : n === 2 ? 0.8 : 0.9 };
    },
  };
}

export async function getKit(app) {
  const stage = app.stage;
  const key = `${stage.portrait ? "p" : "l"}${stage.size.w}x${stage.size.h}`;
  let kit = app.kit;
  if (kit && kit.key === key) return kit;
  if (kit) disposeKit(kit);
  kit = app.kit = { actors: null, fx: null, key, W: stage.size.w, H: stage.size.h, portrait: stage.portrait, off: [] };
  try {
    const [{ createActors }, { createFx }] = await Promise.all([import("../stage/actors3d.js"), import("../fx/choreo.js")]);
    const L = lanesFor(stage);
    const lanes = { hero: L.hero, enemy: L.enemy };
    kit.actors = createActors(stage.layers.actors, { designW: kit.W, designH: kit.H, lanes, groundY: stage.groundY });
    stage.actors = kit.actors;
    if (app.groundOn === false) kit.actors.setGroundVisible(false);
    kit.stage = stage;
    const initialZone = (app.run && app.run.zoneId) || (stage.backdrop && stage.backdrop.zone) || "default";
    kit.actors.setZone(initialZone);
    kit.off.push(stage.onZoneChange((zid, o) => { if (kit.actors) kit.actors.setZone(zid, o); }));
    kit.fx = createFx(stage.layers.fx, { designW: kit.W, designH: kit.H, reducedMotion: app.reduced(), kickEl: stage.root, root: new URL("../../", import.meta.url).href });
    kit.fx.anchorFn = (uid, which) => { const a = kit.actors && kit.actors.anchor(uid); return a ? (which === "feet" ? { feet: a.feet } : a) : null; };
    await Promise.all([kit.actors.ready, kit.fx.ready]);
    const onPause = () => { kit.actors && kit.actors.pause(); };
    const onResume = () => { kit.actors && kit.actors.resume(); };
    stage.root.addEventListener("stage:pause", onPause); stage.root.addEventListener("stage:resume", onResume);
    kit.off.push(() => { stage.root.removeEventListener("stage:pause", onPause); stage.root.removeEventListener("stage:resume", onResume); });
  } catch (e) {
    console.warn("[spires] actors/fx unavailable, plate-only combat:", e && e.message);
    try { if (kit.actors) kit.actors.dispose(); } catch (_) { /* noop */ }
    try { if (kit.fx) kit.fx.destroy(); } catch (_) { /* noop */ }
    if (stage.actors === kit.actors) stage.actors = null;
    kit.actors = null; kit.fx = null;
  }
  applySettings(app, kit);
  return kit;
}

export function disposeKit(kit) {
  for (const f of kit.off || []) { try { f(); } catch (_) { /* noop */ } }
  if (kit.stage && kit.stage.actors === kit.actors) kit.stage.actors = null;
  try { if (kit.actors) kit.actors.dispose(); } catch (_) { /* noop */ }
  try { if (kit.fx) kit.fx.destroy(); } catch (_) { /* noop */ }
}

export function applySettings(app, kit) {
  const m = speedMul(app);
  if (kit.fx) { kit.fx.speed = m; kit.fx.reduced = app.reduced(); }
  if (kit.actors) kit.actors.setSpeed(m);
}

// Wipe whatever the previous screen left on the actors / fx layers.
export function clearStage(kit) {
  if (kit.fx) { kit.fx.clear(); }
  if (kit.actors) {
    for (const u of kit.actors.uids()) kit.actors.remove(u);
    if (kit.actors.setGroundVisible) kit.actors.setGroundVisible(true);
  }
}

// Screens have no dispose hook: poll the DOM cheaply (MutationObserver on the ui layer) until `el` is gone.
export function watchLeave(app, el, fn) {
  let fired = false;
  const fire = () => { if (fired) return; fired = true; mo.disconnect(); try { fn(); } catch (e) { console.warn("[spires] leave handler", e && e.message); } };
  const mo = new MutationObserver(() => { if (!el.isConnected) fire(); });
  mo.observe(app.stage.layers.ui, { childList: true, subtree: true });
  return fire;
}

// Shop merchant / run-end hero: a character body in a tiny scene slot positioned over a DOM host (#shop-vendor / #end-hero).
// Uses the shared actors instance with one temporary hero actor; cleared when the screen leaves.
export async function mountPortrait(app, hostEl, { classId, pose = "idle", scale = 1, pad = 40, leaveEl, gearMask } = {}) {
  try {
    if (!hostEl || !classId) return null;
    const kit = await getKit(app);
    if (!kit.actors || !hostEl.isConnected) return null;
    clearStage(kit);
    const r = hostEl.getBoundingClientRect(), p0 = app.stage.toStage(r.left, r.top), p1 = app.stage.toStage(r.right, r.bottom);
    const lane = kit.actors.lanes.hero;
    const saved = { ...lane };
    lane.x = (p0.x + p1.x) / 2; lane.y = p1.y - pad; lane.s = Math.max(0.5, Math.min(1.2, ((p1.y - p0.y) / 520) * scale));
    kit.actors.setHero(gearMask == null ? { classId } : { classId, gearMask });
    Object.assign(lane, saved);
    hostEl.classList.add("has-model");
    watchLeave(app, leaveEl || hostEl, () => { if (app.kit === kit) clearStage(kit); });
    if (pose === "death") { await new Promise((res) => setTimeout(res, 500)); await safe(kit.actors.death("player", { keep: true }), "portrait-death", 2500); }
    return kit;
  } catch (e) { console.warn("[spires] portrait skipped:", e && e.message); return null; }
}
