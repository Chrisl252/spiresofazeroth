# Talents V2: Mage

Files: `data/talents/mage.json` (same 36 ids, names, icons, tiers, cols, max ranks), `js/engine/talents-v2/mage.defs.js` (tooltips, `mag_` keys), `js/engine/talents-v2/mage.hooks.js` (runtime, state on `C.talmage`), test `tools/spires/test-talents-mage.mjs`.
Engine facts the design leans on: the "schools" auto mechanic is OFF for the Mage (`class.resource.mechanics` unset), so Ignite does not add damage by itself and Weak does not turn into Frozen by itself. Ignite is a resource spent by Combustion and Pyroblast (3+ for the burst branch). Frozen only comes from talents here. Draw and energy added by the whole tree: Presence of Mind (learned card, +1 energy once per fight) and Cold Snap (draws 1 to replace itself, once per turn).

## Old to new (old: all flat stats capped by TALENT_LIMITS)
| Tree | Talent (max) | Old | New effect per rank |
|---|---|---|---|
| Arcane | Arcane Focus (5) | spell_power 1 | Arcane Missiles +1 damage on every hit |
| Arcane | Arcane Subtlety (2) | dex 1 | first enemy attack each turn -6%/-12% |
| Arcane | Magic Absorption (5) | shield 2 | first HP loss each turn: +1 Block per rank |
| Arcane | Arcane Concentration (3) | free_cast | Arcane card: 10/20/30% for +1 Arcane Charge |
| Arcane | Improved Arcane Explosion (3) | thorns 2 | Arcane Explosion +3 damage |
| Arcane | Magic Attunement (2) | hp 6 | start with 3/6 Arcane Charges |
| Arcane | Improved Mana Shield (2) | shield 5 | Mana Shield +5 Block, grants 1/2 Charges |
| Arcane | Arcane Resilience (1) | armor 1 | start with 5 Armor |
| Arcane | Presence of Mind (1) | free_cast | learns Presence of Mind; next Attack +6 per hit |
| Arcane | Arcane Mind (4) | draw1 | at 5+ Charges the first Arcane hit of each spell per target +2/3/4/5 |
| Arcane | Spell Power (3) | spell_power 2 | first hit of every Attack spell per target +2/4/6 |
| Arcane | Arcane Power (1) | spell_power 4 | learns Arcane Power; at 6+ Charges Arcane hits +30% |
| Fire | Improved Fireball (5) | spell_power 1 | Fireball +1 damage, +1 Burn |
| Fire | Impact (5) | dex 1 | first Fire hit per enemy per turn +1 per rank |
| Fire | Ignite (5) | thorns 1 | each Fire hit 15/30/45/60/75% to apply 3 Burn |
| Fire | Flame Throwing (2) | draw1 | Fire Blast +1 damage, +1 Burn |
| Fire | Incinerate (2) | spell_power 2 | Scorch +1 damage, +1 Vulnerable |
| Fire | Improved Flamestrike (3) | spell_power 2 | Flamestrike +5 damage, +1 Burn |
| Fire | Burning Soul (2) | hp 6 | start with 2 Ignite; turn start Block 6 per rank + 1 per 3 Ignite |
| Fire | Master of Elements (3) | goldpct 5 | playing a different school than the last card: +8 Block per rank |
| Fire | Fire Power (5) | spell_power 1 | Fire hits +1 damage |
| Fire | Critical Mass (3) | spell_power 2 | Fire hits 5/10/15% to crit (x2) and grant 1 Ignite |
| Fire | Pyroblast (1) | energy1 | learns Pyroblast, costs 1 less |
| Fire | Combustion (1) | spell_power 4 | learns Combustion; Combustion and Pyroblast apply Burn = 50% of Ignite held |
| Frost | Frost Warding (2) | block 4 | Frost Ward and Ice Barrier +5 Block |
| Frost | Improved Frostbolt (5) | spell_power 1 | Frostbolt +2 damage |
| Frost | Elemental Precision (3) | spell_power 1 | Frost hits +3 vs Weak |
| Frost | Ice Shards (5) | dex 1 | Frost hits 5% per rank to crit (x2) |
| Frost | Frostbite (3) | thorns 2 | Frost hit 15/30/45% to Freeze the target first |
| Frost | Improved Frost Nova (2) | block 4 | Frost Nova +1 damage, +1 Weak |
| Frost | Permafrost (3) | regen 2 | turn start: 2 Block per rank per Weak or Frozen enemy |
| Frost | Piercing Ice (3) | spell_power 2 | Frost hits +1 damage |
| Frost | Cold Snap (1) | energy1 | learns Cold Snap, +4 damage, draws 1 (once per turn) |
| Frost | Arctic Reach (2) | draw1 | Blizzard and Cone of Cold +2 damage |
| Frost | Shatter (3) | spell_power 2 | Frost hits +20% per rank vs Frozen |
| Frost | Ice Block (1) | retain_block | learns Ice Block; playing it Freezes all enemies, heals 15% max HP |

Note: the sim fills talents in array order and ignores tier gates, so every "N:51" run also buys the first ~15 to 19 points of the neighbouring trees. Power was therefore moved from tier 1 and 2 into tier 3 and 4 so a respec into one tree does not borrow too much from the others. Tooltips come from `mage.defs.js`, so they cannot drift from the JSON.

## Sim (wins out of 30)
| Talent points | Old (3 seeds 11/23/37, mean) | New seeds 11/23/37 | New mean of 10 seeds | Target |
|---|---|---|---|---|
| none | 1 / 0 / 0 | 1 / 0 / 0 | n/a | unchanged |
| Arcane 25 | 10 / 11 / 8 (9.7) | 10 / 5 / 8 (7.7) | 9.5 | 9-12 |
| Fire 25 | 13 / 9 / 8 (10.0) | 10 / 5 / 5 (6.7) | 8.7 | 9-12 |
| Frost 25 | 17 / 11 / 9 (12.3) | 16 / 9 / 9 (11.3) | 9.9 | 9-12 |
| Arcane 51 | 23 / 16 / 18 (19.0) | 21 / 20 / 21 (20.7) | 20.0 | 14-18 |
| Fire 51 | 22 / 20 / 20 (20.7) | 23 / 16 / 18 (19.0) | 18.3 | 14-18 |
| Frost 51 | 23 / 16 / 21 (20.0) | 21 / 16 / 15 (17.3) | 18.9 | 14-18 |

Per-seed noise is about 3 wins, so the 10-seed mean (seeds 11 23 37 41 53 67 71 89 97 101) is the number to read. Arcane 51 stays a hair above target: the full Arcane tree alone (32 points) is 18 and the 19 extra points the sim spends in Fire add the rest. The lever the sim rewards most is survivability (Block, deflect), so those were kept deliberately small.
