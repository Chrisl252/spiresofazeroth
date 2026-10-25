// Plays one parsed WoW spell model (assets/fx/spells/models.json entry) on the 2D fx canvas.
// Approximates the M2 particle emitters: emission rate over model time, lifetime, speed + spread cone, gravity, drag,
// colour / alpha / size over life, flipbook head cells, blend mode (additive vs alpha). Ribbons become tinted trails,
// textured mesh batches become billboard (or flat ground-disc) sprites. World space: particles stay where they spawn.
//
// M2 space -> screen: x = along `heading`, y = depth (squashed), z = up. 1 yard = PX design pixels.

export const PX = 150;
const SIZE_MUL = 1.25;         // M2 particle scale is a half-extent-ish value; tuned so spell cards read right on the 1080p stage
const ADD_GAIN = 0.42;         // additive layers stack hard on a flat canvas (the game tone-maps); keeps flashes coloured, not white
const MAX_GLOBAL = 520, MAX_INST = 170;
const T = 1 / 32767;
let live = 0;                  // particles alive across all instances (global cap)
const freeList = [];
const instances = new Set();   // live instances, so choreo.clear() can release their particles

const lerp = (a, b, t) => a + (b - a) * t;
/** track = [[t01, v|[..]]] ; returns the (linearly interpolated) value at u, into `out` for vectors */
function samp(tr, u, out) {
  const n = tr.length;
  if (!n) return null;
  let i = 0;
  while (i < n - 1 && tr[i + 1][0] <= u) i++;
  const a = tr[i], b = tr[Math.min(n - 1, i + 1)], span = b[0] - a[0], f = span > 1e-6 ? Math.min(1, Math.max(0, (u - a[0]) / span)) : 0;
  if (typeof a[1] === "number") return lerp(a[1], b[1], f);
  for (let k = 0; k < a[1].length; k++) out[k] = lerp(a[1][k], b[1][k], f);
  return out;
}
/** rate track is keyed by absolute ms (not 0..1); linear between keys, held after the last */
function rateAt(tr, ms) {
  const n = tr.length;
  if (ms <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < n; i++) {
    if (ms <= tr[i][0]) { const a = tr[i - 1], b = tr[i], f = (ms - a[0]) / Math.max(1, b[0] - a[0]); return a[1] + (b[1] - a[1]) * f; }
  }
  return tr[n - 1][1];
}

const tmpC = [255, 255, 255], tmpS = [0.1, 0.1];

/** o: {at:()=>{x,y} | {x,y}, heading:[hx,hy], dirX, scale, loop, maxEmit, delay, alpha, rate, ribbons, sprites} */
export function spawnModel(art, rng, model, o, actors, wake) {
  if (!model) return null;
  const heading = o.heading || [o.dirX || 1, 0], dirX = o.dirX || (heading[0] >= 0 ? 1 : -1);
  const hx = heading[0], hy = heading[1];
  const sc = (o.scale || 1) * PX, loop = !!o.loop;
  const dur = Math.max(300, model.dur || 1000), spriteEnd = o.maxEmit != null ? o.maxEmit + 0.14 : dur / 1000, maxEmit = o.maxEmit ?? (loop ? 1e9 : Math.min(dur, 2200)) / 1000;
  const ems = (model.e || []).map((def) => ({ def, acc: 0, parts: [] }));
  const trail = [];                         // ribbon history (screen points)
  const getPos = typeof o.at === "function" ? o.at : () => o.at;
  const inst = { done: false, stopping: false, t: -(o.delay || 0), fade: 1, count: 0, trailAcc: 0, key: o.key };
  const up = [0, -1], side = [-hy * 0.35, hx * 0.35];

  // M2 vector (x fwd, y depth, z up) -> screen offset
  const proj = (x, y, z, out) => { out.x = x * hx + y * side[0] + z * up[0]; out.y = x * hy + y * side[1] + z * up[1]; return out; };
  const pv = { x: 0, y: 0 };

  function spawnParticle(em, origin) {
    if (live >= MAX_GLOBAL || em.parts.length >= MAX_INST) return;
    const d = em.def, p = freeList.pop() || {};
    const life = Math.max(0.12, d.l[0] + (rng() * 2 - 1) * d.l[1]);
    // spawn offset: emitter position + area
    let ox = d.p[0], oy = d.p[1], oz = d.p[2] || 0;
    const aL = d.ar[0], aW = d.ar[1];
    if (d.et === 2) { const a = rng() * 6.283, r = Math.max(aW, aL) * Math.sqrt(rng()); ox += Math.cos(a) * r; oy += Math.sin(a) * r; }
    else { ox += (rng() - 0.5) * aL; oy += (rng() - 0.5) * aW; }
    proj(ox * sc, oy * sc, oz * sc, pv);
    p.x = origin.x + pv.x; p.y = origin.y + pv.y;
    // velocity: cone around +Z, vertical range = polar spread, horizontal range = azimuth spread
    const pol = rng() * d.an[0], az = (rng() * 2 - 1) * d.an[1];
    const sp = (d.sp[0] * (1 + (rng() * 2 - 1) * d.sp[1])) * sc;
    proj(Math.sin(pol) * Math.cos(az) * sp, Math.sin(pol) * Math.sin(az) * sp, Math.cos(pol) * sp, pv);
    p.vx = pv.x; p.vy = pv.y;
    p.age = 0; p.life = life; p.rot = d.rc[0] * d.rc[1] > 1 ? 0 : rng() * 6.283;
    p.spin = (d.sn[0] + (rng() * 2 - 1) * d.sn[1]) || 0;
    p.sv = 1 + (rng() * 2 - 1) * (d.sv[0] || 0);
    p.cellOff = 0;
    em.parts.push(p); live++;
  }

  function update(dt) {
    inst.t += dt;
    if (inst.t < 0) return;
    const origin = getPos() || { x: 0, y: 0 };
    const tm = loop ? inst.t % (dur / 1000) : inst.t;
    const emitting = !inst.stopping && inst.t <= maxEmit;
    let alive = 0;
    for (const em of ems) {
      const d = em.def;
      if (emitting) {
        const rate = rateAt(d.rate, tm * 1000) * (o.rate ?? 1) * (o.reduced ? 0.5 : 1);
        em.acc += Math.max(0, rate) * dt;
        let guard = 12;
        while (em.acc >= 1 && guard--) { em.acc -= 1; spawnParticle(em, origin); }
        if (em.acc > 4) em.acc = 4;
      }
      const g = d.g * sc, drag = d.dr > 0 ? Math.max(0, 1 - d.dr * dt * 0.5) : 1;
      for (let i = em.parts.length - 1; i >= 0; i--) {
        const p = em.parts[i];
        p.age += dt;
        if (p.age >= p.life) { freeList.push(p); em.parts[i] = em.parts[em.parts.length - 1]; em.parts.pop(); live--; continue; }
        p.vy += g * dt; p.vx *= drag; p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      }
      alive += em.parts.length;
    }
    if (model.r && o.ribbons !== false) {                     // ribbon history: a point every ~1/eps s while the model is placed
      inst.trailAcc += dt;
      const eps = Math.min(40, model.r[0].eps || 30);
      if (inst.trailAcc >= 1 / eps && emitting) { inst.trailAcc = 0; trail.push({ x: origin.x, y: origin.y, a: 0 }); if (trail.length > 28) trail.shift(); }
      for (const pt of trail) pt.a += dt;
      while (trail.length && trail[0].a > (model.r[0].l || 0.4) * 1.1) trail.shift();
      alive += trail.length;
    }
    inst.origin = origin;
    if (inst.stopping) inst.fade = Math.max(0, inst.fade - dt * 3);
    const spritesOver = !model.m || (!loop && inst.t > spriteEnd) || inst.stopping;
    if ((inst.t > maxEmit + 0.05 && alive === 0 && spritesOver) || (inst.stopping && alive === 0 && inst.fade <= 0)) finish();
  }

  function finish() {
    if (inst.done) return;
    inst.done = true; instances.delete(inst);
    for (const em of ems) { for (const p of em.parts) { freeList.push(p); live--; } em.parts.length = 0; }
    if (o.onDone) o.onDone();
  }

  function draw(g) {
    if (inst.t < 0 || !inst.origin) return;
    const a0 = (o.alpha ?? 1) * inst.fade;
    let mode = "";
    const setMode = (add) => { const m = add ? "lighter" : "source-over"; if (m !== mode) { g.globalCompositeOperation = m; mode = m; } };
    g.save();
    // ribbons: tapered tinted trail
    if (model.r && trail.length > 1 && o.ribbons !== false) {
      const rb = model.r[0], col = rb.c || [1, 1, 1], w = (rb.up + rb.dn) * sc * 0.55;
      setMode(true);
      g.lineCap = "butt";
      for (let i = 1; i < trail.length; i++) {
        const u = i / trail.length, p0 = trail[i - 1], p1 = trail[i], lifeF = 1 - p1.a / ((rb.l || 0.4) * 1.1);
        g.globalAlpha = Math.max(0, Math.min(1, (rb.a || 0.5) * 1.4 * u * lifeF)) * a0;
        g.strokeStyle = `rgb(${(col[0] <= 1 ? col[0] * 255 : col[0]) | 0},${(col[1] <= 1 ? col[1] * 255 : col[1]) | 0},${(col[2] <= 1 ? col[2] * 255 : col[2]) | 0})`;
        g.lineWidth = Math.max(2, w * u);
        g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      }
    }
    // mesh sprites
    if (model.m && o.sprites !== false && !(globalThis.__fxdbg && globalThis.__fxdbg.noSprites)) {
      const tmx = inst.t, env = loop ? Math.min(1, tmx / 0.12) : Math.min(1, tmx / 0.1, Math.max(0, (spriteEnd - tmx) / 0.18 + 0.0001));
      for (const s of model.m) {
        art.tex(s.t);
        const img = art.tinted(s.t, 255, 255, 255);
        if (!img) continue;
        const flat = s.h < 0.18 * Math.max(s.w, s.d), add = s.b >= 3 || art.opaque(s.t);
        let w = Math.max(Math.max(s.w, s.d) * sc * 1.1, flat ? 190 * (o.scale || 1) : 0), h = (flat ? Math.max(s.w, s.d) * 0.42 : Math.max(s.h, s.d, 0.1)) * sc;
        if (!flat && s.w > s.h * 1.4) { w = s.w * sc; h = Math.max(s.h, 0.12) * sc * 1.2; }
        w = Math.min(w * 0.8, 460); h = Math.min(h * 0.8, 460);
        setMode(add);
        g.globalAlpha = Math.max(0, env) * a0 * (add ? 0.85 : 1);
        g.save(); g.translate(inst.origin.x, inst.origin.y - (s.cz || 0) * sc * 0.4);
        if (!flat && (hx !== 1 || hy !== 0) && s.w > s.h * 1.4) g.rotate(Math.atan2(hy, hx));
        if (!add && !flat) {          // opaque 3D batch (fireball core, shadow orb): a slowly turning clipped disc reads as a lit sphere
          g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, 6.2832); g.clip(); g.rotate(inst.t * 2.2);
          g.drawImage(img, -w * 0.75, -h * 0.75, w * 1.5, h * 1.5);
        } else g.drawImage(img, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }
    // particles
    const c = tmpC, sv = tmpS;
    for (const em of (globalThis.__fxdbg && globalThis.__fxdbg.noParticles ? [] : ems)) {
      const d = em.def, add = d.b >= 3 || art.opaque(d.t), cells = d.rc[0] * d.rc[1];
      setMode(add);
      for (const p of em.parts) {
        const u = p.age / p.life;
        const col = samp(d.c, u, c) || [255, 255, 255];
        const al = samp(d.a, u) ?? 1;
        const s2 = samp(d.s, u, sv) || [0.1, 0.1];
        const size = Math.min(360, Math.max(2, s2[0] * sc * SIZE_MUL * p.sv));
        const alpha = Math.min(1, Math.max(0, al)) * a0 * (add ? ADD_GAIN : 1);
        if (alpha < 0.02) continue;
        art.tex(d.t);
        const img = art.tinted(d.t, col[0], col[1], col[2]);
        if (!img) continue;
        g.globalAlpha = alpha;
        const h2 = size * (s2[1] && s2[0] ? s2[1] / s2[0] : 1);
        if (cells > 1) {
          const cell = Math.min(cells - 1, Math.max(0, Math.floor(samp(d.hd, u) ?? 0)));
          const cw = img.width / d.rc[1], ch = img.height / d.rc[0];
          g.drawImage(img, (cell % d.rc[1]) * cw, Math.floor(cell / d.rc[1]) * ch, cw, ch, p.x - size / 2, p.y - h2 / 2, size, h2);
        } else if (p.rot) {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(img, -size / 2, -h2 / 2, size, h2); g.restore();
        } else g.drawImage(img, p.x - size / 2, p.y - h2 / 2, size, h2);
      }
    }
    g.restore();
  }

  const actor = { get done() { return inst.done; }, set done(v) { if (v) finish(); }, update, draw };
  inst.stop = () => { inst.stopping = true; };
  inst.kill = finish;
  inst.actor = actor;
  instances.add(inst); actors.push(actor); wake();
  return inst;
}

export const liveParticles = () => live;
/** release every live instance (fx.clear()) */
export function killAll() { for (const i of [...instances]) i.kill(); }
