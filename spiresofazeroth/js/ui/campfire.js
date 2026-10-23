// Authentic World of Warcraft campfire for the rest / hub screens.
// Uses the classic WoW campfire 3D model (elwynncampfire.m2 / campfire.glb: rock circle + firewood logs),
// the Blizzard animated fire flipbook (flipbook_fire_style_a / wow_fire_flipbook.webp),
// WoW ember particles (flamelicksmall / wow_ember.webp), and dynamic warm fire lighting.
// Falls back to a 2D canvas with the pre-rendered WoW campfire base + WoW fire flipbook if WebGL is unavailable.
// mountCampfire(canvas, { reduced: () => bool, paused: () => bool }) -> stop(). Stops itself when the canvas leaves the DOM.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = new URL("../../assets/models/campfire.glb", import.meta.url).href;
const FLAME_SHEET = new URL("../../assets/fx/wow_fire_flipbook.webp", import.meta.url).href;
const EMBER_URL = new URL("../../assets/fx/wow_ember.webp", import.meta.url).href;
const BASE_IMG_URL = new URL("../../assets/ui/campfire_base.webp", import.meta.url).href;

const FPS = 30;
const FLAME_FRAMES = 58; // 58 active frames in the 8x8 Blizzard fire flipbook

function setFlipbookFrame(tex, frameIndex) {
  const f = Math.abs(Math.floor(frameIndex)) % FLAME_FRAMES;
  const col = f % 8;
  const row = Math.floor(f / 8);
  tex.offset.set(col / 8, 1 - (row + 1) / 8);
}

function mount3DCampfire(canvas, { reduced = () => false, paused = () => false } = {}) {
  const W = canvas.width || 900;
  const H = canvas.height || 560;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();

  // Warm ambient + directional lighting so stones and firewood are clearly lit
  scene.add(new THREE.HemisphereLight(0xffecd0, 0x332211, 1.5));
  const key = new THREE.DirectionalLight(0xfffaed, 1.8);
  key.position.set(2, 6, 4);
  scene.add(key);

  // Warm fire point light right above the logs casting light on the stones
  const fireLight = new THREE.PointLight(0xff7a14, 3.4, 10, 1.5);
  fireLight.position.set(0, 0.45, 0);
  scene.add(fireLight);

  const coreLight = new THREE.PointLight(0xffdf88, 2.2, 5, 2.0);
  coreLight.position.set(0, 0.25, 0);
  scene.add(coreLight);

  // Perspective camera looking down at the campfire
  const cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  cam.position.set(0, 2.5, 3.8);
  cam.lookAt(0, 0.35, 0);

  let stopped = false;
  let raf = 0;
  let last = 0;
  let t = 0;

  const texLoader = new THREE.TextureLoader();
  const fireTex = texLoader.load(FLAME_SHEET);
  fireTex.wrapS = fireTex.wrapT = THREE.RepeatWrapping;
  fireTex.repeat.set(1 / 8, 1 / 8);

  const fireTex2 = fireTex.clone();
  fireTex2.wrapS = fireTex2.wrapT = THREE.RepeatWrapping;
  fireTex2.repeat.set(1 / 8, 1 / 8);

  // Crossed billboard planes for fire volume
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, 0.12, 0);

  const flameGeo = new THREE.PlaneGeometry(1.45, 1.7);
  flameGeo.translate(0, 0.85, 0);

  const flameMat1 = new THREE.MeshBasicMaterial({
    map: fireTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const flameMat2 = new THREE.MeshBasicMaterial({
    map: fireTex2,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.82,
  });

  // 3 crossed quads: 0, 60, -60 degrees
  for (const ang of [0, Math.PI / 3, -Math.PI / 3]) {
    const m = new THREE.Mesh(flameGeo, flameMat1);
    m.rotation.y = ang;
    flameGroup.add(m);
  }

  // Inner core quad offset by 45 degrees
  const coreFlameGeo = new THREE.PlaneGeometry(1.15, 1.35);
  coreFlameGeo.translate(0, 0.67, 0);
  const coreFlame = new THREE.Mesh(coreFlameGeo, flameMat2);
  coreFlame.rotation.y = Math.PI / 4;
  flameGroup.add(coreFlame);

  scene.add(flameGroup);

  // Floating WoW ember particles
  const emberTex = texLoader.load(EMBER_URL);
  const emberMat = new THREE.SpriteMaterial({
    map: emberTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const emberCount = 34;
  const embers = [];
  function makeEmber(initial = false) {
    const sp = new THREE.Sprite(emberMat.clone());
    const s = 0.08 + Math.random() * 0.12;
    sp.scale.set(s, s, 1);
    const life = initial ? Math.random() : 0;
    const y = 0.25 + life * 1.8;
    const r = 0.05 + Math.random() * 0.28;
    const theta = Math.random() * Math.PI * 2;
    sp.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    const tint = 0.65 + Math.random() * 0.35;
    sp.material.color.setRGB(1.0, tint, 0.2);
    scene.add(sp);
    return {
      sprite: sp,
      life,
      rate: 0.35 + Math.random() * 0.45,
      vy: 0.9 + Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 0.25,
      vz: (Math.random() - 0.5) * 0.25,
      sway: Math.random() * Math.PI * 2,
    };
  }

  for (let i = 0; i < emberCount; i++) {
    embers.push(makeEmber(true));
  }

  function resetEmber(e) {
    e.life = 0;
    const r = 0.05 + Math.random() * 0.28;
    const theta = Math.random() * Math.PI * 2;
    e.sprite.position.set(Math.cos(theta) * r, 0.25, Math.sin(theta) * r);
    e.vy = 0.9 + Math.random() * 0.9;
    e.vx = (Math.random() - 0.5) * 0.25;
    e.vz = (Math.random() - 0.5) * 0.25;
  }

  // Load 3D model
  let modelLoaded = false;
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      if (stopped) return;
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= box.min.y;
      model.position.z -= center.z;
      model.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.side = THREE.DoubleSide;
        }
      });
      scene.add(model);
      modelLoaded = true;
      renderer.render(scene, cam);
    },
    undefined,
    (err) => console.warn("Spires: campfire.glb load fallback", err)
  );

  function renderFrame(dt) {
    t += dt;

    // Advance fire animation
    const f1 = Math.floor(t * FPS) % FLAME_FRAMES;
    setFlipbookFrame(fireTex, f1);
    const f2 = (Math.floor(t * FPS) + 17) % FLAME_FRAMES;
    setFlipbookFrame(fireTex2, f2);

    // Warm fire light flickering
    const flicker = 0.86 + 0.14 * Math.sin(t * 12.5) * Math.cos(t * 7.1);
    fireLight.intensity = 3.4 * flicker;
    coreLight.intensity = 2.2 * flicker;

    // Embers
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.life += dt * e.rate;
      if (e.life >= 1) {
        resetEmber(e);
      } else {
        e.sprite.position.y += e.vy * dt;
        e.sprite.position.x += (e.vx + Math.sin(t * 2.5 + e.sway) * 0.12) * dt;
        e.sprite.position.z += (e.vz + Math.cos(t * 2.5 + e.sway) * 0.12) * dt;
        const k = Math.max(0, 1 - e.life);
        e.sprite.material.opacity = k * 0.95;
      }
    }

    renderer.render(scene, cam);
  }

  function loop(ts) {
    if (stopped) return;
    if (!canvas.isConnected) {
      cleanup();
      return;
    }
    raf = requestAnimationFrame(loop);
    if (paused() || document.hidden) {
      last = ts;
      return;
    }
    if (ts - last < 33) return;
    const dt = Math.min(0.1, (ts - last) / 1000 || 0.033);
    last = ts;
    renderFrame(dt);
  }

  function cleanup() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    for (const e of embers) {
      if (e.sprite && e.sprite.material) e.sprite.material.dispose();
    }
    flameMat1.dispose();
    flameMat2.dispose();
    flameGeo.dispose();
    coreFlameGeo.dispose();
    fireTex.dispose();
    fireTex2.dispose();
    emberTex.dispose();
    try { renderer.dispose(); renderer.forceContextLoss(); } catch {}
  }

  if (reduced()) {
    t = 0.5;
    renderFrame(0);
    return cleanup;
  }

  raf = requestAnimationFrame(loop);
  return cleanup;
}

// 2D canvas fallback using authentic WoW pre-rendered campfire base + WoW fire flipbook
function mount2DCampfire(canvas, { reduced = () => false, paused = () => false } = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  const cx = W / 2, base = H - 96;

  let stopped = false, raf = 0, last = 0, t = 0;
  let baseImg = null, fireImg = null;

  const basePromise = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = BASE_IMG_URL;
  });

  const firePromise = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = FLAME_SHEET;
  });

  Promise.all([basePromise, firePromise]).then(([b, f]) => {
    baseImg = b;
    fireImg = f;
    if (stopped) return;
    if (reduced()) {
      frame(0);
      return;
    }
    raf = requestAnimationFrame(loop);
  });

  const embers = Array.from({ length: 36 }, () => spawn(true));
  function spawn(init) {
    return {
      x: cx + (Math.random() - 0.5) * 110,
      y: base - 20 - (init ? Math.random() * 260 : 0),
      vx: (Math.random() - 0.5) * 18,
      vy: -(40 + Math.random() * 60),
      r: 1.5 + Math.random() * 2.5,
      life: init ? Math.random() : 0,
      sway: Math.random() * Math.PI * 2,
    };
  }

  function frame(dt) {
    t += dt;
    ctx.clearRect(0, 0, W, H);

    // Warm heat glow
    ctx.globalCompositeOperation = "lighter";
    const fl = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 6.3);
    const gl = ctx.createRadialGradient(cx, base - 40, 10, cx, base - 40, 280);
    gl.addColorStop(0, `rgba(255,160,40,${0.5 * fl})`);
    gl.addColorStop(0.5, `rgba(255,90,10,${0.2 * fl})`);
    gl.addColorStop(1, "rgba(255,70,0,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // Pre-rendered WoW campfire model base
    if (baseImg) {
      ctx.drawImage(baseImg, 0, 0, W, H);
    }

    // WoW fire flipbook
    if (fireImg) {
      ctx.globalCompositeOperation = "lighter";
      const fIdx = Math.floor(t * FPS) % FLAME_FRAMES;
      const col = fIdx % 8;
      const row = Math.floor(fIdx / 8);
      const fw = 64, fh = 64;
      const dw = 240, dh = 240;
      ctx.drawImage(fireImg, col * fw, row * fh, fw, fh, cx - dw / 2, base - 190, dw, dh);

      // Second layer offset for richness
      const fIdx2 = (Math.floor(t * FPS) + 15) % FLAME_FRAMES;
      const col2 = fIdx2 % 8;
      const row2 = Math.floor(fIdx2 / 8);
      const dw2 = 190, dh2 = 190;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(fireImg, col2 * fw, row2 * fh, fw, fh, cx - dw2 / 2, base - 165, dw2, dh2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // Embers
    ctx.globalCompositeOperation = "lighter";
    for (const e of embers) {
      const k = Math.max(0, 1 - e.life);
      ctx.fillStyle = `rgba(255,${160 + 70 * k | 0},60,${0.85 * k})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.5 + k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function step(dt) {
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.life += dt * 0.32;
      e.sway += dt * 3;
      e.x += (e.vx + Math.sin(e.sway) * 12) * dt;
      e.y += e.vy * dt;
      if (e.life >= 1 || e.y < 30) embers[i] = spawn(false);
    }
  }

  function loop(ts) {
    if (stopped) return;
    if (!canvas.isConnected) { stopped = true; return; }
    raf = requestAnimationFrame(loop);
    if (paused() || document.hidden) { last = ts; return; }
    if (ts - last < 33) return;
    const dt = Math.min(0.1, (ts - last) / 1000 || 0.033);
    last = ts;
    step(dt);
    frame(dt);
  }

  frame(0);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

export function mountCampfire(canvas, opts = {}) {
  try {
    return mount3DCampfire(canvas, opts);
  } catch (err) {
    console.warn("Spires: mount3DCampfire WebGL initialization fallback", err);
    return mount2DCampfire(canvas, opts);
  }
}
