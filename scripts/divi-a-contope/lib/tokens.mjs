/**
 * Del valor medido al SET DE DISEÑO: ningún color ni tipografía literal en las reglas.
 *
 * POR QUÉ EXISTE. El transcriptor lee lo que el navegador pintó (estilos computados), y lo
 * computado son valores: `#F26621`, `rgba(0,0,0,0.2)`, `'Open Sans', sans-serif`. Copiarlos a
 * las reglas deja la identidad duplicada: el sitio queda con su propia copia de cada color y
 * cambiar el set (la paleta del tema, las definiciones de estilo) ya no lo cambia. Un sitio
 * así no está gobernado por nada.
 *
 * QUÉ HACE. Recibe el set (la paleta y las familias del `theme.json` del tema, más lo que el
 * perfil del sitio decide) y traduce:
 *
 *   - color opaco  → la variable del color de la paleta que calza EXACTO; si ninguno calza, el
 *                    más cercano en OKLab (se anota original → token → distancia);
 *   - color con alfa → `color-mix(in srgb, <variable> N%, transparent)`;
 *   - font-family  → la variable de la familia del set (`var(--cod-font-body)`, o la del
 *                    `theme.json` si la familia no tiene un rol).
 *
 * Los colores muy lejos de TODO el set se traducen igual al más cercano, pero quedan marcados
 * «fuera del set»: nadie decide en silencio que el set no alcanza. Una familia que el set no
 * conoce se deja literal y también se marca.
 *
 * NO escribe CSS: sólo reemplaza valores dentro del valor de cada regla, antes de que la regla
 * reciba su id (así el id se calcula sobre lo traducido y dos colores que caen en el mismo token
 * comparten regla). Es idempotente: una variable no vuelve a traducirse.
 */
import { readFileSync } from 'node:fs';
import { leerColor, redondear } from './util.mjs';

// ---------------------------------------------------------------- color

const lineal = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
/** sRGB 0–255 → OKLab [L, a, b]. */
export const oklab = ({ r, g, b }) => {
  const R = lineal(r), G = lineal(g), B = lineal(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
/** Distancia perceptual (OKLab × 100): ~2 apenas se nota, ~10 ya es otro color. */
export const distancia = (a, b) => {
  const [l1, a1, b1] = oklab(a), [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
};

const hexDe = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const corto = (h) => (/^#[0-9a-f]{3}$/i.test(h) ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h);
/** Un color en cualquier sintaxis que mide el transcriptor → {r,g,b,a}, o null si no es un color. */
const leer = (t) => {
  const s = String(t).trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) return leerColor(corto(s));
  if (/^#[0-9a-f]{6}$/i.test(s)) return leerColor(s);
  if (/^#[0-9a-f]{8}$/i.test(s)) { const k = leerColor(s.slice(0, 7)); return k && { ...k, a: parseInt(s.slice(7), 16) / 255 }; }
  // El texto ENTERO tiene que ser el color: `rgba(0,0,0,.1) 0 24px 72px` es una sombra, y leerla como color se comería las medidas.
  if (/^rgba?\([^)]*\)$/i.test(s)) return leerColor(s);
  return null;
};

/** Regla de tokens para colores literales dentro de un texto (hex de 3/6/8 dígitos, rgb(), rgba()). */
const COLOR_EN_TEXTO = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

/** El alfa como porcentaje para color-mix: 0.08 → "8", 0.125 → "12.5". */
const pct = (a) => String(redondear(a * 100, 1));

// ---------------------------------------------------------------- familias

const primeraFamilia = (v) => String(v).split(',')[0].replace(/["']/g, '').trim();

// ---------------------------------------------------------------- el traductor

/**
 * @param {object} o
 * @param {{slug: string, color: string}[]} o.paleta colores del set (theme.json › settings.color.palette)
 * @param {{slug: string, fontFamily: string}[]} [o.familiasTema] theme.json › settings.typography.fontFamilies
 * @param {Record<string, string>} [o.roles] slug de color → variable que lo representa en vez de `var(--wp--preset--color--<slug>)`
 * @param {Record<string, string>} [o.familias] nombre de familia → variable (gana sobre las del tema)
 * @param {number} [o.distanciaMaxima] más lejos que esto del color más cercano = «fuera del set»
 */
export function crearTraductor({ paleta, familiasTema = [], roles = {}, familias = {}, distanciaMaxima = 8 }) {
  const colores = paleta.map((p) => {
    const k = leer(p.color);
    if (!k) throw new Error(`tokens: el color «${p.color}» de la paleta (${p.slug}) no es hex ni rgb()`);
    return { slug: p.slug, hex: hexDe(k), k, token: roles[p.slug] || `var(--wp--preset--color--${p.slug})` };
  });
  const tablaFamilias = new Map();
  for (const f of familiasTema) tablaFamilias.set(primeraFamilia(f.fontFamily).toLowerCase(), `var(--wp--preset--font-family--${f.slug})`);
  for (const [nombre, token] of Object.entries(familias)) tablaFamilias.set(nombre.toLowerCase(), token);

  /** hex original → {token, slug, distancia, usos, fuera} */
  const aproximados = new Map();
  const exactos = new Map();
  /** nombre de familia → {token|null, usos} */
  const usoFamilias = new Map();
  /** de qué regla viene el valor que se está traduciendo (para el informe) */
  let sitioActual = '';
  let contando = true;
  let pagina = '';

  /** Un color OPACO → el token y de qué tan cerca está. */
  const opaco = (k) => {
    const hex = hexDe(k);
    let mejor = null;
    for (const c of colores) {
      const d = c.hex === hex ? 0 : distancia(k, c.k);
      if (!mejor || d < mejor.d) mejor = { c, d };
    }
    if (!contando) return mejor.c;
    if (mejor.d === 0) {
      const u = exactos.get(hex) || { token: mejor.c.token, slug: mejor.c.slug, usos: 0 };
      u.usos++;
      exactos.set(hex, u);
    } else {
      const u = aproximados.get(hex) || { token: mejor.c.token, slug: mejor.c.slug, distancia: redondear(mejor.d, 1), usos: 0, fuera: mejor.d > distanciaMaxima, sitios: new Set() };
      u.usos++;
      if (sitioActual) u.sitios.add(sitioActual);
      aproximados.set(hex, u);
    }
    return mejor.c;
  };

  /** Un color suelto → {token, slug, alfa}. null si no es un color que haya que traducir. */
  const traducirUno = (texto) => {
    const k = leer(texto);
    if (!k) return null;
    if (k.a === 0) return { valor: 'transparent', slug: 'transparent' };
    const c = opaco(k);
    if (k.a >= 0.9995) return { valor: c.token, slug: c.slug };
    const p = pct(k.a);
    return { valor: `color-mix(in srgb, ${c.token} ${p}%, transparent)`, slug: `${c.slug}-a${p.replace('.', '_')}` };
  };

  /** Un color suelto o una lista (box-shadow, border, sombra del formulario): cada color literal, a su token. */
  const color = (texto) => {
    const s = String(texto);
    const entero = traducirUno(s);
    if (entero) return entero.valor;
    return s.replace(COLOR_EN_TEXTO, (m) => traducirUno(m)?.valor ?? m);
  };

  /** font-family literal → variable del set (o el texto original, anotado, si el set no la conoce). */
  const familia = (texto) => {
    const s = String(texto).trim();
    if (/^var\(/.test(s)) return s;
    const nombre = primeraFamilia(s);
    const token = tablaFamilias.get(nombre.toLowerCase()) || null;
    if (contando) {
      const u = usoFamilias.get(nombre) || { token, usos: 0, sitios: new Set() };
      u.usos++;
      if (sitioActual) u.sitios.add(sitioActual);
      usoFamilias.set(nombre, u);
    }
    return token || s;
  };

  const CLAVES_FAMILIA = new Set(['family', 'font-family', 'tipografia', 'fontFamily']);
  const OMITIR_TEXTO = (s) => s.includes('url(') || s.includes('://') || s.startsWith('/') || s.startsWith('data:');

  const recorrer = (v, clave) => {
    if (typeof v === 'string') {
      if (CLAVES_FAMILIA.has(clave)) return familia(v);
      if (OMITIR_TEXTO(v)) return v;
      return color(v);
    }
    if (Array.isArray(v)) return v.map((x) => recorrer(x, clave));
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = recorrer(x, k);
      return o;
    }
    return v;
  };

  /** Rol de una regla `color`: el sufijo que era el hex pasa a ser el nombre del token. */
  const rolNuevo = (rol, valorOriginal, valorNuevo) => {
    const antes = contando;
    contando = false; // ya se contó al traducir el color; esto sólo saca el nombre
    const t = traducirUno(valorOriginal);
    contando = antes;
    if (!t) return rol;
    const sufijo = /(^|-)([0-9a-f]{6,8}|rgba[0-9]*)$/i;
    return sufijo.test(rol) ? rol.replace(sufijo, (_, g) => `${g}${t.slug}`) : rol;
  };

  /** Traduce el valor de una regla de diseño. Devuelve una copia; no toca la entrada. */
  const regla = (kind, valor, id = '') => {
    sitioActual = (pagina ? pagina + ' › ' : '') + kind;
    if (kind === 'color' && typeof valor.color === 'string') {
      const antes = valor.color;
      const nuevo = recorrer(valor, '');
      // Sólo se renombra el rol si el color se tradujo de verdad (no si ya era una variable).
      if (nuevo.color !== antes && typeof nuevo.role === 'string') nuevo.role = rolNuevo(nuevo.role, antes, nuevo.color);
      return nuevo;
    }
    return recorrer(valor, '');
  };

  const informe = () => ({
    exactos: [...exactos].map(([original, u]) => ({ original, slug: u.slug, token: u.token, usos: u.usos })),
    aproximados: [...aproximados].map(([original, u]) => ({ original, slug: u.slug, token: u.token, distancia: u.distancia, usos: u.usos, fuera: u.fuera, sitios: [...u.sitios].sort() })).sort((a, b) => b.distancia - a.distancia),
    familias: [...usoFamilias].map(([nombre, u]) => ({ nombre, token: u.token, usos: u.usos, sitios: [...u.sitios].sort() })),
    distanciaMaxima,
  });

  /** La misma traducción SIN contar usos (la pasada de tablet repite lo de escritorio y no debe inflar el informe). */
  const silencioso = {
    regla: (...a) => { const antes = contando; contando = false; try { return regla(...a); } finally { contando = antes; } },
    color: (...a) => { const antes = contando; contando = false; try { return color(...a); } finally { contando = antes; } },
    familia: (...a) => { const antes = contando; contando = false; try { return familia(...a); } finally { contando = antes; } },
  };

  return { color, familia, regla, informe, silencioso, set pagina(p) { pagina = p; }, paleta: colores.map((c) => ({ slug: c.slug, hex: c.hex, token: c.token })), distanciaMaxima };
}

/** Lee el set de un `theme.json`: paleta y familias. */
export function setDeThemeJson(ruta) {
  const j = JSON.parse(readFileSync(ruta, 'utf8'));
  return { paleta: j.settings?.color?.palette || [], familiasTema: j.settings?.typography?.fontFamilies || [] };
}

/** Arma el traductor desde el bloque `tokens` del perfil del sitio (ruta del tema relativa al perfil). */
export function traductorDePerfil(perfil, carpetaDelPerfil, resolverRuta) {
  const t = perfil.tokens;
  if (!t) return null;
  const set = setDeThemeJson(resolverRuta(carpetaDelPerfil, t.tema));
  return crearTraductor({ ...set, roles: t.colores?.roles || {}, familias: t.familias || {}, distanciaMaxima: t.colores?.distanciaMaxima ?? 8 });
}

/** Sección del INFORME.md del transcriptor con lo que la traducción decidió. */
export function informeDeTokens(inf) {
  const L = ['## Traducción al set de diseño', ''];
  L.push(`Colores que calzaron EXACTO con la paleta: ${inf.exactos.length} (${inf.exactos.reduce((n, e) => n + e.usos, 0)} usos).`, '');
  const cerca = inf.aproximados.filter((a) => !a.fuera);
  const fuera = inf.aproximados.filter((a) => a.fuera);
  L.push(`### Colores acercados a la paleta (${cerca.length})`, '', '| original | token | slug | distancia (OKLab×100) | usos | dónde |', '|---|---|---|---|---|---|');
  for (const a of cerca) L.push(`| ${a.original} | \`${a.token}\` | ${a.slug} | ${a.distancia} | ${a.usos} | ${a.sitios.slice(0, 4).join(', ')} |`);
  L.push('', `### Fuera del set (${fuera.length}): más lejos de ${inf.distanciaMaxima} del color más cercano; se tradujeron igual, MARCADOS`, '', '| original | token | slug | distancia | usos | dónde |', '|---|---|---|---|---|---|');
  for (const a of fuera) L.push(`| ${a.original} | \`${a.token}\` | ${a.slug} | ${a.distancia} | ${a.usos} | ${a.sitios.slice(0, 4).join(', ')} |`);
  L.push('', '### Tipografías', '', '| familia | variable | usos | dónde |', '|---|---|---|---|');
  for (const f of inf.familias) L.push(`| ${f.nombre} | ${f.token ? `\`${f.token}\`` : '**FUERA DEL SET (queda literal)**'} | ${f.usos} | ${f.sitios.slice(0, 5).join(', ')} |`);
  return L.join('\n');
}
