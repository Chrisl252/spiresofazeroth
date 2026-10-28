// Run end (stage-native): victory / defeat banner, stat scroll, #end-hero host (class plate until the hero model lands), run_end analytics once per run.
import { h, icon, track, toast } from "./dom.js?v=20261028e";
import { recordRunEnd, clearRun } from "../engine/save.js?v=20261028e";
import { summarize } from "../engine/run.js?v=20261028e";
import { cssReady, btn, ico, scroll } from "./kit.js?v=20261028e";
import { mountPortrait } from "./combatKit.js?v=20261028e";
import { gearLevel } from "../engine/gear.js?v=20261028e";
import { sp, funnel, encKey } from "../analytics.js?v=20261028e";
import { recordRunAggregate } from "./runTelemetry.js?v=20261028e";

export const stageNative = true;

// one line of the Progress block: class / heroic unlocks, talent points, level-ups (with the cards that just opened), XP
function unlockRow(app, u) {
  const { data } = app, cname = (data.classObj(u.id) || { name: u.id }).name;
  const row = (ic, text, extra) => h("p", {}, icon(ic, "sx-end__ui", ""), text, extra || null);
  if (u.type === "class") return row("spell_holy_championsgrace", `New class: ${cname}`);
  if (u.type === "heroic") return row("spell_holy_championsgrace", `Heroic ${u.level} for ${cname}`);
  if (u.type === "talent") return row("spell_holy_championsgrace", `+${u.points} talent point${u.points === 1 ? "" : "s"} for ${cname}`);
  if (u.type === "level") return h("div", {}, row("inv_misc_book_09", `${cname} reached level ${u.level}: new cards unlocked`),
    h("div", { class: "sx-end__cards" }, ...(u.cards || []).map((id) => { const d = app.cardDef(id, false); return h("span", {}, ico(d ? d.icon : "inv_misc_questionmark", { size: "xs" }), " ", d ? d.name : id); })));
  if (u.type === "xp") return row("spell_nature_enchantarmor", `+${u.xp} XP${u.nextXp ? ` (next level at ${u.nextXp})` : " (max level)"}`);
  return null;
}

const STAT_ICON = { Act: "inv_misc_map_01", Floors: "inv_boots_cloth_03", Fights: "inv_sword_04", Elites: "inv_misc_bone_humanskull_01", Bosses: "achievement_boss_ragnaros", Cards: "inv_misc_book_09", Relics: "inv_misc_gem_pearl_04", "Gold earned": "inv_misc_coin_17" };

export async function render(app) {
  await cssReady;
  const { run, data, meta, stage } = app;
  stage.setBackdrop(run.zoneId || "default");
  let unlocked = [];
  if (!run.endRecorded) {
    run.endRecorded = true;
    unlocked = recordRunEnd(meta, run, data.classIds, data.unlocks);
    recordRunAggregate(run, meta);
    sp("run_end", { class: run.classId, result: run.result === "victory" ? "victory" : "defeat", act: run.act, floor: run.floor + 1, zone: run.zoneId || "", cause: run.result === "victory" ? "" : encKey(run.pending && run.pending.cause), deck: (run.deck || []).map((c) => c.id), secs: run.startedAt ? Math.round((Date.now() - run.startedAt) / 1000) : 0 });
    funnel("run_end", false);
    if (app.refreshLocks) app.refreshLocks();
    run.unlocked = unlocked;
    track("run_end", { class: run.classId, act: run.act, victory: run.result === "victory" ? 1 : 0, floor: run.floor + 1 });
    clearRun();
  } else unlocked = run.unlocked || [];
  const s = summarize(run, data);
  const win = run.result === "victory";
  const cls = data.classObj(run.classId) || {};
  const stat = (k, v) => h("div", { class: "sx-stat" }, ico(STAT_ICON[k], { size: "sm" }), h("b", {}, v), h("span", {}, k));
  const stats = [["Act", s.act], ["Floors", run.stats.floors], ["Fights", run.stats.fights], ["Elites", run.stats.elites], ["Bosses", run.stats.bosses], ["Cards", s.deck], ["Relics", s.relics], ["Gold earned", run.stats.goldEarned]];
  const screen = h("section", { class: `sx-screen sx-end ${win ? "win" : "lose"}` },
    h("div", { class: "sx-end__hero-col" },
      h("div", { id: "end-hero", class: "sx-end__hero", style: { "--cc": cls.color || "#c9a24b" } },
        ico(cls.icon, { size: "xl", alt: cls.name }),
        h("div", { class: "sx-end__who" }, h("b", { style: { color: cls.color } }, cls.name || "Hero"), h("small", {}, `${run.hp}/${run.maxHp} HP`)))),
    h("div", { class: "sx-end__main" },
      h("div", { class: `sx-end__flag ${win ? "win" : "lose"}` }, h("h1", {}, win ? "Victory" : "Defeat"),
        h("p", {}, win ? "You conquered the spires. Azeroth is safe, for now." : `Fell in ${s.zones[s.zones.length - 1] || "the first spire"} (${(run.pending || {}).cause || "unknown"}).`)),
      scroll("sx-end__stats", h("div", { class: "sx-stats" }, ...stats.map(([k, v]) => stat(k, v))),
        unlocked.length ? h("div", { class: "sx-end__unlock" }, h("h3", {}, "Progress"), ...unlocked.map((u) => unlockRow(app, u))) : null,
        h("p", { class: "sx-end__seed" }, "Seed: ", h("b", {}, run.seed))),
      h("div", { class: "sx-end__btns" },
        btn("Copy seed", async () => { try { await navigator.clipboard.writeText(run.seed); toast("Seed copied."); } catch (e) { toast(run.seed); } }, { size: "sm" }),
        btn(unlocked.some((u) => u.type === "talent") ? "Spend talents" : "Talents", () => { app.run = null; app.hasSave = false; app.go("talents", { cls: run.classId, back: "classSelect" }); }, { size: "sm" }),
        btn("New run", () => { app.run = null; app.hasSave = false; app.go("charSelect"); }, { size: "lg", auto: true }),
        btn("Title", () => { app.run = null; app.hasSave = false; app.go("title"); }, { size: "sm" }))));
  setTimeout(() => mountPortrait(app, screen.querySelector("#end-hero"), { classId: run.classId, race: (run.character || {}).race, gender: (run.character || {}).gender, gearMask: gearLevel(run), pose: win ? "idle" : "death", pad: 120, leaveEl: screen }), 160);
  return screen;
}
