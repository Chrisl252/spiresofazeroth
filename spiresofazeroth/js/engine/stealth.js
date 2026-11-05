// Stealth targeting rules (ONE home; engine + UI share it). No DOM.
//  - A stealthed enemy cannot be picked by click/drag/auto-target while a visible enemy lives; the LAST living enemy is always revealed.
//  - A card that removes Stealth from its target (Flare) may aim AT a stealthed enemy; that is how Stealth is stripped.
//  - Area effects (all_enemies) hit stealthed enemies too; they do not strip Stealth.
export function revealsStealth(def) {
  const walk = (effs) => (effs || []).some((x) => x && ((x.op === "remove" && x.status === "stealth" && (x.target === "enemy" || x.target === undefined)) || (x.op === "conditional" && (walk(x.then) || walk(x.else))) || (x.op === "repeat" && walk(x.effects))));
  return !!def && walk(def.effects);
}
