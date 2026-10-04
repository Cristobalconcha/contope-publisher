/**
 * La página legal de Santa Luisa, como COMPOSICIÓN.
 *
 * Veintisiete secciones en dos bloques: once de términos y dieciséis de
 * privacidad. Es la página más grande de las cuatro interiores en texto, y la
 * segunda que usa el ACORDEÓN que hubo que construir para recomponerlas.
 *
 * EL TEXTO NO SE TOCA. Es un documento legal que trajo Cristóbal desde su
 * asesoría. Acá se copia literal desde la página existente —por eso el
 * contenido viene de un archivo generado y no escrito a mano— y lo único que
 * cambia es CÓMO está construido: deja de ser HTML suelto y pasa a ser una
 * composición que el constructor reconoce y que se puede editar desde el page
 * builder. Si alguna vez hay que cambiar una palabra, la cambia un abogado.
 *
 * Las fechas de publicación y de última modificación viajan como fichas
 * ({{post_date}}, {{post_modified}}) que el plugin resuelve al mostrar: así el
 * documento dice siempre la verdad sin que nadie tenga que acordarse de
 * actualizarlo, que en un texto legal importa.
 *
 *   node componer-terminos.mjs > terminos.json
 */
import { readFileSync } from 'node:fs';
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 630;
const DOCUMENT_ID = 'cod-canvas-page-164';
const SUBIDAS = '/wp-content/uploads';

/** Las 27 secciones, extraídas de la página y no reescritas. */
const SECCIONES = JSON.parse(readFileSync(new URL('./terminos-contenido.json', import.meta.url), 'utf8'));
// Once de términos, dieciséis de privacidad: el corte está medido en la página.
const TERMINOS = SECCIONES.slice(0, 11);
const PRIVACIDAD = SECCIONES.slice(11);

/* --------------------------------------------------- reglas propias de la página */
const propias = [
  regla('sl-legal-pagina', 'surface', { backgroundColor: '#F5F0EB' }),
  regla('sl-legal-aire', 'properties', { declarations: {
    'padding-block-start': '80px', 'padding-block-end': '80px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),
  // La medida de lectura: 704 de ancho, centrada. Un texto legal que se lee de
  // punta a punta de una pantalla de 1440 no se lee.
  regla('sl-legal-hoja', 'properties', { declarations: {
    'max-width': '704px',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
  } }),
  regla('sl-legal-marca', 'typography', { role: 'marca', fontSize: '11px', lineHeight: 1.5 }),
  regla('sl-legal-marca-aire', 'properties', { declarations: { 'margin-block-start': '11px', 'margin-block-end': '11px' } }),
  regla('sl-legal-titulo', 'typography', { role: 'titulo-legal', fontSize: '32px', fontWeight: 700, lineHeight: 1.05 }),
  regla('sl-legal-titulo-aire', 'properties', { declarations: { 'margin-block-start': '21px', 'margin-block-end': '21px' } }),
  regla('sl-legal-nota', 'typography', { role: 'nota', fontSize: '13px', lineHeight: 1.5 }),
  regla('sl-legal-nota-aire', 'properties', { declarations: { 'margin-block-start': '13px', 'margin-block-end': '13px' } }),
  regla('sl-legal-entrada', 'typography', { role: 'entrada', fontSize: '17.5px', lineHeight: 1.6 }),
  regla('sl-legal-entrada-aire', 'properties', { declarations: { 'margin-block-start': '17px', 'margin-block-end': '17px' } }),
  regla('sl-legal-tema', 'typography', { role: 'tema', fontSize: '24px', fontWeight: 700, lineHeight: 1.05 }),
  regla('sl-legal-tema-aire', 'properties', { declarations: { 'margin-block-start': '40px', 'margin-block-end': '8px' } }),

  // El acordeón de cada bloque.
  regla('sl-legal-acordeon', 'interaction', { behavior: 'acordeon' }, {
    porque: 'Veintisiete secciones seguidas no se leen; plegadas, se encuentra la que importa.',
  }),
  regla('sl-legal-lista', 'properties', { declarations: {
    'max-width': '760px', 'margin-block-start': '10px', 'margin-block-end': '28px',
  } }),
  regla('sl-legal-pliegue', 'properties', { declarations: {
    'padding-block-start': '18px', 'padding-block-end': '18px',
    'border-bottom-width': '1px', 'border-bottom-style': 'solid',
    'border-bottom-color': 'var(--dorado-600)',
  } }),
  regla('sl-legal-encabezado', 'typography', { role: 'seccion-legal', fontSize: '14.5px', fontWeight: 700, lineHeight: 1.5 }),
  regla('sl-legal-encabezado-caja', 'properties', { declarations: {
    'margin-block-start': '0', 'margin-block-end': '0',
  } }),
  regla('sl-legal-parrafo', 'typography', { role: 'parrafo-legal', fontSize: '13.5px', lineHeight: 1.5, measure: '620px' }),
  regla('sl-legal-parrafo-aire', 'properties', { declarations: { 'margin-block-start': '12px', 'margin-block-end': '0' } }),

  // --- Las tres bandas -------------------------------------------------------
  // El documento es largo y de una sola tinta: separarlo en bandas le da al ojo
  // dónde parar y deja claro que son dos documentos, no uno. Pedido de Cristóbal
  // el 4 de octubre de 2026, señalando dónde va el corte.
  regla('sl-legal-banda-clara', 'surface', { backgroundColor: '#FFFFFF' }),

  // El separador: una onda baja, en tres capas con opacidad decreciente. La
  // forma es un SVG de la biblioteca de Medios, no una lista fija del plugin.
  // 44px es «bajito»: marca el corte sin robarle altura al texto.
  regla('sl-legal-onda-abajo', 'divisor', {
    forma: SUBIDAS + '/2026/10/divisor-ondas.svg',
    donde: 'abajo',
    alto: '44px',
    color: '#FFFFFF',
    capas: [
      { opacidad: 1 },
      { opacidad: 0.55, desplazamiento: '-40px' },
      { opacidad: 0.3, desplazamiento: '40px' },
    ],
    reserva: true,
  }, { porque: 'Separador bajo entre la entrada y el primer bloque; tres capas para que no lea como un recorte.' }),

  regla('sl-legal-onda-arriba', 'divisor', {
    forma: SUBIDAS + '/2026/10/divisor-ondas.svg',
    donde: 'arriba',
    alto: '44px',
    color: '#FFFFFF',
    voltear: true,
    capas: [
      { opacidad: 1 },
      { opacidad: 0.55, desplazamiento: '40px' },
      { opacidad: 0.3, desplazamiento: '-40px' },
    ],
    reserva: true,
  }, { porque: 'El reverso del anterior: cierra la banda blanca y devuelve el beige.' }),

  regla('sl-texto-oliva', 'color', { role: 'cuerpo', color: 'var(--oliva-700)' }),
  regla('sl-pie-linea', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center',
    'align-items': 'baseline', 'column-gap': '6px', 'row-gap': '2px',
  } }),
  regla('sl-pie-cookies', 'interaction', { behavior: 'preferencias-cookies' }, {
    porque: 'Reabrir el panel de consentimiento: la ley exige poder cambiarlo, no sólo darlo.',
  }),
];

/* ------------------------------------------------------------------- los nodos */
const P = (id, texto, reglas) => ({ id, kind: 'paragraph', ruleIds: reglas, content: { text: texto } });
const G = (id, reglas, hijos) => ({ id, kind: 'group', ruleIds: reglas, children: hijos });

/** Un acordeón con sus pliegues, a partir de las secciones que se le pasen. */
const acordeon = (id, secciones, desde) => ({
  id, kind: 'group',
  ruleIds: ['sl-legal-acordeon', 'sl-legal-lista'],
  partes: { item: ['sl-legal-pliegue'] },
  children: secciones.map((s, i) => G(`${id}-${i + 1}`, [], [
    P(`${id}-${i + 1}-titulo`, s.p, ['sl-legal-encabezado', 'sl-texto-oliva', 'sl-legal-encabezado-caja']),
    ...s.r.map((texto, j) => P(`${id}-${i + 1}-p${j + 1}`, texto,
      ['sl-legal-parrafo', 'sl-texto-oliva', 'sl-legal-parrafo-aire'])),
  ])),
});

const composicion = {
  schemaVersion: 2,
  label: 'Términos y condiciones y Política de Privacidad',
  nodes: [
    // 1. La entrada, sobre el beige del documento. Se cierra con la onda.
    {
      id: 'seccion-entrada', kind: 'section', marker: 'legal',
      ruleIds: ['sl-legal-pagina', 'sl-legal-aire', 'sl-legal-onda-abajo'],
      children: [
        G('entrada-hoja', ['sl-legal-hoja'], [
          P('legal-marca', 'Santa Luisa de Palpi', ['sl-legal-marca', 'sl-texto-oliva', 'sl-legal-marca-aire']),
          {
            id: 'legal-titulo', kind: 'heading',
            ruleIds: ['sl-legal-titulo', 'sl-texto-oliva', 'sl-legal-titulo-aire'],
            content: { level: 1, text: 'Términos y condiciones y Política de Privacidad' },
          },
          // Las fichas de fecha las resuelve el plugin al mostrar la página.
          P('legal-fechas', 'Publicada el {{post_date}} · Última modificación: {{post_modified}} · Versión 1.0',
            ['sl-legal-nota', 'sl-texto-oliva', 'sl-legal-nota-aire']),
          P('legal-entrada-1',
            'Este documento explica las condiciones de uso del sitio web de Santa Luisa de Palpi y la forma en que recopilamos, utilizamos y protegemos los datos personales de quienes lo visitan o se comunican con nosotros.',
            ['sl-legal-entrada', 'sl-texto-oliva', 'sl-legal-entrada-aire']),
          P('legal-entrada-2',
            'La navegación por el sitio no constituye por sí sola una reserva, una compraventa ni una autorización para recibir publicidad.',
            ['sl-legal-entrada', 'sl-texto-oliva', 'sl-legal-entrada-aire']),
        ]),
      ],
    },

    // 2. Términos, sobre blanco. La onda de arriba la cierra y devuelve el beige.
    {
      id: 'seccion-terminos', kind: 'section', marker: 'terminos',
      ruleIds: ['sl-legal-banda-clara', 'sl-legal-aire', 'sl-legal-onda-arriba'],
      children: [
        G('terminos-hoja', ['sl-legal-hoja'], [
          {
            id: 'legal-tema-1', kind: 'heading',
            ruleIds: ['sl-legal-tema', 'sl-texto-oliva', 'sl-legal-tema-aire'],
            content: { level: 2, text: 'Términos y condiciones' },
          },
          acordeon('terminos', TERMINOS),
        ]),
      ],
    },

    // 3. Privacidad, de vuelta en el beige.
    {
      id: 'seccion-privacidad', kind: 'section', marker: 'privacidad',
      ruleIds: ['sl-legal-pagina', 'sl-legal-aire'],
      children: [
        G('privacidad-hoja', ['sl-legal-hoja'], [
          {
            id: 'legal-tema-2', kind: 'heading',
            ruleIds: ['sl-legal-tema', 'sl-texto-oliva', 'sl-legal-tema-aire'],
            content: { level: 2, text: 'Política de Privacidad' },
          },
          acordeon('privacidad', PRIVACIDAD),
        ]),
      ],
    },
    {
      id: 'pie', kind: 'footer',
      ruleIds: ['sl-pie', 'sl-pie-aire', 'sl-pie-texto'],
      children: [
        P('pie-marca', 'Santa Luisa de Palpi · Paine, Región Metropolitana, Chile', ['sl-pie-texto']),
        G('pie-legal', ['sl-pie-texto', 'sl-pie-linea'], [
          { id: 'pie-inicio', kind: 'link', ruleIds: ['sl-pie-enlace'], content: { label: 'Volver al inicio', href: '/', target: 'self' } },
          P('pie-separador', '·', []),
          { id: 'pie-preferencias', kind: 'button', ruleIds: ['sl-pie-enlace', 'sl-pie-cookies'], content: { label: 'Preferencias de cookies', href: '/terminos-y-condiciones/', target: 'self' } },
        ]),
      ],
    },
  ],
};

process.stdout.write(JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_TERMINOS || 0),
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
