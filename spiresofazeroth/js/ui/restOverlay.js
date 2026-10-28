// Campfire overlays, Slay-the-Spire style: full-screen dim, the whole deck as a grid of real cards, hover = upgraded version beside it, click = confirm (before -> after), then the fire flares.
//   upgradeOverlay(app, host, { title, ups:[{c,i}], onConfirm(i)->bool, flare(ms) })   restOverlay(app, host, { onConfirm()->amt, flare(ms) })
// Both append one .sx-up layer to `host` (the rest screen) and remove it on Back / Esc / after the flare.
import { h, icon } from "./dom.js?v=20261028e";
import { btn, cardSlot, banner } from "./kit.js?v=20261028e";
import { heroicMods } from "../engine/heroic.js?v=20261028e";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shell(host, title, sub, onBack) {
  const layer = h("div", { class: "sx-up", role: "dialog", "aria-modal": "true", "aria-label": title });
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); back(); } };
  const close = () => { document.removeEventListener("keydown", key, true); layer.remove(); };
  const back = () => { close(); if (onBack) onBack(); };
  document.addEventListener("keydown", key, true);
  const head = h("div", { class: "sx-up__head" }, banner(title, sub), btn("Back", back, { size: "sm", cls: "sx-up__back" }));
  layer.append(head);
  host.append(layer);
  return { layer, close, head };
}

export function upgradeOverlay(app, host, { title = "Upgrade a card", sub = "Choose a card to upgrade.", ups, onConfirm, flare }) {
  const { run } = app;
  const ok = new Map(ups.map((u) => [u.i, u]));
  const n = run.deck.length;
  const cs = n <= 12 ? 0.84 : n <= 20 ? 0.64 : n <= 30 ? 0.5 : 0.4; // the whole deck fits the stage without a visible scrollbar
  const { layer, close } = shell(host, title, sub);
  layer.classList.add("sx-up--pick");
  layer.style.setProperty("--ucs", cs);
  const grid = h("div", { class: "sx-up__grid" });
  const prev = h("div", { class: "sx-up__prev" }, h("p", { class: "sx-up__hint" }, "Hover a card to preview its upgrade."));
  const pairEl = (i, big) => {
    const c = run.deck[i];
    const mk = (up, tag) => h("div", { class: `sx-up__side ${up ? "is-after" : "is-before"}` }, h("h4", {}, tag), cardSlot(app.cardDef(c.id, up), { cls: "sp-card--pick" }, { lift: false, cls: big ? "sx-cardslot--big" : "sx-cardslot--prev" }));
    return h("div", { class: "sx-up__pair" }, mk(false, "Now"), h("span", { class: "sx-up__arrow", "aria-hidden": "true" }, ""), mk(true, "Upgraded"));
  };
  const show = (i) => { prev.replaceChildren(ok.has(i) ? pairEl(i, false) : h("p", { class: "sx-up__hint" }, run.deck[i].up ? "Already upgraded." : "This card cannot be upgraded.")); };
  run.deck.forEach((c, i) => {
    const can = ok.has(i);
    const slot = cardSlot(app.cardDef(c.id, c.up), { cls: "sp-card--pick", onClick: () => can && confirm(i) }, { lift: can, cls: `sx-cardslot--ug ${can ? "" : "is-no"}` });
    slot.tabIndex = can ? 0 : -1;
    slot.addEventListener("pointerenter", () => show(i)); slot.addEventListener("focus", () => show(i));
    slot.addEventListener("keydown", (e) => { if (can && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); confirm(i); } });
    grid.append(slot);
  });
  layer.append(h("div", { class: "sx-up__body" }, grid, prev));

  function confirm(i) {
    const box = h("div", { class: "sx-up__confirm" });
    let busy = false;
    const done = async () => {
      if (busy) return; busy = true; // a double-click must not upgrade twice
      box.classList.add("is-forging");
      box.replaceChildren(h("div", { class: "sx-up__side is-after is-forge" }, cardSlot(app.cardDef(run.deck[i].id, true), {}, { lift: false, cls: "sx-cardslot--big" })), h("p", { class: "sx-up__done" }, "Upgraded!"));
      layer.classList.add("is-flaring");
      if (flare) flare(app.reduced() ? 0 : 1100);
      await sleep(app.reduced() ? 0 : 1100);
      close();
      onConfirm(i);
    };
    box.append(h("h3", {}, "Upgrade this card?"), pairEl(i, true), h("div", { class: "sx-up__btns" }, btn("Upgrade", done, { size: "lg", auto: true }), btn("Back", () => box.remove(), { size: "sm" })));
    layer.append(box);
  }
  return close;
}

export function restOverlay(app, host, { onConfirm, flare }) {
  const { run } = app;
  const amt = Math.floor(run.maxHp * 0.3 * heroicMods(run.heroic).healMult);
  const after = Math.min(run.maxHp, run.hp + amt);
  const { layer, close } = shell(host, "Rest", "Sit by the fire and recover.");
  const bar = (v, cls) => h("div", { class: `sx-up__hp ${cls}` }, h("i", { style: { width: `${Math.round((v / Math.max(1, run.maxHp)) * 100)}%` } }), h("span", {}, `${v} / ${run.maxHp}`));
  const box = h("div", { class: "sx-up__confirm sx-up__confirm--rest" },
    h("div", { class: "sx-up__restico" }, icon("spell_holy_prayerofhealing", "", "Rest")),
    h("h3", {}, `Heal ${after - run.hp} HP`),
    h("div", { class: "sx-up__pair sx-up__pair--hp" }, h("div", { class: "sx-up__side" }, h("h4", {}, "Now"), bar(run.hp, "is-before")), h("span", { class: "sx-up__arrow", "aria-hidden": "true" }, ""), h("div", { class: "sx-up__side" }, h("h4", {}, "After resting"), bar(after, "is-after"))),
    h("div", { class: "sx-up__btns" }, btn("Rest", async () => {
      if (box.classList.contains("is-forging")) return; // a double-click must not heal twice
      layer.classList.add("is-flaring"); box.classList.add("is-forging");
      if (flare) flare(app.reduced() ? 0 : 1100);
      await sleep(app.reduced() ? 0 : 1100);
      close(); onConfirm();
    }, { size: "lg", auto: true }), btn("Back", close, { size: "sm" })));
  layer.append(box);
  return close;
}
