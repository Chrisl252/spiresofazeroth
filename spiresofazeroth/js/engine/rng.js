// Seeded PRNG (mulberry32) + helpers. Pure: no DOM, no Math.random.
export function hashSeed(str) {
  // FNV-1a 32-bit over a string; numbers are stringified first.
  const s = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === "number" ? seed : hashSeed(seed)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int(lo, hi) { // inclusive both ends
      if (hi === undefined) { hi = lo; lo = 0; }
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(arr) { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
    shuffle(arr) { // in place Fisher-Yates, returns arr
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    chance(p) { return next() < p; },
    weighted(items, weightOf) { // items array, weightOf(item)->number
      let total = 0;
      for (const it of items) total += Math.max(0, weightOf(it));
      if (total <= 0) return items.length ? items[0] : undefined;
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weightOf(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    get state() { return a; },
    set state(v) { a = v >>> 0; },
  };
  return rng;
}

// Derive an independent stream from a run seed and a tag (node, shop, reward...).
export function streamFor(seed, tag) {
  return makeRng(hashSeed(`${seed}|${tag}`));
}

export function newSeedString(nextFloat = Math.random) {
  // Human-friendly 8 char seed, e.g. "K7QX2MPA". Used only when a run starts without one.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(nextFloat() * alphabet.length)];
  return s;
}
