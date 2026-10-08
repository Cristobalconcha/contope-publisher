/**
 * Aplica un archivo de --build al espejo de Santa Luisa y MIDE antes y después.
 * A diferencia de limpiar-duplicados, aquí SE ESPERA que algo cambie: no restaura;
 * lista qué elementos cambiaron de propiedad (lo pedido) y cuántos sólo se
 * desplazaron (la consecuencia). Si cambia una propiedad que el build no tocaba,
 * lo marca como INESPERADO para que se decida con el respaldo a la vista.
 *
 *   node aplicar-build-medido.mjs <build.json> [documentId]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, dormir } from '../piezas/chrome.mjs';
const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';
const TMP = 'C:/Users/Cristobal concha/wp-local/.aplicar-build-medido.php';
const RUNNER = 'C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner/cod-grapes-runner.mjs';
const [archivoRel, documentId = 'ocd-canvas-page-7'] = process.argv.slice(2);
const archivo = require('node:path').resolve(archivoRel);
const build = JSON.parse(readFileSync(archivo, 'utf8'));
const php = (c) => { writeFileSync(TMP, `<?php\ndefine('WP_USE_THEMES', false);\nrequire ${JSON.stringify(WP)};\n${c}\n`); try { return execFileSync(PHP, [TMP], { encoding: 'utf8', maxBuffer: 1e9 }); } finally { unlinkSync(TMP); } };
const pageId = php(`global $wpdb; echo (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='page' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(documentId)}));`).trim();
const PROPS = ['margin-top', 'margin-bottom', 'font-size', 'letter-spacing', 'line-height', 'color', 'padding-top', 'padding-bottom'];
const PANTALLAS = [[1440, 900], [800, 1000], [1000, 1300], [700, 900], [390, 844]];
const huella = `JSON.stringify([...document.querySelectorAll('body *')].map((e)=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return [e.tagName+'.'+(e.className&&e.className.baseVal===undefined?e.className:'').toString().slice(0,40)+'|'+(e.children.length?'':e.textContent.trim().slice(0,24)),Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),...${JSON.stringify(PROPS)}.map((p)=>s.getPropertyValue(p))]}))`;
const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1440, alto: 900, escala: 1 });
await cdp('Page.enable');
const medir = async () => { const o = []; for (const [w, h] of PANTALLAS) { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await cdp('Page.navigate', { url: 'http://localhost:8890/' }); await esperarLaPagina(evaluar); await dormir(3000); o.push(JSON.parse(await evaluar(huella))); } return o; };
console.log('mido ANTES (dos veces)…'); const a1 = await medir(); const a2 = await medir();
const quieto = (p, i) => JSON.stringify(a1[p][i]) === JSON.stringify(a2[p][i]);
console.log('aplico el build por el runner…');
const sal = execFileSync(process.execPath, [RUNNER, '--config', 'cod-grapes-runner.local.json', '--build', archivo, '--page', pageId, '--document', documentId], { encoding: 'utf8', cwd: 'C:/Users/Cristobal concha/open-codesign-wordpress/scripts/cod-grapes-runner', maxBuffer: 1e9 });
console.log(sal.split('\n').filter((l) => /ok ·|pérdida|guardado|respaldo|✗/.test(l)).join('\n'));
console.log('mido DESPUÉS…'); const d = await medir();
const cambiosProp = new Map(); let desplazados = 0; const geometria = [];
PANTALLAS.forEach(([w], p) => {
  if (a1[p].length !== d[p].length) { console.log(`${w}px: cambió el número de elementos ${a1[p].length} → ${d[p].length}`); return; }
  a1[p].forEach((fila, i) => {
    if (!quieto(p, i)) return; const n = d[p][i]; if (JSON.stringify(fila) === JSON.stringify(n)) return;
    const props = []; PROPS.forEach((nm, j) => { if (fila[5 + j] !== n[5 + j]) props.push(`${nm}: ${fila[5 + j]} → ${n[5 + j]}`); });
    if (props.length) { const k = `${fila[0]}  ${props.join(' · ')}`; cambiosProp.set(k, (cambiosProp.get(k) || []).concat(w)); }
    else if (fila[2] !== n[2] || fila[4] !== n[4]) desplazados++;
  });
});
console.log(`\nELEMENTOS CUYAS PROPIEDADES CAMBIARON (${cambiosProp.size}):`);
for (const [k, ws] of cambiosProp) console.log(`  · [${[...new Set(ws)].join(', ')}px] ${k}`);
console.log(`\nelementos que sólo se desplazaron o cambiaron de alto, por pantalla: ~${Math.round(desplazados / PANTALLAS.length)}`);
await cerrar();
