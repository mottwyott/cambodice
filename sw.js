// sw.js – the "service worker"
// A tiny helper that runs in the background and keeps a copy of the
// app's files, so it still opens with no signal.
// When you change any file, bump the version number below so phones
// fetch the new copy.
const CACHE = "cambodice-v19";
const FILES = [
  "./", "index.html", "style.css", "icons.js", "sounds.js", "lang.js", "rules.js", "app.js", "manifest.json",
  "icons/icon-180.png", "net.js", "tv-link.js", "history.js", "cloud.js", "lib/firebase/firebase-app-compat.js", "lib/firebase/firebase-auth-compat.js", "lib/firebase/firebase-firestore-compat.js", "lib/peerjs.min.js", "tv/", "tv.js", "tv.css", "fonts/manrope-500.woff2", "fonts/manrope-600.woff2", "fonts/manrope-700.woff2", "fonts/manrope-800.woff2",
  "avatars/01-sunnies.png",
  "avatars/02-bun.png",
  "avatars/03-tash.png",
  "avatars/04-shades-up.png",
  "avatars/05-cap.png",
  "avatars/06-tongue.png",
  "avatars/07-bucket.png",
  "avatars/08-goldie.png",
  "avatars/09-ginger.png",
  "avatars/10-grin.png",
  "avatars/11-blondie.png",
  "avatars/12-beanie.png",
  "avatars/13-curls.png",
  "avatars/14-purple-cap.png",
  "avatars/15-round-shades.png",
  "avatars/16-topknot.png",
  "badges/crown.png", "badges/flame.png", "badges/magnet.png", "badges/moneybag.png", "badges/raincloud.png", "badges/rocket.png", "badges/shot.png", "badges/snail.png", 
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // throw away old versions
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Try the network first (so you get updates), fall back to the saved copy offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only handle our own files. Everything else (the online database,
  // the TV matchmaker) goes straight to the internet untouched.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    // "no-cache" = always check GitHub for a newer copy (the browser would
    // otherwise reuse an old one for up to 10 minutes)
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
