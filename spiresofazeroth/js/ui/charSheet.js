// Character window (owner 11-01): WoW-style paperdoll with every worn piece, the hero's stats at the start of the next fight,
// racial, set bonuses, talents, relics and difficulty. Toggle: the run-bar Character button or the C key (works in combat, view-only).
// Numbers come from engine/charStats.js (one home); this file only draws them.
import { h, icon, tip, esc, qClass } from "./dom.js";
import { cssReady, stageModal } from "./kit.js";
import { gearCss, socket } from "./gearStrip.js";
import { charStats } from "../engine/charStats.js";
import { SLOT_LABEL } from "../engine/gear.js";

const LEFT = ["head", "neck", "shoulder", "back", "chest", "wrist"];
const RIGHT = ["hands", "waist", "legs", "feet", "finger1", "finger2", "trinket1", "trinket2"];
const LOW = ["mainHand", "offHand"];
const RACE_NAME = { human: "Human", dwarf: "Dwarf", nightelf: "Night Elf", gnome: "Gnome", draenei: "Draenei", orc: "Orc", undead: "Undead", tauren: "Tauren", troll: "Troll", bloodelf: "Blood Elf" };
const TYPE_NAME = { attack: "Attacks", skill: "Skills", power: "Powers", form: "Forms", curse: "Curses", status: "Statuses", other: "Other" };
let openClose = null;

let keyApp = null;
export function installCharKey(app) {
  if (keyApp) { keyApp = app; return; }
  keyApp = app;
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "c" && e.key !== "C") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") || (e.target && e.target.isContentEditable)) return;
    const a = keyApp;
    if (!a || !a.run || a.run.screen === "end") return;
    if (openClose) { openClose(); return; }
    if (document.querySelector(".sx-modal-back") || document.querySelector(".sp-bugp")) return; // another window is up
    e.preventDefault();
    openCharSheet(a);
  });
}

const row = (label, value, hint) => {
  const el = h("div", { class: "cs-stat" }, h("span", {}, label), h("b", {}, String(value)));
  if (hint) tip(el, hint);
  return el;
};
const section = (title, ...kids) => h("section", { class: "cs-sec" }, h("h4", {}, title), ...kids.filter(Boolean));

export async function openCharSheet(app) {
  await Promise.all([cssReady, gearCss]);
  injectCss();
  const { run, data } = app;
  if (!run || openClose) return;
  const s = charStats(run, data);
  const slot = (k) => { const g = s.gear.find((x) => x.key === k); return h("div", { class: "cs-slot" }, socket(k, g && g.item, { run, data }), h("small", {}, SLOT_LABEL[k])); };

  // paperdoll
  const hero = s.hero, raceName = RACE_NAME[hero.race] || (hero.race || "");
  const doll = h("div", { class: "cs-doll" },
    h("div", { class: "cs-col" }, ...LEFT.map(slot)),
    h("div", { class: "cs-mid" },
      h("div", { class: "cs-portrait" }, icon(hero.icon, "", hero.className)),
      h("b", { class: "cs-name", style: { color: hero.color } }, hero.name),
      h("span", { class: "cs-sub" }, `${raceName} ${hero.className}`.trim()),
      h("span", { class: "cs-sub" }, s.core.floor > 0 ? `Act ${s.core.act}/6, floor ${s.core.floor}` : `Act ${s.core.act}/6`),
      h("div", { class: "cs-hp" }, h("i", { style: { width: `${Math.max(0, Math.min(100, (s.core.hp / Math.max(1, s.core.maxHp)) * 100))}%` } }), h("span", {}, `${s.core.hp} / ${s.core.maxHp} HP`)),
      h("div", { class: "cs-low" }, ...LOW.map(slot))),
    h("div", { class: "cs-col" }, ...RIGHT.map(slot)));

  // stats at the start of the next fight
  const cb = s.combat;
  const stats = section("Stats (start of your next fight)",
    row("Health", `${s.core.hp} / ${s.core.maxHp}`),
    cb ? row("Energy per turn", cb.energy, "Energy on your first turn, after gear, relics and talents.") : null,
    cb ? row("Cards drawn", cb.draw, "Cards in your first hand.") : null,
    cb && cb.block ? row("Starting block", cb.block) : null,
    cb && cb.resource ? row(cb.resource.name, cb.resource.max > 0 ? `${cb.resource.now} / ${cb.resource.max}` : cb.resource.now) : null,
    ...(cb ? cb.statuses.map((x) => row(x.name, x.n, x.text ? `<b>${esc(x.name)}</b><br>${esc(x.text)}` : null)) : [h("p", { class: "cs-dim" }, "Combat stats are unavailable right now.")]),
    row("Gold", s.core.gold), row("Potions", `${s.core.potions}`), row("Gear level", s.gearLevel, "Worn pieces that are not starter gear (weapons and armor)."));

  const deck = section("Deck",
    row("Cards", s.core.deck), row("Upgraded", s.upgraded),
    ...Object.entries(s.deckTypes).sort((a, b) => b[1] - a[1]).map(([t, n]) => row(TYPE_NAME[t] || t, n)));

  // racial
  const rc = s.racial;
  const racial = section("Racial",
    rc ? (() => { const el = h("div", { class: "cs-perk" }, icon(rc.icon, "", rc.name), h("div", {}, h("b", {}, rc.name), h("p", {}, rc.text || ""))); return el; })()
      : h("p", { class: "cs-dim" }, "No racial on this hero (runs started before racials were added have none)."),
    rc ? h("p", { class: "cs-dim" }, "Your racial is a card in your deck: free to play, once per fight.") : null);

  // set bonuses
  const si = s.set;
  const setSec = si && si.set ? section(`${si.set.name} (${si.count}/${si.size})`,
    ...si.bonuses.map((b) => h("p", { class: b.active ? "cs-on" : "cs-off" }, h("b", {}, `(${b.pieces}) ${b.name}: `), b.text))) : null;

  // talents
  const tal = section("Talents",
    s.talents.length ? h("div", { class: "cs-grid2" }, ...s.talents.map((t) => row(t.name, `+${t.v}`))) : h("p", { class: "cs-dim" }, "No talent bonuses on this run yet. Learn talents from the map (solo) or on the title screen."),
    s.difficulty.hardenedPct ? h("p", { class: "cs-dim" }, `Hardened Foes: enemies +${s.difficulty.hardenedPct}% HP from talents learned during this run.`) : null);

  // relics
  const rel = section(`Relics (${s.relics.length})`,
    s.relics.length ? h("div", { class: "cs-relics" }, ...s.relics.map((r) => { const el = h("span", { class: `cs-relic ${qClass(r.rarity)}`, tabindex: "0", "aria-label": r.name }, icon(r.icon, "", r.name)); tip(el, `<b style="color:var(--q-${r.rarity || "common"})">${esc(r.name)}</b><br>${esc(r.text || "")}`); return el; }))
      : h("p", { class: "cs-dim" }, "No relics yet."));

  const diff = section("Difficulty", row("Difficulty", s.difficulty.name), row("Enemy HP", `${s.difficulty.enemyHpPct >= 0 ? "+" : ""}${s.difficulty.enemyHpPct}%`, "From difficulty level, Ascension and Hardened Foes. Co-op fights add more on top."));

  const body = h("div", { class: "cs-sheet" }, h("div", { class: "cs-left" }, doll, stats), h("div", { class: "cs-right" }, racial, setSec, tal, rel, deck, diff));
  const shut = stageModal(app, `Character - ${hero.name}`, body, { onClose: () => { openClose = null; } });
  openClose = () => shut();
}

function injectCss() {
  if (document.getElementById("cs-css")) return;
  const st = document.createElement("style");
  st.id = "cs-css";
  st.textContent = `
.cs-sheet{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:22px;color:#e8dcc0;font-family:var(--f-ui,Georgia,serif);min-width:min(1180px,92vw)}
.cs-doll{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:14px;border:1px solid #6b5426;border-radius:10px;background:radial-gradient(ellipse at 50% 35%,#2a2114,#0d0a06 75%)}
.cs-col{display:grid;gap:8px}.cs-slot{display:flex;align-items:center;gap:8px}.cs-col:last-child .cs-slot{flex-direction:row-reverse}
.cs-slot small{font-size:15px;color:#a8946a;min-width:78px}.cs-col:last-child .cs-slot small{text-align:right}
.cs-slot .gs-sock{--s:58px;width:58px;height:58px}.cs-slot .gs-sock img{width:100%;height:100%}
.cs-mid{display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:10px;text-align:center}
.cs-portrait{width:132px;height:132px;border-radius:50%;overflow:hidden;border:3px solid #c9a24b;box-shadow:0 0 22px #000,inset 0 0 18px #000}.cs-portrait img{width:100%;height:100%;display:block;margin:0}
.cs-name{font-size:32px;font-weight:400;text-shadow:0 2px 3px #000}.cs-sub{font-size:19px;color:#cbb88e}
.cs-hp{position:relative;display:grid;place-items:center;width:86%;height:26px;background:#2a0b08;border:1px solid #7a2a1f;border-radius:4px;overflow:hidden;margin:6px 0}
.cs-hp i{position:absolute;inset:0 auto 0 0;background:linear-gradient(#d23a2a,#7a1510)}.cs-hp span{position:relative;font-size:16px;line-height:1;color:#fff;text-shadow:0 1px 2px #000}
.cs-low{display:flex;gap:18px;margin-top:auto;padding-top:20px}.cs-low .cs-slot{flex-direction:column}.cs-low .cs-slot small{text-align:center;min-width:0}
.cs-left,.cs-right{display:grid;gap:14px;align-content:start}
.cs-sec{padding:12px 14px;border:1px solid #4e3e1e;border-radius:8px;background:rgba(10,8,4,.72)}
.cs-sec h4{margin:0 0 8px;font-size:22px;font-weight:400;color:#ffd100;letter-spacing:.03em}
.cs-stat{display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #2a2212;font-size:19px}.cs-stat b{color:#fff;font-weight:400}
.cs-grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}
.cs-perk{display:flex;gap:12px;align-items:flex-start}.cs-perk img{width:56px;height:56px;border-radius:6px;border:2px solid #c9a24b;margin:0}.cs-perk b{font-size:21px;color:#ffd100;font-weight:400}.cs-perk p{margin:4px 0 0;font-size:18px;line-height:1.35}
.cs-dim{color:#a8946a;font-size:17px;margin:6px 0 0}.cs-on{color:#7dff7d;font-size:17px;margin:4px 0}.cs-off{color:#8a7b5a;font-size:17px;margin:4px 0}.cs-on b,.cs-off b{font-weight:400}
.cs-relics{display:flex;flex-wrap:wrap;gap:8px}.cs-relic{width:48px;height:48px;border:2px solid var(--q,#8a7b5a);border-radius:6px;overflow:hidden;display:block}.cs-relic img{width:100%;height:100%;margin:0;display:block}
.sp-portrait .cs-sheet,.cs-narrow .cs-sheet{grid-template-columns:1fr;min-width:0}
@media (max-width:900px){.cs-sheet{grid-template-columns:1fr;min-width:0}.cs-slot small{display:none}.cs-portrait{width:96px;height:96px}}
`;
  document.head.append(st);
}
