r"""export-public.py - build the public open-source mirror of Spires of Azeroth (github.com/Chrisl252/spires-of-azeroth).

  python tools/spires/export-public.py <out_dir>

What goes out: the game (spiresofazeroth/: index.html, css, js, data, the design docs, README, LICENSE, CONTRIBUTING), the JSON
indexes under spiresofazeroth/assets (model / fx / sound tables: data, not art), the dev + test + authoring tools under
tools/spires that run from the repo alone, and tests/test_spires_static.py. Root README.md, LICENSE and .gitignore are generated.
What never goes out: Blizzard-derived binaries (models, sounds, icons, UI textures, fonts, the OG image), the bake / deploy /
Cloudflare / sound-library tooling, internal lane docs (MODEL_BAKE_LANE, the Reddit draft, SEO notes, dev/ manifests), and any
Windows / WSL / production path, which is scrubbed from the docs that mention one. Secrets never lived in these files (config/*.env
is outside the tree); re-run `grep -rniE "api[_-]?key|secret|passw|smtp|private key"` on <out_dir> before pushing if in doubt.
"""
import os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
GAME = "spiresofazeroth"

GAME_DIRS = ["css", "js", "data", "tools", "docs/v2-cards", "docs/v2-fx"]
GAME_FILES = ["index.html", "README.md", "LICENSE", "CONTRIBUTING.md", "ARCHITECTURE.md", "SPEC.md", "VISUAL_SPEC.md", "GEAR_SPEC.md"]
TOOLS = ["dev-server.mjs", "validate-data.mjs", "sim.mjs", "act-sim.mjs", "combat-drive.mjs", "arrow-drive.mjs", "screens-shot.mjs",
         "fit-check.mjs", "shot.mjs", "map-check.mjs", "healer-check.mjs", "build-talents.py", "build-schools.py", "model-species-fix.py", "export-public.py"]
TESTS = ["tests/test_spires_static.py"]
TEXT_EXT = {".md", ".js", ".mjs", ".py", ".json", ".html", ".css", ".txt", ""}

SCRUB = [
    (re.compile(r"[A-Za-z]:\\[^\s`'\"\)\]]+"), "<local path>"),
    (re.compile(r"[A-Za-z]:/[^\s`'\"\)\]]+"), "<local path>"),
    (re.compile(r"\\\\\\\\wsl[^\s`'\"\)\]]*|//wsl\$[^\s`'\"\)\]]*"), "<wsl path>"),
    (re.compile(r"/srv/wgf[^\s`'\"\)\]]*"), "<production path>"),
    (re.compile(r"\bCAPTAIN\b"), "the host PC"),
]

def scrub_text(s, rel):
    if rel.endswith((".md", ".py", ".mjs", ".js")) and "Program Files" not in s:
        for rx, rep in SCRUB: s = rx.sub(rep, s)
    return s

def scrub_json(o):
    if isinstance(o, dict): return {k: scrub_json(v) for k, v in o.items()}
    if isinstance(o, list): return [scrub_json(v) for v in o]
    if isinstance(o, str):
        for rx, rep in SCRUB: o = rx.sub(rep, o)
    return o

def copy_json_scrubbed(src, dst):
    import json
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, encoding="utf-8-sig") as f: data = json.load(f)
    with open(dst, "w", encoding="utf-8", newline="\n") as f: json.dump(scrub_json(data), f, separators=(",", ":"), ensure_ascii=False)

def copy_file(src, dst, rel):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ext = os.path.splitext(src)[1].lower()
    if ext in TEXT_EXT:
        raw = open(src, "rb").read()
        try: s = raw.decode("utf-8-sig")
        except UnicodeDecodeError: s = raw.decode("cp1252", errors="replace")  # a few hand-written docs carry cp1252 bullets
        with open(dst, "w", encoding="utf-8", newline="\n") as f: f.write(scrub_text(s, rel))
    else:
        shutil.copy2(src, dst)

def main(out):
    out = os.path.abspath(out)
    if os.path.isdir(out):
        for n in os.listdir(out):
            if n == ".git": continue
            p = os.path.join(out, n); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    n = 0
    for d in GAME_DIRS:
        for dp, _, fs in os.walk(os.path.join(REPO, GAME, d)):
            for fn in fs:
                src = os.path.join(dp, fn); rel = os.path.relpath(src, REPO)
                copy_file(src, os.path.join(out, rel), rel); n += 1
    for fn in GAME_FILES:
        rel = f"{GAME}/{fn}"; copy_file(os.path.join(REPO, rel), os.path.join(out, rel), rel); n += 1
    for dp, _, fs in os.walk(os.path.join(REPO, GAME, "assets")):  # JSON tables only, never the art, never the bake logs
        for fn in fs:
            if fn.endswith(".json") and not fn.startswith("bake-"):
                src = os.path.join(dp, fn); rel = os.path.relpath(src, REPO); copy_json_scrubbed(src, os.path.join(out, rel)); n += 1
    for fn in TOOLS:
        rel = f"tools/spires/{fn}"; copy_file(os.path.join(REPO, rel), os.path.join(out, rel), rel); n += 1
    for rel in TESTS:
        copy_file(os.path.join(REPO, rel), os.path.join(out, rel), rel); n += 1
    # root files
    with open(os.path.join(REPO, GAME, "README.md"), encoding="utf-8") as f: readme = f.read()
    readme = readme.replace("## 🛠️ Running Locally", "## 📁 Layout\n\n- `spiresofazeroth/` is the game (static ES modules, no build step): `js/engine` rules (DOM-free, the headless sim runs them), `js/ui` screens, `js/stage` the Three.js stage, `data/` every card, class, zone, enemy, relic, potion, talent and unlock table as JSON.\n- `tools/spires/` dev server, data validator, headless simulators, real-input browser drivers and the authoring scripts.\n- `tests/test_spires_static.py` the static gate (file-size limits, data validation).\n\n## 🛠️ Running Locally", 1)
    with open(os.path.join(out, "README.md"), "w", encoding="utf-8", newline="\n") as f: f.write(readme)
    shutil.copy2(os.path.join(REPO, GAME, "LICENSE"), os.path.join(out, "LICENSE"))
    with open(os.path.join(out, ".gitignore"), "w", encoding="utf-8", newline="\n") as f:
        f.write("# Blizzard-derived art and audio never enter this repository; the dev server fetches them from thewowdb.com\n"
                "spiresofazeroth/assets/**\n!spiresofazeroth/assets/**/\n!spiresofazeroth/assets/**/*.json\n"
                "__pycache__/\n.pytest_cache/\nnode_modules/\nshots/\n*.tar\n")
    print(f"exported {n} files -> {out}")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1])
