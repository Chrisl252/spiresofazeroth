// Patch notes window + floating "Update available" button.
// Notes: shown once per NOTES_ID on first load of a new build, reopenable from the update pill / window.__spires.patchNotes().
// Update check: polls version.js (no-store) every few minutes and on tab focus; when the server BUILD differs from the
// BUILD this page loaded, a pill floats at the top of the screen. Clicking it reloads onto the new build.
// Wired by ONE line in js/main.js.
import { h, icon, overlayHost } from "./dom.js";
import { btn, stageModal } from "./kit.js";
import { BUILD } from "../version.js";

let appRef = null; // set by installPatchNotes: the window is a stage modal (stage px, same frame as every other menu panel)

const SEEN_KEY = "spires.notesSeen", NOTES_ID = "2026-11-01-h", POLL_MS = 4 * 60 * 1000;

// Newest build first. Each entry: [tag, text] where tag is "new" | "fix" | "bal"; a leading "Name: " in the text is bolded.
// OPEN_BUILDS: how many of the newest builds start expanded; the rest are collapsed <details>.
const OPEN_BUILDS = 2;
const TAGS = { new: "New", fix: "Fix", bal: "Balance" };
const BUILDS = [
  { id: "03d", date: "Nov 3", title: "Co-op resume and fixes", entries: [
    ["fix", "The update notes could open in the middle of a fight with their Close button stuck under the battle. They now wait until the fight is over and always sit on top"],
    ["fix", "Zone choice: the spire names and lore were rewritten to match the real places. No more invented towers (Gnomeregan, the Scarlet Watch Post, the Westfall Lighthouse, Dragonmaw Gates and 19 more)"],
    ["fix", "Co-op: you can continue your shared run again. Continue run is offered on the title while the party is up (spend talents, then come back), and a re-hosted party shows Continue our run in the lobby"],
    ["fix", "The map's boss now always matches the boss you fight (The Barrens showed Mutanus but sent you to Lady Anacondra and Lord Cobrahn)"],
    ["fix", "Vendor: gear in your bag and gear you wear sell from separate rows"],
    ["fix", "Character creation: female tauren no longer lose their face (eyes) on some skin colours"],
  ] },
  { id: "03b", date: "Nov 3", title: "Bug report fixes", entries: [
    ["fix", "Co-op: damage no longer drifts between the two games when your partner carries relics from zones your game never opened"],
    ["fix", "Stealth: hits that pick their own target (and pets/totems) no longer land on a stealthed enemy while another enemy is visible"],
    ["fix", "Growl: a taunted enemy that was about to buff, heal, block or debuff now attacks you instead (not bosses, not mid-cast)"],
    ["fix", "Stoneclaw Totem taunts the turn you place it, not from the next turn"],
    ["fix", "Turn Undead now Fears undead (holy Fear gets through the undead Fear immunity; Shadow fears still don't)"],
    ["fix", "New gear = Never now also holds for choose-one boss/elite loot: the pick goes to your Gear Bag"],
  ] },
  { id: "01h", date: "Nov 1", title: "BIG UPDATE: Mythic difficulty and Ascension", entries: [
    ["new", "Mythic I-X: ten new difficulty levels past Heroic X. Mythic I is a big jump (enemy HP +101%, Heroic X is +65%; normal foes +2 Str, elites +4, bosses +3, 2 potion slots, weaker rests). Win Heroic X to open it."],
    ["new", "Ascension: win a run and press the big ASCEND button on the Victory screen. You climb again from act 1 with your gear, deck, relics, gold and talents, but every enemy has 60% more HP and +3 Strength. Each Ascension after that adds another x1.3 HP and +2 Str. There is no cap: see how high your fully geared hero can go."],
    ["new", "New difficulty picker: Normal / Heroic / Mythic tabs, a level row, and a card with the real numbers for the level you pick plus exactly what got harder since the level below it. Locked levels show what to win to open them."],
    ["new", "The Character window and the Victory screen show your full difficulty (for example Mythic II + Ascension 3). Your best Ascension per class is saved."],
    ["new", "The update button is bigger, so you can't miss a new build."],
    ["fix", "Vendor: you can now sell worn gear (click twice), starter items (5 gold) and anything in your bag. Nothing on the sell shelf silently refuses a click any more."],
    ["fix", "Bags: the Backpack could stay 'stuck closed' after a screen change until you reloaded. It now always opens."],
    ["fix", "Boss summons no longer appear in the middle of your turn. When a boss crosses a phase (Amnennar, C'Thun and others), the summon becomes its next telegraphed move."],
    ["fix", "Fear on your hero now shows for the whole turn (FEARED -2 cards). Hillsbrad turncoats can no longer replace your demon while it lives."],
    ["fix", "Paladin Vengeance now gives Strength when you are hit. Upgraded Demon Skin keeps its Regen (3). Searing Totem, pet hits and Burn/Bleed ticks now show where the damage came from."],
    ["fix", "Card tooltips no longer cover the enemy HP bars."],
    ["fix", "Phones: tap a talent to see it, tap again (or press Learn) to spend the point. The Learn button is always on screen."],
    ["fix", "Heroes no longer lose their face, skin or hair after a gear change or a new run."],
  ] },
  { id: "01g", date: "Nov 1", title: "Real character customization", entries: [
    ["new", "Character creation: Skin Color, Face, Hair Style, Hair Color and Facial Hair now work for every race and gender, straight from the classic character options (horns for Tauren and Draenei, tusks for Trolls, earrings, piercings and markings where the race has them). Randomize works too."],
    ["new", "Your chosen look carries into the run: your hero keeps your skin, hair and beard under their armor. Characters made before this update keep their old look."],
  ] },
  { id: "01f", date: "Nov 1", title: "Your bug reports, fixed", entries: [
    ["fix", "Co-op: if one player's game finishes a fight (the elite dies), the partner's game now finishes it too instead of leaving them stuck. Old fight handshakes no longer mix two different fights."],
    ["fix", "Flare (and any card that removes Stealth) can now be aimed at a stealthed enemy. Stealth rules are spelled out in the tooltip: single-target cards can't pick a stealthed enemy while another is visible, area attacks still hit it, the last enemy is always revealed."],
    ["fix", "Taunt now works against bosses whose attacks are spells (Arugal's Shadow Bolt)."],
    ["fix", "Shadowform: play it again to leave the form, and the form pip now shows when you're in it."],
    ["fix", "Barkskin no longer knocks you out of Bear or Cat form, and 'keep your Block' effects now keep it through the enemy turn as written (Druid and Warrior)."],
    ["fix", "Sleep on your hero now stays visible for the whole turn it costs you (Whitemane). Bosses now show Sleep and Fear immunity in their immunity row (Mograine)."],
    ["fix", "Foe Reaper 4000 and other armored elites and bosses: armor caps lower and each blunted hit wears 1 Armor away, so they're tough but no longer unkillable."],
    ["fix", "Sayge's Fortune of Intelligence now gives +1 Energy and draws 1 at the start of your next fight (it gave nothing)."],
    ["fix", "Events now tell you about buffs saved for your next fight (Sayge's Strength and Armor, the Twilight Tome) instead of saying nothing happened."],
    ["fix", "Character creation now says plainly that skin, face and hair options are coming later (every race has one look for now)."],
    ["fix", "Models: Mograine, Whitemane, Lady Anacondra, Lord Cobrahn and the other Druids of the Fang now use the right bodies; Charlga Razorflank animates; Zhevra get a model."],
    ["fix", "Moonwell camp: Continue the journey sits below the card choices instead of covering them."],
    ["new", "Shop relics show which gear slot they go in. Talents: tap a talent on a phone to see its details before learning it."],
    ["fix", "Fewer false 'game failed to start' screens (wallet browser add-ons, slow connections), and Reload now fetches a fresh copy."],
  ] },
  { id: "01e", date: "Nov 1", title: "Character window", entries: [
    ["new", "Character window (press C, or the Character button on the top bar): every worn piece on a WoW paperdoll, your stats at the start of the next fight (energy, cards drawn, starting buffs from gear, relics and talents), your racial, set bonuses, talents, relics, deck and difficulty. It also opens in combat."],
  ] },
  { id: "01d", date: "Nov 1", title: "Merchant fix", entries: [
    ["fix", "Merchant: with a full bag, the sell shelf pushed the Proceed button off the screen and you could not leave. The shop now scrolls and Proceed always stays visible."],
  ] },
  { id: "01c", date: "Nov 1", title: "Co-op: help your partner, harder fights", entries: [
    ["new", "Co-op: cast your heals, shields and buffs on your partner. Turn on \"Cast heals and shields on ...\" in the partner panel, or drag the card onto the panel."],
    ["fix", "Co-op: partners on different Heroic levels no longer get different maps. The guest's map now syncs to the host's."],
    ["fix", "Co-op: fixed a fight that never started (stuck on \"Waiting... / Fight solo\") when the two games disagreed on which fight it was."],
    ["bal", "Co-op is harder: enemies have more HP and elites and bosses hit a little harder. Aimed at about half of co-op runs winning."],
  ] },
  { id: "30a", date: "Oct 30", title: "Overnight bug reports", entries: [
    ["fix", "Continue run: a saved run resting at the Sanctuary no longer fails with \"Could not open that screen\" after an update."],
    ["fix", "Card draw: Goblin Jumper, Sprint and other draw effects no longer stop at 10 extra draws a turn (the cap is now 30 and only guards against infinite loops)."],
    ["fix", "Nature's Swiftness now makes your next heal or skill free too (Rejuvenation, Healing Touch), not only damage spells. Stormstrike still pays full price."],
    ["fix", "Energy gained outside your turn is kept: Heart of the Wild (Cenarion 8-set) stacks with Kiss of the Spider, Mana Spring Totem's energy arrives on your next turn."],
    ["bal", "Opportunity (Rogue, Subtlety) gives +1 damage per point to Backstab, Ambush and Cheap Shot (was +5 per point: +25 one-shots)."],
    ["fix", "Tranquility really makes you take 25% less damage (every enemy gets Weak) instead of a few points of flat armor."],
    ["fix", "Rejuvenation's text now says what it does: heal 3 at the start of your turn, fading by 1 each turn."],
    ["fix", "Strength of Earth Totem and Earthbind Totem had each other's icons."],
    ["fix", "Campfire: the flames and embers no longer flash as white shapes while their textures load."],
    ["fix", "Stalvan Mistmantle uses his own model instead of a worgen. C'Thun's tentacles no longer borrow the imp model."],
    ["fix", "Co-op: continuing a solo run while in a party is no longer offered (both players need the shared run), and you are told when your run is not the shared one."],
  ] },
  { id: "29j", date: "Oct 29", title: "Combat looks like WoW", entries: [
    ["new", "Fight scene is tone-mapped and lit like the client: real form shading on every body, a stronger key light and a crisper contact shadow."],
    ["fix", "Hits no longer turn your hero or an enemy into a solid white or purple silhouette. The body stays visible with a short lit tint, the way a wound reads in the client."],
    ["fix", "Rigged models no longer squash and stretch during a lunge or a hit. Translation, the flinch and the real Attack / Hit clips only."],
    ["fix", "Enemy claw, bite and weapon hits are smaller and wound-coloured instead of a hero-sized white starburst."],
    ["fix", "Attack and cast clips blend back into Stand over a quarter second instead of snapping to the first idle frame."],
    ["fix", "Death animations play at their own pace (up to 1.5 s) instead of being rushed into one second."],
  ] },
  { id: "28i", date: "Oct 28", title: "Fullscreen, stealth, summons", entries: [
    ["fix", "Fullscreen: card tips, the deck view, the shop and messages now show in fullscreen"],
    ["fix", "Stealth: a stealthed enemy can no longer be picked with a click or drag while another enemy is visible"],
    ["fix", "Summons: re-summoned enemies, like Hogger's Riverpaws, now always get a model, nameplate and health bar"],
    ["fix", "Cards: Energy is now explained in the card tooltip"],
  ] },
  { id: "28h", date: "Oct 28", title: "Every class sounds", entries: [
    ["new", "Sound: every class now plays real spell sounds. Druid, Hunter, Mage, Paladin, Priest, Shaman, Warlock and Warrior cards were checked one by one, so shapeshifts, stings, traps, blessings, totems, curses and shouts each have their own cast and impact."],
  ] },
  { id: "28g", date: "Oct 28", title: "Rogue sounds", entries: [
    ["new", "Rogue: every card now plays real rogue sounds. Throw uses the shuriken toss, Kick and Gouge have their own hits, the poisons, Blade Flurry, Preparation and the rest sound like the abilities they are."],
  ] },
  { id: "28f", date: "Oct 28", title: "Real spell sounds", entries: [
    ["new", "Sound: every class's cards now play their real spell sounds from the game. Fireball, Frostbolt, Polymorph, Smite, Lightning Bolt and the rest use the casting and impact sounds the game itself assigns to those spells."],
  ] },
  { id: "28e", date: "Oct 28", title: "Phone title screen", entries: [
    ["fix", "Phones: Settings and Download were below the bottom of the title screen and couldn't be tapped. The small buttons now sit two by two so everything fits."],
  ] },
  { id: "28d", date: "Oct 28", title: "Zone music is back", entries: [
    ["fix", "Sound: zone music and ambience were cut to 5 second clips in Chrome, so you heard one short loop over and over and no zone music. All 111 tracks are full length again."],
    ["fix", "Rage Potions only drop for Warriors now. Other classes no longer find potions they can't use."],
  ] },
  { id: "28c", date: "Oct 28", title: "Throw and co-op fixes", entries: [
    ["fix", "Throw (Rogue): now comes back to your hand after you throw it, once per turn. It still stays in your hand between turns."],
    ["fix", "Co-op: a fight could get stuck on \"Waiting for partner\" when the host's screen loaded twice. Both players now always get into the fight."],
  ] },
  { id: "28b", date: "Oct 28", title: "Phone flicker fix", entries: [
    ["fix", "Phones: the game no longer flickers or jumps when the browser's address bar slides in and out while you tap."],
    ["fix", "Phones and tablets: the background no longer drops out in blue boxes or flickers during fights (lighter effects on touch screens)."],
  ] },
  { id: "28a", date: "Oct 28", title: "Your bug reports, fixed", entries: [
    ["fix", "Co-op: the partner no longer gets stuck on \"waiting for partner\" at the start of Act 2 when the host picks the first fight quickly."],
    ["fix", "Sound: sound effects come back by themselves if the browser paused the game's audio; nothing plays into silence any more."],
    ["fix", "Ambience: dragging the volume sliders to zero now really silences the ambient sounds."],
    ["fix", "Interrupts (Pummel, Shield Bash, Kick...) now also stop a caster's heals and spells like Polymorph, and say \"Nothing to interrupt\" when there is no spell to stop."],
    ["fix", "Taunt: gives its Strength and Block against multi-hit attacks too."],
    ["fix", "Wound Poison: now doubles the enemy's Poison (it read your own Poison before)."],
    ["fix", "Nature's Swiftness / free casts: you can play the free card even at 0 Energy."],
    ["fix", "Fear: the card now says undead and mechanical enemies are immune (it shows Immune on them)."],
    ["fix", "Models: Lord Aliden Perenolde and other heavy-armor humans have their arms and boots back; quillboar casters have their lower body; pirates, banshees and the doomguard have their hands."],
    ["fix", "Hakkar the Soulflayer is no longer stuck in a T-pose: he uses his classic animated model."],
    ["fix", "Campfire: the flame no longer flickers with a white haze behind it."],
    ["fix", "Map tooltips (Fight, Elite, Event) no longer get stuck on screen over your cards."],
    ["fix", "Card tooltips now explain Block, Rage and Energy."],
  ] },
  { id: "27m", date: "Oct 27", title: "Online co-op", entries: [
    ["new", "Co-op: press Co-op on the title screen, host a game and give your friend the 6-letter code, or join theirs. Two heroes, one spire."],
    ["new", "Shared fights: the host's hero acts, then the partner's, then the enemies split their attacks between you. Enemies have more HP in co-op."],
    ["new", "Down, not dead: a hero at 0 HP sits out the rest of the fight and is back up at 20% HP if the fight is won. Both down ends the run."],
    ["new", "The host picks the zone, path, dungeon and boss; rewards, shops, events and campfires stay your own."],
  ] },
  { id: "27l", date: "Oct 27", title: "Music fix", entries: [
    ["fix", "Music now plays through the same audio engine as sound effects, so it no longer goes silent while effects still play."],
    ["fix", "A music track that stalls restarts by itself."],
  ] },
  { id: "27k", date: "Oct 27", title: "Classic loading screens", entries: [
    ["new", "Zone cards and backdrops now use classic loading screens, with a dungeon or raid from the zone where there is one."],
  ] },
  { id: "27j", date: "Oct 27", title: "Warrior and bomb balance", entries: [
    ["balance", "Sweeping Strikes: your first Attack each turn now also hits one other enemy for half its damage (was a full copy on every enemy)."],
    ["balance", "Goblin Sapper Charge: 12 Fire damage to all enemies (was 15); upgraded 15 (was 20)."],
  ] },
  { id: "27i", date: "Oct 27", title: "Heroes sized by race", entries: [
    ["fix", "Tauren and Draenei heroes now stand taller than humans instead of shrinking to match them."],
    ["fix", "Gnome and Dwarf heroes are shorter, Orcs and Trolls a little taller."],
  ] },
  { id: "27h", date: "Oct 27", title: "No more stuck screens", entries: [
    ["fix", "If a screen fails to open you now get a \"tap again\" message instead of being stuck."],
  ] },
  { id: "27g", date: "Oct 27", title: "Deer and Seal fixes", entries: [
    ["fix", "Infected Deer now looks like a deer."],
    ["fix", "The Seal counter now shows your active Seal."],
  ] },
  { id: "27f", date: "Oct 27", title: "Armor on every race", entries: [
    ["fix", "Your armor now shows on every race. Every class and race you can pick in character creation, male and female, now wears its gear in the fight scene."],
  ] },
  { id: "27e", date: "Oct 27", title: "Readable patch notes, campfire fix", entries: [
    ["new", "Patch notes: newest first, one short line per change, older updates fold away."],
    ["fix", "Campfire stuck: if a click on the map did nothing after a vendor or campfire, the game now reopens the screen you are on. Saved runs stuck this way open the campfire when you press Continue."],
  ] },
  { id: "27d", date: "Oct 27", title: "Harder Normal, Heroic open", entries: [
    ["bal", "Harder Normal: enemies have more health, and elites hit harder."],
    ["new", "Heroic I-III unlocked for everyone. Pick your difficulty on the character screen. Heroic IV and up still unlock by winning."],
    ["bal", "Gear rebalanced: top-end drops are rarer. Trimmed Slayer's Crest, Diamond Flask, Zandalarian Hero Medallion, and the energy and draw procs on set pieces."],
  ] },
  { id: "27c", date: "Oct 27", title: "Fixes, and Soul Shards matter", entries: [
    ["fix", "Heal cards no longer also give Block. Blessing of Light and Power Word: Fortitude are now defensive cards; Health Funnel no longer gives Block."],
    ["fix", "Progress is no longer lost when you return to the title screen or close the tab."],
    ["fix", "You can no longer skip map floors by double-clicking or holding keys."],
    ["fix", "Shadowform now costs -1 shadow and gives +1 holy, as intended."],
    ["fix", "Sleep now works on the player: taking damage wakes you."],
    ["new", "Warlock Soul Shards: Soul Fire and Shadowburn hit for 12, or 17 if you spend 2 Shards (upgraded 18 / 23)."],
    ["new", "Summon Voidwalker gives 5 Block for 1 Shard. Summon Felhunter acts right away for 2 Shards. Without Shards the cards still work."],
    ["bal", "Soul Fire and Shadowburn no longer make Shards. Drain Soul (Rank 2) and Fel Domination make 1 fewer. Warlock is a little weaker, on purpose."],
  ] },
  { id: "27b", date: "Oct 27", title: "Small fixes", entries: [
    ["fix", "Stunned enemies now show Stunned instead of their old attack."],
    ["new", "A card boosted by Wizard Oil or double damage shows an Empowered marker."],
    ["fix", "Fullscreen mode works again."],
  ] },
  { id: "25b", date: "Oct 25", title: "Create your character", entries: [
    ["new", "New character creation, like the WoW client: all 10 races, male or female, and every class that race can be in Burning Crusade. Undead Rogue is in."],
    ["new", "Real race and class text, a turning model, a name box with Randomize, and a saved character list to Enter World from."],
    ["new", "Race, gender and name show in the top bar during a run. Old saves keep working."],
    ["bal", "Not done yet: skin, face and hair options, and your race in the fight scene."],
  ] },
  { id: "25a", date: "Oct 25", title: "Warlock fixes", entries: [
    ["fix", "Ritual of Doom: the Doomguard acts the moment you play it. Rain of Fire hits ALL enemies, War Stomp stuns one, Cripple applies 2 Weak. Then it acts every turn."],
    ["fix", "Shadow Bolt (upgraded) now deals 12 damage (was 9, same as the base card)."],
  ] },
  { id: "24c", date: "Oct 24", title: "Legendaries", entries: [
    ["bal", "Thunderfury: now Legendary. Opens every fight with 1 Weak on all enemies. Attacks have a 30% chance (was 20%) to hit ALL enemies for 12 Nature damage and 2 Weak."],
    ["bal", "Atiesh: now Legendary. Still +1 Energy and +1 card each turn, and now draws 2 extra cards at the start of every fight."],
  ] },
  { id: "24b", date: "Oct 24", title: "Choose how gear is equipped", entries: [
    ["new", "Gear setting: Empty slots only (default), Always equip, or Never. Find it in the Escape menu or Gear Bag. Fight drops follow it too."],
    ["new", "Gear drops sent to your bag have an Equip button on the loot row. Equipped ones have Swap back."],
    ["new", "Gear tooltips on loot and in the Gear Bag show what you wear in that slot."],
  ] },
  { id: "24a", date: "Oct 24", title: "Talents, spell art, friendlier start", entries: [
    ["new", "New talents for every class. Each now does a real WoW job and every point changes a number you can see. Spent points are kept."],
    ["new", "Warrior: Deep Wounds makes Bleed, Revenge hits back, Last Stand saves you once per fight."],
    ["new", "Paladin: heals give Block, Redoubt keeps your Block, Repentance stuns."],
    ["new", "Hunter: your pet comes back once per fight, traps Weaken, Silencing Shot interrupts."],
    ["new", "Rogue: poison on every hit, start fights in Stealth, Cold Blood doubles a finisher."],
    ["new", "Priest: shields last, Holy crits, Shadowform cuts damage you take."],
    ["new", "Shaman: shock crits, Windfury strikes twice, Reincarnation once per run."],
    ["new", "Mage: Arcane Charges, Ignite Burn, Frostbite freezes and Shatter breaks."],
    ["new", "Warlock: Nightfall casts a free Shadow Bolt, Soul Link shares damage with your demon."],
    ["new", "Druid: Moonfire Burn, Bear and Cat form bonuses, Swiftmend leaves healing over time."],
    ["new", "Spells use the real WoW spell art: real missiles, real impacts, buffs glow on your hero (Smite, Shadow Bolt, Arcane Shot, Earth Shock)."],
    ["bal", "Shaman: Lightning Bolt 5 (was 4), Earth Shock 6, Searing Totem 4, Healing Wave heals 6."],
    ["bal", "Teldrassil: Nature spells heal an enemy for 1 (was 3). Rageclaw has less health and Strength. Githyiss poisons for 3, not 4."],
    ["bal", "Novice's Resolve: with no talent points spent you get extra max HP and enemies have less health. Ends with your first point."],
    ["bal", "Act 1 boss has less health and 1 guard instead of 2. Act 1 elites and all of Act 2 are a bit softer."],
    ["new", "Gear Bag has a button for each slot, so you can swap your second trinket or ring."],
    ["fix", "New loot no longer swaps out your trinket, cloak or off-hand. If the slot is taken it goes to your Gear Bag."],
    ["new", "Choose-one boss loot has a Pass row."],
    ["fix", "Cards no longer shake when you hover them, including on the far right."],
    ["bal", "Seal of Wisdom: Judgement draws 1 card (2 upgraded) and no longer refunds Energy, ending the Seal and Judgement loop."],
    ["new", "The game now tells you when your hand is full or you hit the 10-draw limit."],
    ["fix", "Zone music: if the browser refused a track once, it now comes back on your next click."],
    ["fix", "Boss loot glows in quality colour, shows what it does, and flashes Looted when picked."],
    ["fix", "Campfires are one clean choice: Rest or Upgrade."],
    ["fix", "Event cards show big in the middle of the screen."],
    ["fix", "Uther's Continue button says so if the connection drops, and lets you click again."],
    ["new", "Potions: belt full? Click a dropped potion to drink it. Click a belt potion to drink it any time."],
    ["fix", "Bears are bears, not furbolgs."],
    ["fix", "Taunt works on Target Dummy and Growl, Detect Magic draws the right card, turtles are turtles again, monsters stay over their nameplates."],
    ["fix", "Gear bag scrolls, no more white screens, campfire and chests stay clickable, mute stays muted, fullscreen works on phones."],
  ] },
];
const STILL = "Still working on: Hogger's re-summoned minions, the Stonetalon boss texture, iPhones stuck on the title screen.";
const NOTES = { title: "Patch Notes", outro: "Keep the reports coming. Thanks for playing!" };

function entryRow(e) {
  const text = e[1], m = /^([A-Z][^:.]{1,40}): (.*)$/.exec(text);
  return h("li", { class: "sp-notes-li" },
    h("span", { class: `sp-notes-tag sp-tag-${e[0]}` }, TAGS[e[0]]),
    h("span", { class: "sp-notes-txt" }, ...(m ? [h("b", {}, m[1] + ": "), m[2]] : [text])));
}
function buildBlock(b, i) {
  const det = h("details", { class: "sp-notes-build" },
    h("summary", {},
      h("span", { class: "sp-notes-bid" }, `Build ${b.id}`),
      h("span", { class: "sp-notes-bdate" }, `${b.date}, 2026`),
      h("span", { class: "sp-notes-btitle" }, b.title)),
    h("ul", { class: "sp-notes-list" }, ...b.entries.map(entryRow)));
  if (i < OPEN_BUILDS) det.open = true;
  return det;
}

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === NOTES_ID; } catch (e) { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, NOTES_ID); } catch (e) { /* storage blocked */ } };

export function openPatchNotes() {
  if (!appRef || document.querySelector(".sp-notes")) return;
  let close = null;
  // Enter closes the window, except when it is toggling a build header (summary).
  const onKey = (e) => { if (e.key === "Enter" && !(e.target && e.target.closest && e.target.closest("summary"))) { e.preventDefault(); e.stopPropagation(); close(); } };
  const body = h("div", { class: "sp-notes", role: "document" },
    h("p", { class: "sp-notes-date" }, `You are on build ${BUILD}. Tap a build to open or fold it.`),
    ...BUILDS.map(buildBlock),
    h("p", { class: "sp-notes-p sp-notes-still" }, STILL),
    h("p", { class: "sp-notes-p sp-notes-outro" }, NOTES.outro),
    h("div", { class: "sp-notes-foot" }, btn("Back to the spires", () => close(), { auto: true })));
  close = stageModal(appRef, NOTES.title, body, { onClose: () => { markSeen(); document.removeEventListener("keydown", onKey, true); } });
  document.addEventListener("keydown", onKey, true); // capture: game hotkeys never see Enter while the notes are open
  const f = document.querySelector(".sp-notes [data-autofocus]"); if (f) f.focus({ preventScroll: true });
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
    onClick: () => { pill.textContent = "Updating..."; try { if (appRef && appRef.save) appRef.save(); } catch (e) { /* the last autosave stands */ } location.reload(); } }, // persist the run first: an update must never cost progress (10-30 report)
    h("span", { class: "sp-update-dot" }), h("span", {}, h("b", {}, "NEW UPDATE AVAILABLE"), h("small", {}, "Click to update now. Your run is saved.")));
  overlayHost().append(pill);
}

export function installPatchNotes(app) {
  appRef = app || null;
  if (app) app.patchNotes = openPatchNotes;
  // returning players only: a first-time visitor has nothing to compare against, so the notes are marked read for them
  let returning = !!(app && app.meta && app.meta.stats && app.meta.stats.runs > 0);
  try { returning = returning || !!localStorage.getItem("spires.run.v1"); } catch (e) { /* storage blocked */ }
  // 11-04 report "can't press X on new update screen": opened mid-fight, the window sat under the combat layers. Wait for a calm screen.
  const openWhenCalm = () => { const sc = app && app.run && app.run.screen; if (sc === "combat" || (app && app.screen === "combat")) setTimeout(openWhenCalm, 1500); else openPatchNotes(); };
  if (!seen()) { if (returning) setTimeout(openWhenCalm, 600); else markSeen(); }
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
