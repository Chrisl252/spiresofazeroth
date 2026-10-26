// Patch notes window + floating "Update available" button.
// Notes: shown once per NOTES_ID on first load of a new build, reopenable from the update pill / window.__spires.patchNotes().
// Update check: polls version.js (no-store) every few minutes and on tab focus; when the server BUILD differs from the
// BUILD this page loaded, a pill floats at the top of the screen. Clicking it reloads onto the new build.
// Wired by ONE line in js/main.js.
import { h, icon } from "./dom.js";
import { BUILD } from "../version.js";

const SEEN_KEY = "spires.notesSeen", NOTES_ID = "2026-10-25-b", POLL_MS = 4 * 60 * 1000;

// items: a plain string, or { ic: icon slug, name, text } for a picture row
const NOTES = {
  title: "Patch Notes",
  date: "October 25, 2026",
  intro: [
    "Big one: every class has new talents, spells look like they do in WoW, and the early game is friendlier. Thank you for every bug report.",
  ],
  sections: [
    { head: "Create your character (25b)", items: [
      "New character creation screen, just like the WoW client: pick any of the 10 races, male or female, and every class that race can be in Burning Crusade. Undead Rogue is in.",
      "Real race and class text, a slowly turning character model, a name box with a Randomize button, and a saved character list you can Enter World from.",
      "Your race, gender and name show in the top bar during a run. Old saves keep working.",
      "Not done yet: skin, face and hair options, and your race in the fight scene.",
    ] },
    { head: "Warlock fixes (25a)", items: [
      { ic: "spell_shadow_antimagicshell", name: "Ritual of Doom", text: "The Doomguard now does what the card says the moment you play it: Rain of Fire hits ALL enemies, War Stomp stuns one, Cripple applies 2 Weak. Then it keeps acting every turn." },
      { ic: "spell_shadow_shadowbolt", name: "Shadow Bolt (upgraded)", text: "The upgraded Shadow Bolt now deals 12 damage (was 9, same as the base card)." },
    ] },
    { head: "Legendaries feel legendary (24c)", items: [
      { ic: "inv_sword_39", name: "Thunderfury", text: "Now Legendary. Every fight opens with 1 Weak on all enemies, and attacks have a 30% chance (was 20%) to hit ALL enemies for 12 Nature damage and 2 Weak (was 10 to one enemy, 1 Weak)." },
      { ic: "inv_staff_20", name: "Atiesh", text: "Now Legendary. Still +1 Energy and +1 card each turn, and now draws 2 extra cards at the start of every fight." },
    ] },
    { head: "New: choose how gear is equipped (24b)", items: [
      { ic: "inv_misc_bag_09", name: "New gear setting", text: "Escape menu or Gear Bag: Empty slots only (default), Always equip, or Never. Fight drops follow it too, so a weaker piece no longer replaces your best one." },
      { ic: "inv_chest_plate16", name: "Equip or swap back", text: "A gear drop that went to your bag has an Equip button right on the loot row. One that went on has Swap back." },
      { ic: "inv_misc_eye_01", name: "Compare before you swap", text: "Gear tooltips on loot and in the Gear Bag now show what you are wearing in that slot, and the bag lists what each piece would replace." },
    ] },
    { head: "New talents for every class", items: [
      "Every talent now does a real WoW job instead of \"+1 stat\", and every point you spend changes a number you can see. Points you already spent are kept.",
      { ic: "classicon_warrior", name: "Warrior", text: "Deep Wounds makes Bleed, Revenge hits back, Last Stand saves you once per fight." },
      { ic: "classicon_paladin", name: "Paladin", text: "Heals give Block, Redoubt keeps your Block, Repentance stuns." },
      { ic: "classicon_hunter", name: "Hunter", text: "Your pet comes back once per fight, traps Weaken, Silencing Shot interrupts." },
      { ic: "classicon_rogue", name: "Rogue", text: "Poison on every hit, start fights in Stealth, Cold Blood doubles a finisher." },
      { ic: "classicon_priest", name: "Priest", text: "Shields that last, Holy crits, Shadowform cuts the damage you take." },
      { ic: "classicon_shaman", name: "Shaman", text: "Shock crits, Windfury strikes twice, Reincarnation once per run." },
      { ic: "classicon_mage", name: "Mage", text: "Arcane Charges, Ignite Burn, Frostbite freezes and Shatter breaks." },
      { ic: "classicon_warlock", name: "Warlock", text: "Nightfall casts a free Shadow Bolt, Soul Link shares damage with your demon." },
      { ic: "classicon_druid", name: "Druid", text: "Moonfire Burn, Bear and Cat form bonuses, Swiftmend leaves healing over time." },
    ] },
    { head: "Spells look like WoW", items: [
      "Spells now use the real spell art from the WoW client: the real missile flies, the real impact lands, and buffs glow on your hero.",
      { ic: "spell_holy_holysmite", name: "Smite", text: "Holy glow in your hands, then a golden burst." },
      { ic: "spell_shadow_shadowbolt", name: "Shadow Bolt", text: "A real shadow missile across the field." },
      { ic: "ability_impalingbolt", name: "Arcane Shot", text: "The real arcane shot, start to finish." },
      { ic: "spell_nature_earthshock", name: "Earth Shock", text: "Nature cast and the real shock burst on the target." },
    ] },
    { head: "A friendlier start", items: [
      { ic: "spell_nature_lightning", name: "Shaman", text: "Lightning Bolt 5 (was 4), Earth Shock 6, Searing Totem 4, Healing Wave heals 6." },
      { ic: "ability_druid_treeoflife", name: "Teldrassil", text: "Nature spells now heal an enemy for 1 (was 3), so Shamans and Druids can get through." },
      { ic: "spell_holy_devotion", name: "Novice's Resolve", text: "Haven't spent a talent point yet? You get extra max HP and enemies have less health. It ends with your first talent point." },
      { ic: "inv_misc_head_dragon_01", name: "Act 1 boss", text: "Less health and 1 guard instead of 2. Act 1 elites and all of Act 2 are a bit softer too." },
      { ic: "ability_druid_maul", name: "Teldrassil elites", text: "Rageclaw has less health and gets less Strength. Githyiss poisons for 3 instead of 4." },
    ] },
    { head: "Gear and cards (from your reports)", items: [
      { ic: "inv_jewelry_trinket_01", name: "Second trinket and ring", text: "The Gear Bag now has a button for each slot, so you can swap your second trinket or ring." },
      { ic: "inv_misc_bag_09", name: "Your gear stays on", text: "New loot no longer swaps out the trinket, cloak or off-hand you picked. If the slot is taken, it goes to your Gear Bag." },
      { ic: "inv_misc_cape_18", name: "Pass on boss loot", text: "Choose-one loot now has a Pass row if you like what you are wearing." },
      { ic: "inv_misc_book_09", name: "Steady hand", text: "Cards no longer shake when you hover them, including the ones on the far right." },
      { ic: "spell_holy_righteousnessaura", name: "Seal of Wisdom", text: "Judgement now draws 1 card (2 upgraded) and no longer refunds Energy, which ends the Seal and Judgement loop." },
      { ic: "inv_misc_note_01", name: "Draw limit", text: "When the hand is full or the 10-draw-per-turn limit is hit, the game now tells you." },
    ] },
    { head: "Fixed", items: [
      { ic: "inv_misc_horn_01", name: "Zone music", text: "If your browser refused to start a track once, the music stayed off for the whole zone. It now comes back on your next click." },
      { ic: "inv_misc_cape_18", name: "Boss loot", text: "Gear choices glow in their quality colour, show what they do right on the row, and flash Looted when you pick one." },
      { ic: "spell_holy_prayerofhealing", name: "Campfires", text: "Now a clean choice: Rest or Upgrade. No more two different heal buttons." },
      { ic: "inv_misc_book_09", name: "Event cards", text: "When an event gives you a card, the exact card now shows big in the middle of the screen." },
      { ic: "spell_holy_holybolt", name: "Uther's Continue button", text: "If the connection drops, it now says so and lets you click again instead of freezing." },
      { ic: "inv_potion_52", name: "Potions after a fight", text: "Belt full? Click a dropped healing potion to drink it on the spot. Click a belt potion to drink it any time." },
      { ic: "ability_hunter_pet_bear", name: "Bears are bears", text: "Rabid Thistle Bears and other bears no longer show up as furbolgs." },
    ] },
    { head: "Earlier today", items: [
      "Taunt works on Target Dummy and Growl, Detect Magic draws the right card, turtles are turtles again, monsters stay over their nameplates.",
      "Gear bag scrolls, no more white screens, campfire and chests stay clickable, mute stays muted, fullscreen works on phones.",
    ] },
    { head: "Still working on", items: [
      "Hogger's re-summoned minions, the Stonetalon boss texture, iPhones stuck on the title screen.",
    ] },
  ],
  outro: "Keep the reports coming. Thanks for playing!",
};

const noteItem = (i) => (typeof i === "string" ? h("li", {}, i)
  : h("li", { class: "sp-notes-row" }, icon(i.ic, "sp-notes-ico", i.name), h("span", {}, h("b", {}, i.name), " ", i.text)));

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
        h("h3", {}, s.head), h("ul", {}, ...s.items.map(noteItem)))),
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
