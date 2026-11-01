// Extension ops and conditions (zone/event/run-level shapes). Installed into the effects.js dispatch table by installMoreOps().
// Kept separate so effects.js stays under the size cap; each op is one function.
import { isAlive } from "./damage.js";
import { equip, goesToBag, stow } from "./gear.js";
import { makeInst, canUpgrade } from "./deck.js";

const runOf = (ctx) => ctx.run || (ctx.C && ctx.C.run) || null;
const flagsOf = (ctx) => { const r = runOf(ctx); return r ? (r.flags || (r.flags = {})) : {}; };
const liveEnemies = (C) => C.enemies.filter(isAlive);

// Returns true/false for conditions handled here, undefined when the type is unknown.
export function extraCond(ctx, c, { cmp }) {
  const C = ctx.C;
  switch (c.type) {
    case "flag_set": return !!flagsOf(ctx)[c.flag];
    case "cards_played_this_turn": return !!C && cmp(c, C.cardsThisTurn || 0);
    case "cards_played_this_combat":
    case "card_counter": {
      const n = C ? C.stats.cardsPlayed : 0;
      return c.every ? n > 0 && n % c.every === 0 : cmp(c, n);
    }
    case "block_at_least": return !!C && C.player.block >= (c.amount ?? c.value ?? 1);
    case "enemy_tier": {
      const t = ctx.target || (ctx.srcKind === "enemy" ? ctx.src : null) || (C && liveEnemies(C)[0]);
      return !!t && t.tier === (c.is ?? c.value);
    }
    default: return undefined;
  }
}

export function installMoreOps(op, api) {
  const { num } = api;

  op("gain_relic", (ctx, e) => {
    const run = runOf(ctx);
    if (!run || !e.relic || run.relics.includes(e.relic)) return;
    const data = ctx.data || (ctx.C && ctx.C.data), rr = data && data.relic(e.relic);
    const bag = rr && rr.slot && goesToBag(run, data, e.relic); // worn gear is never displaced: the gift waits in the Gear Bag
    if (bag) stow(run, e.relic); else if (rr && rr.slot) equip(run, data, e.relic); else run.relics.push(e.relic); // gear: events that gave relics give gear
    if (!bag && ctx.C && !ctx.C.relics.includes(e.relic)) ctx.C.relics.push(e.relic);
  });

  op("upgrade_card", (ctx, e) => {
    const count = Math.max(1, Math.floor(num(ctx, e.count, 1)));
    const run = runOf(ctx);
    if (ctx.C) {
      const hand = ctx.C.pile.hand.filter((c) => !c.up && canUpgrade(ctx.C.data, c.id, ctx.C.classId));
      for (const inst of ctx.C.rng.shuffle(hand.slice()).slice(0, count)) { const f = makeInst(ctx.C, inst.id, true); inst.up = true; inst.def = f.def; }
      return;
    }
    if (!run || !ctx.data) return;
    const idx = run.deck.map((c, i) => i).filter((i) => !run.deck[i].up && canUpgrade(ctx.data, run.deck[i].id, run.classId));
    for (let n = 0; n < count && idx.length; n++) run.deck[idx.splice(ctx.rng ? ctx.rng.int(0, idx.length - 1) : 0, 1)[0]].up = true;
  });

  op("open_shop", (ctx, e) => { const run = runOf(ctx); if (run && !ctx.C) run.openShop = e.vendor || true; });
  op("start_combat", (ctx, e) => {
    const run = runOf(ctx);
    if (run && !ctx.C) run.startCombat = { tier: e.tier || "normal", encounter: e.encounter, reward: e.reward !== false };
  });
  op("choose_one", (ctx, e) => { const run = runOf(ctx); if (run && !ctx.C) (run.spire || (run.spire = {})).pendingChoice = e.choices || true; });
  op("pet_max_hp", (ctx, e) => { // Feed Pet: the pet's max HP (and current HP) grows for the rest of this fight; a fallen pet is unaffected
    const pet = ctx.C && ctx.C.player.pet;
    if (!pet || pet.down || !isAlive(pet)) return;
    const amt = Math.floor(num(ctx, e.amount));
    pet.maxHp += amt; pet.hp += amt;
  });
  op("set_flag", (ctx, e) => { flagsOf(ctx)[e.flag] = e.value === undefined ? true : !!e.value; });

  op("randomize_costs", (ctx, e) => {
    const C = ctx.C;
    if (!C) return;
    const lo = Math.floor(num(ctx, e.min, 0)), hi = Math.floor(num(ctx, e.max, 2));
    const pool = e.scope === "deck" ? [...C.pile.hand, ...C.pile.draw, ...C.pile.discard] : C.pile.hand;
    for (const inst of pool) if (typeof inst.def.cost === "number") inst.costSet = C.rng.int(lo, hi);
  });
}
