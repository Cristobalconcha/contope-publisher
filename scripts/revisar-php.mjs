#!/usr/bin/env node
/**
 * revisar-php.mjs — comprobación de sintaxis para los PHP del plugin.
 *
 * POR QUÉ EXISTE: esta máquina no tiene PHP instalado, así que no hay `php -l`.
 * Sin eso, un error de sintaxis viaja en el paquete y tumba el sitio entero al
 * activar el plugin. Pasó de verdad el 2026-09-09: una comilla simple dentro de
 * una cadena de comillas simples (` content: ''; `) cerraba la cadena antes de
 * tiempo. Se detectó leyendo el archivo, de casualidad.
 *
 * QUÉ HACE: recorre el archivo carácter a carácter distinguiendo código,
 * cadenas y comentarios, y avisa si algo queda abierto o si los paréntesis,
 * llaves y corchetes no cierran. No es un intérprete —no valida que el código
 * tenga sentido— pero atrapa toda la familia de errores de comillas y balance,
 * que es la que se cuela al editar archivos con scripts.
 *
 * Uso:  node scripts/revisar-php.mjs [carpeta]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BARRA = String.fromCharCode(92);

function revisar(texto) {
  const problemas = [];
  const pila = [];
  const pares = { ')': '(', '}': '{', ']': '[' };
  let estado = 'codigo';
  let delimitador = null;
  let linea = 1;
  let inicioCadena = 0;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    const sig = texto[i + 1];
    if (c === '\n') linea += 1;

    if (estado === 'cadena-simple') {
      if (c === BARRA) { i += 1; continue; }
      if (c === "'") estado = 'codigo';
      continue;
    }
    if (estado === 'cadena-doble') {
      if (c === BARRA) { i += 1; continue; }
      if (c === '"') estado = 'codigo';
      continue;
    }
    if (estado === 'comentario-linea') { if (c === '\n') estado = 'codigo'; continue; }
    if (estado === 'comentario-bloque') { if (c === '*' && sig === '/') { i += 1; estado = 'codigo'; } continue; }
    if (estado === 'heredoc') {
      if (c === '\n') {
        const m = texto.slice(i + 1).match(/^[ \t]*([A-Za-z_][A-Za-z0-9_]*)/);
        if (m && m[1] === delimitador) { estado = 'codigo'; delimitador = null; }
      }
      continue;
    }

    // estado === 'codigo'
    if (c === "'") { estado = 'cadena-simple'; inicioCadena = linea; continue; }
    if (c === '"') { estado = 'cadena-doble'; inicioCadena = linea; continue; }
    if (c === '/' && sig === '/') { estado = 'comentario-linea'; i += 1; continue; }
    if (c === '#') { estado = 'comentario-linea'; continue; }
    if (c === '/' && sig === '*') { estado = 'comentario-bloque'; i += 1; continue; }
    if (c === '<' && texto.slice(i, i + 3) === '<<<') {
      const m = texto.slice(i + 3).match(/^[ \t]*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
      if (m) { estado = 'heredoc'; delimitador = m[1]; inicioCadena = linea; }
      continue;
    }
    if (c === '(' || c === '{' || c === '[') { pila.push({ c, linea }); continue; }
    if (pares[c]) {
      const ultimo = pila.pop();
      if (!ultimo) problemas.push('línea ' + linea + ': sobra un "' + c + '"');
      else if (ultimo.c !== pares[c]) {
        problemas.push('línea ' + linea + ': se cierra con "' + c + '" lo que abrió "'
          + ultimo.c + '" en la línea ' + ultimo.linea);
      }
    }
  }

  if (estado === 'cadena-simple' || estado === 'cadena-doble') {
    problemas.push('quedó una cadena SIN CERRAR que empieza en la línea ' + inicioCadena
      + ' — suele ser una comilla dentro de otra del mismo tipo');
  }
  if (estado === 'heredoc') problemas.push('quedó un bloque de texto sin cerrar desde la línea ' + inicioCadena);
  if (estado === 'comentario-bloque') problemas.push('quedó un comentario sin cerrar');
  for (const abierto of pila) problemas.push('línea ' + abierto.linea + ': "' + abierto.c + '" nunca se cierra');
  return problemas;
}

function archivosPhp(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.git') continue;
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosPhp(ruta));
    else if (nombre.endsWith('.php')) salida.push(ruta);
  }
  return salida;
}

const raiz = process.argv[2] || path.join(process.cwd(), 'open-codesign-publisher');
const archivos = archivosPhp(raiz);
let conProblemas = 0;
for (const archivo of archivos) {
  const texto = readFileSync(archivo, 'utf8');
  if (texto.charCodeAt(0) === 0xFEFF) {
    console.log('✗ ' + path.relative(raiz, archivo) + ': empieza con BOM (deja el sitio en blanco)');
    conProblemas += 1;
    continue;
  }
  const problemas = revisar(texto);
  if (!problemas.length) continue;
  conProblemas += 1;
  console.log('✗ ' + path.relative(raiz, archivo));
  for (const p of problemas.slice(0, 5)) console.log('    ' + p);
}
console.log('\n' + archivos.length + ' archivos revisados · '
  + (conProblemas ? conProblemas + ' CON PROBLEMAS' : 'ninguno con problemas'));
process.exit(conProblemas ? 1 : 0);
