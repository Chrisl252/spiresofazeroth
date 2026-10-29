// Per-class Talents V2 hook definitions, merged into talentHookDefs.js HOOKS. One import line per class.
import { defs as paladin } from "./paladin.defs.js?v=20261029a";
import { defs as hunter } from "./hunter.defs.js?v=20261029a";
import { defs as rogue } from "./rogue.defs.js?v=20261029a";
import { defs as priest } from "./priest.defs.js?v=20261029a";
import { defs as shaman } from "./shaman.defs.js?v=20261029a";
import { defs as mage } from "./mage.defs.js?v=20261029a";
import { defs as warlock } from "./warlock.defs.js?v=20261029a";
import { defs as druid } from "./druid.defs.js?v=20261029a";
export const CLASS_DEFS = Object.assign({}, paladin, hunter, rogue, priest, shaman, mage, warlock, druid);
