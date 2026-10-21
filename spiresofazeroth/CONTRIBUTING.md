# Contributing to Spires of Azeroth

Rule of thumb: a new feature is a new module wired by ONE registration line. Any file nearing ~800 lines gets split now (the test suite fails at 800).

## Add an effect op
1. Write one function in `js/engine/effects-more.js` inside `installMoreOps` (or a new `effects-<topic>.js` exporting an installer, called once at the bottom of `effects.js`): `op("my_op", (ctx, e) => {...})`.
2. `ctx.C` is null in run mode (events/rest/pickup): guard with `if (!ctx.C)` and use `ctx.run`.
3. The validator picks the op up automatically (`OP_NAMES`). Run `node tools/spires/validate-data.mjs`.

## Add a condition
Add a `case` to `extraCond` in `effects-more.js` (or `evalCond` in `effects.js` if it is core).

## Add a status
1. Append `{id, name, icon, kind, stackMode, text}` to `data/keywords.json` (icon must exist in `/assets/icons`).
2. Add an entry to `STATUS_DEFS` in `js/engine/status.js` (`mode: "duration" | "intensity"`, `kind`), then the behaviour in the hook that reads it (damage modifiers in `modifyDealt/modifyTaken`, ticks in `turnEnd/roundEnd`).

## Add a class, zone, relic, potion, event
Data only; the loader needs no code change.
- class: `data/classes/<id>.json` + add the id to `data/classes/index.json`. 40+ cards, 10 starters, `tokens[]` for generated cards.
- zone: `data/zones/<id>.json` (+ `<id>.enemies.json`, `<id>.raids.json` sidecars) + a row in `data/zones/index.json`. Enemy ids are per-zone; the codex keys them as `zone:id`.
- Then run the validator. It lists FAIL (blocking), WARN (unsupported shapes, tolerated) and INFO.

## Add a screen
1. `js/ui/<name>.js` exporting `render(app, name) -> Element`.
2. One line in the `SCREENS` map in `js/main.js` (screen name -> module).
3. Build DOM with `h()` from `ui/dom.js`. Icons via `icon(slug)` (`/assets/icons/<slug>.jpg`). Animate with CSS transform/opacity only; honour `app.reduced()`.

## Add a run-state step
Put the rule in `js/engine/run.js` (or a new engine module it calls), never in a UI file, so `tools/spires/sim.mjs` exercises it.

## Verify before you commit
```
node tools/spires/validate-data.mjs
node tools/spires/sim.mjs --class warrior --runs 50 --seed 7
python -m pytest tests/test_spires_static.py -q
```
Bump `js/version.js` BUILD and the `?v=` strings in `index.html` when you change shipped files (cache-buster).
Do not add ad scripts, third-party trackers or font files. Analytics are only the guarded `gtag` events in `ui/dom.js` `track()`.
