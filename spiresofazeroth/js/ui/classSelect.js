// Class select (stage-native): nine class plates, details + starting deck, continent / heroic / seed / pet, Begin.
import { h, icon, cap, track, fill, tip, esc } from "./dom.js?v=20261029a";
import { isClassUnlocked, unlockText, saveRun, saveMeta } from "../engine/save.js?v=20261029a";
import { newRun, prepareZonePick } from "../engine/run.js?v=20261029a";
import { newSeedString } from "../engine/rng.js?v=20261029a";
import { heroicName, heroicOpen, heroicBlurb } from "../engine/heroic.js?v=20261029a";
import { cssReady, btn, tog, ico, banner, scroll } from "./kit.js?v=20261029a";
import { HOME } from "../engine/character.js?v=20261029a";
import { beginRun } from "./runStart.js?v=20261029a";
import { repairSpent, talentState, talentMods, talentSummary, classLevel, nextLevelXp, lockedCardIds } from "../engine/talents.js?v=20261029a";

export const stageNative = true;

const RES_ICON = { rage: "ability_racial_bloodrage", mana: "spell_frost_manarecharge", energy: "spell_shadow_shadowworddominate", focus: "ability_hunter_focusedaim" };

export async function render(app, _name, props = {}) {
  const ch = props && props.character ? props.character : null; // opened from the character list: class locked to that character
  await cssReady;
  const { data, meta, stage } = app;
  stage.setBackdrop("classSelect");
  const ids = data.classIds;
  const initialCls = (ch && ids.includes(ch.classId) && ch.classId) || ids.find((id) => isClassUnlocked(meta, ids, id)) || ids[0];
  const st = { cls: initialCls, heroic: 0, continent: null, pet: null, seed: newSeedString() };
  await Promise.all([data.loadClass(st.cls), data.loadTalents(st.cls)]);
  Promise.all(ids.map((id) => data.loadTalents(id))).then(() => { if (host.isConnected) draw(); }); // talent sheets for the other plates
  // Concurrently ensure remaining classes are warm
  Promise.all(ids.map((id) => data.loadClass(id))).then(() => { if (host.isConnected) draw(); });
  const host = h("section", { class: "sx-screen sx-cls" });
  let unbindPet = null;

  const draw = () => {
    const cls = data.classObj(st.cls);
    const maxH = heroicOpen(meta, st.cls);
    st.heroic = Math.min(st.heroic, maxH);
    st.continent = st.continent || (ch ? HOME[ch.race] : null) || cls.defaultContinent || "ek";
    const petChoices = cls.resource && cls.resource.pet ? cls.resource.pet.choices : null;
    if (petChoices && !petChoices.includes(st.pet)) st.pet = cls.resource.pet.default || petChoices[0];
    if (!petChoices) st.pet = null;

    const grid = h("div", { class: "sx-cls__grid", role: "group", "aria-label": "Classes" });
    for (const id of ids) {
      const c = data.classObj(id);
      const open = isClassUnlocked(meta, ids, id);
      const sel = id === st.cls;
      const p = h("button", { class: `sx-clsplate ${sel ? "sel" : ""}`.trim(), type: "button", disabled: !!ch && !sel, style: { "--cc": c.color || "#c9a24b" }, "aria-pressed": String(sel), onClick: () => { st.cls = id; st.continent = null; draw(); } },
        ico(c.icon, { size: "lg", alt: c.name }),
        h("div", { class: "sx-clsplate__t" }, h("b", {}, c.name),
          h("span", {}, h("em", {}, `${c.startingHp} HP`), `  ${(c.resource || {}).name || ""}`)),
        h("p", {}, c.lore));
      grid.append(p);
    }

    const deck = h("div", { class: "sx-chips" });
    const counts = {};
    for (const sid of cls.starterDeck) counts[sid] = (counts[sid] || 0) + 1;
    for (const [sid, n] of Object.entries(counts)) {
      const def = app.cardDef(sid, false);
      const chip = h("span", { class: "sx-chip", tabindex: "0", "aria-label": `${def.name} x${n}` }, ico(def.icon, { size: "sm" }), n > 1 ? h("b", {}, `x${n}`) : null, h("small", {}, def.name));
      tip(chip, `<b>${esc(def.name)}</b><br>${esc(def.text || "")}`);
      deck.append(chip);
    }

    const heroicBtns = h("div", { class: "sx-pick", role: "group", "aria-label": "Heroic level" });
    for (let i = 0; i <= maxH; i++) heroicBtns.append(tog(i === 0 ? "Normal" : heroicName(i), st.heroic === i, () => { st.heroic = i; draw(); }));
    const contBtns = h("div", { class: "sx-pick", role: "group", "aria-label": "Starting continent" },
      ...[["ek", "Eastern Kingdoms"], ["kal", "Kalimdor"]].map(([k, n]) => tog(n, st.continent === k, () => { st.continent = k; draw(); })));
    if (unbindPet) { unbindPet(); unbindPet = null; }
    const pick = (p) => { st.pet = p; draw(); };
    const petPick = null; // Osty rule: the hunter pet is automatic (default family), no companion picker

    const seedIn = h("input", { class: "sx-input", type: "text", value: st.seed, "aria-label": "Seed", maxlength: 24 });
    seedIn.addEventListener("input", () => { st.seed = seedIn.value.trim() || st.seed; });
    const res = cls.resource || {};
    // account progression for this class (engine/talents.js): level + XP bar, unspent points, the talents that will be live this run
    const tdef = data.talentDefs.get(st.cls) || null;
    if (tdef && repairSpent(meta, st.cls, tdef)) saveMeta(meta); // Talents V2: clamp saved ranks to the current talent file, refund the difference
    const tstate = talentState(meta, st.cls), mods = talentMods(meta, st.cls, tdef);
    const th = (data.unlocks && data.unlocks.thresholds) || [], lvl = classLevel(meta, st.cls, th), nxt = nextLevelXp(meta, st.cls, th);
    const xp = ((meta.progress || {})[st.cls] || {}).xp | 0, prevT = lvl > 0 ? th[lvl - 1] : 0, pct = nxt ? Math.round(100 * Math.min(1, (xp - prevT) / Math.max(1, nxt - prevT))) : 100;
    const lockedN = data.unlocks && data.unlocks.classes && data.unlocks.classes[st.cls] ? data.unlocks.classes[st.cls].flat().filter((id) => lockedCardIds(meta, data.unlocks).has(id)).length : 0;
    const acct = h("div", { class: "sx-field" }, h("h4", {}, "Account"),
      h("div", { class: "sx-cls__acct" }, h("b", {}, `Level ${lvl}`), h("div", { class: "sx-tal__xp" }, h("i", { style: { width: `${pct}%` } }), h("span", {}, nxt ? `${xp} / ${nxt} XP` : `${xp} XP`)),
        h("span", {}, tstate.earned ? `${tstate.earned} talent pt${tstate.earned === 1 ? "" : "s"}` : "No talent points yet"), tstate.available > 0 ? h("b", { class: "sx-tal__badge" }, String(tstate.available)) : null,
        btn(tstate.available > 0 ? "Spend talents" : "Talents", () => app.go("talents", { cls: st.cls, back: "classSelect" }), { size: "sm" })),
      h("p", { class: "sx-cls__talents" }, mods ? `Active talents: ${talentSummary(mods)}.` : "Win fights and clear acts to earn talent points. Every victory also levels the class and unlocks new cards.", lockedN ? ` ${lockedN} card${lockedN === 1 ? "" : "s"} still locked.` : ""));

    const detail = scroll("sx-cls__detail", h("div", { class: "sx-cls__inner" },
      h("div", { class: "sx-cls__head", style: { "--cc": cls.color } }, ico(cls.icon, { size: "xl", alt: cls.name }),
        h("div", {}, h("h2", {}, cls.name), h("p", { class: "sx-cls__lore" }, cls.lore),
          h("p", { class: "sx-cls__stat" }, h("b", {}, `${cls.startingHp} HP`), `   ${cls.startingGold || 0} gold   `, h("b", {}, res.name || "Resource")))),
      h("p", { class: "sx-cls__rules" }, icon(res.icon || RES_ICON[res.id] || "inv_misc_questionmark", "sx-cls__ri", ""), h("span", {}, h("b", {}, `${res.name || "Resource"}: `), res.rules || "")),
      h("p", { class: "sx-cls__arch" }, h("b", {}, "Archetypes: "), (cls.archetypes || []).map((a) => (typeof a === "string" ? cap(a) : a.name || cap(a.id))).join(", ")),
      h("div", { class: "sx-field" }, h("h4", {}, "Starting deck"), deck),
      acct,
      petPick,
      h("div", { class: "sx-field" }, h("h4", {}, "Start continent"), contBtns),
      maxH > 0 ? h("div", { class: "sx-field" }, h("h4", {}, "Difficulty"), heroicBtns, h("p", { class: "sx-hint" }, heroicBlurb(st.heroic))) : null,
      h("label", { class: "sx-field sx-seed" }, h("h4", {}, "Seed"), seedIn, tog("Random", false, () => { st.seed = newSeedString(); draw(); }))),
      h("div", { class: "sx-cls__go" }, btn("Begin the climb", async () => {
        await beginRun(app, st, ch);
      }, { size: "lg", auto: true })));

    fill(host,
      h("div", { class: "sx-cls__top" }, banner("Choose your class", "Nine classes. Each climbs with its own vanilla spells."), btn("Back", () => app.go(ch ? "charSelect" : "title"), { size: "sm", cls: "sx-cls__back" })),
      h("div", { class: "sx-cls__body" }, grid, detail));
  };
  draw();
  return host;
}
