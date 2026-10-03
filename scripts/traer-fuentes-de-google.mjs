/**
 * Trae al sitio las tipografías que estaba sirviendo Google.
 *
 * POR QUÉ. Una hoja de `fonts.googleapis.com` le entrega a Google la dirección
 * IP de cada visitante **antes de que acepte nada**, y la IP es un dato
 * personal. Es el único tercero que seguía cargando sin permiso en la portada
 * de Econut después de poner la puerta a las etiquetas de medición (0.3.48).
 *
 * Y no se arregla con la puerta del consentimiento. Una etiqueta de medición
 * puede esperar; una tipografía no: si espera, el texto se dibuja con otra
 * letra y la página salta cuando la persona acepta. Lo correcto es que la
 * tipografía no sea de un tercero. Trayéndola, el sitio queda en regla y
 * además carga más rápido y deja de depender de que Google siga sirviendo esa
 * URL.
 *
 * QUÉ SE QUEDA FUERA. Google devuelve la misma letra partida por alfabetos:
 * latino, latino extendido, cirílico, griego, hebreo, vietnamita, matemáticas
 * y símbolos. Para este sitio se guardan `latin` y `latin-ext` y se descartan
 * los demás: de 68 archivos a 24. Las tildes y la eñe del español viven en
 * `latin` (U+0000–00FF); `latin-ext` cubre los nombres extranjeros.
 *
 * Esto NO cambia cómo se ve la página: son los mismos archivos de letra que
 * servía Google, con las mismas métricas. Los `unicode-range` se conservan tal
 * cual, así que un carácter de un alfabeto descartado hace lo que hacía antes
 * de que existiera Google Fonts: lo dibuja la letra que tenga el sistema.
 *
 * Uso:
 *   node scripts/traer-fuentes-de-google.mjs \
 *     --css "https://fonts.googleapis.com/css2?family=…" \
 *     --destino "../contope-econut/fuentes"
 *
 *   --alfabetos latin,latin-ext   (por omisión)
 *   --todos                       se queda con todos los alfabetos
 *   --mirar                       dice qué haría, sin escribir nada
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath y no url.pathname: en Windows el pathname deja sin decodificar
// el %20 de los espacios de la ruta, y entonces el archivo «no existe».
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Un navegador de verdad. Google devuelve `woff2` sólo a quien dice soportarlo;
// a un cliente que no reconoce le manda `ttf`, que pesa el triple.
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const opcion = (nombre, omision = null) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : omision;
};
const bandera = (nombre) => args.includes(`--${nombre}`);

const css = opcion('css');
const destinoRel = opcion('destino');
const soloMirar = bandera('mirar');
const todos = bandera('todos');
const alfabetos = (opcion('alfabetos', 'latin,latin-ext') || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!css || !destinoRel) {
  console.error('uso: node traer-fuentes-de-google.mjs --css "<url css2>" --destino "<carpeta>"');
  process.exit(1);
}

const destino = path.resolve(raiz, destinoRel);
const carpetaLetras = path.join(destino, 'letras');

/** Parte la hoja en bloques `@font-face`, cada uno con el alfabeto que lo precede. */
function bloques(hoja) {
  const fuera = [];
  // Google pone el alfabeto en un comentario justo antes de cada bloque.
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(hoja)) !== null) {
    fuera.push({ alfabeto: m[1], cuerpo: m[2] });
  }
  return fuera;
}

const dato = (cuerpo, propiedad) => {
  const m = cuerpo.match(new RegExp(`${propiedad}\\s*:\\s*([^;]+);`, 'i'));
  return m ? m[1].trim().replace(/^'|'$/g, '') : '';
};

/**
 * El nombre del archivo local. Se construye con familia, estilo, peso y
 * alfabeto —no con el nombre que trae Google, que es un revoltijo de letras y
 * no dice nada— para que al mirar la carpeta se entienda qué es cada archivo.
 */
function nombreLocal(cuerpo, alfabeto) {
  const familia = dato(cuerpo, 'font-family').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const estilo = dato(cuerpo, 'font-style') === 'italic' ? 'italic' : 'normal';
  const peso = (dato(cuerpo, 'font-weight') || '400').replace(/\s+/g, '-');
  return `${familia}-${peso}-${estilo}-${alfabetoSeguro(alfabeto)}.woff2`;
}

const alfabetoSeguro = (a) => a.replace(/[^a-z0-9-]/gi, '');

async function main() {
  const r = await fetch(css, { headers: { 'User-Agent': NAVEGADOR } });
  if (!r.ok) throw new Error(`Google devolvió ${r.status} al pedir la hoja`);
  const hoja = await r.text();

  const todosLosBloques = bloques(hoja);
  if (todosLosBloques.length === 0) {
    throw new Error('No se reconoció ningún @font-face en la hoja. ¿Cambió el formato?');
  }

  const elegidos = todos
    ? todosLosBloques
    : todosLosBloques.filter((b) => alfabetos.includes(b.alfabeto));

  const descartados = todosLosBloques.length - elegidos.length;
  const familias = [...new Set(elegidos.map((b) => dato(b.cuerpo, 'font-family')))];

  console.log(`\nLa hoja de Google trae ${todosLosBloques.length} variantes.`);
  console.log(`Se traen ${elegidos.length} (${alfabetos.join(', ')}) y se descartan ${descartados}.`);
  console.log(`Familias: ${familias.join(' · ')}\n`);

  if (elegidos.length === 0) {
    throw new Error(`Ningún bloque es de los alfabetos pedidos. Los que hay: ${[...new Set(todosLosBloques.map((b) => b.alfabeto))].join(', ')}`);
  }

  const piezas = [];
  for (const b of elegidos) {
    const url = (b.cuerpo.match(/url\(([^)]+)\)/) || [])[1];
    if (!url) {
      console.log(`  (sin url, se salta)  ${dato(b.cuerpo, 'font-family')} ${b.alfabeto}`);
      continue;
    }
    piezas.push({ ...b, url: url.replace(/['"]/g, ''), archivo: nombreLocal(b.cuerpo, b.alfabeto) });
  }

  if (soloMirar) {
    for (const p of piezas) console.log(`  ${p.archivo}`);
    console.log(`\n(--mirar: no se escribió nada)\n`);
    return;
  }

  await fs.mkdir(carpetaLetras, { recursive: true });

  let bajados = 0;
  let yaEstaban = 0;
  for (const p of piezas) {
    const ruta = path.join(carpetaLetras, p.archivo);
    // Un archivo de letra de una versión concreta no cambia nunca. Si ya está,
    // no se vuelve a pedir: así el guion se puede correr otra vez sin castigar
    // a nadie.
    try {
      const st = await fs.stat(ruta);
      if (st.size > 0) {
        yaEstaban++;
        continue;
      }
    } catch {
      /* no estaba */
    }
    const rf = await fetch(p.url, { headers: { 'User-Agent': NAVEGADOR } });
    if (!rf.ok) throw new Error(`${p.archivo}: Google devolvió ${rf.status}`);
    const buf = Buffer.from(await rf.arrayBuffer());
    if (buf.length < 200) throw new Error(`${p.archivo}: llegó vacío (${buf.length} bytes)`);
    await fs.writeFile(ruta, buf);
    bajados++;
  }

  // La hoja local. Se reescribe la `url(...)` a una ruta relativa, y se deja
  // todo lo demás —peso, estilo, `unicode-range`— exactamente como lo manda
  // Google: es lo que hace que la página se vea igual.
  const cabecera = [
    '/*',
    ' * Las tipografías del sitio, servidas por el sitio.',
    ' *',
    ' * Generado por scripts/traer-fuentes-de-google.mjs. No se edita a mano:',
    ' * se vuelve a correr el guion.',
    ' *',
    ' * Son los MISMOS archivos que servía Google, con las mismas métricas y los',
    ' * mismos `unicode-range`. Lo que cambia es quién los sirve: antes, cada',
    ' * visitante le entregaba su IP a Google antes de aceptar nada.',
    ' *',
    ` * Hoja de origen: ${css}`,
    ` * Alfabetos: ${todos ? 'todos' : alfabetos.join(', ')}`,
    ` * Traído el ${new Date().toISOString().slice(0, 10)}`,
    ' */',
    '',
  ].join('\n');

  const cuerpo = piezas
    .map((p) => {
      const dentro = p.cuerpo
        .replace(/url\([^)]+\)/, `url('letras/${p.archivo}')`)
        .replace(/@font-face\s*\{/, '')
        .replace(/\}$/, '')
        .trim();
      return `/* ${dato(p.cuerpo, 'font-family')} · ${p.alfabeto} */\n@font-face {\n  ${dentro}\n}`;
    })
    .join('\n\n');

  const hojaLocal = path.join(destino, 'fuentes.css');
  await fs.writeFile(hojaLocal, `${cabecera}${cuerpo}\n`, 'utf8');

  const pesoTotal = (
    await Promise.all(piezas.map((p) => fs.stat(path.join(carpetaLetras, p.archivo)).then((s) => s.size)))
  ).reduce((a, b) => a + b, 0);

  console.log(`Bajados ${bajados}, ya estaban ${yaEstaban}.`);
  console.log(`Pesan ${(pesoTotal / 1024).toFixed(0)} kB en total.`);
  console.log(`\nHoja:   ${path.relative(raiz, hojaLocal)}`);
  console.log(`Letras: ${path.relative(raiz, carpetaLetras)}\n`);
  console.log('Falta encolar esta hoja en vez de la de Google en el functions.php del tema.\n');
}

main().catch((e) => {
  console.error(`\nNo se pudo: ${e.message}\n`);
  process.exit(1);
});
