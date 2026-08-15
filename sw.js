/* Bookshelf service worker
   The shell is cached so the app opens offline. Cover images are
   cached as they load. Catalog searches always go to the network —
   a stale search result is worse than none. */

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

  // catalog lookups: always network, never cache
  if (isCatalog(url)) return;

  // covers: cache first, then network in the background
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

  // app shell: network first, cache as fallback
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
