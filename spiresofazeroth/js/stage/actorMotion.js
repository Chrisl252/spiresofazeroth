// actorMotion.js - renderer-agnostic actor motion: a tiny tween scheduler plus the choreography
// (lunge / hit / block / death / statusPulse / highlight / hover) shared by the 3D actor and the
// 2D shadow-silhouette plate, so both honour VISUAL_SPEC timings identically.
//
// State is in stage px (1920x1080 design space): x/y are OFFSETS from the actor's lane position
// (y down), rot is degrees of tip (+ = clockwise on screen), sx/sy are squash/stretch, alpha 0..1,
// flash 0..1 (white), glow 0..1 tinted by glowColor, ring/hover 0..1.

const EASE = {
  lin: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

// integration: global time scale (combat speed setting). 1 = normal, 2 = twice as fast. Applied to every tween/wait duration.
export const motionScale = { v: 1 };

export function createMotion(wake) {
  const s = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0, glow: 0, glowColor: "#ffffff", ring: 0, hover: 0 };
  let tw = [];
  function tween(prop, to, ms, ease = "out", delay = 0) {
    return new Promise((res) => {
      tw = tw.filter((t) => { if (t.prop === prop && prop) { t.res(); return false; } return true; });
      const sc = motionScale.v || 1;
      tw.push({ prop, to, ms: Math.max(1, ms / sc), ease: EASE[ease] || EASE.out, delay: delay / sc, t0: null, from: 0, res });
      wake();
    });
  }
  const wait = (ms) => tween(null, 0, ms, "lin");
  function update(now) {
    if (!tw.length) return false;
    const keep = [];
    for (const t of tw) {
      if (t.t0 === null) { t.t0 = now + t.delay; t.from = t.prop ? s[t.prop] : 0; }
      const k = (now - t.t0) / t.ms;
      if (k < 0) { keep.push(t); continue; }
      if (t.prop) s[t.prop] = t.from + (t.to - t.from) * t.ease(Math.min(1, k));
      if (k >= 1) t.res(); else keep.push(t);
    }
    tw = keep;
    return tw.length > 0;
  }
  return { s, tween, wait, update, get busy() { return tw.length > 0; } };
}

// Choreography. `core` = { motion, uid, facing (+1 hero faces right, -1 enemies), base() -> {x,y,h} in stage px }.
// targetAnchor = anchor object from the actor being attacked ({ feet:{x,y}, chest:{x,y} }).
export function choreography(core) {
  const m = core.motion, s = m.s;
  const api = {
    async lunge(target, opts = {}) {
      const b = core.base();
      const tf = target && target.feet ? target.feet : { x: b.x + core.facing * 300, y: b.y };
      const dir = Math.sign(tf.x - b.x) || core.facing;
      if (opts.cast || opts.spell || opts.ranged || opts.shoot) {
        // Caster stance: stay planted, windup gather, forward spell release recoil, recover
        await Promise.all([m.tween("x", -dir * 24, 110, "inOut"), m.tween("sy", 1.06, 110, "out"), m.tween("sx", 0.95, 110, "out")]);
        await Promise.all([m.tween("x", dir * 28, 130, "out"), m.tween("sy", 0.94, 130, "out"), m.tween("sx", 1.04, 130, "out")]);
        if (opts.onImpact) { try { opts.onImpact(); } catch (e) { console.error(e); } }
        await m.wait(opts.hold != null ? opts.hold : 80);
        await Promise.all([m.tween("x", 0, 190, "inOut"), m.tween("sy", 1, 190, "inOut"), m.tween("sx", 1, 190, "inOut")]);
        return;
      }
      const gap = opts.gap != null ? opts.gap : 190;
      const travel = Math.max(90, Math.min(580, Math.abs(tf.x - b.x) - gap)) * dir;
      const ty = (tf.y - b.y) * 0.45;
      // Melee spring: deep anticipation squash -> ferocious forward leap -> strike -> recover
      await Promise.all([m.tween("x", -dir * 36, 110, "inOut"), m.tween("sy", 0.92, 110, "inOut"), m.tween("sx", 1.06, 110, "inOut")]);
      await Promise.all([m.tween("x", travel, 150, "out"), m.tween("y", ty, 150, "out"), m.tween("sy", 1.06, 150, "out"), m.tween("sx", 0.96, 150, "out")]);
      if (opts.onImpact) { try { opts.onImpact(); } catch (e) { console.error(e); } }
      await m.wait(opts.hold != null ? opts.hold : 80);
      await Promise.all([m.tween("x", 0, 220, "inOut"), m.tween("y", 0, 220, "inOut"), m.tween("sy", 1, 220, "inOut"), m.tween("sx", 1, 220, "inOut")]);
    },
    async castGesture(opts = {}) {
      // Non-attack power cast / buff / roar / enrage
      s.glowColor = opts.color || "#ffd66a";
      await Promise.all([m.tween("sy", 1.09, 120, "out"), m.tween("sx", 0.94, 120, "out"), m.tween("glow", 0.85, 120, "out")]);
      await Promise.all([m.tween("sy", 0.95, 90, "inOut"), m.tween("sx", 1.04, 90, "inOut"), m.tween("flash", 0.45, 90, "out")]);
      if (opts.onImpact) { try { opts.onImpact(); } catch (e) { console.error(e); } }
      await m.wait(opts.hold != null ? opts.hold : 90);
      await Promise.all([m.tween("sy", 1, 210, "inOut"), m.tween("sx", 1, 210, "inOut"), m.tween("glow", 0, 210, "inOut"), m.tween("flash", 0, 120, "inOut")]);
    },
    async hit(o = {}) {
      const amt = o.amount || 0;
      const baseKb = amt >= 20 ? 54 : (amt >= 10 ? 40 : 26);
      const kb = (baseKb + Math.min(22, amt * 0.55)) * (o.knock != null ? o.knock : 1) * -core.facing; // away from attacker
      const flinchRot = Math.min(6, 1.5 + amt * 0.2) * -core.facing;
      const squashY = Math.max(0.86, 0.94 - amt * 0.005);
      const stretchX = Math.min(1.14, 1.04 + amt * 0.005);
      s.glowColor = o.isCrit ? "#ff3333" : (o.color || "#ffffff");
      s.flash = 1;
      await m.wait(38); // crisp 2-frame hit-stop
      await Promise.all([
        m.tween("x", kb, 75, "out"),
        m.tween("rot", flinchRot, 75, "out"),
        m.tween("flash", 0, 100, "out"),
        m.tween("sy", squashY, 75, "out"),
        m.tween("sx", stretchX, 75, "out"),
      ]);
      await Promise.all([
        m.tween("x", 0, 180, "inOut"),
        m.tween("rot", 0, 180, "inOut"),
        m.tween("sy", 1, 180, "inOut"),
        m.tween("sx", 1, 180, "inOut"),
      ]);
    },
    async block() {
      s.glowColor = "#ffd66a";
      const braceX = -core.facing * 18;
      await Promise.all([
        m.tween("x", braceX, 60, "out"),
        m.tween("sy", 0.95, 60, "out"),
        m.tween("sx", 1.04, 60, "out"),
        m.tween("glow", 0.95, 80, "out"),
      ]);
      await Promise.all([
        m.tween("x", 0, 210, "inOut"),
        m.tween("sy", 1, 210, "inOut"),
        m.tween("sx", 1, 210, "inOut"),
        m.tween("glow", 0, 380, "inOut"),
      ]);
    },
    async statusPulse(color) {
      s.glowColor = color || "#ffffff";
      await Promise.all([m.tween("glow", 0.8, 130, "out"), m.tween("sy", 1.05, 130, "out")]);
      await Promise.all([m.tween("glow", 0, 360, "inOut"), m.tween("sy", 1, 200, "inOut")]);
    },
    async death(o = {}) {
      const back = -core.facing; // tip away from the opposing side
      const jobs = [
        m.tween("rot", 76 * back, 480, "out"),
        m.tween("y", 46, 520, "in"),
        m.tween("ring", 0, 120, "out"),
        m.tween("hover", 0, 120, "out"),
      ];
      if (o && o.fade) jobs.push(m.tween("alpha", 0, 480, "lin"));
      await Promise.all(jobs);
    },
    highlight(on, red) { m.s.red = !!red; return m.tween("ring", on ? 1 : 0, 140, "out"); },
    hover(on) { return m.tween("hover", on ? 1 : 0, 120, "out"); },
  };
  return api;
}

// Dust puff at the feet (DOM, used on death by both renderers). layer = a positioned element in stage space.
export function dustPuff(layer, x, y, w) {
  if (!layer) return;
  for (let i = 0; i < 7; i++) {
    const d = document.createElement("i");
    const dx = (Math.random() - 0.5) * w * 0.9, sz = 46 + Math.random() * 54;
    d.style.cssText = `position:absolute;left:${x + dx - sz / 2}px;top:${y - sz * 0.6}px;width:${sz}px;height:${sz}px;border-radius:50%;pointer-events:none;` +
      `background:radial-gradient(circle,rgba(168,150,120,.55),rgba(120,104,84,.22) 55%,transparent 72%);opacity:0;` +
      `transition:transform .9s cubic-bezier(.2,.7,.3,1),opacity .9s ease-out;transition-delay:${i * 30}ms`;
    layer.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.style.opacity = "1"; d.style.transform = `translate(${dx * 0.5}px,${-34 - Math.random() * 50}px) scale(${1.5 + Math.random()})`;
      setTimeout(() => { d.style.opacity = "0"; }, 280 + i * 30);
    }));
    setTimeout(() => d.remove(), 1500);
  }
}
