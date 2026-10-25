// Per-class Talents V2 hook definitions, merged into talentHookDefs.js HOOKS. One import line per class.
import { defs as paladin } from "./paladin.defs.js";
import { defs as hunter } from "./hunter.defs.js";
import { defs as rogue } from "./rogue.defs.js";
import { defs as priest } from "./priest.defs.js";
import { defs as shaman } from "./shaman.defs.js";
import { defs as mage } from "./mage.defs.js";
import { defs as warlock } from "./warlock.defs.js";
import { defs as druid } from "./druid.defs.js";
export const CLASS_DEFS = Object.assign({}, paladin, hunter, rogue, priest, shaman, mage, warlock, druid);
