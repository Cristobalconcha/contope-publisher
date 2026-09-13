/**
 * PHP no se queja si a un método le pasan argumentos de más, y convierte tipos
 * en silencio. Por eso un llamado con el orden equivocado no explota: entrega
 * un resultado absurdo y el error termina culpando a otra cosa.
 *
 * Pasó de verdad (2026-09-13): el servicio MCP llamaba a
 * publish($page_id, $document_id, ...) cuando debía llamar a
 * publish_existing_if_revision(...). El número de página entraba como
 * identificador de documento, el documento salía vacío, y
 * cod_publish_canvas_page respondía "Guarda contenido en el Canvas antes de
 * publicarlo" para un documento que sí tenía contenido. La herramienta nunca
 * funcionó y el mensaje acusaba al contenido en vez de al llamado.
 *
 * Esta prueba compara cada llamado a un método del propio plugin contra las
 * firmas declaradas con ese nombre.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = 'contope-publisher/includes';
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.php'));

// Un mismo nombre puede estar declarado en varias clases con distinta cantidad
// de argumentos (resolve() lo está en tres). Sin resolver el tipo del receptor
// no se puede saber cuál corresponde, así que se guardan TODAS y sólo se acusa
// un llamado que no calce con NINGUNA. Deja pasar el caso raro en que otra
// clase acepta por casualidad ese número; a cambio, no da falsas alarmas, que
// es lo que haría que la prueba se empiece a ignorar.
const firmas = new Map();

for (const f of archivos) {
  const src = readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(/function\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const nombre = m[1];
    const anotar = (v) => {
      if (!firmas.has(nombre)) firmas.set(nombre, []);
      firmas.get(nombre).push(v);
    };
    const crudo = m[2].trim();
    if (crudo === '') { anotar({ min: 0, max: 0, archivo: f }); continue; }
    const partes = [];
    let nivel = 0, actual = '';
    for (const ch of crudo) {
      if ('([{'.includes(ch)) nivel += 1;
      if (')]}'.includes(ch)) nivel -= 1;
      if (ch === ',' && nivel === 0) { partes.push(actual); actual = ''; } else actual += ch;
    }
    partes.push(actual);
    const variadico = partes.some((p) => p.includes('...'));
    const opcionales = partes.filter((p) => p.includes('=')).length;
    anotar({ min: partes.length - opcionales, max: variadico ? Infinity : partes.length, archivo: f });
  }
}

let fallas = 0;
let revisados = 0;
for (const f of archivos) {
  const src = readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(/\$this->[a-z_]+->([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const nombre = m[1];
    const candidatas = firmas.get(nombre);
    if (!candidatas) continue; // método de WordPress o de otra librería
    let i = m.index + m[0].length, nivel = 1, args = 0, vacio = true;
    while (i < src.length && nivel > 0) {
      const ch = src[i];
      if ('([{'.includes(ch)) nivel += 1;
      else if (')]}'.includes(ch)) { nivel -= 1; if (nivel === 0) break; }
      else if (ch === ',' && nivel === 1) { args += 1; vacio = false; }
      else if (!/\s/.test(ch)) vacio = false;
      i += 1;
    }
    if (!vacio) args += 1;
    revisados += 1;
    if (!candidatas.some((c) => args >= c.min && args <= c.max)) {
      const linea = src.slice(0, m.index).split('\n').length;
      const detalle = candidatas
        .map((c) => c.min + (c.max === c.min ? '' : '..' + c.max) + ' en ' + c.archivo)
        .join(' | ');
      console.log('  FALLA  ' + f + ':' + linea + '  ->' + nombre + '() recibe ' + args +
                  ' argumentos; se declara con ' + detalle);
      fallas += 1;
    }
  }
}

console.log('\n' + revisados + ' llamados revisados · ' +
  (fallas === 0 ? 'ninguno con el número equivocado de argumentos' : fallas + ' con problemas'));
process.exit(fallas === 0 ? 0 : 1);
