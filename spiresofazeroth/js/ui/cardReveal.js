// Full-screen card reveal (StS style): after an event adds or upgrades cards, show each exact card big in the middle of the
// screen so the player sees what they got. Click / Enter / Space / Esc closes it. Wired by ONE call in js/ui/event.js.
//   deckChanges(before, after) -> [{ id, up, kind: "added" | "upgraded" }]   (before/after = run.deck copies)
//   revealCards(app, changes) -> Promise resolved when the player closes it
import { h, overlayHost } from "./dom.js?v=20261029a";
import { cardEl } from "./card.js?v=20261029a";

export function deckChanges(before, after) {
  const out = [];
  const n = Math.min(before.length, after.length);
  for (let i = 0; i < n; i++) if (after[i].id === before[i].id && after[i].up && !before[i].up) out.push({ id: after[i].id, up: true, kind: "upgraded" });
  for (const c of after.slice(before.length)) out.push({ id: c.id, up: !!c.up, kind: "added" });
  return out;
}

export function revealCards(app, changes) {
  if (!changes || !changes.length) return Promise.resolve();
  const { data, run } = app;
  return new Promise((resolve) => {
    const cards = changes.map((c) => {
      const def = data.card(c.id, run && run.classId);
      if (!def) return null;
      const curse = def.type === "curse" || def.rarity === "curse";
      return h("div", { class: `sp-reveal-item${curse ? " is-curse" : ""}` },
        h("div", { class: "sp-reveal-tag" }, curse ? "Curse added" : c.kind === "upgraded" ? "Upgraded" : "Added to your deck"),
        cardEl(def, { inst: { up: c.up }, data, tag: "div", tips: false }));
    }).filter(Boolean);
    if (!cards.length) return resolve();
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); resolve(); };
    const onKey = (e) => { if (["Escape", "Enter", " "].includes(e.key)) { e.preventDefault(); e.stopPropagation(); close(); } };
    const back = h("div", { class: "sp-reveal", role: "dialog", "aria-label": "Cards gained", onClick: close },
      h("div", { class: "sp-reveal-row" }, ...cards),
      h("div", { class: "sp-reveal-hint" }, "Click anywhere to continue"));
    document.addEventListener("keydown", onKey, true); // capture: event hotkeys (1-9) never fire under the reveal
    overlayHost().append(back);
  });
}
