// Noticiahz — service worker. Si cambias iconos o manifest, sube el número de V.
const V = 'nz-v29', FONTS = 'nz-fonts';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// La página: primero red (para recibir actualizaciones); si tarda más de 3 s o no hay conexión, la copia guardada.
async function page(req) {
  const c = await caches.open(V);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))]);
    if (r.ok) c.put('index.html', r.clone());
    return r;
  } catch (e) {
    return (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.pathname.startsWith('/p/')) return; // noticias y avisos: siempre por red
    if (r.mode === 'navigate') return e.respondWith(page(r));
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
