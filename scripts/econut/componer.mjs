/**
 * Rearma econut.cl dentro de ContOpe, FIEL al sitio que existe.
 *
 * Lo anterior se descarta: era una versión mía, y lo que Cristóbal pidió es su
 * página corriendo en su sistema. Su crítica, textual: «veo que es una landing
 * que podría ser hecha en HTML simplemente… las tipografías están mal
 * proporcionadas, tiradas encima de las fotos».
 *
 * Todo lo de acá sale de medir el sitio real con el navegador, no de deducirlo
 * de su hoja de estilos (los colores más repetidos ahí eran los de Divi):
 *   fondos   blanco y beige #DBD4C0 alternados
 *   títulos  #DC4017, Bodoni Moda en la portada y Big Shoulders en secciones
 *   texto    #666666
 *   oscuro   #222222 (pie) · aviso #FFF6C1
 *
 * Y tres decisiones de forma que el original sí toma y la versión anterior no:
 *   - la portada es PARTIDA: texto a un lado, foto al otro. El título no va
 *     tirado encima de la imagen.
 *   - las cifras son una barra blanca sobre el beige, no números sueltos.
 *   - cada sección entra con movimiento. Antes había reveal en 4 nodos de 113.
 */
import { REDES } from './redes.mjs';
import { writeFileSync } from 'node:fs';

const NARANJA = '#DC4017';
const BEIGE = '#DBD4C0';
const BLANCO = '#FFFFFF';
const TEXTO = '#333333';
const SUAVE = '#666666';
const VERDE = '#2E594A';
const OSCURO = '#222222';
const AVISO = '#FFF6C1';

const M = '/wp-content/uploads/2026/09/';

const f = {
  logo: M + 'Logo-20.png',
  fichaNCC: M + 'Ficha-T-de-Proceso-NCC-2022.pdf',   // la ficha técnica que enlaza el primer servicio
  logoHorizontal: M + 'Logo-horizontal-@svg.svg',
  iconoAlerta: M + 'Icono-alerta@2x.png',
  // El mismo triángulo en vector, trazado desde el alfa del PNG
  // (scripts/vectorizar-icono-alerta.php). El PNG queda por si hiciera falta
  // volver a medirlo.
  iconoAlertaSvg: '/wp-content/uploads/2026/10/icono-alerta.svg',
  portadaFondo: M + 'portada-fondo.jpg',
  logoCalado: M + 'Logo-calado-20.png',
  linea: M + 'Linea-de-seleccion-manual-limpia-scaled-1.jpg',
  aerea: M + 'Aerea-Econut-01.jpg',
  aereaChica: M + 'Aerea-Econut-01-scaled-1.jpg',
  plantaciones: M + 'Plantaciones-1-scaled-1.jpg',
  perspectiva: M + 'Perspectiva-2.jpg',
  mano: M + '1F6A0347_7-scaled-1.jpg',
  saco: M + 'Nuez-en-saco.avif',
  manual: M + 'partido-manual-2.avif',
  mecanico: M + 'Partido-Mecanico.avif',
  iFundacion: M + 'Fundacion@2x.png',
  iInstalaciones: M + 'Instalaciones@2x.png',
  iHectareas: M + 'Hectareas@2x.png',
  iProceso: M + 'Proceso@2x.png',
  // La foto que el original usa en el bloque de sustentabilidad. Antes se
  // había puesto la aérea «Aerea-Econut-01-scaled-1.jpg», que es otra.
  sustentabilidad: M + 'd514ce_32d33a9f611747499c605679f39275f7mv2.avif',
  brc: M + 'Logo-BRC-2019.avif',
  kosher: M + 'Isotipos-Kosher.avif',
  halal: M + 'Halal-Logo.avif',
  chile: M + 'Made-in-Chile-log.avif',
  huertos: M + 'Control-de-huertos.avif',
  bandeja: M + 'd514ce_bd4f58c2fb644112944735865054300fmv2.avif',
  sag: M + 'Sag.avif',
  revision: M + 'd514ce_2e9d60bac05b4469aaf35aef477c5f69mv2.avif',
  videoBrazo: M + 'Brazo-robotico2.mp4',
  videoPlantas: M + 'Video-Econut-2025-ok.mp4',
  videoEconut: M + 'Video-Econut-2025-ok.mp4',
};

const reglas = [];
const R = (id, kind, value, { quien = 'reference', estado = 'reviewed', bp = 'all' } = {}) => {
  reglas.push({
    id, kind,
    scope: { breakpoint: bp, state: 'default' },
    provenance: { sources: [{ kind: quien, reference: 'https://econut.cl/', rationale: 'Medido del sitio real con el navegador.' }] },
    status: estado, value,
  });
  return id;
};

// --- Color -----------------------------------------------------------------
R('c-naranja', 'color', { role: 'titulo', color: NARANJA });
R('c-texto', 'color', { role: 'rotulo', color: SUAVE });
R('c-claro', 'color', { role: 'claro', color: BLANCO });

// --- Tipografía. La portada en Bodoni; las secciones en Big Shoulders. ------
// Medido en el original: Bodoni Moda 88px con interlínea 88px, peso 600.
R('t-portada', 'typography', { role: 'portada', family: "'Bodoni Moda', Georgia, serif", fontSize: 'clamp(46px, 6vw, 88px)', fontWeight: 600, lineHeight: 1.05, align: 'start' });
// El original NO usa un solo tamaño de título de sección: «Nuestra historia» y
// «Garantía de calidad» van en 58 con interlínea 70 (1,2), «Procesamos con
// pasión» en 46, e «Instalaciones de Vanguardia» y «Compromiso con el Futuro»
// en 50. Por eso hay tres reglas y no una.
R('t-seccion', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(34px, 4.4vw, 58px)', fontWeight: 600, lineHeight: 1.2, align: 'start' });
R('t-seccion-46', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(30px, 2.5vw, 46px)', fontWeight: 600, lineHeight: 1, align: 'start' });
R('t-seccion-centro', 'typography', { role: 'titulo-centrado', fontSize: 'clamp(34px, 4.4vw, 58px)', fontWeight: 600, lineHeight: 1.1, align: 'center' });
R('t-sub', 'typography', { role: 'subtitulo', family: "'Bodoni Moda', Georgia, serif", fontSize: '26px', fontWeight: 600, lineHeight: 1.25 });
// Medido en el original: 14px, interlínea 19,6, espaciado 1px y peso 500. Y
// sí lleva mayúsculas automáticas —acá se había puesto en duda—, salvo que el
// texto se escribe con Mayúscula En Cada Palabra, que es lo que se copia y lo
// que leen los buscadores.
R('t-rotulo', 'typography', { role: 'rotulo', fontSize: '14px', fontWeight: 500, letterSpacing: '1px', lineHeight: 1.4, transform: 'uppercase' });
// El rótulo de servicios es el distinto: 22px en Big Shoulders, sin espaciado.
R('t-rotulo-servicios', 'typography', { role: 'rotulo', family: "'Big Shoulders Display', 'Oswald', sans-serif", fontSize: '22px', fontWeight: 500, lineHeight: 1.2, transform: 'uppercase' });
// Instalaciones: en el original el rótulo y el título van centrados, y el
// título a 50px, no a los 58 del resto. El video mide 1080x609, o sea 16/9.
R('t-rotulo-centro', 'typography', { role: 'rotulo', fontSize: '13px', fontWeight: 600, letterSpacing: '0.14em', transform: 'uppercase', align: 'center' });
R('t-instalaciones', 'typography', { role: 'titulo-centrado', fontSize: 'clamp(32px, 2.7vw, 50px)', fontWeight: 600, lineHeight: 1.4, align: 'center' });
R('video-plantas', 'media', { aspectRatio: '16/9', fit: 'cover' });
R('aire-plantas', 'spacing', { paddingBlock: '54px', paddingInline: '24px' });
R('t-cuerpo', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.75, measure: '62ch' });
R('t-lead', 'typography', { role: 'bajada', fontSize: '19px', lineHeight: 1.6, measure: '54ch' });
R('t-cifra', 'typography', { role: 'cifra', fontSize: 'clamp(38px, 4.6vw, 62px)', fontWeight: 700, lineHeight: 1, align: 'center' });
R('t-cifra-pie', 'typography', { role: 'cifra-pie', fontSize: '13px', lineHeight: 1.45, align: 'center' });
R('t-aviso', 'typography', { role: 'aviso', fontSize: '13px', lineHeight: 1.6 });
R('t-pie', 'typography', { role: 'pie', fontSize: '13px', lineHeight: 1.7 });

// --- Ritmo y caja ----------------------------------------------------------
// 54px arriba y abajo: es el aire que usa el original en todas sus secciones
// de contenido. Acá había 96, y esos 42px de más por sección eran buena parte
// de los 1300px que nuestra página medía de más.
R('aire', 'spacing', { paddingBlock: '54px', paddingInline: '24px' });
R('aire-corto', 'spacing', { paddingBlock: '48px', paddingInline: '24px' });
R('aire-barra', 'spacing', { paddingBlock: '20px', paddingInline: '24px' });
// 1080px es el ancho de contenido del original: sus secciones van de 410 a
// 1490 sobre una ventana de 1900. Acá había 1180.
// 64px entre el bloque del título y el contenido de la sección: es lo que deja
// el original entre el final de su título y lo que viene abajo.
R('caja', 'layout', { mode: 'stack', maxWidth: '1080px', gap: '64px', align: 'start' });
R('caja-centro', 'layout', { mode: 'stack', maxWidth: '1080px', gap: '64px', align: 'center' });
R('partida', 'layout', { mode: 'grid', columns: 2, gap: '56px', minColumnWidth: '340px', align: 'center', mobile: { mode: 'stack', columns: 1, gap: '28px' } });
// Tres columnas de 302px separadas por 87, que es lo que suma los 1080 de
// ancho del original (302x3 + 87x2 = 1080). Acá estaban a 32 de separación.
R('tres', 'layout', { mode: 'grid', columns: 3, gap: '87px', minColumnWidth: '240px', align: 'start', mobile: { mode: 'stack', columns: 1, gap: '24px' } });
// OJO: cuando una regla de disposición trae minColumnWidth, el compilador
// IGNORA columns (ver layout_css). Con 180px de mínimo, los cuatro logotipos
// no caben en la mitad derecha y caen en 2x2. El original los pone en una
// fila, de 120x120 cada uno, así que el mínimo baja a 110px.
R('cuatro', 'layout', { mode: 'grid', columns: 4, gap: '20px', minColumnWidth: '110px', mobile: { mode: 'grid', columns: 2, gap: '18px' } });
R('cinco', 'layout', { mode: 'grid', columns: 4, gap: '36px', minColumnWidth: '130px', align: 'center', mobile: { mode: 'grid', columns: 3, gap: '20px' } });
// La tarjeta ocupa todo el alto de su celda y el botón se empuja al fondo,
// para que los tres queden a la misma altura aunque las listas midan
// distinto. En el original los tres botones están alineados.
// La tarjeta se estira a lo alto de su columna y apila en vertical. Va en
// FLEX y no en rejilla: con `align-content: start` las filas se empaquetaban
// arriba y el `margin-block-start: auto` del botón no empujaba nada, así que
// los tres botones quedaban a distinta altura según cuánto texto tuviera cada
// uno. En flex-column ese automático sí ancla el botón abajo, aunque mañana
// un texto crezca o se acorte.
R('tarjeta-alta', 'properties', { declarations: {
  height: '100%', display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start',
} });
R('al-fondo', 'properties', { declarations: { 'margin-block-start': 'auto' } });
// 26px de aire entre las piezas de una columna. Ahora que los textos no traen
// margen propio, éste es el único aire que los separa, y con 14 las secciones
// quedaban más cortas que el original. El sitio real separa su título de su
// primer párrafo con 67 y los párrafos entre sí con 6; 26 es el punto medio
// que deja cada sección en su alto sin tratar cada bloque por separado.
R('columna', 'layout', { mode: 'stack', gap: '26px', align: 'start', justify: 'start' });
R('barra-sup', 'layout', { mode: 'cluster', gap: '30px', justify: 'between', align: 'center', maxWidth: '1180px' });

// --- Superficies -----------------------------------------------------------
R('s-blanco', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('s-beige', 'surface', { backgroundColor: BEIGE, foregroundColor: TEXTO });
R('s-oscuro', 'surface', { backgroundColor: OSCURO, foregroundColor: BLANCO });
// La portada va sobre la foto a sangre, CON UN VELO OSCURO ENCIMA, como en el
// sitio publicado. El velo no es decoración: es lo que manda la foto al fondo.
// Sin él, la foto —un huerto de pasto parejo con árboles que no son nogales—
// se convierte en la protagonista del hero, y el video, que es el protagonista
// de verdad, queda de adorno. Medido en econut.cl: la foto va bajo un velo
// negro y el video encima, desbordando la sección.
//
// El original atenúa con un degradado de 0.6 a 0.9. Acá no se usan degradados,
// así que el velo es PLANO en 0.75 —el promedio—, que da el mismo efecto de
// apenas adivinar el follaje. Un velo de opacidad pareja no es un degradado.
R('aire-portada', 'spacing', { paddingBlock: '44px', paddingInline: '40px' });
R('s-portada', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO,
  backgroundAssetUrl: f.portadaFondo, backgroundPosition: 'center', backgroundSize: 'cover',
  overlayColor: '#000000', overlayOpacity: 0.75 });

// La portada del sitio NO es una grilla de dos celdas: es una sola celda con
// dos piezas superpuestas. Medido en econut.cl, en proporción del ancho de la
// sección: la columna blanca del texto empieza en 10% y mide 37.8%; el video
// empieza en 19.1% y mide 104% —o sea, se sale de la sección por la derecha y
// pasa por encima de la columna—. Por eso el video pesa y la foto no.
//
// Se arma apilando en la MISMA celda de rejilla (grid-area 1/1) en vez de
// posicionar en absoluto: así el alto lo sigue dando el contenido y el bloque
// no depende de una altura fija.
R('portada-lienzo', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'align-items': 'center', width: '100%',
  'min-height': '773px',   // el alto exacto del hero del original
} });
// El panel blanco entra a sangre por la izquierda y llega hasta pasada la
// mitad; el texto arranca adentro, no pegado al borde.
R('portada-texto', 'properties', { declarations: {
  'grid-column': '1', 'grid-row': '1', width: '59%', 'margin-inline-start': '0px',
  'padding-inline-start': '21%', 'padding-inline-end': '5%', 'z-index': '1',
} });
// El video monta sobre el borde entre el blanco y la foto: empieza antes de
// que el panel termine y se mete en la foto. Es lo que lo vuelve protagonista.
R('portada-video', 'properties', { declarations: {
  'grid-column': '1', 'grid-row': '1', width: '27%', 'margin-inline-start': '51%', 'z-index': '2',
} });
// OJO: la proporción NO se puede poner con `properties`. Esas declaraciones
// caen sobre el contenedor del nodo, y el <video> de adentro se queda con el
// 16/9 de la regla base del canvas —salía 496x280—. El kind `media` es el que
// sabe estilar la pieza interna. En el original el video mide 515x600, más
// alto que ancho, y eso es parte de lo que lo hace pesar sobre la foto.
R('portada-video-forma', 'media', { aspectRatio: '6/7', fit: 'cover' });   // 6/7 = 0,857; el original mide 515x600 = 0,858. El validador sólo admite dos dígitos por lado.
// En teléfono las dos piezas se apilan a ancho completo, UNA DEBAJO DE OTRA.
//
// Y eso último es lo que faltaba y lo que rompía la portada en móvil: los
// ajustes de abajo cambiaban el ancho, pero las dos piezas seguían declarando
// `grid-row: 1`, o sea la MISMA celda. En escritorio ese apilado es el efecto
// buscado —el video monta sobre el panel blanco—; en un teléfono dejaba el
// video encima del título y del párrafo. Medido el 4 de octubre de 2026 a 375
// px: el video tapaba «Servicio de verdad» (48 px), «La clave es el
// compromiso» (65 px) y 273 px del párrafo.
//
// Separar las filas es lo único que hace falta: el ancho ya era correcto.
R('portada-lienzo-movil', 'properties', { declarations: {
  // El alto del hero del original es una medida de escritorio. En un teléfono
  // fuerza una caja altísima con el contenido flotando al medio.
  'min-height': 'auto', 'align-items': 'start',
} }, { bp: 'mobile' });
R('portada-texto-movil', 'properties', { declarations: {
  width: '100%', 'margin-inline-start': '0px', 'grid-row': '1',
  // La sangría del 21% es la del original en escritorio; en 375 px son 79 px
  // de margen izquierdo que estrechan el texto a la mitad.
  'padding-inline-start': '24px', 'padding-inline-end': '24px',
} }, { bp: 'mobile' });
R('portada-video-movil', 'properties', { declarations: {
  width: '100%', 'margin-inline-start': '0px', 'margin-block-start': '18px',
  'grid-row': '2',
} }, { bp: 'mobile' });

// En TABLET pasa lo mismo y hay que repetirlo, porque los alcances del sistema
// son bandas separadas: «mobile» es hasta 767 px y «tablet» de 768 a 1023.
//
// Se vio al medir, el 4 de octubre de 2026: a 768 px la composición de
// escritorio seguía viva y dejaba la columna de texto en 248 px dentro de una
// caja de 444 —el texto corría en una tira de unos 30 caracteres— mientras el
// video le pisaba 23 px al subtítulo y 178 al párrafo. Ese solape es el efecto
// buscado en pantalla ancha, donde el relleno del 5% mantiene las palabras
// lejos del video; a 768 ya no alcanza.
R('portada-lienzo-tablet', 'properties', { declarations: {
  'min-height': 'auto', 'align-items': 'start',
} }, { bp: 'tablet' });
R('portada-texto-tablet', 'properties', { declarations: {
  width: '100%', 'margin-inline-start': '0px', 'grid-row': '1',
  'padding-inline-start': '40px', 'padding-inline-end': '40px',
} }, { bp: 'tablet' });
R('portada-video-tablet', 'properties', { declarations: {
  width: '100%', 'margin-inline-start': '0px', 'margin-block-start': '18px',
  'grid-row': '2',
} }, { bp: 'tablet' });
// El triángulo de advertencia es el FONDO de la sección, no una imagen dentro
// de ella: en el original va como background-image al 7% de ancho, pegado al
// 2% de la izquierda y centrado a lo alto. Puesto como <img> ocupaba una
// columna y empujaba el texto.
// La franja del aviso: sólo color. El triángulo YA NO VA DE FONDO.
//
// Iba. El original de econut.cl lo pone como fondo de la sección al «7% auto»
// —un porcentaje del ANCHO—, y de ahí salían dos defectos a la vez: cuanto más
// ancha la ventana, más grande el triángulo, mientras la franja conserva su
// alto (medido el 4 de octubre de 2026: en 1440px la franja mide 38px y el
// icono se dibujaba de 100×91, dos veces y media su caja, cortado arriba y
// abajo); y al ser fondo no participa de la línea, así que el texto se le
// monta encima en cuanto se acomoda.
//
// Cristóbal, ese día: «me refiero al icono de alerta, que se repite y queda
// metido bajo el texto… no lo pongas como fondo, agrégalo como ícono dentro
// del texto». Ahora va con la familia `icono` (ver `ico-alerta`), que lo mete
// DENTRO del párrafo: ocupa su sitio en la línea, se mide en `em` contra ella
// y nadie se le encima.
R('s-aviso', 'surface', { backgroundColor: AVISO, foregroundColor: TEXTO });

// El triángulo, ahora como icono del propio párrafo.
//
// El dibujo se vectorizó desde el PNG original midiendo su canal alfa
// (scripts/vectorizar-icono-alerta.php): es de un solo color y el signo de
// exclamación es un HUECO, no una forma blanca. Por eso el color puede venir
// de la regla —y cambiarse desde el panel— en vez de estar cocido en el
// archivo. #E5007E al 30% es exactamente el del original.

/**
 * El borde entre «Nuestra historia» (blanca) y las cifras (beige): una
 * cordillera en tres capas, en vez del corte recto que había.
 *
 * POR QUÉ TRES Y NO UNA. Una sola lee como un recorte —la banda de abajo
 * mordiendo a la de arriba—. Tres de la misma forma, corridas entre sí y con
 * menos opacidad hacia atrás, leen como distancia: es la perspectiva aérea de
 * toda la vida, lo lejano más pálido. Pedido de Cristóbal el 4 de octubre de
 * 2026: «un separador con montañas en triple capa y transparencia gradual
 * hacia atrás».
 *
 * EL COLOR ES EL DE LA BANDA SIGUIENTE, no un tercero: el beige entrando sobre
 * el blanco. Las capas de atrás son ese mismo beige rebajado, que sobre blanco
 * da los tonos intermedios sin necesitar colores nuevos —y por eso no se salta
 * la paleta—.
 *
 * Las de atrás van MÁS ALTAS que la principal: una cumbre lejana asoma por
 * encima de la cercana, nunca por debajo.
 */
R('divisor-cordillera', 'divisor', {
  forma: '/wp-content/uploads/2026/10/divisor-cordillera.svg',
  donde: 'abajo',
  // Bajo a propósito: ahora el divisor se RESERVA su hueco, así que cada
  // píxel de alto es también un píxel de página. Una cordillera de 170 pedía
  // 170 de aire. Cristóbal, 2026-10-04: «está muy alto».
  alto: '70px',
  color: BEIGE,
  capas: [
    { opacidad: 0.3, desplazamiento: '-120px', alto: '104px' },
    { opacidad: 0.6, desplazamiento: '60px', alto: '88px' },
  ],
});
R('ico-alerta', 'icono', {
  forma: f.iconoAlertaSvg, donde: 'antes', tamano: '1.7em', separacion: '.5em',
  // El 30% va DENTRO del color, en hexadecimal de ocho dígitos: la forma
  // moderna `rgb(229 0 126 / .3)` la descarta el saneador del documento y la
  // declaración se pierde sin avisar (medido el 4 de octubre de 2026).
  color: '#E5007E4D',
});
// El aviso casi no tiene aire propio en el original: 2px arriba y 1 abajo.
R('aire-aviso', 'spacing', { paddingBlock: '2px', paddingInline: '24px' });
// El hero va a sangre: en el original su sección tiene padding 0 y los
// márgenes los ponen las piezas. Sin esto arrastra los 48x24 que el canvas da
// por omisión a toda sección, y el panel blanco no llega al borde izquierdo.
R('aire-cero', 'spacing', { paddingBlock: '0px', paddingInline: '0px' });
// El aviso es UNA fila: icono angosto, el texto principal ancho, y las tres
// recomendaciones en columnas angostas. Las proporciones salen de medir el
// original a 1440: icono ~100px, texto ~500px, las tres ~190px cada una.
// Dos bloques de 510, como el original: el texto del aviso de 410 a 920 y las
// tres recomendaciones de 980 a 1490. El triángulo ya no ocupa una columna
// —es el fondo de la sección—, y la columna de 100px que tenía reservada
// aplastaba el texto y estiraba la barra a 959px.
R('aviso-fila', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) minmax(0, 1fr)',
  'column-gap': '60px', 'align-items': 'start', width: '100%',
} });
R('tres-juntas', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', 'column-gap': '28px',
} });
R('columna-junta', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '8px', 'align-content': 'start',
} });
R('icono-alerta', 'properties', { declarations: { width: '100px', 'max-width': '100px' } });
// El rótulo va en negrita dentro del mismo párrafo, no como antetítulo en
// versalitas: así es en el original.
R('t-aviso-rotulo', 'typography', { role: 'aviso-rotulo', fontSize: '13px', fontWeight: 700, lineHeight: 1.6 });
R('t-aviso-titulo', 'typography', { role: 'aviso-titulo', fontSize: '30px', fontWeight: 400, lineHeight: 1.2, align: 'start' });
// Los títulos del tema traen su propio margen y eso abre un hueco entre el
// rótulo y su texto que el original no tiene.
R('sin-margen', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '0' } });
R('s-tarjeta', 'surface', { backgroundColor: BLANCO, shadow: 'sm' });
R('s-barra-cifras', 'surface', { backgroundColor: BLANCO, shadow: 'sm' });

// --- Forma, medio, movimiento, botón ---------------------------------------
R('redondo', 'shape', { radius: '10px' });
R('foto', 'media', { aspectRatio: '4/3', fit: 'cover', frame: 'rounded' });
// La foto de cada servicio es CHICA en el original: 200x155, no una foto a lo
// ancho de la columna. Acá salían a 383x287, y ese tamaño de más empujaba
// hacia abajo el nombre, el texto y el botón de las tres columnas.
R('foto-servicio', 'media', { aspectRatio: '4/3', fit: 'contain' });
R('foto-servicio-tam', 'properties', { declarations: { 'max-width': '200px', width: '100%' } });
// El nombre de cada servicio va en 18px, no en los 26 del subtítulo general.
R('t-servicio', 'typography', { role: 'subtitulo', family: "'Bodoni Moda', Georgia, serif", fontSize: '18px', fontWeight: 600, lineHeight: 1.5 });
R('foto-ancha', 'media', { aspectRatio: '16/9', fit: 'cover', frame: 'rounded' });
R('foto-alta', 'media', { aspectRatio: '3/4', fit: 'cover', frame: 'rounded' });
R('icono', 'media', { fit: 'contain' });
R('gris', 'media', { fit: 'contain', filter: 'grayscale' });
R('logo-chico', 'layout', { mode: 'stack', maxWidth: '124px' });
// Los logos de certificación van todos a 120x120 en el original. Con sólo un
// ancho máximo, cada uno conservaba su proporción y salían de 66, 91, 104 y
// 121 de alto: la fila quedaba despareja.
R('cert-tam', 'media', { aspectRatio: '1/1', fit: 'contain' });
R('cert-tam-caja', 'properties', { declarations: { width: '120px', height: '120px' } });
R('filete', 'color', { role: 'filete', color: NARANJA, apply: 'background' });
// El separador dentro de una tarjeta de servicio: una línea tenue, no el
// filete naranja de las secciones, que ahí pesaría demasiado.
R('filete-tenue', 'properties', { declarations: {
  'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgba(0,0,0,0.12)',
  width: '100%', height: '0px',
} });
// --- Tipografía de la tarjeta de servicio, medida en el original ----------
// La descripción va en 15/26 y las viñetas en 13/17: bastante más apretadas
// que el cuerpo general (16/28), que es lo que tenían acá. En tres columnas
// angostas esa diferencia es la que hace que el bloque quepa sin estirarse.
R('t-servicio-texto', 'typography', { role: 'cuerpo', fontSize: '15px', lineHeight: 1.73, measure: '40ch' });
R('t-servicio-vineta', 'typography', { role: 'cuerpo', fontSize: '13px', lineHeight: 1.31, measure: '40ch' });
// --- Certificaciones y sustentabilidad, medidas en el original a 1900px ----
// Arriba: el título ocupa poco más de un cuarto y la marquesina el resto.
// En el original el título va de 410 a 680 y la marquesina de 680 a 1490.
R('cert-fila', 'layout', { mode: 'grid', columns: 2, gap: '0px', align: 'center', mobile: { mode: 'stack', columns: 1, gap: '24px' } });
R('cert-fila-reparto', 'properties', { declarations: { 'grid-template-columns': '270px minmax(0, 1fr)' } });
// Lo mismo acá, por la misma razón.
R('cert-fila-reparto-movil', 'properties', { declarations: { 'grid-template-columns': 'minmax(0, 1fr)' } }, { bp: 'mobile' });
// Abajo: la foto mide 624 de ancho y el texto 366, separados por 60.
R('cert-abajo', 'layout', { mode: 'grid', columns: 2, gap: '60px', align: 'center', mobile: { mode: 'stack', columns: 1, gap: '28px' } });
R('cert-abajo-reparto', 'properties', { declarations: { 'grid-template-columns': 'minmax(0, 624fr) minmax(0, 366fr)' } });
// UNA COLUMNA EN TELÉFONO, y hay que decirlo explícitamente.
//
// La regla `layout` de arriba ya declara su rama móvil —`mobile: { mode:
// 'stack', columns: 1 }`—, pero la regla `properties` de esta línea no tiene
// alcance, así que vale para TODOS los tamaños y la pisa. El resultado se
// midió el 4 de octubre de 2026: en 375 px el texto de sustentabilidad corría
// en una columna de 121 px.
//
// Es una trampa del sistema que conviene tener presente: cuando una
// `properties` toca algo que una `layout` ya resuelve por breakpoint, hay que
// darle su propia versión móvil o gana en todas partes.
R('cert-abajo-reparto-movil', 'properties', { declarations: { 'grid-template-columns': 'minmax(0, 1fr)' } }, { bp: 'mobile' });
// 624x430 en el original, o sea 1,45 y no 1,5. Con 3/2 la foto recortaba 10px
// más de alto de lo que muestra el sitio.
R('foto-sustentabilidad', 'media', { aspectRatio: '32/22', fit: 'cover' });
// El original pone estos dos títulos en 46px y 50px, no en los 58 del resto.
R('t-certificaciones', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(30px, 2.5vw, 46px)', fontWeight: 600, lineHeight: 1, align: 'start' });
R('t-compromiso', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(32px, 2.7vw, 50px)', fontWeight: 600, lineHeight: 1.2, align: 'start' });
// La marquesina: cuatro logos a la vista, desplazamiento continuo. El original
// lo hace con Swiper (loop, delay 0, speed 8000) dentro de un módulo de código
// de Divi; acá es el behavior propio, sin librerías de terceros.
R('marquesina-certificaciones', 'interaction', { behavior: 'marquesina' });
R('marquesina-ritmo', 'properties', { declarations: {
  '--cod-marquesina-visibles': '4',
  '--cod-marquesina-separacion': '97px',
  '--cod-marquesina-duracion-pieza': '8s',
  // La marquesina va sobre un panel BLANCO de 200px de alto, con los logos
  // centrados: en el original el bloque de la marquesina mide 810x200 y es lo
  // único blanco de esa fila, sobre el beige de la sección.
  'background-color': '#FFFFFF',
  'min-height': '200px',
  'align-content': 'center',
} });

// LA SEPARACIÓN NO PUEDE SER MAYOR QUE LOS LOGOS, y a 768 px lo era.
//
// La marquesina reparte el ancho de su caja entre los logos visibles,
// descontando las separaciones. Con cuatro a la vista y 97 px entre medio
// —medidas del original, pensadas para una caja de 810 px— en la columna de
// 419 px de una tablet quedaban (419 − 3×97) / 4 = 32 px por logo. Los
// certificados se veían como sellos de 32 px con 97 px de aire entre ellos.
// Medido el 4 de octubre de 2026.
//
// La separación es lo que se encoge, no el logo: el logo ES el contenido.
R('marquesina-ritmo-tablet', 'properties', { declarations: {
  '--cod-marquesina-visibles': '3',
  '--cod-marquesina-separacion': '28px',
} }, { bp: 'tablet' });
R('marquesina-ritmo-movil', 'properties', { declarations: {
  '--cod-marquesina-visibles': '3',
  '--cod-marquesina-separacion': '20px',
} }, { bp: 'mobile' });
// 54 arriba y 50 abajo: es lo que mide el original en esta sección, la única
// que no usa el mismo aire en los dos lados.
// OJO: la regla `spacing` sólo admite un mismo valor arriba y abajo
// (paddingBlock), así que un aire asimétrico hay que escribirlo con
// `properties`. Es la única sección del original con aire distinto arriba (54)
// y abajo (50). Queda anotado como limitación del plugin.
R('aire-certificaciones', 'properties', { declarations: {
  'padding-top': '54px', 'padding-bottom': '50px',
  'padding-left': '24px', 'padding-right': '24px',
} });
// Entre la fila de la marquesina y la de sustentabilidad el original deja 165
// de aire: la marquesina termina en y236 y la foto empieza en y401. La caja
// normal separa 26, y por eso la sección quedaba 263px más corta.
R('caja-certificaciones', 'layout', { mode: 'stack', maxWidth: '1080px', gap: '165px', align: 'start' });
// Servicios: el original deja 35px entre el título y la bajada, y 49 entre la
// bajada y las tres columnas. Con los 64 de la caja normal la sección se iba
// 133px por encima del original.
R('caja-servicios', 'layout', { mode: 'stack', maxWidth: '1080px', gap: '40px', align: 'start' });
R('panel-blanco', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('tarjeta-blanca', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO, shadow: 'sm' });
R('entra', 'motion', { trigger: 'scroll', effect: 'rise', duration: 520, easing: 'ease-out', threshold: 0.15, stagger: 110 });
R('boton', 'button', { variant: 'solid', tone: 'primary', size: 'md', width: 'auto', interaction: 'lift' });
R('boton-fondo', 'color', { role: 'boton-fondo', color: VERDE, apply: 'background' });
R('boton-texto', 'color', { role: 'boton-texto', color: BLANCO, apply: 'text' });
R('pildora', 'shape', { radius: 'pill', borderStyle: 'none' });
R('cuadrantes', 'interaction', { behavior: 'cuadrantes' });
// El módulo va sobre un PANEL BLANCO, no suelto sobre el beige de la sección.
// Medido en el original a 1900px: el panel ocupa de 480 a 1420 —940 de ancho,
// centrado— y cada cuadrante mide 440x440 con 20px de separación. Acá medían
// 577x577 sobre 1180, que es lo que lo hacía ver grande y sin fondo.
// El envoltorio: pone el fondo blanco, el margen parejo y las puntas
// redondeadas. El radio es 28 y no 8 porque la esquina de afuera tiene que
// seguir a la de adentro: 8 de la foto más los 20 del margen. Si las dos
// fueran 8, el blanco se vería con una curva más cerrada que las fotos.
R('cuadrantes-panel', 'properties', { declarations: {
  'background-color': '#FFFFFF',
  'max-width': '940px',
  'margin-inline-start': 'auto',
  'margin-inline-end': 'auto',
  'padding-top': '20px', 'padding-right': '20px', 'padding-bottom': '20px', 'padding-left': '20px',
  'border-radius': '28px',
  width: '100%',
} });
// El módulo, ya dentro del envoltorio: ocupa los 900 que quedan y conserva su
// forma cuadrada, que es lo que mantiene la rejilla de 2x2 pareja.
R('cuadrantes-medida', 'properties', { declarations: {
  width: '100%', 'aspect-ratio': '1 / 1',
} });

// --- Nodos -----------------------------------------------------------------
let n = 0;
const id = (p) => p + '-' + (++n);
// TODOS los textos van sin margen propio: medido en el original, sus 41 textos
// —títulos, párrafos y listas— tienen margen inferior 0, y el aire entre ellos
// lo pone el contenedor. Acá cada texto traía entre 16 y 59px de margen, y esa
// suma era buena parte de los 1300px que la página medía de más.
R('texto-sin-margen', 'properties', { declarations: {
  'margin-block-start': '0px', 'margin-block-end': '0px',
} });
const H = (texto, nivel, reglas_) => ({ id: id('h'), kind: 'heading', ruleIds: [...reglas_, 'texto-sin-margen'], content: { text: texto, level: nivel } });
const P = (texto, reglas_ = ['t-cuerpo']) => ({ id: id('p'), kind: 'paragraph', ruleIds: [...reglas_, 'texto-sin-margen'], content: { text: texto } });
const IMG = (url, alt, reglas_ = ['foto']) => ({ id: id('i'), kind: 'image', ruleIds: reglas_, content: { assetUrl: url, alt } });
const G = (hijos, reglas_ = [], partes, marcador = '') => {
  const nodo = { id: id('g'), kind: 'group', ruleIds: reglas_, children: hijos };
  if (partes && Object.keys(partes).length) nodo.partes = partes;
  // El marcador da un identificador estable al nodo, para enlazarlo desde
  // otra parte de la página. El aviso lo usa para poder reabrirse.
  if (marcador) nodo.marker = marcador;
  return nodo;
};
const LI = (items, reglas_ = ['t-cuerpo']) => ({ id: id('l'), kind: 'list', ruleIds: reglas_, content: { ordered: false, items } });
const A = (label, href, reglas_ = ['t-rotulo']) => ({ id: id('a'), kind: 'link', ruleIds: reglas_, content: { label, href, target: 'self' } });

// Rótulo y título: el par que abre cada sección en el sitio real.
// El rótulo y el título van PEGADOS —4px en el original— y es el bloque
// entero el que se separa del contenido, con 64. Sueltos en la columna, los
// dos recibían el mismo aire y la sección no calzaba con el original.
R('titulo-par', 'layout', { mode: 'stack', gap: '4px', align: 'start' });
R('titulo-par-centro', 'layout', { mode: 'stack', gap: '4px', align: 'center' });
const abre = (rotulo, titulo, centrado = false, reglaRotulo = '', reglaTitulo = '') => [
  G([
    H(rotulo, 4, [reglaRotulo || (centrado ? 't-rotulo-centro' : 't-rotulo'), 'c-texto']),
    H(titulo, 2, [reglaTitulo || (centrado ? 't-seccion-centro' : 't-seccion'), 'c-naranja']),
  ], [centrado ? 'titulo-par-centro' : 'titulo-par']),
];

const nodes = [];

// 0 · El aviso emergente, donde vive el detalle que ya no cabe en la línea.
//
//     Aparece una vez por visitante y se cierra con la X, con Escape o
//     pinchando fuera. La línea de arriba lo reabre, así que quien lo cierre
//     sin leer puede volver.
//
//     Y lo importante: no sólo advierte, **deja verificar**. Dentro van las
//     cuentas oficiales enlazadas, para que la persona pueda comprobar en el
//     momento cuál es la verdadera. Advertir sin dar con qué comparar es lo
//     que hacía la franja vieja, y por eso no bastaba.
//
//     Va al final y como sección propia SIN movimiento: su capa es fija, y
//     dentro de una sección con animación de entrada quedaría escondida o
//     corrida. Está advertido en el catálogo del plugin.
const avisoEmergente = () => ({
  id: 'seccion-aviso', marker: 'seccion-aviso', kind: 'section', ruleIds: [],
  children: [G([
    H('Aviso a la comunidad', 2, ['t-aviso-titulo-emergente', 'c-naranja']),
    P('Le informamos que se ha detectado el uso fraudulento de nuestra marca en redes sociales. Personas inescrupulosas están cometiendo estafas en la venta de productos, utilizando nuestra identidad de forma ilegítima.', ['t-aviso-cuerpo']),
    P('Estamos trabajando activamente para denunciar y eliminar estas cuentas falsas. Su seguridad es nuestra prioridad. Les pedimos que tomen las siguientes precauciones para evitar ser víctimas de estos fraudes:', ['t-aviso-cuerpo']),
    G([
      H('Verifiquen la autenticidad', 3, ['t-aviso-rotulo-emergente']),
      P('Antes de realizar cualquier compra, asegúrense de que la cuenta o página web que está viendo sea nuestra cuenta oficial.', ['t-aviso-cuerpo']),
    ], ['columna-junta']),
    G([
      H('Sospeche de ofertas inusuales', 3, ['t-aviso-rotulo-emergente']),
      P('Las estafas suelen atraer con precios increíbles. Si una oferta parece demasiado buena probablemente no sea real.', ['t-aviso-cuerpo']),
    ], ['columna-junta']),
    G([
      H('Proteja su información personal', 3, ['t-aviso-rotulo-emergente']),
      P('No comparta datos sensibles como contraseñas, números de tarjeta de crédito o códigos de seguridad.', ['t-aviso-cuerpo']),
    ], ['columna-junta']),
    H('Nuestras cuentas oficiales', 3, ['t-aviso-rotulo-emergente']),
    P('Éstas son las únicas cuentas de Econut. Si le escribieron desde otra, no somos nosotros.', ['t-aviso-cuerpo']),
    G(Object.entries(REDES).map(([red, d]) => ({
      id: id('s'), kind: 'social', ruleIds: ['t-aviso-cuenta'], content: {
        network: red, url: d.url, handle: d.handle,
        size: 28, iconPadding: 6, iconColor: OSCURO,
        backgroundColor: 'transparent', borderRadius: '999px',
      },
    })), ['aviso-cuentas']),
  // El marcador va en el GRUPO que lleva la conducta, no en la sección: es el
  // que el aviso reconoce para reabrirse desde un enlace. Con el marcador en
  // la sección, el enlace de la línea no lo reabría.
  ], ['aviso-estafas', 'aviso-caja'], { panel: ['aviso-panel'], velo: ['aviso-velo'], cerrar: ['aviso-cerrar'] },
     'aviso-estafas')],
});
R('aviso-estafas', 'interaction', { behavior: 'aviso' });
R('aviso-caja', 'layout', { mode: 'stack', gap: '14px', align: 'start' });
R('aviso-panel', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('aviso-velo', 'surface', { backgroundColor: OSCURO });
R('aviso-cerrar', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('aviso-cuentas', 'properties', { declarations: {
  display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start', gap: '8px', 'margin-block-start': '4px',
} });
R('t-aviso-titulo-emergente', 'typography', { role: 'titulo-seccion', fontSize: '26px', fontWeight: 600, lineHeight: 1.2, align: 'start' });
R('t-aviso-rotulo-emergente', 'typography', { role: 'subtitulo', fontSize: '15px', fontWeight: 700, lineHeight: 1.3 });
R('t-aviso-cuerpo', 'typography', { role: 'cuerpo', fontSize: '14px', lineHeight: 1.5, measure: '54ch' });
R('t-aviso-cuenta', 'typography', { role: 'cuerpo', fontSize: '13px', lineHeight: 1.4 });

// 1 · El aviso, reducido a una LÍNEA. Ocupaba media pantalla —208px en el original
// y 273 acá— y era lo primero que veía cualquiera que entrara. Cristóbal pidió
// achicarlo: la advertencia tiene que estar, pero no puede ser la portada.
//
// Existe porque hay estafadores vendiendo a nombre de Econut y llegó gente a la
// planta a buscar lo que había pagado por internet. Por eso no se borra: se
// comprime a lo esencial y se enlaza a lo que de verdad protege, que son las
// cuentas oficiales del pie. Advertir sin dar con qué comparar no sirve de
// mucho; el nombre de usuario escrito sí se puede cotejar letra por letra.
//
// El detalle completo —las tres recomendaciones— entra en el aviso emergente
// cuando exista. Está anotado como pendiente en el repositorio del plugin.
nodes.push({
  id: 'aviso', marker: 'aviso', kind: 'section', ruleIds: ['aire-linea', 's-aviso'],
  children: [G([
    G([
      P('Atención: hay cuentas falsas vendiendo a nombre de Econut. Verifique siempre que esté hablando con nuestras cuentas oficiales.', ['t-aviso-linea', 'ico-alerta']),
      A('Ver cuentas oficiales', '#aviso-estafas', ['t-aviso-enlace']),
    ], ['aviso-linea']),
  ], ['caja'])],
});
R('aire-linea', 'spacing', { paddingBlock: '10px', paddingInline: '24px' });
R('aviso-linea', 'properties', { declarations: {
  display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center',
  'justify-content': 'center', gap: '12px', width: '100%',
} });
R('t-aviso-linea', 'typography', { role: 'cuerpo', fontSize: '13px', lineHeight: 1.4, align: 'center' });
R('t-aviso-enlace', 'typography', { role: 'rotulo', fontSize: '13px', fontWeight: 700, lineHeight: 1.4 });

// 2 · El encabezado NO va acá: vive en la región global «cod-region-header»
//     (ver componer-regiones.mjs). Un encabezado dentro del cuerpo se
//     repite y se edita por página, que es lo que el sistema de plantillas
//     del publisher existe para evitar.

// 3 · Portada SUPERPUESTA, como el sitio publicado: la foto al fondo bajo el
//     velo, la columna blanca del texto a la izquierda, y el video montado
//     encima, más ancho que la sección. El video es el protagonista; la foto
//     es textura.
//
//     NO lleva 'caja' (que encajona a 1180px) ni 'aire' (que mete 24px de
//     costado): en el original la sección va a sangre y los márgenes los
//     ponen las propias piezas, en porcentaje.
nodes.push({
  id: 'portada', marker: 'portada', kind: 'section', ruleIds: ['aire-cero', 's-portada'],
  children: [G([
    G([
      H('Innovación y Sostenibilidad en Cada Nuez', 4, ['t-rotulo', 'c-texto']),
      H('Servicio de verdad', 1, ['t-portada', 'c-naranja']),
      H('La clave es el compromiso', 3, ['t-sub']),
      P('No se trata de vender excedentes de capacidad de proceso, sino de brindar soluciones completas para exportadores, con control de calidad, proyección productiva, manejo de inventarios, informes completos de resultados, despacho SAG, trazabilidad y seguridad hasta destino. Y todo a un costo único y claro.', ['t-lead']),
    ], ['columna', 'panel-blanco', 'aire-portada', 'portada-texto', 'portada-texto-movil', 'portada-texto-tablet']),
    { id: id('v'), kind: 'video', ruleIds: ['portada-video', 'portada-video-forma', 'portada-video-movil', 'portada-video-tablet'],
      content: { sourceUrl: f.videoBrazo, caption: '', ambient: true } },
  ], ['portada-lienzo', 'portada-lienzo-movil', 'portada-lienzo-tablet', 'entra'])],
});

// 4 · Servicios
// El botón de cada servicio. En el original sólo el primero lleva enlace —a
// la ficha técnica en PDF, que se abre en otra pestaña—; los otros dos tienen
// el href vacío, o sea que no hacen nada. Acá los tres apuntaban a #contacto,
// así que se había perdido la ficha y se había inventado un enlace donde no lo
// hay. El destino de los otros dos queda pendiente de que lo decida Cristóbal:
// copiar un botón que no hace nada no ayuda a nadie.
const servicio = (url, alt, nombre, texto, puntos, enlace = '') => G([
  IMG(url, alt, ['foto-servicio', 'foto-servicio-tam']),
  // H4 y no H3: es el nivel que usa el original para el título de cada
  // tarjeta. El nivel no es decoración, ordena el documento para los
  // buscadores y para quien navega con lector de pantalla.
  H(nombre, 4, ['t-servicio', 'c-naranja']),
  P(texto, ['t-servicio-texto']),
  // El original separa la descripción de las viñetas con una línea: su marcado
  // va <p>…</p> <hr /> <ul>. Acá no estaba, y el bloque se leía corrido.
  { id: id('sep'), kind: 'separator', ruleIds: ['filete-tenue'], content: {} },
  LI(puntos, ['t-servicio-vineta']),
  // El primero abre su ficha técnica en PDF, como en el original. Los otros
  // dos no tienen ficha —probé los nombres plausibles en el sitio y sólo
  // existe la de nuez con cáscara— y en el original tienen el destino vacío,
  // o sea que no hacen nada.
  //
  // Acá apuntaban a «#contacto», que tampoco existe como ancla en la página:
  // el botón se veía pinchable y no pasaba nada. Van al pie, donde está la
  // dirección y las cuentas, que es lo único útil que podemos ofrecer sin
  // inventar una ficha que no existe.
  { id: id('b'), kind: 'button', ruleIds: ['boton', 'boton-fondo', 'boton-texto', 'pildora', 'al-fondo'],
    content: { label: 'Más Detalles', href: enlace || '#pie', target: enlace ? 'blank' : 'self' } },
], ['columna', 'tarjeta-alta']);

nodes.push({
  id: 'servicios', marker: 'servicios', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    ...abre('Nuestros Servicios', 'Procesamos con pasión', false, 't-rotulo-servicios', 't-seccion-46'),
    P('En Econut nos dedicamos al procesamiento de nueces desde su llegada desde el campo hasta el empaque final para exportación. Nuestro trabajo combina precisión técnica, compromiso humano y control de calidad en cada etapa.', ['t-lead']),
    G([
      servicio(f.saco, 'Nuez con cáscara en saco', 'Nuez con Cáscara',
        'Selección y embalaje de Nuez con Cáscara por tamaño y calidad externa e interna, de acuerdo a estándares internacionales.',
        // La primera viñeta ES del original y se había perdido: es la que hace
        // juego con las de 20 y 40 toneladas de las otras dos tarjetas. Yo di
        // por hecho que acá había una sola, y por eso agregamos la tercera.
        // La tercera no está en econut.cl: la pidió Cristóbal. Lo que dice
        // sale de lo que el propio sitio declara en «Control de calidad».
        ['Capacidad diaria aproximada de 70 toneladas de producto de ingreso.',
         'Embalaje en sacos de 10 y 25 kilos y cajas de hasta 10 kilos.',
         'Control de calidad acucioso en cada lote: color externo, calibre, condición de la cáscara y humedad.'],
        f.fichaNCC),
      servicio(f.manual, 'Partido y selección manual', 'Nuez sin Cáscara Manual',
        'Partido y selección manual de nueces por tamaño, color y calidad según estándares internacionales.',
        ['Capacidad diaria aproximada de 20 toneladas de producto en cáscara de ingreso.',
         'Envasado en atmósfera modificada en bolsas de 5, 6, 10 ó 12 kilos y en cajas de hasta 12 kilos.']),
      servicio(f.mecanico, 'Partido y selección mecánica', 'Nuez sin Cáscara Mecánico',
        'Partido y selección mecánica con inspección digital y visual de nueces por tamaño, color y calidad, según estándares internacionales.',
        ['Capacidad diaria aproximada de 40 toneladas de producto en cáscara de ingreso.',
         'Envasado en atmósfera modificada en bolsas de 10 ó 12 kilos y en cajas de hasta 12 kilos.']),
    ], ['tres', 'entra']),
  ], ['caja-servicios'])],
});

// 5 · Historia
nodes.push({
  id: 'historia', marker: 'historia', kind: 'section', ruleIds: ['aire', 's-blanco', 'divisor-cordillera'],
  // El título va a TODO EL ANCHO arriba —en el original ocupa de 410 a 1490—
  // y debajo las dos columnas. Acá estaba metido dentro de la columna del
  // texto, y por eso la sección quedaba 138px más corta que el original.
  // Tampoco lleva rótulo: el original abre con el título solo.
  children: [G([
    H('Nuestra historia', 2, ['t-seccion', 'c-naranja']),
    G([
    G([
      P('Nacimos como una pequeña empresa familiar y ahora somos el proveedor líder de servicios de procesamiento de nueces para la exportación en el país.'),
      P('Nuestras plantas de proceso están ubicadas en el corazón de la mayor área productora de nueces en Chile, lo que nos permite apoyar a los principales productores y exportadores del país.'),
      // El tercer párrafo estaba cortado a la mitad: le faltaba todo lo que
      // viene después de «internacionales». Copiado literal del original.
      P('Estamos certificados en los protocolos sanitarios, éticos y de calidad más importantes con una profunda comprensión de los estándares internacionales. Todo lo anterior nos permite garantizar la confiabilidad en las sensibles áreas de manejo de alimentos y nos da la capacidad de entregar productos en todo el mundo.'),
    ], ['columna']),
    IMG(f.linea, 'Línea de selección manual en la planta', ['foto', 'redondo']),
    ], ['partida', 'entra']),
  ], ['caja'])],
});

// 6 · Cifras: pestañas, como en el sitio. El número es la etiqueta;
//     su panel trae icono, título y texto.
R('pestanas', 'interaction', { behavior: 'pestanas' });
R('t-etiqueta-cifra', 'typography', { role: 'etiqueta-cifra', fontSize: 'clamp(32px, 4.4vw, 63px)', fontWeight: 600, lineHeight: 1, align: 'center' });

// Las pestañas, con lo medido en econut.cl el 2026-09-30. Van sobre las PARTES
// que fabrica el runtime (el botón de la etiqueta, la lista y el panel), que
// hasta hoy eran inalcanzables desde una composición.
R('pest-etiqueta', 'properties', { declarations: {
  'background-color': '#FFFFFF', color: '#E09900', 'font-weight': '600',
  // En el original la etiqueta mide 115px de alto con el número en 63px; con
  // 4px de aire vertical acá quedaba en 71. 26 arriba y abajo la dejan igual.
  '--cod-pestanas-etiqueta-aire-x': '30px', '--cod-pestanas-etiqueta-aire-y': '26px',
} });
reglas.push({ id: 'pest-etiqueta-activa', kind: 'properties', scope: { breakpoint: 'all', state: 'current' },
  provenance: { sources: [{ kind: 'reference', reference: 'https://econut.cl/', rationale: 'La pestaña elegida se funde con el panel: los dos en crema, medido con el navegador.' }] },
  status: 'reviewed', value: { declarations: { 'background-color': '#F7F1E6', color: '#4D7A76' } } });
R('pest-lista', 'properties', { declarations: {
  'column-gap': '0px', 'row-gap': '0px',
  // La franja cruza todo el bloque, como en el sitio: la elegida se recorta
  // en crema y las demás se funden dentro del blanco.
  'background-color': '#FFFFFF', width: '100%', 'justify-content': 'flex-start',
} });
R('pest-panel', 'properties', { declarations: {
  'background-color': '#F7F1E6', 'padding-block-start': '40px', 'padding-block-end': '40px',
  'padding-inline-start': '32px', 'padding-inline-end': '32px',
} });
R('panel-cifra', 'layout', { mode: 'grid', columns: 2, gap: '36px', minColumnWidth: '260px', align: 'start', mobile: { mode: 'stack', columns: 1, gap: '20px' } });

// El panel de cada cifra, medido en el original a 1900px (panel 410→1490,
// alto 650): una columna angosta de 150px a la izquierda con el logotipo de
// los veinte años arriba (150x131) y el icono de la cifra abajo (150x150); a
// la derecha el título con el año —«2005 | Fundación de Econut»—, el texto y
// una fotografía de 500x333.
//
// Acá el panel medía 956px contra los 650 del original: faltaba el logotipo,
// el título no llevaba el año y la foto iba a todo lo ancho.
// `titulo` va LITERAL del original: sólo la primera pestaña lleva el año
// delante («2005 | Fundación de Econut»); las otras tres no, y el generador se
// lo ponía a todas. `subtitulo` es opcional y existe porque la pestaña de las
// 10.000 toneladas trae un segundo encabezado que acá no estaba.
const pestana = (numero, titulo, texto, icono, foto, subtitulo = '') => G([
  H(numero, 3, ['t-etiqueta-cifra']),
  G([
    G([
      IMG(f.logo, 'Veinte años de Econut', ['icono-cifra']),
      IMG(icono, titulo, ['icono-cifra']),
    ], ['columna-iconos', 'columna-iconos-movil']),
    G([
      H(titulo, 2, ['t-titulo-cifra', 'c-naranja']),   // H2 en el original
      ...(subtitulo ? [H(subtitulo, 4, ['t-subtitulo-cifra'])] : []),
      P(texto, ['t-texto-cifra']),
      IMG(foto, titulo, ['foto-cifra', 'foto-cifra-tam']),
    ], ['columna']),
  ], ['partida-cifra', 'partida-cifra-movil']),
]);
R('t-subtitulo-cifra', 'typography', { role: 'subtitulo', fontSize: '18px', fontWeight: 600, lineHeight: 1.4 });
R('partida-cifra', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': '150px minmax(0, 1fr)', 'column-gap': '20px', 'align-items': 'start',
} });
R('columna-iconos', 'layout', { mode: 'stack', gap: '116px', align: 'start' });
// En teléfono el panel de cada cifra NO puede seguir partido en dos: con 150px
// fijos para los iconos, al texto le quedaban 108 de ancho y era ilegible.
// Se apila, y los dos iconos pasan a ir uno al lado del otro.
R('partida-cifra-movil', 'properties', { declarations: {
  'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '20px',
} }, { bp: 'mobile' });
R('columna-iconos-movil', 'properties', { declarations: {
  display: 'flex', 'flex-direction': 'row', 'align-items': 'center', gap: '20px',
} }, { bp: 'mobile' });
R('icono-cifra', 'media', { fit: 'contain' });
R('t-titulo-cifra', 'typography', { role: 'subtitulo', family: "'Bodoni Moda', Georgia, serif", fontSize: '26px', fontWeight: 600, lineHeight: 1.35 });
R('t-texto-cifra', 'typography', { role: 'cuerpo', fontSize: '18px', lineHeight: 1.6, measure: '54ch' });
R('foto-cifra', 'media', { aspectRatio: '3/2', fit: 'cover' });
R('foto-cifra-tam', 'properties', { declarations: { 'max-width': '500px', width: '100%' } });

nodes.push({
  id: 'cifras', marker: 'cifras', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    G([
      // Los cuatro textos, literales del original. Estaban reescritos y
      // recortados: faltaban el cierre de 2005, los 17.000 m2 de dependencias
      // complementarias, el cierre de las 2.000 hectáreas y el segundo
      // encabezado de las 10.000 toneladas.
      pestana('2005', '2005 | Fundación de Econut',
        'Nacimos hace veinte años como una pequeña empresa familiar, con el proyecto de servir a la industria exportadora de nuez chilena. Una línea, mucho esfuerzo y un magnífico grupo de personas. La mayoría de ellas comparten con nosotros el éxito de esta empresa hoy. En 2005 era difícil imaginar hasta dónde podía llegar el desarrollo de la industria de la nuez chilena.', f.iFundacion, f.perspectiva),
      pestana('12.000', 'Metros cuadrados de instalaciones',
        'Hoy estamos orgullosos de ser líderes en servicio de procesamiento de nueces para exportación en Chile, con una moderna tecnología y dos plantas productivas con más de 12.000 metros cuadrados de áreas limpias para proceso y 17.000 m² de dependencias complementarias.', f.iInstalaciones, f.aerea),
      pestana('2.000', 'Hectáreas de huertos atendidos',
        'Nos tomamos nuestra misión muy en serio: somos responsables de agregar valor a más de 2.000 hectáreas de nogales, cuyos dueños las han cuidado diligentemente. Por lo tanto, tenemos que aplicar toda la experiencia que tenemos para mejorar continuamente cada temporada.', f.iHectareas, f.plantaciones),
      pestana('10.000', 'Tons. de Capacidad de proceso',
        'Hoy entregamos más de 100.000 kilos diarios de proceso de Nuez con Cáscara, calibrando, seleccionando, empacando y despachando para importantes clientes. 40.000 kilos diarios de nuez partida manual y mecánicamente pasan por nuestras salas, con los mejores sistemas de partido y selección disponibles. Todo ello con la calidad y servicio personalizado que nos caracteriza.', f.iProceso, f.mano,
        '3 meses de proceso de Nuez con Cáscara y 6 meses de proceso de Nuez sin Cáscara.'),
    ], ['pestanas'], { etiqueta: ['pest-etiqueta', 'pest-etiqueta-activa'], lista: ['pest-lista'], panel: ['pest-panel'] }),
  ], ['caja'])],
});

// 7 · Instalaciones. Acá va un VIDEO, no una foto: el original muestra
//     «Video-Econut-2025-ok.mp4» a 1080x609, con controles —no ambiental, que
//     se ve el reproductor con su tiempo— y la vista aérea como póster. La
//     foto suelta que había es lo que faltaba corregir.
nodes.push({
  id: 'plantas', marker: 'plantas', kind: 'section', ruleIds: ['aire-plantas', 's-blanco'],
  children: [G([
    H('Nuestras Plantas de Procesamiento', 4, ['t-rotulo-centro', 'c-texto']),
    H('Instalaciones de Vanguardia', 2, ['t-instalaciones', 'c-naranja']),
    { id: id('v'), kind: 'video', ruleIds: ['video-plantas'],
      content: { sourceUrl: f.videoPlantas, posterUrl: f.aereaChica, caption: '', ambient: false } },
  ], ['caja-centro'])],
});

// 8 · Calidad, con el módulo de cuadrantes
const control = (url, alt, nombre, parrafos) => G([
  IMG(url, alt, []),
  G([H(nombre, 3, ['t-sub', 'c-naranja']), ...parrafos.map((t) => P(t))]),
]);

nodes.push({
  id: 'calidad', marker: 'calidad', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    // El original abre esta sección con el título solo: el rótulo «Cuatro
    // puntos de control» que había acá no existe allá.
    H('Garantía de calidad', 2, ['t-seccion-centro', 'c-naranja']),
    // El fondo blanco va en un ENVOLTORIO, no en el mismo nodo del módulo.
    // El módulo coloca sus cuatro celdas en posición absoluta, así que un
    // relleno puesto sobre él no las mueve: quedaban pegadas arriba y a la
    // izquierda, con 40px sueltos abajo y a la derecha. Con el envoltorio, el
    // margen es parejo por los cuatro lados.
    G([G([
      // Los cuatro textos van LITERALES del original. Estaban recortados a la
      // mitad: faltaban el muestreo externo de aflatoxinas y metales pesados,
      // el laboratorio propio, el envío a laboratorio externo ante un conteo
      // anormal y el control de envasado. Son frases que dicen lo que la
      // empresa hace, no relleno.
      control(f.huertos, 'Huertos de nogales', 'Control de huertos', [
        'Nuestros puntos de control comienzan con la fruta directamente en los huertos. Todas las nueces que recibimos han sido monitoreadas de acuerdo con exigentes estándares fitosanitarios. Además, todos los productos que ingresan a la planta son muestreados para un análisis externo, especialmente para detectar aflatoxinas y metales pesados.',
        'Durante la post cosecha también colaboramos con nuestros productores para lograr los mejores resultados del despelonado y secado. Cuanto menos estrés pongamos a nuestro producto durante la cosecha y post cosecha, mayor será la calidad de la nuez; limpia, sin daños externos e internos, con colores más claros y más porcentaje de mitades.',
      ]),
      control(f.bandeja, 'Nueces en bandeja de selección', 'Control de calidad', [
        'Se toma una muestra importante de cada lote que ingresa a Econut para proyectar sus posibilidades en todas las áreas. Con esta proyección podemos decidir de forma inteligente qué destino guiará el proceso: Para Nuez con Cáscara, Partido Mecánico o Manual.',
        'Se tiene en cuenta el color externo, la distribución de tamaños, las condiciones de la cáscara, el rendimiento, la distribución del color de la semilla, porcentaje de mitades, la humedad y todos los parámetros para comprender el uso potencial de cada lote de nuez.',
        'Nuestro personal de calidad se capacita constantemente para este muestreo con los métodos de análisis más asertivos.',
      ]),
      control(f.sag, 'Sello del SAG', 'Control de inocuidad', [
        'Una vez que la nuez comienza a ser procesada, seguimos su proceso de manufactura revisando constantemente las condiciones sanitarias en el área y las herramientas de trabajo. Tenemos nuestro propio laboratorio donde muestreamos materiales y manejo de productos.',
        'Básicamente comprobamos la humedad, las tasas totales de coliformes, aerobio mesófilo, hongos y levaduras. Si se detecta un conteo anormal, expandimos la muestra y la enviamos a un laboratorio externo con larga experiencia en el manejo de la nuez.',
        'El objetivo es evitar cualquier riesgo.',
      ]),
      control(f.revision, 'Revisión de una nuez partida', 'Control de producto terminado', [
        'Después de los profundos análisis de recepción, debemos verificar que todo esté bien con todos los demás factores sanitarios y de calidad tan importantes durante los pasos de selección y empaquetado.',
        'De esta forma, controlamos las condiciones organolépticas y fisiológicas, junto con los estándares de calidad requeridos para el producto y las buenas condiciones de envasado: sellos de bolsas, oxígeno residual, sellos de caja, etiquetado de trazabilidad, etc.',
        'Incluso antes de cada envío revisamos todos estos parámetros de calidad, para dar garantías reales a nuestros clientes.',
      ]),
    ], ['cuadrantes', 'cuadrantes-medida'])], ['cuadrantes-panel']),
  ], ['caja-centro'])],
});

// 9 · Certificaciones y sustentabilidad: UNA SOLA SECCIÓN, como el original.
//
//     Estaban partidas en dos, y por eso sumaban 1071px donde el original mide
//     974. En econut.cl es una sección de fondo beige con cuatro piezas:
//     el título a la izquierda, la marquesina de logos a la derecha, y abajo
//     una foto grande con el bloque de sustentabilidad al lado.
//
//     Medido en el original a 1900px: título x 410→680 (y 56), marquesina
//     x 680→1490 (y 76, alto 160), foto x 410→1034 (y 401, alto 430), texto
//     x 1094→1460. Los logos miden 120x120 y se ven cuatro a la vez.
//
//     El botón «Conversemos» que había acá no existe en el original.
nodes.push({
  id: 'certificaciones', marker: 'certificaciones', kind: 'section', ruleIds: ['aire-certificaciones', 's-beige'],
  children: [G([
    // Fila de arriba: el título y la marquesina.
    G([
      H('Certificaciones', 2, ['t-certificaciones', 'c-naranja']),
      G([
        IMG(f.brc, 'BRCGS Food Safety', ['cert-tam', 'cert-tam-caja']),
        IMG(f.kosher, 'Kosher', ['cert-tam', 'cert-tam-caja']),
        IMG(f.halal, 'Halal', ['cert-tam', 'cert-tam-caja']),
        IMG(f.chile, 'Chilean Walnut Authentic', ['cert-tam', 'cert-tam-caja']),
      ], ['marquesina-certificaciones', 'marquesina-ritmo', 'marquesina-ritmo-tablet', 'marquesina-ritmo-movil']),
    ], ['cert-fila', 'cert-fila-reparto', 'cert-fila-reparto-movil']),
    // Fila de abajo: la foto y el bloque de sustentabilidad.
    G([
      IMG(f.sustentabilidad, 'Huertos de nogales de Econut desde el aire', ['foto-sustentabilidad']),
      G([
        H('Sustentabilidad en Acción', 4, ['t-rotulo', 'c-texto']),
        H('Compromiso con el Futuro', 2, ['t-compromiso', 'c-naranja']),
        P('En Econut, implementamos prácticas de economía circular para maximizar el uso de recursos. Nuestra eficiencia hídrica y el uso de energía solar son pilares fundamentales para reducir el impacto ambiental y promover un futuro más sostenible.'),
      ], ['columna']),
    ], ['cert-abajo', 'cert-abajo-reparto', 'cert-abajo-reparto-movil', 'entra']),
  ], ['caja-certificaciones'])],
});

// 11 · El pie tampoco: vive en la región global «cod-region-footer».

// 12 · El aviso emergente va al FINAL, y sin movimiento: su capa es fija, y
//      dentro de una sección con animación de entrada quedaría escondida.
nodes.push(avisoEmergente());

writeFileSync('composicion-fiel.json', JSON.stringify({
  pageId: 20,
  documentId: 'cod-canvas-page-20',
  expectedRevision: Number(process.env.REV || 5),
  design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
  composition: { schemaVersion: 2, nodes },
}, null, 2));

const conMovimiento = nodes.filter((s) => JSON.stringify(s).includes('"entra"')).length;
console.log('reglas:', reglas.length, '· bloques:', nodes.length, '· nodos:', n);
console.log('bloques con movimiento:', conMovimiento, 'de', nodes.length);
