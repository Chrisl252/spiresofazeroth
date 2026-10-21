// Element palettes + card -> element/kind mapping for the VFX kit.
export const PALETTE = {
  steel: { main: "#d3dcec", hot: "#ffffff", warm: "#ffd49a", dark: "#6c778a" },
  fire: { main: "#ff7a1c", hot: "#ffeaa8", warm: "#ffb347", dark: "#7a1c00" },
  frost: { main: "#6fd0ff", hot: "#f2fcff", warm: "#b8ecff", dark: "#1f5c9c" },
  arcane: { main: "#c06bff", hot: "#f6e0ff", warm: "#e2a8ff", dark: "#4a1a8a" },
  nature: { main: "#6fdc4a", hot: "#ecffcc", warm: "#c9f27a", dark: "#1f6a1c" },
  holy: { main: "#ffd96a", hot: "#fffbe8", warm: "#fff0b0", dark: "#a8741a" },
  shadow: { main: "#9a4fe0", hot: "#ecd2ff", warm: "#c77dff", dark: "#25083f" },
  lightning: { main: "#8fd0ff", hot: "#ffffff", warm: "#d6f0ff", dark: "#2a5fbf" },
  blood: { main: "#d42a2a", hot: "#ff9c8c", warm: "#ff6a5a", dark: "#4a0808" },
  wind: { main: "#c4ecdc", hot: "#ffffff", warm: "#e6fff4", dark: "#5c8c7e" },
  stone: { main: "#b89c76", hot: "#f2e4ca", warm: "#e0c79a", dark: "#4a3a28" },
};
export const ELEMENTS = Object.keys(PALETTE);
export const KINDS = ["attack", "skill", "power", "heal"];

const CLASS_DEFAULT = { warlock: "shadow", mage: "arcane", priest: "holy", druid: "nature", shaman: "nature", rogue: "steel", warrior: "steel", hunter: "steel", paladin: "holy" };
const ICON_PREFIX = [
  ["spell_fire_", "fire"], ["spell_frost_", "frost"], ["spell_shadow_", "shadow"], ["spell_holy_", "holy"], ["spell_arcane_", "arcane"],
  ["spell_lightning", "lightning"], ["spell_nature_lightning", "lightning"], ["spell_nature_chainlightning", "lightning"], ["spell_nature_", "nature"],
  ["inv_sword_", "steel"], ["inv_axe_", "steel"], ["inv_mace_", "steel"], ["inv_weapon_", "steel"], ["inv_shield_", "steel"],
  ["spell_deathknight_", "frost"], ["spell_misc_", null], ["spell_magic_", null],
];
const SCHOOL = { fire: "fire", frost: "frost", arcane: "arcane", nature: "nature", shadow: "shadow", holy: "holy" };

const effOps = (card) => (card && card.effects) || [];
const flat = (effs, out = []) => { for (const e of effs || []) { out.push(e); if (e.effects) flat(e.effects, out); } return out; };

/** card -> element id. Priority: damage school, icon prefix, ability_<class>_, class default. */
export function elementFor(card, classId) {
  if (!card) return "steel";
  const ops = flat(effOps(card));
  const cls = (card.class || card.cls || card.classId || classId || "").toString().toLowerCase();
  const icon = (card.icon || "").toLowerCase();
  const sch = ops.find((e) => e.op === "damage" && e.school && SCHOOL[e.school]);
  if (sch) return SCHOOL[sch.school];
  for (const [p, el] of ICON_PREFIX) if (icon.startsWith(p)) { if (el) return el; break; }
  const m = /^ability_([a-z]+)_/.exec(icon);
  if (m && CLASS_DEFAULT[m[1]]) return CLASS_DEFAULT[m[1]];
  if (icon.startsWith("ability_") || icon.startsWith("inv_")) return "steel";
  return CLASS_DEFAULT[cls] || "steel";
}

/** card -> attack | skill | power | heal */
export function kindFor(card) {
  if (!card) return "attack";
  if (card.type === "power") return "power";
  const ops = flat(effOps(card)).map((e) => e.op);
  const dmg = ops.includes("damage") || ops.includes("aoe");
  if (card.type === "attack" || dmg) return "attack";
  if (ops.includes("heal") && !ops.includes("block")) return "heal";
  return "skill";
}
