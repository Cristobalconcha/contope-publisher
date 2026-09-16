/**
 * Limpia de un documento las reglas repetidas, en el JSON y en el CSS.
 *
 * Existe por la issue #12: hasta la 0.3.23 el editor copiaba dentro del
 * documento, en cada guardado, las reglas base de un módulo del plugin. Eso ya
 * se cortó en el origen; esto barre lo que quedó acumulado de antes.
 *
 * NO ejecutar antes de tener 0.3.23 desplegada: sin cortar el origen, la
 * limpieza se deshace sola en el siguiente guardado.
 *
 * La fuente es projectData. Limpiar solo la hoja de CSS no sirve: Grapes la
 * regenera desde el JSON en el guardado siguiente y las copias vuelven. Por
 * eso se limpian las dos, y el JSON primero.
 *
 * De cada grupo de reglas idénticas conserva LA ÚLTIMA, nunca la primera. Si
 * entremedio hay una regla que la pisa, quedarse con la primera cambiaría lo
 * que se ve; quedarse con la última deja la cascada exactamente igual.
 *
 * Uso:
 *   node limpiar-css-duplicado.mjs                 (simulación, no guarda)
 *   node limpiar-css-duplicado.mjs --aplicar       (guarda)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const aplicar = process.argv.includes('--aplicar');
const config = JSON.parse(readFileSync(path.join(aquí, 'cod-grapes-runner.config.json'), 'utf8'));
const endpoint = `${config.siteUrl.replace(/\/+$/, '')}/wp-json/contope/v1/mcp`;
const auth = 'Basic ' + Buffer.from(`${config.username}:${config.applicationPassword.replace(/\s+/g, '')}`).toString('base64');

let id = 0;
async function tool(name, args) {
  id += 1;
  for (let intento = 1; intento <= 4; intento += 1) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
      });
      const t = await r.text();
      const p = JSON.parse(t);
      if (p.error) throw new Error(p.error.message || JSON.stringify(p.error));
      const res = p.result;
      if (res?.isError) throw new Error(res.content?.[0]?.text || JSON.stringify(res));
      if (res?.structuredContent) return res.structuredContent;
      if (res?.content?.[0]?.text) { try { return JSON.parse(res.content[0].text); } catch { return res.content[0].text; } }
      return res;
    } catch (e) {
      if (intento === 4) throw e;
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
}

/** Parte el CSS en bloques de primer nivel, respetando lo anidado (@media). */
function bloques(css) {
  const out = [];
  let prof = 0, ini = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') prof += 1;
    else if (css[i] === '}') {
      prof -= 1;
      if (prof === 0) { out.push(css.slice(ini, i + 1)); ini = i + 1; }
    }
  }
  const cola = css.slice(ini);
  if (cola.trim() !== '') out.push(cola);
  return out;
}

function limpiar(css) {
  const partes = bloques(css);
  const claves = partes.map((p) => p.trim());
  const última = new Map();
  claves.forEach((k, i) => última.set(k, i));
  const quedan = [];
  const quitadas = new Map();
  partes.forEach((p, i) => {
    const k = claves[i];
    if (k === '' || última.get(k) === i) quedan.push(p);
    else quitadas.set(k, (quitadas.get(k) || 0) + 1);
  });
  // Si no hay nada que quitar, se devuelve el CSS TAL CUAL. Reescribirlo por
  // un salto de linea de diferencia subiria la revision del documento sin
  // ningun motivo, y una revision es historia: no se gasta en nada.
  if (quitadas.size === 0) {
    return { css, quitadas, antes: partes.length, después: quedan.length };
  }
  return { css: quedan.join('').trim() + '\n', quitadas, antes: partes.length, después: quedan.length };
}

/**
 * Quita de projectData.styles las reglas que son objetos idénticos.
 *
 * Conserva la última por la misma razón que en el CSS: si entremedio hay una
 * regla que la pisa, quedarse con la primera cambiaría lo que se ve.
 */
function limpiarJson(projectDataTexto) {
  const pd = JSON.parse(projectDataTexto);
  if (!Array.isArray(pd.styles)) return { texto: projectDataTexto, quitadas: 0, antes: 0, después: 0 };
  const claves = pd.styles.map((r) => JSON.stringify(r));
  const última = new Map();
  claves.forEach((k, i) => última.set(k, i));
  const quedan = pd.styles.filter((_, i) => última.get(claves[i]) === i);
  const quitadas = pd.styles.length - quedan.length;
  if (quitadas === 0) return { texto: projectDataTexto, quitadas: 0, antes: pd.styles.length, después: pd.styles.length };
  const antes = pd.styles.length;
  pd.styles = quedan;
  return { texto: JSON.stringify(pd), quitadas, antes, después: quedan.length };
}

const MARCA = '/* COD-CANVAS-EDITABLE-OVERRIDES */';
const backupsDir = path.join(aquí, 'backups');
if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });

console.log(`\n▸ Sitio: ${config.siteUrl}`);
console.log(aplicar ? '▸ Modo:  APLICAR (guarda)\n' : '▸ Modo:  simulación (no guarda)\n');

const { pages } = await tool('cod_list_canvas_pages', {});
let totalBytes = 0;

for (const pág of pages) {
  const doc = await tool('cod_read_canvas_document', { pageId: pág.pageId, documentId: pág.documentId });
  if (typeof doc?.css !== 'string') { console.log(`  ${pág.title}: sin CSS, se omite`); continue; }
  const r = limpiar(doc.css);
  const j = limpiarJson(doc.projectData);
  const ahorro = doc.css.length - r.css.length;
  const marcaAntes = doc.css.includes(MARCA);
  const marcaDespués = r.css.includes(MARCA);

  console.log(`▸ ${pág.title}  (${pág.documentId}, rev ${doc.revision})`);
  console.log(`    reglas ${r.antes} → ${r.después}   ·   CSS ${doc.css.length.toLocaleString('es-CL')} → ${r.css.length.toLocaleString('es-CL')} bytes  (−${ahorro.toLocaleString('es-CL')})`);
    console.log(`    JSON   ${j.antes} → ${j.después} reglas   ·   quitadas ${j.quitadas}`);
  if (marcaAntes !== marcaDespués) { console.log('    ✗ DETENIDO: se perdería la marca de overrides'); continue; }
  if (r.quitadas.size > 0) {
    const top = [...r.quitadas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    for (const [k, n] of top) console.log(`      −${n}  ${k.slice(0, 78).replace(/\s+/g, ' ')}`);
    if (r.quitadas.size > 4) console.log(`      … y ${r.quitadas.size - 4} más`);
  }
  totalBytes += ahorro;

  if (r.quitadas.size === 0 && j.quitadas === 0) {
    console.log('    ya esta limpio, no se toca');
    console.log('');
    continue;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(path.join(backupsDir, `${pág.documentId}-rev${doc.revision}-preLimpieza-${stamp}.json`), JSON.stringify(doc, null, 1), 'utf8');

  if (!aplicar) { console.log('    (simulación: no se guardó)\n'); continue; }
  const saved = await tool('cod_write_canvas_document', {
    pageId: pág.pageId,
    documentId: pág.documentId,
    expectedRevision: doc.revision,
    projectData: j.texto,
    html: doc.html,
    css: r.css,
  });
  console.log(`    guardado · nueva revisión ${saved.revision}\n`);
}

console.log(`\n${aplicar ? 'Liberados' : 'Se liberarían'} ${totalBytes.toLocaleString('es-CL')} bytes en total.\n`);
