/**
 * Módulos de Divi → nodos de ContOpe.
 *
 * Cada transcriptor recibe el módulo medido a 1440 (`d`) y a 393 (`m`, puede
 * faltar), la caja de su columna y el hueco que lo separa del siguiente módulo
 * de la columna, y devuelve una lista de nodos. TODO lo que no sabe hacer lo
 * reporta con ctx.avisar(); nada se descarta en silencio.
 */
import { px, pxs, redondear, lados, leerHtml, textoDe, limpiarTexto, marcasEnLinea, colorRegla, esTransparente, hex, leerColor } from './util.mjs';
import { reglasTexto, reglasMargen, declaracionesCaja, valorTipografia } from './estilos.mjs';
import { transcribirCodigo } from './codigo.mjs';
import { moduloAcordeon } from './acordeon.mjs';

/* ------------------------------------------------------------------ texto */

// Medidas por omisión de Divi dentro de un módulo de texto, en este orden:
// título → 10px de aire debajo; párrafo → 1em; lista → 23px. El último bloque
// del módulo no lleva aire propio: el hueco con el módulo siguiente se mide.
const AIRE_BLOQUE = { h: () => 10, p: (est) => px(est?.tam) || 16, lista: () => 23 };

const estiloPorTexto = (medida, texto) => {
  const t = limpiarTexto(texto).slice(0, 40);
  if (!t) return null;
  return (medida?.roles || []).find((r) => (r.ejemplos || []).some((e) => e.slice(0, 40) === t.slice(0, e.length > 40 ? 40 : e.length))) || null;
};

/** Texto → items de lista: [{text}|{text, items}] a partir de <li>. */
const itemsDeLista = (ul) => ul.hijos.filter((h) => h.tag === 'li').map((li) => {
  const subs = li.hijos.filter((h) => h.tag === 'ul' || h.tag === 'ol');
  const texto = limpiarTexto(li.hijos.filter((h) => !(h.tag === 'ul' || h.tag === 'ol')).map(textoDe).join(''));
  if (!subs.length) return texto;
  return { text: texto, items: subs.flatMap(itemsDeLista) };
});
const aplanar = (items, nivel = 0) => items.flatMap((i) => (typeof i === 'string' ? [i] : [i.text, ...aplanar(i.items, nivel + 1)]));

export function moduloTexto(ctx, d, m, { gapD, gapM, ubicacion }) {
  const arbol = leerHtml(d.html || '');
  const cola = {};
  const sacar = (tag, cual) => { const a = (cola[tag] ||= (d.bloques || []).filter((b) => b.etiqueta === tag)); return a.shift() || null; };
  const colaM = {};
  const sacarM = (tag) => { const a = (colaM[tag] ||= (m?.bloques || []).filter((b) => b.etiqueta === tag)); return a.shift() || null; };
  const bloques = [];
  let huboFormato = false;
  for (const h of arbol.hijos) {
    if (h.texto !== undefined) {
      const t = limpiarTexto(h.texto);
      if (t) bloques.push({ tipo: 'p', texto: t, bD: (d.bloques || [])[0] || null, bM: (m?.bloques || [])[0] || null });
      continue;
    }
    if (/^h[1-6]$/.test(h.tag)) {
      bloques.push({ tipo: 'h', nivel: Number(h.tag[1]), texto: limpiarTexto(textoDe(h)), bD: sacar(h.tag), bM: sacarM(h.tag), hijos: h });
    } else if (h.tag === 'p' || h.tag === 'div' || h.tag === 'blockquote') {
      const t = limpiarTexto(textoDe(h));
      if (t) bloques.push({ tipo: 'p', texto: t, bD: sacar('p') || sacar(h.tag), bM: sacarM('p') || sacarM(h.tag), hijos: h });
    } else if (h.tag === 'ul' || h.tag === 'ol') {
      bloques.push({ tipo: 'lista', ordenada: h.tag === 'ol', items: itemsDeLista(h), bD: (d.bloques || []).find((b) => b.etiqueta === 'li') || null, bM: (m?.bloques || []).find((b) => b.etiqueta === 'li') || null, hijos: h });
    } else if (h.tag === 'br') {
      continue;
    } else {
      ctx.avisar({ ...ubicacion, modulo: 'text', clase: `<${h.tag}> dentro del texto`, severidad: 'sin-transcribir', motivo: `elemento HTML <${h.tag}> dentro de un módulo de texto: se omite` });
    }
  }
  for (const b of bloques) {
    if (b.hijos) {
      const marcas = [...marcasEnLinea(b.hijos)].filter((x) => !(x === 'a' && b.tipo === 'p' && b.hijos.hijos.filter((y) => y.texto === undefined || y.texto.trim()).length === 1 && limpiarTexto(textoDe(b.hijos.hijos.find((y) => y.tag === 'a') || {texto:''})) === b.texto));
      if (marcas.length) {
        huboFormato = true;
        ctx.avisar({ ...ubicacion, modulo: 'text', clase: marcas.map((x) => `<${x}>`).join(''), severidad: 'aproximado', motivo: `formato en línea (${marcas.join(', ')}) dentro de «${(b.texto || '').slice(0, 40)}»: ContOpe lleva texto plano, queda sin el formato` });
      }
    }
  }
  const nodos = [];
  bloques.forEach((b, i) => {
    const ultimo = i === bloques.length - 1;
    // Estilo: el medido del bloque; si falta, el de `roles` por texto.
    const est = (bD) => bD?.estilo || null;
    const eD = est(b.bD) || (estiloPorTexto(ctx.medidaD, b.texto || '') || null);
    const eM = est(b.bM) || null;
    const aire = b.tipo === 'h' ? AIRE_BLOQUE.h() : b.tipo === 'lista' ? AIRE_BLOQUE.lista() : AIRE_BLOQUE.p(eD);
    const finD = ultimo ? gapD : aire;
    const finM = ultimo ? gapM : aire;
    if (!eD) {
      ctx.avisar({ ...ubicacion, modulo: 'text', clase: b.tipo, severidad: 'aproximado', motivo: `no hay estilo medido para «${(b.texto || '').slice(0, 40)}»: queda con el del tema` });
    }
    // Divi guarda el color/tamaño de un texto en un <span style> que lo envuelve todo:
    // el estilo computado del <p> no lo ve, así que se lee del span.
    const enLinea = (() => {
      const k = (b.hijos?.hijos || []).filter((x) => x.texto === undefined || x.texto.trim());
      if (k.length !== 1 || k[0].tag !== 'span' || !k[0].attrs.style) return null;
      const o = {};
      for (const par of k[0].attrs.style.split(';')) { const [kk, vv] = par.split(':').map((x) => x && x.trim()); if (kk && vv) o[kk.toLowerCase()] = vv; }
      return o;
    })();
    const aplicarLinea = (e) => {
      if (!e || !enLinea) return e;
      const r = { ...e };
      if (enLinea.color) { const c = leerColor(enLinea.color) || leerColor(enLinea.color.replace(/^(#[0-9a-f]{3})$/i, (x) => '#' + [...x.slice(1)].map((ch) => ch + ch).join(''))); if (c) r.color = `rgb(${c.r}, ${c.g}, ${c.b})`; }
      if (enLinea['font-size'] && px(enLinea['font-size'])) r.tam = enLinea['font-size'];
      if (enLinea['font-weight']) r.peso = enLinea['font-weight'];
      return r;
    };
    const reglas = eD ? reglasTexto(ctx.reg, { d: aplicarLinea(eD), m: aplicarLinea(eM) }) : [];
    reglas.push(...reglasMargen(ctx.reg, finD, finM));
    const unico = b.hijos && b.tipo === 'p' ? b.hijos.hijos.filter((x) => x.texto === undefined || x.texto.trim()) : [];
    const soloEnlace = unico.length === 1 && unico[0].tag === 'a' && limpiarTexto(textoDe(unico[0])) === b.texto ? unico[0] : null;
    const destEnl = soloEnlace && ctx.destino(soloEnlace.attrs.href);
    if (destEnl) nodos.push(ctx.nodo('link', [...reglas, ctx.reg.R('typography', { role: 'sin-subrayado', decoration: 'none' }, { prefijo: 't' })], { label: b.texto, href: destEnl.href, target: soloEnlace.attrs.target === '_blank' ? 'blank' : 'self' }));
    else if (b.tipo === 'h') nodos.push(ctx.nodo('heading', reglas, { text: b.texto, level: b.nivel }));
    else if (b.tipo === 'p') nodos.push(ctx.nodo('paragraph', reglas, { text: b.texto }));
    else {
      const anidada = b.items.some((x) => typeof x !== 'string');
      const items = anidada && !ctx.perfil.plugin?.listasAnidadas ? aplanar(b.items) : b.items;
      if (anidada && !ctx.perfil.plugin?.listasAnidadas) ctx.avisar({ ...ubicacion, modulo: 'text', clase: 'ul anidada', severidad: 'aproximado', motivo: 'lista anidada aplanada: el nodo `list` del plugin sólo admite ítems planos (hueco del plugin)' });
      // La sangría de la lista: el relleno izquierdo que Divi le da (1em).
      const reglasLista = [...reglas, ...ctx.reg.propiedades({ 'padding-inline-start': '1em', 'list-style-position': 'outside' }, {}, { prefijo: 'lista' })];
      nodos.push(ctx.nodo('list', reglasLista, { ordered: b.ordenada, items }));
    }
  });
  void huboFormato;
  return nodos;
}

/* --------------------------------------------------------------- título */

export function moduloTitulo(ctx, d, m, { gapD, gapM, ubicacion }) {
  const reglas = reglasTexto(ctx.reg, { d: d.estilo, m: m?.estilo });
  // Un título de Divi trae 10px de aire propio debajo (padding-bottom) que ya está
  // dentro de la caja medida: si el alto sobra exactamente 10 sobre un número entero
  // de líneas, ese aire se suma al margen del nodo.
  const extra = (c, e) => { const l = px(e?.interlineado); if (!c || !l) return 0; const n = (c.h - 10) / l; return Math.abs(n - Math.round(n)) < 0.06 && n >= 0.9 ? 10 : 0; };
  reglas.push(...reglasMargen(ctx.reg, (gapD ?? 0) + extra(d.caja, d.estilo), (gapM ?? 0) + extra(m?.caja, m?.estilo)));
  const nivel = Number((d.etiqueta || 'h2')[1]) || 2;
  return [ctx.nodo('heading', reglas, { text: limpiarTexto(d.texto), level: nivel })];
}

/* --------------------------------------------------------------- imagen */

// La regla media sólo acepta p/q de uno o dos dígitos: se busca la fracción más cercana.
const razon = (w, h) => {
  let mejor = [1, 1], err = Infinity;
  for (let q = 1; q <= 99; q++) { const p = Math.round((w / h) * q); if (p < 1 || p > 99) continue; const e = Math.abs(p / q - w / h); if (e < err - 1e-9) { err = e; mejor = [p, q]; } }
  return mejor[0] + "/" + mejor[1];
};

const radioDeImagen = (ctx, img, zona) => {
  const w = img.caja.w, h = img.caja.h;
  const r = (ctx.medidaD?.radios || []).find((x) => x.zona === zona && x.caja === `${w}x${h}` && x.radio && x.radio !== '0px');
  return r ? r.radio : (img.radio && img.radio !== '0px' ? img.radio : null);
};

export function moduloImagen(ctx, d, m, { col, gapD, gapM, ubicacion }) {
  const nodos = [];
  (d.imagenes || []).forEach((img, i) => {
    const imgM = m?.imagenes?.[i];
    const url = ctx.url(img.actual || img.src, ubicacion);
    if (!url) return;
    const caja = img.caja; const cajaM = imgM?.caja;
    const fit = img.objectFit && img.objectFit !== 'fill' ? img.objectFit : null;
    const decl = {};
    const declM = {};
    const colW = col?.d?.w || caja.w; const colWM = col?.m?.w || cajaM?.w;
    const llena = caja.w >= colW - 1;
    // Ancho: a todo el ancho de la columna, o el propio de la imagen si es menor.
    if (llena || fit) { decl.width = '100%'; } else { decl.width = pxs(caja.w); decl['max-width'] = '100%'; }
    decl.height = fit ? 'auto' : 'auto';
    if (cajaM) {
      const llenaM = cajaM.w >= (colWM || cajaM.w) - 1;
      declM.width = llenaM || fit ? '100%' : pxs(cajaM.w);
    }
    // Alineación dentro de la columna cuando no llena.
    if (!llena) {
      const sobra = colW - caja.w; const izq = caja.x - (col?.d?.x ?? caja.x);
      if (sobra > 2 && Math.abs(izq - sobra / 2) < 3) { decl['margin-inline-start'] = 'auto'; decl['margin-inline-end'] = 'auto'; }
      else if (sobra > 2 && izq > sobra - 3) decl['margin-inline-start'] = 'auto';
    }
    const reglas = [...ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'img' })];
    const aspecto = (c) => razon(c.w, c.h);
    if (fit) {
      const vD = { aspectRatio: aspecto(caja), fit };
      const camb = cajaM ? { mobile: { aspectRatio: aspecto(cajaM), fit } } : {};
      if (camb.mobile && camb.mobile.aspectRatio === vD.aspectRatio) delete camb.mobile;
      reglas.push(...ctx.reg.conAnchos('media', vD, camb, { prefijo: 'media' }));
    }
    const radio = radioDeImagen(ctx, img, ubicacion.zona);
    if (radio) reglas.push(ctx.reg.R('properties', { declarations: { 'border-radius': radio, overflow: 'hidden' } }, { prefijo: 'rad' }));
    reglas.push(...reglasMargen(ctx.reg, gapD, gapM));
    let nodo = ctx.nodo('image', reglas, { assetUrl: url, alt: img.alt || '' });
    const enlace = img.enlace && ctx.destino(img.enlace);
    if (enlace) {
      const reglasEnl = [...ctx.reg.propiedades({ display: 'block', width: decl.width === '100%' ? '100%' : pxs(caja.w), 'max-width': '100%' }, {}, { prefijo: 'enl' })];
      nodo.ruleIds = nodo.ruleIds.filter((r) => !r.startsWith('mg-'));
      const link = ctx.nodo('link', [...reglasEnl, ...reglasMargen(ctx.reg, gapD, gapM)], { label: '', href: enlace.href, target: enlace.blank ? 'blank' : 'self' }, [nodo]);
      nodo = link;
    }
    nodos.push(nodo);
  });
  return nodos;
}

/* --------------------------------------------------------------- botón */

const reglasBoton = (ctx, b, bM, { alineacion, ubicacion }) => {
  const e = b.estilo; const eM = bM?.estilo;
  const reglas = [ctx.reg.R('button', { variant: 'solid', tone: 'primary', size: 'md', width: 'auto', interaction: 'none' }, { prefijo: 'btn' })];
  reglas.push(...reglasTexto(ctx.reg, { d: { ...e, color: undefined }, m: eM ? { ...eM, color: undefined } : undefined }, { sinColor: true }));
  const fondo = colorRegla(e.fondo);
  reglas.push(ctx.reg.R('color', { role: `boton-fondo-${fondo.replace(/[^0-9a-z]/gi, '').toLowerCase()}`, color: fondo, apply: 'background' }, { prefijo: 'cbg' }));
  reglas.push(ctx.reg.R('color', { role: `boton-texto-${colorRegla(e.color).replace(/[^0-9a-z]/gi, '').toLowerCase()}`, color: colorRegla(e.color), apply: 'text' }, { prefijo: 'cbt' }));
  const r = px(e.radio);
  const alto = px(b.caja?.h) || 48;
  reglas.push(ctx.reg.R('shape', r >= alto / 2 ? { radius: 'pill', borderStyle: 'none' } : { radius: r ? `${r}px` : 'none', borderStyle: 'none' }, { prefijo: 'forma' }));
  const [t, rr, bb, l] = lados(e.relleno);
  const decl = { 'padding-top': pxs(t), 'padding-right': pxs(rr), 'padding-bottom': pxs(bb), 'padding-left': pxs(l), 'border-width': '0px' };
  if (e.sombra && e.sombra !== 'none') decl['box-shadow'] = e.sombra;
  const declM = {};
  if (eM) { const [t2, r2, b2, l2] = lados(eM.relleno); Object.assign(declM, { 'padding-top': pxs(t2), 'padding-right': pxs(r2), 'padding-bottom': pxs(b2), 'padding-left': pxs(l2) }); }
  if (alineacion === 'right') decl['margin-inline-start'] = 'auto';
  if (alineacion === 'center') { decl['margin-inline-start'] = 'auto'; decl['margin-inline-end'] = 'auto'; }
  decl.display = 'block'; decl['width'] = 'fit-content';
  reglas.push(...ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'btnp' }));
  return reglas;
};

export function moduloBoton(ctx, d, m, { gapD, gapM, ubicacion }) {
  const b = d.boton; if (!b) { ctx.avisar({ ...ubicacion, modulo: 'button', clase: 'sin <a>', severidad: 'sin-transcribir', motivo: 'módulo de botón sin enlace/botón medido' }); return []; }
  const alin = /right/.test(d.alineacion || '') ? 'right' : /center/.test(d.alineacion || '') ? 'center' : 'left';
  const reglas = [...reglasBoton(ctx, b, m?.boton, { alineacion: alin, ubicacion }), ...reglasMargen(ctx.reg, gapD, gapM)];
  const dest = ctx.destino(b.href || b.destino);
  const contenido = { label: b.texto };
  if (dest) { contenido.href = dest.href; contenido.target = b.target === '_blank' || dest.blank ? 'blank' : 'self'; }
  else ctx.avisar({ ...ubicacion, modulo: 'button', clase: `«${b.texto}»`, severidad: 'aproximado', motivo: `el botón «${b.texto}» no lleva a ninguna parte en el original (href «${b.href ?? ''}»): queda como botón sin destino` });
  return [ctx.nodo('button', reglas, contenido)];
}

/* ---------------------------------------------------------------- blurb */

// Glifos de ícono de Divi (FontAwesome / ETmodules) → Material Symbols.
const GLIFOS = {
  f217: 'add_shopping_cart', f494: 'warehouse', e0e1: 'hourglass_empty',
};

export function moduloBlurb(ctx, d, m, { gapD, gapM, ubicacion }) {
  const nodos = [];
  const titulo = d.titulo;
  const reglasT = d.estiloTitulo ? reglasTexto(ctx.reg, { d: d.estiloTitulo, m: m?.estiloTitulo }) : [];
  if (d.icono && d.icono.glifo) {
    const cp = d.icono.glifo.codePointAt(0).toString(16);
    const nombre = GLIFOS[cp];
    if (nombre) {
      (ctx.ajustes.iconos ||= []).includes(nombre) || ctx.ajustes.iconos.push(nombre);
      reglasT.push(ctx.reg.R('icono', { nombre, donde: 'antes', tamano: d.icono.tam, color: colorRegla(d.icono.color), separacion: '12px' }, { prefijo: 'ico' }));
    } else {
      ctx.avisar({ ...ubicacion, modulo: 'blurb', clase: `glifo ${d.icono.familia} U+${cp}`, severidad: 'sin-transcribir', motivo: `ícono ${d.icono.familia} U+${cp} sin equivalente en la tabla de Material Symbols: el título queda sin ícono` });
    }
  }
  const imgs = (d.imagenes || []);
  if (imgs.length) {
    const url = ctx.url(imgs[0].actual || imgs[0].src, ubicacion);
    if (url) nodos.push(ctx.nodo('image', [...ctx.reg.propiedades({ width: pxs(imgs[0].caja.w), 'max-width': '100%' }, {}, { prefijo: 'img' }), ...reglasMargen(ctx.reg, 10, 10)], { assetUrl: url, alt: imgs[0].alt || '' }));
  }
  const sinDesc = !d.descripcion;
  if (titulo) {
    reglasT.push(...reglasMargen(ctx.reg, sinDesc ? gapD : 10, sinDesc ? gapM : 10));
    nodos.push(ctx.nodo('heading', reglasT, { text: titulo, level: Number((d.etiqueta || 'h4')[1]) || 4 }));
  }
  if (d.descripcion) {
    const reglasP = d.estiloDescripcion ? reglasTexto(ctx.reg, { d: d.estiloDescripcion, m: m?.estiloDescripcion }) : [];
    reglasP.push(...reglasMargen(ctx.reg, gapD, gapM));
    nodos.push(ctx.nodo('paragraph', reglasP, { text: limpiarTexto(d.descripcion) }));
  }
  return nodos;
}

/* ----------------------------------------------------------- promo / cta */

export function moduloPromo(ctx, d, m, { gapD, gapM, ubicacion }) {
  const hijos = [];
  const reglasT = reglasTexto(ctx.reg, { d: d.estiloTitulo, m: m?.estiloTitulo });
  reglasT.push(...reglasMargen(ctx.reg, 10, 10));
  hijos.push(ctx.nodo('heading', reglasT, { text: d.titulo, level: Number((d.etiqueta || 'h2')[1]) || 2 }));
  const rolDesc = estiloPorTexto(ctx.medidaD, d.descripcion || '');
  const rolDescM = estiloPorTexto(ctx.medidaM, d.descripcion || '');
  if (d.descripcion) {
    const reglasP = rolDesc ? reglasTexto(ctx.reg, { d: rolDesc, m: rolDescM }) : [];
    reglasP.push(...reglasMargen(ctx.reg, 30, 30));
    hijos.push(ctx.nodo('paragraph', reglasP, { text: limpiarTexto(d.descripcion) }));
  }
  if (d.boton) hijos.push(...moduloBoton(ctx, { boton: d.boton, alineacion: 'et_pb_button_alignment_center' }, m ? { boton: m.boton } : null, { gapD: 0, gapM: 0, ubicacion }));
  const caja = declaracionesCaja(d.cajaPromo);
  const [t, r, b, l] = lados(d.cajaPromo?.relleno);
  Object.assign(caja, { 'padding-top': pxs(t), 'padding-right': pxs(r), 'padding-bottom': pxs(b), 'padding-left': pxs(l), 'text-align': 'center' });
  const cajaM = m?.cajaPromo ? (() => { const [t2, r2, b2, l2] = lados(m.cajaPromo.relleno); return { 'padding-top': pxs(t2), 'padding-right': pxs(r2), 'padding-bottom': pxs(b2), 'padding-left': pxs(l2) }; })() : {};
  const reglas = [...ctx.reg.propiedades(caja, { mobile: cajaM }, { prefijo: 'promo' }), ...reglasMargen(ctx.reg, gapD, gapM)];
  return [ctx.nodo('group', [ctx.reg.R('layout', { mode: 'stack', gap: '0px', align: 'stretch' }, { prefijo: 'pila' }), ...reglas], undefined, hijos)];
}

/* -------------------------------------------------------------- formulario */

export function moduloFormulario(ctx, d, m, { gapD, gapM, ubicacion }) {
  const slug = ctx.perfil.formularios?.[0]?.slug;
  const f = ctx.medidaD?.formularios?.[0];
  if (!slug) {
    ctx.avisar({ ...ubicacion, modulo: 'gravityforms', clase: 'gform', severidad: 'sin-transcribir', motivo: 'formulario de Gravity Forms sin `formularios` en el perfil: no se emite' });
    return [];
  }
  const enviar = f?.enviar?.estilo;
  const tema = {
    texto: '#112337', textoSuave: '#585E6A', fondo: '#FFFFFF', superficie: '#FFFFFF', superficieAlt: '#F4F4F4', borde: '#D6D6D6', bordeFuerte: '#999999',
    principal: enviar ? colorRegla(enviar.fondo) : '#F26621', principalHover: enviar ? colorRegla(enviar.fondo) : '#F26621', principalContraste: enviar ? colorRegla(enviar.color) : '#FFFFFF',
    tipografia: `'${(enviar?.familia) || 'Open Sans'}', sans-serif`, radio: enviar?.radio || '4px', espaciado: '16px',
  };
  const reglas = [ctx.reg.R('form', { surface: 'none', theme: tema }, { prefijo: 'form' }), ...reglasMargen(ctx.reg, gapD, gapM)];
  ctx.avisar({ ...ubicacion, modulo: 'gravityforms', clase: f?.id || 'gform', severidad: 'ok', motivo: `formulario de Gravity Forms → formulario de Orugantt Forms «${slug}» (se genera con formulario-a-orugantt.mjs)` });
  return [ctx.nodo('form', reglas, { formSlug: slug })];
}

/* --------------------------------------------------------------- video */

export function moduloVideo(ctx, d, m, { gapD, gapM, ubicacion }) {
  ctx.avisar({ ...ubicacion, modulo: 'video', clase: 'et_pb_video', severidad: 'sin-transcribir', motivo: 'módulo de video: no hay muestra en el sitio medido; se omite' });
  return [];
}

/* ---------------------------------------------------------------- divisor */

export function moduloDivisor(ctx, d, m, { gapD, gapM }) {
  return [ctx.nodo('separator', reglasMargen(ctx.reg, gapD, gapM), {})];
}

/* ------------------------------------------------------------ despachador */

export function transcribirModulo(ctx, d, m, info) {
  const t = d.tipo;
  switch (t) {
    case 'text': return moduloTexto(ctx, d, m, info);
    case 'heading': return moduloTitulo(ctx, d, m, info);
    case 'image': case 'fullwidth_image': return moduloImagen(ctx, d, m, info);
    case 'button': return moduloBoton(ctx, d, m, info);
    case 'blurb': return moduloBlurb(ctx, d, m, info);
    case 'promo': case 'cta': return moduloPromo(ctx, d, m, info);
    case 'accordion': return moduloAcordeon(ctx, d, m, info);
    case 'toggle': return moduloAcordeon(ctx, { ...d, items: [d] }, m ? { ...m, items: [m] } : m, { ...info, independiente: true });
    case 'gravityforms': return moduloFormulario(ctx, d, m, info);
    case 'video': return moduloVideo(ctx, d, m, info);
    case 'divider': return moduloDivisor(ctx, d, m, info);
    case 'code': case 'fullwidth_code': return transcribirCodigo(ctx, d, info).nodos;
    default:
      ctx.avisar({ ...info.ubicacion, modulo: t, clase: `et_pb_${t}`, severidad: 'sin-transcribir', motivo: `módulo «${t}» sin transcriptor: ${['tabs', 'slider', 'gallery', 'map', 'number_counter', 'circle_counter', 'bar_counters', 'testimonial', 'team_member', 'pricing_tables', 'portfolio', 'blog', 'countdown_timer', 'audio', 'social_media_follow', 'search', 'sidebar', 'menu', 'fullwidth_menu', 'login', 'signup', 'icon', 'lottie', 'post_title'].includes(t) ? 'está en la lista de pendientes del transcriptor (ver README)' : 'tipo desconocido'}` });
      return [];
  }
}
