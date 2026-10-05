/**
 * La BARRA DE NAVEGACIÓN de Santa Luisa, como composición.
 *
 * Es la última pieza del sitio que no estaba construida con el constructor, y
 * la que más costó llegar a poder componer. No por tamaño —son un logo, cuatro
 * enlaces y un botón— sino porque el canal tenía la puerta cerrada: para
 * escribir una composición hay que leer primero la revisión actual, y la
 * lectura sólo reconocía como región los tres nombres canónicos
 * (`cod-region-header|body|footer`). El encabezado de un sitio real es un
 * documento de PLANTILLA (`ocd-template-…`) con `regionKind: header`, que el
 * `apply` sí aceptaba. Resultado: no se podía obtener la revisión que el propio
 * apply exige, y el único camino que quedaba era copiar el documento a mano.
 * Se arregló la lectura —ahora las dos mitades le preguntan al repositorio— y
 * lo fija `scripts/probar-region-de-plantilla.php`.
 *
 * ESTO NO ES UNA PÁGINA: es una REGIÓN GLOBAL, así que se escribe con
 * `pageId: 0` y su documentId. Aplica a las cuatro interiores y EXCLUYE la
 * portada (post 308), que lleva su propia barra. Esa exclusión ya estaba
 * configurada en el documento y acá no se toca: una composición escribe el
 * contenido, no el papel de la región.
 *
 * DOS DEFECTOS que se corrigen al componerla, los dos medidos:
 *
 *  1. Los enlaces iban a `?page_id=7,10,12,14`. En el espejo local esos IDs
 *     son otros, así que los cuatro daban 404 —y es el mismo motivo por el que
 *     un ID numérico nunca debe viajar en el contenido: identifica una fila de
 *     una base de datos, no una página—. Ahora van por slug, que significa lo
 *     mismo en cualquier instalación.
 *  2. El menú decía «Contactos», en plural, apuntando a una página que se
 *     llama «Contacto». Decisión de Cristóbal: singular.
 *
 * EL LOGO se extrajo a `/wp-content/uploads/2026/10/logo-santa-luisa.svg`.
 * Antes vivía incrustado en el HTML de este documento como un `<symbol>` de
 * 13 KB, que es precisamente lo que impedía componerlo: un recurso del sitio
 * no puede estar dentro del marcado de un documento. Como archivo entra por
 * `icono`, con `fill="currentColor"`, así que lo pinta el `color` de la regla.
 *
 *   node componer-encabezado.mjs > encabezado.json
 */
import { diseno, regla } from './diseno.mjs';

const DOCUMENT_ID = 'ocd-template-d5a667af-b7aa-498f-a986-bbe61a63add6';
const LOGO = '/wp-content/uploads/2026/10/logo-santa-luisa.svg';

/**
 * Las cuatro entradas del menú, por slug.
 *
 * El orden y las etiquetas son los del sitio publicado; lo único que cambia es
 * «Contacto» en singular y el destino por slug en vez de por ID.
 */
const MENU = [
  { id: 'nav-inicio', etiqueta: 'Inicio', href: '/' },
  { id: 'nav-diferenciales', etiqueta: 'Diferenciales', href: '/diferenciales/' },
  { id: 'nav-preguntas', etiqueta: 'Preguntas frecuentes', href: '/preguntas-frecuentes/' },
  { id: 'nav-contacto', etiqueta: 'Contacto', href: '/contacto/' },
];

/* ------------------------------------------------- reglas propias de la barra */
const propias = [
  // La barra se queda arriba al bajar. Es lo que hace que el menú exista: sin
  // recorrido la barra está inerte, y probarla sin desplazar da un falso
  // «está roto».
  regla('sl-barra', 'properties', { declarations: {
    position: 'sticky', top: '0px', 'z-index': '70',
  } }, { porque: 'La barra acompaña el desplazamiento; es su comportamiento en el sitio.' }),
  regla('sl-barra-fondo', 'surface', {
    backgroundColor: 'var(--tierra-50)',
    foregroundColor: 'var(--oliva-700)',
  }),
  regla('sl-barra-linea', 'properties', { declarations: {
    'border-bottom-width': '1px', 'border-bottom-style': 'solid',
    'border-bottom-color': 'var(--oliva-200)',
  } }),

  // El interior: el ancho de 1.180 que usan las secciones mixtas del sitio,
  // con el logo a la izquierda y el menú a la derecha.
  regla('sl-barra-interior', 'properties', { declarations: {
    display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
    'column-gap': '24px',
    'max-width': '1180px',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
    'padding-top': '14px', 'padding-bottom': '14px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }),

  // El logo es una IMAGEN dentro del enlace, no un icono.
  //
  // Primero lo puse por `icono` y salió diminuto: el icono encaja el dibujo en
  // un CUADRADO, y este logo es 2,6 veces más ancho que alto, así que a 44px
  // de caja quedaba de 17 de alto. Un icono es para una pieza cuadrada; un
  // logo no lo es. Además, por icono el texto del enlace se veía al lado del
  // dibujo —la marca salía dos veces—, y como imagen el nombre accesible lo da
  // el alt, sin repetirse.
  //
  // Que un enlace pueda llevar una imagen hubo que abrirlo en el plugin el 4
  // de octubre de 2026; era justo lo que faltaba para poder componer esto.
  // 96px de ANCHO con el alto libre, que es la medida medida en el sitio
  // publicado (`.site-nav__logo{width:96px}`). Por ancho y no por alto porque
  // así lo declaraba el original y porque es lo que conserva la proporción sin
  // depender de cuánto mide el dibujo.
  //
  // El color va DENTRO del archivo (#171717, el del sitio) y no por regla: el
  // logo entra como <img>, y un SVG referenciado así no hereda el color del
  // texto de la página. Con `currentColor` salía negro por omisión, que daba
  // el pego pero por casualidad.
  regla('sl-barra-logo-img', 'properties', { declarations: {
    width: '96px', height: 'auto', display: 'block',
  } }, { porque: 'Medido en el sitio publicado: .site-nav__logo lleva width:96px.' }),
  regla('sl-barra-logo-caja', 'properties', { declarations: {
    display: 'inline-flex', 'align-items': 'center',
    'text-decoration-line': 'none',
  } }),

  // El menú.
  regla('sl-barra-menu', 'properties', { declarations: {
    display: 'flex', 'align-items': 'center', 'column-gap': '28px',
    'list-style-type': 'none',
    'margin-top': '0px', 'margin-bottom': '0px',
    'padding-inline-start': '0px',
  } }),
  regla('sl-barra-enlace', 'typography', {
    role: 'nav', fontSize: '13px', fontWeight: 600,
    letterSpacing: '0.02em', decoration: 'none',
  }),
  regla('sl-barra-enlace-color', 'properties', { declarations: {
    color: 'var(--oliva-700)', 'text-decoration-line': 'none',
  } }),
  // El subrayado aparece al pasar por encima; no está siempre, para que el
  // dorado no compita con el botón primario de cada página.
  regla('sl-barra-enlace-encima', 'properties', { declarations: {
    'text-decoration-line': 'underline',
    'text-decoration-color': 'var(--dorado-600)',
    'text-underline-offset': '5px',
  } }, { estado: 'hover' }),
  regla('sl-barra-enlace-foco', 'properties', { declarations: {
    'outline-width': '2px', 'outline-style': 'solid',
    'outline-color': 'var(--dorado-600)', 'outline-offset': '3px',
  } }, { estado: 'focus' }),

  // El botón de las tres rayas, que sólo existe en teléfono.
  regla('sl-barra-boton', 'properties', { declarations: {
    display: 'none',
    'background-color': 'transparent',
    'border-top-width': '0px', 'border-right-width': '0px',
    'border-bottom-width': '0px', 'border-left-width': '0px',
    'padding-top': '8px', 'padding-bottom': '8px',
    'padding-inline-start': '8px', 'padding-inline-end': '8px',
    cursor: 'pointer', color: 'var(--oliva-700)',
  } }),
  regla('sl-barra-boton-foco', 'properties', { declarations: {
    'outline-width': '2px', 'outline-style': 'solid',
    'outline-color': 'var(--dorado-600)', 'outline-offset': '3px',
  } }, { estado: 'focus' }),

  /*
   * En teléfono el menú se repliega. Dos notas que vienen de errores medidos
   * en este sitio:
   *
   *  - El corte va en `mobile` (hasta 767) y no en una medida propia: un
   *    iPhone Pro Max apaisado mide 932, así que un `max-width: 900px` lo deja
   *    fuera y el menú aparece replegado en una pantalla ancha.
   *  - Las propiedades van en forma larga porque llevan variable; una
   *    abreviada con `var()` se pierde al guardar.
   */
  regla('sl-barra-menu-movil', 'properties', { declarations: {
    position: 'absolute', top: '100%', left: '0px', right: '0px',
    'flex-direction': 'column', 'row-gap': '4px',
    'background-color': 'var(--tierra-50)',
    'border-bottom-width': '1px', 'border-bottom-style': 'solid',
    'border-bottom-color': 'var(--oliva-200)',
    'padding-top': '12px', 'padding-bottom': '20px',
    'padding-inline-start': '24px', 'padding-inline-end': '24px',
  } }, { bp: 'mobile' }),
  // 44x44 es el mínimo de una zona de toque, y el botón medía 31 de alto: lo
  // acusó revisar-sitio.mjs. El relleno solo no basta porque la palabra es
  // corta, así que va por min-height/min-width y queda centrado por el flex.
  regla('sl-barra-boton-movil', 'properties', { declarations: {
    display: 'inline-flex',
    'min-height': '44px', 'min-width': '44px',
  } }, { bp: 'mobile' }),
  regla('sl-barra-interior-movil', 'properties', { declarations: { position: 'relative' } }, { bp: 'mobile' }),
  // El behavior que abre y cierra. Va como REGLA de interacción y no como
  // propiedad del nodo: en este constructor un comportamiento es una regla de
  // diseño con procedencia, igual que un color o una tipografía, y por eso
  // viaja en la hoja compartida y no incrustado en el árbol.
  regla('sl-barra-abrir', 'interaction', {
    behavior: 'nav-toggle', targetId: 'barra', panelId: 'barra-menu', toggleClass: 'is-menu-open',
  }, { porque: 'El menú de teléfono se abre desde el botón de las tres rayas.' }),

];

/* ------------------------------------------------------------- la composición */
const composicion = {
  schemaVersion: 2,
  label: 'Barra de navegación del sitio',
  nodes: [
    {
      id: 'barra', kind: 'header', marker: 'barra-sitio',
      ruleIds: ['sl-barra', 'sl-barra-fondo', 'sl-barra-linea'],
      children: [
        {
          id: 'barra-interior', kind: 'group',
          ruleIds: ['sl-barra-interior', 'sl-barra-interior-movil'],
          children: [
            {
              id: 'barra-logo', kind: 'link',
              ruleIds: ['sl-barra-logo-caja'],
              content: { label: '', href: '/', target: 'self' },
              children: [{
                id: 'barra-logo-img', kind: 'image',
                // La regla va a la PARTE `pieza` —el <img>— y no al nodo: el nodo
                // es el <figure> que lo envuelve, y medirlo a él deja el dibujo
                // sin tamaño (salía una caja de 0x44).
                partes: { pieza: ['sl-barra-logo-img'] }, ruleIds: [],
                content: { assetUrl: LOGO, alt: 'Santa Luisa de Palpi' },
              }],
            },
            {
              id: 'barra-menu', kind: 'navigation',
              ruleIds: ['sl-barra-menu', 'sl-barra-menu-movil'],
              children: MENU.map(({ id, etiqueta, href }) => ({
                id, kind: 'link',
                ruleIds: ['sl-barra-enlace', 'sl-barra-enlace-color', 'sl-barra-enlace-encima', 'sl-barra-enlace-foco'],
                content: { label: etiqueta, href, target: 'self' },
              })),
            },
            {
              id: 'barra-boton', kind: 'button',
              ruleIds: ['sl-barra-boton', 'sl-barra-boton-movil', 'sl-barra-boton-foco', 'sl-barra-abrir'],
              content: { label: 'Menú' },
            },
          ],
        },
      ],
    },
  ],
};

process.stdout.write(JSON.stringify({
  pageId: 0,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_ENCABEZADO || 0),
  design: diseno(propias, Number(process.env.REV_DISENO || 0)),
  composition: composicion,
}, null, 2));
