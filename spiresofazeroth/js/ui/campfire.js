// Campfire canvas for the rest screen: logs and stones, flame_tongue flipbooks (tinted, additive), a heat glow and rising embers.
// mountCampfire(canvas, { reduced: () => bool, paused: () => bool }) -> stop(). Stops itself when the canvas leaves the DOM.
const SHEET = new URL("../../assets/fx/flame_tongue.webp", import.meta.url).href;
const FR = 192, COLS = 4, FRAMES = 16, FPS = 30;
let tinted = null;

function loadSheet() {
  if (tinted) return tinted;
  tinted = new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = "multiply";
      const g = x.createLinearGradient(0, 0, 0, FR); g.addColorStop(0, "#ff5a14"); g.addColorStop(0.45, "#ffa532"); g.addColorStop(1, "#ffe9a0");
      for (let r = 0; r < FRAMES / COLS; r++) { x.fillStyle = g; x.save(); x.translate(0, r * FR); x.fillRect(0, 0, c.width, FR); x.restore(); }
      x.globalCompositeOperation = "destination-in"; x.drawImage(img, 0, 0);
      res(c);
    };
    img.onerror = () => res(null);
    img.src = SHEET;
  });
  return tinted;
}

function log(x, cx, cy, ang, len, r) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const g = x.createLinearGradient(0, -r, 0, r); g.addColorStop(0, "#5b3a1e"); g.addColorStop(0.5, "#3a2412"); g.addColorStop(1, "#1d1209");
  x.fillStyle = g; x.beginPath(); x.roundRect(-len / 2, -r, len, r * 2, r * 0.8); x.fill();
  x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 2;
  for (let i = -len / 2 + 18; i < len / 2 - 10; i += 26) { x.beginPath(); x.moveTo(i, -r * 0.7); x.lineTo(i + 8, r * 0.7); x.stroke(); }
  x.fillStyle = "#c98a4a"; x.beginPath(); x.ellipse(len / 2 - r * 0.6, 0, r * 0.55, r * 0.9, 0, 0, 7); x.fill();
  x.strokeStyle = "rgba(60,30,10,.7)"; x.beginPath(); x.ellipse(len / 2 - r * 0.6, 0, r * 0.3, r * 0.5, 0, 0, 7); x.stroke();
  x.restore();
}

export function mountCampfire(canvas, { reduced = () => false, paused = () => false } = {}) {
  const W = canvas.width, H = canvas.height, x = canvas.getContext("2d");
  const cx = W / 2, base = H - 96;
  const flames = [[0, 1.0, 0], [-62, 0.78, 5], [64, 0.82, 9], [-30, 0.92, 12], [34, 0.95, 3]].map(([dx, s, ph]) => ({ dx, s: s * 2.35, ph }));
  const embers = Array.from({ length: 46 }, () => spawn(true));
  function spawn(init) { return { x: cx + (Math.random() - 0.5) * 120, y: base - 30 - (init ? Math.random() * 330 : 0), vx: (Math.random() - 0.5) * 16, vy: -(30 + Math.random() * 60), r: 1.4 + Math.random() * 3, life: Math.random(), sway: Math.random() * 6.28 }; }
  let sheet = null, raf = 0, stopped = false, last = 0, t = 0;

  function frame(dt) {
    t += dt;
    x.clearRect(0, 0, W, H);
    // stones
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + (i / 10) * Math.PI * 1.0 - 0.0, rx = 170, ry = 46;
      const sx = cx + Math.cos(a) * rx, sy = base + 38 - Math.sin(a) * ry * -1;
      const g = x.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 30); g.addColorStop(0, "#8a8478"); g.addColorStop(1, "#2c2924");
      x.fillStyle = g; x.beginPath(); x.ellipse(sx, sy, 30 + (i % 3) * 4, 20, 0, 0, 7); x.fill();
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI, sx = cx + Math.cos(a) * 176, sy = base + 38 + Math.sin(a) * 42;
      const g = x.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 30); g.addColorStop(0, "#9a9486"); g.addColorStop(1, "#2a2722");
      x.fillStyle = g; x.beginPath(); x.ellipse(sx, sy, 32 + (i % 3) * 4, 21, 0, 0, 7); x.fill();
    }
    log(x, cx - 8, base + 24, -0.22, 250, 24); log(x, cx + 8, base + 24, 0.22, 250, 24); log(x, cx, base + 34, 0.02, 230, 20);
    // heat glow + flames (additive)
    x.globalCompositeOperation = "lighter";
    const fl = 0.82 + 0.18 * Math.sin(t * 9) * Math.sin(t * 5.3);
    const gl = x.createRadialGradient(cx, base - 40, 10, cx, base - 40, 300); gl.addColorStop(0, `rgba(255,170,60,${0.55 * fl})`); gl.addColorStop(0.4, `rgba(255,110,20,${0.22 * fl})`); gl.addColorStop(1, "rgba(255,80,0,0)");
    x.fillStyle = gl; x.fillRect(0, 0, W, H);
    if (sheet) for (const f of flames) {
      const n = Math.floor(t * FPS * (0.85 + f.ph * 0.02) + f.ph * 3) % FRAMES, sx = (n % COLS) * FR, sy = Math.floor(n / COLS) * FR, d = FR * f.s;
      x.globalAlpha = 0.92; x.drawImage(sheet, sx, sy, FR, FR, cx + f.dx - d / 2, base + 20 - d * 0.9, d, d);
    }
    x.globalAlpha = 1;
    for (const e of embers) {
      const k = Math.max(0, 1 - e.life);
      x.fillStyle = `rgba(255,${150 + 70 * k | 0},60,${0.85 * k})`; x.beginPath(); x.arc(e.x, e.y, e.r * (0.5 + k), 0, 7); x.fill();
    }
    x.globalCompositeOperation = "source-over";
  }
  function step(dt) {
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.life += dt * 0.28; e.sway += dt * 3; e.x += (e.vx + Math.sin(e.sway) * 14) * dt; e.y += e.vy * dt;
      if (e.life >= 1 || e.y < 20) embers[i] = spawn(false);
    }
  }
  function loop(ts) {
    if (stopped) return;
    if (!canvas.isConnected) { stopped = true; return; }
    raf = requestAnimationFrame(loop);
    if (paused() || document.hidden) { last = ts; return; }
    if (ts - last < 33) return;
    const dt = Math.min(0.1, (ts - last) / 1000 || 0.033); last = ts;
    step(dt); frame(dt);
  }
  loadSheet().then((s) => {
    sheet = s;
    if (stopped) return;
    if (reduced()) { t = 0.2; frame(0); return; }
    raf = requestAnimationFrame(loop);
  });
  frame(0);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
