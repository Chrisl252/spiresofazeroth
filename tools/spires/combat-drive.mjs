// Real-input combat driver (headless Chrome over CDP, swiftshader WebGL, fresh profile; never the Claude-in-Chrome tab).
//   node tools/spires/combat-drive.mjs '{"cls":"warrior","zone":"elwynn","w":1920,"h":1080,"fights":1,"shotDir":"<dir>","shots":["lunge","hit"],"slow":0.3}'
// Starts a run through the real title/class/zone screens, walks the map to the first fight, then plays cards with REAL mouse events
// (click card, click enemy), ends turns, until the fight resolves. Reports console errors/warnings, frame ms during impacts and fight outcome.
// opts: pre(js) maxPlays(12, cards per turn) endShots[ms after End Turn] endShotTurn(0) cls zone w h mobile fights(1) shotDir shots[] (names: lunge|enemyhit|death|block|power|end) slow(fx/actors speed for shots, 0.25..1) port(8766) maxTurns(12)
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const O = { cls: "warrior", zone: "", w: 1920, h: 1080, mobile: false, fights: 1, shots: [], slow: 1, port: 8766, maxTurns: 12, ...JSON.parse(process.argv[2] || "{}") };
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dir, dport, p, tabs;
for (let attempt = 0; attempt < 4 && !(tabs && tabs.some((t) => t.type === "page")); attempt++) { // Chrome launch is occasionally flaky: retry on a fresh profile + port
  if (p) { try { p.kill(); } catch {} await sleep(500); }
  dir = mkdtempSync(join(tmpdir(), "spdrive-")); dport = 9600 + Math.floor(Math.random() * 300);
  p = spawn(chrome, [`--user-data-dir=${dir}`, "--headless=new", "--mute-audio", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${dport}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); if (tabs.some((t) => t.type === "page")) break; } catch {} await sleep(250); }
}
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = []; const sfxLogs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) pend.get(d.id)(d.result);
  else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "log" && String((d.params.args[0] || {}).value) === "[sfx]") sfxLogs.push(d.params.args.slice(1).map((a) => a.value).join(" "));
  else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") logs.push("LOG: " + d.params.entry.text + " " + (d.params.entry.url || ""));
  else if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) logs.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 240)}`);
  else if (d.method === "Runtime.exceptionThrown") logs.push("EXC: " + ((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text).slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : undefined; };
const click = async (x, y) => { for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }); };
const shot = async (name) => { if (!O.shotDir) return; mkdirSync(O.shotDir, { recursive: true }); const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(O.shotDir, `${name}.png`), Buffer.from(s.data, "base64")); console.log("shot", name); };
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: O.w, height: O.h, deviceScaleFactor: 1, mobile: !!O.mobile });
await send("Page.navigate", { url: `http://127.0.0.1:${O.port}/spiresofazeroth/?mute=1` }); await sleep(3500);
if (O.sfx) await send("Runtime.evaluate", { expression: `localStorage.setItem("spires.sfx.debug","1");localStorage.setItem("spires.sfx.muted","0")` });
await send("Runtime.evaluate", { expression: `localStorage.setItem("spires.meta.v1", JSON.stringify({ v: 1, unlocked: [], settings: { speed: "normal", sound: false, reducedMotion: null, unlockAll: true } }))` }); await send("Page.reload", {}); await sleep(3500); // all 9 classes playable on a fresh profile

const helpers = `window.__q=(s)=>document.querySelector(s); window.__all=(s)=>[...document.querySelectorAll(s)];
window.__rect=(el)=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};};
window.__byText=(t)=>__all('.sp-wowbtn,.sx-tog,button').find(b=>!b.disabled&&b.textContent.trim().startsWith(t));`;
await ev(helpers);
const clickSel = async (expr) => { const r = await ev(`(()=>{const el=(${expr}); if(el&&el.scrollIntoView)el.scrollIntoView({block:"center"}); return el? __rect(el):null})()`); if (!r) return false; await click(r.x, r.y); await sleep(300); return true; };

// ---- walk to the first fight
await clickSel(`__byText('Essential only')`); await clickSel(`__byText('Choose class')||__byText('New run')`); await sleep(1200);
await clickSel(`(__all('.sx-clsplate').filter(b=>!b.disabled).find(b=>b.textContent.toLowerCase().includes('${O.cls}'))||__all('.sx-clsplate').filter(b=>!b.disabled)[0])`);
if (O.debug) await shot('dbg-class');
await sleep(500); if (!(await clickSel(`__byText('Begin the climb')`))) { await sleep(1500); await clickSel(`__byText('Begin the climb')`); } await sleep(900);
let guard = 0;
async function toFight() {
  for (guard = 0; guard < 60; guard++) {
    const sc = await ev(`window.__spires.run&&window.__spires.run.screen`);
    if (sc === "combat") return true;
    if (sc === "end") return false;
    let ok = false;
    if (sc === "zonepick") ok = await clickSel(O.zone ? `(__all('.sx-zone').find(z=>z.textContent.toLowerCase().includes('${O.zone}'))||__q('.sx-zone'))` : `__q('.sx-zone')`);
    else if (sc === "map") ok = await clickSel(`__all('.sx-node.reach')[0]`);
    else if (sc === "reward" || sc === "treasure") { if (await clickSel(`__byText('Loot all')`)) await sleep(2500); await clickSel(`__all('.sx-loot .sx-plate:not(:disabled)').filter(p=>!p.classList.contains('sx-plate--static'))[0]`); ok = await clickSel(`__byText('Continue')||__byText('Skip')||__byText('Leave')`); }
    else if (sc === "vendor") ok = await clickSel(`__byText('Proceed')||__byText('Leave')`);
    else if (sc === "rest" || sc === "hub") { await clickSel(`__all('.sx-rest__opts .sx-plate:not(:disabled)')[0]`); ok = await clickSel(`__byText('Leave the fire')||__byText('Leave')`); }
    else if (sc === "event") { await clickSel(`__all('.ev-opt:not(:disabled)')[0]`); ok = await clickSel(`__byText('Continue')`); }
    else ok = await clickSel(`__q('.sx-plate:not(:disabled)')`);
    if (!ok) { await sleep(400); }
  }
  return false;
}

const out = { cls: O.cls, fights: [] };
const wantShots = new Set(O.shots);
for (let f = 0; f < O.fights; f++) {
  if (!(await toFight())) { out.fights.push({ note: "never reached combat", screen: await ev(`window.__spires.run&&window.__spires.run.screen`), html: await ev(`(document.querySelector("#stage-ui")||document.body).innerText.slice(0,160)`) }); break; }
  await sleep(2500); // kit boot
  if (O.slow < 1) await ev(`(()=>{const k=window.__spires.kit; if(k&&k.fx){k.fx.speed=${O.slow}; k.actors.setSpeed(${O.slow});}})()`);
  await ev(`window.__perf=[];(function loop(){let l=performance.now();function f(t){window.__perf.push(t-l);l=t;if(!window.__perfStop)requestAnimationFrame(f);}requestAnimationFrame(f);})()`);
  const info = await ev(`(()=>{const a=window.__spires,k=a.kit;return {enemies:a.C.enemies.map(e=>e.name+':'+e.hp),actors:!!(k&&k.actors),webgl:k&&k.actors?k.actors.stats().webgl:null,zone:a.run.zoneId}})()`);
  const rec = { info, turns: 0, plays: 0 };
  await shot("combat-start-" + O.cls);
  if (O.fs) { await clickSel(`__q('.sp-wowbtn--fs')`); await sleep(1800); rec.fs = await ev(`({fsEl:document.fullscreenElement&&document.fullscreenElement.className,w:innerWidth,h:innerHeight,stage:(r=>[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)])(document.getElementById('stage').getBoundingClientRect()),masthead:(m=>m?m.getBoundingClientRect().height>0&&getComputedStyle(m).visibility:null)(document.querySelector('header.site-header,.site-header,#masthead'))})`); await shot("fullscreen-" + O.cls); await ev(`document.exitFullscreen&&document.exitFullscreen()`); await sleep(600); }
  if (O.drag) { // real mouse drag: grab an attack card, carry it over a wolf (arrow + ring go red), screenshot, release
    const info2 = await ev(`(()=>{const hd=window.__spires.C.pile.hand;const cs=__all('.sp-hand .sp-hcard');const i=hd.findIndex(c=>c.def.type==='attack');const el=cs[i];if(!el)return null;const r=el.getBoundingClientRect();const en=__all('.sp-eplate:not(.dead) .sp-ehit').map(e=>{const q=e.getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height*0.55}});const hp0=window.__spires.C.enemies.map(e=>e.hp);
      let pt=null;for(let dy=14;dy<90&&!pt;dy+=10)for(let f=0.3;f<0.75&&!pt;f+=0.05){const x=r.left+r.width*f,y=r.top+dy;const t=document.elementFromPoint(x,y);if(t&&t.closest('.sp-hcard')===el)pt={x,y};}
      return {pt,en,hp0,n:hd.length}})()`);
    if (info2 && info2.pt && info2.en.length) {
      const { pt, en } = info2, tgt = en[Math.min(1, en.length - 1)];
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }); await sleep(250);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", buttons: 1, clickCount: 1 });
      const mid = { x: (pt.x + tgt.x) / 2, y: (pt.y + tgt.y) / 2 };
      for (let k = 1; k <= 14; k++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x + (tgt.x - pt.x) * k / 14, y: pt.y + (tgt.y - pt.y) * k / 14, button: "left", buttons: 1 }); await sleep(40); }
      await sleep(400);
      rec.drag = await ev(`({target:!!document.querySelector('.sp-eplate.is-target'),drag:!!document.querySelector('.sp-hcard.is-drag'),ring:document.querySelectorAll('.sa-ring.is-red').length})`);
      await shot("drag-over-" + O.cls);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: tgt.x, y: tgt.y, button: "left", buttons: 0, clickCount: 1 });
      await sleep(3500);
      rec.drag.after = await ev(`({hp:window.__spires.C.enemies.map(e=>e.hp),hand:window.__spires.C.pile.hand.length})`); rec.drag.before = { hp: info2.hp0, hand: info2.n };
    } else rec.drag = { note: "no drag point", info2 };
  }

  if (O.pre) await ev(O.pre);   // opts.pre: JS run once before the first turn (e.g. set the pet to 1 HP)
  for (let t = 0; t < O.maxTurns; t++) {
    if (t === 1 && O.pre1) await ev(O.pre1);   // opts.pre1: JS run at the start of the 2nd turn (e.g. revive the pet)
    for (let n = 0; n < (O.maxPlays || 12); n++) {
      const st = await ev(`(()=>{const a=window.__spires;if(a.C===null||document.querySelector('.sp-result'))return {over:true};const C=a.C;const locked=!!__q('.sp-hand.is-locked')||C.phase!=='player';
        const hd=C.pile.hand;const cards=__all('.sp-hand .sp-hcard').map((el,i)=>({i,nope:el.classList.contains('is-nope'),r:__rect(el),type:hd[i]&&hd[i].def.type,blk:!!(hd[i]&&JSON.stringify(hd[i].def.effects||[]).includes('"block"')),dead:C.enemies.filter(e=>e.hp<=0).length}));
        const en=__all('.sp-eplate:not(.dead) .sp-ehit').map(el=>__rect(el));return {over:false,locked,cards,en,energy:C.player.energy}})()`);
      if (!st || st.over) break;
      if (st.locked) { await sleep(250); continue; }
      const playable = st.cards.filter((c) => !c.nope);
      if (!playable.length) break;
      const want = wantShots.has("lunge") ? (c0) => c0.type === "attack" : wantShots.has("power") ? (c0) => c0.type === "power" : wantShots.has("block") ? (c0) => c0.type === "skill" && c0.blk : null;
      const pref = want ? playable.filter(want) : [];
      const pool = pref.length ? pref : playable;
      const c = pool[Math.floor(Math.random() * pool.length)];
      const deadBefore = st.cards.length ? st.cards[0].dead : 0;
      // find a point where THIS card is the top element (the fan overlaps neighbours), hover it so the card lifts, then click
      const pt = await ev(`(()=>{const el=__all('.sp-hand .sp-hcard')[${c.i}];const r=el.getBoundingClientRect();for(const fy of [0.3,0.15,0.45,0.6]){for(let x=r.left+6;x<r.right-6;x+=8){const y=r.top+r.height*fy;const t=document.elementFromPoint(x,y);if(t&&t.closest('.sp-hcard')===el)return {x,y};}}return null})()`);
      if (!pt) { await sleep(200); continue; }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }); await sleep(220);
      const pt2 = await ev(`(()=>{const el=__all('.sp-hand .sp-hcard')[${c.i}];const r=el.getBoundingClientRect();const t=document.elementFromPoint(${pt.x},${pt.y});return t&&t.closest('.sp-hcard')===el?{x:${pt.x},y:${pt.y}}:{x:r.left+r.width/2,y:r.top+r.height*0.35}})()`);
      await click(pt2.x, pt2.y);
      await sleep(250);
      const aim = await ev(`!!__q('.sp-hcard.is-aim')`);
      if (aim && st.en.length) { const e = st.en[Math.floor(Math.random() * st.en.length)]; await click(e.x, e.y - e.h * 0.25); }
      const after = await ev(`window.__spires.C?{h:window.__spires.C.pile.hand.length,e:window.__spires.C.player.energy,t:(__q('.sp-toast')||{}).textContent,ph:window.__spires.C.phase,sel:!!__q('.sp-hcard.is-sel')}:null`);
      (rec.log = rec.log || []).push(`${c.type}${aim ? "+aim" : ""}:${st.cards.length}->${after && after.h}|${st.energy}>${after && after.e}|${(after && after.t) || ""}|${after && after.ph}`);
      rec.plays++;
      for (const [nm, tp, ms] of [["lunge", "attack", 330], ["power", "power", 420], ["block", "skill", 300]]) if (wantShots.has(nm) && pref.length && c.type === tp) { await sleep(Math.round(ms / O.slow)); await shot(nm + "-" + O.cls); wantShots.delete(nm); }
      if (wantShots.has("death")) { await sleep(Math.round(500 / O.slow)); const dn = await ev(`window.__spires.C?window.__spires.C.enemies.filter(e=>e.hp<=0).length:0`); if (dn > deadBefore) { await sleep(Math.round(250 / O.slow)); await shot("death-" + O.cls); wantShots.delete("death"); } }
      await sleep(350);
      for (let w = 0; w < 40; w++) { const lk = await ev(`!!__q('.sp-hand.is-locked')`); if (!lk) break; await sleep(200); }
    }
    const over = await ev(`!!__q('.sp-result')||window.__spires.C===null`);
    if (over) break;
    await clickSel(`__q('.sp-wowbtn--end:not(:disabled)')`);
    rec.turns++;
    if (O.endShots && t === (O.endShotTurn || 0) && !(O.endShotTurn == null && false)) { let at = 0; for (const ms of O.endShots) { await sleep(Math.max(0, Math.round(ms / O.slow) - at)); at = Math.round(ms / O.slow); await shot(`endturn-${ms}`); } }
    if (wantShots.has("enemyhit")) { await sleep(Math.round(1500 / O.slow)); await shot("enemyhit-" + O.cls); wantShots.delete("enemyhit"); }
    for (let w = 0; w < 80; w++) { const bz = await ev(`window.__spires.C===null||!!__q('.sp-result')||(window.__spires.C.phase==='player'&&!__q('.sp-hand.is-locked'))`); if (bz) break; await sleep(250); }
  }
  const res = await ev(`(()=>{const a=window.__spires;return {over:!!__q('.sp-result'),text:(__q('.sp-result h2')||{}).textContent,hp:a.run&&a.run.hp}})()`);
  Object.assign(rec, res);
  const perf = await ev(`(()=>{const p=window.__perf.filter(x=>x>0);p.sort((a,b)=>a-b);return {frames:p.length,p50:p[Math.floor(p.length*.5)],p95:p[Math.floor(p.length*.95)],max:p[p.length-1],fx:(window.__spires.kit&&window.__spires.kit.fx&&window.__spires.kit.fx.stats())||null,act:(window.__spires.kit&&window.__spires.kit.actors&&window.__spires.kit.actors.stats())||null}})()`);
  rec.perf = perf;
  if (wantShots.has("end")) await shot("end-" + O.cls);
  out.fights.push(rec);
  if (O.fights > 1 && res.over) { await clickSel(`__byText('Continue')`); await sleep(500); }
}
if (O.eval) { await ev(O.eval); await sleep(O.evalWait || 3000); await shot("after-" + O.cls); out.after = await ev(O.after || "1"); }
out.console = logs.slice(0, 25);
if (O.sfx) out.sfx = { n: sfxLogs.length, kinds: sfxLogs.reduce((m, l) => (m[l.split(" ")[0]] = (m[l.split(" ")[0]] || 0) + 1, m), {}), sample: sfxLogs.slice(0, 14) };
console.log(JSON.stringify(out));
ws.close(); p.kill();
