import { equip, isStarter, keysFor, slotOf, SLOT_LABEL, syncSetBonuses } from "../engine/gear.js";
import { esc, h, icon, qClass, tip } from "./dom.js";
import { btn, cssReady, stageModal } from "./kit.js";
import { compareTip } from "./gearStrip.js";
import { autoEquipSelect, AUTO_EQUIP_HINT } from "./autoEquip.js";

export async function openGearBag(app) {
  await cssReady;
  const { run, data } = app;
  if (!run) return;
  if (!Array.isArray(run.gearBag)) run.gearBag = [];

  const body = h("div", { class: "gs-bag" });
  const refresh = () => {
    body.replaceChildren();
    // the "New gear" setting lives here too, right where a player notices a swap they did not want
    const hint = h("p", { class: "gs-bag__hint" }, AUTO_EQUIP_HINT[app.meta.settings.autoEquip || "smart"]);
    body.append(h("div", { class: "gs-bag__pref" }, h("label", { class: "pm-row" }, h("span", { class: "pm-lab" }, "New gear"),
      autoEquipSelect(app, (v) => { hint.textContent = AUTO_EQUIP_HINT[v]; })), hint));
    if (!run.gearBag.length) {
      body.append(h("p", { class: "gs-bag__empty" }, "Your gear bag is empty. Gear you take off, and new gear that would replace what you wear, waits here."));
      return;
    }
    body.append(h("p", { class: "gs-bag__note" }, "Stored items do not provide effects until equipped. Hover an item to compare it with what you wear."));
    for (const id of run.gearBag) {
      const item = data.relic(id);
      if (!item) continue;
      const keys = keysFor(slotOf(item));
      const wornNames = keys.map((k) => run.gear && run.gear[k] && data.relic(run.gear[k])).filter(Boolean)
        .map((w) => h("b", { class: isStarter(w.id) ? "" : qClass(w.rarity) }, w.name));
      const vs = wornNames.length ? h("span", { class: "gs-bag__vs" }, "Worn: ", ...wornNames.flatMap((n, i) => (i ? [" / ", n] : [n])))
        : h("span", { class: "gs-bag__vs gs-bag__vs--free" }, "Slot is empty");
      const info = h("div", { class: "gs-bag__info" },
        h("b", { class: qClass(item.rarity) }, item.name),
        h("span", {}, SLOT_LABEL[item.slot] || "Gear"),
        h("p", {}, item.text || ""), vs);
      const image = icon(item.icon, "", item.name);
      const art = h("article", { class: "gs-bag__item" });
      const cmp = compareTip(item, run, data);
      tip(image, cmp); tip(info, cmp);
      const wear = (at) => () => {
        if (!equip(run, data, id, at)) return;
        syncSetBonuses(run, data);
        changed = true;
        app.save();
        close();
      };
      // paired sockets (trinket1/2, finger1/2): one button per socket so the player picks which one to swap
      const buttons = keys.length < 2 ? [btn("Equip", wear(null), { size: "sm", cls: "gs-bag__equip" })]
        : keys.map((k, i) => {
          const cur = run.gear && run.gear[k] ? data.relic(run.gear[k]) : null;
          const b = btn(`Equip ${i + 1}`, wear(k), { size: "sm", cls: "gs-bag__equip" });
          tip(b, cur ? `Swap with <b>${esc(cur.name)}</b> (${SLOT_LABEL[k]} ${i + 1})` : `${SLOT_LABEL[k]} ${i + 1} is empty`);
          return b;
        });
      art.append(image, info, h("div", { class: "gs-bag__btns" }, ...buttons));
      body.append(art);
    }
  };

  let changed = false, close = () => {};
  close = stageModal(app, `Gear Bag (${run.gearBag.length})`, body, {
    onClose: () => { if (changed && app.run === run) app.go(run.screen); },
  });
  refresh();
}
