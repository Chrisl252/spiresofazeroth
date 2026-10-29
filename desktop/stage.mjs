// Stage the game runtime files into desktop/dist (the Tauri frontendDist).
// Only runtime files: index.html, js, css, data, assets (JSON indexes), LICENSE. No docs, tools, tests or .git.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const game = resolve(here, "..", "spiresofazeroth");
const out = join(here, "dist");
rmSync(out, { recursive: true, force: true });
const dest = join(out, "spiresofazeroth");
mkdirSync(dest, { recursive: true });
for (const f of ["index.html", "LICENSE"]) cpSync(join(game, f), join(dest, f));
for (const d of ["js", "css", "data", "assets"]) if (existsSync(join(game, d))) cpSync(join(game, d), join(dest, d), { recursive: true });
// the game lives under /spiresofazeroth/ (it uses ../../assets and /assets paths); the root just forwards there
// offline runtime: three.js + wgf CSS/fonts the page loads from absolute /assets and /static paths (no network needed to render or reach class select)
cpSync(join(here, "..", "offline"), out, { recursive: true });
writeFileSync(join(out, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/spiresofazeroth/"><a href="/spiresofazeroth/">Spires of Azeroth</a>');
console.log("staged ->", out);
