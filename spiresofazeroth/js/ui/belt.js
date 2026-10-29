// Potion belt for non-combat screens: 3 fixed slots (empty classic slot art when unfilled).
// Allows inspecting, drinking (out-of-combat applicable effects like heal/maxHp), and discarding potions.
//   beltEl(app, { host, onChange }) -> { el, refresh(flash), close() }
import { h, icon, tip, esc, toast, floatText } from "./dom.js?v=20261029d";
import { runEffects } from "../engine/effects.js?v=20261029d";
import { sfx } from "../audio.js?v=20261029d";
import { cardSounds } from "./cardSounds.js?v=20261029d";
import { runBar } from "./runbar.js?v=20261029d";

export function canUsePotionOutOfCombat(pot) {
  if (!pot || !pot.effects) return false;
  const hasOOC = (effs) => effs.some((e) => {
    if (e.op === "heal" || e.op === "max_hp") return true;
    if (e.op === "conditional") {
      return (e.then && hasOOC(e.then)) || (e.else && hasOOC(e.else));
    }
    return false;
  });
  return hasOOC(pot.effects);
}

export function beltEl(app, { host = null, onChange = null } = {}) {
  const el = h("div", { class: "sp-potions2 sp-belt", "aria-label": "Potion belt" });
  let seen = (app.run && app.run.potions) ? app.run.potions.length : 0;
  let activeSlot = null;
  let currentPop = null;

  function closePop() {
    if (currentPop) {
      currentPop.remove();
      currentPop = null;
    }
    activeSlot = null;
    el.querySelectorAll(".sp-pot2").forEach((s) => s.classList.remove("is-sel"));
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onDocKey, true);
  }

  function onDocPointer(e) {
    if (!currentPop) return;
    if (currentPop.contains(e.target) || el.contains(e.target)) return;
    closePop();
  }

  function onDocKey(e) {
    if (!currentPop) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      closePop();
    }
  }

  function handleUse(i, pot) {
    const { run, data } = app;
    if (!run || run.potions[i] !== pot.id) return;

    // Splice potion from belt
    run.potions.splice(i, 1);

    const prevHp = run.hp;
    const prevMax = run.maxHp;

    // Apply out-of-combat effects (runMode)
    runEffects({ run, data, src: null, srcKind: "potion" }, pot.effects);

    const healed = Math.max(0, run.hp - prevHp);
    const maxGained = Math.max(0, run.maxHp - prevMax);

    // Audio feedback
    try {
      cardSounds.ui("heal");
    } catch {
      sfx.play("coinSmall", { volume: 0.6 });
    }

    // Floating text + toast feedback
    if (healed > 0 && maxGained > 0) {
      toast(`+${maxGained} Max HP · Healed for ${healed} HP`);
    } else if (maxGained > 0) {
      toast(`+${maxGained} Max HP`);
    } else if (healed > 0) {
      toast(`Healed for ${healed} HP`);
    } else {
      toast(`Used ${pot.name}`);
    }

    if (healed > 0) {
      const floatTarget = host || el.closest(".sx-screen") || document.body;
      floatText(floatTarget, `+${healed}`, "heal");
    }

    // Update top runbar if mounted
    const bar = (host || document).querySelector(".sx-bar");
    if (bar) bar.replaceWith(runBar(app));

    app.save();
    refresh(false);
    if (onChange) onChange({ action: "use", pot, idx: i, healed, maxGained });
  }

  function handleDiscard(i, pot) {
    const { run } = app;
    if (!run || run.potions[i] !== pot.id) return;

    // Splice potion from belt
    run.potions.splice(i, 1);

    try {
      cardSounds.ui("cardPlay");
    } catch {
      sfx.play("coinSmall", { volume: 0.6 });
    }
    toast(`Discarded ${pot.name}`);

    // Update top runbar if mounted
    const bar = (host || document).querySelector(".sx-bar");
    if (bar) bar.replaceWith(runBar(app));

    app.save();
    refresh(false);
    if (onChange) onChange({ action: "discard", pot, idx: i });
  }

  function openPop(i, pot, wrap) {
    closePop();
    activeSlot = i;

    // Hide any lingering hover tooltip
    const tipEl = document.querySelector(".sp-tip");
    if (tipEl) tipEl.style.display = "none";

    const slotBtn = wrap.querySelector(".sp-pot2");
    if (slotBtn) slotBtn.classList.add("is-sel");

    const usable = canUsePotionOutOfCombat(pot);
    const pop = h("div", {
      class: `sp-pot-popover sp-pot-menu sp-pot-popover--slot-${i}`,
      role: "menu",
      "aria-label": `${pot.name} actions`,
      onClick: (e) => e.stopPropagation()
    });

    // Tactile action pills (Slay the Spire / Classic WoW style: Drink & Discard only)
    const useBtn = h("button", {
      class: `sp-pot-popover__btn sp-pot-popover__btn--use ${usable ? "is-usable" : "is-disabled"}`,
      type: "button",
      disabled: !usable,
      title: usable ? "Drink this potion" : "Cannot be used out of combat",
      onClick: (e) => {
        e.stopPropagation();
        if (!usable) return;
        closePop();
        handleUse(i, pot);
      }
    }, usable ? "Drink" : "In Combat Only");

    const discardBtn = h("button", {
      class: "sp-pot-popover__btn sp-pot-popover__btn--discard",
      type: "button",
      title: "Discard this potion",
      onClick: (e) => {
        e.stopPropagation();
        closePop();
        handleDiscard(i, pot);
      }
    }, "Discard");

    pop.append(useBtn, discardBtn);
    wrap.append(pop);
    currentPop = pop;

    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onDocKey, true);
  }

  function refresh(flash = false) {
    closePop();
    const { run, data } = app;
    el.replaceChildren();

    for (let i = 0; i < 3; i++) {
      const id = run && run.potions ? run.potions[i] : null;
      const pot = id && data.potion(id);
      const wrap = h("div", { class: "sp-pot2-wrap" });

      const s = h("button", {
        class: `sp-pot2 ${pot ? "" : "is-empty"} ${activeSlot === i ? "is-sel" : ""}`,
        type: "button",
        "aria-label": pot ? pot.name : "Potion slot (empty)",
        onClick: (e) => {
          e.stopPropagation();
          if (!pot) return;
          if (activeSlot === i) {
            closePop();
          } else {
            openPop(i, pot, wrap);
          }
        }
      }, pot ? icon(pot.icon, "", pot.name) : null);

      tip(s, pot ? `<b>${esc(pot.name)}</b><br>${esc(pot.text)}` : "Potion slot (empty)");
      if (pot && flash && i >= seen) s.classList.add("pot-flash");

      wrap.append(s);
      el.append(wrap);
    }
    seen = (run && run.potions) ? run.potions.length : 0;
  }

  refresh(false);
  return { el, refresh, close: closePop };
}
