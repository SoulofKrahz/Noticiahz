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

const HITS = {};
async function workerTest() {
  const w = (await import(require('url').pathToFileURL(path.join(SITE, '_worker.js')).href)).default, env = { ASSETS: { fetch: async q => new Response(fs.readFileSync(path.join(SITE, new URL(q.url).pathname))) } };
  const get = async c => JSON.parse(await (await w.fetch(new Request('https://app.test/manifest.webmanifest', { headers: c ? { Cookie: c } : {} }), env)).text()).icons[0].src;
  const r = [await get('nz_ic=azul'), await get(''), await get('otra=1; nz_ic=x../'), await get('nz_ic=grafito; z=1')];
  ok(r[0] === 'ic/azul-192.png' && r[1] === 'icon-192.png' && r[2] === 'icon-192.png' && r[3] === 'ic/grafito-192.png', `el proxy sirve el manifest del color de la cookie (${r.join(', ')})`);
  const rt = JSON.parse(fs.readFileSync(path.join(SITE, '_routes.json'), 'utf8'));
  ok(rt.include.includes('/manifest.webmanifest'), '_routes.json pasa el manifest por el proxy');
}
// Google News simulado para «Descubrir»: medios nuevos y uno que ya está en las fuentes (El País)
const gn = u => { const q = decodeURIComponent((u.match(/q=([^&+]*)/) || [])[1] || 'x'); const M = [['https://www.mallorcadiario.com', 'mallorcadiario.com'], ['https://www.cronicabalear.es', 'Crónica Balear'], ['https://elpais.com', 'El País'], ['https://hiphopgoldenage.es', 'Hip Hop Golden Age']];
  return `<?xml version="1.0"?><rss version="2.0"><channel>${M.map((m, i) => `<item><title>${q} titular ${i} - ${m[1]}</title><link>https://news.google.com/rss/articles/${i}</link><source url="${m[0]}">${m[1]}</source></item>`).join('')}</channel></rss>` };
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
      if (/news\.google/.test(host) && /q=(rap|site)/i.test(u)) return r.fulfill({ status: 503, headers: { 'X-Nz': '1' }, body: 'sorry' });
      if (/bing\.com/.test(host) && /q=site/i.test(u)) { const h = (decodeURIComponent(u).match(/site:([a-z0-9.-]+)/i) || [])[1] || ''; return r.fulfill({ status: 200, headers: { 'X-Nz': '1' }, contentType: 'application/rss+xml', body: `<?xml version="1.0"?><rss version="2.0"><channel>${/bingok/.test(h) ? [0, 1, 2].map(i => `<item><title>Noticia ${i} de ${h}</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2f${h}%2fn%2f${i}&amp;c=1</link><pubDate>${new Date(Date.now() - i * 36e5).toUTCString()}</pubDate><description>Resumen ${i}</description></item>`).join('') + '<item><title>Otra web</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fajena.es%2fx</link></item>' : ''}</channel></rss>` }) }
      if (/bing\.com/.test(host)) return r.fulfill({ status: 200, headers: { 'X-Nz': '1' }, contentType: 'application/rss+xml', body: `<?xml version="1.0"?><rss version="2.0" xmlns:News="https://www.bing.com/news/search?q=x&amp;format=rss"><channel><item><title>Nuevo disco de rap</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fwww.rapbing.es%2fdisco&amp;c=1</link><News:Source>Rap Bing</News:Source></item></channel></rss>` });
      if (/news\.google/.test(host) && !/site(%3A|:)/i.test(u)) return r.fulfill({ status: 200, headers: { 'X-Nz': '1' }, contentType: 'application/rss+xml', body: gn(u) });
      if (/aemet|news\.google/.test(host)) return r.fulfill({ status: 404, headers: { 'X-Nz': '1' }, body: 'no' });
      HITS[host] = (HITS[host] || 0) + 1;
      if (/mondosonoro|roto\.test|bingok/.test(host)) return r.fulfill({ status: 403, headers: { 'X-Nz': '1' }, body: 'no' });
      if (/cuota\.test/.test(host)) return r.fulfill({ status: 429, body: 'error code: 1027' });
      if (/viejo\.test/.test(host)) return r.fulfill({ status: 200, contentType: 'application/rss+xml', body: rss(host).replace(/<pubDate>[^<]*/g, '<pubDate>' + new Date(Date.now() - 400 * 864e5).toUTCString()) });
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

  // 3b) Descartadas: aparece la pestaña, se ven y se pueden restaurar
  const dv = await p.evaluate(async () => { dismiss(S.V[0]); dismiss(S.V[1]); render(); const t = document.querySelector('#tabs [data-c="Descartadas"]'); if (!t) return { tab: false }; t.click();
    const n = document.querySelectorAll('#grid .card').length; document.querySelector('[data-rs]').click(); await new Promise(r => setTimeout(r, 900)); const n2 = document.querySelectorAll('#grid .card').length; $('#dvr').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.askd [data-a="1"]').click(); await new Promise(r => setTimeout(r, 300)); return { tab: true, n, n2, left: disList().length, cat: S.cat } });
  ok(dv.tab && dv.n === 2 && dv.n2 === 1 && dv.left === 0 && dv.cat === 'Todas', `Descartadas: pestaña, restaurar una y todas (${JSON.stringify(dv)})`);

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

  // 6a) Comprobar fuentes: si falla o la web no publica, la ventana no se cierra y explica el motivo; si va bien, no se descarga dos veces
  const tryAdd = async (name, url) => { await p.evaluate(([n, u]) => { const fr = document.querySelector('#fr'); if (fr.hidden) document.querySelector('#adb').click(); document.querySelector('#an').value = n; document.querySelector('#au').value = u; document.querySelector('#aa').click() }, [name, url]);
    await p.waitForFunction(() => !document.querySelector('#aa').disabled, null, { timeout: 60000 }); await p.waitForTimeout(150);
    return p.evaluate(() => ({ open: !document.querySelector('#fr').hidden, msg: document.querySelector('#fm').textContent, cls: document.querySelector('#fm').className, ak: !document.querySelector('#ak').hidden && document.querySelector('#ak').textContent })) };
  const ro = await tryAdd('Roto', 'https://roto.test/feed/');
  ok(ro.open && /No carga: el sitio bloquea al proxy \(403\)/.test(ro.msg) && ro.ak === 'Guardar igualmente', `una fuente que falla no cierra la ventana y dice por qué (${ro.msg.slice(0, 60)})`);
  const vi = await tryAdd('Viejo', 'https://viejo.test/feed/');
  ok(vi.open && /warn/.test(vi.cls) && /lo último que ha publicado es del/.test(vi.msg), `una web que no publica avisa en vez de cerrarse (${vi.msg.slice(0, 70)})`);
  const sb = await tryAdd('SoloBing', 'https://www.bingok.test/');
  ok(sb.open && /Bing Noticias/.test(sb.msg) && sb.ak === 'Guardar así', `si la web y Google fallan, ofrece cargarla vía Bing (${sb.msg.slice(0, 60)})`);
  const gb = await p.evaluate(async () => { const a = await getFeed({ name: 'GB', cat: 'Local', url: 'https://news.google.com/rss/search?q=site:bingok.test+when:3d&hl=es&gl=ES&ceid=ES:es' }); return a ? { n: a.length, real: a.every(x => /^https:\/\/bingok\.test\//.test(x.link)) } : null });
  ok(gb && gb.n === 3 && gb.real, `una fuente de Google News bloqueada carga vía Bing con los enlaces reales (${JSON.stringify(gb)})`);
  const h0 = HITS['bueno.test'] || 0, bu = await tryAdd('Bueno', 'https://bueno.test/feed/'); await idle();
  ok(!bu.open && (HITS['bueno.test'] - h0) === 1 && await p.evaluate(() => S.news.some(a => a.src === 'Bueno')), `una fuente buena se añade con lo ya descargado (${HITS['bueno.test'] - h0} descarga)`);
  await p.evaluate(() => { S.src = S.src.filter(x => x.name !== 'Bueno'); saveSrc() });
  // 6c) Descubrir fuentes: propone medios nuevos de Google News y no repite los que ya tienes
  const dsc = await p.evaluate(async () => { document.querySelector('#sgF [data-s="d"]').click(); document.querySelector('#dsb').click(); await new Promise(r => setTimeout(r, 1500));
    const names = [...document.querySelectorAll('#dsr .dsi b')].map(b => b.textContent); return { names, vis: !document.querySelector('#pD').hidden, tabs: [...document.querySelectorAll('#sgF button')].every(b => b.scrollWidth <= b.clientWidth + 1) } });
  ok(dsc.vis && dsc.names.includes('Rap Bing') && dsc.names.includes('Hip Hop Golden Age') && !dsc.names.includes('El País') && !dsc.names.includes('Crónica Balear') && dsc.tabs, `Descubrir propone medios nuevos sin repetir los tuyos (${dsc.names.join(', ')})`);
  const dad = await p.evaluate(async () => { document.querySelector('[data-dsadd="hiphopgoldenage.es"]').click(); await new Promise(r => setTimeout(r, 1500));
    return { added: S.src.some(x => x.name === 'Hip Hop Golden Age'), gone: ![...document.querySelectorAll('#dsr .dsi b')].some(b => b.textContent === 'Hip Hop Golden Age'), form: document.querySelector('#fr').hidden } });
  ok(dad.added && dad.gone && dad.form, `Añadir desde Descubrir comprueba, añade y lo quita de la lista (${JSON.stringify(dad)})`);
  await p.evaluate(() => { S.src = S.src.filter(x => x.name !== 'Hip Hop Golden Age'); saveSrc(); document.querySelector('#sgF [data-s="l"]').click() });
  // 6d) Al cerrar y abrir Ajustes no queda nada «a medias» (resultados de Descubrir, textos, pestaña)
  const rs = await p.evaluate(async () => { document.querySelector('#sgF [data-s="d"]').click(); document.querySelector('#dsb').click(); await new Promise(r => setTimeout(r, 1200)); document.querySelector('#dsi').value = 'abc'; tab(7); document.querySelector('#tpi').value = 'xyz';
    const had = document.querySelectorAll('#dsr .dsi').length; closeAll(); await new Promise(r => setTimeout(r, 300)); document.querySelector('#st').click(); await new Promise(r => setTimeout(r, 300));
    const r = { had, tab1: !document.querySelector('#p1').hidden || !document.querySelector('#pF').hidden, res: document.querySelectorAll('#dsr .dsi').length, dsi: document.querySelector('#dsi').value, tpi: document.querySelector('#tpi').value }; closeAll(); await new Promise(r => setTimeout(r, 300)); return r });
  ok(rs.had > 0 && rs.res === 0 && !rs.dsi && !rs.tpi, `al cerrar Ajustes se borran búsquedas y textos a medias (${JSON.stringify(rs)})`);
  // 6b) El color elegido va a la cookie nz_ic (el manifest no cambia de dirección); un color libre usa el más parecido
  const ico = await p.evaluate(() => { const m = () => document.querySelector('link[rel=manifest]').getAttribute('href'), ck = () => (document.cookie.match(/nz_ic=([a-z]*)/) || [])[1];
    document.querySelector('#sws .swc[data-i="2"]').click(); const r = [m(), ck(), nzIco(200, .9), nzIco(10, .1), nzIco(150, .8)]; document.querySelector('#sws .swc[data-i="0"]').click(); r.push(m(), ck()); return r });
  ok(ico[0] === 'manifest.webmanifest' && ico[1] === 'azul' && ico[2] === 'azul' && ico[3] === 'grafito' && ico[4] === '' && ico[5] === 'manifest.webmanifest' && ico[6] === '', `el color elegido llega al manifest sin cambiar su dirección (${ico.join(', ')})`);
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
  const sc = await p.evaluate(async c => { S.cat = c; S.ft = {}; render(); const hit = new Set(), of = window.fetch; window.fetch = (u, o) => { const m = String(u).match(/\/p\/([^/]+)/); if (m) hit.add(m[1]); return of(u, o) }; refresh(); await new Promise(r => setTimeout(r, 300)); while (S.loading) await new Promise(r => setTimeout(r, 100)); window.fetch = of; S.cat = 'Todas'; render(); return [hit.size, S.src.filter(x => x.on && x.cat === c).length] }, cats[1]);
  ok(await p.evaluate(() => /nuevas|Sin noticias nuevas|no ha|no han/.test(document.querySelector('.toast')?.textContent || '')), 'al actualizar a mano avisa del resultado');
  ok(sc[0] <= sc[1] + 1, `actualizar en una categoría solo pide sus fuentes (${sc[0]} sitios para ${sc[1]} fuentes)`);

  // 9) A prueba de fallos: cancelar una comprobación, una actualización que revienta y datos guardados dañados
  const cx = await p.evaluate(async () => { const o = window.check; window.check = () => new Promise(r => setTimeout(() => r({ items: [{ id: 'https://x.test/1', link: 'https://x.test/1', title: 'x', date: Date.now(), src: 'Tardía', cat: 'General' }], url: 'https://tardia.test/feed/', via: 'feed' }), 600));
    document.querySelector('#adb').click(); document.querySelector('#an').value = 'Tardía'; document.querySelector('#au').value = 'https://tardia.test/feed/'; document.querySelector('#aa').click();
    await new Promise(r => setTimeout(r, 100)); document.querySelector('#ac2').click(); await new Promise(r => setTimeout(r, 900)); window.check = o; return S.src.some(x => x.name === 'Tardía') });
  ok(!cx, 'cancelar mientras se comprueba no añade la fuente');
  const lf = await p.evaluate(async () => { const o = window.pool; window.pool = () => { throw Error('fallo simulado') }; S.ft = {}; await load(); window.pool = o; return { loading: S.loading, spin: document.body.classList.contains('ld'), log: LG.evs.some(e => /fallo simulado/.test(e.m)) } });
  ok(!lf.loading && !lf.spin && lf.log, `si una actualización revienta no se queda colgada y queda en el registro (${JSON.stringify(lf)})`);
  // Guardado en dos partes: lista ligera + textos aparte; al reabrir, los textos vuelven
  await p.evaluate(async () => { saveNews(); await new Promise(r => setTimeout(r, 600)) });
  const st1 = await p.evaluate(async () => { const n = await DB.get('nz_news'), b = await DB.get('nz_body'); return { light: n.every(a => !a.html), bodies: b ? Object.keys(b).length : 0 } });
  await p.reload(); await idle(); await p.waitForFunction(() => S.bodyOk, null, { timeout: 10000 });
  const st2 = await p.evaluate(() => { const a = S.news.find(x => x.html); if (!a) return { ok: false }; open(a); const t = document.querySelector('#art .body').textContent; hide(); return { ok: t.length > 0, n: S.news.filter(x => x.html).length } });
  ok(st1.light && st1.bodies > 10 && st2.ok, `abre leyendo solo la lista y recupera los textos después (${st1.bodies} textos, ${st2.n} con texto tras reabrir)`);
  await p.evaluate(async () => { await DB.set('nz_dis', [1, 2, ['a', 5]]); await DB.set('nz_news', [...S.news.slice(0, 20), null, { id: 7 }, { id: 'z', title: 'z', date: 'nope' }]); await DB.set('nz_seen', 'roto') });
  await p.reload(); await idle();
  const cr = await p.evaluate(() => ({ cards: document.querySelectorAll('#grid .card').length, dis: S.dis.size }));
  ok(cr.cards > 5 && cr.dis === 1, `arranca con datos guardados dañados (${cr.cards} tarjetas, ${cr.dis} descartadas válidas)`);
  const cq = await p.evaluate(async () => { try { await viaProxy('https://cuota.test/feed/', { name: 'q', cat: 'q' }) } catch (e) { } return why('cuota.test') });
  ok(/límite diario gratuito de Cloudflare/.test(cq), `distingue el límite de Cloudflare de un fallo de la web (${cq.slice(0, 50)})`);
  await ctx.setOffline(true);
  const off = await p.evaluate(async () => { const h = JSON.stringify(S.hl); refresh(); await new Promise(r => setTimeout(r, 300)); return { same: JSON.stringify(S.hl) === h, loading: S.loading, t: document.querySelector('.toast')?.textContent || '' } });
  await ctx.setOffline(false);
  ok(off.same && !off.loading && /Sin conexión/.test(off.t), 'sin red no intenta actualizar ni marca fuentes como rotas');
  const fn = await p.evaluate(() => { const now = Date.now(), L = []; for (let i = 0; i < 5000; i++) L.push({ id: 'g' + i, src: 'Agencia', date: now - i * 6e4 }); for (let i = 0; i < 10; i++) L.push({ id: 's' + i, src: 'Blog', date: now - (5 + i * 3) * 864e5 });
    L.sort((a, b) => b.date - a.date); const r = fairNews(L); return { n: r.length, blog: r.filter(a => a.src === 'Blog').length } });
  ok(fn.n === 4000 && fn.blog === 10, `el cupo de noticias no echa a las fuentes que publican poco (${JSON.stringify(fn)})`);
  ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  try {
    console.log('\n== Proxy (_worker.js)'); await workerTest();
    await run(browser, 'Móvil (412×915)', { width: 412, height: 915 }, true);
    await run(browser, 'PC (1366×850)', { width: 1366, height: 850 }, false);
  } catch (e) { fails.push('la prueba se interrumpió: ' + e.message); console.log(e); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} fallo(s):\n- ${fails.join('\n- ')}` : '\nTodo correcto');
  process.exit(fails.length ? 1 : 0);
})();
