// Act-transition healer (the Slay the Spire "Ancient" beat): after an act is cleared (boss, rewards, optional dungeon done or skipped)
// a WoW healer restores HALF of the hero's missing HP once (StS-style recovery, was a full heal until build 20261018), before the next map. Pure engine: no DOM. UI = js/ui/healer.js. Data = data/healers.json.
// Persistence: run.healerAct = the last act that has been healed. enterHealer is a no-op when it equals run.act, so a reload (screen
// "healer" is saved in the run) or a second proceedAfterSpire can never heal twice. The final act never reaches this (victory).

const FALLBACK = {
  id: "uther-lightbringer",
  name: "Uther the Lightbringer",
  title: "First Paladin of the Silver Hand",
  icon: "spell_holy_holybolt",
  model: "hero-paladin.glb",
  lines: [
    "Well fought, friend. A true champion of the Light never fights alone.",
    "Hold your head high. I have seen worse odds, and I have seen them broken."
  ],
  heal: "Uther lays a hand upon you. The Light knits your deepest wounds."
};

/** The healer greeting after `act`: the entry whose `acts` lists it, else the file's default, else a built-in Uther the Lightbringer. */
export function healerFor(data, act) {
  const list = (data.healers && data.healers.healers) || [];
  return list.find((x) => (x.acts || []).includes(act)) || list.find((x) => x.id === (data.healers && data.healers.default)) || list[0] || FALLBACK;
}

/** Restore 50% of missing HP (Slay the Spire style recovery) and put the run on the healer screen. Returns false if already healed. */
export function enterHealer(run, data) {
  if (run.healerAct === run.act) return false;
  const hpBefore = run.hp;
  run.healerAct = run.act;
  const missing = Math.max(0, run.maxHp - hpBefore);
  const healed = Math.min(missing, Math.max(0, Math.ceil(missing * 0.5 * (1 + (((run.talents || {}).heal | 0) / 100)))));
  run.hp = hpBefore + healed;
  run.pending = { type: "healer", healerId: healerFor(data, run.act).id, hpBefore, healed };
  run.screen = "healer";
  return true;
}
