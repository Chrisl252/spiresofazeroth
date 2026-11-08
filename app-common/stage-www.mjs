// Shared www staging for the Capacitor apps (android-app, ios-app). Each app's stage.mjs calls stageWww(here, { head }).
// Layout mirrors the site: the game lives at /spiresofazeroth/; absolute /assets, /static and /media paths are served from the
// bundled offline/ copy first, then from thewowdb.com (Android: the native RemoteAssets.java interceptor; iOS: the fetch/Audio shim in ios-app/remote-shim.js).
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
export function stageWww(here, { head = "", sw = null } = {}) {
  const root = resolve(here, "..");
  const game = join(root, "spiresofazeroth");
  const out = join(here, "www");
  rmSync(out, { recursive: true, force: true });
  const dest = join(out, "spiresofazeroth");
  mkdirSync(dest, { recursive: true });
  cpSync(join(game, "LICENSE"), join(dest, "LICENSE"));
  for (const d of ["js", "css", "data", "assets"]) if (existsSync(join(game, d))) cpSync(join(game, d), join(dest, d), { recursive: true });
  const html = readFileSync(join(game, "index.html"), "utf8").replace(/<head>/i, "<head>" + head);
  writeFileSync(join(dest, "index.html"), html);
  // offline runtime: three.js + wgf CSS/fonts the page loads from absolute /assets and /static paths
  cpSync(join(root, "offline"), out, { recursive: true });
  if (sw) cpSync(sw, join(out, "sw.js"));
  // Capacitor html5mode serves www/index.html for ANY path whose last segment has no ".", so redirecting to "/spiresofazeroth/" loops forever (blank screen). Point at the explicit file.
  writeFileSync(join(out, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/spiresofazeroth/index.html"><a href="/spiresofazeroth/index.html">Spires of Azeroth</a>');
  console.log("staged ->", out);
  return out;
}
