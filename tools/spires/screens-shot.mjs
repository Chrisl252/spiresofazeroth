// Screenshots every non-combat screen at 1920x1080 and 390x844 by driving window.__spires. node tools/spires/screens-shot.mjs <outDir> [screen,screen...] [1920|390]
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const [outDir = "shots", only = "", vp = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const BASE = "htt<local path>";
const HEAD = `[...document.querySelectorAll('button')].find(b=>/Essential only/.test(b.textContent))?.click(); const a=window.__spires; const R=await import('/spiresofazeroth/js/engine/run.js');
const mk=async(cls)=>{cls=cls||'warrior'; await a.data.loadClass(cls); a.data.setClass(cls); const run=R.newRun(a.data,{classId:cls,continent:'ek',seed:'shot1',heroic:0,pet:null}); a.run=run; await R.prepareZonePick(run,a.data); return run;};
const inMap=async(cls,fl)=>{const run=await mk(cls); await R.chooseZone(run,a.data,run.pending.options[0]); run.floor=fl; run.col=0; run.hp=Math.round(run.maxHp*0.7); return run;};
const pool=(run)=>a.data.classPool(run.classId).filter(c=>!c.token).slice(0,12);`;
const S = {
  classSelect: `a.go('classSelect')`,
  petPick: `a.go('classSelect'); await new Promise(r=>setTimeout(r,800)); [...document.querySelectorAll('.sx-clsplate')].find(b=>/Hunter/.test(b.textContent))?.click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('.sx-pets')?.scrollIntoView({block:'start'}); const t=document.querySelectorAll('.sx-pet')[2]; if(t){const r=t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse',clientX:r.left+r.width/2,clientY:r.top+r.height/2}));}`,
  zonepick: `const run=await mk(); a.route()`,
  map: `const run=await inMap('warrior',5); run.gold=132; run.relics.push(a.data.allRelics()[0].id); a.route()`,
  mapstart: `const run=await inMap('mage',-1); a.route()`,
  mapshort: `const run=await mk('mage'); await R.chooseZone(run,a.data,'elwynn-forest'); a.route(); await new Promise(r=>setTimeout(r,600)); const sc=document.querySelector('.sx-map__scroll'); const sh=sc&&sc.firstElementChild; if(sh){sh.style.zoom='0.42'; sc.scrollTop=0;}`, // whole short (act 1) spire in one frame
  maphover: `const run=await inMap('warrior',-1); for(let i=0;i<4;i++){const n=R.reachableNodes(run)[i%2?0:R.reachableNodes(run).length-1]; R.enterNode(run,a.data,n.col); run.screen='map'; run.pending=null;} a.route(); await new Promise(r=>setTimeout(r,900)); document.querySelector('.sx-node.reach')?.dispatchEvent(new MouseEvent('mouseenter'))`,
  maptwo: `const run=await mk('priest'); const o=run.pending.options; await R.chooseZone(run,a.data,o[o.length-1]); a.route()`,
  treasure: `const run=await inMap('warrior',4); run.hp=Math.round(run.maxHp*0.7); const G=await import('/spiresofazeroth/js/engine/gear.js'); const gear=G.dropGear(run,a.data); run.gold=60; run.screen='treasure'; run.pending={type:'treasure',relic:null,gear,chest:'fight',gold:37,taken:false}; a.route(); await new Promise(r=>setTimeout(r,4200))`,
  treasureOpen: `const run=await inMap('warrior',4); run.hp=Math.round(run.maxHp*0.7); const G=await import('/spiresofazeroth/js/engine/gear.js'); const gear=G.dropGear(run,a.data); run.screen='treasure'; run.pending={type:'treasure',relic:null,gear,chest:'fight',gold:37,taken:false}; a.route(); await new Promise(r=>setTimeout(r,1500))`,
  treasureAfter: `const run=await inMap('warrior',4); run.hp=Math.round(run.maxHp*0.7); const G=await import('/spiresofazeroth/js/engine/gear.js'); const gear=G.dropGear(run,a.data); run.screen='treasure'; run.pending={type:'treasure',relic:null,gear,chest:'fight',gold:37,taken:false}; a.route(); await new Promise(r=>setTimeout(r,9000))`,
  loot: `const run=await inMap('paladin',3); const G=await import('/spiresofazeroth/js/engine/gear.js'); const gear=G.dropGear(run,a.data); const p=pool(run); run.screen='reward'; run.pending={type:'reward',tier:'normal',gold:24,cards:[p[0].id,p[3].id,p[7].id],potion:null,relics:[],relicChoose:false,gear,chest:'fight',taken:{card:false,potion:false,relic:false},nodeTier:'normal'}; a.route(); await new Promise(r=>setTimeout(r,4200))`,
  reward: `const run=await inMap('paladin',3); const p=pool(run); run.gold=200; run.screen='reward'; run.pending={type:'reward',tier:'elite',gold:38,cards:[p[0].id,p[3].id,p[7].id],potion:[...a.data.potions.keys()][0],relics:[a.data.allRelics()[2].id],relicChoose:false,taken:{card:false,potion:false,relic:false},nodeTier:'elite'}; a.route()`,
  bossreward: `const run=await inMap('rogue',14); const p=pool(run); run.screen='reward'; run.pending={type:'reward',tier:'boss',gold:90,cards:[p[1].id,p[4].id,p[8].id],potion:null,relics:a.data.allRelics().slice(3,6).map(r=>r.id),relicChoose:true,taken:{card:false,potion:false,relic:false},nodeTier:'boss'}; a.route()`,
  shop: `const run=await inMap('priest',6); run.gold=180; const rng={next:()=>0.5,int:(a1,b1)=>a1,pick:(l)=>l[0],chance:()=>false,weighted:(l)=>l[0]}; const m=await import('/spiresofazeroth/js/engine/rewards.js'); const r2=await import('/spiresofazeroth/js/engine/rng.js'); const shop=m.buildShop(run,a.data,r2.streamFor('s','shop')); run.screen='vendor'; run.pending={type:'vendor',shop}; a.route()`,
  rest: `const run=await inMap('druid',9); run.screen='rest'; run.pending={type:'rest',used:{}}; a.route()`,
  hub: `const run=await inMap('shaman',14); run.act=3; await R.leaveNode(run,a.data); R.proceedAfterSpire ? await R.proceedAfterSpire(run,a.data):0; a.route()`,
  event: `const run=await inMap('hunter',4); const rng=await import('/spiresofazeroth/js/engine/rng.js'); const zone=a.data.zone(run.zoneId); const ev=(zone.events||[])[0]||a.data.eventsCommon[0]; run.seenEvents.push(ev.id); run.screen='event'; run.pending={type:'event',eventId:ev.id,source:(zone.events||[]).includes(ev)?'zone':'common',result:null}; a.route()`,
  eventNpc: `const run=await inMap('hunter',4); await a.data.loadZone('dun-morogh'); run.zoneId='dun-morogh'; run.hp=Math.round(run.maxHp*0.7); run.screen='event'; run.pending={type:'event',eventId:'grelin-whitebeard',source:'zone',result:null}; a.route()`,
  eventPoster: `const run=await inMap('warrior',4); await a.data.loadZone('elwynn-forest'); run.zoneId='elwynn-forest'; run.screen='event'; run.pending={type:'event',eventId:'westbrook-wanted-poster',source:'zone',result:null}; a.route()`,
  eventSign: `const run=await inMap('mage',4); await a.data.loadZone('dustwallow-marsh'); run.zoneId='dustwallow-marsh'; run.screen='event'; run.pending={type:'event',eventId:'shady-rest-inn',source:'zone',result:null}; a.route()`,
  eventType: `window.__evTypeMs=70; const run=await inMap('hunter',4); await a.data.loadZone('dun-morogh'); run.zoneId='dun-morogh'; run.screen='event'; run.pending={type:'event',eventId:'grelin-whitebeard',source:'zone',result:null}; a.route()`,
  eventDone: `const run=await inMap('hunter',4); await a.data.loadZone('dun-morogh'); run.zoneId='dun-morogh'; run.screen='event'; run.pending={type:'event',eventId:'grelin-whitebeard',source:'zone',result:null}; a.route(); await new Promise(r=>setTimeout(r,1500)); document.querySelector('.ev-opt')?.click()`,
  runend: `const run=await inMap('warlock',8); run.stats={floors:23,fights:15,elites:3,bosses:1,kills:31,damageTaken:210,turns:70,goldEarned:511}; run.screen='end'; run.result='defeat'; run.pending={type:'end',cause:'Hogger'}; a.route()`,
  runwin: `const run=await inMap('warrior',14); run.act=6; run.stats={floors:90,fights:60,elites:12,bosses:6,kills:130,damageTaken:900,turns:300,goldEarned:2511}; run.screen='end'; run.result='victory'; run.pending={type:'end'}; a.route()`,
  codex: `a.go('codex')`,
  settings: `a.go('settings')`,
};
const sizes = vp ? [[+vp, vp === "390" ? 844 : 1080]] : [[1920, 1080], [390, 844]];
for (const [name, body] of Object.entries(S)) {
  if (only && !only.split(",").includes(name)) continue;
  for (const [w, h] of sizes) {
    const out = `${outDir}/${name}-${w}.png`;
    const r = spawnSync("node", ["tools/spires/shot.mjs", BASE, out, String(w), String(h), "3500", w < 600 ? "m" : ""], { env: { ...process.env, PRE: `(async()=>{${HEAD}\n${body}})()`, EVAL: process.env.EV_EVAL || "document.querySelector('.sx-screen')?document.querySelector('.sx-screen').className:'NO SCREEN'" }, encoding: "utf8" });
    console.log(name, w, (r.stdout || "").split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400), r.stderr ? r.stderr.slice(0, 200) : "");
  }
}
