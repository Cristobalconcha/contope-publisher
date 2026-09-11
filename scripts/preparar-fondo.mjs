/**
 * Prepara la foto de fondo del banner en los tamaños que sirve el sitio.
 *
 *   node preparar-fondo.mjs <foto-original> [carpeta-salida]
 *
 * Produce, recortando SIEMPRE desde el centro y sin deformar:
 *   · escritorio  2880 x 1800  (notebooks retina y monitores)
 *   · celular     1300 x 2800  (encuadre vertical del teléfono)
 * de cada uno, un WebP (el que se sirve) y un JPG (respaldo del <picture>).
 *
 * Por qué dos archivos y no uno: en el celular la pantalla es vertical, así que
 * lo que manda es el ALTO. Una foto horizontal de 1800px de alto tiene que
 * estirarse hasta ~2800 para llenar un iPhone, y ahí se pierden los detalles.
 * Con dos archivos el navegador descarga solo el que le toca.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const FFMPEG = [
  process.env.FFMPEG_PATH,
  'C:/Users/Cristobal concha/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe',
  'ffmpeg',
].filter(Boolean).find((c) => c === 'ffmpeg' || existsSync(c));

const MEDIDAS = [
  { nombre: 'escritorio', ancho: 2880, alto: 1800 },
  { nombre: 'movil', ancho: 1300, alto: 2800 },
];

const origen = process.argv[2];
const destino = process.argv[3] || path.dirname(origen || '.');
if (!origen || !existsSync(origen)) {
  console.log('Uso: node preparar-fondo.mjs <foto-original> [carpeta-salida]');
  process.exit(1);
}
mkdirSync(destino, { recursive: true });

const base = path.basename(origen).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

function generar(medida, formato, calidad) {
  const salida = path.join(destino, `${base}-${medida.nombre}.${formato}`);
  const A = medida.ancho / medida.alto;
  // Recorte centrado a la proporción pedida, luego escalado. Nunca deforma.
  const filtro = `crop='min(iw,ih*${A})':'min(ih,iw/${A})',scale=${medida.ancho}:${medida.alto}:flags=lanczos`;
  const args = ['-y', '-loglevel', 'error', '-i', origen, '-vf', filtro];
  if (formato === 'webp') args.push('-c:v', 'libwebp', '-quality', String(calidad), '-compression_level', '6');
  else args.push('-q:v', String(calidad));
  args.push(salida);
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  return { salida, kb: Math.round(statSync(salida).size / 1024) };
}

console.log('origen:', origen);
const hechos = [];
for (const medida of MEDIDAS) {
  const webp = generar(medida, 'webp', 82);
  const jpg = generar(medida, 'jpg', 4); // -q:v 4 ≈ calidad alta en JPEG de ffmpeg
  hechos.push({ medida, webp, jpg });
  console.log(
    `  ${medida.nombre.padEnd(11)}${medida.ancho}x${medida.alto}`.padEnd(34) +
    `webp ${String(webp.kb).padStart(4)} KB   ·   jpg ${String(jpg.kb).padStart(4)} KB`
  );
}
const totalWebp = hechos.reduce((n, h) => n + h.webp.kb, 0);
console.log(`\nArchivos en: ${destino}`);
console.log(`El visitante descarga UNO solo: ${hechos.map((h) => h.webp.kb + ' KB').join(' o ')} (no ${totalWebp} KB).`);
