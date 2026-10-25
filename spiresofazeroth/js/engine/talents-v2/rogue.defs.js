// Talents V2 hook DEFINITIONS for the rogue (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "rog_".
const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const defs = {
  rog_finisher_dmg: { label: "Aggression", text: (v) => `Finishers that deal damage (Eviscerate, Kidney Shot) deal +${v} damage per Combo Point spent.` },
  rog_finisher_crit: { label: "Malice", text: (v) => `Finishers that deal damage have a ${v}% chance to hit for double damage.` },
  rog_remorseless: { label: "Remorseless Attacks", text: (v) => `After you kill an enemy, your next Attack deals +${v} damage.` },
  rog_ruthless: { label: "Ruthlessness", text: (v) => `After you play a finisher, ${v}% chance to gain 1 Combo Point.` },
  rog_finisher_block: { label: "Relentless Strikes", text: (v) => `Finishers grant ${v} Block per Combo Point spent.` },
  rog_seal_fate: { label: "Seal Fate", text: (v) => `Each turn, your first Attack has a ${v}% chance to grant 1 Combo Point.` },
  rog_builder_dmg: { label: "Lethality", text: (v) => `Cards that build Combo Points deal +${v} damage.` },
  rog_atk_poison: { label: "Vile Poisons", text: (v) => `Your Attacks apply ${v} Poison to their target.` },
  rog_poison_dmg: { label: "Master Poisoner", text: (v) => `Attacks deal +${v} damage to Poisoned enemies.` },
  rog_kill_heal: { label: "Murder", text: (v) => `Heal ${v} HP whenever you kill an enemy.` },
  rog_cold_blood: { label: "Cold Blood", text: (v) => (v > 0 ? "The first damaging finisher you play each fight deals double damage." : "") },
  rog_second_strike: { label: "Dual Wield Specialization", text: (v) => `Your second and later Attacks each turn deal +${v} damage.` },
  rog_first_strike: { label: "Heightened Senses", text: (v) => `Your first Attack each turn deals +${v} damage.` },
  rog_dodge: { label: "Lightning Reflexes", text: (v) => `Each enemy attack has a ${v}% chance to miss you entirely.` },
  rog_rush: { label: "Adrenaline Rush", text: (v) => (v > 0 ? `Once per fight, at the start of a turn where you hold 5 Combo Points, gain ${pl(v, "Energy")}.` : "") },
  rog_combo_start: { label: "Vigor", text: (v) => `Start each fight with ${pl(v, "Combo Point")}.` },
  rog_stealth_dmg: { label: "Master of Deception", text: (v) => `Attacks deal +${v} damage while you are Stealthed.` },
  rog_start_stealth: { label: "Camouflage", text: (v) => `Start each fight Stealthed for ${pl(v, "turn")}.` },
  rog_stealth_block: { label: "Camouflage", text: (v) => `At the start of your turn, gain ${v} Block while Stealthed.` },
  rog_initiative: { label: "Initiative", text: (v) => `Your first Attack each turn while Stealthed has a ${v}% chance to grant 1 Combo Point.` },
  rog_debuff_dmg: { label: "Deadliness", text: (v) => `Attacks deal +${v} damage to enemies that are Weakened, Vulnerable, Stunned or Asleep.` },
  rog_premed: { label: "Premeditation", text: (v) => `If you start the fight Stealthed, gain ${pl(v, "Combo Point")}.` },
  rog_prep: { label: "Preparation", text: (v) => (v > 0 ? "Up to 3 times per fight, the first card you play in a turn that would Exhaust goes to your discard pile instead (not Sprint, Preparation, Adrenaline Rush, Vigor, Premeditation or Distract)." : "") },
};
