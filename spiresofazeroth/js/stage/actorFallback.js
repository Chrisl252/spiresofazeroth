// actorFallback.js - the "shadow silhouette" actor for enemies with no baked 3D model, plus the shared
// ground marks (contact shadow + targetable ring) both renderers use. Same API as a 3D actor:
//   { uid, kind:'plate', lunge(target,opts), hit({amount}), block(), death(), statusPulse(color),
//     highlight(on), hover(on), anchor(), setBase(x,y,h), setTheme(t), dispose() }
// A plate is a zone-tinted silhouette (quadruped / biped / flyer / blob by family+type) with eyes, a
// fabric-grain texture, a rim glow and the enemy icon in a gold round frame, so it reads as a creature
// card standing in the lane rather than a placeholder box.
import { createMotion, choreography, dustPuff } from "./actorMotion.js?v=20261029a";

const SHAPES = {
  biped: "M100 10 C118 10 130 24 130 42 C130 54 124 62 118 66 C146 70 170 86 176 116 L190 158 L174 164 L160 134 L156 196 L132 188 L124 196 L112 186 L100 196 L88 186 L76 196 L68 188 L44 196 L40 134 L26 164 L10 158 L24 116 C30 86 54 70 82 66 C76 62 70 54 70 42 C70 24 82 10 100 10 Z",
  quadruped: "M10 122 C4 108 4 92 12 78 C16 92 24 98 34 98 C52 76 90 68 118 72 C132 74 144 70 152 60 L156 36 L168 52 L184 54 L198 74 L186 84 C182 92 176 98 168 100 L170 126 L176 196 L160 196 L152 140 L138 132 L132 196 L116 196 L112 138 L92 140 L86 196 L70 196 L64 142 L48 140 L40 196 L24 196 L28 150 C16 144 10 134 10 122 Z",
  flyer: "M100 30 C106 30 110 36 111 44 L122 38 L120 54 C130 62 146 52 170 44 C184 38 196 30 198 26 C196 50 190 78 174 96 C166 104 154 108 144 108 C140 118 132 128 124 132 L112 176 L100 190 L88 176 L76 132 C68 128 60 118 56 108 C46 108 34 104 26 96 C10 78 4 50 2 26 C4 30 16 38 30 44 C54 52 70 62 80 54 L78 38 L89 44 C90 36 94 30 100 30 Z",
  blob: "M100 22 C112 38 118 28 128 42 C140 34 150 58 160 72 C178 82 190 108 184 138 C180 170 150 192 108 194 C70 196 30 186 18 150 C10 120 22 96 40 82 C46 62 58 50 72 52 C78 36 90 30 100 22 Z",
};
const EYES = { // [cx, cy] pairs, glow dots, in the 200 box (shape faces right)
  biped: [[92, 40], [108, 40]], quadruped: [[174, 62]], flyer: [[95, 42], [105, 42]], blob: [[78, 96], [122, 96]],
};
const TYPE_SHAPE = {
  quadruped: "wolf worg hound boar bear cat tiger hyena raptor devilsaur ravasaur croc crocolisk scorpid spider silithid crab turtle kodo stegodon gorilla yeti stag zebra tallstrider lizard thunder-lizard diemetradon basilisk worm quilboar hederine",
  flyer: "harpy bat vulture bird owl owlbeast hippogryph wyvern chimera chimaera roc pterrordax whelp drake dragon dragonspawn wyrmkin sprite hydra",
  blob: "ooze slime tar plant treant timberling abyssal earth rock water air fire magma elemental corrupted grell dredge",
};
export function shapeFor(family, type) {
  const t = String(type || "").toLowerCase();
  for (const [shape, list] of Object.entries(TYPE_SHAPE)) if (list.split(" ").includes(t)) return shape;
  if (family === "elemental") return "blob";
  if (family === "dragonkin") return "flyer";
  if (family === "beast") return "quadruped";
  return "biped";
}

const DEFAULT_THEME = { primary: "#3b3a46", secondary: "#15141b", accent: "#d9b25c" };
let styled = false;
function ensureStyle() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = `
.sa-ground,.sa-plates,.sa-fx{position:absolute;inset:0;pointer-events:none}
.sa-shadow{position:absolute;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.62) 0%,rgba(0,0,0,.34) 45%,rgba(0,0,0,0) 72%);transform:translate(-50%,-50%)}
.sa-ring{position:absolute;border-radius:50%;transform:translate(-50%,-50%);opacity:0;border:3px solid rgba(255,214,106,.95);
  box-shadow:0 0 18px rgba(255,200,80,.75),inset 0 0 16px rgba(255,200,80,.45);animation:sa-ring 1.1s ease-in-out infinite alternate}
@keyframes sa-ring{from{filter:brightness(.85)}to{filter:brightness(1.35)}}
.sa-plate{position:absolute;transform-origin:50% 100%;will-change:transform,opacity,filter}
.sa-plate .sa-in{position:absolute;inset:0;transform-origin:50% 100%;animation:sa-breath 3.2s ease-in-out infinite}
@keyframes sa-breath{0%,100%{transform:scale(1,1) rotate(-.3deg)}50%{transform:scale(1.008,1.016) rotate(.3deg)}}
.sa-plate svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.sa-icon{position:absolute;border-radius:50%;overflow:hidden;border:3px solid #d9b25c;background:#0c0b10;
  box-shadow:0 0 0 2px #1a1408,0 6px 16px rgba(0,0,0,.7),inset 0 0 12px rgba(0,0,0,.8)}
.sa-icon img{display:block;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.05)}
.sa-icon:after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 2px 5px rgba(255,255,255,.28),inset 0 -6px 10px rgba(0,0,0,.5)}
@media (prefers-reduced-motion:reduce){.sa-plate .sa-in,.sa-ring{animation:none}}`;
  document.head.appendChild(st);
}

// Ground marks: soft contact shadow + gold targetable ring at the feet.
export function createGround(layer) {
  ensureStyle();
  const shadow = document.createElement("div"); shadow.className = "sa-shadow";
  const ring = document.createElement("div"); ring.className = "sa-ring";
  layer.appendChild(shadow); layer.appendChild(ring);
  let w = 200;
  return {
    setSize(width) { w = width; },
    apply(s, b) {
      const x = b.x + s.x, y = b.y;
      shadow.style.left = x + "px"; shadow.style.top = (y + 4) + "px";
      shadow.style.width = (w * 1.15) + "px"; shadow.style.height = (w * 0.26) + "px";
      shadow.style.opacity = String(Math.max(0, s.alpha));
      const rw = w * 1.3;
      ring.style.left = x + "px"; ring.style.top = (y + 2) + "px";
      ring.style.width = rw + "px"; ring.style.height = (rw * 0.28) + "px";
      ring.style.opacity = String(s.ring * Math.max(0, s.alpha)); ring.classList.toggle("is-red", !!s.red);
    },
    dispose() { shadow.remove(); ring.remove(); },
  };
}

export function createFallbackActor(layers, spec, wake) {
  ensureStyle();
  const { plates, ground, fx } = layers;
  const motion = createMotion(wake);
  const base = { x: spec.x || 0, y: spec.y || 0, h: spec.h || 280 };
  const facing = spec.facing || -1;
  const shape = spec.shape || shapeFor(spec.family, spec.type);
  let theme = { ...DEFAULT_THEME, ...(spec.theme || {}) };
  const uid = spec.uid;
  const ns = "http://www.w3.org/2000/svg";
  const gid = "sa" + Math.random().toString(36).slice(2, 8);

  const el = document.createElement("div"); el.className = "sa-plate"; el.dataset.uid = uid;
  const inner = document.createElement("div"); inner.className = "sa-in"; el.appendChild(inner);
  const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 200 200"); svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  inner.appendChild(svg);
  const gnd = createGround(ground);

  function paint() {
    const top = mix(theme.primary, "#000000", 0.28), mid = mix(theme.secondary, "#000000", 0.45), seed = (hashStr(spec.id || uid) % 90) + 1;
    svg.innerHTML = `<defs>
      <linearGradient id="${gid}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="#030208"/></linearGradient>
      <linearGradient id="${gid}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.accent}" stop-opacity="0"/><stop offset="1" stop-color="${theme.accent}" stop-opacity=".16"/></linearGradient>
      <filter id="${gid}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${seed}" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.1 -.35" result="a"/><feComposite in="a" in2="SourceAlpha" operator="in" result="g"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="g"/></feMerge></filter>
      <filter id="${gid}r" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="5"/></filter>
      <clipPath id="${gid}c"><path d="${SHAPES[shape]}"/></clipPath>
    </defs>
    <g transform="${facing < 0 ? "translate(200 0) scale(-1 1)" : ""}">
      <path d="${SHAPES[shape]}" fill="${theme.accent}" opacity=".5" filter="url(#${gid}r)"/>
      <path d="${SHAPES[shape]}" fill="url(#${gid}g)" filter="url(#${gid}n)"/>
      <rect x="0" y="110" width="200" height="90" fill="url(#${gid}m)" clip-path="url(#${gid}c)"/>
      <path d="${SHAPES[shape]}" fill="none" stroke="${theme.accent}" stroke-opacity=".7" stroke-width="1.5" stroke-linejoin="round"/>
      ${EYES[shape].map(([cx, cy]) => `<ellipse cx="${cx}" cy="${cy}" rx="7" ry="5" fill="${theme.accent}" opacity=".3"/><ellipse cx="${cx}" cy="${cy}" rx="3.2" ry="2" fill="#fff4d0"/>`).join("")}
    </g>`;
  }
  const tall = base.h;
  const iconD = Math.round(Math.max(58, Math.min(110, tall * 0.26)));
  const icon = document.createElement("div"); icon.className = "sa-icon";
  icon.style.width = icon.style.height = iconD + "px";
  if (spec.icon) {
    const im = document.createElement("img"); im.alt = ""; im.decoding = "async";
    im.src = (spec.iconBase || "/assets/icons/") + spec.icon + ".jpg";
    im.onerror = () => { icon.style.display = "none"; };
    icon.appendChild(im);
  } else icon.style.display = "none";
  inner.appendChild(icon);
  el.setAttribute("aria-hidden", "true");
  plates.appendChild(el);
  paint();

  function place() {
    const aspect = shape === "quadruped" ? 1.2 : shape === "flyer" ? 1.25 : shape === "blob" ? 0.95 : 0.78;
    const w = base.h * aspect;
    el.style.width = w + "px"; el.style.height = base.h + "px";
    el.style.left = (base.x - w / 2) + "px"; el.style.top = (base.y - base.h) + "px";
    // icon sits on the chest (quadruped: over the shoulder), inside the plate box
    const cxp = shape === "quadruped" ? 0.46 : 0.5, cyp = shape === "quadruped" ? 0.62 : shape === "flyer" ? 0.58 : 0.5;
    icon.style.left = (w * cxp - iconD / 2) + "px"; icon.style.top = (base.h * cyp - iconD / 2) + "px";
    gnd.setSize(w * 0.75);
  }
  place();

  function apply() {
    const s = motion.s;
    el.style.transform = `translate(${s.x}px,${s.y}px) rotate(${s.rot}deg) scale(${s.sx * (1 + s.hover * 0.03)},${s.sy * (1 + s.hover * 0.03)})`;
    el.style.opacity = String(Math.max(0, s.alpha));
    const f = [];
    const br = 1 + s.flash * 2.4 + s.hover * 0.14;
    if (br !== 1) f.push(`brightness(${br.toFixed(3)})`);
    if (s.glow > 0.01) f.push(`drop-shadow(0 0 ${(s.glow * 30).toFixed(1)}px ${s.glowColor})`);
    el.style.filter = f.join(" ");
    gnd.apply(s, base);
  }
  apply();

  const core = { motion, uid, facing, base: () => base };
  const co = choreography(core);
  const actor = {
    uid, kind: "plate", motion, shape,
    el,
    ...co,
    async death(o) { dustPuff(fx, base.x, base.y, base.h * 0.6); await co.death(o); },
    anchor() {
      const s = motion.s;
      const x = base.x + s.x, fy = base.y + s.y, cy = fy - base.h * 0.58 * s.sy;
      return { x, y: cy, chest: { x, y: cy }, feet: { x, y: fy }, top: { x, y: fy - base.h * s.sy }, height: base.h, width: base.h * 0.7 };
    },
    baseH: () => base.h, baseXY: () => base,
    setBase(x, y, h) { base.x = x; base.y = y; if (h) base.h = h; place(); apply(); },
    setTheme(t) { theme = { ...DEFAULT_THEME, ...t }; paint(); },
    setGroundW(w) { gnd.setSize(w); apply(); },
    setVisible(v) { el.style.visibility = v ? "visible" : "hidden"; },
    tick() { apply(); },
    dispose() { el.remove(); gnd.dispose(); },
  };
  return actor;
}

function mix(hex, to, t) {
  const p = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, (c) => c + c); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
  const a = p(hex), b = p(to);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
