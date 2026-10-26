# Character create (race x gender x class) - build notes 2026-10-25

Flow: title "Choose class" -> js/ui/charSelect.js (list) -> js/ui/charCreate.js (create) -> Accept saves to meta.characters -> list -> Enter World -> js/ui/runStart.js beginRun. "Class details" opens the old classSelect with the character.
Data: data/charcreate.json + charcreate-names.json built by tools/spires/build-charcreate.py from the real client tables (wago.tools, build 2.5.6.70006: GlobalStrings, CharBaseInfo matrix, NameGen).
Models: assets/models/race/<race>-<gender>.glb (20), datamined bodies from assets/wowdex/models/characters/body; tools/spires/bake-race-undies.py paints the client naked-underwear overlays onto each skin and binds the head to the face atlas.
Persistence: run.character {id,race,gender,name,looks}; meta.characters[]; old saves default via characterOf() in main.js resume (class default race, male, no name).
Missing / blocked: customization rows disabled (single baked look per body); no Eversong/Azuremyst backdrops (generic art used); in-combat hero model not swapped (bodies static, ungeared, no clips); racial spell-name tooltips from Wowpedia knowledge; no faction ribbon art (crest + CSS band); gender buttons text; face texture on bodies is approximate; GLBs are uncommitted (never deploy from git archive).
Proposed (not applied): patchNotes.js entry + version stamp.

## Head fix (follow-up, 2026-10-25)
Root cause: the old bake kept only submesh ids 0 and x01 (default_geosets). In the retail HD player models the face is Face Shape geoset 32xx, hair is geoset type 0 ids 2+, ears 7xx, iris surface 3301 (own type-19 texture), so heads were hollow shells with floating eyes.
Fix: `tools/spires/bake-race-heads.py` (plan / fetch / build) reads the client's own ChrCustomization* tables (wago DB2, retail 12.0.7.68974) for each race/gender's default choices (first Face Shape, first non-bald Hair Style, Hair Color 0 texture, Eye Color 0 texture), rebuilds all 20 GLBs from the retail M2 with those geosets, bakes the Stand animation frame 0 (opens the female eyelids that the bind pose leaves closed, drops the T-pose), and keeps the underwear atlas (`bake-race-undies.py paint_underwear`).
Viewer: `closeup(true)` frames the head from the eye mesh; stale model loads no longer flag "Model unavailable".
Imperfect: one fixed default hair/face per race/gender (no customization); tauren/troll/orc tusks and horns are the default-choice geosets only (no ChrCustomizationSkinnedModel extras); retail models are slightly higher poly than the old bodies (146-304 KB each).
Deploy: all 20 assets/models/race/*.glb changed (uncommitted); do not deploy from git archive.

## Arm regression fix (2026-10-25)
The head rebake dropped geoset id 0 (the base body: torso, shoulders, upper arms) because the head plan marks geoset group 0 as covered by hair (hair is geoset type 0, ids 1+). bake-race-heads.py now always adds id 0. Stand-pose baking was NOT the cause and is kept. Viewer idle sweep reduced from +-0.55 to +-0.3 rad, starting dead front.
