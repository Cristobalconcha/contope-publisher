/**
 * La página de Preguntas frecuentes de Santa Luisa, como COMPOSICIÓN.
 *
 * Es la primera página que usa el ACORDEÓN, el módulo que hubo que construir
 * para poder recomponerla: sus nueve pliegues estaban escritos a mano con
 * `<details>` porque el constructor no sabía decirlo. El de Términos usa el
 * mismo, con veintisiete.
 *
 * La página es una tarjeta clara sobre una foto del camino, con la persona
 * recortada asomando por el borde derecho. Esa superposición se arma con una
 * regla `posicion`, de las cinco familias que se sumaron el 3 de octubre: sin
 * ellas también habría habido que escribirla a mano.
 *
 * Todo lo visible se midió en el navegador sobre el espejo local.
 *
 *   node componer-preguntas.mjs > preguntas.json
 */
import { readFileSync } from 'node:fs';
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 61;
const DOCUMENT_ID = 'ocd-canvas-page-12';
const SUBIDAS = '/wp-content/uploads';

/**
 * Las nueve preguntas, sacadas del HTML de la página y no escritas de nuevo:
 * copiarlas a mano es la forma más fácil de cambiarle el texto a un cliente sin
 * querer. El archivo lo genera el mismo guion que las extrajo.
 */
const PREGUNTAS = JSON.parse(readFileSync(new URL('./preguntas-contenido.json', import.meta.url), 'utf8'));

/* --------------------------------------------------- reglas propias de la página */
const propias = [
  // La foto del camino, de fondo de toda la sección.
  regla('sl-faq-fondo', 'surface', {
    backgroundAssetUrl: SUBIDAS + '/open-codesign/galeria-camino.jpg',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }),
  regla('sl-faq-marco', 'properties', { declarations: {
    'max-width': 'var(--max-width)',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
    'padding-block-start': '40px', 'padding-block-end': '108px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
    position: 'relative',
  } }),

  // La tarjeta clara. El margen derecho de 283 es el hueco que le deja a la
  // persona recortada; no es un capricho de maquetación.
  regla('sl-faq-tarjeta', 'properties', { declarations: {
    'background-color': 'var(--tierra-50)',
    'padding-top': '48px', 'padding-right': '56px',
    'padding-bottom': '52px', 'padding-left': '56px',
    'margin-block-start': '48px', 'margin-block-end': '48px',
    'margin-inline-start': '56px', 'margin-inline-end': '283px',
    'border-top-left-radius': '20px', 'border-top-right-radius': '20px',
    'border-bottom-right-radius': '20px', 'border-bottom-left-radius': '20px',
    position: 'relative',
  } }),
  regla('sl-faq-tarjeta-angosta', 'properties', { declarations: {
    'margin-inline-start': '0', 'margin-inline-end': '0',
    'padding-right': '28px', 'padding-left': '28px',
  } }, { bp: 'tablet', porque: 'Bajo 1024 la persona no cabe al lado; la tarjeta ocupa el ancho.' }),
  regla('sl-faq-tarjeta-movil', 'properties', { declarations: {
    'margin-inline-start': '0', 'margin-inline-end': '0',
    'padding-top': '32px', 'padding-right': '20px',
    'padding-bottom': '32px', 'padding-left': '20px',
  } }, { bp: 'mobile' }),

  // La persona recortada: asoma por el borde derecho y se sale por abajo.
  regla('sl-faq-persona', 'posicion', {
    modo: 'absoluta', derecha: '130px', abajo: '-155px', capa: 3,
  }),
  regla('sl-faq-persona-medida', 'properties', { declarations: { width: '295px', height: 'auto' } }),
  // Bajo 1024 estorba: la tarjeta pasa a ocupar el ancho y la persona sobra.
  regla('sl-faq-persona-fuera', 'properties', { declarations: { display: 'none' } }, {
    bp: 'tablet', porque: 'No cabe junto a la tarjeta y la taparía.',
  }),
  regla('sl-faq-persona-fuera-movil', 'properties', { declarations: { display: 'none' } }, { bp: 'mobile' }),

  regla('sl-faq-encabezado', 'properties', { declarations: { 'padding-block-end': '28px' } }),
  regla('sl-faq-bajada-medida', 'typography', { role: 'bajada', fontSize: '15px', lineHeight: 1.5, measure: '560px' }),

  // El acordeón.
  regla('sl-faq-acordeon', 'interaction', { behavior: 'acordeon' }, {
    porque: 'Nueve preguntas que se abren de a una, como hacía el original con <details name>.',
  }),
  regla('sl-faq-lista', 'properties', { declarations: { 'padding-inline-end': '130px' } }),
  regla('sl-faq-lista-angosta', 'properties', { declarations: { 'padding-inline-end': '0' } }, { bp: 'tablet' }),
  regla('sl-faq-lista-movil', 'properties', { declarations: { 'padding-inline-end': '0' } }, { bp: 'mobile' }),
  // Cada pliegue: aire arriba y abajo y la línea dorada que los separa.
  regla('sl-faq-pliegue', 'properties', { declarations: {
    'padding-block-start': '18px', 'padding-block-end': '18px',
    'border-bottom-width': '1px', 'border-bottom-style': 'solid',
    'border-bottom-color': 'var(--dorado-600)',
  } }),
  regla('sl-faq-pregunta', 'typography', { role: 'pregunta', fontSize: '14.5px', fontWeight: 700, lineHeight: 1.5 }),
  regla('sl-faq-respuesta', 'typography', { role: 'respuesta', fontSize: '13.5px', lineHeight: 1.5 }),
  regla('sl-faq-respuesta-aire', 'properties', { declarations: { 'margin-block-start': '12px' } }),
  // El párrafo de la pregunta va DENTRO del botón que fabrica el runtime, y
  // ahí su margen por omisión se suma al relleno del pliegue: medido, cada
  // pliegue cerrado salía a 88px donde el original mide 58. El margen se quita
  // en el nodo y no en la parte, porque la parte es el botón, no el párrafo.
  // Lo que se pincha de un pliegue tiene que medir 44px de alto: medido, los
  // resúmenes daban 22. El relleno va en el párrafo y no en el botón para que
  // la zona que responde al dedo sea la misma que se ve.
  regla('sl-faq-pregunta-caja', 'properties', { declarations: {
    'padding-block-start': '11px', 'padding-block-end': '11px',
    'margin-block-start': '0', 'margin-block-end': '0',
  } }),

  // El llamado del final.
  regla('sl-faq-cta', 'properties', { declarations: {
    'padding-top': '26px', 'padding-right': '26px',
    'padding-bottom': '26px', 'padding-left': '26px',
    'margin-block-start': '34px',
    'border-top-left-radius': '16px', 'border-top-right-radius': '16px',
    'border-bottom-right-radius': '16px', 'border-bottom-left-radius': '16px',
    'background-color': 'var(--dorado-50)',
  } }),
  regla('sl-faq-cta-texto', 'typography', { role: 'cta', fontSize: '13.5px', fontWeight: 600, lineHeight: 1.5 }),
  regla('sl-faq-cta-aire', 'properties', { declarations: { 'margin-block-end': '14px' } }),

  // Compartidas con las otras páginas (el pie y los tramos del título).
  regla('sl-titulo-caps-caja', 'properties', { declarations: { display: 'block' } }),
  regla('sl-pie-linea', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center',
    'align-items': 'baseline', 'column-gap': '6px', 'row-gap': '2px',
  } }),
  regla('sl-pie-cookies', 'interaction', { behavior: 'preferencias-cookies' }, {
    porque: 'Reabrir el panel de consentimiento: la ley exige poder cambiarlo, no sólo darlo.',
  }),
  regla('sl-texto-oliva', 'color', { role: 'cuerpo', color: 'var(--oliva-700)' }),
];

/* ------------------------------------------------------------------- los nodos */
const P = (id, texto, reglas) => ({ id, kind: 'paragraph', ruleIds: reglas, content: { text: texto } });
const G = (id, reglas, hijos) => ({ id, kind: 'group', ruleIds: reglas, children: hijos });

const composicion = {
  schemaVersion: 2,
  label: 'Preguntas frecuentes',
  nodes: [
    {
      id: 'seccion-faq', kind: 'section', marker: 'preguntas',
      ruleIds: ['sl-faq-fondo'],
      children: [
        G('faq-marco', ['sl-faq-marco'], [
          // La persona va ANTES de la tarjeta en el documento y se posiciona
          // encima: así, sin CSS, queda arriba y no tapa el texto.
          {
            id: 'faq-persona', kind: 'image',
            ruleIds: ['sl-faq-persona', 'sl-faq-persona-medida', 'sl-faq-persona-fuera', 'sl-faq-persona-fuera-movil'],
            content: {
              assetUrl: SUBIDAS + '/2026/09/faq-persona-crop.webp',
              alt: 'Carlos Valdivieso, encargado del proyecto Santa Luisa de Palpi',
            },
          },
          G('faq-tarjeta', ['sl-faq-tarjeta', 'sl-faq-tarjeta-angosta', 'sl-faq-tarjeta-movil'], [
            G('faq-encabezado', ['sl-faq-encabezado'], [
              P('faq-rotulo', 'Información', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
              {
                id: 'faq-titulo', kind: 'heading', ruleIds: ['sl-titulo-aire'],
                content: {
                  level: 2,
                  segments: [
                    { text: 'Resolvamos', ruleIds: ['sl-titulo-script', 'sl-titulo-script-caja', 'sl-rotulo-color'] },
                    { text: 'tus dudas', ruleIds: ['sl-titulo-caps', 'sl-titulo-caps-encaje', 'sl-texto-oliva'] },
                  ],
                },
              },
              P('faq-bajada', 'Todo lo que necesitas saber antes de reservar tu parcela en Santa Luisa de Palpi.',
                ['sl-faq-bajada-medida', 'sl-texto-oliva']),
            ]),

            // El acordeón: cada pliegue es un grupo con la pregunta primero.
            {
              id: 'faq-lista', kind: 'group',
              ruleIds: ['sl-faq-acordeon', 'sl-faq-lista', 'sl-faq-lista-angosta', 'sl-faq-lista-movil'],
              partes: {
                item: ['sl-faq-pliegue'],
                resumen: ['sl-faq-pregunta', 'sl-texto-oliva'],
              },
              children: PREGUNTAS.map((qa, i) => G(`faq-${i + 1}`, [], [
                P(`faq-${i + 1}-pregunta`, qa.p, ['sl-faq-pregunta', 'sl-texto-oliva', 'sl-faq-pregunta-caja']),
                ...qa.r.map((texto, j) => P(`faq-${i + 1}-respuesta-${j + 1}`, texto,
                  ['sl-faq-respuesta', 'sl-texto-oliva', 'sl-faq-respuesta-aire'])),
              ])),
            },

            G('faq-cta', ['sl-faq-cta'], [
              P('faq-cta-texto', '¿Tu duda no está aquí? Contacta a Carlos en el +56 9 8186 6742.',
                ['sl-faq-cta-texto', 'sl-texto-oliva', 'sl-faq-cta-aire']),
              {
                id: 'faq-cta-boton', kind: 'button', ruleIds: ['sl-btn', 'sl-btn-primario', 'sl-btn-foco'],
                content: {
                  label: 'Escríbele directo a Carlos',
                  href: 'https://wa.me/56981866742?text=Hola%2C%20tengo%20una%20consulta%20sobre%20Santa%20Luisa%20de%20Palpi.',
                  target: 'blank',
                },
              },
            ]),
          ]),
        ]),
      ],
    },

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

process.stdout.write(JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_PREGUNTAS || 0),
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
