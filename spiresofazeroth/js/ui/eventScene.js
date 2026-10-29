// Event scene (left 45%): a real 3D NPC standing on the ground band when the event has a baked speaker, otherwise a large
// illustrated plate (event icon at 256 px in a gold frame over a zone-art vignette; poster / hanging sign / plain frame).
// Also owns the resolution effects (hit flash + red number, coin burst + gold punch, heal motes). All of it degrades:
// no WebGL / no model / no fx layer => the plate variant and number-less feedback, never a broken screen.
//   mountScene(app, ev, sceneEl) -> Promise<{ npc: boolean, kind: string }>
//   playOutcome(app, host, parts)  parts = [{ k: "dmg"|"gold"|"heal"|"maxhp", n }]
import { h, icon } from "./dom.js?v=20261029d";
import { ART, zoneArt } from "./kit.js?v=20261029d";
import { getKit, mountPortrait, clearStage, safe } from "./combatKit.js?v=20261029d";

const slug = (s) => "npc-" + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const npcSlug = (npc) => slug(npc && (npc.model || npc.name));

let heroes = null;
async function bakedHeroes() {
  if (heroes) return heroes;
  try { heroes = (await (await fetch(new URL("../../assets/models/index.json", import.meta.url))).json()).heroes || {}; } catch (_) { heroes = {}; }
  return heroes;
}

/** Plate treatment from the event itself (no data churn): poster for bounties/contracts, hanging sign for places, else a plain frame. */
export function plateKind(ev) {
  const s = `${ev.id} ${ev.name}`.toLowerCase();
  if (/poster|wanted|bount|contract|bribe|notice/.test(s)) return "poster";
  if (/\b(inn|hut|post|camp|hold|keep|outpost|village|harbor|gate|garrison|stronghold|refuge|mill|forge|den|mine|span|crossing|vigil|base|fortress|encampment|excavation|dig|plot|tower)\b/.test(s)) return "sign";
  return "frame";
}

function plate(app, ev, art) {
  const kind = plateKind(ev);
  const frame = h("div", { class: "ev-frame" }, h("span", { class: "ev-frame__in" }, icon(ev.icon, "ev-frame__ico", ev.name)));
  const el = h("div", { class: `ev-plate ev-plate--${kind}` },
    h("div", { class: "ev-plate__vig" }),
    kind === "sign" ? h("div", { class: "ev-chains" }, h("i", {}), h("i", {})) : null,
    kind === "poster" ? h("div", { class: "ev-nails" }, h("i", {}), h("i", {}), h("i", {}), h("i", {})) : null,
    h("div", { class: "ev-board" },
      kind === "poster" ? h("small", { class: "ev-board__eyebrow" }, "By order of the garrison") : null,
      frame,
      h("b", { class: "ev-board__name" }, ev.name)));
  if (art) el.style.setProperty("--zone-art", `url(${ART}${art.fdid}.jpg)`);
  return { el, kind };
}

export async function mountScene(app, ev, sceneEl) {
  const art = await zoneArt(app.run.zoneId).catch(() => null);
  const npc = ev.npc;
  if (app.kit) clearStage(app.kit);
  if (npc) {
    const ok = !!(await bakedHeroes())[npcSlug(npc)];
    if (ok) {
      const host = h("div", { class: "ev-npc", id: "ev-npc" });
      const tag = h("div", { class: "ev-nameplate" }, h("b", {}, npc.name), h("small", {}, "Speaks to you"));
      sceneEl.append(host, tag);
      const groundPad = () => {
        const r = host.getBoundingClientRect(), p0 = app.stage.toStage(r.left, r.top), p1 = app.stage.toStage(r.right, r.bottom);
        tag.style.top = `${Math.round(app.stage.groundY - p0.y + 34)}px`; tag.style.bottom = "auto"; // name plate sits just under the feet
        return Math.max(20, p1.y - app.stage.groundY);
      };
      setTimeout(() => {
        if (!host.isConnected) return;
        mountPortrait(app, host, { classId: npcSlug(npc), pad: groundPad(), scale: (npc.scale || 1) * (app.stage.portrait ? 0.8 : 1), leaveEl: sceneEl }).then((kit) => {
          if (!kit) { host.remove(); tag.remove(); sceneEl.append(plate(app, ev, art).el); }
        });
      }, 120);
      return { npc: true, kind: "npc" };
    }
  }
  const p = plate(app, ev, art);
  sceneEl.append(p.el);
  return { npc: false, kind: p.kind };
}

// ---- resolution effects -------------------------------------------------------------------------------------------------
const centre = (app, el) => {
  if (!el) return { x: 960, y: 200 };
  const r = el.getBoundingClientRect(), a = app.stage.toStage(r.left + r.width / 2, r.top + r.height / 2);
  return a;
};
const punch = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 900); };

export async function playOutcome(app, host, parts) {
  if (!parts || !parts.length) return;
  const hp = host.querySelector(".sx-bar__hp"), gold = host.querySelector(".sx-bar__gold");
  const reduced = app.reduced();
  for (const p of parts) {
    if (p.k === "dmg") { punch(hp, "ev-hurt"); host.classList.add("ev-flash-red"); setTimeout(() => host.classList.remove("ev-flash-red"), 520); }
    if (p.k === "gold" && p.n > 0) punch(gold, "ev-coinpunch");
    if (p.k === "heal" || p.k === "maxhp") punch(hp, "ev-healpunch");
  }
  if (reduced) return;
  try {
    const kit = await safe(getKit(app).then((k) => { host._kit = k; }), "event-kit", 1500).then(() => host._kit);
    const fx = kit && kit.fx;
    if (!fx) return;
    await safe(fx.ready, "event-fx", 1500);
    const num = fx.numbers, P = fx.particles;
    let i = 0;
    for (const p of parts) {
      const delay = i++ * 0.18;
      fx.at(delay, () => {
        if (p.k === "dmg") {
          const a = centre(app, hp); num.number("dmg", p.n, { x: a.x, y: a.y + 40 }, { amount: p.n });
          num.kick(Math.min(1, 0.4 + p.n / 14));
        } else if (p.k === "gold") {
          const a = centre(app, gold);
          num.number("gold", `${p.n > 0 ? "+" : "-"}${Math.abs(p.n)}`, { x: a.x, y: a.y + 40 }, { amount: Math.abs(p.n) });
          if (p.n > 0 && P) P.burst({ x: a.x, y: a.y + 10, count: 26, cell: "dot", color: "#ffd24a", speed: [160, 460], size: [10, 20], life: [0.5, 0.95], additive: true, spread: 14 });
        } else if (p.k === "heal" || p.k === "maxhp") {
          const a = centre(app, hp);
          num.number("heal", `+${p.n}`, { x: a.x, y: a.y + 40 }, { amount: p.n });
          if (P) P.drift({ x: a.x, y: a.y + 30, w: 260, h: 40, count: 22, cell: "star", color: "#5ee27e", rise: 90, size: [8, 16], life: [0.8, 1.4], alpha: 0.9 });
        }
      });
    }
  } catch (e) { console.warn("[spires] event fx skipped:", e && e.message); }
}
