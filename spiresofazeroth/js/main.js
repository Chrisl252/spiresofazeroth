// Boot + router only. Screens live in js/ui/*, rules in js/engine/*. A screen module exports render(app, name) -> Element.
const { BUILD } = await import(`./version.js${new URL(import.meta.url).search}`);
import { funnel } from "./analytics.js?v=20261029d";
import { createData, browserFetcher } from "./engine/data.js?v=20261029d";
import { cardDef } from "./engine/deck.js?v=20261029d";
import { ensureGear } from "./engine/gear.js?v=20261029d";
import { loadMeta, saveMeta, saveRun, loadRun, clearRun } from "./engine/save.js?v=20261029d";
import { lockedCardIds, grantLegacyProgress } from "./engine/talents.js?v=20261029d";
import { clear, h, modal, deckView, toast } from "./ui/dom.js?v=20261029d";
import { mountStage } from "./stage/stage.js?v=20261029d";
import { zone as zoneAudio } from "./audio/zone.js?v=20261029d";
import { installPauseMenu } from "./ui/pauseMenu.js?v=20261029d";
import { installCardInspect } from "./ui/cardInspect.js?v=20261029d";
import { openGearBag } from "./ui/gearBag.js?v=20261029d";
import { characterOf } from "./engine/character.js?v=20261029d";
import { applyAutoEquip } from "./ui/autoEquip.js?v=20261029d";
import { installController } from "./controller.js?v=20261029d";
import { registerOffline } from "./pwa.js?v=20261029d";

const SCREENS = {
  title: "title", classSelect: "classSelect", codex: "codex", settings: "settings", talents: "talents",
  map: "map", combat: "combat", reward: "reward", treasure: "reward", vendor: "shop", rest: "rest", hub: "rest", event: "event", healer: "healer", end: "runEnd",
  zonepick: "choice", raidchoice: "choice", bosschoice: "choice", mechchoice: "choice",
};

const MENU_SCREENS = new Set(["title", "classSelect", "charSelect", "charCreate", "codex", "settings", "talents", "coopLobby"]);
const host = document.getElementById("app");
let appReady = false; // the stage asks about motion before app exists
const reducedNow = () => (appReady ? app.reduced() : matchMedia("(prefers-reduced-motion: reduce)").matches);
registerOffline(BUILD);
const stage = mountStage(host, { build: BUILD, reduced: reducedNow });
const root = stage.layers.ui; // screens render here; the stage owns the layers beneath
// layout-fit: root --ui-scale (stage px -> screen px) for CSS; fullscreen preference is remembered and re-requested on the first class-select click
stage.onResize((st) => document.documentElement.style.setProperty("--ui-scale", st.scale.toFixed(3)));
document.addEventListener("fullscreenchange", () => { if (appReady) { app.meta.settings.fullscreen = stage.isFullscreen(); saveMeta(app.meta); } });
let fsArmed = false;
function armFullscreen() {
  if (fsArmed || stage.isFullscreen() || !app.meta.settings.fullscreen) return;
  fsArmed = true;
  root.addEventListener("click", () => { fsArmed = false; if (!stage.isFullscreen()) stage.toggleFullscreen(); }, { once: true, capture: true });
}
const data = createData({ fetchJson: browserFetcher(BUILD) });
let goSeq = 0;
const app = {
  data, root, stage, run: null, meta: loadMeta(), build: BUILD,
  cardDef: (id, up) => cardDef(data, id, up, app.run ? app.run.classId : data.classId),
  reduced: () => app.meta.settings.reducedMotion === true || (app.meta.settings.reducedMotion === null && matchMedia("(prefers-reduced-motion: reduce)").matches),
  delay: (ms) => (app.reduced() ? 0 : ms * (app.meta.settings.speedMul > 0 ? 1 / app.meta.settings.speedMul : ({ slow: 1.6, normal: 1, fast: 0.45 }[app.meta.settings.speed] || 1))),
  save() { saveMeta(app.meta); if (app.run) { if (app.run.screen === "end") clearRun(); else saveRun(app.run); } },
  showGear: () => openGearBag(app),
  refreshLocks() { data.setLocked(lockedCardIds(app.meta, data.unlocks)); }, // card unlock tiers -> reward / shop pools (engine/talents.js)
  showDeck: () => modal("Your deck", deckView(app)),
  async go(name, props) {
    const seq = ++goSeq; // a newer go() (double click, or a screen that redirects) supersedes this one
    app.screen = name; // read by ui/presence.js
    if (MENU_SCREENS.has(name)) funnel("screen_" + name); // analytics funnel (consent-gated)
    const url = `./ui/${SCREENS[name] || name}.js?v=${BUILD}`;
    let mod, el;
    try { // a failed load/render must never strand the player on the old screen with no feedback: say so; the next tap re-routes (map.js stepFromMap)
      mod = await import(url).catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => import(`${url}&retry=1`))); // one retry: a blip mid-run must not strand the player
      stage.setFluid(!mod.stageNative); // legacy screens are unscaled documents; stage-native screens get the 1920x1080 space
      if (!mod.stageNative) stage.setBackdrop(app.run && app.run.zoneId ? app.run.zoneId : "default");
      document.body.classList.toggle("sp-run", !!app.run);
      if (name === "classSelect" || name === "charSelect" || name === "charCreate") armFullscreen();
      el = await mod.render(app, name, props);
    } catch (err) {
      console.error("[spires] screen '" + name + "' failed to open:", err);
      if (seq === goSeq) { toast("Could not open that screen - tap again."); if (err && typeof err === "object") err.spToasted = true; }
      throw err; // callers keep their own recovery (re-enable a button, retry); they skip a second toast via spToasted
    }
    if (seq !== goSeq) return; // superseded while rendering (combat.js redirects to the map this way); never append its undefined/stale result
    if (!el || !el.nodeType) { // a render returned nothing: never print "undefined" - fall back to the map (or the title with no run)
      console.error("[spires] screen '" + name + "' rendered no element; falling back");
      if (app.run && app.run.screen !== "map") app.run.screen = "map";
      return app.go(app.run && name !== "map" ? "map" : "title");
    }
    app.groundOn = !MENU_SCREENS.has(name); // menus: no 3D ground plane over the art (combatKit re-applies this when it builds the actors late)
    stage.layers.root.classList.toggle("sp-menuscr", MENU_SCREENS.has(name)); // out-of-run menu screens: css/menu.css primitives + phone tap targets key off this
    stage.layers.root.classList.toggle("sp-ground-on", app.groundOn); // DOM floor plane (backdrop.js) follows the same rule
    if (stage.actors && stage.actors.setGroundVisible) stage.actors.setGroundVisible(app.groundOn);
    clear(root).append(el);
    host.classList.toggle("sp-reduce", app.reduced()); root.classList.toggle("sp-reduce", app.reduced());
    stage.refreshMotion();
    zoneAudio.screen(name, app); // combat ducks the music, boss swaps the track, reward/end play stingers
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    if (el.querySelector) { const f = el.querySelector("[data-autofocus]"); if (f) f.focus({ preventScroll: true }); }
  },
  route() { return app.go(app.run ? app.run.screen : "title"); },
  async resume() {
    try {
      const r = loadRun();
      if (!r) return false;
      if (!Array.isArray(r.zonesVisited)) r.zonesVisited = [];
      if (r.zoneId && !r.zonesVisited.includes(r.zoneId)) r.zonesVisited.push(r.zoneId);
      if (r.classId) {
        await data.loadClass(r.classId);
        data.setClass(r.classId);
      }
      for (const id of r.zonesVisited) await data.loadZone(id);
      if (r.zoneId) await data.loadZone(r.zoneId);
      r.character = characterOf(r.character, r.classId); r.character.legacy = undefined; // pre-character saves: default race for the class, male, no name
      ensureGear(r, data); // gear: legacy relic ids -> gear slots
      app.run = r;
      return true;
    } catch (e) {
      console.error("[spires] resume error:", e);
      return false;
    }
  },
  abandon() { clearRun(); app.run = null; return app.go("title"); },
};
applyAutoEquip(app); // "New gear" setting -> engine/gear.js

import(`./ui/bugReport.js?v=${BUILD}`).then((m) => m.mountBugReport(app, stage)).catch(() => {}); // floating bug-report button
import(`./ui/patchNotes.js?v=${BUILD}`).then((m) => m.installPatchNotes(app)).catch((e) => console.warn("[spires] patch notes:", e)); // patch notes + "update available" pill
import(`./coop/session.js?v=${BUILD}`).then((m) => m.installCoop(app)).catch((e) => console.warn("[spires] co-op:", e)); // online co-op (js/coop/*)
import(`./ui/presence.js?v=${BUILD}`).then((m) => m.installPresence(app)).catch(() => {}); // live-player heartbeat for the WoWDex console
appReady = true;

function prewarmGame(app) {
  try {
    const { data } = app;
    const classIds = data.classIds || [];
    if (classIds.length) {
      data.loadClass(classIds[0]); // Immediately warm default starter class (Warrior)
    }
    const onIdle = () => {
      // 1. Warm all remaining classes
      classIds.slice(1).forEach((id) => data.loadClass(id));
      // 2. Pre-warm 3D actors, choreo, models.json, and index.json
      import(`./ui/combatKit.js?v=${BUILD}`).then((m) => m.getKit(app)).catch(() => {});
      // 3. Pre-warm starter zones
      ["elwynn-forest", "dun-morogh", "durotar", "mulgore", "teldrassil", "tirisfal-glades"].forEach((z) => data.loadZone(z));
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(onIdle, { timeout: 1500 });
    } else {
      setTimeout(onIdle, 300);
    }
  } catch (e) {}
}

async function boot() {
  root.append(h("p", { class: "sp-center sp-dim" }, "Loading the spires..."));
  window.addEventListener("unhandledrejection", (e) => console.error("[spires] unhandledrejection:", e && e.reason));
  try {
    await data.load();
    if (!data.classIds.length) throw new Error("data/classes/index.json missing");
    if (grantLegacyProgress(app.meta, data.classIds)) saveMeta(app.meta); // saves from before talents: credit past runs once
    app.refreshLocks();
    app.hasSave = !!loadRun();
    await app.go("title");
    prewarmGame(app);
    if (window.__spiresBootOk) window.__spiresBootOk(); else window.__spiresBooted = true; // index.html boot guard: title is up, stop the watchdog / clear the failure overlay
  } catch (e) {
    clear(root).append(h("div", { class: "sp-frame sp-pad" }, h("h2", { class: "sp-title" }, "Could not load game data"), h("p", {}, String(e && e.message)), h("button", { class: "sp-btn", onClick: () => location.reload() }, "Reload")));
  }
}
installPauseMenu(app); // Escape menu + site keybind lockout (js/ui/pauseMenu.js)
installCardInspect(app); // hover a card -> keyword/stance explanations beside it (js/ui/cardInspect.js)
installController(app); // Gamepad & Controller support (js/controller.js)
window.__spires = app; // debugging + smoke tests
boot();
