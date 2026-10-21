// Goblin merchant for the shop screen: the 3D actor (wowdex race-9 male, models.json "goblin-vendor") + his classic voice lines.
//   const v = await mountVendor(app, hostEl, leaveEl);   v.say("greeting" | "farewell" | "pissed")   v.dispose()
// Lines come from data/sounds/goblin-vendor.json (Sound/Creature/GoblinVendorM VO, served at /media/sounds/<fdid>.mp3).
// The model is static (no baked clips): "Talk" is a squash/hop tween on the actor motion for the length of the line.
import { getKit, clearStage, watchLeave } from "./combatKit.js";
import { sfx } from "../audio.js";

const VOICE_URL = new URL("../../data/sounds/goblin-vendor.json", import.meta.url).href;
const UID = "shop-vendor";
let voicePromise = null;
const loadVoice = () => voicePromise || (voicePromise = fetch(VOICE_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const last = {};
const pick = (kind, list) => { // random, never the same line twice in a row
  if (!list || !list.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[kind]) i = (i + 1) % list.length;
  last[kind] = i;
  return list[i];
};

export async function mountVendor(app, hostEl, leaveEl) {
  const voice = await loadVoice();
  const v = { actor: null, kit: null, say, dispose, voice };
  if (voice) sfx.preload([...voice.greeting, ...voice.pissed, ...voice.farewell].map((l) => l.url));

  function talk(ms) {
    const a = v.actor && v.actor.motion;
    if (!a) return;
    const beats = Math.max(2, Math.round(ms / 260));
    (async () => {
      for (let i = 0; i < beats; i++) {
        await Promise.all([a.tween("sy", 1.07, 110, "out"), a.tween("sx", 0.97, 110, "out"), a.tween("y", -10, 110, "out")]);
        await Promise.all([a.tween("sy", 1, 150, "in"), a.tween("sx", 1, 150, "in"), a.tween("y", 0, 150, "in")]);
      }
    })().catch(() => {});
  }
  function say(kind, { cut = true } = {}) {
    const line = voice && pick(kind, voice[kind]);
    if (!line) return 0;
    sfx.playUrl(line.url, { volume: 0.85, cut, label: `goblin-${kind}` });
    talk(line.ms || 1500);
    return line.ms || 0;
  }
  function dispose() {
    if (v.kit && v.kit.actors) {
      if (v.actor) v.kit.actors.remove(UID);
      if (v.kit.actors.setGroundVisible) v.kit.actors.setGroundVisible(true);
    }
    v.actor = null;
  }

  try {
    const kit = await getKit(app);
    if (!kit.actors || !hostEl.isConnected) return v;
    v.kit = kit;
    clearStage(kit);
    if (kit.actors.setGroundVisible) kit.actors.setGroundVisible(false);
    const r = hostEl.getBoundingClientRect(), p0 = app.stage.toStage(r.left, r.top), p1 = app.stage.toStage(r.right, r.bottom);
    const nameEl = hostEl.querySelector(".sx-vendor__name");
    const np0 = nameEl ? app.stage.toStage(0, nameEl.getBoundingClientRect().top) : null;
    const footY = np0 ? np0.y - 58 : p1.y - 230;
    const lanes = kit.actors.lanes, keep = lanes.enemy;
    const s = Math.max(0.85, Math.min(1.4, ((footY - p0.y) / 480) * 1.1));
    lanes.enemy = () => ({ x: (p0.x + p1.x) / 2, y: footY, s });
    v.actor = kit.actors.addEnemy({ uid: UID, id: "goblin-vendor", name: "Goblin Merchant", tier: "normal" }, 0, 1);
    lanes.enemy = keep;
    hostEl.classList.add("has-model");
    watchLeave(app, leaveEl || hostEl, () => {
      if (kit.actors && kit.actors.setGroundVisible) kit.actors.setGroundVisible(true);
      if (app.kit === kit) clearStage(kit);
    });
  } catch (e) { console.warn("[spires] goblin vendor skipped:", e && e.message); }
  return v;
}
