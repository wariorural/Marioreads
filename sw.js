/* Bokhylle service worker
   Skallet caches så appen åpner offline. Omslagsbilder caches
   etter hvert som de lastes. Katalogsøk går alltid til nett —
   et gammelt søkeresultat er verre enn ingen. */

const SHELL = "bokhylle-shell-v1";
const COVERS = "bokhylle-covers-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.allSettled(SHELL_FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== COVERS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isCover = url =>
  /covers\.openlibrary\.org/.test(url) ||
  /books\.google\.com\/books\/content/.test(url) ||
  /books\.googleusercontent\.com/.test(url);

const isCatalog = url =>
  /openlibrary\.org\/(search|works|books)/.test(url) ||
  /googleapis\.com\/books/.test(url);

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url;

  // katalogoppslag: alltid nett, aldri cache
  if (isCatalog(url)) return;

  // omslag: cache først, så nett i bakgrunnen
  if (isCover(url)) {
    e.respondWith(
      caches.open(COVERS).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // appskallet: nett først, cache som reserve
  if (new URL(url).origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          return hit || caches.match("./index.html");
        })
    );
  }
});
