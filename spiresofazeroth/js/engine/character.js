// Character profile (race / gender / name / looks): pure data, no DOM, no combat effect. The saved shape lives on run.character and in
// meta.characters[]; both are optional, so every older save loads (characterOf() fills a default). The race x class matrix, text and
// name lists are real client data in data/charcreate.json (built by tools/spires/build-charcreate.py from the TBC Classic tables).
export const GENDERS = ["male", "female"];
export const RACE_ORDER = { alliance: ["human", "dwarf", "nightelf", "gnome", "draenei"], horde: ["orc", "undead", "tauren", "troll", "bloodelf"] };
export const ALL_RACES = [...RACE_ORDER.alliance, ...RACE_ORDER.horde];
// TBC Classic race x class matrix (CharBaseInfo, build 2.5.6.70006). charcreate.json carries the same table; tools/spires/charcreate-check.mjs asserts they agree.
export const MATRIX = {
  human: ["warrior", "paladin", "rogue", "priest", "mage", "warlock"],
  dwarf: ["warrior", "paladin", "hunter", "rogue", "priest"],
  nightelf: ["warrior", "hunter", "rogue", "priest", "druid"],
  gnome: ["warrior", "rogue", "mage", "warlock"],
  draenei: ["warrior", "paladin", "hunter", "priest", "shaman", "mage"],
  orc: ["warrior", "hunter", "rogue", "shaman", "warlock"],
  undead: ["warrior", "rogue", "priest", "mage", "warlock"],
  tauren: ["warrior", "hunter", "shaman", "druid"],
  troll: ["warrior", "hunter", "rogue", "priest", "shaman", "mage"],
  bloodelf: ["paladin", "hunter", "rogue", "priest", "mage", "warlock"],
};
// Race a pre-character save is shown as (old runs have no character).
export const DEFAULT_RACE = { warrior: "human", paladin: "human", hunter: "dwarf", rogue: "human", priest: "human", shaman: "orc", mage: "human", warlock: "human", druid: "nightelf" };
export const RACE_NAME = { human: "Human", dwarf: "Dwarf", nightelf: "Night Elf", gnome: "Gnome", draenei: "Draenei", orc: "Orc", undead: "Undead", tauren: "Tauren", troll: "Troll", bloodelf: "Blood Elf" };
export const HOME = { human: "ek", dwarf: "ek", gnome: "ek", undead: "ek", bloodelf: "ek", nightelf: "kal", draenei: "kal", orc: "kal", tauren: "kal", troll: "kal" };
export const NO_LOOKS = { skin: 0, face: 0, hair: 0, hairColor: 0, facial: 0 }; // customization indices; the baked race bodies have a single look, so these stay 0

export const factionOf = (race) => (RACE_ORDER.alliance.includes(race) ? "alliance" : "horde");
export const canBe = (race, classId) => !!(MATRIX[race] && MATRIX[race].includes(classId));
// The real client's rule when the race changes: keep the class when still valid, else the first class (in class-icon order) that is.
export function classAfterRaceChange(race, classId, classOrder) {
  if (canBe(race, classId)) return classId;
  return (classOrder || Object.keys(DEFAULT_RACE)).find((c) => canBe(race, c)) || MATRIX[race][0];
}
export const slugOf = (race, gender) => `${race}-${gender === "female" ? "female" : "male"}`;
export const cleanName = (s) => String(s || "").replace(/[^\p{L}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 12);

// Any stored thing -> a valid character for classId. Old saves (undefined) get the class's default race, male, no name.
export function characterOf(raw, classId) {
  const c = raw && typeof raw === "object" ? raw : {};
  let race = ALL_RACES.includes(c.race) ? c.race : DEFAULT_RACE[classId] || "human";
  if (classId && !canBe(race, classId)) race = DEFAULT_RACE[classId] && canBe(DEFAULT_RACE[classId], classId) ? DEFAULT_RACE[classId] : ALL_RACES.find((r) => canBe(r, classId)) || race;
  return { id: typeof c.id === "string" ? c.id : "", race, gender: c.gender === "female" ? "female" : "male", name: cleanName(c.name), looks: { ...NO_LOOKS, ...(c.looks || {}) }, legacy: !raw };
}
export const newCharacterId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`;
// "Undead Rogue" for HUD / lists
export const raceClassLabel = (ch, className) => `${RACE_NAME[ch.race]} ${className}`;
// Combat HUD labels: the hero's name (or class name when unnamed) and a "Race Class" tag. Old runs have no character: class name only, as before.
export function heroLabels(run, className) {
  const ch = run && run.character;
  if (!ch || !RACE_NAME[ch.race]) return { name: className, tag: "" };
  return { name: ch.name || className, tag: `${RACE_NAME[ch.race]} ${className}` };
}
