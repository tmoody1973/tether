// Tether service worker: an offline shell and nothing else.
// Money screens must never show stale numbers, so the ONLY things ever cached are the static files in PRECACHE.
// No HTML page, no /api/*, no /g/*, no /t/*, no server action (POST), nothing else is ever stored.
// Bump VERSION whenever a PRECACHE file changes, or installed clients keep the old copy.
const VERSION = "tether-shell-v1";
const PRECACHE = ["/offline.html", "/brand/icon-192.png", "/brand/icon-512.png", "/brand/icon-maskable-512.png", "/brand/tether-horizontal-color.svg"];

/** What to do with a request. Pure, so a test can assert the never-cache rules. */
function route(method, mode, url, origin) {
  const u = new URL(url);
  if (method !== "GET" || u.origin !== origin) return "network"; // POST / server actions / other origins: untouched
  if (mode === "navigate") return "navigate"; // network first; offline.html only if the network throws; the page is never stored
  if (PRECACHE.includes(u.pathname)) return "precache";
  return "network"; // /api, /g, /t, _next and everything else: straight to the network, never cached
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  // OneSignal's push handling lives in THIS worker (decision 017; OneSignal's "combining service workers" guide). A
  // worker can only navigate windows it controls, and this one controls every page, so tapping a push can take the
  // open app straight to the request. OneSignal's script adds push and click handlers only: no fetch, no caching.
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(VERSION).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { credentials: "omit" })))).then(() => self.skipWaiting()),
    );
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
    );
  });
  self.addEventListener("fetch", (event) => {
    const { request } = event;
    const kind = route(request.method, request.mode, request.url, self.location.origin);
    if (kind === "navigate") {
      event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    } else if (kind === "precache") {
      event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    }
  });
}

if (typeof module !== "undefined") module.exports = { route, PRECACHE, VERSION };
