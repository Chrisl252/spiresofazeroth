// Classic immunities + damage schools. Pure data lookups; the hooks live in damage.js (schools), status.js (statuses), intents.js (build).
//  data/schools.json     card -> school, status -> schools it can come from, icons
//  data/immunities.json  family / family/type -> { immune: [status|school], resist: {school: mult} }
export const SCHOOLS = ["physical", "fire", "frost", "arcane", "nature", "shadow", "holy"];
const FALLBACK_ICON = ["spell_fire_fire", "spell_frost_frostbolt02", "spell_arcane_arcane01"];

let TABLE = { families: {}, types: {} };
export const isSchool = (x) => SCHOOLS.includes(x);
export function setImmunityTable(t) { TABLE = t && t.families ? t : { families: {}, types: {} }; }

const listOf = (x) => (Array.isArray(x) ? x : x ? [x] : []);

/** Resolve one enemy def -> { immune: [..], resist: {school: mult} } (table + per-enemy overrides). */
export function resolveImmunity(def, table = TABLE) {
  const out = { immune: [], resist: {} };
  if (!def || def.noImmunity) return out;
  const add = (row) => { if (!row) return; for (const i of listOf(row.immune)) if (!out.immune.includes(i)) out.immune.push(i); Object.assign(out.resist, row.resist || {}); };
  let t = table.types && table.types[`${def.family}/${def.type}`];
  if (t && t.same) t = { same: t.same, ...t };
  const fam = t && t.same ? t.same : def.family;
  if (!(t && t.inherit === false)) add(table.families && table.families[fam]);
  add(t);
  add({ immune: def.immune, resist: def.resist });
  for (const tr of def.traits || []) { // legacy trait spelling still counts
    if (tr.startsWith("immune:") && !out.immune.includes(tr.slice(7))) out.immune.push(tr.slice(7));
    else if (tr.startsWith("resist:") && out.resist[tr.slice(7)] === undefined) out.resist[tr.slice(7)] = 0.5;
  }
  return out;
}

/** Immune to damage of this school? (immune list holds both school and status names) */
export const immuneToSchool = (e, school) => !!(e && school && e.immune && e.immune.includes(school));

/** Would applying `id` (from a card of `school`) be blocked? A status is only blocked when the card's school is one it can come from. */
export function immuneToStatus(e, id, school, statusSchools) {
  if (!e || !e.immune || !e.immune.includes(id)) return false;
  const via = statusSchools && statusSchools[id];
  return !(school && via && !via.includes(school));
}

/** Damage multiplier for a school (1 = normal). */
export const resistMult = (e, school) => (e && e.resist && school && e.resist[school] !== undefined ? e.resist[school] : 1);

/** For UI: [{key, kind:'school'|'status', icon, name}] */
export function immuneList(e, data) {
  const sch = (data && data.schoolsData) || {};
  return ((e && e.immune) || []).map((k) => {
    if (isSchool(k)) return { key: k, kind: "school", icon: (sch.icons || {})[k] || FALLBACK_ICON[0], name: k[0].toUpperCase() + k.slice(1) };
    const kw = data && data.status ? data.status(k) : null;
    return { key: k, kind: "status", icon: (kw && kw.icon) || FALLBACK_ICON[1], name: (kw && kw.name) || k };
  });
}

const offence = (card) => {
  const dmg = [], st = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      if (x.op === "damage" && x.target !== "self") dmg.push(x.school || card.school || "physical");
      if (x.op === "apply" && x.target !== "self" && x.status) st.push(x.status);
      for (const v of Object.values(x)) walk(v);
    }
  };
  walk(card && card.effects);
  return { dmg, st };
};
/** true if every offensive part of `card` (damage schools + enemy-applied statuses) is blocked by `e`'s immunities. UI hint + reward weighting. */
export function cardUselessOn(card, e, statusSchools) {
  if (!e || !e.immune || !e.immune.length || !card || card.type === "power") return false;
  const { dmg, st } = offence(card);
  if (!dmg.length && !st.length) return false;
  return dmg.every((s) => immuneToSchool(e, s)) && st.every((id) => immuneToStatus(e, id, card.school, statusSchools));
}
/** Cards that lean on a status family (bleed/poison/...) and have no other damage: their value dies against immune zones. */
export function leansOnStatus(card, ids) {
  const { dmg, st } = offence(card);
  return !dmg.length && st.some((id) => ids.includes(id));
}
