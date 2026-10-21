#!/usr/bin/env python3
"""Balance audit for Spires of Azeroth (read-only; prints findings, edits nothing).

Baselines follow Slay the Spire conventions:
  - Strike analog: 1 energy, 6 damage -> 9 upgraded
  - Defend analog: 1 energy, 5 block  -> 8 upgraded
  - Starter deck:  ~5 strikes + ~4 defends + 1-2 class signatures

Usage:
  python tools/balance_audit.py [--class warrior] [--all-cards]
"""
import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLASSES_DIR = os.path.join(HERE, "..", "data", "classes")
ZONES_DIR = os.path.join(HERE, "..", "data", "zones")

STS_STRIKE, STS_STRIKE_UP = 6, 9
STS_DEFEND, STS_DEFEND_UP = 5, 8


def op_summary(effects):
    parts = []
    for e in effects or []:
        op = e.get("op", "?")
        amt = e.get("amount", e.get("stacks", ""))
        times = e.get("times")
        tgt = e.get("target", "")
        if tgt in ("all_enemies",):
            amt = f"{amt}xALL"
        parts.append(f"{op}:{amt}" + (f"x{times}" if times else ""))
    return "; ".join(parts)


def _num(v, default=0):
    """Coerce a data value to a number; dicts (ranges) count as their min."""
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, dict):
        return min(v.get("min", default), v.get("max", default)) if v else default
    if isinstance(v, str) and v.isdigit():
        return int(v)
    return default


def totals(effects):
    """Return {op: total amount} with 'times' multiplied in."""
    out = {}
    for e in effects or []:
        op = e.get("op", "?")
        amt = _num(e.get("amount", e.get("stacks", 0)))
        n = _num(e.get("times", 1), 1) or 1
        out[op] = out.get(op, 0) + amt * n
    return out


def audit_class(path, show_all=False):
    d = json.load(open(path, encoding="utf-8"))
    cid = d["id"]
    print(f"\n=== {cid.upper()} (HP {d.get('startingHp')}, "
          f"E/turn {d.get('resource', {}).get('energyPerTurn')}) ===")

    deck = {}
    for c in d.get("starterDeck", []):
        deck[c] = deck.get(c, 0) + 1
    print(f"starter deck ({sum(deck.values())} cards): {deck}")

    by_id = {c["id"]: c for c in d.get("cards", [])}
    issues = []
    for c in d.get("cards", []):
        if c.get("rarity") != "basic" and not show_all:
            continue
        t = totals(c.get("effects"))
        up = c.get("upgrade") or {}
        tu = totals(up.get("effects"))
        line = (f"  {c['id']:<30} cost {c.get('cost')} "
                f"[{op_summary(c.get('effects'))}]")
        if up:
            line += f"  UP cost {up.get('cost', c.get('cost'))} [{op_summary(up.get('effects'))}]"
        else:
            line += "  UP: MISSING"
        print(line)

        if not show_all:
            dmg, blk = t.get("damage", 0), t.get("block", 0)
            du, bu = tu.get("damage", 0), tu.get("block", 0)
            # Strike-shaped: damage present, no block
            if dmg and not blk and c.get("cost") == 1:
                if dmg != STS_STRIKE:
                    issues.append(f"    ! strike-like {c['id']}: {dmg} dmg (StS {STS_STRIKE})")
                if up and du != STS_STRIKE_UP:
                    issues.append(f"    ! {c['id']} upgrade: {du} dmg (StS {STS_STRIKE_UP})")
            if blk and not dmg and c.get("cost") == 1:
                if blk != STS_DEFEND:
                    issues.append(f"    ! defend-like {c['id']}: {blk} blk (StS {STS_DEFEND})")
                if up and bu != STS_DEFEND_UP:
                    issues.append(f"    ! {c['id']} upgrade: {bu} blk (StS {STS_DEFEND_UP})")
            if not up:
                issues.append(f"    ! {c['id']} has no upgrade")
    for i in issues:
        print(i)

    # starter deck composition check
    strikes = defends = 0
    for cid_, n in deck.items():
        c = by_id.get(cid_, {})
        t = totals(c.get("effects"))
        if t.get("damage") and not t.get("block") and c.get("cost") == 1:
            strikes += n
        if t.get("block") and not t.get("damage") and c.get("cost") == 1:
            defends += n
    total = sum(deck.values())
    sig = total - strikes - defends
    flag = ""
    if not (4 <= strikes <= 5) or not (3 <= defends <= 5) or sig > 2:
        flag = "   <-- deviates from StS 5/4/1-2 shape"
    print(f"  shape: {strikes} strike-like, {defends} defend-like, "
          f"{sig} signature{flag}")


def audit_zones():
    print("\n=== ZONE ENEMY SCALING (normal-tier avg by zone) ===")
    rows = []
    for f in sorted(glob.glob(os.path.join(ZONES_DIR, "*.enemies.json"))):
        zone = os.path.basename(f).replace(".enemies.json", "")
        try:
            enemies = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"  !! {zone}: parse error {e}")
            continue
        norms = [e for e in enemies if e.get("tier") == "normal"]
        if not norms:
            continue
        avg_hp = sum(sum(e["hp"]) / 2 for e in norms) / len(norms)
        avg_lvl = sum(sum(e.get("level", [0])) / 2 for e in norms) / len(norms)
        dmg_moves = [m for e in norms for m in e.get("moves", [])
                     if totals(m.get("effects")).get("damage")]
        avg_dmg = sum(totals(m.get("effects"))["damage"] for m in dmg_moves) / max(1, len(dmg_moves))
        rows.append((avg_lvl, zone, avg_hp, avg_dmg, len(norms)))
    rows.sort()
    prev_hp = None
    for lvl, zone, hp, dmg, n in rows:
        jump = ""
        if prev_hp and hp > prev_hp * 1.6:
            jump = f"  <-- HP jump from {prev_hp:.0f}"
        print(f"  lvl {lvl:5.1f}  {zone:<24} hp {hp:6.1f}  dmg {dmg:5.1f}  n={n}{jump}")
        prev_hp = hp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--class", dest="cls", default=None)
    ap.add_argument("--all-cards", action="store_true")
    ap.add_argument("--zones", action="store_true")
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(CLASSES_DIR, "*.json")))
    files = [f for f in files if "index" not in f]
    if args.cls:
        files = [f for f in files if os.path.basename(f) == args.cls + ".json"]
    for f in files:
        audit_class(f, show_all=args.all_cards)
    if args.zones:
        audit_zones()


if __name__ == "__main__":
    main()
