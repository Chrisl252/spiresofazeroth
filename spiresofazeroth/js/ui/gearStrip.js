// Gear strip (GEAR_SPEC section 5): 16 sockets in paper-doll order (empty ones dim, filled ones show the icon + tooltip) and the set badge.
// ONE call site per bar:  gearStrip(app)  -> element.   Shared bits for loot.js / codex.js / gearBag.js: gearCss, gearTip, compareTip, socket.
import { h, icon, tip, esc, qClass } from "./dom.js?v=20261029d";
import { PAPERDOLL, SLOT_LABEL, worn, setInfo, isStarter, keysFor, slotOf } from "../engine/gear.js?v=20261029d";

export const gearCss = new Promise((res) => {
  const href = new URL("../../css/gear.css", import.meta.url).href;
  if (typeof document === "undefined" || document.querySelector(`link[href="${href}"]`)) return res();
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.onload = l.onerror = () => res();
  document.head.append(l);
});

const EMPTY_ICON = { head: "inv_helmet_01", neck: "inv_jewelry_necklace_01", shoulder: "inv_shoulder_01", back: "inv_misc_cape_01", chest: "inv_chest_cloth_01", wrist: "inv_bracer_01",
  hands: "inv_gauntlets_01", waist: "inv_belt_01", legs: "inv_pants_01", feet: "inv_boots_01", finger1: "inv_jewelry_ring_01", finger2: "inv_jewelry_ring_01",
  trinket1: "inv_jewelry_trinket_01", trinket2: "inv_jewelry_trinket_01", mainHand: "inv_sword_01", offHand: "inv_shield_01" };

// Tooltip html for one piece (+ set progress when it belongs to the worn set).
export function gearTip(r, run, data) {
  const q = `style="color:var(--q-${r.rarity || "common"})"`;
  let s = `<b ${q}>${esc(r.name)}</b><br><span class="gs-tip__slot">${esc(SLOT_LABEL[r.slot] || "")}${r.tier >= 1 ? " &middot; Tier 1" : ""}${r.upgrade ? " &middot; Upgraded" : ""}</span><br>${esc(r.text || "")}`;
  if (r.set && run) {
    const si = setInfo(run, data);
    if (si.set && si.set.id === r.set) {
      s += `<br><span class="gs-tip__set">${esc(si.set.name)} (${si.count}/${si.size})</span>`;
      for (const b of si.bonuses) s += `<br><span class="${b.active ? "gs-on" : "gs-off"}">(${b.pieces}) ${esc(b.name)}: ${esc(b.text)}</span>`;
    }
  }
  return s;
}

// Tooltip for a NEW piece next to what the player wears in that slot (both sockets for rings / trinkets), so a swap is an informed choice.
export function compareTip(r, run, data, lead = "") {
  let s = lead + gearTip(r, run, data);
  const keys = keysFor(slotOf(r)).filter((k) => run && run.gear && run.gear[k] && run.gear[k] !== r.id);
  for (const k of keys) {
    const cur = data.relic(run.gear[k]);
    if (!cur) continue;
    s += `<hr class="gs-tip__hr"><span class="gs-tip__worn">Currently worn${keys.length > 1 ? ` (${esc(SLOT_LABEL[k])} ${k.endsWith("2") ? 2 : 1})` : ""}</span><br>`;
    s += isStarter(cur.id) ? `<b style="color:var(--q-common)">${esc(cur.name)}</b><br><span class="gs-tip__slot">Starter, no effect</span>` : gearTip(cur, run, data);
  }
  return s;
}

// One socket element. `flash` plays the gold equip pulse (reduced motion is handled in css).
export function socket(key, r, { run, data, flash = false, size = "" } = {}) {
  const el = h("span", { class: `gs-sock ${r ? `gs-sock--on ${qClass(r.rarity)}` : "gs-sock--off"} ${r && r.upgrade ? "gs-sock--up" : ""} ${flash ? "gs-sock--flash" : ""} ${size}`.trim(),
    tabindex: r ? "0" : "-1", "data-slot": key, "aria-label": r ? `${SLOT_LABEL[key]}: ${r.name}` : `${SLOT_LABEL[key]}: empty` }, icon(r ? r.icon : EMPTY_ICON[key], "", r ? r.name : ""));
  if (r) tip(el, gearTip(r, run, data));
  else tip(el, `<b style="color:#8a7b5a">${esc(SLOT_LABEL[key])}</b><br>Empty. Win fights to find gear.`);
  return el;
}

export function gearStrip(app, { flash = null, badge = true, compact = false } = {}) {
  const { run, data } = app;
  const si = setInfo(run, data);
  const wrap = h("div", { class: `gs-strip${compact ? " gs-strip--bar" : ""}`, role: "group", "aria-label": "Equipped gear" });
  const row = h("div", { class: "gs-row" });
  for (const { key, r } of worn(run, data)) row.append(socket(key, r, { run, data, flash: flash === key }));
  wrap.append(row);
  if (badge && si.set) {
    const next = si.next;
    const b = h("div", { class: `gs-badge ${si.count >= si.size ? "gs-badge--full" : ""}`, tabindex: "0" }, h("b", {}, si.set.name), h("span", {}, `${si.count}/${si.size}`));
    tip(b, `<b style="color:var(--q-epic)">${esc(si.set.name)} (${si.count}/${si.size})</b>` + si.bonuses.map((x) => `<br><span class="${x.active ? "gs-on" : "gs-off"}">(${x.pieces}) ${esc(x.name)}: ${esc(x.text)}</span>`).join("") + (next ? "" : "<br>Full set."));
    wrap.append(b);
  }
  return wrap;
}
