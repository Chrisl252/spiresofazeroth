// Vendor screen (stage-native) + the reusable goods table (the Moonglade hub embeds shopPanel).
// A goblin merchant stands left (js/ui/shopVendor.js: model + classic voice lines); the stock lies on a dark wood table right.
// No Buy buttons: clicking a ware buys it. Styling: css/shop.css.
import { h, icon, qClass, toast, fill, esc, overlayHost } from "./dom.js?v=20261029a";
import { buy, buyRemoval, leaveNode } from "../engine/run.js?v=20261029a";
import { cssReady, btn, dark, ico, cardSlot, stageModal, tip } from "./kit.js?v=20261029a";
import { runBar } from "./runbar.js?v=20261029a";
import { mountVendor } from "./shopVendor.js?v=20261029a";
import { sfx } from "../audio.js?v=20261029a";

export const stageNative = true;

const price = (n, afford) => h("span", { class: `sx-price ${afford ? "" : "short"}`.trim() }, icon("inv_misc_coin_01", "sx-price__i", ""), String(n));

// Fly a small icon tile from a ware to a target on the run bar (screen px; the stage is CSS-scaled so use fixed coords).
function fly(from, slug, toSel) {
  try {
    const to = document.querySelector(toSel) || document.querySelector(".sx-bar");
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const sz = Math.max(36, Math.min(a.width, a.height, 90));
    const el = h("div", { class: "sx-fly" }, icon(slug, "", ""));
    Object.assign(el.style, { left: `${a.left + a.width / 2 - sz / 2}px`, top: `${a.top + a.height / 2 - sz / 2}px`, width: `${sz}px`, height: `${sz}px` });
    overlayHost().append(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const an = el.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 70}px) scale(1.15)`, opacity: 1, offset: 0.45 }, { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: 0.2 }], { duration: 650, easing: "cubic-bezier(.4,.1,.3,1)" });
    an.onfinish = () => el.remove(); setTimeout(() => el.remove(), 900);
  } catch (e) { /* cosmetic */ }
}

// hooks: { onBuy(kind, el), onDeny(kind) } (optional; the hub passes none)
export function shopPanel(app, shop, redraw, hooks = {}) {
  const { run, data } = app;
  const act = (kind, i, it, el, slug, target) => {
    if (shop.sold[`${kind}${i}`]) return;
    if (run.gold < it.price) { el.classList.remove("deny"); void el.offsetWidth; el.classList.add("deny"); if (hooks.onDeny) hooks.onDeny("gold"); else toast("Not enough gold."); return; }
    if (buy(run, data, kind, i)) {
      sfx.play("coinSmall"); fly(el, slug, target);
      if (hooks.onBuy) hooks.onBuy(kind, el);
      app.save(); setTimeout(redraw, 120);
    } else { if (hooks.onDeny) hooks.onDeny("full"); toast(kind === "potion" ? "Your potion belt is full." : "Cannot buy that."); }
  };
  const ware = (kind, i, it, inner, slug, target, cls = "") => {
    const sold = !!shop.sold[`${kind}${i}`], afford = run.gold >= it.price;
    const el = h("div", { class: `sx-ware ${cls} ${sold ? "sold" : ""} ${afford ? "" : "short"}`.trim(), role: "button", tabindex: sold ? "-1" : "0", "aria-disabled": sold ? "true" : "false" },
      inner, h("div", { class: "sx-ware__tag" }, sold ? h("span", { class: "sx-sold" }, "SOLD") : price(it.price, afford)));
    if (!sold) {
      el.addEventListener("click", () => act(kind, i, it, el, slug, target));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(kind, i, it, el, slug, target); } });
    }
    return el;
  };
  const cards = shop.cards.map((it, i) => {
    const def = app.cardDef(it.id, false);
    return ware("card", i, it, cardSlot(def, { tag: "div", cls: "sp-card--static", data }, { cls: "sx-cardslot--shop", lift: false }), def.icon || "inv_misc_questionmark", ".sx-bar__deck", "sx-ware--card");
  });
  const relics = shop.relics.map((it, i) => {
    const r = data.relic(it.id) || { name: it.id, text: "" };
    const inner = h("div", { class: "sx-ware__ico" }, ico(r.icon, { size: "lg", q: qClass(r.rarity) }));
    tip(inner, `<b>${esc(r.name)}</b><br>${esc(r.text)}`);
    return ware("relic", i, it, h("div", { class: "sx-ware__body" }, inner, h("b", { class: qClass(r.rarity) }, r.name)), r.icon, ".sx-bar .gs-strip, .sx-bar__strip");
  });
  const pots = shop.potions.map((it, i) => {
    const p = data.potion(it.id) || { name: it.id, text: "" };
    const inner = h("div", { class: "sx-ware__ico" }, ico(p.icon, { size: "lg" }));
    tip(inner, `<b>${esc(p.name)}</b><br>${esc(p.text)}`);
    return ware("potion", i, it, h("div", { class: "sx-ware__body" }, inner, h("b", {}, p.name)), p.icon, ".sx-bar__pots");
  });
  // card removal service
  const rmSold = !!shop.removed, rmAfford = run.gold >= shop.removePrice;
  const rm = h("div", { class: `sx-ware sx-ware--service ${rmSold ? "sold" : ""} ${rmAfford ? "" : "short"}`.trim(), role: "button", tabindex: rmSold ? "-1" : "0" },
    h("div", { class: "sx-ware__body" }, h("div", { class: "sx-ware__ico" }, ico("inv_misc_bone_01", { size: "lg" })), h("b", {}, "Remove a card"), h("small", {}, "Thin your deck for good.")),
    h("div", { class: "sx-ware__tag" }, rmSold ? h("span", { class: "sx-sold" }, "USED") : price(shop.removePrice, rmAfford)));
  if (!rmSold) {
    const go = () => {
      if (!rmAfford) { rm.classList.remove("deny"); void rm.offsetWidth; rm.classList.add("deny"); if (hooks.onDeny) hooks.onDeny("gold"); else toast("Not enough gold."); return; }
      const close = stageModal(app, "Choose a card to remove", pick(app, (idx) => { if (buyRemoval(run, idx)) { sfx.play("coinSmall"); close(); app.save(); redraw(); } }));
    };
    rm.addEventListener("click", go);
    rm.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  }
  const shelf = (title, kids, cls = "") => h("section", { class: `sx-shelf ${cls}`.trim() }, h("h3", { class: "sx-shelf__title" }, title), h("div", { class: "sx-shelf__row" }, ...kids));
  return dark("sx-table", shelf("Cards", cards, "sx-shelf--cards"),
    h("div", { class: "sx-table__low" }, shelf("Relics", relics), shelf("Potions", pots), shelf("Services", [rm])));
}

export function pick(app, onPick, filter = () => true) {
  const wrap = h("div", { class: "sx-pickgrid" });
  app.run.deck.forEach((c, i) => {
    if (!filter(c, i)) return;
    wrap.append(cardSlot(app.cardDef(c.id, c.up), { cls: "sp-card--pick", onClick: () => onPick(i) }, { cls: "sx-cardslot--pick" }));
  });
  return wrap;
}

// Merchant host: the goblin model is mounted over #shop-vendor; clicking him replays a greeting.
export function vendorHost(name, line) {
  return h("div", { id: "shop-vendor", class: "sx-vendor", role: "button", tabindex: "0", "aria-label": `${name}: talk` },
    h("div", { class: "sx-vendor__plate" }, ico("inv_misc_bag_10", { size: "xl" })),
    h("div", { class: "sx-vendor__name" }, h("b", {}, name), h("small", {}, line)));
}

// css/shop.css is linked from index.html; this guard covers a screen reached before that link resolves (tests, embeds).
function shopCss() {
  const href = new URL("../../css/shop.css", import.meta.url).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /css\/shop\.css/.test(l.href))) return Promise.resolve();
  return new Promise((res) => { const l = h("link", { rel: "stylesheet", href }); l.onload = l.onerror = () => res(); document.head.append(l); });
}

export async function render(app) {
  await Promise.all([cssReady, shopCss()]);
  const { run, data, stage } = app;
  stage.setBackdrop(run.zoneId || "default");
  const zone = data.zone(run.zoneId);
  const name = (zone && zone.vendor && zone.vendor.name) || "Goblin Merchant";
  const host = h("section", { class: "sx-screen sx-shop" });
  let voice = null, said = false, bar = runBar(app);
  const hooks = { onDeny: () => { if (voice) voice.say("pissed"); } };
  const table = h("div", { class: "sx-shop__right" });
  const vendor = vendorHost(name, "Prices are fixed for this visit.");
  const proceed = btn("Proceed", async () => {
    if (voice) voice.say("farewell");
    await leaveNode(run, data); app.save(); app.route();
  }, { size: "lg", auto: true });
  const foot = h("div", { class: "sx-shop__foot" }, proceed);
  const redraw = () => {
    const nb = runBar(app); if (bar && nb) bar.replaceWith(nb); bar = nb;
    table.replaceChildren(shopPanel(app, run.pending.shop, redraw, hooks), foot);
  };
  table.append(shopPanel(app, run.pending.shop, redraw, hooks), foot);
  fill(host, bar, h("div", { class: "sx-shop__main" }, h("aside", { class: "sx-shop__left" }, vendor), table));
  const greet = () => { if (!voice || said) return; said = true; voice.say("greeting"); };
  const talkTo = () => { if (voice) voice.say("greeting"); };
  vendor.addEventListener("click", talkTo);
  vendor.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); talkTo(); } });
  setTimeout(async () => {
    voice = await mountVendor(app, vendor, host);
    // browsers block audio before the first user gesture: wait for one if none has happened yet
    const active = !(navigator.userActivation) || navigator.userActivation.hasBeenActive;
    if (active) greet(); else document.addEventListener("pointerdown", greet, { once: true, capture: true });
  }, 160);
  return host;
}
