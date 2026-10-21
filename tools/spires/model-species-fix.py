r"""model-species-fix.py - audit (and fix) which 3D body every enemy in every encounter resolves to.

Resolution mirrors js/stage/actors3d.js: (1) assets/models/index.json enemies[id] / byName -> baked classic GLB, (2) data/models.json
fdid -> retail library /assets/wowdex/models/<fdid>.glb, (3) the 2D icon plate. The 2026-10-17 family stand-ins put many enemies on
a body of the wrong species (crocolisks on a kodo, owls on a harpy, gnolls on an orc). This script resolves every enemy, flags a
baked body whose native species (the types of enemies baked for that model) does not contain the enemy's type, and with --fix
re-points the wrong ones (and the plate-only ones) to the closest baked body of the right species, or drops the mapping so the
retail model / plate is used instead.

    python tools/spires/model-species-fix.py            # audit only
    python tools/spires/model-species-fix.py --fix      # rewrite assets/models/index.json (+ gruff-swiftbite in data/models.json)
"""
import json, os, sys, glob
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "..", "spiresofazeroth"))
J = lambda p: json.load(open(p, encoding="utf-8-sig"))
IDX = os.path.join(GAME, "assets", "models", "index.json")
MOD = os.path.join(GAME, "data", "models.json")

# stand-in bodies by enemy type -> baked model fdid (chosen from the display names baked for that model); None = no honest body, drop to retail/plate
BODY = {
    "bear": 123040, "owl": 123137, "bird": 123137, "roc": 123137, "thunderhawk": 123137, "gargoyle": 123137, "vulture": 123137,
    "wyvern": 124387, "hippogryph": 124387, "raptor": 125559, "ravasaur": 125559,
    "thunder-lizard": 124694, "lizard": 124694, "kodo": 124694,
    "stegodon": 123377, "basilisk": 123377, "croc": 123377, "crocolisk": 123377, "plague": 123377, "diemetradon": 123377,
    "grell": 124622, "imp": 124622, "voidwalker": 126369, "owlbeast": 123690, "shredder": 124235, "golem": 124235,
    "druid": 119940, "necromancer": 119940,
    "quilboar": 125497, "ogre": 125263, "satyr": 125796, "naga": 125069, "trogg": 126239, "kobold": 124691, "boar": 123090,
    "murloc": 125024, "worgen": 126487, "qiraji": 125892, "wind-serpent": 123610, "venomwing": 123610,
    "turtle": None, "zebra": None, "squirrel": None, "orc": 121287,
}
CASTER = ("geomancer", "shaman", "dustweaver", "necrolyte", "acolyte", "adept", "cultist", "ward keeper", "death speaker", "mage", "warlock", "magus", "mystic", "thornweaver", "siren", "sorceress", "screamer")
CASTER_BODY = {125497: 125498, 125263: 125264}           # quilboar / ogre caster variants
MALE_NAGA = ("myrmidon", "shorestalker", "warrior", "guard")
SPECIAL = {"gruff-swiftbite": "gnoll"}                    # a gnoll elite typed "wolf" in the zone data
HUMAN_BODIES = {119940, 119563, 124540, 124533, 124521, 121768}
HUMAN_TYPES = {"scarlet", "syndicate", "rogue", "warrior", "bandit", "human", "night-elf", "druid", "necromancer", "pirate", "cultist", "mage", "priest", "defias", "dalaran", "undead", "worgen", "vampire"}
SYNONYM = {("slime", 125957), ("tar", 125957), ("vampire", 124155), ("spectre", 123014), ("spectre", 123105), ("rock", 123747), ("magma", 123934),
           ("blue dragonkin", 123543), ("green dragonkin", 123543), ("felhound", 123878), ("shadow-lord", 123870), ("hederine", 125796),
           ("murloc-nightmare", 125024), ("chimaera", 123205), ("timberling", 123756), ("sprite", 123610), ("roc", 123137), ("vulture", 123137), ("croc", 123377), ("worgen", 126487)}
def accepted(t, mod):
    return (t, mod) in SYNONYM or (mod in HUMAN_BODIES and t in HUMAN_TYPES)


def main(fix):
    idx = J(IDX); M = J(MOD); disp = idx["displays"]; en = idx["enemies"]; via = idx.setdefault("via", {})
    byName = {k.lower(): v for k, v in idx["byName"].items()}; broken = set(idx.get("broken", []))
    best = {}  # model fdid -> display id with the most clips
    for d, e in disp.items():
        if d in broken: continue
        if e.get("model") not in best or len(e.get("clips", [])) > len(disp[best[e["model"]]].get("clips", [])): best[e["model"]] = d
    native = defaultdict(set)
    for eid, d in en.items():
        if eid in via: continue
        t = (M.get(eid) or {}).get("type"); mod = disp.get(str(d), {}).get("model")
        if t and mod: native[mod].add(t)
    tiers = Counter(); wrong = []; plates = []; changed = []
    for zrow in J(os.path.join(GAME, "data", "zones", "index.json"))["zones"]:
        z = J(os.path.join(GAME, "data", "zones", f"{zrow['id']}.json"))
        enemies = z.get("enemies") or (J(os.path.join(GAME, "data", "zones", z["enemiesFile"])) if z.get("enemiesFile") else [])
        raids = z.get("raidFloors") or (J(os.path.join(GAME, "data", "zones", z["raidFloorsFile"])) if z.get("raidFloorsFile") else [])
        defs = {e["id"]: e for e in enemies}
        ids = set()
        for lst in (z.get("encounters") or {}).values():
            for enc in lst: ids.update(enc)
        for fl in raids or []:
            for lst in (fl.get("encounters") or {}).values():
                if isinstance(lst, list):
                    for enc in lst: ids.update(enc if isinstance(enc, list) else [enc])
            for e in fl.get("enemies") or []: defs[e["id"]] = e; ids.add(e["id"])
        for eid in sorted(ids):
            d = defs.get(eid)
            if not d: continue
            rec = M.get(eid) or {}
            t = SPECIAL.get(eid) or (d.get("type") or rec.get("type") or "").lower()
            name = d.get("name", eid).lower()
            dsp = en.get(eid) or byName.get(name)
            ok = dsp is not None and str(dsp) in disp and str(dsp) not in broken
            mod = disp[str(dsp)].get("model") if ok else None
            v = via.get(eid) or {}
            bad = ok and t and native.get(mod) and t not in native[mod] and v.get("via") != "species" and not accepted(t, mod)
            if ok and not bad: tiers["classic"] += 1; continue
            if ok and bad: wrong.append((zrow["id"], eid, t, mod))
            elif rec.get("fdid"): tiers["retail"] += 1; continue
            else: plates.append((zrow["id"], eid, t))
            if not fix: continue
            # --- fix: pick an honest body for the type, else drop the baked mapping
            if t == "gnoll":
                if eid in en: en.pop(eid); via.pop(eid, None)
                M.setdefault(eid, {"type": "gnoll"}).update({"fdid": 4665405, "name": "Hogger (gnoll stand-in)", "match": "family", "scale": 0.95, "type": "gnoll"})
                changed.append((eid, "retail gnoll")); continue
            want = BODY.get(t, "keep")
            if want == "keep":
                if bad: tiers["kept-wrong"] += 1
                continue
            if want is None:
                if eid in en: en.pop(eid); via.pop(eid, None); changed.append((eid, "drop"))
                if eid in SPECIAL and eid in M: pass
                continue
            if want in CASTER_BODY and any(k in name for k in CASTER): want = CASTER_BODY[want]
            if want == 125069 and any(k in name for k in MALE_NAGA): want = 125078
            if t == "gnoll" or eid in SPECIAL and SPECIAL[eid] == "gnoll":
                if eid in en: en.pop(eid); via.pop(eid, None)
                M.setdefault(eid, {"type": "gnoll"}).update({"fdid": 4665405, "name": "Hogger (gnoll stand-in)", "match": "family", "scale": 0.95, "type": "gnoll"})
                changed.append((eid, "retail gnoll")); continue
            if want not in best: continue
            en[eid] = best[want]; via[eid] = {"via": "species", "from": disp[best[want]].get("name")}
            idx.setdefault("missing", [])
            if eid in idx["missing"]: idx["missing"].remove(eid)
            changed.append((eid, f"{t} -> {disp[best[want]].get('name')} ({want})"))
    print("tiers", dict(tiers), "wrong-species", len(wrong), "plates", len(plates))
    if not fix:
        for w in wrong: print("  WRONG", w)
        print("  plate types", Counter(p[2] for p in plates).most_common())
        return
    idx["_hand_edits"] = (idx.get("_hand_edits", "") + " | 2026-10-21 model-species-fix.py: species stand-ins (via=species) + drops; re-run with --fix after build-index.py.").strip(" |")
    with open(IDX, "w", encoding="utf-8", newline="\n") as f: json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    with open(MOD, "w", encoding="utf-8", newline="\n") as f: json.dump(M, f, ensure_ascii=False, separators=(", ", ": "))
    print("changed", len(changed)); [print("  ", c) for c in changed]


if __name__ == "__main__":
    main("--fix" in sys.argv)
