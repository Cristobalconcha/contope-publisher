#!/usr/bin/env node
/**
 * auditar-abreviadas.mjs — busca estilos que se perdieron sin que nadie lo viera.
 *
 * POR QUÉ EXISTE: GrapesJS expande las declaraciones abreviadas a sus partes y,
 * cuando la abreviada usa una variable (`background: var(--tierra-50)`), no puede
 * resolverla y la DESCARTA. La regla sigue existiendo, solo que sin esa
 * declaración, así que ninguna comparación por selectores lo detecta. El bloque
 * de preguntas frecuentes se quedó sin fondo el 8 de septiembre por esto y se
 * descubrió recién al día siguiente, mirando la página en un teléfono.
 *
 * QUÉ COMPARA: el documento publicado contra el respaldo local más antiguo de
 * esa misma página. No cambia nada: solo informa.
 *
 * QUÉ NO CUBRE, y hay que decirlo cada vez:
 *   - Los bloques @media se dejan fuera. Una expresión regular no sabe leer
 *     bloques anidados y, si se los deja, lee mal lo de adentro y lo da por
 *     perdido aunque esté. Se informa cuántos quedaron sin revisar.
 *   - Una abreviada que se expandió correctamente NO es una pérdida: `margin`
 *     se convierte en cuatro `margin-*`, y `background` en `background-color`.
 *     Solo se reporta cuando no queda ninguna de sus partes.
 *   - Un valor que cambió de forma (de `var(--x)` a su color literal) tampoco
 *     es una pérdida: la declaración sigue ahí.
 *
 * Un aviso falso gasta el tiempo de quien lo revisa y le quita crédito a los
 * verdaderos, así que ante la duda no se reporta.
 *
 * Uso:  node scripts/auditar-abreviadas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirRunner = path.join(aqui, 'cod-grapes-runner');
const backups = path.join(dirRunner, 'backups');
const cfg = JSON.parse(fs.readFileSync(path.join(dirRunner, 'cod-grapes-runner.config.json'), 'utf8'));
const ep = cfg.siteUrl.replace(/\/+$/, '') + '/wp-json/contope/v1/mcp';
const auth = 'Basic ' + Buffer.from(
  cfg.username + ':' + cfg.applicationPassword.replace(/\s+/g, '')).toString('base64');

const PAGINAS = [
  { pageId: 43, documentId: 'cod-canvas-page-7', nombre: 'Inicio' },
  { pageId: 44, documentId: 'cod-canvas-page-14', nombre: 'Contacto' },
  { pageId: 45, documentId: 'cod-canvas-page-12', nombre: 'Preguntas frecuentes' },
  { pageId: 46, documentId: 'cod-canvas-page-10', nombre: 'Diferenciales' },
  // El documento compartido no es una página: su CSS se carga en TODAS.
  { pageId: 0, documentId: 'cod-shared-styles', nombre: 'Compartido (todas las páginas)' },
];

/** Las que duelen al perderse: dejan un bloque sin fondo, sin borde o sin color. */
const IMPORTAN = new Set([
  'background', 'background-color', 'color', 'border', 'border-color',
  'box-shadow', 'fill', 'stroke', 'font', 'outline',
]);

/** Partes que dejan las abreviadas al expandirse. Si queda una, no se perdió. */
const PARTES = {
  background: ['background-color', 'background-image'],
  border: ['border-top-width', 'border-top-color', 'border-top-style', 'border-width', 'border-color'],
  font: ['font-size', 'font-family', 'font-weight'],
  outline: ['outline-width', 'outline-color', 'outline-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saca los bloques @media enteros; devuelve el resto y cuántos quitó. */
function sinMedia(css) {
  let texto = String(css || '');
  let quitados = 0;
  let i = texto.indexOf('@media');
  while (i >= 0) {
    const abre = texto.indexOf('{', i);
    if (abre < 0) break;
    let prof = 1;
    let j = abre + 1;
    while (j < texto.length && prof > 0) {
      if (texto[j] === '{') prof += 1;
      else if (texto[j] === '}') prof -= 1;
      j += 1;
    }
    texto = texto.slice(0, i) + texto.slice(j);
    quitados += 1;
    i = texto.indexOf('@media');
  }
  return { texto, quitados };
}

function declaraciones(css) {
  const mapa = new Map();
  for (const m of String(css || '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    if (!sel || sel.startsWith('@')) continue;
    const props = mapa.get(sel) || new Map();
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i <= 0) continue;
      props.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
    }
    mapa.set(sel, props);
  }
  return mapa;
}

/** ¿Sigue existiendo esta declaración, en su forma o en la de sus partes? */
function siguePresente(prop, ahora) {
  if (ahora.has(prop)) return true;
  const partes = PARTES[prop];
  if (!partes) return false;
  return partes.some((p) => ahora.has(p));
}

async function leer(pageId, documentId) {
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          jsonrpc: '2.0', id: i, method: 'tools/call',
          params: { name: 'cod_read_canvas_document', arguments: { pageId, documentId } },
        }),
      });
      return (await r.json()).result.structuredContent;
    } catch (e) { if (i === 4) throw e; await esperar(1500 * i); }
  }
  return null;
}

(async () => {
  let total = 0;
  for (const p of PAGINAS) {
    // Ordenar por NOMBRE pone 'rev11' antes que 'rev7' y hace comparar contra un
    // respaldo que ya venía dañado: así se escapó el fondo del botón de WhatsApp
    // de preguntas frecuentes. Se ordena por el número de revisión.
    const porNumeroDeRevision = (f) => Number((f.match(/-rev(\d+)-/) || [])[1] || 0);
    const respaldos = fs.readdirSync(backups)
      .filter((f) => f.startsWith(p.documentId + '-rev') && f.endsWith('.json'))
      .sort((a, b) => porNumeroDeRevision(a) - porNumeroDeRevision(b));
    if (!respaldos.length) { console.log(p.nombre + ': sin respaldos para comparar\n'); continue; }

    const viejo = JSON.parse(fs.readFileSync(path.join(backups, respaldos[0]), 'utf8'));
    const actual = await leer(p.pageId, p.documentId);
    const limpioAntes = sinMedia(viejo.css);
    const limpioAhora = sinMedia(actual.css);
    const antes = declaraciones(limpioAntes.texto);
    const ahora = declaraciones(limpioAhora.texto);

    const perdidas = [];
    for (const [sel, props] of antes) {
      const actuales = ahora.get(sel);
      // Un selector ausente puede haberse renombrado o ser de un SVG reemplazado:
      // eso no se reporta como pérdida de estilo, que es lo que busca esta revisión.
      if (!actuales) continue;
      for (const prop of props.keys()) {
        if (!IMPORTAN.has(prop)) continue;
        if (siguePresente(prop, actuales)) continue;
        const valor = props.get(prop);
        perdidas.push('  ' + sel + '  →  ' + prop + ': ' + valor
          + (valor.includes('var(') ? '   ← abreviada con variable' : ''));
      }
    }

    console.log(p.nombre + '  (contra ' + respaldos[0].replace(p.documentId + '-', '').slice(0, 24) + ')');
    if (limpioAhora.quitados) {
      console.log('  sin revisar: ' + limpioAhora.quitados + ' bloque(s) @media');
    }
    if (!perdidas.length) console.log('  nada perdido');
    else { perdidas.forEach((l) => console.log(l)); total += perdidas.length; }
    console.log('');
  }
  console.log(total ? 'A REVISAR: ' + total + ' — confirmar en la página antes de actuar.'
    : 'Ninguna declaración perdida.');
})();
