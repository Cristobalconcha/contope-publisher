/**
 * El flujo documentado del MCP dice, en el paso 2: leé la composición aplicada,
 * modificá sólo el nodo que corresponda y "conservá el resto tal cual".
 *
 * Eso exige que lo que devuelve cod_read_canvas_composition se pueda reenviar
 * SIN TOCAR. Antes no se podía: la lectura traía campos derivados (nodeIds,
 * markers, nodeCount) que el validador rechaza, y el error acusaba a
 * schemaVersion, que era lo único que sí estaba bien. Ver el issue #8.
 *
 * Esta prueba lee la composición de una página real y la reenvía idéntica. Es
 * la única forma de comprobar el ciclo completo: el resto son partes sueltas.
 *
 *   node scripts/probar-ida-y-vuelta.mjs [pageId]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));

/*
 * CORRE CONTRA UN LOCAL, NO CONTRA UN SITIO PUBLICADO.
 *
 * Apuntaba a santaluisadepalpi.cl: una prueba de la batería leía una
 * composición del sitio real de un cliente y la REENVIABA. Eso no puede estar
 * en algo que se corre a diario.
 *
 * Desde el 4 de octubre de 2026 va al local de Econut, que es donde hay
 * páginas con composición registrada de verdad. El espejo de Santa Luisa no
 * sirve para esto: tiene el documento pero no su composición, porque se armó
 * desde el HTML del sitio y no desde una composición aplicada.
 *
 * Para correrla contra otro sitio hay que pedirlo a propósito, con COD_SITIO y
 * COD_CREDENCIAL en el entorno.
 */
const SITIO = process.env.COD_SITIO || 'http://localhost:8891';
const RUTA_CREDENCIAL = process.env.COD_CREDENCIAL
  || path.join(aquí, '..', '..', 'wp-local-econut', '.credencial-mcp-local.txt');

// La página legal: pequeña y con composición registrada, que es lo que esta
// prueba necesita. Se puede pasar otra como argumento.
const PAGINA = Number(process.argv[2] || 55);

// Por `?rest_route=` y no por `/wp-json/`: el servidor de PHP que levanta el
// espejo no reescribe direcciones, así que la forma bonita devuelve el HTML de
// la portada y el error habla de un «<» inesperado, que no dice nada.
const endpoint = `${SITIO.replace(/\/+$/, '')}/index.php?rest_route=/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(readFileSync(RUTA_CREDENCIAL, 'utf8').trim()).toString('base64');

let id = 0;
async function llamar(name, args) {
  id += 1;
  for (let i = 1; i <= 4; i += 1) {
    try {
      const r = await fetch(endpoint, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) });
      const t = await r.text();
      const j = JSON.parse(t.includes('event:') ? t.split('data: ').pop() : t);
      if (j.error) return { error: j.error.message || 'error' };
      const c = j.result?.content?.[0]?.text;
      if (j.result?.isError) return { error: c || 'error del sitio' };
      return { ok: c ? JSON.parse(c) : j.result };
    } catch (e) { if (i === 4) return { error: e.message }; await new Promise((s) => setTimeout(s, 1500 * i)); }
  }
}

let fallas = 0;
const comprobar = (caso, ok, detalle) => {
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (ok || !detalle ? '' : '\n           → ' + String(detalle).slice(0, 180)));
  if (!ok) fallas += 1;
};

console.log('\n== leer la composición de la página ' + PAGINA + ' ==');
const lectura = await llamar('cod_read_canvas_composition', { pageId: PAGINA });
if (lectura.error) { console.error('  no pude leer: ' + lectura.error); process.exit(1); }
const d = lectura.ok;
comprobar('la página tiene composición registrada', d.found === true);
comprobar('composition trae SÓLO lo reenviable', Object.keys(d.composition).every((k) => ['schemaVersion', 'label', 'nodes'].includes(k)),
  'claves: ' + Object.keys(d.composition).join(', '));
comprobar('lo derivado viaja aparte, en resumen', !!d.resumen && Array.isArray(d.resumen.nodeIds) && d.resumen.nodeIds.length > 0,
  d.resumen ? d.resumen.nodeIds.length + ' nodos, ' + d.resumen.markers.length + ' marcadores' : 'no hay resumen');

console.log('\n== reenviarla SIN TOCAR NADA ==');
const previa = await llamar('cod_preview_canvas_composition', {
  pageId: PAGINA, documentId: d.page.documentId, expectedRevision: d.revision,
  design: d.design, composition: d.composition });
comprobar('el sitio la acepta tal cual', !previa.error, previa.error);
if (!previa.error) {
  comprobar('y compila los mismos nodos', previa.ok.summary.nodeCount === d.resumen.nodeCount,
    previa.ok.summary.nodeCount + ' vs ' + d.resumen.nodeCount);
  comprobar('con las mismas reglas', previa.ok.summary.ruleCount === d.design.rules.length,
    previa.ok.summary.ruleCount + ' vs ' + d.design.rules.length);
}

console.log('\n' + (fallas === 0 ? 'la ida y vuelta funciona\n' : fallas + ' comprobaciones fallaron\n'));
process.exit(fallas === 0 ? 0 : 1);
