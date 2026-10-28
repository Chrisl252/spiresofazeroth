// Fog + dust layer: one low-res canvas, additive blending, slow drift, tinted per zone. Draw-only; the caller owns the clock.
const hexRgb = (hex, fb = [140, 150, 170]) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return fb;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function sprite(rgb, size, alpha) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
  r.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 0.4})`);
  r.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return c;
}

export function createFog(canvas) {
  const g = canvas.getContext("2d");
  const rnd = (a, b) => a + Math.random() * (b - a);
  let fogSprite = null, moteSprite = null, W = 480, H = 270;
  const blobs = Array.from({ length: 10 }, () => ({ x: rnd(0, 1), y: rnd(0.35, 1), s: rnd(0.35, 0.8), v: rnd(0.004, 0.014) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(0, 6.28), a: rnd(0.35, 0.8) }));
  const motes = Array.from({ length: 46 }, () => ({ x: rnd(0, 1), y: rnd(0, 1), s: rnd(0.6, 1.8), vx: rnd(-0.006, 0.012), vy: rnd(-0.012, -0.002), ph: rnd(0, 6.28), a: rnd(0.25, 0.8) }));

  function setTint(theme) {
    const p = hexRgb(theme && theme.primary), a = hexRgb(theme && theme.accent, [220, 200, 150]);
    fogSprite = sprite(mix(p, [200, 200, 210], 0.45), 192, 0.16);
    moteSprite = sprite(mix(a, [255, 255, 255], 0.35), 16, 0.9);
  }
  function resize(w, h) {
    const nw = Math.max(120, Math.round(w / 4)), nh = Math.max(120, Math.round(h / 4));
    if (nw === W && nh === H && canvas.width === nw && canvas.height === nh) return; // assigning canvas.width (even to the same value) wipes it: a blank frame on every layout pass = flicker on phones
    W = canvas.width = nw;
    H = canvas.height = nh;
  }
  function draw(t, dt) {
    g.clearRect(0, 0, W, H);
    if (!fogSprite) return;
    g.globalCompositeOperation = "lighter";
    for (const b of blobs) {
      b.x += b.v * dt;
      if (b.x < -0.4) b.x = 1.4; else if (b.x > 1.4) b.x = -0.4;
      const sz = b.s * Math.max(W, H) * 0.9;
      g.globalAlpha = b.a;
      g.drawImage(fogSprite, b.x * W - sz / 2, b.y * H + Math.sin(t * 0.3 + b.ph) * H * 0.03 - sz / 4, sz, sz * 0.5);
    }
    for (const m of motes) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      if (m.x > 1.05) m.x = -0.05; else if (m.x < -0.05) m.x = 1.05;
      g.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 0.9 + m.ph));
      const sz = m.s * 5;
      g.drawImage(moteSprite, m.x * W - sz / 2, m.y * H - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
  setTint(null);
  return { setTint, resize, draw };
}
