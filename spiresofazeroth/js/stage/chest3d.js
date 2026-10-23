// chest3d.js - the treasure chest of the loot screen (GEAR_SPEC section 2): a baked Classic chest GLB (assets/models/chest-<fight|elite|boss>.glb,
// clips idle + open) that drops from above onto the ground, settles with a bounce and opens its lid on request.
//   const chest = await mountChest(host, { kind, x, y, W, H, size, reduced });   // host = stage.layers.actors; (x,y) = ground point in stage px
//   chest.drop() -> Promise (lands)      chest.open() -> Promise (lid fully open)      chest.dispose()
// Resolves null when WebGL / the GLB is unavailable (the caller then shows a flat icon chest). One own canvas, rAF only while animating.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const TINT = { fight: null, elite: 0xd8e4ff, boss: 0xffcf6a };
const SIZE = { fight: 330, elite: 380, boss: 440 };
const easeBounce = (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };

export async function mountChest(host, { kind = "fight", x = 1400, y = 700, W = 1920, H = 1080, size, reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (e) { return null; }
  const scale = 0.8;
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(W * scale), Math.round(H * scale), false);
  const canvas = renderer.domElement;
  canvas.className = "gs-chest-canvas";
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:3`;
  host.append(canvas);
  const dispose = () => { cancelAnimationFrame(raf); raf = 0; try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* noop */ } canvas.remove(); };
  let raf = 0;
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(new URL(`../../assets/models/chest-treasure.glb`, import.meta.url).href);
  } catch (e) { dispose(); return null; }

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 2.1));
  const key = new THREE.DirectionalLight(0xfff2d0, 2.6); key.position.set(-300, 600, 500); scene.add(key);
  const glow = new THREE.PointLight(0xffc84a, 0, 900); glow.position.set(0, 120, 120); scene.add(glow);
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -2000, 2000);
  cam.position.z = 800;

  const model = gltf.scene, box = new THREE.Box3().setFromObject(model), dim = box.getSize(new THREE.Vector3());
  const s = (size || SIZE[kind] || 340) / Math.max(dim.x, dim.z, 0.001);
  const pivot = new THREE.Group();
  model.scale.setScalar(s);
  box.setFromObject(model);
  model.position.y -= box.min.y; model.position.x -= (box.min.x + box.max.x) / 2; model.position.z -= (box.min.z + box.max.z) / 2;
  pivot.add(model);
  pivot.rotation.set(0.42, -0.5, 0); // look down onto the open top, turned 3/4
  scene.add(pivot);
  if (TINT[kind]) model.traverse((n) => { if (n.material) { n.material = n.material.clone(); n.material.color.setHex(TINT[kind]); if (n.material.emissive) { n.material.emissive.setHex(kind === "boss" ? 0x5a3a00 : 0x1a2233); } } });

  const gx = x - W / 2, gy = -(y - H / 2);
  pivot.position.set(gx, gy, 0);
  const mixer = new THREE.AnimationMixer(model);
  const openClip = gltf.animations.find((a) => a.name === "open"), idleClip = gltf.animations.find((a) => a.name === "idle");
  const openAct = openClip ? mixer.clipAction(openClip) : null;
  if (openAct) { openAct.setLoop(THREE.LoopOnce, 1); openAct.clampWhenFinished = true; }
  else if (idleClip) mixer.clipAction(idleClip).play();

  let t0 = 0, dropAt = -1, dropDur = 0.62, dropRes = null, openRes = null, last = 0, shake = 0;
  const render = () => renderer.render(scene, cam);
  function frame(ts) {
    raf = 0;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    mixer.update(dt);
    if (dropAt >= 0) {
      const u = Math.min(1, (ts - dropAt) / 1000 / dropDur);
      const h = (1 - easeBounce(u)) * (H * 0.85);
      pivot.position.y = gy + h;
      pivot.rotation.y = -0.5 + (1 - u) * 0.9;
      if (u >= 1) { dropAt = -1; pivot.position.y = gy; pivot.rotation.y = -0.5; if (dropRes) { dropRes(); dropRes = null; } }
    }
    if (shake > 0) { shake -= dt; pivot.position.x = gx + Math.sin(shake * 90) * 5 * (shake / 0.35); if (shake <= 0) pivot.position.x = gx; }
    if (openAct && openRes && openAct.time >= openClip.duration - 0.02) { glow.intensity = 0; const r = openRes; openRes = null; r(); }
    render();
    if (dropAt >= 0 || shake > 0 || (openAct && openAct.isRunning() && !openAct.paused && openAct.time < openClip.duration - 0.01) || openRes) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  pivot.position.y = gy + H; render(); // parked above the screen until drop()
  return {
    kind, canvas, point: { x, y },
    drop() {
      if (reduced) { pivot.position.y = gy; pivot.rotation.y = -0.5; render(); return Promise.resolve(); }
      return new Promise((res) => { dropRes = res; dropAt = performance.now(); t0 = dropAt; kick(); });
    },
    shakeLid() { if (!reduced) { shake = 0.35; kick(); } },
    open() {
      if (!openAct) return Promise.resolve();
      if (reduced) { openAct.play(); mixer.setTime(openClip.duration); render(); return Promise.resolve(); }
      return new Promise((res) => { openRes = res; openAct.reset().play(); glow.intensity = 6; kick(); });
    },
    dispose,
  };
}
