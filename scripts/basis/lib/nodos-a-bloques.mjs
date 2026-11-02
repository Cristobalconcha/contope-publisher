/**
 * Recorre los nodos de una composición de Basis y arma el árbol de bloques de WordPress.
 * Los valores de diseño se resuelven en `lib/bloques.mjs` (escalas y registro); acá está la ESTRUCTURA: qué nodo es qué bloque.
 *
 * Un bloque del árbol es `{ name, attrs, inner: [...] }`. El texto va en `attrs.content` (HTML ya escapado).
 */
import { createHash } from 'node:crypto';
import { atributosComunes, propiedadesDe, anotarSobrantes, textoAHtml } from './bloques.mjs';

const aNumero = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) : null; };
const bloque = (name, attrs = {}, inner = []) => ({ name, attrs, inner });
const vacio = (o) => !o || Object.keys(o).length === 0;

export function convertirPagina({ nodos, reglas }, T, opciones = {}) {
  const R = new Map(reglas.map((r) => [r.id, r]));
  const gradientes = opciones.gradientes ?? new Map();
  const anchoPorUrl = opciones.anchoPorUrl ?? new Map();
  const yaCentrados = new Set();
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
    // Un grupo con varios hijos y una separación (la declarada o los 16 px que el motor pone por omisión) no es transparente: la separación se perdería.
    if ((n.children || []).length > 1 && !['0px', '0'].includes(String(X.layout?.gap ?? P.gap ?? (P.display === 'block' ? '0px' : '16px')))) return false;
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
    // Un alto mínimo que el original cambia en tablet o celular: el bloque tiene UNO (dimensions.minHeight, que además se imprime en línea).
    // Pasa a un estilo de bloque registrado, con el de escritorio y, en el CSS del tema (entre marcas), los de los otros puntos de quiebre.
    const minT = aNumero(propiedadesDe(n.ruleIds, R, { bp: 'tablet' }).P['min-height']);
    const minM = aNumero(propiedadesDe(n.ruleIds, R, { bp: 'mobile' }).P['min-height']);
    if (minH && ((minT !== null && minT !== minH) || (minM !== null && minM !== minH))) {
      const nombre = `altura-${minH}-${minT ?? minH}-${minM ?? minH}`;
      a.className = T.estilo('core/group', nombre, 'Alto mínimo por punto de quiebre', [{ sel: '&', decls: [['min-height', `${minH}px`]] }]);
      if (minT !== null) T.estiloEnQuiebre(`.wp-block-group.is-style-${nombre}`, 'tablet', 'min-height', `${minT}px`);
      if (minM !== null) T.estiloEnQuiebre(`.wp-block-group.is-style-${nombre}`, 'movil', 'min-height', `${minM}px`);
    } else if (minH) a.style.dimensions = { minHeight: `${minH}px` };
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
  /**
   * El divisor de una sección (la curva que la cierra) es una FORMA del sitio (un SVG de Medios) pintada con un color de la paleta:
   * un estilo de bloque registrado del contenedor, con la forma como máscara. Su alto es una medida de composición (viewport).
   */
  function claseDeDivisor(bloqueNombre, dv, donde) {
    const color = T.slugColor(dv.color, donde, 'divisor.color');
    if (!color || !dv.forma) { T.perder(donde, 'divisor', JSON.stringify(dv), 'el divisor no se pudo armar con el set (color fuera de la paleta o sin forma)'); return undefined; }
    const lado = dv.donde === 'arriba' ? 'top' : 'bottom';
    const mascara = `url(${dv.forma}) center / 100% 100% no-repeat`;
    const forma = String(dv.forma).split('/').pop().replace(/\.svg$/i, '').toLowerCase();
    return T.estilo(bloqueNombre, `divisor-${dv.donde === 'arriba' ? 'arriba' : 'abajo'}-${color}-${forma}`, 'Divisor de sección', [
      { sel: '&', decls: [['position', 'relative']] },
      { sel: '&::after', decls: [['content', '""'], ['position', 'absolute'], ['left', '0'], ['right', '0'], [lado, '0'], ['height', dv.alto || '2.5vw'], ['background-color', T.ref.color(color)], ['-webkit-mask', mascara], ['mask', mascara], ['pointer-events', 'none']] },
    ]);
  }

  function seccion(n) {
    const { P, X } = datos(n);
    const S = X.surface || {};
    const donde = `${n.id} (sección)`;
    const gap = '0';
    const video_ = (n.children || []).find((c) => c.kind === 'video');
    const comunes = estiloContenedor(n, P, X, donde, { blockGap: gap });
    // Una caja centrada «100 % con tope» (el ancho de contenido o una medida de texto) es el comportamiento de un contenedor constrained:
    // la caja queda centrada con ese tope Y su relleno va por dentro (como el box-sizing: border-box del original).
    const hijosCaja = (n.children || []).filter((c) => c !== video_);
    const topes = new Set(hijosCaja.map((c) => { const pc = propiedadesDe(c.ruleIds, R).P; return pc.width === '100%' && pc['margin-inline-start'] === 'auto' ? pc['max-width'] : null; }));
    const tope = hijosCaja.length > 0 && topes.size === 1 ? [...topes][0] : null;
    const medidaDeTope = tope && tope !== '1080px' ? T.escalas.escalas.measure.pasos.find((p) => p.valor === tope) : undefined;
    const centrados = Boolean(tope && (tope === '1080px' || medidaDeTope));
    const disposicion = centrados ? { layout: { type: 'constrained', ...(medidaDeTope ? { contentSize: `var(--wp--custom--layout--measure--${medidaDeTope.slug})` } : {}) } } : {};
    if (centrados) for (const c of hijosCaja) yaCentrados.add(c.id);
    // (se decide ANTES de convertir a los hijos: un hijo ya centrado por su contenedor no vuelve a centrarse a sí mismo)
    const resto = (n.children || []).filter((c) => c !== video_).flatMap((c) => nodo(c));
    const anchor = n.marker ? { anchor: n.marker } : {};
    // Un degradado «color → transparente» sobre un color de fondo (sin foto ni video debajo) se ve como «color → fondo»: el bloque
    // no apila un color bajo un degradado (el degradado reemplaza al fondo), así que el preset termina en el color de fondo.
    const sinFondoDebajo = !S.backgroundAssetUrl && !video_;
    const g = S.backgroundGradient ? gradientes.registrar(S.backgroundGradient, T, sinFondoDebajo ? S.backgroundColor : undefined) : undefined;
    if (S.backgroundAssetUrl && /^(cover)$/.test(S.backgroundSize || '') || video_) {
      const url = video_ ? video_.content.sourceUrl : S.backgroundAssetUrl;
      const m = T.medios.get(url);
      const a = { url, backgroundType: video_ ? 'video' : 'image', dimRatio: g ? 100 : 0, tagName: 'section', align: 'full', isDark: Boolean(g), contentPosition: (P.display === 'flex' && P['flex-direction'] === 'column' && P['justify-content'] === 'center') ? 'center center' : 'top center', ...anchor, ...disposicion, ...comunes };
      if (m?.id && !video_) a.id = m.id;
      if (g) a.gradient = g;
      else if (S.backgroundColor) { const c = T.slugColor(S.backgroundColor, donde, 'background-color'); if (c) a.overlayColor = c; }
      const minH = aNumero(P['min-height']);
      if (minH) { a.minHeight = minH; a.minHeightUnit = 'px'; if (a.style?.dimensions) { delete a.style.dimensions; if (vacio(a.style)) delete a.style; } }
      if (X.divisor) { const cn = claseDeDivisor('core/cover', X.divisor, donde); if (cn) a.className = cn; }
      anotarSobrantes(T, P, donde);
      return [bloque('core/cover', a, resto)];
    }
    const a = { tagName: 'section', align: 'full', ...anchor, ...disposicion, ...comunes };
    if (S.backgroundAssetUrl) {
      const bi = { url: S.backgroundAssetUrl, source: 'file' };
      const m = T.medios.get(S.backgroundAssetUrl);
      if (m?.id) bi.id = m.id;
      a.style = { ...(a.style || {}), background: { backgroundImage: bi, ...(S.backgroundSize ? { backgroundSize: S.backgroundSize } : {}), ...(S.backgroundPosition ? { backgroundPosition: S.backgroundPosition } : {}), ...(S.backgroundRepeat ? { backgroundRepeat: S.backgroundRepeat } : {}) } };
    }
    if (g && !S.backgroundAssetUrl) { a.gradient = g; delete a.backgroundColor; }
    if (X.divisor) { const cn = claseDeDivisor('core/group', X.divisor, donde); if (cn) a.className = cn; }
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
    // La separación entre los hijos: la de un contenedor flex es su `gap`; la de una pila es el `gap` de su regla de layout (con sus quiebres).
    // Sin un `gap` declarado el motor del lienzo separa los hijos de un grupo 16 px (`.cod-group{display:grid;gap:16px}`): ese es el valor del original.
    const gapDeclarado = flex ? P.gap : X.layout?.gap;
    // (con un solo hijo no hay entre quién separar)
    // (un grupo `display: block` no es la cuadrícula del motor: sus hijos fluyen sin esa separación)
    const extra = { blockGap: (n.children || []).length > 1 || flex ? (T.esp(gapDeclarado ?? (P.display === 'block' ? '0px' : '16px'), donde, 'gap', P.__bp?.tablet?.gap, P.__bp?.mobile?.gap) ?? '0') : '0' };
    const a = estiloContenedor(n, P, X, donde, extra);
    if (flex) {
      a.layout = { type: 'flex', flexWrap: 'nowrap', ...(P['flex-direction'] === 'column' ? { orientation: 'vertical' } : {}), ...({ center: { verticalAlignment: 'center' }, 'flex-start': { verticalAlignment: 'top' }, start: { verticalAlignment: 'top' }, 'flex-end': { verticalAlignment: 'bottom' } }[P['align-items']] || {}) };
    }
    // Una pila con separación es una columna flex (no un grupo de flujo): en el flujo la separación es el margen superior de cada hijo y los
    // hijos de Basis ya traen su propio margen (0), como en el motor del lienzo (cuadrícula de una columna, sin colapso de márgenes).
    else if (extra.blockGap !== '0') a.layout = { type: 'flex', flexWrap: 'nowrap', orientation: 'vertical', justifyContent: 'stretch' };
    // Un ancho máximo de texto (700 / 760 px) es una medida del set: el contenido queda a la izquierda, con ese tope.
    const medida = !flex && !yaCentrados.has(n.id) && T.escalas.escalas.measure.pasos.find((p) => p.valor === P['max-width']);
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
    // El desenfoque del fondo es un paso de la escala de desenfoques y un estilo de bloque registrado del tema.
    const Pn = { ...P };
    if (P['backdrop-filter']) {
      const paso = T.desenfoque(P['backdrop-filter'], donde);
      if (paso) a.className = T.estilo('core/columns', `desenfoque-${paso}`, 'Fondo desenfocado', [{ sel: '&', decls: [['backdrop-filter', `blur(${T.ref.desenfoque(paso)})`]] }]);
      delete Pn['backdrop-filter'];
    }
    anotarSobrantes(T, Pn, donde);
    const cols = hijosN.map((c, i) => {
      const cp = propiedadesDe(c.ruleIds, R);
      const ca = atributosComunes(T, cp.P, cp.X, `${c.id} (columna)`, { tipografia: false });
      ca.style = ca.style || {};
      ca.style.spacing = { ...(ca.style.spacing || {}), blockGap: '0' };
      if (anchos[i]) ca.width = `${anchos[i]}%`;
      // «align-self» de la caja de la columna = alineación vertical de esa columna dentro de la fila.
      const yo = { center: 'center', 'flex-start': 'top', start: 'top', 'flex-end': 'bottom', end: 'bottom' }[cp.P['align-self']];
      if (yo) ca.verticalAlignment = yo;
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
    // La caja del mapa abierto (parte «grande»): su radio y su sombra son soportes del bloque (borde y sombra), con referencias al set.
    const grande = propiedadesDe((n.partes || {}).grande || [], R).P;
    const estilo = {};
    if (grande['border-radius']) { const r = T.radio(grande['border-radius'], `${n.id} (mapa)`); if (r) estilo.border = { radius: r }; }
    if (grande['box-shadow']) { const sh = T.sombra(grande['box-shadow'], `${n.id} (mapa)`); if (sh) estilo.shadow = sh; }
    if (Object.keys(estilo).length) a.style = estilo;
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
  /** `/…/iconos-divi/etmodules-e050.svg` → `etmodules-e050` (el nombre del glifo en el repertorio del sitio). */
  const nombreDeGlifo = (forma) => String(forma ?? '').split('/').pop().replace(/\.svg$/i, '').toLowerCase();

  /**
   * El ícono del pliegue es la parte `icono` de la regla: una caja con máscara cuyo color es el `background-color`, cuyo tamaño es
   * `width`/`height` y cuyo dibujo sale de `iconoCerrado` / `iconoAbierto`. El bloque `core/accordion` trae su propio «+» (texto); para
   * que sea ESE dibujo, ESE color y ESE tamaño hay un estilo de bloque registrado de `core/accordion-item` armado sólo con
   * referencias: el color de la paleta, un paso del espaciado y el SVG del repertorio del sitio.
   */
  function estiloDelPliegue(inter, icono, abierto, donde) {
    const cerradoNombre = inter.iconoCerrado ? nombreDeGlifo(inter.iconoCerrado) : 'mas';
    const abiertoNombre = inter.iconoAbierto === 'ninguno' ? null : (inter.iconoAbierto ? nombreDeGlifo(inter.iconoAbierto) : (inter.iconoCerrado ? cerradoNombre : 'menos'));
    const color = T.slugColor(icono['background-color'], donde, 'icono.background-color');
    const lado_ = T.pasoEspacio(icono.width ?? '16px', donde, 'icono.width');
    if (!color || !lado_ || lado_ === '0') return undefined;
    for (const f of [inter.iconoCerrado, inter.iconoAbierto]) if (f && f !== 'ninguno') T.iconosUsados.add(f);
    const mascara = (nombre) => `url(/wp-content/uploads/contope-iconos/icono-${nombre}.svg) center / contain no-repeat`;
    const caja = '& > .wp-block-accordion-heading .wp-block-accordion-heading__toggle-icon';
    const reglas = [{ sel: caja, decls: [['font-size', '0'], ['width', T.ref.espacio(lado_)], ['height', T.ref.espacio(lado_)], ['background-color', T.ref.color(color)], ['-webkit-mask', mascara(cerradoNombre)], ['mask', mascara(cerradoNombre)], ['transform', 'none']] }];
    if (abiertoNombre) reglas.push({ sel: `&.is-open ${caja.slice(2)}`, decls: [['-webkit-mask', mascara(abiertoNombre)], ['mask', mascara(abiertoNombre)]] });
    else reglas.push({ sel: `&.is-open ${caja.slice(2)}`, decls: [['display', 'none']] });
    // El pliegue ABIERTO (estado «current» de las partes): el fondo del pliegue y el color del título.
    // (con !important: el color y el fondo de reposo los imprime WordPress como clase de preset, también con !important)
    const importante = (ds) => ds.map(([p, v]) => [p, `${v} !important`]);
    const deItem = T.cssDeParte(abierto.item.P, `${donde} › pliegue abierto`);
    if (deItem.length) reglas.push({ sel: '&.is-open', decls: importante(deItem) });
    const deTitulo = T.cssDeParte(abierto.resumen.P, `${donde} › título abierto`);
    if (deTitulo.length) reglas.push({ sel: '&.is-open > .wp-block-accordion-heading', decls: importante(deTitulo) });
    const huella = createHash('sha1').update(JSON.stringify(reglas)).digest('hex').slice(0, 6);
    const nombre = `pliegue-${cerradoNombre}-${abiertoNombre ?? 'ninguno'}-${color}-${lado_}-${huella}`;
    return T.estilo('core/accordion-item', nombre, 'Pliegue (ícono y estado abierto)', reglas);
  }

  function acordeon(n, P, X, inter) {
    const donde = `${n.id} (acordeón)`;
    const partes = n.partes || {};
    const deParte = (clave, estado = 'default') => propiedadesDe(partes[clave] || [], R, { estado });
    const item = deParte('item');
    const resumen = deParte('resumen');
    const panel = deParte('panel');
    const iconoP = deParte('icono');
    const gap = X.layout?.gap ?? P.gap;
    const hijosN = n.children || [];
    const abierto_ = { item: deParte('item', 'current'), resumen: deParte('resumen', 'current') };
    const claseIcono = inter.showIcon !== false ? estiloDelPliegue(inter, iconoP.P, abierto_, donde) : undefined;
    const items = hijosN.map((g) => {
      const [titulo, ...cuerpo] = g.children || [];
      const abierto = inter.openNodeId === g.id;
      // El título lleva lo de la parte «resumen» y, encima, lo que su propio texto declara (el peso 700 de «Dimensiones»).
      const propio = datos(titulo);
      const tP = { ...resumen.P, ...propio.P };
      const tAttrs = atributosComunes(T, tP, { ...resumen.X, ...propio.X }, `${g.id} (resumen)`, { margen: false });
      const panelA = atributosComunes(T, panel.P, panel.X, `${g.id} (panel)`, { tipografia: false });
      panelA.style = panelA.style || {};
      panelA.style.spacing = { ...(panelA.style.spacing || {}), blockGap: '0' };
      const itemA = atributosComunes(T, item.P, item.X, `${g.id} (pliegue)`, { tipografia: false, margen: false });
      return bloque('core/accordion-item', { ...(abierto ? { openByDefault: true } : {}), ...(claseIcono ? { className: claseIcono } : {}), ...itemA }, [
        bloque('core/accordion-heading', { title: textoAHtml(titulo.content.text), level: 3, ...tAttrs }),
        bloque('core/accordion-panel', panelA, cuerpo.flatMap((c) => nodo(c))),
      ]);
    });
    const Pn = { ...P };
    // El relleno del grupo (30 px a los lados y abajo) es el relleno del bloque `core/accordion`.
    const relleno = atributosComunes(T, P, {}, donde, { tipografia: false, margen: false }).style?.spacing?.padding;
    anotarSobrantes(T, Pn, donde);
    for (const [k, v] of Object.entries(item.P)) if (!k.startsWith('__') && !['background-color', 'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-bottom-width', 'border-bottom-style', 'border-bottom-color'].includes(k)) T.perder(donde, k, v, 'parte «item» del acordeón');
    if (inter.showIcon !== false && !claseIcono) T.perder(donde, 'icono del pliegue', inter.iconoCerrado || 'mas', 'el ícono del pliegue no se pudo armar con el set (color o tamaño fuera de la paleta o del espaciado)');
    const margenTop = T.esp(P['margin-block-start'], donde, 'margin-top') ?? '0';
    const margenBottom = T.esp(P['margin-block-end'], donde, 'margin-bottom') ?? '0';
    const a = {
      iconPosition: inter.iconPosition || 'right',
      showIcon: inter.showIcon !== false,
      autoclose: inter.autoclose !== false,
      headingLevel: 3,
      style: { spacing: { blockGap: T.esp(gap, donde, 'gap', P.__bp?.tablet?.gap, P.__bp?.mobile?.gap) ?? '0', margin: { top: margenTop, bottom: margenBottom }, ...(relleno ? { padding: relleno } : {}) } },
    };
    return [bloque('core/accordion', a, items)];
  }

  // ------------------------------------------------------------------ textos
  /**
   * El glifo del ícono es el SVG de uploads/iconos-divi. WordPress ya trae la familia «ícono» (`core/icon`): un SVG que toma el color
   * de su texto, así que su color es un slug de la paleta (`textColor`). El plugin le da el repertorio del sitio (colección `contope`,
   * `COD_Iconos_De_Bloque`): el glifo se llama `contope/<nombre del archivo>`. Sólo cambia el ancho (una medida de composición).
   */
  function iconoSvg(forma, tamano, colorSlug, donde) {
    const px = Math.round(tamano || 40);
    const nombre = String(forma).split('/').pop().replace(/\.svg$/i, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(nombre)) { T.perder(donde, 'ícono', forma, 'el nombre del archivo no sirve como nombre de ícono'); return undefined; }
    T.iconosUsados?.add(forma);
    return bloque('core/icon', { icon: `contope/${nombre}`, ...(colorSlug ? { textColor: colorSlug } : {}), style: { dimensions: { width: `${px}px` } } });
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
  const lado_ = (P, ...nombres) => { for (const k of nombres) if (P[k] !== undefined) return P[k]; return undefined; };
  function imagen(n, enlaceA) {
    const { P, X } = datos(n);
    const donde = `${n.id} (imagen)`;
    const url = n.content.assetUrl;
    const m = T.medios.get(url);
    const a = { url, alt: n.content.alt ?? '', sizeSlug: 'full', linkDestination: 'none' };
    if (m?.id) a.id = m.id;
    // Lo que el bloque no expresa con atributos va a UN estilo de bloque registrado del tema (WordPress sólo procesa uno por bloque).
    const reglasEstilo = [];
    const nombresEstilo = [];
    const quiebres = [];
    // La proporción de la imagen: el bloque tiene UNA (aspectRatio). Si el original la cambia en tablet o celular, la proporción pasa al
    // estilo de bloque (una por punto de quiebre) y el atributo no se usa (su estilo en línea le ganaría a la hoja del tema).
    const razon = (bp) => propiedadesDe(n.ruleIds, R, { bp }).X.media?.aspectRatio;
    const rTablet = razon('tablet');
    const rMovil = razon('mobile');
    if (X.media?.aspectRatio && (rTablet || rMovil)) {
      const slugRazon = (r) => String(r).replace('/', 'x');
      nombresEstilo.push(`proporcion-${slugRazon(X.media.aspectRatio)}-${slugRazon(rTablet || X.media.aspectRatio)}-${slugRazon(rMovil || X.media.aspectRatio)}`);
      reglasEstilo.push({ sel: '& img', decls: [['aspect-ratio', X.media.aspectRatio], ['object-fit', X.media.fit || 'cover']] });
      if (rTablet) quiebres.push(['tablet', rTablet]);
      if (rMovil) quiebres.push(['movil', rMovil]);
    } else if (X.media?.aspectRatio) { a.aspectRatio = X.media.aspectRatio; a.scale = X.media.fit || 'cover'; }
    const ancho = P.width;
    let nw = aNumero(ancho);
    // Un ancho medido en 0 es una imagen que estaba dentro de un pliegue cerrado: vale el de la misma imagen medida abierta.
    if (nw) anchoPorUrl.set(url, nw); else if (nw === 0 && anchoPorUrl.has(url)) nw = anchoPorUrl.get(url);
    if (nw) a.width = `${nw}px`;
    if (aNumero(P.height)) a.height = `${aNumero(P.height)}px`;
    const com = atributosComunes(T, P, X, donde, { tipografia: false, relleno: false });
    Object.assign(a, com);
    // «Ancho: calc(100 % - N px)» con el margen derecho libre es lo mismo que un margen derecho de N px: un paso del espaciado.
    const resta = /^calc\(100% - (\d+(?:\.\d+)?px)\)$/.exec(String(P.width ?? '').trim());
    const Pn = { ...P };
    if (resta) {
      const mr = T.esp(resta[1], donde, 'margin-right');
      if (mr) { a.style = a.style || {}; a.style.spacing = { ...(a.style.spacing || {}), margin: { ...(a.style.spacing?.margin || {}), right: mr } }; }
    }
    // El contorno separado (outline + offset), armado con la escala de bordes, la paleta y el espaciado.
    if (P['outline-width'] && P['outline-style'] === 'solid') {
      const ancho_ = T.pasoBorde_(P['outline-width']);
      const color = T.slugColor(P['outline-color'], donde, 'outline-color');
      const sep = T.pasoEspacio(P['outline-offset'] ?? '0px', donde, 'outline-offset');
      if (ancho_ && color && sep !== undefined) {
        nombresEstilo.push(`contorno-${ancho_}-${color}-${sep}`);
        reglasEstilo.push({ sel: '& img', decls: [['outline', `${T.ref.borde(ancho_)} solid ${T.ref.color(color)}`], ['outline-offset', sep === '0' ? '0' : T.ref.espacio(sep)]] });
        for (const k of ['outline-width', 'outline-style', 'outline-color', 'outline-offset']) delete Pn[k];
      }
    }
    if (reglasEstilo.length) {
      const nombre = nombresEstilo.join('-');
      a.className = T.estilo('core/image', nombre, 'Imagen: contorno y proporción', reglasEstilo);
      for (const [punto, r] of quiebres) T.estiloEnQuiebre(`.wp-block-image.is-style-${nombre} img`, punto, 'aspect-ratio', r);
    }
    // La imagen centrada (margen automático a los dos lados) es la alineación «centro» del bloque de imagen.
    if (P['margin-inline-start'] === 'auto' && P['margin-inline-end'] === 'auto') a.align = 'center';
    // Sin radio declarado, la imagen del original tiene las puntas rectas (el tema trae un radio por omisión para el bloque de imagen).
    if (!a.style?.border?.radius) a.style = { ...(a.style || {}), border: { ...(a.style?.border || {}), radius: '0' } };
    if (enlaceA) {
      a.href = enlaceA.href; a.linkDestination = 'media'; a.linkTarget = '_blank'; a.rel = 'noreferrer noopener';
      // El enlace que envuelve a la imagen es un bloque con sus propios márgenes; el margen de la imagen se une al de su envoltura
      // (los márgenes verticales de un hijo y su padre se funden en el mayor).
      const mayor = (propio, envoltura) => { const a_ = aNumero(propio) ?? 0; const b = aNumero(envoltura) ?? 0; return Math.abs(b) > Math.abs(a_) ? envoltura : propio; };
      const mt = mayor(lado_(P, 'margin-top', 'margin-block-start'), enlaceA.mtop);
      const mb = mayor(lado_(P, 'margin-bottom', 'margin-block-end'), enlaceA.mbottom);
      const top = T.esp(mt, donde, 'margin-top');
      const bottom = T.esp(mb, donde, 'margin-bottom');
      a.style = { ...(a.style || {}), spacing: { ...(a.style?.spacing || {}), margin: { ...(a.style?.spacing?.margin || {}), ...(top !== undefined ? { top } : {}), ...(bottom !== undefined ? { bottom } : {}) } } };
    }
    anotarSobrantes(T, Pn, donde);
    if (X.media && !X.media.aspectRatio) T.perder(donde, 'media', JSON.stringify(X.media), 'sin atributo de bloque');
    return [bloque('core/image', a)];
  }

  function enlace(n) {
    const img = (n.children || []).find((c) => c.kind === 'image');
    if (img) { const { P } = datos(n); return imagen(img, { href: n.content.href, mtop: P['margin-block-start'] ?? P['margin-top'], mbottom: P['margin-block-end'] ?? P['margin-bottom'] }); }
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
    // La tabla del lienzo no trae líneas: las celdas llevan un relleno de .75rem y el texto va al inicio (`.cod-node--table th, td`). `core/table`
    // trae un borde de 1 px y medio em de relleno; el estilo de bloque registrado (la raíz de `core/table` es su <table>) le devuelve el aspecto de la tabla de la composición.
    const relleno = T.pasoEspacio('12px', donde, 'padding');
    if (relleno) {
      // (con !important: las celdas de core/table traen su borde y su relleno con una especificidad que la variación, por diseño de WordPress, no alcanza)
      const celdaCss = [['padding', `${T.ref.espacio(relleno)} !important`], ['border', '0 !important'], ['text-align', 'start']];
      a.className = T.estilo('core/table', 'sin-lineas', 'Sin líneas', [
        { sel: '&', decls: [['border-collapse', 'collapse'], ['width', '100%']] },
        { sel: '& th', decls: celdaCss },
        { sel: '& td', decls: celdaCss },
      ]);
    }
    anotarSobrantes(T, P, donde);
    return [bloque('core/table', a)];
  }

  function separador(n) {
    const { P, X } = datos(n);
    const a = atributosComunes(T, P, X, `${n.id} (separador)`, { tipografia: false, relleno: false });
    anotarSobrantes(T, P, `${n.id} (separador)`);
    return [bloque('core/separator', { ...a, opacity: 'css' })];
  }

  /** Dónde cae cada parte de la composición dentro del HTML que dibuja WordPress para ese bloque. */
  const SELECTORES_DE_PARTE = {
    'core/search': { etiqueta: '& .wp-block-search__label', envoltura: '& .wp-block-search__inside-wrapper', entrada: '& .wp-block-search__input', boton: '& .wp-block-search__button' },
    'core/latest-posts': { lista: '&', item: '& li', enlace: '& a', fecha: '& time' },
    'core/latest-comments': { lista: '&', item: '& li', enlace: '& a', fecha: '& time', vacio: '& .wp-block-latest-comments__no-comments' },
  };

  function bloqueNativo(n) {
    const { name, attrs } = n.content;
    const { P } = datos(n);
    const donde = `${n.id} (${name})`;
    const mar = {};
    const bottom = T.esp(P['margin-block-end'], n.id, 'margin-bottom');
    if (bottom !== undefined) mar.bottom = bottom;
    // Las partes (y la posición del propio bloque) son un estilo de bloque registrado del tema, armado sólo con referencias al sistema.
    const reglas = [];
    const propio = Object.entries(P).filter(([k]) => k === 'position');
    if (propio.length) reglas.push({ sel: '&', decls: propio });
    for (const [parte, ids] of Object.entries(n.partes || {})) {
      const sel = SELECTORES_DE_PARTE[name]?.[parte];
      if (!sel) { T.perder(donde, `parte «${parte}»`, '', 'esta parte no tiene selector conocido en el bloque de WordPress'); continue; }
      const decls = T.cssDeParte(propiedadesDe(ids, R).P, `${donde} › ${parte}`);
      if (decls.length) reglas.push({ sel, decls });
    }
    const a = { ...attrs, ...(vacio(mar) ? {} : { style: { spacing: { margin: mar } } }) };
    if (reglas.length) {
      const huella = createHash('sha1').update(JSON.stringify(reglas)).digest('hex').slice(0, 8);
      a.className = T.estilo(name, `partes-${name.split('/')[1]}-${huella}`, 'Partes del bloque', reglas);
    }
    return [bloque(name, a)];
  }

  return nodos.flatMap((n) => nodo(n));
}

/** Registra los degradados que el sitio usa (color→transparente, con ángulo) para que el tema los declare como presets. */
export function crearRegistroDeGradientes() {
  const usados = new Map();
  return {
    usados,
    /**
     * `base`: el color de fondo que había DEBAJO del degradado (si no había foto ni video). Un degradado que termina en transparente
     * sobre un fondo opaco se ve exactamente como un degradado que termina en ese fondo; como el bloque no apila un color bajo el
     * degradado (el preset reemplaza el fondo), el preset se declara con ese color de término.
     */
    registrar(g, T, base) {
      const stops = g.stops || [];
      const primero = stops[0]?.color;
      const ultimo = stops[stops.length - 1]?.color;
      const slugColor = T.slugColor(primero, 'degradado', 'color');
      if (!slugColor || ultimo !== 'transparent' || g.type !== 'linear') { T.perder('degradado', 'background-gradient', JSON.stringify(g), 'sólo se admite color→transparente lineal'); return undefined; }
      const ang = Number.parseInt(g.angle ?? '180', 10);
      const fin = base ? T.slugColor(base, 'degradado', 'color') : undefined;
      const sufijoAng = ang === 180 ? '' : `-${ang}`;
      const slug = fin ? `${slugColor}-a-${fin}${sufijoAng}` : `${slugColor}-a-transparente${sufijoAng}`;
      const nombre = fin ? `${slugColor} a ${fin}${ang === 180 ? '' : ` (${ang}°)`}` : `${slugColor} a transparente${ang === 180 ? '' : ` (${ang}°)`}`;
      usados.set(slug, { slug, name: nombre, gradient: `linear-gradient(${ang}deg, var(--wp--preset--color--${slugColor}) 0%, ${fin ? `var(--wp--preset--color--${fin})` : 'transparent'} 100%)` });
      return slug;
    },
  };
}
