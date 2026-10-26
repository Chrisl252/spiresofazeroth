# Druid Talents V2

Backup of the old file: `backups/druid-talents.json.bak-20261023-162153-v2`. Ids, max ranks, tiers and icons are unchanged. One rename: Natural Weapons is now Nature's Grace (icon spell_nature_naturesblessing).
Code: `data/talents/druid.json`, `js/engine/talents-v2/druid.defs.js` (text), `druid.hooks.js` (behavior, state on `C.taldruid`), test `tools/spires/test-talents-druid.mjs`.
No flat-stat or TALENT_LIMITS keys remain. Energy budget: +1 via Omen of Clarity (first 2+ cost card each turn). Draw budget: +1 via Feline Swiftness (Flurry style, once per turn). No campfire `heal` keys.

New hooks (all `dru_`): spellcrit, grace, critdmg, burn_dmg, dream, omen, moonkin | cat_bleed, bear_block, combo_dmg, leader, wild | start_regen, regen_block, regen_tick, heal, swift, swiftmend.
Spell = a nature or arcane Attack card.

## Balance (Moonfire, Starfire, Nature's Grace)
| Talent (max) | Old | New per rank |
|---|---|---|
| Improved Wrath (5) | +1 spell power | Wrath +1 damage |
| Nature's Grasp (1) | +3 Thorns | learns Nature's Grasp, it applies +2 Thorns |
| Improved Moonfire (5) | +1 spell power | Moonfire applies +1 Burn |
| Improved Thorns (3) | +2 Thorns | Thorns card +1 Thorns |
| Omen of Clarity (1) | free first card | first 2+ cost card each turn refunds 1 Energy |
| Nature's Grace (5) | +1 Strength | spells 2% crit (double damage); after a crit the next spell +1 |
| Nature's Reach (2) | +1 draw | Starfire +3 damage; rank 2 costs 1 less |
| Vengeance (5) | +1 spell power | spell crits deal +10% (250% at rank 5) |
| Moonfury (3) | +2 spell power | spells +2 damage vs Burning enemies |
| Dreamstate (3) | +15 resist | each spell grants 1/2/3 Block |
| Wrath of Cenarius (2) | +1 Energy | Starfire applies 3/5 Burn, Wrath 1/2 Burn |
| Moonkin Form (1) | +4 spell power | learns Moonkin Form (costs 1 less), spells +4 damage in Moonkin Form |

## Feral Combat (bear and cat)
| Talent (max) | Old | New per rank |
|---|---|---|
| Ferocity (5) | +2 resist | Claw, Maul, Rake, Shred +1 damage |
| Feral Aggression (5) | +1 Strength | Ferocious Bite +2, Swipe +1 damage |
| Feral Instinct (5) | stealth | Cat Form Attacks apply 1 Bleed |
| Brutal Impact (2) | +1 Energy | Bash and Pounce +3 damage, Pounce +2 Bleed |
| Thick Hide (5) | +1 Armor | start Armor 1/1/2/2/3; shifting to Bear grants 2 Block |
| Feline Swiftness (2) | +1 draw | draw 1 after 4/3 Attacks per turn; Cat Form +2 Block |
| Sharpened Claws (3) | feral +2 | Attacks 4% crit |
| Predatory Strikes (3) | +2 Strength | Attacks +1 damage per 2 Combo Points |
| Blood Frenzy (2) | +3 regen | +2 damage vs Bleeding, Rake +2 Bleed |
| Savage Fury (3) | feral +2 | Rip +3 Bleed, Shred and Ravage +2 damage |
| Leader of the Pack (2) | +1 draw | any form shift heals 3 and grants 3 Block |
| Heart of the Wild (1) | +16 HP | first Attack each turn: Bear 8 Block, Cat 2 Combo Points |

## Restoration (HoTs, Nature's Swiftness)
| Talent (max) | Old | New per rank |
|---|---|---|
| Improved Mark of the Wild (5) | +1 Armor | start each fight with +1 Regeneration |
| Furor (5) | +10 resist | first HP loss each turn heals 1 |
| Improved Healing Touch (5) | campfire heal +8% | Healing Touch +1 Block and heals 1 more |
| Nature's Focus (5) | +2 Block | +1 Block at turn start while Regeneration is up |
| Improved Enrage (2) | +1 Energy | Enrage +1 Strength; rank 2 costs no HP |
| Insect Swarm (1) | +4 Thorns | learns Insect Swarm, +4 Poison |
| Subtlety (5) | +4 max HP | keep +4% Block between turns |
| Improved Rejuvenation (3) | +2 regen | Rejuvenation and Regrowth apply +1 Regeneration |
| Gift of Nature (5) | campfire heal +8% | +1 extra heal at turn start while Regeneration is up |
| Nature's Swiftness (1) | free first card | learns Nature's Swiftness; once per fight at 40% HP heal 8 and gain 3 Regeneration |
| Empowered Touch (3) | campfire heal +10% | Healing Touch, Regrowth, Frenzied Regeneration heal 1 more; Frenzied +2 Block |
| Swiftmend & Tranquility (1) | +5 regen | learns both cards; Swiftmend leaves 4 Regeneration |

## Sim (wins out of 30, seeds 11 / 23 / 37; `--class druid --runs 30 --talents T:P`)
| Setup | Before | After | Target |
|---|---|---|---|
| none | 4 7 7 | 4 7 7 (unchanged) | unchanged |
| Balance 25 | 9 13 9 | 11 12 14 | 9-12 |
| Feral 25 | 10 13 13 | 8 11 11 | 9-12 |
| Restoration 25 | 8 10 11 | 11 13 15 | 9-12 |
| Balance 51 | 13 17 18 | 9 18 18 | 14-18 |
| Feral 51 | 23 23 28 | 16 17 15 | 14-18 |
| Restoration 51 | 10 16 19 | 14 18 20 | 14-18 |

Notes: sim noise is about plus or minus 3 per seed. Old Feral was far over target (25 wins at 51 points) from stacked draw/Strength; it is now in range. Restoration at 25 runs a little warm (13 avg). The sim fills in array order, so N:51 includes tier 1 to 5 of every earlier tree slot.
