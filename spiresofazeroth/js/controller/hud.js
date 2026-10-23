// Controller HUD prompts bar and button glyphs.
let hudEl = null;

export function createGlyph(type, text) {
  const span = document.createElement("span");
  span.className = `sp-glyph sp-glyph--${type}`;
  span.textContent = text;
  return span;
}

export function updateHudPrompts(screen, combatMode = "hand", isModal = false) {
  if (!hudEl) {
    hudEl = document.createElement("div");
    hudEl.className = "sp-controller-hud";
    document.body.appendChild(hudEl);
  }

  hudEl.innerHTML = "";

  const addItem = (glyphType, glyphText, label) => {
    const item = document.createElement("div");
    item.className = "sp-ctrl-item";
    item.appendChild(createGlyph(glyphType, glyphText));
    const lbl = document.createElement("span");
    lbl.className = "sp-ctrl-label";
    lbl.textContent = label;
    item.appendChild(lbl);
    hudEl.appendChild(item);
  };

  const addDivider = () => {
    const div = document.createElement("div");
    div.className = "sp-ctrl-divider";
    hudEl.appendChild(div);
  };

  if (isModal) {
    addItem("a", "A", "Select");
    addDivider();
    addItem("b", "B", "Back");
    addDivider();
    addItem("dpad", "D-Pad", "Navigate");
    return;
  }

  if (screen === "combat") {
    if (combatMode === "aim") {
      addItem("a", "A", "Strike");
      addDivider();
      addItem("b", "B", "Cancel");
      addDivider();
      addItem("dpad", "◄ ►", "Target Enemy");
    } else if (combatMode === "potion") {
      addItem("a", "A", "Use Potion");
      addDivider();
      addItem("b", "B", "Hand");
      addDivider();
      addItem("dpad", "◄ ►", "Select");
    } else {
      addItem("a", "A", "Play");
      addDivider();
      addItem("y", "Y", "End Turn");
      addDivider();
      addItem("x", "X", "Inspect");
      addDivider();
      addItem("dpad", "▲", "Potions");
      addDivider();
      addItem("shoulder", "LT/RT", "Piles");
      addDivider();
      addItem("menu", "Menu", "Pause");
    }
    return;
  }

  if (screen === "map") {
    addItem("a", "A", "Choose Path");
    addDivider();
    addItem("dpad", "◄ ►", "Select Node");
    addDivider();
    addItem("menu", "Menu", "Pause");
    return;
  }

  addItem("a", "A", "Select");
  addDivider();
  addItem("b", "B", "Back");
  addDivider();
  addItem("dpad", "D-Pad", "Navigate");
  addDivider();
  addItem("menu", "Menu", "Pause");
}
