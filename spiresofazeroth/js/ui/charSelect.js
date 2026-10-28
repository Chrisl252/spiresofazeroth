// Character select (stage-native), like the client's list: saved characters (name, level, race + class, zone) on the right, the selected
// character's model in the centre, Enter World / Create New Character / Delete Character / Back. A character is a saved race + gender +
// name + class (meta.characters); Enter World starts a run with it. No characters yet -> straight to creation.
import { h, cap, track, fill } from "./dom.js?v=20261028e";
import { btn, tog } from "./kit.js?v=20261028e";
import { saveMeta, isClassUnlocked } from "../engine/save.js?v=20261028e";
import { classLevel } from "../engine/talents.js?v=20261028e";
import { heroicOpen, heroicName, heroicBlurb } from "../engine/heroic.js?v=20261028e";
import { newSeedString } from "../engine/rng.js?v=20261028e";
import { RACE_NAME, HOME, slugOf } from "../engine/character.js?v=20261028e";
import { loadCharData, charCss, portraitUrl } from "./charData.js?v=20261028e";
import { createRaceViewer } from "../stage/raceViewer.js?v=20261028e";
import { beginRun } from "./runStart.js?v=20261028e";

export const stageNative = true;

export async function render(app, _name, props = {}) {
  const { data, meta, stage } = app;
  meta.characters = Array.isArray(meta.characters) ? meta.characters : [];
  if (!meta.characters.length) { app.screen = "charCreate"; return (await import("./charCreate.js?v=20261028e")).render(app, "charCreate", {}); } // first visit: straight to creation
  const [D] = await Promise.all([loadCharData(), charCss()]);
  stage.setBackdrop("classSelect");
  const th = (data.unlocks && data.unlocks.thresholds) || [];
  const list = () => meta.characters.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || b.created - a.created);
  const st = { sel: props.select || (list()[0] || {}).id, continent: null, heroic: 0, armed: false };
  const host = h("section", { class: "sx-screen cc cc--list" });
  const modelEl = h("div", { class: "cc-model cc-model--list", "aria-label": "Selected character" });
  const viewer = createRaceViewer(modelEl, { reduced: () => app.reduced() });
  let shown = "";
  const cur = () => meta.characters.find((c) => c.id === st.sel) || list()[0];

  function draw() {
    const ch = cur(); st.sel = ch.id;
    const R = D.byKey[ch.race] || D.byKey.human, cid = ch.classId;
    const lvl = classLevel(meta, cid, th);
    const maxH = heroicOpen(meta, cid);
    st.heroic = Math.min(st.heroic, maxH);
    if (!st.continent) st.continent = HOME[ch.race] || "ek";
    const rows = list().map((c) => {
      const on = c.id === ch.id, r = D.byKey[c.race];
      const live = app.run && app.run.character && app.run.character.id === c.id ? app.run : null;
      const zone = live && live.zoneId && data.zone(live.zoneId) ? data.zone(live.zoneId).name : (r && r.zone ? cap(r.zone) : "Azeroth");
      return h("button", { class: `cc-row ${on ? "sel" : ""}`.trim(), type: "button", "data-char": c.id, "aria-pressed": String(on), onClick: () => { st.sel = c.id; st.continent = null; st.heroic = 0; st.armed = false; draw(); } },
        h("img", { src: portraitUrl(c.race, c.gender), alt: "", width: 56, height: 56 }),
        h("span", { class: "cc-row__t" }, h("b", {}, c.name), h("em", {}, `Level ${classLevel(meta, c.classId, th)} ${RACE_NAME[c.race]} ${cap(c.classId)}`), h("small", {}, zone)));
    });
    const heroicBtns = h("div", { class: "cc-diff" }, h("h4", {}, "Difficulty"),
      h("div", { class: "cc-opt", role: "group", "aria-label": "Difficulty" }, ...Array.from({ length: maxH + 1 }, (_, i) => tog(i === 0 ? "Normal" : heroicName(i), st.heroic === i, () => { st.heroic = i; draw(); }))),
      h("p", { class: "cc-diff__t" }, heroicBlurb(st.heroic)));
    const contBtns = h("div", { class: "cc-opt", role: "group", "aria-label": "Starting continent" }, ...[["ek", "Eastern Kingdoms"], ["kal", "Kalimdor"]].map(([k, n]) => tog(n, st.continent === k, () => { st.continent = k; draw(); })));
    const panel = h("div", { class: "cc-listpanel sx-wood sx-dark" }, h("h3", {}, "Spires of Azeroth"), h("div", { class: "cc-rows" }, ...rows),
      h("div", { class: "cc-runopts" }, contBtns, heroicBtns),
      h("div", { class: "cc-listbtns" }, btn("Create New Character", () => app.go("charCreate"), { size: "sm" }), btn("Class details", () => app.go("classSelect", { character: ch }), { size: "sm" })));
    const enter = async () => {
      if (!isClassUnlocked(meta, data.classIds, cid)) return;
      await beginRun(app, { cls: cid, continent: st.continent, heroic: st.heroic, seed: newSeedString() }, ch);
    };
    const del = btn(st.armed ? "Really delete?" : "Delete Character", () => {
      if (!st.armed) { st.armed = true; draw(); setTimeout(() => { if (st.armed && host.isConnected) { st.armed = false; draw(); } }, 4000); return; }
      meta.characters = meta.characters.filter((c) => c.id !== ch.id); saveMeta(meta); track("char_delete", { race: ch.race, class: cid });
      app.go(meta.characters.length ? "charSelect" : "charCreate");
    }, { size: "sm", cls: "cc-del" });
    fill(host, h("div", { class: "cc-wrap cc-wrap--list" },
      modelEl,
      h("div", { class: "cc-who" }, h("b", {}, ch.name), h("span", {}, `Level ${lvl} ${RACE_NAME[ch.race]} ${cap(cid)}`)),
      h("div", { class: "cc-enter" }, btn("Enter World", enter, { size: "lg", auto: true, cls: "cc-enterbtn" })),
      panel,
      h("div", { class: "cc-foot cc-foot--list" }, del, btn("Back", () => app.go("title"), { size: "sm", cls: "cc-back" }))));
    const slug = slugOf(ch.race, ch.gender);
    if (shown !== slug) { shown = slug; viewer.show(slug).then((ok) => modelEl.classList.toggle("cc-model--none", !ok)); }
    if (stage.backdrop && R.zone) stage.backdrop.setBackdrop(R.zone).catch(() => {});
  }
  draw();
  return host;
}
