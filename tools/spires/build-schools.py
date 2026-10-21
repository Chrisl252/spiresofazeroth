#!/usr/bin/env python3
"""Derive data/schools.json (card -> damage school) from effects, icon prefix and data/fx/cards*.json particles.
Hand overrides live in OVERRIDES below (and survive a rebuild). Run: python tools/spires/build-schools.py [--report]"""
import json, glob, sys, os, collections
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "spiresofazeroth", "data")
SCHOOLS = ["physical", "fire", "frost", "arcane", "nature", "shadow", "holy"]
ICON = [("spell_fire_", "fire"), ("spell_frost_", "frost"), ("spell_shadow_", "shadow"), ("spell_holy_", "holy"),
        ("spell_arcane_", "arcane"), ("spell_nature_", "nature"), ("spell_deathknight_", "frost")]
PART = {"holy": "holy", "shadow": "shadow", "embers": "fire", "arcane": "arcane", "leaves": "nature", "frost": "frost"}
# card id -> school, where icon/particles would guess wrong (classic spell schools)
OVERRIDES = {"rend": "physical", "garrote": "physical", "rupture": "physical", "deep-wounds": "physical",
             "shadow-word-pain": "shadow", "corruption": "shadow", "curse-of-agony": "shadow",
             "serpent-sting": "nature", "arcane-shot": "arcane", "lightning-bolt": "nature", "earth-shock": "nature",
             "flame-shock": "fire", "frost-shock": "frost", "wrath": "nature", "starfire": "arcane", "moonfire": "arcane",
             "judgement": "holy", **{k: "physical" for k in "shred enrage tigers-fury sinister-strike backstab opportunity ambush ghostly-strike hemorrhage revenge bloodthirst concussive-shot".split()}, "smite": "holy", "mind-blast": "shadow", "shadow-bolt": "shadow", "immolate": "fire"}
def walk(x, out):
    if isinstance(x, dict):
        out.append(x)
        for v in x.values(): walk(v, out)
    elif isinstance(x, list):
        for v in x: walk(v, out)
fx = {}
for f in glob.glob(os.path.join(ROOT, "fx", "cards*.json")):
    for k, v in json.load(open(f, encoding="utf8")).items():
        if isinstance(v, dict): fx[k] = v
old = {}
p = os.path.join(ROOT, "schools.json")
if os.path.exists(p): old = json.load(open(p, encoding="utf8"))
cards, src = {}, collections.Counter()
files = glob.glob(os.path.join(ROOT, "classes", "*.json")) + [os.path.join(ROOT, "neutral-cards.json"), os.path.join(ROOT, "status-cards.json")]
for f in files:
    if f.endswith("index.json") or not os.path.exists(f): continue
    d = json.load(open(f, encoding="utf8"))
    for c in (d.get("cards", []) + d.get("tokens", [])):
        ops = []; walk(c.get("effects"), ops)
        ds = [o["school"] for o in ops if o.get("op") == "damage" and o.get("school") in SCHOOLS]
        how = None
        if c["id"] in OVERRIDES: s, how = OVERRIDES[c["id"]], "override"
        elif ds: s, how = collections.Counter(ds).most_common(1)[0][0], "effect"
        else:
            s = None; icon = (c.get("icon") or "").lower()
            for pre, sc in ICON:
                if icon.startswith(pre): s, how = sc, "icon"; break
            if not s and fx.get(c["id"], {}).get("particles") in PART: s, how = PART[fx[c["id"]]["particles"]], "fx"
            if not s: s, how = "physical", "default"
        cards[c["id"]] = s; src[how] += 1
out = {"_doc": "Damage school per card id. Engine stamps card.school at load; a damage effect without its own `school` uses it. Rebuild: python tools/spires/build-schools.py",
       "schools": SCHOOLS, "icons": {"physical":"ability_meleedamage","fire":"spell_fire_fire","frost":"spell_frost_frostbolt02","arcane":"spell_arcane_arcane01","nature":"spell_nature_protectionformnature","shadow":"spell_shadow_shadowbolt","holy":"spell_holy_holybolt"}, "cards": dict(sorted(cards.items())),
       "statusSchools": {"bleed": ["physical"], "poison": ["nature", "physical"], "burn": ["fire"], "disease": ["shadow", "nature"], "frostbite": ["frost"], "frozen": ["frost"]},
       "statusTypes": {"bleed": "dot", "poison": "dot", "burn": "dot", "disease": "dot", "weak": "debuff", "vulnerable": "debuff", "frail": "debuff",
                       "slow": "control", "frozen": "control", "stun": "control", "fear": "control", "sleep": "control", "silence": "control", "frostbite": "debuff", "marked": "debuff"}}
json.dump(out, open(p, "w", encoding="utf8"), indent=1, ensure_ascii=False)
print(len(cards), dict(src))
if "--report" in sys.argv:
    print(collections.Counter(cards.values()))
