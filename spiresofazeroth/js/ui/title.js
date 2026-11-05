// Title screen (stage-native): zone backdrop, morpheus logo, WoW red-button menu.
import { h } from "./dom.js";
import { talentState } from "../engine/talents.js";
import { downloadButton } from "./downloadPanel.js";
import { emberdeckButton } from "./emberdeckButton.js";
import { kofiButton } from "./kofiButton.js";
import { saveRun, loadRun } from "../engine/save.js";

export const stageNative = true;

export function render(app) {
  app.stage.setBackdrop("title");
  const btn = (label, onClick, extra = {}, cls = "") => h("button", { class: `sp-wowbtn ${cls}`, type: "button", onClick, ...extra }, label);
  const menu = h("div", { class: "sp-title-screen__menu" });
  // The run in memory (reached the title via Return to title / back) is the truth: persist it and always offer Continue.
  // app.hasSave is only computed at boot, so it was stale (no Continue button, or Continue loading an older save) after a mid-session exit.
  const live = app.run && app.run.screen && app.run.screen !== "end" && app.run.screen !== "combat" ? app.run : null;
  if (live) saveRun(live);
  app.hasSave = !!live || !!loadRun();
  const coopLive = !!(app.coop && app.coop.active && app.coop.active()); // co-op shares one seed: a continued solo run would put the two players on different maps (10-30 report)
  const saved = live || (app.hasSave ? loadRun() : null);
  const sharedRun = coopLive && saved && saved.seed && saved.seed === app.coop.seedForRun(); // 11-03 reports: after spending talents on the title the co-op run had no way back in
  if (app.hasSave && (!coopLive || sharedRun)) {
    menu.append(btn("Continue run", async () => {
      try {
        if (live || (await app.resume())) {
          await app.route();
        } else {
          await app.go("charSelect");
        }
      } catch (err) {
        console.error("[spires] Continue run error:", err); // never clear the save on an error: the run stays on disk
        // never fall through to class select: one "New run" click there overwrote the save (10-30 report: "clicked the update and now I can't continue my run").
        // Try the map instead; if even that fails, stay on the title with Continue still offered.
        const was = app.run && app.run.screen;
        try {
          if (app.run && was !== "map") { app.run.screen = "map"; await app.go("map"); }
          else throw err;
        } catch (e2) {
          console.error("[spires] Continue run map fallback failed:", e2);
          if (app.run && was) app.run.screen = was; // the save keeps the screen it was on
          await app.go("title");
        }
      }
    }, { "data-autofocus": "" }, "sp-wowbtn--lg"));
  }
  menu.append(btn("Choose class", () => app.go("charSelect"), app.hasSave ? {} : { "data-autofocus": "" }, "sp-wowbtn--lg"));
  menu.append(btn(app.coop && app.coop.active() ? "Co-op (connected)" : "Co-op", () => app.go("coopLobby"), {}, "sp-wowbtn--lg")); // js/ui/coopLobby.js
  const unspent = (app.data.classIds || []).reduce((n, id) => n + talentState(app.meta, id).available, 0);
  const row = h("div", { class: "sp-title-screen__row" }, btn(unspent > 0 ? `Talents (${unspent})` : "Talents", () => app.go("talents", { back: "title" }), {}, "sp-wowbtn--sm"), btn("Codex", () => app.go("codex"), {}, "sp-wowbtn--sm"), btn("Settings", () => app.showMenu(), {}, "sp-wowbtn--sm"));
  const dl = downloadButton(app); if (dl) row.append(dl); // one row, not a lone button on its own line
  row.append(emberdeckButton()); // js/ui/emberdeckButton.js: the burning cross-promo
  row.append(kofiButton()); // js/ui/kofiButton.js: support link
  menu.append(row);
  const m = app.meta.stats;
  if (m.runs) menu.append(h("p", { class: "sp-title-screen__stats" }, `Runs ${m.runs}  |  Wins ${m.wins}  |  Best act ${m.bestAct}`));
  return h("section", { class: "sp-title-screen" },
    h("div", { class: "sp-title-screen__logo" },
      h("p", { class: "sp-title-screen__eyebrow" }, "A Classic WoW Roguelike"),
      h("h1", {}, "Spires of Azeroth"),
      h("div", { class: "sp-title-screen__rule" }),
      h("p", { class: "sp-title-screen__tag" }, "Pick a class, climb a spire in every zone with its real vanilla spells, and face the raid bosses.")),
    menu);
}
