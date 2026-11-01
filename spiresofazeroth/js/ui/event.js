// Events (stage-native, StS2 style): LEFT 45% the scene (3D NPC or illustrated plate, eventScene.js), RIGHT 55% a parchment dialogue
// panel - morpheus title, typewriter flavour text (18 ms/char, click to finish, reduced motion = instant), option rows with a
// consequence icon + coloured chips (eventChips.js), keys 1-9. Picking plays the outcome (eventScene.playOutcome), shows what
// actually happened under the choice, then "Continue". Options may require gold / a relic / a flag (engine optionAvailable).
import { h, fill } from "./dom.js";
import { eventDef, optionAvailable, chooseEventOption, leaveNode, hasHearthstone, useHearthstone } from "../engine/run.js";
import { cssReady, btn, ico } from "./kit.js";
import { runBar } from "./runbar.js";
import { chipsFor, optionIcon, optionTitle } from "./eventChips.js";
import { mountScene, playOutcome } from "./eventScene.js";
import { watchLeave } from "./combatKit.js";
import { deckChanges, revealCards } from "./cardReveal.js";

export const stageNative = true;
const TYPE_MS = 18;

const chipEl = (c) => h("span", { class: `ev-chip ev-chip--${c.kind}` }, c.text);

// What really happened (conditional options are only known after the roll): diff of the run before/after.
const snapshot = (run) => ({ hp: run.hp, maxHp: run.maxHp, gold: run.gold, cards: run.deck.length, ups: run.deck.filter((c) => c.up).length, relics: run.relics.length, potions: run.potions.length });
function outcome(a, b, fight, shop) {
  const parts = [], chips = [], say = [];
  const d = (k) => b[k] - a[k];
  const add = (kind, text, phrase) => { chips.push({ kind, text }); say.push(phrase); };
  if (d("hp") < 0 && d("maxHp") <= 0) { parts.push({ k: "dmg", n: -d("hp") }); add("red", `-${-d("hp")} HP`, `lose ${-d("hp")} HP`); }
  if (d("maxHp") !== 0) { const n = Math.abs(d("maxHp")), up = d("maxHp") > 0; parts.push({ k: "maxhp", n }); add(up ? "green" : "red", `${up ? "+" : "-"}${n} Max HP`, `${up ? "gain" : "lose"} ${n} max HP`); }
  if (d("hp") > 0 && d("maxHp") <= 0) { parts.push({ k: "heal", n: d("hp") }); add("green", `Healed ${d("hp")}`, `recover ${d("hp")} HP`); }
  if (d("gold") !== 0) { const n = Math.abs(d("gold")), up = d("gold") > 0; parts.push({ k: "gold", n: d("gold") }); add("yellow", `${up ? "+" : "-"}${n} gold`, `${up ? "gain" : "spend"} ${n} gold`); }
  if (d("cards") > 0) add("blue", d("cards") > 1 ? `Gained ${d("cards")} cards` : "Gained card", d("cards") > 1 ? `add ${d("cards")} cards to your deck` : "add a card to your deck");
  if (d("cards") < 0) add("red", "Lost card", "lose a card");
  if (d("ups") > 0) add("blue", "Upgraded card", "upgrade a card");
  if (d("relics") > 0) add("blue", "Gained relic", "claim a relic");
  if (d("potions") > 0) add("blue", "Gained potion", "pocket a potion");
  let text = say.length ? `You ${say.length > 1 ? say.slice(0, -1).join(", ") + " and " + say[say.length - 1] : say[0]}.` : "Nothing changes. You move on.";
  if (fight) { chips.push({ kind: "red", text: "A fight follows" }); text += " A fight follows."; }
  if (shop) { chips.push({ kind: "yellow", text: "Shop opens" }); text += " A shop opens."; }
  return { parts, chips, text };
}

export async function render(app) {
  await cssReady;
  const { run, data, stage } = app;
  stage.setBackdrop(run.zoneId || "default");
  const ev = eventDef(run, data);
  const host = h("section", { class: "sx-screen sx-event" });
  if (!ev) { leaveNode(run, data).then(() => app.route()); return host; }

  const scene = h("div", { class: "ev-scene" });
  const panel = h("div", { class: "ev-panel sx-wood sx-parch" });
  const main = h("div", { class: "ev-main" }, scene, panel);
  let bar = runBar(app);

  const rows = ev.options.map((o) => {
    const chips = chipsFor(o.effects, data);
    const ic = optionIcon(chips);
    const need = o.requires && o.requires.gold ? { kind: "yellow", text: `Needs ${o.requires.gold} gold` } : null;
    const shownChips = need && !chips.some((c) => c.kind === "yellow") ? [...chips, need] : chips;
    return { o, chips: shownChips, ic, title: optionTitle(o.label, chips) };
  });

  // typewriter: the full text is laid out invisibly so the panel never reflows while it types
  const shown = h("span", { class: "ev-text__on" }), rest = h("span", { class: "ev-text__off" }, ev.text);
  const textEl = h("p", { class: "ev-text", title: "Click to skip", onClick: () => finish() }, shown, rest);
  let typed = 0, timer = 0, t0 = 0;
  const speed = () => (window.__evTypeMs > 0 ? window.__evTypeMs : TYPE_MS);
  const paint = (n) => { typed = n; shown.textContent = ev.text.slice(0, n); rest.textContent = ev.text.slice(n); textEl.classList.toggle("is-typing", n < ev.text.length); };
  function finish() { if (timer) { clearInterval(timer); timer = 0; } paint(ev.text.length); }
  const startTyping = () => {
    if (app.reduced() || run.pending.result) return paint(ev.text.length);
    paint(0); t0 = performance.now();
    timer = setInterval(() => {
      if (!host.isConnected) return finish();
      const n = Math.min(ev.text.length, Math.floor((performance.now() - t0) / speed()));
      if (n !== typed) paint(n);
      if (n >= ev.text.length) finish();
    }, 16);
  };

  let busy = false;
  function choose(i) {
    const r = rows[i];
    if (busy || run.pending.result || !r || !optionAvailable(run, r.o)) return;
    busy = true; finish();
    const before = snapshot(run), deck0 = run.deck.map((c) => ({ ...c }));
    chooseEventOption(run, data, i);
    const fu = run.pending.followUp;
    const res = outcome(before, snapshot(run), fu && fu.type === "combat", fu && fu.type === "vendor");
    run.pending.result.sum = { text: res.text, chips: res.chips, i };
    app.save();
    const nb = runBar(app); bar.replaceWith(nb); bar = nb; // HP / gold now show the new values
    redraw();
    playOutcome(app, host, res.parts);
    revealCards(app, deckChanges(deck0, run.deck)); // show the exact card(s) gained, big and centred
  }
  function hearth() { // the Hearthstone card's event side: leave with no outcome at all
    if (busy || run.pending.result || !useHearthstone(run)) return;
    busy = true; finish();
    run.pending.result.sum = { text: "You hearth away and leave the event behind.", chips: [], i: -1 };
    app.save();
    redraw();
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= "1" && e.key <= "9") { const i = +e.key - 1; if (rows[i]) { e.preventDefault(); choose(i); } }
    else if ((e.key === " " || e.key === "Enter") && timer) { e.preventDefault(); finish(); }
  };
  document.addEventListener("keydown", onKey);
  watchLeave(app, host, () => { document.removeEventListener("keydown", onKey); if (timer) clearInterval(timer); });

  function redraw() {
    const res = run.pending.result;
    const done = !!res;
    const chosen = done ? (res.sum ? res.sum.i : rows.findIndex((r) => r.o.label === res.label)) : -1;
    const list = h("div", { class: `ev-opts ${done ? "is-done" : ""}`, role: "list" });
    rows.forEach((r, i) => {
      if (done && i !== chosen) return;
      const ok = optionAvailable(run, r.o);
      list.append(h("button", { class: `ev-opt ev-opt--${r.ic.tone} ${done ? "is-picked" : ""} ${ok ? "" : "is-locked"}`.trim(), type: "button", role: "listitem", disabled: done || !ok, onClick: () => choose(i), "aria-keyshortcuts": String(i + 1), ...(i === 0 && !done ? { "data-autofocus": "" } : {}) },
        h("span", { class: "ev-opt__key" }, String(i + 1)),
        ico(r.ic.slug, { size: "sm" }),
        h("span", { class: "ev-opt__body" }, h("b", { class: "ev-opt__t" }, r.title), r.chips.length ? h("span", { class: "ev-chips" }, ...r.chips.map(chipEl)) : null)));
    });
    if (!done && hasHearthstone(run)) list.append(h("button", { class: "ev-opt ev-opt--blue", type: "button", role: "listitem", onClick: hearth },
      h("span", { class: "ev-opt__key" }, "H"), ico("inv_misc_rune_01", { size: "sm" }),
      h("span", { class: "ev-opt__body" }, h("b", { class: "ev-opt__t" }, "Use your Hearthstone: leave without choosing"))));
    const sum = done && res.sum;
    const resultBlock = done ? h("div", { class: "ev-result" },
      h("p", {}, sum ? sum.text : `You chose: ${res.label}.`),
      sum && sum.chips.length && rows[chosen] && rows[chosen].chips.some((c) => c.kind === "purple") ? h("span", { class: "ev-chips" }, ...sum.chips.map(chipEl)) : null, // gambles: show what the roll gave
      btn("Continue", async () => { await leaveNode(run, data); app.save(); app.route(); }, { size: "lg", cls: "ev-go", auto: true })) : null;
    fill(panel, h("div", { class: "ev-title" }, h("h2", {}, ev.name), h("div", { class: "ev-rule" })), textEl, list, resultBlock);
  }

  fill(host, bar, main);
  redraw();
  startTyping();
  mountScene(app, ev, scene); // after the host is attached the NPC mounts on the next tick (needs layout)
  return host;
}
