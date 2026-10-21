// Account progression: classic talent trees (data/talents/<class>.json) paid with points earned by climbing, and the Slay the Spire
// card-unlock rhythm (data/unlocks.json). Pure engine: no DOM. meta.talents[class] = { earned, spent: { talentId: rank } },
// meta.progress[class] = { xp, runs, wins }. Run modifiers (talentMods) are stamped onto run.talents by newRun and read by
// combat.startCombat / rewards / run.js. The headless sim never passes a meta, so it is unaffected.

export const TALENT_CAP = 51;            // a level-60 character has 51 points
export const TIER_STEP = 5;              // points in a tree needed per tier, like the client
export const VICTORY_BONUS = 5;          // points for beating the final boss (plus one per act cleared)

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
};

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

// aggregated run modifiers for a class, from the spent ranks and the class talent file (null when nothing is spent)
export function talentMods(meta, cid, tdef) {
  if (!meta || !tdef) return null;
  const s = slot(meta, cid), out = {};
  let any = false;
  for (const tree of tdef.trees) for (const t of tree.talents) {
    const r = s.spent[t.id] | 0;
    if (!r) continue;
    out[t.effect.key] = (out[t.effect.key] || 0) + r * t.effect.per; any = true;
  }
  return any ? out : null;
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
/** Called once when a run ends. Returns { points, xp, level, prevLevel, newCards } for the run-end screen. */
export function awardProgress(meta, run, unlocks) {
  const cid = run.classId, victory = run.result === "victory";
  const acts = victory ? Math.max(1, run.act) : Math.max(0, (run.act | 0) - 1); // acts fully cleared
  const points = Math.min(TALENT_CAP - (slot(meta, cid).earned | 0), acts + (victory ? VICTORY_BONUS : 0));
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

/** One-time credit for saves older than the talent system: past runs (meta.stats) become points + XP on the last class played. */
export function grantLegacyProgress(meta, classIds) {
  if (!meta || meta.legacyGrant) return false;
  meta.legacyGrant = 1;
  const st = meta.stats || {};
  if (!(st.runs > 0) || !classIds || !classIds.length) return false;
  const cid = meta.lastClass && classIds.includes(meta.lastClass) ? meta.lastClass : classIds[0];
  const s = slot(meta, cid), p = prog(meta, cid);
  s.earned = Math.min(TALENT_CAP, (s.earned | 0) + Math.min(20, (st.bestAct | 0) + VICTORY_BONUS * (st.wins | 0)));
  p.xp = (p.xp | 0) + 10 * (st.runs | 0) + 40 * (st.wins | 0); p.runs = (p.runs | 0) + (st.runs | 0); p.wins = (p.wins | 0) + (st.wins | 0);
  return true;
}
/** Short human summary of a class's active run modifiers, for the class-select sheet ("+6 Max HP, +1 Strength"). */
export function talentSummary(mods) {
  if (!mods) return "";
  return Object.entries(mods).map(([k, v]) => {
    const e = EFFECTS[k]; if (!e) return null;
    return ["heal", "goldpct", "shop"].includes(k) ? `${e.label} +${v}%` : k === "removal" ? `${e.label} -${v}g` : `${e.label} +${v}`;
  }).filter(Boolean).join(", ");
}
