// ground3d.js - Spires of Azeroth arena ground: an invisible shadow catcher under the hero, pet and enemies.
// The painted zone backdrop IS the floor (its own art, 1:1); this plane only receives the characters' live shadows, so nothing
// covers the vista. Until build 20261021f it was an opaque procedural-texture disc, which read as a flat white band on snow zones.
// API kept for actors3d.js: setZone(visuals), setGround(y), setParallax(px, py), setVisible(v), update(now, dt), dispose().

import * as THREE from "three";

const PITCH = (12 * Math.PI) / 180;
const COSP = Math.cos(PITCH);

export function createGround3d(scene, opts = {}) {
  const H = opts.designH || 1080;
  let groundY = opts.groundY || 758;

  const geometry = new THREE.PlaneGeometry(3200, 1600, 1, 1);
  const material = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  function syncPosition() {
    const y0 = (H / 2 - groundY) / COSP;
    mesh.position.set(0, y0, 580);
  }
  syncPosition();

  // zone tint: shadows take the zone's ground / shadow colour (zonePalette terrain.shadow, else near-black), snow zones a little lighter
  function setZone(visuals) {
    if (!visuals) return;
    const t = visuals.terrain || {};
    material.color.set(t.shadow || "#06050a");
    material.opacity = t.shadowOpacity != null ? t.shadowOpacity : visuals.biome === "snow" ? 0.3 : 0.42;
    material.needsUpdate = true;
  }
  function setGround(gy) {
    if (gy == null || Math.abs(gy - groundY) < 1) return;
    groundY = gy;
    syncPosition();
  }
  function setParallax(px) { mesh.position.x = px * 0.25; }
  function update() { /* nothing animates on a shadow catcher */ }
  function dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); }
  function setVisible(v) { mesh.visible = !!v; }

  return { mesh, setVisible, setZone, setGround, setParallax, update, dispose };
}
