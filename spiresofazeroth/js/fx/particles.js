// Pooled textured particle system (atlas: dot, streak, shard, leaf, ember, puff, star). Deterministic per seed.
import { tintImage, hex } from "./sheets.js?v=20261029d";

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const F = (n) => new Float32Array(n);
const rr = (rng, r) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * rng() : r);

export function createParticles({ atlas, cells, max = 4500, seed = 1, reduced = false }) {
  let rng = mulberry32(seed), n = 0, scale = reduced ? 0.5 : 1;
  const x = F(max), y = F(max), vx = F(max), vy = F(max), gy = F(max), drag = F(max), rot = F(max), spin = F(max), age = F(max), life = F(max),
    s0 = F(max), s1 = F(max), a0 = F(max), fadeP = F(max), stretch = F(max);
  const cell = new Uint8Array(max), col = new Uint16Array(max), add = new Uint8Array(max), align = new Uint8Array(max);
  const names = Object.keys(cells), cellIdx = Object.fromEntries(names.map((c, i) => [c, i]));
  const colorId = new Map(), tintedAtlas = [];
  function cid(c) {
    const key = typeof c === "string" ? c : hex(c);
    let i = colorId.get(key);
    if (i === undefined) { i = tintedAtlas.length; colorId.set(key, i); tintedAtlas.push(tintImage(atlas, key, 0.45)); }
    return i;
  }
  function spawn(p) {
    if (n >= max) return;
    const i = n++;
    x[i] = p.x; y[i] = p.y; vx[i] = p.vx; vy[i] = p.vy; gy[i] = p.gravity || 0; drag[i] = p.drag || 0;
    rot[i] = p.rot || 0; spin[i] = p.spin || 0; age[i] = -(p.delay || 0); life[i] = p.life; s0[i] = p.s0; s1[i] = p.s1;
    a0[i] = p.alpha ?? 1; fadeP[i] = p.fade ?? 1.4; stretch[i] = p.stretch || 0;
    cell[i] = cellIdx[p.cell || "dot"]; col[i] = cid(p.color || "#ffffff"); add[i] = p.additive === false ? 0 : 1; align[i] = p.align ? 1 : 0;
  }
  const cnt = (c) => Math.max(1, Math.round(c * scale));
  function base(o, rg) {
    const sz = rr(rg, o.size ?? [10, 20]);
    return { life: rr(rg, o.life ?? [0.4, 0.8]), s0: sz, s1: sz * (o.sizeEnd ?? 0.3), color: o.color, cell: o.cell, additive: o.additive,
      gravity: o.gravity, drag: o.drag ?? 1, alpha: o.alpha, fade: o.fade, align: o.align, stretch: o.stretch,
      spin: o.spin ? rr(rg, o.spin) : 0, rot: o.randRot ? rg() * 6.283 : 0, delay: o.delay ? rr(rg, o.delay) : 0 };
  }
  return {
    get count() { return n; }, get max() { return max; },
    setReduced(r) { scale = r ? 0.5 : 1; }, reseed(s) { rng = mulberry32(s); },
    /** radial/cone burst. angle:[a0,a1] radians (default full circle), speed:[a,b] px/s */
    burst(o) {
      const rg = o.rng || rng, N = cnt(o.count ?? 20);
      for (let k = 0; k < N; k++) {
        const b = base(o, rg), ang = rr(rg, o.angle ?? [0, 6.2832]), sp = rr(rg, o.speed ?? [200, 500]);
        spawn({ ...b, x: o.x + (rg() - 0.5) * (o.spread || 0), y: o.y + (rg() - 0.5) * (o.spread || 0), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
      }
    },
    /** particles on a circle moving outward */
    ring(o) {
      const rg = o.rng || rng, N = cnt(o.count ?? 24), sq = o.squash ?? 1;
      for (let k = 0; k < N; k++) {
        const b = base(o, rg), ang = (k / N) * 6.2832 + rg() * 0.2, sp = rr(rg, o.speed ?? [250, 330]), r = o.radius ?? 20;
        spawn({ ...b, x: o.x + Math.cos(ang) * r, y: o.y + Math.sin(ang) * r * sq, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * sq });
      }
    },
    /** particles scattered along from->to with small random drift, staggered over `over` seconds */
    trail(o) {
      const rg = o.rng || rng, N = cnt(o.count ?? 20);
      for (let k = 0; k < N; k++) {
        const t = k / N, b = base(o, rg), sp = rr(rg, o.speed ?? [10, 60]), ang = rg() * 6.2832;
        spawn({ ...b, x: o.from.x + (o.to.x - o.from.x) * t, y: o.from.y + (o.to.y - o.from.y) * t, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.rise || 0), delay: b.delay + t * (o.over || 0) });
      }
    },
    /** continuous upward spray for `dur` seconds (pre-scheduled, so deterministic) */
    fountain(o) {
      const rg = o.rng || rng, dur = o.dur ?? 0.8, N = cnt((o.rate ?? 60) * dur);
      for (let k = 0; k < N; k++) {
        const b = base(o, rg), ang = -1.5708 + (rg() - 0.5) * (o.cone ?? 0.7), sp = rr(rg, o.speed ?? [250, 520]);
        spawn({ ...b, x: o.x + (rg() - 0.5) * (o.width ?? 60), y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, delay: (k / N) * dur });
      }
    },
    /** slow wandering motes inside a box */
    drift(o) {
      const rg = o.rng || rng, N = cnt(o.count ?? 12);
      for (let k = 0; k < N; k++) {
        const b = base({ life: [0.9, 1.7], size: [8, 16], sizeEnd: 0.6, ...o }, rg);
        spawn({ ...b, x: o.x + (rg() - 0.5) * (o.w ?? 100), y: o.y + (rg() - 0.5) * (o.h ?? 100), vx: (rg() - 0.5) * 40, vy: -(o.rise ?? 40) * (0.4 + rg()), drag: o.drag ?? 0.3, delay: o.over ? rg() * o.over : b.delay });
      }
    },
    update(dt) {
      for (let i = n - 1; i >= 0; i--) {
        age[i] += dt;
        if (age[i] < 0) continue;
        if (age[i] >= life[i]) { // swap-remove keeps arrays dense (iterating downward, so the moved item was already updated)
          const l = --n;
          if (i !== l) { x[i] = x[l]; y[i] = y[l]; vx[i] = vx[l]; vy[i] = vy[l]; gy[i] = gy[l]; drag[i] = drag[l]; rot[i] = rot[l]; spin[i] = spin[l]; age[i] = age[l]; life[i] = life[l]; s0[i] = s0[l]; s1[i] = s1[l]; a0[i] = a0[l]; fadeP[i] = fadeP[l]; stretch[i] = stretch[l]; cell[i] = cell[l]; col[i] = col[l]; add[i] = add[l]; align[i] = align[l]; }
          continue;
        }
        const d = Math.exp(-drag[i] * dt);
        vx[i] *= d; vy[i] = vy[i] * d + gy[i] * dt;
        x[i] += vx[i] * dt; y[i] += vy[i] * dt; rot[i] += spin[i] * dt;
      }
    },
    draw(ctx, k = 1) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass ? "lighter" : "source-over";
        for (let i = 0; i < n; i++) {
          if (age[i] < 0 || add[i] !== pass) continue;
          const t = age[i] / life[i], a = a0[i] * Math.min(1, t * 9) * Math.pow(1 - t, fadeP[i]);
          if (a < 0.01) continue;
          const e = 1 - (1 - t) * (1 - t), sz = s0[i] + (s1[i] - s0[i]) * e;
          let w = sz, r = rot[i];
          if (align[i]) { r = Math.atan2(vy[i], vx[i]); w = sz * (1 + Math.hypot(vx[i], vy[i]) * stretch[i]); }
          const c = Math.cos(r) * k, s = Math.sin(r) * k, cl = cells[names[cell[i]]];
          ctx.globalAlpha = a > 1 ? 1 : a;
          ctx.setTransform(c, s, -s, c, x[i] * k, y[i] * k);
          ctx.drawImage(tintedAtlas[col[i]], cl[0], cl[1], cl[2], cl[3], -w / 2, -sz / 2, w, sz);
        }
      }
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    },
    clear() { n = 0; },
  };
}
