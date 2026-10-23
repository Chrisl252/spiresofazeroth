// actors3d.js - Spires of Azeroth 3D actors layer (VISUAL_SPEC v2).
//
//   import { createActors } from "./actors3d.js";
//   const actors = createActors(stage.layers.actors, { designW: 1920, designH: 1080 });
//   actors.setHero({ classId: "mage", gearMask: 3 });  // gearMask (optional): n 0..8 or [slot ids] -> assets/models/hero/<class>-<n>.glb, crossfade swap on change
//   actors.setEnemies([{ uid, id, name, tier }]);
//   await actors.lunge(uid, targetUid, { onImpact }); actors.hit(uid, { amount }); ...
//   actors.anchor(uid) -> { x, y, chest:{x,y}, feet:{x,y}, top:{x,y}, height, width }   (stage px)
//
// One transparent WebGL canvas (orthographic 3/4-low camera, world unit = 1 stage px) sits between a DOM
// ground layer (contact shadows + targetable rings) and a DOM plate layer (silhouette fallback). Every
// actor is a "plate" actor (actorFallback.js) that can have a 3D skin attached: the plate is the shell that
// owns motion, ground marks and the choreography, so an enemy with no model, a model still loading or a
// model that fails all keep working (never invisible). GLB per actor is parsed fresh from a cached
// ArrayBuffer (no SkeletonUtils on the site's vendored three), so materials/skeletons are per instance.
// Render-on-demand: rAF runs only while tweens/mixers run (idle capped ~30 fps), pauses on hidden tab.
import { BUILD } from "../version.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createFallbackActor } from "./actorFallback.js";
import { dustPuff, motionScale } from "./actorMotion.js";
import { getZoneVisuals } from "./zonePalette.js";
import { createGround3d } from "./ground3d.js";

const PITCH = 12 * Math.PI / 180, COSP = Math.cos(PITCH);
const HEIGHT = { hero: 360, normal: 280, elite: 360, boss: 520, totem: 160 };
const MAXW = { hero: 260, normal: 270, elite: 330, boss: 600, totem: 140 };
const MODEL_BUDGET = 6, BUF_CACHE = 16;
const PX_PER_YD = 147, FLOOR = { normal: 0.5, elite: 0.66, boss: 0.78, totem: 0.75 };   // in-game scale: a 1.9 yd human = 280 px; small beasts stay small (floored), huge ones cap at the tier height
const CASTER_NAME = /mage|wizard|warlock|shaman|priest|acolyte|apprentice|neophyte|cultist|seer|witch|sorcer|conjur|necromanc|invoker|diviner|illusion|magus|oracle|summoner|enchant|druid|shade/i;
const RANGED_NAME = /archer|marksman|hunter|ranger|bowman|rifleman|gunner|cannoneer|headhunter|thrower|sniper|spitter/i;
const HERO_CASTERS = new Set(["mage", "warlock", "priest"]);
const ONESHOT = ["attack", "attack2", "cast", "shoot", "precast", "hit", "idle2"];
const DEFAULT_LANES = {
  hero: { x: 420, y: 760, s: 1 },
  enemy(i, n) {
    if (n <= 1) return { x: 1420, y: 764, s: 1 };
    if (n === 2) return [{ x: 1300, y: 768, s: 1 }, { x: 1540, y: 746, s: 0.96 }][i];
    if (n === 3) return [{ x: 1180, y: 770, s: 1 }, { x: 1420, y: 744, s: 0.95 }, { x: 1660, y: 770, s: 1 }][i];
    const x = 1080 + i * (640 / (n - 1));
    return { x, y: i % 2 ? 746 : 772, s: 0.88 };
  },
};

export function createActors(hostEl, opts = {}) {
  const W = opts.designW || 1920, H = opts.designH || 1080;
  const base = opts.base || new URL("../../", import.meta.url).href;
  const modelBase = opts.modelBase || "/assets/wowdex/models/";
  const iconBase = opts.iconBase || "/assets/icons/";
  const lanes = { ...DEFAULT_LANES, ...(opts.lanes || {}) };
  let theme = opts.theme || null;
  const classicYaw = opts.classicYaw || 0; // extra yaw (deg) if the Classic bake faces another way than the retail GLBs
  const frontYaw = (opts.frontYaw != null ? opts.frontYaw : 26) * Math.PI / 180;

  if (getComputedStyle(hostEl).position === "static") hostEl.style.position = "relative";
  const mk = (cls) => { const d = document.createElement("div"); d.className = cls; hostEl.appendChild(d); return d; };
  const groundL = mk("sa-ground"), canvasWrap = mk("sa-canvas"), platesL = mk("sa-plates"), fxL = mk("sa-fx");
  canvasWrap.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  for (const l of [groundL, platesL, fxL]) l.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`;

  // ---- renderer (null => everything stays on plates)
  let renderer = null, scene = null, camera = null, glLost = false;
  let hemiLight = null, keyLight = null, rimLight = null, sceneFog = null;
  let ground3d = null;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:block`;
    canvasWrap.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -4000, 6000);
    camera.position.set(0, 1800 * Math.sin(PITCH), 1800 * COSP);
    camera.lookAt(0, 0, 0);
    hemiLight = new THREE.HemisphereLight(0xfff0dc, 0x3a4152, 1.15);
    scene.add(hemiLight);
    keyLight = new THREE.DirectionalLight(0xffd7a0, 2.1);
    keyLight.position.set(-700, 1000, 800);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 100;
    keyLight.shadow.camera.far = 4000;
    keyLight.shadow.camera.left = -1400;
    keyLight.shadow.camera.right = 1400;
    keyLight.shadow.camera.top = 1000;
    keyLight.shadow.camera.bottom = -1000;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);
    rimLight = new THREE.DirectionalLight(0x78a4ff, 1.5);
    rimLight.position.set(600, 350, -900);
    scene.add(rimLight);
    sceneFog = null;
    scene.fog = null;
    ground3d = createGround3d(scene, { designW: W, designH: H, groundY: opts.groundY || 758 });
    // Context loss (tab switch / GPU pressure / too many live contexts): preventDefault so the browser may restore it; while it is gone the
    // DOM plates are shown for every actor so the fight is never invisible, and once restored three re-uploads everything and the plates hide again.
    renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); glLost = true; for (const a of byUid.values()) a.setVisible(true); });
    renderer.domElement.addEventListener("webglcontextrestored", () => { glLost = false; for (const a of byUid.values()) if (a.skin) a.setVisible(false); needRender = true; wake(); });
  } catch (err) { console.warn("[actors3d] WebGL unavailable, plates only:", err); renderer = null; }

  let curPR = 0;
  function fitResolution() {
    if (!renderer) return;
    const r = hostEl.getBoundingClientRect(); const sc = r.width / W || 1;
    const pr = Math.max(0.6, Math.min(2, sc * (window.devicePixelRatio || 1)));
    if (Math.abs(pr - curPR) > 0.02) { curPR = pr; renderer.setPixelRatio(pr); renderer.setSize(W, H, false); needRender = true; }
  }

  // ---- model map + buffer cache
  let models = {};
  let loaded = false;
  const idxBase = new URL("assets/models/", base).href; // Classic-bake tier (local GLBs from the Classic Era client)
  const cidx = { enemies: {}, byName: {}, byNpc: {}, heroes: {}, displays: {} };
  const fetchJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ready = Promise.all([
    // both tables carry the build cache-buster like every other game file: a deploy that re-maps a creature (2026-10-21: gnolls off the
    // orc body) was invisible to any browser that had cached the previous index
    fetchJson(new URL(`data/models.json?v=${BUILD}`, base)).then((j) => { if (j) models = j; else console.warn("[actors3d] models.json missing"); }),
    fetchJson(`${idxBase}index.json?v=${BUILD}`).then((j) => {
      if (!j) return;
      if (j.displays) { // final shape { displays, enemies, byName, heroes }
        Object.assign(cidx, { displays: j.displays, enemies: j.enemies || {}, heroes: j.heroes || {} });
        for (const [n, d] of Object.entries(j.byName || {})) cidx.byName[n.toLowerCase()] = d;
      } else { // proof-bake shape: flat { npcId: {glb,name,clips} }
        for (const [k, v] of Object.entries(j)) if (v && v.glb) { cidx.byNpc[k] = v; if (v.name) cidx.byName[v.name.toLowerCase()] = v; }
      }
    }),
  ]).then(() => { loaded = true; });
  const asEntry = (d) => (d == null ? null : typeof d === "object" ? d : cidx.displays[d] || null);
  function classicFor(id, name, npcId) {
    const e = asEntry(cidx.enemies[id]) || asEntry(cidx.byName[String(name || "").toLowerCase()]) || (npcId && cidx.byNpc[npcId]) || null;
    return e && e.glb ? e : null;
  }
  const warned = new Set();
  const warnOnce = (url, e) => { if (warned.has(url)) return; warned.add(url); console.warn("[actors3d] model tier failed, falling through:", url, e && e.message); };
  const bufs = new Map(); // fdid -> Promise<ArrayBuffer>
  // the game's own GLBs carry the build cache-buster too: a re-baked body at the same name (2026-10-21: the goblin
  // vendor's head) stayed hidden behind cached copies. The shared wowdex library is immutable per fdid, left as is.
  const bust = (url) => (url.startsWith(idxBase) ? `${url}${url.includes("?") ? "&" : "?"}v=${BUILD}` : url);
  function getBuf(url) {
    const fdid = url;
    if (bufs.has(fdid)) { const p = bufs.get(fdid); bufs.delete(fdid); bufs.set(fdid, p); return p; }
    const p = fetch(bust(url)).then((r) => { if (!r.ok) throw new Error("glb " + r.status); return r.arrayBuffer(); });
    bufs.set(fdid, p); p.catch(() => bufs.delete(fdid));
    while (bufs.size > BUF_CACHE) bufs.delete(bufs.keys().next().value);
    return p;
  }
  const loader = new GLTFLoader();
  const parse = (buf) => new Promise((res, rej) => loader.parse(buf.slice(0), "", res, rej));

  // ---- actors
  const byUid = new Map();
  let hero = null, needRender = true, raf = 0, last = 0, onscreen = true, paused = false;
  const stats = { frames: 0, renderMs: 0, loaded: 0, failed: 0 };

  function sizeClass(kind, tier, rec) {
    if (kind === "hero") return "hero";
    if (kind === "totem") return "totem";
    if (tier === "boss") return "boss";
    if (tier === "elite") return "elite";
    return (rec && rec.size) || "normal";
  }

  function makeActor(spec, kind) {
    const rec = spec.rec;
    const cls = sizeClass(kind, spec.tier, rec);
    const lane = spec.lane;
    const h = Math.min(HEIGHT[cls] * lane.s, cls === "hero" ? 1e9 : Math.max(200, lane.y - 300)); // integration: tallest enemy top never above y 300
    const facing = spec.facing != null ? spec.facing : kind === "hero" ? 1 : -1; // a friendly ally (hunter pet) is an enemy-class model facing right
    const cands = [];
    if (spec.glb) {
      const u = (spec.glb.startsWith("http") || spec.glb.startsWith("/")) ? spec.glb : (idxBase + spec.glb);
      cands.push({ url: u, tier: "classic", rec: {} });
    } else if (kind === "hero") { const cid = String(spec.id).replace("hero:", ""); const h = cidx.heroes[cid]; for (const u of heroGearUrls(cid, spec.gearN)) cands.push({ url: u, tier: "classic", rec: {} }); cands.push({ url: idxBase + ((h && h.glb) || "hero-" + cid + ".glb"), tier: "classic", rec: {} }); }
    else { const e = classicFor(spec.id, spec.name, rec && rec.npcId); if (e) cands.push({ url: idxBase + e.glb, tier: "classic", rec: {} }); }
    if (rec && rec.fdid) cands.push({ url: modelBase + rec.fdid + ".glb", tier: "retail", rec });
    const hasModel = !!renderer && cands.length > 0 && !(opts.forcePlate && kind !== "hero");
    const a = createFallbackActor({ plates: platesL, ground: groundL, fx: fxL }, {
      uid: spec.uid, id: spec.id, x: lane.x, y: lane.y, h, facing, theme,
      family: rec && rec.family, type: rec && rec.type, icon: spec.icon || (rec && rec.icon) || null, iconBase,
      shape: kind === "hero" ? "biped" : undefined,
    }, wake);
    a.laneS = lane.s; a.kindOf = kind; a.cls = cls; a.skin = null; a.rec = rec; a.cands = cands; a.name = spec.name; a.dead = false;
    const baseLunge = a.lunge, baseDeath = a.death, baseHit = a.hit, baseCastGesture = a.castGesture;
    // In-game clips: Stand loops, Attack / Cast / Hit play once over a faded idle, Death clamps.
    // Caster attacks stay planted and release spells, melee attacks spring forward dynamically.
    const isCaster = (o = {}) => {
      if (o.spell || o.cast || o.ranged || o.shoot) return true;
      if (kind === "hero") return !a.form && (HERO_CASTERS.has(a.heroClass) || o.spell || o.cast || o.ranged || o.shoot);
      return CASTER_NAME.test(a.name || "") || RANGED_NAME.test(a.name || "") || o.spell || o.cast || o.ranged || o.shoot;
    };
    a.lunge = async (t, o = {}) => {
      const sk = a.skin;
      const caster = isCaster(o);

      if (!sk || !sk.mixer) return baseLunge(t, { ...o, cast: caster, spell: caster, ranged: caster });

      const key = (o.ranged || o.shoot) ? (sk.clips.shoot || sk.clips.cast || sk.clips.attack)
        : (caster && sk.clips.cast) ? "cast"
        : (sk.clips.attack2 && Math.random() < 0.4 ? "attack2" : (sk.clips.attack ? "attack" : (sk.clips.cast ? "cast" : null)));

      if (caster) {
        // Caster / ranged stance: stay planted, windup gather, forward spell release recoil, recover
        const IMPACT_MS = 380;
        if (sk.clips.precast) { const pm = playOnce(sk, "precast", 2.2); await a.motion.wait(Math.min(200, pm)); }
        if (key && sk.clips[key]) playOnce(sk, key, 0, IMPACT_MS / 0.45);
        wake();
        await baseLunge(t, { ...o, cast: true, spell: true, ranged: true, onImpact: o.onImpact });
        return;
      }

      // Melee attack: Hero melee or Enemy melee
      if (kind === "hero") {
        if (sk.clips.attack) setTimeout(() => { if (a.skin === sk && !a.dead) playOnce(sk, "attack", 1.15); }, 80);
        return baseLunge(t, o);
      }

      // Enemy Melee Lunge: dynamic forward spring with real weight!
      if (key && sk.clips[key]) setTimeout(() => { if (a.skin === sk && !a.dead) playOnce(sk, key, 1.2); }, 60);
      wake();
      return baseLunge(t, o);
    };
    a.castGesture = async (o = {}) => {
      const sk = a.skin;
      const key = (sk && (sk.clips.cast || sk.clips.attack)) ? (sk.clips.cast ? "cast" : "attack") : null;
      if (sk && key && !a.dead) playOnce(sk, key, 1.4);
      wake();
      return baseCastGesture ? baseCastGesture(o) : a.statusPulse(o && o.color);
    };
    a.hit = (o = {}) => {
      const sk = a.skin;
      if (sk && sk.clips.hit && !a.dead) playOnce(sk, "hit", 1.25);
      return baseHit({ ...o, knock: sk && sk.clips.hit ? 0.75 : 1 });
    };
    a.death = async (o = {}) => {
      a.dead = true;
      if (a.highlight) a.highlight(false);
      if (a.hover) a.hover(false);
      a.motion.s.glow = 0; a.motion.s.flash = 0;
      const sk = a.skin, c = sk && sk.clips && sk.clips.death;
      if (sk) {
        sk.dying = true;
        for (const k of ["idle", ...ONESHOT]) if (sk.clips[k]) sk.clips[k].fadeOut(0.1);
        if (c) {
          c.reset().setEffectiveTimeScale(Math.max(1, c.getClip().duration / 1.05) * (motionScale.v || 1)).setEffectiveWeight(1).fadeIn(0.08).play();
          c.clampWhenFinished = true;
          wake();
          await a.motion.wait(Math.min(1100, c.getClip().duration * 1000));
        } else {
          // Model has no dedicated death clip: tip onto ground as a corpse
          const sg = a.kindOf === "hero" ? -1 : 1;
          await Promise.all([
            a.motion.tween("rot", 76 * sg, 520, "out"),
            a.motion.tween("y", Math.max(30, a.baseH() * 0.22), 520, "in"),
          ]);
        }
        dustPuff(fxL, a.baseXY().x, a.baseXY().y, a.baseH() * 0.6);
        if (o && o.fade) await a.motion.tween("alpha", 0, 450, "lin");
        return;
      }
      return baseDeath(o);
    };
    if (hasModel) {
      a.setVisible(false); // plate only shows if the model is slow (>250 ms) or fails
      const t = setTimeout(() => { if (!a.skin && !a.disposed && !(kind === "hero")) a.setVisible(true); }, 250);
      a._t = t;
      attachSkin(a, cands, cls, facing);
    }
    byUid.set(spec.uid, a);
    wake();
    return a;
  }

  function distinctFdids() { const s = new Set(); for (const a of byUid.values()) if (a.cands && a.cands.length && !a.skinFailed) s.add(a.cands[0].url); return s; }

  // Tiers in order: classic bake -> retail match -> (caller keeps the plate). A bad GLB never fails a fight.
  async function attachSkin(a, cands, cls, facing) {
    if (distinctFdids().size > MODEL_BUDGET) { a.skinFailed = true; a.setVisible(true); return; }
    for (const c of cands) {
      try { await tryAttach(a, c, cls, facing); if (a.skin || a.disposed) return; }
      catch (e) { stats.failed++; warnOnce(c.url, e); }
    }
    a.skinFailed = true; if (!a.disposed) a.setVisible(true);
  }

  async function tryAttach(a, cand, cls, facing) {
    const rec = cand.rec || {};
    const buf = await getBuf(cand.url);
    if (a.disposed) return;
    const gltf = await parse(buf);
    if (a.disposed) { disposeTree(gltf.scene); return; }
    if (!hasTexture(gltf.scene)) { disposeTree(gltf.scene); throw new Error("untextured"); } // untextured => white blob => next tier
    const root = gltf.scene;
    const mats = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = false;
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        if (bb) {
          const dy = bb.max.y - bb.min.y, dx = bb.max.x - bb.min.x;
          if (dy > 0 && dy < 0.05 && dx > 0.45) { o.visible = false; return; }
        }
      }
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        const im = m.map && m.map.image;
        if (!(im && (im.width || im.naturalWidth) > 0)) {
          const matName = (m.name || "").toLowerCase();
          if (/tex-?20\b|cloth|vest|pant/i.test(matName)) {
            m.color.set("#4e3620");
            m.transparent = false;
            m.alphaTest = 0;
            o.visible = true;
          } else if (/tex-?6\b|hair|beard/i.test(matName)) {
            m.color.set("#23180d");
            m.transparent = false;
            m.alphaTest = 0;
            o.visible = true;
          } else if (/tex-?19\b|pierc|ring|access|metal/i.test(matName)) {
            m.color.set("#c89f3c");
            m.transparent = false;
            m.alphaTest = 0;
            o.visible = true;
          } else if (rec.skin && !m.transparent && !m.alphaTest) {
            m.color.set(rec.skin);
            o.visible = true;
          } else {
            o.visible = false;
            return;
          }
        }
        if (mats.some((x) => x.m === m)) return;
        mats.push({ m, op: m.opacity, tr: m.transparent, col: m.color ? m.color.clone() : null, em: m.emissive ? m.emissive.clone() : null });
        if (m.map) m.map.anisotropy = 4;
        if (cand.tier === "classic" || rec.type === "goblin") m.side = THREE.DoubleSide; // baked Classic meshes or goblins
        if (m.transparent) {
          m.depthWrite = true;
          m.alphaTest = Math.max(0.05, m.alphaTest || 0);
        }
        if ("metalness" in m) { m.metalness = 0; m.roughness = Math.max(0.85, m.roughness || 0); }
      });
    });
    const model = new THREE.Group(); model.add(root);
    model.rotation.y = (facing > 0 ? -frontYaw : Math.PI + frontYaw) + ((cand.tier === "classic" ? classicYaw : 0) + (rec.yaw || 0)) * Math.PI / 180;
    const fit = new THREE.Group(); fit.add(model);
    const pivot = new THREE.Group(); pivot.add(fit);
    const group = new THREE.Group(); group.add(pivot);
    let mixer = null; const clips = {};
    const anims = gltf.animations || [];
    const sk0 = { clips, cur: null, dying: false, nextVar: performance.now() + 4000 + Math.random() * 6000 };
    if (anims.length) {
      mixer = new THREE.AnimationMixer(root);
      const find = (re) => anims.find((c) => re.test(c.name));
      const idle = find(/^idle$/i) || find(/^(idle|stand)/i) || find(/stand|idle|breath/i) || (cand.tier === "retail" ? anims[0] : null);
      if (idle) { const act = mixer.clipAction(idle); act.play(); act.time = Math.random() * idle.duration; clips.idle = act; }
      for (const [k, re] of [["attack", /^attack$/i], ["attack2", /^attack2$/i], ["cast", /^cast$/i], ["shoot", /^(shoot|bow|rifle|gun|range)/i], ["precast", /^precast$/i], ["hit", /^hit$/i], ["idle2", /^idle2$/i], ["death", /^(death|die)/i]]) {
        const c = find(re) || (k === "attack" ? find(/^attack/i) : null); if (!c) continue;
        const act = mixer.clipAction(c); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; clips[k] = act;
      }
      mixer.addEventListener("finished", (e) => {
        if (sk0.dying || e.action === clips.death) return;
        if (ONESHOT.some((k) => clips[k] === e.action) && clips.idle) { e.action.fadeOut(0.14); clips.idle.reset().fadeIn(0.16).play(); if (sk0.cur === e.action) sk0.cur = null; }
      });
      mixer.update(0);
    }
    group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o, true); });
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) throw new Error("empty bbox");
    if (a.kindOf !== "hero") { // in-game scale: native model height in yards x PX_PER_YD, floored by tier so a rat is small but a boss is never a speck
      const full = a.baseH(), nat = size.y * PX_PER_YD, h2 = Math.max(full * (FLOOR[a.cls] || 0.5), Math.min(full, nat));
      if (Math.abs(h2 - full) > 1) { const bb = a.baseXY(); a.setBase(bb.x, bb.y, h2); }
    }
    const targetH = a.baseH();
    let k = targetH / (size.y * COSP);
    const maxW = (a.form ? 420 : MAXW[cls]) * (targetH / HEIGHT[cls]);
    if (size.x * k > maxW) k = maxW / size.x;
    k *= rec.scale || 1;
    fit.scale.setScalar(k);
    fit.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
    scene.add(group);
    a._gw = Math.max(a.baseH() * 0.38, Math.min(size.x * k, a.baseH() * 1.1)) * 0.85; a.setGroundW(a._gw);
    Object.assign(sk0, { fit, group, pivot, mixer, mats, born: performance.now(), k, phase: Math.random() * 6.28, hasClip: !!clips.idle, tier: cand.tier, size: size.y * k });
    a.skin = sk0;
    a.kind = "model"; a.setVisible(glLost); clearTimeout(a._t);
    stats.loaded++;
    needRender = true; wake();
  }

  // dressing lane (GEAR_SPEC 3): assets/models/hero/<class>-<n>.glb, n = equipped ordered slots 0..8; a missing state falls to the nearest lower one
  const HERO_SLOTS = ["mainHand", "chest", "legs", "head", "shoulder", "hands", "feet", "waist"];
  function gearCount(mask) { // mask: array / object of equipped slot ids, or a number n
    if (typeof mask === "number") return Math.max(0, Math.min(8, mask | 0));
    const has = Array.isArray(mask) ? (k) => mask.includes(k) : (k) => !!(mask && mask[k]);
    return HERO_SLOTS.filter((k) => has(k) || (k === "waist" && has("wrist"))).length;
  }
  function heroGearUrls(cid, n) { const o = []; if (n == null) return o; for (let i = n; i >= 0; i--) o.push(idxBase + "hero/" + cid + "-" + i + ".glb"); return o; }
  async function swapHeroSkin(a, cands) { // crossfade (300 ms) old -> new body with a gold flash; keeps the old body if the new one fails
    const old = a.skin; a.skin = null; a.skinFailed = false; a.cands = cands;
    a.motion.s.glowColor = "#ffd24a"; a.motion.tween("glow", 1, 90, "out").then(() => a.motion.tween("glow", 0, 380, "in")); a.motion.tween("flash", 0.45, 90, "out").then(() => a.motion.tween("flash", 0, 260, "in"));
    await attachSkin(a, cands, "hero", 1);
    if (!old) return;
    if (!a.skin) { a.skin = old; return; }
    const t0 = performance.now(); const step = (now) => {
      const f = Math.min(1, (now - t0) / 300);
      for (const e of old.mats) { e.m.transparent = true; e.m.opacity = e.op * (1 - f); }
      if (f < 1 && !a.disposed) { requestAnimationFrame(step); needRender = true; wake(); } else { scene.remove(old.group); disposeTree(old.group); if (old.mixer) old.mixer.stopAllAction(); needRender = true; }
    }; requestAnimationFrame(step);
  }

  function hasTexture(root) {
    let any = false;
    root.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        const im = m && m.map && m.map.image;
        if (im && (im.width || im.naturalWidth) > 0) any = true;
      });
    });
    return any;
  }
  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k in m) if (m[k] && m[k].isTexture) { if (m[k].image && m[k].image.close) try { m[k].image.close(); } catch (e) { /* noop */ } m[k].dispose(); }
        m.dispose();
      });
    });
  }

  function destroy(a) {
    a.disposed = true; clearTimeout(a._t);
    if (a.skin) { scene.remove(a.skin.group); disposeTree(a.skin.group); if (a.skin.mixer) a.skin.mixer.stopAllAction(); a.skin = null; }
    a.dispose();
    byUid.delete(a.uid);
    needRender = true;
  }

  // ---- per-frame skin update
  const tmp = new THREE.Color();
  // Play a one-shot clip over a faded-out idle (never blended 50/50 with Stand). speed = time scale; forMs = fit the clip to that many ms.
  // Returns the playing length in ms.
  function playOnce(sk, key, speed, forMs) {
    const c = sk.clips[key]; if (!c || !sk.mixer || sk.dying) return 0;
    const len = c.getClip().duration * 1000;
    const ts = forMs ? Math.max(1, len / forMs) : (speed || 1);
    for (const k of ONESHOT) { const o = sk.clips[k]; if (o && o !== c && o.isRunning()) o.fadeOut(0.08); }
    if (sk.clips.idle) sk.clips.idle.fadeOut(0.1);
    c.reset().setEffectiveTimeScale(ts * (motionScale.v || 1)).setEffectiveWeight(1).fadeIn(0.08).play();
    sk.cur = c; sk.nextVar = performance.now() + 5000 + Math.random() * 8000; needRender = true; wake();
    return len / ts;
  }

  function updateSkin(a, now, dt) {
    const sk = a.skin; if (!sk) return;
    const s = a.motion.s, b = a.baseXY();
    if (sk.clips.idle2 && !sk.cur && !sk.dying && !a.dead && now > sk.nextVar) playOnce(sk, "idle2", 1); // Stand variation every few seconds
    if (sk.mixer) sk.mixer.update(dt);
    const t = now / 1000 + sk.phase;
    let sy = s.sy * (1 + s.hover * 0.03), sx = s.sx * (1 + s.hover * 0.03), sway = 0, rz = 0;
    if (!sk.hasClip && !a.dead) { const br = Math.sin(t * Math.PI * 2 / 1.6); sy *= 1 + 0.012 * br; sx *= 1 - 0.004 * br; sway = Math.sin(t * Math.PI * 2 / 4.2) * 2.5; rz = Math.sin(t * Math.PI * 2 / 4.2) * 0.012; }
    sk.group.position.set(b.x + s.x + sway - W / 2, (H / 2 - (b.y + s.y)) / COSP, (b.y - 700) * 0.5);
    sk.pivot.rotation.z = -s.rot * Math.PI / 180 + rz;
    sk.pivot.scale.set(sx, sy, sx);
    const fade = Math.min(1, (now - sk.born) / 260);
    const alpha = s.alpha * fade;
    // flash / glow / hover as emissive (or colour boost on basic materials)
    const fl = Math.min(1, s.flash), gl = s.glow, hv = s.hover * 0.1;
    tmp.set(s.glowColor);
    const gk = gl * 0.4; // glow stays a tint, flash is the full white pop
    const er = Math.min(1, fl + tmp.r * gk + hv), eg = Math.min(1, fl + tmp.g * gk + hv * 0.85), eb = Math.min(1, fl + tmp.b * gk + hv * 0.6);
    for (const e of sk.mats) {
      const m = e.m;
      if (m.emissive) { m.emissive.setRGB(e.em.r + er, e.em.g + eg, e.em.b + eb); m.emissiveIntensity = 1; }
      else if (m.color && e.col) m.color.setRGB(e.col.r * (1 + er * 3), e.col.g * (1 + eg * 3), e.col.b * (1 + eb * 3));
      const tr = alpha < 0.999 || e.tr;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = e.op * alpha;
    }
    sk.group.visible = alpha > 0.003;
  }

  // ---- loop
  function wake() { if (!raf && !paused && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (paused || document.hidden) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    let tweening = false, hasSkin = false;
    for (const a of byUid.values()) {
      const was = a._busy; const busy = a.motion.update(now);
      if (busy) tweening = true;
      if (busy || was) a.tick();
      a._busy = busy;
      if (a.skin) hasSkin = true;
    }
    if (renderer && onscreen && (tweening || needRender || hasSkin)) {
      if (tweening || needRender || now - last > 30) {
        fitResolution();
        const t0 = performance.now();
        for (const a of byUid.values()) updateSkin(a, now, dt);
        if (ground3d) ground3d.update(now, dt);
        renderer.render(scene, camera);
        stats.frames++; stats.renderMs += performance.now() - t0;
        needRender = false; last = now;
      }
    } else if (!hasSkin) last = 0;
    if (tweening || hasSkin) raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    last = 0;
    if (document.hidden) return;
    try { if (renderer && !glLost && renderer.getContext().isContextLost()) { glLost = true; for (const a of byUid.values()) a.setVisible(true); } } catch (_) { /* noop */ }
    needRender = true; wake();
  });
  window.addEventListener("resize", () => { needRender = true; wake(); });
  if (window.IntersectionObserver) new IntersectionObserver((en) => { onscreen = en[0].isIntersecting; if (onscreen) { needRender = true; wake(); } }).observe(hostEl);

  // ---- public API
  function rec(key) { return models[key] || null; }
  let pendingHeroForm = null;
  function setHeroForm(form) {
    if (!loaded || !hero) {
      pendingHeroForm = form;
      if (!loaded) ready.then(() => { if (pendingHeroForm !== null) setHeroForm(pendingHeroForm); });
      return;
    }
    pendingHeroForm = null;
    const nextForm = (form === "none" || form === "caster" || !form) ? null : form;
    if (hero.form === nextForm) return;
    hero.form = nextForm;
    let cands;
    if (nextForm === "cat") {
      cands = [
        { url: idxBase + "8571.glb", tier: "classic", rec: { scale: 1.05 } },
        { url: idxBase + "892.glb", tier: "classic", rec: { scale: 0.95 } }
      ];
    } else if (nextForm === "bear") {
      cands = [
        { url: idxBase + "2281.glb", tier: "classic", rec: { scale: 1.0 } },
        { url: idxBase + "719.glb", tier: "classic", rec: { scale: 0.95 } }
      ];
    } else if (nextForm === "moonkin") {
      cands = [
        { url: idxBase + "15374.glb", tier: "classic", rec: { scale: 1.05 } },
        { url: idxBase + "15375.glb", tier: "classic", rec: { scale: 1.15 } }
      ];
    } else {
      const cid = hero.heroClass || "druid";
      const h = cidx.heroes[cid];
      cands = heroGearUrls(cid, hero.gearN).map((url) => ({ url, tier: "classic", rec: {} }));
      cands.push({ url: idxBase + ((h && h.glb) || "hero-" + cid + ".glb"), tier: "classic", rec: {} });
    }
    swapHeroSkin(hero, cands);
  }

  // setHero/setEnemies are synchronous once `await actors.ready` has resolved (models.json loaded); before that
  // they queue and return null.
  function setHero(o = {}) { if (!loaded) { ready.then(() => setHero(o)); return null; } return doSetHero(o); }
  function setEnemies(l) { if (!loaded) { ready.then(() => setEnemies(l)); return null; } return doSetEnemies(l); }
  function doSetHero({ classId, name, gearMask } = {}) {
    const gearN = gearMask == null ? null : gearCount(gearMask);
    if (hero && hero.heroClass === classId && hero.skin && gearN != null && hero.gearN !== gearN) { // same class, new gear: swap the body in place
      hero.gearN = gearN;
      if (!hero.form) {
        swapHeroSkin(hero, heroGearUrls(classId, gearN).map((url) => ({ url, tier: "classic", rec: {} })).concat(hero.cands.slice(-1)));
      }
      return hero;
    }
    if (hero) destroy(hero);
    const lane = { ...lanes.hero };
    const a = makeActor({ uid: "player", id: "hero:" + classId, name: name || classId, lane, rec: rec("hero:" + classId), gearN }, "hero");
    a.heroClass = classId; a.gearN = gearN; a.form = null;
    a.dead = false; hero = a;
    if (pendingHeroForm) {
      const pf = pendingHeroForm;
      pendingHeroForm = null;
      setHeroForm(pf);
    }
    return a;
  }
  function doSetEnemies(list) {
    for (const a of [...byUid.values()]) if (a !== hero && a.uid !== "pet" && !String(a.uid).startsWith("totem")) destroy(a);
    const n = list.length; const out = [];
    list.forEach((e, i) => {
      const lane = lanes.enemy(i, n);
      const r = rec(e.id);
      out.push(makeActor({ uid: e.uid, id: e.id, name: e.name, tier: e.tier, icon: e.icon, lane, rec: r && r.match ? r : (r || null) }, "enemy"));
    });
    return out;
  }
  // integration: add one enemy mid-fight (summons) without disturbing the others; n = enemy count including the new one
  function addEnemy(e, i, n) {
    if (!loaded) return null;
    if (byUid.has(e.uid)) return byUid.get(e.uid);
    const r = rec(e.id);
    return makeActor({ uid: e.uid, id: e.id, name: e.name, tier: e.tier, icon: e.icon, lane: lanes.enemy(i, n), rec: r || null }, "enemy");
  }
  // layout-fix: re-lay out the enemy side after a mid-fight summon. list = [{ uid, alive }] in C.enemies order. Living enemies take slots 0..m-1 of m
  // (lanes.enemy(i, m)), re-scaled to the slot's size; dead ones keep NO slot and fade out so a corpse never renders over a living model.
  function layoutEnemies(list) {
    const liveL = list.filter((x) => x.alive && byUid.get(x.uid)), m = liveL.length;
    liveL.forEach((x, i) => {
      const a = byUid.get(x.uid); if (a._gone && !a.dead && a.motion && a.motion.tween) { a._gone = false; a.motion.tween("alpha", 1, 200, "out"); } // revived: re-enter the layout visibly
      const L = lanes.enemy(i, m), ratio = a.laneS ? L.s / a.laneS : 1, bb = a.baseXY();
      a.setBase(L.x, L.y, bb.h * ratio); a.laneS = L.s;
      if (a.disposed) return;
      if (a.dead) return;
      const sk = a.skin;
      if (sk && sk.fit && Math.abs(ratio - 1) > 1e-3) { sk.fit.scale.multiplyScalar(ratio); sk.fit.position.multiplyScalar(ratio); sk.size *= ratio; if (a._gw) { a._gw *= ratio; a.setGroundW(a._gw); } }
    });
    for (const x of list) { const a = byUid.get(x.uid); if (a && !x.alive && a !== hero && a.motion && a.motion.tween && !a._gone) { a._gone = true; a.motion.tween("alpha", 0, 300, "out"); } }
    needRender = true; wake();
  }
  // friendly companion (hunter Guardian pet, shaman totem): the model of enemy-key `e.id` or `e.glb`, facing right, at `e.lane` ({x,y,s})
  function addAlly(e) {
    if (!loaded) return null;
    if (byUid.has(e.uid)) return byUid.get(e.uid);
    const r = rec(e.id);
    return makeActor({ uid: e.uid, id: e.id, name: e.name, tier: e.tier || "normal", icon: e.icon, lane: e.lane, glb: e.glb, rec: r || null, facing: e.facing != null ? e.facing : 1 }, e.kind || "enemy");
  }
  function remove(uid) { const a = byUid.get(uid); if (a) destroy(a); }
  const need = (uid) => { const a = byUid.get(uid); if (!a) console.warn("[actors3d] unknown uid", uid); return a; };
  let currentZoneId = opts.zone || "default";
  function setZone(zoneId, o = {}) {
    currentZoneId = zoneId;
    const vis = getZoneVisuals(zoneId, o);
    if (vis && vis.theme) api.setTheme(vis.theme);
    if (!renderer) return vis;
    if (hemiLight) {
      hemiLight.color.set(vis.lighting.hemiSky);
      hemiLight.groundColor.set(vis.lighting.hemiGround);
      hemiLight.intensity = vis.lighting.hemiIntensity;
    }
    if (keyLight) {
      keyLight.color.set(vis.lighting.sunColor);
      keyLight.intensity = vis.lighting.sunIntensity;
    }
    if (rimLight) {
      rimLight.color.set(vis.lighting.rimColor);
      rimLight.intensity = vis.lighting.rimIntensity;
    }
    if (sceneFog) {
      sceneFog.color.set(vis.lighting.fogColor);
      sceneFog.near = vis.lighting.fogNear;
      sceneFog.far = vis.lighting.fogFar;
    }
    if (ground3d) {
      ground3d.setZone(vis);
    }
    needRender = true;
    wake();
    return vis;
  }

  function setParallax(px, py) {
    if (!renderer) return;
    if (camera) {
      camera.position.x = px * 0.35;
      camera.lookAt(px * 0.35, 0, 0);
    }
    if (ground3d) {
      ground3d.setParallax(px, py);
    }
    needRender = true;
    wake();
  }

  function setGround(gy) {
    if (ground3d) ground3d.setGround(gy);
    needRender = true;
    wake();
  }

  function setGroundVisible(v) {
    if (ground3d) ground3d.setVisible(v);
    needRender = true;
    wake();
  }

  const api = {
    ready, lanes, setHero, setHeroForm, setEnemies, addEnemy, layoutEnemies, addAlly, remove,
    setZone, setParallax, setGround, setGroundVisible,
    get ground() { return ground3d; },
    get zone() { return currentZoneId; },
    setSpeed(v) { motionScale.v = Math.max(0.25, Math.min(4, +v || 1)); },
    get: (uid) => byUid.get(uid) || null,
    uids: () => [...byUid.keys()],
    lunge(uid, targetUid, o) { const a = need(uid); return a ? a.lunge(byUid.get(targetUid) ? byUid.get(targetUid).anchor() : null, o) : Promise.resolve(); },
    cast(uid, targetUid, o) { const a = need(uid); return a ? a.lunge(byUid.get(targetUid) ? byUid.get(targetUid).anchor() : null, { ...o, cast: true, spell: true, ranged: true }) : Promise.resolve(); },
    shoot(uid, targetUid, o) { const a = need(uid); return a ? a.lunge(byUid.get(targetUid) ? byUid.get(targetUid).anchor() : null, { ...o, cast: true, spell: true, ranged: true, shoot: true }) : Promise.resolve(); },
    castGesture(uid, o) { const a = need(uid); return a ? (a.castGesture ? a.castGesture(o) : a.statusPulse(o && o.color)) : Promise.resolve(); },
    hit(uid, o) { const a = need(uid); return a ? a.hit(o) : Promise.resolve(); },
    block(uid) { const a = need(uid); return a ? a.block() : Promise.resolve(); },
    death(uid, o) { const a = need(uid); if (!a) return Promise.resolve(); a.dead = true; return a.death(o); },
    statusPulse(uid, color) { const a = need(uid); return a ? a.statusPulse(color) : Promise.resolve(); },
    highlight(uid, on, red) { const a = byUid.get(uid); return a ? a.highlight(on, red) : Promise.resolve(); },
    hover(uid, on) { const a = byUid.get(uid); return a ? a.hover(on) : Promise.resolve(); },
    anchor(uid) { const a = byUid.get(uid); return a ? a.anchor() : null; },
    setTheme(t) { theme = t; for (const a of byUid.values()) a.setTheme(t); },
    pause() { paused = true; }, resume() { paused = false; needRender = true; wake(); },
    stats: () => ({ ...stats, avgRenderMs: stats.frames ? stats.renderMs / stats.frames : 0, actors: byUid.size, distinctModels: distinctFdids().size, bufferCache: bufs.size, webgl: !!renderer }),
    dispose() { for (const a of [...byUid.values()]) destroy(a); if (ground3d) ground3d.dispose(); if (renderer) { try { renderer.dispose(); renderer.forceContextLoss(); } catch (_) { /* noop */ } } for (const l of [groundL, canvasWrap, platesL, fxL]) l.remove(); },
  };
  fitResolution();
  setZone(currentZoneId);
  return api;
}
