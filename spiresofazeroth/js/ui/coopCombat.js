// Co-op fight glue for ui/combat.js: the handshake that starts a joint fight, the partner-action queue, the shared enemy phase with
// choreography for hits on YOUR hero, the partner panel, enemy target tags and the desync probe. Rules live in engine/coop.js.
import { h, toast } from "./dom.js";
import * as Coop from "../engine/coop.js";

// Waits (with a "Fight solo" escape) for the partner to reach the same fight, then builds both heroes' combats. null = solo.
export async function coopStart(app, run) {
  const coop = app.coop;
  let cancelled = false;
  const line = h("div", {}), sub = h("div", { class: "sp-coop-wait__sub" });
  const wait = h("div", { class: "sp-coop-wait" }, line, sub,
    h("button", { class: "sp-wowbtn", type: "button", onClick: () => { cancelled = true; } }, "Fight solo"));
  // live: the partner may still be on rewards / the healer / the Sanctuary (personal screens) or the channel may be reconnecting
  const tick = () => {
    const ps = coop.partnerStatus, name = coop.partnerName();
    if (coop.state === "reconnecting") { line.textContent = `Reconnecting to ${name}...`; sub.textContent = "Their game rejoins yours when the connection is back."; return; }
    line.textContent = `Waiting for ${name} to reach the fight...`;
    sub.textContent = ps && ps.screen && ps.screen !== "combat" && coop.where ? `They are on ${coop.where(ps.screen)}. Your pick is already on its way to them.` : "";
  };
  tick();
  const iv = setInterval(tick, 500);
  app.root.append(wait);
  let m = null;
  try { m = await coop.combatReady(run, () => cancelled); } finally { clearInterval(iv); wait.remove(); }
  if (!m || !m.run) { if (!cancelled) toast("Co-op fight unavailable, fighting solo."); return null; }
  const { data } = app;
  await data.loadClass(m.run.classId);
  const heldIds = (r) => [...(r.relics || []), ...Object.values(r.gear || {}), ...(r.gearBag || [])].filter((x) => typeof x === "string");
  const unknown = await data.ensureRelics([...heldIds(run), ...heldIds(m.run)]); // both heroes' relics must resolve on BOTH browsers or the lockstep drifts
  if (unknown.length) console.warn("[coop] relics unknown on this client", unknown);
  const mySeat = coop.seat;
  const encounter = mySeat === 0 ? run.pending.encounter : m.encounter;
  if (mySeat === 1) run.pending.encounter = encounter;
  const runs = mySeat === 0 ? [run, m.run] : [m.run, run];
  const S = Coop.startCoop({ data, runs, mySeat, encounter });
  S.fightKey = mySeat === 0 ? coop.fightKey(run) : m.key; // the host's key names the fight on both clients
  coop.consumeCready(m);
  S.partnerName = coop.partnerName();
  return S;
}

const enemyOnly = (S) => (ev) => !ev.uid || (ev.uid !== "player" && S.Cs[0].enemies.some((e) => e.uid === ev.uid));

// hooks: { st, update, paint, sync, snapBefore, settle, wait, safe, getD, getK, hud, root, reduced, endTurnSolo }
export function createCoopLink(app, S, hooks) {
  const me = S.mySeat, them = 1 - me, C = S.Cs[me], P = S.Cs[them];
  const coop = app.coop;
  let chain = Promise.resolve(), dead = false, wasDown = false, lastCard = "", hashes = new Map(), warned = false;
  let giftMode = false, lastUp = null, giftFlash = ""; // partner support: "Cast on partner" toggle, last pointer release (drag a card onto the panel), last gift line
  const onUp = (ev) => { lastUp = { x: ev.clientX, y: ev.clientY, t: performance.now() }; };
  document.addEventListener("pointerup", onUp, true);
  const run = (fn) => (chain = chain.then(() => (dead ? null : fn())).catch((e) => console.error("[coop] fight step", e)));

  // ---- partner panel -------------------------------------------------------------------------------------------------
  const panel = h("div", { class: "sp-coop-panel", "aria-live": "polite" });
  hooks.root.append(panel);
  function paintPanel() {
    const p = P.player, cls = P.cls ? P.cls.name : P.classId;
    const turn = S.over ? "" : S.phase === "enemy" ? "Enemies act" : S.active === me ? "Your turn" : S.active === them ? `${S.partnerName}'s turn` : "";
    const tgt = { [me]: 0, [them]: 0 };
    for (const e of C.enemies) if (!e.dead) { const s = Coop.targetSeat(S, e); if (s >= 0) tgt[s]++; }
    panel.replaceChildren(
      h("h4", {}, `${S.partnerName} - ${cls}`),
      S.down[them] ? h("div", { class: "down" }, "DOWN - back up if you win") : S.gone[them] ? h("div", { class: "down" }, "Left the fight") : null,
      h("div", { class: "bar" }, h("i", { style: { width: `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%` } })),
      h("div", {}, `${Math.max(0, p.hp)}/${p.maxHp} HP${p.block ? `  |  ${p.block} block` : ""}`),
      h("div", { class: "dim" }, `Energy ${p.energy}  |  Hand ${P.pile.hand.length}`),
      lastCard ? h("div", { class: "last" }, `Played: ${lastCard}`) : null,
      giftFlash ? h("div", { class: "gift" }, giftFlash) : null,
      !S.over && Coop.inFight(S, them) && Coop.inFight(S, me) ? h("button", { type: "button", class: "sp-coop-gift" + (giftMode ? " is-on" : ""), title: "Shield, heal and buff cards land on your partner. You can also drag the card onto this panel.",
        onClick: () => { giftMode = !giftMode; paintPanel(); } }, giftMode ? `Casting on ${S.partnerName} (click to stop)` : `Cast heals and shields on ${S.partnerName}`) : null,
      turn ? h("div", { class: `turn ${S.active === me ? "mine" : "theirs"}` }, turn) : null,
      S.down[me] ? h("div", { class: "down" }, "You are DOWN. Your partner fights on.") : null,
      !S.over ? h("div", { class: "dim" }, `Next enemy turn: ${tgt[me]} on you, ${tgt[them]} on ${S.partnerName}`) : null);
    // enemy plates: who each enemy swings at next
    hooks.root.querySelectorAll(".sp-eplate[data-uid]").forEach((el) => {
      const e = C.enemies.find((x) => x.uid === el.dataset.uid);
      const s = e && !e.dead ? Coop.targetSeat(S, e) : -1;
      const label = s === me ? "> you" : s === them ? `> ${S.partnerName}` : "";
      if (el.dataset.coopTgt !== label) { el.dataset.coopTgt = label; el.classList.toggle("sp-coop-tgt-me", s === me); }
    });
  }

  function myTurnStarted() {
    const D = hooks.getD(), K = hooks.getK();
    if (S.over) return;
    if (S.active === me) { hooks.hud.setTurn("player"); if (K && K.fx) K.fx.banner("Your turn"); }
    else if (S.phase === "player") { hooks.hud.setTurn("enemy"); if (K && K.fx) K.fx.banner(`${S.partnerName}'s turn`); }
    void D;
  }
  async function checkDown() {
    if (S.down[me] && !wasDown) {
      wasDown = true;
      const K = hooks.getK();
      toast("You are down! Your partner fights on - win and you are back up.");
      if (K && K.actors && K.actors.get("player")) await hooks.safe(K.actors.death("player"), "hero-down", 2500);
    }
  }

  // ---- the shared enemy phase (both browsers run it the moment the last hero ends the turn) ----------------------------------
  async function maybeRound() {
    if (S.over || S.phase !== "enemy") return;
    const { st } = hooks, K = hooks.getK();
    st.busy = true;
    try {
      hooks.hud.setTurn("enemy");
      if (K && K.fx) K.fx.banner("Enemy turn");
      await hooks.wait(hooks.reduced() ? 0 : 700);
      const gen = Coop.enemyPhase(S);
      for (;;) {
        const pre = hooks.snapBefore(); P.fx.length = 0;
        const n = gen.next();
        const evs = C.fx.splice(0), pevs = P.fx.splice(0);
        if (n.done) break;
        const D = hooks.getD();
        if (n.value.seat === me) {
          const act = evs.find((x) => x.t === "act");
          if (D) { D.beginHold(pre); await hooks.safe(D.enemyAct(n.value.e, evs, pre, act && act.name), "enemy", 7000); }
          else { await hooks.settle(evs, pre); hooks.paint(); await hooks.wait(480); }
        } else {
          const act = pevs.find((x) => x.t === "act");
          if (act && act.name) lastCard = `${n.value.e.name}: ${act.name} on ${S.partnerName}`;
          if (D) D.beginHold(pre);
          await hooks.settle(pevs.filter(enemyOnly(S)), pre);
          hooks.paint(); paintPanel();
          await hooks.wait(hooks.reduced() ? 0 : 520);
        }
        await checkDown();
        if (S.over) break;
        await hooks.wait(140);
      }
      if (!S.over) {
        const pre = hooks.snapBefore();
        Coop.finishRound(S);
        const evs = C.fx.splice(0); P.fx.length = 0;
        if (hooks.getD()) hooks.getD().beginHold(pre);
        await hooks.settle(evs, pre);
        const hsh = Coop.stateHash(S);
        hashes.set(S.round, hsh);
        coop.send({ t: "hash", round: S.round, h: hsh });
      }
    } catch (e) { console.warn("[coop] enemy phase", e && e.message); }
    st.busy = false;
    lastCard = "";
    announce();
    myTurnStarted();
    await checkDown();
    paintPanel();
    hooks.update();
  }

  // ---- partner actions arrive in order over the wire --------------------------------------------------------------------
  function onPartner(a) {
    run(async () => {
      if (S.over) return;
      const pre = hooks.snapBefore(); P.fx.length = 0;
      const r = Coop.applyAction(S, a);
      if (r === null) console.warn("[coop] partner action rejected here (the two games differ):", JSON.stringify({ k: a.k, uid: a.uid, idx: a.idx, uids: a.uids, active: S.active, phase: S.phase, ended: S.ended, pending: P.pending.length }));
      const pevs = P.fx.splice(0).map((ev) => (ev && ev.uid === "partner" ? { ...ev, uid: "player" } : ev)); C.fx.length = 0; // their gift on me plays on my hero
      if (a.k === "play" && r && r.ok) { const inst = P.pile.discard.concat(P.pile.exhaust, P.powers || []).find((c) => c && c.uid === a.uid); lastCard = inst && inst.def ? inst.def.name : "a card"; }
      if (a.k === "play" && a.ally && r && r.ok) { lastCard += " on you"; toast(`${S.partnerName} cast ${lastCard}.`); }
      else if (a.k === "potion") lastCard = "a potion";
      const D = hooks.getD();
      if (D) D.beginHold(pre);
      await hooks.settle(pevs.filter((ev) => enemyOnly(S)(ev) || (a.ally && ev.uid === "player")), pre);
      paintPanel();
      announce();
      hooks.update();
      if (a.k === "end" || S.phase === "enemy") { if (S.phase === "player") myTurnStarted(); await maybeRound(); }
      else if (S.active === me && S.phase === "player") myTurnStarted();
    });
  }
  const offAct = coop.on("act", (m) => { if (m.a && m.a.seat === them) onPartner(m.a); });
  // Verdict sync: whoever sees the fight end first tells the partner; a client that is still mid-fight (its copy drifted) adopts it.
  let announced = false;
  function announce() {
    if (announced || !S.over) return;
    const res = C.result === "win" ? "win" : C.result === "lose" ? "lose" : null;
    if (!res) return;
    announced = true; coop.send({ t: "fightend", key: S.fightKey, result: res, round: S.round });
  }
  const offEnd = coop.on("fightend", (m) => run(async () => {
    if (S.over || !m || m.key !== S.fightKey) return;
    if (!Coop.forceFinish(S, m.result)) return;
    console.warn("[coop] adopting the partner's fight result", m.result, "at round", S.round);
    announced = true;
    toast(`${S.partnerName}'s game finished this fight. Moving on.`);
    paintPanel(); hooks.st.busy = false; hooks.update();
  }));
  const offHash = coop.on("hash", (m) => {
    const mine = hashes.get(m.round);
    if (mine && mine !== m.h && !warned) { warned = true; console.warn("[coop] desync at round", m.round, mine, m.h); toast("Co-op: the two games drifted apart this fight. It will resync after the fight."); }
  });
  const offClose = coop.on("close", () => run(async () => {
    if (S.over) return;
    S.gone[them] = true; S.ended[them] = true;
    Coop.settle(S);
    paintPanel(); hooks.update();
    await maybeRound();
  }));

  // ---- partner support: is this play meant for the partner? (toggle on, or the card was released over the panel) ------------------
  function wantsGift(inst) {
    if (!Coop.canGift(S, me, inst)) return false;
    if (giftMode) return true;
    if (!lastUp || performance.now() - lastUp.t > 600) return false;
    const r = panel.getBoundingClientRect();
    return lastUp.x >= r.left - 12 && lastUp.x <= r.right + 12 && lastUp.y >= r.top - 12 && lastUp.y <= r.bottom + 12;
  }
  // my gift's fx: the events on the partner leave the stage queue (no actor for them here) and show on the panel instead
  function takeGiftFx(evs, name) {
    const mine = [], parts = [];
    for (const ev of evs) {
      if (ev && ev.uid === "partner") { if (ev.t === "block" && ev.amount) parts.push(`+${ev.amount} block`); else if (ev.t === "heal" && ev.amount) parts.push(`+${ev.amount} HP`); }
      else mine.push(ev);
    }
    giftFlash = `You cast ${name || "a spell"} on ${S.partnerName}${parts.length ? `: ${parts.join(", ")}` : ""}`;
    return mine;
  }

  // ---- my own actions: apply now (it is my turn, nobody else can act), then tell the partner ------------------------------
  function local(a) {
    const act = { ...a, seat: me };
    const r = Coop.applyAction(S, act);
    if (r === null || (a.k === "play" && !(r && r.ok))) return r;
    coop.send({ t: "act", a: act });
    queueMicrotask(() => { paintPanel(); checkDown(); announce(); });
    return r;
  }
  function endTurn() {
    return run(async () => {
      const { st } = hooks;
      if (!Coop.canAct(S, me)) return;
      st.busy = true; st.pot = null;
      const pre = hooks.snapBefore();
      local({ k: "end" });
      const evs = C.fx.splice(0);
      hooks.hud.setTurn("enemy");
      hooks.sync(); hooks.paint();
      await hooks.settle(evs, pre);
      st.busy = false;
      paintPanel();
      if (S.phase === "enemy") await maybeRound();
      else { myTurnStarted(); hooks.update(); }
    });
  }

  paintPanel();
  myTurnStarted();
  return {
    canAct: () => Coop.canAct(S, me),
    local, endTurn, paintPanel,
    wantsGift, takeGiftFx,
    setGift(v) { giftMode = !!v; paintPanel(); }, // drive-only toggle; players use the panel button
    destroy() { dead = true; offAct(); offEnd(); offHash(); offClose(); document.removeEventListener("pointerup", onUp, true); panel.remove(); },
  };
}
