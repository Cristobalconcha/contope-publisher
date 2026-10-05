/**
 * Los títulos de Santa Luisa salen de TRES niveles, y de ninguna otra parte.
 *
 * DE DÓNDE SALE. El sitio entregado al cliente tenía 26 tamaños de letra
 * distintos entre sus cinco páginas y 47 tratamientos tipográficos en la
 * portada, cada uno usado una sola vez. Los inventé yo al construirlo; nadie los
 * pidió. Cristóbal, el 4 de octubre de 2026:
 *
 *   «Si tengo un estilo de título, el estilo de título debería ser el mismo para
 *    todas las secciones… si vamos a considerar que es un tipo de título
 *    distinto porque es más chico o más grande, entonces ni servirían los
 *    estilos CSS, mejor sería hacerlo con estilos en línea. Estamos trabajando
 *    en un sistema de diseño sin sistema de diseño.»
 *
 * La escala que aprobó, con sus propias palabras como criterio —«la portada
 * tiene en el hero una clase especial porque es más grande; las secciones tienen
 * un título de sección; los mapas podrían tener uno más pequeño porque están
 * metidos en un recuadro»—, está en scripts/santaluisa/diseno.mjs.
 *
 * POR QUÉ SE MIDE EN EL NAVEGADOR Y NO EN EL CÓDIGO. Porque el defecto no era
 * declarar mal: era declarar DE MÁS, en muchos sitios distintos, y que nada lo
 * sumara. Leer las reglas de un archivo no habría visto los 48px que salían de
 * otro. Lo único que contesta «¿cuántos tamaños de título tiene este sitio?» es
 * contarlos en la página.
 *
 * Y POR QUÉ UN TRINQUETE Y NO UN SEMÁFORO. La portada todavía no está compuesta
 * —son 281 KB de HTML heredado—, así que hoy arrastra tamaños fuera de escala.
 * Se declara cuántos se aceptan; si aparece uno más, falla. Al componerla, el
 * número baja y hay que bajar el techo.
 *
 * Corre contra el ESPEJO LOCAL (puerto 8890). Nunca contra el sitio del cliente.
 */
import { abrirChrome, esperarLaPagina, dormir } from './piezas/chrome.mjs';

const BASE = 'http://localhost:8890';

/**
 * Los tres niveles, en su medida de escritorio (el extremo alto del clamp).
 * Cada cara de cada nivel. Si un título mide otra cosa, está fuera de escala.
 */
const ESCALA = {
  'portada · versales': 68,
  'portada · llana': 32,
  'sección · cursiva': 58,
  'sección · versales': 36,
  'sección · llana': 24,
  'recuadro · cursiva': 44,
  'recuadro · versales': 26,
  'recuadro · llana': 18,
};
const PERMITIDOS = new Set(Object.values(ESCALA));

/**
 * Las páginas ya compuestas no aceptan NINGÚN tamaño fuera de escala. La portada
 * sigue siendo HTML heredado y arrastra los suyos: es deuda declarada, no un
 * permiso. Al componerla, bajar a 0 y borrar la línea.
 */
const TECHOS = {
  '/diferenciales/': 0,
  '/preguntas-frecuentes/': 0,
  '/contacto/': 0,
  '/terminos-y-condiciones/': 0,
  // 4, y vuelve a ser 4 a propósito.
  //
  // El 4 de octubre llegó a 0 porque compuse la portada. Al día siguiente esa
  // composición se descartó entera: no reproducía el diseño de Cristóbal, lo
  // reinterpretaba. Se restauró su portada original y con ella volvieron sus
  // cuatro tamaños sueltos: 55 y 48 en la cursiva, 34 y 30 en las versales.
  //
  // No son otro nivel: son el de sección escrito dos veces a ojo, y bajan a 0
  // cuando se normalice la página de verdad (ver
  // Sesión Claude/MIGRACION-normalizar-paginas.md). Dejarlo en 0 sería mentir
  // sobre el estado del sitio, que es lo que este trinquete existe para evitar.
  '/': 4,
};

let fallas = 0;
const comprobar = (caso, ok, detalle = '') => {
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (detalle ? `   ${detalle}` : ''));
  if (!ok) fallas += 1;
};

const { cdp, evaluar, cerrar } = await abrirChrome({ ancho: 1280, alto: 900, escala: 1 });
await cdp('Page.enable');

/*
 * Se mide a 1280 para leer el extremo ALTO de cada clamp. A un ancho menor cada
 * nivel da un valor intermedio y distinto, y compararlo contra la escala daría
 * un falso positivo en todas partes.
 */
console.log('\n== cada título sale de uno de los tres niveles ==');

const fuera = {};
for (const ruta of Object.keys(TECHOS)) {
  await cdp('Page.navigate', { url: BASE + ruta });
  await esperarLaPagina(evaluar);
  await dormir(600);

  /*
   * Se miden los TRAMOS, no el encabezado que los contiene. Un título de dos
   * caras es un solo h2 con dos <span> adentro, cada uno con su cara: medir el
   * h2 devuelve el tamaño heredado del contenedor y no dice nada. Me pasó: la
   * primera medición de este sitio dio «24px en todas partes» y era falsa.
   */
  const medidas = JSON.parse(await evaluar(`JSON.stringify(
    [...document.querySelectorAll('h1,h2,h3')]
      // El título del FORMULARIO no cuenta: lo dibuja el runtime de Orugantt
      // Forms y, por contrato, el lienzo lo estila por variables y nunca con
      // reglas sobre sus campos. Contarlo acá hacía fallar a Contacto por un
      // tamaño que no es nuestro y que no se arregla desde la composición.
      .filter((h) => h.closest('.cod-mcp-page, .cod-canvas-published') && !h.closest('.ofr-form'))
      .flatMap((h) => {
        const tramos = [...h.querySelectorAll('span')];
        return (tramos.length ? tramos : [h]).map((e) => ({
          tam: Math.round(parseFloat(getComputedStyle(e).fontSize)),
          txt: e.textContent.trim().slice(0, 30),
        }));
      })
  )`));

  const sueltos = medidas.filter((m) => !PERMITIDOS.has(m.tam));
  fuera[ruta] = sueltos;

  const techo = TECHOS[ruta];
  comprobar(
    `${ruta.padEnd(26)} ${medidas.length} títulos, ${sueltos.length} fuera de escala (techo ${techo})`,
    sueltos.length <= techo,
    sueltos.length > techo ? 'APARECIÓ UNO NUEVO: se eligió un tamaño fuera de los tres niveles' : ''
  );
  if (sueltos.length < techo) {
    comprobar(`  el techo de ${ruta} quedó alto: bajarlo a ${sueltos.length}`, false);
  }
  for (const s of sueltos) {
    console.log(`           · ${s.tam}px  «${s.txt}»`);
  }
}

/*
 * Y los tres niveles tienen que EXISTIR de verdad en el sitio. Un trinquete que
 * sólo cuenta lo que sobra pasaría igual con un sitio de un solo tamaño, que es
 * el error contrario y también es un sistema roto.
 */
console.log('\n== y los niveles que el sitio usa son los declarados ==');
await cdp('Page.navigate', { url: BASE + '/diferenciales/' });
await esperarLaPagina(evaluar);
await dormir(600);
const usados = new Set(JSON.parse(await evaluar(`JSON.stringify(
  [...document.querySelectorAll('h1,h2,h3')]
    .filter((h) => h.closest('.cod-mcp-page'))
    .flatMap((h) => [...h.querySelectorAll('span')].map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize))))
)`)));
comprobar('las interiores usan el nivel de sección en sus dos caras',
  usados.has(ESCALA['sección · cursiva']) && usados.has(ESCALA['sección · versales']),
  [...usados].sort((a, b) => b - a).join(', ') + 'px');

await cerrar();

console.log('\n' + (fallas === 0 ? 'todo en orden\n' : `${fallas} fallas\n`));
process.exit(fallas === 0 ? 0 : 1);
