/**
 * Saca del sitio ORIGINAL (Divi) el dibujo vectorial de los glifos de sus fuentes
 * de íconos (FontAwesome y ETmodules), para que ContOpe los lleve como formas
 * propias (SVG de Medios) y no como un parecido en otro set.
 *
 * Por qué hace falta: Divi dibuja sus íconos con una FUENTE (un carácter), no con
 * una imagen. ContOpe no lleva fuentes de íconos: lleva SVG. Para que el ícono sea
 * EL MISMO, se lee el contorno del glifo de la propia fuente del sitio.
 *
 * Cómo: abre la página en Chrome, lee de sus hojas de estilo la dirección de cada
 * @font-face de esas familias, pide la versión SVG de esa misma fuente (Divi las
 * publica junto a las otras: fa-solid-900.svg, modules.svg) y toma el trazado de
 * cada glifo pedido. No guarda las fuentes: sólo el contorno de los glifos usados.
 *
 *   node glifos.mjs <url-de-la-pagina> <salida.json> <Familia:u+e050,f217> [<Familia:...>]
 *
 * Salida: { "<Familia>": { "<codepoint-hex>": { d, ancho, alto, ascent } } }
 * donde `d` ya viene con el eje Y invertido (coordenadas de pantalla, 0 arriba).
 * Sólo lee (GET).
 */
import { writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina } from '../../piezas/chrome.mjs';

const [url, salida, ...pedidos] = process.argv.slice(2);
if (!url || !salida || !pedidos.length) { console.error('uso: node glifos.mjs <url> <salida.json> <Familia:e050,f217> ...'); process.exit(1); }
const quiero = {};
for (const p of pedidos) { const [f, lista] = p.split(':'); quiero[f] = lista.split(',').map((x) => x.trim().toLowerCase().replace(/^u\+/, '')); }

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1, movil: false });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await dormir(3000); await esperarLaPagina(evaluar);
  const fuentes = await evaluar(`(() => {
    const out = {};
    for (const h of document.styleSheets) {
      let reglas; try { reglas = h.cssRules; } catch (e) { continue; }
      for (const r of reglas) {
        if (r.type !== CSSRule.FONT_FACE_RULE) continue;
        const fam = r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
        const src = r.style.getPropertyValue('src');
        const urls = [...src.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)].map((m) => new URL(m[1], h.href || location.href).href);
        (out[fam] ||= []).push(...urls);
      }
    }
    return out;
  })()`);
  const resultado = {};
  for (const [familia, codigos] of Object.entries(quiero)) {
    const urls = fuentes[familia] || [];
    if (!urls.length) { console.error(`sin @font-face para «${familia}»; hay: ${Object.keys(fuentes).join(', ')}`); continue; }
    // La versión SVG de la misma fuente, junto a las demás.
    const candidatas = [...new Set(urls.map((u) => u.replace(/\.(woff2|woff|ttf|eot|otf)(\?.*)?$/i, '.svg')))].filter((u) => u.endsWith('.svg'));
    // Una familia puede tener varias fuentes (FontAwesome: regular, solid, brands): se busca cada glifo en la que lo traiga.
    const svgs = [];
    for (const c of candidatas) {
      const r = await evaluar(`fetch(${JSON.stringify(c)}).then((r) => r.ok ? r.text() : null).catch(() => null)`);
      if (r && r.includes('<glyph')) svgs.push({ url: c, svg: r });
    }
    if (!svgs.length) { console.error(`no hay versión SVG de «${familia}» (probé ${candidatas.join(', ')})`); continue; }
    resultado[familia] = {};
    for (const cp of codigos) {
      const hex = parseInt(cp, 16);
      const c = String.fromCodePoint(hex);
      const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('<glyph\\b[^>]*?unicode="(?:&#x' + hex.toString(16) + ';|' + escapar(c) + ')"[^>]*>', 'i');
      const hallado = svgs.map((f) => ({ f, m: f.svg.match(re) })).find((x) => x.m);
      if (!hallado) { console.error(`«${familia}» no trae el glifo U+${cp} (miré ${svgs.map((f) => f.url.split('/').pop()).join(', ')})`); continue; }
      const { svg, url: usada } = hallado.f;
      const upm = Number((svg.match(/units-per-em="([\d.]+)"/) || [])[1] || 1000);
      const ascent = Number((svg.match(/ascent="([\d.-]+)"/) || [])[1] || upm * 0.8);
      const descent = Number((svg.match(/descent="([\d.-]+)"/) || [])[1] || -(upm - ascent));
      const anchoDef = Number((svg.match(/horiz-adv-x="([\d.]+)"/) || [])[1] || upm);
      const etiqueta = hallado.m[0];
      const d = (etiqueta.match(/\sd="([^"]*)"/) || [])[1] || '';
      const adv = Number((etiqueta.match(/horiz-adv-x="([\d.]+)"/) || [])[1] || anchoDef);
      resultado[familia][cp] = { fuente: usada, d: voltear(d, ascent), ancho: adv, alto: ascent - descent, ascent };
    }
  }
  writeFileSync(salida, JSON.stringify(resultado, null, 1));
  console.log(Object.entries(resultado).map(([f, v]) => `${f}: ${Object.entries(v).map(([k, g]) => `${k} (${g.fuente.split('/').pop()})`).join(', ')}`).join('\n'));
} finally { await cerrar(); }

/** Invierte el eje Y de un trazado de fuente SVG (Y hacia arriba, baseline en 0) a coordenadas de pantalla. */
function voltear(d, ascent) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const num = (n) => String(Math.round(n * 1000) / 1000);
  let i = 0; let cmd = ''; const out = [];
  const lee = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { out.push('Z'); continue; }
    const y = (v) => (rel ? -v : ascent - v);
    if (C === 'M' || C === 'L' || C === 'T') { const x = lee(); const v = lee(); out.push(cmd + num(x) + ' ' + num(out.length === 0 ? ascent - v : y(v))); if (C === 'M') cmd = rel ? 'l' : 'L'; }
    else if (C === 'H') { out.push(cmd + num(lee())); }
    else if (C === 'V') { out.push(cmd + num(y(lee()))); }
    else if (C === 'Q' || C === 'S') { const a = lee(); const b = lee(); const c = lee(); const e = lee(); out.push(cmd + num(a) + ' ' + num(y(b)) + ' ' + num(c) + ' ' + num(y(e))); }
    else if (C === 'C') { const a = lee(); const b = lee(); const c = lee(); const e = lee(); const f = lee(); const g = lee(); out.push(cmd + num(a) + ' ' + num(y(b)) + ' ' + num(c) + ' ' + num(y(e)) + ' ' + num(f) + ' ' + num(y(g))); }
    else if (C === 'A') { const rx = lee(); const ry = lee(); const rot = lee(); const fa = lee(); const fs = lee(); const x = lee(); const v = lee(); out.push(cmd + [rx, ry, rot, fa, 1 - fs].map(num).join(' ') + ' ' + num(x) + ' ' + num(y(v))); }
    else { throw new Error('comando de trazado no previsto: ' + cmd); }
  }
  return out.join('');
}
