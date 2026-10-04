/**
 * La página de Contacto de Santa Luisa, como COMPOSICIÓN del constructor.
 *
 * Hasta ahora esta página era HTML escrito a mano con su propia hoja de estilo
 * de 11 KB: el constructor no la reconocía como suya y no se podía editar desde
 * el page builder. Cristóbal, el 4 de octubre de 2026: «yo pedí que esto fuera,
 * se usara el constructor, no que fuera una copia de una página hecha en el
 * escritorio».
 *
 * Todo lo visible de acá se midió en el navegador sobre el espejo local, no se
 * copió del CSS ni se recordó. Las reglas compartidas están en `diseno.mjs`.
 *
 * EL FORMULARIO, Y LA DIFERENCIA ENTRE EL ESPEJO Y PRODUCCIÓN.
 *
 * En PRODUCCIÓN el formulario existe, funciona y emite sus eventos a Google
 * Tag Manager —confirmado por Cristóbal el 4 de octubre de 2026—. En el ESPEJO
 * no:  no está en la tabla de formularios (comprobado),
 * y por eso acá se ve una tarjeta blanca vacía.
 *
 * Poner otro de los formularios que sí existen en el espejo sería cambiar la
 * página, así que la tarjeta queda como está. Al apuntar esta receta a
 * producción hay que meter dentro de `form-tarjeta` un nodo:
 *
 *     { id: 'form', kind: 'form', ruleIds: [], content: { formSlug: 'contacto-santa-luisa' } }
 *
 * comprobando antes el identificador real con `cod_list_canvas_forms` contra
 * ESE sitio: el slug es lo portable, el número de página no.
 *
 * Los eventos de Tag Manager no dependen de esto: los emite el runtime de
 * Orugantt Forms, y el contenedor GTM lo imprime el plugin desde la opción
 * cod_medicion, fuera del documento de la página. Recomponer no los toca.
 *
 *   node componer-contacto.mjs > contacto.json
 */
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 60;
const DOCUMENT_ID = 'ocd-canvas-page-14';

/* --------------------------------------------------- reglas propias de la página */
const propias = [
  // .contacto__grid: dos columnas iguales con 48 de separación, alineadas arriba.
  // En el original cae a una sola columna a los 860, que parte la banda de tablet
  // por la mitad; acá se apila en tablet y en móvil, que es la decisión
  // conservadora (ninguna pantalla angosta queda con dos columnas de 404).
  regla('sl-contacto-grid', 'layout', {
    mode: 'grid', columns: 2, gap: '48px', align: 'start',
    mobile: { mode: 'stack', gap: '48px' },
  }),
  regla('sl-contacto-grid-tablet', 'layout', { mode: 'stack', gap: '48px', align: 'start' }, {
    bp: 'tablet',
    porque: 'El original cae a una columna a los 860px, que parte la banda de tablet; se apila en toda la banda.',
  }),

  // La lista de datos de contacto. En el original es un <ul> cuyos <li> llevan
  // enlaces; acá cada dato es su propio nodo, que es lo que lo hace editable.
  regla('sl-dato', 'typography', { role: 'dato', fontSize: '13.5px', lineHeight: 1.5 }),
  regla('sl-dato-linea', 'properties', { declarations: {
    display: 'block',
    'padding-block-start': '10px',
    'padding-block-end': '10px',
    'border-bottom-width': '1px',
    'border-bottom-style': 'solid',
    'border-bottom-color': 'rgba(255,255,255,0.15)',
  } }),
  regla('sl-dato-enlace', 'properties', { declarations: {
    'font-weight': '700',
    color: 'inherit',
    'text-decoration-line': 'none',
  } }),

  // La columna del formulario: pila con 12 de separación, pegada arriba.
  regla('sl-columna-form', 'layout', { mode: 'stack', gap: '12px', align: 'start' }),
  // El párrafo que va sobre la tarjeta, encima de la foto: la sombra lo separa
  // del fondo. `text-shadow` entró a la lista de propiedades en la 0.3.67 justo
  // por esto; antes había que dejarlo en el CSS plano.
  regla('sl-form-intro', 'properties', { declarations: {
    'text-shadow': '0 1px 6px rgba(0,0,0,0.55)',
    'margin-block-start': '16px',
    'margin-block-end': '16px',
  } }),
  // La tarjeta blanca. Las cuatro esquinas por separado: border-radius es una
  // abreviada y se escribe larga por norma de la casa, aunque acá no lleve
  // variable.
  regla('sl-tarjeta', 'properties', { declarations: {
    'background-color': '#FFFFFF',
    'border-top-left-radius': '16px',
    'border-top-right-radius': '16px',
    'border-bottom-right-radius': '16px',
    'border-bottom-left-radius': '16px',
    'padding-top': '32px',
    'padding-right': '32px',
    'padding-bottom': '32px',
    'padding-left': '32px',
    'box-shadow': '0 8px 24px rgba(0,0,0,0.12)',
    'min-height': '80px',
  } }),

  // La ventana de WhatsApp. El behavior existía en el motor desde hace tiempo
  // pero no estaba en el catálogo, así que una composición no podía pedirlo:
  // entró en la 0.3.68. Intercepta los enlaces wa.me de la página; si el
  // JavaScript no corre, los enlaces siguen abriendo WhatsApp directo.
  regla('sl-wa', 'interaction', {
    behavior: 'wa-mensaje',
    sendNodeId: 'wa-enviar',
    fieldNodeId: 'wa-hueco',
    closeNodeId: 'wa-cerrar',
    placeholder: 'Escribe tu pregunta…',
    fieldLabel: 'Tu mensaje para Santa Luisa de Palpi',
  }, { porque: 'La ventana que ya tenía la página, ahora pedida por el constructor.' }),
  // Sólo el ASPECTO de la ventana. Mostrarla y ocultarla es mecánica del
  // behavior y la pone el plugin (wa_mensaje_css), con especificidad cero para
  // que estas reglas le ganen. Una regla de diseño no puede expresar «cuando el
  // runtime la marque abierta», y no tiene por qué.
  regla('sl-wa-ventana', 'properties', { declarations: {
    'background-color': '#FFFFFF',
    'border-top-left-radius': '16px',
    'border-top-right-radius': '16px',
    'border-bottom-right-radius': '16px',
    'border-bottom-left-radius': '16px',
    'box-shadow': '0 18px 48px rgba(0,0,0,0.28)',
    color: 'var(--oliva-700)',
  } }),
];

/* ------------------------------------------------------------------- los nodos */
const P = (id, texto, reglas) => ({ id, kind: 'paragraph', ruleIds: reglas, content: { text: texto } });
const A = (id, label, href, reglas, target = 'blank') => ({ id, kind: 'link', ruleIds: reglas, content: { label, href, target } });
const G = (id, reglas, hijos) => ({ id, kind: 'group', ruleIds: reglas, children: hijos });

const composicion = {
  schemaVersion: 2,
  label: 'Contacto',
  nodes: [
    {
      id: 'seccion-contacto',
      kind: 'section',
      marker: 'contacto',
      ruleIds: ['sl-banda-oliva', 'sl-banda-aire'],
      children: [
        G('contacto-caja', ['sl-wrap', 'sl-contacto-grid', 'sl-contacto-grid-tablet'], [
          G('contacto-izquierda', [], [
            P('contacto-rotulo', 'Hablemos', ['sl-rotulo', 'sl-rotulo-color', 'sl-rotulo-aire']),
            {
              id: 'contacto-titulo',
              kind: 'heading',
              ruleIds: ['sl-titulo-aire'],
              content: {
                level: 2,
                segments: [
                  { text: 'Agenda', ruleIds: ['sl-titulo-script', 'sl-titulo-script-caja', 'sl-rotulo-color'] },
                  { text: 'tu visita', ruleIds: ['sl-titulo-caps', 'sl-titulo-caps-encaje', 'sl-titulo-claro'] },
                ],
              },
            },
            P('contacto-bajada', 'Conversemos y coordinemos tu visita al proyecto. Trato directo, cercano y transparente.',
              ['sl-cuerpo', 'sl-cuerpo-color', 'sl-cuerpo-aire']),
            G('contacto-datos', [], [
              P('dato-direccion', 'Cam. Padre Hurtado, Paine, Región Metropolitana', ['sl-dato', 'sl-dato-linea']),
              A('dato-correo', 'carlosvaldivieso.d@gmail.com', 'mailto:carlosvaldivieso.d@gmail.com',
                ['sl-dato', 'sl-dato-linea', 'sl-dato-enlace'], 'self'),
              A('dato-whatsapp', '+56 9 8186 6742 (WhatsApp)', 'https://wa.me/56981866742',
                ['sl-dato', 'sl-dato-linea', 'sl-dato-enlace']),
              A('dato-instagram', '@santaluisadepalpi', 'https://www.instagram.com/santaluisadepalpi',
                ['sl-dato', 'sl-dato-linea', 'sl-dato-enlace']),
            ]),
          ]),
          G('contacto-derecha', ['sl-columna-form'], [
            P('form-intro', 'Escríbenos directo y te respondemos a la brevedad.', ['sl-form-intro']),
            // La tarjeta del formulario. Vacía a propósito: ver la cabecera.
            G('form-tarjeta', ['sl-tarjeta'], [
              P('form-vacio', ' ', []),
            ]),
          ]),
        ]),
      ],
    },

    // El pie, que es de todo el sitio.
    {
      id: 'pie',
      kind: 'footer',
      ruleIds: ['sl-pie', 'sl-pie-aire', 'sl-pie-texto'],
      children: [
        P('pie-marca', 'Santa Luisa de Palpi · Paine, Región Metropolitana, Chile', ['sl-pie-texto']),
        G('pie-legal', ['sl-pie-texto', 'sl-pie-linea'], [
          A('pie-terminos', 'Términos y privacidad', '/terminos-y-condiciones/', ['sl-pie-enlace'], 'self'),
          P('pie-separador', ' · ', []),
          {
            id: 'pie-preferencias',
            kind: 'button',
            ruleIds: ['sl-pie-enlace', 'sl-pie-cookies'],
            content: { label: 'Preferencias de cookies', href: '/terminos-y-condiciones/', target: 'self' },
          },
        ]),
      ],
    },

    // La ventana de WhatsApp. El campo de texto NO va acá: lo fabrica el
    // runtime dentro de `wa-hueco`, porque el sanitizador bloquea <textarea> a
    // propósito para que un documento ajeno no pueda colar un formulario falso.
    G('wa-ventana', ['sl-wa', 'sl-wa-ventana'], [
      G('wa-cabecera', ['sl-wa-cabecera'], [
        P('wa-nombre', 'Santa Luisa de Palpi', ['sl-wa-nombre']),
        P('wa-estado', 'Te respondemos por WhatsApp', ['sl-wa-estado']),
        { id: 'wa-cerrar', kind: 'button', ruleIds: ['sl-wa-cerrar'], content: { label: 'Cerrar', href: '#', target: 'self' } },
      ]),
      G('wa-cuerpo', ['sl-wa-cuerpo'], [
        P('wa-saludo', 'Hola 👋 Cuéntanos qué te gustaría saber y te respondemos por WhatsApp.', ['sl-wa-saludo']),
        G('wa-hueco', [], []),
      ]),
      G('wa-pie', ['sl-wa-pie'], [
        P('wa-nota', 'Se abrirá WhatsApp con tu mensaje escrito. Puedes revisarlo antes de enviarlo.', ['sl-wa-nota']),
        { id: 'wa-enviar', kind: 'button', ruleIds: ['sl-wa-enviar'], content: { label: 'Enviar por WhatsApp', href: '#', target: 'self' } },
      ]),
    ]),
  ],
};

/* ----------------------------- las reglas que usan sólo los nodos de la ventana */
propias.push(
  // La línea legal va en UNA línea. Un grupo es grilla por omisión, así que sin
  // esto «Términos y privacidad», el punto y «Preferencias de cookies» salen
  // apilados en tres renglones.
  regla('sl-pie-linea', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'justify-content': 'center',
    'align-items': 'baseline', 'column-gap': '6px', 'row-gap': '2px',
  } }),
  regla('sl-pie-cookies', 'interaction', { behavior: 'preferencias-cookies' }, {
    porque: 'Reabrir el panel de consentimiento: la ley exige poder cambiarlo, no sólo darlo.',
  }),
  regla('sl-wa-cabecera', 'properties', { declarations: {
    display: 'flex', 'align-items': 'center', 'column-gap': '10px',
    'padding-top': '12px', 'padding-right': '12px', 'padding-bottom': '12px', 'padding-left': '16px',
    'background-color': 'var(--oliva-700)',
    // El color va acá y no se hereda: la ventana es clara y su texto es oliva,
    // así que sin esto la cabecera queda oliva sobre oliva. Medido: invisible.
    color: 'var(--tierra-50)',
  } }),
  regla('sl-wa-nombre', 'typography', { role: 'wa-nombre', fontSize: '14px', fontWeight: 600, lineHeight: 1.2 }),
  regla('sl-wa-estado', 'typography', { role: 'wa-estado', fontSize: '11.5px', lineHeight: 1.3 }),
  regla('sl-wa-cerrar', 'properties', { declarations: {
    'margin-inline-start': 'auto', color: 'var(--tierra-50)', cursor: 'pointer',
    'background-color': 'transparent', 'text-decoration-line': 'none',
    'font-size': '12px', 'white-space': 'nowrap',
    'padding-top': '4px', 'padding-right': '4px', 'padding-bottom': '4px', 'padding-left': '4px',
  } }),
  regla('sl-wa-cuerpo', 'properties', { declarations: {
    'padding-top': '16px', 'padding-right': '16px', 'padding-bottom': '8px', 'padding-left': '16px',
  } }),
  regla('sl-wa-saludo', 'typography', { role: 'wa-saludo', fontSize: '13.5px', lineHeight: 1.45 }),
  regla('sl-wa-pie', 'properties', { declarations: {
    display: 'grid', 'row-gap': '10px', 'justify-items': 'stretch',
    'padding-top': '8px', 'padding-right': '16px', 'padding-bottom': '16px', 'padding-left': '16px',
  } }),
  regla('sl-wa-nota', 'typography', { role: 'wa-nota', fontSize: '11px', lineHeight: 1.35 }),
  regla('sl-wa-enviar', 'properties', { declarations: {
    'justify-content': 'center', 'background-color': '#25D366', color: '#FFFFFF',
    'padding-top': '10px', 'padding-right': '14px', 'padding-bottom': '10px', 'padding-left': '14px',
    'border-top-left-radius': '999px', 'border-top-right-radius': '999px',
    'border-bottom-right-radius': '999px', 'border-bottom-left-radius': '999px',
    'text-decoration-line': 'none', cursor: 'pointer', 'white-space': 'nowrap',
  } }),
);

const revision = Number(process.env.REV_CONTACTO || 0);
process.stdout.write(JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: revision,
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
