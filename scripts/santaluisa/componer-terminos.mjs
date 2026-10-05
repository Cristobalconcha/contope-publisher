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
  // LOS TÍTULOS NO SE DECLARAN ACÁ: salen de la escala compartida.
  //
  // Esta página los declaraba por su cuenta —32px el del documento, 24px el de
  // cada tema— y daba la casualidad de que coincidían con dos niveles de la
  // escala. Una coincidencia no es un sistema: el día que la escala cambie,
  // esta página se queda atrás sin que nada avise. Ahora usa
  // sl-titulo-portada-llana y sl-titulo-seccion-llana, que son esos mismos dos
  // niveles en su cara LLANA —un documento legal no lleva la cursiva ni las
  // versales de la marca— y que además escalan en teléfono, cosa que estas dos
  // medidas fijas no hacían.
  regla('sl-legal-titulo-aire', 'properties', { declarations: { 'margin-block-start': '21px', 'margin-block-end': '21px' } }),
  regla('sl-legal-nota', 'typography', { role: 'nota', fontSize: '13px', lineHeight: 1.5 }),
  regla('sl-legal-nota-aire', 'properties', { declarations: { 'margin-block-start': '13px', 'margin-block-end': '13px' } }),
  regla('sl-legal-entrada', 'typography', { role: 'entrada', fontSize: '17.5px', lineHeight: 1.6 }),
  regla('sl-legal-entrada-aire', 'properties', { declarations: { 'margin-block-start': '17px', 'margin-block-end': '17px' } }),
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
  // Lo que se pincha de un pliegue tiene que medir 44px de alto: medido, los
  // resúmenes daban 22. El relleno va en el párrafo y no en el botón para que
  // la zona que responde al dedo sea la misma que se ve.
  regla('sl-legal-encabezado-caja', 'properties', { declarations: {
    'padding-block-start': '11px', 'padding-block-end': '11px',
    'margin-block-start': '0', 'margin-block-end': '0',
  } }),
  regla('sl-legal-parrafo', 'typography', { role: 'parrafo-legal', fontSize: '13.5px', lineHeight: 1.5, measure: '620px' }),
  regla('sl-legal-parrafo-aire', 'properties', { declarations: { 'margin-block-start': '12px', 'margin-block-end': '0' } }),

  // --- Las tres bandas -------------------------------------------------------
  // El documento es largo y de una sola tinta: separarlo en bandas le da al ojo
  // dónde parar y deja claro que son dos documentos, no uno. Pedido de Cristóbal
  // el 4 de octubre de 2026, señalando dónde va el corte.
  regla('sl-legal-banda-clara', 'surface', { backgroundColor: '#FFFFFF' }),
  // Menos relleno donde hay onda: la forma ya hace de separación y sumarle los
  // 80px de la banda daba el hueco enorme que se veía.
  // La entrada: aire normal arriba, nada abajo. Ahí la onda es la separación, y
  // sumarle los 80px de la banda dejaba 176px de vacío antes del blanco.
  regla('sl-legal-aire-hasta-la-onda', 'properties', { declarations: {
    'padding-block-start': '80px', 'padding-block-end': '0',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),

  // Después de una onda tampoco hace falta relleno arriba: la curva ya separó.
  regla('sl-legal-aire-tras-la-onda', 'properties', { declarations: {
    'padding-block-start': '8px', 'padding-block-end': '80px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),

  regla('sl-legal-aire-con-onda', 'properties', { declarations: {
    'padding-block-start': '24px', 'padding-block-end': '24px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),

  // El separador: una onda baja, en tres capas con opacidad decreciente. La
  // forma es un SVG de la biblioteca de Medios, no una lista fija del plugin.
  // LA ONDA Y EL AIRE SON DOS COSAS DISTINTAS, y por eso ahora se declaran por
  // separado. A 44px la forma —que se dibuja en un lienzo de 120 de alto— queda
  // tan aplastada que lee como un defecto, no como una decisión; y el espacio
  // alrededor lo ponía el relleno de 80px de la banda, que sirve para todo y no
  // se podía ajustar sólo acá. Cristóbal: «es tan poco pronunciada que parece un
  // defecto y además el espacio es muy grande».
  //
  // Ahora: la onda sube a 96px para que se vea lo que es, y el aire baja a cero
  // porque la propia forma ya separa.  suma al alto cuando se quiera lo
  // contrario: una forma chica con mucho aire.
  regla('sl-legal-onda-abajo', 'divisor', {
    forma: SUBIDAS + '/2026/10/divisor-onda.svg',
    donde: 'abajo',
    alto: '96px',
    color: '#FFFFFF',
    capas: [
      { opacidad: 1 },
      { opacidad: 0.55, desplazamiento: '-40px' },
      { opacidad: 0.3, desplazamiento: '40px' },
    ],
    reserva: true,
    espacio: '0px',
  }, { porque: 'Separador bajo entre la entrada y el primer bloque; tres capas para que no lea como un recorte.' }),

  // UN CORTE, UN DIVISOR.
  //
  // Antes esta onda iba ARRIBA de la banda blanca, o sea en el mismo corte que
  // la anterior: dos divisores en el mismo borde. El segundo dibujaba ondas
  // blancas sobre blanco —invisible— y lo único que hacía era reservarse 96px
  // de vacío. Lo vio Cristóbal: «lo puedes poner en cualquiera de las dos
  // secciones, pero no en las dos».
  //
  // Ahora cierra el OTRO corte, el de vuelta al beige, y por eso su color es el
  // del fondo que viene abajo: un divisor se dibuja con el color de la banda
  // hacia la que lleva, no con el de la que está.
  regla('sl-legal-onda-cierre', 'divisor', {
    forma: SUBIDAS + '/2026/10/divisor-onda.svg',
    donde: 'abajo',
    alto: '96px',
    color: '#F5F0EB',
    voltear: true,
    capas: [
      { opacidad: 1 },
      { opacidad: 0.55, desplazamiento: '40px' },
      { opacidad: 0.3, desplazamiento: '-40px' },
    ],
    reserva: true,
    espacio: '0px',
  }, { porque: 'Cierra la banda blanca y devuelve el beige; volteada para que no sea la misma curva dos veces.' }),

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
      ruleIds: ['sl-legal-pagina', 'sl-legal-aire-hasta-la-onda', 'sl-legal-onda-abajo'],
      children: [
        G('entrada-hoja', ['sl-legal-hoja'], [
          P('legal-marca', 'Santa Luisa de Palpi', ['sl-legal-marca', 'sl-texto-oliva', 'sl-legal-marca-aire']),
          {
            id: 'legal-titulo', kind: 'heading',
            ruleIds: ['sl-titulo-portada-llana', 'sl-texto-oliva', 'sl-legal-titulo-aire'],
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
      ruleIds: ['sl-legal-banda-clara', 'sl-legal-aire-con-onda', 'sl-legal-onda-cierre'],
      children: [
        G('terminos-hoja', ['sl-legal-hoja'], [
          {
            id: 'legal-tema-1', kind: 'heading',
            ruleIds: ['sl-titulo-seccion-llana', 'sl-texto-oliva', 'sl-legal-tema-aire'],
            content: { level: 2, text: 'Términos y condiciones' },
          },
          acordeon('terminos', TERMINOS),
        ]),
      ],
    },

    // 3. Privacidad, de vuelta en el beige.
    {
      id: 'seccion-privacidad', kind: 'section', marker: 'privacidad',
      ruleIds: ['sl-legal-pagina', 'sl-legal-aire-tras-la-onda'],
      children: [
        G('privacidad-hoja', ['sl-legal-hoja'], [
          {
            id: 'legal-tema-2', kind: 'heading',
            ruleIds: ['sl-titulo-seccion-llana', 'sl-texto-oliva', 'sl-legal-tema-aire'],
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
