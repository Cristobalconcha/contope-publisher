/**
 * Estructura de Divi → estructura de ContOpe.
 *
 *   et_pb_section → nodo `section` (o `header` / `footer` si viene del
 *                    constructor de temas de Divi)
 *   et_pb_row     → grupo con rejilla (una columna de rejilla por columna de Divi)
 *   et_pb_column  → grupo en pila
 *   módulo        → ver modulos.mjs
 *
 * Las medidas salen de lo que el navegador pintó a 1440 y a 393 de ancho. El
 * recorrido es el mismo en las dos mediciones (misma página, mismos módulos),
 * así que se emparejan por posición: sección i, fila j, columna k, módulo n.
 * Si los conteos no calzan se avisa y esa parte se transcribe sólo con la
 * medida de escritorio.
 */
import { px, pxs, redondear, lados, esTransparente, colorRegla, leerHtml, textoDe, limpiarTexto } from './util.mjs';
import { reglasMargen, declaracionesCaja, superficieSeccion, reglasTexto } from './estilos.mjs';
import { transcribirModulo, razon, aplicarRellenoPropio } from './modulos.mjs';
import { transcribirCodigo } from './codigo.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { hash } from './util.mjs';

// Hueco hasta el módulo siguiente; para el último de la columna, lo que sobra hasta el
// fondo de la columna (descontado su relleno): Divi deja ahí el aire que el módulo trae
// debajo (p. ej. los 10px de un título).
const hueco = (a, b, col) => {
  if (b) return Math.max(-9999, Math.round(b.caja.y - (a.caja.y + a.caja.h)));
  if (!col) return 0;
  const resto = (col.caja.y + col.caja.h) - (a.caja.y + a.caja.h) - lados(col.estilo.relleno)[2];
  return Math.abs(resto) < 200 ? Math.round(resto) : 0;
};

const margenesVert = (margen) => {
  // "0px 180px -10px" → arriba 0, abajo -10
  const [t, , b] = lados(margen);
  return { t, b };
};

/** Coloca animaciones en los ids de regla de un elemento. */
const conMovimiento = (ctx, anim, ruleIds) => {
  if (!anim) return ruleIds;
  const out = [...ruleIds];
  if (anim.base) {
    const base = ctx.reg.R('motion', anim.base, { prefijo: 'entra' });
    out.push(base);
    for (const bp of ['tablet', 'mobile']) if (anim[bp]) out.push(ctx.reg.R('motion', anim[bp], { bp, base, prefijo: 'entra' }));
  }
  for (const n of anim.notas || []) ctx.avisar({ ...ctx.ubicacionActual, modulo: 'animación', clase: 'et_animated', severidad: 'aproximado', motivo: n });
  return out;
};

function transcribirColumna(ctx, cD, cM, ubic, anchoD, anchoM) {
  const ids = [ctx.reg.R('layout', { mode: 'stack', gap: '0px', align: 'stretch' }, { prefijo: 'col' })];
  const decl = declaracionesCaja(cD.estilo);
  const [t, r, b, l] = lados(cD.estilo.relleno);
  Object.assign(decl, { 'padding-top': pxs(t), 'padding-right': pxs(r), 'padding-bottom': pxs(b), 'padding-left': pxs(l), 'min-width': '0px' });
  const declM = {};
  if (cM) {
    const [t2, r2, b2, l2] = lados(cM.estilo.relleno);
    Object.assign(declM, { 'padding-top': pxs(t2), 'padding-right': pxs(r2), 'padding-bottom': pxs(b2), 'padding-left': pxs(l2) });
  }
  ids.push(...ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'cl' }));
  const hijos = [];
  const mods = cD.modulos || [];
  // Módulos cuyas cajas se pisan en vertical (dos módulos «uno al lado del
  // otro» en una misma columna de Divi): se agrupan en una fila.
  const pisa = (a, b) => a && b && a.caja.h > 0 && b.caja.h > 0 && b.caja.y < a.caja.y + Math.min(a.caja.h, b.caja.h) * 0.5;
  const enFila = new Set(); const racimos = [];
  for (let i = 0; i < mods.length - 1; i++) if (pisa(mods[i], mods[i + 1])) { enFila.add(i); enFila.add(i + 1); }
  let racimo = null;
  const racimoDe = {};
  mods.forEach((m0, i) => { if (enFila.has(i)) { if (!racimo || !enFila.has(i - 1) || !pisa(mods[i - 1], m0)) { racimo = { idx: [] }; racimos.push(racimo); } racimo.idx.push(i); racimoDe[i] = racimo; } else racimo = null; });
  const nodosRacimo = new Map();
  mods.forEach((mD, i) => {
    const mM = cM?.modulos?.[i] && cM.modulos[i].tipo === mD.tipo ? cM.modulos[i] : null;
    if (cM && !mM) ctx.avisar({ ...ubic, modulo: mD.tipo, clase: 'estructura', severidad: 'aproximado', motivo: 'el módulo no calza entre 1440 y 393 de ancho: se transcribe sólo con la medida de escritorio' });
    const u = { ...ubic, modulo: mD.tipo, indiceModulo: i };
    ctx.ubicacionActual = u;
    const anim = ctx.animacion('modulo');
    const rac = racimoDe[i]; const ultimoRac = rac && rac.idx[rac.idx.length - 1] === i;
    const info = { gapD: rac && !ultimoRac ? 0 : hueco(mD, mods[i + 1], cD), gapM: rac && !ultimoRac ? 0 : (mM ? hueco(mM, cM.modulos[i + 1], cM) : undefined), col: { d: cD.caja, m: cM?.caja }, ubicacion: u };
    if (info.gapM === undefined) info.gapM = info.gapD;
    if (!mD.visible && mD.tipo !== 'code') {
      ctx.avisar({ ...u, modulo: mD.tipo, clase: 'oculto', severidad: 'aproximado', motivo: 'módulo no visible a 1440: se omite' });
      return;
    }
    if (i === 0 && !['code', 'fullwidth_code'].includes(mD.tipo)) {
      const topD = cD.caja.y + lados(cD.estilo.relleno)[0];
      const topM = cM ? cM.caja.y + lados(cM.estilo.relleno)[0] : null;
      const offD = Math.round(mD.caja.y - topD);
      const offM = mM && topM !== null ? Math.round(mM.caja.y - topM) : offD;
      if (Math.abs(offD) > 1 || Math.abs(offM) > 1) {
        ctx.reg.inicioPendiente = { d: offD, m: offM };
        ctx.avisar({ ...u, modulo: mD.tipo, clase: 'desfase', severidad: 'ok', motivo: `el primer módulo de la columna está desfasado ${offD}px (escritorio) / ${offM}px (celular) del borde de su contenido: se aplica como margen superior` });
      }
    }
    const nodos = transcribirModulo(ctx, mD, mM, info);
    ctx.reg.inicioPendiente = null;
    if (!nodos.length) return;
    aplicarRellenoPropio(ctx, mD, mM, nodos, u);
    // Un módulo de texto o título más angosto que su columna (Divi: Sizing → ancho máximo) o corrido de su borde (márgenes propios del
    // módulo: a 768 y 393 el título de Contactos tiene 30px a cada lado). Se mide A CADA ANCHO por separado: puede ser llena en
    // escritorio y angosta en celular (o al revés).
    if (['text', 'heading'].includes(mD.tipo)) {
      const colocar = (mod, col) => {
        if (!mod || !col) return null;
        const [, rr, , ll] = lados(col.estilo.relleno);
        const interior = col.caja.w - rr - ll;
        const off = mod.caja.x - (col.caja.x + ll);
        if (mod.caja.w >= interior - 4 && Math.abs(off) <= 2) return null;
        // Sin ancho máximo propio (anchoMaximo «none»): el módulo es más angosto porque Divi le puso MÁRGENES (a 768 y 393 el título de Contactos
        // tiene 30px a cada lado) y su caja se estira hasta ellos. Se escriben esos márgenes, no un ancho: «auto» lo encogería a su texto.
        if (mod.estiloCaja && mod.estiloCaja.anchoMaximo === 'none') {
          const fin = Math.max(0, Math.round(interior - off - mod.caja.w));
          if (off > 2 || fin > 2) return { 'margin-inline-start': pxs(Math.max(0, off)), 'margin-inline-end': pxs(fin) };
        }
        const centrado = Math.abs(off - (interior - mod.caja.w) / 2) < 3;
        return { 'max-width': pxs(mod.caja.w), ...(centrado ? { 'margin-inline-start': 'auto', 'margin-inline-end': 'auto' } : (off > 2 ? { 'margin-inline-start': pxs(off) } : {})) };
      };
      const decl = colocar(mD, cD);
      let declM = mM && cM ? colocar(mM, cM) : null;
      // Angosto en escritorio y lleno en celular: se deshace lo de escritorio.
      if (decl && !declM && mM && cM) declM = Object.fromEntries(Object.keys(decl).map((k) => [k, k === 'max-width' ? 'none' : '0px']));
      if (decl || declM) for (const n of nodos) n.ruleIds = [...(n.ruleIds || []), ...ctx.reg.propiedades(decl || {}, { mobile: declM || {} }, { prefijo: 'anch' })];
    }
    if (rac) {
      (rac.partes ||= []).push({ x: mD.caja.x, nodos });  // el orden visual (por su posición a escritorio), no el del código: Divi los pisa y los acomoda de lado
      if (ultimoRac) {
        const primero = mods[rac.idx[0]]; const ultimo = mods[i];
        const derecha = (ultimo.caja.x + ultimo.caja.w) >= cD.caja.x + cD.caja.w - 2 && ultimo.caja.w < cD.caja.w - 4;
        const enFilaM = rac.idx.every((k, j2) => j2 === 0 || !cM?.modulos?.[k] || !pisa(cM.modulos[rac.idx[j2 - 1]], cM.modulos[k]));
        const declR = { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '20px', 'justify-content': derecha ? 'flex-end' : 'flex-start' };
        const declRM = cM && enFilaM ? { 'flex-direction': 'column', 'align-items': derecha ? 'flex-end' : 'flex-start', gap: '0px' } : {};
        ctx.avisar({ ...u, modulo: 'columna', clase: 'módulos superpuestos', severidad: 'aproximado', motivo: `${rac.idx.length} módulos con cajas que se pisan (lado a lado en el original): se agrupan en una fila con separación de 20px (inferida)` });
        hijos.push(ctx.nodo('group', [...ctx.reg.propiedades(declR, { mobile: declRM }, { prefijo: 'racimo' })], undefined, rac.partes.slice().sort((a, b) => a.x - b.x).flatMap((p) => p.nodos)));
      }
      return;
    }
    if (anim) {
      if (nodos.length === 1) nodos[0].ruleIds = conMovimiento(ctx, anim, nodos[0].ruleIds || []);
      else hijos.push(ctx.nodo('group', conMovimiento(ctx, anim, []), undefined, nodos));
      if (nodos.length === 1) hijos.push(nodos[0]);
    } else hijos.push(...nodos);
  });
  const grupo = ctx.nodo('group', conMovimiento(ctx, ctx.animacion('columna'), ids), undefined, hijos);
  return grupo;
}

function transcribirFila(ctx, fD, fM, ubic, vw) {
  const anim = ctx.animacion('fila');
  const cols = fD.columnas || [];
  if (!cols.length && fD.modulo) {
    const nodos = transcribirModulo(ctx, fD.modulo, fM?.modulo || null, { gapD: 0, gapM: 0, col: { d: fD.caja, m: fM?.caja }, ubicacion: { ...ubic, modulo: fD.modulo.tipo } });
    return nodos;
  }
  const todasVacias = cols.every((c) => !(c.modulos || []).length);
  if (todasVacias && (fD.caja.h || 0) <= 2) {
    ctx.avisar({ ...ubic, modulo: 'fila', clase: 'vacía', severidad: 'ok', motivo: 'fila vacía (sin módulos y de alto ~0): se omite' });
    return [];
  }
  ctx.fondoFila = esTransparente(fD.estilo.fondo) ? null : colorRegla(fD.estilo.fondo);
  const decl = declaracionesCaja(fD.estilo);
  const declM = {};
  const rD = fD.caja.w / vw.d; const rM = fM ? fM.caja.w / vw.m : rD;
  if (rD >= 0.99 && rM >= 0.99) decl.width = '100%';
  else { decl.width = `${Math.round(rM * 100)}%`; if (fD.caja.w < rM * vw.d - 1) decl['max-width'] = pxs(fD.caja.w); }
  decl['margin-inline-start'] = 'auto'; decl['margin-inline-end'] = 'auto';
  const [t, r, b, l] = lados(fD.estilo.relleno);
  Object.assign(decl, { 'padding-top': pxs(t), 'padding-right': pxs(r), 'padding-bottom': pxs(b), 'padding-left': pxs(l) });
  const mv = margenesVert(fD.estilo.margen);
  decl['margin-block-start'] = pxs(mv.t); decl['margin-block-end'] = pxs(mv.b);
  if (fM) {
    const [t2, r2, b2, l2] = lados(fM.estilo.relleno);
    Object.assign(declM, { 'padding-top': pxs(t2), 'padding-right': pxs(r2), 'padding-bottom': pxs(b2), 'padding-left': pxs(l2) });
    const mv2 = margenesVert(fM.estilo.margen);
    declM['margin-block-start'] = pxs(mv2.t); declM['margin-block-end'] = pxs(mv2.b);
  }
  if (cols.length > 1) {
    const gutter = Math.max(0, ...cols.map((c) => lados(c.estilo.margen)[1]));
    decl.display = 'grid';
    decl['grid-template-columns'] = cols.map((c) => `minmax(0, ${c.caja.w}fr)`).join(' ');
    decl['column-gap'] = pxs(gutter);
    decl['align-items'] = /equal_columns/.test(fD.clase || '') ? 'stretch' : 'start';
    const colsM = fM?.columnas || [];
    // ¿Las columnas quedan una bajo otra a este ancho? Divi las apila bajo 981px, pero no siempre (columnas
    // que se mantienen): se lee de la medición, no se supone. Sin medición, apiladas.
    const lado = colsM.length > 1 && colsM[1].caja.y < colsM[0].caja.y + Math.max(1, colsM[0].caja.h) * 0.5;
    if (lado) {
      declM['grid-template-columns'] = colsM.map((c) => `minmax(0, ${c.caja.w}fr)`).join(' ');
      const sepX = Math.max(0, Math.round(colsM[1].caja.x - (colsM[0].caja.x + colsM[0].caja.w)));
      declM['column-gap'] = pxs(sepX);
    } else {
      declM['grid-template-columns'] = 'minmax(0, 1fr)';
      declM['column-gap'] = '0px';
      const sep = colsM.length > 1 ? Math.max(0, Math.round(colsM[1].caja.y - (colsM[0].caja.y + colsM[0].caja.h))) : 0;
      declM['row-gap'] = pxs(sep);
    }
  }
  const reglas = ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'fila' });
  const hijos = cols.map((cD, i) => {
    const cM = fM?.columnas?.[i] || null;
    const u = { ...ubic, columna: i };
    ctx.ubicacionActual = u;
    return transcribirColumna(ctx, cD, cM, u, fD.caja.w, fM?.caja.w);
  });
  return [ctx.nodo('group', conMovimiento(ctx, anim, reglas), undefined, hijos)];
}

export function transcribirSeccion(ctx, sD, sM, indice, vw) {
  const region = sD.region;
  const ubic = { pagina: ctx.pagina, region, seccion: indice };
  ctx.ubicacionActual = ubic;
  const anim = ctx.animacion('seccion');
  ctx.fondoSeccion = esTransparente(sD.fondo) ? null : colorRegla(sD.fondo);
  ctx.fondoFila = null;
  const kind = region === 'encabezado' ? 'header' : region === 'pie' ? 'footer' : 'section';
  if (sD.tipo === 'especialidad') ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_section_specialty', severidad: 'aproximado', motivo: 'sección de especialidad (columnas con filas anidadas): se transcribe como sección normal; revisar a mano' });
  if (sD.paralaje) ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_parallax_bg', severidad: 'sin-transcribir', motivo: 'fondo con paralaje: ContOpe no tiene equivalente; queda fijo' });
  const ids = [];
  if (sD.pegajosa) {
    if (region === 'encabezado') {
      ids.push(ctx.reg.R('posicion', { modo: 'pegada', arriba: '0px', capa: 100 }, { prefijo: 'pegada' }));
      ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_pb_sticky_module', severidad: 'ok', motivo: 'encabezado pegajoso en Divi → regla «posicion» pegada arriba' });
    } else ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_pb_sticky_module', severidad: 'aproximado', motivo: 'sección pegajosa fuera del encabezado: no se transcribe (revisar con la regla «posicion»)' });
  }
  // Divisores de sección: Divi los pinta con un SVG en línea (data:). Se guarda
  // como archivo del sitio y se usa con la regla «divisor».
  for (let k = 0; k < (sD.divisores || []).length; k++) {
    const dv = sD.divisores[k];
    const dvM = sM?.divisores?.[k];
    const m = String(dv.fondo || '').match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/);
    if (!m || !ctx.perfil.carpetaUploads) { ctx.avisar({ ...ubic, modulo: 'sección', clase: dv.clases, severidad: 'sin-transcribir', motivo: 'divisor de sección sin SVG en línea o sin carpeta de medios en el perfil' }); continue; }
    const svg = Buffer.from(m[1], 'base64').toString('utf8');
    const relleno = (svg.match(/fill="(#[0-9a-fA-F]{3,8})"/) || [])[1] || '#000000';
    const nombre = 'divisor-' + hash(svg, 8) + '.svg';
    mkdirSync(path.join(ctx.perfil.carpetaUploads, 'divisores'), { recursive: true });
    writeFileSync(path.join(ctx.perfil.carpetaUploads, 'divisores', nombre), svg);
    const forma = '/wp-content/uploads/divisores/' + nombre;
    const valor = { forma, donde: dv.cual === 'arriba' ? 'arriba' : 'abajo', alto: dv.alto, color: relleno.length === 4 ? '#' + [...relleno.slice(1)].map((c) => c + c).join('') : relleno, reserva: false };
    const proporcional = dvM && Math.abs(px(dvM.alto) / vw.m - px(dv.alto) / vw.d) < 0.002;
    if (proporcional) valor.alto = redondear(px(dv.alto) / vw.d * 100, 2) + 'vw';
    else if (dvM && dvM.alto !== dv.alto) ctx.avisar({ ...ubic, modulo: 'sección', clase: dv.clases, severidad: 'aproximado', motivo: 'el alto del divisor cambia por ancho sin ser proporcional: sólo escritorio (una sección no admite dos reglas divisor)' });
    ids.push(ctx.reg.R('divisor', valor, { prefijo: 'div' }));
    ctx.avisar({ ...ubic, modulo: 'sección', clase: dv.clases, severidad: 'ok', motivo: `divisor ${valor.donde} (${dv.alto}, ${valor.color}) → regla «divisor» con el SVG guardado en ${forma}` });
  }
  const [t, , b] = lados(sD.relleno);
  const decl = { 'padding-top': pxs(t), 'padding-bottom': pxs(b), 'padding-left': '0px', 'padding-right': '0px' };
  const declM = {};
  if (sM) { const [t2, , b2] = lados(sM.relleno); declM['padding-top'] = pxs(t2); declM['padding-bottom'] = pxs(b2); }
  // Alto propio de la sección: si lo medido es MAYOR que lo que ocupan sus filas
  // más el relleno, la sección tiene un alto mínimo (Divi: Sizing → min-height);
  // si es MENOR, un alto fijo que recorta lo que sobra (el encabezado de Basis:
  // 80px con filas de 90).
  const extremo = (sec) => {
    const filas = (sec.filas || []).filter((f2) => (f2.caja.h || 0) > 0 || (f2.columnas || []).some((c) => (c.modulos || []).length));
    if (!filas.length) return null;
    const [, , bPad] = lados(sec.relleno);
    return Math.max(...filas.map((f2) => f2.caja.y + f2.caja.h)) - sec.caja.y + bPad;
  };
  const alto = (sec, d) => {
    const e = extremo(sec);
    if (e === null) return;
    if (sec.caja.h > e + 2) d['min-height'] = pxs(sec.caja.h);
    else if (sec.caja.h < e - 2) { d.height = pxs(sec.caja.h); d['overflow-x'] = 'hidden'; d['overflow-y'] = 'hidden'; }
  };
  alto(sD, decl);
  if (sM) alto(sM, declM);
  ids.push(...ctx.reg.propiedades(decl, { mobile: declM }, { prefijo: 'sec' }));
  // Video de fondo: si el archivo está en el sitio local se usa; si no, se
  // avisa y el fondo queda con la imagen de reemplazo del perfil (si la hay).
  let sinImagen = false;
  let videoFondo = null;
  if (sD.conVideoFondo && sD.videoFondo) {
    const fuente = (sD.videoFondo.fuentes || [])[0];
    const local = fuente && ctx.url(fuente, ubic, { silencioso: true });
    if (!local) {
      const rep = ctx.perfil.reemplazos?.fondos?.[`${ubic.pagina}:${indice}`];
      ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_pb_section_video', severidad: 'faltante', motivo: `video de fondo ${fuente ? fuente.split('/').pop() : ''} no disponible en la descarga${rep ? '; se usa la imagen de reemplazo del perfil' : ''}` });
      if (rep) { sD = { ...sD, urlsFondo: [rep.url], tamanoFondo: rep.tamano || 'cover', posicionFondo: rep.posicion || 'center', repiteFondo: 'no-repeat' }; }
    } else {
      // El video SÍ está en el sitio: va como nodo `video` ambiental (sin controles, en bucle, mudo)
      // detrás del contenido. La sección crea su propio contexto de apilado (isolation) para que el
      // z-index negativo del video quede sobre el fondo de la sección y bajo sus filas.
      videoFondo = { src: local, poster: ctx.url(sD.videoFondo.poster || '', ubic, { silencioso: true }) };
      ids.push(...ctx.reg.propiedades({ position: 'relative', isolation: 'isolate', overflow: 'hidden' }, {}, { prefijo: 'sec-video' }));
      ctx.avisar({ ...ubic, modulo: 'sección', clase: 'et_pb_section_video', severidad: 'ok', motivo: 'video de fondo → nodo `video` ambiental detrás del contenido (cubre la sección)' });
    }
  }
  const sup = superficieSeccion(ctx.reg, sD, { urlLocal: (u) => ctx.url(u, ubic), sinImagen });
  ids.push(...sup.ids);
  for (const n of sup.notas) ctx.avisar({ ...ubic, modulo: 'sección', clase: 'degradado', severidad: n.severidad, motivo: n.motivo });
  avisarTramaYMascara(ctx, sD, ubic);
  const hijos = [];
  (sD.filas || []).forEach((fD, j) => {
    const fM = sM?.filas?.[j] || null;
    if (sM && !fM) ctx.avisar({ ...ubic, fila: j, modulo: 'fila', clase: 'estructura', severidad: 'aproximado', motivo: 'la fila no calza entre 1440 y 393: sólo escritorio' });
    const u = { ...ubic, fila: j };
    ctx.ubicacionActual = u;
    hijos.push(...transcribirFila(ctx, fD, fM, u, vw));
  });
  if (videoFondo) {
    const reglasVideo = ctx.reg.propiedades({ position: 'absolute', 'inset-block-start': '0px', 'inset-inline-start': '0px', width: '100%', height: '100%', 'object-fit': 'cover', 'z-index': '-1', 'pointer-events': 'none' }, {}, { prefijo: 'video-fondo' });
    // El <video> interior se dimensiona con la regla `media` (no con `properties`, que cae sobre el marco):
    // misma proporción que la sección y recorte «cover», como el video de fondo de Divi.
    const rD = razon(sD.caja.w, sD.caja.h);
    const rM = sM ? razon(sM.caja.w, sM.caja.h) : rD;
    reglasVideo.push(...ctx.reg.conAnchos('media', { aspectRatio: rD, fit: 'cover' }, rM !== rD ? { mobile: { aspectRatio: rM, fit: 'cover' } } : {}, { prefijo: 'media-fondo' }));
    hijos.unshift(ctx.nodo('video', reglasVideo, { sourceUrl: videoFondo.src, ...(videoFondo.poster ? { posterUrl: videoFondo.poster } : {}), ambient: true }));
  }
  const nodo = ctx.nodo(kind, conMovimiento(ctx, anim, ids), undefined, hijos);
  if (ctx.perfil.marcadores?.[`${ctx.pagina}:${indice}`]) nodo.marker = ctx.perfil.marcadores[`${ctx.pagina}:${indice}`];
  return nodo;
}

/**
 * Trama y máscara de fondo de Divi (et_pb_background_pattern y et_pb_background_mask).
 * Divi deja el elemento aunque no se use, así que sólo cuenta el que tiene una imagen
 * de verdad. El dibujo de Divi viene incrustado (un SVG dentro del CSS) y no es un
 * recurso de Medios, así que NO se traduce solo: se avisa con el camino exacto, que es
 * elegir una forma del sitio para backgroundPattern o backgroundMask (las mismas del divisor).
 */
function avisarTramaYMascara(ctx, sD, ubic) {
  for (const [clave, nombre, campo] of [['fondoTrama', 'trama', 'backgroundPattern'], ['fondoMascara', 'máscara', 'backgroundMask']]) {
    const e = sD[clave];
    if (!e || !e.imagen || e.imagen === 'none') continue;
    ctx.avisar({
      ...ubic, modulo: 'sección', clase: `et_pb_background_${clave === 'fondoTrama' ? 'pattern' : 'mask'}`, severidad: 'aproximado',
      motivo: `la sección tiene ${nombre} de fondo de Divi (${String(e.imagen).slice(0, 60)}…) sin equivalente automático: componerla con ${campo} eligiendo una forma de Medios y el color ${e.color || ''}`,
    });
  }
}

export function transcribirMedicion(ctx, medD, medM) {
  const vw = { d: medD.ancho, m: medM?.ancho || 393 };
  ctx.medidaD = medD; ctx.medidaM = medM;
  const res = { encabezado: [], contenido: [], pie: [] };
  const hayMovil = medM && medM.secciones.length === medD.secciones.length;
  if (medM && !hayMovil) ctx.avisar({ pagina: ctx.pagina, modulo: 'página', clase: 'estructura', severidad: 'aproximado', motivo: `a 393 de ancho hay ${medM.secciones.length} secciones y a 1440 hay ${medD.secciones.length}: sólo escritorio` });
  medD.secciones.forEach((sD, i) => {
    const sM = hayMovil ? medM.secciones[i] : null;
    res[sD.region].push(transcribirSeccion(ctx, sD, sM, i, vw));
  });
  if (medD.contenidoPlano && !res.contenido.length) {
    ctx.avisar({ pagina: ctx.pagina, modulo: 'página', clase: 'contenido plano', severidad: 'ok', motivo: 'la página no usa el constructor de Divi: su contenido es el del editor de WordPress' });
    res.contenido.push(...transcribirContenidoPlano(ctx, medD, medM));
  }
  return res;
}

/**
 * Páginas que NO usan el constructor de Divi: el contenido es el del editor de
 * WordPress (título + texto) y la barra lateral trae widgets del tema. Se
 * transcribe el título y el contenido; los widgets (buscador, entradas
 * recientes, comentarios) no son contenido de la página y se reportan.
 */
export function transcribirContenidoPlano(ctx, medD, medM) {
  const cp = medD.contenidoPlano;
  const arbol = leerHtml(cp.html || '');
  const buscar = (n, pred, acc = []) => { if (n.texto !== undefined) return acc; if (pred(n)) acc.push(n); n.hijos.forEach((h) => buscar(h, pred, acc)); return acc; };
  const titulo = buscar(arbol, (n) => /entry-title/.test(n.attrs.class || ''))[0];
  const contenido = buscar(arbol, (n) => /entry-content/.test(n.attrs.class || ''))[0];
  const ubic = { pagina: ctx.pagina, region: 'contenido', seccion: 0 };
  const hijos = [];
  if (titulo) {
    const texto = limpiarTexto(textoDe(titulo));
    const eD = (medD.roles || []).find((r) => r.rol === 'contenido:h1' && (r.ejemplos || []).some((e) => texto.startsWith(e.slice(0, 20))));
    const eM = (medM?.roles || []).find((r) => r.rol === 'contenido:h1' && (r.ejemplos || []).some((e) => texto.startsWith(e.slice(0, 20))));
    const reglas = eD ? reglasTexto(ctx.reg, { d: eD, m: eM }) : [];
    reglas.push(...reglasMargen(ctx.reg, 0, 0));
    hijos.push(ctx.nodo('heading', reglas, { text: texto, level: 1 }));
  }
  const textoContenido = contenido ? limpiarTexto(textoDe(contenido)) : '';
  if (textoContenido) ctx.avisar({ ...ubic, modulo: 'contenido plano', clase: 'entry-content', severidad: 'aproximado', motivo: 'el contenido del editor de WordPress (con texto) no se transcribe todavía: sólo el título' });
  const lateral = buscar(arbol, (n) => n.attrs.id === 'sidebar')[0];
  if (lateral) ctx.avisar({ ...ubic, modulo: 'contenido plano', clase: '#sidebar', severidad: 'sin-transcribir', motivo: 'barra lateral del tema de Divi (buscador, entradas recientes, comentarios recientes): son widgets de WordPress, no contenido de la página; se omiten' });
  if (!hijos.length) return [];
  const ids = [...ctx.reg.propiedades({ 'padding-top': '58px', 'padding-bottom': '58px', 'padding-left': '0px', 'padding-right': '0px' }, {}, { prefijo: 'sec' }),
    ...ctx.reg.propiedades({ width: '80%', 'max-width': '1080px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto' }, {}, { prefijo: 'fila' })];
  const caja = ctx.nodo('group', ids.slice(1), undefined, hijos);
  return [ctx.nodo('section', ids.slice(0, 1), undefined, [caja])];
}
