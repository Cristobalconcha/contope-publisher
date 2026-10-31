/**
 * La barra lateral del tema de Divi en una página que no usa el constructor: el buscador, las entradas recientes y los
 * comentarios recientes. En el original son bloques NATIVOS de WordPress (`core/search`, `core/latest-posts`,
 * `core/latest-comments`) dentro de un widget de la barra lateral.
 *
 * Regla de arquitectura (CLAUDE.md, regla 11): ContOpe no duplica las familias de Gutenberg, se CORRESPONDE con ellas. Por eso
 * esto NO imita las entradas con texto fijo: cada widget es un nodo `block` (ver COD_Canvas_Bloque_Renderer) que dibuja
 * WordPress con los datos del momento, y la composición sólo pone su FORMA: las reglas del nodo y de sus partes, medidas del
 * original (descarga/medir-barra-lateral.mjs guarda la medición en `contenidoPlano.lateral` de cada ancho).
 *
 * Lo que se mide es el estilo computado y la caja; nada se lee del CSS de Divi.
 */
import { colorRegla } from './util.mjs';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const pxs = (n) => `${r2(n)}px`;
/** Porcentaje de `n` sobre `total`, con tres decimales (así lo escribe Divi: 79.125%, 5.5%). */
const pct = (n, total) => `${Math.round((n / total) * 100000) / 1000}%`;
const familia = (ff) => { const n = String(ff || '').split(',')[0].replace(/["']/g, '').trim(); return n ? `'${n}', sans-serif` : undefined; };
const lh = (o) => { const f = num(o['font-size']); const l = parseFloat(o['line-height']); return f && Number.isFinite(l) ? String(Math.round((l / f) * 1000) / 1000) : undefined; };

/** Tipografía y color de un elemento medido, como declaraciones. */
const texto = (o) => ({
  'font-family': familia(o['font-family']), 'font-size': o['font-size'], 'font-weight': o['font-weight'], 'line-height': o['line-height'] === 'normal' ? 'normal' : lh(o),
  color: colorRegla(o.color),
});
const lados = (o, prop) => Object.fromEntries(['top', 'right', 'bottom', 'left'].map((l) => [`${prop}-${l}`, pxs(num(o[`${prop}-${l}`]))]));
const borde = (o) => {
  const d = {};
  for (const l of ['top', 'right', 'bottom', 'left']) {
    const w = num(o[`border-${l}-width`]);
    if (w > 0) Object.assign(d, { [`border-${l}-width`]: pxs(w), [`border-${l}-style`]: 'solid', [`border-${l}-color`]: colorRegla(o[`border-${l}-color`]) });
  }
  return d;
};
const radios = (o) => Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((k) => [`border-${k}-radius`, o[`border-${k}-radius`]]));
const sinVacios = (d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== ''));

/**
 * @returns {{ izquierda: object, lateral: object, filaExtra: object, titulo: object, nodos: (ctx) => any[] } | null}
 *   declaraciones por ancho y el árbol de la barra lateral
 */
export function barraLateral(ctx, medD, medM) {
  const D = medD.contenidoPlano?.lateral;
  if (!D) return null;
  const M = medM?.contenidoPlano?.lateral || null;
  const reg = ctx.reg;
  const P = (declD, declM, prefijo) => reg.propiedades(sinVacios(declD), declM ? { mobile: sinVacios(declM) } : {}, { prefijo });

  const contW = D.contenedor.caja.w;
  const hayLinea = D.contenedorAntes.display !== 'none' && num(D.contenedorAntes.width) > 0;
  const lineaD = hayLinea ? { 'border-right-width': pxs(num(D.contenedorAntes.width)), 'border-right-style': 'solid', 'border-right-color': colorRegla(D.contenedorAntes['background-color']) } : {};
  const padSup = num(D.contenedor['padding-top']);

  // Dos columnas en escritorio (flotadas en Divi); apiladas, a todo el ancho, en tablet y celular.
  const apilado = (o) => o && o.caja.w >= (M ? M.contenedor.caja.w : contW) - 1;
  const izqM = M && apilado(M.izquierda) ? { width: '100%', 'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': pxs(num(M.izquierda['padding-bottom'])), 'padding-left': '0px', 'margin-top': '0px', 'border-right-width': '0px' } : null;
  const latM = M && apilado(M.lateral) ? { width: '100%', 'padding-top': pxs(num(M.lateral['padding-top'])), 'padding-right': '0px', 'padding-bottom': pxs(num(M.lateral['padding-bottom'])), 'padding-left': pxs(num(M.lateral['padding-left'])) } : null;

  // Un grupo de ContOpe es una grilla con separación de 16 px: las columnas y los widgets de Divi no la tienen (flotan, con sus márgenes).
  const filaD = { display: 'flex', 'flex-direction': 'row', 'align-items': 'stretch', gap: '0px' };
  const filaM = M && apilado(M.izquierda) ? { 'flex-direction': 'column' } : null;
  const izqD = {
    display: 'block', width: pct(D.izquierda.caja.w, contW), 'padding-right': pct(num(D.izquierda['padding-right']), contW), 'padding-bottom': pxs(num(D.izquierda['padding-bottom'])),
    ...lineaD,
    // La línea de Divi nace en el borde de arriba del contenedor (su relleno de 58 px incluido): la columna sube ese relleno y lo devuelve por dentro.
    ...(hayLinea ? { 'margin-top': pxs(-padSup), 'padding-top': pxs(padSup) } : {}),
    'flex-shrink': '0',
  };
  const latD = { display: 'block', width: pct(D.lateral.caja.w, contW), ...lados(D.lateral, 'padding'), 'flex-shrink': '0', 'min-width': '0px' };
  const base = { ...texto(D.lateral) };

  const nodos = [];
  const widgets = [];
  const nodoBloque = (nombre, attrs, declNodo, declNodoM, partes) => {
    const nodo = ctx.nodo('block', P(declNodo, declNodoM, 'bloque'), { name: nombre, attrs });
    if (partes && Object.keys(partes).length) nodo.partes = partes;
    return nodo;
  };
  const mgW = (w) => ({ 'margin-block-end': pxs(num(w['margin-bottom'])) });

  // --- widget 1: el buscador (core/search)
  const wBuscar = D.widgets.find((w) => /widget_search/.test(w.clase));
  if (wBuscar) {
    const wM = M?.widgets.find((w) => /widget_search/.test(w.clase));
    const e = D.entrada; const b = D.boton;
    const partes = {
      etiqueta: P({ display: D.etiqueta.display === 'none' ? 'none' : undefined }),
      envoltura: P({ display: D.envoltura.display, width: '100%' }),
      entrada: P(sinVacios({
        ...texto(e), width: '100%', ...lados(e, 'padding'), ...borde(e), ...radios(e), 'background-color': colorRegla(e['background-color']),
      }), null, 'busq-e'),
      boton: P(sinVacios({
        ...texto(b), position: b.position === 'absolute' ? 'absolute' : undefined, top: b.position === 'absolute' ? '0px' : undefined, right: b.position === 'absolute' ? '0px' : undefined,
        ...lados(b, 'padding'), ...borde(b), ...radios(b), 'background-color': colorRegla(b['background-color']),
      }), null, 'busq-b'),
    };
    nodos.push(nodoBloque('core/search', { label: 'Buscar', buttonText: 'Buscar' }, { position: 'relative', ...mgW(wBuscar) }, wM ? mgW(wM) : null, partes));
  }

  // --- widgets con título: un grupo de WordPress (core/group) con su título y su bloque
  const grupoConTitulo = (indiceTitulo, nombre, attrs, partes) => {
    const t = D.titulos[indiceTitulo]; if (!t) return null;
    const tM = M?.titulos[indiceTitulo];
    const wid = D.widgets.filter((x) => !/widget_search/.test(x.clase))[indiceTitulo];
    const decT = { ...texto(t), 'padding-block-end': pxs(num(t['padding-bottom'])), 'margin-block-start': '0px', 'margin-block-end': pxs(num(t['margin-bottom'])) };
    const decTM = tM ? { ...texto(tM), 'padding-block-end': pxs(num(tM['padding-bottom'])), 'margin-block-end': pxs(num(tM['margin-bottom'])) } : null;
    const titulo = ctx.nodo('heading', P(decT, decTM, 'lat-t'), { text: t.texto, level: 2 });
    const bloque = nodoBloque(nombre, attrs, {}, null, partes);
    return ctx.nodo('group', P({ display: 'block', ...(wid ? mgW(wid) : {}) }, null, 'lat-w'), undefined, [titulo, bloque]);
  };

  const sinListar = { 'list-style-type': 'none', 'padding-left': '0px', 'margin-block-start': '0px', 'margin-block-end': '0px' };
  const wEntradas = grupoConTitulo(0, 'core/latest-posts', {}, {
    lista: P({ ...sinListar, ...texto(D.lista) }, null, 'lat-l'),
    item: P({ ...texto(D.item), 'margin-block-end': pxs(num(D.item['margin-bottom'])) }, null, 'lat-i'),
    enlace: P({ ...texto(D.enlace), 'text-decoration-line': D.enlace['text-decoration-line'] === 'none' ? 'none' : undefined }, null, 'lat-a'),
  });
  if (wEntradas) nodos.push(wEntradas);
  const wComentarios = grupoConTitulo(1, 'core/latest-comments', {}, {
    vacio: P({ ...texto(D.comentarios) }, null, 'lat-v'),
  });
  if (wComentarios) nodos.push(wComentarios);

  const izquierdaIds = P(izqD, izqM, 'lat-izq');
  const lateralIds = P({ ...latD, ...base }, latM, 'lat');
  return {
    filaIds: P(filaD, filaM, 'lat-fila'),
    izquierdaIds,
    lateral: ctx.nodo('group', lateralIds, undefined, nodos),
    // La caja de abajo de la sección: el contenedor de Divi no tiene relleno inferior (lo pone la columna lateral).
    seccionAbajo: { 'padding-bottom': '0px' },
    titulo: {
      'margin-block-start': '0px', 'margin-block-end': pxs(num(D.titulo['margin-bottom'])), 'padding-block-end': pxs(num(D.titulo['padding-bottom'])),
    },
  };
}
