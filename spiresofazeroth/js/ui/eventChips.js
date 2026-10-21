// Event option presentation: consequence chips ("-6 HP" red, "+45 gold" yellow, "Heal 6" green, "Gain card" blue, "?" purple),
// the row icon (sword / coin / heart / scroll by consequence) and the cleaned option title. Pure data -> view-model, no DOM.
// An effect list is the engine's own DSL (SPEC.md); unknown ops are ignored, so new ops never break an event.

const cap = (s) => String(s || "").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

function walk(effs, out, nested) {
  for (const e of effs || []) {
    if (!e || !e.op) continue;
    if (e.op === "conditional") { out.unknown = true; continue; }
    if (e.op === "choose_one") { out.unknown = true; continue; }
    const self = !e.target || e.target === "self";
    switch (e.op) {
      case "gold": out.gold += +e.amount || 0; break;
      case "damage": if (self) out.dmg += +e.amount || 0; break;
      case "heal": if (self) out.heal += +e.amount || 0; break;
      case "max_hp": out.maxhp += +e.amount || 0; break;
      case "apply": if (self) out.status.push({ id: e.status, n: +e.stacks || 1 }); break;
      case "random_card": case "add_card": out.cards += e.count || 1; break;
      case "gain_relic": out.relics += 1; break;
      case "upgrade_card": out.upgrades += e.count || 1; break;
      case "draw": out.draw += e.count || 1; break;
      case "scry": out.scry += e.count || 1; break;
      case "energy_next_turn": out.energy += +e.amount || 0; break;
      case "block": if (self) out.block += +e.amount || 0; break;
      case "remove": if (self) out.cleanse += 1; break;
      case "start_combat": out.fight = e.tier === "elite" ? "Elite fight" : e.tier === "boss" ? "Boss fight" : "Fight"; break;
      case "open_shop": out.shop = true; break;
      default: break;
    }
  }
}

/** -> [{kind: red|yellow|green|blue|purple, text}] */
export function chipsFor(effects, data) {
  const o = { gold: 0, dmg: 0, heal: 0, maxhp: 0, status: [], cards: 0, relics: 0, upgrades: 0, draw: 0, scry: 0, energy: 0, block: 0, cleanse: 0, fight: "", shop: false, unknown: false };
  walk(effects, o, false);
  const c = [];
  if (o.fight) c.push({ kind: "red", text: o.fight });
  if (o.dmg) c.push({ kind: "red", text: `-${o.dmg} HP` });
  if (o.gold) c.push({ kind: "yellow", text: `${o.gold > 0 ? "+" : "-"}${Math.abs(o.gold)} gold` });
  if (o.shop) c.push({ kind: "yellow", text: "Shop" });
  if (o.heal) c.push({ kind: "green", text: `Heal ${o.heal}` });
  if (o.maxhp) c.push({ kind: o.maxhp > 0 ? "green" : "red", text: `${o.maxhp > 0 ? "+" : "-"}${Math.abs(o.maxhp)} Max HP` });
  if (o.cleanse) c.push({ kind: "green", text: "Cleanse" });
  for (const s of o.status) {
    const def = data && data.status ? data.status(s.id) : null;
    const bad = def ? def.kind === "debuff" : /weak|vulnerable|frail|poison|bleed|burn|curse|disease|fear|slow/i.test(s.id || "");
    c.push({ kind: bad ? "red" : "blue", text: `${bad ? "" : "+"}${s.n > 1 || !bad ? s.n + " " : ""}${(def && def.name) || cap(s.id)}`.trim() });
  }
  if (o.cards) c.push({ kind: "blue", text: o.cards > 1 ? `Gain ${o.cards} cards` : "Gain card" });
  if (o.relics) c.push({ kind: "blue", text: o.relics > 1 ? `Gain ${o.relics} relics` : "Gain relic" });
  if (o.upgrades) c.push({ kind: "blue", text: o.upgrades > 1 ? `Upgrade ${o.upgrades} cards` : "Upgrade card" });
  if (o.draw) c.push({ kind: "blue", text: `Draw ${o.draw}` });
  if (o.scry) c.push({ kind: "blue", text: `Scry ${o.scry}` });
  if (o.energy) c.push({ kind: "blue", text: `${o.energy > 0 ? "+" : ""}${o.energy} Energy` });
  if (o.block) c.push({ kind: "blue", text: `+${o.block} Block` });
  if (o.unknown) c.push({ kind: "purple", text: "?" });
  c.sum = o;
  return c;
}

/** icon slug for the option row, by consequence. */
export function optionIcon(chips) {
  const s = chips.sum || {};
  if (s.fight || s.dmg > 0) return { slug: "inv_sword_04", tone: "red" };
  if (s.gold || s.shop) return { slug: "inv_misc_coin_02", tone: "yellow" };
  if (s.heal > 0 || s.maxhp > 0 || s.cleanse) return { slug: "spell_holy_flashheal", tone: "green" };
  return { slug: "inv_scroll_03", tone: "blue" };
}

/** The parenthetical consequence in a label ("Hunt (take 4 damage, +30 gold)") is replaced by chips, except when the outcome is a gamble. */
export function optionTitle(label, chips) {
  if (!chips.length || (chips.sum && chips.sum.unknown)) return label;
  const t = String(label).replace(/\s*\([^()]*\)\s*$/, "").trim();
  return t || label;
}
