// Talents V2 hook DEFINITIONS for the mage (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "mag_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in mage.hooks.js. Roster: docs/TALENTS_V2.md, per-class table: docs/talents-v2/mage.md.
export const MAG = { midCharges: 5, highCharges: 6, igniteBurn: 3 }; // Arcane Mind / Arcane Power Arcane Charge thresholds (shared with mage.hooks.js)
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const cardName = (id) => String(id).split("-").map(cap).join(" ");
export const defs = {
  // ---- Arcane ----
  mag_focus: { label: "Arcane Focus", text: (v) => `Arcane Missiles deals +${v} damage with every hit.` },
  mag_absorb: { label: "Magic Absorption", text: (v) => `The first time you lose HP each turn, gain ${v} Block.` },
  mag_clear: { label: "Clearcasting", text: (v) => `Each Arcane card you play has a ${v}% chance to grant 1 extra Arcane Charge.` },
  mag_charge_start: { label: "Magic Attunement", text: (v) => `Start each fight with ${plural(v, "Arcane Charge")}.` },
  mag_cardcharge: { label: "Mana Conduit", text: (v, e) => `Playing ${cardName(e.arg)} grants ${plural(v, "Arcane Charge")}.` },
  mag_pom: { label: "Presence of Mind", text: (v) => `After you play Presence of Mind, your next Attack this turn deals +${v} damage per hit.` },
  mag_mind: { label: "Arcane Mind", text: (v) => `While you hold ${MAG.midCharges} or more Arcane Charges, the first Arcane hit of each spell on each target deals +${v + 1} damage.` },
  mag_spow: { label: "Spell Power", text: (v) => `The first hit of every Attack spell on each target deals +${v} damage.` },
  mag_apower: { label: "Arcane Power", text: (v) => `While you hold ${MAG.highCharges} or more Arcane Charges, Arcane hits deal ${v}% more damage.` },
  // ---- Fire ----
  mag_impact: { label: "Impact", text: (v) => `The first Fire hit on each enemy each turn deals +${v} damage.` },
  mag_ignite: { label: "Ignite", text: (v) => `Each Fire hit has a ${v}% chance to set its target ablaze: ${MAG.igniteBurn} Burn.` },
  mag_ign_start: { label: "Burning Soul", text: (v) => `Start each fight with ${v} Ignite (Combustion and Pyroblast need 3 Ignite for their full burst).` },
  mag_soul: { label: "Burning Soul", text: (v) => `At the start of each turn, gain ${v} Block plus 1 per 3 Ignite you hold.` },
  mag_elements: { label: "Master of Elements", text: (v) => `When you play a card of a different school than your previous card this turn, gain ${v} Block.` },
  mag_firepower: { label: "Fire Power", text: (v) => `Fire hits deal +${v} damage.` },
  mag_crit: { label: "Critical Strike", text: (v, e) => (e.arg === "fire" ? `Fire hits have a ${v}% chance to crit for double damage. A Fire crit grants 1 Ignite.` : `Frost hits have a ${v}% chance to crit for double damage.`) },
  mag_comb: { label: "Hot Streak", text: (v) => `Combustion and Pyroblast also apply Burn equal to ${v}% of the Ignite you held (rounded down).` },
  // ---- Frost ----
  mag_prec: { label: "Elemental Precision", text: (v) => `Frost hits deal +${v} damage to Weak enemies.` },
  mag_frostbite: { label: "Frostbite", text: (v) => `Each Frost hit has a ${v}% chance to Freeze its target before the damage (a Frozen enemy loses its next action).` },
  mag_perma: { label: "Permafrost", text: (v) => `At the start of your turn, gain ${v} Block for each Weak or Frozen enemy.` },
  mag_pierce: { label: "Piercing Ice", text: (v) => `Frost hits deal +${v} damage.` },
  mag_snap: { label: "Cold Snap", text: (v) => `Playing Cold Snap draws ${plural(v, "card")} (once per turn).` },
  mag_shatter: { label: "Shatter", text: (v) => `Frost hits deal ${v}% more damage to Frozen enemies.` },
  mag_iceblock: { label: "Ice Block", text: (v) => `Playing Ice Block also Freezes every enemy for 1 turn and heals you for ${v}% of your max HP.` },
};
