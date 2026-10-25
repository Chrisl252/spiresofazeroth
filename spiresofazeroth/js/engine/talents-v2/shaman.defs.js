// Talents V2 hook DEFINITIONS for the shaman (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "sha_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in shaman.hooks.js. Roster: docs/talents-v2/shaman.md.
export const defs = {
  sha_earth_block: { label: "Earth's Grasp", text: (v) => `At the start of each turn, gain ${v} Block while an Earth totem stands.` },
  sha_fire_totem: { label: "Call of Flame", text: (v) => `Your Fire totems deal +${v} damage with every hit.` },
  sha_focus: { label: "Elemental Focus", text: (v) => (v > 0 ? `Your first critical spell each turn refunds ${v} Energy.` : "") },
  sha_card_crit: { label: "Critical Strike", text: (v, e) => `${String(e.arg).split(",").map((c) => c.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")).reduce((a, c, i, l) => (i === 0 ? c : i === l.length - 1 ? `${a} and ${c}` : `${a}, ${c}`), "")} have a ${v}% chance to crit for double damage.` },
  sha_crit: { label: "Call of Thunder", text: (v) => `Your fire, nature and frost spells have a ${v}% chance to crit for double damage.` },
  sha_shock_ramp: { label: "Reverberation", text: (v) => `Each Shock you play makes later Shocks this turn deal +${v} damage (stacks).` },
  sha_fury: { label: "Elemental Fury", text: (v) => (v > 0 ? "Your critical hits deal 2.25 times damage instead of double." : "") },
  sha_mastery: { label: "Elemental Mastery", text: (v) => (v > 0 ? "The first spell you cast each fight is a guaranteed crit." : "") },
  sha_imbue_dmg: { label: "Thundering Strikes", text: (v) => `While a weapon imbue is active, your Attacks deal +${v} damage.` },
  sha_wcrit: { label: "Weapon Mastery", text: (v) => `All of your Attacks have a ${v}% chance to crit for double damage.` },
  sha_heal: { label: "Improved Healing Wave", text: (v) => `Your healing spells heal ${v} extra HP.` },
  sha_totem_block: { label: "Totemic Focus", text: (v) => `At the start of each turn, gain ${v} Block per totem standing.` },
  sha_totem_place: { label: "Totemic Mastery", text: (v) => (v > 0 ? `Placing a totem grants ${v} Block.` : "") },
  sha_grace: { label: "Healing Grace", text: (v) => `After you cast a healing spell, the next enemy attack this turn deals ${v} less damage (min 1).` },
  sha_water_heal: { label: "Restorative Totems", text: (v) => `At the start of each turn, heal ${v} HP while a Water totem stands.` },
  sha_tidal: { label: "Tidal Mastery", text: (v) => `Your healing spells have a ${v}% chance to heal a second time.` },
  sha_surge: { label: "Mana Tide Totem", text: (v) => (v > 0 ? `After you cast a healing spell, your next Attack this turn deals +${v} damage.` : "") },
  sha_ankh: { label: "Reincarnation", text: (v) => `Once per run, a blow that would kill you leaves you at ${v}% of your max HP instead.` },
  sha_windfury: { label: "Windfury Weapon", text: (v) => `Your first Attack each turn strikes again for ${v}% of the damage it dealt.` },
    sha_stormstrike: { label: "Stormstrike", text: (v) => `The first Attack you play each fight strikes twice and applies ${v} Vulnerable.` },
  sha_purify: { label: "Purification", text: (v) => `Your healing spells cleanse ${["Poison", "Poison and Disease", "Poison, Disease and Curse"][Math.min(v, 3) - 1]} from you.` },
};
