// Choreography for cards that have REAL spell art (data/fx/real.json): precast + cast on the hero's hands, the real
// missile flying caster -> target, the real impact at the target, the real aura on the hero. Same helper bag and
// onImpact/resolve contract as cardfx.runLook, so choreo.play() can swap it in for the recipe look.
import { createRealArt } from "./realart.js?v=20261029d";
import { spawnModel, killAll } from "./m2emit.js?v=20261029d";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HAND = new Set([1, 2, 21, 22, 35, 37, 38]), FEET = new Set([19, 26, 27, 28]), HEAD = new Set([11, 17, 18, 20]);

/** where an M2 attachment point sits on a unit: chest anchor + feet anchor + facing */
function attachPos(att, base, feet, dirX) {
  if (HAND.has(att)) return { x: base.x + dirX * (att === 21 || att === 2 ? 30 : 52), y: base.y + (att === 21 || att === 2 ? 14 : 2) };
  if (FEET.has(att)) return { x: feet.x, y: feet.y - 6 };
  if (HEAD.has(att)) return { x: base.x, y: base.y - 78 };
  if (att === 0) return { x: base.x - dirX * 34, y: base.y + 10 };
  return { x: base.x, y: base.y };
}
const uniq = (list) => { const s = new Set(); return list.filter((x) => { const k = x.m + ":" + x.a; if (s.has(k)) return false; s.add(k); return true; }); };

/** hex colour from a model's first emitter (mid-life), used to colour the shared hit flash */
function modelHex(art, entry, mix) {
  for (const role of ["impact", "missile", "cast", "aura", "precast"]) {
    for (const x of entry.roles[role] || []) {
      const m = art.model(x.m); const e = m && m.e && m.e[0];
      if (e && e.c && e.c.length) { const c = e.c[Math.min(e.c.length - 1, 1)][1]; return "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join(""); }
    }
  }
  return "#ffd070";
}

export function createRealPlayer(opts = {}) {
  const art = createRealArt(opts);

  /** h = choreo helper bag (+ setAura). Returns true when it took the card. */
  function run(h, entry, kind, resolve, look) {
    const { c, at, actors, wake, rng, numbers, mix } = h;
    const R = entry.roles, reduced = !!(c.fx && c.fx.reduced);
    const targeted = kind === "attack" || !!(c.opts.to || c.opts.toUid != null);
    const hero = c.from, heroFeet = c.fromFeet;
    const tgt = targeted ? c.to : c.from, tgtFeet = targeted ? c.feet : c.fromFeet;
    const dirX = targeted ? (c.to.x >= c.from.x ? 1 : -1) : (c.from.x < 960 ? 1 : -1);
    const sc = (c.opts.scale || 1) * clamp(0.9 + c.amount / 55, 0.9, 1.3) * clamp(look && look.scale ? 0.75 + look.scale * 0.25 : 1, 0.85, 1.3) * (c.s > 1.3 ? 1.1 : 1);
    const main = look && look.tint ? look.tint : modelHex(art, entry, mix);
    c.pal = { main, hot: mix(look && look.tint2 ? look.tint2 : main, "#ffffff", 0.55), warm: look && look.tint2 ? look.tint2 : main, dark: mix(main, "#000000", 0.62) };
    const fire = () => { if (c.opts.onImpact) { try { c.opts.onImpact(); } catch (e) { console.error(e); } } };
    const spawn = (id, att, base, feet, o = {}) => {
      const model = art.model(id); if (!model) return null;
      const p = attachPos(att, base, feet, dirX);
      return spawnModel(art, rng, model, { at: p, dirX, scale: sc, reduced, ...o }, actors, wake);
    };
    const play = (role, base, feet, o = {}, filter) => {
      const list = uniq((R[role] || []).filter(filter || (() => true))).slice(0, 4);
      return list.map((x) => spawn(x.m, x.a, base, feet, o)).filter(Boolean);
    };
    const hand = attachPos(22, hero, heroFeet, dirX);
    const hasMissile = !!(R.missile && R.missile.length);
    const swing = kind === "attack" && targeted && !hasMissile && !R.cast && !R.precast && !!look && ["slash", "arc", "cleave", "whirl"].includes(look.shape);
    // windup = seconds to the caster's release frame: animmap (data/fx/anim.json) when the director/choreo passed one, else the old defaults
    const cardId = c.opts.cardId, arow = h.anim && cardId ? h.anim.card(cardId) : null;
    const rel = typeof c.opts.release === "number" ? c.opts.release : null;
    const windup = rel != null ? rel : ((R.precast || R.cast) && targeted ? 0.22 : (R.cast ? 0.2 : 0.08));
    const floor = !!(h.anim && cardId && h.anim.needsFloor(cardId, true)), sch = h.anim ? h.anim.school(c.el) : null;
    const schoolProj = arow && arow.anim === "cast" && kind === "attack" && targeted && !hasMissile && h.PROJ ? h.PROJ[c.el] : null;
    let tEnd = windup + 0.6;

    // art that is partial/missing still gets the guaranteed school flare at the hands (hero side) so nothing is silent
    if (floor && sch && !R.precast && !R.cast) at(Math.max(0, windup - 0.18), () => c.sheet(sch.selfSheet || "buff_glyph_rise", { x: hand.x, y: hand.y, scale: 0.7 * sc, tint: "main", hot: 0.4 }));
    // hero side: precast then cast at the hands (short, the card plays fast)
    if (R.precast) play("precast", hero, heroFeet, { maxEmit: Math.min(0.3, windup + 0.05) });
    at(windup * 0.8, () => { if (R.cast) play("cast", hero, heroFeet, { maxEmit: 0.4 }); });

    const impact = (when) => {
      at(when, () => {
        const filt = targeted && (R.impact || []).some((x) => x.tt === 2) ? (x) => x.tt !== 1 : undefined;
        if (R.impact) play("impact", tgt, tgtFeet, swing ? { rate: 1.7, scale: sc * 1.3 } : {}, filt);
        // weapon strikes: the spell itself is only a hit-spark; keep the generic weapon-swing trail so the blow still reads
        if (swing) for (let i = 0; i < Math.min(3, Math.max(1, look.n || 1)); i++) c.sheet(["slash_arc_a", "slash_arc_b", "slash_arc_c"][i % 3], { x: tgt.x, y: tgt.y, scale: 1.25 * sc, tint: "main", hot: 0.5, alpha: 0.75, delay: i * 0.07, flipY: i % 2 === 1 });
        if (floor && sch && !swing) c.sheet(sch.sheet, { x: tgt.x, y: tgt.y, scale: (kind === "attack" ? 1.0 : 0.85) * sc, tint: "main", hot: 0.45 });
        h.impactCore(c, { flashR: kind === "attack" ? 55 : 40, kick: kind === "attack" });
        if (kind === "attack") numbers.kick(clamp(3 + c.amount * 0.3, 3, 14)); else numbers.kick(2.5);
        // aura / state visuals live a moment on the target (or the hero when self-cast)
        if (R.aura) {
          const insts = play("aura", tgt, tgtFeet, { loop: true });
          if (kind === "power" && c.opts.persist !== false && h.setAura) h.setAura(c.opts.key || c.opts.cardId || "aura", insts);
          else at(1.5, () => insts.forEach((i) => i.stop()));
        }
        h.settle(c); fire();
      });
    };

    if (hasMissile && targeted) {
      const travel = clamp(c.dist / 1800, 0.2, 0.46), t0 = h.clock() + windup;
      const ang = Math.atan2(c.to.y - hand.y, c.to.x - hand.x), head = [Math.cos(ang), Math.sin(ang)];
      const arc = clamp(c.dist * 0.04, 0, 34);
      let inflight = [];
      at(windup, () => {
        const m = R.missile[0], model = art.model(m.m);
        if (!model) return;
        const at2 = () => { const u = clamp((h.clock() - t0) / travel, 0, 1); return { x: hand.x + (c.to.x - hand.x) * u, y: hand.y + (c.to.y - hand.y) * u - Math.sin(u * Math.PI) * arc }; };
        inflight = [spawnModel(art, rng, model, { at: at2, heading: head, dirX, scale: sc, loop: true, reduced }, actors, wake)];
      });
      at(windup + travel, () => inflight.forEach((i) => i && i.stop()));
      impact(windup + travel);
      tEnd = windup + travel + 0.65;
    } else if (schoolProj) {
      // ranged attack whose real art has no missile: the school projectile leaves on the release frame
      at(windup, () => h.projectile(c, schoolProj, () => {}));
      const trav = schoolProj.dur * 1.05;
      impact(windup + trav); tEnd = windup + trav + 0.65;
    } else {
      const delay = targeted ? windup + 0.1 : windup + 0.04;
      impact(delay);
      tEnd = delay + 0.65;
    }
    at(tEnd, resolve);
    return true;
  }
  return { art, run, ready: art.ready, entryFor: art.entryFor, ensure: art.ensure, clear: killAll };
}
