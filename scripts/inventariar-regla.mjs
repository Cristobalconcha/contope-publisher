#!/usr/bin/env node
/**
 * inventariar-regla.mjs — qué se va a tocar, antes de tocarlo.
 *
 * POR QUÉ EXISTE: modificar un estilo sin saber a qué se aplica hoy es como se
 * pierden propiedades. Tres formas comprobadas de romper algo sin notarlo:
 *
 *   1. `Css.setRule` reemplaza la regla COMPLETA. Lo que no se vuelva a escribir
 *      se pierde, y la regla sigue existiendo, así que nada delata la falta.
 *   2. Una regla que agrupa selectores (`#a, #b { … }`) se disuelve al pasar por
 *      el motor. Reescribirla pensando en uno deja al otro sin ese estilo. Pasó
 *      el 2026-09-09 con el fondo de los mapas: una sección quedó en blanco.
 *   3. Dos reglas con el mismo selector: gana la última. Si un cambio "no se
 *      aplica", suele ser esto.
 *
 * QUÉ HACE: para un selector, recorre las cuatro páginas del sitio y dice dónde
 * está declarado, si viene agrupado con otros, si está declarado más de una vez,
 * y cuántos elementos lo usan en el HTML. No cambia nada.
 *
 * Uso:  node scripts/inventariar-regla.mjs ".ubicacion__maps"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirRunner = path.join(aqui, 'cod-grapes-runner');
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

const buscado = (process.argv[2] || '').trim();
if (!buscado) {
  console.log('Falta el selector. Ejemplo:\n  node scripts/inventariar-regla.mjs ".ubicacion__maps"');
  process.exit(1);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Separa el CSS en dos: lo de primer nivel y lo que vive dentro de cada @media.
 * Importa distinguirlos: dos reglas con el mismo selector no compiten si una
 * solo aplica en cierto ancho de pantalla, y decir "gana la última" ahí sería
 * un aviso falso.
 */
function porContexto(css) {
  const bloques = [];
  let texto = String(css || '');
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
    bloques.push({
      contexto: texto.slice(i, abre).replace(/\s+/g, ' ').trim(),
      css: texto.slice(abre + 1, j - 1),
    });
    texto = texto.slice(0, i) + texto.slice(j);
    i = texto.indexOf('@media');
  }
  bloques.unshift({ contexto: '', css: texto });
  return bloques;
}

/** Todas las declaraciones de reglas cuyo grupo de selectores incluya el buscado. */
function reglasQueLoIncluyen(css) {
  const salida = [];
  for (const bloque of porContexto(css)) {
    for (const m of String(bloque.css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const cabeza = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
      if (!cabeza || cabeza.startsWith('@')) continue;
      const partes = cabeza.split(',').map((s) => s.trim()).filter(Boolean);
      if (!partes.includes(buscado)) continue;
      salida.push({
        cabeza, partes, contexto: bloque.contexto,
        cuerpo: m[2].replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return salida;
}

/** Cuántos elementos del HTML usan esa clase o id. */
function usosEnElHtml(html, selector) {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return (String(html).match(new RegExp('id="' + id + '"', 'g')) || []).length;
  }
  if (selector.startsWith('.')) {
    const clase = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (String(html).match(new RegExp('class="[^"]*\\b' + clase + '\\b', 'g')) || []).length;
  }
  return null;
}

(async () => {
  console.log('Inventario de  ' + buscado + '\n');
  let totalUsos = 0;
  let totalReglas = 0;

  for (const p of PAGINAS) {
    const d = await leer(p.pageId, p.documentId);
    const reglas = reglasQueLoIncluyen(d.css);
    const usos = usosEnElHtml(d.html, buscado);
    if (!reglas.length && !usos) continue;

    console.log(p.nombre);
    console.log('  elementos que lo usan: ' + (usos === null ? 'no aplica' : usos));
    totalUsos += usos || 0;

    if (!reglas.length) {
      console.log('  sin regla propia — hereda de otro lado\n');
      continue;
    }
    totalReglas += reglas.length;
    reglas.forEach((r, i) => {
      const compania = r.partes.filter((s) => s !== buscado);
      console.log('  regla ' + (i + 1) + ' de ' + reglas.length
        + (r.contexto ? '   ' + r.contexto : '   (todas las pantallas)')
        + (compania.length ? '\n     AGRUPADA con: ' + compania.join(', ') : ''));
      console.log('     ' + r.cuerpo.slice(0, 300) + (r.cuerpo.length > 300 ? '…' : ''));
    });
    // Solo compiten las que aplican en el mismo contexto.
    const porMismoContexto = {};
    for (const r of reglas) porMismoContexto[r.contexto] = (porMismoContexto[r.contexto] || 0) + 1;
    for (const [ctx, n] of Object.entries(porMismoContexto)) {
      if (n > 1) {
        console.log('  ⚠ declarado ' + n + ' veces ' + (ctx || 'a todo ancho')
          + ': gana la última, y al reescribirlo hay que devolver TODO lo de las anteriores.');
      }
    }
    if (reglas.some((r) => r.partes.length > 1)) {
      console.log('  ⚠ viene agrupado: al reescribirlo hay que declarar CADA selector del grupo,');
      console.log('    o los otros se quedan sin ese estilo.');
    }
    console.log('');
  }

  if (!totalReglas && !totalUsos) {
    console.log('No aparece en ninguna página. Revisar que el selector esté bien escrito.');
  } else if (!totalUsos) {
    console.log('⚠ Tiene estilo declarado pero NINGÚN elemento lo usa: lo que se escriba no se verá.');
  }
})();
