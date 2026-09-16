import { readFileSync } from 'node:fs';
import path from 'node:path';
export const repo = 'C:/Users/Cristobal concha/open-codesign-wordpress';
const cfg = JSON.parse(readFileSync(path.join(repo, 'scripts/cod-grapes-runner/cod-grapes-runner.config.json'), 'utf8'));
const ep = cfg.siteUrl.replace(/\/+$/, '') + '/wp-json/contope/v1/mcp';
const auth = 'Basic ' + Buffer.from(cfg.username + ':' + cfg.applicationPassword.replace(/\s+/g, '')).toString('base64');
export async function tool(name, args) {
  let ultimo;
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name, arguments: args } }) });
      const p = JSON.parse(await r.text());
      if (p.error) throw new Error(p.error.message);
      const res = p.result;
      if (res?.isError) throw new Error(res.content?.[0]?.text || 'error');
      return res.structuredContent || JSON.parse(res.content[0].text);
    } catch (e) { ultimo = e; await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
  throw ultimo;
}
/** Bloques de primer nivel, respetando lo anidado. */
export function bloques(css) {
  const o = []; let p = 0, i0 = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') p++;
    else if (css[i] === '}') { p--; if (p === 0) { o.push(css.slice(i0, i + 1).trim()); i0 = i + 1; } }
  }
  return o;
}
/** Reglas de adentro de un @media. */
export function internas(bloque) {
  const c = bloque.slice(bloque.indexOf('{') + 1, bloque.lastIndexOf('}'));
  return bloques(c);
}
export const condicion = (b) => b.slice(b.indexOf('@media') + 6, b.indexOf('{')).trim();
export const selectorDe = (r) => r.slice(0, r.indexOf('{')).trim();
export function declaraciones(r) {
  const cuerpo = r.slice(r.indexOf('{') + 1, r.lastIndexOf('}'));
  const out = {};
  let prof = 0, actual = '';
  for (const ch of cuerpo) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ';' && prof === 0) { aplicar(actual, out); actual = ''; continue; }
    actual += ch;
  }
  aplicar(actual, out);
  return out;
}
function aplicar(texto, out) {
  const t = texto.trim();
  if (t === '') return;
  const i = t.indexOf(':');
  if (i < 0) return;
  out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

/**
 * Resuelve una hoja a lo que el navegador termina aplicando:
 * para cada (media, selector, propiedad), el último valor gana.
 *
 * Es la comparación que importa. Comparar el TEXTO de los bloques da falsos
 * positivos en cuanto se fusionan dos bloques de la misma condición: el texto
 * cambia y el resultado en pantalla no.
 */
export function resolver(css) {
  const mapa = new Map();
  const poner = (media, regla) => {
    const sel = selectorDe(regla);
    const k = media + '||' + sel;
    mapa.set(k, { ...(mapa.get(k) || {}), ...declaraciones(regla) });
  };
  for (const b of bloques(css)) {
    if (b.startsWith('@media')) { for (const r of internas(b)) poner('@media ' + condicion(b), r); }
    else if (b.startsWith('@')) { mapa.set('crudo||' + b.replace(/\s+/g, ' '), {}); }
    else poner('', b);
  }
  return mapa;
}
export function comparar(a, b) {
  const dif = [];
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb) { dif.push({ tipo: 'falta el selector', k }); continue; }
    for (const [p, v] of Object.entries(va)) {
      if (vb[p] === undefined) dif.push({ tipo: 'falta propiedad', k, p, v });
      else if (vb[p] !== v) dif.push({ tipo: 'valor distinto', k, p, v, otro: vb[p] });
    }
  }
  for (const [k, vb] of b) {
    const va = a.get(k);
    if (!va) { dif.push({ tipo: 'selector de más', k }); continue; }
    for (const p of Object.keys(vb)) if (va[p] === undefined) dif.push({ tipo: 'propiedad de más', k, p, v: vb[p] });
  }
  return dif;
}
