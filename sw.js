/* Service worker: lets the app open without a connection.
   - app files: cached when the app is first opened
   - the page itself: fetched fresh when online (so updates arrive), cached copy when offline
   - Firebase SDK, ExcelJS and Google Fonts: cached the first time they are used
   Firestore's own network traffic is never touched here. */
const VERSION = "v1";
const CORE = "wh-core-" + VERSION;
const RUNTIME = "wh-rt-" + VERSION;
const CORE_FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
const CDN_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf("wh-") === 0 && k !== CORE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)); }

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)])
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CORE).then((c) => c.put("index.html", copy)); }
          return res;
        })
        .catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CORE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  if (CDN_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(
      caches.open(RUNTIME).then((cache) => cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
