// Per-card spell looks (data/fx/cards.json): shape recipes built from the Cinderwake sheets + particle kit.
// Entry point: runLook(h, look, kind, resolve). `h` is the helper bag choreo.js hands over (see playLook there).
// Look schema + shape list: data/fx/MAPPER_BRIEF.md. Unknown shapes fall back to bolt (target) / aura (self).
export const SHAPES = ["slash", "arc", "bolt", "nova", "beam", "shield", "aura", "heal", "cleave", "whirl", "rain"];
export const PARTICLES = ["sparks", "embers", "frost", "arcane", "leaves", "holy", "shadow", "blood", "stone", "wind"];
const SELF = new Set(["shield", "aura", "heal"]);          // always centred on the caster
const CENTRED = new Set(["shield", "aura", "heal", "nova", "whirl"]);

/** Does this look need a target to read right? (target-side shape on a card that has no enemy target -> caller falls back) */
export const needsTarget = (look) => !CENTRED.has(look.shape);

const PSTYLE = {
  sparks: { cell: "streak", add: true, g: 360, sp: [380, 1000], life: [0.2, 0.45], size: [10, 17], align: true },
  embers: { cell: "ember", add: true, g: -90, sp: [80, 380], life: [0.6, 1.1], size: [12, 22] },
  frost: { cell: "shard", add: true, g: 700, sp: [200, 640], life: [0.5, 0.95], size: [14, 28], spin: true },
  arcane: { cell: "star", add: true, g: -20, sp: [160, 520], life: [0.4, 0.8], size: [12, 22] },
  leaves: { cell: "leaf", add: false, g: 380, sp: [160, 520], life: [0.6, 1.1], size: [20, 34], spin: true },
  holy: { cell: "star", add: true, g: -120, sp: [120, 420], life: [0.6, 1.1], size: [12, 22] },
  shadow: { cell: "puff", add: false, g: -20, sp: [60, 240], life: [0.6, 1.1], size: [40, 66], grow: 2.3, alpha: 0.55 },
  blood: { cell: "dot", add: false, g: 900, sp: [160, 520], life: [0.4, 0.8], size: [12, 22], alpha: 0.9 },
  stone: { cell: "shard", add: false, g: 1400, sp: [220, 700], life: [0.5, 0.95], size: [14, 30], spin: true },
  wind: { cell: "puff", add: false, g: -10, sp: [100, 420], life: [0.4, 0.8], size: [30, 56], grow: 2, alpha: 0.35 },
};
export function emit(h, look, pos, n = 14, o = {}) {
  const st = PSTYLE[look.particles] || PSTYLE.sparks, { P, c } = h, col = o.color || (look.particles === "shadow" ? c.pal.dark : c.pal.warm);
  P.burst({ x: pos.x, y: pos.y, count: Math.round(n * (look.scale > 1.3 ? 1.3 : 1)), cell: st.cell, additive: st.add, align: !!st.align, stretch: st.align ? 0.0042 : undefined,
    spin: st.spin ? [-12, 12] : undefined, randRot: !!st.spin, speed: st.sp, size: st.size, sizeEnd: st.grow || 0.45, life: st.life, gravity: st.g, drag: 1.6, color: col, alpha: st.alpha, angle: o.angle });
}

function jag(h, a, b, amp, segs) {
  const pts = [a], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  for (let i = 1; i < segs; i++) { const t = i / segs, o = (h.rng() - 0.5) * 2 * amp; pts.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o }); }
  pts.push(b); return pts;
}
/** a line from a to b with a flicker, drawn by an actor for `dur` s. jagged = lightning-style polyline. */
function beamActor(h, a, b, { dur = 0.35, width = 16, color, core = "#ffffff", jagged = false, delay = 0 }) {
  let t = -delay, acc = 99, pts = null;
  const mk = () => (jagged ? jag(h, a, b, Math.max(10, width * 1.4), 9) : jag(h, a, b, width * 0.35, 6));
  const actor = { done: false, update(dt) { t += dt; acc += dt; if (t >= dur) actor.done = true; },
    draw(g) {
      if (t < 0) return;
      if (acc > 0.035) { acc = 0; pts = mk(); }
      const u = t / dur, f = u < 0.15 ? u / 0.15 : Math.pow(Math.max(0, 1 - (u - 0.15) / 0.85), 1.4), fl = 0.8 + h.rng() * 0.4;
      g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = g.lineJoin = "round";
      for (const [w, col, al] of [[width * 2.6, color, 0.22], [width, color, 0.6], [width * 0.38, core, 0.95]]) {
        g.globalAlpha = Math.max(0, Math.min(1, al * f * fl)); g.strokeStyle = col; g.lineWidth = w * (0.7 + 0.3 * f);
        g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      } g.restore();
    } };
  h.actors.push(actor); h.wake(); return actor;
}

function palFor(look, mix) {
  const m = look.tint, w = look.tint2 || m;
  return { main: m, hot: mix(w, "#ffffff", 0.55), warm: w, dark: mix(m, "#000000", 0.62) };
}

function whirlFx(h, look, hero, feet, s) {
  const { c } = h, y = feet.y - 70;
  for (let i = 0; i < 4; i++) c.sheet(["slash_arc_a", "slash_arc_b", "slash_arc_c"][i % 3], { x: hero.x, y: hero.y, scale: 1.35 * s, rotation: i * 1.57, tint: i % 2 ? "main" : "hot", delay: i * 0.05, hot: 0.5, flipY: i % 2 === 1 });
  c.sheet("shockwave_ring", { x: feet.x, y: feet.y - 8, scale: 2.0 * s, tint: "main", delay: 0.05 });
  let t = 0;
  h.actors.push({ done: false, update(dt) { t += dt; this.done = t > 0.5; }, draw(g) {
    const u = t / 0.5, fa = (1 - u) * (1 - u); g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
    g.globalAlpha = 0.8 * fa; g.strokeStyle = c.pal.main; g.lineWidth = 12; g.translate(hero.x, y + 20); g.scale(1, 0.38); g.rotate(t * 14);
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 150 + 20 * u, k * 2.094, k * 2.094 + 1.2); g.stroke(); } g.restore(); } });
  h.wake(); emit(h, look, { x: hero.x, y }, 16);
}

/** Main entry. kind = attack|skill|power|heal. */
export function runLook(h, look, kind, resolve) {
  const { c, P, at, mix, numbers } = h, s = c.s * (look.scale || 1);
  const shape = SHAPES.includes(look.shape) ? look.shape : "bolt";
  c.pal = palFor(look, mix);
  const hasS = (n) => n && n !== "none";
  const imp = hasS(look.impact) ? look.impact : "impact_burst", n = Math.max(1, look.n || 1);
  const done = (sec) => at(sec, resolve);
  const fire = () => { if (c.opts.onImpact) { try { c.opts.onImpact(); } catch (e) { console.error(e); } } };
  const shake = look.shake ?? 0.4, lightning = imp.startsWith("lightning"), column = lightning || imp === "holy_ray";
  const hit = (pos, feet, k = 1) => {
    h.impactCore(c, { flashR: 115 * k, kick: true });
    if (shake > 0) numbers.kick(Math.min(18, shake * (6 + c.amount * 0.45)));
    c.sheet(imp, { x: column ? feet.x : pos.x, y: column ? feet.y + 8 : pos.y, scale: (lightning ? 3.3 : imp === "holy_ray" ? 2.6 : 1.5) * s * k, tint: "main", hot: lightning ? 0.75 : 0.55 });
    c.sheet("hit_star", { x: pos.x, y: pos.y, scale: 1.15 * s * k, tint: "hot", hot: 0.65 });
    emit(h, look, pos, 22 + c.amount * 0.6);
  };
  const impactEnd = () => { h.settle(c); fire(); done(0.5); };
  const now = h.clock();

  // ----- self-centred shapes -----
  if (CENTRED.has(shape) && (SELF.has(shape) || !c.opts.to || kind !== "attack")) {
    const f = c.opts.to ? c.feet : c.fromFeet, p = c.opts.to ? c.to : c.from, sc = (c.opts.scale || 1) * (look.scale || 1);
    if (shape === "shield") {
      c.sheet("shield_shimmer", { x: p.x, y: p.y, scale: 1.9 * sc, tint: "main", hot: 0.65 });
      if (hasS(look.impact) && look.impact !== "shield_shimmer") c.sheet(look.impact, { x: p.x, y: p.y, scale: 1.3 * sc, tint: "warm", delay: 0.05, alpha: 0.75 });
      c.sheet("shockwave_ring", { x: f.x, y: f.y - 8, scale: 1.6 * sc, tint: "hot", delay: 0.08, hot: 0.5 });
      c.sheet("spark_burst", { x: p.x, y: p.y, scale: 1.2 * sc, tint: "hot", delay: 0.04 });
      emit(h, look, { x: f.x, y: f.y - 30 }, 14, { angle: [-2.6, -0.5] }); numbers.kick(3 + (look.shake || 0) * 4);
      at(0.12, fire); done(0.7);
    } else if (shape === "heal") {
      c.sheet("heal_sparkle", { x: f.x, y: f.y + 6, scale: 2.1 * sc, tint: "main", hot: 0.65 });
      if (hasS(look.impact) && look.impact !== "heal_sparkle") c.sheet(look.impact, { x: look.impact === "holy_ray" ? f.x : p.x, y: look.impact === "holy_ray" ? f.y + 10 : p.y, scale: (look.impact === "holy_ray" ? 2.6 : 1.45) * sc, tint: "main", hot: 0.55, delay: 0.04 });
      c.sheet("shockwave_ring", { x: f.x, y: f.y - 6, scale: 1.4 * sc, tint: "warm", delay: 0.08, alpha: 0.85, hot: 0.4 });
      P.fountain({ x: f.x, y: f.y - 10, dur: 0.85, rate: 48, cell: "dot", color: c.pal.main, speed: [120, 320], size: [16, 28], life: [0.8, 1.4], width: 120, cone: 0.7, gravity: -50 });
      P.drift({ x: p.x, y: p.y + 30, w: 130, h: 170, count: 16, cell: "star", color: c.pal.hot, rise: 100, size: [12, 22], life: [0.9, 1.5], over: 0.6 });
      at(0.12, fire); done(1.05);
    } else if (shape === "aura") {
      c.sheet("buff_glyph_rise", { x: f.x, y: f.y + 8, scale: 2.3 * sc, tint: "main", hot: 0.65 });
      if (hasS(look.impact) && look.impact !== "buff_glyph_rise") c.sheet(look.impact, { x: p.x, y: p.y, scale: 1.35 * sc, tint: "warm", delay: 0.06, alpha: 0.7 });
      c.sheet("shockwave_ring", { x: f.x, y: f.y - 6, scale: 1.7 * sc, tint: "warm", delay: 0.1, hot: 0.4 });
      emit(h, look, { x: f.x, y: f.y - 20 }, 18, { angle: [-2.4, -0.7] });
      P.fountain({ x: f.x, y: f.y, dur: 0.95, rate: 50, cell: "star", color: c.pal.warm, speed: [200, 460], size: [14, 26], life: [0.7, 1.3], width: 100, cone: 0.5, gravity: -30 });
      numbers.kick(3.5); if (kind === "power" && c.opts.persist !== false) h.aura(c.opts.key || c.opts.cardId || "aura", p, c.pal.main);
      at(0.15, fire); done(1.0);
    } else if (shape === "nova") {
      c.sheet("shockwave_ring", { x: f.x, y: f.y - 8, scale: 3.2 * sc, tint: "main", hot: 0.65 });
      c.sheet("shockwave_ring", { x: f.x, y: f.y - 8, scale: 2.2 * sc, tint: "hot", delay: 0.07, alpha: 0.75, hot: 0.45 });
      c.sheet("spark_burst", { x: f.x, y: f.y - 24, scale: 1.8 * sc, tint: "hot", hot: 0.6 });
      P.ring({ x: f.x, y: f.y - 8, count: 36, squash: 0.35, cell: "star", color: c.pal.warm, radius: 36, speed: [360, 580], size: [14, 26], life: [0.45, 0.75] });
      emit(h, look, { x: f.x, y: f.y - 20 }, 16);
      numbers.kick(5.5); at(0.12, fire); done(0.7);
    } else { whirlFx(h, look, c.from, f, s); at(0.2, fire); done(0.8); }
    return;
  }

  // ----- target-side shapes -----
  const { from, to, feet } = c;
  const windup = () => { c.sheet("spark_burst", { x: from.x, y: from.y, scale: 0.85, tint: "hot", alpha: 0.75, hot: 0.5 }); P.burst({ x: from.x, y: from.y, count: 12, cell: "star", color: c.pal.main, speed: [90, 280], size: [11, 20], life: [0.2, 0.38] }); };
  const strike = (cb, delay = 0.13) => { windup(); at(delay, cb); };
  const arcSheet = (i, o = {}) => c.sheet(["slash_arc_a", "slash_arc_b", "slash_arc_c"][i % 3], { x: o.x ?? to.x, y: o.y ?? to.y, scale: (o.scale || 1.45) * s, rotation: o.rot ?? (c.ang * 0.4 - 0.5), tint: o.tint || "hot", delay: o.delay || 0, flipY: o.flipY, hot: 0.65 });
  const dustLite = () => P.burst({ x: feet.x, y: feet.y - 6, count: 7, cell: "puff", additive: false, speed: [70, 200], angle: [Math.PI * 1.05, Math.PI * 1.95], size: [38, 64], sizeEnd: 2.2, life: [0.5, 0.85], drag: 2.4, color: "#bba98a", alpha: 0.45 });

  if (shape === "slash" || shape === "arc") {
    strike(() => {
      const big = shape === "arc";
      for (let i = 0; i < n; i++) arcSheet(i + (big ? 1 : 0), { scale: (big ? 2.0 : 1.45) * (n > 2 ? 0.9 : 1), delay: i * 0.065, flipY: i % 2 === 1, rot: (c.ang * 0.4 - 0.5) + (i - (n - 1) / 2) * 0.55 * (i % 2 ? -1 : 1), tint: i % 2 ? "main" : "hot", hot: 0.65 });
      at(0.04, () => { hit(to, feet); dustLite(); impactEnd(); });
    });
  } else if (shape === "cleave") {
    strike(() => {
      if (now - (h.state.cleaveT ?? -9) > 0.3) { // one sweep per card, not per target
        h.state.cleaveT = now; const y0 = to.y - 20, span = 480; let t = 0; const life = 0.32;
        h.actors.push({ done: false, update(dt) { t += dt; this.done = t > life + 0.2; }, draw(g) {
          const u = Math.min(1, t / life), fa = t < life ? 1 : Math.max(0, 1 - (t - life) / 0.2); g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
          const x0 = to.x - span, xe = x0 + 2 * span * (1 - Math.pow(1 - u, 2.2));
          for (let k = 0; k < 3; k++) { g.globalAlpha = [0.35, 0.75, 1.0][k] * fa; g.strokeStyle = [c.pal.main, c.pal.warm, "#ffffff"][k]; g.lineWidth = [80, 36, 12][k];
            g.beginPath(); g.moveTo(x0, y0 + 30); g.quadraticCurveTo((x0 + xe) / 2, y0 - 80, xe, y0 + 14); g.stroke(); } g.restore(); } });
        h.wake();
        c.sheet("shockwave_ring", { x: to.x, y: feet.y - 6, scale: 2.2 * s, tint: "main", hot: 0.5 });
        for (let i = 0; i < 4; i++) arcSheet(i, { x: to.x - 220 + i * 140, scale: 1.8, rot: -0.35 + i * 0.1, delay: i * 0.05, tint: i % 2 ? "main" : "hot", hot: 0.65 });
        P.burst({ x: to.x, y: to.y, count: 32, cell: "streak", align: true, stretch: 0.005, color: c.pal.warm, speed: [450, 1200], size: [11, 18], life: [0.22, 0.5], angle: [-0.6, 0.6], gravity: 200 });
      }
      hit(to, feet); impactEnd();
    });
  } else if (shape === "whirl") {
    if (now - (h.state.whirlT ?? -9) > 0.35) { h.state.whirlT = now; whirlFx(h, look, from, c.fromFeet, s); }
    at(0.2, () => { arcSheet(0, { scale: 1.35, tint: "main", hot: 0.6 }); hit(to, feet, 1.0); impactEnd(); });
  } else if (shape === "nova") {
    const f = c.fromFeet;
    if (now - (h.state.novaT ?? -9) > 0.35) { h.state.novaT = now; c.sheet("shockwave_ring", { x: f.x, y: f.y - 8, scale: 3.4 * s, tint: "main", hot: 0.6 }); P.ring({ x: f.x, y: f.y - 8, count: 34, squash: 0.35, cell: "star", color: c.pal.warm, radius: 34, speed: [360, 580], size: [14, 24], life: [0.45, 0.75] }); }
    at(0.1 + Math.min(0.25, c.dist / 4500), () => { hit(to, feet); impactEnd(); });
  } else if (shape === "beam") {
    const dur = look.dur || 0.38 + (look.hops || 0) * 0.08;
    windup();
    at(0.08, () => {
      const hops = look.hops || 0, pts = [from, to];
      for (let i = 0; i < hops; i++) { const p = pts[pts.length - 1]; pts.push({ x: p.x + (h.rng() - 0.3) * 260, y: Math.max(260, Math.min(820, p.y + (h.rng() - 0.5) * 300)) }); }
      for (let i = 0; i < pts.length - 1; i++) {
        beamActor(h, pts[i], pts[i + 1], { dur, delay: i * 0.08, width: (lightning ? 16 : 18) * (look.scale || 1), color: c.pal.main, core: c.pal.hot, jagged: lightning || look.jagged });
        if (lightning) beamActor(h, pts[i], pts[i + 1], { dur: dur * 0.75, delay: i * 0.08 + 0.03, width: 8, color: c.pal.hot, core: "#ffffff", jagged: true });
      }
      at(0.04, () => hit(to, feet));
      for (let i = 2; i < pts.length; i++) at((i - 1) * 0.09, () => { c.sheet("spark_burst", { x: pts[i].x, y: pts[i].y, scale: 1.1 * s, tint: "hot", hot: 0.6 }); emit(h, look, pts[i], 12); });
      impactEnd();
    });
  } else if (shape === "rain") {
    windup(); const sp = n > 1 ? 140 : 0;
    for (let i = 0; i < n; i++) {
      const pos = { x: to.x + (n > 1 ? (h.rng() - 0.5) * sp * 2 : 0), y: to.y + (n > 1 ? (h.rng() - 0.5) * 90 : 0) }, fe = { x: pos.x, y: pos.y + (feet.y - to.y) }, d = 0.1 + i * (0.45 / n);
      beamActor(h, { x: pos.x + 20, y: -120 }, pos, { dur: 0.22, delay: Math.max(0, d - 0.08), width: n > 1 ? 13 : 20, color: c.pal.main, core: c.pal.hot });
      at(d, () => {
        c.sheet("shockwave_ring", { x: fe.x, y: fe.y - 6, scale: 1.6 * s, tint: "main", hot: 0.5 });
        if (i === 0) hit(pos, fe);
        else { c.sheet(imp, { x: pos.x, y: pos.y, scale: 1.2 * s, tint: "main", hot: 0.5 }); c.sheet("hit_star", { x: pos.x, y: pos.y, scale: 0.85 * s, tint: "hot", hot: 0.6 }); emit(h, look, pos, 12); numbers.kick(3); }
      });
    }
    at(0.12, fire); at(0.62, () => h.settle(c)); done(0.7);
  } else { // bolt
    windup();
    const dart = !hasS(look.travel), head = dart ? 26 : 52 * (look.scale || 1), dur = dart ? 0.18 : 0.24;
    const pst = PSTYLE[look.particles] || PSTYLE.sparks, trail = [pst.cell === "streak" ? "dot" : pst.cell, "main", dart ? 16 : 26];
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i - (n - 1) / 2) * 140 : 0, c2 = Object.create(c);
      c2.from = { x: from.x, y: from.y + off * 0.4 }; c2.to = { x: to.x, y: to.y + off };
      at(0.08 + i * 0.09, () => {
        h.projectile(c2, { dur, head, streak: dart ? 180 : 0, trail, dark: look.particles === "shadow", arcH: n > 1 ? off * 0.55 : 0 }, () => {
          const first = landed++ === 0, tp = c2.to;
          if (first) { hit(tp, feet); fire(); }
          else { c.sheet(imp, { x: tp.x, y: tp.y, scale: 1.1 * s, tint: "main", hot: 0.5 }); c.sheet("hit_star", { x: tp.x, y: tp.y, scale: 0.8 * s, tint: "hot", hot: 0.6 }); emit(h, look, tp, 10); numbers.kick(3); }
          if (landed === n) { h.settle(c); done(0.5); }
        });
        if (hasS(look.travel)) for (let k = 1; k < 7; k++) at(k * 0.035, () => {
          const u = Math.pow(Math.min(1, (k * 0.035) / dur), 1.8);
          c.sheet(look.travel, { x: c2.from.x + (c2.to.x - c2.from.x) * u, y: c2.from.y + (c2.to.y - c2.from.y) * u, scale: 0.55 * s, tint: "main", alpha: 0.7, rotation: c.ang, rate: 4.5, holdPeak: false });
        });
      });
    }
  }
}
