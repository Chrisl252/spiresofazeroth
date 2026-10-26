# Hunter Talents V2

Status: converted, not deployed. Ids, names, icons, tiers, columns and max ranks are unchanged (saved points stay valid). Code: `js/engine/talents-v2/hunter.defs.js` (tooltips) and `hunter.hooks.js` (behaviour), data `data/talents/hunter.json`, tests `tools/spires/test-talents-hunter.mjs`.

No talent uses a flat-stat key or TALENT_LIMITS. Energy budget +0, card draw +1 (Clever Traps rank 2, conditional on arming a trap).

Seams used (none shared-file): traps are customised by appending effect ops to the newest `C.traps` entry when a trap card is played; pet hits reach `deal()` with `src.kind === "pet"`; `petAct` / `revivePet` are imported from resources.js.

## Beast Mastery
| Talent (max) | Old | New (value at max rank) |
|---|---|---|
| Endurance Training (5) | hp +4/rank | Your pet has +10 max HP. |
| Improved Aspect of the Hawk (5) | str +1/rank | While you are in Aspect of the Hawk, your first Attack each turn deals +5 damage. |
| Thick Hide (3) | armor +1/rank | Your pet starts each turn with 6 Block. Start each fight with 1 Armor (every hit you take is reduced by 1, min 1). |
| Pathfinding (2) | gold +20/rank | Gain 6 Block on the first turn of each fight. |
| Unleashed Fury (5) | str +1/rank | Your pet's hits deal +5 damage. |
| Improved Revive Pet (2) | heal +15/rank | Once per fight, a fallen pet returns at the start of your next turn with 60% HP. Revive Pet costs 1 less Energy. |
| Ferocity (5) | thorns +1/rank | Your pet's hits have a 10% chance to deal double damage. |
| Spirit Bond (2) | regen +3/rank | At the start of each turn, your pet heals 4 HP (you heal 2 if it has fallen). |
| Bestial Swiftness (1) | energy1 +1/rank | At the start of each fight your pet attacks 2 times. |
| Frenzy (3) | draw1 +1/rank | Whenever your pet hits an enemy, you gain 3 Block. |
| Beast Mastery Mastery (2) | hp +8/rank | While your pet is alive, your Attacks deal +2 damage. |
| Bestial Wrath (1) | str +4/rank | While your pet is Enraged, its hits deal 15% more damage. Your pet starts each fight with Enrage 1 (+1 damage on every pet hit). Bestial Wrath costs 1 less Energy. |

## Marksmanship
| Talent (max) | Old | New (value at max rank) |
|---|---|---|
| Efficiency (5) | goldpct +4/rank | Your first Ranged Attack each turn deals +15 damage. |
| Lethal Shots (5) | str +1/rank | Your Ranged Attacks have a 25% chance to deal double damage. |
| Improved Hunter's Mark (3) | str +1/rank | Hunters Mark applies 6 more Marked. Beast Lore applies 3 more Marked. |
| Aimed Shot (1) | draw1 +1/rank | Adds Aimed Shot to your deck at the start of each run. Aimed Shot deals +10 damage. |
| Mortal Shots (5) | str +1/rank | Critical Ranged Attacks deal +30 extra damage. |
| Hawk Eye (3) | hp +4/rank | Gain 12 Block whenever you play a Ranged Attack. |
| Barrage (3) | draw1 +1/rank | Multi Shot, Volley and Arcane Shot deal +6 damage. |
| Scatter Shot (1) | energy1 +1/rank | Your first Attack each fight stuns its target for 1 turn. Scatter Shot deals +4 damage. |
| Ranged Weapon Specialization (5) | str +1/rank | Your Ranged Attacks deal +5 damage. |
| Master Marksman (3) | str +2/rank | Your Attacks deal +3 damage to Marked enemies. |
| Silencing Shot (1) | energy1 +1/rank | Your first Ranged Attack each turn interrupts a casting target and applies Marked 2. |
| Trueshot Aura (1) | str +4/rank | Your Ranged Attacks have a further 4% chance to deal double damage. Adds Trueshot Aura to your deck at the start of each run. |

## Survival
| Talent (max) | Old | New (value at max rank) |
|---|---|---|
| Monster Slaying (3) | str +1/rank | Your Attacks deal +12 damage to Elite and Boss enemies. Your Attacks deal +3 damage. |
| Deflection (5) | dex +1/rank | The first enemy attack each turn deals 25% less damage to you (min 1). |
| Entrapment (5) | thorns +2/rank | A trap that springs also applies Weak 10 to the enemy that sprang it. Adds Freezing Trap to your deck at the start of each run. |
| Savage Strikes (2) | energy1 +1/rank | Your Melee Attacks have a 30% chance to deal double damage. Raptor Strike deals +6 damage. |
| Survivalist (5) | hp +5/rank | Heal 30 HP whenever an enemy dies. |
| Clever Traps (2) | draw1 +1/rank | Arming a trap gives you 12 Block. Arming a trap draws 1 card. |
| Deterrence (1) | block +8/rank | Adds Deterrence to your deck at the start of each run. Deterrence give +4 Block. |
| Trap Mastery (3) | thorns +2/rank | A trap that springs also deals 12 damage to the enemy that sprang it. Adds Immolation Trap to your deck at the start of each run. Adds Explosive Trap to your deck at the start of each run. |
| Counterattack (2) | thorns +3/rank | Adds Counterattack to your deck at the start of each run. Counterattack deals +6 damage. |
| Killer Instinct (3) | str +2/rank | Attacks deal +6 damage to enemies at 50% HP or less. |
| Lightning Reflexes (3) | dex +1/rank | Start each turn with 6 Block. |
| Wyvern Sting (1) | regen +4/rank | Adds Wyvern Sting to your deck at the start of each run. Wyvern Sting deals +3 damage. Wyvern Sting applies 5 more Poison. |

## Sim (30 runs, seeds 11 / 23 / 37, wins out of 30; tree T with P points)
| Config | Before (11/23/37, avg) | After (11/23/37, avg) | Target |
|---|---|---|---|
| none | 0 3 0 = 1.0 | 0 3 0 = 1.0 | unchanged |
| 0:25 Beast Mastery | 7 5 10 = 7.3 | 11 9 8 = 9.3 | 9-12 |
| 1:25 Marksmanship | 2 6 8 = 5.3 | 9 9 11 = 9.7 | 9-12 |
| 2:25 Survival | 9 10 10 = 9.7 | 9 9 12 = 10.0 | 9-12 |
| 0:51 Beast Mastery | 14 13 15 = 14.0 | 18 14 20 = 17.3 | 14-18 |
| 1:51 Marksmanship | 14 14 17 = 15.0 | 20 17 18 = 18.3 | 14-18 |
| 2:51 Survival | 18 17 18 = 17.7 | 22 14 17 = 17.7 | 14-18 |

The sim AI never plays Aspect cards or Hunter's Mark deliberately, so Hawk, Marked and trap talents are covered by the tests and not by these numbers. Noise is about 2 wins on a 3-seed average.
