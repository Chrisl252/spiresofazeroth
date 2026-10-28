// Decision screens (stage-native): next zone (three art cards), raid floor, final boss, zone-mechanic (pylon) choice.
import { h, icon, cap, toast } from "./dom.js?v=20261028e";
import { chooseZone, enterRaidFloor, proceedAfterSpire, chooseFinalBoss, chooseMechanic } from "../engine/run.js?v=20261028e";
import { cssReady, banner, plate, ico, zoneArt, ART, scroll } from "./kit.js?v=20261028e";
import { runBar } from "./runbar.js?v=20261028e";

export const stageNative = true;
const CONT = { ek: "Eastern Kingdoms", kal: "Kalimdor" };
const firstSentence = (s, n = 150) => { const t = String(s || "").replace(/\s+/g, " ").trim(); const m = t.match(/^.{20,}?[.!?](\s|$)/); const r = m ? m[0].trim() : t; return r.length > n ? `${r.slice(0, n - 1).trim()}...` : r; };

async function zoneCard(app, id, i, go) {
  const { data } = app;
  const z = data.zone(id) || { name: (data.zoneEntry(id) || {}).name || id }, e = data.zoneEntry(id) || {};
  const art = await zoneArt(id);
  const sp = z.spire || {}, mech = z.zoneMechanic || {}, th = (art && art.theme) || z.theme || {};
  const c = h("button", { class: "sx-zone", type: "button", style: { "--za": th.accent || "#d9b25c", "--zp": th.primary || "#3f6b2a", "--i": i }, ...(i === 0 ? { "data-autofocus": "" } : {}), onClick: go, "aria-label": `${z.name}, ${CONT[e.continent] || ""}` },
    h("div", { class: "sx-zone__art" }, art ? h("img", { src: `${ART}${art.fdid}.jpg`, alt: "", loading: "eager", style: { "--band": (art.crop || [0, 1])[1] - (art.crop || [0, 1])[0], "--c0": (art.crop || [0, 1])[0] } }) : null),
    h("div", { class: "sx-zone__shade" }),
    h("span", { class: `sx-zone__ribbon ${e.continent || ""}` }, CONT[e.continent] || z.continent || ""),
    h("div", { class: "sx-zone__meta" },
      h("h3", {}, z.name), h("b", {}, sp.name || ""),
      h("p", {}, firstSentence(sp.lore)),
      h("div", { class: "sx-zone__foot" }, mech.icon ? ico(mech.icon, { size: "xs" }) : null, h("span", {}, mech.name ? `Mechanic: ${mech.name}` : ""))));
  return c;
}

export async function render(app, name) {
  await cssReady;
  const { run, data, stage } = app;
  const pd = run.pending;
  app.save(); // persist the run the moment a decision screen shows: backing out / reloading here must resume this exact point, not an older save
  const go = () => { app.save(); app.route(); };
  const host = h("section", { class: `sx-screen sx-pickscreen sx-pickscreen--${name}` });
  const head = (t, sub) => banner(t, sub);

  if (name === "zonepick") {
    stage.setBackdrop("map", { tint: { primary: "#d9b25c", secondary: "#241708", accent: "#f0d68a" } });
    const cards = await Promise.all(pd.options.map((id, i) => zoneCard(app, id, i, async () => { try { if (app.coop && !app.coop.lead("zone", id)) return; if (!(await chooseZone(run, data, id))) throw new Error("zone unavailable: " + id); go(); } catch (err) { console.error("[spires] choose zone failed:", err); toast("Could not enter that zone - pick again."); } })));
    host.append(runBar(app), head(`Act ${run.act + 1}: choose your next spire`, "Each zone has its own enemies, events and mechanic."), h("div", { class: "sx-zones" }, ...cards));
    return host;
  }
  stage.setBackdrop(run.zoneId || "default");
  const list = h("div", { class: "sx-opts" });
  let title, sub = null;
  if (name === "raidchoice") {
    const zone = data.zone(run.zoneId);
    pd.floors.forEach((fid, i) => {
      const f = zone.raidFloors.find((x) => x.id === fid);
      list.append(plate({ ic: "achievement_dungeon_ulduar77_25man", title: f.name, text: `${f.lore || "An optional dungeon floor."}${f.optional ? " (Optional, dangerous)" : ""} Bonus rewards.`.slice(0, 220), onClick: () => { if (app.coop && !app.coop.lead("raid", fid)) return; if (enterRaidFloor(run, data, fid)) go(); }, auto: i === 0, size: "lg", cls: "sx-plate--big" }));
    });
    list.append(plate({ ic: "spell_holy_divineintervention", title: "Skip the dungeon", text: "Move on to the next zone.", onClick: async () => { if (app.coop && !app.coop.lead("skipraid")) return; await proceedAfterSpire(run, data); go(); }, size: "lg", cls: "sx-plate--big" }));
    title = "An optional dungeon floor"; sub = "Clear it for a boss reward, but your HP carries over.";
  } else if (name === "bosschoice") {
    pd.options.forEach((id, i) => {
      const b = data.finalBosses.find((x) => x.id === id);
      list.append(plate({ ic: b.icon, title: b.name, text: `${cap(b.family)} - ${b.note || "A raid boss."}`, onClick: () => { if (app.coop && !app.coop.lead("boss", id)) return; chooseFinalBoss(run, data, id); go(); }, auto: i === 0, size: "lg", cls: "sx-plate--big sx-plate--boss", ring: "red" }));
    });
    title = pd.options.length > 1 ? "Choose your final foe" : "The final foe awaits";
  } else {
    const zm = data.zone(run.zoneId).zoneMechanic;
    for (const [i, c] of zm.choices.entries()) list.append(plate({ ic: c.icon, title: c.name, text: c.text, onClick: () => { chooseMechanic(run, data, c.id); go(); }, auto: i === 0, size: "lg", cls: "sx-plate--big" }));
    title = zm.name; sub = zm.text;
  }
  host.append(runBar(app), scroll("sx-choice__sheet", head(title, sub), list));
  return host;
}
