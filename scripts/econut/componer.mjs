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
  logoHorizontal: M + 'Logo-horizontal-@svg.svg',
  iconoAlerta: M + 'Icono-alerta@2x.png',
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
  brc: M + 'Logo-BRC-2019.avif',
  kosher: M + 'Isotipos-Kosher.avif',
  halal: M + 'Halal-Logo.avif',
  chile: M + 'Made-in-Chile-log.avif',
  cert5: M + 'd514ce_32d33a9f611747499c605679f39275f7mv2.avif',
  huertos: M + 'Control-de-huertos.avif',
  bandeja: M + 'd514ce_bd4f58c2fb644112944735865054300fmv2.avif',
  sag: M + 'Sag.avif',
  revision: M + 'd514ce_2e9d60bac05b4469aaf35aef477c5f69mv2.avif',
  videoBrazo: M + 'Brazo-robotico2.mp4',
  videoEconut: M + 'Video-Econut-2025-ok.mp4',
};

const reglas = [];
const R = (id, kind, value, { quien = 'reference', estado = 'reviewed' } = {}) => {
  reglas.push({
    id, kind,
    scope: { breakpoint: 'all', state: 'default' },
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
R('t-seccion', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(34px, 4.4vw, 58px)', fontWeight: 600, lineHeight: 1.1, align: 'start' });
R('t-seccion-centro', 'typography', { role: 'titulo-centrado', fontSize: 'clamp(34px, 4.4vw, 58px)', fontWeight: 600, lineHeight: 1.1, align: 'center' });
R('t-sub', 'typography', { role: 'subtitulo', family: "'Bodoni Moda', Georgia, serif", fontSize: '26px', fontWeight: 600, lineHeight: 1.25 });
R('t-rotulo', 'typography', { role: 'rotulo', fontSize: '13px', fontWeight: 600, letterSpacing: '0.14em', transform: 'uppercase' });
R('t-cuerpo', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.75, measure: '62ch' });
R('t-lead', 'typography', { role: 'bajada', fontSize: '19px', lineHeight: 1.6, measure: '54ch' });
R('t-cifra', 'typography', { role: 'cifra', fontSize: 'clamp(38px, 4.6vw, 62px)', fontWeight: 700, lineHeight: 1, align: 'center' });
R('t-cifra-pie', 'typography', { role: 'cifra-pie', fontSize: '13px', lineHeight: 1.45, align: 'center' });
R('t-aviso', 'typography', { role: 'aviso', fontSize: '13px', lineHeight: 1.6 });
R('t-pie', 'typography', { role: 'pie', fontSize: '13px', lineHeight: 1.7 });

// --- Ritmo y caja ----------------------------------------------------------
R('aire', 'spacing', { paddingBlock: '96px', paddingInline: '24px' });
R('aire-corto', 'spacing', { paddingBlock: '48px', paddingInline: '24px' });
R('aire-barra', 'spacing', { paddingBlock: '20px', paddingInline: '24px' });
R('caja', 'layout', { mode: 'stack', maxWidth: '1180px', gap: '26px', align: 'start' });
R('caja-centro', 'layout', { mode: 'stack', maxWidth: '1180px', gap: '26px', align: 'center' });
R('partida', 'layout', { mode: 'grid', columns: 2, gap: '56px', minColumnWidth: '340px', align: 'center', mobile: { mode: 'stack', columns: 1, gap: '28px' } });
R('tres', 'layout', { mode: 'grid', columns: 3, gap: '32px', minColumnWidth: '280px', align: 'start', mobile: { mode: 'stack', columns: 1, gap: '24px' } });
// OJO: cuando una regla de disposición trae minColumnWidth, el compilador
// IGNORA columns (ver layout_css). Con 180px de mínimo, los cuatro logotipos
// no caben en la mitad derecha y caen en 2x2. El original los pone en una
// fila, de 120x120 cada uno, así que el mínimo baja a 110px.
R('cuatro', 'layout', { mode: 'grid', columns: 4, gap: '20px', minColumnWidth: '110px', mobile: { mode: 'grid', columns: 2, gap: '18px' } });
R('cinco', 'layout', { mode: 'grid', columns: 4, gap: '36px', minColumnWidth: '130px', align: 'center', mobile: { mode: 'grid', columns: 3, gap: '20px' } });
// La tarjeta ocupa todo el alto de su celda y el botón se empuja al fondo,
// para que los tres queden a la misma altura aunque las listas midan
// distinto. En el original los tres botones están alineados.
R('tarjeta-alta', 'properties', { declarations: { height: '100%', 'align-content': 'start' } });
R('al-fondo', 'properties', { declarations: { 'margin-block-start': 'auto' } });
R('columna', 'layout', { mode: 'stack', gap: '14px', align: 'start', justify: 'start' });
R('barra-sup', 'layout', { mode: 'cluster', gap: '30px', justify: 'between', align: 'center', maxWidth: '1180px' });

// --- Superficies -----------------------------------------------------------
R('s-blanco', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('s-beige', 'surface', { backgroundColor: BEIGE, foregroundColor: TEXTO });
R('s-oscuro', 'surface', { backgroundColor: OSCURO, foregroundColor: BLANCO });
// La portada va sobre una foto a sangre, como en el sitio. Sin velos ni
// degradados: si hiciera falta legibilidad se resuelve con estructura.
R('aire-portada', 'spacing', { paddingBlock: '44px', paddingInline: '40px' });
R('s-portada', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO,
  backgroundAssetUrl: f.portadaFondo, backgroundPosition: 'center', backgroundSize: 'cover' });
R('s-aviso', 'surface', { backgroundColor: AVISO, foregroundColor: TEXTO });
// El aviso es UNA fila: icono angosto, el texto principal ancho, y las tres
// recomendaciones en columnas angostas. Las proporciones salen de medir el
// original a 1440: icono ~100px, texto ~500px, las tres ~190px cada una.
R('aviso-fila', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': '100px minmax(0, 1.9fr) minmax(0, 2.1fr)',
  'column-gap': '40px', 'align-items': 'start', width: '100%',
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
R('foto-ancha', 'media', { aspectRatio: '16/9', fit: 'cover', frame: 'rounded' });
R('foto-alta', 'media', { aspectRatio: '3/4', fit: 'cover', frame: 'rounded' });
R('icono', 'media', { fit: 'contain' });
R('gris', 'media', { fit: 'contain', filter: 'grayscale' });
R('logo-chico', 'layout', { mode: 'stack', maxWidth: '124px' });
R('cert-tam', 'layout', { mode: 'stack', maxWidth: '120px' });
R('filete', 'color', { role: 'filete', color: NARANJA, apply: 'background' });
R('cert-fila', 'layout', { mode: 'grid', columns: 2, gap: '40px', minColumnWidth: '240px', align: 'center', mobile: { mode: 'stack', columns: 1, gap: '24px' } });
R('panel-blanco', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
R('tarjeta-blanca', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO, shadow: 'sm' });
R('entra', 'motion', { trigger: 'scroll', effect: 'rise', duration: 520, easing: 'ease-out', threshold: 0.15, stagger: 110 });
R('boton', 'button', { variant: 'solid', tone: 'primary', size: 'md', width: 'auto', interaction: 'lift' });
R('boton-fondo', 'color', { role: 'boton-fondo', color: VERDE, apply: 'background' });
R('boton-texto', 'color', { role: 'boton-texto', color: BLANCO, apply: 'text' });
R('pildora', 'shape', { radius: 'pill', borderStyle: 'none' });
R('cuadrantes', 'interaction', { behavior: 'cuadrantes' });

// --- Nodos -----------------------------------------------------------------
let n = 0;
const id = (p) => p + '-' + (++n);
const H = (texto, nivel, reglas_) => ({ id: id('h'), kind: 'heading', ruleIds: reglas_, content: { text: texto, level: nivel } });
const P = (texto, reglas_ = ['t-cuerpo']) => ({ id: id('p'), kind: 'paragraph', ruleIds: reglas_, content: { text: texto } });
const IMG = (url, alt, reglas_ = ['foto']) => ({ id: id('i'), kind: 'image', ruleIds: reglas_, content: { assetUrl: url, alt } });
const G = (hijos, reglas_ = [], partes) => {
  const nodo = { id: id('g'), kind: 'group', ruleIds: reglas_, children: hijos };
  if (partes && Object.keys(partes).length) nodo.partes = partes;
  return nodo;
};
const LI = (items) => ({ id: id('l'), kind: 'list', ruleIds: ['t-cuerpo'], content: { ordered: false, items } });
const A = (label, href, reglas_ = ['t-rotulo']) => ({ id: id('a'), kind: 'link', ruleIds: reglas_, content: { label, href, target: 'self' } });

// Rótulo y título: el par que abre cada sección en el sitio real.
const abre = (rotulo, titulo, centrado = false) => [
  H(rotulo, 4, ['t-rotulo', 'c-texto']),
  H(titulo, 2, [centrado ? 't-seccion-centro' : 't-seccion', 'c-naranja']),
];

const nodes = [];

// 1 · Barra de aviso, arriba de todo, como en el sitio.
nodes.push({
  id: 'aviso', marker: 'aviso', kind: 'section', ruleIds: ['aire-corto', 's-aviso'],
  children: [G([
    G([
      IMG(f.iconoAlerta, 'Advertencia', ['icono-alerta']),
      G([
        H('Aviso a la comunidad:', 3, ['t-aviso-titulo', 'sin-margen']),
        P('Le informamos que se ha detectado el uso fraudulento de nuestra marca en redes sociales. Personas inescrupulosas están cometiendo estafas en la venta de productos, utilizando nuestra identidad de forma ilegítima.', ['t-aviso']),
        P('Estamos trabajando activamente para denunciar y eliminar estas cuentas falsas. Su seguridad es nuestra prioridad. Les pedimos que tomen las siguientes precauciones para evitar ser víctimas de estos fraudes:', ['t-aviso']),
      ], ['columna-junta']),
      G([
        G([H('Verifiquen la autenticidad:', 4, ['t-aviso-rotulo', 'sin-margen']), P('Antes de realizar cualquier compra, asegúrense de que la cuenta o página web que está viendo sea nuestra cuenta oficial.', ['t-aviso'])], ['columna-junta']),
        G([H('Sospeche de ofertas inusuales:', 4, ['t-aviso-rotulo', 'sin-margen']), P('Las estafas suelen atraer con precios increíbles. Si una oferta parece demasiado buena probablemente no sea real.', ['t-aviso'])], ['columna-junta']),
        G([H('Proteja su información personal:', 4, ['t-aviso-rotulo', 'sin-margen']), P('No comparta datos sensibles como contraseñas, números de tarjeta de crédito o códigos de seguridad.', ['t-aviso'])], ['columna-junta']),
      ], ['tres-juntas']),
    ], ['aviso-fila', 'entra']),
  ], ['caja'])],
});

// 2 · Encabezado. Medido en econut.cl: franja blanca de 100px con el
//     logotipo horizontal de 164x60 centrado, y NADA más. No hay menú; el que
//     había acá me lo había inventado.
R('barra-centrada', 'properties', { declarations: {
  display: 'flex', 'justify-content': 'center', 'align-items': 'center',
  width: '100%',
} });
R('logo-cabecera', 'properties', { declarations: { width: '164px', 'max-width': '164px' } });
nodes.push({
  id: 'encabezado', marker: 'encabezado', kind: 'header', ruleIds: ['aire-barra', 's-blanco'],
  children: [G([
    IMG(f.logoHorizontal, 'Econut · procesos, productos, perspectiva', ['logo-cabecera']),
  ], ['barra-centrada'])],
});

// 3 · Portada PARTIDA: texto a la izquierda, foto a la derecha.
nodes.push({
  id: 'portada', marker: 'portada', kind: 'section', ruleIds: ['aire', 's-portada'],
  children: [G([G([
    G([
      H('Innovación y sostenibilidad en cada nuez', 4, ['t-rotulo', 'c-texto']),
      H('Servicio de verdad', 1, ['t-portada', 'c-naranja']),
      H('La clave es el compromiso', 3, ['t-sub']),
      P('No se trata de vender excedentes de capacidad de proceso, sino de brindar soluciones completas para exportadores, con control de calidad, proyección productiva, manejo de inventarios, informes completos de resultados, despacho SAG, trazabilidad y seguridad hasta destino. Y todo a un costo único y claro.', ['t-lead']),
    ], ['columna', 'panel-blanco', 'aire-portada']),
    { id: id('v'), kind: 'video', ruleIds: ['foto-ancha', 'redondo'], content: { sourceUrl: f.videoBrazo, caption: '', ambient: true } },
  ], ['partida', 'entra'])], ['caja'])],
});

// 4 · Servicios
const servicio = (url, alt, nombre, texto, puntos) => G([
  IMG(url, alt, ['foto', 'redondo']),
  H(nombre, 3, ['t-sub', 'c-naranja']),
  P(texto),
  LI(puntos),
  { id: id('b'), kind: 'button', ruleIds: ['boton', 'boton-fondo', 'boton-texto', 'pildora', 'al-fondo'], content: { label: 'Más detalles', href: '#contacto', target: 'self' } },
], ['columna', 'tarjeta-alta']);

nodes.push({
  id: 'servicios', marker: 'servicios', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    ...abre('Nuestros servicios', 'Procesamos con pasión'),
    P('En Econut nos dedicamos al procesamiento de nueces desde su llegada desde el campo hasta el empaque final para exportación. Nuestro trabajo combina precisión técnica, compromiso humano y control de calidad en cada etapa.', ['t-lead']),
    G([
      servicio(f.saco, 'Nuez con cáscara en saco', 'Nuez con cáscara',
        'Selección y embalaje de nuez con cáscara por tamaño y calidad externa e interna, de acuerdo a estándares internacionales.',
        ['Embalaje en sacos de 10 y 25 kilos y cajas de hasta 10 kilos.']),
      servicio(f.manual, 'Partido y selección manual', 'Nuez sin cáscara manual',
        'Partido y selección manual de nueces por tamaño, color y calidad según estándares internacionales.',
        ['Capacidad diaria aproximada de 20 toneladas de producto en cáscara de ingreso.',
         'Envasado en atmósfera modificada en bolsas de 5, 6, 10 ó 12 kilos y en cajas de hasta 12 kilos.']),
      servicio(f.mecanico, 'Partido y selección mecánica', 'Nuez sin cáscara mecánico',
        'Partido y selección mecánica con inspección digital y visual de nueces por tamaño, color y calidad, según estándares internacionales.',
        ['Capacidad diaria aproximada de 40 toneladas de producto en cáscara de ingreso.',
         'Envasado en atmósfera modificada en bolsas de 10 ó 12 kilos y en cajas de hasta 12 kilos.']),
    ], ['tres', 'entra']),
  ], ['caja'])],
});

// 5 · Historia
nodes.push({
  id: 'historia', marker: 'historia', kind: 'section', ruleIds: ['aire', 's-blanco'],
  children: [G([G([
    G([
      ...abre('Veinte años', 'Nuestra historia'),
      P('Nacimos como una pequeña empresa familiar y ahora somos el proveedor líder de servicios de procesamiento de nueces para la exportación en el país.'),
      P('Nuestras plantas de proceso están ubicadas en el corazón de la mayor área productiva de nueces en Chile, lo que nos permite apoyar a los principales productores y exportadores del país.'),
      P('Estamos certificados en los protocolos sanitarios, éticos y de calidad más importantes, con una profunda comprensión de los estándares internacionales.'),
    ], ['columna']),
    IMG(f.linea, 'Línea de selección manual en la planta', ['foto', 'redondo']),
  ], ['partida', 'entra'])], ['caja'])],
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
  '--cod-pestanas-etiqueta-aire-x': '30px', '--cod-pestanas-etiqueta-aire-y': '4px',
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

const pestana = (numero, titulo, texto, icono, foto) => G([
  H(numero, 3, ['t-etiqueta-cifra']),
  G([
    G([
      IMG(icono, titulo, ['icono', 'cert-tam']),
      G([ H(titulo, 3, ['t-sub', 'c-naranja']), P(texto) ], ['columna']),
    ], ['partida-cifra']),
    IMG(foto, titulo, ['foto-ancha', 'redondo']),
  ], ['columna']),
]);
// El panel del original es texto arriba y fotografía abajo, no dos columnas
// con el icono ocupando media caja.
R('partida-cifra', 'properties', { declarations: {
  display: 'grid', 'grid-template-columns': '130px minmax(0, 1fr)', 'column-gap': '28px', 'align-items': 'start',
} });

nodes.push({
  id: 'cifras', marker: 'cifras', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    G([
      pestana('2005', 'Fundación de Econut',
        'Nacimos hace veinte años como una pequeña empresa familiar, con el proyecto de servir a la industria exportadora de nuez chilena. Una línea, mucho esfuerzo y un magnífico grupo de personas.', f.iFundacion, f.perspectiva),
      pestana('12.000', 'Metros cuadrados de instalaciones',
        'Hoy somos líderes en servicio de procesamiento de nueces para exportación en Chile, con tecnología moderna y dos plantas productivas con más de 12.000 metros cuadrados construidos.', f.iInstalaciones, f.aerea),
      pestana('2.000', 'Hectáreas de huertos atendidos',
        'Somos responsables de agregar valor a más de 2.000 hectáreas de nogales, cuyos dueños las han cuidado diligentemente. Por eso nos tomamos nuestra misión muy en serio.', f.iHectareas, f.plantaciones),
      pestana('10.000', 'Toneladas de capacidad de proceso',
        'Tres meses de proceso de nuez con cáscara y seis de nuez sin cáscara. Entregamos más de 100.000 kilos diarios de proceso en cáscara y 40.000 kilos diarios de nuez partida.', f.iProceso, f.mano),
    ], ['pestanas'], { etiqueta: ['pest-etiqueta', 'pest-etiqueta-activa'], lista: ['pest-lista'], panel: ['pest-panel'] }),
  ], ['caja'])],
});

// 7 · Instalaciones
nodes.push({
  id: 'plantas', marker: 'plantas', kind: 'section', ruleIds: ['aire', 's-blanco'],
  children: [G([
    ...abre('Nuestras plantas de procesamiento', 'Instalaciones de vanguardia', true),
    IMG(f.aereaChica, 'Vista aérea de las plantas de procesamiento de Econut', ['foto-ancha', 'redondo']),
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
    ...abre('Cuatro puntos de control', 'Garantía de calidad', true),
    G([
      control(f.huertos, 'Huertos de nogales', 'Control de huertos', [
        'Nuestros puntos de control comienzan con la fruta directamente en los huertos. Todas las nueces que recibimos han sido monitoreadas de acuerdo con exigentes estándares fitosanitarios.',
        'Durante la post cosecha también colaboramos con nuestros productores para lograr los mejores resultados del despelonado y secado.',
      ]),
      control(f.bandeja, 'Nueces en bandeja de selección', 'Control de calidad', [
        'Se toma una muestra importante de cada lote que ingresa a Econut para proyectar sus posibilidades en todas las áreas.',
        'Se tiene en cuenta el color externo, la distribución de tamaños, las condiciones de la cáscara, el rendimiento y la humedad.',
      ]),
      control(f.sag, 'Sello del SAG', 'Control de inocuidad', [
        'Seguimos el proceso de manufactura revisando constantemente las condiciones sanitarias del área y las herramientas de trabajo.',
        'Comprobamos la humedad y las tasas de coliformes, aerobio mesófilo, hongos y levaduras. El objetivo es evitar cualquier riesgo.',
      ]),
      control(f.revision, 'Revisión de una nuez partida', 'Control de producto terminado', [
        'Verificamos los factores sanitarios y de calidad durante los pasos de selección y empaquetado.',
        'Incluso antes de cada envío revisamos todos estos parámetros, para dar garantías reales a nuestros clientes.',
      ]),
    ], ['cuadrantes']),
  ], ['caja-centro'])],
});

// 9 · Certificaciones
nodes.push({
  id: 'certificaciones', marker: 'certificaciones', kind: 'section', ruleIds: ['aire-corto', 's-beige'],
  children: [G([
    { id: id('sep'), kind: 'separator', ruleIds: ['filete'], content: {} },
    G([
      H('Certificaciones', 2, ['t-seccion', 'c-naranja']),
      G([
        IMG(f.brc, 'BRCGS Food Safety', ['gris', 'cert-tam']),
        IMG(f.kosher, 'Kosher', ['gris', 'cert-tam']),
        IMG(f.halal, 'Halal', ['gris', 'cert-tam']),
        IMG(f.chile, 'Chilean Walnut Authentic', ['gris', 'cert-tam']),
      ], ['cuatro', 'panel-blanco', 'aire-corto', 'entra']),
    ], ['cert-fila']),
    { id: id('sep'), kind: 'separator', ruleIds: ['filete'], content: {} },
  ], ['caja'])],
});

// 10 · Compromiso
nodes.push({
  id: 'contacto', marker: 'contacto', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    { id: id('sep'), kind: 'separator', ruleIds: ['filete'], content: {} },
    G([
    IMG(f.aereaChica, 'Vista aérea de las instalaciones y los huertos', ['foto', 'redondo']),
    G([
      ...abre('Sustentabilidad en acción', 'Compromiso con el futuro'),
      P('En Econut implementamos prácticas de economía circular para maximizar el uso de recursos. Nuestra eficiencia hídrica y el uso de energía solar son pilares fundamentales para reducir el impacto ambiental y promover un futuro más sostenible.'),
      { id: id('b'), kind: 'button', ruleIds: ['boton', 'boton-fondo', 'boton-texto', 'pildora'], content: { label: 'Conversemos', href: '#contacto', target: 'self' } },
    ], ['columna']),
  ], ['partida', 'tarjeta-blanca', 'aire-corto', 'redondo', 'entra']),
  ], ['caja'])],
});

// 11 · Pie
nodes.push({
  id: 'pie', marker: 'pie', kind: 'footer', ruleIds: ['aire-corto', 's-oscuro'],
  children: [G([
    IMG(f.logoCalado, 'Econut', ['icono', 'logo-chico']),
    G([
      P('Ruta 78 de Septiembre s/n, Parcela 3, Fundo San Rafael', ['t-pie']),
      P('Rinconada de Doñihue, Región del Libertador', ['t-pie']),
    ], ['columna']),
  ], ['barra-sup'])],
});

// El encabezado va arriba de todo: en el sitio real la franja blanca con el
// logotipo está primero y la barra amarilla del aviso viene debajo.
nodes.unshift(...nodes.splice(nodes.findIndex((n) => n.id === 'encabezado'), 1));

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
