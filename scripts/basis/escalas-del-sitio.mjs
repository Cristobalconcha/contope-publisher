/**
 * Las ESCALAS del set de diseño de Basis, derivadas de lo que el sitio realmente usa.
 *
 * POR QUÉ. Medido en `observe`, las composiciones de Basis traían 502 valores literales (290 de espaciado, 89 de peso e
 * interlineado, 65 de tamaño de letra, 26 de radio, 15 de ancho, 11 de borde, 6 de sombra; 0 de color y 0 de familia).
 * Eso quiere decir que el set no declaraba una escala de espaciado, de tamaños, de radios, etc., y que la compuerta, con
 * razón, rechazaba todo: no había a qué referirse. Este guion mira TODOS los valores que las composiciones usan
 * (cinco páginas y las dos regiones), los agrupa en pocos pasos con nombre y deja escrito de cuántos literales salió
 * cada paso y cuánto se aparta cada valor medido de su paso.
 *
 * QUÉ NO HACE. No inventa valores: cada paso es un valor que el sitio usa (o la fórmula que ya usa, como el margen de
 * una fila: 80 % con tope de 1080). Lo que no tiene cabida en el set (un interlineado en píxeles, un espaciado calculado) queda en
 * `huecos`, listado, y no se inventa. Las transparencias de la paleta, las sombras y los desenfoques SÍ son escalas: cada valor distinto que el
 * sitio usa es un paso (no hay un paso «de diseño» previo que inventar), y el espaciado y los tamaños de letra llevan un valor por punto de quiebre.
 *
 * ENTRADA. salida/*.componer.json (los escribe `componer.mjs`).
 * SALIDA.  escalas.json  (pasos, cobertura, desviaciones y huecos) y, por la salida estándar, el resumen.
 *
 *   node scripts/basis/escalas-del-sitio.mjs
 *
 * Los PASOS de cada escala están declarados abajo con su razón; cambiar un paso es cambiar una línea, y el informe
 * dice qué valores medidos quedan más lejos de lo tolerable. `definiciones-del-set.php` los lleva a las definiciones del
 * tema (ContOpe → Configuración → Escala), de donde salen los presets del theme.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugDeColorBase } from './lib/bloques.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PAGINAS = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad', 'region-header', 'region-footer'];

/** Los pasos. slug ordinal (10, 20, 30…): no mezcla letras y dígitos, que WordPress separa con un guion en las clases. */
const PASOS = {
  spacing: {
    unidad: 'px',
    razon: 'Los valores de relleno, margen y separación se agrupan en pasos. El 30 (71 usos) y el 20 (35) son el centro del sitio; el 56 es el relleno vertical de las secciones; el 128 es el aire de la portada. Se sumaron como paso propio los valores medidos que se repiten (6 veces o más) y que el redondeo habría movido 2 px o más: 27 (el relleno de cada fila, 16 usos), 54 (el de cada sección, 13), 12 (9) y 59,39 (la separación entre columnas, 6).',
    valores: [4, 10, 12, 16, 20, 24, 27, 30, 40, 50, 54, 56, 59.39, 72, 128],
  },
  'font-size': {
    unidad: 'px',
    razon: 'Los tamaños de letra de ESCRITORIO son los que el sitio declara, sin redondear (un tamaño distinto cambia dónde salta el renglón): el 14 (28 usos) es el cuerpo chico; 16/18/20/22 son el cuerpo y los textos destacados; de 24 a 80 son títulos. Cada paso del set es «escritorio / tablet / celular» (ver más abajo).',
    valores: [12, 14, 16, 18, 20, 24, 28, 32, 40, 50, 56, 80],
  },
  radius: {
    unidad: 'px',
    razon: 'Los radios medidos son 3, 6, 8 y 10 px, el círculo (50 %) y la píldora (9999 px). Cada uno es un paso: son pocos y el ojo los distingue.',
    pasos: { xs: '3px', s: '6px', m: '8px', l: '10px', circle: '50%', pill: '9999px' },
  },
  border: {
    razon: 'El sitio usa un filete de 1 px y un contorno de enfoque de 2 px.',
    pasos: { hairline: '1px', thick: '2px' },
  },
  weight: {
    razon: 'Cada peso de letra que el sitio declara (Open Sans: 300, 400, 600, 700, 800; los títulos 500) es un paso; no se agrupan porque la familia los dibuja distinto.',
    pasos: { light: '300', regular: '400', medium: '500', bold: '700', extrabold: '800', black: '900' },
  },
  leading: {
    razon: 'Cada interlineado sin unidad que el sitio declara es un paso: 1, 1,2 (títulos), 1,4, 1,5, 1,6, 1,7 (el del cuerpo, 14 usos), 1,75, 1,8 y 2. Un interlineado distinto mueve el salto de renglón de un párrafo y cambia su alto, así que no se redondean entre sí.',
    pasos: { none: '1', tight: '1.2', snug: '1.4', cozy: '1.5', comfy: '1.6', normal: '1.7', relaxed: '1.75', airy: '1.8', loose: '2' },
    valores: [1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.75, 1.8, 2],
  },
  measure: {
    razon: 'Dos anchos máximos de texto distintos del ancho de contenido (1080, que ya es --wp--style--global--content-size).',
    pasos: { s: '700px', m: '760px' },
  },
};
/** El margen de una fila de Divi: 80 % del ancho con tope de 1080. Es una fórmula que el sitio usa 12 veces, no un valor inventado. */
const GUTTER = 'max(10%, calc((100% - var(--wp--style--global--content-size)) / 2))';

const usos = { spacing: new Map(), 'font-size': new Map(), radius: new Map(), border: new Map(), weight: new Map(), leading: new Map(), measure: new Map(), alpha: new Map(), shadow: new Map(), blur: new Map() };
const huecos = { sombras: new Map(), interlineadoAbsoluto: new Map(), otros: new Map(), cubiertos: new Map() };
const suma = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

const RE_ESP = /^(?:padding|margin|gap|row-gap|column-gap|scroll-margin(?:-block-start)?|padding-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?|margin-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)$/;
const RE_RADIO = /^border(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius$/;
const RE_BORDE = /^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline)-width$/;

function declaraciones(r) {
  if (r.kind === 'properties') return Object.entries(r.value.declarations || {});
  const v = r.value || {};
  if (r.kind === 'layout') return [['gap', v.gap]];
  if (r.kind === 'typography') return [['font-size', v.fontSize], ['font-weight', v.fontWeight], ['line-height', v.lineHeight]];
  if (r.kind === 'shape') return [['border-radius', v.radius === 'pill' ? '9999px' : v.radius], ['border-width', v.borderWidth]];
  if (r.kind === 'spacing') return [['padding-block', v.paddingBlock], ['padding-inline', v.paddingInline], ['gap', v.gap]];
  if (r.kind === 'surface') return [['border-width', v.borderWidth], ['box-shadow', v.shadow && v.shadow !== 'none' ? v.shadow : undefined]];
  return [];
}

const RE_ALFA = /color-mix\(in srgb, (var\([^)]*\)) ([\d.]+)%, transparent\)/g;
for (const p of PAGINAS) {
  const d = JSON.parse(readFileSync(path.join(aqui, 'salida', `${p}.componer.json`), 'utf8'));
  for (const r of d.design.rules) {
    // Las transparencias: un color de la paleta con su opacidad (en un fondo, un borde o dentro de una sombra).
    // (la variante del formulario trae sus propias mezclas: viven en settings.custom.form, no son un color de la paleta)
    for (const m of r.kind === 'form' ? [] : JSON.stringify(r.value, (k, v) => (k === 'box-shadow' || k === 'shadow' ? undefined : v)).matchAll(RE_ALFA)) {
      const base = slugDeColorBase(m[1]);
      if (base) suma(usos.alpha, `${base} ${Number(m[2])}%`);
    }
    for (const [k, vRaw] of declaraciones(r)) {
      if (vRaw === undefined || vRaw === null || vRaw === '') continue;
      const v = String(vRaw);
      if (RE_ESP.test(k)) {
        for (const m of v.matchAll(/(-?\d+(?:\.\d+)?)px/g)) { const n = Math.abs(Number(m[1])); if (n > 200) suma(huecos.otros, `espaciado calculado: ${v}`); else if (n) suma(usos.spacing, n); }
      } else if (k === 'font-size') {
        const m = v.match(/^(\d+(?:\.\d+)?)px$/); if (m) suma(usos['font-size'], Number(m[1]));
      } else if (RE_RADIO.test(k)) {
        for (const t of v.split(/\s+/)) { if (t === '0' || t === '0px') continue; suma(usos.radius, t); }
      } else if (RE_BORDE.test(k)) {
        for (const t of v.split(/\s+/)) { if (/^\d/.test(t) && Number.parseFloat(t) !== 0) suma(usos.border, t); }
      } else if (k === 'font-weight') {
        suma(usos.weight, String(v));
      } else if (k === 'line-height') {
        if (/^\d+(\.\d+)?$/.test(v)) suma(usos.leading, Number(v));
        else if (/px$/.test(v)) suma(huecos.interlineadoAbsoluto, v);
      } else if (k === 'max-width') {
        const m = v.match(/^(\d+(?:\.\d+)?)px$/); if (m && m[1] === '1080') suma(huecos.cubiertos, 'max-width 1080px → --wp--style--global--content-size (theme.json)'); else if (m) suma(usos.measure, m[1] + 'px');
      } else if (k === 'box-shadow') {
        suma(usos.shadow, v.replace(/\s+/g, ' ').trim());
      } else if (k === 'backdrop-filter') {
        const m = v.match(/^blur\((\d+(?:\.\d+)?px)\)$/); if (m) suma(usos.blur, m[1]); else suma(huecos.otros, `backdrop-filter: ${v}`);
      }
    }
  }
}

const cercano = (valores, v) => valores.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const redondea = (n) => Math.round(n * 10) / 10;
const informe = { generado: new Date().toISOString().slice(0, 10), fuente: 'salida/*.componer.json', escalas: {}, definiciones: {}, huecos: {} };
const resumen = [];

function escalaNumerica(nombre) {
  const cfg = PASOS[nombre];
  const total = [...usos[nombre]].reduce((a, [, n]) => a + n, 0);
  const pasos = cfg.valores.map((valor, i) => ({ slug: String((i + 1) * 10), valor: `${valor}${cfg.unidad}`, n: valor, cubre: [], usos: 0, exactos: 0 }));
  let exactos = 0, aprox = 0, peor = 0;
  const fuera = [];
  for (const [v, n] of [...usos[nombre]].sort((a, b) => a[0] - b[0])) {
    const c = cercano(cfg.valores, v);
    const paso = pasos[cfg.valores.indexOf(c)];
    const dev = redondea(c - v);
    paso.usos += n;
    paso.cubre.push({ medido: v, veces: n, desviacion: dev });
    if (dev === 0) { exactos += n; paso.exactos += n; } else aprox += n;
    const rel = Math.abs(dev) / v;
    if (rel > 0.2 && Math.abs(dev) > 3) fuera.push(`${v}→${c}`);
    peor = Math.max(peor, Math.abs(dev));
  }
  informe.escalas[nombre] = { razon: cfg.razon, totalLiterales: total, exactos, aproximados: aprox, mayorDesviacion: peor, pasos: pasos.map(({ slug, valor, usos: u, exactos: e, cubre }) => ({ slug, valor, usos: u, exactos: e, cubre })) };
  resumen.push(`${nombre}: ${cfg.valores.length} pasos para ${total} literales (${exactos} exactos, ${aprox} acercados; mayor desviación ${peor}${cfg.unidad}${fuera.length ? '; MUY LEJOS: ' + fuera.join(', ') : ''})`);
  return pasos;
}

const espaciadoBase = escalaNumerica('spacing'); // el informe de cuánto se aparta cada medida de su paso de ESCRITORIO

// Igual que los tamaños de letra: cada paso de espaciado es «escritorio / tablet / celular». El sitio original cambia el relleno, el margen y la
// separación por punto de quiebre (el relleno de una sección baja de 54 a 50 px; el de una tarjeta, de 60 a 30 y a 20). Se mide POR NODO y
// por LADO (padding-top, margin-bottom, gap…) y se agrupa por el paso de escritorio más cercano; lo que el nodo no redefine hereda el de escritorio.
const ternasEsp = new Map();
for (const v of PASOS.spacing.valores) ternasEsp.set(`${v}||`, 0); // todos los pasos de escritorio existen, con o sin quiebres
{
  const px = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
  const fisica = (k) => k.replace('block-start', 'top').replace('block-end', 'bottom').replace('inline-start', 'left').replace('inline-end', 'right');
  const RE_ESPACIO = /^(?:padding|margin)-(?:top|right|bottom|left|block-start|block-end|inline-start|inline-end)$|^(?:row-|column-)?gap$/;
  for (const p of PAGINAS) {
    const d = JSON.parse(readFileSync(path.join(aqui, 'salida', `${p}.componer.json`), 'utf8'));
    const reglas = new Map(d.design.rules.map((r) => [r.id, r]));
    const recorrer = (n) => {
      const por = { all: {}, tablet: {}, mobile: {} };
      for (const id of [...(n.ruleIds || []), ...Object.values(n.partes || {}).flat()]) {
        const r = reglas.get(id);
        if (!r || (r.scope?.state || 'default') !== 'default') continue;
        if (r.kind === 'layout' && r.value?.gap) por[r.scope?.breakpoint || 'all'].gap = r.value.gap; // la separación de una pila
        if (r.kind !== 'properties') continue;
        for (const [k, v] of Object.entries(r.value.declarations || {})) if (RE_ESPACIO.test(k)) por[r.scope?.breakpoint || 'all'][fisica(k)] = v;
      }
      for (const k of Object.keys(por.all)) {
        const dv = px(por.all[k]);
        if (dv === null || dv < 0) continue;
        const t = px(por.tablet[k]);
        const m = px(por.mobile[k]);
        const conQuiebre = (t !== null && t !== dv) || (m !== null && m !== dv);
        if (dv === 0 && !conQuiebre) continue;
        const dc = dv === 0 ? 0 : cercano(PASOS.spacing.valores, dv);
        const tt = t !== null && t !== dc ? t : '';
        const mm = m !== null && m !== dc ? m : '';
        const clave = `${dc}|${tt}|${mm}`;
        ternasEsp.set(clave, (ternasEsp.get(clave) || 0) + 1);
      }
      (n.children || []).forEach(recorrer);
    };
    d.composition.nodes.forEach(recorrer);
  }
}
const espaciado = [...ternasEsp.entries()].map(([k, usosN]) => { const [d, t, m] = k.split('|'); return { d: Number(d), t: t === '' ? null : Number(t), m: m === '' ? null : Number(m), usos: usosN }; })
  .sort((a, b) => a.d - b.d || (a.t ?? a.d) - (b.t ?? b.d) || (a.m ?? a.d) - (b.m ?? b.d))
  .map((p, i) => ({ ...p, slug: String((i + 1) * 10), valor: `${p.d}px`, tablet: p.t === null ? '' : `${p.t}px`, movil: p.m === null ? '' : `${p.m}px` }));
const cadenaEsp = (p) => `${p.slug}=${p.valor}${p.tablet || p.movil ? `/${p.tablet}/${p.movil}` : ''}`;
escalaNumerica('font-size'); // el informe de cuánto se aparta cada tamaño medido de su paso de ESCRITORIO

// Cada paso de tamaño es una terna «escritorio / tablet / celular»: el sitio original define un tamaño distinto en cada punto de quiebre
// (un título de 50 px baja a 28 px en tablet y a 20 px en el celular). Se miden POR NODO (con las partes del acordeón) y se agrupan por
// el paso de escritorio más cercano; lo que el nodo no redefine en un punto de quiebre hereda el tamaño de escritorio.
const ternas = new Map();
{
  const cercanoDe = (v) => v; // el escritorio es EXACTO: un tamaño distinto cambia dónde salta el renglón
  const tam = (r) => (r.kind === 'typography' ? r.value.fontSize : r.kind === 'properties' ? r.value.declarations?.['font-size'] : undefined);
  const px = (v) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
  for (const p of PAGINAS) {
    const d = JSON.parse(readFileSync(path.join(aqui, 'salida', `${p}.componer.json`), 'utf8'));
    const reglas = new Map(d.design.rules.map((r) => [r.id, r]));
    const recorrer = (n) => {
      const ids = [...(n.ruleIds || []), ...Object.values(n.partes || {}).flat()];
      const por = {};
      for (const id of ids) {
        const r = reglas.get(id);
        if (!r || (r.scope?.state || 'default') !== 'default') continue;
        const t = px(tam(r));
        if (t !== null) por[r.scope?.breakpoint || 'all'] = t;
      }
      if (por.all !== undefined) {
        const dc = cercanoDe(por.all);
        const t = por.tablet ?? null;
        const m = por.mobile ?? null;
        const clave = `${dc}|${t ?? ''}|${m ?? ''}`;
        ternas.set(clave, (ternas.get(clave) || 0) + 1);
      }
      (n.children || []).forEach(recorrer);
    };
    d.composition.nodes.forEach(recorrer);
  }
}
const tamanos = [...ternas.entries()].map(([k, usosN]) => { const [d, t, m] = k.split('|'); return { d: Number(d), t: t === '' || Number(t) === Number(d) ? null : Number(t), m: m === '' || Number(m) === Number(d) ? null : Number(m), usos: usosN }; })
  .sort((a, b) => a.d - b.d || (a.t ?? a.d) - (b.t ?? b.d) || (a.m ?? a.d) - (b.m ?? b.d))
  .map((p, i) => ({ ...p, slug: String((i + 1) * 10), valor: `${p.d}px`, tablet: p.t === null ? '' : `${p.t}px`, movil: p.m === null ? '' : `${p.m}px` }));
const cadenaTamano = (p) => `${p.slug}=${p.valor}${p.tablet || p.movil ? `/${p.tablet}/${p.movil}` : ''}`;
informe.escalas['font-size'] = {
  razon: 'Cada paso es «escritorio / tablet / celular»: el sitio original define un tamaño distinto en cada punto de quiebre (un título de 50 px baja a 28 px en tablet y a 20 px en el celular). El escritorio, el tablet y el celular son los tamaños MEDIDOS, sin redondear. Lo que un texto no redefine en un punto de quiebre hereda el de escritorio. WordPress imprime una sola variable por paso; el tema la redefine dentro de cada punto de quiebre (los del lienzo: tablet 768 a 1023, celular hasta 767).',
  totalLiterales: tamanos.reduce((a, p) => a + p.usos, 0),
  exactos: tamanos.reduce((a, p) => a + p.usos, 0),
  aproximados: 0,
  pasos: tamanos.map((p) => ({ slug: p.slug, valor: p.valor, tablet: p.tablet, movil: p.movil, usos: p.usos })),
};
resumen.push(`font-size (con puntos de quiebre): ${tamanos.length} pasos (${tamanos.filter((p) => p.tablet || p.movil).length} con tamaño propio en tablet o celular) para ${informe.escalas['font-size'].totalLiterales} textos`);

// El margen de una fila (gutter) viene de 12 reglas «80 % con tope»: se agrega como paso nombrado del espaciado.
informe.escalas.spacing.razon += ' Cada paso es «escritorio / tablet / celular»: el relleno, el margen y la separación que el original cambia por punto de quiebre son pasos propios (los de tablet y celular son los medidos); lo que no cambia hereda el de escritorio.';
informe.escalas.spacing.pasos = espaciado.map((p) => ({ slug: p.slug, valor: p.valor, tablet: p.tablet, movil: p.movil, usos: p.usos }));
informe.escalas.spacing.pasos.push({ slug: 'gutter', valor: GUTTER, usos: 12, exactos: 12, cubre: [{ medido: '80% con tope de 1080px', veces: 12, desviacion: 0 }] });

function escalaNombrada(nombre) {
  const cfg = PASOS[nombre];
  const total = [...usos[nombre]].reduce((a, [, n]) => a + n, 0);
  const lista = Object.entries(cfg.pasos);
  let exactos = 0, aprox = 0;
  const filas = lista.map(([slug, valor]) => ({ slug, valor, usos: 0, exactos: 0, cubre: [] }));
  const numeros = (cfg.valores || null);
  for (const [v, n] of [...usos[nombre]].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    let fila = filas.find((f) => f.valor === String(v));
    if (!fila && numeros && typeof v === 'number') {
      const c = cercano(numeros, v);
      fila = filas.find((f) => Number(f.valor) === c);
    }
    if (!fila && nombre === 'radius') {
      const px = Number.parseFloat(v);
      const cands = filas.filter((f) => f.valor.endsWith('px') && f.valor !== '9999px');
      fila = cands.reduce((a, b) => (Math.abs(Number.parseFloat(b.valor) - px) < Math.abs(Number.parseFloat(a.valor) - px) ? b : a));
    }
    if (!fila) { suma(huecos.otros, `${nombre}: ${v}`, n); continue; }
    const exacto = fila.valor === String(v);
    fila.usos += n;
    if (exacto) { fila.exactos += n; exactos += n; } else aprox += n;
    fila.cubre.push({ medido: v, veces: n, desviacion: exacto ? 0 : 'acercado' });
  }
  informe.escalas[nombre] = { razon: cfg.razon, totalLiterales: total, exactos, aproximados: aprox, pasos: filas };
  resumen.push(`${nombre}: ${lista.length} pasos para ${total} literales (${exactos} exactos, ${aprox} acercados)`);
}
escalaNombrada('radius');
escalaNombrada('border');
escalaNombrada('weight');
escalaNombrada('leading');
escalaNombrada('measure');

// Transparencias, sombras y desenfoques: no hay un paso «de diseño» previo (no se inventan): cada valor distinto que el sitio usa es un paso.
function escalaDeMedidos(nombre, razon, claves, slugDe, valorDe) {
  const total = [...usos[nombre]].reduce((a, [, n]) => a + n, 0);
  const filas = claves.map((k, i) => ({ slug: slugDe(k, i), valor: valorDe(k), usos: usos[nombre].get(k), exactos: usos[nombre].get(k), cubre: [{ medido: k, veces: usos[nombre].get(k), desviacion: 0 }] }));
  informe.escalas[nombre] = { razon, totalLiterales: total, exactos: total, aproximados: 0, pasos: filas };
  resumen.push(`${nombre}: ${filas.length} pasos para ${total} usos (todos exactos)`);
  return filas;
}
const alfas = escalaDeMedidos('alpha', 'Cada color de la paleta con transparencia que el sitio usa (el recuadro blanco sobre el video, el filete de los pliegues) es un paso: «color N %». El bloque lo pide por su slug, como a cualquier color de la paleta.',
  [...usos.alpha.keys()].sort(), (k) => k.replace(' ', '-').replace('%', ''), (k) => k);
const blurSorted = [...usos.blur.keys()].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));
const desenfoques = escalaDeMedidos('blur', 'El desenfoque del fondo detrás de un recuadro translúcido (backdrop-filter). Un paso por cada radio medido.',
  blurSorted, (k, i) => ['s', 'm', 'l', 'xl'][i] || String((i + 1) * 10), (k) => k);
const radioDeSombra = (v) => { const m = v.replace(/color-mix\(.*?transparent\)/g, '').match(/-?\d+(?:\.\d+)?(?:px)?/g) || []; return Number.parseFloat(m[2] ?? '0'); };
const sombrasOrden = [...usos.shadow.keys()].sort((a, b) => radioDeSombra(a) - radioDeSombra(b) || a.localeCompare(b));
const sombras = escalaDeMedidos('shadow', 'Las sombras que el sitio usa (tarjetas, botón, recuadro del mapa), de menor a mayor desenfoque. Un paso por sombra distinta; se aplican con style.shadow (var:preset|shadow|paso).',
  sombrasOrden, (k, i) => String((i + 1) * 10), (k) => k);

const lista = (pasos) => pasos.map((p) => `${p.slug}=${p.valor}`).join('; ');
informe.definiciones = {
  scale_spacing: [...espaciado.map(cadenaEsp), `gutter=${GUTTER}`].join('; '),
  scale_font_size: tamanos.map(cadenaTamano).join('; '),
  scale_radius: Object.entries(PASOS.radius.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_border: Object.entries(PASOS.border.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_weight: Object.entries(PASOS.weight.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_leading: Object.entries(PASOS.leading.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_measure: Object.entries(PASOS.measure.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_alpha: alfas.map((p) => `${p.slug}=${p.valor}`).join('; '),
  scale_shadow: sombras.map((p) => `${p.slug}=${p.valor}`).join('; '),
  scale_blur: desenfoques.map((p) => `${p.slug}=${p.valor}`).join('; '),
};
void lista;

informe.huecos = {
  sombras: { razon: 'Ya no es un hueco: las sombras que el sitio usa son los pasos de la escala `shadow` (settings.shadow.presets). Quedaría aquí una sombra que no sea una medida con un color de la paleta.', literales: [...huecos.sombras].map(([valor, veces]) => ({ valor, veces })) },
  interlineadoAbsoluto: { razon: 'Interlineado en píxeles (el sitio usa 40 px en el encabezado): es una altura fija, no un interlineado; queda sin escala.', literales: [...huecos.interlineadoAbsoluto].map(([valor, veces]) => ({ valor, veces })) },
  otros: [...huecos.otros].map(([valor, veces]) => ({ valor, veces })),
  cubiertosPorElTema: [...huecos.cubiertos].map(([valor, veces]) => ({ valor, veces })),
};
resumen.push(`huecos: sombras ${[...huecos.sombras].reduce((a, [, n]) => a + n, 0)} literales sin paso, interlineado en px ${[...huecos.interlineadoAbsoluto].reduce((a, [, n]) => a + n, 0)}, otros ${[...huecos.otros].reduce((a, [, n]) => a + n, 0)}`);

writeFileSync(path.join(aqui, 'escalas.json'), JSON.stringify(informe, null, 2));
console.log(resumen.join('\n'));
console.log('→ scripts/basis/escalas.json');
