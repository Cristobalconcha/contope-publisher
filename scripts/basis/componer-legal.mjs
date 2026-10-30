/**
 * La página «Términos y privacidad» de Basis, compuesta con ContOpe.
 *
 * ================== LÉASE ANTES DE PUBLICAR ======================
 * El texto legal NO está validado por un abogado. Se publica igual (así lo pidió
 * Cristóbal) con la nota «Versión en revisión legal» visible arriba, y los
 * [PENDIENTE: …] del borrador quedan a la vista en el texto: es mejor que se
 * vea el hueco que taparlo. La fuente es el borrador, no este archivo:
 *   Sesión Claude/entregables/basis/basis-terminos-BORRADOR.md
 * (se lee desde «TEXTO PUBLICABLE» hacia abajo; las notas internas NO se publican).
 * ================================================================
 *
 * Convierte el Markdown del borrador a nodos: títulos (#, ##, ###), párrafos,
 * listas con viñetas o numeradas y tablas. El énfasis (**negrita**) se quita
 * porque el nodo de texto de ContOpe es texto plano.
 *
 *   node componer-legal.mjs [borrador.md] [salida.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registro } from '../divi-a-contope/lib/registro.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const FUENTE = process.argv[2] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/basis-terminos-BORRADOR.md';
const SALIDA = process.argv[3] || path.join(aqui, 'salida/terminos-y-privacidad.componer.json');

const md = readFileSync(FUENTE, 'utf8').replace(/\r\n/g, '\n');
const marca = md.indexOf('DESDE AQUÍ, TEXTO PUBLICABLE');
if (marca < 0) throw new Error('no encuentro la marca «DESDE AQUÍ, TEXTO PUBLICABLE» en el borrador');
const texto = md.slice(md.indexOf('\n', marca) + 1).replace(/^\s*-->\s*$/m, '');

const reg = new Registro({ referencia: 'basis-terminos-BORRADOR.md', razon: 'Texto del borrador legal de Basis, en revisión; tipografía y colores del sitio medido.' });
let n = 0;
const nodo = (kind, ruleIds, content, children) => { const x = { id: `${kind}-${++n}`, kind, ruleIds }; if (content !== undefined) x.content = content; if (children) x.children = children; return x; };
const limpio = (t) => t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\((?!#)[^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

// Identidad medida de Basis: títulos en Big Shoulders Display (#0E0C19), texto en
// Open Sans (#666666). Los valores salen de scripts/basis/salida/informe y de
// IDENTIDAD.md; el ancho de lectura (760) es una decisión de esta página, que no
// existe en el original.
const tipo = (rol, fam, tam, peso, lh) => reg.R('typography', { role: rol, family: fam, fontSize: tam, fontWeight: peso, lineHeight: lh, align: 'start' }, { prefijo: 't' });
const color = (hex) => reg.R('color', { role: `c-${hex.slice(1).toLowerCase()}`, color: hex, apply: 'text' }, { prefijo: 'c' });
const margen = (ini, fin) => reg.propiedades({ 'margin-block-start': `${ini}px`, 'margin-block-end': `${fin}px` }, {}, { prefijo: 'mg' });
const DISPLAY = "'Big Shoulders Display', sans-serif";
const CUERPO = "'Open Sans', sans-serif";

const rH1 = [tipo('legal-h1', DISPLAY, '50px', 500, 1.2), color('#0E0C19'), ...margen(0, 12)];
const rH1m = reg.R('typography', { role: 'legal-h1', fontSize: '34px' }, { bp: 'mobile', base: rH1[0], prefijo: 't' });
const rH2 = [tipo('legal-h2', DISPLAY, '32px', 500, 1.2), color('#0E0C19'), ...margen(40, 10)];
const rH3 = [tipo('legal-h3', DISPLAY, '24px', 500, 1.2), color('#0E0C19'), ...margen(24, 8)];
const rP = [tipo('legal-p', CUERPO, '16px', 500, 1.7), color('#666666'), ...margen(0, 16)];
const rLista = [...rP, ...reg.propiedades({ 'padding-inline-start': '1.4em' }, {}, { prefijo: 'lista' })];
const rNota = [tipo('legal-nota', CUERPO, '16px', 500, 1.7), color('#333333'), ...reg.propiedades({ 'background-color': '#F4F4F4', 'border-radius': '10px', 'padding-top': '16px', 'padding-right': '20px', 'padding-bottom': '16px', 'padding-left': '20px', 'margin-block-start': '0px', 'margin-block-end': '24px' }, {}, { prefijo: 'nota' })];
const rTabla = [tipo('legal-tabla', CUERPO, '14px', 500, 1.5), color('#666666'), ...reg.propiedades({ width: '100%', 'margin-block-end': '24px' }, {}, { prefijo: 'tabla' })];
const rHoja = reg.propiedades({ width: '100%', 'max-width': '760px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', 'padding-left': '24px', 'padding-right': '24px' }, {}, { prefijo: 'hoja' });
const rSeccion = reg.propiedades({ 'padding-top': '54px', 'padding-bottom': '54px', 'padding-left': '0px', 'padding-right': '0px' }, { mobile: { 'padding-top': '32px', 'padding-bottom': '32px' } }, { prefijo: 'sec' });

const hijos = [];
const lineas = texto.split('\n');
let i = 0;
let primerPrrafoDespuesDelTitulo = true;
while (i < lineas.length) {
  const l = lineas[i];
  if (!l.trim() || /^<!--/.test(l.trim())) { i++; continue; }
  let m;
  if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
    const nivel = m[1].length;
    hijos.push(nodo('heading', nivel === 1 ? [...rH1, rH1m] : nivel === 2 ? rH2 : rH3, { text: limpio(m[2]), level: nivel }));
    i++; continue;
  }
  if (/^\|/.test(l)) {
    const filas = [];
    while (i < lineas.length && /^\|/.test(lineas[i])) { filas.push(lineas[i]); i++; }
    const celdas = (f) => f.replace(/^\||\|\s*$/g, '').split('|').map((c) => limpio(c));
    const cab = celdas(filas[0]);
    const cuerpo = filas.slice(2).map(celdas).map((f) => cab.map((_, k) => f[k] ?? ''));
    hijos.push(nodo('table', rTabla, { headers: cab, rows: cuerpo }));
    continue;
  }
  if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
    const ordenada = /^\s*\d+\./.test(l);
    const items = [];
    while (i < lineas.length && /^\s*([-*]|\d+\.)\s+/.test(lineas[i])) {
      let t = lineas[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
      i++;
      while (i < lineas.length && lineas[i].trim() && /^\s{2,}\S/.test(lineas[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lineas[i])) { t += ' ' + lineas[i].trim(); i++; }
      items.push(limpio(t));
    }
    hijos.push(nodo('list', rLista, { ordered: ordenada, items }));
    continue;
  }
  // párrafo: líneas seguidas hasta una en blanco
  let t = '';
  while (i < lineas.length && lineas[i].trim() && !/^(#{1,3}\s|\||\s*([-*]|\d+\.)\s+)/.test(lineas[i]) && !/^<!--/.test(lineas[i].trim())) { t += (t ? ' ' : '') + lineas[i].trim(); i++; }
  const esNota = primerPrrafoDespuesDelTitulo && /Versión en revisión legal/i.test(t);
  if (esNota) {
    hijos.push(nodo('group', reg.propiedades({ 'background-color': '#F4F4F4', 'border-radius': '10px', 'padding-top': '16px', 'padding-right': '20px', 'padding-bottom': '16px', 'padding-left': '20px', 'margin-block-end': '24px' }, {}, { prefijo: 'nota' }),
      undefined, [nodo('paragraph', [tipo('legal-nota', CUERPO, '16px', 500, 1.7), color('#333333'), ...margen(0, 0)], { text: limpio(t) })]));
  } else hijos.push(nodo('paragraph', rP, { text: limpio(t) }));
  primerPrrafoDespuesDelTitulo = false;
}
void rNota;

const nodes = [nodo('section', rSeccion, undefined, [nodo('group', rHoja, undefined, hijos)])];
const usadas = new Set();
(function v(x) { (x.ruleIds || []).forEach((r) => usadas.add(r)); (x.children || []).forEach(v); })(nodes[0]);
mkdirSync(path.dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify({
  titulo: 'Términos y privacidad', slug: 'terminos-y-privacidad',
  design: { schemaVersion: 1, designId: 'basis-web', expectedDesignRevision: 2, reviewState: 'session', rules: reg.reglas.filter((r) => usadas.has(r.id)) },
  composition: { schemaVersion: 2, nodes },
}, null, 2));
console.log(`terminos-y-privacidad: ${hijos.length} bloques · ${reg.reglas.length} reglas → ${SALIDA}`);
