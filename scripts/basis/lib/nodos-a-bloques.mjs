/**
 * Recorre los nodos de una composición de Basis y arma el árbol de bloques de WordPress.
 * Los valores de diseño se resuelven en `lib/bloques.mjs` (escalas y registro); acá está la ESTRUCTURA: qué nodo es qué bloque.
 *
 * Un bloque del árbol es `{ name, attrs, inner: [...] }`. El texto va en `attrs.content` (HTML ya escapado).
 */
import { atributosComunes, propiedadesDe, anotarSobrantes, textoAHtml } from './bloques.mjs';

const aNumero = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) : null; };
const bloque = (name, attrs = {}, inner = []) => ({ name, attrs, inner });
const vacio = (o) => !o || Object.keys(o).length === 0;

export function convertirPagina({ nodos, reglas }, T, opciones = {}) {
  const R = new Map(reglas.map((r) => [r.id, r]));
  const gradientes = opciones.gradientes ?? new Map();
  const anchoPorUrl = opciones.anchoPorUrl ?? new Map();
  const datos = (n) => propiedadesDe(n.ruleIds, R);
  const hijos = (n) => (n.children || []).flatMap((c) => nodo(c));

  /** Un contenedor «transparente» no aporta nada visible: sus hijos suben un nivel. */
  function esTransparente(P, X, n) {
    const claves = Object.keys(P).filter((k) => {
      if (['min-width', 'width', 'height', 'flex-shrink', 'flex-grow', 'flex-basis', 'display', 'align-items', 'justify-content', 'gap'].includes(k)) return false;
      const v = P[k];
      if (/^(padding|margin)/.test(k)) return !(v === '0px' || v === '0' || v === 'auto');
      return true;
    });
    if (P['flex-grow'] !== undefined && P['flex-grow'] !== '0') return false;
    return claves.length === 0 && !X.surface && !n.marker && !(P.display === 'flex' || P.display === 'grid');
  }

  function margenesDeFila(P) {
    // «80 % con tope de 1080 y centrada» es el margen de una fila: un paso del espaciado (gutter) a cada lado.
    if (/^80%$/.test(P.width || '') && /^1080px$/.test(P['max-width'] || '') && P['margin-inline-start'] === 'auto') return true;
    return false;
  }

  function estiloContenedor(n, P, X, donde, extra = {}) {
    const a = atributosComunes(T, P, X, donde, { tipografia: false });
    a.style = a.style || {};
    a.style.spacing = a.style.spacing || {};
    if (margenesDeFila(P)) {
      a.style.spacing.margin = { ...(a.style.spacing.margin || {}), left: 'var:preset|spacing|gutter', right: 'var:preset|spacing|gutter' };
    }
    if (extra.blockGap !== undefined) a.style.spacing.blockGap = extra.blockGap;
    const minH = aNumero(P['min-height']);
    if (minH) a.style.dimensions = { minHeight: `${minH}px` };
    if (vacio(a.style.spacing)) delete a.style.spacing;
    if (vacio(a.style)) delete a.style;
    return a;
  }

  function anchoPct(v) { const m = /^(\d+(?:\.\d+)?)%$/.exec(String(v || '')); return m ? Number(m[1]) : null; }

  function nodo(n) {
    switch (n.kind) {
      case 'section': return seccion(n);
      case 'group': return grupo(n);
      case 'heading': return texto(n, 'core/heading');
      case 'paragraph': return texto(n, 'core/paragraph');
      case 'button': return boton(n);
      case 'image': return imagen(n, null);
      case 'link': return enlace(n);
      case 'video': return video(n);
      case 'list': return lista(n);
      case 'table': return tabla(n);
      case 'separator': return separador(n);
      case 'block': return bloqueNativo(n);
      case 'form': return formulario(n);
      default: T.avisos.push(`nodo sin traducir: ${n.kind} (${n.id})`); return [];
    }
  }

  // ------------------------------------------------------------------ secciones
  function seccion(n) {
    const { P, X } = datos(n);
    const S = X.surface || {};
    const donde = `${n.id} (sección)`;
    const gap = '0';
    const video_ = (n.children || []).find((c) => c.kind === 'video');
    const comunes = estiloContenedor(n, P, X, donde, { blockGap: gap });
    const resto = (n.children || []).filter((c) => c !== video_).flatMap((c) => nodo(c));
    const anchor = n.marker ? { anchor: n.marker } : {};
    const g = S.backgroundGradient ? gradientes.registrar(S.backgroundGradient, T) : undefined;
    if (S.backgroundAssetUrl && /^(cover)$/.test(S.backgroundSize || '') || video_) {
      const url = video_ ? video_.content.sourceUrl : S.backgroundAssetUrl;
      const m = T.medios.get(url);
      const a = { url, backgroundType: video_ ? 'video' : 'image', dimRatio: g ? 100 : 0, tagName: 'section', align: 'full', isDark: Boolean(g), contentPosition: 'center center', ...anchor, ...comunes };
      if (m?.id && !video_) a.id = m.id;
      if (g) a.gradient = g;
      else if (S.backgroundColor) { const c = T.slugColor(S.backgroundColor, donde, 'background-color'); if (c) a.overlayColor = c; }
      const minH = aNumero(P['min-height']);
      if (minH) { a.minHeight = minH; a.minHeightUnit = 'px'; if (a.style?.dimensions) { delete a.style.dimensions; if (vacio(a.style)) delete a.style; } }
      anotarSobrantes(T, P, donde);
      return [bloque('core/cover', a, resto)];
    }
    const a = { tagName: 'section', align: 'full', ...anchor, ...comunes };
    if (S.backgroundAssetUrl) {
      const bi = { url: S.backgroundAssetUrl, source: 'file' };
      const m = T.medios.get(S.backgroundAssetUrl);
      if (m?.id) bi.id = m.id;
      a.style = { ...(a.style || {}), background: { backgroundImage: bi, ...(S.backgroundSize ? { backgroundSize: S.backgroundSize } : {}), ...(S.backgroundPosition ? { backgroundPosition: S.backgroundPosition } : {}), ...(S.backgroundRepeat ? { backgroundRepeat: S.backgroundRepeat } : {}) } };
    }
    if (g && !S.backgroundAssetUrl) a.gradient = g;
    anotarSobrantes(T, P, donde);
    return [bloque('core/group', a, resto)];
  }

  // ------------------------------------------------------------------ grupos
  function grupo(n) {
    const { P, X } = datos(n);
    const donde = `${n.id} (grupo)`;
    const inter = X.interaction;
    if (inter?.behavior === 'acordeon') return acordeon(n, P, X, inter);
    if (n.content?.lat !== undefined) return mapa(n, P);
    const esGrid = P.display === 'grid' && P['grid-template-columns'];
    const esFilaFlex = P.display === 'flex' && /row/.test(P['flex-direction'] || 'row') && (n.children || []).length > 1 && (n.children || []).every((c) => c.kind === 'group' && anchoPct(propiedadesDe(c.ruleIds, R).P.width) !== null);
    if (esGrid || esFilaFlex) return columnas(n, P, X, donde, esGrid);

    const enFlex = P.display === 'flex';
    const hijosB = (n.children || []).flatMap((c) => {
      const bs = nodo(c);
      if (enFlex && bs[0] && (propiedadesDe(c.ruleIds, R).P['flex-grow'] ?? '0') !== '0') bs[0].attrs.style = { ...(bs[0].attrs.style || {}), layout: { selfStretch: 'fill' } };
      return bs;
    });
    if (esTransparente(P, X, n) && !margenesDeFila(P)) return hijosB;
    const flex = P.display === 'flex';
    const extra = { blockGap: flex ? (T.esp(P.gap, donde, 'gap') ?? '0') : '0' };
    const a = estiloContenedor(n, P, X, donde, extra);
    if (flex) {
      a.layout = { type: 'flex', flexWrap: 'nowrap', ...(P['flex-direction'] === 'column' ? { orientation: 'vertical' } : {}), ...({ center: { verticalAlignment: 'center' }, 'flex-start': { verticalAlignment: 'top' }, start: { verticalAlignment: 'top' }, 'flex-end': { verticalAlignment: 'bottom' } }[P['align-items']] || {}) };
    }
    // Un ancho máximo de texto (700 / 760 px) es una medida del set: el contenido queda a la izquierda, con ese tope.
    const medida = !flex && T.escalas.escalas.measure.pasos.find((p) => p.valor === P['max-width']);
    if (medida) a.layout = { type: 'constrained', contentSize: `var(--wp--custom--layout--measure--${medida.slug})`, justifyContent: 'left' };
    anotarSobrantes(T, P, donde);
    return [bloque('core/group', a, hijosB)];
  }

  function columnas(n, P, X, donde, esGrid) {
    const hijosN = n.children || [];
    let anchos;
    if (esGrid) {
      const fr = [...P['grid-template-columns'].matchAll(/minmax\(0,\s*([\d.]+)fr\)/g)].map((m) => Number(m[1]));
      const suma = fr.reduce((a, b) => a + b, 0);
      const iguales = fr.every((v) => Math.abs(v - fr[0]) < 0.5);
      anchos = fr.length === hijosN.length ? fr.map((v) => (iguales ? null : Math.round((v / suma) * 10000) / 100)) : hijosN.map(() => null);
      if (fr.length === 1) {
        // una sola columna: la fila es un contenedor corriente
        const a1 = estiloContenedor(n, P, X, donde, { blockGap: '0' });
        anotarSobrantes(T, P, donde);
        const inner = hijosN.flatMap((c) => (c.kind === 'group' && esTransparente(propiedadesDe(c.ruleIds, R).P, propiedadesDe(c.ruleIds, R).X, c) ? hijos(c) : nodo(c)));
        return [bloque('core/group', a1, inner)];
      }
    } else {
      anchos = hijosN.map((c) => anchoPct(propiedadesDe(c.ruleIds, R).P.width));
    }
    const gapX = T.esp(P['column-gap'] ?? P.gap, donde, 'column-gap');
    // En columnas el espacio vertical sólo aparece al apilarse (celular y tablet): vale el de ESE punto de quiebre.
    const pm = propiedadesDe(n.ruleIds, R, { bp: 'mobile' }).P;
    const gapY = T.esp(pm['row-gap'] ?? P['row-gap'] ?? P.gap, donde, 'row-gap');
    const a = estiloContenedor(n, P, X, donde, {});
    a.style = a.style || {};
    a.style.spacing = { ...(a.style.spacing || {}), blockGap: { top: gapY ?? '0', left: gapX ?? '0' } };
    const va = { 'flex-start': 'top', start: 'top', center: 'center', stretch: undefined, 'flex-end': 'bottom' }[P['align-items']];
    if (va) a.verticalAlignment = va;
    anotarSobrantes(T, P, donde);
    const cols = hijosN.map((c, i) => {
      const cp = propiedadesDe(c.ruleIds, R);
      const ca = atributosComunes(T, cp.P, cp.X, `${c.id} (columna)`, { tipografia: false });
      ca.style = ca.style || {};
      ca.style.spacing = { ...(ca.style.spacing || {}), blockGap: '0' };
      if (anchos[i]) ca.width = `${anchos[i]}%`;
      if (cp.P.padding_unused) delete ca.padding_unused;
      anotarSobrantes(T, cp.P, `${c.id} (columna)`);
      return bloque('core/column', ca, hijos(c));
    });
    return [bloque('core/columns', a, cols)];
  }

  function mapa(n, P) {
    const c = n.content;
    const alto = aNumero(P['min-height']) || 400;
    const a = { lat: c.lat, lng: c.lng, zoom: c.zoom, alto, fijo: c.fijo !== false };
    if (c.mini) a.mini = c.mini;
    if (c.globo) a.globo = c.globo;
    if (c.etiqueta) a.etiqueta = c.etiqueta;
    return [bloque('contope/mapa', a)];
  }

  function formulario(n) {
    const { P } = datos(n);
    const mar = {};
    const top = T.esp(P['margin-block-start'], n.id, 'margin-top');
    const bottom = T.esp(P['margin-block-end'], n.id, 'margin-bottom');
    if (top !== undefined) mar.top = top;
    if (bottom !== undefined) mar.bottom = bottom;
    return [bloque('contope/formulario', { formSlug: n.content.formSlug, ...(vacio(mar) ? {} : { style: { spacing: { margin: mar } } }) })];
  }

  // ------------------------------------------------------------------ acordeón
  function acordeon(n, P, X, inter) {
    const donde = `${n.id} (acordeón)`;
    const partes = n.partes || {};
    const deParte = (clave, estado = 'default') => propiedadesDe(partes[clave] || [], R, { estado });
    const item = deParte('item');
    const resumen = deParte('resumen');
    const panel = deParte('panel');
    const gap = X.layout?.gap ?? P.gap;
    const hijosN = n.children || [];
    const items = hijosN.map((g) => {
      const [titulo, ...cuerpo] = g.children || [];
      const abierto = inter.openNodeId === g.id;
      const tAttrs = atributosComunes(T, resumen.P, resumen.X, `${g.id} (resumen)`, { margen: false, relleno: false });
      const panelA = atributosComunes(T, panel.P, panel.X, `${g.id} (panel)`, { tipografia: false });
      panelA.style = panelA.style || {};
      panelA.style.spacing = { ...(panelA.style.spacing || {}), blockGap: '0' };
      const itemA = atributosComunes(T, item.P, item.X, `${g.id} (pliegue)`, { tipografia: false, margen: false });
      return bloque('core/accordion-item', { ...(abierto ? { openByDefault: true } : {}), ...itemA }, [
        bloque('core/accordion-heading', { title: textoAHtml(titulo.content.text), level: 3, ...tAttrs }),
        bloque('core/accordion-panel', panelA, cuerpo.flatMap((c) => nodo(c))),
      ]);
    });
    anotarSobrantes(T, P, donde);
    for (const [k, v] of Object.entries(item.P)) if (!['background-color', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'].includes(k)) T.perder(donde, k, v, 'parte «item» del acordeón');
    T.perder(donde, 'icono del pliegue', inter.iconoCerrado || 'ETmodules e050', 'core/accordion trae su propio ícono (chevron); el glifo «+» del original no es un bloque ni una definición del set');
    const a = {
      iconPosition: inter.iconPosition || 'right',
      showIcon: inter.showIcon !== false,
      autoclose: inter.autoclose !== false,
      headingLevel: 3,
      style: { spacing: { blockGap: T.esp(gap, donde, 'gap') ?? '0', margin: { top: '0', bottom: '0' } } },
    };
    return [bloque('core/accordion', a, items)];
  }

  // ------------------------------------------------------------------ textos
  /**
   * El glifo del ícono es el SVG de uploads/iconos-divi (el mismo archivo que usaba el lienzo). Se pone como imagen: no hay bloque que
   * recolore un SVG por referencia a la paleta (core/html no sirve: guarda sólo código suelto), así que el dibujo conserva el color de
   * su archivo y la diferencia queda anotada.
   */
  function iconoSvg(forma, tamano, colorSlug, donde) {
    const px = Math.round(tamano || 40);
    if (colorSlug) T.perder(donde, 'color del ícono', colorSlug, 'un SVG puesto como imagen conserva el color de su archivo; ningún bloque lo recolorea con la paleta');
    return bloque('core/image', { url: forma, alt: '', width: px + 'px', height: px + 'px', sizeSlug: 'full', linkDestination: 'none', style: { spacing: { margin: { top: '0', bottom: '0' } } } });
  }

  function texto(n, tipo) {
    const { P, X } = datos(n);
    const donde = `${n.id} (${n.kind})`;
    if (X.icono && tipo === 'core/paragraph') {
      const col = T.slugColor(X.icono.color, donde, 'color');
      const ic = iconoSvg(X.icono.forma, aNumero(X.icono.tamano), col, donde);
      return ic ? [ic] : [];
    }
    const a = atributosComunes(T, P, X, donde);
    const t = n.content.text ?? '';
    a.content = textoAHtml(t);
    if (tipo === 'core/heading') a.level = n.content.level || 2;
    a.style = a.style || {};
    a.style.spacing = a.style.spacing || {};
    a.style.spacing.margin = { top: '0', bottom: '0', ...(a.style.spacing.margin || {}) };
    const pb = T.esp(P['padding-block-end'], donde, 'padding-bottom');
    if (pb !== undefined && pb !== '0') a.style.spacing.padding = { ...(a.style.spacing.padding || {}), bottom: pb };
    anotarSobrantes(T, P, donde);
    return [bloque(tipo, a)];
  }

  function boton(n) {
    const { P, X } = datos(n);
    const donde = `${n.id} (botón)`;
    const a = atributosComunes(T, P, X, donde, { margen: false });
    const c = n.content;
    a.text = textoAHtml(c.label);
    a.url = c.href;
    a.style = a.style || {};
    const alinear = P['margin-inline-start'] === 'auto' ? (P['margin-inline-end'] === 'auto' ? 'center' : 'right') : 'left';
    const margen = {};
    const top = T.esp(P['margin-block-start'], donde, 'margin-top');
    const bottom = T.esp(P['margin-block-end'], donde, 'margin-bottom');
    if (top !== undefined) margen.top = top;
    if (bottom !== undefined) margen.bottom = bottom;
    anotarSobrantes(T, P, donde);
    return [bloque('core/buttons', { layout: { type: 'flex', justifyContent: alinear }, ...(vacio(margen) ? {} : { style: { spacing: { margin: margen } } }) }, [bloque('core/button', a)])];
  }

  // ------------------------------------------------------------------ imágenes y video
  function imagen(n, enlaceA) {
    const { P, X } = datos(n);
    const donde = `${n.id} (imagen)`;
    const url = n.content.assetUrl;
    const m = T.medios.get(url);
    const a = { url, alt: n.content.alt ?? '', sizeSlug: 'full', linkDestination: 'none' };
    if (m?.id) a.id = m.id;
    if (X.media?.aspectRatio) { a.aspectRatio = X.media.aspectRatio; a.scale = X.media.fit || 'cover'; }
    const ancho = P.width;
    let nw = aNumero(ancho);
    // Un ancho medido en 0 es una imagen que estaba dentro de un pliegue cerrado: vale el de la misma imagen medida abierta.
    if (nw) anchoPorUrl.set(url, nw); else if (nw === 0 && anchoPorUrl.has(url)) nw = anchoPorUrl.get(url);
    if (nw) a.width = `${nw}px`;
    if (aNumero(P.height)) a.height = `${aNumero(P.height)}px`;
    const com = atributosComunes(T, P, X, donde, { tipografia: false, relleno: false });
    Object.assign(a, com);
    if (enlaceA) { a.href = enlaceA.href; a.linkDestination = 'media'; a.linkTarget = '_blank'; a.rel = 'noreferrer noopener'; }
    anotarSobrantes(T, P, donde);
    if (X.media && !X.media.aspectRatio) T.perder(donde, 'media', JSON.stringify(X.media), 'sin atributo de bloque');
    return [bloque('core/image', a)];
  }

  function enlace(n) {
    const img = (n.children || []).find((c) => c.kind === 'image');
    if (img) return imagen(img, { href: n.content.href });
    T.avisos.push(`enlace sin imagen: ${n.id}`);
    return [];
  }

  function video(n) {
    const { P } = datos(n);
    anotarSobrantes(T, P, `${n.id} (video)`);
    return [bloque('core/video', { src: n.content.sourceUrl, autoplay: true, muted: true, loop: true, playsInline: true, controls: false, preload: 'metadata' })];
  }

  // ------------------------------------------------------------------ listas, tablas, separador, bloques nativos
  function lista(n) {
    const { P, X } = datos(n);
    const donde = `${n.id} (lista)`;
    const a = atributosComunes(T, P, X, donde);
    a.ordered = Boolean(n.content.ordered);
    const sangria = T.esp(P['padding-inline-start'] ?? P['padding-left'], donde, 'padding-left');
    if (sangria && sangria !== '0') { a.style = a.style || {}; a.style.spacing = { ...(a.style.spacing || {}), padding: { ...(a.style.spacing?.padding || {}), left: sangria } }; }
    anotarSobrantes(T, P, donde);
    const items = (n.content.items || []).map((it) => (typeof it === 'string' ? bloque('core/list-item', { content: textoAHtml(it) }) : bloque('core/list-item', { content: textoAHtml(it.text ?? '') }, it.items?.length ? [bloque('core/list', { ordered: false }, it.items.map((s) => bloque('core/list-item', { content: textoAHtml(typeof s === 'string' ? s : s.text ?? '') })))] : [])));
    return [bloque('core/list', a, items)];
  }

  function tabla(n) {
    const { P, X } = datos(n);
    const donde = `${n.id} (tabla)`;
    const a = atributosComunes(T, P, X, donde);
    const celda = (t, th) => ({ content: textoAHtml(t), tag: th ? 'th' : 'td', ...(th ? { scope: 'col' } : {}) });
    a.head = [{ cells: n.content.headers.map((h) => celda(h, true)) }];
    a.body = n.content.rows.map((fila) => ({ cells: fila.map((c) => celda(c, false)) }));
    a.hasFixedLayout = false;
    anotarSobrantes(T, P, donde);
    return [bloque('core/table', a)];
  }

  function separador(n) {
    const { P, X } = datos(n);
    const a = atributosComunes(T, P, X, `${n.id} (separador)`, { tipografia: false, relleno: false });
    anotarSobrantes(T, P, `${n.id} (separador)`);
    return [bloque('core/separator', { ...a, opacity: 'css' })];
  }

  function bloqueNativo(n) {
    const { name, attrs } = n.content;
    const { P } = datos(n);
    const mar = {};
    const bottom = T.esp(P['margin-block-end'], n.id, 'margin-bottom');
    if (bottom !== undefined) mar.bottom = bottom;
    T.perder(`${n.id} (${name})`, 'partes', 'etiqueta, envoltura, entrada, botón…', 'los bloques de WordPress se dibujan con el estilo del tema; sus partes no tienen atributo de bloque');
    return [bloque(name, { ...attrs, ...(vacio(mar) ? {} : { style: { spacing: { margin: mar } } }) })];
  }

  return nodos.flatMap((n) => nodo(n));
}

/** Registra los degradados que el sitio usa (color→transparente, con ángulo) para que el tema los declare como presets. */
export function crearRegistroDeGradientes() {
  const usados = new Map();
  return {
    usados,
    registrar(g, T) {
      const stops = g.stops || [];
      const primero = stops[0]?.color;
      const ultimo = stops[stops.length - 1]?.color;
      const slugColor = T.slugColor(primero, 'degradado', 'color');
      if (!slugColor || ultimo !== 'transparent' || g.type !== 'linear') { T.perder('degradado', 'background-gradient', JSON.stringify(g), 'sólo se admite color→transparente lineal'); return undefined; }
      const ang = Number.parseInt(g.angle ?? '180', 10);
      const slug = `${slugColor}-a-transparente${ang === 180 ? '' : `-${ang}`}`;
      usados.set(slug, { slug, name: `${slugColor} a transparente${ang === 180 ? '' : ` (${ang}°)`}`, gradient: `linear-gradient(${ang}deg, var(--wp--preset--color--${slugColor}) 0%, transparent 100%)` });
      return slug;
    },
  };
}
