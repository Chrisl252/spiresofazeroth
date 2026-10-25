// Talents V2 hook DEFINITIONS for the druid (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "dru_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in druid.hooks.js. Roster: docs/TALENTS_V2.md, docs/talents-v2/druid.md.
// The constants below are shared with druid.hooks.js so a tooltip can never drift from the behaviour.
export const DRU = {
  swift: { hpPct: 40, heal: 8, regen: 3 }, // Nature's Swiftness: once per fight emergency heal
  wild: { bearBlock: 8, catCombo: 2 },      // Heart of the Wild: first Attack each turn
  comboStep: 2,                              // Predatory Strikes: Combo Points per damage step
};
const fname = (id) => String(id).split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
const list = (arg) => String(arg || "").split(",").map((s) => s.trim()).filter(Boolean).map(fname);
const join = (l) => (l.length < 3 ? l.join(" and ") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);

export const defs = {
  // ---- Balance ----
  dru_spellcrit: { label: "Nature's Grace", text: (v) => `Your nature and arcane spells have a ${v}% chance to crit for double damage.` },
  dru_grace: { label: "Nature's Grace", text: (v) => `After one of your spells crits, your next spell this turn deals +${v} damage.` },
  dru_critdmg: { label: "Vengeance", text: (v) => `Your spell crits deal ${200 + v}% damage instead of 200%.` },
  dru_burn_dmg: { label: "Moonfury", text: (v) => `Your nature and arcane spells deal +${v} damage to enemies with Burn.` },
  dru_dream: { label: "Dreamstate", text: (v) => `Each nature or arcane spell you play grants ${v} Block.` },
  dru_omen: { label: "Omen of Clarity", text: (v) => (v > 0 ? "Once each turn, the first card you play that costs 2 or more refunds 1 Energy." : "") },
  dru_moonkin: { label: "Moonkin Form", text: (v) => `While in Moonkin Form, your nature and arcane spells deal +${v} damage.` },
  // ---- Feral ----
  dru_cat_bleed: { label: "Feral Instinct", text: (v) => `Attacks you play in Cat Form apply ${v} Bleed.` },
  dru_bear_block: { label: "Thick Hide", text: (v) => `Shifting into Bear Form grants ${v} Block.` },
  dru_combo_dmg: { label: "Predatory Strikes", text: (v) => `Your Attacks deal +${v} damage for every ${DRU.comboStep} Combo Points you hold.` },
  dru_leader: { label: "Leader of the Pack", text: (v) => `Shifting into any form heals ${v} HP and grants ${v} Block.` },
  dru_wild: { label: "Heart of the Wild", text: (v) => (v > 0 ? `Your first Attack each turn grants ${DRU.wild.bearBlock} Block in Bear Form, or ${DRU.wild.catCombo} Combo Points in Cat Form.` : "") },
  // ---- Restoration ----
  dru_start_regen: { label: "Mark of the Wild", text: (v) => `Start each fight with ${v} Regeneration.` },
  dru_regen_block: { label: "Nature's Focus", text: (v) => `At the start of each turn, gain ${v} Block while Regeneration is active.` },
  dru_regen_tick: { label: "Gift of Nature", text: (v) => `At the start of each turn, heal ${v} extra HP while Regeneration is active.` },
  dru_heal: { label: "Healing Touch", text: (v, e) => { const l = list(e.arg); return `${join(l)} heal${l.length > 1 ? "" : "s"} ${v} more HP.`; } },
  dru_swift: { label: "Nature's Swiftness", text: (v) => (v > 0 ? `Once per fight, when you fall to ${DRU.swift.hpPct}% HP or less: instantly heal ${DRU.swift.heal} HP and gain ${DRU.swift.regen} Regeneration.` : "") },
  dru_swiftmend: { label: "Swiftmend", text: (v) => `Swiftmend leaves ${v} Regeneration behind after it consumes your Regen.` },
};
