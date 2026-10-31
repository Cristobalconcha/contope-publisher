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
import { svgDeGlifo } from './glifos.mjs';

/* ------------------------------------------------------------------ texto */

// Medidas por omisión de Divi dentro de un módulo de texto, en este orden:
// título → 10px de aire debajo; párrafo → 1em; lista → 23px. El último bloque
// del módulo no lleva aire propio: el hueco con el módulo siguiente se mide.
// La sangría medida de cada lista (escritorio / celular), para sumarle el relleno propio del módulo.
const sangriaDeLista = new WeakMap();

const AIRE_BLOQUE = { h: () => 10, p: (est) => px(est?.tam) || 16, lista: () => 23 };

// Un título de Divi trae 10px de aire propio debajo (padding-bottom) DENTRO de la caja medida:
// si el alto sobra exactamente 10 sobre un número entero de líneas, ese aire va al margen.
const extraAireTitulo = (c, e) => { const l = px(e?.interlineado); if (!c || !l) return 0; const n = (c.h - 10) / l; return Math.abs(n - Math.round(n)) < 0.06 && n >= 0.9 ? 10 : 0; };

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
    const extraU = ultimo && b.tipo === 'h' && bloques.length === 1;
    const finD = ultimo ? gapD + (extraU ? extraAireTitulo(d.caja, eD) : 0) : aire;
    const finM = ultimo ? gapM + (extraU ? extraAireTitulo(m?.caja, eM) : 0) : aire;
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
      // La sangría de cada nivel se LEE del navegador (30-oct: la de Divi no es «1em» de la letra de los ítems, sino
      // la de la lista, que tiene su propio tamaño: 14px en el primer nivel y 20px en las sublistas de Basis).
      const medidas = (med) => (med?.listas || []).filter((l) => l.etiqueta === (b.ordenada ? 'ol' : 'ul'));
      const lD = medidas(d); const lM = medidas(m);
      const primera = lD.find((l) => l.nivel === 0); const primeraM = lM.find((l) => l.nivel === 0);
      const sangria = primera ? pxs(primera.relleno4[3]) : '1em';
      const sangriaM = primeraM ? pxs(primeraM.relleno4[3]) : sangria;
      const declLista = { 'padding-inline-start': sangria, 'list-style-position': 'outside' };
      if (primera) declLista['padding-block-end'] = pxs(primera.relleno4[2]);
      const declListaM = { 'padding-inline-start': sangriaM };
      if (primeraM) declListaM['padding-block-end'] = pxs(primeraM.relleno4[2]);
      const reglasLista = [...reglas, ...ctx.reg.propiedades(declLista, { mobile: declListaM }, { prefijo: 'lista' })];
      const nodoLista = ctx.nodo('list', reglasLista, { ordered: b.ordenada, items });
      sangriaDeLista.set(nodoLista, { d: sangria, m: sangriaM, finD: primera ? pxs(primera.relleno4[2]) : '0px', finM: primeraM ? pxs(primeraM.relleno4[2]) : (primera ? pxs(primera.relleno4[2]) : '0px') });
      // Sublistas: parte `sublista` del nodo `list` (0.3.84), con la sangría medida de su nivel.
      const subD = lD.find((l) => l.nivel >= 1); const subM = lM.find((l) => l.nivel >= 1);
      if (anidada && subD) {
        const declSub = { 'list-style-type': subD.vineta || 'disc', 'padding-inline-start': pxs(subD.relleno4[3]), 'padding-block-end': pxs(subD.relleno4[2]), 'margin-block-start': pxs(subD.margen4[0]), 'margin-block-end': pxs(subD.margen4[2]) };
        const declSubM = subM ? { 'padding-inline-start': pxs(subM.relleno4[3]), 'padding-block-end': pxs(subM.relleno4[2]) } : {};
        nodoLista.partes = { sublista: ctx.reg.propiedades(declSub, { mobile: declSubM }, { prefijo: 'sublista' }) };
      }
      nodos.push(nodoLista);
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
  reglas.push(...reglasMargen(ctx.reg, (gapD ?? 0) + extraAireTitulo(d.caja, d.estilo), (gapM ?? 0) + extraAireTitulo(m?.caja, m?.estilo)));
  const nivel = Number((d.etiqueta || 'h2')[1]) || 2;
  return [ctx.nodo('heading', reglas, { text: limpiarTexto(d.texto), level: nivel })];
}

/* --------------------------------------------------------------- imagen */

// La regla media sólo acepta p/q de uno o dos dígitos: se busca la fracción más cercana.
export const razon = (w, h) => {
  let mejor = [1, 1], err = Infinity;
  for (let q = 1; q <= 99; q++) { const p = Math.round((w / h) * q); if (p < 1 || p > 99) continue; const e = Math.abs(p / q - w / h); if (e < err - 1e-9) { err = e; mejor = [p, q]; } }
  return mejor[0] + "/" + mejor[1];
};

const radioDeImagen = (ctx, img, zona) => {
  const w = img.caja.w, h = img.caja.h;
  const r = (ctx.medidaD?.radios || []).find((x) => x.zona === zona && x.caja === `${w}x${h}` && x.radio && x.radio !== '0px');
  return r ? r.radio : (img.radio && img.radio !== '0px' ? img.radio : null);
};

// Una imagen con carga diferida (loading=lazy) que no se alcanzó a cargar al medir sale con caja 0×0.
// Su tamaño se recupera de la caja del MÓDULO (alto) y de las dimensiones naturales del archivo.
const imagenConCaja = (img, mod) => {
  if (!img || (img.caja && img.caja.w > 0 && img.caja.h > 0)) return img;
  const [nw, nh] = String(img.natural || '').split('x').map(Number);
  const r = mod?.estiloCaja?.relleno4 || [0, 0, 0, 0];
  const h = (mod?.caja?.h || 0) - r[0] - r[2];
  if (!nw || !nh || h <= 0) return img;
  return { ...img, caja: { x: mod.caja.x + r[3], y: mod.caja.y + r[0], w: Math.round((nw * h) / nh), h }, _reconstruida: true };
};

export function moduloImagen(ctx, d, m, { col, gapD, gapM, ubicacion }) {
  const nodos = [];
  (d.imagenes || []).forEach((img0, i) => {
    const img = imagenConCaja(img0, d);
    const imgM = imagenConCaja(m?.imagenes?.[i], m);
    if (img._reconstruida) ctx.avisar({ ...ubicacion, modulo: 'image', clase: 'carga diferida', severidad: 'aproximado', motivo: 'la imagen no estaba cargada al medir (loading=lazy, caja 0×0): su tamaño se reconstruye con el alto del módulo y las dimensiones naturales del archivo' });
    const url = ctx.url(img.actual || img.src, ubicacion);
    if (!url) return;
    const caja = img.caja; const cajaM = imgM?.caja;
    const fit = img.objectFit && img.objectFit !== 'fill' ? img.objectFit : null;
    const decl = {};
    const declM = {};
    const colW = col?.d?.w || caja.w; const colWM = col?.m?.w || cajaM?.w;
    // Interior real de la columna: sin el relleno propio del módulo (Design → Spacing). A 768 el módulo de Basis tiene 30px a la derecha y
    // la foto queda CENTRADA en lo que sobra, no pegada a la izquierda.
    const padIzq = d.estiloCaja?.relleno4?.[3] || 0; const padDer = d.estiloCaja?.relleno4?.[1] || 0;
    const interiorW = colW - padIzq - padDer;
    const llena = caja.w >= interiorW - 1;
    // Ancho: a todo el ancho de la columna, o el propio de la imagen si es menor.
    // «Llena» = todo el interior de la columna: 100% de la columna menos el relleno propio del módulo (que la foto no usa).
    const llenoDe = (padI, padD) => (padI + padD > 0 ? `calc(100% - ${pxs(padI + padD)})` : '100%');
    // Dónde queda la foto dentro del interior de la columna, a cada ancho: llena (con el relleno propio del módulo a su izquierda), centrada,
    // pegada a la derecha o pegada a la izquierda. Se escribe SIEMPRE el margen de los dos lados para que una variante de otro ancho pueda
    // deshacer lo de escritorio (y no se emite lo que no cambia).
    const colocar = (c, colX, interior, padI, llenaX, padD = padI) => {
      if (llenaX) return { 'margin-inline-start': padI > 0 ? pxs(padI) : '0px', 'margin-inline-end': '0px' };
      const sobra = interior - c.w; const izq = c.x - (colX + padI);
      if (sobra > 2 && Math.abs(izq - sobra / 2) < 3) {
        // Centrada en el INTERIOR de la columna; si el relleno propio del módulo no es simétrico, «auto» la centraría en la columna entera.
        if (padI === padD) return { 'margin-inline-start': 'auto', 'margin-inline-end': 'auto' };
        return { 'margin-inline-start': `calc((100% + ${pxs(padI - padD - c.w)}) / 2)`, 'margin-inline-end': '0px' };
      }
      if (sobra > 2 && izq > sobra - 3) return { 'margin-inline-start': 'auto', 'margin-inline-end': '0px' };
      return { 'margin-inline-start': padI > 0 ? pxs(padI) : '0px', 'margin-inline-end': '0px' };
    };
    if (llena) decl.width = llenoDe(padIzq, padDer); else { decl.width = pxs(caja.w); decl['max-width'] = '100%'; }
    Object.assign(decl, colocar(caja, col?.d?.x ?? caja.x, interiorW, padIzq, llena, padDer));
    decl.height = fit ? 'auto' : 'auto';
    if (cajaM) {
      const padIzqM = m?.estiloCaja?.relleno4?.[3] || 0; const padDerM = m?.estiloCaja?.relleno4?.[1] || 0;
      const interiorWM = (colWM || cajaM.w) - padIzqM - padDerM;
      const llenaM = cajaM.w >= interiorWM - 1;
      declM.width = llenaM ? llenoDe(padIzqM, padDerM) : pxs(cajaM.w);
      if (!llenaM) declM['max-width'] = '100%';
      Object.assign(declM, colocar(cajaM, col?.m?.x ?? cajaM.x, interiorWM, padIzqM, llenaM, padDerM));
    }
    const reglas = [...ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'img' })];
    const aspecto = (c) => razon(c.w, c.h);
    if (fit) {
      const vD = { aspectRatio: aspecto(caja), fit };
      const camb = cajaM ? { mobile: { aspectRatio: aspecto(cajaM), fit } } : {};
      if (camb.mobile && camb.mobile.aspectRatio === vD.aspectRatio) delete camb.mobile;
      reglas.push(...ctx.reg.conAnchos('media', vD, camb, { prefijo: 'media' }));
    }
    // La ubicación trae la REGIÓN (contenido, encabezado, pie): es la misma «zona» con que la medición anota los radios.
    const radio = radioDeImagen(ctx, img, ubicacion.zona || ubicacion.region);
    if (radio) reglas.push(ctx.reg.R('properties', { declarations: { 'border-radius': radio, overflow: 'hidden' } }, { prefijo: 'rad' }));
    // El relleno propio del módulo (Design → Spacing) deja a la imagen adentro de su caja: arriba y abajo
    // se vuelven márgenes de la imagen (la caja externa del módulo no cambia).
    const topD = Math.max(0, Math.round(caja.y - d.caja.y)); const botD = Math.max(0, Math.round((d.caja.y + d.caja.h) - (caja.y + caja.h)));
    const topM = cajaM ? Math.max(0, Math.round(cajaM.y - m.caja.y)) : topD; const botM = cajaM ? Math.max(0, Math.round((m.caja.y + m.caja.h) - (cajaM.y + cajaM.h))) : botD;
    if (topD > 1 || topM > 1) { const p = ctx.reg.inicioPendiente; ctx.reg.inicioPendiente = { d: (p?.d || 0) + topD, m: (p?.m ?? p?.d ?? 0) + topM }; }
    reglas.push(...reglasMargen(ctx.reg, (gapD ?? 0) + botD, (gapM ?? 0) + botM));
    let nodo = ctx.nodo('image', reglas, { assetUrl: url, alt: img.alt || '' });
    const enlace = img.enlace && ctx.destino(img.enlace);
    if (enlace) {
      const reglasEnl = [...ctx.reg.propiedades({ display: 'block', width: decl.width === '100%' ? '100%' : pxs(caja.w), 'max-width': '100%' }, {}, { prefijo: 'enl' })];
      // El margen de la imagen pasa al ENLACE que la envuelve; la imagen queda con margen cero explícito (sin él, el <figure> trae el margen de
      // abajo de la hoja base y el enlace salía 14 px más alto que el módulo: el logo del encabezado a 393 y 768).
      nodo.ruleIds = [...nodo.ruleIds.filter((r) => !r.startsWith('mg-')), ...ctx.reg.propiedades({ 'margin-block-start': '0px', 'margin-block-end': '0px' }, {}, { prefijo: 'mg-img' })];
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
  let iconoNodo = null;
  if (d.icono && d.icono.glifo) {
    const cp = d.icono.glifo.codePointAt(0).toString(16);
    const nombre = GLIFOS[cp];
    const tam = px(d.icono.tam) || 40;
    // 1.º: el glifo REAL de la fuente del original, como SVG de Medios (el ícono es el mismo, relleno y todo).
    const real = svgDeGlifo(ctx, d.icono.familia, cp, tam);
    if (real) {
      const lado = Math.round(real.lado * real.escala * 100) / 100;       // caja cuadrada del SVG, en px
      const anchoNodo = Math.round(real.ancho * real.escala * 100) / 100;  // lo que ocupaba el glifo en la línea
      iconoNodo = ctx.nodo('paragraph', [
        ctx.reg.R('icono', { forma: real.forma, donde: 'antes', tamano: pxs(lado), color: colorRegla(d.icono.color), separacion: '0px' }, { prefijo: 'ico' }),
        ...ctx.reg.propiedades({ 'margin-block-start': '0px', 'margin-block-end': '0px', width: pxs(anchoNodo), height: pxs(tam), display: 'flex', 'align-items': 'center', 'justify-content': 'center', 'flex-shrink': '0', 'line-height': pxs(tam) }, {}, { prefijo: 'ico-caja' }),
      ], { text: ' ' });
      ctx.avisar({ ...ubicacion, modulo: 'blurb', clase: `${d.icono.familia} U+${cp}`, severidad: 'ok', motivo: `ícono ${d.icono.familia} U+${cp} → SVG del glifo original (${real.forma.split('/').pop()}) con la regla «icono»` });
    } else if (nombre) {
      (ctx.ajustes.iconos ||= []).includes(nombre) || ctx.ajustes.iconos.push(nombre);
      // El ícono de Divi va a la IZQUIERDA y el título y la descripción juntos a su derecha
      // (blurb_position_left). El ícono es un nodo aparte con la regla `icono`.
      iconoNodo = ctx.nodo('paragraph', [
        ctx.reg.R('icono', { nombre, donde: 'antes', tamano: pxs(tam), color: colorRegla(d.icono.color), separacion: '0px' }, { prefijo: 'ico' }),
        ...ctx.reg.propiedades({ 'margin-block-start': '0px', 'margin-block-end': '0px', width: pxs(tam), 'flex-shrink': '0', 'line-height': pxs(tam) }, {}, { prefijo: 'ico-caja' }),
      ], { text: ' ' });
      ctx.avisar({ ...ubicacion, modulo: 'blurb', clase: `${d.icono.familia} U+${cp}`, severidad: 'aproximado', motivo: `ícono ${d.icono.familia} U+${cp} → Material Symbols «${nombre}» (contorno; el original era relleno: Material no trae el estilo relleno en el set del sitio)` });
    } else {
      ctx.avisar({ ...ubicacion, modulo: 'blurb', clase: `glifo ${d.icono.familia} U+${cp}`, severidad: 'sin-transcribir', motivo: `ícono ${d.icono.familia} U+${cp} sin equivalente en la tabla de Material Symbols: el blurb queda sin ícono` });
    }
  }
  const imgs = (d.imagenes || []);
  if (imgs.length) {
    const url = ctx.url(imgs[0].actual || imgs[0].src, ubicacion);
    if (url) nodos.push(ctx.nodo('image', [...ctx.reg.propiedades({ width: pxs(imgs[0].caja.w), 'max-width': '100%' }, {}, { prefijo: 'img' }), ...reglasMargen(ctx.reg, 10, 10)], { assetUrl: url, alt: imgs[0].alt || '' }));
  }
  const textos = [];
  if (titulo) {
    reglasT.push(...reglasMargen(ctx.reg, d.descripcion ? 10 : 0, d.descripcion ? 10 : 0));
    textos.push(ctx.nodo('heading', reglasT, { text: titulo, level: Number((d.etiqueta || 'h4')[1]) || 4 }));
  }
  if (d.descripcion) {
    const reglasP = d.estiloDescripcion ? reglasTexto(ctx.reg, { d: d.estiloDescripcion, m: m?.estiloDescripcion }) : [];
    reglasP.push(...reglasMargen(ctx.reg, 0, 0));
    textos.push(ctx.nodo('paragraph', reglasP, { text: limpiarTexto(d.descripcion) }));
  }
  const contenedor = iconoNodo
    // 15px: el relleno izquierdo que Divi le da al contenedor del texto de un blurb con ícono a la izquierda (medido).
    ? ctx.nodo('group', [...ctx.reg.propiedades({ display: 'flex', 'align-items': 'flex-start', gap: '15px', ...reglasMargenDecl(gapD) }, { mobile: reglasMargenDecl(gapM, true) }, { prefijo: 'blurb' })], undefined, [iconoNodo,
      ctx.nodo('group', [ctx.reg.R('layout', { mode: 'stack', gap: '0px', align: 'stretch' }, { prefijo: 'col' }), ...ctx.reg.propiedades({ 'min-width': '0px', 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0px' }, {}, { prefijo: 'blurb-t' })], undefined, textos)])
    : null;
  if (contenedor) nodos.push(contenedor);
  else {
    // sin ícono: el último texto lleva el hueco con el módulo siguiente
    const ult = textos[textos.length - 1];
    if (ult) ult.ruleIds = [...ult.ruleIds.filter((r) => !r.startsWith('mg-')), ...reglasMargen(ctx.reg, gapD, gapM)];
    nodos.push(...textos);
  }
  return nodos;
}

const reglasMargenDecl = (fin, soloM = false) => (fin === undefined ? {} : { 'margin-block-start': '0px', 'margin-block-end': pxs(fin) });

/* ----------------------------------------------------------- promo / cta */

export function moduloPromo(ctx, d, m, { gapD, gapM, ubicacion }) {
  const hijos = [];
  const reglasT = reglasTexto(ctx.reg, { d: d.estiloTitulo, m: m?.estiloTitulo });
  reglasT.push(...reglasMargen(ctx.reg, 10, 10));
  hijos.push(ctx.nodo('heading', reglasT, { text: d.titulo, level: Number((d.etiqueta || 'h2')[1]) || 2 }));
  // El estilo del párrafo se mide EN el párrafo (30-oct: la medición sólo traía el del contenedor, de otro tamaño y color, y el
  // respaldo por texto no encontraba una descripción que arranca después del título).
  const rolDesc = d.estiloDescripcion || estiloPorTexto(ctx.medidaD, d.descripcion || '');
  const rolDescM = m?.estiloDescripcion || estiloPorTexto(ctx.medidaM, d.descripcion || '');
  if (d.descripcion) {
    const reglasP = rolDesc ? reglasTexto(ctx.reg, { d: rolDesc, m: rolDescM }) : [];
    // El aire entre el párrafo y el botón es el relleno inferior que Divi le da a la descripción (medido: 20px), no un valor inventado.
    reglasP.push(...reglasMargen(ctx.reg, d.estiloInterior?.relleno4?.[2] ?? 30, m?.estiloInterior?.relleno4?.[2] ?? d.estiloInterior?.relleno4?.[2] ?? 30));
    hijos.push(ctx.nodo('paragraph', reglasP, { text: limpiarTexto(d.descripcion) }));
  }
  if (d.boton) hijos.push(...moduloBoton(ctx, { boton: d.boton, alineacion: 'et_pb_button_alignment_center' }, m ? { boton: m.boton } : null, { gapD: 0, gapM: 0, ubicacion }));
  const caja = declaracionesCaja(d.cajaPromo);
  const [t, r, b, l] = lados(d.cajaPromo?.relleno);
  Object.assign(caja, { 'padding-top': pxs(t), 'padding-right': pxs(r), 'padding-bottom': pxs(b), 'padding-left': pxs(l), 'text-align': 'center', 'min-height': pxs(d.caja.h) });
  const cajaM = m?.cajaPromo ? (() => { const [t2, r2, b2, l2] = lados(m.cajaPromo.relleno); return { 'padding-top': pxs(t2), 'padding-right': pxs(r2), 'padding-bottom': pxs(b2), 'padding-left': pxs(l2), 'min-height': pxs(m.caja.h) }; })() : {};
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
  const forma = f?.forma || null;
  const tema = {
    texto: '#112337', textoSuave: '#585E6A', fondo: '#FFFFFF', superficie: '#FFFFFF', superficieAlt: '#F4F4F4', borde: '#D6D6D6', bordeFuerte: '#999999',
    principal: enviar ? colorRegla(enviar.fondo) : '#F26621', principalHover: enviar ? colorRegla(enviar.fondo) : '#F26621', principalContraste: enviar ? colorRegla(enviar.color) : '#FFFFFF',
    tipografia: `'${(enviar?.familia) || 'Open Sans'}', sans-serif`, radio: enviar?.radio || '4px', espaciado: '16px',
  };
  if (forma?.entrada) {
    // El contrato ampliado de Orugantt Forms (30-oct): lo que el original MIDE en sus campos, etiquetas y botón. El formulario
    // queda sobre el panel de la columna (fondo transparente) y sus campos blancos, como en Gravity Forms.
    const e = forma.entrada;
    const px0 = (v) => (v === undefined || v === null ? undefined : pxs(typeof v === 'number' ? v : px(v)));
    Object.assign(tema, {
      fondo: 'transparent', campoFondo: colorRegla(e.fondo), campoTexto: colorRegla(e.color), campoTamano: e.tam,
      campoBordeAncho: e.bordeAncho, campoRellenoY: px0(e.relleno4[0]), campoRellenoX: px0(e.relleno4[1]),
      radio: e.radio, borde: colorRegla(e.bordeColor),
    });
    if (e.sombra && e.sombra !== 'none') tema.sombra = e.sombra;
    const g = forma.etiquetaGrupo; const sub = forma.subetiqueta;
    if (g) Object.assign(tema, { etiquetaTamano: g.tam, etiquetaPeso: String(Math.round(Number(g.peso) / 100) * 100), etiquetaColor: colorRegla(g.color), texto: colorRegla(g.color) });
    if (sub) Object.assign(tema, { subetiquetaTamano: sub.tam, subetiquetaPeso: String(Math.round(Number(sub.peso) / 100) * 100), subetiquetaColor: colorRegla(sub.color), textoSuave: colorRegla(sub.color) });
    if (forma.ayuda) tema.ayudaTamano = forma.ayuda.tam;
    if (forma.contador) tema.contadorTamano = forma.contador.tam;
    if (forma.ayuda) tema.ayudaInterlineado = String(Math.round((px(forma.ayuda.interlineado) / px(forma.ayuda.tam)) * 100) / 100);
    if (forma.consentimiento) Object.assign(tema, { opcionTamano: forma.consentimiento.tam, opcionInterlineado: String(Math.round((px(forma.consentimiento.interlineado) / px(forma.consentimiento.tam)) * 100) / 100), opcionPeso: String(Math.round(Number(forma.consentimiento.peso) / 100) * 100), opcionColor: colorRegla(forma.consentimiento.color) });
    if (enviar && enviar.sombra && enviar.sombra !== 'none') tema.botonSombra = enviar.sombra;
    // Interlineado y peso de la letra del formulario entero (Gravity: 1.7 y 400 sobre la tipografía del sitio).
    const lh = px(e.interlineado) / px(e.tam);
    if (lh) tema.interlineado = String(Math.round(lh * 100) / 100);
    tema.peso = String(Math.round(Number(e.peso) / 100) * 100);
    // Segunda parte del contrato (30-oct): los rellenos, márgenes y separaciones entre las partes del formulario y la casilla propia,
    // medidos en vivo (descarga/medir-formulario.mjs). Gravity pone el espacio como relleno y margen de cada parte; el runtime lo
    // expresa igual, así que la separación automática entre ayuda, cuadro y contador (controlSeparacion) queda en cero.
    const x = forma.extra;
    if (x) {
      const aMs = (v) => (Number.isFinite(Number(v)) ? pxs(Number(v)) : undefined);
      const poner = (o) => { for (const [k, v] of Object.entries(o)) if (v !== undefined) tema[k] = v; };
      poner({
        grupoTituloSeparacion: aMs(x.grupoTituloSeparacion), etiquetaSeparacion: aMs(x.etiquetaSeparacion), etiquetaRellenoSuperior: aMs(x.etiquetaRellenoSuperior),
        opcionEtiquetaRellenoSuperior: aMs(x.opcionEtiquetaRellenoSuperior), controlSeparacion: '0px',
        ayudaRellenoY: forma.ayuda ? aMs(forma.ayuda.relleno4[0]) : undefined, ayudaSeparacion: aMs(x.ayudaSeparacion),
        contadorRellenoY: forma.contador ? aMs(forma.contador.relleno4[0]) : undefined, contadorSeparacion: aMs(x.contadorSeparacion),
        contadorInterlineado: forma.contador ? String(Math.round((px(forma.contador.interlineado) / px(forma.contador.tam)) * 100) / 100) : undefined,
        contadorAlineacion: x.contadorAlinea === 'right' || x.contadorAlinea === 'end' ? 'right' : x.contadorAlinea === 'center' ? 'center' : 'left',
        pieRellenoY: forma.pie ? aMs(forma.pie.relleno4[0]) : undefined, pieSeparacion: aMs(x.pieMargenSuperior),
        rejillaSeparacion: aMs(x.rejillaSeparacion), rejillaFilaSeparacion: aMs(x.rejillaFilaSeparacion), rejillaSubSeparacion: aMs(x.rejillaSubSeparacion), opcionesRellenoY: aMs(x.opcionesRellenoY),
      });
      const c = x.casilla;
      if (c) poner({
        casillaApariencia: 'none', casillaTamano: aMs(c.tamano), casillaFondo: colorRegla(c.fondo), casillaMargenSuperior: '0px', casillaMargenLateral: '0px',
        casillaMarca: x.casillaMarca?.color ? colorRegla(x.casillaMarca.color) : undefined,
        opcionSangria: aMs(x.opcionSangria), opcionSeparacion: aMs(c.relleno - c.tamano - c.izquierda), opcionAlineacion: c.centrada ? 'center' : 'flex-start',
      });
    }
    if (enviar) Object.assign(tema, { botonAncho: enviar.ancho >= (f.forma.entrada.ancho * 2) ? '100%' : pxs(enviar.ancho), botonTamano: enviar.tam, botonPeso: String(Math.round(Number(enviar.peso) / 100) * 100), botonRellenoY: pxs(enviar.relleno4[0]), botonRellenoX: pxs(enviar.relleno4[1]), botonRadio: enviar.radio });
  }
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

/* ------------------------------------------- relleno propio de cada módulo */

/**
 * El relleno (padding) propio de un módulo de Divi —Design → Spacing— ya está DENTRO de la caja medida y
 * decide dónde empieza su contenido. Se reparte entre los nodos que salieron del módulo: los lados
 * izquierdo y derecho en todos, el de arriba en el primero y el de abajo en el último. Así los márgenes
 * entre módulos (medidos de las cajas externas) no cambian.
 * Sólo para módulos cuyo contenido son nodos de texto o de bloque (texto, título, blurb).
 */
export function aplicarRellenoPropio(ctx, mD, mM, nodos, ubicacion) {
  const leer = (mod) => (mod?.estiloCaja?.relleno4 || null);
  const rD = leer(mD);
  if (!rD || !nodos.length) return;
  if (!['text', 'heading', 'blurb'].includes(mD.tipo)) return;
  const rM = leer(mM) || rD;
  if (rD.every((v) => v < 0.5) && rM.every((v) => v < 0.5)) return;
  const decl = (r, i, n, lista, bp) => {
    const d = { 'padding-right': pxs(r[1]) };
    if (lista) d['padding-inline-start'] = `calc(${sangriaDeLista.get(lista)?.[bp] || '1em'} + ${pxs(r[3])})`; else d['padding-left'] = pxs(r[3]);
    if (i === 0) d['padding-top'] = pxs(r[0]);
    // El relleno de abajo del módulo se SUMA al de la propia lista (Divi: la lista trae 14 px abajo y el módulo 30 más): son la misma propiedad
    // (padding-block-end y padding-bottom), así que una escrita después pisaba a la otra y la lista salía 14 px más corta.
    if (i === n - 1) { if (lista) d['padding-block-end'] = `calc(${sangriaDeLista.get(lista)?.[bp === 'm' ? 'finM' : 'finD'] || '0px'} + ${pxs(r[2])})`; else d['padding-bottom'] = pxs(r[2]); }
    return d;
  };
  nodos.forEach((nodo, i) => {
    const lista = nodo.kind === 'list' ? nodo : null;
    nodo.ruleIds = [...(nodo.ruleIds || []), ...ctx.reg.propiedades(decl(rD, i, nodos.length, lista, 'd'), { mobile: decl(rM, i, nodos.length, lista, 'm') }, { prefijo: 'relmod' })];
  });
  ctx.avisar({ ...ubicacion, modulo: mD.tipo, clase: 'relleno del módulo', severidad: 'ok', motivo: `relleno propio del módulo (arriba ${rD[0]}, derecha ${rD[1]}, abajo ${rD[2]}, izquierda ${rD[3]} px a 1440) aplicado a sus nodos` });
}
