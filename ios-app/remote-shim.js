// iOS app: WKWebView has no usable service worker, so absolute /assets, /static, /media and /spiresofazeroth/assets requests that are
// not bundled (3D models, library sounds, wowdex art) fall through to thewowdb.com. Bundled files win: the local response is used
// unless it is missing (Capacitor answers index.html for unknown paths) or fails.
(function () {
  var REMOTE = "https://thewowdb.com";
  var RE = /^\/(assets|static|media|spiresofazeroth\/assets)\//;
  function remoteUrl(u) {
    try { var x = new URL(String(u), location.href); if (x.origin !== location.origin || !RE.test(x.pathname)) return null; return REMOTE + x.pathname + x.search; }
    catch (e) { return null; }
  }
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    var r = remoteUrl(u);
    var method = (init && init.method) || (input && input.method) || "GET";
    if (!r || String(method).toUpperCase() !== "GET") return _fetch.apply(this, arguments);
    var remote = function () { return _fetch(r, { mode: "cors", credentials: "omit" }); };
    return _fetch.call(this, input, init).then(function (res) {
      var ct = (res.headers && res.headers.get("content-type")) || "";
      return (res.ok && ct.indexOf("text/html") !== 0) ? res : remote();
    }, remote);
  };
  var _Audio = window.Audio;
  function Audio(src) {
    var a = new _Audio();
    if (src != null) {
      var r = remoteUrl(src);
      if (r) a.addEventListener("error", function h() { a.removeEventListener("error", h); a.src = r; a.load(); });
      a.src = src;
    }
    return a;
  }
  Audio.prototype = _Audio.prototype;
  window.Audio = Audio;
})();
