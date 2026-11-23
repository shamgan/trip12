/* Service worker: שומר את כל קבצי האתר בטלפון לשימוש ללא אינטרנט. לא אוסף ולא שולח מידע. */
const CACHE = 'trip12-1.3.5';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'data/content.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'maps/eilat.webp', 'maps/israel.webp',
  'photos/red-1.webp','photos/red-2.webp','photos/red-3.webp','photos/red-4.webp','photos/amir-1.webp','photos/amir-2.webp','photos/amir-3.webp','photos/tzf-1.webp','photos/tzf-2.webp'];

async function notify(msg) { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); }

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('trip12-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()).then(() => notify('cached')));
});
self.addEventListener('message', async e => {
  if (e.data === 'check') {
    const c = await caches.open(CACHE); const keys = await c.keys();
    if (keys.length >= ASSETS.length) notify('cached');
  }
});
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // עדכוני צוות ומשוב – תמיד מהרשת
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
