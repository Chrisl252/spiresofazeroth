# Spires of Azeroth - architecture

Vanilla ES modules, no bundler, no framework, no build step. The engine has zero DOM and runs in Node (tools, tests) and the browser.
Data is JSON under `data/` (written by the data agents); the client never edits it. The contract is `SPEC.md`; this file is the module map.

## Layers

```
index.html            thin shell (site masthead/footer, <main id="app">, one module script). NO ad code.
js/main.js            boot + router (<150 lines). app = { data, meta, run, C, go(), route(), save(), cardDef(), reduced(), delay() }
js/version.js         BUILD string = cache-buster for data and module URLs
js/controller.js      gamepad & controller coordinator entrypoint wired in main.js
js/controller/*       input.js (polling/rumble), combat.js (StS console controls), nav.js (spatial UI), hud.js (prompts)
js/ui/*               one file per screen; render(app, name) -> Element. Touch only DOM + engine public functions.
js/engine/*           rules. No DOM. Deterministic given (seed, choices).
css/wow-ui.css        chrome: gold-trim frames, buttons, bars, tooltip, quality colours (CSS only)
css/game.css          screen layout (mobile-first portrait, widens at 760px). transform/opacity animations only
css/controller.css    controller focus rings, button glyphs, HUD action bar
data/*                content JSON (classes, zones, relics, potions, events, bosses, keywords, status cards)
tools/spires/         validate-data.mjs, sim.mjs, fixtures/ (fallback data)
tests/test_spires_static.py
```

## Engine modules (js/engine)

| file | concern |
|---|---|
| rng.js | mulberry32 + FNV-1a. `streamFor(seed, tag)` gives independent streams per node/shop/reward, so saves never store RNG state |
| data.js | `createData({fetchJson})` loader: wrapper shapes, sidecars (`enemiesFile`, `raidFloorsFile`), tokens, zone `units`, final bosses/summons/status cards. Lookups: `card/relic/potion/status/zone` |
| effects.js | effect DSL interpreter. Table-dispatched, one function per op. `OP_NAMES` is the single list the validator imports. `evalCond`, `resolveTargets`, `num` (scaled numbers) |
| effects-more.js | newer ops and conditions (gain_relic, upgrade_card, open_shop, start_combat, choose_one, set_flag, randomize_costs, flag_set, ...), installed by effects.js |
| status.js | status registry (`STATUS_DEFS`), apply/remove, damage modifiers, turn/round tick |
| damage.js | damage, block, heal, death resolution (revive, reincarnation, onDeath) |
| resources.js | class resources, pets, totems, traps, stances/forms/aspects, judgement |
| deck.js | card instances, piles, draw/discard/exhaust, cost rules, upgrades |
| combat.js | `startCombat`, `playCard`, turn flow (`endPlayerTurn`, `enemyPhase` generator, `finishRound`), potions, spare, `finishCombat` |
| intents.js | enemy construction, move selection (weights, cooldowns, patterns, phases, casts), `enemyAct`, `intentInfo` |
| relics.js | trigger bus: relics, zone hooks (incl. chosen `choices` mechanic), player triggers. `fireRun` for run-level triggers |
| heroic.js | Heroic I-X modifiers |
| map.js | floor graph generator; length + type budget from data/map-profiles.json (short 8 / medium 11 / full 15 floors, per zone act) |
| rewards.js | card/relic/potion/gold rolls, shop stock |
| run.js | the run state machine: `newRun`, `startSpire`, `enterNode`, `beginCombat/afterCombat`, rewards, rest/hub, shop, events, zone/raid/boss routing. UI and sim both call it |
| save.js | localStorage (try/catch + memory fallback), export/import string, meta progression |
| cardtext.js | `{damage}` style token rendering |
| sim.js | headless greedy auto-player (used by tools/spires/sim.mjs) |

Dependency direction: ui -> engine. Inside the engine, the cycles effects/status/damage/resources/relics/intents/deck are function-reference only (no module-eval-time use), which ESM allows.

## Run flow

`run.screen` is always one of: `zonepick map combat reward vendor rest hub event treasure raidchoice bosschoice mechchoice end`.
`run.pending` is a serialisable payload for that screen, so a reload resumes exactly. A reloaded mid-combat run restarts that combat deterministically (the combat RNG is `streamFor(seed, "combat:act:floor:col")`).

```
newRun -> prepareZonePick -> chooseZone -> startSpire (map, zone on_spire_start hooks, optional mechchoice)
  map -> enterNode -> fight|elite|boss -> combat -> afterCombat -> reward -> leaveNode -> map
                   -> rest | vendor | event | treasure
  boss -> raidchoice (optional dungeon floor) -> proceedAfterSpire -> hub (Moonglade, after acts 3 and 5) | zonepick
  act 6 boss -> bosschoice (data/bosses-final.json) -> victory
```

## Data shapes the engine honours

See `CONTRIBUTING.md` for how to add things. Notable: scaled numbers `{base, scale, per, max}` (divide for resources, multiply for `combo`/status scales),
class `tokens[]` and `extraResources[]`, enemy move extras (`cast`, `castTurns`, `cooldown`, `weight`, `interruptible`), `onDeath`, `spareable`,
zone `units`, `finalBoss`, `bossFloor`, raid floors with `enemyRefs`, `zoneMechanic.choices`, hooks `on_spare` / `on_combat_start` / `on_turn_end`, event `chainId/chainStep/requires.flag`.
Unknown traits, extra fields and condition-arg aliases are tolerated; unknown ops are logged by the engine and warned by the validator.

## v2 stage (stage foundation)

| file | concern |
|---|---|
| js/stage/stage.js | `mountStage(appRoot, {build, reduced}) -> stage`. #stage root: 1920x1080 design space scaled by `transform: scale()`, letterboxed; portrait phones (<=600 px wide) use 1080 x (viewport-derived) full-bleed, `stage.portrait`. Layers bottom to top: `layers.backdrop, fog, vignette, actors (#stage-actors, WebGL host), fx (#stage-fx, canvas host), ui (#stage-ui, screens)`. `stage.toStage(cx, cy)`, `onResize(fn)`, `onVisibility(fn(paused))`, `onZoneChange(fn)`, `onParallax(fn)`, `pause()/resume()` (auto on visibilitychange, also `stage:pause`/`stage:resume` events on root), `setBackdrop(zoneId, {tint})`, `setFluid(bool)`, `groundY` (feet line, 760 landscape / 1010 portrait). |
| js/stage/backdrop.js | zone art from `data/backdrops.json` (loading-screen fdid + art crop band), multi-speed parallax (sky 0.22x, midground 0.70x, foreground 1.0x), sky gradient layer (`.sp-bd-sky`), midground vista horizon mask, drives the fog loop (30 fps, paused when hidden or reduced motion). |
| js/stage/zonePalette.js | 11 biomes (`forest, snow, desert, swamp, graveyard, volcanic, mountains, jungle, cavern, plains, coastal`) and atmospheric lighting + terrain metadata for all 40 zones. `getZoneVisuals(zoneId)`. |
| js/stage/ground3d.js | Real 3D arena ground terrain disc in Three.js (2800x2400 subdivided mesh at y:700-760). Receives live 3D character shadows, procedural tileable biome textures (albedo + bump + emissive), gentle natural outer elevation, and feathered radial edge fade into the midground vista. |
| js/stage/fog.js | low-res additive fog + dust canvas, tinted from the zone `theme` and sky atmosphere. |
| css/stage.css | stage + layers, letterbox, `@font-face` frizqt/morpheus/arialn/skurri, type scale vars, `.sp-wowbtn` nine-slice red button, title screen, 40 px masthead strip (`body.sp-stage-on`), multi-layer sky and vista horizon depth mask. |
| data/backdrops.json | generated by `tools/spires/build-backdrops.py` (zone picks are by eye: the datamine `map` table only knows continents). Keys: every zone id + `title classSelect map default`. |
| tools/spires/dev-server.mjs, shot.mjs | static server on :8766 (maps /assets/icons loading-screens fonts ui vendor wowdex to the site assets); CDP screenshot with real device metrics. |

Screens render into `app.root` (= `stage.layers.ui`); `app.stage` is available everywhere. A screen module that exports `stageNative = true` gets the scaled design space; any other (legacy) screen is rendered in fluid mode (unscaled, scrollable) over the zone backdrop until it is rebuilt.

## v2 actors (3D actors layer)

| file | concern |
|---|---|
| js/stage/actors3d.js | `createActors(hostEl, {designW,designH,lanes,theme,frontYaw,forcePlate,groundY,zone}) -> actors`. One transparent WebGL canvas (ortho 12 deg pitch camera, 1 world unit = 1 stage px; PCF soft shadows, key warm upper-left, cool rim, hemisphere, 3D ground disc with live shadows). API: `ready` (await before setHero/setEnemies), `setHero({classId})`, `setEnemies([{uid,id,name,tier,icon}])`, `setZone(zoneId)`, `setParallax(px,py)`, `setGround(y)`, `ground`, `remove(uid)`, `lunge(uid,targetUid,{onImpact,gap,hold})`, `hit(uid,{amount})`, `block(uid)`, `death(uid)`, `statusPulse(uid,color)`, `highlight(uid,on)`, `hover(uid,on)`, `anchor(uid) -> {x,y,chest,feet,top}`, `setTheme`, `pause/resume`, `stats()`, `dispose()`. Hero uid is `"player"`. GLB bytes cached (LRU 16), parsed per instance (no SkeletonUtils vendored), per-fight budget 6 distinct models, rAF only while tweening/animated (idle ~30 fps), pauses on hidden tab / offscreen. |
| js/stage/ground3d.js | Procedural 3D ground plane / terrain mesh (grass, snow, desert, marsh, volcanic stone) under actors in WebGL, receives live character shadows and updates per biome. |
| js/stage/petStage.js | `createPetStage({A, region, C}) -> pets`. Syncs Hunter Guardian pet model to the 3D stage and mounts companion health bar. |
| js/stage/totemStage.js | `createTotemStage({A, region, C}) -> totems`. Syncs Shaman active totems (earth, fire, water, air) to 3D stage using authentic Blizzard models with contact shadows. |
| js/stage/actorFallback.js | plate actor (zone-tinted silhouette quadruped/biped/flyer/blob + icon frame). It is also the SHELL of every actor: owns motion, ground marks (contact shadow + targetable ring DOM under the canvas) and anchors; a 3D skin attaches to it when the GLB loads. |
| js/stage/actorMotion.js | renderer-agnostic tween scheduler + choreography (lunge 120/160/hold/240, hit flash + 26 px knockback + 2-frame hit-stop, block gold, death tip 12 deg + sink 40 + 600 ms fade + dust). Both renderers read the same state. |
| tools/spires/map-models.mjs | manifest -> `data/models.json` (+ `models.MISSING.md`). Order: exact name, npcId, family/type keyword (mount/battle_pet/npc), humanoid type -> playable-race body, else null. Keys: enemy id and `hero:<classId>`. Run: `node tools/spires/map-models.mjs <models-manifest.json>`. |
| data/models.json, data/models.MISSING.md | generated; MISSING feeds the creature-bake lane. |
| dev/actors.html | harness: hero + 3 enemies, button per choreography. Params `zone cls e=id,id plate=1 pose=ring|hit|lunge heroes=1 trace nobar yaw`. |

Models face +X natively; hero yaw = -frontYaw (faces right, 3/4 to camera), enemies = 180+frontYaw. Character bodies ship an untextured skin material: tinted by `rec.skin` (per race); other untextured meshes are hidden, a GLB with no textured mesh falls back to the plate.

### Classic-bake tier (actors3d resolution order)

Per actor, first model that loads and has a textured mesh wins; a bad GLB logs once and falls to the next tier, the plate is last: (1) `assets/models/index.json` enemies[id] / byName[name] (also accepts the flat npcId-keyed proof shape) -> `assets/models/<glb>`; heroes[classId] or `hero-<classId>.glb`; (2) `data/models.json` retail match; (3) plate. index.json is optional/partial. Clips: `idle` loops, `attack` is played inside `lunge()` (90 ms in, the tween still moves the body), `death` is played inside `death()` (then dust + 450 ms fade); absent clips fall back to the procedural tweens. Classic meshes are set DoubleSide (baked meshes arrive mirrored and were culled). `classicYaw` option adjusts facing if needed. map-models.mjs never uses mounts (saddles), worgen, Big Bad Wolf or Cinder/Spectral variants for wild creatures; `models.json` now has `npcId`.

## v2 fx (VFX kit: flipbooks + particles + choreography)

Canvas-2D layer inside `stage.layers.fx`; one rAF loop (idle = stopped, hidden tab = paused). Sheets are Cinderwake/Emberdeck luminance+alpha flipbooks, tinted per element at runtime. Wire: `const fx = createFx(stage.layers.fx, {reducedMotion}); fx.anchorFn = actors.anchor;` then `await fx.play(card | "fire:attack" | "enemy:claw", {from, to, amount, onImpact})` (`onImpact` = apply damage + actor hit reaction there). Also `fx.numbers.damage|block|heal|blocked(pos, n)`, `fx.banner("Your turn")`, `fx.kick(px)`, `fx.flash(pos)`, `fx.speed` (settings "fast"), `fx.reduced`, `fx.aura(key,pos,color)` / `fx.clearAura(key)`.

| file | concern |
|---|---|
| tools/spires/fx-import.mjs | Cinderwake `assets/fx/*.png` -> `assets/fx/*.webp` (q92, Pillow) + `index.json` (origin line). Also clips the sources' 1-6/255 alpha floor and fades each frame's outer 12% (additive layering showed a hard-edged box otherwise). Re-run is idempotent. |
| js/fx/sheets.js | index loader, `createImageBitmap` decode, tinted-variant cache (multiply + hot add-back), flipbook player (fps + `hold_peak`, frame cross-fade, additive = `lighter`). |
| js/fx/particles.js | pooled SoA particle system over the `particles.png` atlas; `burst/ring/trail/fountain/drift`; seeded mulberry32; half count when reduced. |
| js/fx/numbers.js | floating numbers, turn banner, screen kick (CSS `translate` on `#stage`, composes with its scale), white hit flash. DOM + WAAPI. |
| js/fx/elements.js | palettes (11 elements), `elementFor(card)` (damage school > icon prefix > ability_<class> > class default), `kindFor(card)`. |
| js/fx/choreo.js | recipe table (element x attack/skill/power/heal + enemy claw/bite/steel/spit/slam), projectile, aura, `createFx`. |
| dev/fx.html | test plate (port 8768 static server): a button per element x kind, enemy attacks, banner, big hit, stress (20 impacts / 2 s). `window.__fx` for CDP. |

Add an element = one `PALETTE` row + one `IMPACT[el]` function (+ optional `PROJ[el]`); no other file changes.

## v2 screens (map and non-combat)

All stage-native (`export const stageNative = true`, 1920x1080 design space; `.sp-portrait` overrides for phones). Shared kit and CSS are injected from JS (`cssReady` in `js/ui/kit.js` loads `css/screens.css` + `css/map.css`), so `index.html` is untouched.

- `js/ui/kit.js`: wood/parchment panels, `btn`, `tog`, `ico`, `banner`, `plate`, `cardSlot` (fixed 260x380 box scaled by `--cs`, so card restyles do not break layouts), `coin`, `stageModal`, `zoneArt`.
- `js/ui/runbar.js`: top bar (class, HP, gold, act/floor, relics, potions, Deck).
- `js/ui/map.js` + `mapPath.js` + `css/map.css`: vertical spire on a parchment sheet, dotted canvas paths, ringed WoW icons, boss plate. `NODE_ICON`, `enterNode`, `reachableNodes` unchanged.
- `js/ui/campfire.js`: flame flipbook + embers canvas for rest/hub.
- Screens: `classSelect`, `choice` (zonepick, raid/boss/mech), `reward` (+treasure), `shop` (`shopPanel` reused by the Moonglade hub in `rest.js`), `rest`, `event`, `runEnd`, `codex`, `settings`.
- Model hosts for the actors agent: `#shop-vendor` (420x520) and `#end-hero` (520x600) hold icon plates until a model is mounted.
- Tools: `tools/spires/screens-shot.mjs <outDir> [name,name] [1920|390]` (all scenarios), `screens-play.mjs` (real-click run to the end screen).

## v2 cards / hud (cards, hand, combat HUD)

All stage px (260x380 card, `.spc-mini` = 130x190). Cards never reach into the engine; combat.js is the only glue.

| file | concern |
|---|---|
| js/ui/card.js | `cardEl(def, {C, inst, cost, data, color, mini, tag, cls, onClick, tips})` (re-exported by dom.js, so legacy call sites keep working), `refreshCard`, `keywordLines`, `cardTextHtml`, `classColor`, `sharpIcon`. Art = blurred saturated copy of the icon + canvas-upscaled, unsharp-masked copy (the WoW icon is 64 px with a 4 px baked bevel that is cropped) fading into it under a class-colour gradient. Frames are layered gradients: basic iron, common bronze, uncommon silver, rare gold, epic violet. `data-inst` = inst uid. States: `is-hover is-sel is-nope is-aim is-drag burn`. |
| js/ui/hand.js | `createHand(host, {onPlay, canPlay, needsTarget, stage, render?, refresh?, keywords?, color?, onDeny?, heroAnchor?, drawAnchor?, discardAnchor?, defaultTarget?}) -> {set, draw, discard, exhaust, lock, select, cancel, anchorOf, elOf, selected, destroy}`. Fan +-14 deg, hover lift 60 + scale 1.18 with neighbours parting, drag (targeted: dashed bezier arrow on an overlay canvas, release on a `[data-uid]` element; untargeted: release above the hand line), click/tap select, touch 2-step (tap enemy = ring, tap again = play), keys 1-9 / Enter / Esc. `set(insts)` reconciles by uid: new cards fly from the draw pile (40 ms stagger), vanished ones ghost into the hero unless `discard`/`exhaust` handled them first. |
| js/ui/hud.js | `createHud(host, app, {stage, anchorFor?, onEndTurn, onPile, onPotion, onEnemyClick, onSpare, onMap, onSettings}) -> {update(C, view), setTurn(who), enemyPlateEl(uid), heroEl, heroPoint(), pileAnchors(), orbEl}`. Top bar, enemy plates (`.sp-eplate[data-uid]`: intent, name, HP, block badge, status pips, plus a `.sp-ehit` drop zone down to the feet), hero floor plate, energy orb (colour by class resource), pile buttons, End Turn, turn banner. `anchorFor(uid) -> {x, y}` is the HEAD-TOP point of that actor; default = lane x 1180/1420/1660, y = groundY - 340 (portrait: row at x 410-950). |
| js/ui/combat.js | stage-native; mounts hud + hand, `syncHand()` diffs `C.pile.hand` into `set/discard/exhaust`, `playFx()` is the unchanged fx seam (drains `C.fx`, legacy floatText on the `[data-uid]` host), scry/pick panel (`.sp-pending`), pile modal, suspends `WGFKeybinds` (site keybinds own Esc + digits) while mounted. |
| css/cards.css, css/hud.css | styles; also restates the wow-ui variables for body-level modal/toast/tip. |
| dev/cards.html | gallery: one card per rarity per class + upgraded + minis (`?c=warrior,mage`). |

Add a card look = a `.spc--r-*` or `.spc--t-*` rule; add an intent glyph = one branch in `hud.js intentView`. The actors/fx agent plugs real anchors via `createHud(..., {anchorFor})` and listens at the `playFx` seam; hand flights use `hud.pileAnchors()`.

## v2 models (bake lane)
- `assets/models/index.json` is the contract: `displays{displayId:{glb,bytes,clips[idle|attack|death],model,name,scale}}`, `heroes{hero-<class>}`, `enemies{enemyId:displayId}`, `byName`, `missing[]` (no model: use the 2D icon), `broken[]` (baked but renders invisible/black: use the icon). GLBs are `assets/models/<displayId>.glb` and `hero-<class>.glb`; several enemies share a display. Apply `scale` at runtime; bind pose faces +X.
- Build-time only (the page never calls Wowhead): `tools/spires/roster-displays.py` (names / ingest / resolve), `tools/spires/wowhead_browser_runner.js`, `tools/spires/hero-skins.py`, `dev/bake_roster.py` (bake), `tools/spires/build-index.py` (index). Cache: `data/roster-displays.json`. QA: `dev/bake-check.html` + `dev/static.mjs`. Full recipe and run log: `docs/MODEL_BAKE_LANE.md`.

## v2 integration (combat sequencing: who awaits what)

| file | concern |
|---|---|
| js/ui/combat.js | turn sequencing + engine calls. Owns `st.busy` (hand lock) and the flows `doPlay` / `usePotionFlow` / `endTurnFlow`. Boots the kit in the background (`st.booting` blocks input, 9 s cap, falls back to plates + legacy numbers). |
| js/ui/combatKit.js | `getKit(app)` mounts the shared actors3d (`stage.layers.actors`) + choreo fx (`stage.layers.fx`) ONCE, reused across fights/shop/end (`app.kit`); dynamic import in try/catch so no WebGL = plate combat. `applySettings` (speed slow/normal/fast -> `fx.speed` + `actors.setSpeed`, reduced -> `fx.reduced`), `safe(promise, label, 3000)` (resolves + logs ONCE on stall), `watchLeave` (screens have no dispose hook), `mountPortrait` (shop merchant / run-end hero via the shared actors, `has-model` class hides the icon stand-in). |
| js/ui/combatDirector.js | the choreography. Engine state is applied synchronously, so the director keeps a DISPLAY OVERLAY (`disp`: uid -> hp/block) that is passed to `hud.update` and releases each change at the IMPACT INSTANT. |

Contract (engine step first, animation after, state shown at impact):
1. Caller takes `snap()` (hp/block/status of player + enemies), clears `C.fx`, runs the engine call (`playCard`, `enemyPhase.next()`, `endPlayerTurn`, `finishRound`, `usePotion`), then splices `C.fx` into `evs`.
2. `beginHold(pre)`: the HUD is repainted from the overlay (energy and pile counts are live, HP/block are held at `pre`).
3. Attacks (`strike`): `actors.lunge(src, target)` and `fx.play(card | "enemy:<recipe>", {fromUid,toUid,amount,onImpact})` start together; melee recipes are delayed by a per-element lead (steel 110 ms, enemy claw 160 / bite 120 / steel 160 / slam 80) so the recipe impact lands as the lunge connects; ranged use a 70 px cast hop. **`fx.play` onImpact is the single impact instant**: there the director subtracts that hit from the overlay, shows `fx.numbers.damage/blocked` at the target chest, calls `actors.hit/block`, repaints the HUD (HP bar moves). `fx.hitStop` + `fx.kick` come from the recipe's own impact. Multi-hit = one `fx.play` per hit, 130 ms stagger per target; AoE = 60 ms stagger per target; more than 8 hits are merged into the 8th. The side effects (block, heal, status pulse, "Miss") of the same card release at the FIRST impact.
4. Non-attack cards: `fx.play(card, {toUid})` (skill at target or hero, power = persistent aura keyed by card id, heal = `<element>:heal`); `onImpact` releases the side effects; status diffs vs `pre` give `actors.statusPulse` + a name glyph.
5. Enemy intents without damage: `actors.block` / `statusPulse`, 320 ms beat, then release.
6. Deaths: after the last impact `actors.death(uid)` (staggered 80 ms), awaited; the plate hides as soon as the shown HP reaches 0. `conclude()` only runs when `st.busy` is false, so victory waits for the last death; defeat plays `actors.death("player")` first.
7. `end()` always clears the overlay and repaints the authoritative state (self-correcting if an animation was cut short).
Awaits: every step is wrapped in `safe()` (3 s default; card 6 s, enemy 7 s, strike 4.5 s) so a hidden tab / stalled rAF can never deadlock; `hand.lock` follows `playerTurn()` (busy/booting/phase/pending). Hidden tab: stage `stage:pause`/`resume` -> `actors.pause/resume`; `fx` stops its own loop on `document.hidden`.
Banners: `fx.banner("Enemy turn" | "Your turn")` replaces the DOM banner (`.sp-actors-on .sp-turnbanner {display:none}`); HUD targetable rings are hidden under `.sp-actors-on` (actors draw their own; `highlight` is synced from the plate classes by a MutationObserver, `hover` from pointerover).
Small edits to other modules (backups in `backups/*-integ`): `actorMotion.js` exports `motionScale` (combat speed), `actors3d.js` gains `addEnemy` (summons), `setSpeed`, `death(uid, {keep})`; `hud.js` honours `view.lock` for End Turn; `index.html` ships the three.js importmap; `hud.css`/`screens.css` get `.sp-actors-on` / `.has-model` rules.
QA: `node tools/spires/combat-drive.mjs '{"cls":"warrior","zone":"elwynn","shots":["lunge","death"],"slow":0.4,"shotDir":"..."}'` plays a real fight with real mouse events (fresh headless Chrome, swiftshader) and reports console errors + frame times.

## Map rework 2026-10-17 (StS style; supersedes the map.js row and the map line in "v2 screens")
- `js/engine/map.js`: ONE start node (`map.start`, id `start`, floor -1, the zone inn from `zone.start = {name, icon}`) at the bottom centre, then 15 floors on 3 lanes. `floors[f]` holds only the LIVE nodes (index == `col`, so `enterNode(run,data,col)` / `nextNodes` are unchanged); `n.lane` 0..2 is the horizontal slot, `n.x = lane/2`. 2-3 live lanes per floor (floor 13 pre-boss rest and the boss are single, lane 1). Edges join lanes at most 1 apart, never cross (so a click target is never ambiguous), every node has a parent and a child, fan-out <= 2, 40% extra edges make forks and merges. Types: same weighted table and elite/vendor/rest minimums as before; a fork's siblings are forced to differ in type so a choice means something. Deterministic from (seed, tag). New export `startNode(map)`.
- `run.spire.path` = ids of nodes entered this spire (pushed in `enterNode`); the map UI uses it so "visited" = your taken path only (old saves fall back to walking back along first parents).
- `data/zones/<zone>.json` gained `start: {name, icon}` (40 zones; real classic inns/camps).
- `js/ui/map.js` (layout, plates, keys 1/2/3 = reachable lanes left to right), `js/ui/mapPath.js` (hand-inked wobbly dashed lanes: walked red-brown, live bold dark, dead faint, hover lights the whole path ahead), `css/map.css` (plates sized by `--P`/`--PB` set on the sheet: 152/250 stage px desktop, 190/300 portrait; reachable = gold ring + pulse, unreachable = opacity .45 desaturated, visited = ink stamp ring).
- QA scenarios: `tools/spires/screens-shot.mjs <dir> mapstart,map,maphover,maptwo [1920|390]`.
Layout (integration pass 2, StS2): landscape ground band y=700 (`stage.js` LANDSCAPE_GROUND_Y), hero x480, enemies x1150/1400/1650 (`lanesFor` in combatKit.js), enemy height capped so the head stays below y300 (actors3d). Plates (`hud.js` mkPlate/placePlate/reposition): intent ABOVE the head, name + HP + status pips UNDER the feet; plate width shrinks to lane spacing and plates are nudged apart so none overlap; duplicate names get A/B suffixes. Hand (`hand.js` layout): tucked, rest top edge at 83% of stage height; hover lifts fully. Controls: End Turn 230x64 above the hand line bottom-right, piles ~90 px in the bottom corners, energy orb above the draw pile. Intent = bare ability icon + ONE number (white; red when lethal or Vulnerable), built fresh per update. Targeting: drag a targeted card, it trails the pointer, the arrow turns red over an enemy (plate column grown by 80 px, `enemyAt`), `.is-target` -> red ground ring (`actors.highlight(uid,on,red)`). Fullscreen: `stage.toggleFullscreen` (button + F key) puts the stage HOST in fullscreen, so the masthead/cookie bar are not drawn. Buttons: `.sp-wowbtn` is pure CSS (stage.css). Class resource tooltips come from `data/classes/*.json` `resource.tip`.

## Immunities + schools (v2)
- `js/engine/immunity.js`: pure lookups (`resolveImmunity`, `immuneToSchool`, `immuneToStatus`, `resistMult`, `immuneList`, `cardUselessOn`). Data: `data/schools.json` (build: `tools/spires/build-schools.py`), `data/immunities.json`. Loaded by `data.js` (`d.schoolsData`, `d.immunities`, stamps `card.school`).
- Hooks (one each): `intents.buildEnemy` (e.immune/e.resist), `damage.dealDamage` (school immune/resist callouts), `status.applyStatus` (status immunity by school) + `modifyTaken` (resist mult), `effects` apply op (passes card school), `rewards.rollCardChoices` (dead-card reroll), `hud.js immuneRow`, `hand.js setEnemyMark` (Immune tag), `numbers.immune/resist`. Proof shot: `node tools/spires/immune-shot.mjs <dir>`.

## Gear (GEAR_SPEC)
- `js/engine/gear.js`: relics ARE gear. `run.gear` = slot->id mirror (16 paper-doll slots); `run.relics` still lists owned ids; set bonuses are synthetic relics `set:<set>:<n>`. `dropGear` (called by `afterCombat`), `equip`, `setInfo`, `ensureGear` (old-save migration), `slotOf` (classifies zone relics; twin of `jslot()` in tools/spires/build-gear.py).
- `data/gear/<class>.json` (8 set pieces + weapon + 4 bonuses), `jewellery.json` (the relic pool), `legacy-map.json`. Authored in tools/spires/gear_tables.py, built by build-gear.py (cache: gear-source.json).
- `js/ui/gearStrip.js` (16-socket strip + set badge; ONE call site `gearStrip(app)` in runbar.js; hud.js should call the same), `js/ui/loot.js` (chest + burst + item plate, run from reward.js), `js/stage/chest3d.js` (own WebGL canvas), `js/audio.js` (sfx + mute), `css/gear.css`, `assets/models/chest-*.glb`, `assets/sfx/*`.

## Event screen (v2, StS2 style)

| file | concern |
|---|---|
| js/ui/event.js | screen: parchment dialogue panel (typewriter 18 ms/char, click/Space finishes, reduced motion = instant), option rows, keys 1-9, outcome diff + Continue. `run.pending.result.sum` stores the resolved text so a reload keeps it |
| js/ui/eventChips.js | pure view-model: effects -> coloured chips (red HP, yellow gold, green heal, blue card/relic, purple "?"), row icon by consequence, title with the parenthetical stripped |
| js/ui/eventScene.js | left 45%: baked NPC via `mountPortrait` (a `heroes["npc-<slug>"]` entry in `assets/models/index.json`, so it faces the panel) or an illustrated plate (poster / hanging sign / gold frame over a zone-art disc); resolution fx (red flash + number, coin burst, heal motes) through `getKit(app).fx`, skipped when reduced |

Data: any event (common or zone) may carry `npc: { name, npcId?, displayId?, model?, scale? }`. `model` names a different baked body (e.g. Steamwheedle Merchant wears "Gaxim Rustfizzle"). The slug is `npc-` + lowercase(model || name). No baked body => plate fallback (validate-data lists it as INFO). New speaker = Wowhead classic npc page -> displayId, then `roster-displays.py resolve` + `dev/bake_roster.py` (output keyed by displayId) and add `displays[id]`, `byName[name]`, `heroes[slug]` to index.json. Plate kind comes from the event name (`plateKind`), no data field.
| js/engine/healer.js | act-transition healer: `healerFor(data, act)`, `enterHealer(run, data)` (heals half the missing HP once per act via `run.healerAct`, sets screen "healer"); called from `proceedAfterSpire` in run.js. |
| js/ui/healer.js (+ css/healer.css, data/healers.json) | the healer scene (screen "healer" in main.js SCREENS): portrait card from an existing icon, dialogue, heal fx via `playOutcome`, Continue (Enter/Space). |

## Controller subsystem (js/controller)

| file | concern |
|---|---|
| js/controller.js | Coordinator entrypoint: wired in `main.js`, handles action dispatching and screen change sync |
| js/controller/input.js | Hardware Gamepad API polling, deadzones, button debounce, auto-repeat timers, haptic rumble |
| js/controller/combat.js | Slay the Spire-style console combat scheme: hand navigation, keyword inspect, enemy aiming, potion belt, end turn |
| js/controller/nav.js | Universal 2D spatial UI navigation, Spire map node selection, modal dialog handling |
| js/controller/hud.js | Dynamic on-screen controller button prompts bar and glyph rendering |
| css/controller.css | Golden glowing focus ring animation, Xbox/PS/Nintendo button glyphs, HUD action bar |
