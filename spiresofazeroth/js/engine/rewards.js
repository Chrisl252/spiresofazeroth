// Rewards: gold, 1-of-3 card picks (common 60 / uncommon 30 / rare 9 / epic 1), potions, relics, shop stock. Seeded streams only.
import { heroicMods } from "./heroic.js";
import { resolveImmunity, cardUselessOn } from "./immunity.js";

const CARD_WEIGHTS = { common: 60, uncommon: 30, rare: 9, epic: 1 };
const RELIC_WEIGHTS = { common: 50, uncommon: 33, rare: 14, epic: 3, legendary: 1 }; // legendary = Thunderfury / Atiesh: rarer than epic
const POTION_WEIGHTS = { common: 65, uncommon: 25, rare: 10, epic: 2 };
const CARD_PRICE = { common: 50, uncommon: 80, rare: 150, epic: 260 };
const RELIC_PRICE = { common: 150, uncommon: 200, rare: 260, epic: 320, legendary: 450 };
const POTION_PRICE = { common: 45, uncommon: 65, rare: 90, epic: 120 };

const fallbackRarity = ["common", "uncommon", "rare"];

// Immunity-aware weighting: in a zone where >=30% of the roster ignores a status (Tirisfal: undead vs Bleed/Poison), cards that
// do nothing BUT apply it are offered 60% less often, so a Bleed/Poison class is never starved of cards that work here.
export function zoneImmuneStatuses(run, data) {
  const z = data.zone && data.zone(run.zoneId);
  const list = (z && z.enemies) || [];
  if (!list.length) return [];
  const n = {};
  for (const d of list) for (const i of resolveImmunity(d).immune) n[i] = (n[i] || 0) + 1;
  return Object.keys(n).filter((k) => n[k] / list.length >= 0.3);
}

export function rollCardChoices(run, data, rng, { tier = "normal", count = 3 } = {}) {
  data.setClass(run.classId);
  const pool = data.classPool(run.classId).concat(data.neutralPool());
  const by = { common: [], uncommon: [], rare: [], epic: [] };
  for (const c of pool) if (by[c.rarity]) by[c.rarity].push(c);
  const picks = [];
  const used = new Set();
  const blocked = { immune: zoneImmuneStatuses(run, data) }, ss = (data.schoolsData || {}).statusSchools;
  const w = { ...CARD_WEIGHTS };
  if (tier === "elite") { w.common = 45; w.uncommon = 35; w.rare = 17; }
  if (tier === "boss" || tier === "raid") { w.common = 0; w.uncommon = 30; w.rare = 55; w.epic = 15; }
  else w.epic = 0; // epic is the boss-only pool
  for (let guard = 0; picks.length < count && guard < 60; guard++) {
    let r = rng.weighted(Object.keys(w), (k) => w[k]);
    let list = by[r].filter((c) => !used.has(c.id));
    if (!list.length) for (const fb of fallbackRarity) { list = by[fb].filter((c) => !used.has(c.id)); if (list.length) break; }
    if (!list.length) break;
    const c = rng.pick(list);
    if (blocked.immune.length && cardUselessOn(c, blocked, ss) && rng.chance(0.6) && guard < 50) continue; // dead card in this zone: reroll
    used.add(c.id);
    picks.push(c.id);
  }
  return picks;
}

export function rollGold(run, rng, tier) {
  const m = heroicMods(run.heroic || 0).goldMult;
  const [lo, hi] = tier === "boss" || tier === "raid" ? [70, 90] : tier === "elite" ? [28, 40] : [10, 20];
  return Math.round(rng.int(lo, hi) * m);
}

function relicEligible(run, data, r) {
  if (run.relics.includes(r.id) || (run.gearBag && run.gearBag.includes(r.id)) || r.legacy || r.bonus || r.tier >= 1) return false; // set pieces drop through gear.js dropGear, never as a relic roll
  const twin = data.gear && data.gear.legacy && data.gear.legacy[r.id]; // an old id that maps onto a gear piece the run already wears = the same item twice
  if (twin && (run.relics.includes(twin) || run.relics.includes(`${twin}+`))) return false;
  if (r.base && run.relics.includes(r.base)) return false;
  if (r.class && r.class !== run.classId) return false;
  if (r.zone && r.zone !== run.zoneId && !(run.zonesVisited || []).includes(r.zone)) return false;
  return true;
}
export function relicPool(run, data) { return data.allRelics().filter((r) => relicEligible(run, data, r)); }

export function rollRelics(run, data, rng, count = 1, { minRarity } = {}) {
  const pool = relicPool(run, data).filter((r) => !minRarity || ["rare", "epic", "legendary"].includes(r.rarity));
  const out = [];
  const bag = pool.slice();
  while (out.length < count && bag.length) {
    const r = rng.weighted(bag, (x) => RELIC_WEIGHTS[x.rarity] || 20);
    bag.splice(bag.indexOf(r), 1);
    out.push(r.id);
  }
  return out;
}

export function rollPotion(run, data, rng) {
  const list = [...data.potions.values()];
  if (!list.length) return null;
  return rng.weighted(list, (p) => POTION_WEIGHTS[p.rarity] || 20).id;
}

// StS style: chance climbs when a fight drops nothing.
export function potionDrops(run, rng, tier) {
  const base = tier === "elite" || tier === "boss" ? 0.6 : 0.4;
  const chance = Math.min(0.9, base + (run.potionMiss || 0) * 0.1);
  const hit = rng.chance(chance);
  run.potionMiss = hit ? 0 : (run.potionMiss || 0) + 1;
  return hit;
}

export function buildShop(run, data, rng) {
  data.setClass(run.classId);
  const T = run.talents || {};
  const disc = Math.max(0, Math.min(60, T.shop | 0)) / 100; // Haggling talents: every price lower by this fraction
  const classCards = data.classPool(run.classId);
  const neutral = data.neutralPool();
  const cards = [];
  const used = new Set();
  const take = (list, rarityBias) => {
    const bag = list.filter((c) => !used.has(c.id));
    if (!bag.length) return;
    const c = rng.weighted(bag, (x) => CARD_WEIGHTS[x.rarity] || 5);
    used.add(c.id);
    cards.push({ id: c.id, price: Math.round(CARD_PRICE[c.rarity] * (0.9 + rng.next() * 0.2) * (1 - disc)) });
  };
  for (let i = 0; i < 4; i++) take(classCards, 0);
  take(neutral.length ? neutral : classCards, 0);
  const relics = rollRelics(run, data, rng, 2).map( // shop.relics = jewellery/cloaks/trinkets (GEAR_SPEC "shop.gear"; key kept so shop.js keeps working)
    (id) => ({ id, price: Math.round(RELIC_PRICE[(data.relic(id) || {}).rarity] * (0.9 + rng.next() * 0.2) * (1 - disc)) }));
  const potions = [];
  for (let i = 0; i < 3; i++) { const id = rollPotion(run, data, rng); if (id) potions.push({ id, price: Math.round(POTION_PRICE[(data.potion(id) || {}).rarity] * (0.9 + rng.next() * 0.2) * (1 - disc)) }); }
  return { cards, relics, potions, removePrice: Math.max(25, Math.round((75 + 25 * (run.removals || 0)) * (1 - disc)) - (T.removal | 0)), sold: {} };
}
