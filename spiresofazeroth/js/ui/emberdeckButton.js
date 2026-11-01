// Title-screen cross-promo: the burning "Play Emberdeck" button (styles: css/emberdeck-cta.css).
import { h } from "./dom.js";

const URL_EMBERDECK = "https://emberdeck.app/?ref=spires";
const LOGO = new URL("../../assets/ui/emberdeck-logo.webp", import.meta.url).href;

export function emberdeckButton() {
  const flames = h("span", { class: "sp-emberbtn__fire", "aria-hidden": "true" }, [1, 2, 3, 4, 5, 6, 7].map((i) => h("i", { class: `sp-emberbtn__tongue sp-emberbtn__tongue--${i}` })));
  const sparks = h("span", { class: "sp-emberbtn__sparks", "aria-hidden": "true" }, [1, 2, 3, 4, 5, 6, 7, 8].map((i) => h("i", { class: `sp-emberbtn__spark sp-emberbtn__spark--${i}` })));
  return h("button", { class: "sp-emberbtn", type: "button", title: "Emberdeck, our free roguelike deckbuilder", onClick: () => window.open(URL_EMBERDECK, "_blank", "noopener") },
    flames, sparks,
    h("span", { class: "sp-emberbtn__body" },
      h("img", { class: "sp-emberbtn__logo", src: LOGO, alt: "", width: 96, height: 96 }),
      h("span", { class: "sp-emberbtn__label" }, h("small", {}, "Free game"), "Play Emberdeck")));
}
