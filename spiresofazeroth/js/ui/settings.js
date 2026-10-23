// Settings (stage-native): combat speed, reduced motion, unlock-all (testing), save export / import, wipe.
import { h, toast } from "./dom.js";
import { exportSave, importSave, clearRun, defaultMeta, saveMeta } from "../engine/save.js";
import { cssReady, btn, banner, scroll } from "./kit.js";
import { sfx } from "../audio.js";
import { zone as zoneAudio } from "../audio/zone.js";
import { isGamepadConnected, getActiveGamepadName } from "../controller.js";

export const stageNative = true;

export async function render(app) {
  await cssReady;
  if (!app.run) app.stage.setBackdrop("classSelect");
  const s = app.meta.settings;
  const set = (patch) => { Object.assign(s, patch); saveMeta(app.meta); app.root.classList.toggle("sp-reduce", app.reduced()); };
  const speed = h("select", { class: "sx-select", "aria-label": "Combat speed", onChange: (e) => set({ speed: e.target.value }) }, ...["slow", "normal", "fast"].map((v) => h("option", { value: v, ...(s.speed === v ? { selected: "" } : {}) }, v)));
  const motion = h("select", { class: "sx-select", "aria-label": "Reduced motion", onChange: (e) => set({ reducedMotion: e.target.value === "auto" ? null : e.target.value === "on" }) },
    ...[["auto", "Follow system"], ["on", "Reduce motion"], ["off", "Full motion"]].map(([v, l]) => h("option", { value: v, ...((s.reducedMotion === null ? "auto" : s.reducedMotion ? "on" : "off") === v ? { selected: "" } : {}) }, l)));
  const unlock = h("input", { type: "checkbox", class: "sx-check", ...(s.unlockAll ? { checked: "" } : {}), onChange: (e) => { set({ unlockAll: e.target.checked }); if (app.refreshLocks) app.refreshLocks(); } });
  const fsck = h("input", { type: "checkbox", class: "sx-check", ...(s.fullscreen ? { checked: "" } : {}), onChange: (e) => { set({ fullscreen: e.target.checked }); const on = app.stage.isFullscreen(); if (e.target.checked !== on) app.stage.toggleFullscreen(); } });

  // Game sounds (SFX) volume slider (0-100)
  const curSfx = Number.isFinite(s.sfxVolume) ? s.sfxVolume : (sfx.muted ? 0 : sfx.volume);
  const sval = h("span", { class: "sx-dim" }, `${curSfx}%`);
  const sfxRange = h("input", {
    type: "range", min: "0", max: "100", step: "5", class: "sx-range",
    "aria-label": "Game sounds volume",
    value: String(curSfx),
    onInput: (e) => {
      const v = +e.target.value;
      sfx.setVolume(v);
      if (v === 0) sfx.setMuted(true);
      else if (sfx.muted) sfx.setMuted(false);
      set({ sfxVolume: v });
      sval.textContent = `${v}%`;
    },
    onChange: (e) => {
      if (+e.target.value > 0) sfx.play("coinSmall");
    }
  });

  // Music sounds volume slider (0-100)
  const curMusic = Number.isFinite(s.musicVolume) ? s.musicVolume : zoneAudio.volume;
  const mval = h("span", { class: "sx-dim" }, `${curMusic}%`);
  const music = h("input", {
    type: "range", min: "0", max: "100", step: "5", class: "sx-range",
    "aria-label": "Music sounds volume",
    value: String(curMusic),
    onInput: (e) => {
      const v = +e.target.value;
      zoneAudio.setVolume(v);
      set({ musicVolume: v });
      mval.textContent = `${v}%`;
    }
  });

  // Ambient sounds volume slider (0-100)
  const curAmb = Number.isFinite(s.ambienceVolume) ? s.ambienceVolume : zoneAudio.ambienceVolume;
  const aval = h("span", { class: "sx-dim" }, `${curAmb}%`);
  const ambSlider = h("input", {
    type: "range", min: "0", max: "100", step: "5", class: "sx-range",
    "aria-label": "Ambient sounds volume",
    value: String(curAmb),
    onInput: (e) => {
      const v = +e.target.value;
      zoneAudio.setAmbienceVolume(v);
      set({ ambienceVolume: v });
      aval.textContent = `${v}%`;
    }
  });

  // Ambient loop mode select
  const curAmbMode = s.ambienceMode || zoneAudio.ambienceMode || "occasional";
  const ambModeSelect = h("select", {
    class: "sx-select",
    "aria-label": "Ambient loop mode",
    onChange: (e) => {
      const m = e.target.value;
      zoneAudio.setAmbienceMode(m);
      set({ ambienceMode: m });
    }
  },
    ...[["occasional", "Occasional (natural intervals)"], ["continuous", "Continuous (classic loop)"], ["off", "Off (silence ambience)"]].map(([val, label]) =>
      h("option", { value: val, ...(curAmbMode === val ? { selected: "" } : {}) }, label)
    )
  );

  const catalog = await zoneAudio.catalog();
  const zsel = h("select", { class: "sx-select", "aria-label": "Zone audio", onChange: (e) => { const u = e.target.value || null; set({ musicTrack: u }); zoneAudio.setTrack(u); } },
    h("option", { value: "" }, "Zone default (Current Zone)"));
  for (const z of catalog) {
    const g = h("optgroup", { label: z.name });
    g.append(h("option", { value: `zone:${z.id}` }, `★ ${z.name} (Ambience + Music)`));
    for (const t of z.tracks) g.append(h("option", { value: t.value }, t.name));
    zsel.append(g);
  }
  let curVal = s.musicTrack || "";
  if (curVal && !curVal.startsWith("zone:") && !curVal.startsWith("track:")) {
    for (const z of catalog) { const f = z.tracks.find((t) => t.url === curVal); if (f) { curVal = f.value; break; } }
  }
  zsel.value = curVal;
  if (zsel.value !== curVal) zsel.value = "";

  const box = h("textarea", { class: "sx-input sx-area", "aria-label": "Save string", placeholder: "Paste a save string here to import" });
  return h("section", { class: "sx-screen sx-page sx-set" },
    h("div", { class: "sx-page__top" }, banner("Settings", "Saved in this browser."), btn("Back", () => (app.run ? app.route() : app.go("title")), { size: "sm", cls: "sx-page__back" })),
    scroll("sx-page__sheet sx-set__sheet",
      h("label", { class: "sx-row" }, h("span", {}, "Combat speed"), speed),
      h("label", { class: "sx-row" }, h("span", {}, "Motion"), motion),
      h("label", { class: "sx-row" }, h("span", {}, "Game sounds"), h("span", { class: "sx-set__vol" }, sfxRange, sval)),
      h("label", { class: "sx-row" }, h("span", {}, "Music sounds"), h("span", { class: "sx-set__vol" }, music, mval)),
      h("label", { class: "sx-row" }, h("span", {}, "Ambient sounds"), h("span", { class: "sx-set__vol" }, ambSlider, aval)),
      h("label", { class: "sx-row" }, h("span", {}, "Ambience loop"), ambModeSelect),
      h("label", { class: "sx-row" }, h("span", {}, "Zone audio"), zsel),
      h("label", { class: "sx-row sx-row--check" }, fsck, h("span", {}, "Fullscreen (F key)")),
      h("label", { class: "sx-row sx-row--check" }, unlock, h("span", {}, "Unlock every card (skip the level ladder)")),
      h("h3", { class: "sx-ribbon" }, "Controller"),
      h("div", { class: "sx-row" }, h("span", {}, "Gamepad Status"), h("span", { class: "sx-dim" }, isGamepadConnected() ? getActiveGamepadName().slice(0, 32) : "No controller detected (press any button)")),
      h("label", { class: "sx-row sx-row--check" },
        h("input", {
          type: "checkbox",
          class: "sx-check",
          checked: s.vibration !== false ? "checked" : "",
          onChange: (e) => set({ vibration: e.target.checked })
        }),
        h("span", {}, "Vibration (Haptic rumble)")
      ),
      h("h3", { class: "sx-ribbon" }, "Save"),
      h("div", { class: "sx-set__btns" },
        btn("Export", async () => { const str = exportSave(); box.value = str; try { await navigator.clipboard.writeText(str); toast("Save copied to clipboard."); } catch (e) { toast("Copy the text below."); } }, { size: "sm" }),
        btn("Import", () => { const r = importSave(box.value); toast(r.ok ? "Save imported. Reloading..." : r.error); if (r.ok) setTimeout(() => location.reload(), 600); }, { size: "sm" }),
        btn("Erase progress", () => { if (confirm("Erase all progress?")) { clearRun(); saveMeta(defaultMeta()); location.reload(); } }, { size: "sm", cls: "sx-btn-danger" })),
      box));
}
