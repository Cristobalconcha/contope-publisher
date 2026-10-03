/**
 * Genera el juego de formas de partida para los divisores.
 *
 * POR QUÉ UN GUION Y NO DOCE ARCHIVOS DIBUJADOS A MANO. Porque una onda tiene
 * amplitud y número de crestas, y unos cerros tienen cumbres y valles. Escritos
 * como geometría, se ajustan cambiando un número; dibujados a mano, hay que
 * rehacerlos. Y el día que haga falta una onda más suave para un sitio, sale de
 * acá en un minuto.
 *
 * QUÉ SON ESTAS FORMAS. El punto de partida, no el catálogo. Divi trae 27 y ahí
 * se acaba; acá cualquier SVG del sitio sirve como divisor, así que éstas son
 * sólo para que la biblioteca no esté vacía el primer día.
 *
 * CÓMO ESTÁN HECHAS, y es lo que importa para que funcionen:
 *
 *  - El área va CERRADA contra el borde inferior. Un divisor no es una línea:
 *    es una masa de color que tapa, y por eso el trazo baja hasta abajo y
 *    vuelve. Una curva abierta se vería como un hilo.
 *  - Sin `fill` propio. El color lo pone el diseño: el plugin le añade
 *    `fill="currentColor"` al mostrarlo. Un `fill="#fff"` acá dejaría todas las
 *    formas blancas para siempre.
 *  - `viewBox` de 1200×120 y sin `width`/`height`. El alto real lo decide quien
 *    lo usa, y el estirado es a propósito: un divisor se adapta al ancho de su
 *    sección.
 *  - Sirven igual como máscara, que es como se previsualizan en el editor.
 *
 * Uso:
 *   node scripts/generar-formas-divisor.mjs --destino "../wp-local-econut/wordpress/wp-content/uploads/formas"
 *   node scripts/generar-formas-divisor.mjs --mirar      (dice qué haría)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath y no url.pathname: en Windows el pathname deja sin decodificar
// el %20 de los espacios de la ruta.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = 1200; // ancho del viewBox
const H = 120;  // alto del viewBox

const args = process.argv.slice(2);
const opcion = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const soloMirar = args.includes('--mirar');

/** Redondea para que el archivo no lleve decimales inútiles. */
const r = (n) => Math.round(n * 100) / 100;

/**
 * Una onda senoidal cerrada contra el borde inferior.
 *
 * `crestas` es cuántas ondas completas caben a lo ancho, `amplitud` cuánto
 * sube y baja respecto del medio, y `desfase` permite empezar en valle en vez
 * de en cresta — que es lo que hace que dos ondas iguales no se vean iguales.
 */
function onda({ crestas = 2, amplitud = 28, desfase = 0, base = H * 0.55, pasos = 96 } = {}) {
  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const x = (A / pasos) * i;
    const y = base + Math.sin((i / pasos) * crestas * Math.PI * 2 + desfase) * amplitud;
    puntos.push(`${r(x)} ${r(y)}`);
  }
  return `M0 ${r(puntos[0].split(' ')[1])}L${puntos.join('L')}L${A} ${H}L0 ${H}Z`;
}

/** Cerros: cumbres de distinta altura, con líneas rectas. */
function cerros(alturas) {
  const paso = A / (alturas.length - 1);
  const puntos = alturas.map((a, i) => `${r(paso * i)} ${r(H - a * H)}`);
  return `M${puntos.join('L')}L${A} ${H}L0 ${H}Z`;
}

/** Dientes: un zigzag de `picos` puntas. */
function dientes(picos = 12, alto = 0.6) {
  const paso = A / picos;
  const puntos = ['0 ' + r(H)];
  for (let i = 0; i < picos; i++) {
    puntos.push(`${r(paso * i + paso / 2)} ${r(H - alto * H)}`);
    puntos.push(`${r(paso * (i + 1))} ${r(H)}`);
  }
  return `M${puntos.join('L')}Z`;
}

/** Escalones: una escalera de `n` peldaños. */
function escalones(n = 6) {
  const pasoX = A / n;
  const pasoY = H / n;
  const puntos = ['0 0'];
  for (let i = 1; i <= n; i++) {
    puntos.push(`${r(pasoX * i)} ${r(pasoY * (i - 1))}`);
    puntos.push(`${r(pasoX * i)} ${r(pasoY * i)}`);
  }
  return `M${puntos.join('L')}L${A} ${H}L0 ${H}Z`;
}

/**
 * Nubes: cúpulas de distinto ancho apoyadas en una línea.
 *
 * Los arcos son ELÍPTICOS y no circulares, y ésa es la corrección que hizo
 * falta. Con semicírculos (radio = medio ancho) las nubes anchas pedían más
 * alto del que tiene el lienzo, el arco se recortaba contra el borde y salían
 * con la cima plana: parecían almenas de castillo, no nubes.
 *
 * Con `rx` = medio ancho y `ry` acotado al alto disponible, cada cúpula se
 * achata lo justo para caber entera y conserva su forma redonda.
 */
function nubes(bultos) {
  const total = bultos.reduce((a, b) => a + b.ancho, 0);
  const linea = H * 0.82; // dónde apoyan los bultos
  let x = 0;
  let d = `M0 ${H}L0 ${r(linea)}`;
  for (const bulto of bultos) {
    const ancho = (A * bulto.ancho) / total;
    // Una cuadrática alcanza la mitad de la altura de su punto de control, así
    // que el control va al doble de lo que se quiere ver.
    const cima = linea - linea * bulto.alto * 2;
    d += `Q${r(x + ancho / 2)} ${r(cima)} ${r(x + ancho)} ${r(linea)}`;
    x += ancho;
  }
  return `${d}L${A} ${H}Z`;
}

const FORMAS = [
  {
    archivo: 'pendiente.svg',
    nombre: 'Pendiente',
    // La más usada de todas: una diagonal limpia.
    d: `M0 ${H}L${A} 0L${A} ${H}Z`,
  },
  {
    archivo: 'pendiente-suave.svg',
    nombre: 'Pendiente suave',
    d: `M0 ${H}L${A} ${r(H * 0.45)}L${A} ${H}Z`,
  },
  {
    archivo: 'onda.svg',
    nombre: 'Onda',
    d: onda({ crestas: 2, amplitud: 26 }),
  },
  {
    archivo: 'onda-suave.svg',
    nombre: 'Onda suave',
    d: onda({ crestas: 1, amplitud: 20, base: H * 0.6 }),
  },
  {
    archivo: 'ondas.svg',
    nombre: 'Ondas',
    // Varias crestas chicas: lee como agua, no como colina.
    d: onda({ crestas: 5, amplitud: 16, base: H * 0.6 }),
  },
  {
    archivo: 'curva.svg',
    nombre: 'Curva',
    d: `M0 ${H}Q${r(A / 2)} ${r(-H * 0.35)} ${A} ${H}Z`,
  },
  {
    archivo: 'curva-invertida.svg',
    nombre: 'Curva invertida',
    d: `M0 0Q${r(A / 2)} ${r(H * 1.35)} ${A} 0L${A} ${H}L0 ${H}Z`,
  },
  {
    archivo: 'cerros.svg',
    nombre: 'Cerros',
    // Alturas desiguales a propósito: unos cerros simétricos no parecen cerros.
    d: cerros([0.18, 0.62, 0.3, 0.86, 0.42, 0.7, 0.22]),
  },
  {
    archivo: 'cordillera.svg',
    nombre: 'Cordillera',
    d: cerros([0.1, 0.45, 0.25, 0.95, 0.55, 0.78, 0.35, 0.6, 0.15]),
  },
  {
    archivo: 'triangulo.svg',
    nombre: 'Triángulo',
    d: `M0 ${H}L${r(A / 2)} 0L${A} ${H}Z`,
  },
  {
    archivo: 'dientes.svg',
    nombre: 'Dientes',
    d: dientes(14, 0.55),
  },
  {
    archivo: 'escalones.svg',
    nombre: 'Escalones',
    d: escalones(7),
  },
  {
    archivo: 'nubes.svg',
    nombre: 'Nubes',
    // Bultos de ancho y alto desiguales: una fila de bultos iguales no lee
    // como nubes, lee como un festón.
    d: nubes([
      { ancho: 3, alto: 0.34 }, { ancho: 5, alto: 0.52 }, { ancho: 2, alto: 0.26 },
      { ancho: 4, alto: 0.44 }, { ancho: 6, alto: 0.6 },  { ancho: 3, alto: 0.3 },
      { ancho: 4, alto: 0.46 },
    ]),
  },
  {
    archivo: 'asimetrica.svg',
    nombre: 'Asimétrica',
    // Una curva descentrada: el recurso más útil cuando la sección de al lado
    // tiene su peso visual cargado a un costado.
    d: `M0 ${H}C${r(A * 0.35)} ${r(H * 0.1)} ${r(A * 0.55)} ${r(H * 0.95)} ${A} ${r(H * 0.25)}L${A} ${H}Z`,
  },
];

function svg(forma) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + A + ' ' + H + '">',
    '  <!-- ' + forma.nombre + ' — forma de divisor de ContOpe.',
    '       Sin fill propio a propósito: el color lo pone el diseño. -->',
    '  <path d="' + forma.d + '"/>',
    '</svg>',
    '',
  ].join('\n');
}

const destinoRel = opcion('destino');
if (!destinoRel && !soloMirar) {
  console.error('uso: node generar-formas-divisor.mjs --destino "<carpeta>"   (o --mirar)');
  process.exit(1);
}

console.log(`\n${FORMAS.length} formas, en ${A}×${H}:\n`);
for (const f of FORMAS) {
  console.log(`  ${f.archivo.padEnd(24)} ${f.nombre.padEnd(20)} ${f.d.length} caracteres de trazo`);
}

if (soloMirar) {
  console.log('\n(--mirar: no se escribió nada)\n');
  process.exit(0);
}

const destino = path.resolve(raiz, destinoRel);
await fs.mkdir(destino, { recursive: true });
let escritas = 0;
for (const f of FORMAS) {
  await fs.writeFile(path.join(destino, f.archivo), svg(f), 'utf8');
  escritas++;
}
console.log(`\nEscritas ${escritas} en ${destino}\n`);
