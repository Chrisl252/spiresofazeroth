// heroLooks.js - applies a character's looks (skin colour / face / hair style / hair colour / facial hair) to a loaded body glb.
// Used by the in-run hero (actors3d.js) and the character-create preview (raceViewer.js). No hero glb is re-baked: the body canvas is RE-COMPOSED here
// (skin base + face + underwear + scalp + facial-hair pieces from assets/looks/tex, then the body's own ARMOUR-ONLY overlay assets/looks/ov/<glb>.webp on top),
// the baked hair / facial-hair prims are hidden (matched by vertex+index count against the manifest) and the chosen hair / beard / horn geosets from
// assets/looks/<race>-<gender>.glb are bound to the SAME skeleton (joint index = bone index on every glb from the same M2) or drawn in bind pose.
// Tools: tools/spires/bake_looks.py (bank + manifest + geoset glb), bake_looks_overlay.py (armour overlays). Rules live in engine/looks.js.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUILD } from "../version.js";
import { resolveLooks } from "../engine/looks.js";

const BASE = new URL("../../assets/looks/", import.meta.url).href;
const mans = new Map(), bufs = new Map(), bitmaps = new Map();
let ovIndex = null;
const jget = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u} ${r.status}`))));
export const loadManifest = (slug) => { if (!mans.has(slug)) mans.set(slug, jget(`${BASE}${slug}.json?v=${BUILD}`).catch((e) => { mans.delete(slug); throw e; })); return mans.get(slug); };
// the classic-model naked body used by the character-create preview (bind pose; bake_looks.py <slug>-body.glb)
export const loadBodyBuf = (slug) => loadBuf(`${slug}-body`);
const loadBuf = (slug) => { if (!bufs.has(slug)) bufs.set(slug, fetch(`${BASE}${slug}.glb?v=${BUILD}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`looks ${slug} ${r.status}`))))); return bufs.get(slug); };
const alive = (b) => !!b && (b.width > 0 || b.naturalWidth > 0);
// the shared bank bitmaps are only ever DRAWN from or cloned (clone()): actors3d.disposeTree() close()s every texture image on a hero swap, which used to close the cached bank bitmap and
// leave the next hero with blank face / skin / hair textures (11-02 report). bank() also re-fetches an entry that somehow got closed.
const bank = (path) => { if (bitmaps.has(path)) return bitmaps.get(path).then((b) => (alive(b) ? b : (bitmaps.delete(path), bank(path)))); bitmaps.set(path, fetch(`${BASE}${path}?v=${BUILD}`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${path} ${r.status}`)))).then((b) => createImageBitmap(b, { premultiplyAlpha: "none" }))); return bitmaps.get(path); };
const clone = async (path) => createImageBitmap(await bank(path), { premultiplyAlpha: "none" }); // a private copy for a three Texture (safe to close with the model)
const tex = (img) => { const t = new THREE.Texture(img); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; };

// hero glb url -> { slug: whose looks manifest fits the body, key: armour overlay name | null }; null when the body is not a race body (weapons, retail fallbacks)
export function bodyInfo(url, cls, heroBake) {
  const m = /\/(hero|race)\/([a-z0-9-]+)\.glb/.exec(String(url));
  if (!m) return null;
  if (m[1] === "race") return { slug: m[2], key: null };
  const p = m[2].split("-");
  if (p.length === 2) return heroBake[cls] ? { slug: heroBake[cls], key: m[2] } : null;
  return p.length === 4 ? { slug: `${p[1]}-${p[2]}`, key: m[2] } : null;
}

async function overlayFor(key) {
  if (!key) return { img: null, cov: [] };
  try {
    if (!ovIndex) ovIndex = jget(`${BASE}ov/index.json?v=${BUILD}`).catch(() => ({}));
    const idx = await ovIndex, cov = idx[key];
    if (!cov) return { img: null, cov: [] };
    return { img: await bank(`ov/${key}.webp`), cov };
  } catch (e) { return { img: null, cov: [] }; }
}

async function compose(man, res, w, h, ov) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"), lw = man.layout.w, lh = man.layout.h, cov = new Set(ov.cov);
  for (const ly of man.layers) {
    if (ly.type !== 1) continue;
    const f = res.targets[ly.target]; if (!f) continue;
    if ((ly.target === 13 && (cov.has(5) || cov.has(6))) || (ly.target === 14 && (cov.has(3) || cov.has(4)))) continue; // underwear only where bare
    let img; try { img = await bank(`tex/${f}`); } catch (e) { continue; }
    try {
      if (ly.target === 1) g.drawImage(img, 0, 0, w, h);
      else if (ly.rect) g.drawImage(img, ly.rect[0] * w / lw, ly.rect[1] * h / lh, ly.rect[2] * w / lw, ly.rect[3] * h / lh);
    } catch (e) { bitmaps.delete(`tex/${f}`); }
  }
  if (ov.img) { try { g.drawImage(ov.img, 0, 0, w, h); } catch (e) { /* keep the body without its overlay */ } }
  return cv;
}

const ctype = (m) => { const x = /^tex-(\d+)$/.exec((m && m.name) || ""); return x ? +x[1] : null; };

// root = the parsed gltf scene. opts = { slug, key, looks }. Resolves to stats (also in root.userData.looks). Missing assets leave the baked look.
export async function applyLooks(root, opts) {
  try {
    const st = await applyLooksRaw(root, opts);
    // fallback: the baked hair / facial-hair prims were hidden but no replacement geoset was bound -> keep the baked ones (never a bald / blank head)
    if (st.hidden > 0 && st.geos > 0 && st.added === 0) { restoreHidden(root); st.restored = true; }
    return st;
  } catch (e) { restoreHidden(root); throw e; } // a failed look part keeps the baked face / hair, never hides it
}
function restoreHidden(root) { root.traverse((o) => { if (o.userData && o.userData.looksHidden) { o.visible = true; o.userData.looksHidden = false; } }); }
async function applyLooksRaw(root, { slug, key, looks, forceHair = false }) {
  const man = await loadManifest(slug), res = resolveLooks(man, looks);
  const tmap = {}; for (const ly of man.layers) if (ly.type !== 1) tmap[ly.type] = ly.target;
  let body = null, w = 0, h = 0;
  root.traverse((o) => {
    if (o.isSkinnedMesh && !body) body = o;
    if (o.isMesh && !w) for (const m of [].concat(o.material)) { if (ctype(m) === 1 && m.map && m.map.image) { w = m.map.image.width; h = m.map.image.height; } }
  });
  if (!w) { w = 512; h = 256; }
  // 1) hide the baked variable prims (hair styles, facial hair, horns, tusks ...)
  const sv = new Set(), ss = new Set(), sh = new Set();
  for (const [id, v, i] of man.sub) { const k = `${v}/${i}`; if (man.var.includes(id)) { sv.add(k); if (id < 100) sh.add(k); } else ss.add(k); }
  let hid = 0, hadHair = false;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const k = `${o.geometry.attributes.position.count}/${o.geometry.index ? o.geometry.index.count : 0}`;
    if (sv.has(k) && !ss.has(k)) { o.visible = false; o.userData.looksHidden = true; hid++; if (sh.has(k)) hadHair = true; }
  });
  // 2) body canvas + replaceable textures
  const ov = await overlayFor(key), canvasTex = tex(await compose(man, res, w, h, ov)), repl = new Map();
  const setMap = async (m) => {
    const t = ctype(m); if (t === null) return;
    if (t === 1) { m.map = canvasTex; m.needsUpdate = true; return; }
    const f = res.targets[tmap[t]]; if (!f) return;
    if (!repl.has(f)) { try { repl.set(f, tex(await clone(`tex/${f}`))); } catch (e) { return; } }
    m.map = repl.get(f); m.needsUpdate = true;
  };
  const todo = []; root.traverse((o) => { if (o.isMesh && !o.userData.looksHidden) for (const m of [].concat(o.material)) todo.push(m); });
  await Promise.all(todo.map(setMap));
  // 3) the chosen hair / facial hair / horn geosets from the looks glb
  const buf = await loadBuf(slug), gltf = await new Promise((rs, rj) => new GLTFLoader().parse(buf.slice(0), BASE, rs, rj));
  const geo = (gltf.parser.json.meshes[0].extras || {}).geo || [], want = new Set(res.geos), sms = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) sms.push(o); });
  let added = 0;
  const wantHair = forceHair || !body || hadHair;                                                      // a closed helm baked into the body hides the hair, so no hair on it
  for (let i = 0; i < sms.length; i++) {
    const sm = sms[i], id = geo[i];
    if (!want.has(id) || (id < 100 && !wantHair)) { sm.visible = false; continue; }
    sm.material = [].concat(sm.material)[0].clone(); sm.material.side = THREE.DoubleSide;
    await setMap(sm.material); sm.frustumCulled = false; added++;
    if (body) { sm.removeFromParent(); sm.bind(body.skeleton, body.bindMatrix); body.parent.add(sm); }
  }
  if (!body) root.add(gltf.scene);
  root.userData.looks = { hidden: hid, added, hadHair, geos: res.geos.length, size: [w, h], overlay: !!ov.img };
  return root.userData.looks;
}
