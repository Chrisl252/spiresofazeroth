// Universal 2D Spatial UI Navigation, Map path selection, and Modal navigation.
const FOCUSABLE_SELECTOR = `
  button:not([disabled]),
  [role="button"]:not([aria-disabled="true"]):not(.sold),
  input:not([disabled]),
  select:not([disabled]),
  textarea:not([disabled]),
  a[href],
  .sx-node.reach,
  .sx-clsplate,
  .sx-ware:not(.sold),
  .sx-zone,
  .sx-plate:not([disabled]):not(.sx-plate--static),
  .sp-card[tabindex="0"]
`;

let currentFocusedEl = null;

export function isModalOpen() {
  return !!document.querySelector(".sx-modal-back, .dm-modal, .sp-pause-menu, .sx-overlay, .sp-howto, .sp-result, .sx-rest--flare");
}

export function getActiveModalContainer() {
  return document.querySelector(".sx-modal-back, .dm-modal, .sp-pause-menu, .sx-overlay, .sp-howto, .sp-result") || document.body;
}

export function getFocusedElement() {
  return currentFocusedEl;
}

export function clearControllerFocus() {
  if (currentFocusedEl) {
    currentFocusedEl.classList.remove("sp-ctrl-focus");
    currentFocusedEl = null;
  }
}

export function setControllerFocus(el, rumbleFn = null) {
  if (currentFocusedEl === el) return;
  clearControllerFocus();
  if (el) {
    currentFocusedEl = el;
    currentFocusedEl.classList.add("sp-ctrl-focus");
    if (typeof currentFocusedEl.focus === "function") {
      currentFocusedEl.focus({ preventScroll: true });
    }
    if (typeof currentFocusedEl.scrollIntoView === "function") {
      currentFocusedEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
    if (rumbleFn) rumbleFn("tap");
  }
}

export function getFocusableElements(container = null, app = null) {
  const root = container || (isModalOpen() ? getActiveModalContainer() : document.getElementById("app") || document.body);
  const raw = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
  return raw.filter((el) => {
    if (el.closest(".sp-hand") && app && app.run && app.run.screen === "combat") {
      return false; // Hand cards driven via dedicated hand index
    }
    if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  });
}

export function autoFocusPrimary(app, rumbleFn = null) {
  if (isModalOpen()) {
    const modal = getActiveModalContainer();
    const primary = modal.querySelector("[data-autofocus], button.sp-wowbtn, .dm-close") || getFocusableElements(modal, app)[0];
    if (primary) setControllerFocus(primary, rumbleFn);
    return;
  }

  const screen = app && app.run ? app.run.screen : "title";
  if (screen === "map") {
    const reachable = Array.from(document.querySelectorAll(".sx-node.reach"));
    if (reachable.length) {
      setControllerFocus(reachable[0], rumbleFn);
      return;
    }
  }

  const focusables = getFocusableElements(null, app);
  if (focusables.length) {
    const auto = focusables.find((e) => e.hasAttribute("data-autofocus")) || focusables[0];
    setControllerFocus(auto, rumbleFn);
  }
}

export function spatialNavigate(dir, app, rumbleFn = null) {
  const container = isModalOpen() ? getActiveModalContainer() : null;
  const elements = getFocusableElements(container, app);
  if (!elements.length) return;

  if (!currentFocusedEl || !document.body.contains(currentFocusedEl)) {
    autoFocusPrimary(app, rumbleFn);
    return;
  }

  const curRect = currentFocusedEl.getBoundingClientRect();
  const curCenter = { x: curRect.left + curRect.width / 2, y: curRect.top + curRect.height / 2 };

  let bestEl = null;
  let bestScore = Infinity;

  for (const el of elements) {
    if (el === currentFocusedEl) continue;
    const r = el.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };

    const dx = c.x - curCenter.x;
    const dy = c.y - curCenter.y;

    let primary = 0;
    let ortho = 0;
    let isAhead = false;

    if (dir === "right") {
      isAhead = dx > 8;
      primary = dx;
      ortho = Math.abs(dy);
    } else if (dir === "left") {
      isAhead = dx < -8;
      primary = -dx;
      ortho = Math.abs(dy);
    } else if (dir === "down") {
      isAhead = dy > 8;
      primary = dy;
      ortho = Math.abs(dx);
    } else if (dir === "up") {
      isAhead = dy < -8;
      primary = -dy;
      ortho = Math.abs(dx);
    }

    if (!isAhead) continue;

    const score = primary + ortho * 2.4;
    if (score < bestScore) {
      bestScore = score;
      bestEl = el;
    }
  }

  if (bestEl) {
    setControllerFocus(bestEl, rumbleFn);
  }
}

export function handleMapInput(action, rumbleFn = null) {
  const reachable = Array.from(document.querySelectorAll(".sx-node.reach"));
  if (!reachable.length) return;

  let curIdx = reachable.indexOf(currentFocusedEl);
  if (curIdx < 0) curIdx = 0;

  if (action === "left" || action === "up") {
    curIdx = (curIdx - 1 + reachable.length) % reachable.length;
    setControllerFocus(reachable[curIdx], rumbleFn);
    return;
  }

  if (action === "right" || action === "down") {
    curIdx = (curIdx + 1) % reachable.length;
    setControllerFocus(reachable[curIdx], rumbleFn);
    return;
  }

  if (action === "a") {
    if (reachable[curIdx]) {
      if (rumbleFn) rumbleFn("medium");
      reachable[curIdx].click();
    }
    return;
  }

  if (action === "start") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return;
  }
}
