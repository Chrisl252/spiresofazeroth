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
   ("Improved Rend", "ability_gouge", 3, "thorns", 2), ("Improved Charge", "ability_warrior_charge", 2, "res", 15),
   ("Tactical Mastery", "spell_nature_enchantarmor", 5, "res", 5), ("Deep Wounds", "ability_backstab", 3, "str", 1),
   ("Two-Handed Weapon Specialization", "inv_axe_09", 5, "str", 1), ("Anger Management", "spell_holy_blessingofstamina", 1, "rage_gen", 1),
   ("Impale", "ability_searingarrow", 2, "str", 2), ("Sweeping Strikes", "ability_rogue_slicedice", 1, "draw1", 1),
   ("Poleaxe Specialization", "inv_weapon_halberd_01", 3, "energy1", 1), ("Mortal Strike", "ability_warrior_savageblow", 1, "str", 4)]),
  ("fury", "Fury", "ability_warrior_innerrage", [
   ("Cruelty", "ability_rogue_eviscerate", 5, "str", 1), ("Booming Voice", "spell_nature_purge", 5, "res", 5),
   ("Unbridled Wrath", "spell_nature_stoneclawtotem", 3, "rage_gen", 1), ("Improved Battle Shout", "ability_warrior_battleshout", 5, "str", 1),
   ("Blood Craze", "spell_shadow_summonimp", 3, "regen", 2), ("Piercing Howl", "spell_shadow_deathscream", 1, "draw1", 1),
   ("Enrage", "spell_shadow_unholyfrenzy", 5, "str", 1), ("Flurry", "ability_ghoulfrenzy", 3, "draw1", 1),
   ("Death Wish", "spell_shadow_deathpact", 1, "energy1", 1), ("Berserker Stance", "ability_racial_avatar", 3, "goldpct", 5),
   ("Bloodthirst", "spell_nature_bloodlust", 1, "regen", 4), ("Rampage", "ability_warrior_rampage", 1, "str", 3)]),
  ("protection", "Protection", "ability_warrior_defensivestance", [
   ("Shield Specialization", "inv_shield_06", 5, "block", 3), ("Toughness", "spell_holy_devotion", 5, "armor", 1),
   ("Anticipation", "spell_nature_mirrorimage", 5, "dex", 1), ("Improved Bloodrage", "ability_racial_bloodrage", 2, "res", 15),
   ("Last Stand", "spell_holy_ashestoashes", 1, "hp", 12), ("Improved Shield Block", "ability_defend", 1, "retain_block", 1),
   ("Defiance", "ability_warrior_innerrage", 5, "metal", 1), ("Improved Revenge", "ability_warrior_revenge", 3, "thorns", 3),
   ("Concussion Blow", "ability_thunderbolt", 1, "energy1", 1), ("Improved Shield Wall", "ability_warrior_shieldwall", 2, "armor", 1),
   ("One-Handed Weapon Specialization", "inv_sword_20", 3, "str", 1), ("Shield Slam", "inv_shield_05", 1, "block", 12)])],
 "paladin": [
  ("holy", "Holy", "spell_holy_holybolt", [
   ("Divine Intellect", "spell_nature_sleep", 5, "hp", 4), ("Spiritual Focus", "spell_arcane_blink", 5, "heal", 8),
   ("Healing Light", "spell_holy_holybolt", 3, "heal", 12), ("Improved Blessing of Wisdom", "spell_holy_sealofwisdom", 5, "res", 10),
   ("Consecration", "spell_holy_innerfire", 1, "thorns", 4), ("Illumination", "spell_holy_greaterheal", 5, "regen", 1),
   ("Improved Lay on Hands", "spell_holy_layonhands", 2, "hp", 8), ("Divine Favor", "spell_holy_heal", 1, "free_cast", 1),
   ("Holy Power", "spell_holy_searinglight", 3, "spell_power", 2), ("Holy Shock", "spell_holy_searinglight", 1, "draw1", 1),
   ("Sanctified Light", "spell_holy_healingfocus", 3, "heal", 10), ("Light's Grace", "spell_holy_blessedrecovery", 1, "shield", 16)]),
  ("protection", "Protection", "spell_holy_devotionaura", [
   ("Redoubt", "ability_defend", 5, "block", 3), ("Improved Devotion Aura", "spell_holy_devotionaura", 5, "armor", 1),
   ("Toughness", "spell_holy_devotion", 5, "hp", 4), ("Guardian's Favor", "spell_holy_sealofprotection", 2, "shield", 6),
   ("Blessing of Kings", "spell_magic_greaterblessingofkings", 1, "hp", 10), ("Shield Specialization", "inv_shield_06", 3, "block", 3),
   ("Improved Righteous Fury", "spell_holy_sealoffury", 3, "thorns", 2), ("Reckoning", "spell_holy_blessingofstrength", 5, "metal", 1),
   ("Improved Hammer of Justice", "spell_holy_sealofmight", 2, "energy1", 1), ("One-Handed Weapon Specialization", "inv_sword_20", 3, "str", 1),
   ("Ardent Defender", "spell_holy_ardentdefender", 2, "armor", 1), ("Holy Shield", "spell_holy_blessingofprotection", 1, "block", 10)]),
  ("retribution", "Retribution", "spell_holy_auraoflight", [
   ("Improved Blessing of Might", "spell_holy_fistofjustice", 5, "str", 1), ("Benediction", "spell_frost_windwalkon", 5, "goldpct", 4),
   ("Improved Judgement", "spell_holy_righteousfury", 2, "energy1", 1), ("Improved Seal of the Crusader", "spell_holy_holysmite", 3, "str", 1),
   ("Conviction", "spell_holy_retributionaura", 5, "str", 1), ("Eye for an Eye", "spell_holy_eyeforaneye", 2, "thorns", 3),
   ("Pursuit of Justice", "spell_holy_persuitofjustice", 2, "gold", 25), ("Seal of Command", "ability_warrior_innerrage", 1, "draw1", 1),
   ("Two-Handed Weapon Specialization", "inv_hammer_04", 3, "str", 2), ("Sanctity Aura", "spell_holy_mindvision", 3, "spell_power", 2),
   ("Vengeance", "ability_racial_avatar", 3, "str", 2), ("Repentance", "spell_holy_prayerofhealing", 1, "energy1", 1)])],
 "hunter": [
  ("beast-mastery", "Beast Mastery", "ability_hunter_beasttaming", [
   ("Endurance Training", "spell_nature_reincarnation", 5, "hp", 4), ("Improved Aspect of the Hawk", "spell_nature_ravenform", 5, "str", 1),
   ("Thick Hide", "inv_misc_pelt_bear_03", 3, "armor", 1), ("Pathfinding", "ability_mount_jungletiger", 2, "gold", 20),
   ("Unleashed Fury", "ability_bullrush", 5, "str", 1), ("Improved Revive Pet", "ability_hunter_beastsoothe", 2, "heal", 15),
   ("Ferocity", "inv_misc_monsterclaw_04", 5, "thorns", 1), ("Spirit Bond", "ability_druid_demoralizingroar", 2, "regen", 3),
   ("Bestial Swiftness", "ability_druid_dash", 1, "energy1", 1), ("Frenzy", "ability_ghoulfrenzy", 3, "draw1", 1),
   ("Beast Mastery Mastery", "ability_hunter_beastcall", 2, "hp", 8), ("Bestial Wrath", "ability_druid_ferociousbite", 1, "str", 4)]),
  ("marksmanship", "Marksmanship", "ability_marksmanship", [
   ("Efficiency", "spell_frost_wizardmark", 5, "goldpct", 4), ("Lethal Shots", "ability_searingarrow", 5, "str", 1),
   ("Improved Hunter's Mark", "ability_hunter_snipershot", 3, "str", 1), ("Aimed Shot", "inv_spear_07", 1, "draw1", 1),
   ("Mortal Shots", "ability_piercedamage", 5, "str", 1), ("Hawk Eye", "ability_townwatch", 3, "hp", 4),
   ("Barrage", "ability_upgrademoonglaive", 3, "draw1", 1), ("Scatter Shot", "ability_golemstormbolt", 1, "energy1", 1),
   ("Ranged Weapon Specialization", "inv_weapon_bow_08", 5, "str", 1), ("Master Marksman", "ability_hunter_snipershot", 3, "str", 2),
   ("Silencing Shot", "ability_theblackarrow", 1, "energy1", 1), ("Trueshot Aura", "ability_trueshot", 1, "str", 4)]),
  ("survival", "Survival", "ability_hunter_swiftstrike", [
   ("Monster Slaying", "inv_misc_head_dragon_black", 3, "str", 1), ("Deflection", "ability_parry", 5, "dex", 1),
   ("Entrapment", "spell_nature_stranglevines", 5, "thorns", 2), ("Savage Strikes", "ability_racial_bloodrage", 2, "energy1", 1),
   ("Survivalist", "spell_shadow_twilight", 5, "hp", 5), ("Clever Traps", "spell_nature_timestop", 2, "draw1", 1),
   ("Deterrence", "ability_whirlwind", 1, "block", 8), ("Trap Mastery", "ability_ensnare", 3, "thorns", 2),
   ("Counterattack", "ability_warrior_challange", 2, "thorns", 3), ("Killer Instinct", "spell_holy_blessingofstamina", 3, "str", 2),
   ("Lightning Reflexes", "spell_nature_invisibilty", 3, "dex", 1), ("Wyvern Sting", "inv_spear_02", 1, "regen", 4)])],
 "rogue": [
  ("assassination", "Assassination", "ability_rogue_eviscerate", [
   ("Malice", "ability_racial_bloodrage", 5, "str", 1), ("Remorseless Attacks", "ability_fiegndead", 2, "energy1", 1),
   ("Ruthlessness", "ability_druid_disembowel", 3, "res", 2), ("Murder", "spell_shadow_deathscream", 2, "goldpct", 5),
   ("Vile Poisons", "ability_rogue_feigndeath", 5, "thorns", 2), ("Relentless Strikes", "ability_warrior_decisivestrike", 2, "res", 2),
   ("Lethality", "ability_criticalstrike", 5, "str", 1), ("Improved Kidney Shot", "ability_rogue_kidneyshot", 2, "draw1", 1),
   ("Vigor", "spell_nature_earthbindtotem", 1, "energy1", 1), ("Seal Fate", "spell_shadow_chilltouch", 3, "res", 3),
   ("Master Poisoner", "ability_creature_poison_06", 3, "thorns", 2), ("Cold Blood", "spell_ice_lament", 1, "free_cast", 1)]),
  ("combat", "Combat", "ability_backstab", [
   ("Improved Sinister Strike", "spell_shadow_ritualofsacrifice", 2, "res", 2), ("Lightning Reflexes", "spell_nature_invisibilty", 5, "dex", 1),
   ("Deflection", "ability_parry", 5, "block", 3), ("Precision", "ability_marksmanship", 5, "str", 1),
   ("Endurance", "spell_shadow_shadowward", 2, "hp", 8), ("Riposte", "ability_warrior_challange", 1, "thorns", 4),
   ("Blade Flurry", "ability_warrior_punishingblow", 1, "draw1", 1), ("Dual Wield Specialization", "ability_dualwield", 5, "str", 1),
   ("Weapon Expertise", "inv_sword_17", 2, "str", 2), ("Aggression", "ability_racial_bloodrage", 3, "str", 2),
   ("Combat Potency", "inv_weapon_shortblade_05", 2, "res", 3), ("Adrenaline Rush", "spell_shadow_shadowworddominate", 1, "energy1", 2)]),
  ("subtlety", "Subtlety", "ability_stealth", [
   ("Master of Deception", "spell_shadow_charm", 5, "stealth", 1), ("Opportunity", "ability_warrior_warcry", 5, "str", 1),
   ("Sleight of Hand", "ability_rogue_feint", 2, "gold", 25), ("Elusiveness", "spell_magic_lesserinvisibilty", 2, "dex", 1),
   ("Camouflage", "ability_stealth", 3, "stealth", 1), ("Initiative", "spell_shadow_fumble", 3, "res", 2),
   ("Ghostly Strike", "spell_shadow_curse", 1, "block", 8), ("Serrated Blades", "inv_sword_17", 3, "str", 2),
   ("Heightened Senses", "ability_ambush", 2, "draw1", 1), ("Deadliness", "inv_weapon_crossbow_01", 3, "str", 2),
   ("Premeditation", "spell_shadow_possession", 2, "res", 3), ("Preparation", "spell_shadow_antishadow", 1, "free_cast", 1)])],
 "priest": [
  ("discipline", "Discipline", "spell_holy_wordfortitude", [
   ("Unbreakable Will", "spell_magic_magearmor", 5, "hp", 4), ("Wand Specialization", "inv_wand_01", 5, "spell_power", 1),
   ("Improved Power Word: Shield", "spell_holy_powerwordshield", 3, "shield", 5), ("Silent Resolve", "spell_nature_manaregentotem", 5, "regen", 1),
   ("Inner Focus", "spell_frost_windwalkon", 1, "free_cast", 1), ("Meditation", "spell_nature_sleep", 3, "heal", 12),
   ("Mental Agility", "ability_hibernation", 5, "goldpct", 4), ("Mental Strength", "spell_nature_enchantarmor", 5, "shield", 3),
   ("Divine Spirit", "spell_holy_divinespirit", 1, "draw1", 1), ("Soul Warding", "spell_holy_powerwordshield", 3, "shield", 4),
   ("Focused Will", "spell_arcane_blink", 2, "armor", 1), ("Power Infusion", "spell_holy_powerinfusion", 1, "spell_power", 4)]),
  ("holy", "Holy", "spell_holy_guardianspirit", [
   ("Healing Focus", "spell_holy_healingfocus", 2, "heal", 10), ("Improved Renew", "spell_holy_renew", 3, "regen", 2),
   ("Holy Specialization", "spell_holy_sealofsalvation", 5, "spell_power", 1), ("Spell Warding", "spell_holy_spellwarding", 5, "block", 2),
   ("Holy Nova", "spell_holy_holynova", 1, "thorns", 3), ("Blessed Recovery", "spell_holy_blessedrecovery", 3, "regen", 2),
   ("Inspiration", "spell_holy_layonhands", 3, "armor", 1), ("Holy Reach", "spell_holy_purify", 2, "draw1", 1),
   ("Improved Healing", "spell_holy_heal02", 3, "heal", 15), ("Spiritual Guidance", "spell_holy_spiritualguidence", 5, "spell_power", 1),
   ("Surge of Light", "spell_holy_surgeoflight", 2, "energy1", 1), ("Lightwell", "spell_holy_summonlightwell", 1, "hp", 16)]),
  ("shadow", "Shadow", "spell_shadow_shadowwordpain", [
   ("Spirit Tap", "spell_shadow_requiem", 5, "goldpct", 5), ("Shadow Affinity", "spell_shadow_shadowward", 3, "hp", 4),
   ("Improved Shadow Word: Pain", "spell_shadow_shadowwordpain", 2, "thorns", 3), ("Shadow Focus", "spell_shadow_burningspirit", 5, "spell_power", 1),
   ("Improved Mind Blast", "spell_shadow_unholyfrenzy", 5, "spell_power", 1), ("Mind Flay", "spell_shadow_siphonmana", 1, "draw1", 1),
   ("Darkness", "spell_shadow_twilight", 5, "spell_power", 1), ("Silence", "spell_shadow_impphaseshift", 1, "energy1", 1),
   ("Shadow Weaving", "spell_shadow_blackplague", 3, "spell_power", 2), ("Shadowform", "spell_shadow_shadowform", 1, "armor", 1),
   ("Misery", "spell_shadow_misery", 2, "draw1", 1), ("Vampiric Embrace", "spell_shadow_unsummonbuilding", 1, "vampiric", 1)])],
 "shaman": [
  ("elemental", "Elemental", "spell_nature_lightning", [
   ("Convection", "spell_nature_wispsplode", 5, "goldpct", 4), ("Concussion", "spell_fire_fireball", 5, "spell_power", 1),
   ("Earth's Grasp", "spell_nature_stoneclawtotem", 2, "block", 4), ("Call of Flame", "spell_fire_immolation", 3, "thorns", 2),
   ("Elemental Focus", "spell_shadow_manaburn", 1, "free_cast", 1), ("Call of Thunder", "spell_nature_callstorm", 5, "spell_power", 1),
   ("Reverberation", "spell_frost_frostward", 5, "dex", 1), ("Eye of the Storm", "spell_nature_eyeofthestorm", 3, "shield", 5),
   ("Elemental Fury", "spell_fire_volcano", 1, "spell_power", 3), ("Lightning Mastery", "spell_nature_lightning", 3, "draw1", 1),
   ("Storm, Earth and Fire", "spell_nature_spiritarmor", 2, "thorns", 2), ("Elemental Mastery", "spell_nature_wispheal", 1, "energy1", 1)]),
  ("enhancement", "Enhancement", "spell_nature_lightningshield", [
   ("Ancestral Knowledge", "spell_shadow_grimward", 5, "hp", 4), ("Shield Specialization", "inv_shield_06", 5, "block", 3),
   ("Thundering Strikes", "ability_thunderbolt", 5, "str", 1), ("Improved Ghost Wolf", "spell_nature_spiritwolf", 2, "gold", 25),
   ("Improved Lightning Shield", "spell_nature_lightningshield", 3, "thorns", 3), ("Two-Handed Axes and Maces", "inv_axe_10", 1, "str", 2),
   ("Flurry", "ability_ghoulfrenzy", 3, "draw1", 1), ("Toughness", "spell_holy_devotion", 5, "armor", 1),
   ("Weapon Mastery", "inv_sword_20", 3, "str", 2), ("Stormstrike", "spell_holy_sealofmight", 1, "energy1", 1),
   ("Shamanistic Rage", "spell_nature_bloodlust", 2, "regen", 3), ("Windfury Weapon", "spell_nature_cyclone", 1, "windfury", 1)]),
  ("restoration", "Restoration", "spell_nature_magicimmunity", [
   ("Improved Healing Wave", "spell_nature_magicimmunity", 5, "heal", 8), ("Tidal Focus", "spell_frost_manarecharge", 5, "goldpct", 4),
   ("Ancestral Healing", "spell_nature_undyingstrength", 3, "armor", 1), ("Totemic Focus", "spell_nature_moonglow", 5, "res", 10),
   ("Healing Focus", "spell_nature_healingwavelesser", 3, "regen", 2), ("Totemic Mastery", "spell_nature_nullward", 1, "draw1", 1),
   ("Healing Grace", "spell_nature_healingtouch", 3, "heal", 12), ("Restorative Totems", "spell_nature_manaregentotem", 5, "regen", 1),
   ("Tidal Mastery", "spell_nature_tranquility", 3, "shield", 6), ("Mana Tide Totem", "spell_frost_summonwaterelemental", 1, "energy1", 1),
   ("Purification", "spell_frost_wizardmark", 3, "heal", 10), ("Reincarnation", "spell_nature_reincarnation", 1, "reincarnation", 1)])],
 "mage": [
  ("arcane", "Arcane", "spell_holy_magicalsentry", [
   ("Arcane Focus", "spell_holy_devotion", 5, "spell_power", 1), ("Arcane Subtlety", "spell_holy_dispelmagic", 2, "dex", 1),
   ("Magic Absorption", "spell_nature_astralrecovery", 5, "shield", 2), ("Arcane Concentration", "spell_shadow_manaburn", 3, "free_cast", 1),
   ("Improved Arcane Explosion", "spell_nature_wispsplode", 3, "thorns", 2), ("Magic Attunement", "spell_nature_abolishmagic", 2, "hp", 6),
   ("Improved Mana Shield", "spell_shadow_detectlesserinvisibility", 2, "shield", 5), ("Arcane Resilience", "spell_arcane_arcaneresilience", 1, "armor", 1),
   ("Presence of Mind", "spell_nature_enchantarmor", 1, "free_cast", 1), ("Arcane Mind", "spell_holy_magicalsentry", 4, "draw1", 1),
   ("Spell Power", "spell_nature_starfall", 3, "spell_power", 2), ("Arcane Power", "spell_nature_lightning", 1, "spell_power", 4)]),
  ("fire", "Fire", "spell_fire_firebolt02", [
   ("Improved Fireball", "spell_fire_flamebolt", 5, "spell_power", 1), ("Impact", "spell_fire_meteorstorm", 5, "dex", 1),
   ("Ignite", "spell_fire_incinerate", 5, "thorns", 1), ("Flame Throwing", "spell_fire_flare", 2, "draw1", 1),
   ("Incinerate", "spell_fire_flameshock", 2, "spell_power", 2), ("Improved Flamestrike", "spell_fire_selfdestruct", 3, "spell_power", 2),
   ("Burning Soul", "spell_fire_fire", 2, "hp", 6), ("Master of Elements", "spell_fire_masterofelements", 3, "goldpct", 5),
   ("Fire Power", "spell_fire_immolation", 5, "spell_power", 1), ("Critical Mass", "spell_fire_fireball02", 3, "spell_power", 2),
   ("Pyroblast", "spell_fire_fireball02", 1, "energy1", 1), ("Combustion", "spell_fire_sealoffire", 1, "spell_power", 4)]),
  ("frost", "Frost", "spell_frost_frostbolt02", [
   ("Frost Warding", "spell_frost_frostward", 2, "block", 4), ("Improved Frostbolt", "spell_frost_frostbolt02", 5, "spell_power", 1),
   ("Elemental Precision", "spell_ice_magicdamage", 3, "spell_power", 1), ("Ice Shards", "spell_frost_iceshard", 5, "dex", 1),
   ("Frostbite", "spell_frost_frostarmor", 3, "thorns", 2), ("Improved Frost Nova", "spell_frost_freezingbreath", 2, "block", 4),
   ("Permafrost", "spell_frost_wisp", 3, "regen", 2), ("Piercing Ice", "spell_frost_frostbolt", 3, "spell_power", 2),
   ("Cold Snap", "spell_frost_wizardmark", 1, "energy1", 1), ("Arctic Reach", "spell_shadow_darkritual", 2, "draw1", 1),
   ("Shatter", "spell_frost_frostshock", 3, "spell_power", 2), ("Ice Block", "spell_frost_frost", 1, "retain_block", 1)])],
 "warlock": [
  ("affliction", "Affliction", "spell_shadow_deathcoil", [
   ("Suppression", "spell_shadow_unsummonbuilding", 5, "dex", 1), ("Improved Corruption", "spell_shadow_abominationexplosion", 5, "thorns", 2),
   ("Improved Curse of Weakness", "spell_shadow_curseofmannoroth", 3, "block", 3), ("Improved Drain Soul", "spell_shadow_haunting", 2, "res", 2),
   ("Improved Life Tap", "spell_shadow_burningspirit", 2, "energy1", 1), ("Fel Concentration", "spell_shadow_fingerofdeath", 5, "hp", 4),
   ("Improved Curse of Agony", "spell_shadow_curseofsargeras", 3, "spell_power", 2), ("Grim Reach", "spell_shadow_callofbone", 2, "draw1", 1),
   ("Nightfall", "spell_shadow_twilight", 2, "free_cast", 1), ("Shadow Mastery", "spell_shadow_blackplague", 5, "spell_power", 1),
   ("Dark Pact", "spell_shadow_darkritual", 2, "energy1", 1), ("Siphon Life", "spell_shadow_requiem", 1, "vampiric", 1)]),
  ("demonology", "Demonology", "spell_shadow_metamorphosis", [
   ("Improved Healthstone", "inv_stone_04", 2, "heal", 15), ("Demonic Embrace", "spell_shadow_metamorphosis", 5, "hp", 5),
   ("Improved Voidwalker", "spell_shadow_summonvoidwalker", 3, "shield", 5), ("Fel Intellect", "spell_holy_magicalsentry", 5, "res", 15),
   ("Fel Domination", "spell_nature_removecurse", 1, "energy1", 1), ("Fel Stamina", "spell_shadow_antishadow", 5, "hp", 5),
   ("Master Summoner", "spell_shadow_impphaseshift", 2, "draw1", 1), ("Unholy Power", "spell_shadow_shadowworddominate", 5, "str", 1),
   ("Demonic Sacrifice", "spell_shadow_psychicscream", 3, "spell_power", 2), ("Master Demonologist", "spell_shadow_shadowward", 3, "armor", 1),
   ("Demonic Aegis", "spell_shadow_demonicaegis", 2, "shield", 8), ("Soul Link", "spell_shadow_gathershadows", 1, "armor", 2)]),
  ("destruction", "Destruction", "spell_shadow_rainoffire", [
   ("Improved Shadow Bolt", "spell_shadow_shadowbolt", 5, "spell_power", 1), ("Cataclysm", "spell_fire_windsofwoe", 5, "goldpct", 4),
   ("Bane", "spell_shadow_deathpact", 5, "dex", 1), ("Aftermath", "spell_fire_fire", 5, "thorns", 1),
   ("Devastation", "spell_fire_flameshock", 5, "spell_power", 1), ("Shadowburn", "spell_shadow_scourgebuild", 1, "energy1", 1),
   ("Intensity", "spell_fire_lavaspawn", 2, "hp", 6), ("Destructive Reach", "spell_shadow_corpseexplode", 2, "draw1", 1),
   ("Improved Searing Pain", "spell_fire_soulburn", 5, "spell_power", 1), ("Ruin", "spell_shadow_deathanddecay", 3, "spell_power", 2),
   ("Emberstorm", "spell_fire_selfdestruct", 2, "energy1", 1), ("Conflagrate", "spell_fire_fireball", 1, "spell_power", 4)])],
 "druid": [
  ("balance", "Balance", "spell_nature_starfall", [
   ("Improved Wrath", "spell_nature_abolishmagic", 5, "spell_power", 1), ("Nature's Grasp", "spell_nature_natureswrath", 1, "thorns", 3),
   ("Improved Moonfire", "spell_nature_starfall", 5, "spell_power", 1), ("Improved Thorns", "spell_nature_thorns", 3, "thorns", 2),
   ("Omen of Clarity", "spell_nature_crystalball", 1, "free_cast", 1), ("Natural Weapons", "inv_staff_01", 5, "str", 1),
   ("Nature's Reach", "spell_nature_naturetouchgrow", 2, "draw1", 1), ("Vengeance", "spell_nature_purge", 5, "spell_power", 1),
   ("Moonfury", "spell_nature_starfall", 3, "spell_power", 2), ("Dreamstate", "spell_nature_wispsplode", 3, "res", 15),
   ("Wrath of Cenarius", "spell_nature_naturesblessing", 2, "energy1", 1), ("Moonkin Form", "spell_nature_forceofnature", 1, "spell_power", 4)]),
  ("feral", "Feral Combat", "ability_racial_bearform", [
   ("Ferocity", "ability_hunter_pet_hyena", 5, "res", 2), ("Feral Aggression", "ability_druid_demoralizingroar", 5, "str", 1),
   ("Feral Instinct", "ability_ambush", 5, "stealth", 1), ("Brutal Impact", "ability_druid_bash", 2, "energy1", 1),
   ("Thick Hide", "inv_misc_pelt_bear_03", 5, "armor", 1), ("Feline Swiftness", "spell_nature_spiritwolf", 2, "draw1", 1),
   ("Sharpened Claws", "inv_misc_monsterclaw_04", 3, "feral", 2), ("Predatory Strikes", "ability_hunter_pet_cat", 3, "str", 2),
   ("Blood Frenzy", "ability_ghoulfrenzy", 2, "regen", 3), ("Savage Fury", "ability_druid_ravage", 3, "feral", 2),
   ("Leader of the Pack", "spell_nature_unyeildingstamina", 2, "draw1", 1), ("Heart of the Wild", "spell_holy_blessingofagility", 1, "hp", 16)]),
  ("restoration", "Restoration", "spell_nature_healingtouch", [
   ("Improved Mark of the Wild", "spell_nature_regeneration", 5, "armor", 1), ("Furor", "spell_holy_blessingofstamina", 5, "res", 10),
   ("Improved Healing Touch", "spell_nature_healingtouch", 5, "heal", 8), ("Nature's Focus", "spell_nature_healingwavegreater", 5, "block", 2),
   ("Improved Enrage", "ability_druid_enrage", 2, "energy1", 1), ("Insect Swarm", "spell_nature_insectswarm", 1, "thorns", 4),
   ("Subtlety", "ability_eyeoftheowl", 5, "hp", 4), ("Improved Rejuvenation", "spell_nature_rejuvenation", 3, "regen", 2),
   ("Gift of Nature", "spell_nature_protectionformnature", 5, "heal", 8), ("Nature's Swiftness", "spell_nature_ravenform", 1, "free_cast", 1),
   ("Empowered Touch", "spell_nature_healingtouch", 3, "heal", 10), ("Swiftmend & Tranquility", "inv_relics_idolofrejuvenation", 1, "regen", 5)])],
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
