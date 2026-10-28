// Stage runtime files into android-app/www (Capacitor webDir). No docs, tools or tests.
// Layout mirrors the site: the game lives at /spiresofazeroth/, absolute /assets/ paths are served from thewowdb.com by sw.js.
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const game = resolve(here, "..", "spiresofazeroth");
const out = join(here, "www");
rmSync(out, { recursive: true, force: true });
const dest = join(out, "spiresofazeroth");
mkdirSync(dest, { recursive: true });
cpSync(join(game, "LICENSE"), join(dest, "LICENSE"));
for (const d of ["js", "css", "data", "assets"]) if (existsSync(join(game, d))) cpSync(join(game, d), join(dest, d), { recursive: true });
const boot = `<script>if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js",{scope:"/"}).then(function(){return navigator.serviceWorker.ready}).then(function(){if(!navigator.serviceWorker.controller&&!sessionStorage.getItem("sw-reload")){sessionStorage.setItem("sw-reload","1");location.reload()}}).catch(function(){})}</script>`;
const html = readFileSync(join(game, "index.html"), "utf8").replace(/<head>/i, "<head>" + boot);
writeFileSync(join(dest, "index.html"), html);
cpSync(join(here, "sw.js"), join(out, "sw.js"));
// Capacitor html5mode serves www/index.html for ANY path whose last segment has no ".", so redirecting to "/spiresofazeroth/" loops forever (blank screen). Point at the explicit file.
writeFileSync(join(out, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/spiresofazeroth/index.html"><a href="/spiresofazeroth/index.html">Spires of Azeroth</a>');
console.log("staged ->", out);
