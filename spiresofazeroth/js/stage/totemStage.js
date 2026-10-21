// Shaman Totems on the stage: up to 4 friendly elemental totems surrounding the hero.
// Each active totem (earth, fire, water, air) renders with its authentic 3D Blizzard model,
// soft contact shadow on the ground plane, and compact status plate.
//   const totems = createTotemStage({ A: kit.actors, region: <.sp-actors-region element>, C });
//   totems.sync(dispOverrides?)
//   totems.dispose()
export const TOTEM_MODELS = {
  earth: "totem-earth.glb",
  fire: "totem-fire.glb",
  water: "totem-water.glb",
  air: "totem-air.glb",
};

const SLOTS = ["earth", "fire", "water", "air"];
const PLATE_W = 140;

// Lane relative to the hero lane (A.lanes.hero):
// Earth: Front-left of the hero
// Fire: Front-right of the hero (towards enemies)
// Water: Back-left of the hero
// Air: Back-right of the hero
function laneForSlot(A, slot) {
  const h = (A && A.lanes && A.lanes.hero) || { x: 420, y: 760, s: 1 };
  const s = h.s || 1;
  switch (slot) {
    case "earth": return { x: h.x + 95 * s, y: h.y + 12 * s, s: 0.65 * s };
    case "fire": return { x: h.x + 175 * s, y: h.y - 8 * s, s: 0.65 * s };
    case "water": return { x: h.x - 90 * s, y: h.y - 18 * s, s: 0.62 * s };
    case "air": return { x: h.x - 165 * s, y: h.y - 34 * s, s: 0.60 * s };
    default: return { x: h.x + 80 * s, y: h.y, s: 0.65 * s };
  }
}

export function createTotemStage({ A, region, C }) {
  const plates = new Map(); // slot -> { root, nm, hp, fill, ghost, txt }
  const pct = (hp, max) => `${Math.max(0, Math.min(100, max ? (hp / max) * 100 : 0))}%`;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function mkPlate(slot) {
    if (!region) return null;
    const ghost = el("i", "sp-hp__ghost"), fill = el("i", "sp-hp__fill"), txt = el("span", "sp-hp__txt");
    const hp = el("div", "sp-hp sp-hp--totem"); hp.setAttribute("role", "progressbar"); hp.append(ghost, fill, txt);
    const np = el("div", "sp-np"); np.append(hp, el("i", "sp-np__art"));
    const nm = el("div", "sp-ep__name");
    const under = el("div", "sp-ep sp-ep--under"); under.append(nm, (() => { const r = el("div", "sp-ep__row"); r.append(np); return r; })());
    const root = el("div", `sp-eplate sp-eplate--totem sp-eplate--totem-${slot}`);
    root.setAttribute("data-totem", slot); root.append(under);
    root.style.pointerEvents = "none"; root.style.cursor = "default"; root.style.setProperty("--pw", `${PLATE_W}px`);
    region.append(root);
    return { root, nm, hp, fill, ghost, txt };
  }

  function place(a, p, slot) {
    if (!p) return;
    const b = a && a.baseXY ? a.baseXY() : laneForSlot(A, slot);
    p.root.style.left = `${b.x - PLATE_W / 2}px`;
    p.root.style.top = `${b.y + 4}px`;
    p.root.style.bottom = "auto";
  }

  function retireSlot(slot) {
    const uid = "totem-" + slot;
    if (A && A.get(uid)) A.remove(uid);
    const p = plates.get(slot);
    if (p) { p.root.remove(); plates.delete(slot); }
  }

  function sync(overMap) {
    if (!A || !A.addAlly) return;
    const totems = (C && C.player && C.player.totems) || {};

    for (const slot of SLOTS) {
      const tot = totems[slot];
      const uid = "totem-" + slot;
      const isLive = tot && tot.hp > 0;

      if (!isLive) {
        if (A.get(uid) || plates.has(slot)) retireSlot(slot);
        continue;
      }

      let a = A.get(uid);
      if (!a) {
        a = A.addAlly({
          uid,
          id: tot.id || uid,
          glb: TOTEM_MODELS[slot] || "totem-default.glb",
          kind: "totem",
          name: tot.name,
          icon: tot.icon,
          lane: laneForSlot(A, slot),
          facing: 1,
        });
      }

      let p = plates.get(slot);
      if (!p && region) {
        p = mkPlate(slot);
        if (p) plates.set(slot, p);
      }

      if (p) {
        const over = overMap && overMap[uid];
        const hp = over && over.hp != null ? over.hp : tot.hp;
        const maxHp = tot.maxHp || 10;
        p.nm.textContent = tot.name;
        p.fill.style.width = pct(hp, maxHp);
        p.ghost.style.width = pct(hp, maxHp);
        p.txt.textContent = `${Math.max(0, hp)} / ${maxHp}`;
        p.hp.setAttribute("aria-valuenow", hp);
        p.hp.setAttribute("aria-valuemax", maxHp);
        place(a, p, slot);
      }
    }
  }

  function dispose() {
    for (const slot of SLOTS) retireSlot(slot);
  }

  return { sync, dispose };
}
