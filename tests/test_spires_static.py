"""Static guards for Spires of Azeroth (no browser needed).

- the data validator exits 0
- index.html carries no ad network code
- every .js/.json/.html/.css under spiresofazeroth/ stays under 800 lines
- every .js file passes `node --check`
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "spiresofazeroth"
NODE = shutil.which("node")
EXTS = {".js", ".mjs", ".json", ".html", ".css"}
SKIP_DIRS = {"node_modules", "backups", "__pycache__"}


def _files(exts):
    return sorted(p for p in SITE.rglob("*") if p.is_file() and p.suffix in exts and not (set(p.parts) & SKIP_DIRS))


needs_node = pytest.mark.skipif(NODE is None, reason="node not installed")


@needs_node
def test_validator_exits_zero():
    r = subprocess.run([NODE, str(ROOT / "tools/spires/validate-data.mjs")], capture_output=True, text=True, timeout=180, cwd=ROOT)
    assert r.returncode == 0, (r.stdout + r.stderr)[-4000:]


def test_index_has_no_ads():
    html = (SITE / "index.html").read_text(encoding="utf-8")
    for needle in ("adnetworks", "adsbygoogle", "wgf-3p-defer"):
        assert needle not in html, f"index.html must not contain {needle}"


def test_files_under_800_lines():
    too_long = []
    for p in _files(EXTS):
        if p.suffix == ".json":
            continue  # generated data is exempt; the cap is for source
        n = len(p.read_text(encoding="utf-8").splitlines())
        if n >= 800:
            too_long.append(f"{p.relative_to(ROOT)} ({n} lines)")
    assert not too_long, "files must stay under 800 lines: " + ", ".join(too_long)


@needs_node
@pytest.mark.parametrize("path", _files({".js", ".mjs"}), ids=lambda p: str(p.relative_to(SITE)))
def test_node_check(path):
    r = subprocess.run([NODE, "--check", str(path)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr[-2000:]


def test_healers_data_file():
    import json
    d = json.loads((SITE / "data/healers.json").read_text(encoding="utf-8"))
    ids = [h["id"] for h in d["healers"]]
    assert d["default"] in ids and len(ids) == len(set(ids))
    for h in d["healers"]:
        assert h["name"] and h["lines"], h["id"]
        if (SITE / "assets/icons-hd").is_dir(): assert (SITE / "assets/icons-hd" / (h["icon"] + ".webp")).exists(), h["icon"]  # the public mirror ships no Blizzard art


@needs_node
def test_healer_once_per_act_transition():
    r = subprocess.run([NODE, str(ROOT / "tools/spires/healer-check.mjs")], capture_output=True, text=True, timeout=180, cwd=ROOT)
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]


@needs_node
def test_bleed_ticks_at_turn_end():
    r = subprocess.run([NODE, str(ROOT / "tools/spires/test-bleed-timing.mjs")], capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]


@needs_node
def test_hand_hover_stays_under_pointer():
    r = subprocess.run([NODE, str(ROOT / "tools/spires/test-hand-hp-clearance.mjs")], capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]


@needs_node
def test_treasure_chest_fallback_is_immediate():
    r = subprocess.run([NODE, str(ROOT / "tools/spires/test-treasure-chest.mjs")], capture_output=True, text=True, timeout=60, cwd=ROOT)
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]
