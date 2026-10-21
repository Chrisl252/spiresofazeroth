r"""build-talents.py - authoring table -> spiresofazeroth/data/talents/<class>.json + data/unlocks.json

Talents are account progression (meta.talents[class]): points come from runs (acts cleared, +5 on a victory, cap 51 like a level-60
character) and are spent on three classic 1.12 trees per class (the class archetypes). Each tree has tiers; a tier opens after 5
points in that tree, like the client. Every talent maps to ONE run modifier (js/engine/talents.js EFFECTS) so the sim, the engine and
the tooltip agree. Unlocks (data/unlocks.json): per class three tiers of three cards that join the reward/shop pool at class level
1/2/3 (XP from floors, acts, victories), the Slay the Spire unlock rhythm.

    python tools/spires/build-talents.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "..", "spiresofazeroth"))
OUT = os.path.join(GAME, "data", "talents")

# (name, icon, max rank, effect key, value per rank)
T = {
 "warrior": [
  ("arms", "Arms", "ability_rogue_eviscerate", [
   ("Improved Heroic Strike", "ability_rogue_ambush", 3, "str", 1), ("Deflection", "ability_parry", 5, "dex", 1),
   ("Improved Rend", "ability_gouge", 3, "thorns", 1), ("Improved Charge", "ability_warrior_charge", 2, "res", 10),
   ("Tactical Mastery", "spell_nature_enchantarmor", 5, "res", 4), ("Iron Will", "spell_magic_magearmor", 5, "hp", 3),
   ("Anger Management", "spell_holy_blessingofstamina", 1, "res", 20), ("Deep Wounds", "ability_backstab", 3, "str", 1),
   ("Two-Handed Weapon Specialization", "inv_axe_09", 5, "str", 1), ("Impale", "ability_searingarrow", 2, "energy1", 1),
   ("Sweeping Strikes", "ability_rogue_slicedice", 1, "draw1", 1), ("Mortal Strike", "ability_warrior_savageblow", 1, "str", 3)]),
  ("fury", "Fury", "ability_warrior_innerrage", [
   ("Booming Voice", "spell_nature_purge", 5, "res", 4), ("Cruelty", "ability_rogue_eviscerate", 5, "str", 1),
   ("Improved Demoralizing Shout", "ability_warrior_warcry", 5, "dex", 1), ("Unbridled Wrath", "spell_nature_stoneclawtotem", 5, "res", 5),
   ("Improved Cleave", "ability_warrior_cleave", 3, "thorns", 1), ("Piercing Howl", "spell_shadow_deathscream", 1, "draw1", 1),
   ("Blood Craze", "spell_shadow_summonimp", 3, "regen", 2), ("Improved Battle Shout", "ability_warrior_battleshout", 5, "str", 1),
   ("Enrage", "spell_shadow_unholyfrenzy", 5, "goldpct", 4), ("Death Wish", "spell_shadow_deathpact", 1, "energy1", 1),
   ("Flurry", "ability_ghoulfrenzy", 5, "hp", 2), ("Bloodthirst", "spell_nature_bloodlust", 1, "regen", 5)]),
  ("protection", "Protection", "ability_warrior_defensivestance", [
   ("Shield Specialization", "inv_shield_06", 5, "block", 2), ("Anticipation", "spell_nature_mirrorimage", 5, "dex", 1),
   ("Improved Bloodrage", "ability_racial_bloodrage", 2, "res", 10), ("Toughness", "spell_holy_devotion", 5, "hp", 4),
   ("Last Stand", "spell_holy_ashestoashes", 1, "hp", 10), ("Improved Shield Block", "ability_defend", 1, "block", 5),
   ("Improved Revenge", "ability_warrior_revenge", 3, "thorns", 2), ("Defiance", "ability_warrior_innerrage", 5, "metal", 1),
   ("Improved Sunder Armor", "ability_warrior_sunder", 3, "str", 1), ("Improved Shield Wall", "ability_warrior_shieldwall", 2, "heal", 10),
   ("Concussion Blow", "ability_thunderbolt", 1, "energy1", 1), ("Shield Slam", "inv_shield_05", 1, "block", 8)])],
 "paladin": [
  ("holy", "Holy", "spell_holy_holybolt", [
   ("Divine Strength", "ability_golemthunderclap", 5, "str", 1), ("Divine Intellect", "spell_nature_sleep", 5, "hp", 3),
   ("Spiritual Focus", "spell_arcane_blink", 5, "heal", 6), ("Improved Seal of Righteousness", "ability_thunderbolt", 5, "str", 1),
   ("Healing Light", "spell_holy_holybolt", 3, "heal", 10), ("Consecration", "spell_holy_innerfire", 1, "thorns", 3),
   ("Improved Lay on Hands", "spell_holy_layonhands", 2, "hp", 6), ("Unyielding Faith", "spell_holy_unyieldingfaith", 2, "dex", 1),
   ("Illumination", "spell_holy_greaterheal", 5, "regen", 1), ("Improved Blessing of Wisdom", "spell_holy_sealofwisdom", 5, "goldpct", 4),
   ("Divine Favor", "spell_holy_heal", 1, "energy1", 1), ("Holy Shock", "spell_holy_searinglight", 1, "draw1", 1)]),
  ("protection", "Protection", "spell_holy_devotionaura", [
   ("Improved Devotion Aura", "spell_holy_devotionaura", 5, "dex", 1), ("Redoubt", "ability_defend", 5, "block", 2),
   ("Precision", "ability_rogue_ambush", 3, "str", 1), ("Guardian's Favor", "spell_holy_sealofprotection", 2, "hp", 5),
   ("Toughness", "spell_holy_devotion", 5, "hp", 3), ("Blessing of Kings", "spell_magic_greaterblessingofkings", 1, "energy1", 1),
   ("Improved Righteous Fury", "spell_holy_sealoffury", 3, "thorns", 1), ("Shield Specialization", "inv_shield_06", 3, "block", 2),
   ("Anticipation", "spell_nature_mirrorimage", 5, "dex", 1), ("Improved Hammer of Justice", "spell_holy_sealofmight", 3, "draw1", 1),
   ("Reckoning", "spell_holy_blessingofstrength", 5, "metal", 1), ("Holy Shield", "spell_holy_blessingofprotection", 1, "block", 6)]),
  ("retribution", "Retribution", "spell_holy_auraoflight", [
   ("Improved Blessing of Might", "spell_holy_fistofjustice", 5, "str", 1), ("Benediction", "spell_frost_windwalkon", 5, "goldpct", 3),
   ("Improved Judgement", "spell_holy_righteousfury", 2, "energy1", 1), ("Improved Seal of the Crusader", "spell_holy_holysmite", 3, "str", 1),
   ("Deflection", "ability_parry", 5, "dex", 1), ("Vindication", "spell_holy_vindication", 3, "thorns", 1),
   ("Conviction", "spell_holy_retributionaura", 5, "str", 1), ("Seal of Command", "ability_warrior_innerrage", 1, "draw1", 1),
   ("Pursuit of Justice", "spell_holy_persuitofjustice", 2, "gold", 15), ("Eye for an Eye", "spell_holy_eyeforaneye", 2, "thorns", 2),
   ("Two-Handed Weapon Specialization", "inv_hammer_04", 3, "str", 1), ("Repentance", "spell_holy_prayerofhealing", 1, "res", 1)])],
 "hunter": [
  ("beast-mastery", "Beast Mastery", "ability_hunter_beasttaming", [
   ("Improved Aspect of the Hawk", "spell_nature_ravenform", 5, "str", 1), ("Endurance Training", "spell_nature_reincarnation", 5, "hp", 3),
   ("Improved Eyes of the Beast", "ability_eyeoftheowl", 2, "draw1", 1), ("Improved Aspect of the Monkey", "ability_hunter_aspectofthemonkey", 5, "dex", 1),
   ("Thick Hide", "inv_misc_pelt_bear_03", 3, "block", 2), ("Improved Revive Pet", "ability_hunter_beastsoothe", 2, "heal", 10),
   ("Pathfinding", "ability_mount_jungletiger", 2, "goldpct", 5), ("Bestial Swiftness", "ability_druid_dash", 1, "energy1", 1),
   ("Unleashed Fury", "ability_bullrush", 5, "str", 1), ("Ferocity", "inv_misc_monsterclaw_04", 5, "thorns", 1),
   ("Spirit Bond", "ability_druid_demoralizingroar", 2, "regen", 2), ("Bestial Wrath", "ability_druid_ferociousbite", 1, "str", 3)]),
  ("marksmanship", "Marksmanship", "ability_marksmanship", [
   ("Improved Concussive Shot", "spell_frost_stun", 5, "dex", 1), ("Efficiency", "spell_frost_wizardmark", 5, "goldpct", 3),
   ("Improved Hunter's Mark", "ability_hunter_snipershot", 5, "str", 1), ("Lethal Shots", "ability_searingarrow", 5, "str", 1),
   ("Aimed Shot", "inv_spear_07", 1, "draw1", 1), ("Improved Arcane Shot", "ability_impalingbolt", 5, "res", 1),
   ("Hawk Eye", "ability_townwatch", 3, "hp", 3), ("Improved Serpent Sting", "ability_hunter_quickshot", 5, "thorns", 1),
   ("Mortal Shots", "ability_piercedamage", 5, "str", 1), ("Scatter Shot", "ability_golemstormbolt", 1, "energy1", 1),
   ("Barrage", "ability_upgrademoonglaive", 3, "gold", 10), ("Trueshot Aura", "ability_trueshot", 1, "str", 2)]),
  ("survival", "Survival", "ability_hunter_swiftstrike", [
   ("Monster Slaying", "inv_misc_head_dragon_black", 3, "str", 1), ("Humanoid Slaying", "spell_holy_prayerofhealing", 3, "str", 1),
   ("Deflection", "ability_parry", 5, "dex", 1), ("Entrapment", "spell_nature_stranglevines", 5, "thorns", 1),
   ("Savage Strikes", "ability_racial_bloodrage", 2, "energy1", 1), ("Improved Wing Clip", "ability_rogue_trip", 5, "block", 1),
   ("Clever Traps", "spell_nature_timestop", 2, "draw1", 1), ("Survivalist", "spell_shadow_twilight", 5, "hp", 4),
   ("Deterrence", "ability_whirlwind", 1, "block", 6), ("Trap Mastery", "ability_ensnare", 2, "regen", 2),
   ("Killer Instinct", "spell_holy_blessingofstamina", 3, "str", 1), ("Wyvern Sting", "inv_spear_02", 1, "heal", 15)])],
 "rogue": [
  ("assassination", "Assassination", "ability_rogue_eviscerate", [
   ("Improved Eviscerate", "ability_rogue_eviscerate", 3, "str", 1), ("Remorseless Attacks", "ability_fiegndead", 2, "energy1", 1),
   ("Malice", "ability_racial_bloodrage", 5, "str", 1), ("Ruthlessness", "ability_druid_disembowel", 3, "res", 1),
   ("Murder", "spell_shadow_deathscream", 2, "goldpct", 5), ("Improved Slice and Dice", "ability_rogue_slicedice", 3, "dex", 1),
   ("Relentless Strikes", "ability_warrior_decisivestrike", 1, "res", 2), ("Improved Expose Armor", "ability_warrior_riposte", 2, "thorns", 1),
   ("Lethality", "ability_criticalstrike", 5, "str", 1), ("Vile Poisons", "ability_rogue_feigndeath", 5, "thorns", 1),
   ("Improved Kidney Shot", "ability_rogue_kidneyshot", 3, "draw1", 1), ("Cold Blood", "spell_ice_lament", 1, "str", 3)]),
  ("combat", "Combat", "ability_backstab", [
   ("Improved Gouge", "ability_gouge", 3, "dex", 1), ("Improved Sinister Strike", "spell_shadow_ritualofsacrifice", 2, "res", 1),
   ("Lightning Reflexes", "spell_nature_invisibilty", 5, "dex", 1), ("Improved Backstab", "ability_backstab", 3, "str", 1),
   ("Deflection", "ability_parry", 5, "block", 2), ("Precision", "ability_marksmanship", 5, "str", 1),
   ("Endurance", "spell_shadow_shadowward", 2, "hp", 6), ("Riposte", "ability_warrior_challange", 1, "thorns", 3),
   ("Improved Sprint", "ability_rogue_sprint", 2, "energy1", 1), ("Dagger Specialization", "inv_weapon_shortblade_05", 5, "str", 1),
   ("Blade Flurry", "ability_warrior_punishingblow", 1, "draw1", 1), ("Adrenaline Rush", "spell_shadow_shadowworddominate", 1, "energy1", 1)]),
  ("subtlety", "Subtlety", "ability_stealth", [
   ("Master of Deception", "spell_shadow_charm", 5, "dex", 1), ("Opportunity", "ability_warrior_warcry", 5, "str", 1),
   ("Sleight of Hand", "ability_rogue_feint", 2, "gold", 15), ("Elusiveness", "spell_magic_lesserinvisibilty", 2, "block", 3),
   ("Camouflage", "ability_stealth", 5, "regen", 1), ("Initiative", "spell_shadow_fumble", 3, "res", 1),
   ("Ghostly Strike", "spell_shadow_curse", 1, "block", 5), ("Improved Ambush", "ability_rogue_ambush", 3, "str", 1),
   ("Setup", "spell_nature_mirrorimage", 3, "res", 1), ("Serrated Blades", "inv_sword_17", 3, "thorns", 1),
   ("Heightened Senses", "ability_ambush", 2, "draw1", 1), ("Preparation", "spell_shadow_antishadow", 1, "energy1", 1)])],
 "priest": [
  ("discipline", "Discipline", "spell_holy_wordfortitude", [
   ("Unbreakable Will", "spell_magic_magearmor", 5, "hp", 3), ("Wand Specialization", "inv_wand_01", 5, "str", 1),
   ("Silent Resolve", "spell_nature_manaregentotem", 5, "regen", 1), ("Improved Power Word: Fortitude", "spell_holy_wordfortitude", 2, "hp", 6),
   ("Improved Power Word: Shield", "spell_holy_powerwordshield", 3, "block", 2), ("Martyrdom", "spell_nature_tranquility", 2, "thorns", 1),
   ("Inner Focus", "spell_frost_windwalkon", 1, "energy1", 1), ("Meditation", "spell_nature_sleep", 3, "heal", 8),
   ("Mental Agility", "ability_hibernation", 5, "goldpct", 3), ("Mental Strength", "spell_nature_enchantarmor", 5, "dex", 1),
   ("Divine Spirit", "spell_holy_divinespirit", 1, "draw1", 1), ("Power Infusion", "spell_holy_powerinfusion", 1, "energy1", 1)]),
  ("holy", "Holy", "spell_holy_guardianspirit", [
   ("Healing Focus", "spell_holy_healingfocus", 2, "heal", 10), ("Improved Renew", "spell_holy_renew", 3, "regen", 1),
   ("Holy Specialization", "spell_holy_sealofsalvation", 5, "str", 1), ("Spell Warding", "spell_holy_spellwarding", 5, "block", 1),
   ("Divine Fury", "spell_holy_sealofwrath", 5, "str", 1), ("Holy Nova", "spell_holy_holynova", 1, "thorns", 2),
   ("Blessed Recovery", "spell_holy_blessedrecovery", 3, "regen", 1), ("Inspiration", "spell_holy_layonhands", 3, "dex", 1),
   ("Holy Reach", "spell_holy_purify", 2, "draw1", 1), ("Improved Healing", "spell_holy_heal02", 3, "heal", 10),
   ("Spiritual Guidance", "spell_holy_spiritualguidence", 5, "hp", 3), ("Lightwell", "spell_holy_summonlightwell", 1, "hp", 10)]),
  ("shadow", "Shadow", "spell_shadow_shadowwordpain", [
   ("Spirit Tap", "spell_shadow_requiem", 5, "goldpct", 4), ("Blackout", "spell_shadow_gathershadows", 5, "dex", 1),
   ("Shadow Affinity", "spell_shadow_shadowward", 3, "hp", 3), ("Improved Shadow Word: Pain", "spell_shadow_shadowwordpain", 2, "thorns", 2),
   ("Shadow Focus", "spell_shadow_burningspirit", 5, "str", 1), ("Improved Psychic Scream", "spell_shadow_psychicscream", 2, "block", 3),
   ("Improved Mind Blast", "spell_shadow_unholyfrenzy", 5, "str", 1), ("Mind Flay", "spell_shadow_siphonmana", 1, "draw1", 1),
   ("Silence", "spell_shadow_impphaseshift", 1, "energy1", 1), ("Vampiric Embrace", "spell_shadow_unsummonbuilding", 1, "regen", 3),
   ("Darkness", "spell_shadow_twilight", 5, "str", 1), ("Shadowform", "spell_shadow_shadowform", 1, "block", 6)])],
 "shaman": [
  ("elemental", "Elemental", "spell_nature_lightning", [
   ("Convection", "spell_nature_wispsplode", 5, "goldpct", 3), ("Concussion", "spell_fire_fireball", 5, "str", 1),
   ("Earth's Grasp", "spell_nature_stoneclawtotem", 2, "block", 3), ("Elemental Warding", "spell_nature_spiritarmor", 3, "hp", 4),
   ("Call of Flame", "spell_fire_immolation", 3, "thorns", 1), ("Elemental Focus", "spell_shadow_manaburn", 1, "energy1", 1),
   ("Reverberation", "spell_frost_frostward", 5, "dex", 1), ("Call of Thunder", "spell_nature_callstorm", 5, "str", 1),
   ("Improved Fire Totems", "spell_fire_sealoffire", 2, "thorns", 1), ("Eye of the Storm", "spell_nature_eyeofthestorm", 3, "regen", 1),
   ("Elemental Fury", "spell_fire_volcano", 1, "str", 3), ("Elemental Mastery", "spell_nature_wispheal", 1, "draw1", 1)]),
  ("enhancement", "Enhancement", "spell_nature_lightningshield", [
   ("Ancestral Knowledge", "spell_shadow_grimward", 5, "hp", 3), ("Shield Specialization", "inv_shield_06", 5, "block", 2),
   ("Guardian Totems", "spell_nature_stoneskintotem", 2, "dex", 1), ("Thundering Strikes", "ability_thunderbolt", 5, "str", 1),
   ("Improved Ghost Wolf", "spell_nature_spiritwolf", 2, "gold", 15), ("Improved Lightning Shield", "spell_nature_lightningshield", 3, "thorns", 1),
   ("Enhancing Totems", "spell_nature_earthbindtotem", 2, "dex", 1), ("Two-Handed Axes and Maces", "inv_axe_10", 1, "str", 2),
   ("Anticipation", "spell_nature_mirrorimage", 5, "dex", 1), ("Flurry", "ability_ghoulfrenzy", 5, "str", 1),
   ("Toughness", "spell_holy_devotion", 5, "hp", 3), ("Stormstrike", "spell_holy_sealofmight", 1, "energy1", 1)]),
  ("restoration", "Restoration", "spell_nature_magicimmunity", [
   ("Improved Healing Wave", "spell_nature_magicimmunity", 5, "heal", 6), ("Tidal Focus", "spell_frost_manarecharge", 5, "goldpct", 3),
   ("Improved Reincarnation", "spell_nature_reincarnation", 2, "hp", 6), ("Ancestral Healing", "spell_nature_undyingstrength", 3, "block", 2),
   ("Totemic Focus", "spell_nature_moonglow", 5, "dex", 1), ("Nature's Guidance", "spell_frost_stun", 3, "str", 1),
   ("Healing Focus", "spell_nature_healingwavelesser", 5, "regen", 1), ("Totemic Mastery", "spell_nature_nullward", 1, "draw1", 1),
   ("Healing Grace", "spell_nature_healingtouch", 3, "heal", 8), ("Restorative Totems", "spell_nature_manaregentotem", 5, "regen", 1),
   ("Tidal Mastery", "spell_nature_tranquility", 5, "hp", 3), ("Mana Tide Totem", "spell_frost_summonwaterelemental", 1, "energy1", 1)])],
 "mage": [
  ("arcane", "Arcane", "spell_holy_magicalsentry", [
   ("Arcane Subtlety", "spell_holy_dispelmagic", 2, "dex", 1), ("Arcane Focus", "spell_holy_devotion", 5, "str", 1),
   ("Improved Arcane Missiles", "spell_nature_starfall", 5, "res", 1), ("Wand Specialization", "inv_wand_01", 2, "str", 1),
   ("Magic Absorption", "spell_nature_astralrecovery", 5, "block", 1), ("Arcane Concentration", "spell_shadow_manaburn", 5, "goldpct", 3),
   ("Magic Attunement", "spell_nature_abolishmagic", 2, "hp", 5), ("Improved Arcane Explosion", "spell_nature_wispsplode", 3, "thorns", 1),
   ("Arcane Resilience", "spell_arcane_arcaneresilience", 1, "hp", 10), ("Improved Mana Shield", "spell_shadow_detectlesserinvisibility", 2, "block", 3),
   ("Presence of Mind", "spell_nature_enchantarmor", 1, "energy1", 1), ("Arcane Power", "spell_nature_lightning", 1, "draw1", 1)]),
  ("fire", "Fire", "spell_fire_firebolt02", [
   ("Improved Fireball", "spell_fire_flamebolt", 5, "str", 1), ("Impact", "spell_fire_meteorstorm", 5, "dex", 1),
   ("Ignite", "spell_fire_incinerate", 5, "thorns", 1), ("Flame Throwing", "spell_fire_flare", 2, "draw1", 1),
   ("Improved Fire Blast", "spell_fire_fireball", 3, "res", 1), ("Incinerate", "spell_fire_flameshock", 2, "str", 1),
   ("Improved Flamestrike", "spell_fire_selfdestruct", 3, "thorns", 1), ("Pyroblast", "spell_fire_fireball02", 1, "str", 3),
   ("Burning Soul", "spell_fire_fire", 2, "hp", 5), ("Improved Scorch", "spell_fire_soulburn", 3, "regen", 1),
   ("Master of Elements", "spell_fire_masterofelements", 3, "goldpct", 4), ("Combustion", "spell_fire_sealoffire", 1, "energy1", 1)]),
  ("frost", "Frost", "spell_frost_frostbolt02", [
   ("Frost Warding", "spell_frost_frostward", 2, "block", 3), ("Improved Frostbolt", "spell_frost_frostbolt02", 5, "str", 1),
   ("Elemental Precision", "spell_ice_magicdamage", 3, "str", 1), ("Ice Shards", "spell_frost_iceshard", 5, "dex", 1),
   ("Frostbite", "spell_frost_frostarmor", 3, "thorns", 1), ("Improved Frost Nova", "spell_frost_freezingbreath", 2, "block", 2),
   ("Permafrost", "spell_frost_wisp", 3, "regen", 1), ("Piercing Ice", "spell_frost_frostbolt", 3, "str", 1),
   ("Cold Snap", "spell_frost_wizardmark", 1, "energy1", 1), ("Improved Blizzard", "spell_frost_icestorm", 3, "hp", 3),
   ("Arctic Reach", "spell_shadow_darkritual", 2, "draw1", 1), ("Ice Block", "spell_frost_frost", 1, "block", 8)])],
 "warlock": [
  ("affliction", "Affliction", "spell_shadow_deathcoil", [
   ("Suppression", "spell_shadow_unsummonbuilding", 5, "dex", 1), ("Improved Corruption", "spell_shadow_abominationexplosion", 5, "thorns", 1),
   ("Improved Curse of Weakness", "spell_shadow_curseofmannoroth", 3, "block", 2), ("Improved Drain Soul", "spell_shadow_haunting", 2, "res", 1),
   ("Improved Life Tap", "spell_shadow_burningspirit", 2, "regen", 2), ("Improved Drain Life", "spell_shadow_lifedrain02", 5, "regen", 1),
   ("Improved Curse of Agony", "spell_shadow_curseofsargeras", 3, "str", 1), ("Fel Concentration", "spell_shadow_fingerofdeath", 5, "hp", 3),
   ("Amplify Curse", "spell_shadow_contagion", 1, "energy1", 1), ("Grim Reach", "spell_shadow_callofbone", 2, "draw1", 1),
   ("Nightfall", "spell_shadow_twilight", 2, "goldpct", 5), ("Siphon Life", "spell_shadow_requiem", 1, "regen", 4)]),
  ("demonology", "Demonology", "spell_shadow_metamorphosis", [
   ("Improved Healthstone", "inv_stone_04", 2, "heal", 10), ("Improved Imp", "spell_shadow_summonimp", 3, "str", 1),
   ("Demonic Embrace", "spell_shadow_metamorphosis", 5, "hp", 4), ("Improved Health Funnel", "spell_shadow_lifedrain", 2, "regen", 1),
   ("Improved Voidwalker", "spell_shadow_summonvoidwalker", 3, "block", 2), ("Fel Intellect", "spell_holy_magicalsentry", 5, "res", 1),
   ("Improved Succubus", "spell_shadow_summonsuccubus", 3, "dex", 1), ("Fel Domination", "spell_nature_removecurse", 1, "energy1", 1),
   ("Fel Stamina", "spell_shadow_antishadow", 5, "hp", 3), ("Master Summoner", "spell_shadow_impphaseshift", 2, "draw1", 1),
   ("Unholy Power", "spell_shadow_shadowworddominate", 5, "str", 1), ("Soul Link", "spell_shadow_gathershadows", 1, "block", 6)]),
  ("destruction", "Destruction", "spell_shadow_rainoffire", [
   ("Improved Shadow Bolt", "spell_shadow_shadowbolt", 5, "str", 1), ("Cataclysm", "spell_fire_windsofwoe", 5, "goldpct", 3),
   ("Bane", "spell_shadow_deathpact", 5, "dex", 1), ("Aftermath", "spell_fire_fire", 5, "thorns", 1),
   ("Improved Firebolt", "spell_fire_firebolt", 2, "res", 1), ("Improved Lash of Pain", "spell_shadow_curse", 2, "str", 1),
   ("Devastation", "spell_fire_flameshock", 5, "str", 1), ("Shadowburn", "spell_shadow_scourgebuild", 1, "energy1", 1),
   ("Intensity", "spell_fire_lavaspawn", 2, "hp", 5), ("Destructive Reach", "spell_shadow_corpseexplode", 2, "draw1", 1),
   ("Improved Searing Pain", "spell_fire_soulburn", 5, "regen", 1), ("Conflagrate", "spell_fire_fireball", 1, "str", 3)])],
 "druid": [
  ("balance", "Balance", "spell_nature_starfall", [
   ("Improved Wrath", "spell_nature_abolishmagic", 5, "str", 1), ("Nature's Grasp", "spell_nature_natureswrath", 1, "thorns", 2),
   ("Improved Nature's Grasp", "spell_nature_natureswrath", 4, "thorns", 1), ("Improved Entangling Roots", "spell_nature_stranglevines", 3, "block", 2),
   ("Improved Moonfire", "spell_nature_starfall", 5, "str", 1), ("Natural Weapons", "inv_staff_01", 5, "str", 1),
   ("Natural Shapeshifter", "spell_nature_wispsplode", 3, "energy1", 1), ("Improved Thorns", "spell_nature_thorns", 3, "thorns", 1),
   ("Omen of Clarity", "spell_nature_crystalball", 1, "draw1", 1), ("Nature's Reach", "spell_nature_naturetouchgrow", 2, "goldpct", 5),
   ("Vengeance", "spell_nature_purge", 5, "dex", 1), ("Moonkin Form", "spell_nature_forceofnature", 1, "hp", 10)]),
  ("feral", "Feral Combat", "ability_racial_bearform", [
   ("Ferocity", "ability_hunter_pet_hyena", 5, "str", 1), ("Feral Aggression", "ability_druid_demoralizingroar", 5, "res", 1),
   ("Feral Instinct", "ability_ambush", 5, "dex", 1), ("Brutal Impact", "ability_druid_bash", 2, "energy1", 1),
   ("Thick Hide", "inv_misc_pelt_bear_03", 5, "block", 1), ("Feline Swiftness", "spell_nature_spiritwolf", 2, "draw1", 1),
   ("Feral Charge", "ability_hunter_pet_bear", 1, "res", 2), ("Sharpened Claws", "inv_misc_monsterclaw_04", 3, "str", 1),
   ("Improved Shred", "spell_shadow_vampiricaura", 2, "res", 1), ("Predatory Strikes", "ability_hunter_pet_cat", 3, "str", 1),
   ("Blood Frenzy", "ability_ghoulfrenzy", 2, "regen", 2), ("Heart of the Wild", "spell_holy_blessingofagility", 5, "hp", 4)]),
  ("restoration", "Restoration", "spell_nature_healingtouch", [
   ("Improved Mark of the Wild", "spell_nature_regeneration", 5, "dex", 1), ("Furor", "spell_holy_blessingofstamina", 5, "res", 1),
   ("Improved Healing Touch", "spell_nature_healingtouch", 5, "heal", 6), ("Nature's Focus", "spell_nature_healingwavegreater", 5, "block", 1),
   ("Improved Enrage", "ability_druid_enrage", 2, "energy1", 1), ("Reflection", "spell_frost_windwalkon", 3, "goldpct", 4),
   ("Insect Swarm", "spell_nature_insectswarm", 1, "thorns", 3), ("Subtlety", "ability_eyeoftheowl", 5, "hp", 3),
   ("Tranquil Spirit", "spell_holy_elunesgrace", 5, "regen", 1), ("Improved Rejuvenation", "spell_nature_rejuvenation", 3, "regen", 1),
   ("Gift of Nature", "spell_nature_protectionformnature", 5, "heal", 6), ("Swiftmend", "inv_relics_idolofrejuvenation", 1, "draw1", 1)])],
}


def build_talents():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for cid, trees in T.items():
        out = {"classId": cid, "trees": []}
        for tid, tname, ticon, talents in trees:
            rows = []
            for i, (name, icon, mx, key, per) in enumerate(talents):
                tier, col = i // 2 + 1, i % 2
                rows.append({"id": f"{cid}:{tid}:{i}", "name": name, "icon": icon, "tier": tier, "col": col, "max": mx, "effect": {"key": key, "per": per}})
            out["trees"].append({"id": tid, "name": tname, "icon": ticon, "talents": rows})
            total += len(rows)
        with open(os.path.join(OUT, f"{cid}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return total


def build_unlocks():
    """Three tiers of three cards per class: rare cards first (never a starter), then uncommons, sorted by id so the result is stable."""
    cls_index = json.load(open(os.path.join(GAME, "data", "classes", "index.json"), encoding="utf-8-sig"))
    ids = [c if isinstance(c, str) else c["id"] for c in (cls_index.get("classes") if isinstance(cls_index, dict) else cls_index)]
    out = {"_doc": "Card unlock tiers per class (Slay the Spire rhythm): tier n joins the reward / shop pool at class level n. Levels come from XP (floors + 10 per act cleared + 40 per victory) at the thresholds below. Built by tools/spires/build-talents.py.",
           "thresholds": [30, 80, 160], "classes": {}}
    count = {}
    for cid in ids:
        for c in json.load(open(os.path.join(GAME, "data", "classes", f"{cid}.json"), encoding="utf-8-sig"))["cards"]: count[c["id"]] = count.get(c["id"], 0) + 1
    shared = {k for k, v in count.items() if v > 1}
    for cid in ids:
        d = json.load(open(os.path.join(GAME, "data", "classes", f"{cid}.json"), encoding="utf-8-sig"))
        starters = set(d.get("starterDeck", []))
        # an id shared by two classes (natures-swiftness: druid + shaman) is never a lock key, because the lock set is per id, not per class
        rare = sorted(c["id"] for c in d["cards"] if c.get("rarity") == "rare" and c["id"] not in starters and c["id"] not in shared)
        unc = sorted(c["id"] for c in d["cards"] if c.get("rarity") == "uncommon" and c["id"] not in starters and c["id"] not in shared)
        picks = (rare + unc)[:9]
        out["classes"][cid] = [picks[0:3], picks[3:6], picks[6:9]]
    with open(os.path.join(GAME, "data", "unlocks.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return out


if __name__ == "__main__":
    n = build_talents(); u = build_unlocks()
    print(f"talents: {n} across {len(T)} classes -> {OUT}")
    print("unlocks:", {k: sum(len(t) for t in v) for k, v in u["classes"].items()})
