// Character creation (stage-native), laid out like the TBC Classic client: Alliance / Horde race portraits, gender, class icons (invalid
// race x class combos dimmed + unselectable, class auto-switches on race change), customization rows, the race model in the centre on its
// starting-zone art, a Name field, and faction / race / class text panels (real client strings, data/charcreate.json). Accept saves the
// character to meta.characters and opens the character list. Text, matrix and names are data; rules live in engine/character.js.
import { h, icon, cap, esc, tip, track, fill } from "./dom.js?v=20261028e";
import { btn, dark } from "./kit.js?v=20261028e";
import { saveMeta } from "../engine/save.js?v=20261028e";
import { RACE_ORDER, GENDERS, RACE_NAME, NO_LOOKS, factionOf, canBe, classAfterRaceChange, cleanName, newCharacterId, slugOf } from "../engine/character.js?v=20261028e";
import { loadCharData, charCss, portraitUrl, crestUrl, randomName } from "./charData.js?v=20261028e";
import { createRaceViewer } from "../stage/raceViewer.js?v=20261028e";

export const stageNative = true;
const LOOKS = ["Skin Color", "Face", "Hair Style", "Hair Color", "Facial Hair"];
const LOOKS_WHY = "Looks are fixed for now: the datamined race bodies are single-look models, so there are no skin, face or hair variants to cycle yet.";

export async function render(app, _name, props = {}) {
  const [D] = await Promise.all([loadCharData(), charCss()]);
  const { data, meta, stage } = app;
  const order = data.classIds || Object.keys(D.classes);
  const st = { race: props.race || "human", gender: props.gender || "male", cls: props.cls || "warrior", name: "" };
  stage.setBackdrop("classSelect");
  const host = h("section", { class: "sx-screen cc", "data-race": st.race });
  let viewer = null;

  // ---- left panel: races, gender, classes, looks
  const raceBtns = {};
  const mkRace = (key) => {
    const b = h("button", { class: "cc-race", type: "button", "data-race": key, "aria-label": RACE_NAME[key], "aria-pressed": "false", onClick: () => pick({ race: key }) }, h("img", { alt: "", draggable: false, width: 56, height: 56 }));
    tip(b, `<b>${esc(RACE_NAME[key])}</b>`);
    raceBtns[key] = b;
    return b;
  };
  const faction = (f) => h("div", { class: `cc-fac cc-fac--${f}` }, h("div", { class: "cc-fac__ban" }, h("img", { src: crestUrl(f), alt: "", width: 40, height: 40 }), h("span", {}, cap(f))), ...RACE_ORDER[f].map(mkRace));
  const genderBtns = {};
  for (const g of GENDERS) genderBtns[g] = h("button", { class: "cc-gender", type: "button", "data-gender": g, "aria-pressed": "false", onClick: () => pick({ gender: g }) }, cap(g));
  const classBtns = {};
  for (const id of order) classBtns[id] = h("button", { class: "cc-class", type: "button", "data-class": id, "aria-pressed": "false", onClick: () => pick({ cls: id }) }, icon(`classicon_${id}`, "", cap(id)));
  const looksRows = LOOKS.map((label) => h("div", { class: "cc-look", title: LOOKS_WHY }, h("button", { class: "cc-look__l", type: "button", disabled: true }, label),
    h("button", { class: "cc-arrow cc-arrow--l", type: "button", disabled: true, "aria-label": `${label} previous` }), h("button", { class: "cc-arrow cc-arrow--r", type: "button", disabled: true, "aria-label": `${label} next` })));
  const left = dark("cc-left", h("div", { class: "cc-logo" }, h("b", {}, "Spires of Azeroth"), h("span", {}, "Create a Character")),
    h("div", { class: "cc-facs" }, faction("alliance"), faction("horde")),
    h("div", { class: "cc-genders", role: "group", "aria-label": "Gender" }, ...GENDERS.map((g) => genderBtns[g])),
    h("div", { class: "cc-classes", role: "group", "aria-label": "Class" }, ...order.map((id) => classBtns[id])),
    h("div", { class: "cc-looks", "aria-label": "Customization (not available)" }, ...looksRows),
    btn("Randomize", () => {}, { size: "sm", cls: "cc-rand", disabled: true, title: LOOKS_WHY }));

  // ---- centre: model + name
  const modelEl = h("div", { class: "cc-model", "aria-label": "Character preview" });
  const nameIn = h("input", { id: "cc-name-in", class: "cc-name__in", type: "text", maxlength: 12, autocomplete: "off", spellcheck: "false", "aria-label": "Character name" });
  const status = h("p", { class: "cc-status", role: "status" }, "");
  nameIn.addEventListener("input", () => { const c = cleanName(nameIn.value); if (nameIn.value.trim() && c !== nameIn.value.trim()) nameIn.value = c; st.name = nameIn.value.trim(); status.textContent = ""; });
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") accept(); });
  const rollName = async () => { const n = await randomName(st.race, st.gender, st.name); if (n) { nameIn.value = n; st.name = n; status.textContent = ""; } };
  const center = h("div", { class: "cc-center" }, modelEl, h("div", { class: "cc-name" }, h("label", { for: "cc-name-in" }, "Name"), nameIn, btn("Randomize", rollName, { size: "sm", cls: "cc-rand cc-rand--name" })), status);

  // ---- right: faction / race / class panels (real client text)
  const mkPanel = (cls) => { const t = h("h3", {}), ic = h("span", { class: "cc-p__ic" }), body = h("div", { class: "cc-p__body" }); return { el: dark(`cc-panel ${cls}`, h("div", { class: "cc-p__head" }, ic, t), body), t, ic, body }; };
  const pF = mkPanel("cc-panel--faction"), pR = mkPanel("cc-panel--race"), pC = mkPanel("cc-panel--class");
  const right = h("div", { class: "cc-right" }, pF.el, pR.el, pC.el);

  function accept() {
    const name = cleanName(nameIn.value);
    if (name.length < 2) { status.textContent = "Please enter a name for your character (2 to 12 letters)."; nameIn.focus(); return; }
    meta.characters = Array.isArray(meta.characters) ? meta.characters : [];
    const ch = { id: newCharacterId(), name, race: st.race, gender: st.gender, classId: st.cls, looks: { ...NO_LOOKS }, created: Date.now(), lastPlayed: 0 };
    meta.characters.push(ch);
    meta.lastClass = st.cls;
    saveMeta(meta);
    track("char_create", { race: st.race, gender: st.gender, class: st.cls });
    app.go("charSelect", { select: ch.id });
  }
  const back = () => app.go((meta.characters || []).length ? "charSelect" : "title");
  const foot = h("div", { class: "cc-foot" }, btn("Accept", accept, { size: "sm", cls: "cc-accept" }), btn("Back", back, { size: "sm", cls: "cc-back" }));

  // ---- state -> DOM
  function pick(patch) {
    const raceChanged = !!patch.race && patch.race !== st.race;
    Object.assign(st, patch);
    st.cls = classAfterRaceChange(st.race, st.cls, order); // the client's rule: keep the class if still valid, else the first valid one
    sync(raceChanged);
    if (raceChanged || patch.gender) { if (!nameIn.dataset.typed) rollName(); }
  }
  function sync(raceChanged) {
    const R = D.byKey[st.race], C = D.classes[st.cls];
    host.dataset.race = st.race; host.dataset.gender = st.gender; host.dataset.cls = st.cls; host.dataset.faction = factionOf(st.race);
    for (const [k, b] of Object.entries(raceBtns)) { const on = k === st.race; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("sel", on); b.querySelector("img").src = portraitUrl(k, st.gender); }
    for (const g of GENDERS) { genderBtns[g].setAttribute("aria-pressed", String(g === st.gender)); genderBtns[g].classList.toggle("sel", g === st.gender); }
    for (const id of order) {
      const ok = canBe(st.race, id), b = classBtns[id], on = id === st.cls && ok;
      b.disabled = !ok; b.setAttribute("aria-disabled", String(!ok)); b.setAttribute("aria-pressed", String(on)); b.classList.toggle("sel", on); b.classList.toggle("off", !ok);
      b.title = ok ? cap(id) : `${RACE_NAME[st.race]}s cannot be ${cap(id)}s`;
    }
    const fac = factionOf(st.race);
    pF.t.textContent = cap(fac); pF.ic.replaceChildren(h("img", { src: crestUrl(fac), alt: "", width: 56, height: 56 })); pF.body.replaceChildren(h("p", {}, D.factions[fac]));
    pR.t.textContent = R.name; pR.ic.replaceChildren(h("img", { src: portraitUrl(st.race, st.gender), alt: "", width: 56, height: 56 }));
    pR.body.replaceChildren(h("p", {}, R.info[st.gender]), ...R.abilities.map((a, i) => h("p", { class: "cc-trait", title: R.racials[i] || "" }, a)));
    pC.t.textContent = cap(st.cls); pC.ic.replaceChildren(icon(`classicon_${st.cls}`, "", cap(st.cls)));
    pC.body.replaceChildren(h("p", {}, C.blurb), ...C.lines.map((l) => h("p", { class: "cc-trait cc-trait--cls" }, l)));
    for (const p of [pF, pR, pC]) p.body.scrollTop = 0;
    if (raceChanged && stage.backdrop) stage.backdrop.setBackdrop(R.zone || "classSelect").catch(() => {}); // starting-zone art; no zone audio, this is a preview
    if (viewer) { const seq = (modelEl.__seq = (modelEl.__seq || 0) + 1); viewer.show(slugOf(st.race, st.gender)).then((ok) => { if (seq === modelEl.__seq) modelEl.classList.toggle("cc-model--none", !ok); }); } // only the latest request may flag the model unavailable (a superseded load resolves false)
  }
  nameIn.addEventListener("input", () => { nameIn.dataset.typed = "1"; });

  fill(host, h("div", { class: "cc-wrap" }, left, center, right, foot));
  viewer = createRaceViewer(modelEl, { reduced: () => app.reduced() });
  if (!viewer.ok) modelEl.classList.add("cc-model--none");
  modelEl.__viewer = viewer; // test / debug handle (closeup)
  sync(true);
  if (stage.backdrop) stage.backdrop.setBackdrop(D.byKey[st.race].zone || "classSelect").catch(() => {});
  rollName(); // the client starts with a random name already typed in
  queueMicrotask(() => { const f = host.querySelector(`.cc-race[data-race="${st.race}"]`); if (f) f.focus({ preventScroll: true }); });
  return host;
}
