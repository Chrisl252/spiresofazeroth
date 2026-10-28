// Codex (stage-native): everything you have met, with links to the matching TheWoWDB spell / NPC pages. Unseen entries are hidden.
import { h, qClass, cap, fill } from "./dom.js?v=20261028e";
import { spellLink, npcLink } from "../engine/data.js?v=20261028e";
import { cssReady, btn, tog, ico, banner, scroll } from "./kit.js?v=20261028e";
import { SLOT_LABEL, classGear } from "../engine/gear.js?v=20261028e";

export const stageNative = true;

const link = (href, text) => (href ? h("a", { href, target: "_blank", rel: "noopener" }, text || "TheWoWDB page") : null);

export async function render(app) {
  await cssReady;
  const { data, meta, stage } = app;
  stage.setBackdrop("classSelect");
  const seen = meta.codex;
  const st = { tab: "cards", cls: data.classIds[0], zone: null };
  const host = h("section", { class: "sx-screen sx-page" });
  const body = h("div", { class: "sx-codex" });

  const item = (ic, name, sub, href, ok, q) => h("div", { class: `sx-codex__item ${ok ? "" : "unseen"}` }, ico(ok ? ic : "inv_misc_questionmark", { size: "md", q: q || "" }),
    h("div", {}, h("b", { class: q || "" }, ok ? name : "Unknown"), h("span", {}, ok ? sub : "Not discovered yet"), ok ? link(href) : null));

  // paging: a page holds as many entries as fit the sheet, so nothing scrolls
  let all = [], starts = [0], pi = 0;
  const pager = h("div", { class: "sx-pager" });
  function show() {
    if (!body.isConnected) { requestAnimationFrame(show); return; } // measure only once the sheet is in the document
    const start = starts[pi];
    let n = Math.min(all.length - start, 30);
    fill(body, ...all.slice(start, start + n));
    while (n > 1 && body.scrollHeight > body.clientHeight + 1) { n--; fill(body, ...all.slice(start, start + n)); }
    starts[pi + 1] = start + n;
    const prev = btn("Prev", () => { pi--; show(); }, { size: "sm" }), next = btn("Next", () => { pi++; show(); }, { size: "sm" });
    prev.disabled = pi === 0; next.disabled = start + n >= all.length;
    fill(pager, ...(all.length > n ? [prev, h("span", { class: "sx-pager__n" }, `${start + 1}-${start + n} of ${all.length}`), next] : []));
  }
  async function load() {
    fill(body, h("p", { class: "sx-dim" }, "Loading..."));
    const out = [];
    if (st.tab === "cards") {
      await data.loadClass(st.cls);
      for (const c of data.classCards.get(st.cls).values()) {
        if (c.token) continue;
        out.push(item(c.icon, c.name, `${cap(c.type)} - ${cap(c.rarity)}. ${c.text}`, spellLink(c), !!seen.cards[c.id] || c.rarity === "basic", qClass(c.rarity)));
      }
    } else if (st.tab === "gear") {
      await data.loadClass(st.cls);
      const g = classGear(data, st.cls);
      if (g) {
        out.push(h("div", { class: "sx-codex__set" }, h("h3", {}, `${g.set.name} (${g.pieces.length} pieces)`),
          ...g.set.bonuses.map((b) => h("p", {}, h("b", {}, `(${b.pieces}) ${b.name}: `), b.text)), h("p", { class: "sx-dim" }, "Every win drops the next piece: weapon, chest, legs, head, shoulders, hands, feet, waist, wrists. Later drops upgrade what you wear.")));
        for (const p of (g.starter || [])) out.push(item(p.icon, p.name, `${SLOT_LABEL[p.slot]} - Starter. ${p.text}`, null, true, qClass(p.rarity)));
        for (const p of [g.weapon, ...g.pieces].filter(Boolean)) out.push(item(p.icon, p.name, `${SLOT_LABEL[p.slot]} - Tier 1. ${p.text}`, null, true, qClass(p.rarity)));
      }
    } else if (st.tab === "relics") {
      for (const zid of data.zoneIndex.map((z) => z.id)) await data.loadZone(zid);
      for (const r of data.allRelics().filter((x) => x.tier !== 0)) out.push(item(r.icon, r.name, r.text, null, !!seen.relics[r.id], qClass(r.rarity)));
    } else if (st.tab === "enemies") {
      const zid = st.zone || (data.zoneIndex[0] || {}).id;
      const zone = await data.loadZone(zid);
      for (const e of Object.values(zone ? zone.enemyDefs : {})) {
        if (e.summonOnly) continue;
        out.push(item(e.icon, e.name, `${cap(e.tier)} ${cap(e.family)} - Lv ${[].concat(e.level || "?").join("-")}`, npcLink(e), !!seen.enemies[`${zid}:${e.id}`]));
      }
    }
    all = out; starts = [0]; pi = 0; show();
  }
  const draw = () => {
    const tabs = h("div", { class: "sx-tabs", role: "tablist" }, ...["cards", "enemies", "gear", "relics"].map((t) => tog(t === "relics" ? "Jewellery" : cap(t), st.tab === t, () => { st.tab = t; draw(); }, { role: "tab" })));
    const sub = h("div", { class: "sx-subbar" });
    if (st.tab === "cards" || st.tab === "gear") {
      sub.append(h("select", { class: "sx-select", "aria-label": "Class", onChange: (e) => { st.cls = e.target.value; load(); } }, ...data.classIds.map((id) => h("option", { value: id, ...(id === st.cls ? { selected: "" } : {}) }, cap(id)))));
    } else if (st.tab === "enemies") {
      sub.append(h("select", { class: "sx-select", "aria-label": "Zone", onChange: (e) => { st.zone = e.target.value; load(); } }, ...data.zoneIndex.map((z) => h("option", { value: z.id, ...(z.id === (st.zone || data.zoneIndex[0].id) ? { selected: "" } : {}) }, z.name))));
    }
    sub.append(pager);
    fill(host, h("div", { class: "sx-page__top" }, banner("Codex", "Everything you have met on the climb."), btn("Back", () => app.go("title"), { size: "sm", cls: "sx-page__back" })),
      scroll("sx-page__sheet", tabs, sub, body));
    load();
  };
  draw();
  return host;
}
