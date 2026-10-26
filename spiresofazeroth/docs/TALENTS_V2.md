# Talents V2 (Warrior pilot)

Status: Warrior converted; the other 8 classes still use the flat-stat path. Not deployed, no BUILD bump.

## How it works
- A talent is `{id,name,icon,tier,col,max,effect:E,extra?:[E...]}` with `E = {key, per, vals?, arg?}`.
  Value at rank r = `vals ? vals[min(r,len)-1] : r*per`. Mods key = `key` or `key:arg` (a comma list arg fans out per card; `card_apply`/`card_inflict` arg = `card:status`).
- `engine/talents.js` merges the `HOOKS` from `engine/talentHookDefs.js` into EFFECTS. `modsFromSpent(tdef, spent)` builds the flat mods map (the sim uses the same function). Legacy keys (`str`, `res`, ...) still work and still go through `TALENT_LIMITS`. V2 keys are never capped; the design is the cap.
- `engine/talentHooks.js` runs hooks on the relic trigger bus (`relics.fire` calls `talentFire`) plus a few inline seams: `damage.js` (talentDamage/Taken/Thorns/Blocked/Block), `deck.js cardCost`, `combat.js` (sweep, no-exhaust, carry block), `effects.js` (apply bonus, skip self hit), `preview.js` (dry run), `run.js` (grants). Everything is a no-op when no V2 key is in `run.talents`.
- Tooltips come from `HOOKS[key].text(value, effect)`, so numbers cannot drift from the JSON. `ui/talents.js` shows the current and next rank for every effect of a talent.
- Safety: `repairSpent(meta, classId, tdef)` clamps saved ranks to the new max, drops unknown ids, and refunds tiers that lost their prerequisite points. It runs at talents screen render and at class select. Talent ids are unchanged.
- Constants (`talentHookDefs.js`): HEAVY_HIT 8, ENRAGE_RAGE 30, GUARD_BLOCK 8, WOUNDED_PCT 50, RAGE_PER_DMG 10, LAST_STAND 30% HP / 10 Block / 10% heal, SWEEP_RAGE 3.

## 1. Hook library (36 keys)
| Key | Effect |
|---|---|
| card_dmg | +N damage on named cards |
| card_apply | named card applies N more of a status |
| card_inflict | named card also applies N of a status to its target |
| card_cost | named card costs N less |
| card_rage | named card grants N more Rage |
| card_block | named card gives +N Block |
| card_noexhaust | named card no longer Exhausts |
| card_nohurt | named card no longer costs HP |
| grant | adds a card to the starting deck |
| first_stun | first Attack each fight stuns N turns |
| attack_bleed | Attacks apply N Bleed |
| bleed_dmg | +N damage vs Bleeding enemies |
| wounded_dmg | +N damage vs enemies at 50% HP or less |
| heavy_hit | +N on hits with 8+ base damage |
| crit | N% chance to double an Attack |
| first_aoe | first Attack each turn also hits all others, +3 Rage |
| attack_draw | after N Attacks in a turn, draw 1 (once per turn) |
| attack_ramp | each Attack adds +N to later Attacks this turn |
| attack_heal | heal N per Attack |
| attack_rage | +N Rage per Attack |
| death_wish | Attacks +N% damage, you take half of N% more |
| rage_dmg | +1 damage per 10 Rage, up to N |
| enrage_dmg | +N damage at 30+ Rage |
| rage_block | turn start: 1 Block per 10 Rage, up to N |
| start_rage | start fight with N Rage |
| turn_rage | +N Rage each turn |
| h_armor | start fight with N Armor |
| deflect | first enemy attack each turn deals N% less (min 1) |
| turn_block | start each turn with N Block |
| block_carry | keep N% of Block into next turn |
| block_thorns | +N Thorns while Block is up |
| block_revenge | attack fully absorbed by Block deals N to the attacker |
| guard_dmg | +N damage at 8+ Block |
| hurt_heal | first HP loss each turn heals N |
| hurt_boost | after losing HP, next Attack +N |
| low_hp_guard | once per fight at 30% HP: 10 Block, heal 10% |

Adding a hook: one entry in `HOOKS` (label + text), one branch in `talentFire` or a seam function, one test in `tools/spires/test-talent-hooks.mjs`.

## 2. Warrior old to new
Old effects were all flat (Arms: str1 dex1 thorns2 res15 res5 str1 str1 rage_gen1 str2 draw1 energy1 str4; Fury: str1 res5 rage_gen1 str1 regen2 draw1 str1 draw1 energy1 goldpct5 regen4 str3; Prot: block3 armor1 dex1 res15 hp12 retain_block1 metal1 thorns3 energy1 armor1 str1 block12). The Warrior tree no longer carries `energy1` or `draw1`.

| Tree | Talent (max) | New effect per rank |
|---|---|---|
| Arms | Improved Heroic Strike (3) | Heroic Strike +1 dmg |
| Arms | Deflection (5) | first enemy attack each turn -3% |
| Arms | Improved Rend (3) | Rend +2 Bleed, +2 dmg; learns Rend |
| Arms | Improved Charge (2) | Charge +10/+15 Rage; costs 1 less |
| Arms | Tactical Mastery (5) | Attacks +1 per 10 Rage, up to +rank |
| Arms | Deep Wounds (3) | Attacks apply 4/6/9 Bleed |
| Arms | Two-Handed Weapon Spec. (5) | 8+ base hits +3 per rank |
| Arms | Anger Management (1) | +12 Rage each turn |
| Arms | Impale (2) | +4 dmg vs Bleeding per rank |
| Arms | Sweeping Strikes (1) | first Attack each turn hits all |
| Arms | Poleaxe Spec. (3) | +2/4/6 vs enemies at 50% HP |
| Arms | Mortal Strike (1) | learns Mortal Strike, +8 dmg, applies 4 Bleed |
| Fury | Cruelty (5) | +3% crit per rank |
| Fury | Booming Voice (5) | +2 starting Rage per rank; turn-start Block per 10 Rage (cap 0/1/1/1/2) |
| Fury | Unbridled Wrath (3) | +2/3/4 Rage per Attack |
| Fury | Improved Battle Shout (5) | Strength +1 (+2 at rank 5); +3 Rage per rank; learns it |
| Fury | Blood Craze (3) | heal 2 per rank on first HP loss each turn |
| Fury | Piercing Howl (1) | learns it, +8 Rage |
| Fury | Enrage (5) | next Attack +1 per rank after losing HP |
| Fury | Flurry (3) | draw 1 after 5/4/3 Attacks |
| Fury | Death Wish (1) | +4% dmg dealt, +2% taken |
| Fury | Berserker Stance (3) | +1/2/3 dmg at 30+ Rage |
| Fury | Bloodthirst (1) | learns it, +1 dmg, heal 1 per Attack |
| Fury | Rampage (1) | Attacks ramp +1 within the turn |
| Prot | Shield Specialization (5) | Shield Block +1 Block per rank |
| Prot | Toughness (5) | start Armor 1/1/1/2/2, +2 max HP per rank |
| Prot | Anticipation (5) | turn Block 0/1/1/2/2; keep +3% Block per rank |
| Prot | Improved Bloodrage (2) | no HP cost at rank 2; +10/+15 Rage; learns it |
| Prot | Last Stand (1) | once per fight at 30% HP: 10 Block, heal 10% |
| Prot | Improved Shield Block (1) | keep 10% Block |
| Prot | Defiance (5) | +1 Thorns while Block is up per rank |
| Prot | Improved Revenge (3) | fully absorbed attack hits back for 1/2/3 |
| Prot | Concussion Blow (1) | first Attack each fight stuns 1 turn |
| Prot | Improved Shield Wall (2) | cost -1 and +4 Block at rank 2, learns it |
| Prot | One-Handed Weapon Spec. (3) | +1/2/3 dmg at 8+ Block |
| Prot | Shield Slam (1) | learns it, +3 dmg |

Rules applied: every rank changes a number (a test enforces it), no Warrior talent uses a flat-stat key, and nothing relies on a cap.

## 3. Proposed conversion for the other 8 classes
Reuse hooks where the resource matches; add the listed new hooks. Keep ids and max ranks.

| Class | Trees | Signature mechanics (reuse / new hooks) |
|---|---|---|
| Paladin | Holy / Protection / Retribution | Holy: `attack_heal`, `card_block` on blessings, new `heal_block` (overheal to Block). Prot: `turn_block`, `block_thorns`, `block_revenge`, `deflect`. Ret: `card_dmg` on Seals/Judgement, `first_aoe`, new `holy_power_dmg` (scaled like `rage_dmg`) |
| Hunter | Beast Mastery / Marksmanship / Survival | BM: new `pet_dmg`, `pet_block`. Marks: `crit`, `wounded_dmg`, `first_stun`. Survival: new `trap_dmg`, `card_apply` on poisons and bleeds, `bleed_dmg` |
| Rogue | Assassination / Combat / Subtlety | Combo resource: new `combo_dmg`, `combo_start`, `finisher_refund`. `attack_bleed` for poisons, `attack_draw`, `crit`, `card_cost` on openers |
| Priest | Discipline / Holy / Shadow | Disc: `card_block` on Power Word: Shield, `block_carry`. Holy: `hurt_heal`, new `heal_dmg`. Shadow: `card_apply` for DoTs, new `dot_dmg` |
| Shaman | Elemental / Enhancement / Restoration | Elemental: `crit`, `card_dmg`. Enhancement: `attack_ramp`, new `attack_res`. Resto: `hurt_heal`, `turn_block`. Totems via `card_apply` |
| Mage | Arcane / Fire / Frost | Arcane: new `mana_dmg`, `card_cost`. Fire: `card_apply` ignite, new `ignite_dmg`, `crit`. Frost: `card_apply` chill, `first_stun`, `card_block` on barriers |
| Warlock | Affliction / Demonology / Destruction | Affliction: `card_apply` DoTs, `dot_dmg`. Demo: `grant` pet cards, `pet_dmg`. Destruction: `crit`, `card_dmg`, `wounded_dmg` |
| Druid | Balance / Feral / Restoration | Balance: `card_dmg`, `card_apply` Moonfire/Sunfire. Feral: `attack_bleed`, `bleed_dmg`, combo hooks. Resto: `hurt_heal`, `turn_block`, `block_thorns` |

### Rollout checklist per class
1. Read the class resource and status ids in `data/classes/<id>.json`; add its resource hooks to `talentHookDefs.js` (text) and `talentHooks.js` (behavior), gated on `C.cls.resource.id`.
2. Rewrite `data/talents/<class>.json` with V2 effects, same ids, names, icons, tiers, cols and max ranks.
3. Add that class's hooks to `test-talent-hooks.mjs` (build a combat with `run.talents`, assert the delta).
4. Tune with `node tools/spires/sim.mjs --class <id> --runs 30 --seed S --talents N:P` over 8 to 10 seeds (noise is about 1 win per seed). The sim fills talents in array order and ignores tier gates, so `N:51` includes about 15 early points from tree 0.
5. Lift that class's `TALENT_LIMITS` entries once all its keys are V2.
6. Run `validate-data`, `test-talents`, `test-talent-hooks`; screenshot the tree.
