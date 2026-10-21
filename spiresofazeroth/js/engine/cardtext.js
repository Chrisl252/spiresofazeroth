// Card / relic text rendering. Data text is plain; {tokens} are optional and filled from the first matching effect.
const firstOp = (effs, op) => {
  for (const e of effs || []) {
    if (!e) continue;
    if (e.op === op) return e;
    if (e.op === "conditional") { const f = firstOp(e.then, op); if (f) return f; }
  }
  return null;
};
const numOf = (v) => (typeof v === "number" ? v : v && typeof v === "object" ? v.base || 0 : "");

export function renderText(def, C) {
  let t = def.text || "";
  if (!t.includes("{")) return t;
  const E = def.effects || [];
  const bonus = C ? (C.player.st.strength || 0) : 0;
  const map = {
    damage: () => { const e = firstOp(E, "damage"); return e ? (numOf(e.amount) + bonus) : ""; },
    block: () => { const e = firstOp(E, "block"); return e ? numOf(e.amount) + (C ? C.player.st.dexterity || 0 : 0) : ""; },
    heal: () => { const e = firstOp(E, "heal"); return e ? numOf(e.amount) : ""; },
    draw: () => { const e = firstOp(E, "draw"); return e ? numOf(e.count) : ""; },
    stacks: () => { const e = firstOp(E, "apply"); return e ? numOf(e.stacks) : ""; },
    energy: () => { const e = firstOp(E, "gain_energy"); return e ? numOf(e.amount) : ""; },
    amount: () => { const e = E[0]; return e ? numOf(e.amount) : ""; },
  };
  return t.replace(/\{(\w+)\}/g, (m, k) => (map[k] ? String(map[k]()) : m));
}
