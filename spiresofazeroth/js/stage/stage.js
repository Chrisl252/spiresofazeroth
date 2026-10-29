// The #stage root. A 1920x1080 design space scaled with transform: scale() and letterboxed (portrait phones: 1080 wide, full-bleed).
// Layer stack, bottom to top: backdrop, fog, vignette, actors (WebGL host), fx (canvas host), ui (DOM screens).
// "Fluid" mode drops the scaling (design space = viewport px) for legacy screens that are laid out as normal documents.
import { createBackdrop, GROUND_Y } from "./backdrop.js?v=20261029d";
import { zone as zoneAudio } from "../audio/zone.js?v=20261029d";

export const DESIGN = { w: 1920, h: 1080 };
const PORTRAIT_GROUND_Y = 1010;
const LANDSCAPE_GROUND_Y = 730; // StS2 1:1: feet on y 730 of 1080; the ground plane aligns to the feet
void GROUND_Y;
const el = (cls, id, tag = "div") => { const e = document.createElement(tag); if (cls) e.className = cls; if (id) e.id = id; return e; };

export function mountStage(appRoot, opts = {}) {
  const reduced = opts.reduced || (() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const body = document.body;
  body.classList.add("sp-stage-on");
  appRoot.classList.add("sp-stage-host");

  const root = el("sp-stage", "stage");
  const layers = { root, backdrop: el("sp-layer sp-layer-backdrop", "stage-backdrop"), fog: el("sp-layer sp-layer-fog", "stage-fog"),
    vignette: el("sp-layer sp-layer-vignette", "stage-vignette"), actors: el("sp-layer sp-layer-actors", "stage-actors"),
    fx: el("sp-layer sp-layer-fx", "stage-fx"), ui: el("sp-layer sp-layer-ui sp-screens", "stage-ui") };
  layers.fog.append(el("", "", "canvas"));
  root.append(layers.backdrop, layers.fog, layers.vignette, layers.actors, layers.fx, layers.ui);
  appRoot.append(root);

  const zoneSubs = new Set(), parallaxSubs = new Set();
  const subs = new Set(), visSubs = new Set();
  const stage = { root, layers, scale: 1, size: { w: DESIGN.w, h: DESIGN.h }, portrait: false, fluid: false, paused: false, groundY: GROUND_Y, backdrop: null, actors: null };

  const backdrop = createBackdrop(layers, {
    reduced, build: opts.build || "",
    onParallax: (px, py) => {
      parallaxSubs.forEach((fn) => { try { fn(px, py); } catch (e) { console.error(e); } });
      if (stage.actors && stage.actors.setParallax) stage.actors.setParallax(px, py);
    },
  });
  stage.backdrop = backdrop;

  // Phones: the browser's URL bar slides in/out on taps and scrolls, and the fixed stage host follows the dynamic viewport, so every slide
  // re-laid-out the whole stage and wiped its canvases = "the UI flickers any time I do anything" (Android, 2026-10-27/28 reports).
  // On a touch screen a height-only GROWTH at the same width is ignored: the stage keeps the smallest height seen (never clipped, at
  // worst a strip under it). Width changes (rotation), shrinking and fullscreen toggles still re-lay out.
  const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } })();
  let vhFloor = null; // { w, h } while coarse
  function layout() {
    const r = appRoot.getBoundingClientRect(), vw = Math.max(1, r.width);
    let vh = Math.max(1, r.height);
    if (coarse) {
      if (vhFloor && Math.abs(vhFloor.w - vw) < 1 && vh > vhFloor.h && vh - vhFloor.h < 200) vh = vhFloor.h;
      else vhFloor = { w: vw, h: vh };
    }
    let w = DESIGN.w, h = DESIGN.h, s, left = 0, top = 0;
    stage.portrait = vw <= 600 && vh > vw;
    if (stage.fluid) { s = 1; w = vw; h = vh; }
    else if (stage.portrait) { s = vw / 1080; w = 1080; h = Math.max(1080, Math.round(vh / s)); }
    else { s = Math.min(vw / DESIGN.w, vh / DESIGN.h); left = (vw - DESIGN.w * s) / 2; top = (vh - DESIGN.h * s) / 2; }
    stage.scale = s; stage.size = { w, h };
    stage.groundY = stage.fluid ? Math.round(h * 0.7) : stage.portrait ? PORTRAIT_GROUND_Y : LANDSCAPE_GROUND_Y;
    Object.assign(root.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px`, transform: `scale(${s})` });
    root.classList.toggle("sp-portrait", stage.portrait);
    root.classList.toggle("sp-fluid", stage.fluid);
    backdrop.layout(w, h, stage.groundY);
    if (stage.actors && stage.actors.setGround) stage.actors.setGround(stage.groundY);
    subs.forEach((fn) => fn(stage));
  }
  let layoutRaf = 0;
  function scheduleLayout() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; layout(); });
  }

  stage.toStage = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    return { x: (clientX - r.left) / stage.scale, y: (clientY - r.top) / stage.scale };
  };
  stage.onResize = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  stage.onVisibility = (fn) => { visSubs.add(fn); return () => visSubs.delete(fn); };
  stage.onZoneChange = (fn) => { zoneSubs.add(fn); return () => zoneSubs.delete(fn); };
  stage.onParallax = (fn) => { parallaxSubs.add(fn); return () => parallaxSubs.delete(fn); };
  stage.setFluid = (on) => { on = !!on; if (on !== stage.fluid) { stage.fluid = on; layout(); } };
  stage.setBackdrop = (zoneId, o) => {
    zoneAudio.enter(zoneId);
    zoneSubs.forEach((fn) => { try { fn(zoneId, o); } catch (e) { console.error(e); } });
    if (stage.actors && stage.actors.setZone) stage.actors.setZone(zoneId, o);
    return backdrop.setBackdrop(zoneId, o);
  };
  stage.pause = () => { if (stage.paused) return; stage.paused = true; backdrop.pause(); root.classList.add("sp-paused"); visSubs.forEach((fn) => fn(true)); root.dispatchEvent(new CustomEvent("stage:pause")); };
  stage.resume = () => { if (!stage.paused) return; stage.paused = false; backdrop.resume(); root.classList.remove("sp-paused"); visSubs.forEach((fn) => fn(false)); root.dispatchEvent(new CustomEvent("stage:resume")); };
  stage.refreshMotion = () => backdrop.refreshMotion();

  // fullscreen: the stage host goes fullscreen (so the site masthead / cookie bar, which live outside it, are not drawn) and re-scales
  // iPad Safari / older Android only have the webkit-prefixed API; iPhone Safari has no element fullscreen at all, so there the host is
  // pinned over the whole viewport instead (css/stage.css .sp-pseudo-fs). Both paths fire "fullscreenchange" on document for js/main.js.
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let pseudo = false;
  const setPseudo = (on) => {
    pseudo = on;
    document.documentElement.classList.toggle("sp-pseudo-fs", on);
    appRoot.classList.toggle("sp-pseudo-fs-host", on);
    if (on) window.scrollTo(0, 0);
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  stage.isFullscreen = () => pseudo || fsEl() === appRoot;
  stage.toggleFullscreen = () => {
    try {
      if (pseudo) return setPseudo(false);
      if (fsEl() === appRoot) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (appRoot.requestFullscreen) return appRoot.requestFullscreen({ navigationUI: "hide" }).catch(() => setPseudo(true));
      if (appRoot.webkitRequestFullscreen) { appRoot.webkitRequestFullscreen(); return setTimeout(() => { if (fsEl() !== appRoot) setPseudo(true); }, 300); }
      return setPseudo(true);
    } catch (_) { setPseudo(true); }
  };
  const onFs = () => { vhFloor = null; root.classList.toggle("sp-fs", stage.isFullscreen()); scheduleLayout(); setTimeout(scheduleLayout, 120); setTimeout(scheduleLayout, 500); };
  document.addEventListener("fullscreenchange", onFs);
  document.addEventListener("webkitfullscreenchange", () => document.dispatchEvent(new Event("fullscreenchange")));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleLayout); // iOS URL bar / keyboard
  document.addEventListener("keydown", (e) => {
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) stage.toggleFullscreen();
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stage.pause() : stage.resume()));
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(scheduleLayout).observe(appRoot);
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("orientationchange", scheduleLayout);
  layout();
  return stage;
}
