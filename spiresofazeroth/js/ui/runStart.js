// Starts a run (shared by the class-details screen and Enter World): newRun + the account-talent mods, remembers the character on the run.
import { sp, funnel } from "../analytics.js?v=20261029d";
import { track } from "./dom.js?v=20261029d";
import { saveRun, saveMeta, loadRun } from "../engine/save.js?v=20261029d";
import { newRun, prepareZonePick } from "../engine/run.js?v=20261029d";
import { newSeedString } from "../engine/rng.js?v=20261029d";
import { repairSpent, talentMods } from "../engine/talents.js?v=20261029d";
import { characterOf } from "../engine/character.js?v=20261029d";

// st: { cls, continent, seed, heroic, pet }; character: a saved character (or null for a nameless default)
export async function beginRun(app, st, character) {
  // never silently overwrite a saved run: starting a new one replaces it, so ask first (abandon is only ever an explicit, confirmed action)
  if (typeof confirm === "function" && loadRun() && !confirm("You have a saved run in progress. Starting a new run will replace it. Continue?")) return app.go("title");
  const { data, meta } = app;
  await Promise.all([data.loadClass(st.cls), data.loadTalents(st.cls)]);
  const tdef = data.talentDefs.get(st.cls) || null;
  if (tdef && repairSpent(meta, st.cls, tdef)) saveMeta(meta);
  const cls = data.classObj(st.cls);
  const run = newRun(data, { classId: st.cls, continent: st.continent || cls.defaultContinent || "ek", seed: (app.coop && app.coop.seedForRun()) || st.seed || newSeedString(), heroic: st.heroic || 0, pet: st.pet || null, talents: talentMods(meta, st.cls, tdef) });
  const ch = characterOf(character, st.cls);
  run.character = { id: ch.id, race: ch.race, gender: ch.gender, name: ch.name, looks: ch.looks }; // additive field: old saves have none, characterOf() defaults it
  data.setClass(st.cls);
  app.run = run;
  meta.lastClass = st.cls;
  if (ch.id && Array.isArray(meta.characters)) { const c = meta.characters.find((x) => x.id === ch.id); if (c) c.lastPlayed = Date.now(); }
  saveMeta(meta);
  await prepareZonePick(run, data);
  sp("run_start", { class: st.cls, race: ch.race }); funnel("run_start", false);
  track("run_start", { class: st.cls, seed: run.seed, ascension: run.heroic, race: ch.race, gender: ch.gender });
  run.startedAt = Date.now();
  saveRun(run);
  app.route();
}
