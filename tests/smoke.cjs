// Prueba de humo de Noticiahz: arranca la app en un navegador real (móvil y PC) con feeds simulados
// y comprueba que lo principal funciona. Si algo falla, el flujo de GitHub no publica.
// Uso: node tests/smoke.cjs   (PW_EXE=/ruta/chromium opcional)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), BASE = 'http://app.test/';
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', txt: 'text/plain' };
const W = ['lluvia','puerto','mercado','festival','robot','ministro','teatro','vacuna','satélite','consola','museo','huelga','playa','tormenta','cohete','escuela','tranvía','biblioteca','volcán','estadio','fábrica','orquesta','glaciar','servidor','parlamento','hospital','olivo','faro','camión','abeja'];
const pick = (s, k) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return W[(h + k * 7) % W.length] + ' ' + W[(h * 3 + k * 11) % W.length] + ' ' + W[(h * 5 + k * 13) % W.length] };
const rss = host => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${host}</title>${[0, 1, 2].map(i =>
  `<item><title>${i === 0 ? 'La IA ' : ''}${pick(host, i)} ${host.split('.').slice(-2, -1)[0]} ${i}</title><link>https://${host}/n/${i}</link><pubDate>${new Date(Date.now() - i * 36e5).toUTCString()}</pubDate><description>Resumen ${i} de ${host}</description></item>`).join('')}</channel></rss>`;
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };

async function run(browser, label, viewport, mobile) {
  console.log(`\n== ${label}`);
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith(BASE)) return r.abort();
    const rel = decodeURIComponent(new URL(u).pathname.slice(1));
    if (rel.startsWith('p/')) {
      const host = rel.split('/')[1];
      if (/aemet|news\.google/.test(host)) return r.fulfill({ status: 404, body: 'no' });
      if (/mondosonoro/.test(host)) return r.fulfill({ status: 403, body: 'no' });
      return r.fulfill({ status: 200, contentType: 'application/rss+xml', body: rss(host) });
    }
    const f = path.join(SITE, rel || 'index.html');
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'no' });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const idle = () => p.waitForFunction(() => typeof S !== 'undefined' && S.ready && !S.loading, null, { timeout: 30000 });

  // 1) Primera visita: pantalla de bienvenida
  await p.goto(BASE); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!document.querySelector('#obl')), 'primera visita muestra la elección de fuentes');

  // 2) Uso normal
  await p.evaluate(() => { localStorage.setItem('nz_ob', '1'); localStorage.setItem('nz_pf', JSON.stringify({ az: 'x' })) });
  await p.goto(BASE); await idle();
  const n = await p.evaluate(() => document.querySelectorAll('#grid .card').length);
  ok(n > 10, `carga noticias de los feeds (${n} tarjetas)`);
  ok(await p.evaluate(() => /^\d{4}-\d\d-\d\d-[\d.]+$/.test(VER)), 'VER tiene el formato fecha-N');

  // 2b) Registro: una tarjeta por actualización con los fallos explicados
  const lg = await p.evaluate(() => { tabInit(); const c = document.querySelector('#p2 .lgr'); return { card: !!c, txt: c ? c.textContent : '', copy: lgText() } });
  ok(lg.card && /Mondosonoro/.test(lg.txt) && /bloquea al proxy/.test(lg.txt), 'el registro muestra la tarjeta y explica por qué falla una fuente');
  ok(/Mondosonoro \(mondosonoro\.com\): el sitio bloquea/.test(lg.copy), 'el registro se copia como texto ordenado');

  // 3) Categorías y fila de fuentes
  const cats = await p.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.dataset.c));
  ok(cats.length > 3, `hay pestañas de categorías (${cats.length})`);
  await p.evaluate(c => document.querySelector(`#tabs [data-c="${c}"]`).click(), cats[1]);
  ok(await p.evaluate(() => !document.querySelector('#srcs').hidden && S.V.length > 0), 'la categoría muestra su fila de fuentes y noticias');
  await p.evaluate(() => document.querySelector('#tabs [data-c="Todas"]').click());

  // 4) Búsqueda
  const q = await p.evaluate(() => { S.q = 'IA'; S.key = ''; render(); const a = S.V.length; S.q = 'zzzxq'; S.key = ''; render(); const b = S.V.length; S.q = ''; S.key = ''; render(); return [a, b] });
  ok(q[0] > 0 && q[1] === 0, `la búsqueda filtra (IA: ${q[0]}, sin resultados: ${q[1]})`);

  // 5) Lector
  await p.evaluate(() => document.querySelector('#grid .card h3').click()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.querySelector('#dr').classList.contains('show')), 'abre el lector');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.querySelector('#dr').classList.contains('show')), 'cierra el lector con Esc');

  // 6) Ajustes: pestañas y ventana de añadir fuente
  await p.evaluate(() => document.querySelector('#st').click()); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.querySelector('#md').classList.contains('show')), 'abre Ajustes');
  ok(await p.evaluate(() => [...document.querySelectorAll('.mt button')].every(b => { const r = b.getBoundingClientRect(); return r.height > 30 && r.right <= innerWidth + 1 })), 'las pestañas de Ajustes se ven enteras');
  for (const t of ['t6', 't7', 't9', 't8', 't1']) await p.evaluate(t => document.querySelector('#' + t).click(), t);
  for (const s of ['r', 'c', 'l']) await p.evaluate(s => document.querySelector(`#sgF [data-s="${s}"]`).click(), s);
  ok(await p.evaluate(() => !document.querySelector('#p1').hidden), 'recorre pestañas y sub-pestañas de Ajustes');
  await p.evaluate(() => document.querySelector('#adb').click()); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !document.querySelector('#fr').hidden && document.querySelector('#frov').classList.contains('show')), 'abre la ventana de añadir fuente');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => document.querySelector('#fr').hidden && document.querySelector('#md').classList.contains('show')), 'Esc cierra la ventana y deja Ajustes abierto');

  // 7) Copia de seguridad: exportar y restaurar sin duplicar
  const bk = await p.evaluate(() => new Promise(res => { const o = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(t => res(t)); URL.createObjectURL = o; return o.call(URL, b) }; document.querySelector('#bx').click() }));
  const j = JSON.parse(bk);
  ok(j.app === 'noticiahz' && Array.isArray(j.data.src) && j.data.lr, 'exporta la copia con fuentes y aprendizaje');
  const dup = await p.evaluate(async t => { const before = S.src.length; await bkApply(bkClean(JSON.parse(t))); await new Promise(r => setTimeout(r, 300)); return [before, S.src.length] }, bk);
  ok(dup[0] === dup[1], `restaurar la misma copia no duplica (${dup[0]} → ${dup[1]})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);

  // 7b) Diálogos propios: cancelar no cambia nada, aceptar sí
  await p.evaluate(() => { document.querySelector('#st').click(); document.querySelector('#t1').click() }); await p.waitForTimeout(200);
  const on0 = await p.evaluate(() => S.src.filter(x => x.on).length);
  await p.evaluate(() => document.querySelector('#gof').click()); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !!document.querySelector('.askd')), 'aparece el diálogo propio al desactivar todas');
  await p.evaluate(() => document.querySelector('.askd [data-a="0"]').click()); await p.waitForTimeout(150);
  ok(await p.evaluate(n => !document.querySelector('.askd') && S.src.filter(x => x.on).length === n, on0), 'Cancelar no desactiva nada');
  await p.evaluate(() => document.querySelector('#gof').click()); await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.evaluate(n => !document.querySelector('.askd') && S.src.filter(x => x.on).length === n && document.querySelector('#md').classList.contains('show'), on0), 'Esc cierra el diálogo sin cerrar Ajustes');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);

  // 8) Actualizar solo la categoría visible
  await idle();
  const sc = await p.evaluate(async c => { S.cat = c; render(); const hit = new Set(), of = window.fetch; window.fetch = (u, o) => { const m = String(u).match(/\/p\/([^/]+)/); if (m) hit.add(m[1]); return of(u, o) }; refresh(); await new Promise(r => setTimeout(r, 300)); while (S.loading) await new Promise(r => setTimeout(r, 100)); window.fetch = of; S.cat = 'Todas'; render(); return [hit.size, S.src.filter(x => x.on && x.cat === c).length] }, cats[1]);
  ok(sc[0] <= sc[1] + 1, `actualizar en una categoría solo pide sus fuentes (${sc[0]} sitios para ${sc[1]} fuentes)`);

  ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    await run(browser, 'Móvil (412×915)', { width: 412, height: 915 }, true);
    await run(browser, 'PC (1366×850)', { width: 1366, height: 850 }, false);
  } catch (e) { fails.push('la prueba se interrumpió: ' + e.message); console.log(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
