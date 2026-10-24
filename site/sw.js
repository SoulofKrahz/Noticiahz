// Noticiahz — service worker. Si cambias iconos o manifest, sube el número de V.
const V = 'nz-v65', FONTS = 'nz-fonts';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// La página: se abre al instante con la copia guardada y, a la vez, se descarga la nueva para la próxima vez.
// La app compara su versión con version.txt y ofrece «Actualizar ahora» cuando la copia nueva ya está lista.
function page(req, ev) {
  const net = caches.open(V).then(async c => {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) await c.put('index.html', r.clone());
    return r;
  });
  ev.waitUntil(net.catch(() => {}));
  return caches.open(V).then(async c => (await c.match('index.html')) || net.catch(async () => (await c.match('./')) || Response.error()));
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.pathname.startsWith('/p/')) return; // noticias y avisos: siempre por red
    if (r.mode === 'navigate') return e.respondWith(page(r, e));
    // El manifest cambia según el color elegido (lo decide _worker.js por la cookie): siempre de la red, copia solo sin conexión
    if (u.pathname === '/manifest.webmanifest') return e.respondWith(fetch(r).then(x => { if (x.ok) { const y = x.clone(); caches.open(V).then(c => c.put('manifest.webmanifest', y)) } return x }).catch(() => caches.match('manifest.webmanifest')));
    return e.respondWith(caches.match(r).then(h => h || fetch(r)));
  }
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(FONTS).then(async c => {
      const h = await c.match(r);
      const n = fetch(r).then(x => { if (x.ok || x.type === 'opaque') c.put(r, x.clone()); return x; }).catch(() => h);
      return h || n;
    }));
  }
});
