// Difficulty picker (2026-11-01 big update): tier tabs (Normal / Heroic / Mythic), a level row I-X, and a stat card with real numbers and the jump
// from the previous level, so the gaps are visible. Shared by charSelect (Enter World) and classSelect. Look: css/difficulty.css.
import { h } from "./dom.js";
import { TIERS, MYTHIC_START, MAX_HEROIC, tierOf, heroicName, heroicStats, ascensionMods } from "../engine/heroic.js";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const STAT_ROWS = [
  ["enemyHp", "Enemy HP", (v) => `+${v}%`],
  ["normal", "Normal foes", (v) => (v ? `+${v} Str` : "-")],
  ["elite", "Elites", (v) => (v ? `+${v} Str` : "-")],
  ["boss", "Bosses", (v) => (v ? `+${v} Str` : "-")],
  ["elites", "Elite count", (v) => (v ? `+${v}%` : "-")],
  ["rest", "Rest heals", (v) => (v ? `${v}%` : "full")],
  ["gold", "Gold", (v) => (v ? `${v}%` : "full")],
  ["startHp", "Starting HP", (v) => (v ? `${v}%` : "full")],
  ["potions", "Potion slots", (v) => String(v)],
];

/** What got harder from `from` to `to` (both levels), as short strings. */
export function jumpBits(from, to) {
  const a = heroicStats(from), b = heroicStats(to), out = [];
  if (b.enemyHp !== a.enemyHp) out.push(`+${b.enemyHp - a.enemyHp}% enemy HP`);
  for (const [k, n] of [["normal", "normal foes"], ["elite", "elites"], ["boss", "bosses"]]) if (b[k] > a[k]) out.push(`${n} +${b[k] - a[k]} Str`);
  if (b.elites > a.elites) out.push("more elites");
  if (b.rest < a.rest) out.push("weaker rests");
  if (b.gold < a.gold) out.push("less gold");
  if (b.startHp < a.startHp) out.push("lower starting HP");
  if (b.potions < a.potions) out.push(`${b.potions} potion slot${b.potions === 1 ? "" : "s"}`);
  return out;
}

/** props: { level, maxOpen, bestAsc, onPick(level) }. Returns the picker element. */
export function difficultyPicker({ level, maxOpen, bestAsc = 0, onPick }) {
  const L = Math.max(0, Math.min(maxOpen, level | 0)), tier = tierOf(L);
  const tabs = h("div", { class: "dp-tiers", role: "group", "aria-label": "Difficulty tier" }, ...TIERS.map(([id, label, lo, hi]) => {
    const open = lo <= maxOpen, on = id === tier;
    const sub = !open ? `Locked: win on ${heroicName(lo - 1)}` : lo === hi ? "The standard climb" : `${label} I-X`;
    return h("button", { class: `dp-tier dp-tier--${id}`, type: "button", "aria-pressed": String(on), disabled: !open, onClick: () => open && onPick(on ? L : Math.min(maxOpen, id === "normal" ? 0 : Math.max(lo, Math.min(hi, maxOpen)))) },
      h("b", {}, open ? label : `\u{1F512} ${label}`), h("small", {}, sub));
  }));
  const row = tier === "normal" ? null : (() => {
    const [, , lo] = TIERS.find((t) => t[0] === tier);
    return h("div", { class: `dp-levels dp-levels--${tier}`, role: "group", "aria-label": `${tier} level` }, ...ROMAN.slice(1).map((r, i) => {
      const lv = lo + i, open = lv <= maxOpen;
      return h("button", { class: "dp-lv", type: "button", "aria-pressed": String(lv === L), disabled: !open, title: open ? heroicName(lv) : `Win on ${heroicName(lv - 1)} to unlock`, onClick: () => open && onPick(lv) }, open ? r : "\u{1F512}");
    }));
  })();
  const s = heroicStats(L);
  const jump = L > 0 ? jumpBits(L - 1, L) : [];
  const bigJump = L === MYTHIC_START || L === 1;
  const card = h("div", { class: `dp-card dp-card--${tier}` },
    h("div", { class: "dp-card__name" }, heroicName(L)),
    L > 0 ? h("p", { class: `dp-jump ${bigJump ? "dp-jump--big" : ""}`.trim() }, h("b", {}, bigJump ? `BIG JUMP from ${heroicName(L - 1)}: ` : `vs ${heroicName(L - 1)}: `), jump.join(", ") || "same numbers") : h("p", { class: "dp-jump" }, "No modifiers beyond the base climb."),
    h("div", { class: "dp-stats" }, ...STAT_ROWS.map(([k, label, fmt]) => h("div", { class: "dp-stat" }, h("span", {}, label), h("b", {}, fmt(s[k]))))));
  const a1 = ascensionMods(1), a2 = ascensionMods(2);
  const next = maxOpen < MAX_HEROIC ? h("p", { class: "dp-next" }, `Next unlock: win on ${heroicName(maxOpen)} to open ${heroicName(maxOpen + 1)}.`) : null;
  const asc = h("div", { class: "dp-asc" },
    h("b", {}, "Ascension"), ` Win a run, then press ASCEND on the Victory screen to climb again from act 1 with your gear, deck and talents. `,
    `Ascension 1: enemies x${a1.hpMult} HP and +${a1.strength} Str. Each one after: x${Math.round((a2.hpMult / a1.hpMult) * 100) / 100} HP and +${a2.strength - a1.strength} Str more. No cap.`,
    bestAsc > 0 ? h("em", {}, ` Your best: Ascension ${bestAsc}.`) : null);
  return h("div", { class: "dp" }, h("h4", {}, "Difficulty"), tabs, row, card, next, asc);
}
