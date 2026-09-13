import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ORIGEN = process.argv[2];
const doc = JSON.parse(readFileSync(ORIGEN, 'utf8'));

const entrada = JSON.stringify({
  document: { projectData: doc.projectData, html: doc.html, css: doc.css },
  selector: '#ubicacion .ubicacion__filters',
  mutation: { move: { before: '#ubicacion .plano-frame__body' } },
});

const r = spawnSync('node', ['contope-publisher/tools/cod-headless-node-edit.mjs'], {
  input: entrada, encoding: 'utf8', maxBuffer: 200 * 1024 * 1024,
});
const linea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
let salida;
try { salida = JSON.parse(linea); } catch { console.error('sin respuesta. stderr:', (r.stderr||'').slice(-600)); process.exit(1); }
if (!salida.ok) { console.error('el puente rechazó:', salida.error); process.exit(1); }

// Comprobar el movimiento ANTES de escribir nada en el sitio.
const h = salida.html;
const sec = h.slice(h.indexOf('id="ubicacion"'));
const pos = (c) => sec.indexOf(c);
const comprobaciones = [
  ['los filtros siguen existiendo, una sola vez', (sec.match(/ubicacion__filters/g)||[]).length === 1],
  ['quedaron adentro del contenido del recuadro', pos('ubicacion__filters') > pos('plano-frame__content')],
  ['quedaron después del encabezado del recuadro', pos('ubicacion__filters') > pos('plano-frame__header-body')],
  ['quedaron antes del mapa', pos('ubicacion__filters') < pos('plano-frame__body')],
  ['el selector de categoría viajó con ellos', sec.indexOf('filtroCategoria') > pos('plano-frame__content')],
  ['el CSS no se encogió', salida.css.length > doc.css.length * 0.9],
  ['el HTML no se encogió', salida.html.length > doc.html.length * 0.9],
  ['el marcador #ubicacion sigue ahí', h.includes('id="ubicacion"')],
  ['el marcador #mapa-interactivo sigue ahí', h.includes('id="mapa-interactivo"')],
];
let fallas = 0;
for (const [caso, ok] of comprobaciones) { console.log((ok?'  ok     ':'  FALLA  ')+caso); if(!ok) fallas++; }
console.log('\ncss ' + doc.css.length + ' → ' + salida.css.length + '   html ' + doc.html.length + ' → ' + salida.html.length);
if (fallas) { console.error('\n' + fallas + ' fallas: no se escribe nada.'); process.exit(1); }
writeFileSync('/tmp/ubicacion-movido.json', JSON.stringify({projectData: salida.projectData, html: salida.html, css: salida.css}));
console.log('\nlisto, guardado sin tocar el sitio todavía');
