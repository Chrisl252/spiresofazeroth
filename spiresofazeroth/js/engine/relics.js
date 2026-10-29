// Relic trigger bus. Names (SPEC section 5): on_pickup on_combat_start on_turn_start on_turn_end on_card_played on_attack
// on_damage_taken on_kill on_combat_end on_rest on_shop on_floor on_hp_loss on_block_gained  (+ on_death, engine extra).
// fire(C, name, extra) walks: owned relics -> zone mechanic hooks -> one-shot player triggers (apply ... trigger:"...").
import { runEffects } from "./effects.js?v=20261029a";
import { talentFire } from "./talentHooks.js?v=20261029a";

export const TRIGGERS = [
  "on_pickup", "on_combat_start", "on_turn_start", "on_turn_end", "on_card_played", "on_attack", "on_damage_taken", "on_kill",
  "on_combat_end", "on_rest", "on_shop", "on_floor", "on_hp_loss", "on_block_gained", "on_death", "on_spire_start", "on_spare",
];

export function fire(C, name, extra = {}) {
  if (!C || !C.player || C._fireDepth > 6) return;
  C._fireDepth = (C._fireDepth || 0) + 1;
  try {
    const base = {
      C, src: C.player, srcKind: "relic", target: extra.enemy || extra.target || null, attacker: extra.attacker || null, event: extra,
    };
    for (const rid of C.relics) {
      const r = C.data.relic(rid);
      const effs = r && r.triggers && r.triggers[name];
      if (effs) runEffects({ ...base, relic: r }, effs);
      if (C.result && name !== "on_combat_end") break;
    }
    const zm = C.zone && C.zone.zoneMechanic;
    const mech = zm && zm.choices && C.run && C.run.spire ? zm.choices.find((c) => c.id === C.run.spire.mech) : null;
    const zh = ((mech && mech.hooks) || (zm && zm.hooks) || {})[name];
    if (zh) runEffects({ ...base, srcKind: "zone" }, zh);
    const list = C.player.triggers && C.player.triggers[name];
    if (list && list.length) {
      const keep = [];
      for (const t of list) {
        runEffects({ ...base, srcKind: "player" }, t.effects);
        if (!t.once) keep.push(t);
      }
      C.player.triggers[name] = keep;
    }
    talentFire(C, name, extra); // Talents V2 (engine/talentHooks.js): no-op unless run.talents carries a hook key
  } finally {
    C._fireDepth--;
  }
}

// Run-level (no combat): on_pickup, on_rest, on_shop, on_floor. Effects only touch hp/gold/deck/max hp.
export function fireRun(run, data, rng, name) {
  for (const rid of run.relics) {
    const r = data.relic(rid);
    const effs = r && r.triggers && r.triggers[name];
    if (effs) runEffects({ C: null, run, rng, data, src: null, srcKind: "relic" }, effs);
  }
}
