// Service worker voor Buddy Budget als geïnstalleerde app.
// Bewaart enkel de app zelf (index.html, iconen, manifest) en de vastgepinde Chart.js-bestanden,
// zodat de app ook zonder netwerk opent. Nooit gebruikersdata: die staat in localStorage, niet hier.
// Strategie: eigen bestanden netwerk-eerst (een nieuwe versie is meteen zichtbaar),
// met de cache als terugval wanneer je offline bent. CDN-bestanden zijn versie-gepind en SRI-gecontroleerd,
// dus die mogen cache-eerst.
const CACHE = 'buddy-app-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }

  if (req.url.startsWith(CDN)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(resp => {
      if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    })));
  }
  // Al het andere: niet tussenkomen.
});
