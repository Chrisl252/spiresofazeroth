// Zone battle backdrops: loading-screen art cropped to its real picture band (the vista, dimmed and desaturated so the characters
// read in front of it), a perspective floor plane under the actors built from the client's own ground tiles and tinted per biome,
// a horizon haze that melts the vista into the floor, multi-speed parallax, fog canvas and vignette.
import { createFog } from "./fog.js?v=20261029a";
import { getZoneVisuals } from "./zonePalette.js?v=20261029a";

const ART = "/assets/loading-screens/";
export const GROUND_Y = 760; // stage px: where the actors stand (landscape)
// floor plane per biome: a Blizzard ground tile (housing grass / framegeneral rock), a CSS filter that turns it into that ground, and the
// tint the haze and the far edge take. Everything else (perspective, horizon fade, bottom darkening) is css/stage.css .sp-bd-floor.
const GRASS = "/assets/ui/housing/ground-grass.jpg", ROCK = "/assets/ui/blizzard/background-rock.png";
const FLOORS = {
  forest: { tex: GRASS, size: 220, filter: "brightness(.62) saturate(.78)", tint: "#2a3f1c" },
  jungle: { tex: GRASS, size: 200, filter: "brightness(.5) saturate(.9) hue-rotate(8deg)", tint: "#1c3318" },
  plains: { tex: GRASS, size: 240, filter: "brightness(.7) saturate(.55) sepia(.35)", tint: "#4a4428" },
  coastal: { tex: GRASS, size: 230, filter: "brightness(.6) saturate(.6) hue-rotate(-10deg)", tint: "#33443a" },
  swamp: { tex: GRASS, size: 210, filter: "brightness(.38) saturate(.6) hue-rotate(14deg)", tint: "#1b2616" },
  snow: { tex: ROCK, size: 420, filter: "grayscale(1) brightness(2.4) contrast(1.2)", tint: "#a7b9cf" },
  desert: { tex: ROCK, size: 460, filter: "sepia(1) saturate(1.6) brightness(2.2) contrast(.9)", tint: "#8a6a3a" },
  rock: { tex: ROCK, size: 420, filter: "brightness(1.5) contrast(1.05)", tint: "#3c3835" },
  chitin: { tex: ROCK, size: 420, filter: "sepia(.8) brightness(1.5)", tint: "#4a3b28" },
  volcanic: { tex: ROCK, size: 400, filter: "brightness(1.15) sepia(.6) hue-rotate(-30deg) saturate(2.2)", tint: "#3a1810" },
  cursed: { tex: ROCK, size: 400, filter: "brightness(1.1) hue-rotate(240deg) saturate(1.6)", tint: "#221a2e" },
};

export function createBackdrop(layers, { reduced = () => false, map: mapUrl = "data/backdrops.json", build = "", onParallax = null } = {}) {
  const sky = document.createElement("div"); sky.className = "sp-bd-sky";
  layers.backdrop.append(sky);
  const slots = [0, 1].map(() => {
    const wrap = document.createElement("div"), img = document.createElement("img");
    wrap.className = "sp-bd-slot"; img.alt = ""; img.decoding = "async"; img.draggable = false;
    wrap.append(img); layers.backdrop.append(wrap);
    return { wrap, img, entry: null };
  });
  const ground = document.createElement("div"); ground.className = "sp-bd-floor"; // perspective floor plane (css/stage.css)
  const groundTile = document.createElement("div"); groundTile.className = "sp-bd-floor__tile";
  ground.append(groundTile);
  layers.backdrop.append(ground);
  const fog = createFog(layers.fog.querySelector("canvas") || layers.fog);
  let table = null, tablePromise = null, cur = 0, size = { w: 1920, h: 1080 }, groundY = GROUND_Y;
  let px = 0, py = 0, tx = 0, ty = 0, paused = false, raf = 0, last = 0, clock = 0, acc = 0, zone = null;
  const parallaxSubs = new Set();
  if (onParallax) parallaxSubs.add(onParallax);

  function loadTable() {
    if (!tablePromise) tablePromise = fetch(build ? `${mapUrl}?v=${build}` : mapUrl).then((r) => r.json()).then((j) => (table = j.zones || {})).catch(() => (table = {}));
    return tablePromise;
  }
  function place(s) {
    const e = s.entry, im = s.img;
    if (!e || !im.naturalWidth) return;
    const [c0, c1] = e.crop || [0, 1], nw = im.naturalWidth, nh = im.naturalHeight, band = (c1 - c0) * nh;
    const k = Math.max(size.w / nw, size.h / band);
    im.style.width = `${nw * k}px`; im.style.height = `${nh * k}px`;
    // the slot is inset -4% (parallax margin), so the picture is offset into the slot to land centred on the stage
    const mx = size.w * 0.04, my = size.h * 0.04;
    im.style.left = `${(size.w - nw * k) / 2 + mx}px`; im.style.top = `${-c0 * nh * k + (size.h - band * k) / 2 + my}px`;
  }
  function layout(w, h, gy) {
    size = { w, h }; if (gy) groundY = gy;
    slots.forEach(place);
    fog.resize(w, h);
    placeFloor();
    if (reduced()) fog.draw(0, 0);
  }

  // the floor starts a little above the feet line (the horizon of the plane sits behind the actors' legs) and runs to the stage bottom
  function placeFloor() { ground.style.top = `${groundY - 150}px`; }
  function setFloor(vis) {
    const f = FLOORS[vis.biome] || FLOORS.forest;
    groundTile.style.backgroundImage = `url("${f.tex}")`;
    groundTile.style.backgroundSize = `${f.size}px ${f.size}px`;
    groundTile.style.filter = f.filter;
    ground.style.setProperty("--floor-tint", f.tint);
  }

  async function setBackdrop(zoneId, opts = {}) {
    await loadTable();
    const e = table[zoneId] || table.default;
    zone = zoneId;
    const vis = getZoneVisuals(zoneId, opts);
    setFloor(vis);
    const theme = { ...(e && e.theme), ...(opts.tint ? (typeof opts.tint === "string" ? { primary: opts.tint } : opts.tint) : {}) };
    fog.setTint({ primary: vis.sky.fog || theme.primary, secondary: vis.sky.smog || theme.secondary });
    layers.backdrop.style.setProperty("--bd-tint", theme.secondary || "#10131a");
    layers.backdrop.style.setProperty("--sky-top", vis.sky.top || "#0b0d12");
    layers.backdrop.style.setProperty("--sky-mid", vis.sky.mid || "#203040");
    layers.backdrop.style.setProperty("--sky-haze", vis.sky.haze || "#507088");
    layers.backdrop.style.setProperty("--sky-sun", vis.sky.sun || "#ffe0a0");
    layers.backdrop.style.setProperty("--sky-ground", vis.sky.ground || "#101520");
    layers.backdrop.style.setProperty("--bd-haze", vis.sky.fog || theme.primary || "#507088"); // horizon haze between vista and floor
    layers.root.style.setProperty("--zone-primary", theme.primary || "#3f6b2a");
    layers.root.style.setProperty("--zone-accent", theme.accent || "#d9b25c");
    if (!e) return;
    const next = slots[1 - cur], prev = slots[cur];
    const key = (x) => x.src || x.fdid;
    if (prev.entry && key(prev.entry) === key(e)) return;
    next.entry = e;
    await new Promise((res) => {
      const done = () => { next.img.onload = next.img.onerror = null; res(); };
      next.img.onload = () => { place(next); done(); };
      next.img.onerror = () => { next.entry = null; done(); };
      next.img.src = e.src ? e.src : `${ART}${e.fdid}.jpg`;
    });
    if (!next.entry) return;
    next.wrap.classList.add("on"); prev.wrap.classList.remove("on");
    cur = 1 - cur;
    // windows taller or wider than 16:9 get letterbox bars around the stage: the host behind it shows the same art, blurred (css/stage.css ::before)
    const host = layers.root.parentElement;
    if (host && host.style) host.style.setProperty("--sp-letterbox", `url("${next.img.src}")`);
  }

  function onPointer(ev) {
    const r = layers.root.getBoundingClientRect();
    tx = -((ev.clientX - r.left) / Math.max(1, r.width) - 0.5) * 24;
    ty = -((ev.clientY - r.top) / Math.max(1, r.height) - 0.5) * 24;
  }
  function onTilt(ev) { // phones: a little gyro parallax
    if (ev.gamma == null) return;
    tx = Math.max(-12, Math.min(12, -ev.gamma * 0.4)); ty = Math.max(-12, Math.min(12, -(ev.beta - 50) * 0.3));
  }
  function frame(now) {
    raf = 0;
    if (paused || reduced()) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now; clock += dt; acc += dt;
    px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3);
    const skyPx = (px * 0.22).toFixed(2);
    const skyPy = (py * 0.22).toFixed(2);
    const midPx = (px * 0.70).toFixed(2);
    const midPy = (py * 0.70).toFixed(2);
    layers.backdrop.style.setProperty("--px", `${px.toFixed(2)}px`);
    layers.backdrop.style.setProperty("--py", `${py.toFixed(2)}px`);
    layers.backdrop.style.setProperty("--px-sky", `${skyPx}px`);
    layers.backdrop.style.setProperty("--py-sky", `${skyPy}px`);
    layers.backdrop.style.setProperty("--px-mid", `${midPx}px`);
    layers.backdrop.style.setProperty("--py-mid", `${midPy}px`);
    parallaxSubs.forEach((fn) => fn(px, py));
    if (acc >= 1 / 30) { fog.draw(clock, acc); acc = 0; }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !paused && !reduced()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("deviceorientation", onTilt, { passive: true });
  start();

  return {
    setBackdrop, layout, setGround(y) { groundY = y; placeFloor(); },
    onParallax(fn) { parallaxSubs.add(fn); return () => parallaxSubs.delete(fn); },
    pause() { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; },
    resume() { paused = false; start(); },
    refreshMotion() { if (reduced()) { layers.backdrop.style.setProperty("--px", "0px"); layers.backdrop.style.setProperty("--py", "0px"); fog.draw(0, 0); } else start(); },
    get zone() { return zone; },
  };
}
