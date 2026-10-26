# Paladin Talents V2

Not deployed, no build bump. Ids, names, icons, tiers, columns kept. One max rank lowered: Reckoning 5 to 3 (`repairSpent` refunds the extra). Runtime: `js/engine/talents-v2/paladin.hooks.js` (state on `C.talpaladin`), tooltips: `paladin.defs.js`, test: `tools/spires/test-talents-paladin.mjs`.

## New hooks (all `pal_`)
| Key | Effect |
|---|---|
| pal_heal_block | a card that heals you also gives N Block (Judgement counts when the Seal was Light) |
| pal_heal_amp | cards that heal you heal N more |
| pal_heal_dmg | a card that heals you also deals N holy damage to its target |
| pal_heal_boost | after a healing card, your next Attack deals +N |
| pal_bless_block | Blessings and Auras you play give N Block |
| pal_seal_dmg | Attacks deal +N while a Seal is active |
| pal_seal_cast_dmg | Seal cards deal +N damage |
| pal_seal_keep | Judgement keeps the Seal with N% chance |
| pal_sanctity | holy damage +N% |
| pal_retaliate | HP lost to an enemy attack hits the attacker for N holy |
| pal_ardent | at 35% HP or less, enemy attacks deal N% less |
| pal_stunned_dmg | Attacks +N vs Stunned or sleeping enemies |

## Old to new (value shown at max rank)
| Tree | Talent (max) | Old | New |
|---|---|---|---|
| Holy | Divine Intellect (5) | +20 HP | heal gives 10 Block |
| Holy | Spiritual Focus (5) | heal | Holy Light, Flash, Blessing of Light, Redemption +10 Block |
| Holy | Healing Light (3) | heal | healing cards heal 3 more |
| Holy | Imp. Blessing of Wisdom (5) | res | Blessings and Auras give 10 Block |
| Holy | Consecration (1) | thorns | learns Consecration, +4 dmg |
| Holy | Illumination (5) | regen | each heal deals 10 holy damage |
| Holy | Imp. Lay on Hands (2) | hp | learns Lay on Hands, cost -1 at rank 2 |
| Holy | Divine Favor (1) | free cast | learns Divine Favor |
| Holy | Holy Power (3) | spell power | after a heal, next Attack +3 |
| Holy | Holy Shock (1) | draw | learns Holy Shock |
| Holy | Sanctified Light (3) | heal | first HP loss each turn heals 3 |
| Holy | Light's Grace (1) | shield | Last Stand: 10 Block, heal 10% at 30% HP |
| Prot | Redoubt (5) | block | keep 25% of Block between turns |
| Prot | Imp. Devotion Aura (5) | armor | Devotion and Concentration Aura +10 Block |
| Prot | Toughness (5) | hp | first enemy attack each turn -25% |
| Prot | Guardian's Favor (2) | shield | Protection and Salvation +8 Block, Divine Protection no longer Exhausts |
| Prot | Blessing of Kings (1) | hp | learns Blessing of Kings |
| Prot | Shield Spec. (3) | block | fully absorbed attack hits back for 3 |
| Prot | Imp. Righteous Fury (3) | thorns | +3 Thorns while Block is up, Fury and Sanctuary +9 Block |
| Prot | Reckoning (3, was 5) | metal | after losing HP, next Attack +3 |
| Prot | Imp. Hammer of Justice (2) | energy | Hammer +6 dmg, no Exhaust at rank 2 |
| Prot | 1H Weapon Spec. (3) | str | Attacks +3 dmg at 8+ Block |
| Prot | Ardent Defender (2) | armor | at 35% HP, enemy attacks -20% |
| Prot | Holy Shield (1) | block | learns Holy Shield, 3 holy dmg back per hit taken |
| Ret | Imp. Blessing of Might (5) | str | Attacks +6 while a Seal is active |
| Ret | Benediction (5) | gold % | Seals deal +6 |
| Ret | Imp. Judgement (2) | energy | Judgement +6 dmg, 40% to keep the Seal |
| Ret | Imp. Seal of the Crusader (3) | str | Judgement applies +3 Vulnerable and +3 Weak |
| Ret | Conviction (5) | str | 30% crit |
| Ret | Eye for an Eye (2) | thorns | 8 holy dmg back per hit taken |
| Ret | Pursuit of Justice (2) | gold | +6 vs enemies at 50% HP, Hammer of Wrath +6 |
| Ret | Seal of Command (1) | draw | learns Seal of Command, 3 Attacks in a turn draw 1 |
| Ret | Two-Handed Spec. (3) | str | 8+ base hits +6 |
| Ret | Sanctity Aura (3) | spell power | holy damage +18% |
| Ret | Vengeance (3) | str | each Attack adds +3 to later Attacks this turn |
| Ret | Repentance (1) | energy | learns Repentance, first Attack stuns, +6 vs Stunned or sleeping |

Energy added by talents: 0. Card draw: +1 once per turn (Seal of Command). No legacy or capped keys.

## Sim (30 runs, wins, seeds 11 / 23 / 37)
| Config | Before (11/23/37, avg) | After (11/23/37, avg) |
|---|---|---|
| none | 5/1/2 (2.7) | 5/1/2 (2.7) |
| Holy 25 | 7/5/5 (5.7) | 11/7/11 (9.7) |
| Prot 25 | 11/9/8 (9.3) | 11/7/6 (8.0) |
| Ret 25 | 10/5/10 (8.3) | 11/7/7 (8.3) |
| Holy 51 | 18/15/16 (16.3) | 19/19/16 (18.0) |
| Prot 51 | 18/11/13 (14.0) | 19/20/15 (18.0) |
| Ret 51 | 15/17/15 (15.7) | 20/16/18 (18.0) |

Sim noise is about 3 wins per seed. The 51-point runs fill the tree in array order, so Holy 51 is the full Holy tree plus the first 16 Protection points.
