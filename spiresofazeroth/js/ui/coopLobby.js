// Co-op lobby: host a game (shows a 6-letter code) or join one by code; once connected, both players pick a hero and start.
// Session + rules: js/coop/session.js. Reached from the title screen's Co-op button.
import { h, toast } from "./dom.js?v=20261029d";

export function render(app) {
  const coop = app.coop;
  const back = h("button", { class: "sp-wowbtn sp-wowbtn--sm", type: "button", onClick: () => { if (coop && coop.state === "hosting") coop.cancel(); app.go("title"); } }, "Back");
  const root = h("section", { class: "sp-coop-lobby" });
  if (!coop) { root.append(h("h2", {}, "Co-op"), h("p", {}, "Co-op is still loading, try again in a moment."), back); return root; }
  const how = h("ul", {},
    h("li", {}, "Two heroes, each with your own class, deck, gear and rewards."),
    h("li", {}, "Fights are shared: the host's hero acts, then yours, then the enemies (tougher in co-op) split their attacks between you."),
    h("li", {}, "The host picks the zone and the path; shops, events, campfires and loot are your own."),
    h("li", {}, "Drop to 0 HP and you are down, not dead: win the fight and you are back up. Both down = run over."));
  const err = h("p", { class: "sp-coop-err" });
  const rerender = () => { if (app.screen === "coopLobby") app.go("coopLobby"); };

  if (coop.state === "connected") {
    const pn = coop.partnerName();
    root.append(h("h2", {}, "Party formed"), h("p", {}, `You are connected with ${pn === "your partner" ? "your partner" : pn}. ${coop.role === "host" ? "You lead the way." : "Your host leads the way."}`),
      h("p", {}, "Both of you now pick a hero. The run starts once you each enter the world."),
      h("div", { class: "sp-coop-row" },
        h("button", { class: "sp-wowbtn sp-wowbtn--lg", type: "button", "data-autofocus": "", onClick: () => app.go("charSelect") }, "Choose your hero"),
        h("button", { class: "sp-wowbtn", type: "button", onClick: () => { coop.leave(); rerender(); } }, "Leave party")), how);
    return root;
  }
  if (coop.state === "hosting") {
    const off = coop.on("connected", () => { off(); rerender(); });
    root.append(h("h2", {}, "Hosting"), h("p", {}, "Give this code to your friend. They open Spires of Azeroth, press Co-op, and join with it."),
      h("div", { class: "sp-coop-code" }, coop.code),
      h("p", {}, "Waiting for your friend to join..."),
      h("div", { class: "sp-coop-row" },
        h("button", { class: "sp-wowbtn", type: "button", onClick: () => { try { navigator.clipboard.writeText(coop.code); toast("Code copied"); } catch { toast(coop.code); } } }, "Copy code"),
        h("button", { class: "sp-wowbtn", type: "button", onClick: () => { off(); coop.cancel(); rerender(); } }, "Cancel")));
    return root;
  }

  const input = h("input", { type: "text", maxlength: "6", placeholder: "CODE", autocomplete: "off", spellcheck: "false", "aria-label": "Room code" });
  const joinBtn = h("button", { class: "sp-wowbtn sp-wowbtn--lg", type: "button" }, "Join");
  const hostBtn = h("button", { class: "sp-wowbtn sp-wowbtn--lg", type: "button", "data-autofocus": "" }, "Host a game");
  const busy = (on) => { joinBtn.disabled = on; hostBtn.disabled = on; };
  hostBtn.addEventListener("click", async () => {
    busy(true); err.textContent = "Opening a room...";
    try { await coop.host(); rerender(); } catch (e) { err.textContent = e.message; busy(false); }
  });
  const doJoin = async () => {
    const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) { err.textContent = "Room codes are 6 letters."; return; }
    busy(true); err.textContent = "Joining...";
    try { await coop.join(code); rerender(); } catch (e) { err.textContent = e.message; busy(false); }
  };
  joinBtn.addEventListener("click", doJoin);
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doJoin(); });
  root.append(h("h2", {}, "Co-op"), h("p", {}, "Climb the spires with a friend, online, two heroes in one fight."), how,
    h("div", { class: "sp-coop-row" }, hostBtn),
    h("p", {}, "or join a friend's game:"),
    h("div", { class: "sp-coop-row" }, input, joinBtn),
    err, h("div", { class: "sp-coop-row" }, back));
  return root;
}
