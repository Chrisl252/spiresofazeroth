// raceViewer.js - the character-create model stage: one transparent WebGL canvas that shows a baked playable-race body
// (assets/models/race/<race>-<gender>.glb, datamined client models; static pose, no skeleton) turning slowly, drag to spin.
// createRaceViewer(host, { reduced }) -> { show(slug) -> Promise<boolean>, dispose() }. Disposes itself when the host leaves the DOM.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUILD } from "../version.js?v=20261028e";

const BASE = new URL("../../assets/models/race/", import.meta.url).href;
const FRONT = -Math.PI / 2; // the baked bodies face +X; turn them to face the camera
const cache = new Map(); // slug -> Promise<ArrayBuffer>

export function createRaceViewer(host, { reduced = () => false } = {}) {
  const canvas = document.createElement("canvas");
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; // phones/tablets: tight GPU memory, so no MSAA and a lower pixel ratio
  canvas.className = "cc-model__canvas";
  host.append(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !touch, powerPreference: "low-power" }); } catch (e) { canvas.remove(); return { show: async () => false, dispose() {}, ok: false }; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a4152, 1.5));
  const key = new THREE.DirectionalLight(0xffd7a0, 2.2); key.position.set(-2, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x78a4ff, 1.2); rim.position.set(3, 2, -4); scene.add(rim);
  const pivot = new THREE.Group(); scene.add(pivot);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); host.dataset.model = ""; host.classList.add("cc-model--none"); }); // GPU dropped the context (mobile memory pressure): hide the canvas, no crash
  canvas.addEventListener("webglcontextrestored", () => { host.classList.remove("cc-model--none"); if (raceId) { const slug = raceId; raceId = ""; show(slug); } });
  let model = null, raf = 0, t0 = performance.now(), drag = 0, dragging = false, lastX = 0, token = 0, dead = false, raceId = "";

  function size() {
    const w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight);
    renderer.setPixelRatio(Math.min(touch ? 1.25 : 2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
  if (ro) ro.observe(host);
  size();

  function frame(obj) { // stand the body on y=0, centre it, back the camera off until it fits
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z);
    const fov = cam.fov * Math.PI / 180, dist = (Math.max(s.y * 1.12, s.x * 1.4 / cam.aspect) / 2) / Math.tan(fov / 2);
    cam.position.set(0, s.y * 0.5, dist + s.z * 0.5); cam.lookAt(0, s.y * 0.5, 0);
  }
  function loop(now) {
    raf = 0;
    if (dead) return;
    if (!host.isConnected) return dispose();
    const sweep = reduced() ? 0 : Math.sin((now - t0) / 2600) * 0.3; // slow sweep either side of front (about 17 degrees; starts dead front)
    pivot.rotation.y = FRONT + sweep + drag;
    renderer.render(scene, cam);
    if (!document.hidden) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", kick);
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (dragging) { drag += (e.clientX - lastX) * 0.012; lastX = e.clientX; kick(); } });
  const up = () => { dragging = false; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);

  function load(slug) {
    if (!cache.has(slug)) cache.set(slug, fetch(`${BASE}${slug}.glb?v=${BUILD}`).then((r) => { if (!r.ok) throw new Error(`${slug} ${r.status}`); return r.arrayBuffer(); }).catch((e) => { cache.delete(slug); throw e; }));
    return cache.get(slug);
  }
  function free(obj) { // dispose geometry, every material texture slot, and the decoded bitmaps (ImageBitmaps are not GC'd with the GL texture)
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isSkinnedMesh && o.skeleton) { try { o.skeleton.dispose(); } catch (e) { /* noop */ } }
      if (o.material) [].concat(o.material).forEach((m) => {
        for (const k in m) { const t = m[k]; if (t && t.isTexture) { if (t.image && t.image.close) try { t.image.close(); } catch (e) { /* already closed */ } t.dispose(); } }
        m.dispose();
      });
    });
  }
  let chain = Promise.resolve(); // one parse at a time: rapid clicks used to decode a dozen models at once and crash phone browsers
  const show = (slug) => { const my = ++token; const p = chain.then(() => build(slug, my)); chain = p.catch(() => {}); return p; };
  async function build(slug, my) {
    try {
      if (dead || my !== token) return false; // superseded by a newer click while queued: skip the decode entirely
      const buf = await load(slug);
      if (dead || my !== token) return false;
      const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.slice(0), BASE, res, rej));
      if (dead || my !== token) { free(gltf.scene); return false; }
      if (model) { pivot.remove(model); free(model); }
      model = gltf.scene;
      let skin = null; // the head geoset ships with an unbound material; its UVs sit in the body skin atlas (face is on that sheet), so bind that
      model.traverse((o) => { if (o.material && !skin && o.material.map) skin = o.material.map; });
      model.traverse((o) => {
        if (!o.material) return;
        for (const m of [].concat(o.material)) {
          m.side = THREE.DoubleSide;
          if (m.map) m.map.anisotropy = 4;
          else if (m.alphaMode === "MASK" || m.alphaTest > 0 || m.userData.gltfExtensions || m.transparent) o.visible = false;
          else if (skin) { m.map = skin; m.needsUpdate = true; }
          else o.visible = false;
        }
      });
      pivot.add(model); frame(model); raceId = slug; host.dataset.model = slug;
      kick();
      return true;
    } catch (e) { console.warn("[spires] race model:", e && e.message); host.dataset.model = ""; return false; }
  }
  function dispose() {
    if (dead) return; dead = true;
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", kick);
    if (ro) ro.disconnect();
    try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) { /* gone */ }
  }
  function closeup(on) { // frame the HEAD: centre on the eye surface (type-19 material), size by the face-shape mesh, fall back to 0.9 of the body height
    if (!model) return;
    if (!on) { frame(model); return; }
    model.updateMatrixWorld(true);
    let eyes = null;
    model.traverse((o) => { if (!o.isMesh) return; const m = [].concat(o.material)[0]; if (m && m.name === "tex-19") eyes = o; });
    const bb = new THREE.Box3().setFromObject(model), h = bb.max.y - bb.min.y;
    let cy = bb.min.y + h * 0.9, size = h * 0.16, cx = 0;
    if (eyes) { const e = new THREE.Box3().setFromObject(eyes), c = e.getCenter(new THREE.Vector3()); cy = c.y; cx = c.x; size = (e.max.x - e.min.x) * 3.2; }
    const fov = cam.fov * Math.PI / 180, d = size / Math.tan(fov / 2) * 1.15;
    cam.position.set(cx, cy, d + bb.getCenter(new THREE.Vector3()).z); cam.lookAt(cx, cy, bb.getCenter(new THREE.Vector3()).z);
  }
  return { show, closeup, dispose, ok: true, get model() { return model; }, get current() { return raceId; } };
}
