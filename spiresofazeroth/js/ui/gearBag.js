import { equip, SLOT_LABEL, syncSetBonuses } from "../engine/gear.js";
import { h, icon, qClass, tip } from "./dom.js";
import { btn, cssReady, stageModal } from "./kit.js";
import { gearTip } from "./gearStrip.js";

export async function openGearBag(app) {
  await cssReady;
  const { run, data } = app;
  if (!run) return;
  if (!Array.isArray(run.gearBag)) run.gearBag = [];

  const body = h("div", { class: "gs-bag" });
  const refresh = () => {
    body.replaceChildren();
    if (!run.gearBag.length) {
      body.append(h("p", { class: "gs-bag__empty" }, "Your gear bag is empty. Replaced gear will be kept here."));
      return;
    }
    body.append(h("p", { class: "gs-bag__note" }, "Stored items do not provide effects until equipped."));
    for (const id of run.gearBag) {
      const item = data.relic(id);
      if (!item) continue;
      const info = h("div", { class: "gs-bag__info" },
        h("b", { class: qClass(item.rarity) }, item.name),
        h("span", {}, SLOT_LABEL[item.slot] || "Gear"),
        h("p", {}, item.text || ""));
      const image = icon(item.icon, "", item.name);
      tip(image, gearTip(item, run, data));
      const equipButton = btn("Equip", () => {
        if (!equip(run, data, id)) return;
        syncSetBonuses(run, data);
        changed = true;
        app.save();
        close();
      }, { size: "sm", cls: "gs-bag__equip" });
      body.append(h("article", { class: "gs-bag__item" }, image, info, equipButton));
    }
  };

  let changed = false, close = () => {};
  close = stageModal(app, `Gear Bag (${run.gearBag.length})`, body, {
    onClose: () => { if (changed && app.run === run) app.go(run.screen); },
  });
  refresh();
}
