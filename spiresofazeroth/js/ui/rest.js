// Campfire (one action) and the Moonglade hub (all actions: rest, trainer upgrade, vendor, zone well). Stage-native, fire on a canvas.
import { h, icon, toast, fill } from "./dom.js";
import { restHeal, upgradeableCards, upgradeCard, restZoneAction, trainerUpgrade, openHubShop, leaveScreen } from "../engine/run.js";
import { shopPanel } from "./shop.js";
import { upgradeOverlay, restOverlay } from "./restOverlay.js";
import { cssReady, btn, banner, plate } from "./kit.js";
import { runBar } from "./runbar.js";
import { mountCampfire } from "./campfire.js";

export const stageNative = true;

export async function render(app, name) {
  await cssReady;
  const { run, data, stage } = app;
  const pd = run.pending;
  const hub = name === "hub" || pd.hub;
  const zone = data.zone(hub ? pd.hubZone : run.zoneId);
  stage.setBackdrop((zone && zone.id) || run.zoneId || "default");
  const host = h("section", { class: `sx-screen sx-rest ${hub ? "sx-rest--hub" : ""}` });
  const spent = () => (hub ? false : pd.used.heal || pd.used.upgrade || pd.used.zone);
  let stopFire = null;
  const redraw = () => fill(host, ...build());

  const flare = (ms) => { host.classList.add("sx-rest--flare"); setTimeout(() => host.classList.remove("sx-rest--flare"), ms + 400); }; // the fire roars while a card is forged / the hero rests
  function upgradeModal(cost) {
    const ups = upgradeableCards(run, data);
    if (!ups.length) return toast("Nothing to upgrade.");
    upgradeOverlay(app, host, {
      title: cost ? `Train a spell (${cost} gold)` : "Upgrade a card", sub: cost ? "Learn the next rank of a spell." : "Choose a card to upgrade.", ups, flare,
      onConfirm: (idx) => { const done = cost ? trainerUpgrade(run, data, idx) : upgradeCard(run, idx); if (done) { app.save(); redraw(); } else toast("Cannot do that."); },
    });
  }

  function build() {
    if (stopFire) stopFire();
    const heal = Math.floor(run.maxHp * 0.3);
    const opts = h("div", { class: "sx-rest__opts" });
    const mk = (ic, title, text, fn, dis) => plate({ ic, title, text, onClick: fn, disabled: dis || spent(), size: "lg", cls: "sx-plate--big" });
    opts.append(
      mk("spell_holy_prayerofhealing", "Rest", `Heal ${heal} HP.`, () => restOverlay(app, host, { flare, onConfirm: () => { restHeal(run, data); app.save(); redraw(); } }), hub && pd.used.heal),
      mk("inv_misc_gear_01", hub ? "Class trainer" : "Upgrade", hub ? `Learn the next rank of a spell (${(zone.trainer || {}).upgradeCost || 75} gold).` : "Upgrade one card.", () => upgradeModal(hub ? (zone.trainer || {}).upgradeCost || 75 : 0), hub && (pd.used.trainer || run.gold < ((zone.trainer || {}).upgradeCost || 75))));
    if (zone && zone.rest) opts.append(mk(zone.rest.icon || "spell_nature_healingtouch", zone.rest.name || "Campfire", zone.rest.text || "", () => { restZoneAction(run, data); app.save(); redraw(); }, hub && pd.used.zone));
    const canvas = h("canvas", { class: "sx-rest__fire", width: 900, height: 560, "aria-hidden": "true" });
    const body = h("div", { class: "sx-rest__body" },
      banner(hub ? (zone ? zone.name : "Moonglade") : "Campfire", hub ? "A safe haven between acts. Do as much as you like." : spent() ? "You have rested." : "Choose one."),
      opts);
    if (hub && zone && zone.vendor) {
      body.append(h("div", { class: "sx-rest__vendor" }, h("h3", { class: "sx-ribbon sx-ribbon--gold" }, zone.vendor.name || "Vendor"), h("p", {}, zone.vendor.text || ""),
        shopPanel(app, openHubShop(run, data), redraw)));
    }
    const go = h("div", { class: `sx-rest__go ${hub ? "sx-rest__go--flow" : ""}` }, btn(hub ? "Continue the journey" : "Leave the fire", async (e) => { if (e && e.currentTarget) e.currentTarget.disabled = true; await leaveScreen(run, data); app.save(); app.route(); }, { size: "lg", auto: true }));
    if (hub) body.append(go);
    queueMicrotask(() => { stopFire = mountCampfire(canvas, { reduced: () => app.reduced(), paused: () => stage.paused }); });
    return [runBar(app), h("div", { class: "sx-rest__glow", "aria-hidden": "true" }), canvas, body, hub ? null : go];
  }
  redraw();
  return host;
}
