/**
 * El ritmo de los textos de una página: cuánto aire tiene cada sección por
 * dentro y cuánto separa a cada texto del siguiente.
 *
 * Existe porque «sobra aire» es una impresión, y la impresión no dice cuánto
 * ni dónde. Acá sale el padding de cada sección, y por cada encabezado y
 * párrafo su tamaño, su interlínea y sus márgenes. Dos páginas se comparan
 * valor contra valor, y la corrección deja de ser a tanteo.
 *
 * Uso:
 *   node ritmo-textos.mjs https://econut.cl original-ritmo.json
 *   node ritmo-textos.mjs "http://localhost:8891/?page_id=20" local-ritmo.json
 *   node ritmo-textos.mjs --comparar original-ritmo.json local-ritmo.json
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const ANCHO = Number(process.env.ANCHO || 1900);

if (process.argv[2] === '--comparar') {
  const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));

  console.log('\n=== AIRE DE LAS SECCIONES (padding arriba/abajo) ===');
  console.log(`${'sección'.padEnd(34)} ${'original'.padEnd(18)} nuestra`);
  console.log('-'.repeat(74));
  const n = Math.max(a.secciones.length, b.secciones.length);
  for (let i = 0; i < n; i++) {
    const x = a.secciones[i], y = b.secciones[i];
    const t = (x && x.titulo) || (y && y.titulo) || `#${i}`;
    console.log(`${t.slice(0, 34).padEnd(34)} ${(x ? x.padding : '—').padEnd(18)} ${y ? y.padding : '—'}`);
  }

  console.log('\n=== RITMO DE LOS TEXTOS (tamaño / interlínea / margen abajo) ===');
  console.log(`${'etiqueta'.padEnd(10)} ${'original'.padEnd(30)} nuestra`);
  console.log('-'.repeat(74));
  for (const tag of ['H1', 'H2', 'H3', 'H4', 'P', 'LI']) {
    const f = (d) => {
      const v = d.textos.filter((t) => t.tag === tag);
      if (!v.length) return '—';
      const moda = (k) => {
        const c = {};
        for (const x of v) c[x[k]] = (c[x[k]] || 0) + 1;
        return Object.entries(c).sort((p, q) => q[1] - p[1])[0][0];
      };
      return `${moda('size')} / ${moda('lh')} / ${moda('mb')}  (${v.length})`;
    };
    console.log(`${tag.padEnd(10)} ${f(a).padEnd(30)} ${f(b)}`);
  }
  process.exit(0);
}

const [url, salida] = process.argv.slice(2);
if (!url || !salida) {
  console.error('uso: node ritmo-textos.mjs <url> <salida.json>  |  --comparar <a.json> <b.json>');
  process.exit(1);
}

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 950, escala: 1 });
await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(2500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);
await dormir(1200);

const guion = `(() => {
  const redondo = (v) => Math.round(parseFloat(v) || 0) + 'px';
  const vistos = [];
  const secciones = [];
  for (const el of document.querySelectorAll('.et_pb_section, .cod-section, section')) {
    let dentro = false;
    for (const v of vistos) { if (v.contains(el)) { dentro = true; break; } }
    if (dentro) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 60) continue;
    vistos.push(el);
    const cs = getComputedStyle(el);
    const h = el.querySelector('h1,h2,h3');
    secciones.push({
      titulo: h ? h.textContent.trim().split(/[ \\t\\n\\r]+/).join(' ').slice(0, 40) : '(sin titulo)',
      alto: Math.round(r.height),
      padding: redondo(cs.paddingTop) + ' / ' + redondo(cs.paddingBottom)
    });
  }
  const textos = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li')) {
    const r = el.getBoundingClientRect();
    if (r.height < 4 || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    textos.push({
      tag: el.tagName,
      texto: el.textContent.trim().split(/[ \t\n\r]+/).join(" ").slice(0, 38),
      size: redondo(cs.fontSize),
      lh: redondo(cs.lineHeight),
      mt: redondo(cs.marginTop),
      mb: redondo(cs.marginBottom)
    });
  }
  return { secciones: secciones, textos: textos };
})()`;

const datos = await evaluar(guion);
writeFileSync(salida, JSON.stringify(datos, null, 2));
console.log(`${salida}: ${datos.secciones.length} secciones · ${datos.textos.length} textos`);
await cerrar();
