// Real WoW spell art: loads data/fx/real.json (card -> model ids per role), assets/fx/spells/models.json (parsed M2
// emitters/ribbons/mesh sprites, built by tools/spires/build-spellfx.py) and the converted particle textures.
// Everything is lazy + cached; a missing file just means "no real art" and the caller falls back to the recipe look.

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

export function createRealArt({ root, v = "" } = {}) {
  root = root || new URL("../../", import.meta.url).href;
  const q = v ? "?v=" + v : "";
  const base = root + "assets/fx/spells/";
  let real = {}, models = {}, ok = false, opaque = new Set();
  const bitmaps = new Map(), pending = new Map(), tints = new Map();

  const ready = (async () => {
    try {
      const [r, m] = await Promise.all([
        fetch(root + "data/fx/real.json" + q).then((x) => (x.ok ? x.json() : {})),
        fetch(base + "models.json" + q).then((x) => (x.ok ? x.json() : {})),
      ]);
      real = r; models = m; opaque = new Set(m._o || []); delete m._o; ok = true;
    } catch (e) { console.warn("[spellfx] real art unavailable:", e && e.message); }
    return api;
  })();

  function tex(id) {
    if (bitmaps.has(id)) return bitmaps.get(id);
    if (!pending.has(id)) {
      pending.set(id, fetch(base + "tex/" + id + ".webp" + q).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then((b) => createImageBitmap(b, { premultiplyAlpha: "premultiply" }))
        .then((bm) => { bitmaps.set(id, bm); return bm; })
        .catch(() => { bitmaps.set(id, null); return null; }));
    }
    return null;
  }

  /** every model id a card entry needs (all roles) */
  const modelIds = (entry) => { const s = new Set(); for (const l of Object.values(entry.roles)) for (const x of l) s.add(x.m); return [...s]; };
  function textureIds(entry) {
    const s = new Set();
    for (const id of modelIds(entry)) {
      const m = models[id]; if (!m) continue;
      for (const e of m.e || []) s.add(e.t);
      for (const r of m.r || []) s.add(r.t);
      for (const x of m.m || []) s.add(x.t);
    }
    return [...s];
  }
  /** resolves when the card's textures are decoded, or after `ms` (play with whatever is ready then) */
  function ensure(entry, ms = 450) {
    const ids = textureIds(entry); ids.forEach(tex);
    const all = Promise.all(ids.map((id) => pending.get(id)));
    return Promise.race([all, new Promise((r) => setTimeout(r, ms))]);
  }

  /** colour-multiplied copy of a texture, quantised to 8 levels per channel so the cache stays small */
  function tinted(id, r, g, b) {
    const bm = bitmaps.get(id); if (!bm) return null;
    const qr = Math.min(7, r >> 5), qg = Math.min(7, g >> 5), qb = Math.min(7, b >> 5);
    if (qr + qg + qb === 21) return bm;
    const key = id + "|" + (qr * 64 + qg * 8 + qb);
    let t = tints.get(key);
    if (!t) {
      if (tints.size > 600) tints.clear();
      const w = bm.width, h = bm.height, c = makeCanvas(w, h), g2 = c.getContext("2d");
      g2.drawImage(bm, 0, 0);
      g2.globalCompositeOperation = "multiply";
      g2.fillStyle = `rgb(${Math.min(255, (qr + 1) * 32 - 1)},${Math.min(255, (qg + 1) * 32 - 1)},${Math.min(255, (qb + 1) * 32 - 1)})`;
      g2.fillRect(0, 0, w, h);
      g2.globalCompositeOperation = "destination-in"; g2.drawImage(bm, 0, 0);
      tints.set(key, t = c);
    }
    return t;
  }

  const api = {
    ready, tex, tinted, ensure,
    get ok() { return ok; },
    entryFor: (cardId) => (ok && cardId && !globalThis.__spellfxOff ? real[cardId] || null : null),   // __spellfxOff = debug switch for before/after captures
    model: (id) => models[id] || null,
    opaque: (id) => opaque.has(id),   // no alpha channel: black is transparent, draw additive
    stats: () => ({ cards: Object.keys(real).length, models: Object.keys(models).length, bitmaps: bitmaps.size, tints: tints.size }),
    dispose() { bitmaps.forEach((b) => b && b.close && b.close()); bitmaps.clear(); pending.clear(); tints.clear(); },
  };
  return api;
}
