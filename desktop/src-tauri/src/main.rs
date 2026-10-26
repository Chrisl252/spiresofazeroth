// Spires of Azeroth desktop shell.
// The game expects an http origin: it fetches data/*.json?v=BUILD, loads ES modules through an importmap, and pulls shared art from
// absolute /assets/ paths. This shell serves the bundled game files from a loopback server on a fixed port (so localStorage saves
// persist between launches) and fetches the Blizzard art/models/sounds that are not in the repo from thewowdb.com, caching them
// on disk so they download once. Offline, anything already cached still works; the rest fails quietly (404).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::Read, path::PathBuf, thread};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tiny_http::{Header, Request, Response, Server};

const REMOTE: &str = "https://thewowdb.com";
const PORT: u16 = 47631;

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "css" => "text/css",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "glb" => "model/gltf-binary",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "ttf" => "font/ttf",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        _ => "application/octet-stream",
    }
}

fn proxyable(p: &str) -> bool {
    p.starts_with("/assets/") || p.starts_with("/spiresofazeroth/assets/") || p.starts_with("/media/sounds/")
}

fn respond(req: Request, status: u16, ctype: &str, body: Vec<u8>) {
    let mut r = Response::from_data(body).with_status_code(status);
    if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], ctype.as_bytes()) {
        r.add_header(h);
    }
    let _ = req.respond(r);
}

fn handle(app: tauri::AppHandle, cache: PathBuf, req: Request) {
    let raw = req.url().split('?').next().unwrap_or("/").to_string();
    if raw.contains("..") || raw.contains('\\') {
        return respond(req, 400, "text/plain", b"bad path".to_vec());
    }
    let path = if raw.ends_with('/') { format!("{raw}index.html") } else { raw };

    // bundled game files (the resolver may fall back to index.html for unknown paths: only accept that for .html requests)
    if let Some(a) = app.asset_resolver().get(path.clone()) {
        if !a.mime_type.starts_with("text/html") || path.ends_with(".html") {
            return respond(req, 200, &a.mime_type, a.bytes);
        }
    }

    if !proxyable(&path) {
        return respond(req, 404, "text/plain", b"404".to_vec());
    }
    let cached = cache.join(path.trim_start_matches('/'));
    if let Ok(bytes) = fs::read(&cached) {
        return respond(req, 200, mime_for(&path), bytes);
    }
    match ureq::get(&format!("{REMOTE}{path}")).set("User-Agent", "spires-desktop").call() {
        Ok(resp) if resp.status() == 200 => {
            let mut buf = Vec::new();
            if resp.into_reader().read_to_end(&mut buf).is_ok() {
                if let Some(dir) = cached.parent() {
                    let _ = fs::create_dir_all(dir);
                }
                let _ = fs::write(&cached, &buf);
                return respond(req, 200, mime_for(&path), buf);
            }
            respond(req, 502, "text/plain", b"502".to_vec())
        }
        _ => respond(req, 404, "text/plain", b"404".to_vec()),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let cache = app
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("remote-assets");
            let server = Server::http(("127.0.0.1", PORT))
                .or_else(|_| Server::http(("127.0.0.1", 0)))
                .map_err(|e| e.to_string())?;
            let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(PORT);
            let handle = app.handle().clone();
            thread::spawn(move || {
                for req in server.incoming_requests() {
                    let (h, c) = (handle.clone(), cache.clone());
                    thread::spawn(move || handle(h, c, req));
                }
            });
            let url = format!("http://127.0.0.1:{port}/spiresofazeroth/");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("Spires of Azeroth")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 600.0)
                .resizable(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Spires of Azeroth");
}
