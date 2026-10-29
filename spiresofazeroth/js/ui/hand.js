// The hand: fan layout, hover lift, drag + bezier targeting arrow, tap-to-select, keyboard, draw/discard/exhaust flights.
// createHand(hostEl, { onPlay(inst, targetUid) -> false|any, canPlay(inst) -> bool, needsTarget(inst) -> bool, stage,
//   render?(inst) -> Element, refresh?(inst, el), keywords?(inst) -> [{name,text}], color?(inst) -> css colour, onDeny?(inst),
//   heroAnchor?() -> {x,y}, drawAnchor?() -> {x,y}, discardAnchor?() -> {x,y}, defaultTarget?(inst) -> uid (keyboard Enter only),
//   canQueue?(inst) -> bool (playable once the fx lock lifts: a drag may start / be released while locked and is played then) })
// Drag contract (StS): an aimed card shows the arrow as soon as the drag starts and plays ONLY when released on an enemy;
// released anywhere else it snaps home. Unaimed cards play when released above the hand line. Pointer capture is taken on
// pointerdown, and a pointerdown during the fx window is never dropped: the drag starts as soon as the card is playable/queueable.
//   -> { set(insts), draw(insts), discard(instIds), exhaust(instIds), lock(bool), select(instId), cancel(), anchorOf(instId), destroy() }
// All coordinates are stage px (hostEl covers the stage). Card faces come from card.js.
import { cardEl } from "./card.js?v=20261029a";
import { cardSounds } from "./cardSounds.js?v=20261029a";

const CW = 260, CH = 380;
// hud.js LANES start at 1180 with a 240px plate; HP sits under the feet. A raised card must stay left of that bar.
export const ENEMY_HP_LEFT = 1180 - 120;
export function aimedCardX(x, sc, isPortrait) {
  if (isPortrait) return x;
  return Math.min(x, ENEMY_HP_LEFT - 16 - (CW * sc) / 2);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function createHand(host, o) {
  const stage = o.stage;
  const reduced = () => (stage && stage.root && stage.root.classList.contains("sp-reduce")) || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const size = () => (stage && stage.size) || { w: 1920, h: 1080 };
  const portrait = () => !!(stage && stage.portrait);
  const rest = () => (portrait() ? 1.0 : 0.74);
  const HOVER = 1.0; // landscape hover/aim scale (StS2: cards stay small, the scene stays visible)
  const pileDraw = () => (o.drawAnchor ? o.drawAnchor() : { x: 110, y: size().h - 120 });
  const pileDisc = () => (o.discardAnchor ? o.discardAnchor() : { x: size().w - 110, y: size().h - 120 });
  const heroPt = () => (o.heroAnchor ? o.heroAnchor() : { x: 420, y: (stage ? stage.groundY : 760) - 200 });

  const layer = document.createElement("div"); layer.className = "sp-hand";
  const canvas = document.createElement("canvas"); canvas.className = "sp-aim";
  const kwtip = document.createElement("div"); kwtip.className = "sp-kwtip"; kwtip.style.display = "none";
  host.append(layer, canvas, kwtip);
  const ctx = canvas.getContext("2d");

  /** items: [{ inst, el }] in hand order */
  let items = [];
  const S = { hover: null, sel: null, drag: null, ptr: { x: 0, y: 0, cx: 0, cy: 0 }, locked: false, tapTarget: null, raf: 0, enemyEl: null, down: null, queued: null, lastAim: "", ext: null };
  const byId = (id) => items.find((it) => it.inst.uid === id);

  // ---------------- layout ----------------
  function place(it, x, y, rot, scale, z, instant) {
    const el = it.el;
    if (instant) el.style.transition = "none";
    el.style.transform = `translate(${(x - CW / 2).toFixed(1)}px, ${(y - CH / 2).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    el.style.zIndex = z;
    if (instant) { void el.offsetWidth; el.style.transition = ""; }
  }
  function layout() {
    const { w, h } = size(), n = items.length, s = rest();
    const cardW = CW * s, usable = portrait() ? w - 90 : 1260;
    const spacing = n <= 1 ? 0 : Math.min(cardW * 0.8, (usable - cardW) / (n - 1));
    const tuck = portrait() ? 235 : Math.round(h * 0.15); // StS2: cards sit tucked in the bottom band, only their top half shows until hovered
    const cx = w / 2 + (portrait() ? 0 : 20), hi = items.findIndex((it) => it.inst.uid === (S.drag ? null : S.sel || S.hover));
    const selIt = S.sel && byId(S.sel);
    items.forEach((it, i) => {
      if (S.drag && S.drag.it === it) return;
      const t = n <= 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
      let x = cx + (i - (n - 1) / 2) * spacing, y = h - tuck + (CH * s) / 2 + t * t * 22, rot = t * 14 * Math.min(1, n / 5), sc = s, z = 10 + i;
      it.slotX = x; // fixed fan slot (before hover spread): mouse hover is picked from these, so moving cards never steal the hover
      if (!portrait() && t > 0) y += t * 56; // right-fan rotation lifts the top-left corner; drop those cards so they miss enemy HP
      if (hi >= 0 && i !== hi) { const d = i - hi, sign = Math.sign(d); x += sign * (88 / Math.abs(d) ** 0.8) * (portrait() ? 0.5 : 1); }
      if (i === hi) {
        const sel = S.sel === it.inst.uid;
        rot = 0; z = 80;
        if (portrait()) { sc = sel ? 1.5 : 1.18; y = sel ? h - CH * sc / 2 - 200 : h - (CH * s) / 2 - 26 - 60; }
        else {
          sc = HOVER;
          y = h - (CH * sc) / 2 - 18 - (sel ? 36 : 0);
        }
      }
      it.rest = { x, y, rot, sc };
      it.el.classList.toggle("is-hover", i === hi);
      it.el.classList.toggle("is-sel", S.sel === it.inst.uid);
      place(it, x, y, rot, sc, z);
    });
    placeTip(hi >= 0 ? items[hi] : null);
  }
  function placeTip(it) {
    const lines = it && !S.drag && o.keywords ? o.keywords(it.inst) : [];
    if (!it || !lines.length) { kwtip.style.display = "none"; return; }
    kwtip.innerHTML = lines.map((k) => `<p><b>${esc(k.name)}</b>${esc(k.text)}</p>`).join("");
    kwtip.style.display = "block";
    const r = it.rest, w = size().w, half = CW * HOVER / 2;
    const right = r.x + half + 18, fitsRight = right + 300 < w;
    kwtip.style.left = `${fitsRight ? right : Math.max(10, r.x - half - 18 - 300)}px`;
    kwtip.style.top = `${r.y - CH * HOVER / 2 + 16}px`;
  }

  function hoverAt(e) {
    if (S.drag || S.sel || S.locked || !items.length) return;
    const p = stage ? stage.toStage(e.clientX, e.clientY) : { x: e.clientX };
    let best = null, bd = Infinity;
    for (const it of items) { const d = Math.abs((it.slotX ?? 0) - p.x); if (d < bd) { bd = d; best = it; } }
    if (!best || best.inst.uid === S.hover) return;
    S.hover = best.inst.uid; layout(); fireAim(null);
  }

  // ---------------- card elements ----------------
  function build(inst) {
    const el = o.render ? o.render(inst) : cardEl(inst.def, { inst, tag: "div", tips: false });
    el.classList.add("sp-hcard");
    el.setAttribute("role", "listitem");
    el.tabIndex = 0;
    const hit = document.createElement("span"); hit.className = "spc__hit"; el.append(hit);
    // Player reports 10-23 ("cards shake when you hover, far right very hard to play"): hovering spreads the neighbours, which used to
    // put the pointer on a neighbour, flip the hover, spread back, repeat. Hover now follows the pointer's x against the fixed fan slots.
    el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hoverAt(e); });
    el.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hoverAt(e); });
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" || S.drag || !S.hover) return;
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".sp-hcard");
      if (to && layer.contains(to)) return; // moved onto another hand card: its own pointerenter/move decides
      S.hover = null; layout(); fireAim(null);
    });
    el.addEventListener("focus", () => { if (!S.drag && !S.sel && !S.locked) { S.hover = inst.uid; layout(); fireAim(null); } });
    el.addEventListener("blur", () => { if (S.hover === inst.uid && !S.sel) { S.hover = null; fireAim(null); } });
    el.addEventListener("pointerdown", (e) => onDown(e, inst));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); S.sel === inst.uid ? commit() : select(inst.uid); } });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    return el;
  }
  function refreshAll() {
    for (const it of items) {
      if (o.refresh) o.refresh(it.inst, it.el);
      it.el.classList.toggle("is-nope", !playableSoon(it.inst)); // not greyed out just because the previous card's fx is running
    }
  }

  function fly(it, from, delay) {
    const el = it.el;
    el.style.transition = "none"; el.style.opacity = "0";
    place(it, from.x, from.y, -18, 0.22, 5);
    void el.offsetWidth;
    el.style.transition = ""; el.style.transitionDelay = reduced() ? "0ms" : `${delay}ms`;
    el.style.opacity = "1";
    setTimeout(() => { el.style.transitionDelay = ""; }, delay + 520);
  }

  function set(list) {
    const ids = new Set(list.map((c) => c.uid));
    const gone = items.filter((it) => !ids.has(it.inst.uid));
    for (const it of gone) ghost(it);
    const next = []; const fresh = [];
    for (const inst of list) {
      let it = byId(inst.uid);
      if (!it) { it = { inst, el: build(inst) }; layer.append(it.el); fresh.push(it); } else it.inst = inst;
      next.push(it);
    }
    items = next;
    if (S.sel && !ids.has(S.sel)) { S.sel = null; S.tapTarget = null; clearAim(); fireAim(null); }
    if (S.hover && !ids.has(S.hover)) { S.hover = null; fireAim(null); }
    refreshAll();
    fresh.forEach((it, i) => fly(it, pileDraw(), i * 40));
    layout();
  }
  function draw(insts) { if (insts && insts.length) cardSounds.ui("cardDraw"); set(items.map((it) => it.inst).concat(insts.filter((c) => !byId(c.uid)))); }

  function leave(it, mode, delay = 0) {
    items = items.filter((x) => x !== it);
    const el = it.el;
    if (S.sel === it.inst.uid) { S.sel = null; clearAim(); }
    if (S.hover === it.inst.uid) S.hover = null;
    el.style.pointerEvents = "none";
    if (mode === "burn") {
      el.classList.add("burn");
      const r = it.rest || { x: size().w / 2, y: size().h - 200 };
      for (let i = 0; i < (reduced() ? 5 : 14); i++) {
        const e = document.createElement("i"); e.className = "spc-ember";
        e.style.left = `${r.x - 130 + 20 + Math.random() * 220}px`; e.style.top = `${r.y - 190 + 60 + Math.random() * 280}px`;
        e.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`); e.style.setProperty("--dy", `${-90 - Math.random() * 120}px`);
        e.style.animationDelay = `${Math.random() * 300}ms`; layer.append(e); setTimeout(() => e.remove(), 1300);
      }
      setTimeout(() => el.remove(), 760);
      return;
    }
    if (mode === "ghost" && el.animate && !reduced()) { // StS2 play-out: the card pops to mid-field tilted, then shrinks and floats up and away fast
      const { w, h } = size(), from = el.style.transform, mx = w / 2 - 60, my = h * 0.36;
      const at = (x, y, rot, sc) => `translate(${(x - CW / 2).toFixed(1)}px, ${(y - CH / 2).toFixed(1)}px) rotate(${rot}deg) scale(${sc})`;
      el.style.transition = "none"; el.style.zIndex = 95;
      const anim = el.animate([
        { transform: from, opacity: 1 },
        { transform: at(mx, my, 18, 0.8), opacity: 1, offset: 0.38 },
        { transform: at(mx + 40, my - 170, 30, 0.34), opacity: 0 },
      ], { duration: 420, delay, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" });
      anim.onfinish = () => el.remove(); setTimeout(() => el.remove(), 420 + delay + 200);
      return;
    }
    const to = mode === "discard" ? pileDisc() : heroPt();
    const dur = mode === "discard" ? 340 : 300;
    el.style.transition = `transform ${dur}ms cubic-bezier(.5,0,.8,.4) ${delay}ms, opacity ${dur}ms ease-in ${delay}ms`;
    el.style.transform = `translate(${to.x - CW / 2}px, ${to.y - CH / 2}px) rotate(${mode === "discard" ? 24 : 0}deg) scale(${mode === "discard" ? 0.2 : 0.3})`;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), dur + delay + 80);
  }
  const ghost = (it) => leave(it, "ghost");
  function discard(ids) { ids.map(byId).filter(Boolean).forEach((it, i) => leave(it, "discard", reduced() ? 0 : i * 35)); layout(); }
  function exhaust(ids) { ids.map(byId).filter(Boolean).forEach((it) => leave(it, "burn")); layout(); }

  // ---------------- play / select / aim ----------------
  const handLine = () => size().h - (portrait() ? 760 : 470);
  // Untargeted (AoE / self) cards play when released anywhere over the battlefield, i.e. anywhere above the resting hand's body (its cards
  // peek ~145 stage px above the bottom edge; the line sits 25 px inside that, so a release at the hand's top edge still casts). Only a
  // drop back down onto the hand itself cancels. (The old line was h-470, so drops on the enemies and the lower field snapped back.)
  // Portrait tucks a taller band (235 px), so its line sits just above that band instead.
  const castLine = () => size().h - (portrait() ? 260 : 120);
  const hidden = (t) => t.classList.contains("is-stealth") && !!document.querySelector(".sp-eplate[data-uid]:not(.dead):not(.is-stealth)"); // stealthed plates are not targets while a visible enemy exists (the engine enforces the same)
  const enemyAt = (cx, cy) => {
    for (const e of document.elementsFromPoint(cx, cy)) {
      const t = e.closest && e.closest("[data-uid]");
      if (t && t.dataset.uid !== "player" && !t.classList.contains("dead") && !t.closest(".sp-hand") && !hidden(t)) return t;
    }
    // generous fallback: the whole plate column (intent + body + bars) grown by ~80 stage px, so the 3D actor's silhouette gaps never miss
    const pad = 80 * (stage ? stage.scale : 1); let best = null, bd = 1e9;
    for (const t of document.querySelectorAll(".sp-eplate[data-uid]:not(.dead)")) {
      if (hidden(t)) continue;
      const r = t.getBoundingClientRect();
      if (cx < r.left - pad || cx > r.right + pad || cy < r.top - pad || cy > r.bottom + pad * 0.5) continue;
      const d = Math.abs(cx - (r.left + r.right) / 2);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  const playableSoon = (inst) => o.canPlay(inst) || !!(o.canQueue && o.canQueue(inst));
  // play now, or (fx window still running) hold the card raised and play it the moment the lock lifts
  function playOrQueue(it, targetUid) {
    if (!S.locked && o.canPlay(it.inst)) return tryPlay(it, targetUid);
    if (o.canQueue && o.canQueue(it.inst)) {
      S.queued = { id: it.inst.uid, target: targetUid || null };
      S.sel = it.inst.uid; S.hover = null; clearAim(); setEnemyMark(null, null); it.el.classList.remove("is-aim"); layout();
      if (!S.locked) setTimeout(flushQueue, 0);
      return true;
    }
    return tryPlay(it, targetUid); // denies with the real reason
  }
  function flushQueue() {
    const q = S.queued; if (!q || S.locked) return;
    const it = byId(q.id);
    if (!it) { S.queued = null; return; }
    if (o.canPlay(it.inst)) { S.queued = null; if (!tryPlay(it, q.target)) { S.sel = null; layout(); } return; }
    if (!(o.canQueue && o.canQueue(it.inst))) { S.queued = null; S.sel = null; layout(); } // no longer playable: back home
  }
  function tryPlay(it, targetUid) {
    if (S.locked) return false;
    if (!o.canPlay(it.inst)) { deny(it); return false; }
    S.locked = true; // immediately guard against rapid-click or double-gesture execution
    S.sel = null; S.tapTarget = null; clearAim(); S.hover = null; setEnemyMark(null, null);
    const r = o.onPlay(it.inst, targetUid || null);
    if (r === false) { S.locked = false; layout(); return false; }
    return true;
  }
  function deny(it) {
    if (o.onDeny) o.onDeny(it.inst);
    if (!reduced() && it.el.animate) it.el.animate([{ translate: "0" }, { translate: "-10px" }, { translate: "10px" }, { translate: "-6px" }, { translate: "0" }], { duration: 260 });
    layout();
  }
  function select(id) {
    if (S.locked) return;
    const it = byId(id); if (!it) return;
    if (!o.canPlay(it.inst)) { deny(it); return; }
    S.sel = id; S.hover = null; S.tapTarget = null;
    if (o.needsTarget(it.inst)) {
      it.el.classList.add("is-aim");
      if (!S.ptr.cx && !S.ptr.cy) { const en = document.querySelector(".sp-eplate[data-uid]:not(.dead)"); if (en) { const p = stage.toStage(en.getBoundingClientRect().left + en.offsetWidth / 2 * stage.scale, en.getBoundingClientRect().top); S.ptr.x = p.x; S.ptr.y = p.y + 200; } }
      startAim();
    }
    layout();
    fireAim(S.tapTarget || null);
  }
  function cancel() { if (S.down) endGesture(); endExt(); S.sel = null; S.tapTarget = null; S.drag = null; S.queued = null; clearAim(); setEnemyMark(null, null); fireAim(null); items.forEach((it) => it.el.classList.remove("is-aim", "is-drag")); layout(); }
  // ---------------- external aim (potions): the same arrow + enemy marks, from any element ----------------
  // Press-and-drag: release on an enemy throws it (onDrop), anywhere else cancels. A press released in place turns sticky: the arrow
  // follows the pointer until the next pointerdown (enemy = throw, elsewhere = cancel) or Escape. Without a pointerId it starts sticky.
  function aimFrom(el, { onDrop, onCancel, color: col, pointerId } = {}) {
    if (S.locked || !el || !onDrop) return false;
    cancel();
    const r = el.getBoundingClientRect(), p = stage.toStage(r.left + r.width / 2, r.top + r.height / 2);
    S.ext = { el, from: p, onDrop, onCancel, col: col || "#b48cff" };
    el.classList.add("is-aim");
    if (!S.ptr.cx && !S.ptr.cy) S.ptr = { x: p.x, y: p.y + 140, cx: 0, cy: 0 };
    if (pointerId != null) {
      const up = (e) => {
        if (e.pointerId !== pointerId) return;
        document.removeEventListener("pointerup", up);
        const ext = S.ext; if (!ext) return;
        const q = stage.toStage(e.clientX, e.clientY);
        if (Math.hypot(q.x - ext.from.x, q.y - ext.from.y) < 40) return; // a tap: stay armed (sticky) until the next press
        const en = enemyAt(e.clientX, e.clientY); endExt();
        if (en) ext.onDrop(en.dataset.uid); else if (ext.onCancel) ext.onCancel();
      };
      document.addEventListener("pointerup", up);
    }
    startAim();
    return true;
  }
  function endExt() { const x = S.ext; if (!x) return; S.ext = null; x.el.classList.remove("is-aim"); clearAim(); setEnemyMark(null, null); }
  function commit() {
    const it = S.sel && byId(S.sel); if (!it) return;
    if (!o.needsTarget(it.inst)) return void tryPlay(it, null);
    const en = S.tapTarget ? document.querySelector(`[data-uid="${S.tapTarget}"]`) : S.enemyEl || enemyAt(S.ptr.cx, S.ptr.cy);
    const uid = (en && en.dataset.uid) || (o.defaultTarget && o.defaultTarget(it.inst));
    if (uid) tryPlay(it, uid);
  }
  // StS2 previews: tell the app which card is aimed (hover/select/drag) and at whom
  function fireAim(uid) {
    const inst = (S.drag && S.drag.it.inst) || (S.sel && byId(S.sel) && byId(S.sel).inst) || (S.hover && byId(S.hover) && byId(S.hover).inst) || null;
    const key = (inst ? inst.uid : "") + ":" + (uid || "");
    if (S.lastAim === key) return;
    S.lastAim = key;
    if (o.onAim) o.onAim(inst, uid || null);
  }
  function setEnemyMark(el, mode) {
    if (S.enemyEl && S.enemyEl !== el) S.enemyEl.classList.remove("is-target", "is-tapped");
    S.enemyEl = el;
    if (el) { el.classList.add("is-target"); el.classList.toggle("is-tapped", mode === "tap"); }
    fireAim(el && el.dataset.uid);
    if (o.immuneOn) { // classic immunities: red "Immune" tag on the card being aimed at an enemy it cannot hurt
      const it = S.drag ? S.drag.it : items.find((x) => x.inst.uid === S.sel);
      for (const x of items) x.el.classList.remove("is-immune");
      if (el && it && o.immuneOn(it.inst, el.dataset.uid)) { it.el.classList.add("is-immune"); it.el.title = "Target is immune"; }
    }
  }

  // ---------------- pointer gestures ----------------
  function toStage(e) { const p = stage.toStage(e.clientX, e.clientY); S.ptr = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY }; return p; }
  function onDown(e, inst) {
    if (e.button > 0) return; // NOT gated on S.locked: a press during the fx window becomes a drag as soon as the card is playable
    const it = byId(inst.uid); if (!it) return;
    if (S.down) onCancelGesture(); // a stale gesture (lost pointerup) never blocks the next press
    if (S.queued && S.queued.id !== inst.uid) { S.queued = null; S.sel = null; } // grabbing another card drops a queued one
    try { if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); } catch {} // fast drags keep their events
    if (e.pointerType === "mouse") e.preventDefault(); // no native text-select / image drag stealing the gesture
    const p = toStage(e);
    S.down = { it, x: p.x, y: p.y, id: e.pointerId, moved: false, type: e.pointerType, wasSel: S.sel === inst.uid };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp); document.addEventListener("pointercancel", onCancelGesture);
  }
  function onMove(e) {
    const d = S.down; if (!d || e.pointerId !== d.id) return;
    const p = toStage(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > 14) {
      if (!playableSoon(d.it.inst)) return; // keep waiting: the drag starts on the first move after it becomes playable
      if (S.queued && S.queued.id === d.it.inst.uid) S.queued = null; // re-grabbed a queued card: the new release decides
      d.moved = true;
      S.drag = { it: d.it, targeted: o.needsTarget(d.it.inst) }; S.sel = d.it.inst.uid; S.hover = null; S.tapTarget = null;
      d.it.el.classList.add("is-drag"); d.it.el.style.transition = "none";
      layout(); if (S.drag.targeted) { d.it.el.classList.add("is-aim"); startAim(); } else fireAim(null); // untargeted (AoE) drag previews too
    }
    if (!S.drag) return;
    const dr = S.drag, { h } = size();
    if (dr.targeted) {
      const en = enemyAt(e.clientX, e.clientY); setEnemyMark(en, null);
      // StS2: an aimed card parks raised at the hand centre and never follows the pointer onto the enemies; the arrow does the travelling
      if (!dr.pos) {
        const sc = portrait() ? 1.0 : HOVER;
        dr.pos = portrait() ? { x: size().w / 2, y: h - 760 } : { x: aimedCardX(size().w / 2 + 20, sc, false), y: h - (CH * sc) / 2 - 18 };
        dr.it.el.style.transition = ""; place(dr.it, dr.pos.x, dr.pos.y, 0, sc, 90);
      }
    } else {
      place(dr.it, p.x, p.y + 40, 0, 1.0, 90);
      dr.it.el.classList.toggle("is-aim", p.y < castLine());
    }
  }
  function endGesture(e) {
    const d = S.down; if (!d) return null;
    document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("pointercancel", onCancelGesture);
    S.down = null; return d;
  }
  function onCancelGesture() { endGesture(); if (S.drag) { S.drag.it.el.classList.remove("is-drag"); S.drag.it.el.style.transition = ""; S.drag = null; cancel(); } }
  function onUp(e) {
    if (S.down && e.pointerId !== S.down.id) return;
    const d = endGesture(e); if (!d) return;
    const p = toStage(e);
    if (S.drag) {
      const dr = S.drag; S.drag = null;
      dr.it.el.classList.remove("is-drag"); dr.it.el.style.transition = "";
      let played = false;
      // aimed: ONLY a release on an enemy plays it (on THAT enemy); anywhere else it snaps back. Never a random/default target.
      if (dr.targeted) { const en = enemyAt(e.clientX, e.clientY); if (en) played = playOrQueue(dr.it, en.dataset.uid); }
      else if (p.y < castLine()) played = playOrQueue(dr.it, null);
      if (!played) { S.sel = null; clearAim(); setEnemyMark(null, null); dr.it.el.classList.remove("is-aim"); layout(); }
      return;
    }
    // a click / tap
    const id = d.it.inst.uid, needs = o.needsTarget(d.it.inst);
    if (d.type === "mouse") {
      if (S.sel === id) { cancel(); S.hover = id; layout(); }
      else if (!needs) tryPlay(d.it, null);
      else { select(id); }
    } else {
      if (d.wasSel) { if (!needs) tryPlay(d.it, null); else if (S.tapTarget) commit(); else cancel(); }
      else { cancel(); select(id); }
    }
  }

  // document-level: aim mode pointer tracking and enemy clicks
  function onDocMove(e) {
    if (!layer.isConnected) return api.destroy();
    if (!S.sel && !S.drag && !S.ext) return;
    toStage(e);
    if (S.ext) { setEnemyMark(enemyAt(e.clientX, e.clientY), null); return; }
    if (S.sel && !S.drag && S.tapTarget === null) { const en = enemyAt(e.clientX, e.clientY); if (e.pointerType === "mouse") setEnemyMark(en, null); }
  }
  function onDocDown(e) {
    if (!layer.isConnected) return api.destroy();
    if (S.ext) { // sticky potion aim: this press decides
      const ext = S.ext, en = enemyAt(e.clientX, e.clientY); endExt();
      if (en) ext.onDrop(en.dataset.uid); else if (ext.onCancel) ext.onCancel();
      e.stopPropagation(); e.preventDefault(); return;
    }
    if (e.button === 2 && (S.sel || S.drag)) { cancel(); e.preventDefault(); return; } // right-press cancels at once (also mid-drag); contextmenu below is the backstop
    if (!S.sel || S.drag) return;
    if (S.locked) { if (S.queued && !(e.target.closest && e.target.closest(".sp-hcard, button, [data-keep-sel]"))) cancel(); return; } // a card held raised during the fx window can still be put back
    if (e.target.closest && e.target.closest(".sp-hcard")) return;
    const it = byId(S.sel); if (!it) return;
    const en = enemyAt(e.clientX, e.clientY);
    const needs = o.needsTarget(it.inst);
    if (en && needs) {
      if (e.pointerType === "mouse" || S.tapTarget === en.dataset.uid) { toStage(e); tryPlay(it, en.dataset.uid); e.stopPropagation(); e.preventDefault(); }
      else { S.tapTarget = en.dataset.uid; setEnemyMark(en, "tap"); const p = stage.toStage(e.clientX, e.clientY); S.ptr = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY }; e.stopPropagation(); e.preventDefault(); }
      return;
    }
    if (e.target.closest && e.target.closest("button, [data-keep-sel]")) return;
    if (!needs) { tryPlay(it, null); e.stopPropagation(); e.preventDefault(); return; } // click-select an AoE/self card, then click the battlefield: it casts (no enemy needed)
    cancel();
  }
  function onKey(e) {
    if (!layer.isConnected) return api.destroy();
    if (S.locked || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector(".sp-bugp") || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && items[n - 1]) {
      const id = items[n - 1].inst.uid;
      if (S.sel === id) commit(); else { cancel(); select(id); S.hover = null; layout(); }
      e.preventDefault();
    } else if (e.key === "Enter" && S.sel) { commit(); e.preventDefault(); }
    else if (e.key === "Escape" && (S.sel || S.drag || S.ext)) { const ext = S.ext; cancel(); if (ext && ext.onCancel) ext.onCancel(); e.preventDefault(); }
  }
  document.addEventListener("pointermove", onDocMove, true);
  document.addEventListener("pointerdown", onDocDown, true);
  document.addEventListener("keydown", onKey);
  document.addEventListener("contextmenu", (e) => { if (S.sel) { e.preventDefault(); cancel(); } });

  // ---------------- targeting arrow (overlay canvas) ----------------
  function sizeCanvas() { const { w, h } = size(); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } }
  function startAim() { sizeCanvas(); if (!S.raf) S.raf = requestAnimationFrame(frame); }
  function clearAim() { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function color() { const it = S.sel && byId(S.sel); return (it && o.color ? o.color(it.inst) : null) || "#ffd45a"; }
  function frame(t) {
    S.raf = 0;
    if (S.ext) { // potion arrow: slot -> pointer
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const to = { x: S.ptr.x, y: S.ptr.y };
      if (Math.hypot(to.x - S.ext.from.x, to.y - S.ext.from.y) > 30) drawArrow(S.ext.from, to, S.ext.col, !!S.enemyEl, t || 0);
      S.raf = requestAnimationFrame(frame); return;
    }
    const it = S.sel && byId(S.sel);
    if (!it || !o.needsTarget(it.inst)) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const a = it.rest || { x: size().w / 2, y: size().h - 300 };
    const dragPos = S.drag ? (S.drag.pos || { x: a.x, y: a.y }) : { x: a.x, y: a.y };
    const from = { x: dragPos.x, y: dragPos.y - CH * (portrait() ? 0.5 : HOVER) * 0.42 };
    let to = { x: S.ptr.x, y: S.ptr.y };
    const tgt = S.enemyEl; const over = !!tgt;
    if (S.tapTarget && tgt) { const r = tgt.getBoundingClientRect(); const p = stage.toStage(r.left + r.width / 2, r.top + r.height * 0.35); to = p; }
    if (Math.hypot(to.x - from.x, to.y - from.y) > 30) drawArrow(from, to, color(), over, t || 0);
    S.raf = requestAnimationFrame(frame);
  }
  function drawArrow(f, to, col, over, t) {
    const dx = to.x - f.x, dy = to.y - f.y, dist = Math.hypot(dx, dy);
    const c1 = { x: f.x + dx * 0.05, y: f.y - Math.min(260, 90 + dist * 0.35) };
    const c2 = { x: to.x - dx * 0.12, y: to.y - Math.min(200, 60 + dist * 0.2) };
    const pt = (u) => { const m = 1 - u; return { x: m * m * m * f.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * to.x, y: m * m * m * f.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * to.y }; };
    const end = pt(0.985), tail = pt(0.93), ang = Math.atan2(end.y - tail.y, end.x - tail.x);
    const main = over ? "#ff3b30" : col;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const path = () => { ctx.beginPath(); ctx.moveTo(f.x, f.y); for (let i = 1; i <= 36; i++) { const p = pt((i / 36) * 0.93); ctx.lineTo(p.x, p.y); } };
    ctx.setLineDash([26, 18]); ctx.lineDashOffset = -(t / 14);
    path(); ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 20; ctx.stroke();
    path(); ctx.strokeStyle = main; ctx.lineWidth = 12; ctx.shadowColor = main; ctx.shadowBlur = over ? 30 : 18; ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    const L = over ? 62 : 52, W = over ? 40 : 34;
    ctx.translate(end.x, end.y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(L * 0.55, 0); ctx.lineTo(-L * 0.45, -W); ctx.lineTo(-L * 0.2, 0); ctx.lineTo(-L * 0.45, W); ctx.closePath();
    ctx.fillStyle = main; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 6; ctx.shadowColor = main; ctx.shadowBlur = over ? 26 : 14; ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  const unResize = stage && stage.onResize ? stage.onResize(() => { sizeCanvas(); layout(); }) : null;
  sizeCanvas();

  const api = {
    set, draw, discard, exhaust, select, cancel, cancelSelection: cancel, layout, refresh: refreshAll,
    bounce(id) { const it = byId(id); if (it) ghost(it); }, // a played card that returns to hand (Throw): play-out now, set() flies a fresh one back in
    lock(b) {
      const was = S.locked; S.locked = !!b; layer.classList.toggle("is-locked", S.locked);
      // locking must not kill a drag in progress or a queued card (the fx window); end-turn / victory call cancel() themselves
      if (S.locked && !was && !S.drag && !S.down && !S.queued) cancel();
      if (!S.locked && S.queued) setTimeout(flushQueue, 0);
    },
    anchorOf(id) { const it = byId(id); return it && it.rest ? { x: it.rest.x, y: it.rest.y } : null; },
    elOf(id) { const it = byId(id); return it ? it.el : null; },
    selected: () => S.sel,
    aimFrom, aiming: () => !!S.ext,
    cards: () => items.map((it) => it.inst),
    cardElements: () => items.map((it) => it.el),
    hoverCard(uid) {
      if (S.drag || S.locked) return;
      S.hover = uid || null;
      layout();
      fireAim(null);
    },
    getHovered: () => S.hover,
    playSelected(targetUid) {
      const it = S.sel ? byId(S.sel) : (S.hover ? byId(S.hover) : null);
      if (!it) return false;
      return tryPlay(it, targetUid || null);
    },
    setAimTarget(uid) {
      const en = uid ? document.querySelector(`.sp-eplate[data-uid="${uid}"]`) : null;
      S.tapTarget = uid || null;
      setEnemyMark(en, "tap");
      if (en) {
        const r = en.getBoundingClientRect();
        const p = stage.toStage(r.left + r.width / 2, r.top + r.height * 0.35);
        S.ptr = { x: p.x, y: p.y, cx: r.left + r.width / 2, cy: r.top + r.height * 0.35 };
      }
    },
    toggleKeywordTip(force) {
      if (force === false || (force === undefined && kwtip.style.display !== "none")) {
        kwtip.style.display = "none";
      } else {
        const it = (S.sel && byId(S.sel)) || (S.hover && byId(S.hover));
        if (it) placeTip(it);
      }
    },
    destroy() {
      document.removeEventListener("pointermove", onDocMove, true); document.removeEventListener("pointerdown", onDocDown, true); document.removeEventListener("keydown", onKey);
      clearAim(); if (unResize) unResize(); layer.remove(); canvas.remove(); kwtip.remove();
    },
  };
  return api;
}
