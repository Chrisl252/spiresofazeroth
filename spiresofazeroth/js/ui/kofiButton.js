// Title-screen support link: a round heart button to Ko-fi (styles: css/kofi-cta.css).
import { h } from "./dom.js";

const URL_KOFI = "https://ko-fi.com/chrisl97";

export function kofiButton() {
  return h("button", { class: "sp-kofibtn", type: "button", title: "Support Spires on Ko-fi", "aria-label": "Support Spires on Ko-fi", onClick: () => window.open(URL_KOFI, "_blank", "noopener") },
    h("i", { class: "sp-kofibtn__heart", "aria-hidden": "true" }));
}
