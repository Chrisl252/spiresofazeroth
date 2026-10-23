// Title screen (stage-native): zone backdrop, morpheus logo, WoW red-button menu.
import { h } from "./dom.js";
import { talentState } from "../engine/talents.js";

export const stageNative = true;

export function render(app) {
  app.stage.setBackdrop("title");
  const btn = (label, onClick, extra = {}, cls = "") => h("button", { class: `sp-wowbtn ${cls}`, type: "button", onClick, ...extra }, label);
  const menu = h("div", { class: "sp-title-screen__menu" });
  if (app.hasSave) {
    menu.append(btn("Continue run", async () => {
      try {
        if (await app.resume()) {
          await app.route();
        } else {
          await app.go("classSelect");
        }
      } catch (err) {
        console.error("[spires] Continue run error:", err);
        app.abandon();
      }
    }, { "data-autofocus": "" }, "sp-wowbtn--lg"));
  }
  menu.append(btn("Choose class", () => app.go("classSelect"), app.hasSave ? {} : { "data-autofocus": "" }, "sp-wowbtn--lg"));
  const unspent = (app.data.classIds || []).reduce((n, id) => n + talentState(app.meta, id).available, 0);
  menu.append(h("div", { class: "sp-title-screen__row" }, btn(unspent > 0 ? `Talents (${unspent})` : "Talents", () => app.go("talents", { back: "title" }), {}, "sp-wowbtn--sm"), btn("Codex", () => app.go("codex"), {}, "sp-wowbtn--sm"), btn("Settings", () => app.showMenu(), {}, "sp-wowbtn--sm")));
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
