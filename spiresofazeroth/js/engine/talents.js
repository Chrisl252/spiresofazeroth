// Account progression: classic talent trees (data/talents/<class>.json) paid with points earned by climbing, and the Slay the Spire
// card-unlock rhythm (data/unlocks.json). Pure engine: no DOM. meta.talents[class] = { earned, spent: { talentId: rank } },
// meta.progress[class] = { xp, runs, wins }. Run modifiers (talentMods) are stamped onto run.talents by newRun and read by
// combat.startCombat / rewards / run.js. The headless sim never passes a meta, so it is unaffected.
// Talent pace (owner ruling 2026-10-23 "slow + trim", replacing the 2026-10-21 "full tree in 1-2 h" pace): points are paid per
// FLOORS_PER_POINT floors cleared + per act + victory, so the 51-point cap takes several runs; TALENT_LIMITS caps what talents can
// add to a fight (one home: limitTalentMods, applied by talentMods and newRun). Measure with tools/spires/sim.mjs --talents.

import { HOOKS, valueAt, modKey, talentEffects, cardList } from "./talentHookDefs.js";

export const TALENT_CAP = 51;            // a level-60 character has 51 points
export const TIER_STEP = 5;              // points in a tree needed per tier, like the client
export const FLOORS_PER_POINT = 5;      // 1 point per 5 floors cleared (fight, elite, boss, event, rest, shop, treasure); was 2 per floor
export const POINTS_PER_ACT = 1;         // every act cleared
export const VICTORY_BONUS = 5;          // beating the final boss
export const TALENT_ECON = 2;            // economy version: 1 = acts only (+1/act, +5/win), 2 = per floor (2026-10-21)
// Legacy flat-stat classes only: most a fully specced character can bring into a fight (owner ruling 2026-10-23). Talents V2 trees (hook keys,
// docs/TALENTS_V2.md) never touch these keys, so converting a class removes its dead points; economy keys (gold, goldpct, heal, choice) are not capped.
export const TALENT_LIMITS = { energy1: 1, draw1: 1, str: 6, dex: 4, spell_power: 6, thorns: 5, armor: 3, metal: 3, regen: 4, block: 10, shield: 10, hp: 25, res: 20, free_cast: 1, rage_gen: 1 };
export function limitTalentMods(mods) {
  if (!mods) return mods;
  const out = { ...mods };
  for (const [k, cap] of Object.entries(TALENT_LIMITS)) if (out[k] > cap) out[k] = cap;
  return out;
}

// every talent maps to ONE of these run modifiers; `text` renders the tooltip for a given total value
export const EFFECTS = {
  hp: { label: "Max HP", text: (v) => `+${v} Max HP.` },
  gold: { label: "Starting gold", text: (v) => `Start each run with ${v} more gold.` },
  str: { label: "Strength", text: (v) => `Start every fight with ${v} Strength.` },
  dex: { label: "Dexterity", text: (v) => `Start every fight with ${v} Dexterity.` },
  thorns: { label: "Thorns", text: (v) => `Start every fight with ${v} Thorns.` },
  regen: { label: "Regeneration", text: (v) => `Start every fight with ${v} Regeneration.` },
  metal: { label: "Metallicize", text: (v) => `Start every fight with ${v} Metallicize.` },
  block: { label: "Block", text: (v) => `Start every fight with ${v} Block.` },
  energy1: { label: "Energy", text: (v) => `+${v} Energy on your first turn of every fight.` },
  draw1: { label: "Draw", text: (v) => `Draw ${v} extra card${v > 1 ? "s" : ""} on your first turn of every fight.` },
  res: { label: "Class resource", text: (v) => `Start every fight with ${v} more of your class resource.` },
  heal: { label: "Healing", text: (v) => `Campfires and healers restore ${v}% more.` },
  goldpct: { label: "Gold found", text: (v) => `Fights pay ${v}% more gold.` },
  choice: { label: "Card choice", text: (v) => `Fights offer ${v} extra card to choose from.` },
  removal: { label: "Removal", text: (v) => `Card removal costs ${v} less gold.` },
  shop: { label: "Haggling", text: (v) => `Shop prices ${v}% lower.` },
  spell_power: { label: "Spell Power", text: (v) => `Start every fight with ${v} Spell Power (+${v} magic damage).` },
  armor: { label: "Armor", text: (v) => `Take ${v} less damage from every hit.` },
  shield: { label: "Holy Shield", text: (v) => `Start every fight with ${v} Holy Shield absorb.` },
  rage_gen: { label: "Rage Generation", text: (v) => `Generate ${v} Rage at turn start.` },
  feral: { label: "Feral Prowess", text: (v) => `Start every fight with ${v} Feral Power (+${v} damage in forms).` },
  stealth: { label: "Stealth", text: (v) => `Start every fight in Stealth for ${v} turn${v > 1 ? "s" : ""}.` },
  vampiric: { label: "Vampiric Embrace", text: (v) => `Shadow spells heal you for ${v * 25}% of damage dealt.` },
  reincarnation: { label: "Reincarnation", text: (v) => `Revive at 30% HP once per fight.` },
  windfury: { label: "Windfury", text: (v) => `First attack each turn strikes twice.` },
  free_cast: { label: "Clearcasting", text: (v) => `Your first card each fight costs 0 Energy.` },
  retain_block: { label: "Retain Block", text: (v) => `Retain all Block for your first turn.` },
};

// V2 hook keys (talentHookDefs.js) share this table, so the tooltip, the summary and the schema test all read ONE registry
for (const [k, d] of Object.entries(HOOKS)) EFFECTS[k] = d;

const slot = (meta, cid) => {
  if (!meta.talents) meta.talents = {};
  if (!meta.talents[cid]) meta.talents[cid] = { earned: 0, spent: {} };
  if (!meta.talents[cid].spent) meta.talents[cid].spent = {};
  return meta.talents[cid];
};
const prog = (meta, cid) => {
  if (!meta.progress) meta.progress = {};
  if (!meta.progress[cid]) meta.progress[cid] = { xp: 0, runs: 0, wins: 0 };
  return meta.progress[cid];
};

export function talentState(meta, cid) {
  const s = slot(meta, cid);
  const used = Object.values(s.spent).reduce((a, b) => a + (b | 0), 0);
  return { earned: s.earned | 0, spent: s.spent, used, available: Math.max(0, (s.earned | 0) - used) };
}
export const treeSpent = (state, tree) => tree.talents.reduce((a, t) => a + (state.spent[t.id] | 0), 0);
export const tierNeed = (talent) => TIER_STEP * (talent.tier - 1);
// points spent in the tiers BELOW `tier` (the client's rule: a row opens when the rows above it hold 5 per row)
export const pointsBelow = (spent, tree, tier) => tree.talents.reduce((a, t) => a + (t.tier < tier ? spent[t.id] | 0 : 0), 0);
export function canLearn(state, tree, talent) {
  if (state.available <= 0) return "No talent points left.";
  if ((state.spent[talent.id] | 0) >= talent.max) return "Already at max rank.";
  const need = tierNeed(talent);
  if (pointsBelow(state.spent, tree, talent.tier) < need) return `Requires ${need} points in ${tree.name}.`;
  return null;
}
export function learn(meta, cid, tree, talent) {
  const st = talentState(meta, cid);
  if (canLearn(st, tree, talent)) return false;
  const s = slot(meta, cid);
  s.spent[talent.id] = (s.spent[talent.id] | 0) + 1;
  return true;
}
// Unlearn one rank: only legal if no higher tier of that tree would lose its prerequisite points.
export function unlearn(meta, cid, tree, talent) {
  const s = slot(meta, cid), r = s.spent[talent.id] | 0;
  if (!r) return false;
  const after = { ...s.spent, [talent.id]: r - 1 };
  const blocks = tree.talents.some((t) => t.tier > talent.tier && (after[t.id] | 0) > 0 && pointsBelow(after, tree, t.tier) < tierNeed(t));
  if (blocks) return false;
  s.spent[talent.id] = r - 1;
  if (!s.spent[talent.id]) delete s.spent[talent.id];
  return true;
}
export function resetTalents(meta, cid) { slot(meta, cid).spent = {}; }

/** Run modifiers from a { talentId: rank } map: flat keys sum r*per; V2 hooks sum valueAt(rank) under `key[:arg]` (list args fan out per card). */
export function modsFromSpent(tdef, spent) {
  const out = {};
  let any = false;
  for (const tree of tdef.trees) for (const t of tree.talents) {
    const r = Math.min(spent[t.id] | 0, t.max);
    if (r <= 0) continue;
    for (const e of talentEffects(t)) {
      const v = valueAt(e, r);
      if (!v) continue;
      const keys = e.arg && e.key !== "card_apply" ? cardList(e.arg).map((c) => `${e.key}:${c}`) : [modKey(e)];
      for (const k of keys) out[k] = (out[k] || 0) + v;
      any = true;
    }
  }
  return any ? out : null;
}
// aggregated run modifiers for a class, from the spent ranks and the class talent file (null when nothing is spent)
export function talentMods(meta, cid, tdef) {
  if (!meta || !tdef) return null;
  const out = modsFromSpent(tdef, slot(meta, cid).spent);
  return out ? limitTalentMods(out) : null;
}
/** Clamp saved ranks to the current talent file (unknown ids dropped, ranks above max cut) and refund tiers that lost their prerequisite
 *  points; refunds are automatic because available = earned - spent. Returns true when `spent` changed (the caller saves). Idempotent. */
export function repairSpent(meta, cid, tdef) {
  if (!meta || !tdef) return false;
  const s = slot(meta, cid);
  let changed = false;
  const known = new Map();
  for (const tree of tdef.trees) for (const t of tree.talents) known.set(t.id, t);
  for (const id of Object.keys(s.spent)) {
    const t = known.get(id), r = s.spent[id] | 0;
    if (!t || r <= 0) { delete s.spent[id]; changed = true; continue; }
    if (r > t.max) { s.spent[id] = t.max; changed = true; }
  }
  for (const tree of tdef.trees) {
    for (let guard = 0; guard < 200; guard++) {
      const bad = tree.talents.filter((t) => (s.spent[t.id] | 0) > 0 && pointsBelow(s.spent, tree, t.tier) < tierNeed(t)).sort((a, b) => b.tier - a.tier)[0];
      if (!bad) break;
      delete s.spent[bad.id]; changed = true;
    }
  }
  return changed;
}

// ---- progression after a run ---------------------------------------------------------------------------------------------
export const XP_LEVELS = [30, 80, 160];
export function classLevel(meta, cid, thresholds = XP_LEVELS) {
  const xp = prog(meta, cid).xp | 0;
  return thresholds.filter((t) => xp >= t).length;
}
export function nextLevelXp(meta, cid, thresholds = XP_LEVELS) {
  const lvl = classLevel(meta, cid, thresholds);
  return lvl >= thresholds.length ? null : thresholds[lvl];
}
const actsCleared = (run) => (run.result === "victory" ? Math.max(1, run.act) : Math.max(0, (run.act | 0) - 1));
/** Talent points a finished run pays before the cap: 1 per FLOORS_PER_POINT floors cleared (the floor you fell on does not count), per act, victory. */
export function runTalentPoints(run) {
  const victory = run.result === "victory";
  const floors = Math.max(0, ((run.stats && run.stats.floors) | 0) - (victory ? 0 : 1));
  return Math.floor(floors / FLOORS_PER_POINT) + POINTS_PER_ACT * actsCleared(run) + (victory ? VICTORY_BONUS : 0);
}
/** Called once when a run ends. Returns { points, xp, level, prevLevel, newCards } for the run-end screen. */
export function awardProgress(meta, run, unlocks) {
  const cid = run.classId, victory = run.result === "victory";
  const acts = actsCleared(run); // acts fully cleared
  const points = Math.min(TALENT_CAP - (slot(meta, cid).earned | 0), runTalentPoints(run));
  slot(meta, cid).earned = Math.min(TALENT_CAP, (slot(meta, cid).earned | 0) + Math.max(0, points));
  const th = (unlocks && unlocks.thresholds) || XP_LEVELS;
  const p = prog(meta, cid), prevLevel = classLevel(meta, cid, th);
  const xp = Math.max(0, (run.stats && run.stats.floors) | 0) + 10 * acts + (victory ? 40 : 0);
  p.xp = (p.xp | 0) + xp; p.runs = (p.runs | 0) + 1; if (victory) p.wins = (p.wins | 0) + 1;
  const level = classLevel(meta, cid, th);
  const tiers = (unlocks && unlocks.classes && unlocks.classes[cid]) || [];
  const newCards = tiers.slice(prevLevel, level).flat();
  return { points: Math.max(0, points), xp, level, prevLevel, newCards, nextXp: nextLevelXp(meta, cid, th) };
}
/** Card ids the player has not unlocked yet (empty when "unlock all" is on in settings). */
export function lockedCardIds(meta, unlocks) {
  const out = new Set();
  if (!unlocks || !unlocks.classes || (meta && meta.settings && meta.settings.unlockAll)) return out;
  const th = unlocks.thresholds || XP_LEVELS;
  for (const [cid, tiers] of Object.entries(unlocks.classes)) {
    const lvl = classLevel(meta || {}, cid, th);
    tiers.slice(lvl).flat().forEach((id) => out.add(id));
  }
  return out;
}
export function unlockTierOf(cardId, unlocks) {
  for (const tiers of Object.values((unlocks && unlocks.classes) || {})) for (let i = 0; i < tiers.length; i++) if (tiers[i].includes(cardId)) return i + 1;
  return 0;
}

/** One-time credits on boot; returns true when meta changed (the caller saves). (1) Saves older than the talent system: past runs
 *  (meta.stats) become points + XP on the last class played. (2) Saves from the acts-only economy (TALENT_ECON 1): each class's
 *  earned points rise to its XP so far, 1 point per XP (capped). The per-floor rule pays ~1.2 points per XP in the sim, so this
 *  never over-credits. Points only ever go UP and `spent` is untouched, so no save can end with more spent than earned. */
export function grantLegacyProgress(meta, classIds) {
  if (!meta) return false;
  let changed = false;
  if (!meta.legacyGrant) {
    meta.legacyGrant = 1; changed = true;
    const st = meta.stats || {};
    if (st.runs > 0 && classIds && classIds.length) {
      const cid = meta.lastClass && classIds.includes(meta.lastClass) ? meta.lastClass : classIds[0];
      const s = slot(meta, cid), p = prog(meta, cid);
      s.earned = Math.min(TALENT_CAP, (s.earned | 0) + Math.min(20, (st.bestAct | 0) + VICTORY_BONUS * (st.wins | 0)));
      p.xp = (p.xp | 0) + 10 * (st.runs | 0) + 40 * (st.wins | 0); p.runs = (p.runs | 0) + (st.runs | 0); p.wins = (p.wins | 0) + (st.wins | 0);
    }
  }
  if ((meta.talentEcon | 0) < TALENT_ECON) {
    meta.talentEcon = TALENT_ECON; changed = true;
    for (const [cid, p] of Object.entries(meta.progress || {})) {
      const s = slot(meta, cid);
      s.earned = Math.max(s.earned | 0, Math.min(TALENT_CAP, (p && p.xp) | 0));
    }
  }
  return changed;
}
/** Short human summary of a class's active run modifiers, for the class-select sheet ("+6 Max HP, +1 Strength"). */
export function talentSummary(mods) {
  if (!mods) return "";
  return Object.entries(mods).map(([full, v]) => {
    const [k, ...rest] = full.split(":"), e = EFFECTS[k]; if (!e) return null;
    if (HOOKS[k]) { // V2 hook: "Card damage (Heroic Strike)" style; the exact numbers are on the talent tooltips
      const what = rest.length ? ` (${rest.join(":").split(":")[0].split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")})` : "";
      return k === "grant" ? null : `${e.label}${what}`;
    }
    return ["heal", "goldpct", "shop"].includes(k) ? `${e.label} +${v}%` : k === "removal" ? `${e.label} -${v}g` : ["reincarnation", "windfury", "free_cast", "retain_block"].includes(k) ? e.label : `${e.label} +${v}`;
  }).filter(Boolean).join(", ");
}
