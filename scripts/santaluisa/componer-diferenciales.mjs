/**
 * La página de Diferenciales de Santa Luisa, como COMPOSICIÓN del constructor.
 *
 * Seis bloques: la apertura con el portón, los cuatro pilares, el entorno
 * natural, el proyecto desde el aire, la galería de infraestructura con carrusel
 * y lightbox, y el cierre.
 *
 * Todo lo visible se midió en el navegador sobre el espejo local, clase por
 * clase, con getComputedStyle. Las reglas compartidas con las demás páginas
 * están en `diseno.mjs`; acá van sólo las propias.
 *
 * TRES TÍTULOS DE DOS CARAS, y en los dos órdenes: la apertura y el proyecto
 * empiezan por la cara script, «Naturaleza viva» empieza por la de caja alta.
 * Los tramos de un encabezado respetan el orden que se les dé, así que esto no
 * necesita dos reglas distintas ni un caso especial.
 *
 *   node componer-diferenciales.mjs > diferenciales.json
 */
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 62;
const DOCUMENT_ID = 'ocd-canvas-page-10';

const SUBIDAS = '/wp-content/uploads';

/* --------------------------------------------------- reglas propias de la página */
const propias = [
  // --- La caja de cada sección. A diferencia de Contacto, acá el fondo es el
  // del sitio (tierra-50 del tema) y el texto el oliva; sólo el bloque del agua
  // y el cierre invierten.
  regla('sl-seccion-caja', 'properties', { declarations: {
    'max-width': 'var(--max-width)',
    'margin-inline-start': 'auto',
    'margin-inline-end': 'auto',
    'padding-inline-start': '24px',
    'padding-inline-end': '24px',
    'padding-block-start': '48px',
    'padding-block-end': '56px',
  } }),
  regla('sl-seccion-seguida', 'properties', { declarations: {
    'max-width': 'var(--max-width)',
    'margin-inline-start': 'auto',
    'margin-inline-end': 'auto',
    'padding-inline-start': '24px',
    'padding-inline-end': '24px',
    'padding-block-start': '8px',
    'padding-block-end': '64px',
  } }),
  regla('sl-texto-oliva', 'color', { role: 'cuerpo', color: 'var(--oliva-700)' }),
  regla('sl-cuerpo-tierra', 'color', { role: 'cuerpo-suave', color: 'var(--slp-tierra-700)' }),

  // --- La apertura: texto estrecho a la izquierda, foto ancha a la derecha.
  // 364 y 728 no son dos columnas iguales, así que no cabe en layout.columns.
  regla('sl-apertura-grid', 'properties', { declarations: {
    display: 'grid',
    'grid-template-columns': 'minmax(0, 364px) minmax(0, 1fr)',
    'column-gap': '40px', 'row-gap': '40px',
    'align-items': 'center',
  } }),
  regla('sl-apertura-grid-angosto', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'tablet', porque: 'Dos columnas de 364 y 728 no caben bajo 1024; se apilan.' }),
  regla('sl-apertura-grid-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),

  // --- El marco de foto del sitio: esquinas de 20 y una sombra cálida. Se
  // repite en la apertura, el entorno y el proyecto, así que es UNA regla.
  regla('sl-foto-marco', 'properties', { declarations: {
    'border-top-left-radius': '20px', 'border-top-right-radius': '20px',
    'border-bottom-right-radius': '20px', 'border-bottom-left-radius': '20px',
    overflow: 'hidden',
    'box-shadow': '0 18px 44px rgba(60,50,20,0.16)',
  } }),
  regla('sl-foto-apaisada', 'media', { aspectRatio: '3/2', fit: 'cover' }),
  regla('sl-foto-cuadrada', 'media', { aspectRatio: '4/3', fit: 'cover' }),

  // --- Los pilares. La grilla es el truco: fondo tierra-100 y separación de
  // 1px, así que el propio fondo hace de línea divisoria entre las tarjetas
  // blancas. Copiarlo con bordes habría dado líneas dobles.
  regla('sl-pilares-banda', 'surface', { backgroundColor: '#FFFFFF' }),
  regla('sl-pilares-aire', 'properties', { declarations: {
    'padding-block-start': '56px', 'padding-block-end': '56px',
    'padding-inline-start': '0', 'padding-inline-end': '0',
  } }),
  regla('sl-pilares-intro', 'properties', { declarations: {
    'max-width': '640px',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
    'margin-block-end': '40px',
    'text-align': 'center',
  } }),
  regla('sl-pilares-grid', 'properties', { declarations: {
    display: 'grid',
    'grid-template-columns': 'repeat(4, minmax(0, 1fr))',
    'column-gap': '1px', 'row-gap': '1px',
    'background-color': 'var(--tierra-100)',
    'border-top-left-radius': '20px', 'border-top-right-radius': '20px',
    'border-bottom-right-radius': '20px', 'border-bottom-left-radius': '20px',
    overflow: 'hidden',
    'box-shadow': '0 18px 44px rgba(60,50,20,0.1)',
  } }),
  regla('sl-pilares-grid-tablet', 'properties', { declarations: {
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
  } }, { bp: 'tablet', porque: 'Cuatro tarjetas de 282 no caben; dos y dos.' }),
  regla('sl-pilares-grid-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),
  regla('sl-pilar', 'properties', { declarations: {
    'background-color': '#FFFFFF',
    'padding-top': '34px', 'padding-right': '26px',
    'padding-bottom': '34px', 'padding-left': '26px',
    'text-align': 'center',
  } }),
  regla('sl-pilar-titulo', 'typography', { role: 'pilar-titulo', fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em', lineHeight: 1.5, transform: 'uppercase', align: 'center' }),
  regla('sl-pilar-titulo-aire', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '8px' } }),
  regla('sl-pilar-cuerpo', 'typography', { role: 'pilar-cuerpo', fontSize: '13px', lineHeight: 1.5, align: 'center' }),

  // --- El bloque del agua: el único con el fondo oliva, media caja de texto y
  // media de foto, sin separación entre ellas.
  regla('sl-bloque-oliva', 'properties', { declarations: {
    display: 'grid',
    'grid-template-columns': 'minmax(0, 0.87fr) minmax(0, 1fr)',
    'background-color': 'var(--oliva-700)',
    'border-top-left-radius': '20px', 'border-top-right-radius': '20px',
    'border-bottom-right-radius': '20px', 'border-bottom-left-radius': '20px',
    overflow: 'hidden',
    'box-shadow': '0 18px 44px rgba(60,50,20,0.16)',
    'align-items': 'center',
  } }),
  regla('sl-bloque-oliva-angosto', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'tablet' }),
  regla('sl-bloque-oliva-movil', 'properties', { declarations: {
    'grid-template-columns': 'minmax(0, 1fr)',
  } }, { bp: 'mobile' }),
  regla('sl-bloque-oliva-texto', 'properties', { declarations: {
    'padding-top': '40px', 'padding-right': '44px',
    'padding-bottom': '40px', 'padding-left': '44px',
  } }),
  regla('sl-foto-alta', 'media', { aspectRatio: '4/3', fit: 'cover' }),

  // --- El proyecto desde el aire: dos columnas iguales.
  regla('sl-proyecto-grid', 'layout', {
    mode: 'grid', columns: 2, gap: '48px', align: 'center',
    mobile: { mode: 'stack', gap: '32px' },
  }),
  regla('sl-proyecto-grid-tablet', 'layout', { mode: 'stack', gap: '32px', align: 'start' }, { bp: 'tablet' }),

  // --- La galería de infraestructura. El carrusel y el lightbox ya existían en
  // el catálogo; lo que no se podía antes era declarar la galería con sus ocho
  // leyendas desde una composición sin escribir el marcado a mano.
  regla('sl-galeria', 'gallery', {
    mode: 'carousel', columns: 4, mobileColumns: 1, gap: '12px',
    caption: 'below', controls: 'arrows',
  }),
  regla('sl-galeria-carrusel', 'interaction', { behavior: 'carousel-basic', mode: 'track', visible: 4, visibleMobile: 1 }),
  regla('sl-galeria-lightbox', 'interaction', { behavior: 'lightbox' }),
  regla('sl-galeria-aire', 'properties', { declarations: { 'margin-block-start': '32px' } }),
  // Las piezas de la galería no son nodos, así que no reciben clases de regla:
  // se alcanzan por sus PARTES, que el constructor expone desde la 0.3.69.
  // Antes de eso las leyendas salían a 16px donde el original las tiene a 11,5
  // y las flechas sin estilo, y no había forma de arreglarlo sin CSS a mano.
  regla('sl-galeria-leyenda', 'typography', { role: 'leyenda', fontSize: '11.5px', fontWeight: 600, lineHeight: 1.5 }),
  regla('sl-galeria-leyenda-color', 'color', { role: 'leyenda', color: 'var(--slp-tierra-700)' }),
  regla('sl-galeria-leyenda-aire', 'properties', { declarations: {
    'margin-block-start': '10px', 'margin-inline-start': '2px', 'margin-block-end': '0',
  } }),
  regla('sl-galeria-foto', 'properties', { declarations: {
    'border-top-left-radius': '14px', 'border-top-right-radius': '14px',
    'border-bottom-right-radius': '14px', 'border-bottom-left-radius': '14px',
    overflow: 'hidden',
  } }),
  // Las flechas: 44px para el dedo. Medido, salían a 20x21 porque el runtime
  // las fabrica sin clase y no había forma de alcanzarlas; la parte «flecha» del
  // contrato de galería existe desde la 0.3.71 justo por esto.
  regla('sl-galeria-flecha', 'properties', { declarations: {
    'min-width': '44px', 'min-height': '44px',
    'background-color': '#FFFFFF', color: 'var(--oliva-700)',
    'border-top-left-radius': '50%', 'border-top-right-radius': '50%',
    'border-bottom-right-radius': '50%', 'border-bottom-left-radius': '50%',
    'box-shadow': '0 6px 16px rgba(40,35,20,0.18)', cursor: 'pointer',
    'font-size': '20px', 'line-height': '1',
  } }),

  regla('sl-galeria-flechas', 'properties', { declarations: {
    display: 'flex', 'justify-content': 'center', 'column-gap': '12px', 'margin-block-start': '16px',
  } }),

  // --- El cierre: banda oliva con el botón a WhatsApp.
  regla('sl-cierre', 'surface', { backgroundColor: 'var(--oliva-700)', foregroundColor: 'var(--tierra-50)' }),
  regla('sl-cierre-aire', 'properties', { declarations: {
    'padding-block-start': '40px', 'padding-block-end': '40px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
    'text-align': 'center',
  } }),
  regla('sl-cierre-linea', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center',
    'align-items': 'center', 'column-gap': '20px', 'row-gap': '14px',
  } }),
];

/* ------------------------------------------------------------------- los nodos */
const P = (id, texto, reglas) => ({ id, kind: 'paragraph', ruleIds: reglas, content: { text: texto } });
const G = (id, reglas, hijos) => ({ id, kind: 'group', ruleIds: reglas, children: hijos });
const IMG = (id, archivo, alt, reglas) => ({ id, kind: 'image', ruleIds: reglas, content: { assetUrl: SUBIDAS + archivo, alt } });
/** Un título de dos caras. El orden de los tramos es el que se le dé. */
const TITULO = (id, nivel, tramos, reglas = ['sl-titulo-aire']) => ({
  id, kind: 'heading', ruleIds: reglas,
  content: { level: nivel, segments: tramos },
});
const SCRIPT = (texto, primero = true) => ({
  text: texto,
  ruleIds: ['sl-titulo-script', primero ? 'sl-titulo-script-caja' : 'sl-titulo-script-encaje', 'sl-rotulo-color'],
});
const CAPS = (texto, primero = true, claro = false) => ({
  text: texto,
  ruleIds: ['sl-titulo-caps', primero ? 'sl-titulo-caps-caja' : 'sl-titulo-caps-encaje', claro ? 'sl-titulo-claro' : 'sl-texto-oliva'],
});

const PILARES = [
  ['Claridad', 'Toda la información que necesitas para tomar tu decisión, sin letra chica.'],
  ['Validación', 'Documentación y respaldo legal, disponibles para revisar antes de comprar.'],
  ['Acompañamiento', 'Siempre tendrás contacto directo para acompañarte en cada etapa del proceso.'],
  ['Confianza', 'Un proyecto honesto y transparente, que da tranquilidad para avanzar.'],
];

const GALERIA = [
  ['/open-codesign/dif-4.jpg', 'Grifo contra incendios instalado en el loteo', 'Agua certificada'],
  ['/2026/09/dif-5-vertical.jpg', 'Poste y transformador de energía eléctrica subterránea', 'Luz subterránea'],
  ['/2026/09/serv-tablero.jpg', 'Tablero de control eléctrico del loteo', 'Tablero de control'],
  ['/2026/09/serv-tablero-interior.jpg', 'Interior del tablero con los circuitos de bombas y pozo', 'Bombas y pozo'],
  ['/2026/09/serv-medidores.jpg', 'Cajas de empalme eléctrico instaladas en el poste', 'Empalme por parcela'],
  ['/2026/09/dif-6-vertical.jpg', 'Cámara de registro de conexión eléctrica individual', 'Conexión por parcela'],
  ['/2026/09/dif-7-vertical.jpg', 'Cámara de registro de urbanización soterrada', 'Urbanización soterrada'],
  ['/2026/09/galeria-camino-luminaria.jpg', 'Camino interior con luminaria encendida al anochecer', 'Iluminación del camino'],
];

const composicion = {
  schemaVersion: 2,
  label: 'Diferenciales',
  nodes: [
    // 1. La apertura.
    {
      id: 'seccion-apertura', kind: 'section', marker: 'el-proyecto',
      ruleIds: ['sl-seccion-caja'],
      children: [
        G('apertura-grid', ['sl-apertura-grid', 'sl-apertura-grid-angosto', 'sl-apertura-grid-movil'], [
          G('apertura-texto', [], [
            P('apertura-rotulo', 'El proyecto', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
            TITULO('apertura-titulo', 1, [SCRIPT('Lo que hace distinta'), CAPS('a Santa Luisa', false)]),
            P('apertura-bajada',
              'En un mercado de loteos masivos, elegimos la privacidad. Santa Luisa es un proyecto boutique de solo 22 unidades: ser parte representa el privilegio de integrar una comunidad pequeña, segura y organizada, donde el lujo del silencio está disponible para sus miembros.',
              ['sl-cuerpo', 'sl-texto-oliva']),
          ]),
          G('apertura-foto', ['sl-foto-marco'], [
            IMG('apertura-imagen', '/open-codesign/dif-1.jpg', 'Portón de acceso al loteo Santa Luisa de Palpi', ['sl-foto-apaisada']),
          ]),
        ]),
      ],
    },

    // 2. Los cuatro pilares, sobre banda blanca.
    {
      id: 'seccion-pilares', kind: 'section', marker: 'pilares',
      ruleIds: ['sl-pilares-banda', 'sl-pilares-aire'],
      children: [
        G('pilares-caja', ['sl-wrap'], [
          G('pilares-intro', ['sl-pilares-intro'], [
            P('pilares-rotulo', 'Nuestros pilares', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
            TITULO('pilares-titulo', 2, [SCRIPT('Cuatro razones'), CAPS('para elegirnos', false)]),
          ]),
          G('pilares-grid', ['sl-pilares-grid', 'sl-pilares-grid-tablet', 'sl-pilares-grid-movil'],
            PILARES.map(([titulo, cuerpo], i) => G(`pilar-${i + 1}`, ['sl-pilar'], [
              P(`pilar-${i + 1}-titulo`, titulo, ['sl-pilar-titulo', 'sl-texto-oliva', 'sl-pilar-titulo-aire']),
              P(`pilar-${i + 1}-cuerpo`, cuerpo, ['sl-pilar-cuerpo', 'sl-cuerpo-tierra']),
            ]))),
        ]),
      ],
    },

    // 3. El entorno natural: el bloque oliva.
    {
      id: 'seccion-entorno', kind: 'section', marker: 'entorno',
      ruleIds: ['sl-seccion-caja'],
      children: [
        G('entorno-bloque', ['sl-bloque-oliva', 'sl-bloque-oliva-angosto', 'sl-bloque-oliva-movil'], [
          G('entorno-texto', ['sl-bloque-oliva-texto'], [
            P('entorno-rotulo', 'Entorno natural', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
            TITULO('entorno-titulo', 2, [CAPS('Naturaleza viva', true, true), SCRIPT('a tu alrededor', false)]),
            P('entorno-bajada',
              'Bosques nativos, fauna en libertad y senderos de montaña. La precordillera y los valles del Maipo ofrecen ecosistemas para explorar, contemplar y reconectar con lo natural — a minutos del proyecto.',
              ['sl-cuerpo', 'sl-cuerpo-color']),
          ]),
          G('entorno-foto', [], [
            IMG('entorno-imagen', '/open-codesign/dif-2.jpg', 'Estero natural bajo árboles nativos en el entorno de Santa Luisa de Palpi', ['sl-foto-alta']),
          ]),
        ]),
      ],
    },

    // 4. El proyecto desde el aire.
    {
      id: 'seccion-proyecto', kind: 'section', marker: 'el-loteo',
      ruleIds: ['sl-seccion-seguida'],
      children: [
        G('proyecto-grid', ['sl-proyecto-grid', 'sl-proyecto-grid-tablet'], [
          G('proyecto-texto', [], [
            P('proyecto-rotulo', 'Aquí ya hay vida', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
            TITULO('proyecto-titulo', 2, [SCRIPT('No es una promesa,'), CAPS('es un hecho', false)]),
            P('proyecto-bajada',
              'Trece hectáreas y veintidós parcelas de cinco mil metros cuadrados cada una, pensadas para quienes buscan más espacio para vivir. Cada parcela cuenta con acceso vehicular directo y la urbanización necesaria para construir sin esperas.',
              ['sl-cuerpo', 'sl-texto-oliva']),
          ]),
          G('proyecto-foto', ['sl-foto-marco'], [
            IMG('proyecto-imagen', '/open-codesign/dif-3.jpeg', 'Vista aérea del loteo Santa Luisa de Palpi, parcelas y caminos interiores', ['sl-foto-cuadrada']),
          ]),
        ]),
      ],
    },

    // 5. La infraestructura, en galería con carrusel y lightbox.
    {
      id: 'seccion-infra', kind: 'section', marker: 'infraestructura',
      ruleIds: ['sl-seccion-seguida'],
      children: [
        P('infra-rotulo', 'La urbanización', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
        {
          id: 'infra-galeria', kind: 'gallery',
          ruleIds: ['sl-galeria', 'sl-galeria-carrusel', 'sl-galeria-lightbox', 'sl-galeria-aire'],
          partes: {
            leyenda: ['sl-galeria-leyenda', 'sl-galeria-leyenda-color', 'sl-galeria-leyenda-aire'],
            pieza: ['sl-galeria-foto'],
            controles: ['sl-galeria-flechas'],
            flecha: ['sl-galeria-flecha'],
          },
          content: {
            items: GALERIA.map(([archivo, alt, leyenda]) => ({
              kind: 'image', assetUrl: SUBIDAS + archivo, alt, caption: leyenda,
            })),
          },
        },
      ],
    },

    // 6. El cierre.
    {
      id: 'seccion-cierre', kind: 'section',
      ruleIds: ['sl-cierre', 'sl-cierre-aire'],
      children: [
        G('cierre-linea', ['sl-cierre-linea'], [
          P('cierre-texto', '¿Tu duda no está aquí? Contacta a Carlos en el +56 9 8186 6742.', ['sl-cuerpo', 'sl-cuerpo-color']),
          {
            id: 'cierre-boton', kind: 'button', ruleIds: ['sl-btn', 'sl-btn-primario', 'sl-btn-foco'],
            content: {
              label: 'Escríbele directo a Carlos',
              href: 'https://wa.me/56981866742?text=Hola%2C%20tengo%20una%20consulta%20sobre%20Santa%20Luisa%20de%20Palpi.',
              target: 'blank',
            },
          },
        ]),
      ],
    },

    // El pie, igual que en Contacto: es cromo del sitio.
    {
      id: 'pie', kind: 'footer',
      ruleIds: ['sl-pie', 'sl-pie-aire', 'sl-pie-texto'],
      children: [
        P('pie-marca', 'Santa Luisa de Palpi · Paine, Región Metropolitana, Chile', ['sl-pie-texto']),
        G('pie-legal', ['sl-pie-texto', 'sl-pie-linea'], [
          { id: 'pie-terminos', kind: 'link', ruleIds: ['sl-pie-enlace'], content: { label: 'Términos y privacidad', href: '/terminos-y-condiciones/', target: 'self' } },
          P('pie-separador', '·', []),
          { id: 'pie-preferencias', kind: 'button', ruleIds: ['sl-pie-enlace', 'sl-pie-cookies'], content: { label: 'Preferencias de cookies', href: '/terminos-y-condiciones/', target: 'self' } },
        ]),
      ],
    },
  ],
};

/* ------------------------------------------- las reglas que comparte con Contacto */
propias.push(
  regla('sl-titulo-caps-caja', 'properties', { declarations: { display: 'block' } }),
  regla('sl-titulo-script-encaje', 'properties', { declarations: { display: 'block', 'margin-block-start': '-10px' } }),
  regla('sl-pie-linea', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center',
    'align-items': 'baseline', 'column-gap': '6px', 'row-gap': '2px',
  } }),
  regla('sl-pie-cookies', 'interaction', { behavior: 'preferencias-cookies' }, {
    porque: 'Reabrir el panel de consentimiento: la ley exige poder cambiarlo, no sólo darlo.',
  }),
);

process.stdout.write(JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_DIFERENCIALES || 0),
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
