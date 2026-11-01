// Racials: one classic 1.12 / TBC racial per race, modelled as a 0-cost Exhaust card that joins the starter deck. Card defs live in
// data/racials.json (loaded into data.neutralCards as tokens, so they never roll as rewards or shop stock). No DOM, no new combat rules:
// every racial is plain effects-DSL (apply / remove / block / scry / end_turn ...). Rule of thumb: small, flavourful, situational, and each
// one carries a drawback (self-damage, Weak, Vulnerable, Disease, lost energy, or ending the turn) so racials never make a run easier overall.
export const RACIAL_CARD = {
  human: "racial-perception", dwarf: "racial-stoneform", nightelf: "racial-shadowmeld", gnome: "racial-escape-artist", draenei: "racial-gift-of-the-naaru",
  orc: "racial-blood-fury", undead: "racial-will-of-the-forsaken", tauren: "racial-war-stomp", troll: "racial-berserking", bloodelf: "racial-arcane-torrent",
};

export const racialCardId = (race) => RACIAL_CARD[race] || null;

// { id, name, icon, text } for a race, or null (unknown race / racials.json missing)
export function racialInfo(data, race) {
  const id = racialCardId(race), c = id && data && data.card ? data.card(id) : null;
  return c ? { id, name: c.name, icon: c.icon, text: c.text } : null;
}

// Adds the hero's racial to the starting deck (once). Called by the run starter right after run.character is set; old saves never get one.
export function grantRacial(run, data) {
  const ch = run && run.character, id = ch && racialCardId(ch.race);
  if (!id || !data.card(id) || run.deck.some((c) => c.id === id)) return null;
  run.deck.push({ id, up: false });
  return id;
}
