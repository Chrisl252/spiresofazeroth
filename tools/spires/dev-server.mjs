// Static dev server for Spires of Azeroth. node tools/spires/dev-server.mjs [port]
// Serves this checkout; the site's shared asset folders come from WGF_ASSETS (default: <repo>/assets) and anything missing locally
// (Blizzard icons, models, sounds, UI art, which are not in the public repository) is fetched from WGF_REMOTE (default thewowdb.com),
// so a fresh clone runs with full art. WGF_SOUNDS maps /media/sounds/ to a local folder when you have one.
import http from "node:http";
import https from "node:https";
import { createReadStream, statSync } from "node:fs";
import { join, extname, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const site = process.env.WGF_ASSETS || join(root, "assets");
const remote = (process.env.WGF_REMOTE || "https://thewowdb.com").replace(/\/$/, "");
const MAPPED = ["icons", "loading-screens", "fonts", "ui", "vendor", "wowdex"];
const port = Number(process.argv[2]) || 8766;
const M = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".ogg": "audio/ogg", ".mp3": "audio/mpeg" };
const PROXY_OK = (p) => p.startsWith("/assets/") || p.startsWith("/spiresofazeroth/assets/") || p.startsWith("/media/sounds/");
function sendFile(f, res) {
  if (!statSync(f).isFile()) throw 0;
  res.writeHead(200, { "content-type": M[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  createReadStream(f).pipe(res);
}
function proxy(p, res) {
  const url = remote + p, mod = url.startsWith("https:") ? https : http;
  mod.get(url, { headers: { "user-agent": "spires-dev-server" } }, (up) => {
    if (up.statusCode !== 200) { up.resume(); res.writeHead(404); return res.end("404 (local and " + remote + ")"); }
    res.writeHead(200, { "content-type": up.headers["content-type"] || M[extname(p)] || "application/octet-stream", "cache-control": "no-store" });
    up.pipe(res);
  }).on("error", () => { res.writeHead(502); res.end("502 " + remote); });
}
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  if (p.startsWith("/media/sounds/") && process.env.WGF_SOUNDS) {
    const f = process.env.WGF_SOUNDS + "/" + p.slice(14).replace(/[^0-9a-z.]/gi, "");
    try { return sendFile(f, res); } catch { /* fall through to the remote */ }
  }
  const hit = MAPPED.find((d) => p.startsWith(`/assets/${d}/`));
  const base = hit ? site : root;
  const f = resolve(join(base, hit ? p.slice(8) : p));
  if (!f.startsWith(resolve(base) + sep) && f !== resolve(base)) { res.writeHead(403); return res.end("403"); }
  try { sendFile(f, res); }
  catch { if (PROXY_OK(p)) proxy(p, res); else { res.writeHead(404); res.end("404"); } }
}).listen(port, "127.0.0.1", () => console.log(`spires dev server on http://127.0.0.1:${port}/spiresofazeroth/  (assets: ${site}, remote fallback: ${remote})`));
