// The #stage root. A 1920x1080 design space scaled with transform: scale() and letterboxed (portrait phones: 1080 wide, full-bleed).
// Layer stack, bottom to top: backdrop, fog, vignette, actors (WebGL host), fx (canvas host), ui (DOM screens).
// "Fluid" mode drops the scaling (design space = viewport px) for legacy screens that are laid out as normal documents.
import { createBackdrop, GROUND_Y } from "./backdrop.js";
import { zone as zoneAudio } from "../audio/zone.js";

export const DESIGN = { w: 1920, h: 1080 };
const PORTRAIT_GROUND_Y = 1010;
const LANDSCAPE_GROUND_Y = 758; // Actors stand at y: 760; ground plane aligns directly to feet at y: 758
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

  function layout() {
    const r = appRoot.getBoundingClientRect(), vw = Math.max(1, r.width), vh = Math.max(1, r.height);
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
  stage.isFullscreen = () => document.fullscreenElement === appRoot;
  stage.toggleFullscreen = () => {
    try {
      if (stage.isFullscreen()) return document.exitFullscreen && document.exitFullscreen();
      if (appRoot.requestFullscreen) return appRoot.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    } catch (_) { /* denied */ }
  };
  document.addEventListener("fullscreenchange", () => { root.classList.toggle("sp-fs", stage.isFullscreen()); layout(); subs.forEach((fn) => fn(stage)); setTimeout(layout, 120); });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) stage.toggleFullscreen();
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stage.pause() : stage.resume()));
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(layout).observe(appRoot);
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  layout();
  return stage;
}
