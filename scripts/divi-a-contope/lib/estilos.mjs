/**
 * Traduce estilos computados (lo que midió el navegador) a reglas de diseño.
 *
 * Cada función recibe el estilo de ESCRITORIO y el de CELULAR (y opcionalmente
 * el de tablet) y devuelve una lista de ids de regla: la base y, sólo si el
 * valor cambia, su variante por ancho. Nada se escribe como CSS suelto.
 */
import { px, pxs, lados, hex, colorRegla, esTransparente, leerColor, sinComillas, alineacion, redondear } from './util.mjs';
import { capasDeFondo, traducirDegradado } from './fondos.mjs';

const SERIF = /^(bodoni|georgia|times|playfair|lora|merriweather|garamond|libre baskerville|cormorant|dm serif|pt serif|source serif|crimson)/i;
const MONO = /^(courier|consolas|menlo|monaco|fira code|source code|roboto mono|jetbrains)/i;

/** 'Big Shoulders Display' → "'Big Shoulders Display', sans-serif" */
export const familiaSegura = (familia) => {
  const f = sinComillas(familia);
  if (!f) return undefined;
  const generica = SERIF.test(f) ? 'serif' : MONO.test(f) ? 'monospace' : 'sans-serif';
  return `'${f}', ${generica}`;
};

const peso = (p) => {
  const n = Number(p);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(900, Math.max(100, Math.round(n / 100) * 100));
};

/** Valor de la regla `typography` desde un estilo medido. */
export const valorTipografia = (e, rol) => {
  if (!e) return null;
  const tam = px(e.tam);
  const inter = px(e.interlineado);
  const v = { role: rol };
  const fam = familiaSegura(e.familia);
  if (fam) v.family = fam;
  if (e.tam) v.fontSize = e.tam;
  const w = peso(e.peso);
  if (w) v.fontWeight = w;
  if (tam && inter) v.lineHeight = Math.min(3, Math.max(0.8, redondear(inter / tam, 3)));
  const esp = px(e.espaciado);
  if (esp) v.letterSpacing = pxs(esp);
  v.align = alineacion(e.alinea);
  if (e.mayus && e.mayus !== 'none') v.transform = e.mayus;
  if (e.estilo === 'italic') v.style = 'italic';
  return v;
};

const rolDe = (e) => {
  const fam = sinComillas(e.familia).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14);
  return `t-${fam || 'x'}-${String(e.tam || '').replace('px', '')}-${e.peso || ''}`;
};

/** Diferencias de una tipografía de celular/tablet respecto de la de escritorio. */
const difTipografia = (vD, vX) => {
  const d = { role: vD.role };
  for (const k of ['family', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'align', 'transform', 'style']) {
    if (vX[k] !== undefined && vX[k] !== vD[k]) d[k] = vX[k];
  }
  return Object.keys(d).length > 1 ? d : null;
};

/**
 * Tipografía + color de un bloque de texto. `est` = { d, t, m } con los
 * estilos de escritorio / tablet / celular (t y m pueden faltar).
 */
export function reglasTexto(reg, est, { sinColor = false } = {}) {
  const ids = [];
  const d = est.d;
  if (!d) return ids;
  const vD = valorTipografia(d, rolDe(d));
  const cambios = {};
  for (const bp of ['tablet', 'mobile']) {
    const x = est[bp === 'mobile' ? 'm' : 't'];
    if (x) { const dif = difTipografia(vD, valorTipografia(x, vD.role)); if (dif) cambios[bp] = dif; }
  }
  ids.push(...reg.conAnchos('typography', vD, cambios, { prefijo: 't' }));
  if (!sinColor && d.color) {
    const cD = colorRegla(d.color);
    const camb = {};
    for (const bp of ['tablet', 'mobile']) {
      const x = est[bp === 'mobile' ? 'm' : 't'];
      if (x && x.color && colorRegla(x.color) !== cD) camb[bp] = { role: `c-${cD.replace(/[^0-9a-z]/gi, "").toLowerCase()}`, color: colorRegla(x.color), apply: 'text' };
    }
    ids.push(...reg.conAnchos('color', { role: `c-${cD.replace(/[^0-9a-z]/gi, "").toLowerCase()}`, color: cD, apply: 'text' }, camb, { prefijo: 'c' }));
  }
  return ids;
}

/** Margen inferior (y superior 0) de un nodo, con su variante por ancho. */
export function reglasMargen(reg, finD, finM, { inicio = 0 } = {}) {
  // Desfase del PRIMER módulo de una columna respecto del borde de su contenido
  // (Divi: márgenes propios del módulo, a veces negativos). Lo deja la columna
  // en `reg.inicioPendiente` y lo consume el primer margen que se pida.
  let inicioM;
  if (reg.inicioPendiente) { inicio = reg.inicioPendiente.d; inicioM = reg.inicioPendiente.m; reg.inicioPendiente = null; }
  const base = { 'margin-block-start': pxs(inicio), 'margin-block-end': pxs(finD ?? 0) };
  const mDecl = {};
  if (finM !== undefined && finM !== null && finM !== finD) mDecl['margin-block-end'] = pxs(finM);
  if (inicioM !== undefined && inicioM !== inicio) mDecl['margin-block-start'] = pxs(inicioM);
  const m = Object.keys(mDecl).length ? mDecl : undefined;
  return reg.propiedades(base, m ? { mobile: m } : {}, { prefijo: 'mg' });
}

/** Relleno por lados, con variantes por ancho. Devuelve ids. */
export function reglasRelleno(reg, relD, relM, relT) {
  const arr = (r) => { const [t, rr, b, l] = lados(r); return { 'padding-top': pxs(t), 'padding-right': pxs(rr), 'padding-bottom': pxs(b), 'padding-left': pxs(l) }; };
  const base = arr(relD);
  return reg.propiedades(base, { mobile: relM ? arr(relM) : undefined, tablet: relT ? arr(relT) : undefined }, { prefijo: 'pad' });
}

/** Fondo y borde de una caja (columna, fila, módulo) como `properties`. */
export function declaracionesCaja(e) {
  const d = {};
  if (!e) return d;
  if (!esTransparente(e.fondo)) d['background-color'] = colorRegla(e.fondo);
  if (e.radio && e.radio !== '0px') d['border-radius'] = e.radio;
  if (e.sombra && e.sombra !== 'none') d['box-shadow'] = e.sombra;
  const b = String(e.borde || '').match(/^(\d+(?:\.\d+)?)px (\w+) (rgba?\([^)]+\))/);
  if (b && Number(b[1]) > 0 && b[2] !== 'none') {
    d['border-style'] = b[2];
    d['border-width'] = `${b[1]}px`;
    d['border-color'] = colorRegla(b[3]);
  }
  return d;
}

/**
 * Superficie de una sección: color, imagen de fondo (tamaño, posición, repetición),
 * degradado y velo. El degradado se traduce a `backgroundGradient` (estructura:
 * ángulo, paradas, posición, encima o debajo de la imagen) y sale con severidad
 * `ok`; sólo lo que no cabe en esa estructura queda como nota `aproximado`.
 * @returns {{ids: string[], notas: {severidad: 'ok'|'aproximado', motivo: string}[]}}
 */
export function superficieSeccion(reg, sec, { urlLocal, sinImagen = false } = {}) {
  const notas = [];
  const v = {};
  if (!esTransparente(sec.fondo)) v.backgroundColor = colorRegla(sec.fondo);
  const capas = capasDeFondo(sec.imagenFondo);
  const urls = sec.urlsFondo || [];
  const partes = (s) => String(s || '').split(/,\s*(?![^()]*\))/);
  // Las capas de imagen (url) y de degradado, cada una con su lugar en la lista:
  // el tamaño, la posición y la repetición medidos vienen UNO POR CAPA y en el
  // mismo orden, así que la imagen se busca por su índice y no como «la última».
  const indiceImagen = capas.map((c, i) => (c.tipo === 'imagen' ? i : -1)).filter((i) => i >= 0).pop();
  if (urls.length && !sinImagen) {
    const loc = urlLocal(urls[urls.length - 1]);
    if (loc) {
      v.backgroundAssetUrl = loc;
      const de = (s) => { const p = partes(s); return indiceImagen !== undefined && p.length === capas.length ? p[indiceImagen] : p.slice(-1)[0]; };
      const tam = de(sec.tamanoFondo);
      const pos = de(sec.posicionFondo);
      const rep = de(sec.repiteFondo);
      if (tam) v.backgroundSize = tam;
      if (pos) v.backgroundPosition = pos;
      if (rep && ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'].includes(rep)) v.backgroundRepeat = rep;
    }
  }
  const degradados = capas.map((c, i) => ({ ...c, i })).filter((c) => c.tipo === 'degradado');
  if (degradados.length) {
    const d = degradados[0];
    const { valor, perdidas } = traducirDegradado(d.texto);
    if (degradados.length > 1) {
      perdidas.push(`la sección tiene ${degradados.length} degradados: el módulo de fondos lleva uno; se transcribió el de más arriba`);
    }
    if (valor) {
      v.backgroundGradient = valor;
      // Con foto, en qué lado de ella está: la lista va de arriba hacia abajo, así
      // que un degradado ANTES de la foto está encima. `above` es el valor por
      // omisión del plugin: sólo se escribe lo que cambia.
      if (v.backgroundAssetUrl && indiceImagen !== undefined && d.i > indiceImagen) v.gradientPlacement = 'below';
      notas.push({ severidad: 'ok', motivo: `degradado ${valor.type} → backgroundGradient (${valor.stops.length} paradas${valor.angle ? `, ${valor.angle}` : ''}${v.gradientPlacement ? ', debajo de la foto' : v.backgroundAssetUrl ? ', encima de la foto' : ''})` });
    }
    for (const p of perdidas) notas.push({ severidad: 'aproximado', motivo: `degradado «${d.texto.slice(0, 70)}»: ${p}` });
  }
  const ids = Object.keys(v).length ? [reg.R('surface', v, { prefijo: 's' })] : [];
  return { ids, notas };
}
