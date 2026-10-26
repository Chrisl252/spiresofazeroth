# Warlock Talents V2

Ids, names, icons, tiers, columns and max ranks are unchanged. No TALENT_LIMITS keys (`energy1`, `draw1`, `hp`, `spell_power`, ...) remain. Hooks live in `js/engine/talents-v2/warlock.{defs,hooks}.js` (keys `wlk_*`); generic hooks are reused where they fit. Test: `node tools/spires/test-talents-warlock.mjs`.

Class-wide budget: +1 draw (Master Summoner rank 2, once per turn) and +1 Energy (Fel Domination, first summon each fight refunds 1). Nothing else gives Energy or cards. Five capstone cards are granted to the starting deck (Siphon Life, Demon Armor, Soul Link, Shadowburn, Conflagrate).

## Affliction (DoTs and drain)
| Talent (max) | Old | New effect per rank |
|---|---|---|
| Suppression (5) | +1 Dex | Corruption +3 Poison |
| Improved Corruption (5) | +2 Thorns | end of turn every Poisoned enemy takes +2 shadow; Corruption +1 dmg |
| Improved Curse of Weakness (3) | +3 Block | Weakness, Tongues, Exhaustion +2 Weak each |
| Improved Drain Soul (2) | +2 res | Drain Soul +4 dmg, applies 3 Poison |
| Improved Life Tap (2) | +1 Energy | Life Tap heals 2 and gives 5 Block |
| Fel Concentration (5) | +4 max HP | Drain spells heal +3 and give 3 Block |
| Improved Curse of Agony (3) | +2 Spell Power | Agony +5 Curse, Siphon Life +3 Curse |
| Grim Reach (2) | +1 draw | dying Poisoned enemy passes 40/70% of its Poison on |
| Nightfall (2) | free cast | Corruption/Drain Life/Drain Soul: 10/25% free Shadow Bolt (9) |
| Shadow Mastery (5) | +1 Spell Power | shadow hits +1; +1 more vs Poisoned (ranks 2-5) |
| Dark Pact (2) | +1 Energy | Dark Pact +3 Block, heals demon +1 |
| Siphon Life (1) | vampiric | heal 1 per Poisoned enemy at end of turn; adds Siphon Life |

## Demonology (demons, shards, Soul Link)
| Talent (max) | Old | New effect per rank |
|---|---|---|
| Improved Healthstone (2) | +15% heal | Healthstone +6 HP; rank 2 Create Healthstone costs 0 |
| Demonic Embrace (5) | +5 HP | Demon Skin +2 Block; Regen +1/+1/+2/+2/+3 |
| Improved Voidwalker (3) | +5 shield | Voidwalker +10 max HP; rank 3 Summon Voidwalker costs 1 less |
| Fel Intellect (5) | +15 res | start fights with +1 Soul Shard |
| Fel Domination (1) | +1 Energy | first summon each fight refunds 1 Energy |
| Fel Stamina (5) | +5 HP | demon heals 4 at the start of your turn |
| Master Summoner (2) | +1 draw | summons give 6 Block; rank 2 first summon each turn draws 1 |
| Unholy Power (5) | +1 Str | demon hits +2; +1 per 3 shards (cap +2 per rank) |
| Demonic Sacrifice (3) | +2 Spell Power | Sacrifice +6 Block; ranks 2-3 +1 Strength |
| Master Demonologist (3) | +1 Armor | demon alive: spells +2 dmg, you take 1 less per hit |
| Demonic Aegis (2) | +8 shield | turn start with Armor: +2 Block; adds Demon Armor |
| Soul Link (1) | +2 Armor | 25% of damage taken goes to the living demon; adds Soul Link |

## Destruction (Shadow Bolt, Conflagrate, crits)
| Talent (max) | Old | New effect per rank |
|---|---|---|
| Improved Shadow Bolt (5) | +1 Spell Power | Shadow Bolt +2 dmg; marks target, next other shadow hit this turn +1 |
| Cataclysm (5) | +4% gold | multi-target spells +2 dmg each; rank 5 Rain of Fire and Hellfire cost 1 less |
| Bane (5) | +1 Dex | Immolate +1 Burn, Soul Fire +2 dmg |
| Aftermath (5) | +1 Thorns | end of turn Burning enemies take +1 fire; ranks 3-5 +1 Weak |
| Devastation (5) | +1 Spell Power | Attacks crit (x2) 5% per rank |
| Shadowburn (1) | +1 Energy | enemies at 50% HP or less take +2 from Attacks; adds Shadowburn |
| Intensity (2) | +6 HP | 2nd Attack each turn gives 2 Block |
| Destructive Reach (2) | +1 draw | Rain of Fire +1 Burn; rank 2 Hellfire costs no HP |
| Improved Searing Pain (5) | +1 Spell Power | Searing Pain +1 dmg, +1% crit |
| Ruin (3) | +2 Spell Power | crits deal +10% more (x2.1, x2.2, x2.3) |
| Emberstorm (2) | +1 Energy | fire hits +1 dmg |
| Conflagrate (1) | +4 Spell Power | leaves 35% of the Burn, +2 dmg; adds Conflagrate |

## Sim (wins of 30, seeds 11/23/37 average; `--talents T:P`)
Measured 2026-10-23 on the shared worktree while other classes were being converted (engine drift is about +-1 per seed).
| Config | Before (flat) | After |
|---|---|---|
| none | 2.0 | 2.0 |
| Affliction 25 | 11.3 | 9.0 |
| Demonology 25 | 7.0 | 9.6 |
| Destruction 25 | 9.3 | 8.6 |
| Affliction 51 | 16.7 | 19.6 |
| Demonology 51 | 18.0 | 16.0 |
| Destruction 51 | 13.3 | 17.3 |
