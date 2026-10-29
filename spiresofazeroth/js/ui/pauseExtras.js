// Extra rows of the ONE settings menu (pauseMenu.js): display / motion / progress options that used to live on the separate Settings screen,
// plus save export / import / erase. Everything persists in app.meta.settings (same keys as before: speed, reducedMotion, unlockAll, fullscreen).
import { h, toast } from "./dom.js?v=20261029d";
import { btn } from "./kit.js?v=20261029d";
import { autoEquipSelect } from "./autoEquip.js?v=20261029d";
import { exportSave, importSave, clearRun, defaultMeta, saveMeta } from "../engine/save.js?v=20261029d";

export function extraRows(app, save) {
  const s = app.meta.settings;
  const set = (patch) => { Object.assign(s, patch); save(); app.root.classList.toggle("sp-reduce", app.reduced()); };
  const motion = h("select", { class: "pm-select", "aria-label": "Reduced motion", onChange: (e) => set({ reducedMotion: e.target.value === "auto" ? null : e.target.value === "on" }) },
    ...[["auto", "Follow system"], ["on", "Reduce motion"], ["off", "Full motion"]].map(([v, l]) => h("option", { value: v, ...((s.reducedMotion === null || s.reducedMotion === undefined ? "auto" : s.reducedMotion ? "on" : "off") === v ? { selected: "" } : {}) }, l)));
  const fs = h("input", { type: "checkbox", class: "sx-check", "aria-label": "Fullscreen", ...(s.fullscreen ? { checked: "" } : {}),
    onChange: (e) => { set({ fullscreen: e.target.checked }); const on = app.stage.isFullscreen(); if (e.target.checked !== on) app.stage.toggleFullscreen(); } });
  const unlock = h("input", { type: "checkbox", class: "sx-check", "aria-label": "Unlock every card", ...(s.unlockAll ? { checked: "" } : {}),
    onChange: (e) => { set({ unlockAll: e.target.checked }); if (app.refreshLocks) app.refreshLocks(); } });
  const box = h("textarea", { class: "sx-input sx-area", "aria-label": "Save string", placeholder: "Paste a save string here to import" });
  return [
    h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Motion"), motion),
    h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Fullscreen (F)"), fs),
    h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "New gear"), autoEquipSelect(app)),
    h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "Unlock every card"), unlock),
    h("div", { class: "pm-row pm-row--save" }, h("span", { class: "pm-lab" }, "Save"),
      btn("Export", async () => { const str = exportSave(); box.value = str; try { await navigator.clipboard.writeText(str); toast("Save copied to clipboard."); } catch (e) { toast("Copy the text below."); } }, { size: "sm" }),
      btn("Import", () => {
        const r = importSave(box.value);
        toast(r.ok ? (r.run ? `Save imported (${r.run.classId} run, seed ${r.run.seed}). Reloading...` : "Save imported. Reloading...") : r.error);
        if (r.ok) { app.save = () => {}; setTimeout(() => location.reload(), 600); } // the in-memory meta/run must not autosave over what was just imported
      }, { size: "sm" }),
      btn("Erase progress", () => { if (confirm("Erase all progress?")) { clearRun(); saveMeta(defaultMeta()); location.reload(); } }, { size: "sm", cls: "sx-btn-danger" })),
    box,
  ];
}
