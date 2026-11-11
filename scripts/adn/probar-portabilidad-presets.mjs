#!/usr/bin/env node
// La prueba de PORTABILIDAD DE PRESETS de la fase F2 (docs/ESPEC-adn-unica-puerta-y-bloques.md, 3.6 y H11), de punta a punta:
//
//   1. Basis LOCAL (8894): se importa un ADN derivado de su theme.json actual y se EXPORTA el sitio a un .ocdsite.
//   2. Basis LOCAL con el ADN activo, en el navegador: el valor calculado de color de fondo, texto, fuente y tamaños de todos
//      los elementos de las 5 páginas es el de ANTES de F2 (la línea base se pasa con --base), salvo la pila de fuentes
//      ampliada (misma primera familia). Y P2.3: una revisión 2 con otro accent cambia, en el navegador, --cod-color-accent,
//      --wp--preset--color--accent y el fondo del botón; el CONTROL (dos tomas sin importar nada) no cambia.
//   3. Se quita el ADN del local (queda como estaba: sin ADN, modo de la compuerta original).
//   4. Destino LIMPIO (8895; con OCD_DESTINO_PUERTO=8896, el otro) con el theme.json ATRASADO DE PRODUCCIÓN A SOLAS (byte a byte, sin agregarle nada): se importa el paquete y
//      probar-adn-proyeccion.php comprueba que TODO `settings` de wp_get_global_settings() —no sólo los presets: paleta con sus
//      transparencias, degradados, sombras, tamaños y espaciados con el gutter, y el `custom` completo (radius, border, typography,
//      layout, blur, form de 68 variables)— es IGUAL al del local de Basis (salvo los pocos extras que declara
//      scripts/adn/lib/comparar-ajustes.php), más P2.1 a P2.4 y los mapeos; con sus CONTROLES (un valor cambiado, un extra no declarado).
//   5. Ese mismo destino, importado con el paquete CON medios, en el navegador: el valor calculado de todos los elementos de las 5 páginas
//      (escritorio y celular) es el de Basis local, sin lo que no es del diseño (cookies, mapa, formulario, listas de entradas). Es la meta
//      real: que el sitio importado SE VEA igual. CONTROLES: el mismo destino con el ADN pero SIN los estilos de bloque (dim9.req08 y dim9.req09: el relleno de
//      core/group, la proporción de las fotos y el alto de los recuadros por punto de quiebre) se ve distinto, y sin el ADN se ve muy distinto.
//
//   node scripts/adn/probar-portabilidad-presets.mjs --base <medicion-antes.json> [--sin-navegador]
//   OCD_DESTINO_PUERTO=8896 node scripts/adn/probar-portabilidad-presets.mjs --base <medicion-antes.json>
//
// La medición "antes" se toma con:  node scripts/basis/medir-calculados.mjs guardar <archivo>   ANTES de tocar las hojas del tema.
// Sólo escribe en los dos sitios de prueba (Basis local y el destino limpio) y los deja como estaban.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// El destino limpio: 8895 por omisión; `OCD_DESTINO_PUERTO=8896` usa otro independiente (ver scripts/paquete/crear-destino-limpio.mjs).
const PUERTO_DESTINO = Number(process.env['OCD_DESTINO_PUERTO'] ?? 8895);
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
  r = local('exportar-paquete', SIN_NAVEGADOR ? [zip] : [zip, '--con-medios']);
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
const pr = php(path.join(raiz, 'scripts', 'probar-adn-proyeccion.php'), [], { COD_F2_PAQUETE: zip, OCD_DESTINO_PUERTO: String(PUERTO_DESTINO) });
console.log(pr.salida.split('\n').map((l) => '  ' + l).join('\n'));
paso(pr.codigo === 0, 'probar-adn-proyeccion.php con el paquete real: settings y custom completos iguales al local, P2.1 a P2.4 y mapeos', `código ${pr.codigo}`);

if (!SIN_NAVEGADOR) {
  console.log(`\n-- 5. el sitio IMPORTADO, en el navegador: los valores calculados de las 5 páginas son los de Basis local (destino ${PUERTO_DESTINO}) --`);
  const URL_DESTINO = `http://localhost:${PUERTO_DESTINO}`;
  const WP_LOAD = path.join(raiz, '..', PUERTO_DESTINO === 8895 ? 'wp-local-f1b-destino' : `wp-local-f1b-destino-${PUERTO_DESTINO}`, 'wordpress', 'wp-load.php');
  const destino = (accion, extra = []) => {
    const r = php(path.join(aqui, 'f2-destino.php'), [WP_LOAD, accion, ...extra]);
    const linea = r.salida.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    let datos = {};
    try { datos = JSON.parse(linea); } catch { /* sin JSON */ }
    return { ok: r.codigo === 0 && datos.ok === true, datos, crudo: r.salida };
  };
  const medirSitio = (url, archivo) => spawnSync(process.execPath, [path.join(raiz, 'scripts', 'basis', 'medir-calculados.mjs'), 'guardar', archivo, '--sitio', url], { encoding: 'utf8', cwd: raiz, timeout: 900000 });
  const compararSitios = (a, b) => spawnSync(process.execPath, [path.join(raiz, 'scripts', 'basis', 'medir-calculados.mjs'), 'comparar', a, b, '--sin-ajenos'], { encoding: 'utf8', cwd: raiz, maxBuffer: 16 * 1024 * 1024 });
  const basisConAdn = path.join(tmp, 'con-adn.json'); // lo midió el paso 2 (el local con el ADN activo, que el paso 2 probó igual al de antes de F2)
  const destinoPrueba = async () => {
    const hay = await fetch(`${URL_DESTINO}/wp-login.php`, { redirect: 'manual', signal: AbortSignal.timeout(8000) }).then((r) => r.status === 200, () => false);
    return hay;
  };
  if (!(await destinoPrueba())) {
    paso(false, `el destino ${URL_DESTINO} responde (arráncalo: php -S localhost:${PUERTO_DESTINO} -t <carpeta>\\wordpress)`);
  } else {
    try {
      const imp = destino('importar', [zip]);
      paso(imp.ok && imp.datos.adn?.designId === 'basis-web', 'el destino (con el theme.json atrasado de producción A SOLAS) importa el paquete con medios y queda con el ADN de Basis', imp.crudo);
      const temaDestino = path.join(path.dirname(WP_LOAD), 'wp-content', 'themes', 'contope-basis', 'theme.json');
      const temaAtrasado = path.join(raiz, 'fixtures', 'adn', 'f2', 'basis-theme.destino-atrasado-b7b0478.json');
      const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
      paso(existsSync(temaDestino) && sha(temaDestino) === sha(temaAtrasado), 'el theme.json del destino es el atrasado de producción, byte a byte: no se le agregó ningún bloque ni CSS (lo que se vea igual llegó por el ADN o el paquete)', existsSync(temaDestino) ? sha(temaDestino) : 'no existe ' + temaDestino);
      const conAdn = path.join(tmp, 'destino-con-adn.json');
      let m = medirSitio(URL_DESTINO, conAdn);
      paso(m.status === 0, 'medición de las 5 páginas del destino (escritorio y celular)', m.stdout + m.stderr);
      let c = compararSitios(basisConAdn, conAdn);
      console.log('        ' + c.stdout.trim().split('\n').slice(0, 1).join(''));
      paso(c.status === 0, 'DESTINO == BASIS: color, texto, tamaños, pesos, interlineados, radios, bordes, espaciado y medidas de todos los elementos de las 5 páginas son los de Basis local (sin cookies, mapa, formulario ni listas de entradas)', c.stdout.split('\n').slice(0, 8).join(' | '));
      // CONTROL 1: el mismo destino con el ADN SIN los estilos de bloque (dim9.req08 y dim9.req09) tiene que verse distinto, o esos dos requisitos no estarían
      // haciendo nada: el relleno de core/group (los dos anchos de pantalla) y la proporción de las fotos y el alto de los recuadros del celular.
      const sb = destino('sin-estilos-de-bloque');
      paso(sb.ok && sb.datos.conBloques === false && sb.datos.conCssResponsivo === false, 'CONTROL: se reemplaza el ADN por su revisión siguiente SIN dim9.req08 ni dim9.req09 (lo demás del ADN queda)', sb.crudo);
      const sinBloques = path.join(tmp, 'destino-sin-estilos-de-bloque.json');
      m = medirSitio(URL_DESTINO, sinBloques);
      paso(m.status === 0, 'CONTROL: medición del destino sin los estilos de bloque', m.stdout + m.stderr);
      c = compararSitios(basisConAdn, sinBloques);
      console.log('        ' + c.stdout.trim().split('\n').slice(0, 3).join(' · '));
      paso(c.status === 1 && /por propiedad: .*padding-left/.test(c.stdout) && /por propiedad: .*\bheight\b/.test(c.stdout) && /por ancho: .*1440/.test(c.stdout) && /por ancho: .*393/.test(c.stdout), 'CONTROL: sin los estilos de bloque el destino SE VE distinto: el relleno lateral de core/group (escritorio y celular) y las alturas del celular (fotos y recuadros)', c.stdout.split('\n').slice(0, 4).join(' | '));
      // CONTROL 2: el mismo destino SIN el ADN (el theme.json atrasado a solas) tiene que verse distinto, o la comparación no estaría midiendo nada.
      const q = destino('quitar-adn');
      paso(q.ok && q.datos.activo === false, 'CONTROL: se quita el ADN del destino (el contenido y el theme.json quedan)', q.crudo);
      const sinAdn = path.join(tmp, 'destino-sin-adn.json');
      m = medirSitio(URL_DESTINO, sinAdn);
      paso(m.status === 0, 'CONTROL: medición del destino sin ADN', m.stdout + m.stderr);
      c = compararSitios(basisConAdn, sinAdn);
      const difs = Number((c.stdout.match(/(\d+) diferencias/) ?? [])[1] ?? 0);
      console.log('        ' + c.stdout.trim().split('\n').slice(0, 1).join(''));
      paso(c.status === 1 && difs > 100, 'CONTROL: sin el ADN el destino se ve MUY distinto del local (la comparación de arriba sí mide el diseño)', `código ${c.status}, ${difs} diferencias`);
    } finally {
      const l = destino('limpiar');
      paso(l.ok && l.datos.themeJson === true, 'el destino queda limpio y con el theme.json del repositorio', l.crudo);
    }
  }
}

console.log(malos === 0 ? '\nTODO VERDE' : `\nFALLARON ${malos}`);
process.exit(malos === 0 ? 0 : 1);
