# Shaman talents, V2

Files: `data/talents/shaman.json`, `js/engine/talents-v2/shaman.defs.js` (tooltips), `shaman.hooks.js` (runtime), test `tools/spires/test-talents-shaman.mjs`. Ids and icons are unchanged. Backup of the old file: `backups/shaman-talents.json.bak-20261023-162522-v2`.

New hook keys (all `sha_`): `sha_card_crit` (per-card crit %), `sha_crit` (spell crit %), `sha_wcrit` (every Attack crit %), `sha_fury` (crits x2.25), `sha_focus` (first spell crit each turn refunds 1 Energy), `sha_mastery` (first spell of the fight crits), `sha_shock_ramp`, `sha_fire_totem`, `sha_earth_block`, `sha_imbue_dmg`, `sha_windfury`, `sha_stormstrike`, `sha_heal`, `sha_tidal`, `sha_grace`, `sha_surge`, `sha_purify`, `sha_totem_block`, `sha_totem_place`, `sha_water_heal`, `sha_ankh`. Reused generics: card_dmg, card_inflict, card_apply, card_block, deflect, h_armor, turn_block, hurt_heal, hurt_boost, attack_heal, attack_draw, heavy_hit. No flat-stat or TALENT_LIMITS keys remain. Energy: only Elemental Focus (+1, once per turn, on a crit). Draw: only Flurry (1 card, once per turn). Per-fight state lives on `C.talshaman`; Reincarnation also sets `run.shaAnkh` (once per run).

## Old to new (max rank in brackets; per-rank numbers are in the in-game tooltip)
| Tree | Talent | Old | New |
|---|---|---|---|
| Elemental | Convection [5] | gold +4% | Shocks +1% crit and +1/2/2/2/3 damage |
| Elemental | Concussion [5] | spell power | Lightning Bolt and Chain Lightning +1% crit and +1/2/2/2/3 damage |
| Elemental | Earth's Grasp [2] | Block | +1 Block per turn while an Earth totem stands |
| Elemental | Call of Flame [3 to 2] | Thorns | Fire totems +1 damage per hit |
| Elemental | Elemental Focus [1] | free first card | First spell crit each turn refunds 1 Energy |
| Elemental | Call of Thunder [5] | spell power | Spells +1% crit per rank |
| Elemental | Reverberation [5 to 2] | Dex | Each Shock raises later Shocks this turn by +1 |
| Elemental | Eye of the Storm [3] | Holy Shield | First enemy attack each turn -1%/rank |
| Elemental | Elemental Fury [1] | spell power | Crits deal 2.25x instead of 2x |
| Elemental | Lightning Mastery [3 to 1] | extra draw | Lightning Bolt applies 1 Vulnerable |
| Elemental | Storm, Earth and Fire [2] | Thorns | Flame Shock +1 Burn per rank |
| Elemental | Elemental Mastery [1] | +1 Energy | The first spell of every fight is a guaranteed crit |
| Enhancement | Ancestral Knowledge [5 to 3] | max HP | Heal 1 per Attack per rank |
| Enhancement | Shield Specialization [5] | Block | Earth/Frost Shock, Lightning Shield, Rockbiter +1 Block per rank |
| Enhancement | Thundering Strikes [5 to 3] | Strength | While a weapon imbue is up, Attacks +1 damage per rank |
| Enhancement | Improved Ghost Wolf [2] | gold | Ghost Wolf +1 Block per rank |
| Enhancement | Improved Lightning Shield [3] | Thorns | Lightning Shield +1 Thorns per rank |
| Enhancement | Two-Handed Axes and Maces [1] | Strength | Hits of 8+ base damage deal +1 |
| Enhancement | Flurry [3] | extra draw | Draw 1 after 7/6/5 Attacks in a turn |
| Enhancement | Toughness [5 to 3] | Armor | Rank 1 starts with 1 Armor; +2% deflect per rank |
| Enhancement | Weapon Mastery [3] | Strength | Every Attack +1% crit per rank |
| Enhancement | Stormstrike [1] | +1 Energy | First Attack of each fight strikes twice and applies 1 Vulnerable |
| Enhancement | Shamanistic Rage [2] | Regeneration | After losing HP, next Attack +1 per rank |
| Enhancement | Windfury Weapon [1] | legacy Windfury | First Attack each turn strikes again for 20% |
| Restoration | Improved Healing Wave [5 to 3] | heal x8 (campfire) | Healing spells heal +1 extra HP per rank |
| Restoration | Tidal Focus [5 to 3] | gold | Healing Wave, Lesser Healing Wave, Chain Heal +1 Block per rank |
| Restoration | Ancestral Healing [3 to 2] | Armor | +1 Block at turn start per rank |
| Restoration | Totemic Focus [5 to 3] | Resist | +1 Block per totem standing at turn start, per rank |
| Restoration | Healing Focus [3] | Regeneration | First HP loss each turn heals 1 per rank |
| Restoration | Totemic Mastery [1] | extra draw | Placing a totem grants 2 Block |
| Restoration | Healing Grace [3 to 2] | heal x12 (campfire) | After a healing spell, the next enemy attack deals 1 less per rank |
| Restoration | Restorative Totems [5 to 3] | Regeneration | Heal 1 per turn per rank while a Water totem stands |
| Restoration | Tidal Mastery [3] | Holy Shield | Healing spells 4% per rank to heal a second time |
| Restoration | Mana Tide Totem [1] | +1 Energy | After a healing spell, next Attack this turn +2 |
| Restoration | Purification [3 to 2] | heal x10 (campfire) | Healing spells cleanse Poison (r1), then Disease (r2) |
| Restoration | Reincarnation [1] | legacy revive 30% each fight | Once per RUN, a killing blow leaves you at 10% HP |

All `heal` talents (campfire multipliers) are gone. Ranks that were cut (`[5 to 2]`) are refunded by `repairSpent`.

## Sim (`node tools/spires/sim.mjs --class shaman --runs 30 --seed S --talents T:P`, wins out of 30, mean of seeds 11/23/37)
| Build | Before | After (live tree) | Target |
|---|---|---|---|
| none | 7.0 (11/3/7) | 7.0 (11/3/7) | unchanged |
| Elemental 25 | 20.0 | 9.3 | 9-12 |
| Enhancement 25 | 21.0 | 9.7 | 9-12 |
| Restoration 25 | 8.0 | 10.0 | 9-12 |
| Elemental 51 | 25.3 | 17.3 | 14-18 |
| Enhancement 51 | 27.0 | 18.3 | 14-18 |
| Restoration 51 | 22.0 | 17.7 | 14-18 |

The sim fills tree T first, then the others in array order, and ignores tier gates; a tree now holds about 25 to 30 points, so "T:25" is mostly that tree and "T:51" is it plus most of one more. Noise is about +-1.5 wins on a 3-seed mean. Measurements in a frozen copy with the other classes' hooks stubbed gave 9.3 / 12.3 / 11.6 at 25 and 19 / 16 / 20 at 51; live numbers above include whatever the other classes' hooks do to generic keys.
