// The "New gear" setting: one select, shown in the Escape menu (pauseExtras.js) and at the top of the Gear Bag (gearBag.js).
// Persists in app.meta.settings.autoEquip and drives engine/gear.js goesToBag (fight drops, loot, shop, events). Player request 10-25.
import { h } from "./dom.js?v=20261028e";
import { setAutoEquip } from "../engine/gear.js?v=20261028e";

export const AUTO_EQUIP_LABELS = [
  ["smart", "Empty slots only"],
  ["always", "Always equip"],
  ["never", "Never (Gear Bag)"],
];
export const AUTO_EQUIP_HINT = {
  smart: "New gear fills empty or starter slots. Anything else waits in your Gear Bag, so your worn gear stays on.",
  always: "New gear is put on right away. What it replaces goes to your Gear Bag.",
  never: "All new gear goes to your Gear Bag. Equip pieces yourself from the bag.",
};

// boot: replay the saved choice into the engine (main.js)
export const applyAutoEquip = (app) => setAutoEquip(app.meta.settings.autoEquip);

export function autoEquipSelect(app, onChange = () => {}) {
  const cur = app.meta.settings.autoEquip || "smart";
  return h("select", { class: "pm-select", "aria-label": "New gear", title: AUTO_EQUIP_HINT[cur],
    onChange: (e) => {
      app.meta.settings.autoEquip = e.target.value;
      setAutoEquip(e.target.value);
      e.target.title = AUTO_EQUIP_HINT[e.target.value];
      app.save();
      onChange(e.target.value);
    } },
    ...AUTO_EQUIP_LABELS.map(([v, l]) => h("option", { value: v, ...(v === cur ? { selected: "" } : {}) }, l)));
}
