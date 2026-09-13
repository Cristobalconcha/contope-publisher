// Prueba la operación `move` del puente headless contra el Grapes real:
// que el nodo cambie de PADRE de verdad, no que se disimule con CSS.
import { spawnSync } from 'node:child_process';

const PUENTE = 'contope-publisher/tools/cod-headless-node-edit.mjs';

const HTML = `<section class="ubicacion">
  <div class="ubicacion__filters"><label>CATEGORIA</label></div>
  <div class="plano-frame"><div class="plano-frame__content">
    <div class="plano-frame__header"><h2>Ubicacion</h2></div>
    <p class="plano-frame__intro">Camino Padre Hurtado</p>
    <div class="plano-frame__body"><div class="mapa">mapa</div></div>
  </div></div>
</section>`;

function correr(mutation) {
  const entrada = JSON.stringify({
    document: { projectData: '', html: HTML, css: '.ubicacion{color:#000}' },
    selector: '.ubicacion__filters',
    mutation,
  });
  const r = spawnSync('node', [PUENTE], { input: entrada, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
  const linea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  try { return JSON.parse(linea); } catch { return { ok: false, error: 'sin respuesta: ' + (r.stderr || '').slice(-300) }; }
}

let fallas = 0;
const comprobar = (caso, ok, detalle) => {
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (ok || !detalle ? '' : '  → ' + detalle));
  if (!ok) fallas++;
};

console.log('\n== mover adentro del recuadro, antes del mapa ==');
const a = correr({ move: { before: '.plano-frame__body' } });
if (!a.ok) {
  comprobar('el puente responde', false, a.error);
} else {
  const h = a.html.replace(/\s+/g, ' ');
  const posFiltros = h.indexOf('ubicacion__filters');
  const posIntro = h.indexOf('plano-frame__intro');
  const posBody = h.indexOf('plano-frame__body');
  const posContent = h.indexOf('plano-frame__content');
  comprobar('los filtros quedaron ADENTRO del recuadro', posFiltros > posContent);
  comprobar('quedaron DESPUES del parrafo', posFiltros > posIntro);
  comprobar('quedaron ANTES del mapa', posFiltros < posBody);
  comprobar('no se duplicaron', (h.match(/ubicacion__filters/g) || []).length === 1);
  comprobar('el CSS sobrevive', a.css.includes('.ubicacion'));
}

console.log('\n== into con posicion ==');
const b = correr({ move: { into: '.plano-frame__content', at: 0 } });
if (!b.ok) { comprobar('el puente responde', false, b.error); }
else {
  const h = b.html.replace(/\s+/g, ' ');
  comprobar('quedaron primeros adentro del contenido', h.indexOf('ubicacion__filters') < h.indexOf('plano-frame__header'));
}

console.log('\n== errores que tiene que rechazar ==');
const c = correr({ move: { into: '.plano-frame__content', before: '.plano-frame__body' } });
comprobar('dos formas a la vez se rechaza', !c.ok && /exactamente uno/.test(c.error || ''));
const d = correr({ move: { into: '.no-existe' } });
comprobar('destino inexistente se rechaza', !d.ok && /no encontr/.test(d.error || ''));
const e = correr({ move: { into: '.ubicacion__filters' } });
comprobar('moverse adentro de si mismo se rechaza', !e.ok && /mismo nodo|adentro del nodo/.test(e.error || ''));

console.log('\n' + (fallas === 0 ? 'todo en orden\n' : fallas + ' comprobaciones fallaron\n'));
process.exit(fallas === 0 ? 0 : 1);
