/**
 * Unifica el TEXTO DE LECTURA de la portada a un solo tamaño.
 *
 * POR QUÉ. La página decía el mismo texto de diecinueve maneras distintas, todas
 * entre 13 y 15 px, una por sección: `historia__copy p` en 14, `faq__item p` en
 * 13,5, `exit-card__desc` en 13… Mismo papel, mismo color, misma interlínea
 * proporcional, misma columna. La diferencia no la ve nadie y no responde a
 * ninguna decisión: es que cada sección se escribió por separado.
 *
 * Y en un caso empeoraba: `historia__copy p` a 14 px en una columna de 560 deja
 * la línea en ~80 caracteres, contra ~72 del resto. La medida cómoda de lectura
 * anda en 65-75, así que el píxel de menos no afinaba nada.
 *
 * Decisión de Cristóbal, 5 de octubre de 2026: «uniformar a proyectos modelos»
 * — o sea, al valor que ya usan esas dos secciones: 15 px.
 *
 * LO QUE NO ENTRA, y es a propósito. De las diecinueve, varias NO son texto de
 * lectura aunque midan lo mismo: un título de tarjeta en versales y peso 700, la
 * etiqueta de un formulario, el resumen plegable de una pregunta. Esas tienen
 * otro papel y cambiarlas sería decidir diseño, no normalizar. Van listadas
 * aparte al final para que las mire él.
 *
 * LA RED DE SEGURIDAD. Igual que limpiar-inertes.mjs: se mide la página entera
 * antes y después y se informa CADA elemento que cambió. Acá sí se espera que
 * cambien cosas —ése es el punto—, así que no deshace solo: muestra la lista
 * para que se pueda revisar.
 *
 *   node normalizar-texto.mjs              muestra qué cambiaría
 *   node normalizar-texto.mjs --aplicar    lo aplica y mide
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, dormir } from '../piezas/chrome.mjs';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';
const TMP = 'C:/Users/Cristobal concha/wp-local/.normalizar-texto.php';
const DOC = 'ocd-canvas-page-7';
const URL = 'http://localhost:8890/';
const aplicar = process.argv.includes('--aplicar');

/** El valor al que todo converge: el de proyecto y modelos. */
const LECTURA = '15px';

/**
 * Texto de LECTURA: prosa que alguien lee de corrido. Peso normal, sin
 * versales. Son las que se unifican.
 */
const DE_LECTURA = [
  'historia__copy p',          // 14    — la historia del fundo
  'faq__item p',               // 13.5  — la respuesta de cada pregunta
  'contacto__list',            // 13.5  — los datos de contacto
  'exit-card__desc',           // 13    — la bajada de cada tarjeta de cierre
  'wa-ventana__saludo',        // 13    — el saludo de la ventana de WhatsApp
  'modelos-incluye li',        // 15    — ya está en 15; queda por si cambia
];

/**
 * NO se tocan. Miden parecido pero tienen otro papel, y eso es diseño.
 * Se listan con su motivo para que la decisión quede a la vista.
 */
const NO_SE_TOCAN = {
  'exit-card__title': 'es un TÍTULO (peso 700, versales), no texto de lectura',
  '.faq__item summary': 'es el disparador plegable de la pregunta, peso 700',
  'testimonio-quote': 'es una CITA; la cita de historia va a 24 en cursiva dorada y ésta es su pariente',
  'lote-ficha__parcela': 'es la etiqueta de un dato dentro de la ficha del lote (peso 700)',
  'lote-ficha__hint': 'es la ayuda del plano, dentro de un recuadro: nivel recuadro, no cuerpo',
  'ubicacion__list li': 'peso 600: es una lista de datos, no prosa',
  '.contacto__form input, .contacto__form textarea': 'lo estila el formulario por sus variables, no el lienzo',
  'wa-ventana__campo': 'es un campo de formulario',
  'wa-ventana__nombre': 'es una etiqueta (peso 700)',
  'plano-contacto__nombre': 'es el nombre del contacto del plano, dentro del recuadro',
  'social-card__avatar': 'es la inicial del avatar, no texto',
  'modelo-card__media--placeholder': 'es el rótulo de una imagen que falta',
};

const php = (cuerpo) => {
  writeFileSync(TMP, `<?php\ndefine('WP_USE_THEMES', false);\nrequire ${JSON.stringify(WP)};\n${cuerpo}\n`);
  const salida = execFileSync(PHP, [TMP], { encoding: 'utf8', maxBuffer: 1e9 });
  unlinkSync(TMP);
  return salida;
};
const buscarPost = `global $wpdb;
$pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(DOC)}));`;

const pd = JSON.parse(php(`${buscarPost}\necho get_post_meta($pid, '_cod_canvas_project_data', true);`));

/* ------------------------------------------------------------- el cambio --- */
const nombreDe = (r) => {
  const s = [];
  for (const x of (r.selectors || [])) s.push(typeof x === 'object' ? (x.name || '') : String(x));
  return s.length ? s.join(' ') : String(r.selectorsAdd || '').trim();
};

const nuevo = JSON.parse(JSON.stringify(pd));
const cambios = [];
for (const r of (nuevo.styles || [])) {
  const n = nombreDe(r);
  const calza = DE_LECTURA.some((d) => n === d || n === d.replace(/\s+/g, '') || n.endsWith(d));
  if (!calza) continue;
  const antes = r.style?.['font-size'];
  if (!antes || antes === LECTURA) continue;
  r.style['font-size'] = LECTURA;
  cambios.push({ donde: n, de: antes, a: LECTURA, media: String(r.mediaText || '') });
}

console.log('TEXTO DE LECTURA → ' + LECTURA + '  (el de proyecto y modelos)\n');
if (cambios.length === 0) { console.log('  no encontré ninguno que cambiar'); }
for (const c of cambios) {
  console.log('  ' + c.donde.padEnd(26) + c.de.padEnd(8) + '→ ' + c.a + (c.media ? '   en ' + c.media : ''));
}

console.log('\nNO se tocan, y por qué:');
for (const [n, motivo] of Object.entries(NO_SE_TOCAN)) {
  console.log('  ' + n.padEnd(48) + motivo);
}

if (!aplicar) { console.log('\n(sin --aplicar: no escribo nada)'); process.exit(0); }

/* ------------------------------------------------------------ la medición --- */
const huella = `JSON.stringify([...document.querySelectorAll('body *')].map((e) => {
  const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  return [e.tagName, (e.className || '').toString().split(' ')[0], s.fontSize, Math.round(r.width), Math.round(r.height),
    e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40)].join('|');
}))`;
const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1 });
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const medir = async () => { await cdp('Page.navigate', { url: URL }); await esperarLaPagina(evaluar); await dormir(2500); return JSON.parse(await evaluar(huella)); };

const antes = await medir();
writeFileSync(TMP + '.json', JSON.stringify(nuevo));
console.log('\n' + php(`${buscarPost}
$repo = new COD_Canvas_Document_Repository();
$r = $repo->save(${JSON.stringify(DOC)}, file_get_contents(${JSON.stringify(TMP + '.json')}),
  (string) get_post_meta($pid, '_cod_canvas_html', true),
  (string) get_post_meta($pid, '_cod_canvas_css', true));
echo is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : 'guardado, revisión ' . $r['revision'];`));
const despues = await medir();
try { unlinkSync(TMP + '.json'); } catch (e) {}

console.log('\nQUÉ CAMBIÓ EN PANTALLA:');
let n = 0;
for (let i = 0; i < Math.min(antes.length, despues.length); i++) {
  if (antes[i] === despues[i]) continue;
  const a = antes[i].split('|'), b = despues[i].split('|');
  if (a[2] !== b[2]) { n++; console.log(`  ${a[0].toLowerCase()}.${a[1]}  ${a[2]} → ${b[2]}   «${a[5]}»`); }
  else if (++n <= 10) console.log(`  ${a[0].toLowerCase()}.${a[1]}  alto ${a[4]} → ${b[4]}   «${a[5]}»`);
}
console.log(`\n  ${n} elementos cambiaron, de ${antes.length}.`);
await cerrar();
