// Dedicated Combat Controller Scheme (Slay the Spire style console mapping).
export const combatCtrl = {
  mode: "hand", // "hand" | "aim" | "potion" | "pending"
  handIndex: 0,
  targetUid: null,
  potionSlot: 0,
  pendingIndex: 0,
  inspecting: false,
};

export function getCombatEnemies(app) {
  const C = app && app._combat ? app._combat.C : (app ? app.C : null);
  if (!C || !C.enemies) return [];
  return C.enemies.filter((e) => e && e.hp > 0 && !e.dead);
}

export function syncCombatHandSelection(app, setFocusFn) {
  const combat = app && app._combat;
  if (!combat || !combat.hand) return;
  const cards = combat.hand.cards ? combat.hand.cards() : [];
  if (!cards.length) return;

  combatCtrl.handIndex = Math.max(0, Math.min(combatCtrl.handIndex, cards.length - 1));
  const card = cards[combatCtrl.handIndex];
  if (card) {
    combat.hand.hoverCard(card.uid);
    const els = combat.hand.cardElements ? combat.hand.cardElements() : [];
    if (els[combatCtrl.handIndex] && setFocusFn) {
      setFocusFn(els[combatCtrl.handIndex]);
    }
  }
}

export function handleCombatInput(action, app, setFocusFn, rumbleFn, updateHudFn) {
  const combat = app && app._combat;
  if (!combat) return;

  const C = combat.C;
  const hand = combat.hand;
  const all = getCombatEnemies(app);
  const living = all.some((e) => !e.st.stealth) ? all.filter((e) => !e.st.stealth) : all; // stealthed enemies are skipped while a visible one remains

  // Scry / Discard selection
  if (C.pending && C.pending.length > 0) {
    combatCtrl.mode = "pending";
    const pendingCards = Array.from(document.querySelectorAll(".sp-pending__row .sp-card"));
    if (action === "left") {
      combatCtrl.pendingIndex = Math.max(0, combatCtrl.pendingIndex - 1);
      if (pendingCards[combatCtrl.pendingIndex] && setFocusFn) setFocusFn(pendingCards[combatCtrl.pendingIndex]);
    } else if (action === "right") {
      combatCtrl.pendingIndex = Math.min(pendingCards.length - 1, combatCtrl.pendingIndex + 1);
      if (pendingCards[combatCtrl.pendingIndex] && setFocusFn) setFocusFn(pendingCards[combatCtrl.pendingIndex]);
    } else if (action === "a") {
      if (pendingCards[combatCtrl.pendingIndex]) pendingCards[combatCtrl.pendingIndex].click();
    } else if (action === "y" || action === "start") {
      const confirmBtn = document.querySelector(".sp-pending button");
      if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
    }
    if (updateHudFn) updateHudFn("combat", "pending");
    return;
  }

  // Combat Mode: AIMING
  if (combatCtrl.mode === "aim") {
    if (action === "b" || action === "start") {
      combatCtrl.mode = "hand";
      hand.cancel();
      combat.clearAimPreview();
      if (rumbleFn) rumbleFn("tap");
      syncCombatHandSelection(app, setFocusFn);
      if (updateHudFn) updateHudFn("combat", "hand");
      return;
    }

    if (action === "left" || action === "up") {
      if (living.length > 1) {
        const curIdx = living.findIndex((e) => e.uid === combatCtrl.targetUid);
        const nextIdx = (curIdx - 1 + living.length) % living.length;
        combatCtrl.targetUid = living[nextIdx].uid;
        hand.setAimTarget(combatCtrl.targetUid);
        const selCard = hand.cards()[combatCtrl.handIndex];
        if (selCard) combat.aimPreview(selCard, combatCtrl.targetUid);
        if (rumbleFn) rumbleFn("tap");
      }
      return;
    }

    if (action === "right" || action === "down") {
      if (living.length > 1) {
        const curIdx = living.findIndex((e) => e.uid === combatCtrl.targetUid);
        const nextIdx = (curIdx + 1) % living.length;
        combatCtrl.targetUid = living[nextIdx].uid;
        hand.setAimTarget(combatCtrl.targetUid);
        const selCard = hand.cards()[combatCtrl.handIndex];
        if (selCard) combat.aimPreview(selCard, combatCtrl.targetUid);
        if (rumbleFn) rumbleFn("tap");
      }
      return;
    }

    if (action === "a") {
      if (combatCtrl.targetUid) {
        const target = combatCtrl.targetUid;
        combatCtrl.mode = "hand";
        const played = hand.playSelected(target);
        if (played !== false && rumbleFn) {
          rumbleFn("medium");
        }
        combat.clearAimPreview();
        setTimeout(() => syncCombatHandSelection(app, setFocusFn), 200);
        if (updateHudFn) updateHudFn("combat", "hand");
      }
      return;
    }
    return;
  }

  // Combat Mode: POTION BELT
  if (combatCtrl.mode === "potion") {
    const slots = Array.from(document.querySelectorAll(".sp-hud__belt .sp-belt__slot"));
    if (action === "left") {
      combatCtrl.potionSlot = Math.max(0, combatCtrl.potionSlot - 1);
      if (slots[combatCtrl.potionSlot] && setFocusFn) setFocusFn(slots[combatCtrl.potionSlot]);
      return;
    }
    if (action === "right") {
      combatCtrl.potionSlot = Math.min(slots.length - 1, combatCtrl.potionSlot + 1);
      if (slots[combatCtrl.potionSlot] && setFocusFn) setFocusFn(slots[combatCtrl.potionSlot]);
      return;
    }
    if (action === "down" || action === "b") {
      combatCtrl.mode = "hand";
      syncCombatHandSelection(app, setFocusFn);
      if (updateHudFn) updateHudFn("combat", "hand");
      return;
    }
    if (action === "a") {
      const run = app.run;
      const pots = run ? run.potions : [];
      const pot = pots[combatCtrl.potionSlot];
      if (pot) {
        if (pot.target === "enemy" && living.length > 0) {
          combatCtrl.mode = "aim";
          combatCtrl.targetUid = living[0].uid;
          if (slots[combatCtrl.potionSlot]) {
            hand.aimFrom(slots[combatCtrl.potionSlot], {
              color: "#b48cff",
              onDrop: (uid) => { combat.usePotion(combatCtrl.potionSlot, uid); combatCtrl.mode = "hand"; syncCombatHandSelection(app, setFocusFn); },
              onCancel: () => { combatCtrl.mode = "hand"; syncCombatHandSelection(app, setFocusFn); }
            });
            hand.setAimTarget(combatCtrl.targetUid);
          }
          if (rumbleFn) rumbleFn("light");
          if (updateHudFn) updateHudFn("combat", "aim");
          return;
        } else {
          combat.usePotion(combatCtrl.potionSlot);
          if (rumbleFn) rumbleFn("medium");
          combatCtrl.mode = "hand";
          setTimeout(() => syncCombatHandSelection(app, setFocusFn), 200);
          if (updateHudFn) updateHudFn("combat", "hand");
          return;
        }
      }
    }
    return;
  }

  // Combat Mode: HAND
  if (combatCtrl.mode === "hand") {
    const cards = hand.cards ? hand.cards() : [];
    if (!cards.length) return;

    if (action === "left") {
      if (combatCtrl.handIndex > 0) {
        combatCtrl.handIndex--;
        syncCombatHandSelection(app, setFocusFn);
        if (rumbleFn) rumbleFn("tap");
      }
      return;
    }

    if (action === "right") {
      if (combatCtrl.handIndex < cards.length - 1) {
        combatCtrl.handIndex++;
        syncCombatHandSelection(app, setFocusFn);
        if (rumbleFn) rumbleFn("tap");
      }
      return;
    }

    if (action === "up") {
      const slots = Array.from(document.querySelectorAll(".sp-hud__belt .sp-belt__slot"));
      if (slots.length) {
        combatCtrl.mode = "potion";
        combatCtrl.potionSlot = 0;
        if (setFocusFn) setFocusFn(slots[0]);
        if (rumbleFn) rumbleFn("tap");
        if (updateHudFn) updateHudFn("combat", "potion");
      }
      return;
    }

    if (action === "x") {
      combatCtrl.inspecting = !combatCtrl.inspecting;
      hand.toggleKeywordTip(combatCtrl.inspecting);
      if (rumbleFn) rumbleFn("tap");
      return;
    }

    if (action === "a") {
      const card = cards[combatCtrl.handIndex];
      if (!card) return;

      const needsTarget = app.data && app.C ? (card.def.target === "enemy" || card.def.target === "any") : true;
      if (needsTarget && living.length > 0) {
        combatCtrl.mode = "aim";
        combatCtrl.targetUid = living[0].uid;
        hand.select(card.uid);
        hand.setAimTarget(combatCtrl.targetUid);
        combat.aimPreview(card, combatCtrl.targetUid);
        if (rumbleFn) rumbleFn("light");
        if (updateHudFn) updateHudFn("combat", "aim");
      } else {
        const played = hand.playSelected(null);
        if (played !== false && rumbleFn) {
          rumbleFn("medium");
        }
        setTimeout(() => syncCombatHandSelection(app, setFocusFn), 200);
      }
      return;
    }

    if (action === "y") {
      combat.endTurn();
      if (rumbleFn) rumbleFn("medium");
      return;
    }

    if (action === "lt") {
      combat.showPile("draw");
      return;
    }

    if (action === "rt") {
      combat.showPile("discard");
      return;
    }

    if (action === "back") {
      const mapBtn = document.querySelector(".sp-hud__map");
      if (mapBtn) mapBtn.click();
      return;
    }

    if (action === "start") {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      return;
    }
  }
}
