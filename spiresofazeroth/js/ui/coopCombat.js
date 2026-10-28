// Co-op fight glue for ui/combat.js: the handshake that starts a joint fight, the partner-action queue, the shared enemy phase with
// choreography for hits on YOUR hero, the partner panel, enemy target tags and the desync probe. Rules live in engine/coop.js.
import { h, toast } from "./dom.js?v=20261028e";
import * as Coop from "../engine/coop.js?v=20261028e";

// Waits (with a "Fight solo" escape) for the partner to reach the same fight, then builds both heroes' combats. null = solo.
export async function coopStart(app, run) {
  const coop = app.coop;
  let cancelled = false;
  const wait = h("div", { class: "sp-coop-wait" }, h("div", {}, `Waiting for ${coop.partnerName()} to reach the fight...`),
    h("button", { class: "sp-wowbtn", type: "button", onClick: () => { cancelled = true; } }, "Fight solo"));
  app.root.append(wait);
  let m = null;
  try { m = await coop.combatReady(run, () => cancelled); } finally { wait.remove(); }
  if (!m || !m.run) { if (!cancelled) toast("Co-op fight unavailable, fighting solo."); return null; }
  const { data } = app;
  await data.loadClass(m.run.classId);
  const mySeat = coop.seat;
  const encounter = mySeat === 0 ? run.pending.encounter : m.encounter;
  if (mySeat === 1) run.pending.encounter = encounter;
  const runs = mySeat === 0 ? [run, m.run] : [m.run, run];
  const S = Coop.startCoop({ data, runs, mySeat, encounter });
  S.partnerName = coop.partnerName();
  return S;
}

const enemyOnly = (S) => (ev) => !ev.uid || (ev.uid !== "player" && S.Cs[0].enemies.some((e) => e.uid === ev.uid));

// hooks: { st, update, paint, sync, snapBefore, settle, wait, safe, getD, getK, hud, root, reduced, endTurnSolo }
export function createCoopLink(app, S, hooks) {
  const me = S.mySeat, them = 1 - me, C = S.Cs[me], P = S.Cs[them];
  const coop = app.coop;
  let chain = Promise.resolve(), dead = false, wasDown = false, lastCard = "", hashes = new Map(), warned = false;
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
      const pevs = P.fx.splice(0); C.fx.length = 0;
      if (a.k === "play" && r && r.ok) { const inst = P.pile.discard.concat(P.pile.exhaust, P.powers || []).find((c) => c && c.uid === a.uid); lastCard = inst && inst.def ? inst.def.name : "a card"; }
      else if (a.k === "potion") lastCard = "a potion";
      const D = hooks.getD();
      if (D) D.beginHold(pre);
      await hooks.settle(pevs.filter(enemyOnly(S)), pre);
      paintPanel();
      hooks.update();
      if (a.k === "end" || S.phase === "enemy") { if (S.phase === "player") myTurnStarted(); await maybeRound(); }
      else if (S.active === me && S.phase === "player") myTurnStarted();
    });
  }
  const offAct = coop.on("act", (m) => { if (m.a && m.a.seat === them) onPartner(m.a); });
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

  // ---- my own actions: apply now (it is my turn, nobody else can act), then tell the partner ------------------------------
  function local(a) {
    const act = { ...a, seat: me };
    const r = Coop.applyAction(S, act);
    if (r === null || (a.k === "play" && !(r && r.ok))) return r;
    coop.send({ t: "act", a: act });
    queueMicrotask(() => { paintPanel(); checkDown(); });
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
    destroy() { dead = true; offAct(); offHash(); offClose(); panel.remove(); },
  };
}
