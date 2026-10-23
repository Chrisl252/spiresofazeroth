// Talent hook DEFINITIONS (pure data, no engine imports): label + exact tooltip text for every hook key a talent may use.
// A talent is { id, name, icon, tier, col, max, effect: E, extra?: [E...] } with E = { key, per, vals?, arg? }:
//   value at rank r = vals ? vals[min(r, vals.length) - 1] : r * per      (vals lets a hook be non-linear: thresholds, one-shot flags)
//   mods key = key, or `${key}:${arg}` when the hook is parameterised (a card id, "card:status"); arg may be a comma list of card ids.
// The runtime that applies these lives in talentHooks.js; the roster + rules are documented in docs/TALENTS_V2.md.
// text(v, E) renders the tooltip for the value at a rank, so the tooltip can never drift from the numbers in the JSON.

export const HEAVY_HIT = 8;       // heavy_hit: base damage a single hit needs
export const ENRAGE_RAGE = 30;    // enrage_dmg: Rage needed
export const GUARD_BLOCK = 8;     // guard_dmg: Block needed
export const LAST_STAND = { hpPct: 30, block: 10, healPct: 10 };
export const SWEEP_RAGE = 3;      // first_aoe: Rage granted
export const RAGE_PER_DMG = 10;   // rage_dmg: Rage per +1 damage
export const WOUNDED_PCT = 50;    // wounded_dmg: enemy HP threshold

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const cardName = (id) => String(id).split("-").map(cap).join(" ");
export const cardList = (arg) => String(arg || "").split(",").map((s) => s.trim()).filter(Boolean);
const names = (arg) => { const l = cardList(arg).map(cardName); return l.length < 3 ? l.join(" and ") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`; };
const statusName = (s) => cap(String(s).replace(/_/g, " "));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const HOOKS = {
  // ---- card-specific (arg = card id[,card id...]; card_apply arg = "card:status") ----
  card_dmg: { label: "Card damage", text: (v, e) => `${names(e.arg)} deal${cardList(e.arg).length > 1 ? "" : "s"} +${v} damage.` },
  card_apply: { label: "Card status", text: (v, e) => { const [c, s] = String(e.arg).split(":"); return `${cardName(c)} applies ${v} more ${statusName(s)}.`; } },
  card_inflict: { label: "Card status", text: (v, e) => { const [c, s] = String(e.arg).split(":"); return `${cardName(c)} also applies ${v} ${statusName(s)} to its target.`; } },
  card_cost: { label: "Card cost", text: (v, e) => (v > 0 ? `${names(e.arg)} cost${cardList(e.arg).length > 1 ? "" : "s"} ${v} less Energy.` : "") },
  card_rage: { label: "Card Rage", text: (v, e) => (v > 0 ? `${names(e.arg)} grants ${v} more Rage.` : "") },
  card_block: { label: "Card Block", text: (v, e) => `${names(e.arg)} give +${v} Block.` },
  card_noexhaust: { label: "No Exhaust", text: (v, e) => (v > 0 ? `${names(e.arg)} no longer Exhausts.` : "") },
  card_nohurt: { label: "No self damage", text: (v, e) => (v > 0 ? `${names(e.arg)} no longer costs you HP.` : "") },
  grant: { label: "Learns", text: (v, e) => (v > 0 ? `Adds ${names(e.arg)} to your deck at the start of each run.` : "") },
  // ---- attacks ----
  first_stun: { label: "Concussion Blow", text: (v) => `Your first Attack each fight stuns its target for ${plural(v, "turn")}.` },
  attack_bleed: { label: "Deep Wounds", text: (v) => `Your Attacks apply ${v} Bleed to their target.` },
  bleed_dmg: { label: "Impale", text: (v) => `Attacks deal +${v} damage to Bleeding enemies.` },
  wounded_dmg: { label: "Executioner", text: (v) => `Attacks deal +${v} damage to enemies at ${WOUNDED_PCT}% HP or less.` },
  heavy_hit: { label: "Heavy Blows", text: (v) => `Hits of ${HEAVY_HIT} or more base damage deal +${v} damage.` },
  crit: { label: "Critical Strike", text: (v) => `Your Attacks have a ${v}% chance to hit for double damage.` },
  first_aoe: { label: "Sweeping Strikes", text: (v) => (v > 0 ? `Your first Attack each turn also hits every other enemy, and grants ${SWEEP_RAGE} Rage.` : "") },
  attack_draw: { label: "Flurry", text: (v) => `After you play ${plural(v, "Attack")} in a turn, draw 1 card (once per turn).` },
  attack_ramp: { label: "Rampage", text: (v) => `Each Attack you play makes your later Attacks this turn deal +${v} damage (stacks).` },
  attack_heal: { label: "Bloodthirst", text: (v) => `Heal ${v} HP whenever you play an Attack.` },
  attack_rage: { label: "Unbridled Wrath", text: (v) => `Gain ${v} Rage whenever you play an Attack.` },
  death_wish: { label: "Death Wish", text: (v) => `Your Attacks deal ${v}% more damage, but you take ${Math.floor(v / 2)}% more damage from enemy attacks.` },
  // ---- Rage ----
  rage_dmg: { label: "Tactical Mastery", text: (v) => `Attacks deal +1 damage per ${RAGE_PER_DMG} Rage you hold, up to +${v}.` },
  enrage_dmg: { label: "Berserker Rage", text: (v) => `While you have ${ENRAGE_RAGE} or more Rage, Attacks deal +${v} damage.` },
  rage_block: { label: "Booming Voice", text: (v) => `At the start of each turn, gain 1 Block per ${RAGE_PER_DMG} Rage you hold, up to ${v}.` },
  start_rage: { label: "Booming Voice", text: (v) => `Start each fight with ${v} more Rage.` },
  turn_rage: { label: "Anger Management", text: (v) => `Gain ${v} Rage at the start of each turn.` },
  // ---- defence ----
  h_armor: { label: "Toughness", text: (v) => `Start each fight with ${v} Armor (every hit you take is reduced by ${v}, min 1).` },
  deflect: { label: "Deflection", text: (v) => `The first enemy attack each turn deals ${v}% less damage to you (min 1).` },
  turn_block: { label: "Anticipation", text: (v) => `Start each turn with ${v} Block.` },
  block_carry: { label: "Shield Block", text: (v) => `When your turn starts, keep ${v}% of your Block (rounded down).` },
  block_thorns: { label: "Defiance", text: (v) => `While you have Block, you have +${v} Thorns.` },
  block_revenge: { label: "Revenge", text: (v) => `When an enemy attack is fully absorbed by your Block, deal ${v} damage to the attacker.` },
  guard_dmg: { label: "Shield Mastery", text: (v) => `While you have ${GUARD_BLOCK} or more Block, Attacks deal +${v} damage.` },
  // ---- on being hurt ----
  hurt_heal: { label: "Blood Craze", text: (v) => `The first time you lose HP each turn, heal ${v} HP.` },
  hurt_boost: { label: "Enrage", text: (v) => `After you lose HP, your next Attack deals +${v} damage.` },
  low_hp_guard: { label: "Last Stand", text: (v) => (v > 0 ? `Once per fight, when you fall to ${LAST_STAND.hpPct}% HP or less: gain ${LAST_STAND.block} Block and heal ${LAST_STAND.healPct}% of your max HP.` : "") },
};

/** value of effect E at a rank */
export function valueAt(e, rank) {
  if (!e || rank <= 0) return 0;
  if (Array.isArray(e.vals) && e.vals.length) return e.vals[Math.min(rank, e.vals.length) - 1] | 0;
  return rank * (e.per || 0);
}
export const modKey = (e) => (e.arg ? `${e.key}:${e.arg}` : e.key);
/** every effect of a talent, primary first */
export const talentEffects = (t) => [t.effect, ...((t && t.extra) || [])].filter(Boolean);
