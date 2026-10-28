// Floating numbers, turn banner, screen kick, white hit flash. DOM + Web Animations (positions are stage px).
const FONT = '"frizqt","Friz Quadrata TT","Palatino Linotype",Georgia,serif';
const KINDS = {
  dmg: { color: "#ff3b2a", pop: "#ffffff" },
  block: { color: "#6fb4ff", pop: "#e8f4ff" },
  heal: { color: "#58e07a", pop: "#eaffee" },
  gold: { color: "#ffd24a", pop: "#fff6d0" },
  grey: { color: "#b9bcc4", pop: "#e8eaee" },
};

/** Stack slot for a new popup: how many popups started at (about) this spot within the last `win` ms. Pure, so it is testable headless. */
export function stackSlot(live, now, x, y, win = 900) {
  for (let i = live.length - 1; i >= 0; i--) if (now - live[i].t > win) live.splice(i, 1);
  let n = 0;
  for (const l of live) if (Math.abs(l.x - x) < 110 && Math.abs(l.y - y) < 70) n++;
  live.push({ x, y, t: now });
  return n;
}
export const STACK_DY = 46, STACK_DELAY = 130; // px up / ms later per slot

export function createNumbers(layer, { kickEl, getSpeed = () => 1, isReduced = () => false } = {}) {
  const rand = Math.random; // cosmetic only (jitter); the particle system is the deterministic part
  let kickAmp = 0, kickT = 0, kickDir = 1;

  function el(tag, css, text) {
    const e = document.createElement(tag);
    e.style.cssText = "position:absolute;pointer-events:none;" + css;
    if (text != null) e.textContent = text;
    layer.appendChild(e);
    return e;
  }
  const run = (e, frames, ms, opts = {}) => {
    const a = e.animate(frames, { duration: ms / getSpeed(), easing: "linear", fill: "forwards", ...opts, recycle: undefined });
    a.onfinish = () => { if (opts.recycle && opts.recycle.length < 24) { e.style.cssText = "display:none"; opts.recycle.push(e); } else e.remove(); };
    return a;
  };

  const live = [], pool = []; // live = recent popup spots (stacking); pool = recycled DOM nodes
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  /** kind: dmg|block|heal|gold|grey. pos = stage px. Popups that start on the same spot stack upward, each a beat later. */
  function number(kind, text, pos, o = {}) {
    const k = KINDS[kind] || KINDS.dmg, amount = typeof text === "number" ? text : o.amount || 0;
    const size = Math.round(o.size || (kind === "grey" ? 40 : 52 + Math.min(40, amount * 1.2)));
    const jx = (rand() - 0.5) * 56, drift = o.drift ?? 96;
    const slot = stackSlot(live, now(), pos.x, pos.y);
    const css = `left:${pos.x + jx}px;top:${pos.y - slot * STACK_DY}px;font:900 ${size}px/1 ${FONT};color:${k.color};white-space:nowrap;z-index:30;` +
      "-webkit-text-stroke:3px rgba(10,6,4,.92);paint-order:stroke fill;text-shadow:0 3px 0 rgba(0,0,0,.55),0 0 18px " + k.color + "88;will-change:transform,opacity";
    const e = pool.pop() || el("div", "");
    e.style.cssText = "position:absolute;pointer-events:none;" + css;
    e.textContent = String(text);
    if (!e.parentNode) layer.appendChild(e);
    const T = (y, s) => `translate(-50%,calc(-50% + ${y}px)) scale(${s})`;
    run(e, [
      { transform: T(8, 0.4), opacity: 0, color: k.pop, offset: 0 },
      { transform: T(-6, 1.3), opacity: 1, color: k.pop, offset: 0.1 },
      { transform: T(-14, 1.0), opacity: 1, color: k.color, offset: 0.26 },
      { transform: T(-drift * 0.6, 1.0), opacity: 1, color: k.color, offset: 0.7 },
      { transform: T(-drift, 0.92), opacity: 0, color: k.color, offset: 1 },
    ], o.ms || 1050, { delay: (slot * STACK_DELAY) / getSpeed(), fill: "both", recycle: pool });
    return e;
  }
  const api = {
    number,
    damage: (pos, amount, o) => number("dmg", amount, pos, { ...o, amount }),
    block: (pos, amount, o) => number("block", "+" + amount, pos, { ...o, amount }),
    heal: (pos, amount, o) => number("heal", "+" + amount, pos, { ...o, amount }),
    blocked: (pos, o) => number("grey", "Blocked", pos, o),
    text: (pos, text, kind = "grey", o) => number(kind, text, pos, /^(immune|resist)/i.test(String(text)) ? { size: 30, drift: 60, ...o } : o),
    /** classic immunity / resist callouts (yellow, StS style) */
    immune: (pos, o) => number("gold", "IMMUNE", pos, { size: 46, drift: 70, ...o }),
    resist: (pos, o) => number("gold", "RESIST", pos, { size: 38, drift: 60, ...o }),

    /** "Your turn" / "Enemy turn": slides in from the left, holds, slides out right, gold rule top + bottom. */
    banner(text, o = {}) {
      const cy = o.y ?? 470, enemy = o.enemy ?? /enemy/i.test(text);
      const bar = el("div", `left:0;right:0;top:${cy - 70}px;height:140px;z-index:40;display:flex;align-items:center;justify-content:center;` +
        `background:linear-gradient(90deg,transparent,rgba(8,5,3,.82) 18%,rgba(8,5,3,.82) 82%,transparent);will-change:transform,opacity`);
      const rule = "position:absolute;left:8%;right:8%;height:3px;background:linear-gradient(90deg,transparent,#e8b84a 20%,#fff1b0 50%,#e8b84a 80%,transparent);box-shadow:0 0 14px #e8b84a99;";
      const r1 = document.createElement("i"), r2 = document.createElement("i");
      r1.style.cssText = rule + "top:0"; r2.style.cssText = rule + "bottom:0";
      const t = document.createElement("span");
      t.textContent = text;
      t.style.cssText = `font:900 78px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${enemy ? "#ff6a4a" : "#ffd870"};-webkit-text-stroke:3px rgba(10,6,4,.9);paint-order:stroke fill;text-shadow:0 4px 0 rgba(0,0,0,.5),0 0 30px ${enemy ? "#ff3a1a88" : "#ffb83088"}`;
      bar.append(r1, r2, t);
      const a = run(bar, [
        { transform: "translateX(-60%)", opacity: 0, offset: 0, easing: "cubic-bezier(.16,.84,.3,1)" },
        { transform: "translateX(0)", opacity: 1, offset: 0.2 },
        { transform: "translateX(2%)", opacity: 1, offset: 0.72, easing: "cubic-bezier(.6,0,.9,.4)" },
        { transform: "translateX(60%)", opacity: 0, offset: 1 },
      ], o.ms || 1300);
      return new Promise((res) => { a.onfinish = () => { bar.remove(); res(); }; });
    },

    /** screen kick: translate the stage root (individual `translate` property, composes with its scale transform). */
    kick(amp = 6) { if (isReduced()) return; kickAmp = Math.max(kickAmp, Math.min(amp, 22)); kickT = 0; kickDir = rand() < 0.5 ? -1 : 1; },
    get kicking() { return kickAmp > 0.2; },
    update(realDt) {
      if (kickAmp <= 0) return;
      kickT += realDt;
      kickAmp *= Math.exp(-14 * realDt);
      if (kickAmp < 0.2) { kickAmp = 0; if (kickEl) kickEl.style.translate = ""; return; }
      const ph = kickT * 62;
      if (kickEl) kickEl.style.translate = `${(Math.sin(ph) * kickAmp * kickDir).toFixed(2)}px ${(Math.cos(ph * 0.83) * kickAmp * 0.7).toFixed(2)}px`;
    },

    /** white radial hit flash at pos (additive-looking via screen blend). */
    flash(pos, o = {}) {
      const r = o.radius ?? 170, ms = o.ms ?? 110, c = o.color || "255,255,255";
      const e = el("div", `left:${pos.x - r}px;top:${pos.y - r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;z-index:25;mix-blend-mode:screen;` +
        `background:radial-gradient(circle,rgba(${c},${o.alpha ?? 0.95}) 0%,rgba(${c},.55) 28%,rgba(${c},0) 70%)`);
      run(e, [{ opacity: 1, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1.05)", offset: 0.35 }, { opacity: 0, transform: "scale(1.25)" }], ms);
    },
    /** whole-stage white flash (big crits, boss hits) */
    flashAll(o = {}) {
      const e = el("div", `left:0;top:0;right:0;bottom:0;z-index:50;background:#fff;mix-blend-mode:screen;opacity:0`);
      run(e, [{ opacity: 0 }, { opacity: o.alpha ?? 0.35, offset: 0.2 }, { opacity: 0 }], o.ms ?? 160);
    },
  };
  return api;
}
