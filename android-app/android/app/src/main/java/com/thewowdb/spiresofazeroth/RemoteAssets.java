package com.thewowdb.spiresofazeroth;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

/**
 * Remote art for the Android app (the native counterpart of desktop/src-tauri/src/main.rs and ios-app/remote-shim.js).
 *
 * The game loads Blizzard art, 3D models and sounds from absolute /assets, /static, /media and /spiresofazeroth/assets paths.
 * The small offline/ set is bundled in the APK (Capacitor serves it from www); everything else is fetched from thewowdb.com on
 * first use and cached under the app cache dir, so later launches work offline.
 *
 * Why native: Capacitor 6's Android Bridge never wires a ServiceWorkerClient, so the old android-app/sw.js was registered but
 * never ran. Un-bundled requests then hit Capacitor's html5 fallback (index.html) and every model, class/race image and
 * sound failed (bug mail 2026-11-08, build 20261104b, APK 1.0.5). shouldInterceptRequest runs for <img>, CSS url(), <audio>,
 * fetch and three.js loaders alike, so no game code changes.
 */
final class RemoteAssets {
    static final String REMOTE = "https://thewowdb.com";
    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("glb", "model/gltf-binary"); TYPES.put("gltf", "model/gltf+json"); TYPES.put("json", "application/json");
        TYPES.put("png", "image/png"); TYPES.put("jpg", "image/jpeg"); TYPES.put("jpeg", "image/jpeg"); TYPES.put("webp", "image/webp");
        TYPES.put("gif", "image/gif"); TYPES.put("svg", "image/svg+xml"); TYPES.put("avif", "image/avif");
        TYPES.put("mp3", "audio/mpeg"); TYPES.put("ogg", "audio/ogg"); TYPES.put("wav", "audio/wav"); TYPES.put("m4a", "audio/mp4");
        TYPES.put("woff2", "font/woff2"); TYPES.put("woff", "font/woff"); TYPES.put("ttf", "font/ttf");
        TYPES.put("js", "application/javascript"); TYPES.put("mjs", "application/javascript"); TYPES.put("css", "text/css");
        TYPES.put("bin", "application/octet-stream");
    }

    private final AssetManager assets;
    private final File dir;

    RemoteAssets(Context ctx) {
        assets = ctx.getAssets();
        dir = new File(ctx.getCacheDir(), "remote-assets");
        if (!dir.exists()) dir.mkdirs();
    }

    /** Paths the site origin serves; same set as ios-app/remote-shim.js. */
    static boolean isRemotePath(String p) {
        return p != null && (p.startsWith("/assets/") || p.startsWith("/static/") || p.startsWith("/media/") || p.startsWith("/spiresofazeroth/assets/"));
    }

    /** Capacitor packs www/ into the APK as assets/public/...; a hit there means the file is bundled and Capacitor should serve it. */
    private boolean isBundled(String path) {
        try (InputStream in = assets.open("public" + path)) {
            return in != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** A response for un-bundled remote asset requests, or null so Capacitor serves the request from www as usual. */
    WebResourceResponse intercept(WebResourceRequest req) {
        if (req == null || !"GET".equalsIgnoreCase(req.getMethod())) return null;
        Uri u = req.getUrl();
        if (u == null) return null;
        String path = u.getPath(), query = u.getQuery();
        if (!isRemotePath(path) || isBundled(path)) return null;
        String mime = mimeFor(path);
        File cached = new File(dir, hash(path) + ext(path));
        try {
            if (cached.isFile() && cached.length() > 0) return ok(mime, new FileInputStream(cached));
            byte[] body = download(REMOTE + path + (query != null ? "?" + query : ""));
            if (body == null) return notFound();
            File tmp = new File(dir, cached.getName() + ".part");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(body); }
            if (!tmp.renameTo(cached)) tmp.delete();
            return ok(mime, new ByteArrayInputStream(body));
        } catch (Exception e) {
            return notFound();
        }
    }

    private static byte[] download(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "spires-android");
            c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                byte[] b = new byte[16384];
                int n;
                while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                return buf.toByteArray();
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static WebResourceResponse ok(String mime, InputStream body) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "public, max-age=31536000, immutable");
        return new WebResourceResponse(mime, null, 200, "OK", h, body);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String ext(String path) {
        int dot = path.lastIndexOf('.'), slash = path.lastIndexOf('/');
        return dot > slash ? path.substring(dot).toLowerCase() : "";
    }

    private static String mimeFor(String path) {
        String e = ext(path);
        String m = e.isEmpty() ? null : TYPES.get(e.substring(1));
        return m != null ? m : "application/octet-stream";
    }

    private static String hash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
