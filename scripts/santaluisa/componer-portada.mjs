/**
 * LA PORTADA de Santa Luisa, como composición.
 *
 * Es la última página del sitio y la más grande: 281 KB de HTML heredado, ocho
 * secciones, una galería de veinte fotos, dos mapas y un vídeo recortado. Era lo
 * único que seguía construido por fuera del constructor.
 *
 * LO QUE HUBO QUE ABRIR PARA PODER DECIRLA. Nada de esto estaba en el catálogo,
 * y cada hueco por sí solo habría bastado para justificar el atajo de dejarla
 * como HTML:
 *
 *  - LOS MÓDULOS GENERADOS. Los dos mapas no son contenido que alguien escriba:
 *    los produce `build-geo-map.mjs` consultando OpenStreetMap, y el de
 *    ubicación son 2.642 nodos. Ahora viven como recursos del sitio en
 *    `uploads/contope-modulos/` y la composición los NOMBRA, igual que el logo
 *    del encabezado. Ver `COD_Modulo`.
 *  - EL OTRO ENCUADRE. El fondo del hero es apaisado en escritorio y vertical en
 *    teléfono —no la misma foto más chica: otro recorte, porque el apaisado deja
 *    la casa fuera del cuadro—. El nodo `image` sólo sabía una fuente; ahora
 *    acepta `assetUrlVertical` y sale como `<picture>`.
 *
 * LO QUE YA ESTABA Y NO HUBO QUE INVENTAR: el vídeo con máscara de luminancia
 * (`matte: true`), la galería con lightbox y carrusel, el acordeón, la ventana
 * de WhatsApp y los títulos de dos caras.
 *
 * EL TEXTO ES EL DEL SITIO, literal. Sale de `portada-contenido.json` y
 * `portada-hero.json`, extraídos de la página publicada y no reescritos. OJO con
 * extraerlos de nuevo: la primera vez una expresión regular perdió una barra
 * invertida al pasar por el intérprete de órdenes y borró TODAS las eses del
 * contenido —«Detrá del nombre»—. Si hay que rehacerlo, que el texto vuelva
 * crudo y se limpie en Node, nunca en la página.
 *
 * LOS TÍTULOS salen de la escala de tres niveles aprobada el 4 de octubre de
 * 2026 (ver diseno.mjs). Esta página era la que tenía la dispersión: 55 y 48 en
 * la cursiva, 34 y 30 en las versales, cuatro tamaños que no eran un nivel sino
 * el de sección escrito dos veces a ojo. Acá desaparecen.
 *
 *   node componer-portada.mjs > portada.json
 */
import { readFileSync } from 'node:fs';
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 308;
const DOCUMENT_ID = 'ocd-canvas-page-7';
const SUBIDAS = '/wp-content/uploads';

const C = JSON.parse(readFileSync(new URL('./portada-contenido.json', import.meta.url), 'utf8'));
const H = JSON.parse(readFileSync(new URL('./portada-hero.json', import.meta.url), 'utf8'));
const E = JSON.parse(readFileSync(new URL('./portada-extra.json', import.meta.url), 'utf8'));

const WA = (texto) => `https://wa.me/56981866742?text=${encodeURIComponent(texto)}`;

/* ─────────────────────────────────────────── reglas propias de la portada ── */
const propias = [
  // --- El hero ---------------------------------------------------------------
  // Alto de pantalla completa, el fondo detrás y el texto encima. El vídeo de la
  // familia va recortado por máscara de luminancia, que el constructor ya sabía
  // hacer; lo que no sabía era traer dos encuadres de una misma foto.
  regla('sl-hero', 'properties', { declarations: {
    position: 'relative', display: 'flex', 'flex-direction': 'column',
    'justify-content': 'space-between',
    'min-height': '100svh', overflow: 'hidden',
  } }, { porque: 'El hero ocupa la pantalla; svh y no vh para que la barra del navegador móvil no lo corte.' }),
  // La sección trae 48px de relleno por omisión (.cod-section). El hero es a
  // sangre: su contenido empieza donde empieza la pantalla.
  regla('sl-hero-seccion', 'properties', { declarations: {
    'padding-top': '0px', 'padding-bottom': '0px',
    'padding-inline-start': '0px', 'padding-inline-end': '0px',
  } }),
  regla('sl-hero-fondo', 'properties', { declarations: {
    position: 'absolute', top: '0px', right: '0px', bottom: '0px', left: '0px',
    'z-index': '0',
    'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
  } }),
  regla('sl-hero-foto', 'properties', { declarations: {
    width: '100%', height: '100%', 'object-fit': 'cover', 'object-position': 'center',
    display: 'block',
  } }),
  // El vídeo de la familia, recortado.
  //
  // VA EN UN ENVOLTORIO y no sobre el propio vídeo: el compositor de
  // luminancia le pone `position: relative` a su caja, con la misma
  // especificidad que una regla de la composición, así que colocarlo desde acá
  // no gana. Medido: computaba `relative` y la familia salía flotando en medio
  // del hero. Colocar el envoltorio es además lo correcto: la posición es del
  // hero, el recorte es del módulo.
  //
  // VA CENTRADO, no pegado a la derecha. Medido mal la primera vez: la regla
  // del sitio declara `right:-170px` y me lo creí, sin ver que también lleva
  // `left:50%` y un desplazamiento de media caja. El resultado real es que la
  // familia queda centrada en la pantalla —x=235 con 810 de ancho a 1280, o
  // sea su centro en 640— y yo la había mandado al borde derecho.
  //
  // Por eso va con `left: 50%` y `translate(-50%)`: así sigue centrada a
  // cualquier ancho, que es lo que `right` no da.
  regla('sl-hero-familia', 'properties', { declarations: {
    position: 'absolute', left: '50%', bottom: '-49px', 'z-index': '1',
    transform: 'translateX(-50%)',
    width: 'min(63vw, 810px)', 'pointer-events': 'none',
  } }, { porque: 'Medido en el sitio a 1280: centro en 640, 810px de ancho, bottom -49.' }),
  regla('sl-hero-familia-movil', 'properties', { declarations: {
    width: '112vw', bottom: '-24px',
  } }, { bp: 'mobile' }),
  // ARRIBA Y CENTRADO, que es como está en el sitio. Medido a 1280: el bloque
  // arranca en y=41 y mide 720 de ancho, centrado. Lo había puesto abajo a la
  // izquierda, que es un diseño distinto y nadie lo pidió.
  regla('sl-hero-texto', 'properties', { declarations: {
    position: 'relative', 'z-index': '2',
    'max-width': '720px', width: '100%',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
    'padding-top': '41px', 'text-align': 'center',
    'line-height': '0',
  } }, { porque: 'Medido en el sitio a 1280: bloque de 720 centrado, empieza en y=41.' }),
  // El logo del hero: 280x107 y en blanco, sobre la foto.
  regla('sl-hero-logo', 'properties', { declarations: {
    display: 'block', width: '280px',
    // 5 y no 21: entre la figura y el título quedan 16px que no son margen de
    // ninguno de los dos —ni padding, ni línea en blanco; los medí uno por uno—
    // y el coste de cazarlos no compensaba. La separación REAL que se busca es
    // la del sitio: el título arranca en y=169 a 1280. Si algún día aparece el
    // origen de esos 16, esto vuelve a 21.
    'margin-top': '0px', 'margin-bottom': '5px',
    'margin-left': 'auto', 'margin-right': 'auto',
  } }),
  regla('sl-hero-titulo-aire', 'properties', { declarations: {
    'margin-top': '0px', 'margin-bottom': '0px',
  } }),
  regla('sl-hero-logo-img', 'properties', { declarations: {
    width: '280px', height: 'auto', display: 'block',
  } }),
  regla('sl-hero-velo', 'surface', {
    backgroundColor: '#14120C47',
    foregroundColor: '#FFFFFF',
  }, { porque: 'El texto va sobre foto; el velo es de opacidad pareja, no un degradado.' }),
  regla('sl-hero-velo-caja', 'properties', { declarations: {
    position: 'absolute', top: '0px', right: '0px', bottom: '0px', left: '0px', 'z-index': '1',
  } }),
  regla('sl-hero-desliza', 'typography', {
    role: 'desliza', family: 'var(--font-body)', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.14em', transform: 'uppercase', lineHeight: 1.5,
  }),
  regla('sl-hero-desliza-caja', 'properties', { declarations: {
    position: 'relative', 'z-index': '2', color: 'rgba(255, 255, 255, 0.85)',
    'text-align': 'center', 'padding-bottom': '0px', 'margin-top': '0px', 'margin-bottom': '23px',
  } }),

  // El oliva del texto, que vive en las otras recetas y no en el diseño
  // compartido. Repetido acá hasta que suba a diseno.mjs, donde corresponde.
  regla('sl-texto-oliva', 'color', { role: 'titulo', color: 'var(--oliva-700)' }),

  // La primera cara de un título va en bloque; la segunda sube para encajar.
  // La de encaje vive en el diseño compartido; esta todavía no.
  regla('sl-titulo-caps-caja', 'properties', { declarations: { display: 'block' } }),

  // La franja de atributos: ocho fichas bajo el hero.
  regla('sl-franja', 'surface', { backgroundColor: 'var(--oliva-700)', foregroundColor: 'var(--tierra-50)' }),
  regla('sl-franja-rejilla', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'repeat(4, minmax(0, 1fr))',
    'column-gap': '0px', 'row-gap': '0px',
    'max-width': '1440px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
  } }),
  regla('sl-franja-rejilla-tablet', 'properties', { declarations: {
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
  } }, { bp: 'tablet' }),
  regla('sl-franja-rejilla-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),
  regla('sl-ficha', 'properties', { declarations: {
    'padding-top': '22px', 'padding-bottom': '22px',
    'padding-inline-start': '22px', 'padding-inline-end': '22px',
    'border-bottom-width': '1px', 'border-bottom-style': 'solid',
    'border-bottom-color': 'rgba(246, 246, 243, 0.14)',
    'border-right-width': '1px', 'border-right-style': 'solid',
    'border-right-color': 'rgba(246, 246, 243, 0.14)',
  } }),
  regla('sl-ficha-texto', 'typography', {
    role: 'ficha', family: 'var(--font-body)', fontSize: '11px', fontWeight: 600,
    letterSpacing: '0.1em', lineHeight: 1.6, transform: 'uppercase',
  }),

  // --- Secciones del cuerpo ---------------------------------------------------
  regla('sl-seccion-aire', 'properties', { declarations: {
    'padding-block-start': '96px', 'padding-block-end': '96px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),
  regla('sl-seccion-aire-movil', 'properties', { declarations: {
    'padding-block-start': '64px', 'padding-block-end': '64px',
  } }, { bp: 'mobile' }),
  regla('sl-ancho', 'properties', { declarations: {
    'max-width': '1180px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
  } }),
  // El ancho completo, para mapas, planos y galerías. Es el primero de los tres
  // anchos del documento «Ancho, ritmo y botones».
  regla('sl-ancho-completo', 'properties', { declarations: {
    'max-width': '1440px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
  } }),
  regla('sl-fondo-crema', 'surface', { backgroundColor: 'var(--tierra-50)', foregroundColor: 'var(--oliva-700)' }),
  regla('sl-fondo-blanco', 'surface', { backgroundColor: '#FFFFFF', foregroundColor: 'var(--oliva-700)' }),
  regla('sl-fondo-verde', 'surface', { backgroundColor: 'var(--verde-50)', foregroundColor: 'var(--oliva-700)' }),

  regla('sl-parrafo-ancho', 'typography', { role: 'parrafo-portada', measure: '720px' }),
  regla('sl-parrafo-aire', 'properties', { declarations: { 'margin-block-start': '0px', 'margin-block-end': '18px' } }),

  // --- La galería del proyecto -------------------------------------------------
  regla('sl-galeria-rejilla', 'gallery', { mode: 'grid', columns: 4, mobileColumns: 1, gap: '14px', caption: 'none' }),
  regla('sl-galeria-lightbox', 'interaction', { behavior: 'lightbox' }),
  regla('sl-galeria-pieza', 'properties', { declarations: {
    'border-top-left-radius': '10px', 'border-top-right-radius': '10px',
    'border-bottom-right-radius': '10px', 'border-bottom-left-radius': '10px',
    overflow: 'hidden', cursor: 'pointer',
  } }),

  // --- Los dos módulos generados ------------------------------------------------
  // No llevan reglas de aspecto: su CSS viaja con ellos, que es lo que los hace
  // módulos y no pegotes. Acá sólo se les da sitio.
  regla('sl-modulo-caja', 'properties', { declarations: {
    width: '100%', 'margin-block-start': '28px', 'margin-block-end': '28px',
  } }),

  // --- La lista de lo que incluye el servicio de construcción --------------------
  regla('sl-lista', 'properties', { declarations: {
    'list-style-type': 'none', 'padding-inline-start': '0px',
    display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    'column-gap': '24px', 'row-gap': '10px', 'margin-block-start': '18px',
  } }),
  regla('sl-lista-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),

  // --- La nota legal de los modelos ----------------------------------------------
  regla('sl-nota', 'typography', { role: 'nota', fontSize: '11.5px', lineHeight: 1.6, measure: '560px' },
    { porque: 'La letra chica va al ancho corto del documento aprobado (520-560), no al del párrafo.' }),
  regla('sl-nota-color', 'properties', { declarations: { color: 'var(--oliva-500)' } }),

  // --- La cita de la historia -----------------------------------------------------
  regla('sl-cita', 'typography', { role: 'cita', family: 'var(--font-hero)', fontSize: 'clamp(28px, 3.2vw, 40px)', fontWeight: 400, lineHeight: 1.15 }),
  regla('sl-cita-color', 'properties', { declarations: { color: 'var(--dorado-600)' } }),

  // --- El cierre: Instagram y las dos tarjetas ------------------------------------
  regla('sl-cierre-rejilla', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    'column-gap': '20px', 'row-gap': '20px', 'margin-block-start': '36px',
  } }),
  regla('sl-cierre-rejilla-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),
  regla('sl-tarjeta', 'properties', { declarations: {
    'padding-top': '26px', 'padding-bottom': '26px',
    'padding-inline-start': '26px', 'padding-inline-end': '26px',
    'border-top-width': '1px', 'border-right-width': '1px',
    'border-bottom-width': '1px', 'border-left-width': '1px',
    'border-top-style': 'solid', 'border-right-style': 'solid',
    'border-bottom-style': 'solid', 'border-left-style': 'solid',
    'border-top-color': 'var(--oliva-200)', 'border-right-color': 'var(--oliva-200)',
    'border-bottom-color': 'var(--oliva-200)', 'border-left-color': 'var(--oliva-200)',
    'text-decoration-line': 'none', display: 'block',
  } }),
  regla('sl-tarjeta-foco', 'properties', { declarations: {
    'outline-width': '2px', 'outline-style': 'solid',
    'outline-color': 'var(--dorado-600)', 'outline-offset': '3px',
  } }, { estado: 'focus' }),

  // --- El pie --------------------------------------------------------------------
  regla('sl-pie-portada', 'surface', { backgroundColor: 'var(--oliva-900)', foregroundColor: 'var(--tierra-50)' }),
  regla('sl-pie-portada-aire', 'properties', { declarations: {
    'padding-block-start': '34px', 'padding-block-end': '34px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
    display: 'flex', 'flex-wrap': 'wrap', 'column-gap': '14px', 'row-gap': '8px',
    'align-items': 'center', 'justify-content': 'center',
  } }),
  regla('sl-pie-enlace-portada', 'properties', { declarations: {
    color: 'var(--tierra-50)', 'text-decoration-line': 'none',
  } }),
  regla('sl-pie-cookies-portada', 'interaction', { behavior: 'preferencias-cookies' },
    { porque: 'La ley exige poder CAMBIAR el consentimiento, no sólo darlo.' }),
];

/* ───────────────────────────────────────────────────────── atajos de nodo ── */
const P = (id, texto, reglas = ['sl-parrafo-aire']) => ({ id, kind: 'paragraph', ruleIds: reglas, content: { text: texto } });
const G = (id, reglas, hijos) => ({ id, kind: 'group', ruleIds: reglas, children: hijos });
const ROTULO = (id, texto) => ({ id, kind: 'paragraph', ruleIds: ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire'], content: { text: texto } });

/**
 * Un título de sección con sus dos caras dentro del MISMO encabezado, en el
 * nivel «sección» de la escala.
 */
const TITULO = (id, nivel, cursiva, versales, claro = false) => ({
  id, kind: 'heading', ruleIds: ['sl-titulo-aire'],
  content: {
    level: nivel,
    segments: [
      { text: cursiva, ruleIds: ['sl-titulo-script', 'sl-titulo-script-caja', 'sl-rotulo-color'] },
      { text: versales, ruleIds: ['sl-titulo-caps', 'sl-titulo-caps-encaje', claro ? 'sl-titulo-claro' : 'sl-texto-oliva'] },
    ],
  },
});

/** Un módulo generado: se nombra, no se pega. */
const MODULO = (id, nombre) => ({
  id, kind: 'shortcode', ruleIds: ['sl-modulo-caja'],
  content: { tag: 'contope_modulo', atts: { nombre } },
});

/* ────────────────────────────────────────────────────────── la composición ── */
const composicion = {
  schemaVersion: 2,
  label: 'Portada de Santa Luisa de Palpi',
  nodes: [
    // 1. EL HERO. Foto de fondo con sus dos encuadres, el vídeo de la familia
    //    recortado encima, y el título sobre un velo de opacidad pareja.
    {
      id: 'hero', kind: 'section', marker: 'inicio',
      ruleIds: ['sl-hero-seccion'],
      // EL REPARTO VA EN UN GRUPO, no en la sección: el compilador envuelve los
      // hijos de una sección en su contenedor de columnas, así que un flex
      // puesto en la sección reparte UN solo hijo —el envoltorio— y no el
      // contenido. Medido: «Desliza» quedaba pegado al título en vez de al pie
      // de la pantalla.
      children: [G('hero-caja', ['sl-hero'], [
        {
          id: 'hero-fondo', kind: 'image',
          ruleIds: ['sl-hero-fondo'],
          partes: { pieza: ['sl-hero-foto'] },
          content: {
            assetUrl: `${SUBIDAS}/2026/09/fondo-portada-escritorio.webp`,
            assetUrlVertical: `${SUBIDAS}/2026/09/fondo-portada-celular.webp`,
            alt: 'Casa en Santa Luisa de Palpi vista desde el camino, entre pasto alto con espigas y un cerco de madera, con los cerros al fondo',
          },
        },
        G('hero-velo', ['sl-hero-velo', 'sl-hero-velo-caja'], []),
        G('hero-familia-caja', ['sl-hero-familia', 'sl-hero-familia-movil'], [{
          id: 'hero-familia', kind: 'video',
          ruleIds: [],
          content: {
            sourceUrl: `${SUBIDAS}/2026/08/Familia-video-lumamatte-3.mp4`,
            // `matte` es el compositor de luminancia que ya traía el
            // constructor: el archivo lleva el vídeo arriba y su máscara
            // blanco/negro abajo, y el runtime los compone en vivo. `ambient`
            // es lo que lo deja sin controles, en bucle y sin sonido, que es
            // como se comporta en el sitio.
            matte: true, ambient: true,
          },
        }]),
        G('hero-texto', ['sl-hero-texto'], [
          // El logo, en blanco sobre la foto.
          {
            id: 'hero-logo', kind: 'image', ruleIds: ['sl-hero-logo'],
            partes: { pieza: ['sl-hero-logo-img'] },
            content: { assetUrl: `${SUBIDAS}/2026/10/logo-santa-luisa-blanco.svg`, alt: 'Santa Luisa de Palpi' },
          },
          // UN SOLO TÍTULO con sus tres tramos, que es como está en el sitio:
          // «Aquí ya hay vida» es la CARA CURSIVA del título, no un rótulo.
          // Haberla convertido en versalitas pequeñas fue el cambio que más
          // desfiguró el hero.
          {
            id: 'hero-titulo', kind: 'heading', ruleIds: ['sl-hero-titulo-aire'],
            content: {
              level: 1,
              segments: [
                { text: 'Aquí ya hay vida', ruleIds: ['sl-titulo-portada-script', 'sl-titulo-portada-script-encaje', 'sl-rotulo-color'] },
                { text: 'Suma la', ruleIds: ['sl-titulo-portada', 'sl-titulo-caps-caja', 'sl-titulo-claro'] },
                { text: 'tuya', ruleIds: ['sl-titulo-portada', 'sl-titulo-caps-caja', 'sl-titulo-claro'] },
              ],
            },
          },
        ]),
        P('hero-desliza', 'Desliza', ['sl-hero-desliza', 'sl-hero-desliza-caja']),
      ])],
    },

    // 2. LA FRANJA DE ATRIBUTOS: las ocho cosas que definen el proyecto.
    {
      id: 'franja', kind: 'section',
      ruleIds: ['sl-franja'],
      children: [
        G('franja-rejilla', ['sl-franja-rejilla', 'sl-franja-rejilla-tablet', 'sl-franja-rejilla-movil'],
          H.fichas.map((texto, i) => P(`ficha-${i + 1}`, texto, ['sl-ficha', 'sl-ficha-texto']))),
      ],
    },

    // 3. EL PROYECTO, con la galería de veinte fotos.
    {
      id: 'proyecto', kind: 'section', marker: 'proyecto',
      ruleIds: ['sl-fondo-crema', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('proyecto-ancho', ['sl-ancho'], [
          ROTULO('proyecto-rotulo', C.proyecto.parrafos[0]),
          TITULO('proyecto-titulo', 2, 'Una forma distinta', 'de vivir'),
          P('proyecto-p1', C.proyecto.parrafos[1], ['sl-parrafo-ancho', 'sl-parrafo-aire']),
          P('proyecto-p2', C.proyecto.parrafos[2], ['sl-parrafo-ancho', 'sl-parrafo-aire']),
          {
            id: 'proyecto-enlace', kind: 'link',
            ruleIds: ['sl-enlace-flecha'],
            content: { label: 'Conoce más del proyecto →', href: '/diferenciales/', target: 'self' },
          },
        ]),
        G('proyecto-galeria-ancho', ['sl-ancho-completo'], [
          {
            id: 'proyecto-galeria', kind: 'gallery',
            ruleIds: ['sl-galeria-rejilla', 'sl-galeria-lightbox'],
            partes: { pieza: ['sl-galeria-pieza'] },
            content: {
              items: E.galeria.map((g) => ({ kind: 'image', assetUrl: g.src, alt: g.alt })),
            },
          },
        ]),
      ],
    },

    // 4. EL PLANO DE LOTES. El plano es un módulo generado; lo que lo rodea es
    //    contenido y lo dice la composición.
    {
      id: 'plano', kind: 'section', marker: 'mapa-interactivo',
      ruleIds: ['sl-fondo-verde', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('plano-ancho', ['sl-ancho'], [
          ROTULO('plano-rotulo', C.mapaLotes.parrafos[0]),
          TITULO('plano-titulo', 2, 'Ven a elegir', 'tu terreno'),
          P('plano-p1', C.mapaLotes.parrafos[1], ['sl-parrafo-ancho', 'sl-parrafo-aire']),
          P('plano-p2', C.mapaLotes.parrafos[2], ['sl-parrafo-ancho', 'sl-parrafo-aire']),
        ]),
        G('plano-modulo-ancho', ['sl-ancho-completo'], [MODULO('plano-modulo', 'plano-de-lotes')]),
        G('plano-contacto', ['sl-ancho'], [
          P('plano-quedan', C.mapaLotes.parrafos[4], ['sl-parrafo-aire']),
          P('plano-interesa', C.mapaLotes.parrafos[5], ['sl-parrafo-aire']),
          P('plano-nombre', C.mapaLotes.parrafos[6], ['sl-parrafo-aire']),
          P('plano-fono', C.mapaLotes.parrafos[7], ['sl-parrafo-aire']),
          {
            id: 'plano-wa', kind: 'link',
            ruleIds: ['sl-btn', 'sl-btn-primario', 'sl-btn-foco'],
            content: {
              label: 'Escríbele por WhatsApp',
              href: WA('Hola, quiero consultar por un lote del plano de Santa Luisa de Palpi.'),
              target: 'blank',
            },
          },
        ]),
      ],
    },

    // 5. LOS MODELOS DE CASA.
    {
      id: 'modelos', kind: 'section', marker: 'modelos-casa',
      ruleIds: ['sl-fondo-blanco', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('modelos-ancho', ['sl-ancho'], [
          ROTULO('modelos-rotulo', C.modelos.parrafos[0]),
          TITULO('modelos-titulo', 2, 'Aquí ya está el lugar.', 'Ahora suma tu casa'),
          ...C.modelos.parrafos.slice(1, 6).map((t, i) => P(`modelos-p${i + 1}`, t, ['sl-parrafo-ancho', 'sl-parrafo-aire'])),
          {
            id: 'modelos-lista', kind: 'list',
            ruleIds: ['sl-lista', 'sl-lista-movil'],
            content: { ordered: false, items: C.modelos.listas },
          },
          P('modelos-tres', [C.modelos.parrafos[7], C.modelos.parrafos[8], C.modelos.parrafos[9]].join(' · '), ['sl-parrafo-aire']),
          {
            id: 'modelos-enlace', kind: 'link',
            ruleIds: ['sl-btn', 'sl-btn-primario', 'sl-btn-foco'],
            content: {
              label: 'Conoce los modelos disponibles',
              href: WA('Hola, quiero conocer los modelos de casa disponibles.'),
              target: 'blank',
            },
          },
          P('modelos-nota', C.modelos.parrafos[6], ['sl-nota', 'sl-nota-color', 'sl-parrafo-aire']),
        ]),
      ],
    },

    // 6. LA UBICACIÓN. El mapa de OpenStreetMap es un módulo generado.
    {
      id: 'ubicacion', kind: 'section', marker: 'ubicacion',
      ruleIds: ['sl-fondo-verde', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('ubicacion-ancho', ['sl-ancho'], [
          ROTULO('ubicacion-rotulo', C.ubicacion.parrafos[0]),
          TITULO('ubicacion-titulo', 2, 'Ubicación', 'privilegiada'),
          P('ubicacion-p1', C.ubicacion.parrafos[1], ['sl-parrafo-ancho', 'sl-parrafo-aire']),
        ]),
        G('ubicacion-modulo-ancho', ['sl-ancho-completo'], [MODULO('ubicacion-modulo', 'mapa-de-ubicacion')]),
        G('ubicacion-pie', ['sl-ancho'], [
          P('ubicacion-credito', C.ubicacion.parrafos[2], ['sl-nota', 'sl-nota-color', 'sl-parrafo-aire']),
          {
            id: 'ubicacion-google', kind: 'link',
            ruleIds: ['sl-enlace-flecha'],
            content: {
              label: 'Ver el proyecto en Google Maps ↗',
              href: 'https://www.google.com/maps/search/?api=1&query=Condominio+Santa+Luisa+de+Palpi%2C+Paine',
              target: 'blank',
            },
          },
        ]),
      ],
    },

    // 7. LA HISTORIA.
    {
      id: 'historia', kind: 'section', marker: 'historia',
      ruleIds: ['sl-fondo-crema', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('historia-ancho', ['sl-ancho'], [
          ROTULO('historia-rotulo', C.historia.parrafos[0]),
          {
            id: 'historia-titulo', kind: 'heading', ruleIds: ['sl-titulo-aire'],
            content: {
              level: 2,
              segments: [
                { text: 'Detrás', ruleIds: ['sl-titulo-script', 'sl-titulo-script-caja', 'sl-rotulo-color'] },
                { text: 'del nombre', ruleIds: ['sl-titulo-caps', 'sl-titulo-caps-encaje', 'sl-texto-oliva'] },
              ],
            },
          },
          ...C.historia.parrafos.slice(1, 4).map((t, i) => P(`historia-p${i + 1}`, t, ['sl-parrafo-ancho', 'sl-parrafo-aire'])),
          P('historia-cita', C.historia.parrafos[4], ['sl-cita', 'sl-cita-color', 'sl-parrafo-aire']),
          {
            id: 'historia-foto', kind: 'image', ruleIds: [],
            content: { assetUrl: C.historia.imgs[0].src, alt: C.historia.imgs[0].alt || 'Fundo El Palpi' },
          },
        ]),
      ],
    },

    // 8. EL CIERRE: Instagram y las dos puertas al resto del sitio.
    {
      id: 'cierre', kind: 'section',
      ruleIds: ['sl-fondo-blanco', 'sl-seccion-aire', 'sl-seccion-aire-movil'],
      children: [
        G('cierre-ancho', ['sl-ancho'], [
          {
            id: 'cierre-instagram', kind: 'link',
            ruleIds: ['sl-enlace-flecha'],
            content: { label: 'Santa Luisa en Instagram', href: 'https://www.instagram.com/santaluisadepalpi', target: 'blank' },
          },
          G('cierre-tarjetas', ['sl-cierre-rejilla', 'sl-cierre-rejilla-movil'], [
            {
              id: 'cierre-preguntas', kind: 'link',
              ruleIds: ['sl-tarjeta', 'sl-tarjeta-foco'],
              content: { label: 'Preguntas frecuentes — Resuelve tus dudas sobre parcelas, factibilidad y proceso de compra.', href: '/preguntas-frecuentes/', target: 'self' },
            },
            {
              id: 'cierre-contacto', kind: 'link',
              ruleIds: ['sl-tarjeta', 'sl-tarjeta-foco'],
              content: { label: 'Contacto — Escríbenos o agenda una visita guiada al terreno.', href: '/contacto/', target: 'self' },
            },
          ]),
        ]),
      ],
    },

    // 9. EL RECORRIDO 360, que es un módulo con su propio visor.
    {
      id: 'visor', kind: 'section',
      ruleIds: [],
      children: [MODULO('visor-modulo', 'visor-360')],
    },

    // 10. EL PIE.
    {
      id: 'pie', kind: 'footer',
      ruleIds: ['sl-pie-portada'],
      children: [
        G('pie-fila', ['sl-pie-portada-aire'], [
          {
            id: 'pie-legal', kind: 'link',
            ruleIds: ['sl-pie-enlace-portada'],
            content: { label: 'Términos y privacidad', href: '/terminos-y-condiciones/', target: 'self' },
          },
          P('pie-sep', '·', []),
          {
            id: 'pie-cookies', kind: 'button',
            ruleIds: ['sl-pie-enlace-portada', 'sl-pie-cookies-portada'],
            // El destino NO es postizo: sin JavaScript no hay panel que reabrir,
            // y el enlace tiene que llevar igual a la política. Lo exige el plugin
            // y tiene razón.
            content: { label: 'Preferencias de cookies', href: '/terminos-y-condiciones/', target: 'self' },
          },
        ]),
      ],
    },
  ],
};

process.stdout.write(JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_PORTADA || 0),
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
