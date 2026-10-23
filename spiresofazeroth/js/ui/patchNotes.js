// Patch notes window + floating "Update available" button.
// Notes: shown once per NOTES_ID on first load of a new build, reopenable from the update pill / window.__spires.patchNotes().
// Update check: polls version.js (no-store) every few minutes and on tab focus; when the server BUILD differs from the
// BUILD this page loaded, a pill floats at the top of the screen. Clicking it reloads onto the new build.
// Wired by ONE line in js/main.js.
import { h } from "./dom.js";
import { BUILD } from "../version.js";

const SEEN_KEY = "spires.notesSeen", NOTES_ID = "2026-10-23-bugfix", POLL_MS = 4 * 60 * 1000;

const NOTES = {
  title: "Patch Notes",
  date: "October 23, 2026",
  intro: [
    "Thank you to everyone who hit the little bug button and sent a report. Every one of them landed in my inbox, and they are the reason this update exists.",
    "I've been working through them one by one. We're in the middle of fixing every reported bug and making some significant improvements to the game, so expect more updates soon.",
  ],
  sections: [
    { head: "Fixed in this update", items: [
      "Gear bag scrolls again, so you can see and equip every item, not just the first 7.",
      "Characters and enemies no longer vanish (or leave a white screen) after switching tabs or deep into a long run.",
      "Treasure chests and the campfire no longer stop responding late in a run.",
      "Campfire: double-clicking can no longer skip past your rest or upgrade.",
      "Windfury Weapon (and every Shaman weapon imbue) now lasts the whole fight, as the card says.",
      "Infinite card-draw and energy loops (Paladin seals, Warrior stances, Rogue Vigor) are closed.",
      "Mute stays muted, even after a reload or a reward fanfare.",
      "Typing in the bug report box no longer plays your turn.",
      "Zone art no longer shows logos from later expansions (Stonetalon, Hillsbrad and others).",
      "Mobile: Fullscreen now works on iPhone, iPad and Android, and Settings / end-of-run buttons are no longer cut off.",
    ] },
    { head: "Still working on", items: [
      "Hogger's re-summoned minions missing nameplates (we can't reproduce it yet, so reports with details help a lot).",
      "The Stonetalon Mountains boss texture.",
      "iPhone players who can't get past the title screen.",
      "More balance passes across all nine classes, plus more mobile polish.",
    ] },
  ],
  outro: "Keep the reports coming. Thanks for playing!",
};

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === NOTES_ID; } catch (e) { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, NOTES_ID); } catch (e) { /* storage blocked */ } };

export function openPatchNotes() {
  if (document.querySelector(".sp-notes-backdrop")) return;
  const close = () => { markSeen(); backdrop.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); close(); } };
  const backdrop = h("div", { class: "sp-notes-backdrop", onClick: (e) => { if (e.target === backdrop) close(); } },
    h("div", { class: "sp-notes", role: "dialog", "aria-label": NOTES.title },
      h("h2", { class: "sp-notes-title" }, NOTES.title),
      h("p", { class: "sp-notes-date" }, `${NOTES.date} · build ${BUILD}`),
      ...NOTES.intro.map((t) => h("p", { class: "sp-notes-p" }, t)),
      ...NOTES.sections.map((s) => h("div", { class: "sp-notes-sec" },
        h("h3", {}, s.head), h("ul", {}, ...s.items.map((i) => h("li", {}, i))))),
      h("p", { class: "sp-notes-p sp-notes-outro" }, NOTES.outro),
      h("button", { class: "sp-btn sp-notes-close", onClick: close }, "Back to the spires")));
  document.addEventListener("keydown", onKey, true); // capture: game hotkeys never see keys while the notes are open
  document.body.append(backdrop);
}

async function serverBuild() {
  const res = await fetch(`${new URL("../version.js", import.meta.url).pathname}?check=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const m = /BUILD\s*=\s*"([^"]+)"/.exec(await res.text());
  return m ? m[1] : null;
}

function showUpdatePill(latest) {
  if (document.querySelector(".sp-update-pill")) return;
  const pill = h("button", { class: "sp-update-pill", title: `You're on ${BUILD}, the latest is ${latest}`,
    onClick: () => { pill.textContent = "Updating..."; location.reload(); } },
    h("span", { class: "sp-update-dot" }), "New update available: click to update");
  document.body.append(pill);
}

export function installPatchNotes(app) {
  if (app) app.patchNotes = openPatchNotes;
  // returning players only: a first-time visitor has nothing to compare against, so the notes are marked read for them
  let returning = !!(app && app.meta && app.meta.stats && app.meta.stats.runs > 0);
  try { returning = returning || !!localStorage.getItem("spires.run.v1"); } catch (e) { /* storage blocked */ }
  if (!seen()) { if (returning) setTimeout(openPatchNotes, 600); else markSeen(); }
  let stale = false;
  const check = () => {
    if (stale || document.hidden) return;
    serverBuild().then((b) => { if (b && b !== BUILD) { stale = true; showUpdatePill(b); } })
      .catch((e) => console.warn("[spires] update check failed:", e && e.message));
  };
  setTimeout(check, 15000);
  setInterval(check, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
}
