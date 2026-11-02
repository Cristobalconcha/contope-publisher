/**
 * Traduce una composición de Basis (los `*.componer.json` del transcriptor Divi → ContOpe) a un ÁRBOL DE BLOQUES de WordPress.
 *
 * Ni una sola declaración de diseño pasa como valor: cada una se resuelve contra las escalas del set (`escalas.json`, que
 * salen de lo que el sitio usa) o contra el registro (colores, familias) y queda como REFERENCIA —un slug de preset
 * (`textColor: "accent"`, `fontSize: "40"`), `var:preset|spacing|60` o `var(--wp--custom--radius--m)`—. Lo que no tiene
 * atributo de bloque ni escala (sombras, `outline`, `backdrop-filter`, el ícono “+” del acordeón…) NO se rodea con CSS: se
 * anota en `perdidas` y va al informe de diferencias.
 *
 * La función pura `convertirPagina()` no toca la red ni WordPress: recibe los datos y devuelve `{ bloques, perdidas, avisos }`.
 */

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const textoAHtml = (t) => escapar(t).replace(/\n/g, '<br>');
const aNumero = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v).trim()); return m ? Number(m[1]) : null; };

/** Vecino más cercano de una lista de pasos [{slug, n}] (los empates van al paso menor). */
function vecino(pasos, valor) {
  let mejor = null;
  for (const p of pasos) if (mejor === null || Math.abs(p.n - valor) < Math.abs(mejor.n - valor)) mejor = p;
  return mejor;
}

export function crearTraductor({ escalas, medios = new Map(), iconos = new Map() }) {
  const perdidas = [];
  const avisos = [];
  const pasosDe = (clave, fn) => escalas.escalas[clave].pasos.filter((p) => !isNaN(fn(p))).map((p) => ({ slug: p.slug, n: fn(p) }));
  const espaciado = pasosDe('spacing', (p) => Number.parseFloat(p.valor));
  const tamanos = pasosDe('font-size', (p) => Number.parseFloat(p.valor));
  const radios = escalas.escalas.radius.pasos.map((p) => ({ slug: p.slug, valor: p.valor }));
  const pasoBorde = escalas.escalas.border.pasos;
  const pesos = new Map(escalas.escalas.weight.pasos.map((p) => [p.valor, p.slug]));
  const interlineados = escalas.escalas.leading.pasos.map((p) => ({ slug: p.slug, n: Number(p.valor) }));

  const perder = (donde, prop, valor, motivo) => perdidas.push({ donde, prop, valor: String(valor), motivo });

  /** px → referencia a un paso del espaciado. 0 → "0"; negativo → calc(-1 * var()). */
  function esp(valor, donde, prop) {
    if (valor === undefined || valor === null || valor === '') return undefined;
    const v = String(valor).trim();
    if (v === '0' || v === '0px' || v === '0%') return '0';
    if (v === 'auto') return undefined;
    let n = aNumero(v);
    if (n === null) {
      const suma = /^calc\(\s*(\d+(?:\.\d+)?)px\s*\+\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(v);
      const em = /^(\d+(?:\.\d+)?)em$/.exec(v);
      if (suma) n = Number(suma[1]) + Number(suma[2]);
      else if (em) n = Number(em[1]) * 16;
    }
    if (n === null) { perder(donde, prop, v, 'no es una medida en px (no entra en la escala de espaciado)'); return undefined; }
    const p = vecino(espaciado, Math.abs(n));
    if (Math.abs(p.n - Math.abs(n)) > 0 && Math.abs(Math.abs(n) - p.n) / Math.abs(n) > 0.2 && Math.abs(Math.abs(n) - p.n) > 3) perder(donde, prop, v, `se acercó a ${p.n}px (paso ${p.slug}): más de 3 px y 20 % de diferencia`);
    return n < 0 ? `calc(-1 * var(--wp--preset--spacing--${p.slug}))` : `var:preset|spacing|${p.slug}`;
  }
  function slugTamano(valor, donde) {
    const n = aNumero(valor);
    if (n === null) { perder(donde, 'font-size', valor, 'no es px'); return undefined; }
    return vecino(tamanos, n).slug;
  }
  const lh = (v) => { const p = vecino(interlineados, Number(v)); return `var(--wp--custom--typography--line-height--${p.slug})`; };
  const fw = (v) => { const s = pesos.get(String(v)); return s ? `var(--wp--custom--typography--font-weight--${s})` : undefined; };
  function radio(v, donde) {
    const t = String(v).trim().split(/\s+/);
    const uno = (x) => {
      if (x === '0' || x === '0px') return '0';
      if (x === 'pill') return 'var(--wp--custom--radius--pill)';
      if (x === '50%') return 'var(--wp--custom--radius--circle)';
      const n = aNumero(x);
      if (n === null) { perder(donde, 'border-radius', x, 'no es una medida del set'); return undefined; }
      const r = radios.filter((q) => q.valor.endsWith('px') && q.valor !== '9999px').reduce((a, b) => (Math.abs(Number.parseFloat(b.valor) - n) < Math.abs(Number.parseFloat(a.valor) - n) ? b : a));
      return `var(--wp--custom--radius--${r.slug})`;
    };
    if (t.length === 1) return uno(t[0]);
    const [a, b = a, c = a, d = b] = t;
    return { topLeft: uno(a), topRight: uno(b), bottomRight: uno(c), bottomLeft: uno(d) };
  }
  function slugColor(v, donde, prop) {
    if (!v || v === 'transparent' || v === 'inherit' || v === 'currentColor') return undefined;
    let m = /^var\(--wp--preset--color--([a-z0-9-]+)\)$/.exec(v);
    if (m) return m[1];
    const roles = { 'var(--cod-color-surface)': 'fondo-pagina', 'var(--cod-color-accent)': 'accent', 'var(--cod-color-ink)': 'texto-cuerpo', 'var(--cod-color-primary)': 'gris', 'var(--cod-color-bg)': 'fondo-pagina', 'var(--cod-color-text)': 'texto-cuerpo' };
    if (roles[v]) return roles[v];
    m = /^color-mix\(in srgb, (var\([^)]*\)) [\d.]+%, transparent\)$/.exec(v);
    if (m) { perder(donde, prop, v, 'un color con transparencia no es un preset (la paleta no declara variantes con alfa)'); return slugColor(m[1], donde, prop); }
    perder(donde, prop, v, 'color fuera de la paleta');
    return undefined;
  }
  function slugFamilia(v) {
    const mapa = { 'var(--cod-font-heading)': 'display', 'var(--cod-font-body)': 'body', 'var(--cod-font-accent)': 'pliegue' };
    if (mapa[v]) return mapa[v];
    const m = /^var\(--wp--preset--font-family--([a-z0-9-]+)\)$/.exec(v || '');
    return m ? m[1] : undefined;
  }

  return { esp, slugTamano, lh, fw, radio, slugColor, slugFamilia, perder, perdidas, avisos, medios, iconos, escalas, vecino, espaciado, pasoBorde };
}

/** Junta lo que dicen las reglas de un nodo (alcance «all», estado normal) en un objeto plano. */
export function propiedadesDe(ids, reglas, { estado = 'default', bp = 'all' } = {}) {
  const P = {};
  const X = { typography: null, color: [], surface: null, shape: null, layout: null, media: null, button: null, icono: null, interaction: null, form: null, divisor: null };
  for (const id of ids || []) {
    const r = reglas.get(id);
    if (!r) continue;
    const sc = r.scope || {};
    if ((sc.breakpoint || 'all') !== bp || (sc.state || 'default') !== estado) continue;
    const v = r.value || {};
    switch (r.kind) {
      case 'properties': Object.assign(P, v.declarations || {}); break;
      case 'typography': X.typography = { ...(X.typography || {}), ...v }; break;
      case 'color': X.color.push(v); break;
      case 'surface': X.surface = { ...(X.surface || {}), ...v }; break;
      case 'shape': X.shape = v; break;
      case 'layout': X.layout = v; break;
      case 'media': X.media = v; break;
      case 'button': X.button = v; break;
      case 'icono': X.icono = v; break;
      case 'interaction': X.interaction = v; break;
      case 'form': X.form = v; break;
      case 'divisor': X.divisor = v; break;
      default: break;
    }
  }
  // lo estructurado se vuelve propiedades: la conversión mira una sola cosa
  const T = X.typography;
  if (T) {
    if (T.family) P['font-family'] = T.family;
    if (T.fontSize) P['font-size'] = T.fontSize;
    if (T.fontWeight !== undefined) P['font-weight'] = String(T.fontWeight);
    if (T.lineHeight !== undefined) P['line-height'] = String(T.lineHeight);
    if (T.align) P['text-align'] = T.align;
  }
  for (const c of X.color) {
    if (c.apply === 'background') P['background-color'] = c.color;
    else if (c.apply === 'border') P['border-color'] = c.color;
    else P.color = c.color;
  }
  if (X.surface?.backgroundColor) P['background-color'] = X.surface.backgroundColor;
  if (X.shape?.radius) P['border-radius'] = X.shape.radius;
  return { P, X };
}

const lado = (P, ...nombres) => { for (const n of nombres) if (P[n] !== undefined) return P[n]; return undefined; };

/** Atributos comunes de un bloque (color, tipografía, espaciado, borde) a partir de las propiedades. */
export function atributosComunes(T, P, X, donde, { margen = true, relleno = true, tipografia = true } = {}) {
  const a = {};
  const style = {};
  const c = T.slugColor(P.color, donde, 'color');
  if (c) a.textColor = c;
  const fondo = T.slugColor(P['background-color'], donde, 'background-color');
  if (fondo) a.backgroundColor = fondo;
  if (tipografia) {
    if (P['font-size']) { const s = T.slugTamano(P['font-size'], donde); if (s) a.fontSize = s; }
    const f = T.slugFamilia(P['font-family']);
    if (f) a.fontFamily = f;
    const ty = {};
    if (P['font-weight']) { const w = T.fw(P['font-weight']); if (w) ty.fontWeight = w; else T.perder(donde, 'font-weight', P['font-weight'], 'peso fuera de la escala'); }
    if (P['line-height'] && /^\d+(\.\d+)?$/.test(P['line-height'])) ty.lineHeight = T.lh(P['line-height']);
    else if (P['line-height'] && P['line-height'] !== 'normal') T.perder(donde, 'line-height', P['line-height'], 'interlineado en px: sin escala');
    const al = { start: 'left', left: 'left', end: 'right', right: 'right', center: 'center' }[P['text-align']];
    if (al) ty.textAlign = al;
    if (Object.keys(ty).length) style.typography = ty;
  }
  const sp = {};
  if (relleno) {
    const pad = {};
    const top = T.esp(lado(P, 'padding-top', 'padding-block-start'), donde, 'padding-top');
    const right = T.esp(lado(P, 'padding-right', 'padding-inline-end'), donde, 'padding-right');
    const bottom = T.esp(lado(P, 'padding-bottom', 'padding-block-end'), donde, 'padding-bottom');
    const left = T.esp(lado(P, 'padding-left', 'padding-inline-start'), donde, 'padding-left');
    if (top !== undefined) pad.top = top;
    if (right !== undefined) pad.right = right;
    if (bottom !== undefined) pad.bottom = bottom;
    if (left !== undefined) pad.left = left;
    if (Object.keys(pad).length) sp.padding = pad;
  }
  if (margen) {
    const mar = {};
    const top = T.esp(lado(P, 'margin-top', 'margin-block-start'), donde, 'margin-top');
    const bottom = T.esp(lado(P, 'margin-bottom', 'margin-block-end'), donde, 'margin-bottom');
    if (top !== undefined) mar.top = top;
    if (bottom !== undefined) mar.bottom = bottom;
    if (Object.keys(mar).length) sp.margin = mar;
  }
  if (Object.keys(sp).length) style.spacing = sp;
  // borde
  const borde = {};
  if (P['border-radius']) { const r = T.radio(P['border-radius'], donde); if (r) borde.radius = r; }
  for (const lado_ of ['top', 'right', 'bottom', 'left']) {
    const w = P[`border-${lado_}-width`] ?? P['border-width'];
    if (w && w !== '0px' && w !== '0') {
      const n = aNumero(w);
      const paso = n === null ? null : (n >= 2 ? 'thick' : 'hairline');
      const col = T.slugColor(P[`border-${lado_}-color`] ?? P['border-color'], donde, `border-${lado_}-color`);
      if (paso) borde[lado_] = { width: `var(--wp--custom--border--${paso})`, ...(col ? { color: `var:preset|color|${col}` } : {}), style: 'solid' };
    }
  }
  if (Object.keys(borde).length) style.border = borde;
  if (Object.keys(style).length) a.style = style;
  return a;
}

const IGNORADAS = new Set([
  'display', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y', 'flex-shrink', 'flex-grow', 'flex-basis', 'flex-direction', 'flex-wrap',
  'align-items', 'align-self', 'justify-content', 'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'object-fit', 'cursor', 'position', 'inset-block-start', 'inset-inline-start', 'top', 'right', 'z-index',
  'pointer-events', 'isolation', 'margin-inline-start', 'margin-inline-end', 'margin-top', 'margin-bottom', 'margin-block-start', 'margin-block-end', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'color', 'background-color', 'border-radius',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-color', 'list-style-position', 'list-style-type', 'text-decoration-line', 'height', 'bottom', 'left', 'transform',
]);

/** Lo que las reglas decían y ningún bloque expresa: se anota, no se rodea. */
export function anotarSobrantes(T, P, donde) {
  for (const [k, v] of Object.entries(P)) {
    if (IGNORADAS.has(k)) continue;
    if (k === 'box-shadow') T.perder(donde, k, v, 'sombra: el set no tiene escala de sombras (Q3)');
    else if (k === 'backdrop-filter') T.perder(donde, k, v, 'el desenfoque no tiene atributo de bloque ni escala');
    else if (k.startsWith('outline')) T.perder(donde, k, v, 'el contorno (outline) no tiene atributo de bloque ni escala');
    else if (k === 'font-style' || k === 'text-transform' || k === 'transition') T.perder(donde, k, v, 'sin atributo de bloque');
    else T.perder(donde, k, v, 'propiedad sin atributo de bloque');
  }
}
