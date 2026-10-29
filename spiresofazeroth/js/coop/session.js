// Co-op session (two players, two runs, one shared seed). Wired once from main.js: installCoop(app) -> app.coop.
// The host LEADS: zone, map node, dungeon floor and final boss are the host's picks; the guest's game follows them (lead -> follow).
// Everything else (rewards, shops, events, rest, talents) stays personal. Fights are joint: see ui/coopCombat.js + engine/coop.js.
// Wire messages: hello, status, lead, cready, act, hash, bye.
import { h, toast } from "../ui/dom.js?v=20261029a";
import { newSeedString } from "../engine/rng.js?v=20261029a";
import { enterNode, chooseZone, enterRaidFloor, proceedAfterSpire, chooseFinalBoss } from "../engine/run.js?v=20261029a";
import * as net from "./net.js?v=20261029a";

const LEAD_SCREENS = new Set(["map", "zonepick", "raidchoice", "bosschoice"]);
const SCREEN_NAMES = { map: "the map", zonepick: "zone select", raidchoice: "the dungeon choice", bosschoice: "the boss choice", combat: "a fight", reward: "rewards",
  treasure: "a treasure", vendor: "a vendor", rest: "a campfire", hub: "the sanctuary", event: "an event", healer: "the healer", end: "the run summary",
  mechchoice: "the zone mechanic", title: "the title screen", classSelect: "hero select", charSelect: "hero select", charCreate: "hero creation", talents: "talents", coopLobby: "the co-op lobby" };
const where = (s) => SCREEN_NAMES[s] || s || "somewhere";

export function installCoop(app) {
  const listeners = new Map(); // t -> Set(fn)
  const S = {
    state: "off", role: null, seat: -1, seed: null, code: null, link: null, partner: null, partnerStatus: null,
    lead: null, cready: new Map(), applying: false,
  };
  const emit = (t, m) => { for (const f of listeners.get(t) || []) try { f(m); } catch (e) { console.error("[coop] listener", t, e); } };
  let bar = null;

  function myStatus() {
    const r = app.run;
    const c = r && r.character;
    return {
      t: "status", screen: r ? r.screen : app.screen, act: r ? r.act : -1, floor: r ? r.floor : -1, col: r ? r.col : -1, zoneId: r ? r.zoneId : null,
      seed: r ? r.seed : null, hero: r ? { name: (c && c.name) || "", classId: r.classId, race: c && c.race, hp: Math.round(r.hp), maxHp: r.maxHp } : null,
    };
  }
  const sendStatus = () => { if (S.link) S.link.send(myStatus()); renderBar(); };

  function onMessage(m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "hello") {
      S.partner = { name: m.name || "Partner", build: m.build };
      if (m.seed && S.role === "guest") S.seed = m.seed;
      if (m.build && m.build !== app.build) toast("Your partner is on a different game version - both of you should refresh.");
    } else if (m.t === "status") {
      S.partnerStatus = m;
      tryFollow();
    } else if (m.t === "lead") {
      if (S.role === "guest") { S.lead = m; tryFollow(); }
    } else if (m.t === "cready") {
      S.cready.set(m.key, m);
    } else if (m.t === "bye") {
      drop("Your partner left co-op. You carry on solo.");
      return;
    } else if (m.t === "full") {
      drop("That game already has two players.");
      return;
    }
    emit(m.t, m);
    renderBar();
  }

  function connected(link, role) {
    S.link = link; S.role = role; S.seat = role === "host" ? 0 : 1; S.state = "connected";
    link.onMessage(onMessage);
    link.onClose((why) => { if (S.link === link) drop(why === "left" ? null : "Lost the connection to your partner. You carry on solo."); });
    link.send({ t: "hello", seed: role === "host" ? S.seed : null, name: heroName(), build: app.build });
    sendStatus();
    emit("connected", { role });
    renderBar();
  }
  function drop(msg) {
    const link = S.link;
    S.link = null; S.state = "off"; S.role = null; S.seat = -1; S.partner = null; S.partnerStatus = null; S.lead = null; S.cready.clear();
    if (link) try { link.close(); } catch { /* gone */ }
    if (msg) toast(msg);
    emit("close", {});
    renderBar();
  }
  const heroName = () => { const c = app.run && app.run.character; return (c && c.name) || (app.meta && app.meta.lastName) || "Adventurer"; };

  // ---- host leads, guest follows -----------------------------------------------------------------------------------------
  function partnerAt(run) {
    const p = S.partnerStatus;
    if (!p) return false;
    if (p.screen === "end") return true; // partner's run is over: lead alone
    return p.screen === run.screen && p.act === run.act && (run.screen !== "map" || p.floor === run.floor);
  }
  // true = go ahead locally. kind: node(col) | zone(id) | raid(floorId) | skipraid | boss(id)
  function lead(kind, arg) {
    const run = app.run;
    if (S.state !== "connected" || !run || !LEAD_SCREENS.has(run.screen)) return true;
    if (S.role === "guest") {
      if (S.partnerStatus && S.partnerStatus.screen === "end") return true;
      toast(`Co-op: ${partnerName()} picks the way. Your game follows their choice.`);
      return false;
    }
    if (!partnerAt(run)) {
      toast(`Waiting for ${partnerName()} (on ${where(S.partnerStatus && S.partnerStatus.screen)}).`);
      return false;
    }
    S.link.send({ t: "lead", kind, arg, screen: run.screen, act: run.act, floor: run.floor });
    return true;
  }
  async function tryFollow() {
    const m = S.lead, run = app.run;
    if (!m || !run || S.applying || S.role !== "guest") return;
    if (run.screen !== m.screen || run.act !== m.act || (m.screen === "map" && run.floor !== m.floor)) return;
    S.lead = null; S.applying = true;
    try {
      let okk = false;
      if (m.kind === "node") okk = !!enterNode(run, app.data, m.arg);
      else if (m.kind === "zone") okk = await chooseZone(run, app.data, m.arg);
      else if (m.kind === "raid") okk = !!enterRaidFloor(run, app.data, m.arg);
      else if (m.kind === "skipraid") { await proceedAfterSpire(run, app.data); okk = true; }
      else if (m.kind === "boss") okk = !!chooseFinalBoss(run, app.data, m.arg);
      if (!okk) { toast("Co-op: could not follow your partner's pick. You choose this one yourself."); return; }
      app.save();
      await app.route();
    } catch (e) {
      console.error("[coop] follow failed", e);
    } finally {
      S.applying = false;
      // a host pick that landed while this follow was still routing (Act 2: zone load -> map -> host clicks the first node) was dropped
      // by the applying guard and nothing retried it: host waited in the fight, guest sat on the map (2026-10-28 reports)
      if (S.lead) setTimeout(tryFollow, 0);
    }
  }

  // ---- fight handshake: swap run snapshots before either side starts the combat ---------------------------------------------
  const fightKey = (run) => `${run.act}:${run.floor}:${run.col}:${(run.pending && run.pending.nodeId) || ""}:${(run.pending && run.pending.tier) || ""}`;
  function combatReady(run, isCancelled) {
    const key = fightKey(run);
    for (const k of [...S.cready.keys()]) if (k !== key) S.cready.delete(k); // older fights only: this fight's message stays readable
    S.link.send({ t: "cready", key, run: JSON.parse(JSON.stringify(run)), encounter: run.pending.encounter });
    return new Promise((res) => {
      const check = () => {
        if (isCancelled()) return res(null);
        if (S.state !== "connected") return res(null);
        const m = S.cready.get(key);
        if (m) return res(m); // not consumed: a superseded combat render read it first and then bailed, the live render must still see it
        setTimeout(check, 120);
      };
      check();
    });
  }

  // ---- the partner bar (stays over every screen while connected) --------------------------------------------------------------
  const partnerName = () => (S.partnerStatus && S.partnerStatus.hero && S.partnerStatus.hero.name) || (S.partner && S.partner.name) || "your partner";
  function renderBar() {
    const host = document.getElementById("app");
    if (S.state !== "connected") { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) { bar = h("div", { class: "sp-coopbar", role: "status" }); host.append(bar); }
    const p = S.partnerStatus, hero = p && p.hero, run = app.run;
    const ready = run && LEAD_SCREENS.has(run.screen) && partnerAt(run);
    const cls = hero && hero.classId ? hero.classId[0].toUpperCase() + hero.classId.slice(1) : "";
    bar.replaceChildren(
      h("b", {}, S.role === "host" ? "Co-op (host)" : "Co-op"),
      h("span", {}, hero ? `${partnerName()} ${cls}` : `${S.partner ? S.partner.name : "Partner"} connected`),
      hero ? h("span", { class: "sp-coopbar__hp" }, `${hero.hp}/${hero.maxHp} HP`) : null,
      h("span", { class: "sp-coopbar__where" + (ready ? " is-ready" : "") }, p ? (ready ? "ready" : `on ${where(p.screen)}`) : "..."),
      h("button", { type: "button", class: "sp-coopbar__leave", title: "Leave co-op", onClick: () => { if (confirm("Leave co-op? Your run continues solo.")) leave(); } }, "Leave"));
  }
  function leave() { if (S.link) S.link.send({ t: "bye" }); drop("You left co-op."); }

  app.coop = {
    get state() { return S.state; }, get role() { return S.role; }, get seat() { return S.seat; }, get code() { return S.code; },
    get partnerStatus() { return S.partnerStatus; }, partnerName,
    active: () => S.state === "connected",
    seedForRun: () => (S.state === "connected" ? S.seed : null),
    send: (m) => { if (S.link) S.link.send(m); },
    on(t, f) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); return () => listeners.get(t).delete(f); },
    async host(onError) {
      if (S.state !== "off") drop(null);
      S.code = net.newCode(); S.seed = newSeedString(); S.role = "host"; S.state = "hosting";
      try {
        const room = await net.host(S.code, (link) => connected(link, "host"), (m) => toast(m));
        S.cancelHost = room.cancel;
        return S.code;
      } catch (e) { S.state = "off"; S.role = null; if (onError) onError(e.message); throw e; }
    },
    async join(code) {
      if (S.state !== "off") drop(null);
      S.state = "joining"; S.role = "guest"; S.code = net.cleanCode(code);
      try { connected(await net.join(S.code), "guest"); return true; } catch (e) { S.state = "off"; S.role = null; throw e; }
    },
    cancel() { if (S.cancelHost) S.cancelHost(); S.cancelHost = null; if (S.state !== "connected") { S.state = "off"; S.role = null; } },
    leave, lead, combatReady, sendStatus,
  };

  // every screen change reports where this player is; the guest also catches up on a host pick that arrived early
  const go0 = app.go.bind(app);
  app.go = async (...args) => {
    const r = await go0(...args);
    if (S.state === "connected") { sendStatus(); tryFollow(); }
    return r;
  };
  injectCss();
}

function injectCss() {
  if (document.getElementById("sp-coop-css")) return;
  const s = document.createElement("style");
  s.id = "sp-coop-css";
  s.textContent = `
.sp-coopbar{position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:9000;display:flex;gap:10px;align-items:center;padding:5px 12px;
  background:rgba(12,8,4,.88);border:1px solid #8a6a2a;border-radius:6px;color:#f0d68a;font:600 13px/1.2 Georgia,serif;box-shadow:0 2px 10px #000a;max-width:calc(100vw - 32px);flex-wrap:wrap}
.sp-coopbar b{color:#ffd100}.sp-coopbar__hp{color:#ff8a7a}.sp-coopbar__where{color:#bba}.sp-coopbar__where.is-ready{color:#7dff7d}
.sp-coopbar__leave{background:#3a1a10;color:#f0d68a;border:1px solid #8a6a2a;border-radius:4px;font:inherit;font-size:12px;padding:2px 8px;cursor:pointer}
.sp-coop-lobby{max-width:640px;margin:0 auto;padding:40px 16px;color:#f0d68a;text-align:center;font-family:Georgia,serif}
.sp-coop-lobby h2{color:#ffd100;font-size:34px;margin:0 0 6px}.sp-coop-lobby p{color:#d8ccb0;line-height:1.5}
.sp-coop-lobby .sp-coop-code{font:700 46px/1 monospace;letter-spacing:8px;color:#fff;background:#0008;border:1px solid #8a6a2a;border-radius:8px;padding:14px 22px;display:inline-block;margin:12px 0;user-select:all}
.sp-coop-lobby input{font:700 30px monospace;letter-spacing:6px;text-transform:uppercase;width:220px;text-align:center;padding:8px;border-radius:6px;border:1px solid #8a6a2a;background:#0009;color:#fff}
.sp-coop-lobby .sp-coop-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:16px 0}
.sp-coop-lobby .sp-coop-err{color:#ff7a6a;min-height:1.4em}
.sp-coop-lobby ul{text-align:left;display:inline-block;color:#d8ccb0;margin:8px 0 0}
.sp-coop-panel{position:absolute;left:24px;top:150px;z-index:40;width:300px;padding:12px 14px;background:rgba(10,7,3,.86);border:1px solid #8a6a2a;border-radius:8px;
  color:#f0d68a;font:600 20px/1.3 Georgia,serif;pointer-events:none;box-shadow:0 4px 16px #000a}
.sp-coop-panel h4{margin:0 0 6px;color:#ffd100;font-size:22px}.sp-coop-panel .bar{height:14px;background:#300;border:1px solid #722;border-radius:3px;overflow:hidden;margin:4px 0}
.sp-coop-panel .bar i{display:block;height:100%;background:linear-gradient(#e33,#911)}.sp-coop-panel .dim{color:#bba;font-size:17px}
.sp-coop-panel .turn{margin-top:6px;font-size:18px}.sp-coop-panel .turn.mine{color:#7dff7d}.sp-coop-panel .turn.theirs{color:#ffb14a}
.sp-coop-panel .down{color:#ff6a5a}.sp-coop-panel .last{color:#cfe;font-size:16px;margin-top:4px}
.sp-eplate[data-coop-tgt]:not([data-coop-tgt=""])::after{content:attr(data-coop-tgt);position:absolute;left:50%;top:-30px;transform:translateX(-50%);white-space:nowrap;
  font:700 18px Georgia,serif;color:#ffb14a;text-shadow:0 1px 3px #000;pointer-events:none}
.sp-eplate.sp-coop-tgt-me::after{color:#ff6a5a}
.sp-coop-wait{position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(0,0,0,.6);color:#f0d68a;font:600 34px Georgia,serif}
`;
  document.head.append(s);
}
