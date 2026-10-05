/**
 * Guarda en la BIBLIOTECA DE MÓDULOS del plugin las tres piezas generadas de la
 * portada: el mapa de ubicación, el plano de lotes y el visor del recorrido 360.
 *
 * POR QUÉ ESTO EXISTE. Esas tres no son contenido que alguien escriba. El mapa
 * de ubicación lo produce `build-geo-map.mjs` consultando OpenStreetMap y son
 * 2.642 nodos; el plano de lotes es un dibujo con sus zonas sensibles; el visor
 * es el recorrido alojado en el propio sitio. Mientras vivieran dentro del
 * marcado de la portada, esa página no se podía componer —y por eso siguió
 * siendo 281 KB de HTML suelto meses después de que todo lo demás se compusiera.
 *
 * DÓNDE VAN Y POR QUÉ AHÍ. En `COD_Custom_Module_Library`, que es la biblioteca
 * de súper-módulos que el plugin ya tenía: HTML y CSS saneados por el mismo
 * saneador que el resto del documento, con id estable, pensada para viajar entre
 * sitios en un paquete. El 4 de octubre de 2026 empecé a inventar un almacén
 * aparte —archivos sueltos en uploads— y Cristóbal lo paró: *«como que no está
 * declarado, es un módulo del plugin»*. Tenía razón: dos almacenes parten en dos
 * la respuesta a «¿qué módulos tiene este sitio?».
 *
 * CÓMO LAS SACA. Del sitio renderizado, no del archivo: el CSS de cada módulo
 * está repartido en la hoja de la página y la única forma de saber qué reglas le
 * pertenecen es preguntar por las clases que su propio marcado usa. La primera
 * vez filtré por «cod-geo» y el mapa usa «osm-residential»: me llevé 2 reglas de
 * 23 y el mapa habría salido en blanco. Ahora las clases se leen del fragmento.
 *
 *   node guardar-modulos.mjs            muestra qué haría
 *   node guardar-modulos.mjs --guardar  lo guarda en la biblioteca
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, dormir } from '../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const guardar = process.argv.includes('--guardar');
/*
 * De dónde se leen los fragmentos. Por omisión el espejo local. Se puede
 * apuntar a otro sitio con --de <url> y hace falta de verdad: una vez que la
 * portada se compone, el marcado original ya no está en el espejo, así que
 * para volver a sacar un módulo hay que leerlo de donde siga publicado. Es una
 * LECTURA: este guion no escribe nunca en el sitio que lee.
 */
const i = process.argv.indexOf('--de');
const ORIGEN = i >= 0 ? process.argv[i + 1] : 'http://localhost:8890/';
const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';

/**
 * Cada módulo: qué parte de la página es, y cómo se va a llamar en la
 * biblioteca. El rótulo es lo que una persona lee ahí, y su forma de slug es lo
 * que una receta escribe.
 */
const MODULOS = [
  { rotulo: 'Mapa de ubicación', selector: '#ubicacion [data-cod-geo-places]' },
  { rotulo: 'Plano de lotes', selector: '#mapa-interactivo .plano-frame' },
  { rotulo: 'Visor 360', selector: '#recorrido-360' },
];

const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1280, alto: 900, escala: 1 });
await cdp('Page.enable');
await cdp('Page.navigate', { url: ORIGEN });
await esperarLaPagina(evaluar);
await dormir(1500);

const sacados = [];
for (const { rotulo, selector } of MODULOS) {
  const html = await evaluar(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); return e ? e.outerHTML : ''})()`);
  if (!html) {
    console.error(`  ${rotulo}: NO lo encontré con ${selector}`);
    process.exit(1);
  }

  // Las clases e ids que el PROPIO fragmento usa. De ahí sale qué reglas de la
  // hoja le pertenecen; adivinar el prefijo no sirve.
  const clases = [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))].filter(Boolean);
  const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];

  const css = JSON.parse(await evaluar(`JSON.stringify((()=>{
    const clases=${JSON.stringify(clases)}, ids=${JSON.stringify(ids)};
    const toca=(t)=>clases.some(c=>t.includes('.'+c))||ids.some(i=>t.includes('#'+i));
    const out=[];
    for(const s of document.styleSheets){try{for(const r of s.cssRules){
      if(r.selectorText && toca(r.selectorText)){out.push(r.cssText);continue;}
      if(r.media&&r.cssRules){const d=[...r.cssRules].filter(x=>x.selectorText&&toca(x.selectorText));
        if(d.length) out.push('@media '+r.conditionText+'{'+d.map(x=>x.cssText).join('')+'}');}
    }}catch(e){}}
    return out})())`)).join('\n');

  /*
   * UN MÓDULO NO LLEVA EL TÍTULO DE SU SECCIÓN. El título es contenido de la
   * página y lo dice la composición; si además viaja dentro del módulo, la
   * página lo dice dos veces —y con otro tamaño, porque el de adentro no pasa
   * por la escala—. Pasó de verdad: la portada quedó con «Ven a elegir tu
   * terreno» dos veces, una a 58/36 y otra a 55/34, y lo acusó
   * probar-escala-de-titulos.mjs.
   */
  const limpio = html.replace(/<(h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  sacados.push({ rotulo, html: limpio, css });
  console.log(`  ${rotulo.padEnd(22)} ${String(limpio.length).padStart(7)} B de marcado · ${String(css.length).padStart(6)} B de hoja (${clases.length} clases)`
    + (limpio !== html ? `  ← le quité el título de la sección` : ``));
}
await cerrar();

if (!guardar) {
  console.log('\n(sin --guardar: no escribí nada)');
  process.exit(0);
}

/*
 * El guardado va por PHP porque la biblioteca es una opción de WordPress y su
 * clase es quien sabe darle forma a una entrada —id estable, saneado, el
 * esquema de propiedades cruzado con el marcado—. Escribir la opción a mano
 * desde fuera sería saltarse justamente eso.
 */
const payload = path.join(aqui, '.modulos.json');
writeFileSync(payload, JSON.stringify(sacados));
const php = `<?php
define('WP_USE_THEMES', false);
require ${JSON.stringify(WP)};
$biblioteca = new COD_Custom_Module_Library();
$entradas = json_decode(file_get_contents(${JSON.stringify(payload)}), true);
$existentes = [];
foreach ($biblioteca->list_all() as $m) { $existentes[sanitize_title($m['label'])] = $m['id']; }
foreach ($entradas as $e) {
    $slug = sanitize_title($e['rotulo']);
    if (isset($existentes[$slug])) {
        printf("  %-22s ya estaba (%s)\\n", $e['rotulo'], $existentes[$slug]);
        continue;
    }
    $guardado = $biblioteca->save($e['rotulo'], 'Módulos generados', $e['html'], $e['css']);
    printf("  %-22s guardado como %s\\n", $e['rotulo'], $guardado['id']);
}
`;
const guion = path.join(aqui, '.guardar-modulos.php');
writeFileSync(guion, php);
console.log('\nen la biblioteca:');
console.log(execFileSync(PHP, ['-d', 'display_errors=1', guion], { encoding: 'utf8' }).trim());
