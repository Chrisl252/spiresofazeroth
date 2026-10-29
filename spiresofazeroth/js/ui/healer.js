// Act-transition healer scene (stage-native): after an act is cleared a WoW healer (data/healers.json) greets the hero, heals half of the missing HP
// (the heal itself already happened in engine/healer.js enterHealer; this only shows it) and one Continue goes on to the next map/hub/zone pick.
// Reload-safe: run.screen "healer" is saved, the scene just re-renders and the heal flag (run.healerAct) blocks a second heal.
// Overhauled to Uther the Lightbringer Guardian Room (Slay the Spire 2 Guardian / Neow sanctuary aesthetic).
import { h, icon } from "./dom.js?v=20261029a";
import { cssReady, btn, banner, scroll } from "./kit.js?v=20261029a";
import { runBar } from "./runbar.js?v=20261029a";
import { playOutcome } from "./eventScene.js?v=20261029a";
import { getKit, clearStage, watchLeave } from "./combatKit.js?v=20261029a";
import { healerFor } from "../engine/healer.js?v=20261029a";
import { proceedAfterSpire } from "../engine/run.js?v=20261029a";

export const stageNative = true;

function loadCss() {
  const href = new URL("../../css/healer.css", import.meta.url).href;
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((res) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = l.onerror = () => res(); document.head.append(l); });
}

export async function render(app) {
  await Promise.all([cssReady, loadCss()]);
  const { run, data, stage } = app;
  const pd = run.pending || {};
  const hl = healerFor(data, run.act);

  // Warm golden sanctuary lighting for the stage backdrop
  stage.setBackdrop(run.zoneId || "default", {
    tint: { primary: "#c9a24b", secondary: "#14100a", accent: "#ffe49e" }
  });

  const reduced = app.reduced();
  const full = run.maxHp,
    before = Math.min(full, pd.hpBefore == null ? full : pd.hpBefore),
    healed = pd.healed == null ? full - before : pd.healed;

  const line = (hl.lines || [])[(run.act + (run.seed ? String(run.seed).length : 0)) % Math.max(1, (hl.lines || []).length)] || "";

  // Centered Holy Light crest and paladin halo
  const halo = h("div", { class: "hl-halo" },
    h("span", { class: "hl-frame" },
      icon(hl.icon || "spell_holy_holybolt", "hl-ico", hl.name || "Holy Light")
    )
  );

  const bannerEl = banner(hl.name, hl.title, { cls: "hl-banner" });
  const quoteEl = h("blockquote", { class: "hl-line" }, `"${line}"`);
  const resultEl = h("p", { class: "hl-result", "aria-live": "polite" },
    healed > 0
      ? `${hl.heal || "Uther lays a hand upon you. The Light knits your deepest wounds."} (+${healed} HP)`
      : (hl.heal || "You are already whole.")
  );

  let busy = false;
  const go = async () => {
    if (busy || !host.isConnected) return;
    busy = true;
    const b = continueBtn.querySelector("button");
    if (b) b.textContent = "Loading...";
    try {
      if (run.screen === "healer") await proceedAfterSpire(run, data); // healerAct === act now, so this routes on (hub / zone pick / end); a retry only re-routes (no second hub heal)
      app.save();
      await app.route();
      document.removeEventListener("keydown", onKey, true);
    } catch (e) {
      // a dropped connection mid-load used to leave Continue dead for good: let the player try again
      console.warn("[spires] healer continue failed:", e && e.message);
      busy = false;
      if (b) b.textContent = "Couldn't load. Click to try again";
    }
  };

  const onKey = (e) => {
    if (!host.isConnected) return document.removeEventListener("keydown", onKey, true);
    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      go();
    }
  };
  document.addEventListener("keydown", onKey, true);

  const continueBtn = h("div", { class: "hl-go" },
    btn("Continue", go, { size: "lg", auto: true, cls: "hl-continue-btn" })
  );

  const card = scroll("hl-card",
    halo,
    bannerEl,
    quoteEl,
    resultEl,
    continueBtn
  );

  const sanctuary = h("div", { class: "hl-sanctuary" },
    h("div", { class: "hl-rays", "aria-hidden": "true" }),
    h("div", { class: "hl-ambient-glow", "aria-hidden": "true" }),
    card
  );

  const bar = runBar(app);
  const host = h("section", { class: `sx-screen sx-healer ${reduced ? "sx-healer--still" : ""}` },
    bar,
    sanctuary
  );

  // Mount Uther's 3D model on stage as the towering guardian
  let utherActor = null;
  try {
    const kit = await getKit(app);
    if (kit && kit.actors && host.isConnected) {
      clearStage(kit);
      if (kit.actors.setGroundVisible) kit.actors.setGroundVisible(true);

      const isPortrait = stage.portrait;
      const lane = isPortrait
        ? { x: 540, y: 500, s: 1.3 }
        : { x: 960, y: 510, s: 1.45 };

      utherActor = kit.actors.addAlly({
        uid: "uther-guardian",
        id: "uther-guardian",
        name: hl.name || "Uther the Lightbringer",
        icon: hl.icon || "spell_holy_holybolt",
        glb: hl.model || "hero-paladin.glb",
        lane,
        facing: 1,
        kind: "hero"
      });

      if (utherActor && utherActor.motion) {
        utherActor.motion.s.glowColor = "#ffd700";
        utherActor.motion.s.glow = 0.85;
      }

      watchLeave(app, host, () => {
        if (app.kit === kit) clearStage(kit);
      });
    }
  } catch (e) {
    console.warn("[spires] uther guardian 3d mount skipped:", e && e.message);
  }

  // show the climb: the bar starts at the pre-heal value, then the existing heal fx/number play as it fills
  const fill = bar && bar.querySelector(".sx-bar__hp i"),
    txt = bar && bar.querySelector(".sx-bar__hp span");

  if (healed > 0 && fill && txt) {
    fill.style.width = `${Math.round((before / Math.max(1, full)) * 100)}%`;
    txt.textContent = `${before} / ${full}`;
    setTimeout(() => {
      if (!host.isConnected) return;
      fill.style.width = `${Math.round((run.hp / Math.max(1, full)) * 100)}%`;
      txt.textContent = `${run.hp} / ${full}`;
      playOutcome(app, host, [{ k: "heal", n: healed }]);
      if (utherActor) {
        if (utherActor.castGesture) utherActor.castGesture({ color: "#ffe080" });
        else if (utherActor.statusPulse) utherActor.statusPulse("#ffe080");
      }
    }, reduced ? 0 : 650);
  }

  return host;
}
