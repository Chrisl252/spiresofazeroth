// VFX choreography: recipe table (element x kind + enemy attacks) and the single rAF loop that drives
// flipbooks + particles + numbers. Impact instant = onImpact() (UI applies damage + actor hit reaction there).
import { loadSheets, createSheetPlayer, mix } from "./sheets.js?v=20261029a";
import { createParticles, mulberry32 } from "./particles.js?v=20261029a";
import { createNumbers } from "./numbers.js?v=20261029a";
import { PALETTE, ELEMENTS, KINDS, elementFor, kindFor } from "./elements.js?v=20261029a";
import { runLook, needsTarget } from "./cardfx.js?v=20261029a";
import { createAnimMap } from "./animmap.js?v=20261029a";   // data-driven card -> cast anim/release/school-floor map (data/fx/anim.json)
import { createRealPlayer } from "./realplay.js?v=20261029a";   // real WoW spell art (data/fx/real.json); falls back to the recipe look

export { elementFor, kindFor, PALETTE, ELEMENTS, KINDS };
export const ENEMY_RECIPES = ["claw", "bite", "steel", "spit", "slam"];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const GREEN = "#6fe08a", GOLD = "#ffe58a", SHIELD = "#8fc8ff";

// ---- per-element tables -------------------------------------------------------------------------------------
// proj: travel projectile style (null = no travel, a windup flare instead). trail: particle cell + colour key.
const PROJ = {
  steel: { dur: 0.17, head: 0, streak: 120, trail: ["dot", "warm", 14], sparks: true },
  fire: { dur: 0.23, head: 78, trail: ["ember", "warm", 22], puff: "dark" },
  frost: { dur: 0.21, head: 64, trail: ["shard", "hot", 20], dot: true },
  arcane: { dur: 0.22, head: 66, trail: ["star", "warm", 22], dot: true },
  nature: { dur: 0.24, head: 52, trail: ["leaf", "main", 26], dot: true },
  holy: { dur: 0.19, head: 70, trail: ["star", "hot", 20], dot: true },
  shadow: { dur: 0.24, head: 74, trail: ["puff", "dark", 34], dark: true },
  lightning: null,
  blood: { dur: 0.2, head: 56, trail: ["puff", "main", 26], dark: true },
  wind: { dur: 0.19, head: 40, streak: 140, trail: ["puff", "hot", 26], pale: true },
  stone: { dur: 0.24, head: 0, rock: true, trail: ["puff", "warm", 34], dark: true },
};
const ARCS = ["slash_arc_a", "slash_arc_b", "slash_arc_c"];

export function createFx(hostEl, o = {}) {
  const designW = o.designW || 1920, designH = o.designH || 1080;
  let reduced = !!o.reducedMotion, speed = 1, running = false, raf = 0, last = 0, clock = 0, stopT = 0, frameCt = 0;
  let k = 1, sheets = null, L = null, P = null, looks = {}; const fxState = {};
  const rng = mulberry32(o.seed || 20261017);
  const timers = [], actors = [], auras = new Map();
  const real = createRealPlayer({ root: o.root, v: o.v });
  const anim = createAnimMap({ root: o.root, v: o.v });
  const stats = { frames: 0, msSum: 0, msMax: 0, peakParticles: 0, peakSheets: 0 };

  // DOM: canvas + dom layer (numbers/banner/flash) inside the host
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${designW}px;height:${designH}px;pointer-events:none`;
  const dom = document.createElement("div");
  dom.style.cssText = `position:absolute;left:0;top:0;width:${designW}px;height:${designH}px;pointer-events:none;overflow:visible`;
  hostEl.append(canvas, dom);
  const ctx = canvas.getContext("2d");
  const kickEl = o.kickEl || (hostEl.closest && hostEl.closest("#stage")) || hostEl.parentElement;
  const numbers = createNumbers(dom, { kickEl, getSpeed: () => speed, isReduced: () => reduced });

  function fitCanvas(force) {
    const r = canvas.getBoundingClientRect(), css = r.width ? r.width / designW : 1;
    const nk = clamp(css * Math.min(window.devicePixelRatio || 1, 2), 0.5, 1.5);
    if (!force && Math.abs(nk - k) / k < 0.03) return;
    k = nk; canvas.width = Math.round(designW * k); canvas.height = Math.round(designH * k); ctx.setTransform(k, 0, 0, k, 0, 0);
  }

  const ready = loadSheets({ root: o.root, v: o.v }).then((s) => {
    sheets = s; looks = s.cardLooks || {}; L = createSheetPlayer(s); P = createParticles({ atlas: s.atlas, cells: s.cells, seed: o.seed || 20261017, reduced });
    fitCanvas(true); return api;
  });

  // ---- loop --------------------------------------------------------------------------------------------------
  const busy = () => (L && (L.count || P.count)) || actors.length || timers.length || numbers.kicking;
  function wake() { if (!running && !document.hidden && L) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(ts) {
    raf = 0;
    if (document.hidden) { running = false; return; }
    const t0 = performance.now();
    const real = Math.min(0.05, (ts - last) / 1000); last = ts;
    let dt;
    if (stopT > 0) { stopT -= real; dt = 0; } else dt = real * speed;
    clock += dt;
    for (let i = 0; i < timers.length;) { const t = timers[i]; if (clock >= t.at) { timers.splice(i, 1); t.fn(); } else i++; }
    for (let i = actors.length - 1; i >= 0; i--) { const a = actors[i]; a.update(dt); if (a.done) actors.splice(i, 1); }
    L.update(dt); P.update(dt); numbers.update(real);
    if ((frameCt++ & 31) === 0) fitCanvas(false);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(k, 0, 0, k, 0, 0);
    for (const a of actors) if (a.draw) a.draw(ctx);
    L.draw(ctx, k); P.draw(ctx, k);
    const ms = performance.now() - t0; stats.frames++; stats.msSum += ms; stats.msMax = Math.max(stats.msMax, ms);
    stats.peakParticles = Math.max(stats.peakParticles, P.count); stats.peakSheets = Math.max(stats.peakSheets, L.count);
    if (busy()) raf = requestAnimationFrame(frame); else { running = false; ctx.clearRect(0, 0, designW * k, designH * k); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && busy()) wake(); });

  // ---- scheduling / helpers ------------------------------------------------------------------------------------
  const at = (sec, fn) => { timers.push({ at: clock + sec, fn }); wake(); };
  const after = (sec) => new Promise((r) => at(sec, r));
  const hitStop = (sec) => { if (!reduced) stopT = Math.max(stopT, sec / Math.max(0.5, speed)); };
  const pt = (v) => { const r = typeof v === "function" ? v() : v; return r && r.chest ? r.chest : r; };
  function resolvePoint(p, uid, which) {
    if (p) return pt(p);
    if (uid != null && api.anchorFn) { const r = api.anchorFn(uid, which); return r && r.chest ? r.chest : r; }
    return null;
  }
  function feetOf(p, uid) {
    if (uid != null && api.anchorFn) { const r = api.anchorFn(uid, "feet"); if (r && r.feet) return r.feet; }
    return { x: p.x, y: p.y + 120 };
  }

  function makeCtx(opts, el) {
    const from = resolvePoint(opts.from, opts.fromUid, "chest") || { x: 420, y: 560 };
    const to = resolvePoint(opts.to, opts.toUid, "chest") || { x: 1300, y: 560 };
    const amount = opts.amount ?? 8, s = clamp(0.85 + amount / 30, 0.85, 1.7);
    const pal = PALETTE[el] || PALETTE.steel, dist = Math.hypot(to.x - from.x, to.y - from.y);
    const c = { fx: api, el, pal, from, to, feet: opts.toFeet || feetOf(to, opts.toUid), fromFeet: opts.fromFeet || feetOf(from, opts.fromUid),
      amount, s, dist, ang: Math.atan2(to.y - from.y, to.x - from.x), opts, rng,
      col(key) { return key && key[0] === "#" ? key : c.pal[key] || key || c.pal.main; },
      sheet(name, so = {}) {
        const isImpact = name === "impact_burst" || name === "hit_star";
        const defAlpha = isImpact ? 0.92 : 0.75;
        const defHot = isImpact ? 0.55 : 0.25;
        const r = L.play(name, { ...so, tint: so.tint === undefined ? c.col("main") : c.col(so.tint), scale: (so.scale || 1), alpha: so.alpha ?? defAlpha, hot: so.hot ?? defHot }); return r; },
      at, P };
    return c;
  }

  // ---- shared impact pieces --------------------------------------------------------------------------------------
  function glowActor(pos, color, r, life, alpha) {
    let t = 0; const a = { done: false, update(dt) { t += dt; if (t >= life) a.done = true; },
      draw(g) { const u = clamp(t / life, 0, 1), f = (1 - u) * (1 - u); g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = alpha * f;
        const rr = r * (0.7 + 0.3 * u), gr = g.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rr); gr.addColorStop(0, color); gr.addColorStop(0.45, color + "88"); gr.addColorStop(1, color + "00");
        g.fillStyle = gr; g.beginPath(); g.arc(pos.x, pos.y, rr, 0, 6.2832); g.fill(); g.restore(); } };
    actors.push(a); wake();
  }
  function impactCore(c, { flashR = 90, kick = true } = {}) {
    const { to, s, amount, pal } = c, tone = mix(pal.main, "#ffffff", 0.3);
    hitStop(clamp(0.04 + amount * 0.0024, 0.045, 0.115));
    glowActor(to, tone, flashR * Math.min(s, 1.3), 0.07, 0.7);          // small element-tinted flash, under the flipbooks
    glowActor(to, pal.main, Math.min(160, 120 * s), 0.2, 0.32);         // soft halo, fades within 200 ms
    if (kick) numbers.kick(clamp(3 + amount * 0.34, 3, 15));
    if (amount >= 24) numbers.flashAll({ alpha: 0.22 });
  }
  function sparks(c, o = {}) {
    const { to, s, pal } = c, n = Math.round((o.count ?? 16) + c.amount * 0.9 * s);
    P.burst({ x: to.x, y: to.y, count: Math.min(n, 44), cell: "streak", align: true, stretch: 0.0042, speed: [380, 1150], size: [10, 17], sizeEnd: 0.4, life: [0.2, 0.46],
      drag: 3.4, gravity: 360, color: o.color || pal.warm, angle: o.angle });
  }
  function shards(c, o = {}) {
    const { to, s, pal } = c;
    P.burst({ x: to.x, y: to.y, count: Math.min(30, Math.round((o.count ?? 7) + c.amount * 0.55 * s)), cell: "shard", additive: o.additive ?? false, spin: [-14, 14], randRot: true,
      speed: [260, 780], angle: o.angle ?? [-3.5, 0.35], size: [14, 30], sizeEnd: 0.45, life: [0.5, 0.95], gravity: 1500, drag: 0.8, color: o.color || pal.dark, fade: 2.5 });
  }
  function dust(c, scale = 1.25) {
    const { feet, s } = c;
    L.play("dust_ground", { x: feet.x, y: feet.y + 6, scale: scale * s, tint: "#d9c9a8", hot: 0.1, alpha: 0.85 });
    P.burst({ x: feet.x, y: feet.y - 6, count: 7, cell: "puff", additive: false, speed: [60, 220], angle: [Math.PI * 1.05, Math.PI * 1.95], size: [38, 70], sizeEnd: 2.2, life: [0.5, 0.9], drag: 2.4, color: "#bba98a", alpha: 0.5 });
  }
  function settle(c, sec = 0.4) {
    const { to, pal } = c;
    P.drift({ x: to.x, y: to.y + 20, w: 120, h: 80, count: 9, cell: "ember", color: pal.warm, rise: 70, size: [10, 18], life: [0.7, 1.2], over: sec * 0.6, gravity: -30 });
  }
  function arc(c, o = {}) {
    const i = o.i ?? (c.ang < -0.35 ? 0 : c.ang > 0.35 ? 2 : 1) + (rng() < 0.4 ? 1 : 0);
    return c.sheet(ARCS[i % 3], { x: c.to.x, y: c.to.y, scale: (o.scale || 1.35) * c.s, rotation: o.rot ?? (c.ang * 0.4 - 0.5 + (rng() - 0.5) * 0.5), tint: o.tint || "hot", delay: o.delay || 0, flipY: o.flipY, hot: 0.5 });
  }

  // ---- projectile actor (particle-drawn head + trail) --------------------------------------------------------------
  function projectile(c, st, done) {
    const { from, to, pal } = c, dur = st.dur * (0.9 + 0.1 * clamp(c.dist / 900, 0.4, 1.2)), arcH = st.arcH || 0;
    let t = 0, px = from.x, py = from.y;
    const a = { done: false, update(dt) {
      t += dt; const u = clamp(t / dur, 0, 1), e = Math.pow(u, 1.8); // accelerates into the target
      const nx = lerp(from.x, to.x, e), ny = lerp(from.y, to.y, e) - Math.sin(e * Math.PI) * arcH;
      const d = Math.hypot(nx - px, ny - py), steps = Math.max(1, Math.ceil(d / 16)), dx = nx - px, dy = ny - py, dirx = dx / (d || 1), diry = dy / (d || 1);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps, x = px + dx * f, y = py + dy * f;
        if (st.head) {
          P.burst({ x, y, count: 1, cell: "dot", size: st.head * 2.2, sizeEnd: 0.9, life: 0.08, color: pal.main, alpha: 0.28, speed: 0 });
          P.burst({ x, y, count: 1, cell: "dot", size: st.head * 0.95, sizeEnd: 0.8, life: 0.08, color: pal.hot, alpha: 0.65, speed: 0 });
          P.burst({ x, y, count: 1, cell: "star", size: st.head * 0.55, sizeEnd: 0.45, life: 0.08, color: "#ffffff", alpha: 0.95, speed: 0 });
        }
        if (st.streak) P.burst({ x, y, count: 1, cell: "streak", align: true, stretch: 0.003, size: 24, sizeEnd: 0.75, life: 0.09, color: pal.hot, speed: 1, angle: [Math.atan2(diry, dirx), Math.atan2(diry, dirx)], alpha: 1 });
        if (st.rock) P.burst({ x, y, count: 1, cell: "shard", additive: false, spin: [-14, 14], size: 52, sizeEnd: 0.95, life: 0.09, color: pal.warm, speed: 0, randRot: true, fade: 0.2 });
        if (st.head) P.burst({ x, y, count: 1, cell: "streak", align: true, stretch: 0.0085, size: st.head * 0.8, sizeEnd: 0.55, life: 0.11, color: pal.main, speed: 1, angle: [Math.atan2(diry, dirx), Math.atan2(diry, dirx)], alpha: 0.6 });
        if (reduced && (i & 1)) continue; // count-1 spawns cannot halve, so thin the trail instead
        const [cell, ck, sz] = st.trail, jit = Math.max(8, (st.head || 40) * 0.35);
        for (let q = 0; q < 3; q++) P.burst({ x: x + (rng() - 0.5) * jit, y: y + (rng() - 0.5) * jit, count: 1, cell, additive: cell !== "puff" || !st.dark, color: pal[ck] || ck, size: [sz * 0.7, sz * 1.25], sizeEnd: cell === "puff" ? 2.3 : 0.25, life: [0.24, 0.48],
          speed: [15, 110], drag: 2, gravity: cell === "ember" ? -80 : 60, spin: [-9, 9], randRot: true, alpha: cell === "puff" ? 0.45 : 0.88 });
        if (st.sparks && i % 2 === 0) P.burst({ x, y, count: 2, cell: "streak", align: true, stretch: 0.0045, size: 11, life: [0.13, 0.24], speed: [140, 420], angle: [Math.atan2(diry, dirx) + Math.PI - 0.7, Math.atan2(diry, dirx) + Math.PI + 0.7], color: pal.warm, drag: 4 });
      }
      px = nx; py = ny;
      if (u >= 1) { a.done = true; done(); }
    } };
    actors.push(a); wake();
  }

  // ---- ATTACK recipes -------------------------------------------------------------------------------------------------
  const IMPACT = {
    steel(c) { arc(c); arc(c, { delay: 0.05, scale: 1.05, tint: "main", flipY: true }); c.sheet("hit_star", { x: c.to.x, y: c.to.y, scale: 0.95 * c.s, tint: "hot" }); c.sheet("spark_burst", { x: c.to.x, y: c.to.y, scale: 1.2 * c.s, tint: "warm" }); sparks(c, { count: 22 }); shards(c, { color: c.pal.main, additive: true, count: 5 }); },
    fire(c) { const { to, feet, s } = c; c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.35 * s, tint: "warm" }); c.sheet("flame_tongue", { x: feet.x, y: feet.y + 10, scale: 1.9 * s, tint: "main" }); c.sheet("flame_tongue", { x: feet.x - 40, y: feet.y + 16, scale: 1.3 * s, tint: "warm", delay: 0.07 }); c.sheet("ember_rise", { x: feet.x + 10, y: feet.y, scale: 1.7 * s, tint: "warm", delay: 0.05 }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 0.8 * s, tint: "hot" }); sparks(c, { color: c.pal.main }); dust(c, 1.0); },
    frost(c) { const { to, s } = c; c.sheet("frost_bloom", { x: to.x, y: to.y, scale: 1.7 * s, tint: "main" }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.1 * s, tint: "hot" }); c.sheet("shards", { x: to.x, y: to.y + 20, scale: 1.7 * s, tint: "main", blend: "add", hot: 0.6 }); shards(c, { color: c.pal.main, additive: true, count: 12 }); sparks(c, { color: c.pal.hot, count: 12 }); },
    arcane(c) { const { to, s } = c; c.sheet("shockwave_ring", { x: to.x, y: to.y, scale: 1.7 * s, tint: "main" }); c.sheet("spark_burst", { x: to.x, y: to.y, scale: 1.7 * s, tint: "main" }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 1.1 * s, tint: "hot" }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 0.9 * s, tint: "warm", delay: 0.04 }); sparks(c, { color: c.pal.warm }); P.ring({ x: to.x, y: to.y, count: 18, cell: "star", color: c.pal.warm, radius: 30, speed: [260, 380], size: [16, 26], life: [0.4, 0.7] }); },
    nature(c) { const { to, feet, s } = c; c.sheet("thorn_lash", { x: to.x, y: to.y, scale: 1.7 * s, rotation: c.ang, tint: "main", hot: 0.5 }); c.sheet("leaf_whirl", { x: feet.x, y: feet.y, scale: 1.7 * s, tint: "main", delay: 0.06 }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.1 * s, tint: "warm", delay: 0.02 }); P.burst({ x: to.x, y: to.y, count: 14, cell: "leaf", additive: false, spin: [-9, 9], randRot: true, speed: [180, 560], size: [22, 36], sizeEnd: 0.6, life: [0.6, 1.1], gravity: 380, drag: 1.4, color: c.pal.main }); sparks(c, { color: c.pal.warm, count: 10 }); },
    holy(c) { const { to, feet, s } = c; c.sheet("holy_ray", { x: feet.x, y: feet.y + 10, scale: 2.4 * s, tint: "main", hot: 0.4 }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 1.2 * s, tint: "hot", delay: 0.05 }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.3 * s, tint: "warm" }); c.sheet("shockwave_ring", { x: feet.x, y: feet.y - 6, scale: 1.6 * s, tint: "warm", delay: 0.06 }); sparks(c, { color: c.pal.hot }); P.fountain({ x: feet.x, y: feet.y, dur: 0.35, rate: 40, cell: "star", color: c.pal.warm, speed: [180, 380], size: [12, 22], life: [0.5, 0.9], width: 70 }); },
    shadow(c) { const { to, feet, s } = c; c.sheet("shadow_wisp", { x: feet.x, y: feet.y + 10, scale: 2.0 * s, tint: "main", blend: "alpha", hot: 0.25 }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.25 * s, tint: "main" }); c.sheet("smoke_puff", { x: to.x, y: to.y + 20, scale: 1.7 * s, tint: "dark", hot: 0, alpha: 0.9 }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 0.85 * s, tint: "hot" }); sparks(c, { color: c.pal.warm, count: 12 }); P.burst({ x: to.x, y: to.y, count: 12, cell: "puff", additive: false, color: c.pal.dark, speed: [60, 240], size: [40, 70], sizeEnd: 2.4, life: [0.6, 1.1], drag: 2, alpha: 0.6 }); },
    lightning(c) { const { to, feet, s } = c; c.sheet("lightning_bolt_a", { x: feet.x, y: feet.y + 6, scale: 3.1 * s, tint: "main", hot: 0.7 }); c.sheet("lightning_bolt_b", { x: feet.x + 34, y: feet.y + 6, scale: 2.5 * s, tint: "hot", delay: 0.05, hot: 0.4 }); c.sheet("spark_burst", { x: to.x, y: to.y, scale: 1.5 * s, tint: "hot" }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 1.15 * s, tint: "hot" }); sparks(c, { color: c.pal.hot, count: 26 }); dust(c, 1.0); },
    blood(c) { const { to, s } = c; arc(c, { tint: "main" }); c.sheet("blood_mist", { x: to.x, y: to.y, scale: 1.6 * s, tint: "main", blend: "alpha", hot: 0.2, rotation: c.ang }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.0 * s, tint: "warm" }); sparks(c, { color: c.pal.warm, count: 12 }); },
    wind(c) { const { to, s } = c; c.sheet("wind_crescent", { x: to.x, y: to.y, scale: 1.8 * s, rotation: c.ang * 0.3 - 0.3, tint: "main" }); c.sheet("wind_crescent", { x: to.x, y: to.y, scale: 1.3 * s, rotation: c.ang * 0.3 + 0.5, tint: "hot", delay: 0.05, flipY: true }); c.sheet("smoke_puff", { x: to.x, y: to.y + 20, scale: 1.4 * s, tint: "#e8f4ee", hot: 0, alpha: 0.5 }); c.sheet("impact_burst", { x: to.x, y: to.y, scale: 0.9 * s, tint: "hot" }); sparks(c, { color: c.pal.hot, count: 10 }); },
    stone(c) { const { to, s } = c; c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.2 * s, tint: "warm" }); c.sheet("shards", { x: to.x, y: to.y + 10, scale: 1.8 * s, tint: "#b89c76", blend: "alpha", hot: 0.1 }); c.sheet("hit_star", { x: to.x, y: to.y, scale: 0.85 * s, tint: "hot" }); shards(c, { color: c.pal.main, count: 14 }); dust(c, 1.8); sparks(c, { color: c.pal.warm, count: 8 }); },
  };

  function runAttack(c, resolve) {
    const st = PROJ[c.el], impact = () => {
      impactCore(c, { flashR: c.el === "lightning" || c.el === "holy" ? 120 : 90 });
      (IMPACT[c.el] || IMPACT.steel)(c);
      if (c.el !== "fire" && c.el !== "stone" && c.el !== "lightning") dust(c, 1.1);
      settle(c);
      if (c.opts.onImpact) { try { c.opts.onImpact(); } catch (e) { console.error(e); } }
      at(0.5, resolve);
    };
    if (st) projectile(c, st, impact);
    else { // windup flare at the caster, then the strike
      c.sheet("spark_burst", { x: c.from.x, y: c.from.y, scale: 0.8, tint: "hot" });
      P.burst({ x: c.from.x, y: c.from.y, count: 10, cell: "star", color: c.pal.main, speed: [80, 260], size: [12, 20], life: [0.2, 0.36] });
      at(0.13, impact);
    }
  }

  // ---- SKILL / POWER / HEAL ----------------------------------------------------------------------------------------------
  function skillAt(c) { const p = c.opts.to ? c.to : c.from, f = c.opts.to ? c.feet : c.fromFeet; return { p, f }; }
  function runSkill(c, resolve) {
    const { p, f } = skillAt(c), tint = mix(c.pal.main, SHIELD, 0.55), s = c.opts.scale || 1;
    c.sheet("shield_shimmer", { x: p.x, y: p.y, scale: 1.7 * s, tint, hot: 0.5 });
    c.sheet("shockwave_ring", { x: f.x, y: f.y - 8, scale: 1.5 * s, tint, delay: 0.09, rotation: 0 });
    c.sheet("impact_burst", { x: p.x, y: p.y, scale: 0.8 * s, tint: c.pal.hot, delay: 0.02, alpha: 0.55 });
    P.fountain({ x: f.x, y: f.y - 20, dur: 0.5, rate: 46, cell: "dot", color: tint, speed: [140, 360], size: [14, 26], life: [0.55, 1.0], width: 120, cone: 0.9, gravity: -40 });
    P.ring({ x: f.x, y: f.y - 8, count: 22, squash: 0.35, cell: "star", color: c.pal.hot, radius: 40, speed: [160, 230], size: [10, 18], life: [0.4, 0.7] });
    numbers.kick(2.5); at(0.12, () => { if (c.opts.onImpact) c.opts.onImpact(); }); at(0.7, resolve);
  }
  function runPower(c, resolve) {
    const { p, f } = skillAt(c), s = c.opts.scale || 1;
    c.sheet("buff_glyph_rise", { x: f.x, y: f.y + 8, scale: 2.1 * s, tint: "main", hot: 0.5 });
    c.sheet("buff_glyph_rise", { x: f.x, y: f.y + 8, scale: 1.4 * s, tint: "hot", delay: 0.28, alpha: 0.55, hot: 0.2 });
    c.sheet("shockwave_ring", { x: f.x, y: f.y - 6, scale: 1.6 * s, tint: "warm", delay: 0.12 });
    P.fountain({ x: f.x, y: f.y, dur: 0.95, rate: 55, cell: "star", color: c.pal.warm, speed: [180, 460], size: [12, 24], life: [0.7, 1.3], width: 90, cone: 0.5, gravity: -30 });
    P.fountain({ x: f.x, y: f.y, dur: 0.9, rate: 36, cell: "ember", color: c.pal.main, speed: [120, 300], size: [14, 24], life: [0.8, 1.4], width: 110, cone: 0.9 });
    numbers.kick(3);
    if (c.opts.persist !== false) api.aura(c.opts.key || c.opts.cardId || ("aura" + auras.size), p, c.pal.main);
    at(0.15, () => { if (c.opts.onImpact) c.opts.onImpact(); }); at(1.0, resolve);
  }
  function runHeal(c, resolve) {
    const { p, f } = skillAt(c), s = c.opts.scale || 1, tint = mix(GREEN, c.pal.main, 0.12);
    c.sheet("heal_sparkle", { x: f.x, y: f.y + 6, scale: 1.8 * s, tint, hot: 0.5 });
    c.sheet("shockwave_ring", { x: f.x, y: f.y - 6, scale: 1.2 * s, tint: GREEN, delay: 0.1, alpha: 0.7 });
    P.fountain({ x: f.x, y: f.y - 10, dur: 0.8, rate: 40, cell: "dot", color: GREEN, speed: [100, 280], size: [14, 24], life: [0.8, 1.4], width: 110, cone: 0.7, gravity: -50 });
    P.drift({ x: p.x, y: p.y + 30, w: 120, h: 160, count: 14, cell: "star", color: GOLD, rise: 90, size: [10, 18], life: [0.9, 1.5], over: 0.6 });
    at(0.12, () => { if (c.opts.onImpact) c.opts.onImpact(); }); at(1.05, resolve);
  }

  // ---- ENEMY attacks -------------------------------------------------------------------------------------------------------
  function enemyHit(c, resolve, delay, body) {
    at(delay, () => {
      impactCore(c, { flashR: 90 }); body(); settle(c, 0.3);
      if (c.opts.onImpact) { try { c.opts.onImpact(); } catch (e) { console.error(e); } }
      at(0.45, resolve);
    });
  }
  const ENEMY = {
    claw(c, res) { // three staggered diagonal rakes
      const { to, s } = c; c.pal = PALETTE.blood;
      enemyHit(c, res, 0.12, () => {
        for (let i = 0; i < 3; i++) c.sheet(ARCS[1], { x: to.x - 62 + i * 62, y: to.y - 34 + i * 38, scale: 1.35 * s, rotation: 0.95, tint: i === 1 ? "#ffffff" : "#ffb0a0", delay: i * 0.05, hot: 0.7, flipY: true });
        c.sheet("blood_mist", { x: to.x, y: to.y, scale: 1.35 * s, tint: "#d03a30", blend: "alpha", hot: 0.3, rotation: 3.14, delay: 0.04 });
        c.sheet("hit_star", { x: to.x, y: to.y, scale: 1.0 * s, tint: "#ffd8c8", delay: 0.05, hot: 0.6 });
        sparks(c, { color: "#ff8a70", count: 16 });
        numbers.kick(5);
      });
    },
    bite(c, res) { // two jaws converging
      const { to, s } = c;
      enemyHit(c, res, 0.16, () => {
        c.sheet(ARCS[2], { x: to.x, y: to.y - 55, scale: 1.55 * s, rotation: Math.PI / 2 + 0.1, tint: "#ffffff", hot: 0.75 });
        c.sheet(ARCS[2], { x: to.x, y: to.y + 55, scale: 1.55 * s, rotation: -Math.PI / 2 - 0.1, tint: "#ffffff", hot: 0.75 });
        c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.1 * s, tint: "#ffb8a8", delay: 0.06, hot: 0.5 });
        c.sheet("hit_star", { x: to.x, y: to.y, scale: 0.9 * s, tint: "#ffe8dc", delay: 0.06, hot: 0.6 });
        sparks(c, { color: "#ffc0a8", count: 14 });
        numbers.kick(5.5);
      });
    },
    steel(c, res) {
      const { to, s } = c; c.pal = PALETTE.steel;
      enemyHit(c, res, 0.12, () => {
        arc(c, { rot: 0.5, scale: 1.5 });
        arc(c, { delay: 0.05, scale: 1.2, tint: "main" });
        c.sheet("spark_burst", { x: to.x, y: to.y, scale: 1.3 * s, tint: "warm", hot: 0.6 });
        c.sheet("hit_star", { x: to.x, y: to.y, scale: 1.05 * s, tint: "hot", hot: 0.65 });
        sparks(c, { count: 24 });
        shards(c, { color: c.pal.main, additive: true, count: 6 });
        numbers.kick(5);
      });
    },
    slam(c, res) {
      const { to, s } = c; c.pal = PALETTE.stone;
      enemyHit(c, res, 0.2, () => {
        c.sheet("impact_burst", { x: to.x, y: to.y, scale: 1.6 * s, tint: "warm", hot: 0.5 });
        c.sheet("shockwave_ring", { x: c.feet.x, y: c.feet.y - 4, scale: 2.4 * s, tint: "warm", hot: 0.5 });
        shards(c, { count: 16 });
        dust(c, 2.2);
        numbers.kick(9);
      });
    },
    spit(c, res) {
      const green = "#b6e03a"; c.pal = { ...PALETTE.nature, main: green, hot: "#f0ffb0", warm: "#d8f070" };
      projectile(c, { dur: 0.32, head: 52, trail: ["puff", "main", 28], dark: false, arcH: 70 }, () => {
        impactCore(c, { flashR: 100 });
        c.sheet("impact_burst", { x: c.to.x, y: c.to.y, scale: 1.2 * c.s, tint: "main", hot: 0.5 });
        c.sheet("smoke_puff", { x: c.to.x, y: c.to.y + 10, scale: 1.5 * c.s, tint: "#8fb82a", hot: 0.1, alpha: 0.85 });
        P.burst({ x: c.to.x, y: c.to.y, count: 20, cell: "dot", color: green, speed: [140, 460], size: [16, 28], life: [0.4, 0.85], gravity: 900, drag: 1.2, additive: false, alpha: 0.9 });
        numbers.kick(4);
        settle(c, 0.3); if (c.opts.onImpact) { try { c.opts.onImpact(); } catch (e) { console.error(e); } } at(0.5, res);
      });
    },
  };

  // ---- persistent aura -------------------------------------------------------------------------------------------------------------
  function aura(key, pos, color = "#ffd96a") {
    clearAura(key);
    const a = { done: false, t: 0, fade: 1, dying: false, acc: 0,
      update(dt) {
        a.t += dt; if (a.dying) { a.fade -= dt * 3; if (a.fade <= 0) a.done = true; }
        a.acc += dt; if (a.acc > 0.42 && !a.dying) { a.acc = 0; P.drift({ x: pos.x, y: pos.y + 40, w: 110, h: 150, count: 1, cell: "dot", color, rise: 60, size: [8, 14], life: [1.0, 1.5], alpha: 0.55 }); }
      },
      draw(g) {
        const pulse = 0.16 + 0.07 * Math.sin(a.t * 2.4), r = 150;
        g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = pulse * a.fade * Math.min(1, a.t * 3); g.translate(pos.x, pos.y + 20); g.scale(0.62, 1);
        const gr = g.createRadialGradient(0, 0, 4, 0, 0, r); gr.addColorStop(0, color); gr.addColorStop(0.5, color + "55"); gr.addColorStop(1, color + "00");
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill(); g.restore();
      } };
    auras.set(key, a); actors.push(a); wake(); return a;
  }
  /** persistent real-art aura: `insts` = looping m2emit instances; clearAura(key) stops them (same contract as aura()) */
  function setAura(key, insts) {
    clearAura(key);
    const a = { done: false, dying: false, update() { if (a.dying) { insts.forEach((i) => i && i.stop()); a.done = true; } }, draw() {} };
    auras.set(key, a); actors.push(a); wake();
  }
  function clearAura(key) {
    if (key === undefined) { for (const a of auras.values()) a.dying = true; auras.clear(); return; }
    const a = auras.get(key); if (a) { a.dying = true; auras.delete(key); }
  }

  // ---- public API -----------------------------------------------------------------------------------------------------------------------
  /** play("fire:attack" | "enemy:claw" | "claw" | {element,kind} | card, {from,to,fromUid,toUid,amount,onImpact,scale,persist,key}) */
  async function play(spec, opts = {}) {
    await ready; await real.ready; await anim.ready;
    let el, kind, enemy = null;
    if (typeof spec === "string") {
      const s = spec.replace(/^enemy:/, "");
      if (spec.startsWith("enemy:") || (!spec.includes(":") && ENEMY_RECIPES.includes(s))) enemy = s;
      else { [el, kind] = spec.split(":"); }
    } else if (spec && spec.element && spec.kind) { el = spec.element; kind = spec.kind; }
    else if (spec && spec.enemy) enemy = spec.enemy;
    else { el = elementFor(spec, opts.classId); kind = kindFor(spec); if (spec && spec.id) opts = { cardId: spec.id, ...opts }; }
    if (!enemy && !PALETTE[el]) el = "steel";
    if (!enemy && !KINDS.includes(kind)) kind = "attack";
    const c = makeCtx(opts, enemy ? "steel" : el);
    // cast -> travel -> impact -> number: ranged / gesture cards wait for the caster's RELEASE frame (animmap) before the missile / impact
    const cid = !enemy && ((spec && spec.id) || opts.cardId), arow = cid && anim.card(cid);
    const relS = opts.release != null ? opts.release : (arow && arow.anim !== "melee" ? arow.rel : null);
    if (relS != null) opts.release = relS;
    // per-card spell look (data/fx/cards.json); element x kind recipes below stay as the fallback
    const lk = !enemy && looks[(spec && spec.id) || opts.cardId];
    const rl = !enemy && !opts.noReal && real.entryFor((spec && spec.id) || opts.cardId);
    if (rl && (kind === "attack" || kind === "skill" || kind === "power" || kind === "heal")) {
      await Promise.race([real.ensure(rl, 450), new Promise((r) => setTimeout(r, 500))]);
      return new Promise((resolve) => { real.run({ c, L, P, anim, PROJ, at, actors, wake, numbers, impactCore, projectile, settle, mix, rng, state: fxState, clock: () => clock, aura, hitStop, setAura }, rl, kind, resolve, lk); wake(); });
    }
    const late = (fn) => (relS != null && relS > 0.02 ? at(relS, fn) : fn());
    if (lk && !(needsTarget(lk) && kind !== "attack" && !opts.to)) {
      return new Promise((resolve) => { late(() => runLook({ c, L, P, at, actors, wake, numbers, impactCore, projectile, settle, mix, rng, state: fxState, clock: () => clock, aura, hitStop }, lk, kind, resolve)); wake(); });
    }
    return new Promise((resolve) => {
      if (enemy) return (ENEMY[enemy] || ENEMY.steel)(c, resolve);
      late(() => ({ attack: runAttack, skill: runSkill, power: runPower, heal: runHeal })[kind](c, resolve));
      wake();
    });
  }

  const api = {
    ready, canvas, numbers, play, real, elementFor, kindFor, at, after, aura, clearAura, hitStop,
    banner: (t, o2) => numbers.banner(t, o2), kick: (a) => numbers.kick(a), flash: (p, o2) => numbers.flash(p, o2),
    get speed() { return speed; }, set speed(v) { speed = clamp(+v || 1, 0.25, 4); },
    get reduced() { return reduced; }, set reduced(v) { reduced = !!v; if (P) P.setReduced(reduced); },
    anchorFn: null, // (uid, "chest"|"feet") -> {x,y} | {chest,feet}; wire to actors.anchor
    get particles() { return P; }, get sheets() { return L; },
    stats: () => ({ ...stats, avgMs: stats.frames ? stats.msSum / stats.frames : 0, alive: P ? P.count : 0, sheetsAlive: L ? L.count : 0, k }),
    resetStats() { stats.frames = 0; stats.msSum = 0; stats.msMax = 0; stats.peakParticles = 0; stats.peakSheets = 0; },
    clear() { real.clear(); timers.length = 0; actors.length = 0; auras.clear(); if (L) L.clear(); if (P) P.clear(); },
    destroy() { api.clear(); cancelAnimationFrame(raf); canvas.remove(); dom.remove(); },
  };
  return api;
}
