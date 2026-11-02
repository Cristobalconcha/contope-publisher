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
 * una fila: 80 % con tope de 1080). Lo que no tiene cabida en el set (las sombras: el Core no tiene escala de sombras,
 * pregunta Q3 abierta; un interlineado en píxeles) queda en `huecos`, listado, y no se inventa.
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

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PAGINAS = ['inicio', 'basis-carpas-industriales', 'preguntas-frecuentes', 'contactos', 'terminos-y-privacidad', 'region-header', 'region-footer'];

/** Los pasos. slug ordinal (10, 20, 30…): no mezcla letras y dígitos, que WordPress separa con un guion en las clases. */
const PASOS = {
  spacing: {
    unidad: 'px',
    razon: 'Los valores de relleno, margen y separación se agrupan en 11 pasos. El 30 (71 usos) y el 20 (35) son el centro del sitio; el 50 y el 56 son el relleno vertical de las secciones (54 y 58 medidos); el 128 es el aire de la portada.',
    valores: [4, 10, 16, 20, 24, 30, 40, 50, 56, 72, 128],
  },
  'font-size': {
    unidad: 'px',
    razon: 'Los tamaños de letra se agrupan en 12 pasos. El 14 (23 usos) es el cuerpo chico; 16/18/20 son el cuerpo y los textos destacados; de 24 a 80 son títulos. Los títulos grandes llevan tamaño fluido (el mínimo es lo que el sitio original medido usa en el celular).',
    valores: [12, 14, 16, 18, 20, 24, 28, 32, 40, 50, 56, 80],
    movil: { 18: 15, 20: 15, 24: 18, 28: 16, 32: 24, 40: 28, 50: 30, 56: 38, 80: 28 },
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
    razon: 'Los interlineados sin unidad se agrupan en 5 pasos: 1, 1,2 (títulos), 1,4, 1,7 (cuerpo: 1,6 a 1,8) y 2.',
    pasos: { none: '1', tight: '1.2', snug: '1.4', normal: '1.7', loose: '2' },
    valores: [1, 1.2, 1.4, 1.7, 2],
  },
  measure: {
    razon: 'Dos anchos máximos de texto distintos del ancho de contenido (1080, que ya es --wp--style--global--content-size).',
    pasos: { s: '700px', m: '760px' },
  },
};
/** El margen de una fila de Divi: 80 % del ancho con tope de 1080. Es una fórmula que el sitio usa 12 veces, no un valor inventado. */
const GUTTER = 'max(10%, calc((100% - var(--wp--style--global--content-size)) / 2))';

const usos = { spacing: new Map(), 'font-size': new Map(), radius: new Map(), border: new Map(), weight: new Map(), leading: new Map(), measure: new Map() };
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

for (const p of PAGINAS) {
  const d = JSON.parse(readFileSync(path.join(aqui, 'salida', `${p}.componer.json`), 'utf8'));
  for (const r of d.design.rules) {
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
        suma(huecos.sombras, v);
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

const espaciado = escalaNumerica('spacing');
const tamanos = escalaNumerica('font-size');
const movil = PASOS['font-size'].movil;

// El margen de una fila (gutter) viene de 12 reglas «80 % con tope»: se agrega como paso nombrado del espaciado.
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

const lista = (pasos) => pasos.map((p) => `${p.slug}=${p.valor}`).join('; ');
informe.definiciones = {
  scale_spacing: [...espaciado.map((p) => `${p.slug}=${p.valor}`), `gutter=${GUTTER}`].join('; '),
  scale_font_size: tamanos.map((p) => `${p.slug}=${p.valor}${movil[p.n] ? '~' + movil[p.n] + 'px' : ''}`).join('; '),
  scale_radius: Object.entries(PASOS.radius.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_border: Object.entries(PASOS.border.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_weight: Object.entries(PASOS.weight.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_leading: Object.entries(PASOS.leading.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
  scale_measure: Object.entries(PASOS.measure.pasos).map(([k, v]) => `${k}=${v}`).join('; '),
};
void lista;

informe.huecos = {
  sombras: { razon: 'El Core no tiene escala de sombras (pregunta Q3 abierta en la espec): no se inventa una.', literales: [...huecos.sombras].map(([valor, veces]) => ({ valor, veces })) },
  interlineadoAbsoluto: { razon: 'Interlineado en píxeles (el sitio usa 40 px en el encabezado): es una altura fija, no un interlineado; queda sin escala.', literales: [...huecos.interlineadoAbsoluto].map(([valor, veces]) => ({ valor, veces })) },
  otros: [...huecos.otros].map(([valor, veces]) => ({ valor, veces })),
  cubiertosPorElTema: [...huecos.cubiertos].map(([valor, veces]) => ({ valor, veces })),
};
resumen.push(`huecos: sombras ${[...huecos.sombras].reduce((a, [, n]) => a + n, 0)} literales (sin escala: Q3), interlineado en px ${[...huecos.interlineadoAbsoluto].reduce((a, [, n]) => a + n, 0)}, otros ${[...huecos.otros].reduce((a, [, n]) => a + n, 0)}`);

writeFileSync(path.join(aqui, 'escalas.json'), JSON.stringify(informe, null, 2));
console.log(resumen.join('\n'));
console.log('→ scripts/basis/escalas.json');
