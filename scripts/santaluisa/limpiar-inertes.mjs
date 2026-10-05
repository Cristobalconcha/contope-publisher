/**
 * Quita del JSON de un documento las declaraciones que NO DICEN NADA: las que
 * repiten el valor por defecto del navegador.
 *
 * DE DÓNDE SALEN. Al importar el HTML de la portada de Santa Luisa, el editor
 * expandió cada abreviada en todas sus partes y escribió el valor por defecto en
 * cada una. `background: none` quedó como nueve propiedades
 * (`background-position-x: initial`, `background-clip: border-box`…) y
 * `border: none` como trece. El botón de las tres rayas terminó con 45
 * declaraciones cuando quien lo escribió puso trece.
 *
 * Medido el 5 de octubre de 2026 en esa página: 334 de 3.148 declaraciones
 * (11%) son exactamente eso. No es diseño, es ruido de máquina — y es parte de
 * por qué una página tiene 558 reglas y parece imposible de normalizar.
 *
 * LO QUE ESTE GUION NO HACE. No toca los cortes de pantalla. La portada usa 16
 * distintos y parecen de más, pero NACEN DE APARATOS REALES: un iPhone Pro Max
 * apaisado mide 932px, así que un corte en 900 no lo alcanza, y de ahí los pares
 * 900/901 y 860/861. Eso se decide mirando los aparatos, no desde acá.
 * Tampoco toca estructura, ni contenido, ni valores de diseño.
 *
 * LA RED DE SEGURIDAD. Antes y después se mide, para CADA elemento de la página,
 * el valor final de cada propiedad afectada y su geometría. Si aparece una sola
 * diferencia, deshace y no escribe nada. Quitar una declaración es seguro sólo
 * si de verdad no estaba pisando a otra regla, y eso no se razona: se mide.
 *
 *   node limpiar-inertes.mjs <documentId>              simula y mide
 *   node limpiar-inertes.mjs <documentId> --aplicar    escribe si no hay diferencias
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, dormir } from '../piezas/chrome.mjs';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';
const TMP = 'C:/Users/Cristobal concha/wp-local/.limpiar-inertes.php';

const aplicar = process.argv.includes('--aplicar');
const documentId = process.argv.find((a) => !a.startsWith('--') && a.includes('-page-')) || 'ocd-canvas-page-7';
const URL = 'http://localhost:8890/';

/**
 * Propiedad → valores que SON el defecto del navegador.
 * Conservador a propósito: ante la duda, no está en la lista.
 */
const DEFECTO = {
  'background-position-x': ['initial', '0%'],
  'background-position-y': ['initial', '0%'],
  'background-size': ['initial', 'auto'],
  'background-repeat': ['initial', 'repeat'],
  'background-attachment': ['initial', 'scroll'],
  'background-origin': ['initial', 'padding-box'],
  'background-clip': ['initial', 'border-box'],
  'background-image': ['initial'],
  'border-image-source': ['none', 'initial'],
  'border-image-slice': ['100%', 'initial'],
  'border-image-width': ['1', 'initial'],
  'border-image-outset': ['0', 'initial'],
  'border-image-repeat': ['stretch', 'initial'],
  'border-top-width': ['medium'],
  'border-right-width': ['medium'],
  'border-bottom-width': ['medium'],
  'border-left-width': ['medium'],
  'border-top-color': ['currentcolor'],
  'border-right-color': ['currentcolor'],
  'border-bottom-color': ['currentcolor'],
  'border-left-color': ['currentcolor'],
  'transition-behavior': ['normal'],
  'transition-delay': ['0s', 'initial'],
  'transition-timing-function': ['ease', 'initial'],
  'font-style': ['normal'],
  'font-variant': ['normal'],
  'font-stretch': ['normal'],
  'animation-delay': ['0s'],
  'animation-direction': ['normal'],
  'animation-fill-mode': ['none'],
  'animation-play-state': ['running'],
};
const PROPS = Object.keys(DEFECTO);

const php = (cuerpo) => {
  writeFileSync(TMP, `<?php\ndefine('WP_USE_THEMES', false);\nrequire ${JSON.stringify(WP)};\n${cuerpo}\n`);
  const salida = execFileSync(PHP, [TMP], { encoding: 'utf8', maxBuffer: 1e9 });
  unlinkSync(TMP);
  return salida;
};

const leerPD = () => JSON.parse(php(`
global $wpdb;
$pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));
echo get_post_meta($pid, '_cod_canvas_project_data', true);`));

/* ---------------------------------------------------------- la medición --- */
const huella = `JSON.stringify((() => {
  const props = ${JSON.stringify(PROPS)};
  const out = [];
  const todos = document.querySelectorAll('body *');
  for (let i = 0; i < todos.length; i++) {
    const e = todos[i];
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const v = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    for (const p of props) v.push(s.getPropertyValue(p));
    out.push(v.join('|'));
  }
  return out;
})())`;

const medir = async (cdp, evaluar) => {
  await cdp('Page.navigate', { url: URL });
  await esperarLaPagina(evaluar);
  await dormir(3000);
  return JSON.parse(await evaluar(huella));
};

/* ------------------------------------------------------------- el trabajo --- */
const pd = leerPD();
const estilos = pd.styles || [];

let quitadas = 0;
const limpio = JSON.parse(JSON.stringify(pd));
for (const r of (limpio.styles || [])) {
  for (const [p, v] of Object.entries(r.style || {})) {
    const valor = String(v).trim().toLowerCase();
    if (DEFECTO[p] && DEFECTO[p].includes(valor)) { delete r.style[p]; quitadas++; }
  }
}
// Una regla que se queda sin declaraciones ya no pinta nada.
const antesReglas = (limpio.styles || []).length;
limpio.styles = (limpio.styles || []).filter((r) => Object.keys(r.style || {}).length > 0);

console.log(`documento: ${documentId}`);
console.log(`reglas: ${estilos.length} → ${limpio.styles.length}  (${antesReglas - limpio.styles.length} quedaron vacías)`);
console.log(`declaraciones quitadas: ${quitadas}`);

if (!aplicar) {
  console.log('\n(sin --aplicar: no escribo nada)');
  process.exit(0);
}

const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1 });
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

/*
 * DOS MEDICIONES ANTES, no una.
 *
 * La página tiene cosas que se mueven solas —la flechita del «Desliza» hace un
 * vaivén— y entre dos lecturas idénticas ya difieren en un píxel. Sin esto, el
 * guardia le echa la culpa al cambio de algo que habría pasado igual: la primera
 * corrida de este guion deshizo una limpieza correcta por dos elementos de 16x16
 * que se mecen.
 *
 * Así que primero se mide el RUIDO. Lo que cambia sin tocar nada queda fuera de
 * la comparación; todo lo demás se compara exacto.
 */
console.log('\nmido la página ANTES (dos veces, para saber qué se mueve solo)…');
const antes = await medir(cdp, evaluar);
const antes2 = await medir(cdp, evaluar);
const inquietos = new Set();
for (let i = 0; i < antes.length; i++) if (antes[i] !== antes2[i]) inquietos.add(i);
console.log(`  ${antes.length} elementos · ${inquietos.size} se mueven solos y quedan fuera de la comparación`);

console.log('escribo el JSON limpio…');
writeFileSync(TMP + '.json', JSON.stringify(limpio));
php(`
global $wpdb;
$pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));
$repo = new COD_Canvas_Document_Repository();
$nuevo = file_get_contents(${JSON.stringify(TMP + '.json')});
$r = $repo->save(${JSON.stringify(documentId)}, $nuevo,
  (string) get_post_meta($pid, '_cod_canvas_html', true),
  (string) get_post_meta($pid, '_cod_canvas_css', true));
echo is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : 'guardado, revisión ' . $r['revision'];`);

console.log('mido la página DESPUÉS…');
const despues = await medir(cdp, evaluar);

/* ------------------------------------------------------------ el veredicto --- */
const dif = [];
if (antes.length !== despues.length) {
  dif.push(`cambió el número de elementos: ${antes.length} → ${despues.length}`);
} else {
  for (let i = 0; i < antes.length && dif.length < 12; i++) {
    if (inquietos.has(i)) continue;
    if (antes[i] !== despues[i]) {
      const a = antes[i].split('|'), b = despues[i].split('|');
      const campos = ['x', 'y', 'ancho', 'alto', ...PROPS];
      for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) dif.push(`elemento ${i} · ${campos[j]}: «${a[j]}» → «${b[j]}»`);
    }
  }
}

if (dif.length === 0) {
  console.log(`\nSIN DIFERENCIAS en ${antes.length} elementos. La página se ve exactamente igual.`);
  console.log(`Quedó con ${limpio.styles.length} reglas en vez de ${estilos.length}.`);
} else {
  console.log(`\nHAY DIFERENCIAS (${dif.length} de las primeras):`);
  for (const d of dif) console.log('  · ' + d);
  console.log('\nDEVUELVO el JSON original.');
  writeFileSync(TMP + '.json', JSON.stringify(pd));
  console.log(php(`
    global $wpdb;
    $pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));
    $repo = new COD_Canvas_Document_Repository();
    $r = $repo->save(${JSON.stringify(documentId)}, file_get_contents(${JSON.stringify(TMP + '.json')}),
      (string) get_post_meta($pid, '_cod_canvas_html', true),
      (string) get_post_meta($pid, '_cod_canvas_css', true));
    echo is_wp_error($r) ? 'NO PUDE DEVOLVERLO: ' . $r->get_error_message() : 'devuelto, revisión ' . $r['revision'];`));
}
try { unlinkSync(TMP + '.json'); } catch (e) {}
await cerrar();
