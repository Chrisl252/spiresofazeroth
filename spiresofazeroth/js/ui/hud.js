// Combat HUD on the stage: top bar, enemy plates (+ intent, status pips), hero floor plate, energy orb, pile buttons, End Turn, turn banner.
// createHud(hostEl, app, opts) -> { update(C, view), enemyPlateEl(uid), heroEl, setTurn(who), pileAnchors(), destroy() }
//   opts: { stage, anchorFor?(uid) -> {x,y} (HEAD-TOP point of the actor), onEndTurn(), onPile(kind), onPotion(i), onPotionAim(i, pot, el, ev), onEnemyClick(uid),
//           onSpare(uid), onMap(), onSettings() }
//   view: { potSel, busy, canEnd, hint, spare?(enemy) -> bool }
// Enemy plates carry data-uid so the hand can drop cards on them; the actors agent plugs real anchors into opts.anchorFor.
import { h, tip, esc, cap } from "./dom.js";
import { gearStrip } from "./gearStrip.js";
import { intentInfo } from "../engine/intents.js";
import { isAlive } from "../engine/damage.js";
import { immuneList } from "../engine/immunity.js";
import { heroLabels } from "../engine/character.js";
const HD = new URL("../../assets/icons-hd/", import.meta.url).href; // 256px upscaled icons, relative so dev + deploy both resolve

const ico = (slug, cls = "") => {
  const i = document.createElement("img");
  i.className = `sp-i ${cls}`; i.alt = ""; i.draggable = false; i.src = `${HD}${slug || "inv_misc_questionmark"}.webp`;
  i.addEventListener("error", () => { i.onerror = null; i.src = `/assets/icons/${slug || "inv_misc_questionmark"}.jpg`; i.addEventListener("error", () => { i.src = "/assets/icons/inv_misc_questionmark.jpg"; }, { once: true }); }, { once: true });
  return i;
};
const ORB = { rage: "#e0302a", arcane_charges: "#3f9bff", combo: "#ffe040", pet: "#ff9528", form: "#cfc2ff", totems: "#2f86ff", soul_shards: "#a05cff", seal: "#ffc45a", energy: "#ffe040", mana: "#3f9bff", focus: "#ff9528" };
const Q = { basic: "#9d9d9d", common: "#ffffff", uncommon: "#1eff00", rare: "#0070dd", epic: "#a335ee", legendary: "#ff8000" };
const LANES = [1180, 1420, 1660];
const pct = (e) => `${Math.max(0, Math.min(100, (e.hp / e.maxHp) * 100))}%`;

function hpBar(cls = "") {
  const fill = h("i", { class: "sp-hp__fill" }), ghost = h("i", { class: "sp-hp__ghost" }), txt = h("span", { class: "sp-hp__txt" });
  const el = h("div", { class: `sp-hp ${cls}`, role: "progressbar" }, ghost, fill, txt);
  // loss > 0 -> StS2 damage preview: the pale ghost segment shows where the bar WOULD land
  el.set = (e, loss = 0) => {
    fill.style.width = pct(e);
    const l = Math.max(0, Math.min(loss, e.hp));
    ghost.style.width = l > 0 ? pct({ hp: e.hp - l, maxHp: e.maxHp }) : pct(e);
    el.classList.toggle("is-aim", l > 0);
    txt.textContent = `${Math.max(0, e.hp)} / ${e.maxHp}`;
    el.setAttribute("aria-valuenow", e.hp); el.setAttribute("aria-valuemax", e.maxHp);
  };
  return el;
}
// classic class-power bar (real UI-StatusBar texture, tinted by power type: rage red, mana blue, energy yellow, focus orange)
function powerBar() {
  const fill = h("i", { class: "sp-pw__fill" }), txt = h("span", { class: "sp-pw__txt" });
  const el = h("div", { class: "sp-pw sp-pw--mana", role: "progressbar", "aria-label": "Power" }, fill, txt);
  el.set = (cur, max, type) => { const m = Math.max(1, max); el.className = `sp-pw sp-pw--${type}`; fill.style.width = `${Math.max(0, Math.min(100, (cur / m) * 100))}%`; txt.textContent = `${cur} / ${max}`; el.setAttribute("aria-valuenow", cur); el.setAttribute("aria-valuemax", max); };
  return el;
}
// which power a class shows under its HP: a numeric class resource when it has one, else the card energy (hunter = focus, others mana)
const POWER_BY_RES = { rage: "rage", combo: "energy", arcane_charges: "mana", soul_shards: "mana" };
function powerOf(cls, p) {
  const r = cls.resource || {};
  if (POWER_BY_RES[r.id] && r.max > 1) return { cur: (p.res && p.res[r.id]) || 0, max: r.max, type: POWER_BY_RES[r.id] };
  return { cur: p.energy, max: Math.max(r.energyPerTurn || 3, p.energy), type: cls.id === "hunter" ? "focus" : "mana" };
}
// classic nameplate: real Nameplate-Border art over the status-bar HP (name sits above, numbers in the bar)
const nameplate = (hp, cls = "") => h("div", { class: `sp-np ${cls}` }, hp, h("i", { class: "sp-np__art" }));
function badge(kind, slug) { const b = h("span", { class: `sp-badge sp-badge--${kind}` }, h("span", { class: "sp-badge__n" }, "0")); b.n = b.firstChild; if (slug) b.prepend(ico(slug)); return b; }

export function createHud(host, app, o = {}) {
  const stage = o.stage || app.stage;
  const data = app.data;
  const size = () => stage.size;
  const root = h("div", { class: "sp-hud2" });
  host.append(root);

  // ---------- top bar ----------
  const portrait = h("span", { class: "sp-tb__portrait" });
  const heroName = h("b", { class: "sp-tb__name" }), heroSub = h("span", { class: "sp-tb__sub" });
  const topHp = hpBar("sp-hp--hero"), topPw = powerBar(), heroLvl = h("b", { class: "sp-pf__lvl" }, "1"), topBlock = badge("block", "ability_warrior_defensivestance");
  const gold = h("span", { class: "sp-tb__gold" }, ico("inv_misc_coin_01", "sp-tb__coin"), h("b", {}, "0"));
  const relicStrip = h("div", { class: "sp-relics2", "aria-label": "Relics" }), potBelt = h("div", { class: "sp-potions2", "aria-label": "Potions" });
  const zoneLbl = h("span", { class: "sp-tb__zone" }), turnLbl = h("span", { class: "sp-tb__turn" });
  const btn = (label, fn) => h("button", { class: "sp-wowbtn sp-wowbtn--tb", type: "button", onClick: fn }, label);
  const deckBtn = btn("Deck", () => app.showDeck()), mapBtn = btn("Map", () => (o.onMap ? o.onMap() : null)), setBtn = btn("Settings", () => app.showMenu());
  const fsBtn = h("button", { class: "sp-wowbtn sp-wowbtn--tb sp-wowbtn--fs", type: "button", title: "Fullscreen (F)", "aria-label": "Toggle fullscreen", onClick: () => stage.toggleFullscreen && stage.toggleFullscreen() }, "⛶");
  const top = h("header", { class: "sp-topbar" },
    h("div", { class: "sp-tb__hero" }, h("div", { class: "sp-pf" }, h("div", { class: "sp-pf__c" }, portrait, h("div", { class: "sp-tb__hp" }, topHp), topPw, h("i", { class: "sp-pf__art" }), heroName, heroLvl), topBlock), h("div", { class: "sp-tb__id" }, heroSub)),
    gold, relicStrip, potBelt,
    h("div", { class: "sp-tb__right" }, h("div", { class: "sp-tb__where" }, zoneLbl, turnLbl), deckBtn, mapBtn, setBtn, fsBtn));

  // ---------- actors region + plates ----------
  const region = h("div", { class: "sp-actors-region" });
  const heroRegion = h("div", { class: "sp-hero-region", "data-uid": "player" });
  const heroPlate = h("div", { class: "sp-hplate" }), heroHp = hpBar("sp-hp--friend"), heroBlock = badge("block", "ability_warrior_defensivestance"), heroPips = h("div", { class: "sp-pips" });
  heroPlate.append(h("div", { class: "sp-hplate__row" }, heroBlock, nameplate(heroHp, "sp-np--friend")), heroPips);
  region.append(heroRegion, heroPlate);
  const plates = new Map();

  // ---------- energy orb ----------
  const orbNum = h("b", { class: "sp-orb__n" }, "0"), orbMax = h("span", { class: "sp-orb__max" }), orbLbl = h("span", { class: "sp-orb__lbl" }, "Energy");
  const orb = h("div", { class: "sp-orb", role: "status", "aria-label": "Energy" }, h("i", { class: "sp-orb__swirl" }), h("i", { class: "sp-orb__gloss" }), orbNum, orbMax, orbLbl);
  const resRow = h("div", { class: "sp-resrow" });
  const energyBox = h("div", { class: "sp-energy2" }, orb, resRow);

  // ---------- piles + end turn ----------
  const pile = (kind, label) => {
    const n = h("b", { class: "sp-pile__n" }, "0");
    const b = h("button", { class: `sp-pile sp-pile--${kind}`, type: "button", "aria-label": `${label} pile`, onClick: () => o.onPile && o.onPile(kind) }, h("i", { class: "sp-pile__back" }), n, h("span", { class: "sp-pile__lbl" }, label));
    b.n = n; return b;
  };
  const drawPile = pile("draw", "Draw"), discPile = pile("discard", "Discard"), exhPile = pile("exhaust", "Exhaust");
  const endBtn = h("button", { class: "sp-wowbtn sp-wowbtn--end", type: "button", "data-autofocus": "", onClick: () => o.onEndTurn && o.onEndTurn() }, "End Turn");
  const hint = h("div", { class: "sp-hint2", "aria-live": "polite" });
  const banner = h("div", { class: "sp-turnbanner", "aria-hidden": "true" });
  root.append(top, region, energyBox, drawPile, discPile, exhPile, endBtn, hint, banner);

  // ---------- anchors ----------
  function anchorFor(uid, idx, n) {
    if (o.anchorFor) { const a = o.anchorFor(uid, idx, n); if (a) return a; }
    const port = stage.portrait, g = stage.groundY;
    const x = port ? Math.min(960, Math.max(400, 680 + (idx - (n - 1) / 2) * 270)) : LANES[idx] || LANES[LANES.length - 1] + (idx - 2) * 200;
    return { x, y: g - 340 };
  }
  function heroPoint() { const g = stage.groundY; return { x: stage.portrait ? 190 : 480, y: g }; }

  // ---------- intent ----------
  function intentView(C, e) {
    const wrap = h("div", { class: "sp-intent2" });
    if (!isAlive(e)) return wrap;
    if (e.st.veiled) { wrap.append(h("span", { class: "sp-int__unk" }, "?")); tip(wrap, "<b>Veiled</b><br>You cannot see this enemy's next move."); return wrap; }
    const info = intentInfo(C, e);
    if (!info) { wrap.append(h("span", { class: "sp-int__unk" }, "?")); return wrap; }
    if (info.dazed) { // risen undead: knocked out for a turn, no attack queued
      wrap.classList.add("is-dazed"); wrap.append(h("span", { class: "sp-int__zzz" }, h("i", {}, "Z"), h("i", {}, "z"), h("i", {}, "z")));
      wrap.setAttribute("aria-label", `${e.name} is dazed`); tip(wrap, "<b>Dazed</b><br>It just rose again and skips its next action."); return wrap;
    }
    const parts = [];
    if (info.dmg > 0) {
      const multi = info.hits > 1;
      wrap.classList.add("is-atk");
      // just the ability icon + ONE number to its right (one text node, rebuilt with the whole intent: no stale values)
      const pl = C.player, lethal = info.dmg >= (pl.hp || 0) + (pl.block || 0), boosted = !!(pl.st && pl.st.vulnerable > 0);
      wrap.append(ico("inv_sword_04", "sp-int__ico"), h("b", { class: "sp-int__n" + (lethal || boosted ? " is-hot" : "") }, multi ? `${info.perHit}x${info.hits}` : String(info.dmg)));
      parts.push(`Attacks for ${info.dmg}${multi ? ` (${info.perHit} × ${info.hits})` : ""}${info.aoe ? " to everything" : ""}.`);
    }
    const chip = (cls, inner, text) => { wrap.append(h("span", { class: `sp-int__chip ${cls}` }, inner)); parts.push(text); };
    if (info.block) chip("is-def", ico("ability_warrior_defensivestance"), `Gains ${info.block} Block.`);
    if (info.summon) chip("is-sum", ico("spell_shadow_raisedead"), "Summons an ally.");
    const buffs = info.statuses.filter((s) => s.self), debuffs = info.statuses.filter((s) => !s.self);
    const nm = (s) => (data.status(s.id) ? data.status(s.id).name : cap(s.id));
    // the actual status icon (Curse, Weak, Strength...) with a small up/down badge, never a bare arrow
    const stIco = (s, up) => h("span", { class: "sp-int__st" }, ico((data.status(s.id) || {}).icon), h("i", { class: `sp-int__badge ${up ? "up" : "down"}` }, up ? "▲" : "▼"));
    if (buffs.length) chip("is-buff", stIco(buffs[0], true), `Buffs itself: ${buffs.map(nm).join(", ")}.`);
    if (debuffs.length) chip("is-debuff", stIco(debuffs[0], false), `Afflicts you: ${debuffs.map(nm).join(", ")}.`);
    if (info.cast) { wrap.classList.add("is-cast"); wrap.append(ico("spell_nature_timestop", "sp-int__ico"), h("b", { class: "sp-int__n" }, `${info.cast.prog + 1}/${info.cast.total}`)); parts.push("Casting. Interruptible with stun, silence or interrupt effects."); }
    if (!wrap.childNodes.length) wrap.append(h("span", { class: "sp-int__unk" }, "?"));
    wrap.setAttribute("aria-label", `${e.name} intends ${info.name}`);
    tip(wrap, `<b>${esc(info.name || "Unknown")}</b><br>${esc(parts.join(" "))}`);
    return wrap;
  }

  // ---------- status pips ----------
  function pips(el, st) {
    el.replaceChildren();
    for (const [id, v] of Object.entries(st || {})) {
      if (!v) continue;
      const kw = data.status(id) || { name: cap(id), text: "", icon: "inv_misc_questionmark", kind: "buff" };
      const p = h("span", { class: `sp-pip sp-pip--${kw.kind || "buff"}`, tabindex: "0", "aria-label": `${kw.name} ${v}` }, ico(kw.icon), typeof v === "number" && v !== 1 ? h("b", {}, v) : null);
      tip(p, `<b>${esc(kw.name)}</b> ${typeof v === "number" ? v : ""}<br>${esc(kw.text)}`);
      el.append(p);
    }
  }

  // ---------- immunity row (classic WoW: undead ignore Bleed, fire elementals ignore Fire) ----------
  function immuneRow(el, e) {
    const undying = Array.isArray(e.traits) && e.traits.includes("revive") && !e.revived && e.tier !== "boss" && e.tier !== "raid"; // mirrors damage.canRevive
    const key = (e.immune || []).join(",") + "|" + Object.entries(e.resist || {}).map(([k, v]) => k + v).join(",") + "|" + undying;
    if (el._imKey === key) return;
    el._imKey = key; el.replaceChildren();
    if (undying) { const s = h("span", { class: "sp-imm sp-imm--undying", tabindex: "0", "aria-label": "Undying" }, ico("spell_shadow_raisedead")); tip(s, "<b>Undying</b><br>The first time it dies, it rises again at 25% HP."); el.append(s); }
    const list = immuneList(e, data);
    for (const x of list) { const s = h("span", { class: "sp-imm", tabindex: "0", "aria-label": "Immune: " + x.name }, ico(x.icon)); tip(s, `<b>Immune: ${esc(x.name)}</b>`); el.append(s); }
    const rs = Object.entries(e.resist || {}).filter(([, v]) => v < 1);
    for (const [k] of rs) { const nm = cap(k), s = h("span", { class: "sp-imm sp-imm--resist", tabindex: "0" }, ico(((data.schoolsData || {}).icons || {})[k])); tip(s, `<b>Resists ${esc(nm)}</b><br>Takes half damage from ${esc(nm)}.`); el.append(s); }
    el.hidden = !el.childNodes.length;
  }

  // ---------- StS2 damage previews ----------
  function applyPreview(el) {
    const P = el.parts, pv = el._pv;
    if (!pv) { P.pv.hidden = true; return; }
    const txt = pv.immune ? "IMMUNE" : pv.resist && !pv.hpLoss ? `~${pv.total}` : `-${pv.hpLoss}`;
    P.pv.textContent = txt;
    P.pv.classList.toggle("is-immune", !!pv.immune);
    P.pv.hidden = false;
  }
  const C_of = (uid) => (lastEnemies || []).find((e) => e.uid === uid);
  function showPreview(list) {
    const byUid = new Map((list || []).map((x) => [x.uid, x]));
    for (const [uid, el] of plates) {
      const p = byUid.get(uid) || null;
      el._pv = p; el._pvHp = p ? p.hpLoss : 0;
      applyPreview(el);
      el.classList.toggle("is-lethal", !!(p && p.lethal));
      const e = C_of(uid);
      if (e) el.parts.hp.set(e, el._pvHp);
    }
  }
  function clearPreview() { showPreview([]); }

  // ---------- enemy plates ----------
  function mkPlate(e) {
    const hp = hpBar("sp-hp--enemy"), np = nameplate(hp), blk = badge("block", "ability_warrior_defensivestance"), nm = h("div", { class: "sp-ep__name" }), pp = h("div", { class: "sp-pips" }), intent = h("div", { class: "sp-ep__intent" }), spare = h("span", { class: "sp-ep__spare", hidden: true }), im = h("div", { class: "sp-immune" });
    const hit = h("div", { class: "sp-ehit" });
    const pv = h("b", { class: "sp-ep__pv", hidden: true }); // StS2 damage-preview bubble on the HP bar
    // StS2 order: intent floats ABOVE the head, the actor stands in the hit area, name + HP bar + status pips sit UNDER the feet
    const top = h("div", { class: "sp-ep sp-ep--top" }, intent), plate = h("div", { class: "sp-ep sp-ep--under" }, nm, h("div", { class: "sp-ep__row" }, blk, np, pv), pp, im, spare);
    const el = h("div", { class: "sp-eplate", "data-uid": e.uid, onClick: () => o.onEnemyClick && o.onEnemyClick(e.uid) }, top, hit, plate);
    el.parts = { hp, blk, nm, pp, im, intent, spare, plate, hit, pv };
    return el;
  }
  const INTENT_H = 64;
  function placePlate(el, a, w) {
    const p = el.parts, feet = a.feet != null ? a.feet : stage.groundY, head = Math.min(a.y, feet - 120);
    el.style.setProperty("--pw", `${w}px`); el.style.setProperty("--pk", w < 150 ? (w / 150).toFixed(3) : "1");
    el.style.left = `${a.x - w / 2}px`; el.style.top = `${head - INTENT_H}px`; el.style.bottom = "auto";
    p.hit.style.height = `${feet - head}px`;
  }
  const dispName = (e, list) => { const same = list.filter((x) => x.name === e.name); return same.length > 1 ? `${e.name} ${String.fromCharCode(65 + same.indexOf(e))}` : e.name; };
  let lastEnemies = [], lastLiveSig = "";
  function reposition() {
    const live = lastEnemies.filter(isAlive), n = live.length; // dead plates are hidden and keep no column
    const pts = live.map((e, i) => ({ e, a: { ...anchorFor(e.uid, i, n) } }));
    // never let two plates overlap: width shrinks to the lane spacing, then plates are nudged apart
    const xs = pts.map((q) => q.a.x).sort((a, b) => a - b);
    let gap = Infinity; for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i] - xs[i - 1]);
    const w = Math.max(n > 4 ? 96 : 150, Math.min(stage.portrait ? 280 : 240, gap - 8)); // 5+ enemies: plates shrink to the lane spacing (and scale their text) instead of being shoved off their models
    const order = pts.slice().sort((p, q) => p.a.x - q.a.x);
    for (let i = 1; i < order.length; i++) if (order[i].a.x - order[i - 1].a.x < w + 6) order[i].a.x = order[i - 1].a.x + w + 6;
    const maxX = size().w - w / 2 - 8, over = order.length ? order[order.length - 1].a.x - maxX : 0;
    if (over > 0) order.forEach((q) => { q.a.x -= over; });
    pts.forEach(({ e, a }) => { const el = plates.get(e.uid); if (el) placePlate(el, a, w); });
    const hp = heroPoint();
    heroRegion.style.cssText = `left:${hp.x - 170}px; top:${stage.groundY - 400}px; width:340px; height:400px;`;
    heroPlate.style.cssText = `left:${hp.x - 170}px; top:${stage.groundY + 14}px;`;
  }
  if (stage.onResize) stage.onResize(reposition);

  let relicKey = "";
  function update(C, view = {}) {
    const run = app.run, p = C.player, cls = C.cls || {};
    // top bar
    if (!portrait.firstChild || portrait.dataset.cls !== cls.id) { portrait.replaceChildren(ico(cls.icon || "inv_misc_questionmark")); portrait.dataset.cls = cls.id || ""; portrait.style.setProperty("--cc", cls.color || "#c9a24b"); }
    { const lb = heroLabels(run, cls.name || "Hero"); heroName.textContent = lb.name; heroSub.textContent = `${lb.tag ? lb.tag + " · " : ""}Act ${run.act} · Floor ${Math.max(0, run.floor + 1)}`; }
    topHp.set(p); heroHp.set(p); { const pw = powerOf(cls, p); topPw.set(pw.cur, pw.max, pw.type); } heroLvl.textContent = run.act;
    for (const b of [topBlock, heroBlock]) { b.n.textContent = p.block; b.classList.toggle("is-on", p.block > 0); }
    gold.lastChild.textContent = run.gold;
    const zone = data.zone(run.zoneId); zoneLbl.textContent = zone ? zone.name : ""; turnLbl.textContent = `Turn ${C.turn}`;
    const rk = run.relics.join(",") + "|" + Object.values(run.gear || {}).join(",");
    if (rk !== relicKey) { relicKey = rk; relicStrip.replaceChildren(gearStrip(app, { compact: true, badge: false })); } // gear strip (16 sockets + set badge)
    potBelt.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const id = C.potions[i], pot = id && data.potion(id);
      const slot = h("button", { class: `sp-pot2 ${pot ? "" : "is-empty"} ${view.potSel === i ? "is-sel" : ""}`, type: "button", "aria-label": pot ? `Use ${pot.name}` : "Potion slot (empty)", "aria-disabled": pot ? "false" : "true", onClick: () => pot && o.onPotion && o.onPotion(i, pot) }, pot ? ico(pot.icon) : null);
      if (pot && o.onPotionAim) slot.addEventListener("pointerdown", (e) => o.onPotionAim(i, pot, slot, e)); // press = targeting arrow (combat.js potAim)
      tip(slot, pot ? `<b>${esc(pot.name)}</b><br>${esc(pot.text)}` : "Potion slot (empty)"); // 3 fixed slots, always visible (empty = classic slot art, see css/gear.css)
      potBelt.append(slot);
    }
    pips(heroPips, p.st);

    // enemies
    const live = C.enemies; lastEnemies = live;
    if (o.layoutEnemies) { const sig = live.map((e) => e.uid + (isAlive(e) ? "+" : "-")).join(","); if (sig !== lastLiveSig) { lastLiveSig = sig; o.layoutEnemies(live.map((e) => ({ uid: e.uid, alive: isAlive(e) }))); } } // death / summon / revive: models re-spread over the same living-only lanes the plates use
    const seen = new Set();
    live.forEach((e, i) => {
      seen.add(e.uid);
      let el = plates.get(e.uid);
      if (!el) { el = mkPlate(e); plates.set(e.uid, el); region.append(el); }
      const P = el.parts, alive = isAlive(e);
      el.classList.toggle("dead", !alive);
      el.classList.toggle("is-elite", e.tier === "elite"); el.classList.toggle("is-boss", e.tier === "boss");
      el.classList.toggle("targetable", !!(view.potSel !== null && view.potSel !== undefined && alive));
      P.nm.textContent = dispName(e, live);
      applyPreview(el, e); // StS2 preview ghosts live across update ticks until re-aimed or cleared
      P.hp.set(e, el._pvHp || 0);
      el.classList.toggle("is-lethal", !!(el._pv && el._pv.lethal));
      P.blk.n.textContent = e.block; P.blk.classList.toggle("is-on", e.block > 0);
      pips(P.pp, e.st); immuneRow(P.im, e);
      P.intent.replaceChildren(intentView(C, e));
      const sp = alive && view.spare && view.spare(e);
      P.spare.hidden = !sp;
      if (sp && !P.spare.firstChild) { P.spare.append(h("button", { class: "sp-wowbtn sp-wowbtn--mini", type: "button", onClick: (ev) => { ev.stopPropagation(); o.onSpare && o.onSpare(e.uid); } }, "Spare")); }
      el.setAttribute("aria-label", `${e.name}, ${e.hp} of ${e.maxHp} health`);
    });
    for (const [uid, el] of plates) if (!seen.has(uid)) { el.remove(); plates.delete(uid); }
    reposition();

    // energy orb
    const r = cls.resource || {}, col = ORB[r.id] || cls.color || "#ffd45a";
    energyBox.style.setProperty("--oc", col);
    const per = r.energyPerTurn || 3;
    const prev = orbNum.textContent, now = String(p.energy);
    orbNum.textContent = now; orbMax.textContent = `/${Math.max(per, p.energy)}`;
    if (prev !== now) { orb.classList.remove("punch"); void orb.offsetWidth; orb.classList.add("punch"); }
    orb.classList.toggle("is-empty", p.energy <= 0);
    if (orb._tip !== per) { orb._tip = per; orb.tabIndex = 0; if (!orb._tipOn) { orb._tipOn = 1; tip(orb, `<b>Energy</b><br>Spent to play cards. Refills to ${per} at the start of each of your turns.`); } }
    resRow.replaceChildren();
    const list = [r].concat(cls.extraResources || []).filter((x) => x && x.id && x.name && x.id !== "pet");
    for (const x of list) { const rs = h("span", { class: "sp-res2", tabindex: "0" }, ico(x.icon), h("b", {}, p.res[x.id] || 0), x.max > 0 ? `/${x.max}` : ""); tip(rs, `<b>${esc(x.name)}</b><br>${esc(x.tip || x.rules || "")}`); resRow.append(rs); }
    for (const k of ["form", "stance", "aspect", "seal"]) if (p[k]) resRow.append(h("span", { class: "sp-res2 sp-res2--tag" }, `${cap(k)}: ${cap(p[k])}`));
    if (p.pet && !p.pet.down) resRow.append(h("span", { class: "sp-res2 sp-res2--tag" }, ico(p.pet.icon), `Pet ${p.pet.hp}/${p.pet.maxHp}`));
    for (const [slot, t] of Object.entries(p.totems || {})) if (t && t.hp > 0) resRow.append(h("span", { class: "sp-res2 sp-res2--tag" }, ico(t.icon), `${cap(slot)} ${t.hp}`));

    // piles
    drawPile.n.textContent = C.pile.draw.length; discPile.n.textContent = C.pile.discard.length; exhPile.n.textContent = C.pile.exhaust.length;
    exhPile.hidden = C.pile.exhaust.length === 0;
    endBtn.disabled = !!view.busy || !!view.lock || C.phase !== "player" || C.pending.length > 0 || !!C.result;
    endBtn.textContent = C.phase === "player" && !view.busy ? "End Turn" : "Enemy Turn";
    hint.textContent = view.hint || ""; hint.classList.toggle("on", !!view.hint);
  }

  let curTurn = null, bannerT = 0;
  function setTurn(who) {
    if (who === curTurn) return; curTurn = who;
    root.dataset.turn = who;
    banner.replaceChildren(h("i", { class: "sp-turnbanner__rule" }), h("b", {}, who === "player" ? "Your Turn" : who === "enemy" ? "Enemy Turn" : cap(who)), h("i", { class: "sp-turnbanner__rule" }));
    banner.className = `sp-turnbanner is-${who}`; void banner.offsetWidth; banner.classList.add("go");
    clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove("go"), 1700);
  }

  return {
    el: root, heroEl: heroRegion, update, setTurn, showPreview, clearPreview, enemyPlateEl: (uid) => plates.get(uid) || null, orbEl: orb, heroPlateEl: heroPlate,
    pileAnchors() { const { w, h: hh } = size(); return { draw: { x: 110, y: hh - 120 }, discard: { x: w - 110, y: hh - 120 } }; },
    heroPoint, destroy() { root.remove(); },
  };
}
