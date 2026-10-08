/**
 * Quita de un documento las reglas que están ESCRITAS DOS VECES IDÉNTICAS
 * (mismo selector, mismo corte de pantalla, mismo estado, mismo cuerpo).
 *
 * POR QUÉ HAY DUPLICADOS. Medido el 6 de octubre de 2026 en la portada de Santa
 * Luisa: 37 claves de regla repetidas, 26 con cuerpo exactamente igual — casi
 * todas dentro de los cortes (max-width: 720px) y (max-width: 900px),
 * (max-aspect-ratio: 4 / 5). Son copias que dejó el import y los guardados.
 *
 * LO QUE NO TOCA. Las repetidas con cuerpo DISTINTO (#proyecto x4, .cls-1..4 de
 * los SVG, .plano-frame__body…): eso es una cascada que alguien armó, y
 * unificarla es decidir qué valor gana. Se informa y se deja. Tampoco toca los
 * cortes de pantalla (congelados) ni ningún valor de diseño.
 *
 * QUÉ COPIA SE QUEDA: LA ÚLTIMA, igual que limpiar-css-duplicado.mjs. Si entre
 * las dos hay una regla que pisa a ambas, quedarse con la primera cambiaría lo
 * que se ve; con la última la cascada queda igual.
 *
 * LA RED DE SEGURIDAD. Se mide, para cada elemento y en cinco anchos de
 * pantalla, la geometría y el valor final de cada propiedad que esas reglas
 * declaran. Dos veces antes (para saber qué se mueve solo) y una después. Con
 * una sola diferencia, se devuelve el JSON original.
 *
 * LA HOJA. Escribir el JSON no basta: la página se pinta desde la hoja plana, y
 * ésta sólo se regenera pasando por el runner. Por eso, tras escribir, se corre
 * un --build que reescribe una regla existente con su propio cuerpo (no cambia
 * nada, pero obliga a Grapes a reexportar la hoja).
 *
 *   node limpiar-duplicados.mjs <documentId>             simula, no escribe
 *   node limpiar-duplicados.mjs <documentId> --aplicar   escribe si no hay diferencias
 *
 * SÓLO ESPEJO LOCAL (localhost:8890). Lee y escribe por PHP local, y el runner
 * va con cod-grapes-runner.local.json.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, copyFileSync, mkdirSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, dormir } from '../piezas/chrome.mjs';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';
const TMP = 'C:/Users/Cristobal concha/wp-local/.limpiar-duplicados.php';
const RUNNER = 'C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner/cod-grapes-runner.mjs';

const aplicar = process.argv.includes('--aplicar');
const documentId = process.argv.find((a) => !a.startsWith('--') && a.includes('-page-')) || 'ocd-canvas-page-7';
let pageId = '';
const URL = 'http://localhost:8890/';
// Un ancho por cada familia de cortes, más uno alto-y-angosto que activa max-aspect-ratio.
const PANTALLAS = [[1440, 900], [800, 1000], [1000, 1300], [700, 900], [390, 844]];

const php = (cuerpo) => {
  writeFileSync(TMP, `<?php\ndefine('WP_USE_THEMES', false);\nrequire ${JSON.stringify(WP)};\n${cuerpo}\n`);
  try { return execFileSync(PHP, [TMP], { encoding: 'utf8', maxBuffer: 1e9 }); } finally { unlinkSync(TMP); }
};
const PID = `$pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));`;
const leerPD = () => JSON.parse(php(`global $wpdb; ${PID} echo get_post_meta($pid, '_cod_canvas_project_data', true);`));
const escribirPD = (pd) => {
  writeFileSync(TMP + '.json', JSON.stringify(pd));
  try {
    return php(`global $wpdb; ${PID}
      $repo = new COD_Canvas_Document_Repository();
      $r = $repo->save(${JSON.stringify(documentId)}, file_get_contents(${JSON.stringify(TMP + '.json')}),
        (string) get_post_meta($pid, '_cod_canvas_html', true), (string) get_post_meta($pid, '_cod_canvas_css', true));
      echo is_wp_error($r) ? 'ERROR: ' . $r->get_error_message() : 'revisión ' . $r['revision'];`);
  } finally { try { unlinkSync(TMP + '.json'); } catch (e) { /* ya no está */ } }
};

const nombre = (s) => (typeof s === 'string' ? s : s && s.name ? (s.type === 2 ? '#' : '.') + s.name : '');
const clave = (r) => `${r.mediaText || ''}§${r.selectorsAdd || (r.selectors || []).map(nombre).join('')}§${r.state || ''}`;

// La página de WordPress que lleva este documento (no es el número del documentId).
pageId = php(`global $wpdb; echo (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='page' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));`).trim();
if (!pageId || pageId === '0') { console.error('No encuentro la página de WordPress de ' + documentId); process.exit(2); }
const pd = leerPD();
const grupos = new Map();
(pd.styles || []).forEach((r, i) => { const k = clave(r); (grupos.get(k) || grupos.set(k, []).get(k)).push(i); });

const opcion = (nombreOpcion) => { const k = process.argv.indexOf(nombreOpcion); return k !== -1 && process.argv[k + 1] ? process.argv[k + 1].split(',') : []; };
const EXCLUIR_PROPS = opcion('--excluir-props');
// Elementos que se mueven solos entre mediciones (el control lo comprobó: el 67 de la portada).
const IGNORAR = new Set(opcion('--ignorar-elementos').map(Number));
const FUSIONAR = process.argv.includes('--fusionar');
// --solo <texto>: fusionar sólo los grupos cuya clave lo contiene. --aceptar <prop,...>: esas propiedades pueden cambiar a propósito.
const SOLO = (() => { const k = process.argv.indexOf('--solo'); return k !== -1 ? process.argv[k + 1].split(',') : []; })();
const ACEPTAR = (() => { const k = process.argv.indexOf('--aceptar'); return k !== -1 ? process.argv[k + 1].split(',') : []; })();
const fusion = new Map();
const quitar = new Set();
const informe = { identicas: [], distintas: [] };
const props = new Set();
for (const [k, idx] of grupos) {
  if (idx.length < 2) continue;
  // El gancho de precio no se toca, entero (pieza aprobada por el cliente).
  if (k.includes('precio-gancho')) { informe.distintas.push(`x${idx.length}  ${k}  (gancho de precio: intocable)`); continue; }
  const cuerpo = (i) => JSON.stringify(pd.styles[i].style || {});
  if (idx.every((i) => cuerpo(i) === cuerpo(idx[0]))) {
    // Quedarse con la última NO es siempre neutro: si entre las copias hay una
    // regla que pisa a la primera, al quitarla la última pasa a ganarle. La
    // medición lo detecta (pasó con `features` y `bottom`); con --excluir-props
    // se dejan fuera los grupos que declaran la propiedad que midió distinta.
    const decl = Object.keys(pd.styles[idx[0]].style || {});
    const choca = decl.filter((p) => EXCLUIR_PROPS.includes(p));
    if (choca.length) { informe.distintas.push(`x${idx.length}  ${k}  (declara ${choca.join(', ')}: la pisa una regla intermedia, se deja)`); continue; }
    idx.slice(0, -1).forEach((i) => quitar.add(i)); // se queda la última
    informe.identicas.push(`x${idx.length}  ${k}`);
    Object.keys(pd.styles[idx[0]].style || {}).forEach((p) => props.add(p));
  } else if (FUSIONAR && k.endsWith('§') && (SOLO.length === 0 || SOLO.some((x) => k.includes(x)))) {
    // Cuerpos distintos: la última copia gana propiedad por propiedad, así que la regla
    // fusionada ES lo que el navegador ya aplica. No decide diseño; la medición lo confirma.
    const efectivo = Object.assign({}, ...idx.map((i) => pd.styles[i].style || {}));
    const decl = Object.keys(efectivo);
    const choca = decl.filter((p) => EXCLUIR_PROPS.includes(p));
    if (choca.length) { informe.distintas.push(`x${idx.length}  ${k}  (declara ${choca.join(', ')}: se deja)`); continue; }
    idx.slice(0, -1).forEach((i) => quitar.add(i));
    fusion.set(idx[idx.length - 1], efectivo);
    informe.identicas.push(`x${idx.length}  ${k}  (FUSIONADA, cuerpos distintos)`);
    decl.forEach((p) => props.add(p));
  } else {
    informe.distintas.push(`x${idx.length}  ${k}`);
  }
}

console.log(`documento: ${documentId}  ·  reglas: ${pd.styles.length}`);
console.log(`repetidas IDÉNTICAS (se quita la copia anterior, queda la última): ${informe.identicas.length}  →  ${quitar.size} reglas a quitar`);
informe.identicas.forEach((l) => console.log('  ' + l));
console.log(`repetidas con cuerpo DISTINTO (no se tocan, es cascada armada): ${informe.distintas.length}`);
informe.distintas.forEach((l) => console.log('  ' + l));

if (!aplicar) { console.log('\n(sin --aplicar: no escribo nada)'); process.exit(0); }
if (quitar.size === 0) { console.log('\nNada que quitar.'); process.exit(0); }

// Respaldo antes de tocar nada.
mkdirSync('C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner/backups', { recursive: true });
const respaldo = `C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner/backups/antes-limpiar-duplicados-${documentId}-${Date.now()}.json`;
writeFileSync(respaldo, JSON.stringify(pd));
console.log(`\nrespaldo del JSON: ${respaldo}`);

const PROPS = [...props];
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

const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1 });
await cdp('Page.enable');

const medirTodo = async () => {
  const salida = [];
  for (const [w, h] of PANTALLAS) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await cdp('Page.navigate', { url: URL });
    await esperarLaPagina(evaluar);
    await dormir(3000);
    salida.push(JSON.parse(await evaluar(huella)));
  }
  return salida;
};

console.log('mido ANTES (dos veces, para saber qué se mueve solo)…');
const a1 = await medirTodo();
const a2 = await medirTodo();
const inquietos = a1.map((pant, p) => new Set(pant.map((_, i) => i).filter((i) => pant[i] !== a2[p][i])));
console.log('  ' + PANTALLAS.map(([w], p) => `${w}px: ${a1[p].length} elementos, ${inquietos[p].size} inquietos`).join(' · '));

/*
 * ESCRIBIR EL JSON NO SIRVE (lo midió la primera versión de este guion). Al
 * regenerar, el motor rearma la hoja desde la hoja plana vieja y la hoja
 * ENGORDÓ de 71.090 a 75.699 bytes: las copias no se quitaron, se multiplicaron.
 * La vía válida es --build con `remove: true` (quita TODAS las copias de ese
 * selector+corte por la API real) seguido de la regla una sola vez.
 *
 * Lo quitado y vuelto a poner queda al final de la cascada; por eso la medición
 * sigue siendo obligatoria, y por eso se compara contra el estado original
 * completo (JSON + HTML + hoja), que es lo que se restaura si algo cambia.
 */
const guardado = JSON.parse(php(`global $wpdb; ${PID}
  echo json_encode(['pd' => (string) get_post_meta($pid, '_cod_canvas_project_data', true), 'html' => (string) get_post_meta($pid, '_cod_canvas_html', true), 'css' => (string) get_post_meta($pid, '_cod_canvas_css', true)]);`));
const restaurar = () => {
  writeFileSync(TMP + '.estado.json', JSON.stringify(guardado));
  try {
    return php(`global $wpdb; ${PID}
      $e = json_decode(file_get_contents(${JSON.stringify(TMP + '.estado.json')}), true);
      $repo = new COD_Canvas_Document_Repository();
      $r = $repo->save(${JSON.stringify(documentId)}, $e['pd'], $e['html'], $e['css']);
      echo is_wp_error($r) ? 'NO PUDE RESTAURAR: ' . $r->get_error_message() : 'restaurado, revisión ' . $r['revision'];`);
  } finally { try { unlinkSync(TMP + '.estado.json'); } catch (e) { /* ya no está */ } }
};

const selectorDe = (r) => r.selectorsAdd || (r.selectors || []).map((s) => (typeof s === 'string' ? (s.startsWith('#') ? s : '.' + s) : nombre(s))).join('');
const estilos = [];
for (const [k, idx] of grupos) {
  if (!idx.every((i) => quitar.has(i) || i === idx[idx.length - 1]) || idx.length < 2 || quitar.has(idx[idx.length - 1])) continue;
  const ultima = pd.styles[idx[idx.length - 1]];
  if (!quitar.has(idx[0])) continue;
  const base = { selector: selectorDe(ultima) };
  if (ultima.mediaText) base.media = ultima.mediaText;
  estilos.push({ ...base, remove: true }, { ...base, style: fusion.get(idx[idx.length - 1]) || ultima.style });
}
console.log(`el --build lleva ${estilos.length / 2} reglas: se quitan todas las copias y se escribe una.`);
writeFileSync(TMP + '.build.json', JSON.stringify({ mode: 'append', structure: [], styles: estilos }));
console.log('aplico por el runner…');
try {
  const salidaRunner = execFileSync(process.execPath, [RUNNER, '--config', 'cod-grapes-runner.local.json', '--build', TMP + '.build.json', '--page', pageId, '--document', documentId], { encoding: 'utf8', cwd: 'C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner', maxBuffer: 1e9 });
  console.log(salidaRunner.split('\n').filter((l) => /ok ·|pérdida|guardado|✓|✗/.test(l)).join('\n'));
} finally { try { unlinkSync(TMP + '.build.json'); } catch (e) { /* ya no está */ } }

console.log('mido DESPUÉS…');
const d = await medirTodo();

const dif = [];
for (let p = 0; p < PANTALLAS.length; p++) {
  if (a1[p].length !== d[p].length) { dif.push(`${PANTALLAS[p][0]}px: cambió el número de elementos ${a1[p].length} → ${d[p].length}`); continue; }
  for (let i = 0; i < a1[p].length && dif.length < 200000; i++) {
    if (inquietos[p].has(i) || IGNORAR.has(i) || a1[p][i] === d[p][i]) continue;
    const x = a1[p][i].split('|'), y = d[p][i].split('|');
    const campos = ['x', 'y', 'ancho', 'alto', ...PROPS];
    for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) dif.push(`${PANTALLAS[p][0]}px · elemento ${i} · ${campos[j]}: «${x[j]}» → «${y[j]}»`);
  }
}

const hojaDespues = php(`global $wpdb; ${PID} echo strlen((string) get_post_meta($pid, '_cod_canvas_css', true));`).trim();
const reglasDespues = JSON.parse(php(`global $wpdb; ${PID} $p = json_decode(get_post_meta($pid, '_cod_canvas_project_data', true), true); echo count($p['styles']);`));
// Con --aceptar, esas propiedades pueden cambiar a propósito, y también la posición
// vertical (y) y la altura de lo que queda debajo. Cualquier otra cosa es inesperada.
const esperado = (l) => ACEPTAR.length > 0 && (ACEPTAR.some((p) => l.includes(` ${p}:`)) || / · (y|alto):/.test(l));
const inesperadas = dif.filter((l) => !esperado(l));
if (dif.length === 0) {
  console.log(`\nSIN DIFERENCIAS en ${PANTALLAS.length} pantallas. Reglas ${pd.styles.length} → ${reglasDespues}; hoja ${guardado.css.length} → ${hojaDespues} bytes.`);
} else if (inesperadas.length === 0) {
  console.log(`\nCAMBIOS ACEPTADOS (${dif.length}): sólo ${ACEPTAR.join(', ')} y el desplazamiento vertical que provoca.`);
  const porPantalla = {};
  dif.forEach((l) => { const w = l.split(' ')[0]; porPantalla[w] = (porPantalla[w] || 0) + 1; });
  console.log('  por pantalla: ' + JSON.stringify(porPantalla));
  dif.filter((l) => ACEPTAR.some((p) => l.includes(` ${p}:`))).forEach((l) => console.log('  · ' + l));
  console.log(`  reglas ${pd.styles.length} → ${reglasDespues}; hoja ${guardado.css.length} → ${hojaDespues} bytes. Se conserva.`);
} else {
  console.log(`\nHAY DIFERENCIAS (${dif.length}; inesperadas: ${inesperadas.length}):`);
  inesperadas.slice(0, 40).forEach((l) => console.log('  · ' + l));
  console.log('\nRESTAURO el estado original completo.');
  console.log('  ' + restaurar());
  process.exitCode = 1;
}
await cerrar();
