// Genera los iconos y manifests por color (site/ic/*.png, site/manifest-<color>.webmanifest).
// El color de cada uno sale del mismo cálculo que usa la app (nzAcc), así el icono coincide con la cabecera.
// Uso: PW_EXE=/opt/pw-browsers/chromium NODE_PATH=$(npm root -g) node tools/iconos.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// En colores oscuros (poco contraste con la «n» negra) la «n» va en blanco y el pulso lleva un borde del color de fondo.
const PULSE = 'M7 41H25L29 29L34 51L38 36L41 41H57';
const glyph = (c, lt) => `<path d="M21.5 17.5V50M21.5 34C21.5 25 27 22 33 22C40 22 44 26.5 44 33V50" fill="none" stroke="${lt ? '#fff' : '#06150f'}" stroke-width="9"/>` +
  (lt ? `<path d="${PULSE}" fill="none" stroke="${c}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
  `<path d="${PULSE}" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = ([c, lt], mask) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` + (mask
  ? `<rect width="64" height="64" fill="${c}"/><g transform="translate(32 32) scale(.8) translate(-32 -32)">${glyph(c, lt)}</g>`
  : `<rect width="64" height="64" rx="15" fill="${c}"/>${glyph(c, lt)}`) + `</svg>`;
(async () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const pre = eval(html.match(/const PRE=(\[\[.*?\]\]);/)[1]);
  const b = await chromium.launch({ executablePath: process.env.PW_EXE || undefined });
  const p = await b.newPage();
  await p.setContent('<script>' + html.match(/<script>([\s\S]*?window\.nzApply)/)[1].replace(/window\.nzApply$/, '') + '</script>');
  const base = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8'));
  fs.mkdirSync(path.join(SITE, 'ic'), { recursive: true });
  const shot = async (s, n, file) => {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<style>*{margin:0}svg{display:block;width:${n}px;height:${n}px}</style>${s}`);
    await p.screenshot({ path: file, omitBackground: true });
  };
  const cols = await p.evaluate(pre => Object.fromEntries(pre.filter(x => x[1] != null).map(([n, h, s]) => [n, [nzAcc(h, s).fav, nzAcc(h, s).lt]])), pre);
  const out = {};
  for (const [name, h, s] of pre) {
    if (h == null) continue; // Esmeralda = iconos de siempre en la raíz
    const k = slug(name);
    const c = cols[name];
    for (const n of [192, 512]) await shot(svg(c, false), n, path.join(SITE, 'ic', `${k}-${n}.png`));
    await shot(svg(c, true), 512, path.join(SITE, 'ic', `${k}-mask.png`));
    await shot(svg(c, true), 180, path.join(SITE, 'ic', `${k}-apple.png`));
    const m = JSON.parse(JSON.stringify(base));
    m.icons = [{ src: `ic/${k}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: `ic/${k}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: `ic/${k}-mask.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }];
    m.theme_color = c[0];
    m.shortcuts.forEach(x => x.icons = [{ src: `ic/${k}-192.png`, sizes: '192x192', type: 'image/png' }]);
    fs.writeFileSync(path.join(SITE, `manifest-${k}.webmanifest`), JSON.stringify(m, null, 2) + '\n');
    out[k] = c.join(' ');
  }
  console.log(out);
  await b.close();
})();
