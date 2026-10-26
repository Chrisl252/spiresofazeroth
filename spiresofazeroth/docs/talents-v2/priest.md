# Priest Talents V2

Status: converted, not deployed, no BUILD bump. Ids, names, icons, tiers, columns and max ranks are unchanged. All 36 talents use V2 hooks (no `TALENT_LIMITS` keys, no flat-stat keys). Every rank changes a visible number (enforced by `tools/spires/test-talents-priest.mjs`).

Runtime: `js/engine/talents-v2/priest.hooks.js` (`fire/deal/taken`, state on `C.talpriest`). Text: `priest.defs.js` (`pri_*` keys). Generic hooks reused: `card_dmg`, `card_inflict`, `card_apply`, `card_cost`, `grant`, `block_carry`, `guard_dmg`, `block_thorns`, `hurt_heal`.

Budget: draw +1 only at Divine Spirit (turn 1 of a fight); Energy only via Inner Focus (first card each fight refunds up to 2) plus the Improved Healing refund (net cost cut, not a gain). No infinite loops (`test-infinite-combo` passes).

## Old to new (per rank, rank 1 to max)
### Discipline (shields)
| Talent (max) | Old | New |
|---|---|---|
| Unbreakable Will (5) | +4 max HP | Start fight with 5/10/15/20/25 Block (turn 1) |
| Wand Specialization (5) | +1 Spell Power | Smite, Starshards, Mind Flay +1..+5 damage |
| Improved Power Word: Shield (3) | +5 shield | Power Word: Shield gives +4/8/12 Block |
| Silent Resolve (5) | +1 regen | Keep 10..50% Block; Attacks +1/2/2/3/3 damage at 8+ Block |
| Inner Focus (1) | free cast | First card each fight refunds its cost (up to 2 Energy) |
| Meditation (3) | +12 heal | Every Skill gives 2/3/4 Block |
| Mental Agility (5) | +4% gold | Every Skill also deals 2..10 Holy damage |
| Mental Strength (5) | +3 shield | +1..+5 Thorns while Block is up |
| Divine Spirit (1) | draw | Draw 1 extra on turn 1 |
| Soul Warding (3) | +4 shield | Power Word: Shield heals 2/4/6 |
| Focused Will (2) | +1 Armor | A hit costing 8+ HP gives 6/12 Block |
| Power Infusion (1) | +4 Spell Power | First 3 turns: cards +2 damage, +2 Block at turn start |

### Holy (healing and Smite)
| Talent (max) | Old | New |
|---|---|---|
| Healing Focus (2) | +10 heal | Healing spells heal 2/4 more |
| Improved Renew (3) | +2 regen | Renew applies +2/4/6 Regen |
| Holy Specialization (5) | +1 Spell Power | Holy spells 3..15% chance to crit (double) |
| Spell Warding (5) | +2 Block | Healing spells give +1..+5 Block |
| Holy Nova (1) | +3 Thorns | Learns Holy Nova, +3 damage |
| Blessed Recovery (3) | +2 regen | First HP loss each turn heals 2/4/6 |
| Inspiration (3) | +1 Armor | After a healing spell, next Attack +2/4/6 |
| Holy Reach (2) | draw | Smite and Holy Fire heal 2/4 when played |
| Improved Healing (3) | +15 heal | First 1/2/3 healing spells each turn refund 1 Energy |
| Spiritual Guidance (5) | +1 Spell Power | Holy spells +1..+5 damage, doubled while you have Regen |
| Surge of Light (2) | +1 Energy | Holy crit gives 4/8 Block |
| Lightwell (1) | +16 max HP | Learns Lightwell; each turn Regen deals up to 3 damage to all enemies |

### Shadow (DoTs and Shadowform)
| Talent (max) | Old | New |
|---|---|---|
| Spirit Tap (5) | +5% gold | Turn start: heal 2..10 per enemy with Poison or Disease |
| Shadow Affinity (3) | +4 max HP | Each Shadow spell gives 2/4/6 Block |
| Improved Shadow Word: Pain (2) | +3 Thorns | Shadow Word: Pain +4/8 Poison |
| Shadow Focus (5) | +1 Spell Power | Turn start: poisoned/diseased enemies take +1..+5 |
| Improved Mind Blast (5) | +1 Spell Power | Mind Blast +3..+15 damage, costs 1 less at rank 5 |
| Mind Flay (1) | draw | Learns Mind Flay, +3 damage, +3 Poison |
| Darkness (5) | +1 Spell Power | Shadow spells +1..+5 damage, doubled vs Poisoned |
| Silence (1) | +1 Energy | First Shadow spell each fight: Silence 2 turns and 2 Weak |
| Shadow Weaving (3) | +2 Spell Power | Each Shadow spell: later ones this turn +1/2/3 (stacks) |
| Shadowform (1) | +1 Armor | Learns Shadowform; in form Shadow +3 damage, take 15% less |
| Misery (2) | draw | Shadow Word: Pain applies 2/4 Marked; Devouring Plague 1/2 |
| Vampiric Embrace (1) | vampiric | Start every fight with Vampiric Embrace |

## Sim (wins out of 30, mean of seeds 11, 23, 37; `--talents T:P`)
| Build | Before | After |
|---|---|---|
| none | 2.3 | 2.3 |
| Discipline 25 | 6.0 | 6 |
| Holy 25 | 5.7 | 9 |
| Shadow 25 | 6.3 | 8 |
| Discipline 51 | 9.3 | 19 |
| Holy 51 | 11.0 | 21 |
| Shadow 51 | 14.7 | 17 |

Note: the sim ignores tier gates and fills in array order, so `N:51` includes ~15 early Discipline points for Holy and Shadow. Run-to-run noise is about plus or minus 2 wins.
