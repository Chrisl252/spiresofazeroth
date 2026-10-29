// Title screen (stage-native): zone backdrop, morpheus logo, WoW red-button menu.
import { h } from "./dom.js?v=20261029d";
import { talentState } from "../engine/talents.js?v=20261029d";
import { downloadButton } from "./downloadPanel.js?v=20261029d";
import { saveRun, loadRun } from "../engine/save.js?v=20261029d";

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
  if (app.hasSave) {
    menu.append(btn("Continue run", async () => {
      try {
        if (live || (await app.resume())) {
          await app.route();
        } else {
          await app.go("charSelect");
        }
      } catch (err) {
        console.error("[spires] Continue run error:", err); // never clear the save on an error: the run stays on disk
        await app.go("charSelect");
      }
    }, { "data-autofocus": "" }, "sp-wowbtn--lg"));
  }
  menu.append(btn("Choose class", () => app.go("charSelect"), app.hasSave ? {} : { "data-autofocus": "" }, "sp-wowbtn--lg"));
  menu.append(btn(app.coop && app.coop.active() ? "Co-op (connected)" : "Co-op", () => app.go("coopLobby"), {}, "sp-wowbtn--lg")); // js/ui/coopLobby.js
  const unspent = (app.data.classIds || []).reduce((n, id) => n + talentState(app.meta, id).available, 0);
  const row = h("div", { class: "sp-title-screen__row" }, btn(unspent > 0 ? `Talents (${unspent})` : "Talents", () => app.go("talents", { back: "title" }), {}, "sp-wowbtn--sm"), btn("Codex", () => app.go("codex"), {}, "sp-wowbtn--sm"), btn("Settings", () => app.showMenu(), {}, "sp-wowbtn--sm"));
  const dl = downloadButton(app); if (dl) row.append(dl); // one row, not a lone button on its own line
  row.append(btn("Other Games", () => window.open("https://emberdeck.app/?ref=spires", "_blank", "noopener"), { title: "Emberdeck, our free deckbuilder" }, "sp-wowbtn--sm"));
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
