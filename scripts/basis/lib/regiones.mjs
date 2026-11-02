/**
 * El encabezado y el pie de Basis son REGIONES del lienzo (no bloques): sus reglas de diseño salen del transcriptor con los
 * valores medidos (`36px`, `59.39px`, `12px`, `500`…). La compuerta del diseño (modo `enforce`) no deja entrar ningún valor
 * literal de espaciado, tamaño, peso, interlineado, radio ni ancho de caja: tienen que ser REFERENCIAS al sistema.
 *
 * Este módulo hace esa traducción, con las mismas escalas y el mismo traductor (`crearTraductor`) que usan las páginas en
 * bloques: cada valor pasa a `var(--wp--preset--spacing--N)`, `var(--wp--preset--font-size--N)`, `var(--wp--custom--…)` o
 * `var(--wp--style--global--content-size)`. Lo que no es de diseño (display, grid-template-columns, width en %, flex…) pasa
 * tal cual. El archivo de `salida/` queda con los valores medidos (de ahí salen las escalas); lo que se aplica es la copia
 * traducida. Un valor que el sistema no expresa se anota en `perdidas`; no se rodea.
 */

const aNumero = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v).trim()); return m ? Number(m[1]) : null; };
const RE_ESPACIO = /^(?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?$|^(?:row-|column-)?gap$/;
const RE_RADIO = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/;
const RE_BORDE = /^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline)-width$/;

/** `var:preset|spacing|60` (forma de atributo de bloque) → la variable CSS que lee una regla del lienzo. */
const aVariable = (v) => { const m = /^var:preset\|spacing\|(.+)$/.exec(v ?? ''); return m ? `var(--wp--preset--spacing--${m[1]})` : v; };

/** Una declaración CSS medida → su referencia al sistema (o la misma si no es de diseño). `undefined` = no entra. */
export function escalarDeclaracion(T, prop, valor, donde) {
  const v = String(valor).trim();
  if (v.startsWith('var(') || v.startsWith('calc(-1 * var(')) return v;
  if (RE_ESPACIO.test(prop)) {
    if (v === 'auto') return v;
    const e = T.esp(v, donde, prop);
    return e === undefined ? undefined : aVariable(e);
  }
  if (prop === 'max-width') {
    if (/^\d+(?:\.\d+)?px$/.test(v)) {
      const n = aNumero(v);
      if (n === 1080) return 'var(--wp--style--global--content-size)';
      const medida = [['s', 700], ['m', 760]].find(([, px]) => px === n);
      if (medida) return `var(--wp--custom--layout--measure--${medida[0]})`;
      T.perder(donde, prop, v, 'un ancho máximo en px que el sistema no tiene (ni el ancho de contenido ni una medida de texto)');
      return undefined;
    }
    return v;
  }
  if (prop === 'font-size') { const s = T.slugTamano(v, donde); return s ? `var(--wp--preset--font-size--${s})` : undefined; }
  if (prop === 'font-weight') { const w = T.fw(v); if (!w) T.perder(donde, prop, v, 'peso fuera de la escala'); return w; }
  if (prop === 'line-height') {
    if (v === 'normal') return v;
    if (/^\d+(?:\.\d+)?$/.test(v)) return T.lh(v);
    T.perder(donde, prop, v, 'interlineado en px: sin escala');
    return undefined;
  }
  if (RE_RADIO.test(prop)) { const r = T.radio(v, donde); return typeof r === 'string' ? r : undefined; }
  if (RE_BORDE.test(prop)) { const n = aNumero(v); return n === 0 || v === '0' ? '0' : n === null ? v : `var(--wp--custom--border--${n >= 2 ? 'thick' : 'hairline'})`; }
  return v;
}

/**
 * Traduce las reglas de un diseño (`{ rules: [...] }`) a referencias del sistema. Devuelve una copia; no toca la entrada.
 * @param {ReturnType<import('./bloques.mjs').crearTraductor>} T
 */
export function escalarDiseno(design, T, region) {
  const copia = structuredClone(design);
  for (const r of copia.rules || []) {
    const donde = `${region}/${r.id}`;
    const v = r.value || {};
    if (r.kind === 'properties' && v.declarations) {
      const nuevas = {};
      for (const [k, x] of Object.entries(v.declarations)) {
        if (k === 'gap') {
          // `gap` es una abreviada y con var() GrapesJS la descarta entera al guardar: se escribe en sus dos partes.
          const [fila, columna = fila] = String(x).trim().split(/s+/);
          const f = escalarDeclaracion(T, 'row-gap', fila, donde);
          const c = escalarDeclaracion(T, 'column-gap', columna, donde);
          if (f !== undefined) nuevas['row-gap'] = f;
          if (c !== undefined) nuevas['column-gap'] = c;
          continue;
        }
        if (k === 'border-radius') {
          // Igual que `gap`: abreviada con var() no sobrevive al guardado; van las cuatro esquinas.
          const r = T.radio(String(x), donde);
          const esq = typeof r === 'string' ? { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r } : r;
          if (esq) {
            nuevas['border-top-left-radius'] = esq.topLeft; nuevas['border-top-right-radius'] = esq.topRight;
            nuevas['border-bottom-right-radius'] = esq.bottomRight; nuevas['border-bottom-left-radius'] = esq.bottomLeft;
          }
          continue;
        }
        const y = escalarDeclaracion(T, k, x, donde);
        if (y !== undefined) nuevas[k] = y;
      }
      v.declarations = nuevas;
    } else if (r.kind === 'typography') {
      if (v.fontSize !== undefined) { const y = escalarDeclaracion(T, 'font-size', v.fontSize, donde); if (y !== undefined) v.fontSize = y; else delete v.fontSize; }
      if (v.fontWeight !== undefined) { const y = escalarDeclaracion(T, 'font-weight', v.fontWeight, donde); if (y !== undefined) v.fontWeight = y; else delete v.fontWeight; }
      if (v.lineHeight !== undefined) { const y = escalarDeclaracion(T, 'line-height', v.lineHeight, donde); if (y !== undefined) v.lineHeight = y; else delete v.lineHeight; }
    } else if (r.kind === 'layout') {
      if (typeof v.gap === 'string') { const y = escalarDeclaracion(T, 'gap', v.gap, donde); if (y !== undefined) v.gap = y; else delete v.gap; }
    }
  }
  return copia;
}
