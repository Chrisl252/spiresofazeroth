// Talents V2 hook DEFINITIONS for the hunter (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "hun_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in hunter.hooks.js. Roster: docs/TALENTS_V2.md, docs/talents-v2/hunter.md.
const s = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const defs = {
  // ---- Beast Mastery: the pet ----
  hun_pet_hp: { label: "Endurance Training", text: (v) => `Your pet has +${v} max HP.` },
  hun_hawk_dmg: { label: "Aspect of the Hawk", text: (v) => `While you are in Aspect of the Hawk, your first Attack each turn deals +${v} damage.` },
  hun_hawk_start: { label: "Aspect of the Hawk", text: (v) => (v > 0 ? "You start each fight in Aspect of the Hawk." : "") },
  hun_pet_block: { label: "Thick Hide", text: (v) => `Your pet starts each turn with ${v} Block.` },
  hun_open_block: { label: "Pathfinding", text: (v) => `Gain ${v} Block on the first turn of each fight.` },
  hun_pet_dmg: { label: "Unleashed Fury", text: (v) => `Your pet's hits deal +${v} damage.` },
  hun_pet_revive: { label: "Revive Pet", text: (v) => `Once per fight, a fallen pet returns at the start of your next turn with ${v}% HP.` },
  hun_pet_crit: { label: "Ferocity", text: (v) => `Your pet's hits have a ${v}% chance to deal double damage.` },
  hun_bond_heal: { label: "Spirit Bond", text: (v) => `At the start of each turn, your pet heals ${v * 2} HP (you heal ${v} if it has fallen).` },
  hun_pet_swift: { label: "Bestial Swiftness", text: (v) => (v > 0 ? `At the start of each fight your pet attacks ${s(v, "time")}.` : "") },
  hun_frenzy: { label: "Frenzy", text: (v) => `Whenever your pet hits an enemy, you gain ${v} Block.` },
  hun_pack_dmg: { label: "Beast Mastery", text: (v) => `While your pet is alive, your Attacks deal +${v} damage.` },
  hun_wrath_start: { label: "Bestial Wrath", text: (v) => `Your pet starts each fight with Enrage ${v} (+${v} damage on every pet hit).` },
  hun_wrath: { label: "Bestial Wrath", text: (v) => `While your pet is Enraged, its hits deal ${v}% more damage.` },
  // ---- Marksmanship: shots and Marked ----
  hun_first_shot: { label: "Efficiency", text: (v) => `Your first Ranged Attack each turn deals +${v} damage.` },
  hun_shot_crit: { label: "Lethal Shots", text: (v) => `Your Ranged Attacks have a ${v}% chance to deal double damage.` },
  hun_crit_bonus: { label: "Mortal Shots", text: (v) => `Critical Ranged Attacks deal +${v} extra damage.` },
  hun_shot_block: { label: "Hawk Eye", text: (v) => `Gain ${v} Block whenever you play a Ranged Attack.` },
  hun_shot_dmg: { label: "Ranged Weapon Specialization", text: (v) => `Your Ranged Attacks deal +${v} damage.` },
  hun_marked_dmg: { label: "Master Marksman", text: (v) => `Your Attacks deal +${v} damage to Marked enemies.` },
  hun_silence: { label: "Silencing Shot", text: (v) => (v > 0 ? `Your first Ranged Attack each turn interrupts a casting target and applies Marked ${v}.` : "") },
  hun_aura_crit: { label: "Trueshot Aura", text: (v) => `Your Ranged Attacks have a further ${v}% chance to deal double damage.` },
  // ---- Survival: traps and melee ----
  hun_slayer: { label: "Monster Slaying", text: (v) => `Your Attacks deal +${v} damage to Elite and Boss enemies.` },
  hun_slay_all: { label: "Monster Slaying", text: (v) => `Your Attacks deal +${v} damage.` },
  hun_trap_weak: { label: "Entrapment", text: (v) => `A trap that springs also applies Weak ${v} to the enemy that sprang it.` },
  hun_melee_crit: { label: "Savage Strikes", text: (v) => `Your Melee Attacks have a ${v}% chance to deal double damage.` },
  hun_kill_heal: { label: "Survivalist", text: (v) => `Heal ${v} HP whenever an enemy dies.` },
  hun_trap_block: { label: "Clever Traps", text: (v) => `Arming a trap gives you ${v} Block.` },
  hun_trap_draw: { label: "Clever Traps", text: (v) => (v > 0 ? `Arming a trap draws ${s(v, "card")}.` : "") },
  hun_trap_dmg: { label: "Trap Mastery", text: (v) => `A trap that springs also deals ${v} damage to the enemy that sprang it.` },
};
