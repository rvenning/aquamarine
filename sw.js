// Aquamarine — service worker. Network-first with a cache fallback: online
// players always get the newest deploy, offline players get the last version
// they loaded.
//
// The SHELL below is what gets precached on install, and it deliberately does
// NOT include the board images. The five sheets are around 600KB each and only
// one of them is the map you are playing; precaching all five would make
// installing the game a 3MB download to play a board you might never open.
// The fetch handler caches every successful same-origin GET as it goes, so a
// map's artwork is cached the first time it is dived and available offline
// from then on.

const CACHE = "aquamarine-v3";

const SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/aquamarine.css",
  "lib/gk-util.js",
  "lib/gk-audio.js",
  "lib/gk-ui.js",
  "lib/gk-storage.js",
  "lib/gk-profiles.js",
  "lib/gk-pwa.js",
  "lib/gk-debug.js",
  "lib/gk-base.css",
  "js/firebase-config.js",
  "js/storage.js",
  "js/engine/board.js",
  "js/engine/shapes.js",
  "js/engine/dice.js",
  "js/engine/state.js",
  "js/engine/scoring.js",
  "js/engine/rules/map1.js",
  "js/engine/rules/map2.js",
  "js/engine/rules/map3.js",
  "js/engine/rules/map4.js",
  "js/engine/rules/map5.js",
  "js/icons.js",
  "js/help.js",
  "js/tutorial.js",
  "js/render/sprites.js",
  "js/render/wheel.js",
  "js/render/board.js",
  "js/maps.js",
  "js/main.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only same-origin GETs; Firebase traffic passes through untouched.
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
