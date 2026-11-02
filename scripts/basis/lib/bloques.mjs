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
  // Cada paso de espaciado es «escritorio / tablet / celular» (lo que no redefine un punto de quiebre hereda el de escritorio).
  const espaciado = escalas.escalas.spacing.pasos.filter((p) => !isNaN(Number.parseFloat(p.valor))).map((p) => { const d = Number.parseFloat(p.valor); return { slug: p.slug, n: d, d, t: p.tablet ? Number.parseFloat(p.tablet) : d, m: p.movil ? Number.parseFloat(p.movil) : d }; });
  // Cada paso de tamaño es «escritorio / tablet / celular»; lo que no redefine un punto de quiebre hereda el de escritorio.
  const tamanos = escalas.escalas['font-size'].pasos.map((p) => { const d = Number.parseFloat(p.valor); return { slug: p.slug, n: d, d, t: p.tablet ? Number.parseFloat(p.tablet) : d, m: p.movil ? Number.parseFloat(p.movil) : d }; });
  const radios = escalas.escalas.radius.pasos.map((p) => ({ slug: p.slug, valor: p.valor }));
  const pasoBorde = escalas.escalas.border.pasos;
  const pesos = new Map(escalas.escalas.weight.pasos.map((p) => [p.valor, p.slug]));
  const interlineados = escalas.escalas.leading.pasos.map((p) => ({ slug: p.slug, n: Number(p.valor) }));

  const perder = (donde, prop, valor, motivo) => perdidas.push({ donde, prop, valor: String(valor), motivo });

  /** px → referencia a un paso del espaciado. 0 → "0"; negativo → calc(-1 * var()). */
  /** `tablet` y `movil`: lo que el original declara para ESA misma propiedad en cada punto de quiebre (si lo declara). */
  function esp(valor, donde, prop, tablet, movil) {
    if (valor === undefined || valor === null || valor === '') return undefined;
    const v = String(valor).trim();
    const t = tablet === undefined ? null : aNumero(tablet);
    const m = movil === undefined ? null : aNumero(movil);
    if ((v === '0' || v === '0px') && (t !== null || m !== null)) {
      // un cero de escritorio que cambia en tablet o celular es un paso de la escala (0 / tablet / celular)
      const ceros = espaciado.filter((p) => p.d === 0);
      const exacto = ceros.find((p) => (t === null ? p.t === 0 : p.t === t) && (m === null ? p.m === 0 : p.m === m));
      if (exacto) return `var:preset|spacing|${exacto.slug}`;
      perder(donde, prop, `0 / ${tablet ?? '='} / ${movil ?? '='}`, 'la escala de espaciado no tiene esta terna escritorio/tablet/celular');
      return '0';
    }
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
    let p = vecino(espaciado.filter((q) => q.d > 0), Math.abs(n));
    // De los pasos con ese tamaño de escritorio vale el que tiene los mismos valores en tablet y celular.
    const hermanos = espaciado.filter((q) => q.d === p.d);
    const igual = hermanos.find((q) => (t === null ? q.t === q.d : q.t === t) && (m === null ? q.m === q.d : q.m === m));
    if (igual) p = igual;
    else if (t !== null || m !== null) perder(donde, prop, `${v} / ${tablet ?? '='} / ${movil ?? '='}`, 'la escala de espaciado no tiene esta terna escritorio/tablet/celular');
    if (Math.abs(p.n - Math.abs(n)) > 0 && Math.abs(Math.abs(n) - p.n) / Math.abs(n) > 0.2 && Math.abs(Math.abs(n) - p.n) > 3) perder(donde, prop, v, `se acercó a ${p.n}px (paso ${p.slug}): más de 3 px y 20 % de diferencia`);
    return n < 0 ? `calc(-1 * var(--wp--preset--spacing--${p.slug}))` : `var:preset|spacing|${p.slug}`;
  }
  /** `valor` es el tamaño de escritorio; `tablet` y `movil` (si el texto los redefine) son los de los otros puntos de quiebre. */
  function slugTamano(valor, donde, tablet, movil) {
    const n = aNumero(valor);
    if (n === null) { perder(donde, 'font-size', valor, 'no es px'); return undefined; }
    const mejorD = vecino(tamanos, n).d;
    const candidatos = tamanos.filter((p) => p.d === mejorD);
    const t = tablet === undefined ? null : aNumero(tablet);
    const m = movil === undefined ? null : aNumero(movil);
    const exacto = candidatos.find((p) => (t === null ? p.t === p.d : p.t === t) && (m === null ? p.m === p.d : p.m === m));
    if (exacto) return exacto.slug;
    perder(donde, 'font-size', `${valor} / ${tablet ?? '='} / ${movil ?? '='}`, 'la escala de tamaños no tiene esta terna escritorio/tablet/celular');
    return candidatos[0].slug;
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
  const pasosAlfa = escalas.escalas.alpha?.pasos ?? [];
  const pasosSombra = escalas.escalas.shadow?.pasos ?? [];
  const pasosDesenfoque = escalas.escalas.blur?.pasos ?? [];
  function slugColor(v, donde, prop) {
    if (!v || v === 'transparent' || v === 'inherit' || v === 'currentColor') return undefined;
    const base = slugDeColorBase(v);
    if (base) return base;
    // Un color de la paleta con transparencia es un paso de la escala de transparencias (un slug de la paleta más), no una mezcla escrita a mano.
    const m = /^color-mix\(in srgb, (var\([^)]*\)) ([\d.]+)%, transparent\)$/.exec(v);
    if (m) {
      const b = slugDeColorBase(m[1]);
      const paso = b && pasosAlfa.find((p) => p.valor === `${b} ${Number(m[2])}%`);
      if (paso) return paso.slug;
      perder(donde, prop, v, 'la escala de transparencias no tiene este paso (color con opacidad)');
      return b;
    }
    perder(donde, prop, v, 'color fuera de la paleta');
    return undefined;
  }
  /** `box-shadow` medido → `var:preset|shadow|paso` (la escala de sombras), o undefined si no es un paso. */
  function sombra(v, donde) {
    const norm = String(v).replace(/\s+/g, ' ').trim();
    if (norm === 'none') return undefined;
    const paso = pasosSombra.find((p) => p.valor === norm);
    if (paso) return `var:preset|shadow|${paso.slug}`;
    perder(donde, 'box-shadow', norm, 'la escala de sombras no tiene este paso');
    return undefined;
  }
  /** `backdrop-filter: blur(Npx)` → el slug de la escala de desenfoques. */
  function desenfoque(v, donde) {
    const m = /^blur\((\d+(?:\.\d+)?px)\)$/.exec(String(v).trim());
    const paso = m && pasosDesenfoque.find((p) => p.valor === m[1]);
    if (paso) return paso.slug;
    perder(donde, 'backdrop-filter', v, 'la escala de desenfoques no tiene este paso');
    return undefined;
  }
  function slugFamilia(v) {
    const mapa = { 'var(--cod-font-heading)': 'display', 'var(--cod-font-body)': 'body', 'var(--cod-font-accent)': 'pliegue' };
    if (mapa[v]) return mapa[v];
    const m = /^var\(--wp--preset--font-family--([a-z0-9-]+)\)$/.exec(v || '');
    return m ? m[1] : undefined;
  }

  /**
   * Las PARTES de un bloque de WordPress (la etiqueta de un buscador, el enlace de una lista de entradas…): lo que Gutenberg dibuja por
   * dentro y ningún atributo expresa. Cada declaración medida se traduce a una REFERENCIA al sistema —un slug de la paleta, un paso de
   * la escala de tamaños, de espaciado, de bordes, de radios, de sombras— y sólo las propiedades de estructura (display, width, position…)
   * pasan tal cual. Lo que no tiene escala (un interlineado en px, un valor fuera de la paleta) se anota y no entra.
   */
  const ESTRUCTURA = new Set(['display', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'position', 'top', 'right', 'bottom', 'left', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap', 'align-items', 'align-self', 'justify-content', 'overflow', 'overflow-x', 'overflow-y', 'z-index', 'list-style-type', 'list-style-position', 'text-decoration-line', 'text-align', 'text-transform', 'font-style', 'cursor', 'box-sizing', 'opacity', 'object-fit', 'vertical-align', 'white-space']);
  const espacioCss = (v) => { const m = /^var:preset\|spacing\|(.+)$/.exec(v ?? ''); return m ? `var(--wp--preset--spacing--${m[1]})` : v; };
  function cssDeParte(P, donde) {
    const out = [];
    const tamanoTablet = P['__tamano-tablet'];
    const tamanoMovil = P['__tamano-movil'];
    for (const [k, v] of Object.entries(P)) {
      if (k.startsWith('__')) continue;
      if (ESTRUCTURA.has(k)) { out.push([k, v]); continue; }
      if (k === 'color' || k === 'background-color' || /^border-(?:top|right|bottom|left)-color$/.test(k) || k === 'border-color') {
        if (v === 'transparent' || v === 'inherit' || v === 'currentColor') { out.push([k, v]); continue; }
        const c = slugColor(v, donde, k);
        if (c) out.push([k, `var(--wp--preset--color--${c})`]);
      } else if (k === 'font-family') {
        const f = slugFamilia(v);
        if (f) out.push([k, `var(--wp--preset--font-family--${f})`]); else perder(donde, k, v, 'familia fuera del set');
      } else if (k === 'font-size') {
        const s = slugTamano(v, donde, tamanoTablet, tamanoMovil);
        if (s) out.push([k, `var(--wp--preset--font-size--${s})`]);
      } else if (k === 'font-weight') {
        const w = fw(v);
        if (w) out.push([k, w]); else perder(donde, k, v, 'peso fuera de la escala');
      } else if (k === 'line-height') {
        if (v === 'normal') out.push([k, v]);
        else if (/^\d+(\.\d+)?$/.test(v)) out.push([k, lh(v)]);
        else perder(donde, k, v, 'interlineado en px: sin escala');
      } else if (/^(?:padding|margin)(?:-(?:top|right|bottom|left|block-start|block-end|inline-start|inline-end))?$|^(?:row-|column-)?gap$/.test(k)) {
        const e = esp(v, donde, k);
        if (e !== undefined) out.push([k, espacioCss(e)]);
      } else if (/^border-(?:top|right|bottom|left)-width$/.test(k) || k === 'border-width') {
        const n = aNumero(v);
        if (n === 0 || v === '0') out.push([k, '0']);
        else if (n !== null) out.push([k, `var(--wp--custom--border--${n >= 2 ? 'thick' : 'hairline'})`]);
      } else if (/^border-(?:top|right|bottom|left)-style$/.test(k) || k === 'border-style') {
        out.push([k, v]);
      } else if (k === 'border-radius' || /^border-(?:top|bottom)-(?:left|right)-radius$/.test(k)) {
        const r = radio(v, donde);
        if (typeof r === 'string') out.push([k, r]);
        else if (r) out.push([k, `${r.topLeft} ${r.topRight} ${r.bottomRight} ${r.bottomLeft}`]);
      } else if (k === 'box-shadow') {
        const sh = sombra(v, donde);
        if (sh) out.push([k, `var(--wp--preset--shadow--${sh.split('|').pop()})`]);
      } else {
        perder(donde, k, v, 'propiedad sin referencia en el set');
      }
    }
    return out;
  }

  /**
   * Los ESTILOS DE BLOQUE del tema (variaciones de `core/image`, `core/columns`…): la forma de un bloque que ningún atributo expresa
   * (el contorno separado de una foto, el desenfoque del fondo, el ícono de un pliegue). Cada uno es un archivo
   * `styles/blocks/<nombre>.json` del tema —un estilo de bloque REGISTRADO de WordPress— y el contenido sólo lo nombra
   * (`className: "is-style-<nombre>"`).
   *
   * No admiten un valor libre: cada declaración se arma con ayudantes que sólo producen referencias al sistema
   * (`var(--wp--preset--color--x)`, `var(--wp--custom--border--thick)`, `var(--wp--preset--spacing--10)`…) o un archivo de Medios
   * (`url()`), y las palabras de estructura (`solid`, `none`, `no-repeat`). Una prueba (`scripts/probar-estilos-de-bloque.php`) pasa
   * cada archivo por la compuerta del diseño.
   */
  const estilos = new Map();
  const ref = {
    color: (slug) => `var(--wp--preset--color--${slug})`,
    borde: (slug) => `var(--wp--custom--border--${slug})`,
    espacio: (slug) => `var(--wp--preset--spacing--${slug})`,
    desenfoque: (slug) => `var(--wp--custom--blur--${slug})`,
    medio: (ruta) => `url(${ruta})`,
  };
  function estilo(bloque, nombre, titulo, reglas) {
    const clave = `${bloque}|${nombre}`;
    if (!estilos.has(clave)) estilos.set(clave, { bloque, nombre, titulo, reglas });
    return `is-style-${nombre}`;
  }
  /**
   * Lo que un estilo de bloque cambia en un PUNTO DE QUIEBRE (una proporción de imagen distinta en tablet o celular). WordPress no admite
   * @media dentro de la variación de un bloque, así que va en el CSS del tema, entre marcas, y sólo con la clase del estilo registrado
   * y las propiedades de proporción (la prueba lo exige). `punto`: 'tablet' | 'movil'.
   */
  const responsivos = new Map();
  function estiloEnQuiebre(clase, punto, selector, decls) {
    responsivos.set(`${clase}|${punto}|${selector}`, { clase, punto, selector, decls });
  }
  /** El paso de espaciado más cercano a una medida en px, como slug. */
  function pasoEspacio(valor, donde, prop) {
    const r = esp(valor, donde, prop);
    const m = /^var:preset\|spacing\|(.+)$/.exec(r ?? '');
    return m ? m[1] : (r === '0' ? '0' : undefined);
  }
  /** El paso de la escala de bordes (hairline/thick) más cercano a un grosor en px. */
  function pasoBorde_(valor) {
    const n = aNumero(valor);
    return n === null ? undefined : (n >= 2 ? 'thick' : 'hairline');
  }

  return { esp, slugTamano, lh, fw, radio, slugColor, sombra, desenfoque, slugFamilia, perder, perdidas, avisos, medios, iconos, escalas, vecino, espaciado, pasoBorde, estilos, estilo, estiloEnQuiebre, responsivos, cssDeParte, ref, pasoEspacio, pasoBorde_, iconosUsados: new Set() };
}

/** Los roles del set (`var(--cod-color-*)`) y los presets de la paleta (`var(--wp--preset--color--x)`) → el slug de la paleta del tema. */
export function slugDeColorBase(v) {
  const roles = { 'var(--cod-color-surface)': 'fondo-pagina', 'var(--cod-color-accent)': 'accent', 'var(--cod-color-ink)': 'texto-cuerpo', 'var(--cod-color-primary)': 'gris', 'var(--cod-color-bg)': 'fondo-pagina', 'var(--cod-color-text)': 'texto-cuerpo' };
  const t = String(v ?? '').trim();
  if (roles[t]) return roles[t];
  const m = /^var\(--wp--preset--color--([a-z0-9-]+)\)$/.exec(t);
  return m ? m[1] : undefined;
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
  // Los espaciados (relleno, margen, separación) que el nodo redefine en tablet y celular, con el nombre físico del lado.
  if (bp === 'all' && estado === 'default') {
    const fisica = (k) => k.replace('block-start', 'top').replace('block-end', 'bottom').replace('inline-start', 'left').replace('inline-end', 'right');
    const RE_ESPACIO = /^(?:padding|margin)-(?:top|right|bottom|left|block-start|block-end|inline-start|inline-end)$|^(?:row-|column-)?gap$/;
    const por = { tablet: {}, mobile: {} };
    for (const id of ids || []) {
      const r = reglas.get(id);
      const punto = r?.scope?.breakpoint;
      if (!r || !por[punto] || (r.scope?.state || 'default') !== 'default') continue;
      if (r.kind === 'layout' && r.value?.gap) por[punto].gap = r.value.gap; // la separación de una pila
      if (r.kind !== 'properties') continue;
      for (const [k, v] of Object.entries(r.value?.declarations || {})) if (RE_ESPACIO.test(k)) por[punto][fisica(k)] = v;
    }
    P.__bp = { tablet: por.tablet, mobile: por.mobile, fisica };
  }
  // Los tamaños que el texto redefine en tablet y celular (los usa la escala de tamaños, que es «escritorio / tablet / celular»).
  if (bp === 'all' && estado === 'default') {
    for (const [punto, clave] of [['tablet', '__tamano-tablet'], ['mobile', '__tamano-movil']]) {
      for (const id of ids || []) {
        const r = reglas.get(id);
        if (!r || (r.scope?.breakpoint || 'all') !== punto || (r.scope?.state || 'default') !== 'default') continue;
        const t = r.kind === 'typography' ? r.value?.fontSize : r.kind === 'properties' ? r.value?.declarations?.['font-size'] : undefined;
        if (t) P[clave] = t;
      }
    }
  }
  return { P, X };
}

const lado = (P, ...nombres) => { for (const n of nombres) if (P[n] !== undefined) return P[n]; return undefined; };
const espBp = (T, [v, t, m], donde, prop) => T.esp(v, donde, prop, t, m);
/** El espaciado de un lado con lo que el original declara para ese mismo lado en tablet y celular: [valor, tablet, celular]. */
const ladoBp = (P, ...nombres) => {
  for (const n of nombres) {
    if (P[n] === undefined) continue;
    const fis = P.__bp?.fisica ? P.__bp.fisica(n) : n;
    return [P[n], P.__bp?.tablet?.[fis], P.__bp?.mobile?.[fis]];
  }
  return [undefined, undefined, undefined];
};

/** Atributos comunes de un bloque (color, tipografía, espaciado, borde) a partir de las propiedades. */
export function atributosComunes(T, P, X, donde, { margen = true, relleno = true, tipografia = true } = {}) {
  const a = {};
  const style = {};
  const c = T.slugColor(P.color, donde, 'color');
  if (c) a.textColor = c;
  const fondo = T.slugColor(P['background-color'], donde, 'background-color');
  if (fondo) a.backgroundColor = fondo;
  if (tipografia) {
    if (P['font-size']) { const s = T.slugTamano(P['font-size'], donde, P['__tamano-tablet'], P['__tamano-movil']); if (s) a.fontSize = s; }
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
    const top = espBp(T, ladoBp(P, 'padding-top', 'padding-block-start'), donde, 'padding-top');
    const right = espBp(T, ladoBp(P, 'padding-right', 'padding-inline-end'), donde, 'padding-right');
    const bottom = espBp(T, ladoBp(P, 'padding-bottom', 'padding-block-end'), donde, 'padding-bottom');
    const left = espBp(T, ladoBp(P, 'padding-left', 'padding-inline-start'), donde, 'padding-left');
    if (top !== undefined) pad.top = top;
    if (right !== undefined) pad.right = right;
    if (bottom !== undefined) pad.bottom = bottom;
    if (left !== undefined) pad.left = left;
    if (Object.keys(pad).length) sp.padding = pad;
  }
  if (margen) {
    const mar = {};
    const top = espBp(T, ladoBp(P, 'margin-top', 'margin-block-start'), donde, 'margin-top');
    const bottom = espBp(T, ladoBp(P, 'margin-bottom', 'margin-block-end'), donde, 'margin-bottom');
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
  // La sombra es un paso de la escala de sombras (settings.shadow.presets): style.shadow = var:preset|shadow|paso.
  if (P['box-shadow']) { const sh = T.sombra(P['box-shadow'], donde); if (sh) style.shadow = sh; }
  if (Object.keys(style).length) a.style = style;
  return a;
}

const IGNORADAS = new Set([
  'display', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'overflow', 'overflow-x', 'overflow-y', 'flex-shrink', 'flex-grow', 'flex-basis', 'flex-direction', 'flex-wrap',
  'align-items', 'align-self', 'justify-content', 'gap', 'row-gap', 'column-gap', 'grid-template-columns', 'object-fit', 'cursor', 'position', 'inset-block-start', 'inset-inline-start', 'top', 'right', 'z-index',
  'pointer-events', 'isolation', 'margin-inline-start', 'margin-inline-end', 'margin-top', 'margin-bottom', 'margin-block-start', 'margin-block-end', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'color', 'background-color', 'border-radius',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-color', 'box-shadow', '__tamano-tablet', '__tamano-movil', '__bp', 'list-style-position', 'list-style-type', 'text-decoration-line', 'height', 'bottom', 'left', 'transform',
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
