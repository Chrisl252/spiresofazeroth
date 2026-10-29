// Combat director (v2 integration): turns the engine's synchronous state change + C.fx event list into choreography.
// The engine applies a card / enemy move instantly; the director HOLDS the visible HP / block (a display overlay passed to the HUD)
// and releases each change at the IMPACT INSTANT of the matching animation (fx.play onImpact). One hit = one release.
//   createDirector({ app, C, kit, hud, paint(Cview), legacy(ev), wait(ms) }) ->
//     playerCard(def, evs, pre)   attacks: lunge + fx in parallel; skills/powers/heals: fx at target; deaths after the last impact
//     enemyAct(e, evs, pre)       lunge + enemy recipe, damage released at impact; non-attack intents pulse
//     ambient(evs, pre)           status ticks / heals / deaths outside a card or enemy move
//     snap()                      { uid: {hp, block, st} } for the player and every enemy (call BEFORE the engine step)
//     ensureActors()              adds actors for summons
// Every awaited step goes through safe() (3 s) so a stalled rAF / hidden tab can never deadlock the turn.
import { safe, logOnce } from "./combatKit.js?v=20261029a";
import { isAlive } from "../engine/damage.js?v=20261029a";
import { cardSounds as SND } from "./cardSounds.js?v=20261029a";
import { createPetStage } from "../stage/petStage.js?v=20261029a";
import { createTotemStage } from "../stage/totemStage.js?v=20261029a";

const MELEE_EL = { steel: 110, blood: 110, wind: 90, stone: 40 };            // fx lead (ms) so the recipe impact lands as the lunge connects
const ENEMY_LEAD = { claw: 160, bite: 120, steel: 160, slam: 80, spit: 0 };
const NO_ACTOR = (u) => !u;   // friendly pets and totems are real stage actors
const MAX_HITS = 8;

export function enemyRecipe(e, moveName) {
  const n = String(moveName || "").toLowerCase();
  if (/spit|bolt|shoot|shot|arrow|spray|hex|curse|shadow|frost|fire|spell|venom|web|breath|fling|throw|cast|blast|nova|lightning/.test(n)) return "spit";
  if (/slam|smash|crush|stomp|pound|hammer|fist|quake|charge|ram/.test(n)) return "slam";
  if (/bite|snap|fang|maul|gore|sting|devour|chomp/.test(n)) return "bite";
  if (/claw|rake|swipe|scratch|rend|pounce|talon|lash|gouge/.test(n)) return "claw";
  if (/strike|stab|slash|cleave|shank|blade|sword|axe|cut|shot|bash|smite|backstab/.test(n)) return "steel";
  const fam = e.family, ty = String(e.type || "");
  if (fam === "giant" || fam === "elemental" || fam === "mechanical" || ty === "golem") return "slam";
  if (fam === "beast") return /wolf|boar|spider|snake|bat|crocolisk|hyena|raptor|scorpid/.test(ty) ? "bite" : "claw";
  return "steel";
}


export const MELEE_EXCEPTIONS = /^(cheap[-_ ]shot|kidney[-_ ]shot|raptor[-_ ]strike|mongoose[-_ ]bite|wing[-_ ]clip|counterattack|claw|maul|swipe|rake|shred|bash|pounce|ravage|ferocious[-_ ]bite|rip|sinister[-_ ]strike|hemorrhage|backstab|ambush|eviscerate|gouge|kick|riposte|blade[-_ ]flurry|garrote|rupture|heroic[-_ ]strike|charge|intercept|rend|hamstring|cleave|sunder[-_ ]armor|pummel|shield[-_ ]bash|revenge|mocking[-_ ]blow|slam|overpower|execute|whirlwind|concussion[-_ ]blow|mortal[-_ ]strike|bloodthirst|shield[-_ ]slam|thunder[-_ ]clap)$/i;
export const RANGED_CARD_RE = /shot|shoot|arrow|bow|gun|crossbow|rifle|pistol|snipe|aimed|volley|barrage|sting|trap|throw|thrown|shuriken|grenade|bomb|mortar|boomerang|dart|javelin|wand|bolt|blast|beam|spray|spit/i;
export const RANGED_ICON_RE = /inv_weapon_bow_|inv_weapon_crossbow_|inv_weapon_rifle_|inv_wand_|inv_throwingaxe_|inv_throwingknife_|inv_misc_bomb_|inv_misc_ammo_|inv_battery_/i;

export function isCardRanged(def, classId, el) {
  if (!def) return false;
  if (def.range === "ranged") return true;
  if (def.range === "melee") return false;
  const id = String(def.id || "").toLowerCase().trim();
  const name = String(def.name || "").toLowerCase().trim();
  if (MELEE_EXCEPTIONS.test(id) || MELEE_EXCEPTIONS.test(name)) return false;
  const cls = String(def.class || def.cls || classId || "").toLowerCase();
  if (cls === "hunter") {
    if (def.type === "attack" || def.type === "trap") return true;
  }
  if (RANGED_CARD_RE.test(id) || RANGED_CARD_RE.test(name)) return true;
  const icon = String(def.icon || "").toLowerCase();
  if (RANGED_ICON_RE.test(icon)) return true;
  if (def.school && !["physical", "bleed"].includes(def.school)) return true;
  if (el && MELEE_EL[el] == null) return true;
  return false;
}

export const RANGED_ENEMY_RE = /archer|marksman|hunter|ranger|bowman|rifleman|gunner|cannoneer|headhunter|thrower|sniper|spitter|caster|mage|wizard|warlock|priest|shaman|sorcerer|conjur|necromanc|witch|geomanc|pyromanc|druid|magus|acolyte|seer|oracle|invoker/i;
export const RANGED_MOVE_RE = /shoot|shot|arrow|bow|gun|rifle|throw|thrown|toss|hurl|bolt|spit|spray|blast|curse|shadow|frost|fire|spell|breath|lightning|acid|web|beam|rain|bomb|mortar|grenade|lance|missile|poison|venom|dart|javelin|cannon|flare|discharge|hex|nova|smite|scorch|headhunt/i;
export const MELEE_ENEMY_MOVES = /^(cheap[-_ ]shot|kidney[-_ ]shot|bite|claw|rake|swipe|scratch|rend|pounce|talon|lash|gouge|strike|stab|slash|cleave|shank|blade|sword|axe|cut|bash|backstab|maul|gore|devour|chomp)$/i;

export function isEnemyRanged(e, moveName, rec0) {
  const m = String(moveName || "").toLowerCase().trim();
  if (/cheap[-_ ]shot|kidney[-_ ]shot/i.test(m)) return false;
  if (RANGED_MOVE_RE.test(m)) return true;
  if (rec0 === "spit") return true;
  const nm = String(e && (e.name || e.type || e.family) || "").toLowerCase();
  if (RANGED_ENEMY_RE.test(nm)) {
    if (MELEE_ENEMY_MOVES.test(m)) return false;
    return true;
  }
  return false;
}

export function enemySpec(e, moveName, rec0, isRanged) {
  if (!isRanged) return "enemy:" + rec0;
  const n = String(moveName || "").toLowerCase();
  if (/fire|pyro|flame|scorch|lava|burn/i.test(n)) return "fire:attack";
  if (/frost|ice|chill|blizzard/i.test(n)) return "frost:attack";
  if (/shadow|dark|void|curse|hex|death/i.test(n)) return "shadow:attack";
  if (/lightning|thunder|spark|shock/i.test(n)) return "lightning:attack";
  if (/holy|smite|radiant/i.test(n)) return "holy:attack";
  if (/arcane|magic/i.test(n)) return "arcane:attack";
  if (/spit|acid|venom|web|slime|poison/i.test(n)) return "enemy:spit";
  if (/shoot|shot|arrow|bow|gun|rifle|throw|thrown|axe|dagger|spear|javelin|dart|headhunt|bullet|cannon|mortar|bomb|rock|boulder/i.test(n)) return "steel:attack";
  if (rec0 === "spit") {
    const fam = String((e && (e.family || e.type)) || "").toLowerCase();
    if (/spider|snake|scorpid|worm|wasp|spitter|hydra|ooze|slime/i.test(fam)) return "enemy:spit";
    return "steel:attack";
  }
  return "steel:attack";
}

export function snap(C) {
  const m = {};
  for (const u of [C.player, ...C.enemies]) m[u.uid] = { hp: u.hp, block: u.block, st: { ...u.st } };
  const pt = C.player && C.player.pet; if (pt) m.pet = { hp: pt.hp, block: pt.block || 0, st: {} };   // held so the pet bar drops at the impact
  for (const [slot, t] of Object.entries((C.player && C.player.totems) || {})) {
    if (t) m[t.uid] = { hp: t.hp, block: t.block || 0, st: { ...t.st } };
  }
  return m;
}

export function createDirector(o) {
  const { app, C, kit, hud } = o;
  const A = kit.actors, F = kit.fx;
  const disp = new Map(); // uid -> { hp, block }
  const noActor = (u) => NO_ACTOR(u) || (u === "pet" && !(A && A.get("pet"))) || (String(u).startsWith("totem") && !(A && A.get(u)));
  const region = o.hud && o.hud.el && o.hud.el.querySelector ? o.hud.el.querySelector(".sp-actors-region") : null;
  const pets = A && A.addAlly && region ? createPetStage({ A, region, C }) : { sync() {}, dispose() {} };
  const totems = A && A.addAlly ? createTotemStage({ A, region, C }) : { sync() {}, dispose() {} };
  const unit = (uid) => (uid === "player" ? C.player : C.enemies.find((e) => e.uid === uid));
  const gone = (uid) => noActor(uid) || !(A && A.get(uid));
  const paintNow = () => {
    o.paint(viewC());
    const d = disp.get("pet");
    pets.sync(d ? { hp: d.hp } : null);
    const dTot = {};
    for (const [slot, t] of Object.entries((C.player && C.player.totems) || {})) {
      if (t && disp.has(t.uid)) dTot[t.uid] = disp.get(t.uid);
    }
    totems.sync(dTot);
  };

  function viewC() {
    if (!disp.size) return C;
    const V = Object.create(C);
    const wrap = (u) => {
      const d = disp.get(u.uid); if (!d) return u;
      const w = Object.create(u); w.hp = d.hp; w.block = d.block;
      if (d.hp > 0) { w.dead = false; w.down = false; }
      return w;
    };
    V.player = wrap(C.player); V.enemies = C.enemies.map(wrap);
    if (C.player && C.player.totems) {
      const tots = {};
      let changed = false;
      for (const [k, t] of Object.entries(C.player.totems)) {
        if (!t) { tots[k] = null; continue; }
        const d = disp.get(t.uid);
        if (d) { tots[k] = Object.assign(Object.create(t), { hp: d.hp, block: d.block }); changed = true; }
        else tots[k] = t;
      }
      if (changed) V.player = Object.assign(Object.create(V.player), { totems: tots });
    }
    return V;
  }
  function begin(pre) { disp.clear(); for (const [uid, v] of Object.entries(pre || {})) disp.set(uid, { hp: v.hp, block: v.block }); }
  // every beat ends here: a summon whose own beat threw or timed out (so ambientEv never ran) still gets its model + plate lane
  function end() { disp.clear(); if (A && A.addEnemy && C.enemies.some((e) => isAlive(e) && !A.get(e.uid))) ensureActors(); paintNow(); }

  function pos(uid, part = "chest") {
    const a = A && A.anchor(uid);
    if (a && a[part]) return a[part];
    const hp = hud.heroPoint();
    if (noActor(uid) || uid === "player") return { x: hp.x, y: hp.y - (part === "top" ? 330 : part === "feet" ? 0 : 170) };
    const el = hud.enemyPlateEl(uid);
    if (!el) return { x: hp.x + 600, y: hp.y - 170 };
    const r = el.getBoundingClientRect(), s = app.stage.toStage(r.left + r.width / 2, r.bottom);
    return { x: s.x, y: part === "feet" ? s.y : s.y - 170 };
  }

  // ---- visible reactions (always at an impact instant) --------------------------------------------------------
  function dispDamage(ev) { const d = disp.get(ev.uid); if (!d) return; d.hp = Math.max(0, d.hp - (ev.amount || 0)); d.block = Math.max(0, d.block - (ev.blocked || 0)); }
  function showDamage(ev) {
    if (!F) { o.legacy(ev); return; }
    const p = pos(ev.uid);
    if (ev.amount > 0) { F.numbers.damage(p, ev.amount); if (!gone(ev.uid)) A.hit(ev.uid, { amount: ev.amount }); }
    else if (ev.blocked > 0) { F.numbers.blocked(p); if (!gone(ev.uid)) A.block(ev.uid); }
  }
  function ambientEv(ev) {
    const d = disp.get(ev.uid);
    if (ev.t === "dmg") { dispDamage(ev); showDamage(ev); }
    else if (ev.t === "heal") { if (d) d.hp += ev.amount; if (F) F.numbers.heal(pos(ev.uid), ev.amount); else o.legacy(ev); }
    else if (ev.t === "block") { SND.ui("blockGain"); if (d) d.block += ev.amount; if (F) { F.numbers.block(pos(ev.uid), ev.amount); if (!gone(ev.uid)) A.block(ev.uid); } else o.legacy(ev); }
    else if (ev.t === "miss") { if (F) F.numbers.text(pos(ev.uid), ev.text || "Miss", ev.kind || "grey"); else o.legacy(ev); }
    else if (ev.t === "summon") ensureActors();
    else if (ev.t === "revive") { // Undying: it was killed and rose at 25% HP; say so loudly or the kill looks like missing damage
      const u = unit(ev.uid); if (d && u) d.hp = u.hp;
      if (A && !gone(ev.uid)) A.statusPulse(ev.uid, "#b05cff");
      if (F) F.numbers.text(pos(ev.uid, "top"), "Rises again!", "gold", { size: 44 });
    }
  }
  function statusFx(pre, uids) {
    if (!A) return;
    for (const uid of uids) {
      const u = unit(uid), p = pre && pre[uid]; if (!u || !p || gone(uid)) continue;
      const fresh = Object.entries(u.st).filter(([k, v]) => !(k in p.st) || (typeof v === "number" && v > p.st[k])).map(([k]) => k);
      if (!fresh.length) continue;
      const def = app.data.status(fresh[0]) || {};
      A.statusPulse(uid, def.kind === "debuff" ? "#b05cff" : "#ffd66a");
      if (F) F.numbers.text(pos(uid, "top"), def.name || fresh[0], "grey", { size: 34 });
    }
  }

  // ---- summons ---------------------------------------------------------------------------------------------------------------
  function ensureActors() {
    if (!A || !A.addEnemy) return;
    pets.sync(null);
    totems.sync();
    const live = C.enemies;
    const alive = live.filter(isAlive);
    live.forEach((e) => { if (isAlive(e) && !A.get(e.uid)) A.addEnemy({ uid: e.uid, id: e.id, name: e.name, tier: e.tier, icon: e.icon }, alive.indexOf(e), alive.length); });
    if (A.layoutEnemies) A.layoutEnemies(live.map((e) => ({ uid: e.uid, alive: isAlive(e) }))); // every model re-spreads over its own plate column
  }

  // ---- hits ------------------------------------------------------------------------------------------------------------------------
  // hits: dmg events caused by `src` against other units. spec: card def or "enemy:claw". Resolves after the last impact + lunge return.
  async function strike({ src, hits, spec, lead, gap, isRanged = false, onFirst }) {
    const isAoe = spec && typeof spec === "object" && (spec.target === "all_enemies" || spec.target === "all");
    const byT = new Map();
    for (const h of hits) {
      if (!isAoe && byT.size >= 1 && !byT.has(h.uid)) continue; // Single-target strike NEVER hits more than 1 target
      if (!byT.has(h.uid)) byT.set(h.uid, []);
      byT.get(h.uid).push(h);
    }
    for (const [t, list] of byT) if (list.length > MAX_HITS) { // merge the overflow into the last visible hit
      const tail = list.splice(MAX_HITS - 1); const m = { ...tail[0] };
      for (const x of tail.slice(1)) { m.amount += x.amount; m.blocked = (m.blocked || 0) + (x.blocked || 0); }
      list.push(m);
    }
    const targets = [...byT.keys()];
    let first = true;
    const tgtUid = targets.find((t) => !gone(t)) || targets[0];
    const lungeP = A && A.get(src) && tgtUid ? safe(
      isRanged ? (A.shoot ? A.shoot(src, tgtUid, { gap, ranged: true }) : (A.cast ? A.cast(src, tgtUid, { gap, ranged: true }) : Promise.resolve())) : A.lunge(src, tgtUid, { gap }),
      `attack:${src}->${tgtUid}`,
      2500
    ) : Promise.resolve();
    const jobs = [lungeP];
    targets.forEach((t, ti) => byT.get(t).forEach((h, hi) => {
      const delay = lead + ti * 60 + hi * 130;
      jobs.push(o.wait(delay).then(() => new Promise((res) => {
        let done = false;
        const impact = () => {
          if (done) return; done = true;
          if (first) { first = false; if (onFirst) onFirst(); }
          dispDamage(h); showDamage(h); paintNow(); res();
        };
        if (!F) { impact(); return; }
        const amount = Math.max(h.amount || 0, h.blocked || 0, 3);
        const opts = { fromUid: src, toUid: t, amount, onImpact: impact };
        if (spec && typeof spec === "object") opts.classId = C.classId;
        F.play(spec, opts).then(impact, impact);
      })));
    }));
    await safe(Promise.all(jobs), "strike", 4500);
    if (first && onFirst) onFirst(); // nothing impacted (timeout): still release the side effects
  }

  // after the killing blow has landed (HP bar at 0), the Undying enemy rises: popup + bar back to 25%
  async function revives(evs) {
    const rv = evs.filter((e) => e.t === "revive");
    if (!rv.length) return;
    await o.wait(260);
    rv.forEach(ambientEv); paintNow();
    await o.wait(520);
  }

  async function deaths(evs) {
    if (!A) return;
    const dead = evs.filter((e) => (e.t === "die" || e.t === "spare") && !noActor(e.uid) && e.uid !== "player" && A.get(e.uid));
    const seen = new Set();
    const ps = [];
    dead.forEach((e, i) => {
      if (seen.has(e.uid)) return; seen.add(e.uid);
      const isSpare = e.t === "spare";
      if (!isSpare) SND.ui("enemyDeath");
      ps.push(o.wait(i * 80).then(() => A.death(e.uid, { fade: isSpare })));
    });
    if (ps.length) await safe(Promise.all(ps), "death", 3500);
  }

  // ---- public ----------------------------------------------------------------------------------------------------------------------
  async function playerCard(def, evs, pre) {
    begin(pre);
    if (C.classId === "druid" && A && A.setHeroForm) A.setHeroForm(C.player.form);
    const kind = F ? F.kindFor(def) : "skill", el = F ? F.elementFor(def, C.classId) : "steel";
    const isAoe = def.target === "all_enemies" || def.target === "all";
    let hits = evs.filter((e) => e.t === "dmg" && !e.status && e.from === "player" && e.uid !== "player" && !noActor(e.uid));
    const tgt = C.lastTarget && C.lastTarget.uid && (def.target === "enemy" || def.target === undefined) && def.type !== "power" ? C.lastTarget.uid : null;
    let cardHits = hits;
    let procHits = [];
    if (!isAoe && tgt) {
      cardHits = hits.filter((h) => h.uid === tgt);
      procHits = hits.filter((h) => h.uid !== tgt);
    }
    const rest = evs.filter((e) => !cardHits.includes(e) && !procHits.includes(e) && ["dmg", "heal", "block", "miss", "summon"].includes(e.t));
    if (!cardHits.length && kind === "attack" && tgt && !evs.some((e) => e.t === "fizzle")) cardHits = [{ t: "dmg", uid: tgt, amount: 0, blocked: 0, synthetic: true }];
    const sideFx = () => { SND.impact(def); rest.forEach(ambientEv); paintNow(); statusFx(pre, ["player", ...C.enemies.map((e) => e.uid)]); };
    SND.cast(def); SND.ui("cardPlay");
    try {
      if (cardHits.length) {
        const isRanged = isCardRanged(def, C.classId, el);
        const lead = isRanged ? 0 : (MELEE_EL[el] != null ? MELEE_EL[el] : 0);
        await strike({ src: "player", hits: cardHits, spec: def, lead, gap: isRanged ? 1400 : 190, isRanged, onFirst: sideFx });
      } else {
        const to = kind !== "power" && tgt && !gone(tgt) ? tgt : "player";
        const spec = kind === "heal" || (kind === "skill" && rest.some((e) => e.t === "heal") && !rest.some((e) => e.t === "block")) ? `${el}:heal` : def;
        let fired = false;
        const impact = () => { if (fired) return; fired = true; sideFx(); };
        const gestColor = kind === "heal" ? "#70e080" : (kind === "power" ? "#ffd24a" : "#78b4ff");
        if (A && !gone("player") && A.castGesture) A.castGesture("player", { color: gestColor });
        if (F) {
          const opts = { fromUid: "player", toUid: to, amount: 6, onImpact: impact, classId: C.classId, cardId: def.id };
          if (kind === "power") opts.key = def.id;
          if (to !== "player") opts.to = pos(to, "chest");
          await safe(F.play(spec, opts), "skill", 3000);
        } else await o.wait(250);
        impact();
        if (kind === "skill" && !gone("player") && rest.some((e) => e.t === "block")) A.block("player");
      }
      if (procHits && procHits.length) {
        for (const ph of procHits) {
          ambientEv(ph);
          paintNow();
          if (F && !gone(ph.uid)) {
            const pOpts = { fromUid: "player", toUid: ph.uid, amount: ph.amount || 4, classId: C.classId };
            await safe(F.play(`${ph.school || "arcane"}:attack`, pOpts), "proc", 1200);
          }
        }
      }
      await revives(evs);
      await deaths(evs);
    } finally { end(); }
  }

  async function enemyAct(e, evs, pre, moveName) {
    begin(pre);
    const hits = evs.filter((x) => x.t === "dmg" && !x.status && x.from === e.uid && x.uid !== e.uid && !noActor(x.uid));
    const rest = evs.filter((x) => !hits.includes(x) && ["dmg", "heal", "block", "miss", "summon"].includes(x.t));
    const rec0 = enemyRecipe(e, moveName);
    const sideFx = () => { if (hits.length) SND.enemy(rec0, "impact", moveName); rest.forEach(ambientEv); paintNow(); statusFx(pre, ["player", ...C.enemies.map((x) => x.uid)]); };
    if (hits.length) SND.enemy(rec0, "cast", moveName);
    try {
      if (hits.length) {
        const isRanged = isEnemyRanged(e, moveName, rec0);
        const spec = enemySpec(e, moveName, rec0, isRanged);
        const lead = isRanged ? 0 : (ENEMY_LEAD[rec0] || 0);
        await strike({ src: e.uid, hits, spec, lead, gap: isRanged ? 1400 : 190, isRanged, onFirst: sideFx });
      } else {
        const blocked = rest.some((x) => x.t === "block" && x.uid === e.uid);
        if (A && !gone(e.uid)) {
          if (blocked) A.block(e.uid);
          else if (A.castGesture) A.castGesture(e.uid, { color: "#ffd66a" });
          else A.statusPulse(e.uid, "#ffd66a");
        }
        await o.wait(320);
        sideFx();
        await o.wait(260);
      }
      await revives(evs);
      await deaths(evs);
    } finally { end(); }
  }

  async function ambient(evs, pre) {
    // the hunter pet's Claw (end of the player's turn): the pet steps in and swings; damage is released at its impact
    const clawed = evs.some((e) => e.t === "petmove") && !!(A && A.get("pet") && !(A.get("pet").dead));
    const ph = clawed ? evs.filter((e) => e.t === "dmg" && !e.status && e.from === "pet" && e.uid !== "pet" && e.uid !== "player" && !noActor(e.uid)) : [];
    const act = evs.filter((e) => ["dmg", "heal", "block", "miss", "summon", "revive", "die", "spare"].includes(e.t) && !ph.includes(e));
    if (!act.length && !ph.length) return;
    begin(pre);
    try {
      ensureActors();
      if (ph.length) { SND.enemy("claw", "cast"); await strike({ src: "pet", hits: ph, spec: "enemy:claw", lead: ENEMY_LEAD.claw, gap: 190, onFirst: () => SND.enemy("claw", "impact") }); }
      act.forEach(ambientEv); paintNow();
      if (act.some((e) => e.t === "dmg" && e.amount > 0)) await o.wait(380);
      await deaths(evs);
    } finally { end(); }
  }

  pets.sync(null);
  totems.sync();
  return { playerCard, enemyAct, ambient, petStage: pets, totemStage: totems, snap: () => snap(C), beginHold: (pre) => { begin(pre); paintNow(); }, ensureActors, pos, viewC, logOnce };
}
