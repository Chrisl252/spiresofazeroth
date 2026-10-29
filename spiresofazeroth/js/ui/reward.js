// Post-combat rewards (stage-native): gold / potion / relic plates, then cards fanned out under a gold banner. Also the treasure chest.
import { sp } from "../analytics.js?v=20261029a";
import { h, icon, qClass, esc, toast, fill } from "./dom.js?v=20261029a";
import { takeCard, takePotion, takeRelic, leaveNode } from "../engine/run.js?v=20261029a";
import { cssReady, btn, banner, plate, cardSlot, ico, tip } from "./kit.js?v=20261029a";
import { runBar } from "./runbar.js?v=20261029a";
import { needsLoot, showLoot, buildLootFrame } from "./loot.js?v=20261029a";
import { getKit, clearStage } from "./combatKit.js?v=20261029a";
import { gearLevel } from "../engine/gear.js?v=20261029a";
import { goesToBag, SLOT_LABEL, wouldReplace } from "../engine/gear.js?v=20261029a";
import { beltEl } from "./belt.js?v=20261029a";

export const stageNative = true;

// one analytics row per card reward: what was offered and what (if anything) was taken
function logPick(pd, run, picked) {
  if (pd.cardLogged || !pd.cards || !pd.cards.length) return;
  pd.cardLogged = true;
  sp("card_reward", { offered: pd.cards, picked: picked || null, act: run.act, floor: run.floor + 1 });
}

export function relicBtn(app, id, onClick, extra = null) {
  const r = app.data.relic(id) || { name: id, text: "", icon: null, rarity: "common" };
  const old = r.slot ? app.data.relic(wouldReplace(app.run, app.data, id)) : null; // gear: a free/starter socket equips, worn gear is never displaced
  const note = r.slot ? h("span", { class: "sx-plate__slot" }, `${SLOT_LABEL[r.slot] || ""}${goesToBag(app.run, app.data, id) ? " - goes to your Gear Bag" : old ? ` - replaces ${old.name}` : ""}`) : null;
  return plate({ ic: r.icon, title: r.name, text: r.text, onClick, q: qClass(r.rarity), extra: extra || note, cls: "sx-plate--relic", size: "sm" });
}

const FAN = (i, n) => (n === 1 ? 0 : -7 + (14 * i) / (n - 1));

export async function render(app, name) {
  await cssReady;
  const { run, data, stage } = app;
  if (!run || !run.pending) {
    if (run) run.screen = "map";
    return app.go("map");
  }
  stage.setBackdrop(run.zoneId || "default");
  const pd = run.pending;
  const host = h("section", { class: "sx-screen sx-reward" });
  const go = async () => { await leaveNode(run, data); app.save(); app.route(); };
  const redraw = () => fill(host, ...build());
  const goldPlate = (n) => plate({ ic: "inv_misc_coin_17", title: `${n} gold`, text: "Added to your purse.", cls: "sx-plate--gold sx-plate--static", size: "sm" });

  function build() {
    host.classList.toggle("sx-reward--dense", !!(pd.relicChoose && pd.relics && pd.relics.length && !(pd.taken && pd.taken.relic)));
    if (name === "treasure") {
      const taken = pd.taken || !pd.relic;
      return [runBar(app), h("div", { class: "sx-reward__body" },
        banner("Treasure", "The chest creaks open."),
        h("div", { class: "sx-loot" }, goldPlate(pd.gold), pd.gear && app.data.relic(pd.gear.id) ? plate({ ic: app.data.relic(pd.gear.id).icon, title: app.data.relic(pd.gear.id).name, text: `${SLOT_LABEL[app.data.relic(pd.gear.id).slot] || ""}: ${pd.gear.bagged ? "in your Gear Bag" : "equipped"}. ${app.data.relic(pd.gear.id).text}`, q: qClass(app.data.relic(pd.gear.id).rarity), cls: "sx-plate--relic sx-plate--static", size: "sm" }) : null, pd.relic && !pd.taken ? relicBtn(app, pd.relic, () => { takeRelic(run, data, pd.relic); app.save(); redraw(); }) : null),
        taken ? h("p", { class: "sx-reward__note" }, pd.relic ? "Relic taken." : "The chest holds nothing else.") : h("p", { class: "sx-reward__note" }, "Take the relic, then press on."),
        h("div", { class: "sx-reward__go" }, btn("Continue", go, { size: "lg", auto: true })))];
    }
    return victoryScreen();
  }

  // ---- VICTORY: one screen. LEFT = choose a card, RIGHT = the LootFrame with every drop (gold / relic / potion / gear), belt under it. ----
  function victoryScreen() {
    host.classList.add("sx-victory");
    const title = pd.tier === "boss" || pd.tier === "raid" ? "Boss slain" : pd.tier === "elite" ? "Elite slain" : "Victory";
    const reduced = app.reduced();
    const decided = () => pd.taken.card || !pd.cards.length;
    const left = h("div", { class: "sv-left" });
    const goBtn = btn("Continue", async () => { if (!decided()) { logPick(pd, run, null); pd.taken.card = true; pd.pickedCard = null; } loot.takeAll(); await new Promise((r) => setTimeout(r, reduced ? 0 : 160)); go(); }, { size: "lg", auto: true });
    const hint = h("p", { class: "sv-hint" });
    let loot = null;
    const belt = beltEl(app, {
      host,
      onChange: () => {
        const bar = host.querySelector(".sx-bar");
        if (bar) bar.replaceWith(runBar(app));
        if (loot && loot.refresh) loot.refresh();
        sync();
      }
    });
    loot = buildLootFrame(app, pd, { tag: "Spoils", onTake: (kind) => { app.save(); if (kind === "potion") belt.refresh(true); sync(); } });
    loot.foot.prepend(belt.el);
    function sync() {
      // StS: Proceed is never gated on the card pick; leaving without choosing simply skips it (the relic choice still has to be made)
      const choosing = loot.pending();
      goBtn.disabled = choosing;
      goBtn.classList.toggle("is-ready", !goBtn.disabled);
      hint.textContent = choosing ? "Choose one piece of loot, or Pass." : !decided() ? "Choose a card, or continue without one." : "Take what you want, then continue.";
    }
    function paintLeft() {
      left.replaceChildren();
      if (!pd.cards.length) { left.append(h("h3", { class: "sx-ribbon sx-ribbon--gold" }, "No card this time")); return; }
      left.append(h("h3", { class: "sx-ribbon sx-ribbon--gold" }, pd.taken.card ? "Added to your deck" : "Choose a card"));
      if (pd.taken.card) { left.append(h("p", { class: "sv-done" }, pd.pickedCard ? `${app.cardDef(pd.pickedCard, false).name} joins your deck.` : "Card skipped.")); return; }
      const fan = h("div", { class: "sx-fan" });
      pd.cards.forEach((id, i) => {
        const slot = cardSlot(app.cardDef(id, false), { cls: "sp-card--pick", data, onClick: () => pick(id, slot, fan) }, { rot: FAN(i, pd.cards.length), delay: 90 * i });
        fan.append(slot);
      });
      left.append(fan, h("div", { class: "sv-skip" }, btn("Skip card", () => { logPick(pd, run, null); pd.taken.card = true; pd.pickedCard = null; app.save(); paintLeft(); sync(); }, { size: "sm", cls: "sx-btn-quiet" })));
    }
    function pick(id, slot, fan) {
      if (fan.dataset.busy) return; fan.dataset.busy = "1";
      fan.querySelectorAll(".sx-cardslot").forEach((c) => { if (c !== slot) { c.style.pointerEvents = "none"; if (c.animate && !reduced) c.animate([{ opacity: 1 }, { opacity: 0, translate: "0 40px" }], { duration: 320, fill: "forwards" }); else c.style.opacity = 0; } });
      const fin = () => { logPick(pd, run, id); takeCard(run, id); pd.pickedCard = id; app.save(); const dk = host.querySelector(".sx-bar__deck"); if (dk) { dk.textContent = `Deck ${run.deck.length}`; dk.classList.remove("sv-pulse"); void dk.offsetWidth; dk.classList.add("sv-pulse"); } paintLeft(); sync(); };
      const tgt = host.querySelector(".sx-bar__deck");
      if (reduced || !tgt || !slot.animate) return fin();
      const a = slot.getBoundingClientRect(), t = tgt.getBoundingClientRect(), sc = app.stage.scale || 1;
      const dx = (t.left + t.width / 2 - (a.left + a.width / 2)) / sc, dy = (t.top + t.height / 2 - (a.top + a.height / 2)) / sc;
      slot.style.zIndex = 60; slot.style.pointerEvents = "none";
      slot.animate([{ translate: "0 0", scale: 1, opacity: 1 }, { translate: `${dx * 0.3}px ${dy * 0.15 - 60}px`, scale: 1.1, opacity: 1, offset: 0.3 }, { translate: `${dx}px ${dy}px`, scale: 0.12, opacity: 0.15 }], { duration: 640, easing: "cubic-bezier(.5,0,.75,.5)", fill: "forwards" }).finished.then(fin, fin);
    }
    paintLeft(); sync();
    const ban = banner(title, "Spoils of the fight", { cls: "sv-banner" });
    const right = h("div", { class: "sv-right" }, loot.el, hint, h("div", { class: "sx-reward__go" }, goBtn));
    stageClear(app);
    return [runBar(app), ban, h("div", { class: "sv-main" }, left, right)];
  }

  // the stage after the win: dead enemies gone, the hero stays
  async function stageClear(app) {
    try { const kit = await getKit(app); if (kit && kit.actors) { clearStage(kit); kit.actors.setHero({ classId: run.classId, race: (run.character || {}).race, gender: (run.character || {}).gender, gearMask: gearLevel(run) }); } } catch (e) { /* stage kit optional */ }
  }
  if (name === "treasure" && needsLoot(pd)) showLoot(app, host, pd, () => (pd.relic && !pd.taken ? redraw() : go())).catch((e) => { console.warn("[spires] loot screen failed", e && e.message); pd.lootSeen = true; redraw(); }); // gear: chest + loot burst first
  else redraw();
  return host;
}
