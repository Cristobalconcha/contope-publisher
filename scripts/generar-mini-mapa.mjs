/**
 * Genera la imagen del mini mapa (el cuadrado de 60x60 de la conducta «mapa») con
 * la API de imágenes estáticas de Mapbox, y la deja como un archivo.
 *
 * SE CORRE UNA SOLA VEZ por mapa, a mano, y el archivo se sube al sitio como
 * cualquier otra imagen (Medios de WordPress). Esa es la gracia: la vista del mini
 * nunca cambia —es siempre el mismo encuadre, el mismo estilo y el mismo tamaño—,
 * así que pedírsela a Mapbox en cada visita sería pagar un viaje por algo que ya
 * sabemos cómo se ve. Con un archivo propio el mini:
 *   - no necesita la clave de Mapbox del sitio,
 *   - no consume cuota de la cuenta,
 *   - no hace ninguna petición a un tercero (no entra al consentimiento de cookies),
 *   - se ve sin JavaScript y sin red hacia afuera.
 * El mapa GRANDE sí usa Mapbox GL y sí necesita la clave (Configuración → Mapa).
 *
 * Uso:
 *   MAPBOX_TOKEN=pk.… node scripts/generar-mini-mapa.mjs \
 *       --lng -70.6816 --lat -33.8041 --zoom 2 --salida mini-mapa.png
 *
 * Opciones:
 *   --lng, --lat    el centro, en grados (longitud -180..180, latitud -90..90). Requeridos.
 *   --zoom          0..22; por omisión 2 (el país entero: el mini funciona como un icono, no como un mapa).
 *   --ancho, --alto en píxeles CSS, 1..1280; por omisión 60 y 60. La imagen sale al doble
 *                   (@2x) para que se vea nítida en pantallas de alta densidad: 60x60 → 120x120 px.
 *   --escala        1 o 2; por omisión 2.
 *   --estilo        un estilo de Mapbox: «light-v10» (por omisión) o «usuario/idDelEstilo».
 *   --salida        dónde dejar el archivo (.png). Requerido. No pisa uno existente salvo con --forzar.
 *   --forzar        permite reemplazar un archivo que ya existe.
 *   --solo-url      no pide nada: imprime la dirección con la clave tapada (para revisarla).
 *
 * La clave se lee de la variable de entorno MAPBOX_TOKEN (nunca como argumento, que
 * queda en el historial del terminal) y no se escribe en ninguna parte. Sirve una
 * clave pública (pk.): la imagen estática no necesita una secreta.
 *
 * ATRIBUCIÓN: la imagen que entrega Mapbox ya lleva incrustados su logotipo y el
 * texto «© Mapbox © OpenStreetMap». Este guion no recorta ni tapa nada, y al
 * ponerla en la página no se debe recortar tampoco (la conducta «mapa» la muestra
 * entera, sin object-fit: cover).
 *
 * Las condiciones de Mapbox sobre guardar sus imágenes estáticas son de ellos y
 * pueden cambiar: antes de usar el archivo en producción conviene leerlas
 * (https://www.mapbox.com/legal/tos) y confirmar que guardar esta vista está permitido.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ESTILO_POR_OMISION = 'light-v10';

/**
 * Comprueba los parámetros y devuelve los valores ya numéricos, o lanza un Error
 * que NOMBRA el campo. Va aparte para poder probarlo sin red.
 */
export function validar(entrada) {
  const numero = (nombre, valor, minimo, maximo, porOmision) => {
    if (valor === undefined || valor === null || valor === '') {
      if (porOmision !== undefined) return porOmision;
      throw new Error(`Falta --${nombre}.`);
    }
    const n = Number(valor);
    if (!Number.isFinite(n) || n < minimo || n > maximo) {
      throw new Error(`--${nombre} debe ser un número entre ${minimo} y ${maximo} (se recibió «${valor}»).`);
    }
    return n;
  };
  const lng = numero('lng', entrada.lng, -180, 180);
  const lat = numero('lat', entrada.lat, -90, 90);
  const zoom = numero('zoom', entrada.zoom, 0, 22, 2);
  const ancho = numero('ancho', entrada.ancho, 1, 1280, 60);
  const alto = numero('alto', entrada.alto, 1, 1280, 60);
  const escala = numero('escala', entrada.escala, 1, 2, 2);
  if (!Number.isInteger(ancho) || !Number.isInteger(alto)) throw new Error('--ancho y --alto deben ser enteros.');
  if (escala !== 1 && escala !== 2) throw new Error('--escala debe ser 1 o 2.');
  const estilo = String(entrada.estilo ?? ESTILO_POR_OMISION);
  // «light-v10» (de Mapbox) o «usuario/idDelEstilo» (uno propio): sólo letras, números y - _
  if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?$/.test(estilo)) {
    throw new Error(`--estilo no es un estilo de Mapbox válido (se recibió «${estilo}»). Usa «light-v10» o «usuario/idDelEstilo».`);
  }
  return { lng, lat, zoom, ancho, alto, escala, estilo };
}

/**
 * La dirección de la API de imágenes estáticas. Con `token` null devuelve la
 * dirección con la clave tapada, que es la que se puede mostrar.
 */
export function construirUrl(entrada, token) {
  const { lng, lat, zoom, ancho, alto, escala, estilo } = validar(entrada);
  const dueno = estilo.includes('/') ? estilo : `mapbox/${estilo}`;
  const arroba = escala === 2 ? '@2x' : '';
  const clave = token ? encodeURIComponent(token) : 'pk.TAPADA';
  return `https://api.mapbox.com/styles/v1/${dueno}/static/${lng},${lat},${zoom}/${ancho}x${alto}${arroba}?access_token=${clave}`;
}

function leerArgumentos(argv) {
  const salida = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`No entiendo «${a}».`);
    const nombre = a.slice(2);
    if (nombre === 'forzar' || nombre === 'solo-url') {
      salida[nombre === 'solo-url' ? 'soloUrl' : nombre] = true;
      continue;
    }
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) throw new Error(`Falta el valor de --${nombre}.`);
    salida[nombre] = valor;
    i += 1;
  }
  return salida;
}

async function main() {
  const argumentos = leerArgumentos(process.argv.slice(2));
  const parametros = validar(argumentos);
  if (argumentos.soloUrl) {
    console.log(construirUrl(argumentos, null));
    return;
  }
  if (!argumentos.salida) throw new Error('Falta --salida (dónde dejar el archivo, por ejemplo mini-mapa.png).');
  const destino = path.resolve(argumentos.salida);
  if (!/\.png$/i.test(destino)) throw new Error('--salida debe terminar en .png (es lo que entrega Mapbox).');
  if (existsSync(destino) && !argumentos.forzar) {
    throw new Error(`Ya existe ${destino}. Usa --forzar para reemplazarlo.`);
  }
  const token = process.env.MAPBOX_TOKEN || '';
  if (!/^pk\./.test(token)) {
    throw new Error('Falta la variable de entorno MAPBOX_TOKEN con una clave pública de Mapbox (empieza con «pk.»).');
  }

  const respuesta = await fetch(construirUrl(argumentos, token));
  if (!respuesta.ok) {
    // El cuerpo del error de Mapbox es un JSON corto y no lleva la clave.
    throw new Error(`Mapbox respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 300)}`);
  }
  if (!String(respuesta.headers.get('content-type') || '').startsWith('image/')) {
    throw new Error('Mapbox no devolvió una imagen.');
  }
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, bytes);
  const real = parametros.escala;
  console.log(`Listo: ${destino}`);
  console.log(`  ${parametros.ancho * real}x${parametros.alto * real} px (se muestra a ${parametros.ancho}x${parametros.alto}), ${bytes.length} bytes.`);
  console.log('  Súbela a Medios de WordPress y pon su URL en el campo «mini» del nodo del mapa. Se hace una sola vez.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Error: ' + e.message);
    process.exit(1);
  });
}
