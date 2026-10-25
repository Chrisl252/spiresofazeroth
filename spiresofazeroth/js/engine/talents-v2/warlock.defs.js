// Talents V2 hook DEFINITIONS for the warlock (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys are prefixed "wlk_" so they never collide with another class.
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in warlock.hooks.js. Roster + old-to-new table: docs/talents-v2/warlock.md.
const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const defs = {
  // ---- Affliction: DoTs and drain ----
  wlk_dot_pulse: { label: "Improved Corruption", text: (v) => `At the end of your turn, every Poisoned enemy takes ${v} extra shadow damage.` },
  wlk_tap_heal: { label: "Improved Life Tap", text: (v) => `Life Tap heals you ${v} HP after it hurts you.` },
  wlk_tap_block: { label: "Improved Life Tap", text: (v) => `Life Tap gives ${v} Block.` },
  wlk_drain_heal: { label: "Fel Concentration", text: (v) => `Drain Life, Drain Soul, Drain Mana and Siphon Life heal you ${v} more HP.` },
  wlk_drain_block: { label: "Fel Concentration", text: (v) => `Drain Life, Drain Soul, Drain Mana and Siphon Life give you ${v} Block.` },
  wlk_spread: { label: "Grim Reach", text: (v) => `When a Poisoned enemy dies, ${v}% of its Poison spreads to another enemy.` },
  wlk_nightfall: { label: "Nightfall", text: (v) => `Corruption, Drain Life and Drain Soul have a ${v}% chance to trigger Shadow Trance: a free Shadow Bolt on the target.` },
  wlk_shadow_dmg: { label: "Shadow Mastery", text: (v) => `Your shadow damage hits deal +${v} damage.` },
  wlk_shadow_poison: { label: "Shadow Mastery", text: (v) => `Your shadow damage hits deal +${v} more damage to Poisoned enemies.` },
  wlk_pact_block: { label: "Dark Pact", text: (v) => `Dark Pact gives ${v} Block.` },
  wlk_pact_pet: { label: "Dark Pact", text: (v) => `Dark Pact heals your demon ${v} HP.` },
  wlk_siphon: { label: "Siphon Life", text: (v) => (v > 0 ? `At the end of your turn, heal ${v} HP for every Poisoned enemy.` : "") },
  // ---- Demonology: demons, shards and Soul Link ----
  wlk_healthstone: { label: "Improved Healthstone", text: (v) => `Healthstone heals ${v} more HP.` },
  wlk_void_hp: { label: "Improved Voidwalker", text: (v) => `Your Voidwalker has +${v} max HP.` },
  wlk_shard_start: { label: "Fel Intellect", text: (v) => `Start each fight with ${pl(v, "Soul Shard")}.` },
  wlk_free_summon: { label: "Fel Domination", text: (v) => (v > 0 ? `Your first summon each fight refunds ${v} Energy.` : "") },
  wlk_pet_regen: { label: "Fel Stamina", text: (v) => `At the start of your turn your demon heals ${v} HP.` },
  wlk_summon_block: { label: "Master Summoner", text: (v) => `Summoning a demon gives you ${v} Block.` },
  wlk_summon_draw: { label: "Master Summoner", text: (v) => (v > 0 ? `The first summon each turn draws ${pl(v, "card")}.` : "") },
  wlk_pet_dmg: { label: "Unholy Power", text: (v) => `Your demon's attacks deal +${v} damage.` },
  wlk_pet_shard_dmg: { label: "Unholy Power", text: (v) => `Your demon's attacks deal +1 damage per 3 Soul Shards you hold, up to +${v}.` },
  wlk_sac_block: { label: "Demonic Sacrifice", text: (v) => `Demonic Sacrifice gives ${v} Block.` },
  wlk_sac_str: { label: "Demonic Sacrifice", text: (v) => (v > 0 ? `Demonic Sacrifice gives ${v} more Strength.` : "") },
  wlk_demon_dmg: { label: "Master Demonologist", text: (v) => `While your demon lives, your spells deal +${v} damage.` },
  wlk_demon_def: { label: "Master Demonologist", text: (v) => `While your demon lives, you take ${v} less damage from every hit (min 1).` },
  wlk_aegis: { label: "Demonic Aegis", text: (v) => `At the start of your turn, while you have Armor, gain ${v} Block.` },
  wlk_link: { label: "Soul Link", text: (v) => `${v}% of the damage you take is redirected to your living demon.` },
  // ---- Destruction: Shadow Bolt, Conflagrate and crits ----
  wlk_isb: { label: "Improved Shadow Bolt", text: (v) => `Shadow Bolt exposes its target: the next other shadow hit on it this turn deals +${v} damage.` },
  wlk_aoe_dmg: { label: "Cataclysm", text: (v) => `Spells that hit several enemies deal +${v} damage to each.` },
  wlk_burn_pulse: { label: "Aftermath", text: (v) => `At the end of your turn, every Burning enemy takes ${v} extra fire damage.` },
  wlk_burn_weak: { label: "Aftermath", text: (v) => (v > 0 ? `At the end of your turn, every Burning enemy gets ${v} Weak.` : "") },
  wlk_crit: { label: "Devastation", text: (v) => `Your Attacks have a ${v}% chance to crit for double damage.` },
  wlk_crit_mult: { label: "Ruin", text: (v) => `Your critical hits deal ${v}% more damage (${200 + v}% total).` },
  wlk_sp_crit: { label: "Improved Searing Pain", text: (v) => `Searing Pain has +${v}% crit chance.` },
  wlk_intensity: { label: "Intensity", text: (v) => `Gain ${v} Block when you play your second Attack each turn.` },
  wlk_fire_dmg: { label: "Emberstorm", text: (v) => `Your fire damage hits deal +${v} damage.` },
  wlk_confl_keep: { label: "Conflagrate", text: (v) => `Conflagrate leaves ${v}% of the target's Burn behind instead of consuming all of it.` },
};
