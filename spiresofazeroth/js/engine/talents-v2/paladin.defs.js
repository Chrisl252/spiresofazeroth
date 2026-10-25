// Talents V2 hook DEFINITIONS for the paladin (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "pal_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in paladin.hooks.js. Roster: docs/TALENTS_V2.md, docs/talents-v2/paladin.md.
export const PAL_LOW_HP = 35; // pal_ardent: HP percent at or below which the guard applies
export const defs = {
  pal_heal_block: { label: "Light's Ward", text: (v) => `Whenever a card heals you, gain ${v} Block.` },
  pal_heal_amp: { label: "Healing Light", text: (v) => `Cards that heal you heal ${v} more HP.` },
  pal_heal_dmg: { label: "Illumination", text: (v) => `Whenever a card heals you, deal ${v} holy damage to its target (or the first enemy).` },
  pal_heal_boost: { label: "Holy Power", text: (v) => `After a card heals you, your next Attack deals +${v} damage.` },
  pal_bless_block: { label: "Blessed Ground", text: (v) => `Every Blessing and Aura you play grants ${v} Block.` },
  pal_seal_dmg: { label: "Might of the Seal", text: (v) => `While a Seal is active, your Attacks deal +${v} damage.` },
  pal_seal_cast_dmg: { label: "Benediction", text: (v) => `Seals you play deal +${v} damage.` },
  pal_seal_keep: { label: "Seal Twisting", text: (v) => `Judgement has a ${v}% chance to keep your Seal active.` },
  pal_sanctity: { label: "Sanctity Aura", text: (v) => `All your holy damage is increased by ${v}%.` },
  pal_retaliate: { label: "Retaliation", text: (v) => `Whenever an enemy attack costs you HP, deal ${v} holy damage to the attacker.` },
  pal_ardent: { label: "Ardent Defender", text: (v) => `While you are at ${PAL_LOW_HP}% HP or less, enemy attacks deal ${v}% less damage to you (min 1).` },
  pal_stunned_dmg: { label: "Repentance", text: (v) => `Your Attacks deal +${v} damage to Stunned or sleeping enemies.` },
};
