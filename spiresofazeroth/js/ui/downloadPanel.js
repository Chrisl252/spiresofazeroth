// Title-screen "Download" entry: a small panel linking to the free desktop / Android builds. Hidden inside those apps.
import { h } from "./dom.js?v=20261029a";
import { btn, stageModal } from "./kit.js?v=20261029a";

const RELEASES = "https://github.com/Chrisl252/spiresofazeroth/releases/latest";

// True inside the Tauri desktop app, the Capacitor Android app, or anything not served over http(s).
export function isNativeApp() {
  return !!(window.__TAURI__ || window.Capacitor || !/^https?:$/.test(location.protocol));
}

export function downloadButton(app) {
  if (isNativeApp()) return null;
  return btn("Download", () => openPanel(app), { size: "sm", cls: "sp-dl-btn" });
}

function openPanel(app) {
  const link = (label) => h("a", { class: "sp-wowbtn sp-wowbtn--sm sp-dl-link", href: RELEASES, target: "_blank", rel: "noopener noreferrer" }, label);
  stageModal(app, "Download Spires of Azeroth", h("div", { class: "sp-dl" },
    h("p", { class: "sp-dl-note" }, "Free desktop and Android versions. Saves are separate from the browser."),
    h("div", { class: "sp-dl-grid" }, link("Windows"), link("Mac"), link("Linux"), link("Android (.apk)")),
    h("p", { class: "sp-dl-note" }, h("b", {}, "iPad / iPhone: "), "Open this page in Safari, tap Share, then Add to Home Screen.")));
}
