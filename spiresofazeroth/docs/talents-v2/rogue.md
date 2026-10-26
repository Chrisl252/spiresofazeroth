# Rogue Talents V2

Status: converted, not deployed, no BUILD bump. Ids, names, icons, tiers and columns are unchanged. Max ranks changed only where listed (`repairSpent` refunds extra points).

Code: `data/talents/rogue.json` (data), `js/engine/talents-v2/rogue.defs.js` (tooltips, 22 `rog_*` keys), `js/engine/talents-v2/rogue.hooks.js` (runtime, state on `C.talrogue`), `tools/spires/test-talents-rogue.mjs` (29 tests).

## Identity
- Assassination: poison on every Attack, finishers (Eviscerate, Kidney Shot, Rupture) that crit, refund Combo Points and give Block, Cold Blood opener.
- Combat: Sinister Strike and Blade Flurry, a stacking per-turn damage ladder (first Attack, then second and later Attacks), dodge, and a one-shot Adrenaline Rush Energy burst at 5 Combo Points.
- Subtlety: start Stealthed, Stealth damage and Block, Initiative Combo Points, debuff exploiting damage, Preparation (exhausted cards return, 3 per fight).

## Budget
Energy: one source, Adrenaline Rush, +1 Energy once per fight at turn start with 5 Combo Points (no loop). Card draw: one source, Blade Flurry (draw 1 after 5 Attacks in a turn, once per turn). Vigor now gives a starting Combo Point (the old Vigor card is untouched). No `TALENT_LIMITS` key is used by any Rogue talent; every rank changes a number (tested).

## Old to new
Old effects were all flat: Malice str1, Remorseless energy1, Ruthlessness res2, Murder goldpct5, Vile Poisons thorns2, Relentless res2, Lethality str1, Improved Kidney Shot draw1, Vigor energy1, Seal Fate res3, Master Poisoner thorns2, Cold Blood free_cast; Combat: res2, dex1, block3, str1, hp8, thorns4, draw1, str1, str2, str2, res3, energy2; Subtlety: stealth1, str1, gold25, dex1, stealth1, res2, block8, str2, draw1, str2, res3, free_cast.
Changed max ranks: none. (All 36 keep their old max.)

### Assassination
| Talent (max) | Old | New effect (rank 1 to max) |
|---|---|---|
| Malice (5) | str 1/rank (max 5) | Finishers that deal damage have a 4% chance to hit for double damage. Rank 5: Finishers that deal damage have a 20% chance to hit for double damage. |
| Remorseless Attacks (2) | energy1 1/rank (max 2) | After you kill an enemy, your next Attack deals +6 damage. Rank 2: After you kill an enemy, your next Attack deals +12 damage. |
| Ruthlessness (3) | res 2/rank (max 3) | After you play a finisher, 20% chance to gain 1 Combo Point. Rank 3: After you play a finisher, 60% chance to gain 1 Combo Point. |
| Murder (2) | goldpct 5/rank (max 2) | Attacks deal +2 damage to enemies at 50% HP or less. Rank 2: Attacks deal +4 damage to enemies at 50% HP or less. Heal 3 HP whenever you kill an enemy. Rank 2: Heal 6 HP whenever you kill an enemy. |
| Vile Poisons (5) | thorns 2/rank (max 5) | Your Attacks apply 1 Poison to their target. Rank 5: Your Attacks apply 2 Poison to their target. Deadly Poison applies 1 more Poison. Rank 5: Deadly Poison applies 5 more Poison. Instant Poison applies 1 more Poison. Rank 5: Instant Poison applies 5 more Poison. |
| Relentless Strikes (2) | res 2/rank (max 2) | Finishers grant 2 Block per Combo Point spent. Rank 2: Finishers grant 4 Block per Combo Point spent. |
| Lethality (5) | str 1/rank (max 5) | Cards that build Combo Points deal +2 damage. Rank 5: Cards that build Combo Points deal +10 damage. |
| Improved Kidney Shot (2) | draw1 1/rank (max 2) | Kidney Shot deals +4 damage. Rank 2: Kidney Shot deals +8 damage. Adds Kidney Shot to your deck at the start of each run. |
| Vigor (1) | energy1 1/rank (max 1) | Start each fight with 1 Combo Point. |
| Seal Fate (3) | res 3/rank (max 3) | Each turn, your first Attack has a 25% chance to grant 1 Combo Point. Rank 3: Each turn, your first Attack has a 75% chance to grant 1 Combo Point. |
| Master Poisoner (3) | thorns 2/rank (max 3) | Attacks deal +2 damage to Poisoned enemies. Rank 3: Attacks deal +6 damage to Poisoned enemies. Adds Wound Poison to your deck at the start of each run. |
| Cold Blood (1) | free_cast 1/rank (max 1) | The first damaging finisher you play each fight deals double damage. Adds Cold Blood to your deck at the start of each run. |

### Combat
| Talent (max) | Old | New effect (rank 1 to max) |
|---|---|---|
| Improved Sinister Strike (2) | res 2/rank (max 2) | Sinister Strike deals +8 damage. Rank 2: Sinister Strike deals +16 damage. |
| Lightning Reflexes (5) | dex 1/rank (max 5) | Each enemy attack has a 6% chance to miss you entirely. Rank 5: Each enemy attack has a 30% chance to miss you entirely. |
| Deflection (5) | block 3/rank (max 5) | Evasion, Feint and Riposte give +4 Block. Rank 5: Evasion, Feint and Riposte give +20 Block. |
| Precision (5) | str 1/rank (max 5) | Your Attacks have a 5% chance to hit for double damage. Rank 5: Your Attacks have a 25% chance to hit for double damage. |
| Endurance (2) | hp 8/rank (max 2) | Blind applies 1 more Weak. Rank 2: Blind applies 2 more Weak. (rank 2) Blind no longer Exhausts. |
| Riposte (1) | thorns 4/rank (max 1) | When an enemy attack is fully absorbed by your Block, deal 5 damage to the attacker. Adds Riposte to your deck at the start of each run. Riposte deals +2 damage. |
| Blade Flurry (1) | draw1 1/rank (max 1) | After you play 5 Attacks in a turn, draw 1 card (once per turn). Adds Blade Flurry to your deck at the start of each run. Blade Flurry deals +3 damage. |
| Dual Wield Specialization (5) | str 1/rank (max 5) | Your second and later Attacks each turn deal +1 damage. Rank 5: Your second and later Attacks each turn deal +5 damage. |
| Weapon Expertise (2) | str 2/rank (max 2) | Hits of 8 or more base damage deal +1 damage. Rank 2: Hits of 8 or more base damage deal +2 damage. |
| Aggression (3) | str 2/rank (max 3) | Finishers that deal damage (Eviscerate, Kidney Shot) deal +1 damage per Combo Point spent. Rank 3: Finishers that deal damage (Eviscerate, Kidney Shot) deal +3 damage per Combo Point spent. |
| Combat Potency (2) | res 3/rank (max 2) | The first time you lose HP each turn, heal 1 HP. Rank 2: The first time you lose HP each turn, heal 2 HP. |
| Adrenaline Rush (1) | energy1 2/rank (max 1) | Once per fight, at the start of a turn where you hold 5 Combo Points, gain 1 Energy. |

### Subtlety
| Talent (max) | Old | New effect (rank 1 to max) |
|---|---|---|
| Master of Deception (5) | stealth 1/rank (max 5) | Attacks deal +3 damage while you are Stealthed. Rank 5: Attacks deal +15 damage while you are Stealthed. Start each fight Stealthed for 1 turn. |
| Opportunity (5) | str 1/rank (max 5) | Backstab, Ambush, Opportunity and Cheap Shot deal +5 damage. Rank 5: Backstab, Ambush, Opportunity and Cheap Shot deal +25 damage. |
| Sleight of Hand (2) | gold 25/rank (max 2) | Pick Pocket deals +3 damage. Rank 2: Pick Pocket deals +6 damage. (rank 2) Pick Pocket no longer Exhausts. Start each run with 25 more gold. Rank 2: Start each run with 50 more gold. |
| Elusiveness (2) | dex 1/rank (max 2) | Vanish give +4 Block. Rank 2: Vanish give +8 Block. (rank 2) Vanish costs 1 less Energy. Each enemy attack has a 5% chance to miss you entirely. Rank 2: Each enemy attack has a 10% chance to miss you entirely. |
| Camouflage (3) | stealth 1/rank (max 3) | Start each fight Stealthed for 1 turn. At the start of your turn, gain 2 Block while Stealthed. Rank 3: At the start of your turn, gain 6 Block while Stealthed. |
| Initiative (3) | res 2/rank (max 3) | Your first Attack each turn while Stealthed has a 34% chance to grant 1 Combo Point. Rank 3: Your first Attack each turn while Stealthed has a 100% chance to grant 1 Combo Point. |
| Ghostly Strike (1) | block 8/rank (max 1) | Adds Ghostly Strike to your deck at the start of each run. The first enemy attack each turn deals 15% less damage to you (min 1). |
| Serrated Blades (3) | str 2/rank (max 3) | Attacks deal +1 damage to Bleeding enemies. Rank 3: Attacks deal +3 damage to Bleeding enemies. Rupture applies 1 more Bleed. Rank 3: Rupture applies 3 more Bleed. Garrote applies 1 more Bleed. Rank 3: Garrote applies 3 more Bleed. |
| Heightened Senses (2) | draw1 1/rank (max 2) | Your first Attack each turn deals +1 damage. Rank 2: Your first Attack each turn deals +2 damage. |
| Deadliness (3) | str 2/rank (max 3) | Attacks deal +1 damage to enemies that are Weakened, Vulnerable, Stunned or Asleep. Rank 3: Attacks deal +3 damage to enemies that are Weakened, Vulnerable, Stunned or Asleep. |
| Premeditation (2) | res 3/rank (max 2) | If you start the fight Stealthed, gain 1 Combo Point. Rank 2: If you start the fight Stealthed, gain 2 Combo Points. |
| Preparation (1) | free_cast 1/rank (max 1) | Up to 3 times per fight, the first card you play in a turn that would Exhaust goes to your discard pile instead (not Sprint, Preparation, Adrenaline Rush, Vigor, Premeditation or Distract). |

## Sim (`node tools/spires/sim.mjs --class rogue --runs 30 --seed S --talents T:P`, wins of 30)
The sim fills tree T first, then the other trees in array order, so `T:51` includes 17 early points of the next tree.

| Config | Before (seeds 11/23/37, avg) | After (seeds 11/23/37, avg) | After, 6 seeds (11 23 37 41 53 67) |
|---|---|---|---|
| none | 3/0/2 (1.7) | 3/0/2 (1.7) | n/a |
| Assassination 25 | 3/5/9 (5.7) | 10/7/11 (9.3) | 9.1 |
| Combat 25 | 13/7/13 (11.0) | 9/5/12 (8.7) | 8.3 |
| Subtlety 25 | 10/10/17 (12.3) | 9/6/12 (9.0) | 9.6 |
| Assassination 51 | 10/7/13 (10.0) | 18/12/17 (15.6) | 17.0 |
| Combat 51 | 12/13/12 (12.3) | 20/15/21 (18.6) | 19.6 |
| Subtlety 51 | 13/13/19 (15.0) | 15/17/22 (18.0) | 18.0 |

Noise is about 1 to 2 wins per seed. Biggest levers found while tuning: Preparation returning Backstab each turn (+4.5 wins, so capped at 3 returns per fight), Lightning Reflexes dodge percent, and any repeatable Energy (Adrenaline Rush as a per-turn effect was +10 wins, so it is once per fight).
