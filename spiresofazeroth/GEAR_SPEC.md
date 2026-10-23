# Spires of Azeroth — GEAR SPEC (owner ruling 2026-10-17)

Owner: *"instead of gaining RELICS, your character should get GEAR. After every combat it should drop from a
treasure chest (WoW model), it should make the noise when you loot auction house deals, it should be
comprehensive and beautiful, an explosion of loot, and your character model will slowly get more clothed
until you have a fully geared out toon. You start naked, no gear, no weapon; as you move forward you get
stronger AND your actual character should get decked out in gear — memorable, Tier 1 gear."*

Binding for every agent on this lane. `SPEC.md` (engine DSL), `VISUAL_SPEC.md` (stage/actors/fx), and
`ARCHITECTURE.md` stay in force; this file adds the gear system on top. Engine calls in `js/engine/*`
keep their shape; gear is wired through ONE registration line per seam.

## 1. The rule: relics become gear

- The relic trigger bus (`js/engine/relics.js`, `fireRun`) is the gear bus. A piece of gear IS a relic
  object (same effect DSL, same triggers) plus: `slot`, `set`, `setPiece`, `item` (classic itemId),
  `icon`, `displayId` (item display, for dressing), `tier` (0 starter, 1 = Tier 1), `stats` text.
- `run.relics` stays the array of owned ids (so saves/sim/codex keep working) and gains a mirror
  `run.gear = { head, shoulder, chest, wrist, hands, waist, legs, feet, back, mainHand, offHand,
  neck, finger1, finger2, trinket1, trinket2 }` (slot -> gear id or null). Equipping fills the slot;
  a drop for a filled slot upgrades (replaces) it; the old piece's effects stop.
- 16 slots. The 8 armour slots + weapon(s) come from the class's **Tier 1 set** (real classic names,
  item ids, icons from `/assets/icons/`): Warrior Battlegear of Might, Paladin Lawbringer Armor, Hunter
  Giantstalker Armor, Rogue Nightslayer Armor, Priest Vestments of Prophecy, Shaman The Earthfury,
  Mage Arcanist Regalia, Warlock Felheart Raiment, Druid Cenarion Raiment, plus an iconic MC/BWL-era
  weapon per class (e.g. Warrior Sulfuras-tier is too much — use Vis'kag/Obsidian Edged Blade, Mage
  Azuresong Mageblade, Hunter Ancient Petrified Leaf → Rhok'delar, Priest Benediction, etc.).
  Back/neck/rings/trinkets are the "global relic" pool re-expressed as classic jewellery/cloaks with real
  classic names (Onyxia Tooth Pendant, Drake Fang Talisman, Cloak of Firemaw, Band of Accuria, ...).
- Each set piece carries one of the existing class-relic effects or a new set-flavoured effect, and
  every 2/4/6/8 set pieces unlocks a **set bonus** (one effect each; the real Tier 1 bonuses adapted to
  the DSL). Starter: nothing equipped (naked, no weapon). A naked hero has the class starter deck only.
- Drops: after EVERY combat (fight/elite/boss) the reward holds a gear drop in ADDITION to the card
  choice: fight = 1 piece (next unfilled Tier 1 slot in a fixed memorable order: mainHand first, then
  chest, legs, head, shoulder, hands, feet, waist, wrist), elite = piece + a jewellery/cloak choice of 2,
  boss = piece + choice of 3 (rare+). Treasure nodes and shops sell/drop jewellery. By the end of act
  2 a normal run has the full 8-piece set; later drops are upgrades (`+` versions with stronger effect,
  shown as the same item with a green name).
- Data: `data/gear/<class>.json` (set pieces + weapon, see §4), `data/gear/jewellery.json` (global
  pool). `data/relics.json` and inline class/zone relics are MIGRATED into these files (keep the ids
  so old saves load; a save with legacy relic ids maps through `data/gear/legacy-map.json`).
  `tools/spires/validate-data.mjs` validates gear (slots, set sizes = 8, icons exist, unique ids).

## 2. The loot screen (`js/ui/loot.js`, stage-native, between combat result and reward)

- A WoW treasure chest model (classic `Treasure Chest` display — bake via the Classic bake lane into
  `assets/models/chest-<kind>.glb`: wooden (fight), ornate silver (elite), gold raid chest (boss)) drops
  from above onto the stage ground at the enemy lane centre with dust, settles, the lid opens.
- **Loot explosion**: on open, `fx` fires a gold fountain (coins from the particle atlas) + light
  shaft + sparkles; the gear item's icon plate shoots out in an arc and lands centre stage LARGE
  (320 px frame, rarity-coloured border, item name in frizqt, slot, effect text, set progress "Battlegear
  of Might 3/8" with the next set bonus shown), card choice fans out beside it as today. Gold number
  punches. Reduced motion: no fountain, items fade in.
- **Sound**: the first in-game sound. `js/audio.js` grows a tiny player (HTMLAudio, unlocked on first
  user gesture, default ON with a mute toggle in Settings; remember in localStorage). Ship
  `assets/sfx/loot-coin.ogg` + `.mp3`: the classic "coin loot" / auction-house purchase sound from the
  site's sound library (WSL `<production path>`, indexed by the sounds pages; search LootCoinSmall /
  LootCoinLarge / PutDownCoins / AuctionWindow). Copy the file into the game folder at build time — the
  page never calls `/sounds/`. Also: chest open creak + item "whoosh" if present in the same library.
- Click/press to continue → the existing reward screen (cards). Equip is automatic; the screen says
  "Equipped" with a before/after of the slot if it replaced a piece.

## 3. The hero dresses up (dressing bake lane)

- The hero actor swaps its GLB as gear is equipped: `assets/models/hero/<class>-<mask>.glb` where
  `mask` is the sorted list of equipped armour slot codes (e.g. `warrior-c`, `warrior-cl`,
  `warrior-chl`...). To keep it bounded, bake the fixed drop ORDER only (9 states per class: naked,
  +mainHand, +chest, +legs, +head, +shoulder, +hands, +feet, +waist/wrist = full) = 81 GLBs, ≤ 400 KB
  each, textures 256 px. Weapons are attached at the hand bone (right hand attachment) as a separate
  small GLB (`weapon-<itemDisplay>.glb`), so 9 extra files.
- Pipeline (build time, in `tools/spires/bake_hero_gear.py`, reusing the previous bake lane):
  item -> `datamine.item_modified_appearance` -> `item_appearance` -> `item_display_info` ->
  `item_display_info_material_res` (component textures per region) composited onto the body skin
  exactly as `tools/datamine/chr_skin_composite.py` in the main checkout already does; geosets for
  shoulders/helm/boots/gloves/belt/cloak via `item_display_info` geoset groups and the attached
  `.m2` models (helm/shoulder) at their attachment points. Hair + face: pick one default hair/face for
  each race/sex so the hero is not bald (the previous lane skipped it as >30 min; do it now, it is part
  of "memorable").
- `actors3d.setHero({classId, gearMask})` picks the file; on equip the actor flashes gold and swaps
  (crossfade 300 ms); idle/attack/death clips are identical across states. Fallback when a state file
  is missing: the nearest lower state.
- Dev page `dev/hero-gear.html`: all 9 classes × 9 states on a grid, pixel-scanned like bake-check.

## 4. Data shape

```jsonc
// data/gear/warrior.json
{ "class": "warrior", "set": { "id": "battlegear-of-might", "name": "Battlegear of Might",
    "bonuses": [ { "pieces": 2, "name": "…", "effects": [ …DSL… ] }, { "pieces": 4, … }, { "pieces": 6, … }, { "pieces": 8, … } ] },
  "pieces": [
    { "id": "helm-of-might", "name": "Helm of Might", "slot": "head", "item": 16866, "icon": "inv_helmet_09",
      "displayId": 0, "tier": 1, "rarity": "rare", "stats": "+23 Stamina, +15 Strength",
      "text": "At the start of each turn gain 2 Block.", "triggers": { … same shape as a relic … } },
    … 8 pieces …
  ],
  "weapon": { "id": "viskag-the-bloodletter", "slot": "mainHand", "item": 17075, "icon": "inv_sword_28", "displayId": 0, … } }
```
`displayId` is filled by the dressing lane (`tools/spires/gear-displays.py` resolves item -> display
via the DB; 0 until then).

## 5. Where it shows

- HUD top bar: the relic strip becomes a **gear strip** (16 slot sockets in the WoW paper-doll order,
  empty sockets dim, filled show the icon with tooltip; set progress badge). Codex: a Gear tab per
  class with set bonuses. Run end: the hero in whatever it wore + "Gear" line in the stat scroll.
- Shop sells jewellery/cloaks (`shop.relics` → `shop.gear`), events that gave relics give gear.
- Sim (`tools/spires/sim.mjs`) drops gear exactly like the UI path so balance numbers include set bonuses.

## 6. Ownership / order

1. **Engine + data + loot screen agent**: §1, §2 (chest model may be a placeholder actor until the bake
   lands; use the Classic bake tools to bake the chest displays yourself if the DB has them), §4, §5
   HUD/codex/shop/sim. Owns `js/engine/{relics,rewards,run}.js`, `data/gear/*`, `js/ui/{loot,reward,codex}.js`,
   `js/audio.js`, `assets/sfx/*`. Touch `js/ui/{hud,combat,shop,runEnd}.js` ONLY after the integration
   agent's commit "spires v2 integ:" is on the lane (check `git log`); until then leave a TODO + one call.
2. **Dressing bake agent**: §3. Owns `tools/spires/bake_hero_gear.py`, `tools/spires/gear-displays.py`,
   `assets/models/hero/*`, `dev/hero-gear.html`, and the `setHero({gearMask})` change in
   `js/stage/actors3d.js` (minimal, backed up).
Verification, backups, commits by explicit path (prefix `spires v2 gear:` / `spires v2 dress:`), no
`<production path>`, fresh-profile Chrome only — as in VISUAL_SPEC.md §Verification.

## 7. Starter outfit (owner ruling 2026-10-17, supersedes "you start naked")
- State 0 is the class's real classic starter outfit (wago CharStartOutfit 1.15.9.70003, OutfitID 0, our race/sex pair; list in `data/gear/starter.json`, built by `tools/spires/build-starter.py` from `gear_roster.STARTER`).
- Starter pieces are tier 0 relics (`starter-<class>-<itemId>`, white, text "Starter", no effects). `newRun` equips them (`gear.equipStarter`); a Tier 1 drop treats a starter slot as empty and replaces it. `gearLevel(run)` ignores starter pieces, so hero state n still = Tier 1 drops only.
- Every hero mount calls `setHero({ classId, gearMask: gearLevel(run) })` (combat boot, run end, shop when the body is the hero, loot). Omitting gearMask falls back to the old naked `hero-<class>.glb`.
