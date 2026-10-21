#!/usr/bin/env python3
"""Align basic (starter) cards to Slay the Spire baselines: Strike 6->9 dmg,
Defend 5->8 block. Surgical raw-text edits: no whole-file reformat, strict
verification (parsed preconditions + replacement counts + post-parse audit).
Aborts a file untouched if anything mismatches.

Run:  python tools/sts_basics_fix.py [--apply]
      (default = dry run: prints planned changes, writes nothing)
"""
import copy
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLASSES_DIR = os.path.join(HERE, "..", "data", "classes")

# {class: {card_id: {"base": [(op, old, new)...], "up": [(op, old, new)...]}}}
CHANGES = {
    "druid": {
        "wrath":              {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "claw":               {"base": [("damage", 7, 6)],  "up": [("damage", 10, 9)]},
        "healing-touch":      {"base": [("block", 7, 5)],   "up": [("block", 10, 8)]},
        "bear-form":          {"base": [("block", 8, 5)],   "up": [("block", 11, 8)]},
        "cat-form":           {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
    },
    "hunter": {
        "arcane-shot":        {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "raptor-strike":      {"base": [("damage", 7, 6), ("block", 6, 5)],
                               "up":   [("damage", 10, 9), ("block", 9, 8)]},
    },
    "mage": {
        "fireball":           {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "frostbolt":          {"base": [("damage", 7, 6)],  "up": [("damage", 10, 9)]},
        "mana-shield":        {"base": [("block", 8, 5)],   "up": [("block", 11, 8)]},
    },
    "paladin": {
        "seal-of-righteousness": {"base": [("damage", 7, 6)], "up": [("damage", 10, 9)]},
        "judgement":          {"base": [("damage", 7, 6)],  "up": [("damage", 10, 9)]},
        "holy-light":         {"base": [("block", 6, 5)],   "up": []},
        "devotion-aura":      {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
    },
    "priest": {
        "smite":              {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "power-word-shield":  {"base": [("block", 8, 5)],   "up": [("block", 11, 8)]},
        "lesser-heal":        {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
    },
    "rogue": {
        "evasion":            {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
    },
    "shaman": {
        "lightning-bolt":     {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "healing-wave":       {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
        "stoneskin-totem":    {"base": [("block", 7, 5)],   "up": [("block", 10, 8)]},
    },
    "warlock": {
        "shadow-bolt":        {"base": [("damage", 8, 6)],  "up": [("damage", 11, 9)]},
        "demon-skin":         {"base": [("block", 7, 5)],   "up": [("block", 10, 8)]},
    },
    "warrior": {
        "shield-block":       {"base": [("block", 6, 5)],   "up": [("block", 9, 8)]},
    },
}

APPLY = "--apply" in sys.argv


def num_tokens_map(pairs):
    return {str(old): str(new) for _, old, new in pairs}


def retoken(text, mapping):
    """Single-pass digit-token swap; unknown tokens untouched (no cascades)."""
    return re.sub(r"\d+", lambda m: mapping.get(m.group(0), m.group(0)), text)


def effect_amounts(effects, op):
    return [e.get("amount") for e in effects or []
            if e.get("op") == op and isinstance(e.get("amount"), int)]


def fix_file(path):
    cls = os.path.basename(path).replace(".json", "")
    table = CHANGES.get(cls)
    if not table:
        return
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    by_id = {c["id"]: c for c in data.get("cards", [])}

    # 1) parsed preconditions
    for cid, plan in table.items():
        card = by_id.get(cid)
        if card is None:
            print(f"  !! {cls}/{cid}: card not found -> abort file")
            return
        for where, key in (("base", card), ("up", card.get("upgrade") or {})):
            effects = key.get("effects") or []
            for op, old, new in plan[where]:
                got = effect_amounts(effects, op)
                if got != [old]:
                    print(f"  !! {cls}/{cid} {where} {op}: expected [{old}] got {got} -> abort file")
                    return

    # 2) span-scoped raw-text surgery
    new_raw = raw
    for cid, plan in table.items():
        anchor = re.search(r'("id":\s*"%s",\s*"name")' % re.escape(cid), new_raw)
        if not anchor:
            print(f"  !! {cls}/{cid}: raw anchor not found -> abort file")
            return
        span_start = anchor.start()
        nxt = re.search(r'"id":\s*"[^"]+",\s*"name"', new_raw[anchor.end():])
        span_end = anchor.end() + (nxt.start() if nxt else len(new_raw) - anchor.end())
        span = new_raw[span_start:span_end]

        # split into base part / upgrade part at the card's "upgrade" key
        up_key = span.find('"upgrade"')
        if up_key == -1:
            print(f"  !! {cls}/{cid}: no upgrade key in span -> abort file")
            return
        parts = {"base": span[:up_key], "up": span[up_key:]}

        for where in ("base", "up"):
            part = parts[where]
            for op, old, new in plan[where]:
                # amount inside a flat effect object carrying this op + exact old value
                pat = re.compile(
                    r'(\{[^{}\[\]]*"op":\s*"%s"[^{}\[\]]*"amount":\s*)%d\b' % (op, old))
                hits = pat.findall(part)
                if len(hits) != 1:
                    # amount may precede op
                    pat2 = re.compile(
                        r'(\{[^{}\[\]]*"amount":\s*)%d([^{}\[\]]*"op":\s*"%s")' % (old, op))
                    hits2 = pat2.findall(part)
                    if len(hits2) != 1:
                        print(f"  !! {cls}/{cid} {where} {op} {old}: raw effect not"
                              f" uniquely found ({len(hits)}+{len(hits2)} hits) -> abort file")
                        return
                    part = pat2.sub(lambda m: m.group(1) + str(new) + m.group(2), part, count=1)
                else:
                    part = pat.sub(lambda m: m.group(1) + str(new), part, count=1)
            # text tokens (single pass, no cascade)
            mapping = num_tokens_map(plan[where])
            if mapping:
                src = by_id[cid]
                key = src if where == "base" else (src.get("upgrade") or {})
                old_text = key.get("text", "")
                new_text = retoken(old_text, mapping)
                if old_text and new_text != old_text and old_text in part:
                    part = part.replace(old_text, new_text, 1)
            parts[where] = part
        span = parts["base"] + parts["up"]
        new_raw = new_raw[:span_start] + span + new_raw[span_end:]
        print(f"  {cls}/{cid}: ok")

    # 3) post-parse verification of the proposed text
    try:
        check = json.loads(new_raw)
    except Exception as e:
        print(f"  !! {cls}: new raw does not parse ({e}) -> abort file")
        return
    cby = {c["id"]: c for c in check.get("cards", [])}
    for cid, plan in table.items():
        card = cby[cid]
        for where, key in (("base", card), ("up", card.get("upgrade") or {})):
            for op, old, new in plan[where]:
                got = effect_amounts(key.get("effects") or [], op)
                if got != [new]:
                    print(f"  !! {cls}/{cid} {where} {op}: post {got} != [{new}] -> abort file")
                    return

    if APPLY:
        open(path, "w", encoding="utf-8", newline="").write(new_raw)
        print(f"  == {cls}: WRITTEN")
    else:
        print(f"  == {cls}: dry-run ok (no write)")


def main():
    mode = "APPLY" if APPLY else "DRY RUN (no writes)"
    print(f"sts_basics_fix: {mode}")
    for f in sorted(glob.glob(os.path.join(CLASSES_DIR, "*.json"))):
        if "index" in f:
            continue
        fix_file(f)


if __name__ == "__main__":
    main()
