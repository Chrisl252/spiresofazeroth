// Talents (stage-native): the classic three-tree talent sheet per class, paid with points earned by climbing (engine/talents.js),
// plus the card-unlock ladder (class level from XP; data/unlocks.json). Left click learns a rank, right click unlearns one.
import { h, icon, tip, esc, fill, cap } from "./dom.js?v=20261029d";
import { saveMeta } from "../engine/save.js?v=20261029d";
import { cssReady, btn, tog, ico, banner, scroll, dark } from "./kit.js?v=20261029d";
import { talentEffects, valueAt } from "../engine/talentHookDefs.js?v=20261029d";
import { TALENT_LIMITS, SOFT_RATE, repairSpent, EFFECTS, TALENT_CAP, TIER_STEP, FLOORS_PER_POINT, POINTS_PER_ACT, VICTORY_BONUS, talentState, treeSpent, pointsBelow, canLearn, learn, unlearn, resetTalents, talentMods, talentSummary, classLevel, nextLevelXp, lockedCardIds } from "../engine/talents.js?v=20261029d";

export const stageNative = true;

export async function render(app, _name, props = {}) {
  await cssReady;
  const { data, meta, stage } = app;
  stage.setBackdrop("classSelect");
  const ids = data.classIds;
  const st = { cls: props.cls && ids.includes(props.cls) ? props.cls : meta.lastClass && ids.includes(meta.lastClass) ? meta.lastClass : ids[0] };
  const back = () => app.go(props.back || "title", props.backProps);
  const host = h("section", { class: "sx-screen sx-tal" });
  const tabs = h("div", { class: "sx-tal__tabs", role: "tablist", "aria-label": "Class" });
  const body = h("div", { class: "sx-tal__body" });
  const foot = h("div", { class: "sx-tal__foot" });
  await Promise.all(ids.map((id) => Promise.all([data.loadClass(id), data.loadTalents(id)])));

  for (const id of ids) if (repairSpent(meta, id, data.talentDefs.get(id))) saveMeta(meta); // Talents V2: clamp saved ranks, refund the difference
  const save = () => { saveMeta(meta); if (app.refreshLocks) app.refreshLocks(); };
  const unspent = (cid) => talentState(meta, cid).available;

  function drawTabs() {
    fill(tabs, ...ids.map((id) => {
      const c = data.classObj(id) || { name: cap(id) };
      const n = unspent(id);
      const t = tog([icon(c.icon, "sx-tog__i", ""), " ", c.name, n > 0 ? h("b", { class: "sx-tal__badge" }, String(n)) : null], id === st.cls, () => { st.cls = id; draw(); }, { role: "tab" });
      t.style.setProperty("--cc", c.color || "#c9a24b");
      return t;
    }));
  }

  function talentTip(state, tree, t) {
    const r = state.spent[t.id] | 0, e = EFFECTS[t.effect.key] || { label: t.effect.key, text: (v) => `+${v}` };
    const lines = [`<b>${esc(t.name)}</b>`, `<span class="sp-dim">Rank ${r}/${t.max}</span>`];
    // every effect of the talent (V2 hooks may carry extras); the numbers come from the same table the engine reads (valueAt)
    const say = (rank) => talentEffects(t).map((x) => { const d = EFFECTS[x.key] || e; return rank > 0 ? d.text(valueAt(x, rank), x) : ""; }).filter(Boolean);
    if (r > 0) say(r).forEach((s) => lines.push(esc(s)));
    if (r < t.max) say(r + 1).forEach((s, i) => lines.push(`<span class="sx-tal__next">${i === 0 ? "Next rank: " : ""}${esc(s)}</span>`));
    const why = canLearn(state, tree, t);
    if (why && r < t.max) lines.push(`<span class="sx-tal__why">${esc(why)}</span>`);
    if (r > 0) lines.push(`<span class="sp-dim">Right click to unlearn.</span>`);
    return lines.join("<br>");
  }

  function treePanel(cid, tdef, tree, state) {
    const spent = treeSpent(state, tree);
    const tiers = Math.max(...tree.talents.map((t) => t.tier));
    const grid = h("div", { class: "sx-tal__grid", style: { "--tiers": tiers } });
    for (let tier = 1; tier <= tiers; tier++) {
      const need = TIER_STEP * (tier - 1);
      grid.append(h("span", { class: `sx-tal__tier ${pointsBelow(state.spent, tree, tier) >= need ? "on" : ""}` }, need ? String(need) : ""));
      for (const t of tree.talents.filter((x) => x.tier === tier).sort((a, b) => a.col - b.col)) {
        const r = state.spent[t.id] | 0;
        const why = canLearn(state, tree, t);
        const cls = r >= t.max ? "max" : !why ? "open" : r > 0 ? "part" : "locked";
        const b = h("button", { class: `sx-tal__t ${cls}`, type: "button", "aria-label": `${t.name}, rank ${r} of ${t.max}`,
          onClick: () => { if (learn(meta, cid, tree, t)) { save(); draw(); } },
          onContextmenu: (ev) => { ev.preventDefault(); if (unlearn(meta, cid, tree, t)) { save(); draw(); } } },
          ico(t.icon, { size: "sm" }), h("b", { class: "sx-tal__rank" }, `${r}/${t.max}`));
        tip(b, talentTip(state, tree, t));
        grid.append(b);
      }
    }
    return dark("sx-tal__tree", h("div", { class: "sx-tal__th" }, ico(tree.icon, { size: "sm" }), h("h3", {}, tree.name), h("span", {}, `${spent} pt${spent === 1 ? "" : "s"}`)), grid);
  }

  function ladder(cid, cobj) {
    const unl = data.unlocks, th = (unl && unl.thresholds) || [];
    const lvl = classLevel(meta, cid, th), next = nextLevelXp(meta, cid, th);
    const p = (meta.progress && meta.progress[cid]) || { xp: 0, runs: 0, wins: 0 };
    const prevT = lvl > 0 ? th[lvl - 1] : 0, span = next ? next - prevT : 1, pct = next ? Math.round(100 * Math.min(1, ((p.xp | 0) - prevT) / span)) : 100;
    const tiers = (unl && unl.classes && unl.classes[cid]) || [];
    const locked = lockedCardIds(meta, unl);
    const rows = tiers.map((cards, i) => h("div", { class: `sx-tal__ul ${lvl > i ? "on" : ""}` },
      h("b", {}, `Level ${i + 1}`), h("span", {}, lvl > i ? "Unlocked" : `${th[i]} XP`),
      h("div", { class: "sx-tal__cards" }, ...cards.map((id) => {
        const def = app.cardDef(id, false) || { name: cap(id), icon: "inv_misc_questionmark" };
        const open = !locked.has(id);
        const chip = h("span", { class: `sx-chip ${open ? "" : "locked"}`, tabindex: "0" }, ico(open ? def.icon : "inv_misc_questionmark", { size: "xs" }), h("small", {}, open ? def.name : "???"));
        if (open) tip(chip, `<b>${esc(def.name)}</b><br>${esc(def.text || "")}`);
        return chip;
      }))));
    const state = talentState(meta, cid);
    const mods = talentMods(meta, cid, data.talentDefs.get(cid));
    return scroll("sx-tal__side", h("div", { class: "sx-tal__inner" },
      h("div", { class: "sx-tal__who", style: { "--cc": cobj.color || "#c9a24b" } }, ico(cobj.icon, { size: "md", alt: cobj.name }), h("div", {}, h("h2", {}, cobj.name), h("p", {}, `Level ${lvl}${next ? "" : " (max)"}  |  ${p.runs | 0} run${p.runs === 1 ? "" : "s"}, ${p.wins | 0} win${p.wins === 1 ? "" : "s"}`))),
      h("div", { class: "sx-tal__xp" }, h("i", { style: { width: `${pct}%` } }), h("span", {}, next ? `${p.xp | 0} / ${next} XP` : `${p.xp | 0} XP`)),
      h("div", { class: "sx-tal__pts" }, h("b", {}, String(state.available)), h("span", {}, `unspent of ${state.earned} / ${TALENT_CAP} talent points`)),
      h("p", { class: "sx-tal__sum" }, mods ? talentSummary(mods) : "No talents learned yet. Spend points on the left; every rank is active from your next run."),
      mods && Object.entries(TALENT_LIMITS).some(([k, c]) => c > 1 && mods[k] >= c) ? h("p", { class: "sx-tal__how" }, `Past its soft cap, a stat keeps growing at +1 for every ${SOFT_RATE} more. Energy and card draw stay at +1.`) : null,
      h("h4", {}, "Card unlocks"), ...rows,
      meta.settings.unlockAll ? h("p", { class: "sx-dim" }, "Unlock all cards is on in Settings.") : null,
      h("p", { class: "sx-tal__how" }, `How to earn: +1 talent point per ${FLOORS_PER_POINT} floors cleared, +${POINTS_PER_ACT} per act cleared, +${VICTORY_BONUS} for beating the final boss (up to ${TALENT_CAP}). XP: 1 per floor, 10 per act, 40 per victory.`)));
  }

  function draw() {
    drawTabs();
    const cid = st.cls, cobj = data.classObj(cid) || { name: cap(cid) }, tdef = data.talentDefs.get(cid);
    const state = talentState(meta, cid);
    if (!tdef) { fill(body, h("p", { class: "sx-dim" }, "No talent data for this class yet.")); return; }
    fill(body, h("div", { class: "sx-tal__trees" }, ...tdef.trees.map((tree) => treePanel(cid, tdef, tree, state))), ladder(cid, cobj));
    fill(foot,
      h("span", { class: "sx-tal__hint" }, "Left click learns a rank, right click unlearns. Each row needs 5 points in that tree."),
      btn("Reset talents", () => { resetTalents(meta, cid); save(); draw(); }, { size: "sm", disabled: !state.used }));
  }
  draw();
  fill(host,
    h("div", { class: "sx-cls__top" }, banner("Talents", `Points come from climbing: 1 per ${FLOORS_PER_POINT} floors cleared, more for each act and a victory.`), btn("Back", back, { size: "sm", cls: "sx-cls__back", auto: true })),
    tabs, body, foot);
  return host;
}
