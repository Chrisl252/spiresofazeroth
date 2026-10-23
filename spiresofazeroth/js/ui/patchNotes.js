// Patch notes window + floating "Update available" button.
// Notes: shown once per NOTES_ID on first load of a new build, reopenable from the update pill / window.__spires.patchNotes().
// Update check: polls version.js (no-store) every few minutes and on tab focus; when the server BUILD differs from the
// BUILD this page loaded, a pill floats at the top of the screen. Clicking it reloads onto the new build.
// Wired by ONE line in js/main.js.
import { h } from "./dom.js";
import { BUILD } from "../version.js";

const SEEN_KEY = "spires.notesSeen", NOTES_ID = "2026-10-23-d", POLL_MS = 4 * 60 * 1000;

const NOTES = {
  title: "Patch Notes",
  date: "October 23, 2026",
  intro: [
    "Thank you to everyone who hit the little bug button and sent a report. Every one of them landed in my inbox, and they are the reason this update exists.",
    "I've been working through them one by one. We're in the middle of fixing every reported bug and making some significant improvements to the game, so expect more updates soon.",
  ],
  sections: [
    { head: "Talent caps lightened", items: [
      "You were right: the new stat caps (like +6 Spell Power) hit too hard and left a lot of talents doing nothing. Thank you for telling us.",
      "The caps are now soft caps. Past the cap, a stat keeps growing at +1 for every 4 more, so every point you spend counts again. A full Mage tree now gives about +12 to +20 Spell Power instead of +6.",
      "Energy and card draw from talents still top out at +1 each, so no class can loop its turn forever.",
      "This is a stopgap for the eight classes still on the old talents. Their full rebuild, like the Warrior one below, is next.",
    ] },
    { head: "New tonight: Warrior talents rebuilt", items: [
      "Thanks to the player who showed that Arms points 17 to 20 did nothing: the stat caps filled up and every later point was wasted. That is gone for Warriors.",
      "All 36 Warrior talents now do their real WoW job instead of \"+1 Strength\". Deep Wounds makes your attacks apply Bleed, Impale hits Bleeding enemies harder, Flurry draws a card after a run of attacks, Last Stand saves you once per fight at low health, Revenge hits back when your Block soaks a full attack, and more.",
      "Every point you spend now changes a number you can see. Points you already spent are kept.",
      "The other eight classes get the same rebuild next. Until then their talents work as before.",
    ] },
    { head: "Class balance (cards)", items: [
      "Warrior, Mage, Warlock and Priest hit harder: Heroic Strike 6 to 8, Fireball and Frostbolt 6 to 9, Shadow Bolt 6 to 9, Smite 6 to 8, and more.",
      "Hunter and Rogue basics deal 1 more damage.",
      "Shaman and Druid were winning far too often: Lightning Bolt 6 to 4, totems and heals trimmed, Druid heals and Block trimmed.",
      "Rockbiter Weapon was secretly giving double its damage bonus. It now gives exactly what the card says.",
    ] },
    { head: "Fixed tonight", items: [
      "Target Dummy and Growl now really Taunt: enemies attack you instead of your pet. Distracting Shot still pulls attacks onto your pet.",
      "Detect Magic: the draw now waits for you to pick from the top 3 cards and draws the right one.",
      "Import Save works again with strings copied on Android, and tells you clearly if a string is broken.",
      "Monsters stay over their own nameplates when other enemies die, so spells land on the enemy you aim at.",
      "Mudrock Snapjaws (and every turtle) are real turtles now, not cats. A few ghosts that showed up as sharks are ghosts again.",
      "Phones: enemy nameplates no longer overlap in big fights.",
      "Silverpine's Curse of the Worgen has its own wolf icon, so it no longer looks like Feral Form.",
    ] },
    { head: "Balance update (talents, earlier today)", items: [
      "Talents were too strong: one good run filled all 51 points and made every class close to unbeatable. Points now come at 1 per 5 floors cleared (plus acts and victories), so your tree fills over several runs.",
      "Talents can now add at most +1 energy and +1 card drawn per fight, and big stat stacks (Strength, spell power, Thorns and others) are capped.",
      "Points you've already earned stay yours. Your character is just less overpowered than before.",
      "Starting health: Shaman 75 to 66, Druid 78 to 70, Mage 75 to 82, Warlock 75 to 80. A deeper class-by-class card pass is next.",
    ] },
    { head: "Also fixed earlier today", items: [
      "One Settings menu: pressing Escape in Settings no longer opens a second menu on top. Every option lives in one scrolling menu, and game keys can't play your turn while it's open.",
      "You can always put a card back: click it again, right-click, click empty space or drag it back to your hand. Right-clicking mid-drag no longer plays the card anyway.",
      "Summoned adds (like Murlocs) now spread out across the screen over their own nameplates instead of stacking on top of each other.",
      "Potions are no longer hidden under your gear in the top bar on the map, reward and shop screens.",
      "The energy orb now uses real WoW UI art.",
      "Silverpine's Curse of the Worgen is a damage buff, not a Druid form; its description now says so (it was never Frost Trap turning into Feral Form).",
    ] },
    { head: "Fixed earlier today", items: [
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
      "Rebuilt talents for the other eight classes, and a little more starting power for players with no talents yet.",
      "More mobile polish.",
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
