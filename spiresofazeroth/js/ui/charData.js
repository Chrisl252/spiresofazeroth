// Shared loaders for the character screens: the real client text/matrix (data/charcreate.json), the client's random-name lists
// (data/charcreate-names.json, lazy), and the stylesheet. Art paths for portraits/crests live here so both screens agree.
import { BUILD } from "../version.js?v=20261029a";

const url = (rel) => `${new URL(rel, import.meta.url).href}?v=${BUILD}`;
let dataP = null, namesP = null, cssP = null;
export const loadCharData = () => (dataP = dataP || fetch(url("../../data/charcreate.json")).then((r) => r.json()).then((d) => { d.byKey = Object.fromEntries(d.races.map((r) => [r.key, r])); return d; }));
export const loadNames = () => (namesP = namesP || fetch(url("../../data/charcreate-names.json")).then((r) => r.json()).catch(() => ({})));
export const charCss = () => (cssP = cssP || new Promise((res) => {
  const href = url("../../css/charcreate.css");
  if (document.querySelector(`link[href="${href}"]`)) return res();
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = l.onerror = () => res(); document.head.append(l);
}));
export const portraitUrl = (race, gender) => new URL(`../../assets/ui/charcreate/races/${race}-${gender}.jpg`, import.meta.url).href;
export const crestUrl = (faction) => new URL(`../../assets/ui/charcreate/${faction}.jpg`, import.meta.url).href;
// random client name for a race/gender (NameGen table); falls back to the class name list being empty -> ""
export async function randomName(race, gender, avoid = "") {
  const list = (await loadNames())[`${race}.${gender}`] || [];
  if (!list.length) return "";
  let n = list[Math.floor(Math.random() * list.length)];
  for (let i = 0; i < 5 && n === avoid; i++) n = list[Math.floor(Math.random() * list.length)];
  return n;
}
