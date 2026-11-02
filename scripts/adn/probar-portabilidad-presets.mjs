#!/usr/bin/env node
// La prueba de PORTABILIDAD DE PRESETS de la fase F2 (docs/ESPEC-adn-unica-puerta-y-bloques.md, 3.6 y H11), de punta a punta:
//
//   1. Basis LOCAL (8894): se importa un ADN derivado de su theme.json actual y se EXPORTA el sitio a un .ocdsite.
//   2. Basis LOCAL con el ADN activo, en el navegador: el valor calculado de color de fondo, texto, fuente y tamaños de todos
//      los elementos de las 5 páginas es el de ANTES de F2 (la línea base se pasa con --base), salvo la pila de fuentes
//      ampliada (misma primera familia). Y P2.3: una revisión 2 con otro accent cambia, en el navegador, --cod-color-accent,
//      --wp--preset--color--accent y el fondo del botón; el CONTROL (dos tomas sin importar nada) no cambia.
//   3. Se quita el ADN del local (queda como estaba: sin ADN, modo de la compuerta original).
//   4. Destino LIMPIO (8895) con un theme.json ATRASADO: se importa el paquete y probar-adn-proyeccion.php comprueba que
//      wp_get_global_settings() da los mismos presets que el local (paleta, familias, tamaños, espaciados, custom.radius…),
//      más P2.1 a P2.4 y los mapeos.
//
//   node scripts/adn/probar-portabilidad-presets.mjs --base <medicion-antes.json> [--sin-navegador]
//
// La medición "antes" se toma con:  node scripts/basis/medir-calculados.mjs guardar <archivo>   ANTES de tocar las hojas del tema.
// Sólo escribe en los dos sitios de prueba (Basis local y el destino limpio) y los deja como estaban.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina } from '../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const INI = 'C:/Users/Cristobal concha/wp-local/php/php.ini';
const args = process.argv.slice(2);
const idxBase = args.indexOf('--base');
const BASE = idxBase >= 0 ? args[idxBase + 1] : '';
const SIN_NAVEGADOR = args.includes('--sin-navegador');
const tmp = mkdtempSync(path.join(tmpdir(), 'f2-portabilidad-'));
const zip = path.join(tmp, 'basis-con-adn.ocdsite');

let malos = 0;
const paso = (ok, texto, detalle = '') => {
  console.log(`  ${ok ? 'ok    ' : 'FALLA '} ${texto}${!ok && detalle ? '   -> ' + detalle : ''}`);
  if (!ok) malos += 1;
};
const php = (script, a = [], env = {}) => {
  const r = spawnSync(PHP, ['-c', INI, script, ...a], { encoding: 'utf8', cwd: raiz, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` };
};
const local = (accion, extra = []) => {
  const r = php(path.join(aqui, 'f2-local.php'), [accion, ...extra]);
  const linea = r.salida.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  let datos = {};
  try { datos = JSON.parse(linea); } catch { /* sin JSON */ }
  return { ok: r.codigo === 0 && datos.ok === true, datos, crudo: r.salida };
};
const medir = async (url, ancho, evaluar) => {
  const nav = await abrirChrome({ ancho, alto: 900 });
  try {
    await nav.cdp('Page.enable');
    await nav.cdp('Page.navigate', { url });
    await nav.dormir(1500);
    await esperarLaPagina(nav.evaluar);
    await nav.evaluar(`(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(s); })()`);
    await nav.dormir(300);
    return await nav.evaluar(evaluar);
  } finally {
    await nav.cerrar();
  }
};
const LEER = `(() => {
  const raiz = getComputedStyle(document.documentElement);
  // El banner de cookies (plugin CookieAdmin) guarda su propio #f26621 en SUS ajustes: no es del diseño ni del ADN, se deja fuera.
  const ajeno = (e) => e.closest('[class*="cookieadmin"], [id*="cookieadmin"]') !== null;
  const contar = (prop, valor) => [...document.querySelectorAll('*')].filter((e) => !ajeno(e) && getComputedStyle(e)[prop] === valor).length;
  return {
    fondoNaranja: contar('backgroundColor', 'rgb(242, 102, 33)'),
    fondoNuevo: contar('backgroundColor', 'rgb(18, 52, 86)'),
    textoNaranja: contar('color', 'rgb(242, 102, 33)'),
    textoNuevo: contar('color', 'rgb(18, 52, 86)'),
    codAccent: raiz.getPropertyValue('--cod-color-accent').trim(),
    wpAccent: raiz.getPropertyValue('--wp--preset--color--accent').trim(),
    codSurface: raiz.getPropertyValue('--cod-color-surface').trim(),
    wpFondo: raiz.getPropertyValue('--wp--preset--color--fondo-pagina').trim(),
    fondoBody: getComputedStyle(document.body).backgroundColor,
  };
})()`;

console.log('\n== portabilidad de presets, de punta a punta ==');
if (!existsSync(PHP)) { console.error('No encuentro php.exe'); process.exit(2); }
if (!SIN_NAVEGADOR && (!BASE || !existsSync(BASE))) {
  console.error('Falta --base <medición de antes de F2> (o --sin-navegador). Sin la línea base no hay con qué comparar.');
  process.exit(2);
}

console.log('\n-- 1. Basis local: importar el ADN derivado y exportar el paquete --');
let r = local('importar-r1');
paso(r.ok, 'el ADN derivado del theme.json de Basis se importa en el local (r1)', r.crudo);
if (!r.ok) process.exit(1);
try {
  r = local('exportar-paquete', [zip]);
  paso(r.ok && r.datos.bytes > 1000, 'el sitio se exporta a un .ocdsite que lleva el ADN', r.crudo);

  if (!SIN_NAVEGADOR) {
    console.log('\n-- 2. Basis local con el ADN activo, valores calculados en el navegador --');
    const med = path.join(tmp, 'con-adn.json');
    let m = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'basis', 'medir-calculados.mjs'), 'guardar', med], { encoding: 'utf8', cwd: raiz, timeout: 600000 });
    paso(m.status === 0, 'medición de las 5 páginas con el ADN activo', m.stdout + m.stderr);
    m = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'basis', 'medir-calculados.mjs'), 'comparar', BASE, med], { encoding: 'utf8', cwd: raiz });
    console.log('        ' + m.stdout.trim().split('\n')[0]);
    paso(m.status === 0, 'con el ADN activo: color de fondo, texto, tamaños y el resto de lo calculado = el de ANTES de F2 (la pila de fuentes sólo se amplía)', m.stdout.split('\n').slice(0, 6).join(' | '));

    const URL = 'http://localhost:8894/';
    const antes = await medir(URL, 1440, LEER);
    const antes2 = await medir(URL, 1440, LEER);
    paso(JSON.stringify(antes) === JSON.stringify(antes2) && antes.codAccent.toUpperCase() === '#F26621' && antes.wpAccent.toUpperCase() === '#F26621', 'CONTROL P2.3: dos tomas sin importar nada dan lo mismo (accent #F26621)', JSON.stringify(antes));
    const c2 = local('importar-r2', ['#123456']);
    paso(c2.ok, 'la revisión 2 (accent #123456) se importa en una sola operación', c2.crudo);
    const despues = await medir(URL, 1440, LEER);
    paso(despues.codAccent.toLowerCase() === '#123456', '--cod-color-accent calculado: #F26621 -> #123456', `${antes.codAccent} -> ${despues.codAccent}`);
    paso(despues.wpAccent.toLowerCase() === '#123456', '--wp--preset--color--accent calculado cambia con ella', `${antes.wpAccent} -> ${despues.wpAccent}`);
    paso(antes.fondoNaranja > 0 && despues.fondoNuevo === antes.fondoNaranja && despues.fondoNaranja === 0, 'todos los elementos con fondo naranja (botones, bloques de opciones) pasan al color nuevo, ninguno se queda con el viejo', `fondo naranja antes ${antes.fondoNaranja}; después naranja ${despues.fondoNaranja} y nuevo ${despues.fondoNuevo}`);
    paso(antes.textoNaranja > 0 && despues.textoNuevo === antes.textoNaranja && despues.textoNaranja === 0, 'y todos los textos naranjas (enlaces, títulos) también', `texto naranja antes ${antes.textoNaranja}; después naranja ${despues.textoNaranja} y nuevo ${despues.textoNuevo}`);
    paso(despues.fondoBody === antes.fondoBody && despues.codSurface === antes.codSurface, 'lo demás no se movió (fondo de la página y --cod-color-surface iguales)', JSON.stringify([antes.fondoBody, despues.fondoBody]));
  }
} finally {
  console.log('\n-- 3. Basis local: se quita el ADN --');
  const q = local('quitar');
  paso(q.ok && q.datos.activo === false, 'el local queda sin ADN y con el modo de la compuerta que tenía', q.crudo);
}

console.log('\n-- 4. destino limpio con theme.json atrasado: se importa el paquete y se comparan los presets --');
const pr = php(path.join(raiz, 'scripts', 'probar-adn-proyeccion.php'), [], { COD_F2_PAQUETE: zip });
console.log(pr.salida.split('\n').map((l) => '  ' + l).join('\n'));
paso(pr.codigo === 0, 'probar-adn-proyeccion.php con el paquete real: P2.1 a P2.4, portabilidad y mapeos', `código ${pr.codigo}`);

console.log(malos === 0 ? '\nTODO VERDE' : `\nFALLARON ${malos}`);
process.exit(malos === 0 ? 0 : 1);
