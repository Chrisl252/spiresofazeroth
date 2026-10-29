// Per-class Talents V2 runtimes, dispatched from talentHooks.js. One import line per class; each module is { fire?, deal?, taken? }.
import paladin from "./paladin.hooks.js?v=20261029a";
import hunter from "./hunter.hooks.js?v=20261029a";
import rogue from "./rogue.hooks.js?v=20261029a";
import priest from "./priest.hooks.js?v=20261029a";
import shaman from "./shaman.hooks.js?v=20261029a";
import mage from "./mage.hooks.js?v=20261029a";
import warlock from "./warlock.hooks.js?v=20261029a";
import druid from "./druid.hooks.js?v=20261029a";
const MODS = [paladin, hunter, rogue, priest, shaman, mage, warlock, druid];
export function classFire(C, name, extra) { for (const m of MODS) if (m.fire) m.fire(C, name, extra); }
export function classDeal(C, src, tgt, amt, o, base) { let a = amt; for (const m of MODS) if (m.deal) a = m.deal(C, src, tgt, a, o, base); return a; }
export function classTaken(C, tgt, taken, src, o) { let a = taken; for (const m of MODS) if (m.taken) a = m.taken(C, tgt, a, src, o); return a; }
