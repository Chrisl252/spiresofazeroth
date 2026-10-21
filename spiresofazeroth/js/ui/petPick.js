// Pet pick (class select, hunter): "Choose your companion" plates. Icon, name, ONE role line, 2-3 stat chips; full text in a hover tooltip.
// Presentation only: picking calls onPick(id) and the engine receives the same pet id as before. Keys 1-9 pick.
import { h, icon, tip, esc } from "./dom.js";

const maxHit = (u) => Math.max(0, ...(u.moves || []).flatMap((m) => (m.effects || []).filter((e) => e.op === "damage").map((e) => e.amount || 0)));

export function petPlates(cls, selected, onPick) {
  const ids = cls.resource.pet.choices;
  const box = h("div", { class: "sx-pets", role: "group", "aria-label": "Choose your companion" });
  ids.forEach((id, i) => {
    const u = cls.units[id] || {};
    const chips = (cls.resource.pet.guardian ? [["Cosmetic", "kw"], [u.cry ? `"${u.cry}"` : "", ""]] : [[`${u.hp} HP`, ""], [`Hits ${maxHit(u)}`, ""], [u.keyword || "", "kw"]]).filter((c) => c[0]);
    const b = h("button", { class: "sx-pet", type: "button", "aria-pressed": String(selected === id), "data-pet": id, onClick: () => onPick(id) },
      h("span", { class: "sx-pet__key" }, String(i + 1)),
      icon(u.icon, "sx-pet__ic", ""),
      h("b", { class: "sx-pet__n" }, u.name || id),
      h("span", { class: "sx-pet__r" }, u.role || u.text || ""),
      h("span", { class: "sx-pet__chips" }, ...chips.map(([t, k]) => h("i", { class: `sx-pet__chip ${k}`.trim() }, t))));
    tip(b, `<b>${esc(u.name || id)}</b><br>${esc(u.detail || u.text || "")}`);
    box.append(b);
  });
  return box;
}

// 1-9 keys pick; returns an unbind fn (the screen rebinds on each draw).
export function bindPetKeys(cls, onPick) {
  const ids = cls.resource.pet.choices;
  const fn = (e) => { if (!document.querySelector(".sx-pets")) return document.removeEventListener("keydown", fn); if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const n = +e.key; if (n >= 1 && n <= ids.length) onPick(ids[n - 1]); };
  document.addEventListener("keydown", fn);
  return () => document.removeEventListener("keydown", fn);
}
