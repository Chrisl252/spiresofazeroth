// Hunter Guardian pet on the stage: a second FRIENDLY actor (uid "pet") left of the hero, facing the enemies, plus a small
// nameplate built from the enemy plate markup (.sp-eplate / .sp-ep--under / .sp-np / .sp-hp) with the green friendly bar.
//   const pets = createPetStage({ A: kit.actors, region: <.sp-actors-region element>, C });
//   pets.sync(hpOverride?)  -> create / replace / retire the actor from C.player.pet; refresh the plate. hpOverride = { hp, block } (the
//                              director's held display value, so the bar drops at the claw's impact, not before)
//   pets.dispose()
// Every family is cosmetic (Osty rule): the model is the classic display of a same-family beast already baked for act-1 enemies.
export const PET_MODEL = {          // hunter.json unit id -> enemy key whose baked classic display carries the pet's model + clips
  wolf: "snow-tracker-wolf",        // display 643  (idle idle2 attack attack2 hit death)
  cat: "flatland-prowler",          // display 1056 (idle attack attack2 hit death)
  boar: "crag-boar",                // display 607
  raptor: "bloodfen-raptor",        // display 2571
  owl: "thunderhawk-cloudscraper",  // display 3012 (Dustwind Harpy: the nearest baked winged beast)
  bat: "duskbat",                   // display 4732
  gorilla: "mistvale-gorilla",      // display 838
  bear: "black-bear",               // display 719
};
// Lane relative to the hero lane (A.lanes.hero): landscape = left of the hero and a step behind (energy orb + hero plate stay clear);
// portrait (hero hugging the left edge) = in front-right of the hero, between him and the enemies.
function laneFor(A) {
  const h = (A && A.lanes && A.lanes.hero) || { x: 480, y: 720, s: 1 };
  return h.x < 300 ? { x: h.x + 150 * h.s, y: h.y + 16, s: 0.52 * h.s } : { x: h.x - 300 * h.s, y: h.y - 38 * h.s, s: 0.58 * h.s };
}
const PLATE_W = 150;

export function createPetStage({ A, region, C, lane: laneOverride }) {
  let plate = null, parts = null, shownId = null, shownUid = null;
  const pct = (hp, max) => `${Math.max(0, Math.min(100, max ? (hp / max) * 100 : 0))}%`;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function mkPlate() {
    const ghost = el("i", "sp-hp__ghost"), fill = el("i", "sp-hp__fill"), txt = el("span", "sp-hp__txt");
    const hp = el("div", "sp-hp sp-hp--friend"); hp.setAttribute("role", "progressbar"); hp.append(ghost, fill, txt);
    const np = el("div", "sp-np"); np.append(hp, el("i", "sp-np__art"));
    const nm = el("div", "sp-ep__name"), intent = el("div", "sp-ep__petintent");
    const under = el("div", "sp-ep sp-ep--under"); under.append(nm, intent, (() => { const r = el("div", "sp-ep__row"); r.append(np); return r; })());
    const root = el("div", "sp-eplate sp-eplate--pet"); root.setAttribute("data-pet", "1"); root.append(under);
    root.style.pointerEvents = "none"; root.style.cursor = "default"; root.style.setProperty("--pw", `${PLATE_W}px`);
    region.append(root);
    return { root, nm, intent, hp, fill, ghost, txt };
  }

  function place(a) {
    const b = a && a.baseXY ? a.baseXY() : laneFor(A);
    // landscape: under the pet's feet the plate collided with the hero floor plate (hud.js: x 310-650) on its right and the energy orb on its
    // left, so it floats ABOVE the pet's head instead (like an enemy intent); portrait keeps it under the feet (the pet stands between hero and enemies)
    const port = !!((A && A.lanes && A.lanes.hero && A.lanes.hero.x) < 300);
    const hgt = !port && a && a.baseH ? a.baseH() : 0;
    plate.style.left = `${Math.max(8, b.x - PLATE_W / 2)}px`; plate.style.top = port ? `${b.y + 4}px` : `${Math.max(180, b.y - hgt - 108)}px`; plate.style.bottom = "auto";
  }

  function retire() { if (A && A.get("pet")) A.remove("pet"); shownId = null; if (plate) { plate.remove(); plate = null; parts = null; } }

  function sync(over) {
    const pet = C.player && C.player.pet;
    if (!A || !A.addAlly || !pet) { if (shownId) retire(); return; }
    let a = A.get("pet");
    if (a && (shownId !== pet.id || (a.dead && !pet.down))) { A.remove("pet"); a = null; }   // other family summoned / Revive Pet: a fresh idle actor
    if (!a && !pet.down) {
      a = A.addAlly({ uid: "pet", id: PET_MODEL[pet.id] || pet.id,  // hunter families map to a baked beast; warlock demons (imp, voidwalker...) resolve by unit id in the model index
        name: pet.name, icon: pet.icon, lane: laneOverride || laneFor(A) });
      if (a) shownId = pet.id;
    }
    if (a && pet.down && !a.dead) { a.dead = true; A.death("pet").catch(() => {}); }          // fled outside a choreographed death
    if (!plate) { const p = mkPlate(); plate = p.root; parts = p; }
    const hp = over && over.hp != null ? over.hp : pet.hp;
    parts.nm.textContent = pet.name;
    { // intent: the pet always attacks at the end of your turn (extra attacks come from cards); show what it will hit for
      const mv = (pet.moves || [])[(pet.cursor || 0) % Math.max(1, (pet.moves || []).length)];
      const dmg = mv ? (mv.effects || []).filter((e) => e.op === "damage").reduce((n, e) => n + (e.amount || 0), 0) : 0;
      parts.intent.textContent = !pet.down && dmg ? `Attacks every turn: ${dmg}` : "";
      parts.intent.title = "Your pet attacks at the end of every turn. Some cards make it attack again right away.";
    }
    parts.fill.style.width = pct(hp, pet.maxHp); parts.ghost.style.width = pct(hp, pet.maxHp);
    parts.txt.textContent = `${Math.max(0, hp)} / ${pet.maxHp}`;
    parts.hp.setAttribute("aria-valuenow", hp); parts.hp.setAttribute("aria-valuemax", pet.maxHp);
    plate.classList.toggle("dead", !!pet.down && hp <= 0);
    plate.setAttribute("aria-label", `${pet.name}, ${hp} of ${pet.maxHp} health`);
    place(A.get("pet"));
  }
  return { sync, dispose: retire };
}
