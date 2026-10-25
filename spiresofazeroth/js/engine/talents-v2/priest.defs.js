// Talents V2 hook DEFINITIONS for the priest (pure data, no engine imports). Same shape as talentHookDefs.js HOOKS:
//   key: { label, text: (v, e) => tooltip for value v }. Keys must be unique across classes: prefix new ones with "pri_".
// Merged into HOOKS by talents-v2/defs.js; the runtime lives in priest.hooks.js. Roster: docs/TALENTS_V2.md, docs/talents-v2/priest.md.
const list = (arg) => String(arg || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const PRI = { infusionTurns: 3, braceHit: 8, formTaken: 15, lightwellCap: 3, vampStacks: 1 };
export const defs = {
  // ---- Discipline: shields and energy ----
  pri_open_block: { label: "Unbreakable Will", text: (v) => `Start each fight with ${v} Block.` },
  pri_inner_focus: { label: "Inner Focus", text: (v) => `The first card you play each fight refunds its Energy cost (up to ${v}).` },
  pri_skill_dmg: { label: "Mental Agility", text: (v) => `Every Skill you play also deals ${v} Holy damage to its target (or the first enemy).` },
  pri_pws_block: { label: "Improved Power Word: Shield", text: (v) => `Power Word: Shield gives +${v} Block.` },
  pri_pws_heal: { label: "Soul Warding", text: (v) => `Power Word: Shield also heals you for ${v} HP.` },
  pri_skill_block: { label: "Mental Agility", text: (v) => `Every Skill you play gives ${v} Block.` },
  pri_opening_draw: { label: "Divine Spirit", text: (v) => `Draw ${pl(v, "extra card")} on the first turn of each fight.` },
  pri_brace: { label: "Focused Will", text: (v) => `When a single hit costs you ${PRI.braceHit} or more HP, gain ${v} Block.` },
  pri_infusion: { label: "Power Infusion", text: (v) => `For the first ${PRI.infusionTurns} turns of each fight, your cards deal +${v} damage and you start each of those turns with ${v} Block.` },
  // ---- Holy: healing and Smite ----
  pri_heal_amp: { label: "Healing Focus", text: (v) => `Your healing spells heal ${v} more HP.` },
  pri_holy_crit: { label: "Holy Specialization", text: (v) => `Your Holy spells have a ${v}% chance to hit for double damage.` },
  pri_heal_block: { label: "Spell Warding", text: (v) => `Your healing spells also give ${v} Block.` },
  pri_inspire: { label: "Inspiration", text: (v) => `After you play a healing spell, your next Attack this turn deals +${v} damage.` },
  pri_card_heal: { label: "Holy Reach", text: (v, e) => `${list(e.arg).join(" and ")} heal${list(e.arg).length > 1 ? "" : "s"} you for ${v} HP when played.` },
  pri_heal_refund: { label: "Improved Healing", text: (v) => `Your first ${pl(v, "healing spell")} each turn ${v === 1 ? "refunds" : "refund"} 1 Energy.` },
  pri_holy_dmg: { label: "Spiritual Guidance", text: (v) => `Holy spells deal +${v} damage, or +${v * 2} while you have Regen.` },
  pri_surge: { label: "Surge of Light", text: (v) => `When a Holy spell hits for double damage, gain ${v} Block.` },
  pri_lightwell: { label: "Lightwell", text: (v) => (v > 0 ? `At the start of your turn, while you have Regen, deal damage equal to your Regen (up to ${PRI.lightwellCap}) to all enemies.` : "") },
  // ---- Shadow: damage over time and Shadowform ----
  pri_tap: { label: "Spirit Tap", text: (v) => `At the start of your turn, heal ${v} HP for each enemy suffering Poison or Disease.` },
  pri_shadow_block: { label: "Shadow Affinity", text: (v) => `Every Shadow spell you play gives ${v} Block.` },
  pri_dot_amp: { label: "Shadow Focus", text: (v) => `At the start of your turn, each enemy suffering Poison or Disease takes ${v} extra damage.` },
  pri_shadow_dmg: { label: "Darkness", text: (v) => `Shadow spells deal +${v} damage, or +${v * 2} against Poisoned enemies.` },
  pri_silence: { label: "Silence", text: (v) => `The first Shadow spell you play each fight Silences its target for ${pl(v, "turn")} and applies ${v} Weak.` },
  pri_weaving: { label: "Shadow Weaving", text: (v) => `Each Shadow spell you play makes your later Shadow spells this turn deal +${v} damage (stacks).` },
  pri_form_power: { label: "Shadowform", text: (v) => `While in Shadowform, Shadow spells deal +${v} damage and you take ${PRI.formTaken}% less damage (min 1).` },
  pri_vamp: { label: "Vampiric Embrace", text: (v) => `Start each fight with ${pl(v, "stack")} of Vampiric Embrace (Shadow damage heals you for 25% per stack).` },
};
