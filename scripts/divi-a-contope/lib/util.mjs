/**
 * Utilidades pequeñas y sin dependencias: color, medidas CSS, hash estable y un
 * lector mínimo de HTML (lo que traen los módulos de texto de Divi: títulos,
 * párrafos, listas, saltos de línea, enlaces y énfasis).
 */
import { createHash } from 'node:crypto';

export const hash = (texto, n = 6) => createHash('sha1').update(String(texto)).digest('hex').slice(0, n);

/** Número de una medida CSS en px ("54px" → 54, "129.6px" → 129.6, "normal" → null). */
export const px = (v) => {
  if (v === undefined || v === null) return null;
  const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)(px)?$/);
  return m ? Number(m[1]) : null;
};
export const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const pxs = (n) => `${redondear(n)}px`;

/** "54px 0px 129.6px" → [arriba, derecha, abajo, izquierda] en números. */
export const lados = (v) => {
  const p = String(v || '0').trim().split(/\s+/).map((x) => px(x) ?? 0);
  if (p.length === 1) return [p[0], p[0], p[0], p[0]];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  if (p.length === 3) return [p[0], p[1], p[2], p[1]];
  return [p[0], p[1], p[2], p[3]];
};

/** rgb()/rgba() → {r,g,b,a} o null. */
export const leerColor = (c) => {
  if (!c) return null;
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16), a: 1 } : null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
export const hex = (c) => {
  const k = typeof c === 'string' ? leerColor(c) : c;
  if (!k) return null;
  return '#' + [k.r, k.g, k.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
};
export const esTransparente = (c) => { const k = leerColor(c); return !k || k.a === 0; };
/** Color como lo entiende una regla: hex si es opaco, rgba() si no. */
export const colorRegla = (c) => {
  const k = leerColor(c);
  if (!k || k.a === 0) return 'transparent';
  return k.a === 1 ? hex(k) : `rgba(${k.r}, ${k.g}, ${k.b}, ${redondear(k.a, 3)})`;
};

export const sinComillas = (s) => String(s || '').replace(/['"]/g, '').trim();

/** Alineación computada → valor de la regla `typography`. */
export const alineacion = (a) => ({ left: 'start', start: 'start', right: 'end', end: 'end', center: 'center', justify: 'justify' }[a] || 'start');

/** Decodifica las entidades que aparecen en el HTML de Divi. */
export const entidades = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&hellip;/g, '…').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const VACIAS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
/** Lector mínimo: devuelve un árbol {tag, attrs, hijos[]} / {texto}. No valida. */
export const leerHtml = (html) => {
  const raiz = { tag: '#raiz', attrs: {}, hijos: [] };
  const pila = [raiz];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const actual = pila[pila.length - 1];
    if (m[4] !== undefined) { actual.hijos.push({ texto: entidades(m[4]) }); continue; }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      for (let i = pila.length - 1; i > 0; i--) if (pila[i].tag === tag) { pila.length = i; break; }
      continue;
    }
    const attrs = {};
    for (const a of (m[2] || '').matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = entidades(a[2] ?? a[3] ?? a[4] ?? '');
    const nodo = { tag, attrs, hijos: [] };
    actual.hijos.push(nodo);
    if (!VACIAS.has(tag) && !m[3]) pila.push(nodo);
  }
  return raiz;
};

/** Texto plano de un nodo; <br> pasa a salto de línea. */
export const textoDe = (n) => {
  if (n.texto !== undefined) return n.texto;
  if (n.tag === 'br') return '\n';
  return n.hijos.map(textoDe).join('');
};
export const limpiarTexto = (t) => t.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/^\s+|\s+$/g, '');

/** Marcas en línea que un nodo de texto de ContOpe no puede llevar. */
export const marcasEnLinea = (n, acc = new Set()) => {
  if (n.texto !== undefined) return acc;
  if (['a', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'img', 'mark', 'small'].includes(n.tag)) acc.add(n.tag);
  for (const h of n.hijos) marcasEnLinea(h, acc);
  return acc;
};
