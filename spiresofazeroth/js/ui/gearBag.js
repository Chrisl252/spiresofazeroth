// The Backpack (WoW bag window, owner brick 11-01): an icon grid of the stored gear with quality borders, a detail pane for the
// picked item (Equip per socket, Sell at a vendor) and the purse at the foot. Toggle: the run-bar Bag button or the B key.
// There is no destroy: a piece leaves the bag only by being worn or sold, and a sold piece never drops again (engine/gear.js owns()).
import { equip, isStarter, keysFor, sellGear, sellPrice, slotOf, SLOT_LABEL, syncSetBonuses } from "../engine/gear.js";
import { esc, h, icon, qClass, tip } from "./dom.js";
import { btn, cssReady, stageModal } from "./kit.js";
import { compareTip } from "./gearStrip.js";
import { autoEquipSelect, AUTO_EQUIP_HINT } from "./autoEquip.js";
import { sfx } from "../audio.js";

const COLS = 4, MIN_SLOTS = 16; // a 16-slot backpack look; it grows a row at a time (no space limit: owner ruling 11-01)
let openClose = null;            // the open window's close(), so B toggles it
let opening = false;             // guards the async open against a double press
// 11-02 report "can't open the bags, had to relaunch": a screen change can rip the modal out of the DOM without calling its close(),
// leaving openClose set forever (B toggled a dead close, the Bag button returned early). openClose only counts while its window is in the DOM.
const bagWindow = () => document.querySelector(".sx-modal-back[aria-label^='Backpack']");
const bagIsOpen = () => { if (openClose && !bagWindow()) openClose = null; return !!openClose; };

// A vendor is open on the vendor node and in the act hub (Moonglade embeds the shop panel).
export function atVendor(app) {
  const run = app.run;
  if (!run) return false;
  if (run.screen === "vendor") return true;
  const zone = run.screen === "hub" && run.zoneId && app.data.zone(run.zoneId);
  return !!(zone && zone.vendor);
}

// The B key: installed once (runbar.js calls it on every bar draw; the guard keeps it single).
let keyApp = null;
export function installBagKey(app) {
  if (keyApp) { keyApp = app; return; }
  keyApp = app;
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "b" && e.key !== "B") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    const a = keyApp;
    if (!a || !a.run || a.run.screen === "end") return;
    if (bagIsOpen()) { try { openClose(); } catch (err) { openClose = null; } return; }
    if (document.querySelector(".sx-modal-back")) return; // another window is up
    e.preventDefault();
    openGearBag(a);
  });
}

export async function openGearBag(app) {
  if (opening || bagIsOpen()) return;
  opening = true;
  try { await buildGearBag(app); }
  catch (err) { openClose = null; const w = bagWindow(); if (w) w.remove(); console.error("Backpack failed to open", err); }
  finally { opening = false; }
}

async function buildGearBag(app) {
  try { await cssReady; } catch (e) { /* styles are cosmetic: open anyway */ }
  const { run, data } = app;
  if (!run) return;
  if (!Array.isArray(run.gearBag)) run.gearBag = [];
  const vendor = atVendor(app);
  const locked = run.screen === "combat"; // view-only mid-fight: swapping gear would change relics while the fight runs
  let pick = run.gearBag[0] || null, changed = false, close = () => {};

  const body = h("div", { class: "gs-bag" });
  const refresh = () => {
    body.replaceChildren();
    if (pick && !run.gearBag.includes(pick)) pick = run.gearBag[0] || null;
    // the "New gear" setting lives here too, right where a player notices a swap they did not want
    const hint = h("p", { class: "gs-bag__hint" }, AUTO_EQUIP_HINT[app.meta.settings.autoEquip || "smart"]);
    body.append(h("div", { class: "gs-bag__pref" }, h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "New gear"),
      autoEquipSelect(app, (v) => { hint.textContent = AUTO_EQUIP_HINT[v]; })), hint));

    const grid = h("div", { class: "gs-bag__grid", style: { "--cols": COLS } });
    const n = Math.max(MIN_SLOTS, Math.ceil((run.gearBag.length + 1) / COLS) * COLS);
    for (let i = 0; i < n; i++) {
      const id = run.gearBag[i], item = id && data.relic(id);
      if (!item) { grid.append(h("span", { class: "gs-bag__slot gs-bag__slot--empty", "aria-hidden": "true" })); continue; }
      const cell = h("button", { class: `gs-bag__slot ${qClass(item.rarity)} ${id === pick ? "is-pick" : ""}`.trim(), type: "button", "aria-label": item.name, "aria-pressed": id === pick ? "true" : "false" },
        icon(item.icon, "", item.name));
      tip(cell, () => compareTip(item, run, data, vendor ? `<span style="color:#ffd45a">Sells for ${sellPrice(data, id)} gold (right-click).</span><br>` : ""));
      cell.addEventListener("click", () => { pick = id; refresh(); });
      cell.addEventListener("contextmenu", (e) => { e.preventDefault(); pick = id; if (locked) return; if (vendor) sell(id)(); else wear(id, null)(); }); // WoW right-click: sell at a vendor, else use (equip into the best socket)
      grid.append(cell);
    }
    const purse = h("div", { class: "gs-bag__purse" }, icon("inv_misc_coin_01", "", ""), h("b", {}, run.gold));
    const frame = h("div", { class: "gs-bag__frame" }, h("div", { class: "gs-bag__title" }, icon("inv_misc_bag_08", "", ""), h("span", {}, "Backpack")), grid, purse);
    body.append(h("div", { class: "gs-bag__main" }, frame, detail()));
  };

  const detail = () => {
    const pane = h("div", { class: "gs-bag__detail" });
    const item = pick && data.relic(pick);
    if (!item) {
      pane.append(h("p", { class: "gs-bag__empty" }, run.gearBag.length ? "Pick an item." : "Your backpack is empty. Gear you take off, and new gear that would replace what you wear, waits here."));
      return pane;
    }
    const keys = keysFor(slotOf(item));
    const wornNames = keys.map((k) => run.gear && run.gear[k] && data.relic(run.gear[k])).filter(Boolean)
      .map((w) => h("b", { class: isStarter(w.id) ? "" : qClass(w.rarity) }, w.name));
    const vs = wornNames.length ? h("span", { class: "gs-bag__vs" }, "Worn: ", ...wornNames.flatMap((x, i) => (i ? [" / ", x] : [x])))
      : h("span", { class: "gs-bag__vs gs-bag__vs--free" }, "Slot is empty");
    // paired sockets (trinket1/2, finger1/2): one button per socket so the player picks which one to swap
    const buttons = keys.length < 2 ? [btn("Equip", wear(pick, null), { size: "sm", cls: "gs-bag__equip" })]
      : keys.map((k, i) => {
        const cur = run.gear && run.gear[k] ? data.relic(run.gear[k]) : null;
        const b = btn(`Equip ${i + 1}`, wear(pick, k), { size: "sm", cls: "gs-bag__equip" });
        tip(b, cur ? `Swap with <b>${esc(cur.name)}</b> (${SLOT_LABEL[k]} ${i + 1})` : `${SLOT_LABEL[k]} ${i + 1} is empty`);
        return b;
      });
    if (locked) buttons.length = 0;
    if (vendor && !locked) buttons.push(btn(`Sell ${sellPrice(data, pick)}g`, sell(pick), { size: "sm", cls: "gs-bag__sell" }));
    const head = h("div", { class: "gs-bag__dhead" }, icon(item.icon, "", item.name), h("div", {}, h("b", { class: qClass(item.rarity) }, item.name), h("span", {}, SLOT_LABEL[item.slot] || "Gear")));
    tip(head, () => compareTip(item, run, data));
    pane.append(head, h("p", {}, item.text || ""), vs,
      h("p", { class: "gs-bag__note" }, locked ? "You can't change gear in combat. Win the fight, then equip it." : vendor ? "Stored items give no effects until worn. A sold item never drops again this run." : "Stored items give no effects until worn. Sell spare gear at a vendor."),
      h("div", { class: "gs-bag__btns" }, ...buttons));
    return pane;
  };

  const wear = (id, at) => () => {
    if (!equip(run, data, id, at)) return;
    syncSetBonuses(run, data);
    changed = true;
    app.save();
    close();
  };
  const sell = (id) => () => {
    if (!sellGear(run, data, id)) return;
    sfx.play("coinSmall", { volume: 0.6 });
    changed = true;
    app.save();
    refresh();
    setTitle();
  };

  const setTitle = () => { const t = document.querySelector(".sx-modal-back[aria-label^='Backpack'] .sx-modal__head h3"); if (t) t.textContent = `Backpack (${run.gearBag.length})`; };
  const shut = stageModal(app, `Backpack (${run.gearBag.length})`, body, {
    onClose: () => { openClose = null; if (changed && app.run === run) app.go(run.screen); },
  });
  close = () => { try { shut(); } finally { openClose = null; } };
  openClose = close;
  refresh();
}
