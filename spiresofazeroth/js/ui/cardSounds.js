// Card / enemy / UI sounds from the thewowdb library (data/sounds/cards.json, ui.json, built by tools/spires/sound-map.py).
// Loaded lazily after first paint; every call is a silent no-op until the JSON is in. Honours sfx.muted (Settings -> Sound effects).
//   cast(def) at the card-ghost moment, impact(def) at the fx impact instant, enemy(kind, "cast"|"impact"), ui(name), preload(deckIds, classId)
import { sfx } from "../audio.js?v=20261029d";

const BASE = new URL("../../data/sounds/", import.meta.url).href;
let cards = null, ui = null, loading = null;
const load = () => loading || (loading = Promise.all([fetch(BASE + "cards.json"), fetch(BASE + "ui.json")])
  .then(([a, b]) => Promise.all([a.json(), b.json()])).then(([c, u]) => { cards = c; ui = u; }).catch(() => { cards = {}; ui = {}; }));
const key = (def) => (cards && (cards[def.id] || cards[`neutral:${def.id}`] || cards[`status:${def.id}`])) || null;

export const cardSounds = {
  load,
  cast(def) { const m = def && key(def); if (m) sfx.playUrl(m.cast.url, { volume: 0.55, cut: false, label: `cast ${def.id} ${m.cast.name} [${m.via}]` }); },
  impact(def) { const m = def && key(def); if (m) sfx.playUrl(m.impact.url, { volume: 0.6, label: `impact ${def.id} ${m.impact.name} [${m.via}]` }); },
  enemy(kind, phase, moveName) {
    const byMove = moveName && cards && (cards[moveName] || cards[`neutral:${moveName}`]);
    const s = (byMove && byMove[phase]) ? byMove : (ui && ui.enemy && (ui.enemy[kind] || ui.enemy.steel));
    if (s && s[phase]) sfx.playUrl(s[phase].url, { volume: 0.55, label: `enemy ${moveName || kind} ${phase} ${s[phase].name}` });
  },
  ui(name) { const s = ui && ui.ui && ui.ui[name]; if (s) sfx.playUrl(s.url, { volume: 0.4, label: `ui ${name} ${s.name}` }); },
  // Current deck first (<= 40 files: cast+impact per distinct card), the rest stays lazy.
  preload(deckIds) {
    load().then(() => {
      const urls = [];
      for (const id of new Set(deckIds || [])) { const m = key({ id }); if (m) urls.push(m.cast.url, m.impact.url); }
      if (ui) for (const k of ["cardPlay", "blockGain", "cardDraw", "enemyDeath"]) if (ui.ui[k]) urls.push(ui.ui[k].url);
      sfx.preload(urls.slice(0, 40));
    });
  },
};
