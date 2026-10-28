// Combat screen (v2, stage-native). Mounts the HUD (hud.js) and the hand (hand.js) on the 1920x1080 stage and drives the engine exactly as v1 did.
// v2 integration: 3D actors + VFX are mounted by combatKit.js, choreography (impact instants) lives in combatDirector.js; this file sequences turns.
import { sp, funnel, encKey } from "../analytics.js?v=20261028e";
import { h, tip, esc, floatText, toast, sleep, modal, fill } from "./dom.js?v=20261028e";
import {
  playCard, canPlayWhy, cardNeedsTarget, endPlayerTurn, enemyPhase, finishRound, usePotion, resolvePending, livingEnemies, canSpare, spareEnemy,
} from "../engine/combat.js?v=20261028e";
import { cardCost } from "../engine/deck.js?v=20261028e";
import { beginCombat, afterCombat } from "../engine/run.js?v=20261028e";
import { gearLevel } from "../engine/gear.js?v=20261028e";
import { isAlive } from "../engine/damage.js?v=20261028e";
import { cardUselessOn } from "../engine/immunity.js?v=20261028e";
import { previewCardVs, cardAimsDamage } from "../engine/preview.js?v=20261028e";
import { cardEl, refreshCard, keywordLines, classColor } from "./card.js?v=20261028e";
import { createHud } from "./hud.js?v=20261028e";
import { createHand } from "./hand.js?v=20261028e";
import { getKit, clearStage, watchLeave, safe, speedMul, applySettings } from "./combatKit.js?v=20261028e";
import { createDirector } from "./combatDirector.js?v=20261028e";
import { cardSounds } from "./cardSounds.js?v=20261028e";
import { BUILD } from "../version.js?v=20261028e";
import { coopStart, createCoopLink } from "./coopCombat.js?v=20261028e";

export const stageNative = true;

export async function render(app) {
  const { run, data, stage } = app;
  if (!run || !run.pending || !run.pending.encounter) {
    if (run) run.screen = "map";
    return app.go("map");
  }
  if (!app.C || app.C.run !== run) {
    // co-op: a second go() while this one waits for the partner supersedes it (main.js drops the stale result). The stale render must not
    // build a fight: it would claim the pack and leave a second link listening to the partner's moves (host stuck "waiting", 2026-10-28)
    const tok = (app._combatTok = {});
    const S0 = app.coop && app.coop.active() ? await coopStart(app, run) : null; // co-op: waits for the partner, then both heroes' combats share one pack
    if (app._combatTok !== tok || app.screen !== "combat") return document.createElement("div");
    app.coopS = S0;
    app.C = S0 ? S0.Cs[S0.mySeat] : beginCombat(run, data, { interactive: true });
  }
  const C = app.C;
  const S = app.coopS && app.coopS.Cs[app.coopS.mySeat] === C ? app.coopS : null;
  let CL = null; // co-op link (ui/coopCombat.js), set below when S
  const st = { pot: null, busy: false, booting: true, done: false, picks: new Set(), lastPlayed: null, prev: [] };
  let K = null, D = null; // kit (actors + fx) and director, set once the kit is loaded
  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms) / speedMul(app)));
  C.fx.length = 0;
  stage.setBackdrop(run.zoneId || "default");
  const root = h("section", { class: "sp-combat-stage" });
  const pendingHost = h("div", { class: "sp-pending-host" });
  const unitEl = (uid) => root.querySelector(`[data-uid="${uid}"]`);
  const color = () => classColor(C, data);
  const playerTurn = () => C.phase === "player" && !st.busy && !st.booting && !C.result && !C.pending.length && (!CL || CL.canAct());

  const hud = createHud(root, app, {
    stage, onEndTurn: () => endTurnFlow(),
    anchorFor: (uid, idx, n) => { const a = K && K.actors && K.actors.get(uid); if (!a || !a.baseXY) { const L = K && K.actors && K.actors.lanes && idx != null && K.actors.lanes.enemy(idx, n); return L ? { x: L.x, y: L.y - 340, feet: L.y } : null; } const b = a.baseXY(); return { x: b.x, y: b.y - a.baseH(), feet: b.y }; },
    layoutEnemies: (list) => { if (K && K.actors && K.actors.layoutEnemies) K.actors.layoutEnemies(list); }, // lane position, not the lunge-tweened one
    onPile: (kind) => showPile(kind),
    onPotion: (i, pot) => potClick(i, pot), onPotionAim: (i, pot, el, ev) => potAim(i, pot, el, ev),
    onEnemyClick: (uid) => enemyClick(C.enemies.find((e) => e.uid === uid)),
    onSpare: (uid) => spareFlow(uid),
    onMap: () => import(`./map.js?v=${BUILD}`).then((m) => m.openMapOverlay(app)), // the real spire map, read-only, over the live fight
    onSettings: () => app.showMenu(),
  });
  const handCard = (inst) => cardEl(inst.def, { C, inst, cost: cardCost(C, inst), data, tag: "div", tips: false, color: color() });
  const hand = createHand(root, {
    stage, render: handCard,
    refresh: (inst, el) => refreshCard(el, inst.def, { C, cost: cardCost(C, inst), data }),
    canPlay: (inst) => playerTurn() && !canPlayWhy(C, inst),
    needsTarget: (inst) => cardNeedsTarget(C, inst), // every enemy-targeted card aims, even with one enemy left (StS)
    // playable except that the previous card's fx is still running: the hand lets the drag start and plays it when unlocked
    canQueue: (inst) => C.phase === "player" && !st.booting && !st.done && !C.result && !C.pending.length && !C.endTurnRequested && (!CL || CL.canAct()) && !canPlayWhy(C, inst),
    defaultTarget: (inst) => { const l = livingEnemies(C); return l.length === 1 && cardNeedsTarget(C, inst) ? l[0].uid : null; }, // keyboard Enter only
    immuneOn: (inst, uid) => cardUselessOn(inst.def, C.enemies.find((e) => e.uid === uid), (data.schoolsData || {}).statusSchools),
    keywords: (inst) => keywordLines(inst.def, data),
    color: () => color(),
    onDeny: (inst) => { const why = playerTurn() ? canPlayWhy(C, inst) : null; if (why) toast(why); },
    heroAnchor: () => { const a = K && K.actors && K.actors.anchor("player"); if (a) return a.chest; const p = hud.heroPoint(); return { x: p.x, y: p.y - 190 }; },
    drawAnchor: () => hud.pileAnchors().draw, discardAnchor: () => hud.pileAnchors().discard,
    onPlay: (inst, target) => doPlay(inst, target),
    onAim: (inst, targetUid) => aimPreview(inst, targetUid), // StS2 damage ghosts on the enemy HP bars
  });
  root.append(pendingHost);

  app._combat = {
    C,
    st,
    hand,
    hud,
    playerTurn,
    doPlay,
    endTurn: () => endTurnFlow(),
    usePotion: (i, targetUid) => usePotionFlow(i, targetUid),
    potAim: (i, pot, el, ev) => potAim(i, pot, el, ev),
    spare: (uid) => spareFlow(uid),
    showPile: (kind) => showPile(kind),
    aimPreview: (inst, targetUid) => aimPreview(inst, targetUid),
    clearAimPreview: () => hud.clearPreview(),
    update,
  };

  const instOf = (uid) => C.pile.hand.find((c) => c.uid === uid);
  const sortedDefs = (list) => list.slice().sort((a, b) => (a.def.name > b.def.name ? 1 : -1));

  function showPile(kind) {
    const list = sortedDefs(C.pile[kind]);
    const g = h("div", { class: "spc-grid" });
    for (const c of list) g.append(cardEl(c.def, { C, inst: c, tag: "div", mini: true, data, color: color() }));
    modal(`${kind[0].toUpperCase()}${kind.slice(1)} pile (${list.length})`, list.length ? g : h("p", {}, "Empty."));
  }

  function renderPending() {
    const pd = C.pending[0];
    if (!pd) { pendingHost.replaceChildren(); return; }
    const need = pd.count;
    const src = pd.type === "scry" ? C.pile.draw.slice(-need) : C.pile.hand;
    const row = h("div", { class: "spc-grid sp-pending__row" });
    for (const inst of src) row.append(cardEl(inst.def, { C, inst, tag: "div", mini: true, data, color: color(), cls: st.picks.has(inst.uid) ? "is-sel" : "", onClick: () => { if (st.picks.has(inst.uid)) st.picks.delete(inst.uid); else if (st.picks.size < need) st.picks.add(inst.uid); update(); } }));
    const ok = h("button", { class: "sp-wowbtn sp-wowbtn--sm", type: "button", disabled: pd.type !== "scry" && st.picks.size < Math.min(need, src.length), onClick: () => { if (CL) CL.local({ k: "pending", uids: [...st.picks] }); else resolvePending(C, [...st.picks]); st.picks.clear(); update(); } }, "Confirm");
    pendingHost.replaceChildren(h("div", { class: "sp-pending" }, h("h3", {}, pd.type === "scry" ? `Scry: choose up to ${need} to discard` : `Choose ${need} card(s) to ${pd.type}`), row, ok));
  }

  function syncHand() {
    const now = C.pile.hand, nowIds = new Set(now.map((c) => c.uid));
    const removed = st.prev.filter((c) => !nowIds.has(c.uid));
    const exh = removed.filter((c) => C.pile.exhaust.includes(c));
    if (exh.length) hand.exhaust(exh.map((c) => c.uid));
    const disc = removed.filter((c) => !exh.includes(c) && c.uid !== st.lastPlayed && C.pile.discard.includes(c));
    if (disc.length) hand.discard(disc.map((c) => c.uid));
    const prevIds = new Set(st.prev.map((c) => c.uid)), fresh = now.filter((c) => !prevIds.has(c.uid));
    if (st.lastPlayed && nowIds.has(st.lastPlayed)) hand.bounce(st.lastPlayed);
    hand.set(now);
    if (fresh.length && K && K.fx && !app.reduced()) drawTrail(Math.min(fresh.length, 6));
    st.prev = now.slice(); st.lastPlayed = null;
    hand.lock(!playerTurn());
  }
  function drawTrail(n) { // little golden motes leaving the draw pile as the cards fly out
    const p = hud.pileAnchors().draw, P = K.fx.particles;
    if (P) for (let i = 0; i < n; i++) K.fx.at(i * 0.04, () => P.burst({ x: p.x, y: p.y - 30, count: 5, cell: "dot", color: "#ffe9a8", speed: [120, 380], angle: [-1.9, -0.9], size: [8, 14], life: [0.25, 0.5], drag: 2 }));
  }

  function view() {
    const hint = C.pending.length || C.result ? "" : st.pot !== null ? "Drag the arrow onto an enemy to throw the potion" : C.phase === "player" ? "" : "Enemies act...";
    return { potSel: st.pot, busy: st.busy && C.phase !== "player", lock: st.busy || st.booting, hint, spare: (e) => canSpare(C, e) };
  }
  const paint = (cv) => { hud.update(cv || (D ? D.viewC() : C), view()); if (CL) CL.paintPanel(); };

  // ---------- StS2 damage previews (hover / drag aim) ----------
  let aimKey = "";
  function aimPreview(inst, targetUid) {
    const key = (inst ? inst.uid : "") + ":" + (targetUid || "");
    if (key === aimKey) return;
    aimKey = key;
    if (!inst || !playerTurn() || !cardAimsDamage(C, inst)) return hud.clearPreview();
    const targets = targetUid ? C.enemies.filter((e) => e.uid === targetUid) : livingEnemies(C);
    hud.showPreview(targets.filter(isAlive).map((e) => ({ uid: e.uid, ...previewCardVs(C, inst, e) })).filter(Boolean));
  }

  function update() {
    if (st.done) return;
    if (C.phase !== "player" && aimKey) { aimKey = ""; hud.clearPreview(); } // ghosts never outlive the player turn
    syncHand();
    paint();
    renderPending();
    if (!K || !K.fx || !D) legacyFx();
    else C.fx.length = 0;
    if (C.result && !st.busy && !st.booting) conclude();
  }

  // legacy numbers on the plate host (only when the actors/fx kit is unavailable)
  function legacy(ev) {
    const host = ev.uid && unitEl(ev.uid);
    if (!host || app.reduced()) return;
    if (ev.t === "dmg") { floatText(host, `-${ev.amount}`, "dmg"); if (ev.amount > 0) { host.classList.add("sp-shake"); setTimeout(() => host.classList.remove("sp-shake"), 320); } else if (ev.blocked) floatText(host, "Blocked", "blk"); }
    else if (ev.t === "heal") floatText(host, `+${ev.amount}`, "heal");
    else if (ev.t === "block") floatText(host, `+${ev.amount}`, "blk");
    else if (ev.t === "miss") floatText(host, ev.text || "Miss", ev.text ? "gold" : "miss");
  }
  function legacyFx() { for (const ev of C.fx.splice(0)) legacy(ev); }

  // Run an engine mutation with choreography: snapshot -> engine step (sync) -> director holds the visible HP until each impact.
  function snapBefore() { C.fx.length = 0; return D ? D.snap() : null; }
  async function settle(evs, pre, ms = 0) {
    if (D && pre) await safe(D.ambient(evs, pre), "ambient", 5000);
    else for (const ev of evs) legacy(ev);
    if (ms) await wait(ms);
  }

  function doPlay(inst, targetUid) {
    if (st.busy || st.booting) return false;
    const pre = snapBefore();
    const r = CL ? CL.local({ k: "play", uid: inst.uid, target: targetUid || null }) || { ok: false, why: "Wait for your turn." } : playCard(C, inst.uid, targetUid || undefined);
    if (!r.ok) { toast(r.why || "Cannot play that."); update(); return false; }
    if (C.drawBlocked) { toast(C.drawBlocked === "hand" ? "Your hand is full (10 cards)." : "No more card draw this turn."); C.drawBlocked = null; } // player report 10-24: "unable to draw more than 8"
    if (C.classId === "druid" && K && K.actors && K.actors.setHeroForm) {
      K.actors.setHeroForm(C.player.form);
    }
    const evs = C.fx.splice(0);
    st.lastPlayed = inst.uid; st.busy = true;
    if (D) D.beginHold(pre);
    syncHand(); paint(); renderPending();
    (async () => {
      try {
        if (D) await safe(D.playerCard(inst.def, evs, pre), "card", 6000);
        else for (const ev of evs) legacy(ev);
      } catch (e) { console.warn("[spires] card choreography", e && e.message); }
      st.busy = false;
      update();
      if (r.endTurn && !C.result) endTurnFlow();
    })();
    return true;
  }
  function enemyClick(e) {
    if (st.busy || !e || !isAlive(e) || st.pot === null) return;
    const i = st.pot; st.pot = null;
    usePotionFlow(i, e.uid);
  }
  function potClick(i, pot) {
    if (st.busy || st.booting || C.phase !== "player") return;
    if (hand.aiming()) return; // an enemy potion is being aimed (potAim); the click that ends its press is not a second use
    hand.cancel();
    if (pot.target === "enemy" && livingEnemies(C).length > 1) return; // aimed with the arrow from the press, never from the click
    usePotionFlow(i);
  }
  // Potions aim like cards: press the slot and the targeting arrow runs from it to the pointer; release (or click) on an enemy to throw it.
  function potAim(i, pot, el, ev) {
    if (st.busy || st.booting || C.phase !== "player" || ev.button > 0) return;
    if (!(pot.target === "enemy" && livingEnemies(C).length > 1)) return;
    if (hand.aiming()) return; // the document-level press handler already resolved this press
    ev.preventDefault();
    const ok = hand.aimFrom(el, { pointerId: ev.pointerId, color: "#b48cff",
      onDrop: (uid) => { st.pot = null; const en = C.enemies.find((x) => x.uid === uid); if (en && isAlive(en)) usePotionFlow(i, uid); else update(); },
      onCancel: () => { st.pot = null; update(); } });
    if (ok) { st.pot = i; update(); }
  }
  async function spareFlow(uid) {
    const e = C.enemies.find((x) => x.uid === uid);
    if (st.busy || st.booting || !e || !canSpare(C, e)) return;
    st.busy = true;
    const pre = snapBefore();
    if (CL) CL.local({ k: "spare", uid }); else spareEnemy(C, uid);
    const evs = C.fx.splice(0);
    toast(`You spare ${e.name}.`);
    if (D) D.beginHold(pre);
    await settle(evs, pre);
    st.busy = false; update();
  }
  async function usePotionFlow(i, uid) {
    st.busy = true;
    const pre = snapBefore();
    if (CL) CL.local({ k: "potion", idx: i, target: uid || null }); else usePotion(C, i, uid);
    const evs = C.fx.splice(0);
    if (D) D.beginHold(pre);
    paint();
    await settle(evs, pre);
    st.busy = false; update();
  }

  async function endTurnFlow() {
    if (st.busy || st.booting || C.phase !== "player" || C.pending.length || C.result) return;
    if (CL) { hand.cancel(); return CL.endTurn(); } // co-op: the round's enemy phase runs once BOTH heroes have ended (ui/coopCombat.js)
    st.busy = true; st.pot = null; hand.cancel();
    try {
      let pre = snapBefore();
      endPlayerTurn(C);
      let evs = C.fx.splice(0);
      hud.setTurn("enemy");
      syncHand(); paint();
      await settle(evs, pre);
      if (!C.result) {
        if (K && K.fx) K.fx.banner("Enemy turn");
        await wait(app.reduced() ? 0 : 700);
        const gen = enemyPhase(C);
        for (;;) {
          pre = snapBefore();
          const n = gen.next();
          evs = C.fx.splice(0);
          if (n.done) break;
          const act = evs.find((x) => x.t === "act");
          if (D) { D.beginHold(pre); await safe(D.enemyAct(n.value, evs, pre, act && act.name), "enemy", 7000); } else { for (const ev of evs) legacy(ev); paint(); await wait(480); }
          if (C.result) break;
          await wait(140);
        }
        if (!C.result) {
          pre = snapBefore();
          finishRound(C);
          evs = C.fx.splice(0);
          await settle(evs, pre);
        }
      }
    } catch (e) { console.warn("[spires] turn flow", e && e.message); }
    st.busy = false;
    if (!C.result) { hud.setTurn("player"); if (K && K.fx) K.fx.banner("Your turn"); }
    update();
  }

  async function conclude() {
    if (st.done) return;
    st.done = true;
    hand.lock(true);
    const lost = C.result === "lose" || (C.player && C.player.hp <= 0);
    if (lost && K && K.actors && K.actors.get("player")) await safe(K.actors.death("player"), "hero-death", 2500);
    if (C.result === "retreat" && K && K.fx) K.fx.banner("You hearth away");
    if (CL) { CL.destroy(); CL = null; app.coopS = null; }
    const encKeyNow = encKey(run.pending && run.pending.encounter);
    afterCombat(run, data, C);
    sp("fight_end", { enc: encKeyNow, result: C.result === "win" ? "win" : C.result === "retreat" ? "retreat" : "lose", act: run.act, floor: run.floor + 1, hp: Math.max(0, Math.round(run.hp)), turns: C.turn | 0 });
    if (C.result === "win" && run.stats.fights === 1) funnel("first_fight_won");
    if (run.act >= 2) funnel("act" + Math.min(run.act, 3));
    app.C = null;
    app.save();
    const won = run.screen !== "end";
    if (won) { await wait(app.reduced() ? 0 : 900); cleanup(); app.route(); return; } // victory: corpse stays visible on ground before transition to reward
    root.append(h("div", { class: "sp-result" }, h("h2", {}, won ? "Victory" : "Defeat"),
      h("button", { class: "sp-wowbtn sp-wowbtn--lg", type: "button", "data-autofocus": "", onClick: () => { cleanup(); app.route(); } }, "Continue")));
    const b = root.querySelector("[data-autofocus]"); if (b) b.focus();
  }

  // ---- stage wiring: actors, targeting rings, hover, settings ----------------------------------------------------
  let mo = null;
  function bindTargeting() {
    const sync = () => root.querySelectorAll(".sp-eplate").forEach((el) => {
      const red = el.classList.contains("is-target"), on = !el.classList.contains("dead") && (el.classList.contains("targetable") || red);
      const key = on ? (red ? 2 : 1) : 0; // card aimed at it = red ring, potion-targetable = gold
      if (el._hl !== key) { el._hl = key; K.actors.highlight(el.dataset.uid, on, red); }
    });
    mo = new MutationObserver(sync); mo.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const hv = (on) => (ev) => { const el = ev.target.closest && ev.target.closest(".sp-eplate"); if (el && !el.classList.contains("dead") && K.actors.get(el.dataset.uid)) K.actors.hover(el.dataset.uid, on); };
    root.addEventListener("pointerover", hv(true)); root.addEventListener("pointerout", hv(false));
  }
  const safe0 = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  async function boot() {
    try {
      K = await safe0(getKit(app), 9000);
      if (K && K.actors && K.fx) {
        applySettings(app, K); clearStage(K);
        K.actors.setHero({ classId: run.classId, race: (run.character || {}).race, gender: (run.character || {}).gender, gearMask: gearLevel(run) });
        if (K.actors.setHeroForm) K.actors.setHeroForm(C.player && C.player.form ? C.player.form : null);
        K.actors.setEnemies(C.enemies.map((e) => ({ uid: e.uid, id: e.id, name: e.name, tier: e.tier, icon: e.icon })));
        root.classList.add("sp-actors-on");
        bindTargeting();
      }
      D = createDirector({ app, C, kit: K || { actors: null, fx: null }, hud, paint: (v) => hud.update(v, view()), legacy, wait });
      cardSounds.preload((run.deck || []).map((x) => x.id));
    } catch (e) { console.warn("[spires] combat stage unavailable:", e && e.message); D = null; K = null; }
    st.booting = false;
    update();
    showTips();
  }

  // First fight ever: a short "how to fight" card under the top bar (Reddit newcomers land straight in combat). Dismissed by its button,
  // Enter / Space, or the first click anywhere else (that click still does its job); never shown again once seen (meta.settings.tipsSeen).
  function showTips() {
    const s = app.meta.settings;
    if (s.tipsSeen || st.done || !root.isConnected) return;
    const tips = [
      ["Play a card", "drag it onto an enemy, or click the card and then the target. Keys 1-9 pick a card."],
      ["Energy", "the red orb refills every turn, so spend it all."],
      ["Potions", "press a potion in the belt and drag the arrow onto an enemy, like a card. Esc cancels."],
      ["Intents", "the icon above an enemy is its next move; a sword and a number is an attack for that much."],
      ["End Turn", "the button, or Space / E. Esc opens the menu, F is fullscreen."],
    ];
    let panel = null;
    const close = () => { if (!panel) return; s.tipsSeen = true; app.save(); panel.remove(); panel = null; document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
    const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); close(); } };
    const onDown = (e) => { if (panel && !panel.contains(e.target)) close(); };
    panel = h("div", { class: "sp-howto", role: "dialog", "aria-label": "How to fight" },
      h("h3", {}, "How to fight"),
      h("ul", {}, ...tips.map(([k, v]) => h("li", {}, h("b", {}, k), ": ", v))),
      h("button", { class: "sp-wowbtn sp-wowbtn--sm", type: "button", onClick: close }, "Got it"));
    root.append(panel);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    const b = panel.querySelector("button"); if (b) b.focus({ preventScroll: true });
    st.closeTips = close;
  }

  const keys = (ev) => {
    if (!root.isConnected) { cleanup(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable || document.querySelector(".sp-bugp")) return;
    if ((ev.key.toLowerCase() === "e" || ev.key === " ") && !ev.ctrlKey && !ev.metaKey && playerTurn() && !hand.selected()) { if (ev.key === " ") ev.preventDefault(); endTurnFlow(); } // E or Space ends the turn (README); Space on a focused card still selects it (the card handler stops propagation)
    else if (ev.key === "Escape" && st.pot !== null) { st.pot = null; update(); }
  };
  // the site's global keybinds (wgf-keybinds.js) own Escape + digits; claim the keyboard while the fight is mounted
  const kb = () => window.WGFKeybinds;
  let cleaned = false;
  function cleanup() {
    if (cleaned) return; cleaned = true;
    if (app._combat && app._combat.C === C) app._combat = null;
    if (CL) { CL.destroy(); CL = null; }
    if (st.closeTips) st.closeTips();
    document.removeEventListener("keydown", keys); hand.destroy();
    if (mo) mo.disconnect();
    if (K) { if (K.fx) { K.fx.clearAura(); K.fx.clear(); } if (app.kit === K) clearStage(K); }
    if (kb() && kb().resume) kb().resume();
  }
  document.addEventListener("keydown", keys);
  if (kb() && kb().suspend) kb().suspend();
  hud.setTurn("player");
  if (S) CL = createCoopLink(app, S, { st, update, paint: () => paint(), sync: syncHand, snapBefore, settle, wait, safe, getD: () => D, getK: () => K, hud, root, reduced: () => app.reduced() });
  update();
  watchLeave(app, root, cleanup);
  boot();
  return root;
}
