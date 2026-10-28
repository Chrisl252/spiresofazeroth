// Escape menu (owner report 2026-10-16): replaces the site's global keybinds + Game Menu inside /spiresofazeroth/.
// installPauseMenu(app) is called once from main.js. It (1) swallows the site's keybinds, (2) builds the menu on Escape / the HUD Settings button,
// (3) applies saved speed / volume / track settings at boot. All values persist in meta.settings (engine/save.js).
import { h } from "./dom.js?v=20261028e";
import { cssReady, btn, scroll } from "./kit.js?v=20261028e";
import { sfx } from "../audio.js?v=20261028e";
import { zone as zoneAudio } from "../audio/zone.js?v=20261028e";
import { extraRows } from "./pauseExtras.js?v=20261028e";
import { isGamepadConnected, getActiveGamepadName } from "../controller.js?v=20261028e";

const SPEED_MIN = 0.5, SPEED_MAX = 3;
const ENUM_MUL = { slow: 1 / 1.6, normal: 1, fast: 1 / 0.45 };
const OVERLAYS = ".sx-modal-back, .dm-modal, .sp-modal-back, .sp-notes-backdrop, .sp-bugp";
const isField = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

export function attackMul(s) { return s.speedMul > 0 ? s.speedMul : (ENUM_MUL[s.speed] || 1); }

export function installPauseMenu(app) {
  const s = app.meta.settings;
  let back = null, catalog = null, opening = false;

  // closing the tab / browser Back / reload must never lose the run: persist it on pagehide (not mid-combat: the stored point stays the last safe one)
  const flushRun = () => { try { if (app.run && app.run.screen && app.run.screen !== "end" && app.run.screen !== "combat") app.save(); } catch (e) { /* ignore */ } };
  addEventListener("pagehide", flushRun);

  // boot: replay saved audio settings
  if (Number.isFinite(s.musicVolume)) zoneAudio.setVolume(s.musicVolume);
  if (Number.isFinite(s.ambienceVolume)) zoneAudio.setAmbienceVolume(s.ambienceVolume);
  if (s.ambienceMode) zoneAudio.setAmbienceMode(s.ambienceMode);
  if (Number.isFinite(s.sfxVolume)) sfx.setVolume(s.sfxVolume);
  if (s.musicTrack) zoneAudio.setTrack(s.musicTrack);

  // ONE keyboard dispatcher (window capture, runs before every document/target handler, incl. the site's wgf-keybinds.js which binds only Escape + [a-z0-9]).
  //  - menu open: it owns the keyboard. Escape closes it; every other key is stopped here so combat / hand / event / stage hotkeys never fire through it
  //    (default actions survive, so Tab / Enter / Space / arrows / typing in the menu's own controls still work).
  //  - menu closed: Escape closes the top-most overlay (their own handlers do), else cancels a pending card/potion aim (hand/combat do), else opens the menu.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (back) { e.stopImmediatePropagation(); close(); return; }
      if (document.querySelector(OVERLAYS)) return; // that overlay closes itself on this same key
      const c = app._combat;
      if (c && ((c.hand && c.hand.selected && c.hand.selected()) || (c.st && c.st.pot !== null && c.st.pot !== undefined))) return; // cancel the aim first
      e.stopImmediatePropagation();
      open();
      return;
    }
    if (back) { e.stopImmediatePropagation(); if (!isField(e.target) && /^[a-zA-Z0-9]$/.test(e.key)) e.preventDefault(); return; }
    if (/^[a-zA-Z0-9]$/.test(e.key) && !isField(e.target)) e.preventDefault();
  }, true);

  const pct = (v) => `${Math.round(v)}%`;
  function slider(label, min, max, step, value, fmt, onInput) {
    const val = h("span", { class: "pm-val" }, fmt(value));
    const inp = h("input", { type: "range", class: "pm-range", min: String(min), max: String(max), step: String(step), value: String(value), "aria-label": label,
      onInput: (e) => { const v = +e.target.value; val.textContent = fmt(v); onInput(v); } });
    return h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, label), inp, val);
  }
  const save = () => { try { app.save(); } catch (e) { /* ignore */ } };

  async function open() {
    if (back) { const f = back.querySelector("[data-autofocus]"); if (f) f.focus({ preventScroll: true }); return; } // idempotent: focus the existing menu
    if (opening) return;
    opening = true;
    try { await cssReady; if (!catalog) catalog = await zoneAudio.catalog(); } finally { opening = false; }
    if (back) return;
    const sel = h("select", {
      class: "pm-select",
      "aria-label": "Zone audio",
      onChange: (e) => {
        const u = e.target.value || null;
        s.musicTrack = u;
        zoneAudio.setTrack(u);
        save();
      }
    },
      h("option", { value: "" }, "Zone default (Current Zone)")
    );

    for (const z of catalog) {
      const g = h("optgroup", { label: z.name });
      g.append(h("option", { value: `zone:${z.id}` }, `★ ${z.name} (Ambience + Music)`));
      for (const t of z.tracks) {
        g.append(h("option", { value: t.value }, t.name));
      }
      sel.append(g);
    }

    let curVal = s.musicTrack || "";
    if (curVal && !curVal.startsWith("zone:") && !curVal.startsWith("track:")) {
      for (const z of catalog) {
        const found = z.tracks.find((t) => t.url === curVal);
        if (found) { curVal = found.value; break; }
      }
    }
    sel.value = curVal;
    if (sel.value !== curVal) sel.value = "";

    const mul = Math.min(SPEED_MAX, Math.max(SPEED_MIN, attackMul(s)));
    const panel = scroll("pm-panel",
      h("h2", { class: "pm-title" }, "Settings"),
      h("div", { class: "pm-body" },
      slider("Attack speed", SPEED_MIN, SPEED_MAX, 0.1, Math.round(mul * 10) / 10, (v) => `${(+v).toFixed(1)}x`, (v) => { s.speedMul = v; s.speed = v < 0.8 ? "slow" : v > 1.6 ? "fast" : "normal"; save(); if (app.kit && app.kit.fx) { app.kit.fx.speed = v; if (app.kit.actors) app.kit.actors.setSpeed(v); } }),
      slider("Music sounds", 0, 100, 5, zoneAudio.volume, pct, (v) => { s.musicVolume = v; zoneAudio.setVolume(v); save(); }),
      slider("Ambient sounds", 0, 100, 5, zoneAudio.ambienceVolume, pct, (v) => { s.ambienceVolume = v; zoneAudio.setAmbienceVolume(v); save(); }),
      slider("Game sounds", 0, 100, 5, sfx.volume, pct, (v) => { s.sfxVolume = v; sfx.setVolume(v); sfx.setMuted(v === 0); save(); }),
      h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Ambience mode"),
        h("select", {
          class: "pm-select",
          "aria-label": "Ambient loop mode",
          onChange: (e) => {
            const m = e.target.value;
            s.ambienceMode = m;
            zoneAudio.setAmbienceMode(m);
            save();
          }
        },
          ...[["occasional", "Occasional (natural intervals)"], ["continuous", "Continuous (classic loop)"], ["off", "Off (silence ambience)"]].map(([val, label]) =>
            h("option", { value: val, ...(zoneAudio.ambienceMode === val ? { selected: "" } : {}) }, label)
          )
        )
      ),
      h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Zone audio"), sel),
      h("div", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Controller"), h("span", { class: "pm-val" }, isGamepadConnected() ? getActiveGamepadName().slice(0, 22) : "None")),
      h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Controller rumble"),
        h("input", {
          type: "checkbox",
          class: "sx-check",
          checked: s.vibration !== false,
          onChange: (e) => { s.vibration = e.target.checked; save(); }
        })),
      ...extraRows(app, save)),
      h("div", { class: "pm-btns" },
        btn("Resume", close, { cls: "pm-btn", auto: true }),
                btn("Abandon run", () => { if (confirm("Abandon this run? Progress in the run is lost.")) { close(); app.abandon(); } }, { cls: "pm-btn", disabled: !app.run }),
        btn("Return to title", () => { if (app.run) app.save(); close(); app.go("title"); }, { cls: "pm-btn" })));
    back = h("div", { class: "pm-back sp-pause-menu", role: "dialog", "aria-modal": "true", "aria-label": "Settings", "data-pause-menu": "" }, panel);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    (app.stage && app.stage.root ? app.stage.root : app.root).append(back);
    const f = back.querySelector("[data-autofocus]"); if (f) f.focus({ preventScroll: true });
  }
  function close() { if (back) { back.remove(); back = null; } }

  app.openMenu = () => (back ? close() : open());
  app.showMenu = open; // idempotent open (HUD / title / run-bar Settings buttons)
  app.closeMenu = close;
}
