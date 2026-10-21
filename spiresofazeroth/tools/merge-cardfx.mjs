// Merge data/fx/cards.<group>.json -> data/fx/cards.json and validate against every card id + the sheet index.
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const SH = ["slash","arc","bolt","nova","beam","shield","aura","heal","cleave","whirl","rain"], PA = ["sparks","embers","frost","arcane","leaves","holy","shadow","blood","stone","wind"];
const sheets = new Set(Object.keys(rd("assets/fx/index.json").sheets)), out = {};
for (const f of fs.readdirSync(path.join(root, "data/fx")).filter((f) => /^cards\..+\.json$/.test(f) && f !== "cards.json")) Object.assign(out, rd("data/fx/" + f));
const ids = new Set();
for (const c of fs.readdirSync(path.join(root, "data/classes")).filter((f) => f !== "index.json")) { const j = rd("data/classes/" + c); [...j.cards, ...(j.tokens || [])].forEach((x) => ids.add(x.id)); }
rd("data/neutral-cards.json").cards.forEach((x) => ids.add(x.id)); rd("data/status-cards.json").cards.forEach((x) => ids.add(x.id));
const bad = []; const hx = /^#[0-9a-f]{6}$/i;
for (const id of ids) if (!out[id]) bad.push("missing " + id);
for (const [id, l] of Object.entries(out)) {
  if (!ids.has(id)) bad.push("extra " + id);
  if (!hx.test(l.tint) || !hx.test(l.tint2)) bad.push("hex " + id);
  if (l.travel !== "none" && !sheets.has(l.travel)) bad.push("travel " + id + " " + l.travel);
  if (!sheets.has(l.impact)) bad.push("impact " + id + " " + l.impact);
  if (!SH.includes(l.shape)) bad.push("shape " + id); if (!PA.includes(l.particles)) bad.push("particles " + id);
  if (!["exact","known","school-guess"].includes(l.via)) bad.push("via " + id);
}
const sorted = Object.fromEntries(Object.entries(out).sort());
fs.writeFileSync(path.join(root, "data/fx/cards.json"), JSON.stringify(sorted, null, 1));
const vc = {}; for (const l of Object.values(out)) vc[l.shape] = (vc[l.shape] || 0) + 1;
console.log("cards", ids.size, "looks", Object.keys(out).length, "bad", bad.length, bad.slice(0, 15), JSON.stringify(vc));
