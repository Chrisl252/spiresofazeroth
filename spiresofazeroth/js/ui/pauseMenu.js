// Escape menu (owner report 2026-10-16): replaces the site's global keybinds + Game Menu inside /spiresofazeroth/.
// installPauseMenu(app) is called once from main.js. It (1) swallows the site's keybinds, (2) builds the menu on Escape / the HUD Settings button,
// (3) applies saved speed / volume / track settings at boot. All values persist in meta.settings (engine/save.js).
import { h } from "./dom.js";
import { cssReady, btn, scroll } from "./kit.js";
import { sfx } from "../audio.js";
import { zone as zoneAudio } from "../audio/zone.js";
import { isGamepadConnected, getActiveGamepadName } from "../controller.js";

const SPEED_MIN = 0.5, SPEED_MAX = 3;
const ENUM_MUL = { slow: 1 / 1.6, normal: 1, fast: 1 / 0.45 };
const isField = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

export function attackMul(s) { return s.speedMul > 0 ? s.speedMul : (ENUM_MUL[s.speed] || 1); }

export function installPauseMenu(app) {
  const s = app.meta.settings;
  let back = null, catalog = null;

  // boot: replay saved audio settings
  if (Number.isFinite(s.musicVolume)) zoneAudio.setVolume(s.musicVolume);
  if (Number.isFinite(s.ambienceVolume)) zoneAudio.setAmbienceVolume(s.ambienceVolume);
  if (s.ambienceMode) zoneAudio.setAmbienceMode(s.ambienceMode);
  if (Number.isFinite(s.sfxVolume)) sfx.setVolume(s.sfxVolume);
  if (s.musicTrack) zoneAudio.setTrack(s.musicTrack);

  // The site's wgf-keybinds.js listens on document (bubble) and bails on defaultPrevented; it binds only Escape and [a-z0-9].
  // A window-capture preventDefault runs first, so the site never navigates or opens its Game Menu here. Game handlers still receive the keys.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (back) close(); else if (!document.querySelector(".sx-modal-back, .dm-modal")) open();
      return;
    }
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
    if (back) return;
    await cssReady;
    if (back) return;
    if (!catalog) catalog = await zoneAudio.catalog();
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
      h("h2", { class: "pm-title" }, "Game Menu"),
      slider("Attack speed", SPEED_MIN, SPEED_MAX, 0.1, Math.round(mul * 10) / 10, (v) => `${(+v).toFixed(1)}x`, (v) => { s.speedMul = v; save(); if (app.kit && app.kit.fx) { app.kit.fx.speed = v; if (app.kit.actors) app.kit.actors.setSpeed(v); } }),
      slider("Music sounds", 0, 100, 5, zoneAudio.volume, pct, (v) => { s.musicVolume = v; zoneAudio.setVolume(v); save(); }),
      slider("Ambient sounds", 0, 100, 5, zoneAudio.ambienceVolume, pct, (v) => { s.ambienceVolume = v; zoneAudio.setAmbienceVolume(v); save(); }),
      slider("Game sounds", 0, 100, 5, sfx.volume, pct, (v) => { s.sfxVolume = v; sfx.setVolume(v); save(); }),
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
      h("div", { class: "pm-btns" },
        btn("Resume", close, { cls: "pm-btn", auto: true }),
        btn("Settings", () => { close(); app.go("settings"); }, { cls: "pm-btn" }),
        btn("Abandon run", () => { if (confirm("Abandon this run? Progress in the run is lost.")) { close(); app.abandon(); } }, { cls: "pm-btn", disabled: !app.run }),
        btn("Return to title", () => { close(); app.go("title"); }, { cls: "pm-btn" })));
    back = h("div", { class: "pm-back", role: "dialog", "aria-modal": "true", "aria-label": "Game Menu", "data-pause-menu": "" }, panel);
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    (app.stage && app.stage.root ? app.stage.root : app.root).append(back);
    const f = back.querySelector("[data-autofocus]"); if (f) f.focus({ preventScroll: true });
  }
  function close() { if (back) { back.remove(); back = null; } }

  app.openMenu = () => (back ? close() : open());
  app.closeMenu = close;
}
