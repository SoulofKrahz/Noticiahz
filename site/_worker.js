// Noticiahz — Cloudflare Pages (modo avanzado: _worker.js).
// /p/<host>/<ruta>?<query>  →  https://<host>/<ruta>?<query>   (proxy de feeds RSS, solo GET)
// Todo lo demás lo sirve Pages como archivos estáticos (env.ASSETS).
//
// Coste: pensado para el plan gratuito. Si se superan los límites diarios, Cloudflare devuelve errores
// hasta las 00:00 UTC; no cobra. _routes.json hace que este código solo se ejecute en /p/* (los archivos
// estáticos no gastan cuota).
//
// Opcional: variable de entorno ALLOW_HOSTS (Pages → Settings → Variables) con sitios separados por comas
// para limitar el proxy solo a esos sitios. Vacía = cualquier sitio público (no hay que redesplegar al añadir fuentes).

const TTL = 300;          // caché en el borde de Cloudflare: 5 min
const MAX_BYTES = 5e6;    // tamaño máximo de respuesta
const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; Noticiahz/1.0)';

const txt = (s, status, extra = {}) =>
  new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

// Hosts no públicos o IP literales: fuera
function hostOk(h) {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return false; // sin puertos, sin IPv6, con punto
  if (/^\d+(\.\d+){3}$/.test(h)) return false;                                                     // IPv4 literal
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return false;
  return true;
}

// Solo acepta peticiones hechas desde esta misma web (evita que otros usen tu proxy y gasten tu cuota)
function sameOrigin(req, url) {
  const sfs = req.headers.get('Sec-Fetch-Site');
  if (sfs) return sfs === 'same-origin';
  const o = req.headers.get('Origin') || req.headers.get('Referer');
  try { return !!o && new URL(o).host === url.host; } catch { return false; }
}

async function proxy(req, url, env) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return txt('Método no permitido', 405, { Allow: 'GET, HEAD' });
  if (!sameOrigin(req, url)) return txt('Solo desde la propia web', 403);

  const m = url.pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!m) return txt('Ruta no válida', 400);
  const host = m[1].toLowerCase();
  if (!hostOk(host)) return txt('Destino no permitido', 400);
  const allow = (env.ALLOW_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(host)) return txt('Sitio no permitido: ' + host, 403);

  const target = 'https://' + host + (m[2] || '/') + url.search;
  let r;
  try {
    r = await fetch(target, {
      method: req.method,
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5, */*;q=0.1', 'Accept-Language': 'es,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': TTL, '300-599': 0 } },
    });
  } catch (e) {
    return txt('No se pudo descargar: ' + (e && e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'), 504);
  }

  // Errores del origen: se devuelve el mismo código (la app los muestra: 403, 404, 429…)
  if (!r.ok) return txt('Origen respondió ' + r.status, r.status, { 'X-Origin-Status': String(r.status) });

  const len = +r.headers.get('Content-Length') || 0;
  if (len > MAX_BYTES) return txt('Demasiado grande', 413);

  // Se reenvía en streaming (sin copiar en memoria): gasta menos CPU del plan gratuito
  return new Response(req.method === 'HEAD' ? null : r.body, {
    status: 200,
    headers: {
      'Content-Type': r.headers.get('Content-Type') || 'application/xml',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/p/')) return proxy(req, url, env);
    return env.ASSETS.fetch(req);
  },
};
