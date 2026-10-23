// StS2-style damage previews: pure projections of a player card against a living enemy,
// mirroring damage.dealDamage's arithmetic (dealt -> bonus -> mult -> taken -> adjust -> block/shield).
// NO mutations, NO fx. Keep in sync with damage.js when the pipeline changes.
import { modifyDealt, modifyTaken } from "./status.js";
import { damageBonus, damageMult, takenAdjust } from "./resources.js";
import { immuneToSchool, resistMult } from "./immunity.js";
import { num } from "./effects.js";
import { talentDamage } from "./talentHooks.js";

// -> { hits, perHit, total, blocked, hpLoss, immune, resist, lethal } | null
export function previewCardVs(C, inst, tgt) {
  if (!C || !inst || !inst.def || !tgt || tgt.hp <= 0) return null;
  const src = C.player;
  const ctx = { C, src, srcKind: "player", target: tgt, spent: {} };
  let hits = 0, perHit = 0, total = 0, immune = false, resist = false;
  const walk = (effs) => {
    for (const x of effs || []) {
      if (x.op === "damage" || x.op === "aoe") {
        if (x.target === "self") continue;
        const school = x.school || "physical";
        const aoe = x.target === "all_enemies" || x.op === "aoe";
        if (!aoe && x.target && x.target !== "enemy") continue; // pet/other lanes: not previewable
        if (immuneToSchool(tgt, school)) { immune = true; continue; }
        if (resistMult(tgt, school) < 1) resist = true;
        let a = Math.max(0, num(ctx, x.amount));
        a = modifyDealt(C, src, a);
        a += damageBonus(C, src, school, {});
        a = talentDamage(C, src, tgt, a, { kind: "attack", card: inst.def, dry: true }, Math.max(0, num(ctx, x.amount)));
        a = Math.floor(a * damageMult(C, src, tgt, school, {}));
        a = takenAdjust(C, tgt, modifyTaken(C, tgt, a, school, {}), school);
        const times = num(ctx, x.times, 1) || 1;
        hits += times;
        perHit = a;
        total += a * times;
      } else if (x.op === "repeat") walk(x.effects);
      // conditionals are NOT counted: their damage is not guaranteed (StS previews show only certain damage)
    }
  };
  walk(inst.def.effects);
  if (!hits) return null;
  const blocked = Math.min(tgt.block, total);
  const hpLoss = Math.max(0, Math.min(tgt.hp, total - blocked));
  return { hits, perHit: Math.round(perHit), total: Math.round(total), blocked, hpLoss, immune, resist, lethal: hpLoss >= tgt.hp };
}

// Does this card aim damage at enemies at all (single or aoe)?
export function cardAimsDamage(C, inst) {
  const ctx = { C, src: C.player, srcKind: "player", target: null, spent: {} };
  let yes = false;
  const walk = (effs) => {
    for (const x of effs || []) {
      if ((x.op === "damage" || x.op === "aoe") && x.target !== "self" && (!x.target || x.target === "enemy" || x.target === "all_enemies" || x.op === "aoe")) yes = true;
      else if (x.op === "conditional") walk(x.then);
      else if (x.op === "repeat") walk(x.effects);
    }
  };
  walk(inst.def.effects);
  return yes;
}
