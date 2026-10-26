// Serves absolute /assets/* (Blizzard art, models, sounds not bundled in the repo) from thewowdb.com, cached after first fetch.
const REMOTE = "https://thewowdb.com", CACHE = "soa-remote-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith("/assets/") || e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), hit = await cache.match(u.pathname);
    if (hit) return hit;
    let res;
    try { res = await fetch(REMOTE + u.pathname + u.search, { mode: "cors" }); }
    catch (_) { try { res = await fetch(REMOTE + u.pathname + u.search, { mode: "no-cors" }); } catch (__) { return new Response("", { status: 404 }); } }
    if (res && res.ok) cache.put(u.pathname, res.clone());
    return res;
  })());
});
