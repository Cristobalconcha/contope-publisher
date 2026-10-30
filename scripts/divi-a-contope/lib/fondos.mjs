/**
 * Fondos de Divi → módulo de fondos de ContOpe (regla `surface`).
 *
 * Lee el `background-image` COMPUTADO de una sección —lo que midió el navegador,
 * por ejemplo
 *   linear-gradient(rgb(12, 113, 195) 0%, rgba(255, 255, 255, 0) 100%), url("…/portada.jpg")
 * — y lo parte en capas (de arriba hacia abajo, como CSS), traduciendo cada
 * degradado a la ESTRUCTURA `backgroundGradient` que valida el plugin. Nunca
 * pasa CSS crudo: si algo de un degradado no cabe en la estructura, lo dice.
 *
 * Qué cabe: linear y radial, repeating, ángulo (o `to <lado>`), forma
 * circle/ellipse, posición `at …`, 2 a 8 paradas con color y posición (una
 * parada con dos posiciones se expande en dos). Qué NO cabe y se avisa:
 * pistas de punto medio (`50%` suelto), tamaños de radial distintos del
 * predeterminado (`closest-side`…), esquinas (`to top right`, que dependen de la
 * proporción de la caja), colores que no son rgb()/hsl()/hex, más de 8 paradas,
 * más de un degradado en la misma sección.
 */
import { leerColor, redondear } from './util.mjs';

/** Parte `texto` por las comas que no están dentro de paréntesis. */
export function partirNivel(texto) {
  const partes = [];
  let nivel = 0;
  let actual = '';
  for (const ch of String(texto || '')) {
    if (ch === '(') nivel += 1;
    if (ch === ')') nivel -= 1;
    if (ch === ',' && nivel === 0) { partes.push(actual.trim()); actual = ''; } else actual += ch;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

/**
 * Las capas de un `background-image`, de arriba hacia abajo.
 * @returns {{tipo: 'degradado'|'imagen'|'otra', texto: string}[]}
 */
export function capasDeFondo(imagenFondo) {
  const t = String(imagenFondo || '').trim();
  if (!t || t === 'none') return [];
  return partirNivel(t).filter((c) => c !== 'none').map((texto) => ({
    tipo: /^(?:repeating-)?(?:linear|radial)-gradient\(/.test(texto) ? 'degradado' : /^url\(/.test(texto) ? 'imagen' : 'otra',
    texto,
  }));
}

const LADOS = { top: 0, right: 90, bottom: 180, left: 270 };

/** Un color medido → texto de color seguro para la regla, o null si no se sabe leer. */
function colorDeParada(texto) {
  const t = String(texto).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(t) || t === 'transparent' || t === 'currentColor') return t;
  const k = leerColor(t);
  if (k && [k.r, k.g, k.b, k.a].every((n) => Number.isFinite(n))) {
    return k.a === 1 ? `rgb(${k.r}, ${k.g}, ${k.b})` : `rgba(${k.r}, ${k.g}, ${k.b}, ${redondear(k.a, 3)})`;
  }
  return null;
}

const ES_POSICION = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|vmin|vmax|ch)$|^0$/;

/**
 * Un degradado medido → `backgroundGradient`.
 * @returns {{valor: object|null, perdidas: string[]}} `valor` null si no se pudo; `perdidas` dice qué no cupo.
 */
export function traducirDegradado(texto) {
  const perdidas = [];
  const m = String(texto).trim().match(/^(repeating-)?(linear|radial)-gradient\(([^]*)\)$/);
  if (!m) return { valor: null, perdidas: [`no se reconoce como degradado: «${String(texto).slice(0, 60)}»`] };
  const tipo = m[2];
  const args = partirNivel(m[3]);
  const g = { type: tipo };
  if (m[1]) g.repeating = true;

  // La cabeza: lo que no es una parada de color. Una parada empieza por un color;
  // la cabeza, por un ángulo, `to …`, o las palabras de forma/tamaño/posición.
  const esCabeza = (a) => (tipo === 'linear'
    ? /^(?:-?[\d.]+(?:deg|turn|rad|grad)|to\s)/.test(a)
    : /^(?:circle|ellipse|closest-|farthest-|at\s|[\d.]+(?:px|%|em|rem)\s)/.test(a));
  let paradas = args;
  if (args.length && esCabeza(args[0])) {
    const cabeza = args[0];
    paradas = args.slice(1);
    if (tipo === 'linear') {
      const ang = cabeza.match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
      const lado = cabeza.match(/^to\s+(top|right|bottom|left)$/);
      if (ang) {
        const n = Number(ang[1]);
        const deg = { deg: n, turn: n * 360, rad: (n * 180) / Math.PI, grad: n * 0.9 }[ang[2]];
        // 180deg es el valor por omisión de CSS: el plugin lo omite.
        if (redondear(deg, 2) !== 180) g.angle = `${redondear(deg, 2)}deg`;
      } else if (lado) {
        if (LADOS[lado[1]] !== 180) g.angle = `${LADOS[lado[1]]}deg`;
      } else {
        const esq = cabeza.match(/^to\s+(top|bottom)\s+(left|right)$|^to\s+(left|right)\s+(top|bottom)$/);
        if (esq) {
          const v = esq[1] || esq[4]; const h = esq[2] || esq[3];
          const deg = { 'top-right': 45, 'bottom-right': 135, 'bottom-left': 225, 'top-left': 315 }[`${v}-${h}`];
          g.angle = `${deg}deg`;
          perdidas.push(`«${cabeza}» depende de la proporción de la caja: se aproximó con ${deg}deg`);
        } else perdidas.push(`dirección «${cabeza}» no reconocida: queda hacia abajo`);
      }
    } else {
      const sinAt = cabeza.replace(/\s+at\s+.*$/, '').replace(/^at\s+.*$/, '').trim();
      const en = cabeza.match(/(?:^|\s)at\s+(.+)$/);
      const forma = sinAt.match(/\b(circle|ellipse)\b/);
      if (forma) g.shape = forma[1];
      const resto = sinAt.replace(/\b(circle|ellipse)\b/, '').trim();
      if (resto && resto !== 'farthest-corner') perdidas.push(`tamaño de radial «${resto}» no cabe (el plugin usa farthest-corner)`);
      if (en) g.at = en[1].trim();
    }
  }

  const stops = [];
  for (const p of paradas) {
    const cm = p.match(/^(rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8}|transparent|currentColor|[a-z]+)\s*(.*)$/i);
    if (!cm) {
      // Una pista de punto medio (`50%` suelto) o algo que no es un color.
      perdidas.push(`parada «${p}» no cabe (punto medio o color no legible): se omitió`);
      continue;
    }
    const color = colorDeParada(cm[1]);
    if (!color) {
      perdidas.push(`color «${cm[1]}» no se puede escribir como color seguro: se omitió esa parada`);
      continue;
    }
    const posiciones = cm[2].split(/\s+/).filter(Boolean);
    if (posiciones.some((x) => !ES_POSICION.test(x)) || posiciones.length > 2) {
      perdidas.push(`posición «${cm[2]}» de una parada no cabe: la parada va sin posición`);
      stops.push({ color });
      continue;
    }
    if (!posiciones.length) stops.push({ color });
    // Una parada con dos posiciones es un tramo plano: dos paradas del mismo color.
    for (const at of posiciones) stops.push({ color, at });
  }
  if (stops.length < 2) {
    perdidas.push('quedaron menos de 2 paradas: no se pudo transcribir el degradado');
    return { valor: null, perdidas };
  }
  if (stops.length > 8) {
    perdidas.push(`${stops.length} paradas: el plugin admite 8; se conservaron las primeras 7 y la última`);
    g.stops = [...stops.slice(0, 7), stops[stops.length - 1]];
  } else g.stops = stops;
  return { valor: g, perdidas };
}
