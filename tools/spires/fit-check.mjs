// One-screen fit check: every screen at 4 viewports -> no page scroll, no inner scrollbar that overflows (except the deck list), nothing drawn off-screen.
//   node tools/spires/fit-check.mjs [screen,screen...] [shotDir]      (dev server on :8766; fresh headless Chrome profile, muted)
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const only = (process.argv[2] || "").split(",").filter(Boolean), shotDir = process.argv[3] || "";
if (shotDir) mkdirSync(shotDir, { recursive: true });
const BASE = "http://127.0.0.1:8766/spiresofazeroth/";
const VPS = [[1920, 1080], [1536, 864], [1366, 768], [1280, 720]];
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = `[...document.querySelectorAll('button')].find(b=>/Essential only/.test(b.textContent))?.click(); const a=window.__spires; const R=await import('/spiresofazeroth/js/engine/run.js');
const mk=async(cls)=>{cls=cls||'warrior'; await a.data.loadClass(cls); a.data.setClass(cls); const run=R.newRun(a.data,{classId:cls,continent:'ek',seed:'shot1',heroic:0,pet:null}); a.run=run; await R.prepareZonePick(run,a.data); return run;};
const inMap=async(cls,fl)=>{const run=await mk(cls); await R.chooseZone(run,a.data,run.pending.options[0]); run.floor=fl; run.col=0; run.hp=Math.round(run.maxHp*0.7); return run;};
const pool=(run)=>a.data.classPool(run.classId).filter(c=>!c.token).slice(0,12);`;
const S = {
  title: `a.go('title')`,
  classSelect: `a.go('classSelect')`,
  zonepick: `const run=await mk(); a.route()`,
  map: `const run=await inMap('warrior',5); run.gold=132; run.relics.push(a.data.allRelics()[0].id); a.route()`,
  mapstart: `const run=await inMap('mage',-1); a.route()`,
  combat: `const run=await inMap('warrior',-1); const n=R.reachableNodes(run).find(x=>x.type==='fight')||R.reachableNodes(run)[0]; R.enterNode(run,a.data,n.col); a.route()`,
  reward: `const run=await inMap('paladin',3); const p=pool(run); run.gold=200; run.screen='reward'; run.pending={type:'reward',tier:'elite',gold:38,cards:[p[0].id,p[3].id,p[7].id],potion:[...a.data.potions.keys()][0],relics:[a.data.allRelics()[2].id],relicChoose:false,taken:{card:false,potion:false,relic:false},nodeTier:'elite'}; a.route()`,
  shop: `const run=await inMap('priest',6); run.gold=180; const m=await import('/spiresofazeroth/js/engine/rewards.js'); const r2=await import('/spiresofazeroth/js/engine/rng.js'); const shop=m.buildShop(run,a.data,r2.streamFor('s','shop')); run.screen='vendor'; run.pending={type:'vendor',shop}; a.route()`,
  rest: `const run=await inMap('druid',9); run.screen='rest'; run.pending={type:'rest',used:{}}; a.route()`,
  event: `const run=await inMap('hunter',4); const zone=a.data.zone(run.zoneId); const ev=(zone.events||[])[0]||a.data.eventsCommon[0]; run.seenEvents.push(ev.id); run.screen='event'; run.pending={type:'event',eventId:ev.id,source:(zone.events||[]).includes(ev)?'zone':'common',result:null}; a.route()`,
  codex: `a.go('codex')`,
  settings: `a.go('settings')`,
  runend: `const run=await inMap('warlock',8); run.stats={floors:23,fights:15,elites:3,bosses:1,kills:31,damageTaken:210,turns:70,goldEarned:511}; run.screen='end'; run.result='defeat'; run.pending={type:'end',cause:'Hogger'}; a.route()`,
};
const MEASURE = `(()=>{const vw=innerWidth,vh=innerHeight,de=document.documentElement;const bad=[];
const sig=(e)=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+'.'+String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className).trim().split(/\\s+/).slice(0,2).join('.');
for(const e of document.querySelectorAll('body *')){const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden')continue;
 if(/(auto|scroll)/.test(cs.overflowY+cs.overflowX)&&(e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1)&&e.clientHeight>0&&!e.closest('.sp-deckview,.sp-deck,[data-deck-list],.sx-decklist,dialog,.sp-modal'))bad.push('scroll:'+sig(e)+' '+e.scrollHeight+'/'+e.clientHeight);}
const ui=document.getElementById('stage-ui'); if(ui){for(const e of ui.querySelectorAll('*')){const r=e.getBoundingClientRect(); if(r.width<2||r.height<2)continue; const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue; if(e.closest('.sp-modal,dialog,.sp-hand,.sp-handfan,.sp-fx,.sp-orb,.sp-turnbanner,.sp-actors-region'))continue; if(e.classList.contains('spc')||e.closest('.spc'))continue;
 if(r.right>vw+3||r.bottom>vh+3||r.left<-3||r.top<-3){bad.push('off:'+sig(e)+' '+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.right)+','+Math.round(r.bottom)); if(bad.length>8)break;}}}
const end=document.querySelector('.sp-wowbtn--end'); if(end){const pl=[...document.querySelectorAll('.sp-eplate')]; for(const pp of pl){const pips=pp.querySelector('.sp-pips'); if(pips&&pips.children.length<10){for(let i=pips.children.length;i<10;i++){const d=document.createElement('span');d.className='sp-pip';pips.append(d);}}}
 const er=end.getBoundingClientRect(); for(const pp of pl){const r=pp.getBoundingClientRect(); if(r.width&&er.left<r.right&&er.right>r.left&&er.top<r.bottom&&er.bottom>r.top)bad.push('ENDTURN overlaps enemy plate '+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.right)+','+Math.round(r.bottom)+' vs '+Math.round(er.left)+','+Math.round(er.top));}}
return {sh:de.scrollHeight,sw:de.scrollWidth,vw,vh,bad:bad.slice(0,6)};})()`;
let dir, port, p, tabs;
for (let at = 0; at < 4 && !(tabs && tabs.some((t) => t.type === "page")); at++) {
  if (p) { try { p.kill(); } catch {} await sleep(500); }
  dir = mkdtempSync(join(tmpdir(), "spfit-")); port = 9300 + Math.floor(Math.random() * 600);
  p = spawn(chrome, [`--user-data-dir=${dir}`, "--headless=new", "--mute-audio", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", `--remote-debugging-port=${port}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some((t) => t.type === "page")) break; } catch {} await sleep(250); }
}
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) pend.get(d.id)(d.result); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? { err: ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || "").slice(0, 160) } : r.result.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.setItem('spires.sfx.muted','1')}catch(e){}" });
const rows = []; let fails = 0;
for (const [w, h] of VPS) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "?mute=1" }); for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!(window.__spires && window.__spires.data && document.querySelector('.sp-title-screen'))") === true) break; } await sleep(500);
  for (const [name, body] of Object.entries(S)) {
    if (only.length && !only.includes(name)) continue;
    const e = await ev(`(async()=>{${HEAD}\n${body.replace(/(a\.(?:route|go)\()/g, 'await $1')}; return 1})()`);
    await sleep(1500);
    if (shotDir && ((name === "map" && w === 1366) || (name === "combat" && w === 1280))) { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(shotDir, `${name}-${w}.png`), Buffer.from(s.data, "base64")); }
    const m = await ev(MEASURE);
    const ok = m && !m.err && m.sh <= h + 1 && m.sw <= w && !m.bad.length && !(e && e.err);
    if (!ok) fails++;
    rows.push(`${ok ? "PASS" : "FAIL"} ${String(w).padStart(4)}x${String(h).padEnd(4)} ${name.padEnd(11)} ${m && !m.err ? `doc ${m.sw}x${m.sh}` : "ERR"} ${(e && e.err) || ""} ${m && m.bad ? m.bad.join(" | ") : (m && m.err) || ""}`);
  }
}
console.log(rows.join("\n")); console.log(fails ? `FAILS: ${fails}` : "ALL PASS");
ws.close(); p.kill(); process.exit(fails ? 1 : 0);
