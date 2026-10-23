// Spires of Azeroth data validator. Zero dependencies. Runs even when data is missing (falls back to tools/spires/fixtures).
// usage: node tools/spires/validate-data.mjs [--strict] [--data DIR] [--icons DIR] [--no-icons] [--verbose]
// env:   SPIRES_ICON_DIR  icon directory (default: this checkout's assets/icons, else the main wowgoldfarms checkout)
// exit:  1 on any FAIL. WARN becomes FAIL with --strict. "unsupported" shapes (unknown ops/statuses) are WARN by default.
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createData } from "../../spiresofazeroth/js/engine/data.js";
import { OP_NAMES } from "../../spiresofazeroth/js/engine/effects.js";
import { SCHOOLS } from "../../spiresofazeroth/js/engine/immunity.js";
import { STATUS_DEFS } from "../../spiresofazeroth/js/engine/status.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const site = path.join(root, "spiresofazeroth");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
const strict = flag("strict");
const dataDir = path.resolve(opt("data") || path.join(site, "data"));
const fixDir = path.join(here, "fixtures");

const results = [];
const add = (level, area, msg) => results.push({ level, area, msg });
const FAIL = (a, m) => add("FAIL", a, m), WARN = (a, m) => add(strict ? "FAIL" : "WARN", a, m), INFO = (a, m) => add("INFO", a, m);
// event speakers: npc {name, npcId?, displayId?, model?, scale?}. A speaker with no baked body is legal (the scene falls back to the illustrated plate) but is listed.
let npcIndex = null, modelsOnDisk = null;
const npcSlug = (s) => "npc-" + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function npcCheck(label, ev) {
  const n = ev.npc;
  if (n === undefined) return;
  if (!n || typeof n.name !== "string" || !n.name) return FAIL(label, "npc.name missing");
  for (const k of ["npcId", "displayId"]) if (n[k] !== undefined && !(Number.isInteger(n[k]) && n[k] >= 0)) FAIL(label, `npc.${k} must be a non-negative integer`);
  if (n.scale !== undefined && !(n.scale > 0.3 && n.scale <= 1.5)) FAIL(label, "npc.scale out of range 0.3-1.5");
  if (!npcIndex) { try { npcIndex = JSON.parse(await readFile(path.join(site, "assets/models/index.json"), "utf8")).heroes || {}; } catch { npcIndex = {}; } }
  const e = npcIndex[npcSlug(n.model || n.name)];
  if (!e) return INFO(label, `npc ${n.name} has no baked body -> plate fallback`);
  if (modelsOnDisk === null) { try { modelsOnDisk = readdirSync(path.join(site, "assets/models")).some((f) => f.endsWith(".glb")); } catch { modelsOnDisk = false; } if (!modelsOnDisk) INFO("models", "no baked .glb files on disk (public mirror / fresh clone): per-npc model checks skipped"); }
  if (modelsOnDisk && !existsSync(path.join(site, "assets/models", e.glb))) FAIL(label, `npc ${n.name} glb ${e.glb} missing on disk`);
}

async function readJson(p) { try { return JSON.parse((await readFile(p, "utf8")).replace(/^﻿/, "")); } catch (e) { return null; } }
let usedFixtures = false;
const fetchJson = async (rel) => {
  const a = await readJson(path.join(dataDir, rel));
  if (a !== null) return a;
  const b = await readJson(path.join(fixDir, rel));
  if (b !== null) usedFixtures = true;
  return b;
};

async function iconSet() {
  if (flag("no-icons")) return null;
  const cands = [opt("icons"), process.env.SPIRES_ICON_DIR, path.join(root, "assets/icons"), path.resolve(root, "../wowgoldfarms/assets/icons")].filter(Boolean);
  for (const c of cands) {
    if (!existsSync(c)) continue;
    const names = await readdir(c);
    if (names.length > 500) return { dir: c, set: new Set(names.map((n) => n.replace(/\.(jpg|png|webp)$/i, ""))) };
  }
  return null;
}

// ---- walkers ----------------------------------------------------------------------------
function walk(o, fn, trail = "") {
  if (Array.isArray(o)) o.forEach((v, i) => walk(v, fn, `${trail}[${i}]`));
  else if (o && typeof o === "object") {
    fn(o, trail);
    for (const [k, v] of Object.entries(o)) walk(v, fn, `${trail}.${k}`);
  }
}
const arr = (o, k) => (Array.isArray(o) ? o : o && Array.isArray(o[k]) ? o[k] : []);

async function main() {
  const data = createData({ fetchJson });
  await data.load();
  if (!data.classIds.length) data.classIds = ["warrior"];
  const icons = await iconSet();
  if (icons) INFO("icons", `icon dir ${icons.dir} (${icons.set.size} files)`); else WARN("icons", "no icon directory found (set SPIRES_ICON_DIR); icon checks skipped");
  if (usedFixtures) INFO("data", "some files missing in data/: fixtures used as fallback");
  for (const e of data.errors) if (!/zones\/|classes\//.test(e)) WARN("data", e);

  const keywordIds = new Set([...data.keywords.keys()]);
  const knownStatus = (s) => keywordIds.has(s) || STATUS_DEFS[s] || /^(resist_|weapon_imbue_)/.test(s) || ["debuffs", "buffs"].includes(s);
  const opSet = new Set(OP_NAMES);
  const unsupportedOps = {}, unknownStatus = {}, missingIcons = {}, unknownTraits = new Set(), unknownCond = {};
  const CONDS = new Set(["chance", "status_on_target", "resource_at_least", "hp_below_pct", "cards_in_hand", "enemy_intent", "turn_number", "form_is", "stance_is", "seal_is", "aspect_is", "school_last", "target_is_family", "has_relic", "flag_set", "cards_played_this_turn", "cards_played_this_combat", "card_counter", "block_at_least", "enemy_tier"]);

  const scan = (where, obj) => walk(obj, (o) => {
    if (typeof o.op === "string" && !opSet.has(o.op)) (unsupportedOps[o.op] = unsupportedOps[o.op] || new Set()).add(where);
    if (typeof o.op === "string" && (o.op === "apply" || o.op === "remove") && typeof o.status === "string" && !knownStatus(o.status)) (unknownStatus[o.status] = unknownStatus[o.status] || new Set()).add(where);
    if (typeof o.type === "string" && o.type in {} === false && o.hasOwnProperty("type") && (o.if === undefined) && ["chance", "status_on_target", "turn_number", "enemy_intent"].includes(o.type) === false && /^[a-z_]+$/.test(o.type) && !CONDS.has(o.type) && ["cards_above", "class"].includes(o.type) === false && Object.keys(o).length <= 6 && /_(is|at_least|below_pct|last|in_hand|set|played)/.test(o.type)) (unknownCond[o.type] = unknownCond[o.type] || new Set()).add(where);
  });
  const icon = (where, slug) => {
    if (!icons || !slug) return;
    if (!icons.set.has(slug)) (missingIcons[slug] = missingIcons[slug] || new Set()).add(where);
  };

  // ---- keywords / globals ----
  if (!keywordIds.size) FAIL("keywords", "keywords.json has no entries");
  for (const k of data.keywords.values()) icon("keywords", k.icon);
  const relicIds = new Set();
  for (const r of data.globalRelics) { if (relicIds.has(r.id)) FAIL("relics", `duplicate relic id ${r.id}`); relicIds.add(r.id); icon("relics", r.icon); scan("relic:" + r.id, r.triggers); }
  for (const p of data.potions.values()) { icon("potions", p.icon); scan("potion:" + p.id, p.effects); }
  for (const c of data.neutralCards.values()) { icon("neutral", c.icon); scan("card:" + c.id, c.effects); }
  for (const ev of data.eventsCommon) { icon("events", ev.icon); scan("event:" + ev.id, ev.options); await npcCheck("event:" + ev.id, ev); }
  { const hs = (data.healers && data.healers.healers) || []; // act-transition healers (data/healers.json)
    if (!hs.length) FAIL("healers", "data/healers.json missing or empty"); else if (!hs.some((x) => x.id === data.healers.default)) FAIL("healers", `default healer ${data.healers.default} not in list`);
    for (const x of hs) { icon("healers", x.icon); if (!x.id || !x.name || !(x.lines || []).length) FAIL("healers", `healer ${x.id} needs id, name and lines[]`); } }
  if (data.potions.size < 25) WARN("potions", `potion pool ${data.potions.size} < 25`);
  const noteRelicPool = () => { if (relicIds.size < 80) WARN("relics", `relic pool ${relicIds.size} < 80 (before class/zone relics)`); };

  // ---- classes ----
  const allCardIds = new Set([...data.neutralCards.keys()]);
  const classSummary = [];
  for (const cid of data.classIds) {
    const c = await data.loadClass(cid);
    if (!c) { FAIL("class:" + cid, "class file missing"); continue; }
    const cards = new Map(data.classCards.get(cid));
    const ids = new Set([...cards.keys(), ...data.neutralCards.keys()]);
    const real = (c.cards || []);
    if (real.length < 40) FAIL("class:" + cid, `${real.length} cards < 40`);
    const starters = c.starterDeck || [];
    if (starters.length !== 10) FAIL("class:" + cid, `starterDeck has ${starters.length} cards, need 10`);
    for (const s of starters) if (!ids.has(s)) FAIL("class:" + cid, `starter id ${s} not found`);
    for (const card of cards.values()) {
      allCardIds.add(card.id);
      icon("class:" + cid, card.icon);
      scan(`${cid}/${card.id}`, card.effects); scan(`${cid}/${card.id}`, card.apply); scan(`${cid}/${card.id}`, card.upgrade);
    }
    const seen = new Set();
    for (const card of real) { if (seen.has(card.id)) FAIL("class:" + cid, `duplicate card id ${card.id}`); seen.add(card.id); }
    walk(c.cards || [], (o, t) => { if (o.op === "add_card" && o.card && o.card !== "last_exhausted" && !ids.has(o.card)) FAIL("class:" + cid, `add_card ${o.card} does not resolve (${t.slice(0, 40)})`); });
    walk(c.units || {}, (o) => { if (o.icon) icon("units:" + cid, o.icon); });
    for (const r of c.relics || []) { relicIds.add(r.id); icon("class:" + cid, r.icon); scan("relic:" + r.id, r.triggers); }
    icon("class:" + cid, c.icon);
    classSummary.push(`${cid}:${real.length}`);
  }
  INFO("classes", classSummary.join(" "));

  // ---- zones ----
  // ---- zone sounds (data/sounds/zones.json: every zone needs a music list + a day ambience; hub/title present) ----
  const zs = await readJson(path.join(root, "spiresofazeroth/data/sounds/zones.json"));
  if (!zs) WARN("zonesfx", "data/sounds/zones.json missing");
  else {
    const urlOk = (u) => typeof u === "string" && /^\/media\/sounds\/\d+\.(mp3|ogg)$/.test(u);
    for (const entry of data.zoneIndex) {
      const z = zs[entry.id], a = "zonesfx:" + entry.id;
      if (!z) { FAIL(a, "no entry in zones.json"); continue; }
      if (!Array.isArray(z.music) || !z.music.length || !z.music.every(urlOk)) FAIL(a, "music must be a non-empty list of /media/sounds/<fdid>.mp3 urls");
      if (!z.ambience || !urlOk(z.ambience.day)) FAIL(a, "ambience.day missing or malformed");
    }
    for (const k of ["hub", "title"]) if (!zs[k] || !(zs[k].music || []).every(urlOk) || !(zs[k].music || []).length) FAIL("zonesfx:" + k, "missing music");
    const st = zs._stingers || {};
    for (const k of ["victory", "defeat", "loot"]) if (!urlOk(st[k])) FAIL("zonesfx:stinger", k + " missing");
    INFO("zonesfx", `${data.zoneIndex.length} zones + hub + title, stingers ok`);
  }
  const zi = data.zoneIndex;
  if (zi.length < 40) WARN("zones", `zones/index.json lists ${zi.length} entries (expected 40 + moonglade)`);
  const zoneTable = [];
  for (const entry of zi) {
    const zone = await data.loadZone(entry.id);
    if (!zone) { FAIL("zone:" + entry.id, "zone file missing"); continue; }
    const a = "zone:" + entry.id;
    if (!entry.isHub && zone.act !== entry.act) WARN(a, `act ${zone.act} differs from index ${entry.act}`);
    if (zone.continent !== entry.continent) WARN(a, `continent "${zone.continent}" differs from index "${entry.continent}"`);
    const defs = zone.enemyDefs;
    const roster = zone.enemies;
    for (const e of Object.values(defs)) { // immunities: every family is in the table, every entry is a school or a known status
      if (e.family && !(data.immunities.families || {})[e.family]) FAIL(a, `enemy ${e.id}: family "${e.family}" missing from immunities.json`);
      for (const k of [...(e.immune || []), ...Object.keys(e.resist || {})]) if (!SCHOOLS.includes(k) && !data.status(k)) FAIL(a, `enemy ${e.id}: unknown immunity "${k}"`);
    }
    for (const e of Object.values(defs)) {
      icon(a, e.icon);
      for (const t of e.traits || []) if (!/^(pack|armor|revive|breath|giant|caster|stealth|immune:|resist:|summoner|spareable|summoned|bonearmor|orc|crusade|swim|flying|charge|frenzy|slow)/.test(t)) unknownTraits.add(t);
      for (const m of e.moves || []) scan(`${a}/${e.id}`, m.effects);
      scan(`${a}/${e.id}`, e.onDeath); scan(`${a}/${e.id}`, e.phases);
      if (!(e.moves || []).length && !e.summonOnly) WARN(a, `enemy ${e.id} has no moves`);
    }
    const hubOk = !!entry.isHub;
    const tier = (t) => roster.filter((e) => e.tier === t).length;
    const rfBoss = (zone.raidFloors || []).some((f) => f.finalBoss || ((f.encounters || {}).boss || []).length);
    const hasBoss = tier("boss") > 0 || !!zone.finalBoss || rfBoss;
    const nEvents = (zone.events || []).length, nRelics = (zone.relics || []).length;
    const refs = new Set();
    for (const [t, lists] of Object.entries(zone.encounters || {})) for (const enc of Array.isArray(lists) ? lists : []) for (const id of Array.isArray(enc) ? enc : [enc]) refs.add(id);
    for (const f of zone.raidFloors || []) for (const lists of Object.values(f.encounters || {})) for (const enc of Array.isArray(lists) ? lists : []) for (const id of Array.isArray(enc) ? enc : [enc]) refs.add(id);
    const bad = [...refs].filter((id) => !defs[id] && !data.finalBossDefs()[id]);
    if (bad.length) FAIL(a, `encounter enemy ids not defined: ${bad.slice(0, 6).join(", ")}${bad.length > 6 ? ` (+${bad.length - 6})` : ""}`);
    if (!hubOk) {
      if (!hasBoss) FAIL(a, "no boss (roster boss, finalBoss, or raid-floor boss)");
      if (tier("elite") < 2) FAIL(a, `${tier("elite")} elites < 2`);
      if (nEvents < 3) FAIL(a, `${nEvents} events < 3`);
      if (nRelics < 2 || nRelics > 4) FAIL(a, `${nRelics} relics (need 2-4)`);
      if (!zone.zoneMechanic) FAIL(a, "zoneMechanic missing");
      if (!zone.rest) FAIL(a, "rest missing");
      if (zone.finalBoss && !data.finalBosses.some((b) => b.id === zone.finalBoss)) FAIL(a, `finalBoss ${zone.finalBoss} not in bosses-final.json`);
    } else if (!zone.rest && !zone.guaranteedRest) WARN(a, "hub has no rest");
    for (const r of zone.relics || []) { if (relicIds.has(r.id)) WARN(a, `relic id ${r.id} also defined elsewhere (loader merges by id; later definition wins)`); relicIds.add(r.id); icon(a, r.icon); scan(`relic:${r.id}`, r.triggers); }
    for (const ev of zone.events || []) { icon(a, ev.icon); scan(`${a}/event:${ev.id}`, ev.options); await npcCheck(`${a}/event:${ev.id}`, ev); }
    scan(a + "/mechanic", zone.zoneMechanic); scan(a + "/rest", zone.rest);
    icon(a, (zone.zoneMechanic || {}).icon); icon(a, (zone.spire || {}).icon);
    zoneTable.push({ id: entry.id, act: entry.act, enemies: roster.length, el: tier("elite"), boss: tier("boss"), ev: nEvents, rel: nRelics, raid: (zone.raidFloors || []).length });
  }
  noteRelicPool();
  if (relicIds.size < 80) WARN("relics", `total relic pool incl. class+zone: ${relicIds.size}`);
  else INFO("relics", `relic pool ${relicIds.size}`);

  // ---- gear (GEAR_SPEC section 4): 9 sets x 8 pieces + weapon, jewellery slots, legacy map ----
  {
    const SLOTS = new Set(["head", "shoulder", "chest", "wrist", "hands", "waist", "legs", "feet"]);
    const JSLOTS = new Set(["neck", "back", "finger", "trinket", "offHand"]);
    const gearIds = new Set(), nSets = data.gear ? data.gear.sets.size : 0;
    if (nSets !== 9) FAIL("gear", `${nSets} class sets loaded (need 9)`);
    for (const [cid, g] of data.gear ? data.gear.sets : []) {
      const w = `gear:${cid}`;
      if (g.pieces.length !== 8) FAIL(w, `${g.pieces.length} armour pieces (need 8)`);
      const seen = new Set();
      for (const p of g.pieces) { if (!SLOTS.has(p.slot)) FAIL(w, `${p.id} bad slot ${p.slot}`); if (seen.has(p.slot)) FAIL(w, `duplicate slot ${p.slot}`); seen.add(p.slot); if (p.set !== g.set.id) FAIL(w, `${p.id} set mismatch`); }
      if (seen.size !== 8) FAIL(w, "pieces do not cover 8 distinct slots");
      if (!g.weapon || g.weapon.slot !== "mainHand") FAIL(w, "missing mainHand weapon");
      if ((g.set.bonuses || []).map((b) => b.pieces).join() !== "2,4,6,8") FAIL(w, "set bonuses must be at 2/4/6/8");
      for (const p of [...g.pieces, g.weapon].filter(Boolean)) {
        if (gearIds.has(p.id)) FAIL(w, `duplicate gear id ${p.id}`); gearIds.add(p.id);
        icon(w, p.icon); scan("gear:" + p.id, p.triggers);
        if (!p.text) FAIL(w, `${p.id} has no text`); if (!p.displayId) WARN(w, `${p.id} no displayId`);
      }
      for (const b of g.set.bonuses || []) scan(`${w}/bonus${b.pieces}`, b.triggers);
      const st = g.starter || [];   // tier 0 starter outfit (data/gear/starter.json)
      if (!st.length) FAIL(w, "no starter outfit"); if (!st.some((p) => p.slot === "mainHand")) FAIL(w, "starter has no weapon");
      const sseen = new Set();
      for (const p of st) {
        if (!p.id.startsWith("starter-")) FAIL(w, `${p.id} bad starter id`); if (gearIds.has(p.id)) FAIL(w, `duplicate gear id ${p.id}`); gearIds.add(p.id);
        if (sseen.has(p.slot)) FAIL(w, `starter duplicate slot ${p.slot}`); sseen.add(p.slot);
        if (!(SLOTS.has(p.slot) || p.slot === "mainHand" || p.slot === "offHand")) FAIL(w, `${p.id} bad slot ${p.slot}`);
        if (p.tier !== 0 || p.text !== "Starter" || Object.keys(p.triggers || {}).length) FAIL(w, `${p.id} must be tier 0, text Starter, no effects`);
        if (!p.item || !p.name) FAIL(w, `${p.id} missing item/name`); icon(w, p.icon); if (!p.displayId) WARN(w, `${p.id} no displayId`);
      }
    }
    const jw = data.globalRelics.filter((r) => r.slot);
    const bySlot = {}; for (const r of jw) { bySlot[r.slot] = (bySlot[r.slot] || 0) + 1; if (!JSLOTS.has(r.slot)) FAIL("gear", `jewellery ${r.id} bad slot ${r.slot}`); }
    for (const k of JSLOTS) if (!bySlot[k]) FAIL("gear", `no jewellery for slot ${k}`);
    for (const [from, to] of Object.entries((data.gear && data.gear.legacy) || {})) if (!data.relic(to)) FAIL("gear", `legacy-map ${from} -> ${to} does not exist`);
    INFO("gear", `${nSets} sets, ${gearIds.size} gear ids, jewellery ${JSON.stringify(bySlot)}, legacy map ${Object.keys((data.gear && data.gear.legacy) || {}).length}`);
  }

  // ---- final bosses ----
  if (!data.finalBosses.length) WARN("bosses-final", "no final bosses loaded");
  for (const b of data.finalBosses) { icon("final", b.icon); for (const m of b.moves || []) scan("final:" + b.id, m.effects); }
  for (const s of data.finalSummons) icon("final", s.icon);

  // ---- aggregated findings ----
  const fmt = (m) => Object.entries(m).map(([k, v]) => `${k} (${[...v].slice(0, 2).join(", ")}${v.size > 2 ? `, +${v.size - 2}` : ""})`);
  if (Object.keys(unsupportedOps).length) WARN("ops", `unsupported ops: ${fmt(unsupportedOps).join("; ")}`);
  if (Object.keys(unknownStatus).length) WARN("status", `status ids not in keywords.json/engine: ${fmt(unknownStatus).join("; ")}`);
  if (Object.keys(unknownCond).length) WARN("cond", `unknown condition types: ${fmt(unknownCond).join("; ")}`);
  if (unknownTraits.size) INFO("traits", `traits the engine ignores (tolerated): ${[...unknownTraits].slice(0, 30).join(", ")}`);
  if (Object.keys(missingIcons).length) {
    const list = fmt(missingIcons);
    FAIL("icons", `${list.length} icon slugs not on disk: ${list.slice(0, 25).join("; ")}${list.length > 25 ? ` ... (+${list.length - 25})` : ""}`);
  }

  // ---- file size cap ----
  const over = [];
  async function lines(dir) {
    for (const n of await readdir(dir)) {
      if (n === "node_modules" || n === "backups") continue;
      const p = path.join(dir, n);
      const st = await stat(p);
      if (st.isDirectory()) { await lines(p); continue; }
      if (!/\.(js|mjs|html|css)$/.test(n)) continue; // source only; generated .json data is exempt
      const nl = (await readFile(p, "utf8")).split("\n").length;
      if (nl >= 800) over.push(`${path.relative(root, p)} (${nl})`);
    }
  }
  await lines(site);
  for (const f of [path.join(root, "tools/spires/sim.mjs"), path.join(root, "tools/spires/validate-data.mjs")]) {
    const nl = (await readFile(f, "utf8")).split("\n").length;
    if (nl >= 800) over.push(`${path.relative(root, f)} (${nl})`);
  }
  if (over.length) FAIL("size", `files >= 800 lines: ${over.join(", ")}`);

  for (const id of allCardIds) { const c = data.card(id); if (c && !c.school) FAIL("schools", `card ${id} has no school`); else if (c && !SCHOOLS.includes(c.school)) FAIL("schools", `card ${id}: bad school ${c.school}`); }
  for (const [k, v] of Object.entries(data.immunities.types || {})) if (v.same && !data.immunities.families[v.same]) FAIL("immunities", `type ${k}: unknown family ${v.same}`);
  for (const [k, v] of Object.entries(data.immunities.families || {})) for (const i of v.immune || []) if (!SCHOOLS.includes(i) && !data.status(i)) FAIL("immunities", `family ${k}: unknown "${i}"`);
  { // sounds: every card has cast+impact from the library catalogue (tools/spires/sound-map.py)
    const sd = path.join(dataDir, "sounds");
    try {
      const cs = JSON.parse(await readFile(path.join(sd, "cards.json"), "utf8")), ui = JSON.parse(await readFile(path.join(sd, "ui.json"), "utf8"));
      const keyed = new Set(Object.keys(cs).map((k) => k.replace(/^(neutral|status|boss):/, "")));
      for (const id of allCardIds) if (!keyed.has(id)) FAIL("sounds", `card ${id} has no sound entry`);
      let bad = 0;
      for (const [id, m] of Object.entries(cs)) for (const s of ["cast", "impact"]) if (!m[s] || !/^\/media\/sounds\/\d+\.mp3$/.test(m[s].url || "")) { bad++; FAIL("sounds", `${id}.${s} missing/bad url`); }
      for (const k of ["claw", "bite", "steel", "slam", "spit"]) if (!ui.enemy || !ui.enemy[k]) FAIL("sounds", `ui.json enemy.${k} missing`);
      INFO("sounds", `${Object.keys(cs).length} card sound entries, ${bad} bad`);
      const urls = [...new Set([...Object.values(cs).flatMap((m) => [m.cast.url, m.impact.url]), ...Object.values(ui.ui || {}).map((s) => s.url), ...Object.values(ui.enemy || {}).flatMap((e) => [e.cast.url, e.impact.url])])];
      const base = process.env.SPIRES_DEV_URL; // e.g. htt<local path> -> HEAD-sample 50 urls
      if (base) { let ok = 0, n = 0; for (const u of urls.filter((_, j) => j % Math.max(1, Math.floor(urls.length / 50)) === 0).slice(0, 50)) { n++; try { const r = await fetch(base + u, { method: "HEAD" }); if (r.status === 200) ok++; else FAIL("sounds", `HEAD ${u} -> ${r.status}`); } catch (e) { FAIL("sounds", `HEAD ${u} failed`); } } INFO("sounds", `HEAD sample ${ok}/${n} ok of ${urls.length} distinct urls`); }
    } catch (e) { WARN("sounds", "cards.json/ui.json missing or unreadable: " + e.message); }
  }
  // ---- report ----
  const counts = { FAIL: 0, WARN: 0, INFO: 0 };
  for (const r of results) counts[r.level]++;
  const w = Math.max(...results.map((r) => r.area.length), 6);
  console.log("LEVEL  " + "AREA".padEnd(w) + "  MESSAGE");
  const order = { FAIL: 0, WARN: 1, INFO: 2 };
  for (const r of results.slice().sort((a, b) => order[a.level] - order[b.level])) console.log(`${r.level.padEnd(5)}  ${r.area.padEnd(w)}  ${r.msg}`);
  if (flag("verbose")) console.table(zoneTable);
  console.log(`\nzones ${zoneTable.length}/${zi.length} loaded | classes ${data.classIds.length} | cards ${allCardIds.size} | relics ${relicIds.size} | potions ${data.potions.size} | enemies ${zoneTable.reduce((s, z) => s + z.enemies, 0)}`);
  console.log(`SUMMARY  FAIL=${counts.FAIL}  WARN=${counts.WARN}  INFO=${counts.INFO}${strict ? "  (strict)" : ""}`);
  process.exit(counts.FAIL ? 1 : 0);
}
main().catch((e) => { console.error("validator crashed:", e && e.stack); process.exit(2); });
