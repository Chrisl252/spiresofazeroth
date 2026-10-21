// Flipbook sheets: loads assets/fx/index.json, decodes sheets, caches tinted variants, plays on the fx canvas.
// Sheets are luminance+alpha (white/grey): tint = multiply by colour, then a little of the original added back so cores stay hot.

export function parseColor(c) {
  if (Array.isArray(c)) return c;
  const m = /^#?([0-9a-f]{6})$/i.exec(c || "");
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => { const A = parseColor(a), B = parseColor(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

/** Tint a luminance+alpha image. hot = fraction of the untinted image added back (additive) for a whiter core. */
export function tintImage(img, color, hot = 0.35) {
  const w = img.width, h = img.height, c = makeCanvas(w, h), g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "multiply"; g.fillStyle = typeof color === "string" ? color : hex(color); g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in"; g.drawImage(img, 0, 0);
  if (hot > 0) { g.globalCompositeOperation = "lighter"; g.globalAlpha = hot; g.drawImage(img, 0, 0); }
  return c;
}

async function decode(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("fx: " + url + " " + r.status);
  return createImageBitmap(await r.blob(), { premultiplyAlpha: "premultiply" });
}

/** Load index + all bitmaps. root = game root URL (default two levels above this file). */
export async function loadSheets({ root, v = "" } = {}) {
  root = root || new URL("../../", import.meta.url).href;
  const q = v ? "?v=" + v : "";
  const idx = await (await fetch(root + "assets/fx/index.json" + q)).json();
  const bitmaps = {};
  const names = Object.keys(idx.sheets);
  await Promise.all([
    ...names.map(async (n) => { bitmaps[n] = await decode(root + idx.sheets[n].file + q); }),
    (async () => { bitmaps.__particles = await decode(root + idx.particles.file + q); })(),
  ]);
  let cardLooks = {}; try { const r = await fetch(root + "data/fx/cards.json" + q); if (r.ok) cardLooks = await r.json(); } catch (e) { /* optional */ }
  const cache = new Map();
  return {
    cardLooks, index: idx, meta: idx.sheets, atlas: bitmaps.__particles, cells: idx.particles.cells,
    has: (n) => !!bitmaps[n] && n !== "__particles",
    bitmap: (n) => bitmaps[n],
    tinted(n, color, hot = 0.35) {
      if (!color) return bitmaps[n];
      const k = n + "|" + color + "|" + hot;
      let t = cache.get(k); if (!t) { t = tintImage(bitmaps[n], color, hot); cache.set(k, t); }
      return t;
    },
  };
}

const ease = (t) => t * t * (3 - 2 * t);

/** Flipbook player. Instances are updated with the fx clock and drawn in spawn order. */
export function createSheetPlayer(sheets, { holdScale = 2.3 } = {}) {
  const live = [];
  function timing(name, hold) {
    const m = sheets.meta[name], f = 1 / m.fps, starts = [], hs = hold ? (hold === true ? holdScale : hold) : 1;
    let t = 0;
    for (let i = 0; i < m.frames; i++) { starts.push(t); t += f * (m.hold_peak && i >= m.hold_peak[0] && i <= m.hold_peak[1] ? hs : 1); }
    return { starts, dur: t, f, hs };
  }
  /** opts: x,y,scale,rotation,tint,hot,blend('add'|'alpha'),holdPeak,alpha,delay,flipX,flipY,rate */
  function play(name, o = {}) {
    if (!sheets.has(name)) return Promise.resolve();
    const m = sheets.meta[name], tm = timing(name, o.holdPeak === undefined ? true : o.holdPeak);
    return new Promise((resolve) => {
      live.push({ name, m, tm, x: o.x || 0, y: o.y || 0, scale: o.scale || 1, rot: o.rotation || 0, tint: o.tint || null, hot: o.hot ?? 0.35,
        blend: o.blend || m.blend, alpha: o.alpha ?? 1, delay: o.delay || 0, t: 0, flipX: o.flipX ? -1 : 1, flipY: o.flipY ? -1 : 1,
        rate: o.rate || 1, dur: tm.dur / (o.rate || 1), resolve });
    });
  }
  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      let d = dt;
      if (s.delay > 0) { s.delay -= dt; if (s.delay > 0) continue; d = -s.delay; s.delay = 0; }
      s.t += d;
      if (s.t >= s.dur) { live.splice(i, 1); s.resolve(); }
    }
  }
  function draw(ctx, k = 1) {
    for (const s of live) {
      if (s.delay > 0) continue;
      const tm = s.tm, lt = s.t * s.rate, st = tm.starts, n = st.length;
      let i = n - 1; while (i > 0 && st[i] > lt) i--;
      const next = i + 1 < n ? i + 1 : -1, end = next < 0 ? tm.dur : st[next];
      const frac = next < 0 ? 0 : ease(Math.min(1, Math.max(0, (lt - st[i]) / Math.max(1e-6, end - st[i]))));
      const [fw, fh] = s.m.frame, cols = s.m.columns, img = sheets.tinted(s.name, s.tint, s.hot);
      const dw = fw * s.scale, dh = fh * s.scale, ox = -s.m.pivot[0] * dw, oy = -s.m.pivot[1] * dh;
      const cr = Math.cos(s.rot) * k, sr = Math.sin(s.rot) * k;
      ctx.setTransform(cr * s.flipX, sr * s.flipX, -sr * s.flipY, cr * s.flipY, s.x * k, s.y * k);
      ctx.globalCompositeOperation = s.blend === "add" ? "lighter" : "source-over";
      const tail = s.t > s.dur * 0.82 ? 1 - (s.t - s.dur * 0.82) / (s.dur * 0.18) : 1; // soft final fade
      const draw1 = (fi, a) => { if (a <= 0.01) return; ctx.globalAlpha = a * s.alpha * tail; ctx.drawImage(img, (fi % cols) * fw, Math.floor(fi / cols) * fh, fw, fh, ox, oy, dw, dh); };
      draw1(i, 1 - frac); if (next >= 0) draw1(next, frac);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  return { play, update, draw, get count() { return live.length; }, clear() { for (const s of live.splice(0)) s.resolve(); } };
}
