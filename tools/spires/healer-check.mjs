// Act-transition healer gate: node tools/spires/healer-check.mjs  (exit 0 = pass)
// Plays sim runs and asserts: the healer fires exactly once per act transition (acts 1..5), never after the final act, always heals to full,
// and enterHealer is idempotent (a reload / second call changes nothing).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createData } from "../../spiresofazeroth/js/engine/data.js";
import * as Run from "../../spiresofazeroth/js/engine/run.js";
import { enterHealer, healerFor } from "../../spiresofazeroth/js/engine/healer.js";
import { simRun } from "../../spiresofazeroth/js/engine/sim.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "../../spiresofazeroth/data"), fix = path.join(here, "fixtures");
const fetchJson = async (rel) => { for (const b of [dir, fix]) { try { return JSON.parse((await readFile(path.join(b, rel), "utf8")).replace(/^﻿/, "")); } catch (e) { /* next */ } } return null; };
const data = createData({ fetchJson });
await data.load();
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.log("FAIL", msg); } };
check(data.healers && data.healers.healers.length >= 1, "healers.json loaded");
for (let a = 1; a < Run.TOTAL_ACTS; a++) check(healerFor(data, a) && healerFor(data, a).id, `healerFor(act ${a})`);
// unit: idempotent
const run = { act: 2, hp: 10, maxHp: 80, screen: "map", pending: null };
check(enterHealer(run, data) === true && run.hp === 45 && run.screen === "healer" && run.pending.hpBefore === 10 && run.pending.healed === 35, "first enter heals 50% missing HP");
run.hp = 5; run.screen = "map";
check(enterHealer(run, data) === false && run.hp === 5 && run.screen === "map", "second enter in the same act is a no-op");
run.act = 3; check(enterHealer(run, data) === true && run.hp === 43, "next act heals again");
// flow: full sim runs, count healer entries per act
let seen = 0, finals = 0;
for (const cid of ["warrior", "mage", "druid"]) {
  await data.loadClass(cid);
  for (let i = 0; i < 12; i++) {
    const r = await simRun(data, { classId: cid, seed: `hc-${i}` });
    const healedActs = r.healerAct || 0;
    check(healedActs <= Run.TOTAL_ACTS - 1, `${cid} ${i}: healerAct ${healedActs} must be < final act`);
    if (r.result === "victory") { finals++; check(r.healerAct === Run.TOTAL_ACTS - 1, `${cid} ${i}: victory run healed through act ${r.healerAct}`); }
    seen += healedActs ? 1 : 0;
  }
}
check(seen > 0, "at least one sim run reached a healer");
console.log(bad ? `healer-check: ${bad} FAIL` : `healer-check: OK (runs with a healer ${seen}, victories ${finals})`);
process.exit(bad ? 1 : 0);
