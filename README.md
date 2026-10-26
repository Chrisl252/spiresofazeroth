# Spires of Azeroth ⚔️

> **A free, open-source Classic World of Warcraft roguelike deckbuilder in your browser.**
> Climb the spires of Azeroth, draft iconic vanilla spells, equip legendary gear and Tier sets, and conquer the raid bosses of Classic WoW.

[![Play Live](https://img.shields.io/badge/Play%20Live-thewowdb.com%2Fspiresofazeroth-blue?style=for-the-badge&logo=googlechrome&logoColor=white)](https://thewowdb.com/spiresofazeroth/)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg?style=for-the-badge)](LICENSE)
[![Zero Ads](https://img.shields.io/badge/Monetization-Zero%20Ads%20%2F%20100%25%20Free-green?style=for-the-badge)](#)

---

## 🎮 Play Instantly

No download, no login, no microtransactions, and no ads. Play directly in your web browser:

👉 **[https://thewowdb.com/spiresofazeroth/](https://thewowdb.com/spiresofazeroth/)**

---

## ✨ Features

- **All 9 Classic Classes:**
  - **Warrior:** Battle, Defensive, and Berserker Stances; Rage economy; Shield Slams and Execute.
  - **Mage:** Frost/Fire/Arcane schools; Freeze shattered crits, Pyroblast windups, Arcane Missiles, and Mana Shield.
  - **Rogue:** Stealth openers, Combo Point builders & finishers (Eviscerate, Kidney Shot, Slice and Dice).
  - **Hunter:** Guardian Pet companion (takes single-target hits, Claw/Mend Pet), Ranged shots, Traps, and Aspects.
  - **Priest:** Shadowform and Holy spell weaving; Power Word: Shield, Mind Flay, and Mind Blast.
  - **Warlock:** Soul Shard sacrifice, Life Tap health-for-energy engine, Curses, and massive Shadow Bolts.
  - **Shaman:** Totem summoning (Windfury, Mana Spring, Earthbind, Stoneskin), Chain Lightning, and Shock rotations.
  - **Druid:** Dynamic Shapeshifting (Bear Form tanking, Cat Form combo burst, Caster healing & Wrath).
  - **Paladin:** Holy Seals & Judgements, Blessings, Auras, Lay on Hands, and Divine Shield.

- **40 Classic Zones & Raid Bosses:**
  - Climb through Elwynn Forest, Dun Morogh, Durotar, Mulgore, Teldrassil, Stranglethorn Vale, Western Plaguelands, Blackrock Mountain, and more.
  - Face iconic dungeon and raid encounters: VanCleef, Scarlet Monastery, Baron Rivendare, and raid bosses like **Ragnaros**, **Onyxia**, and **C'Thun**.

- **Classic Gear & Tier Sets:**
  - Equip iconic weapons (Thunderfury, Sulfuras, Perdition's Blade, Ashkandi) and trinkets (Hand of Justice, Blackhand's Breadth).
  - Collect full Tier 1 and Tier 2 raid armor sets that dynamically dress up your 3D hero model on stage!

- **Visceral Combat & Animation Overhaul:**
  - Caster heroes stay planted and perform authentic spellcasting windup, projectile release recoil, and recovery.
  - Upgraded Canvas FX: white-hot star cores, dense streaming particle trails, multi-fork branching lightning, celestial descent rain, and dual shockwave novas.
  - Dynamic Melee Strikes: Enemies leap forward with anticipation squash and ferocious spring recoil.
  - Visceral Hit Impact: 38ms crisp hit-stop, violent knockback scaling with damage, and directional flinch tilt.

- **Account Progression (Slay the Spire rhythm, Classic talent trees):**
  - Every run pays into the account: +1 talent point per act cleared, +5 for beating the final boss, capped at 51 like a level-60 character.
  - Each class has its three Classic talent trees (12 talents per tree, rows open at 5 points per row). Every rank is a run bonus: Strength, Dexterity, Thorns, extra draw or energy, cheaper shops, bigger campfire heals and more.
  - XP from floors, acts and victories levels each class; levels 1, 2 and 3 unlock three more class cards into the reward and shop pools.

- **Authentic Classic Soundscapes:**
  - Original Classic Era zone music and ambient soundscapes across all 40 zones.
  - Per-card spell cast and impact sound effects recorded directly from Classic WoW.

---

## ⌨️ Controls & Shortcuts

| Action | Control |
|---|---|
| **Select Card** | Left Click or Keys `1` – `9` |
| **Play Card** | Click & Drag to Target, or Click Card then Click Target |
| **Throw Potion** | Press a belt potion and drag the arrow onto an enemy (same as a card) |
| **End Turn** | Click 'End Turn' button, or Press `Space` / `E` |
| **Inspect Card** | Hover over card for magnified view and keyword explanations |
| **Options Menu** | Press `Esc` (adjust game speed, volume sliders, music track picker) |
| **Fullscreen** | Press `F` or click the Fullscreen button |
| **Map lanes** | Keys `1` – `3` pick the reachable nodes left to right |

---

## 📁 Layout

- `spiresofazeroth/` is the game (static ES modules, no build step): `js/engine` rules (DOM-free, the headless sim runs them), `js/ui` screens, `js/stage` the Three.js stage, `data/` every card, class, zone, enemy, relic, potion, talent and unlock table as JSON.
- `tools/spires/` dev server, data validator, headless simulators, real-input browser drivers and the authoring scripts.
- `tests/test_spires_static.py` the static gate (file-size limits, data validation).

## 🛠️ Running Locally

Spires of Azeroth is built with vanilla ES Modules and Three.js — no build steps, bundlers, or transpilers required!

### Quick Start (play it on your own computer)

Yes, you can download it and play offline-ish on your own machine. You need **Node.js 18+** (free, https://nodejs.org) and an internet connection the first time, because the Blizzard art and sounds are fetched from thewowdb.com (see below).

```bash
git clone https://github.com/Chrisl252/spiresofazeroth.git
cd spiresofazeroth
node tools/spires/dev-server.mjs 8766
```

Then open **http://localhost:8766/spiresofazeroth/** in your browser. That is the whole setup: no `npm install`, no build step.

- **Why the dev server:** Blizzard icons, 3D character models, spell sounds, UI textures and fonts are not in this repository (they are Blizzard's, see Legal below). `tools/spires/dev-server.mjs` serves the game from your clone and fetches only those missing art and audio files from the live site, so a fresh clone runs with full art. A plain static server (`npx serve`, `python -m http.server`) runs the game logic but shows no art or sound.
- **Your progress** (characters, talents, settings) is saved in your browser's local storage, separate from the live site's.
- **Different port:** `node tools/spires/dev-server.mjs 9000`, then use that port in the URL.
- **Fully offline:** point `WGF_ASSETS` and `WGF_SOUNDS` at your own copies of the art and audio.

---

## 🧪 Testing & Validation

```bash
# Validate all card data, zones, relics, enemies, and sound mappings:
node tools/spires/validate-data.mjs

# Run headless simulation across all 9 classes (20 runs each):
node tools/spires/sim.mjs

# Run static Python test suite:
python -m pytest tests/test_spires_static.py

# Run headless Chrome real-input CDP combat driver:
node tools/spires/combat-drive.mjs '{"cls":"mage","zone":"elwynn","fights":1}'
```

---

## 📬 Reporting Bugs

Found a bug or have balance feedback?
- Click the in-game **"Report a Bug"** parchment button at the bottom of the screen.
- Or open an issue directly here on GitHub.
- Bug reports deliver directly to the project maintainer (`bugs@example.com`).

---

## ⚖️ Legal & Fan Content Disclaimer

*World of Warcraft*, *Warcraft*, and *Blizzard Entertainment* are trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries.

*Spires of Azeroth* is an unofficial, non-commercial fan-made project created under Blizzard Entertainment's Fan Content policy. No copyright infringement is intended. All game assets, icons, sounds, and character models are property of Blizzard Entertainment.

Code is licensed under the [MIT License](LICENSE).
