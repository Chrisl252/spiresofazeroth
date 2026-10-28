// Data loader. Environment-neutral: you give it fetchJson(relPath) -> parsed JSON or null (404). The browser passes a fetch
// wrapper that appends ?v=BUILD; node tools pass an fs reader. No DOM, no node imports here.
import { setImmunityTable } from "./immunity.js?v=20261028e";
import { loadClassGear, loadLegacyMap, slotOf } from "./gear.js?v=20261028e";
const HD = new URL("../../assets/icons-hd/", import.meta.url).href; // 256px upscaled icons, relative so dev + deploy both resolve
const arr = (o, key) => (Array.isArray(o) ? o : o && Array.isArray(o[key]) ? o[key] : []);

export const RARITY_ORDER = ["basic", "common", "uncommon", "rare", "epic", "legendary"];
export const QUALITY_COLORS = { basic: "#ffffff", common: "#ffffff", uncommon: "#1eff00", rare: "#0070dd", epic: "#a335ee", legendary: "#ff8000" };

export function createData({ fetchJson }) {
  const d = {
    classId: null, ready: false, errors: [],
    index: {}, classIds: [], zoneIndex: [], keywords: new Map(),
    globalRelics: [], finalSummons: [], potions: new Map(), neutralCards: new Map(), eventsCommon: [], finalBosses: [],
    classes: new Map(), classCards: new Map(), zones: new Map(), zoneMissing: new Set(),
    relicMap: new Map(), _defCache: new Map(),
  };

  const get = async (rel) => {
    try {
      const r = await fetchJson(rel);
      if (r === null || r === undefined) d.errors.push("missing " + rel);
      return r === undefined ? null : r;
    } catch (e) {
      d.errors.push(`failed ${rel}: ${e && e.message}`);
      return null;
    }
  };

  d.load = async () => {
    d.index = (await get("index.json")) || {};
    const path = (key, dflt) => d.index[key] || dflt;
    const [kw, rl, po, nc, ev, bf, ci, zi, sc, legacyM, schoolsD, immunitiesD, mapProf, heal, unl] = await Promise.all([
      get(path("keywords", "keywords.json")), get(path("relics", "relics.json")), get(path("potions", "potions.json")),
      get(path("neutralCards", path("neutral-cards", "neutral-cards.json"))), get(path("eventsCommon", path("events", "events-common.json"))),
      get(path("bosses", path("bossesFinal", "bosses-final.json"))), get(path("classes", "classes/index.json")), get(path("zones", "zones/index.json")),
      get(path("statusCards", "status-cards.json")),
      get("gear/legacy-map.json"),
      get(path("schools", "schools.json")),
      get(path("immunities", "immunities.json")),
      get(path("mapProfiles", "map-profiles.json")),
      get(path("healers", "healers.json")),
      get(path("unlocks", "unlocks.json")),
    ]);
    for (const c of arr(sc, "cards").concat(arr(bf, "cards"))) if (!d.neutralCards.has(c.id)) d.neutralCards.set(c.id, { ...c, class: null, token: true });
    d.finalSummons = arr(bf, "summons");
    for (const k of arr(kw, "keywords")) d.keywords.set(k.id, k);
    d.globalRelics = arr(rl, "relics");
    if (!d.gear) d.gear = { sets: new Map(), legacy: {} };
    if (legacyM && legacyM.map) d.gear.legacy = legacyM.map;
    for (const r of d.globalRelics) d.relicMap.set(r.id, r);
    for (const p of arr(po, "potions")) d.potions.set(p.id, p);
    for (const c of arr(nc, "cards")) d.neutralCards.set(c.id, { ...c, class: null });
    // (status/curse/boss cards are added after this loop, below)
    d.schoolsData = schoolsD || { cards: {}, statusSchools: {}, icons: {} };
    d.immunities = immunitiesD || { families: {}, types: {} };
    setImmunityTable(d.immunities);
    for (const [id, c] of d.neutralCards) if (!c.school) d.neutralCards.set(id, { ...c, school: d.schoolsData.cards[id] || "physical" });
    d.eventsCommon = arr(ev, "events");
    d.finalBosses = arr(bf, "bosses").length ? arr(bf, "bosses") : arr(bf, "enemies");
    d.classIds = arr(ci, "classes").map((x) => (typeof x === "string" ? x : x.id));
    d.zoneIndex = arr(zi, "zones");
    d.mapProfiles = mapProf || null;
    d.healers = heal || null;
    d.unlocks = unl && unl.classes ? unl : null; // card unlock tiers (engine/talents.js); null = everything open
    d.ready = true;
    return d;
  };

  d.loadClass = async (id) => {
    if (d.classes.has(id)) return d.classes.get(id);
    const c = await get(`classes/${id}.json`);
    if (!c) return null;
    d.classes.set(id, c);
    const map = new Map();
    const sc = (card) => card.school || (d.schoolsData && d.schoolsData.cards[card.id]) || "physical";
    for (const card of c.cards || []) map.set(card.id, { ...card, class: id, school: sc(card) });
    for (const card of c.tokens || []) map.set(card.id, { ...card, class: id, token: true, school: sc(card) });
    d.classCards.set(id, map);
    for (const r of c.relics || []) if (!d.relicMap.has(r.id)) d.relicMap.set(r.id, { ...r, class: r.class || id, legacy: true }); // pre-gear class relics: loadable, never dropped
    await loadClassGear(d, id, get);
    return c;
  };
  d.classObj = (id) => d.classes.get(id) || null;
  d.setClass = (id) => { d.classId = id; d._defCache.clear(); };

  const resolveZone = async (z) => {
    let enemies = z.enemies || [];
    let raids = z.raidFloors || [];
    const [ef, rf] = await Promise.all([
      z.enemiesFile ? get(`zones/${z.enemiesFile}`) : null,
      z.raidFloorsFile ? get(`zones/${z.raidFloorsFile}`) : null,
    ]);
    if (ef) enemies = arr(ef, "enemies");
    if (rf) raids = arr(rf, "raidFloors");
    const defs = {};
    // zone-level summon units first so a roster entry with the same id wins
    for (const [uid, u] of Object.entries(z.units || {})) defs[uid] = { id: uid, tier: "normal", family: u.family || "humanoid", ...u, summonOnly: true };
    for (const e of enemies) defs[e.id] = e;
    for (const rf of raids) for (const e of rf.enemies || []) defs[e.id] = e;
    // raid floors may reference outdoor roster ids instead of repeating them
    for (const rf of raids) for (const ref of rf.enemyRefs || []) if (!defs[ref]) d.errors.push(`${z.id}: enemyRef ${ref} not in roster`);
    return { ...z, enemies, raidFloors: raids, enemyDefs: defs };
  };

  d.loadZone = async (id) => {
    if (d.zones.has(id)) return d.zones.get(id);
    if (d.zoneMissing.has(id)) return null;
    let z = await get(`zones/${id}.json`);
    if (!z) { await new Promise((r) => setTimeout(r, 400)); z = await get(`zones/${id}.json`); } // one retry: a network blip must not poison the zone as "missing" for the whole session
    if (!z) { d.zoneMissing.add(id); return null; }
    const zone = await resolveZone(z);
    d.zones.set(id, zone);
    for (const r of zone.relics || []) d.relicMap.set(r.id, { ...r, zone: r.zone || id, slot: slotOf(r) });
    return zone;
  };
  // Spire shape for a zone: zone JSON `mapProfile` (id or inline object) > map-profiles.json profileByAct[zone act] > default. null = engine FULL_PROFILE.
  d.mapProfile = (zoneId) => {
    const mp = d.mapProfiles;
    if (!mp || !mp.profiles) return null;
    const z = d.zones.get(zoneId), e = d.zoneIndex.find((x) => x.id === zoneId) || {};
    const o = z && z.mapProfile;
    const id = (o && typeof o === "string" && o) || (mp.profileByAct && (mp.profileByAct[String(e.act)] || mp.profileByAct.default));
    const base = mp.profiles[id] || null;
    return base ? { ...base, ...(o && typeof o === "object" ? o : {}), id } : null;
  };
  d.zone = (id) => d.zones.get(id) || null;
  d.zoneAvailable = async (id) => !!(await d.loadZone(id));
  d.zoneEntry = (id) => d.zoneIndex.find((z) => z.id === id) || null;

  d.finalBossDefs = () => {
    const out = {};
    for (const b of d.finalBosses) { out[b.id] = b; for (const m of b.minions || []) out[m.id] = m; }
    for (const s of d.finalSummons) out[s.id] = { ...s, summonOnly: true };
    return out;
  };

  // ---- lookups ----
  d.card = (id, classId) => {
    const cid = classId || d.classId;
    const m = cid && d.classCards.get(cid);
    if (m && m.has(id)) return m.get(id);
    if (d.neutralCards.has(id)) return d.neutralCards.get(id);
    for (const mm of d.classCards.values()) if (mm.has(id)) return mm.get(id);
    return null;
  };
  d.relic = (id) => d.relicMap.get(id) || null;
  d.potion = (id) => d.potions.get(id) || null;
  d.status = (id) => d.keywords.get(id) || null;

  const pool = (cards, rarity) => cards.filter((c) => !c.token && c.rarity !== "basic" && c.type !== "curse" && c.type !== "status" && (!rarity || c.rarity === rarity));
  // Account unlocks: ids in d.locked never roll as rewards / shop stock (talents.lockedCardIds). Empty by default, so the headless sim sees every card.
  d.locked = new Set();
  d.setLocked = (ids) => { d.locked = ids instanceof Set ? ids : new Set(ids || []); };
  const open = (cards) => (d.locked.size ? cards.filter((c) => !d.locked.has(c.id)) : cards);
  d.classPool = (classId) => open(pool([...(d.classCards.get(classId || d.classId) || new Map()).values()]));
  d.neutralPool = () => open(pool([...d.neutralCards.values()]));
  d.talentDefs = new Map();
  d.loadTalents = async (classId) => {
    if (d.talentDefs.has(classId)) return d.talentDefs.get(classId);
    const t = await get(`talents/${classId}.json`);
    const def = t && t.trees ? t : null;
    d.talentDefs.set(classId, def);
    return def;
  };
  d.randomCardPool = (which, rarity) => {
    if (which === "class") return d.classPool().filter((c) => !rarity || c.rarity === rarity);
    if (which === "neutral") return d.neutralPool().filter((c) => !rarity || c.rarity === rarity);
    return d.classPool().concat(d.neutralPool()).filter((c) => !rarity || c.rarity === rarity);
  };
  d.allRelics = () => [...d.relicMap.values()];
  d.allCards = () => {
    const out = [];
    for (const m of d.classCards.values()) out.push(...m.values());
    out.push(...d.neutralCards.values());
    return out;
  };
  return d;
}

// Browser fetcher: data/<rel>?v=BUILD. 404 -> null.
export function browserFetcher(build, base = "data/") {
  return async (rel) => {
    const r = await fetch(`${base}${rel}?v=${build}`);
    if (!r.ok) return null;
    return r.json();
  };
}

export const iconUrl = (slug) => `/assets/icons/${slug || "inv_misc_questionmark"}.jpg`;
export const iconHdUrl = (slug) => `${HD}${slug || "inv_misc_questionmark"}.webp`;
export const slugify = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function spellLink(card) { return card && card.spellId ? `/spell/${slugify(card.name)}-${card.spellId}/` : null; }
export function npcLink(def) { return def && def.npcId ? `/npc/${slugify(def.name)}-${def.npcId}/` : null; }
