// Spires of Azeroth - Gamepad & Controller Subsystem
// Main coordinator module wired into main.js.
import {
  BTN, setAppRef, isGamepadConnected, getActiveGamepadName, rumble,
  setGamepadMode, onGamepadModeChange, isGamepadMode, startPolling
} from "./controller/input.js";
import { updateHudPrompts } from "./controller/hud.js";
import {
  isModalOpen, getActiveModalContainer, getFocusedElement,
  clearControllerFocus, setControllerFocus, autoFocusPrimary,
  spatialNavigate, handleMapInput
} from "./controller/nav.js";
import {
  combatCtrl, syncCombatHandSelection, handleCombatInput
} from "./controller/combat.js";

export { BTN, isGamepadConnected, getActiveGamepadName, rumble };

let installed = false;
let globalApp = null;

function refreshPrompts() {
  const screen = globalApp && globalApp.run ? globalApp.run.screen : "title";
  updateHudPrompts(screen, combatCtrl.mode, isModalOpen());
}

function dispatchAction(action) {
  setGamepadMode(true);
  const focusedEl = getFocusedElement();

  // 1. Modals or Game Menus
  if (isModalOpen()) {
    if (action === "b" || action === "start") {
      const closeBtn = document.querySelector(".dm-close, .sx-modal__close, .sp-pause-menu [data-autofocus]");
      if (closeBtn) closeBtn.click();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      refreshPrompts();
      return;
    }

    if (action === "up" || action === "down" || action === "left" || action === "right") {
      if (focusedEl && focusedEl.tagName === "INPUT" && focusedEl.type === "range" && (action === "left" || action === "right")) {
        const step = +focusedEl.step || 1;
        const cur = +focusedEl.value;
        const next = action === "right" ? Math.min(+focusedEl.max, cur + step) : Math.max(+focusedEl.min, cur - step);
        focusedEl.value = String(next);
        focusedEl.dispatchEvent(new Event("input", { bubbles: true }));
        focusedEl.dispatchEvent(new Event("change", { bubbles: true }));
        rumble("tap");
        return;
      }

      if (focusedEl && focusedEl.tagName === "SELECT" && (action === "left" || action === "right")) {
        const cur = focusedEl.selectedIndex;
        const next = action === "right" ? Math.min(focusedEl.options.length - 1, cur + 1) : Math.max(0, cur - 1);
        focusedEl.selectedIndex = next;
        focusedEl.dispatchEvent(new Event("change", { bubbles: true }));
        rumble("tap");
        return;
      }

      spatialNavigate(action, globalApp, rumble);
      return;
    }

    if (action === "a") {
      if (focusedEl) {
        rumble("light");
        focusedEl.click();
      }
      return;
    }
    refreshPrompts();
    return;
  }

  const screen = globalApp && globalApp.run ? globalApp.run.screen : "title";

  // 2. Combat Screen
  if (screen === "combat") {
    handleCombatInput(action, globalApp, (el) => setControllerFocus(el, rumble), rumble, refreshPrompts);
    refreshPrompts();
    return;
  }

  // 3. Map Screen
  if (screen === "map") {
    handleMapInput(action, rumble);
    refreshPrompts();
    return;
  }

  // 4. Universal Menu & Dialog Screens
  if (action === "start") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    refreshPrompts();
    return;
  }

  if (action === "up" || action === "down" || action === "left" || action === "right") {
    if (focusedEl && focusedEl.tagName === "INPUT" && focusedEl.type === "range" && (action === "left" || action === "right")) {
      const step = +focusedEl.step || 1;
      const cur = +focusedEl.value;
      const next = action === "right" ? Math.min(+focusedEl.max, cur + step) : Math.max(+focusedEl.min, cur - step);
      focusedEl.value = String(next);
      focusedEl.dispatchEvent(new Event("input", { bubbles: true }));
      focusedEl.dispatchEvent(new Event("change", { bubbles: true }));
      rumble("tap");
      return;
    }

    spatialNavigate(action, globalApp, rumble);
    return;
  }

  if (action === "a") {
    if (focusedEl) {
      rumble("light");
      focusedEl.click();
    }
    return;
  }

  if (action === "b") {
    const backBtn = document.querySelector(".sx-back, .sp-wowbtn--back, button[data-back]");
    if (backBtn) {
      rumble("tap");
      backBtn.click();
    }
    return;
  }
}

function handleRightStick(ry) {
  const scrollTarget = isModalOpen() ? getActiveModalContainer() : (document.querySelector(".sx-map__scroll, .sx-cls__detail, .pm-panel, .sx-scroll, #app") || window);
  if (scrollTarget && typeof scrollTarget.scrollBy === "function") {
    scrollTarget.scrollBy({ top: ry * 16, behavior: "auto" });
  } else if (window.scrollBy) {
    window.scrollBy(0, ry * 16);
  }
}

export function installController(app) {
  if (installed) return;
  installed = true;
  globalApp = app;
  setAppRef(app);

  onGamepadModeChange((active) => {
    if (active) {
      if (!getFocusedElement()) {
        const screen = app && app.run ? app.run.screen : "title";
        if (screen === "combat") {
          combatCtrl.mode = "hand";
          syncCombatHandSelection(app, (el) => setControllerFocus(el, rumble));
        } else {
          autoFocusPrimary(app, rumble);
        }
      }
      refreshPrompts();
    } else {
      clearControllerFocus();
    }
  });

  const origGo = app.go.bind(app);
  app.go = async function(name, props) {
    const res = await origGo(name, props);
    combatCtrl.mode = "hand";
    combatCtrl.handIndex = 0;
    combatCtrl.inspecting = false;
    clearControllerFocus();
    if (isGamepadMode()) {
      setTimeout(() => {
        if (name === "combat") {
          syncCombatHandSelection(app, (el) => setControllerFocus(el, rumble));
        } else {
          autoFocusPrimary(app, rumble);
        }
        refreshPrompts();
      }, 100);
    }
    return res;
  };

  startPolling(dispatchAction, handleRightStick);
}
