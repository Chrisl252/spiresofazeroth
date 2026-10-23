# Spires of Azeroth â€” Shared Build Contract (v1, 2026-10-16)

Every agent on this lane builds against THIS file. If the spec and your memory disagree, the spec wins.
Source brief: `<local path>` (read it once).

## 0. Where we are
- Worktree: `<local path>` Â· branch `lane/spires-of-azeroth-20261016` (from `main`).
  The main checkout `<local path>` is 232 commits BEHIND main and dirty with co-workers' lanes â€” never touch it.
- Game root: `<worktree>\spiresofazeroth\` â†’ served live as `http<local path>`.
  nginx `location / { try_files $uri $uri/ =404; }` serves any static folder at the repo root (same as `addons/`, `about/`).
  Cache there is 300 s edge / cf-purge on deploy, NOT the 1-year immutable rule (that applies only to `/assets/` and `/static/`).
  Still: `index.html` loads `js/main.js?v=<BUILD>` and every `fetch()` of `data/*.json` appends `?v=<BUILD>` where BUILD is the
  constant in `js/version.js`. Bump it on every data/JS change.
- Icons: the site ships **~35,000 Blizzard icons** at `assets/icons/<slug>.jpg`. `assets/icons/` is GITIGNORED (prod artefact), so the
  files are NOT in the worktree. Verify slugs against the main checkout: `<local path>`
  (31,979 spell_/ability_/inv_ icons there; the validator reads `SPIRES_ICON_DIR`, default that path). Slug = lowercase icon filename (slug = lowercase icon filename, e.g.
  `spell_fire_flamebolt.jpg`, `ability_warrior_charge.jpg`, `inv_misc_questionmark.jpg`, `ability_hunter_pet_wolf.jpg`).
  Live URL `http<local path>` (1-y immutable, already served). **Never download icons. Never add new
  files to assets/icons.** Every `icon` field in game data is a bare slug (no path, no extension). The validator fails the build if
  `assets/icons/<slug>.jpg` is not on disk. If a spell's exact icon is missing, pick the closest real icon of that school that IS
  on disk (`ls assets/icons | grep <keyword>`), never a made-up name.
- Production `<production path>` is NOT a git checkout; Chris deploys himself. Agents never touch WSL `/srv/`, never run deploy scripts.
- DB (`wgf-postgres`, db `wowgoldfarms`, schema `datamine`, classic product `wow_classic_era`) is reachable ONLY through WSL and
  WSL exec wedged at 11:xx today (`Wsl/Service/0x8007274c`). ONE bounded attempt per agent (`timeout 60`), never a retry loop.
  Tables: `datamine.creature(creature_id,name,classification,creature_type,creature_family)`, `datamine.creature_type`,
  `datamine.creature_family`, `datamine.spell(spell_id,name,description)`, `datamine.spell_misc(spell_id,icon_file_data_id,school_mask)`,
  `datamine.icon_file(file_data_id,slug)`, `datamine.spell_levels`, `datamine.spell_class_options(spell_id,spell_class_set)`.
  Build scoping: `WHERE t.build_seen_id = (SELECT max(_b.id) FROM datamine.build_seen _b WHERE _b.product='wow_classic_era' AND
  EXISTS (SELECT 1 FROM datamine.<table> _t WHERE _t.build_seen_id=_b.id))`. Always `LIMIT`. Never `COUNT(*)`.
  **Client DB2s carry no zone placement**, so zone rosters come from the agent's classic knowledge; the DB (when reachable) verifies
  that each creature NAME exists in classic and supplies family/type. Record the verification state in `data/zones/COVERAGE.md`.
- Hard rules that bind here: files < 800 lines; vanilla JS/CSS only (no frameworks, no bundler); one concern per file; no AdSense on
  the game page; no Wowhead calls from the page (first-party only); `node --check` every JS file; `node tools/spires/validate-data.mjs`
  must pass before you report done.

## 1. Folder layout (fixed)
```
spiresofazeroth/
  index.html                  thin shell: site masthead (copied from addons/index.html pattern), <main id="app">, footer credit
  css/game.css                layout + screens (mobile-first, portrait hand)
  css/wow-ui.css              gold-trim frames, quality colours, cast bars, fonts
  js/version.js               export const BUILD = "20261016a"
  js/main.js                  boot + screen router ONLY (<150 lines)
  js/engine/rng.js            seeded PRNG (mulberry32) + helpers: int(a,b), pick(arr), shuffle(arr), chance(p)
  js/engine/effects.js        the effect DSL interpreter (one function per op, table-dispatched)
  js/engine/status.js         status registry (apply/tick/expire/modify-damage hooks)
  js/engine/deck.js           draw/discard/exhaust piles, hand, retain, shuffle
  js/engine/combat.js         turn loop, energy/resources, intents, targeting, win/lose
  js/engine/intents.js        enemy AI: pattern cursor, conditional moves, phase switch
  js/engine/resources.js      per-class resource rules (rage, combo, mana, shards, totems, forms, seals, pet, schools)
  js/engine/rewards.js        card choice (rarity roll), gold, potions, relics
  js/engine/map.js            spire floor graph (15 floors, 2-4 nodes wide), act routing (6 brackets), seed-stable
  js/engine/relics.js         relic trigger bus (on_turn_start, on_card_played, on_kill, on_combat_start, ...)
  js/engine/save.js           localStorage (try/catch) + export/import JSON string + meta progression
  js/engine/data.js           loader: fetch index.json files, memoise, validate presence
  js/engine/sim.js            headless auto-player API used by tools/spires/sim.mjs (no DOM)
  js/ui/dom.js                h() helper, icon(slug), tooltip, quality colour
  js/ui/title.js  classSelect.js  map.js  combat.js  reward.js  shop.js  rest.js  event.js  codex.js  runEnd.js  settings.js
  data/index.json             { "classes":"classes/index.json", "zones":"zones/index.json", ... }
  data/keywords.json          status + keyword glossary (name, icon, text)
  data/relics.json            80+ relics
  data/potions.json           25+ potions
  data/neutral-cards.json     consumables/professions (any class)
  data/events-common.json     cross-zone events
  data/bosses-final.json      Ragnaros / Nefarian / C'Thun / Kel'Thuzad
  data/classes/index.json     ["warrior","paladin",...]
  data/classes/<class>.json
  data/zones/index.json       [{ "id":"elwynn-forest", "act":1, "continent":"ek" }, ...]
  data/zones/<zone>.json
  data/zones/COVERAGE.md
  ARCHITECTURE.md  CONTRIBUTING.md
tools/spires/validate-data.mjs   schema + cross-ref + icon-on-disk validator (exit 1 on any failure)
tools/spires/sim.mjs             node headless sim: --class X --runs N --seed S â†’ win rate per act
tests/test_spires_static.py      pytest: validator exit 0, no adsense loader in spiresofazeroth/index.html, files < 800 lines
```

## 2. Effect DSL (the ONLY vocabulary for card/enemy/relic/potion effects)
An effect is a JSON object `{ "op": <name>, ...args }`. A card's `effects` is an array executed in order. `target` defaults per op.
Numbers may be an int or a `{ "base": n, "scale": "<resource>|<status>", "per": k, "max": m }` object.

| op | args | meaning |
|---|---|---|
| `damage` | `amount`, `target` (`enemy`\|`all_enemies`\|`random_enemy`\|`self`), `times`, `school` (`physical`\|`fire`\|`frost`\|`arcane`\|`nature`\|`shadow`\|`holy`) | deal damage (Strength/Weak/Vulnerable/Thorns/resist applied by engine) |
| `block` | `amount`, `target` (`self`\|`pet`) | gain Block this turn (Dexterity/Frail applied) |
| `heal` | `amount`, `target` | restore HP |
| `apply` | `status`, `stacks`, `target`, `duration` | add a status (ids from keywords.json) |
| `remove` | `status`, `target` | remove a status |
| `draw` | `count` | draw cards |
| `discard` | `count`, `random`:bool | discard from hand |
| `exhaust_hand` / `exhaust` | (`count`,`random`) | exhaust |
| `gain_energy` | `amount` | +energy this turn |
| `gain_resource` | `resource`, `amount` | class resource (rage, combo, shards, charges, ...) |
| `spend_resource` | `resource`, `amount`\|`all` | consumes; use in `cost`-style conditionals |
| `summon` | `unit` (id from class pets/totems or enemy summons), `count` | summon ally/enemy unit |
| `transform` | `card`:cardId, `target`:`this`\|`hand_random` | replace card |
| `add_card` | `card`, `to`:`hand`\|`draw`\|`discard`\|`deck_permanent`, `count`, `upgraded`:bool | create a card |
| `aoe` | alias for damage with `target:"all_enemies"` | |
| `conditional` | `if`: `{type: "status_on_target"\|"resource_at_least"\|"hp_below_pct"\|"cards_in_hand"\|"enemy_intent"\|"turn_number"\|"form_is"\|"seal_is"\|"stance_is"\|"school_last"\|"target_is_family"\|"chance", ...}`, `then`:[effects], `else`:[effects] | branch |
| `repeat` | `times`, `effects` | loop |
| `set_form` / `set_stance` / `set_seal` / `set_aspect` | `value` | class mode switches |
| `judgement` | â€” | consumes the active Seal, fires its `onJudge` effects (paladin) |
| `pet_action` | `action` | hunter/warlock pet acts now |
| `pet_max_hp` | `amount` | hunter Feed Pet: living pet gains max HP and HP for THIS fight (pets reset each combat) |
| `totem` | `slot` (`earth`\|`fire`\|`water`\|`air`), `unit` | place/replace a totem |
| `retain` / `ethereal` / `innate` / `unplayable` | flags, not ops â€” live in `card.flags` | |
| `scry` | `count` | look at top cards, discard any |
| `gold` | `amount` | run gold |
| `max_hp` | `amount` | permanent max HP |
| `random_card` | `pool`:`class`\|`neutral`\|`any`, `rarity`, `to`, `cost` | generate a random card |
| `energy_next_turn` | `amount` | |
| `double_block` / `double_damage_next` | | |
| `cast_interrupt` | â€” | cancels an enemy "cast" intent (humanoid casters) |
| `taunt` | â€” | forces single-target enemy intents on self (pet/totem absorbs) |
| `revive` | `pct` | undead mechanic |
| `end_turn` | â€” | |

Status ids (keywords.json is authoritative): `vulnerable weak frail poison bleed burn frozen slow stun fear silence strength
dexterity thorns stealth shield regen disease curse enrage armor taunted marked frostbite cold corrupted madness sleep feral
intangible metallicize ritual rage_gen energized`. Each status entry: `{ "id", "name", "icon", "kind":"buff|debuff", "stackMode":
"duration|intensity|none", "text" }`. New status = add to keywords.json AND a hook in status.js (name it in your report).

## 2b. Damage schools + classic immunities (v2, 2026-10-17)
- Schools: `physical fire frost arcane nature shadow holy`. Every card has one: `data/schools.json` `cards{id: school}` (built by `tools/spires/build-schools.py` from the damage effect's `school`, icon prefix, then fx particles; hand overrides in that script). `data/classes` files are untouched; the loader stamps `card.school`, and a `damage` effect without its own `school` uses it.
- Statuses carry a type (`schools.json statusTypes`: dot = bleed poison burn disease; control = slow frozen stun fear sleep silence; debuff = weak vulnerable frail marked frostbite) and the schools they can come FROM (`statusSchools`: bleed physical; poison nature+physical; burn fire; disease shadow+nature; frozen/frostbite frost). Shadow Word: Pain / Corruption are shadow, so they still tick on undead.
- `data/immunities.json`: `families{family:{immune:[status|school], resist:{school:mult}}}` and `types{"family/type":{...}}` (`inherit:false` drops the family row, `same:"undead"` aliases). Resolved at `buildEnemy` into `e.immune[]` / `e.resist{}`. Per-enemy overrides: `"immune":[..]`, `"resist":{..}`, `"noImmunity":true` in the enemy JSON; legacy `immune:x` / `resist:x` traits still count.
- Table: undead = Bleed, Poison, Fear · mechanical = Bleed, Poison, Disease, Fear, Sleep · elemental = Bleed, Poison; fire/magma also Fire+Burn (takes 1.5x Frost), water Frost+Frozen+Frostbite, earth/rock/air Nature; plant/treant/timberling drop the family row (resist Nature) · demon resists Shadow 0.5 · black/blue/green dragonkin resist Fire/Arcane/Nature 0.5 · humanoid/beast/giant: none.
- Engine: `dealDamage` returns `{immune:true}` and floats IMMUNE (Block untouched); resist floats RESIST and `modifyTaken` applies the multiplier; `applyStatus(..., {school})` refuses an immune status (effects.js passes the card school) and floats IMMUNE. fx event: `{t:"miss", uid, text, kind:"gold"}`. A card whose every offensive part is immune is still playable; aiming it shows a red Immune tag (`hand.js immuneOn`). Plates show an immunity icon row (`.sp-immune`, tooltip "Immune: Bleed").
- Rewards: `rewards.js zoneImmuneStatuses` - where >=30% of the zone ignores a status, cards that do nothing but apply it are rerolled 60% of the time.
- Validator: every family must be in the table, every immunity a school or known status, every card a school.

## 3. Class JSON (`data/classes/<class>.json`)
```json
{
  "id": "warrior", "name": "Warrior", "icon": "classicon_warrior",
  "color": "#C79C6E",
  "lore": "one line",
  "startingHp": 80, "startingGold": 99,
  "defaultContinent": "ek",
  "resource": { "id": "rage", "name": "Rage", "icon": "ability_racial_bloodrage", "max": 100, "rules": "text shown in codex",
                "energyPerTurn": 3, "startOfCombat": 0, "gainOnDamageDealt": 5, "gainOnDamageTaken": 5, "decayPerTurn": 0 },
  "archetypes": [ { "id": "arms", "name": "Arms", "icon": "ability_rogue_eviscerate", "text": "..." }, ... 3 total ],
  "relics": [ { ...full relic object (see Â§5) with "class":"warrior" }, { ... } ],   // 2 INLINE class relics
  "starterDeck": [ "heroic-strike", "heroic-strike", "heroic-strike", "heroic-strike", "shield-block", "shield-block", "shield-block", "shield-block", "charge", "rend" ],
  "units": { "<petId>": { "name":"Wolf", "icon":"ability_hunter_pet_wolf", "hp":20, "moves":[...same shape as enemy moves...] } },
  // HUNTER PET = GUARDIAN (Slay the Spire 2 "Osty" rule), resource.pet = { guardian:true, hpPct:30, moves:[Claw], default, choices }:
  //  - units[*] are COSMETIC only (name, icon, cry). No per-family stats/moves; every pet has hpPct% of hero max HP and the shared Claw move.
  //  - damage.js: a single-target enemy attack aimed at the hero hits the living pet first (pet Block, then pet HP). If the pet dies from
  //    that hit, the excess carries to the hero. AoE (several targets) hits hero and pet separately, no carry. Enemy intents show "aim: pet".
  //  - a dead pet has FLED for the rest of the fight (Revive Pet rallies it); every combat starts with a full-HP pet.
  //  - Mend Pet heals+Blocks the pet; Feed Pet (op pet_max_hp) grows its max HP for this fight only (no run-long persistence).
  //  - Pet attacks with Claw at the end of each of your turns; the Claw card / Auto Shot / Call Pet etc. trigger extra pet_action.
  //  - Check: node tools/spires/pet-check.mjs
  "cards": [
    {
      "id": "heroic-strike", "name": "Heroic Strike", "icon": "ability_rogue_ambush",
      "spellId": 78,                      // classic spell id when known (links to /spell/<slug>-<id>/), else null
      "rank": 1, "type": "attack",        // attack | skill | power | stance | form | seal | totem | curse | status
      "rarity": "basic",                  // basic | common | uncommon | rare | epic (epic = boss-only pool, white/green/blue/purple/orange)
      "archetype": "arms",                // or null
      "cost": 1,                          // energy; "X" allowed; -1 = unplayable
      "resourceCost": { "rage": 0 },      // optional
      "target": "enemy",                  // enemy | all_enemies | self | none
      "flags": [],                        // exhaust | retain | ethereal | innate | unplayable
      "text": "Deal {damage} damage. Gain 5 Rage.",   // {tokens} are filled from effects at render time; keep plain text too
      "effects": [ { "op":"damage", "amount": 8 }, { "op":"gain_resource", "resource":"rage", "amount": 5 } ],
      "upgrade": { "name": "Heroic Strike (Rank 2)", "cost": 1, "effects": [ { "op":"damage", "amount": 11 }, ... ], "text": "..." }
    }
  ]
}
```
Rules: 10-card starter (basics), â‰¥40 cards total, â‰¥12 per archetype coverage, every card a real 1.12 spell name of that class
(no TBC+; the brief lists the exclusions). Spell ranks as upgrades. `spellId` from the DB when reachable, else null and a
`"spellIdSource": "unverified"` note. Card text â‰¤ 140 chars.

## 4. Zone JSON (`data/zones/<zone>.json`)
```json
{
  "id": "elwynn-forest", "name": "Elwynn Forest", "continent": "ek", "act": 1, "levelBand": [1,10],
  "spire": { "name": "Tower of Azora", "lore": "one or two lines, real landmark" },
  "theme": { "primary":"#3f6b2a", "secondary":"#1d2a16", "accent":"#d9b25c", "background": "forest" },
  "zoneMechanic": { "id": "wanted-poster", "name": "Wanted Poster", "icon": "inv_scroll_03", "text": "...", "hooks": { "on_spire_start": [...effects...], "on_turn_start": [...], "on_kill": [...], "on_card_played": [...] } },
  "rest": { "id": "...", "name": "...", "icon": "...", "text": "...", "effects": [...] },
  "enemies": [
    {
      "id": "young-wolf", "name": "Young Wolf", "tier": "normal",       // normal | elite | boss | raid
      "family": "beast", "type": "wolf",                                  // family: beast humanoid undead demon elemental dragonkin giant mechanical critter
      "level": [1,2], "hp": [10,14], "icon": "ability_hunter_pet_wolf",
      "npcId": 69,                                                        // classic creature_id when known, else null
      "traits": ["pack"],                                                 // family mechanics the engine applies (pack, revive, armor, resist:fire, breath, caster, summoner, immune:poison)
      "moves": [
        { "id":"bite", "name":"Bite", "intent":"attack", "effects":[{"op":"damage","amount":4}], "weight": 3 },
        { "id":"howl", "name":"Howl", "intent":"buff", "effects":[{"op":"apply","status":"strength","stacks":1,"target":"self"}], "weight": 1, "cooldown": 3 }
      ],
      "pattern": ["bite","bite","howl"],                                  // optional fixed rotation; else weighted random with cooldown
      "phases": [ { "hpBelowPct": 50, "pattern": [...], "onEnter": [...effects...] } ]   // bosses/elites
    }
  ],
  "encounters": { "normal": [ ["young-wolf","young-wolf"], ["kobold-vermin","kobold-vermin","kobold-vermin"] ], "elite": [ ["goldtooth"] ], "boss": [ ["hogger"] ] },
  "events": [ { "id":"...", "name":"...", "icon":"...", "text":"...", "options":[ { "label":"...", "effects":[...], "requires": {...} } ] } ],   // 3-6, real quests/NPCs
  "relics": [ { ...full relic object (see Â§5) with "zone":"elwynn-forest" } ],   // 2-4 INLINE relic objects; the loader merges them into the pool
  "enemiesFile": "elwynn-forest.enemies.json",                              // OPTIONAL: when the roster would push the file past ~800 lines, move
                                                                            // the "enemies" array into data/zones/<zone>.enemies.json (a bare JSON array)
  "raidFloors": [ { "id":"the-stockade", "name":"The Stockade", "unlock":"act_complete", "encounters":{...}, "enemies":[...] } ]   // optional
}
```
Rules: FULL hostile roster for the zone (every hostile mob that existed in 1.12 in that zone, grouped by tier). Real names,
level band, family. Moves themed on the mob's real abilities. Intent kinds: `attack attack_multi block buff debuff summon cast
heal flee unknown`. Encounter lists sized by level (1-4 mobs). Elites 2-3 per zone, boss 1 (+ alternates allowed). Named "?"
placeholders in the brief are NOT truth â€” use the real classic NPC. Record roster size and verification status in COVERAGE.md.

## 5. relics.json (GLOBAL relics only; zone/class relics live inline in their files) / potions.json / neutral-cards.json
```json
{ "id":"hand-of-justice", "name":"Hand of Justice", "icon":"inv_jewelry_talisman_01", "rarity":"rare", "itemId": 11815,
  "zone": null, "class": null, "text":"...", "triggers": { "on_card_played": [ {"op":"conditional", ...} ] } }
```
Relic trigger names: `on_pickup on_combat_start on_turn_start on_turn_end on_card_played on_attack on_damage_taken on_kill
on_combat_end on_rest on_shop on_floor on_hp_loss on_block_gained`. Potions: `{ id, name, icon, rarity, itemId, text, effects,
target }`. Neutral cards: same card shape as class cards with `"class": null`.

## 5b. Act-transition healer (the "Ancient" beat)
After an act is cleared, on every path (optional dungeon done, or skipped, or none), a WoW healer heals HALF of the hero's missing HP once (engine/healer.js; was a full heal before build 20261018) before the next
map / hub / zone pick. Never after the final act (that is victory). Hook: `proceedAfterSpire` in `js/engine/run.js` calls `enterHealer`
(`js/engine/healer.js`), which sets `run.screen = "healer"`, `run.pending = { type:"healer", healerId, hpBefore, healed }` and the persisted
flag `run.healerAct = run.act` (a reload or a second call is a no-op, so it can never heal twice). The scene's Continue (Enter/Space too) calls
`proceedAfterSpire` again, which now routes on. Healers live in `data/healers.json` (`default`, `healers[{id,name,title,icon,acts[],lines[],heal}]`;
`acts` = the acts it greets after; Spirit Healer is the default). The sim applies the same heal (screen "healer" in `sim.js`). Gate: `tools/spires/healer-check.mjs`.

## 6. Reporting format (every agent, at the end)
1. Files written (paths) + line counts.
2. `node --check` results for each JS file (raw).
3. `node tools/spires/validate-data.mjs` output (raw) â€” or, if the validator does not exist yet, the exact list of icon slugs
   you used that are MISSING from `assets/icons/` (run `ls assets/icons/<slug>.jpg`), and anything else unverified.
4. Counts: cards per class / enemies per zone by tier / relics / potions.
5. Open questions in one list. No prose beyond that.
