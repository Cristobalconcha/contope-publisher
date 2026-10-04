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
 * EL FORMULARIO.
 *
 * Está, y es el mismo que el sitio publicado: `contacto-santa-luisa`, versión 8.
 * Durante un rato esta receta dejó la tarjeta vacía porque el formulario no
 * existía en el espejo, y lo anoté como una limitación. Cristóbal, el 4 de
 * octubre de 2026: *«el hecho de que no exista no significa que no tengas cómo
 * acceder a él… siempre te quedas pegado en cosas que no necesitas resolver»*.
 * Tenía razón: su definición se pide por una ruta REST pública, la misma que usa
 * el runtime para dibujarlo. Lo trae `traer-formulario.mjs`.
 *
 * Se estila por VARIABLES y nunca por reglas sobre sus campos: es el contrato
 * del tipo `form`, y lo que lo hace sobrevivir a que el formulario cambie.
 *
 *   node componer-contacto.mjs > contacto.json
 */
import { diseno, regla } from './diseno.mjs';

const PAGE_ID = 60;
const DOCUMENT_ID = 'ocd-canvas-page-14';

/* --------------------------------------------------- reglas propias de la página */
const propias = [
  // LA FOTO DE LA BANDA, que casi se pierde.
  //
  // En producción la sección de contacto lleva una foto de fondo a la derecha,
  // la mesa de la firma. En el ESPEJO esa misma regla decía
  // `background-image: none`, así que al medir el espejo —y no el sitio— la
  // reproduje sin la foto. Lo notó Cristóbal mirando la página.
  //
  // La lección no es la foto: es que el espejo puede divergir de producción y
  // medirlo a él no basta. Comprobado después en el CSS de las cinco páginas:
  // ésta era la única imagen que vivía en una hoja y se había perdido.
  //
  // Va en DOS reglas porque cada parte tiene su sitio: la imagen por `surface`
  // —`properties` rechaza `url(` a propósito, para que las imágenes entren por
  // donde el sistema las conoce— y la posición por `properties`, porque lleva
  // un calc() con 100vw que surface.backgroundPosition no admite.
  regla('sl-contacto-foto', 'surface', {
    backgroundColor: 'var(--oliva-700)',
    foregroundColor: 'var(--tierra-50)',
    backgroundAssetUrl: '/wp-content/uploads/2026/09/contacto-mesa-firma.webp',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '650px auto',
  }, { porque: 'La foto de fondo que la sección tiene en el sitio publicado.' }),
  regla('sl-contacto-foto-sitio', 'properties', { declarations: {
    'background-position': 'calc((100vw - 1180px) / 2 + 831px) top',
  } }),

  // Bajo 1024 la foto quedaría encima del texto; en producción tampoco se ve.
  regla('sl-contacto-foto-fuera', 'properties', { declarations: {
    'background-image': 'none',
  } }, { bp: 'tablet', porque: 'No cabe junto al texto; en producción tampoco aparece.' }),
  regla('sl-contacto-foto-fuera-movil', 'properties', { declarations: {
    'background-image': 'none',
  } }, { bp: 'mobile' }),
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
  // 44px es el mínimo para tocar con el dedo sin errarle. Los datos de
  // contacto son enlaces (correo, WhatsApp, Instagram) y medían 41.
  regla('sl-dato-linea', 'properties', { declarations: {
    'min-height': '44px',
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
  // EL FORMULARIO SE ESTILA POR VARIABLES, NUNCA POR REGLAS SOBRE SUS CAMPOS.
  // Es el contrato del tipo `form`: el contenedor se ajusta con maxWidth y
  // surface, y el interior con `theme`, que fija las variables del runtime. Una
  // regla que apuntara a sus campos se rompería en cuanto el formulario cambie.
  //
  // Los valores salen de los que el sitio ya usaba en su CSS plano: el blanco
  // de la tarjeta, el dorado de la marca para el botón y el oliva del texto.
  regla('sl-form', 'form', {
    surface: 'none',
    // Las claves son los nombres del contrato, no las variables crudas: el
    // compilador traduce «principal» a --ofr-color-primary. Así el día que el
    // runtime renombre una variable, las composiciones no se enteran.
    theme: {
      texto: 'var(--oliva-700)',
      textoSuave: 'var(--tierra-500)',
      fondo: '#FFFFFF',
      superficie: 'var(--tierra-50)',
      superficieAlt: 'var(--tierra-100)',
      borde: 'var(--tierra-300)',
      bordeFuerte: 'var(--tierra-500)',
      principal: 'var(--dorado-600)',
      principalHover: 'var(--dorado-500)',
      principalContraste: '#2B2210',
      tipografia: 'var(--font-body)',
      radio: '10px',
      espaciado: '16px',
    },
  }, { porque: 'Los mismos valores que el sitio ya tenía en su CSS plano, ahora como variables del runtime.' }),

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
      ruleIds: ['sl-contacto-foto', 'sl-contacto-foto-sitio', 'sl-banda-aire', 'sl-contacto-foto-fuera', 'sl-contacto-foto-fuera-movil'],
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
            G('form-tarjeta', ['sl-tarjeta'], [
              {
                id: 'form', kind: 'form', ruleIds: ['sl-form'],
                content: { formSlug: 'contacto-santa-luisa' },
              },
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
    'justify-content': 'center', 'background-color': '#128C7E', color: '#FFFFFF',
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
