const CACHE = 'csv2dmli-v1';

const PRE_CACHE = [
  '/index-wizard.html',
  '/static/css/style.css',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/vendor/papaparse.min.js',
  '/vendor/jszip.min.js',
  '/vendor/marked.min.js',
  '/vendor/markdown2typst.esm.js',
  '/vendor/fonts/fonts.css',
  '/vendor/font-awesome/css/all.min.css',
];

const ANDROID_CACHE = 'csv2dmli-android-v1';
const ANDROID_ASSETS = [
  '/vendor/fflate.min.js',
  '/vendor/node-forge.min.js',
  '/vendor/android/axml-browser.js',
  '/vendor/android/template.aab',
];

self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(c => c.addAll(PRE_CACHE).catch(() => {})),
      caches.open(ANDROID_CACHE).then(c =>
        Promise.all(
          ANDROID_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) c.put(url, r); }).catch(() => {})
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== ANDROID_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // template.aab — always from Android cache (large binary, never changes between sessions)
  if (url.pathname.endsWith('template.aab')) {
    e.respondWith(
      caches.match(e.request, { cacheName: ANDROID_CACHE })
        .then(cached => cached || fetch(e.request).then(r => {
          if (r.ok) caches.open(ANDROID_CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        }))
    );
    return;
  }

  // Cross-origin requests — network only
  if (url.origin !== self.location.origin) {
    return;
  }

  // All other requests — cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (!r || !r.ok || r.type === 'opaque') return r;
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return r;
      });
    })
  );
});
