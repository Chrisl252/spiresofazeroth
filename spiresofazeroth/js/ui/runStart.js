// Starts a run (shared by the class-details screen and Enter World): newRun + the account-talent mods, remembers the character on the run.
import { track } from "./dom.js";
import { saveRun, saveMeta } from "../engine/save.js";
import { newRun, prepareZonePick } from "../engine/run.js";
import { newSeedString } from "../engine/rng.js";
import { repairSpent, talentMods } from "../engine/talents.js";
import { characterOf } from "../engine/character.js";

// st: { cls, continent, seed, heroic, pet }; character: a saved character (or null for a nameless default)
export async function beginRun(app, st, character) {
  const { data, meta } = app;
  await Promise.all([data.loadClass(st.cls), data.loadTalents(st.cls)]);
  const tdef = data.talentDefs.get(st.cls) || null;
  if (tdef && repairSpent(meta, st.cls, tdef)) saveMeta(meta);
  const cls = data.classObj(st.cls);
  const run = newRun(data, { classId: st.cls, continent: st.continent || cls.defaultContinent || "ek", seed: st.seed || newSeedString(), heroic: st.heroic || 0, pet: st.pet || null, talents: talentMods(meta, st.cls, tdef) });
  const ch = characterOf(character, st.cls);
  run.character = { id: ch.id, race: ch.race, gender: ch.gender, name: ch.name, looks: ch.looks }; // additive field: old saves have none, characterOf() defaults it
  data.setClass(st.cls);
  app.run = run;
  meta.lastClass = st.cls;
  if (ch.id && Array.isArray(meta.characters)) { const c = meta.characters.find((x) => x.id === ch.id); if (c) c.lastPlayed = Date.now(); }
  saveMeta(meta);
  await prepareZonePick(run, data);
  track("run_start", { class: st.cls, seed: run.seed, ascension: run.heroic, race: ch.race, gender: ch.gender });
  saveRun(run);
  app.route();
}
