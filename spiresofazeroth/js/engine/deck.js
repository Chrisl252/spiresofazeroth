// Card instances, piles, draw/discard/exhaust, cost evaluation. No DOM.
import { fx } from "./damage.js";
import { talentCost } from "./talentHooks.js";

export const HAND_LIMIT = 10;
const STUB = (id) => ({
  id, name: String(id).replace(/-/g, " "), icon: "inv_misc_questionmark", type: "status", rarity: "basic", cost: -1,
  target: "none", flags: ["unplayable"], effects: [], text: "Unknown card.",
});

// Resolve a card definition (optionally upgraded). Cached on the data object.
export function cardDef(data, id, up, classId) {
  const cache = data._defCache || (data._defCache = new Map());
  const key = `${classId || data.classId || ""}|${id}|${up ? 1 : 0}`;
  let d = cache.get(key);
  if (d) return d;
  const base = (data.card && data.card(id, classId)) || STUB(id);
  if (up && base.upgrade) {
    d = { ...base, ...base.upgrade, id: base.id, icon: base.upgrade.icon || base.icon, upgraded: true };
    if (!base.upgrade.flags) d.flags = base.flags || [];
    if (!base.upgrade.rarity) d.rarity = base.rarity;
    delete d.upgrade;
  } else d = { ...base, upgraded: false };
  d.flags = d.flags || [];
  d.effects = d.effects || [];
  cache.set(key, d);
  return d;
}
export const canUpgrade = (data, id, classId) => {
  const b = data.card && data.card(id, classId);
  return !!(b && b.upgrade && b.type !== "curse" && b.type !== "status");
};

export function makeInst(C, id, up = false) {
  C.uidSeq = (C.uidSeq || 0) + 1;
  return { uid: "c" + C.uidSeq, id, up: !!up, def: cardDef(C.data, id, up, C.classId) };
}
export const hasFlag = (inst, f) => inst.def.flags.includes(f);

export function isSpellCard(inst) {
  // used by Silence: a card is a spell if any of its effects is non-physical damage or it is a skill with a cast-like type
  const walk = (effs) => (effs || []).some((e) => e && ((e.op === "damage" || e.op === "aoe") && e.school && e.school !== "physical"
    || (e.op === "conditional" && (walk(e.then) || walk(e.else))) || (e.op === "repeat" && walk(e.effects))));
  return walk(inst.def.effects);
}

export function cardCost(C, inst) {
  const d = inst.def;
  if (d.cost === "X") return "X";
  if (typeof d.cost !== "number") return 1;
  if (d.cost < 0) return -1;
  let c = d.cost;
  if (d.formCost !== undefined && d.formCost !== null) {
    const f = C.player.form;
    if (typeof d.formCost === "object") { if (f && d.formCost[f] !== undefined) c = d.formCost[f]; }
    else if (f) c = d.formCost;
  }
  if (inst.costSet !== undefined && inst.costSet !== null) c = inst.costSet;
  if (inst.costMod) c += inst.costMod;
  c -= talentCost(C, inst); // Talents V2: card_cost
  return Math.max(0, c);
}

export function whyUnplayable(C, inst) {
  const d = inst.def;
  const p = C.player;
  if (C.result || C.phase !== "player") return "Not your turn";
  if (d.cost === -1 || hasFlag(inst, "unplayable")) return "Unplayable";
  if (p.st.silence && isSpellCard(inst)) return "Silenced";
  if (d.effects.some((e) => e && e.op === "retreat") && (C.tier === "boss" || C.tier === "raid" || C.enemies.some((e) => e.tier === "boss" || e.tier === "raid"))) return "No retreat from a boss";
  const cost = cardCost(C, inst);
  if (cost !== "X" && cost > p.energy) return "Not enough energy";
  if (d.resourceCost) {
    for (const [rid, amt] of Object.entries(d.resourceCost)) if ((p.res[rid] || 0) < amt) return `Not enough ${rid}`;
  }
  return null;
}

// ---- piles ---------------------------------------------------------------------
export function buildPiles(C, deckList) {
  const cards = deckList.map((c) => makeInst(C, c.id, c.up));
  C.rng.shuffle(cards);
  // innate cards go on top (end of array)
  const innate = cards.filter((c) => hasFlag(c, "innate"));
  const rest = cards.filter((c) => !hasFlag(c, "innate"));
  C.pile = { draw: rest.concat(innate), hand: [], discard: [], exhaust: [] };
}

export function reshuffle(C) {
  const pl = C.pile;
  if (!pl.discard.length) return false;
  pl.draw = C.rng.shuffle(pl.discard.splice(0));
  fx(C, { t: "shuffle" });
  return true;
}

export function drawCards(C, n) {
  const pl = C.pile;
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (pl.hand.length >= HAND_LIMIT) break;
    if (!pl.draw.length && !reshuffle(C)) break;
    const card = pl.draw.pop();
    pl.hand.push(card);
    drawn++;
    fx(C, { t: "draw", uid: card.uid });
  }
  return drawn;
}

export function removeFrom(C, inst) {
  for (const k of ["hand", "draw", "discard", "exhaust"]) {
    const i = C.pile[k].indexOf(inst);
    if (i >= 0) { C.pile[k].splice(i, 1); return k; }
  }
  return null;
}
export function toDiscard(C, inst) {
  removeFrom(C, inst);
  inst.costSet = null;
  inst.costMod = 0;
  C.pile.discard.push(inst);
}
export function toExhaust(C, inst) {
  removeFrom(C, inst);
  C.pile.exhaust.push(inst);
  fx(C, { t: "exhaust", uid: inst.uid });
}
export function toHand(C, inst) {
  removeFrom(C, inst);
  if (C.pile.hand.length >= HAND_LIMIT) C.pile.discard.push(inst);
  else C.pile.hand.push(inst);
}

// Add freshly created cards. to: hand | draw | discard | deck_permanent
export function addCards(C, id, to = "hand", count = 1, up = false) {
  for (let i = 0; i < count; i++) {
    if (to === "deck_permanent") {
      if (C.run) C.run.deck.push({ id, up: !!up });
      continue;
    }
    const inst = makeInst(C, id, up);
    if (to === "draw") C.pile.draw.splice(C.rng.int(0, C.pile.draw.length), 0, inst);
    else if (to === "discard") C.pile.discard.push(inst);
    else if (C.pile.hand.length >= HAND_LIMIT) C.pile.discard.push(inst);
    else C.pile.hand.push(inst);
    fx(C, { t: "gain_card", uid: inst.uid });
  }
}

export function endTurnCleanup(C) {
  const pl = C.pile;
  const keep = [];
  for (const c of pl.hand.slice()) {
    if (hasFlag(c, "retain") || c.retained) keep.push(c);
    else if (hasFlag(c, "ethereal")) toExhaust(C, c);
    else toDiscard(C, c);
  }
  pl.hand = keep;
  for (const c of keep) { c.costSet = null; c.costMod = 0; }
}
