// Service worker: la app abre sin señal (la planilla guarda sus datos aparte, en el celular).
const CACHE = 'torneo-cgt-v2';
const BASE = ['./', 'index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/core.js', 'js/config.js', 'js/publico.js', 'js/login.js', 'js/jugador.js', 'js/arbitro.js',
  'js/admin.js', 'js/equipos.js', 'js/fixture.js', 'js/planilla.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return; // datos: siempre a la red
  const propio = u.origin === location.origin;
  const cdn = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname);
  if (!propio && !cdn) return;
  // Archivos propios: red primero (siempre la última versión), caché si no hay señal. CDN versionados: caché primero.
  e.respondWith(propio
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    : caches.match(e.request).then(m => m || fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })));
});
