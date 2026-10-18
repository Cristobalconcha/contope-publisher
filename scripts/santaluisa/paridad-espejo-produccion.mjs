/**
 * ¿El espejo local de Santa Luisa es IGUAL a producción?
 *
 * Cristóbal lo pidió el 18-oct-2026: la versión local tiene que ser la misma que
 * está arriba, para que cuando se incorpore algo nuevo no haya desfases al
 * subirlo. Este guion lo comprueba de verdad (contra los dos sitios) en lugar de
 * suponerlo.
 *
 * Qué compara:
 *   1. Las cuatro páginas interiores: composición y reglas de diseño.
 *   2. La portada: projectData y hoja de estilos (el HTML lleva una excepción
 *      conocida, ver más abajo).
 *   3. El encabezado global.
 *   4. Versiones del plugin, del tema y de los plugins que cambian lo que se ve.
 *   5. Ajustes del sitio: título, descripción, ícono, idioma, página de inicio.
 *
 * Qué NO compara, a propósito:
 *   - Los números de página (cambian de un sitio a otro) y las revisiones.
 *   - Medición (Tag Manager, Ads): el espejo NO la lleva, para que navegar el
 *     espejo no ensucie las estadísticas de producción.
 *   - Instagram Feed: necesita MySQL y la cuenta conectada (credenciales).
 *   - Plugins de administración (copias de seguridad, correo, seguridad).
 *
 * (El visor de la galería de la portada llevaba un `src` sin `data:` en el espejo; se
 * corrigió el 18-oct-2026 y la portada es idéntica también en HTML.)
 *
 * Uso:  node scripts/santaluisa/paridad-espejo-produccion.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const carpeta = path.resolve(aqui, '../cod-grapes-runner/');

function cliente(archivo) {
  const cfg = JSON.parse(readFileSync(path.join(carpeta, archivo), 'utf8'));
  const base = cfg.siteUrl.replace(/\/+$/, '');
  const auth = 'Basic ' + Buffer.from(cfg.username + ':' + cfg.applicationPassword.replace(/\s+/g, '')).toString('base64');
  return {
    base,
    async mcp(name, args) {
      const r = await fetch(`${base}/wp-json/contope/v1/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
      const p = JSON.parse(await r.text());
      if (p.error) throw new Error(p.error.message);
      if (p.result?.isError) throw new Error(p.result.content?.[0]?.text || 'error');
      return p.result.structuredContent || JSON.parse(p.result.content[0].text);
    },
    async rest(ruta) {
      const r = await fetch(`${base}/wp-json/wp/v2${ruta}`, { headers: { Authorization: auth } });
      return r.ok ? r.json() : null;
    },
  };
}

const prod = cliente('cod-grapes-runner.config.json');
const esp = cliente('cod-grapes-runner.local.json');
if (!/santaluisadepalpi\.cl/.test(prod.base) || !/localhost/.test(esp.base)) {
  console.error('Las configuraciones no son las esperadas (producción / espejo).');
  process.exit(1);
}

let diferencias = 0;
const linea = (ok, texto) => { if (!ok) diferencias += 1; console.log(`${ok ? '  ✓' : '  ✗'} ${texto}`); };
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
const quitaHost = (s) => String(s || '').replace(/http:\/\/localhost:\d+/g, '').replace(/https?:\/\/santaluisadepalpi\.cl/g, '');

console.log('\n1. Páginas interiores');
for (const [n, idp, ide] of [['Contacto', 44, 60], ['Preguntas frecuentes', 45, 61], ['Diferenciales', 46, 62], ['Términos y condiciones', 164, 630]]) {
  const a = await prod.mcp('cod_read_canvas_composition', { pageId: idp });
  const b = await esp.mcp('cod_read_canvas_composition', { pageId: ide });
  const reglas = (x) => canon(x.design.rules.map((r) => [r.id, r.value]).sort(([p], [q]) => p.localeCompare(q)));
  linea(canon(a.composition) === canon(b.composition), `${n}: composición`);
  linea(reglas(a) === reglas(b), `${n}: reglas de diseño (${a.design.rules.length} / ${b.design.rules.length})`);
}

console.log('\n2. Portada');
const pa = (await prod.mcp('cod_read_canvas_document', { pageId: 43, documentId: 'ocd-canvas-page-7' }));
const pb = (await esp.mcp('cod_read_canvas_document', { pageId: 308, documentId: 'ocd-canvas-page-7' }));
const A = pa.document || pa, B = pb.document || pb;
linea(quitaHost(A.css) === quitaHost(B.css), 'portada: hoja de estilos');
linea(quitaHost(typeof A.projectData === 'string' ? A.projectData : JSON.stringify(A.projectData)) === quitaHost(typeof B.projectData === 'string' ? B.projectData : JSON.stringify(B.projectData)), 'portada: projectData');

console.log('\n3. Encabezado global');
const ID = 'ocd-template-d5a667af-b7aa-498f-a986-bbe61a63add6';
const ha = await prod.mcp('cod_read_canvas_document', { pageId: 0, documentId: ID });
const hb = await esp.mcp('cod_read_canvas_document', { pageId: 0, documentId: ID });
const HA = ha.document || ha, HB = hb.document || hb;
linea(quitaHost(HA.html) === quitaHost(HB.html), 'encabezado: HTML');
linea(quitaHost(HA.css) === quitaHost(HB.css), 'encabezado: CSS');

console.log('\n4. Versiones');
const interesan = ['contope-publisher/contope-publisher', 'cookieadmin/cookieadmin', 'siteseo/siteseo', 'orugantt-forms/orugantt-forms'];
const [plA, plB] = [await prod.rest('/plugins?per_page=100'), await esp.rest('/plugins?per_page=100')];
for (const p of interesan) {
  const x = (plA || []).find((q) => q.plugin === p), y = (plB || []).find((q) => q.plugin === p);
  linea(!!x && !!y && x.version === y.version && x.status === y.status, `${p}: producción ${x ? x.version + ' ' + x.status : '—'} · espejo ${y ? y.version + ' ' + y.status : '—'}`);
}
const [thA, thB] = [await prod.rest('/themes?status=active'), await esp.rest('/themes?status=active')];
const tv = (t) => (t && t[0] ? `${t[0].stylesheet} ${t[0].version?.raw || t[0].version}` : '—');
linea(tv(thA) === tv(thB), `tema activo: producción ${tv(thA)} · espejo ${tv(thB)}`);

console.log('\n5. Ajustes del sitio');
const [sA, sB] = [await prod.rest('/settings'), await esp.rest('/settings')];
for (const k of ['title', 'description', 'language']) linea(sA?.[k] === sB?.[k], `${k}: «${sA?.[k]}» / «${sB?.[k]}»`);
linea(!!sA?.site_icon === !!sB?.site_icon, `ícono del sitio: ${sA?.site_icon ? 'definido' : 'no'} / ${sB?.site_icon ? 'definido' : 'no'}`);
linea(sA?.show_on_front === sB?.show_on_front, `página de inicio estática: ${sA?.show_on_front} / ${sB?.show_on_front}`);

console.log(`\n${diferencias === 0 ? 'EL ESPEJO ES IGUAL A PRODUCCIÓN.' : diferencias + ' diferencia(s). Revisar arriba.'}`);
process.exit(diferencias === 0 ? 0 : 1);
