// Drag-to-target proof (headless Chrome over CDP, swiftshader WebGL, fresh profile, muted; never the owner's Chrome).
//   node tools/spires/arrow-drive.mjs '{"cls":"warrior","n":20,"empty":10,"input":"mouse","gap":150}'
// Boots a run through the real screens, enters the first fight, then for each scenario (1 enemy, 2+ enemies):
//   n attempts: pointerdown on an enemy-targeted card -> pointermove onto an enemy -> assert the arrow canvas has pixels
//   and the enemy plate has .is-target -> pointerup -> assert THAT enemy lost hp (and no other enemy did).
//   The next attempt starts `gap` ms after the previous release, i.e. inside the card fx window (hand locked).
//   empty attempts: drag an enemy-targeted card into open field and release -> assert nothing was played and the card is back.
// opts: cls zone w h n empty input(mouse|touch) gap(ms) hover(true: mouse hovers the card first) port(8766) scenarios(["one","multi"])
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const O = { cls: "warrior", zone: "", w: 1920, h: 1080, n: 20, empty: 10, input: "mouse", gap: 150, port: 8766, scenarios: ["one", "multi"], ...JSON.parse(process.argv[2] || "{}") };
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dir, dport, p, tabs;
for (let attempt = 0; attempt < 4 && !(tabs && tabs.some((t) => t.type === "page")); attempt++) {
  if (p) { try { p.kill(); } catch {} await sleep(500); }
  dir = mkdtempSync(join(tmpdir(), "sparrow-")); dport = 9300 + Math.floor(Math.random() * 300);
  p = spawn(chrome, [`--user-data-dir=${dir}`, "--headless=new", "--mute-audio", "--autoplay-policy=user-gesture-required", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${dport}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); if (tabs.some((t) => t.type === "page")) break; } catch {} await sleep(250); }
}
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) pend.get(d.id)(d.result);
  else if (d.method === "Runtime.exceptionThrown") logs.push("EXC: " + ((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).slice(0, 240));
  else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") logs.push("error: " + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : undefined; };
const click = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }); };
const touch = O.input === "touch";
// pointer primitives (mouse or touch)
const pDown = (x, y) => touch ? send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }) : send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
const pMove = (x, y) => touch ? send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }) : send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
const pUp = (x, y) => touch ? send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) : send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });

await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: O.w, height: O.h, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${O.port}/spiresofazeroth/?mute=1` }); await sleep(3500);
await send("Runtime.evaluate", { expression: `localStorage.setItem("spires.meta.v1", JSON.stringify({ v: 1, unlocked: [], settings: { speed: "normal", sound: false, reducedMotion: null, unlockAll: true } }))` });
await send("Page.reload", {}); await sleep(3500);
await ev(`window.__q=(s)=>document.querySelector(s); window.__all=(s)=>[...document.querySelectorAll(s)];
window.__rect=(el)=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,t:r.top,l:r.left};};
window.__byText=(t)=>__all('.sp-wowbtn,.sx-tog,button').find(b=>!b.disabled&&b.textContent.trim().startsWith(t));`);
const clickSel = async (expr) => { const r = await ev(`(()=>{const el=(${expr}); if(el&&el.scrollIntoView)el.scrollIntoView({block:"center"}); return el? __rect(el):null})()`); if (!r) return false; await click(r.x, r.y); await sleep(300); return true; };

// ---- walk to the first fight (menus use mouse clicks; touch emulation also accepts them)
await clickSel(`__byText('Essential only')`); await clickSel(`__byText('New run')`); await sleep(1200);
await clickSel(`(__all('.sx-clsplate').filter(b=>!b.disabled).find(b=>b.textContent.toLowerCase().includes('${O.cls}'))||__all('.sx-clsplate').filter(b=>!b.disabled)[0])`);
await sleep(500); if (!(await clickSel(`__byText('Begin the climb')`))) { await sleep(1500); await clickSel(`__byText('Begin the climb')`); } await sleep(900);
let inCombat = false; const trail = [];
for (let g = 0; g < 60 && !inCombat; g++) {
  const sc = await ev(`window.__spires.run&&window.__spires.run.screen`);
  trail.push(sc); if (sc === "combat") { inCombat = true; break; }
  if (!sc) { await clickSel(`__byText('New run')`); await sleep(1000); await clickSel(`__all('.sx-clsplate').filter(b=>!b.disabled)[0]`); await sleep(400); await clickSel(`__byText('Begin the climb')`); await sleep(900); continue; } // menu click missed (boot flake): retry
  if (sc === "zonepick") await clickSel(O.zone ? `(__all('.sx-zone').find(z=>z.textContent.toLowerCase().includes('${O.zone}'))||__q('.sx-zone'))` : `__q('.sx-zone')`);
  else if (sc === "map") await clickSel(`__all('.sx-node.reach')[0]`);
  else if (sc === "event") { await clickSel(`__all('.ev-opt:not(:disabled)')[0]`); await clickSel(`__byText('Continue')`); }
  else await clickSel(`__q('.sx-plate:not(:disabled)')`);
  await sleep(400);
}
if (!inCombat) { console.log(JSON.stringify({ error: "never reached combat", trail: trail.slice(0, 12), logs })); ws.close(); p.kill(); process.exit(1); }
if (touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }); // menus were walked with the mouse
await sleep(2500);

// ---- test fixtures (engine state only; the UI is re-rendered through app.route() so it is the real screen)
const ENEMY_CARD = `((i)=>i&&i.def&&(i.def.target==='enemy'||(i.def.target===undefined&&i.def.type!=='power'))&&i.def.type==='attack')`;
async function setup(kind) {
  return ev(`(async()=>{
    const a=window.__spires, C=a.C; const alive=()=>C.enemies.filter(e=>e.hp>0&&!e.dead&&!e.down);
    const natural=alive().length;
    if('${kind}'==='one'){ alive().slice(1).forEach(e=>{e.hp=0;e.dead=true;}); }
    else { let n=0; while(alive().length<2&&n++<3){ const src=alive()[0]; const c=JSON.parse(JSON.stringify(src)); c.uid=src.uid+'k'+n; C.enemies.push(c);} }
    for(const e of alive()){ e.maxHp=Math.max(e.maxHp,5000); e.hp=5000; e.block=0; }
    C.player.energy=99; C.player.hp=C.player.maxHp=Math.max(C.player.maxHp||0,999);
    const isE=${ENEMY_CARD};
    for(const pile of ['draw','discard']){ for(const c of C.pile[pile].filter(isE)){ if(C.pile.hand.length>=8) break; C.pile[pile].splice(C.pile[pile].indexOf(c),1); C.pile.hand.push(c);} }
    a.route(); await new Promise(r=>setTimeout(r,3500));
    return {enemies:alive().length, natural, hand:C.pile.hand.map(c=>c.def.id+':'+c.def.target)};
  })()`);
}
// what the browser actually delivered the press to (cards re-fan while one flies in, so a pre-press hit-test can race)
await ev(`document.addEventListener("pointerdown",(e)=>{const c=e.target.closest&&e.target.closest(".sp-hcard"); window.__pressed=c?c.dataset.inst:null;},true)`);
// keep the fixture topped up between attempts without touching the UI
const topUp = `(()=>{const C=window.__spires.C; if(!C) return; C.player.energy=99; for(const e of C.enemies) if(e.hp>0&&!e.dead){ if(e.hp<1500) e.hp=5000; e.block=0; }
  const isE=${ENEMY_CARD}; for(const c of C.pile.discard.filter(isE)){ if(C.pile.hand.length>=8) break; C.pile.discard.splice(C.pile.discard.indexOf(c),1); C.pile.hand.push(c);} })()`;

const state = () => ev(`(()=>{const C=window.__spires.C; return {hp:Object.fromEntries(C.enemies.map(e=>[e.uid,e.hp])), plays:C.cardsThisTurn, hand:C.pile.hand.length, phase:C.phase}})()`);
// a card element in the hand whose instance is enemy-targeted, and target / empty-field points
const pick = (k, only = "") => ev(`(()=>{const C=window.__spires.C; const isE=${ENEMY_CARD};
  const els=__all('.sp-hand .sp-hcard').filter(el=>!el.classList.contains('burn')&&el.style.pointerEvents!=='none'&&isE(C.pile.hand.find(c=>c.uid===el.dataset.inst))&&(!'${only}'||el.dataset.inst==='${only}'));
  let el=null, px=0, py=0; for(const c of els){ const r=c.getBoundingClientRect(); for(let yy=r.top+20; yy<Math.min(r.bottom,innerHeight-4) && !el; yy+=16) for(let xx=r.left+16; xx<r.right-16; xx+=16){ const t=document.elementFromPoint(xx,yy); if(t&&t.closest&&t.closest('.sp-hcard')===c){ el=c; px=xx; py=yy; break; } } if(el) break; }
  if(!el) return null; // a point that really hits THIS card (cards overlap in the fan)
  const plates=__all('.sp-eplate[data-uid]:not(.dead)'); const pl=plates[${k} % plates.length]; const hit=pl&&(pl.querySelector('.sp-ehit')||pl); const hr=hit&&hit.getBoundingClientRect();
  return {inst:el.dataset.inst, cx:px, cy:py, tx:hr?hr.left+hr.width/2:0, ty:hr?hr.top+hr.height/2:0, uid:pl&&pl.dataset.uid, plates:plates.length};
})()`);
const emptyPoint = () => ev(`(()=>{const pr=__all('.sp-eplate[data-uid]:not(.dead)').map(e=>e.getBoundingClientRect()); const W=innerWidth,H=innerHeight;
  for(let y=H*0.18;y<H*0.5;y+=20) for(let x=W*0.08;x<W*0.92;x+=20){ if(pr.every(r=>x<r.left-260||x>r.right+260||y<r.top-260||y>r.bottom+260)){ const el=document.elementFromPoint(x,y); if(!(el&&el.closest&&el.closest('[data-uid],button'))) return {x,y}; } }
  return {x:W*0.5,y:H*0.12}; })()`);
const aimProbe = (uid) => ev(`(()=>{const cv=__q('.sp-aim'); let px=0; try{ const g=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; for(let i=3;i<g.length;i+=4*97) if(g[i]>40) px++; }catch(e){px=-1}
  const pl=__q('.sp-eplate[data-uid="${uid}"]'); return {arrowPx:px, hover:!!(pl&&pl.classList.contains('is-target')), dragging:!!__q('.sp-hcard.is-drag'), dragInst:(()=>{const d=__q('.sp-hcard.is-drag'); const i=d&&window.__spires.C.pile.hand.find(c=>c.uid===d.dataset.inst); return i?i.uid+':'+i.def.id+':'+i.def.type+':'+i.def.target:null})(), locked:!!__q('.sp-hand.is-locked')}; })()`);

let lastDownLocked = false, lastDown = null;
async function drag(from, to, steps = 10) {
  lastDown = await ev(`(()=>{const t=document.elementFromPoint(${from.x},${from.y}); const c=t&&t.closest&&t.closest(".sp-hcard"); return {locked:!!__q(".sp-hand.is-locked"), at:c?c.dataset.inst:(t?t.className.toString().slice(0,30):null), nope:!!(c&&c.classList.contains("is-nope"))}})()`);
  lastDownLocked = lastDown.locked;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await pDown(from.x, from.y);
  for (let i = 1; i <= steps; i++) { const u = i / steps; await pMove(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u); await sleep(12); }
  if (O.shot && !shotDone) { shotDone = true; await sleep(250); const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); (await import("node:fs")).writeFileSync(O.shot, Buffer.from(r.data, "base64")); } // opts.shot: one mid-aim frame
}
let shotDone = false;
async function waitHp(uid, before, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await state(); if (s.hp[uid] < before.hp[uid]) return s; await sleep(60); }
  return state();
}

const out = { cls: O.cls, input: O.input, gap: O.gap, scenarios: {} };
for (const kind of O.scenarios) {
  const fx = await setup(kind);
  const rec = { enemies: fx.enemies, natural: fx.natural, pass: 0, fail: 0, fails: [], lockedStarts: 0, emptyPass: 0, emptyFail: 0, emptyFails: [] };
  await ev(topUp);
  for (let i = 0, retries = 0; i < O.n; i++) {
    let c = await pick(i);
    if (c && !touch && O.hover !== false) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.cx, y: c.cy, buttons: 0 }); await sleep(280); c = (await pick(i, c.inst)) || c; }
    if (!c) { rec.fail++; rec.fails.push({ i, why: "no enemy-targeted card in hand" }); await sleep(800); continue; }
    const before = await state();
    await drag({ x: c.cx, y: c.cy }, { x: c.tx, y: c.ty });
    await sleep(70);
    const probe = await aimProbe(c.uid);
    if (lastDownLocked) rec.lockedStarts++; // pointerdown landed inside the fx window
    await ev(topUp);
    await pUp(c.tx, c.ty);
    const after = await waitHp(c.uid, before);
    const hit = after.hp[c.uid] < before.hp[c.uid];
    const others = Object.keys(before.hp).filter((u) => u !== c.uid && after.hp[u] < before.hp[u]);
    const pressed = await ev("window.__pressed");
    if (pressed !== c.inst && retries < 5) { retries++; rec.harnessRetries = (rec.harnessRetries || 0) + 1; i--; await sleep(1500); continue; } // the press landed on a neighbour card that slid under the point: harness race, redo
    const ok = probe.arrowPx > 0 && probe.hover && probe.dragging && hit;
    if (ok) rec.pass++; else { rec.fail++; rec.fails.push({ i, probe, hit, others, uid: c.uid, want: c.inst, down: lastDown }); }
    if (others.length) rec.splash = (rec.splash || 0) + 1;
    await sleep(O.gap); // the next drag starts inside the fx window
  }
  // release in the empty field: nothing plays, the card goes home
  await sleep(2500);
  for (let i = 0; i < O.empty; i++) {
    await ev(topUp);
    let c = await pick(i);
    if (c && !touch && O.hover !== false) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.cx, y: c.cy, buttons: 0 }); await sleep(280); c = (await pick(i, c.inst)) || c; }
    if (!c) { rec.emptyFail++; rec.emptyFails.push({ i, why: "no card" }); continue; }
    const pt = await emptyPoint();
    const before = await state();
    await drag({ x: c.cx, y: c.cy }, pt);
    await sleep(70);
    const probe = await aimProbe("none");
    await pUp(pt.x, pt.y);
    await sleep(900);
    const after = await state();
    const back = await ev(`(()=>{const el=__q('.sp-hcard[data-inst="${c.inst}"]'); return !!el && !el.classList.contains('is-drag') && !el.classList.contains('is-sel') && el.isConnected;})()`);
    const ok = after.plays === before.plays && after.hand === before.hand && JSON.stringify(after.hp) === JSON.stringify(before.hp) && back && probe.arrowPx > 0;
    if (ok) rec.emptyPass++; else { rec.emptyFail++; rec.emptyFails.push({ i, before, after, back, probe }); }
  }
  rec.fails = rec.fails.slice(0, 5); rec.emptyFails = rec.emptyFails.slice(0, 3);
  out.scenarios[kind] = rec;
}
out.console = logs.slice(0, 10);
console.log(JSON.stringify(out));
ws.close(); p.kill();
