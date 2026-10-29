// Remote art for the Android app.
//  Bundled files win (three.js, CSS, fonts, hero/race models, UI art); anything not bundled is fetched from thewowdb.com with CORS and cached.
const REMOTE = "https://thewowdb.com", CACHE = "soa-remote-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim().then(() => caches.keys()).then((ks) => Promise.all(ks.filter((k) => k.startsWith("soa-remote-") && k !== CACHE).map((k) => caches.delete(k))))));
async function remote(u, cache) {
  const key = u.pathname + u.search;
  const hit = await cache.match(key);
  if (hit) return hit;
  let res;
  try { res = await fetch(REMOTE + key, { mode: "cors" }); }
  catch (_) { try { res = await fetch(REMOTE + key, { mode: "no-cors" }); } catch (__) { return new Response("", { status: 404 }); } }
  if (res && res.ok) cache.put(key, res.clone());
  return res;
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || e.request.method !== "GET") return;
  if (u.pathname.startsWith("/assets/") || u.pathname.startsWith("/spiresofazeroth/assets/") || u.pathname.startsWith("/static/")) { // bundled first, remote second
    e.respondWith((async () => {
      let local;
      try { local = await fetch(e.request); } catch (_) { local = null; }
      const ct = local && local.headers.get("content-type") || "";
      if (local && local.ok && !ct.startsWith("text/html")) return local; // html = Capacitor's index.html fallback for a missing file
      return remote(u, await caches.open(CACHE));
    })());
  }
});
