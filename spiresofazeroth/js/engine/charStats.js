// Character sheet numbers (owner 11-01: "no way to see racial bonuses during a run" -> a WoW-style character screen). No DOM.
// charStats(run, data) -> everything ui/charSheet.js shows. Combat numbers come from a DRY-RUN combat start on a deep clone of the run
// (no enemies; the live run is never touched), so energy, draw, starting block and every combat-start status (gear, set bonuses,
// relics, talents) read exactly as the next real fight will begin. One home: the sheet never re-implements a rule.
import { startCombat } from "./combat.js";
import { heroicMods, difficultyLabel } from "./heroic.js";
import { midRunHpMult } from "./talentsMidRun.js";
import { gearLevel, setInfo, worn, isStarter } from "./gear.js";
import { racialInfo } from "./racials.js";

// statuses that are bookkeeping, not a stat the player cares about
const HIDE = new Set(["energized_shown", "fresh"]);
const TALENT_LABEL = {
  str: "Strength", dex: "Dexterity", thorns: "Thorns", metal: "Metallicize", spell_power: "Spell Power", armor: "Armor", shield: "Shield",
  rage_gen: "Rage generation", feral: "Feral", stealth: "Stealth", vampiric: "Vampiric Embrace", reincarnation: "Reincarnation",
  windfury: "Windfury", free_cast: "Free casts", retain_block: "Retain block", energy1: "Energy on turn 1", res: "Starting resource",
  draw1: "Cards drawn on turn 1", block1: "Block on turn 1", regen: "Regeneration", hp: "Max HP",
};

function dryCombat(run, data) {
  const r = JSON.parse(JSON.stringify(run));
  r.pending = { type: "combat", tier: "normal", encounter: [] };
  data.setClass(r.classId);
  const C = startCombat({ data, run: r, zone: r.zoneId ? data.zone(r.zoneId) : null, tier: "normal", encounter: [], enemyDefs: {}, interactive: false });
  return C;
}

export function charStats(run, data) {
  const out = { ok: true };
  const cls = data.classObj(run.classId) || {};
  const ch = run.character || {};
  out.hero = { name: ch.name || cls.name || "Hero", race: ch.race || null, classId: run.classId, className: cls.name || run.classId, color: cls.color, icon: cls.icon };
  out.core = { hp: Math.round(run.hp), maxHp: run.maxHp, gold: run.gold, act: Math.max(1, run.act), floor: Math.max(0, run.floor + 1), deck: run.deck.length, potions: run.potions.length };
  // combat start
  try {
    const C = dryCombat(run, data);
    const p = C.player, res = (C.cls && C.cls.resource) || {};
    out.combat = {
      energy: p.energy, draw: C.pile.hand.length, block: p.block,
      resource: res.id ? { id: res.id, name: res.name || res.id, now: p.res[res.id] || 0, max: res.max || 0 } : null,
      statuses: Object.entries(p.st).filter(([id, n]) => !HIDE.has(id) && typeof n === "number" && n !== 0)
        .map(([id, n]) => { const s = (data.status && data.status(id)) || {}; return { id, n, name: s.name || id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), text: s.text || "", icon: s.icon || null }; })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (e) {
    out.combat = null; out.combatError = String((e && e.message) || e);
  }
  // deck makeup
  const types = {};
  for (const c of run.deck) { const d = data.card && data.card(c.id, run.classId); const t = (d && d.type) || "other"; types[t] = (types[t] || 0) + 1; }
  out.deckTypes = types;
  out.upgraded = run.deck.filter((c) => c.up).length;
  // gear
  out.gear = worn(run, data).map(({ key, r }) => ({ key, item: r || null, starter: !!(r && isStarter(r.id)) }));
  out.gearLevel = gearLevel(run);
  out.set = setInfo(run, data);
  // racial
  out.racial = racialInfo(data, ch.race);
  // talents (stamped run modifiers) + mid-run Hardened Foes
  out.talents = Object.entries(run.talents || {}).filter(([k, v]) => typeof v === "number" && v > 0 && !k.startsWith("_")).map(([k, v]) => ({ k, v, name: TALENT_LABEL[k] || k.replace(/_/g, " ") }));
  // difficulty
  const hm = heroicMods(run.heroic || 0, run.ascension);
  out.difficulty = { heroic: run.heroic || 0, ascension: run.ascension | 0, name: difficultyLabel(run.heroic || 0, run.ascension), enemyHpPct: Math.round(((hm.enemyHpMult || 1) * (run.midTalents > 0 ? midRunHpMult(run) : 1) - 1) * 100), hardenedPct: run.midTalents > 0 ? Math.round((midRunHpMult(run) - 1) * 1000) / 10 : 0 };
  // non-gear relics (gear pieces and set bonuses have their own sections)
  const wornIds = new Set(Object.values(run.gear || {}).filter(Boolean));
  out.relics = run.relics.filter((id) => !wornIds.has(id) && !String(id).startsWith("set:")).map((id) => data.relic(id)).filter(Boolean);
  return out;
}
