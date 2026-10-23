// Legacy route: the Settings screen was merged into the single Escape menu (ui/pauseMenu.js, owner report 2026-10-23).
// Anything still calling app.go("settings") lands on the screen it came from with the one menu opened.
export const stageNative = true;

export async function render(app) {
  setTimeout(() => app.showMenu(), 0);
  const el = document.createElement("div");
  setTimeout(() => (app.run ? app.route() : app.go("title")), 0);
  return el;
}
