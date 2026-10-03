/*!
 * cod-behaviors.js — capa de comportamiento declarativo para GrapesJS (spike).
 *
 * Objetivo del spike: recuperar comportamientos perdidos al pasar el sitio
 * React de Santa Luisa por DOM renderizado → GrapesJS. Ver README.md "Límites
 * todavía abiertos": "Los handlers y estados React no sobreviven automáticamente
 * al paso por DOM renderizado; requieren tipos semánticos o una capa de
 * comportamiento preservada." Este archivo es esa capa, con cuatro conductas
 * allowlisted: `scroll-threshold`, `nav-toggle`, `carousel-basic` y
 * `reveal-on-scroll`.
 *
 * Carga SIN BUNDLER (tres vías equivalentes):
 *   1) Navegador, script clásico:
 *        <script src="./plugins/cod-behaviors.js"></script>
 *        → expone window.OcdBehaviors.
 *   2) Node / ESM (raíz del repo es "type":"module"):
 *        import OcdBehaviors from './plugins/cod-behaviors.js'
 *        → default export = este objeto (la carpeta plugins/ es CommonJS).
 *   3) Node / CJS:
 *        const OcdBehaviors = require('./plugins/cod-behaviors.js')
 *
 * SEGURIDAD — conducta declarativa con allowlist:
 *   El runtime NUNCA evalúa código importado ni del usuario (sin eval/Function/
 *   setTimeout(string)). Sólo reconoce valores literales "scroll-threshold",
 *   "nav-toggle" y "carousel-basic" dentro del allowlist BEHAVIORS, y lee
 *   atributos data-* validados (numéricos o clases/selectores). Cualquier otro
 *   valor de `data-cod-behavior` se ignora. No hay superficie para ejecutar
 *   código arbitrario.
 *
 * CONTRATO PÚBLICO (API):
 *   OcdBehaviors.PLUGIN_ID            → "cod-behaviors"
 *   OcdBehaviors.BEHAVIORS            → { "scroll-threshold", "nav-toggle", "carousel-basic", "reveal-on-scroll" }
 *   OcdBehaviors.DEFAULTS             → { threshold, navSelector, scrolledClass, toggleClass, carouselSlideSelector, carouselActiveClass, revealClass, revealThreshold }
 *   OcdBehaviors.ATTRS                → nombres data-* usados por las conductas
 *   OcdBehaviors.isAllowedBehavior(name)
 *   OcdBehaviors.parseThreshold(raw, fallback)
 *   OcdBehaviors.scan(editor)                       → [Component, ...] componentes con conducta allowlisted
 *   OcdBehaviors.attachToComponent(component, opts) → descriptor persistido (scroll-threshold por compatibilidad)
 *   OcdBehaviors.createRuntime(env, opts)           → destroy()  (núcleo, sin GrapesJS)
 *   OcdBehaviors.runtimeScript(opts)                → string JS funcional para export
 *   OcdBehaviors.runtimeCss(opts)                   → string CSS para export
 *   OcdBehaviors.buildExport(editor, opts)          → { html, css, js }
 *   OcdBehaviors.grapesjsPlugin(editor, opts)       → plugin GrapesJS (editor.use / Plugin.add)
 *
 *   Integración en spike.mjs (documentada, no invasiva):
 *     import OcdBehaviors from './plugins/cod-behaviors.js';
 *     OcdBehaviors.grapesjsPlugin(editor, { threshold: 40 });
 *     const { html, css, js } = OcdBehaviors.buildExport(editor);
 *     // html ya lleva los data-* (persistencia); css y js se emiten junto al HTML.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.OcdBehaviors = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PLUGIN_ID = 'cod-behaviors';
  var BEHAVIOR_SCROLL_THRESHOLD = 'scroll-threshold';
  var BEHAVIOR_NAV_TOGGLE = 'nav-toggle';
  var BEHAVIOR_CAROUSEL_BASIC = 'carousel-basic';
  var BEHAVIOR_REVEAL_ON_SCROLL = 'reveal-on-scroll';
  var BEHAVIOR_LIGHTBOX = 'lightbox';
  var ATTR_BEHAVIOR = 'data-cod-behavior';
  var ATTR_THRESHOLD = 'data-cod-scroll-threshold';
  var ATTR_SCROLLED_CLASS = 'data-cod-scrolled-class';
  var DEFAULT_NAV_SELECTOR = '[data-cod-behavior="scroll-threshold"]';
  var DEFAULT_SCROLLED_CLASS = 'nav--scrolled';
  var DEFAULT_THRESHOLD = 40;

  var ATTR_TOGGLE_TARGET = 'data-cod-toggle-target';
  var ATTR_TOGGLE_CLASS = 'data-cod-toggle-class';
  var ATTR_TOGGLE_SELF_CLASS = 'data-cod-toggle-self-class';
  var DEFAULT_TOGGLE_CLASS = 'is-menu-open';

  var ATTR_CAROUSEL_SLIDE_SELECTOR = 'data-cod-carousel-slide-selector';
  var ATTR_CAROUSEL_ACTIVE_CLASS = 'data-cod-carousel-active-class';
  var ATTR_CAROUSEL_START = 'data-cod-carousel-start';
  var ATTR_CAROUSEL_NEXT = 'data-cod-carousel-next';
  var ATTR_CAROUSEL_PREV = 'data-cod-carousel-prev';
  var ATTR_CAROUSEL_DOTS = 'data-cod-carousel-dots';
  var ATTR_CAROUSEL_DOT = 'data-cod-carousel-dot';
  // Modo "track": desliza una tira con varias fotos visibles a la vez
  // (transform translateX), en vez de mostrar/ocultar un slide a la vez.
  // Es el patrón que usa la galería real de Santa Luisa (4 fotos visibles,
  // 2 en mobile) — distinto de "single", que sigue siendo el default.
  var ATTR_CAROUSEL_MODE = 'data-cod-carousel-mode';
  var ATTR_CAROUSEL_TRACK_SELECTOR = 'data-cod-carousel-track-selector';
  var ATTR_CAROUSEL_VISIBLE = 'data-cod-carousel-visible';
  var ATTR_CAROUSEL_VISIBLE_MOBILE = 'data-cod-carousel-visible-mobile';
  var ATTR_CAROUSEL_MOBILE_BREAKPOINT = 'data-cod-carousel-mobile-breakpoint';
  var ATTR_CAROUSEL_ROWS = 'data-cod-carousel-rows';
  var CAROUSEL_MODE_TRACK = 'track';
  var DEFAULT_CAROUSEL_TRACK_SELECTOR = '.cod-carousel__track';
  var DEFAULT_CAROUSEL_VISIBLE = 1;
  var DEFAULT_CAROUSEL_MOBILE_BREAKPOINT = 860;
  var DEFAULT_CAROUSEL_SLIDE_SELECTOR = '.cod-carousel__slide';
  var DEFAULT_CAROUSEL_ACTIVE_CLASS = 'is-active';

  // reveal-on-scroll: dispara UNA sola vez por elemento, apenas entra en el
  // viewport (IntersectionObserver). No hay temporizador ligado a otra
  // animación (a diferencia del reveal original, atado al colapso del hero) —
  // es una simplificación deliberada: revela por posición de scroll, no por
  // una coreografía específica de otra sección.
  var ATTR_REVEAL_CLASS = 'data-cod-reveal-class';
  var ATTR_REVEAL_THRESHOLD = 'data-cod-reveal-threshold';
  var DEFAULT_REVEAL_CLASS = 'is-revealed';
  var DEFAULT_REVEAL_THRESHOLD = 0.15;

  // whatsapp: el nodo (render_whatsapp en el compilador MCP) ya trae el href
  // wa.me resuelto server-side; el runtime solo se encarga de revelarlo desde
  // la base de su sección cuando esta entra en viewport. Umbral más alto que
  // reveal-on-scroll a propósito: no debe aparecer hasta que la sección esté
  // realmente a la vista, no apenas asoma el borde.
  var BEHAVIOR_ANCHOR = 'anchor';
  var DEFAULT_ANCHOR_THRESHOLD = 0.3;

  // lightbox: el elemento con data-cod-behavior="lightbox" es el overlay
  // mismo; referencia por selector a la fuente de imágenes y a sus propios
  // controles (img grande, cerrar, prev/next), todos configurables — no
  // asume una única galería específica.
  var ATTR_LIGHTBOX_SOURCE = 'data-cod-lightbox-source';
  var ATTR_LIGHTBOX_IMAGE_SELECTOR = 'data-cod-lightbox-image-selector';
  var ATTR_LIGHTBOX_IMG = 'data-cod-lightbox-img';
  var ATTR_LIGHTBOX_CLOSE = 'data-cod-lightbox-close';
  var ATTR_LIGHTBOX_PREV = 'data-cod-lightbox-prev';
  var ATTR_LIGHTBOX_NEXT = 'data-cod-lightbox-next';
  var ATTR_LIGHTBOX_OPEN_CLASS = 'data-cod-lightbox-open-class';
  var DEFAULT_LIGHTBOX_IMAGE_SELECTOR = 'img';
  var DEFAULT_LIGHTBOX_OPEN_CLASS = 'is-open';

  // parcel-map: los datos de estado/valor viven en cada lote como atributos
  // data-cod-parcel-* (no JSON en el root); el panel y los colores se
  // referencian por selector en el root.
  var BEHAVIOR_PARCEL_MAP = 'parcel-map';
  var ATTR_PARCEL_ITEM_SELECTOR = 'data-cod-parcel-item-selector';
  var ATTR_PARCEL_ID_ATTR = 'data-cod-parcel-id-attr';
  var ATTR_PARCEL_SUPERFICIE = 'data-cod-parcel-superficie';
  var ATTR_PARCEL_ACCENT_DISPONIBLE = 'data-cod-parcel-accent-disponible';
  var ATTR_PARCEL_ACCENT_VENDIDO = 'data-cod-parcel-accent-vendido';
  var ATTR_PARCEL_ACCENT_EMPTY = 'data-cod-parcel-accent-empty';
  var ATTR_PARCEL_PANEL = 'data-cod-parcel-panel';
  var ATTR_PARCEL_ACCENT = 'data-cod-parcel-accent';
  var ATTR_PARCEL_FIELD_N = 'data-cod-parcel-field-n';
  var ATTR_PARCEL_FIELD_ESTADO = 'data-cod-parcel-field-estado';
  var ATTR_PARCEL_FIELD_SUP = 'data-cod-parcel-field-sup';
  var ATTR_PARCEL_FIELD_VAL = 'data-cod-parcel-field-val';
  var ATTR_PARCEL_COUNT = 'data-cod-parcel-count';
  var ATTR_PARCEL_COUNT_SECONDARY = 'data-cod-parcel-count-secondary';
  var ATTR_PARCEL_ESTADO = 'data-cod-parcel-estado';
  var ATTR_PARCEL_VALOR = 'data-cod-parcel-valor';
  var DEFAULT_PARCEL_ITEM_SELECTOR = '.lote';
  var DEFAULT_PARCEL_ID_ATTR = 'data-lote';
  var DEFAULT_PARCEL_SUPERFICIE = '5.000 m²';
  var DEFAULT_PARCEL_ACCENT_DISPONIBLE = 'var(--oliva-500)';
  var DEFAULT_PARCEL_ACCENT_VENDIDO = 'var(--tierra-700)';
  var DEFAULT_PARCEL_ACCENT_EMPTY = 'var(--tierra-300)';

  // geo-map: pan/zoom "cover" + filtro dependiente. LUGARES y CATEGORIAS se
  // serializan como JSON en dos atributos del root y se parsean con
  // JSON.parse dentro de try/catch (nunca eval/Function).
  var BEHAVIOR_GEO_MAP = 'geo-map';
  var ATTR_GEO_PLACES = 'data-cod-geo-places';
  var ATTR_GEO_CATEGORIES = 'data-cod-geo-categories';
  var ATTR_GEO_DATA_BOUNDS = 'data-cod-geo-data-bounds';
  var ATTR_GEO_INITIAL_CENTER = 'data-cod-geo-initial-center';
  var ATTR_GEO_PROYECTO = 'data-cod-geo-proyecto';
  var ATTR_GEO_MIN_ZOOM_RATIO = 'data-cod-geo-min-zoom-ratio';
  var ATTR_GEO_SVG = 'data-cod-geo-svg';
  var ATTR_GEO_SELECT_CATEGORIA = 'data-cod-geo-select-categoria';
  var ATTR_GEO_SELECT_LUGAR = 'data-cod-geo-select-lugar';
  var ATTR_GEO_MARKER = 'data-cod-geo-marker';
  var ATTR_GEO_PANEL = 'data-cod-geo-panel';
  var ATTR_GEO_ACCENT = 'data-cod-geo-accent';
  var ATTR_GEO_FIELD_NOMBRE = 'data-cod-geo-field-nombre';
  var ATTR_GEO_FIELD_CATEGORIA = 'data-cod-geo-field-categoria';
  var ATTR_GEO_FIELD_DISTANCIA = 'data-cod-geo-field-distancia';
  var ATTR_GEO_FIELD_DESCRIPCION = 'data-cod-geo-field-descripcion';
  var ATTR_GEO_FIELD_CONTACTO = 'data-cod-geo-field-contacto';
  var ATTR_GEO_ACCENT_COLOR = 'data-cod-geo-accent-color';
  // categoryIcons: JSON { categoria: "<svg path d>" } opcional. Si una
  // categoría no tiene ícono propio, el marcador usa la estrella por
  // defecto (compatibilidad con mapas ya publicados sin este atributo).
  var ATTR_GEO_CATEGORY_ICONS = 'data-cod-geo-category-icons';
  var DEFAULT_MARKER_PATH = 'M0 -18 L8 -6 L14 -6 L10 4 L12 16 L0 10 L-12 16 L-10 4 L-14 -6 L-8 -6 Z';
  var DEFAULT_GEO_ACCENT_COLOR = 'var(--dorado-600)';

  // hero-collapse: colapso desktop del banner de entrada. Dos máquinas de
  // estado con histéresis encadenadas; el modo mobile/tablet se decide una
  // sola vez al cargar y en ese caso este comportamiento no arranca.
  var BEHAVIOR_HERO_COLLAPSE = 'hero-collapse';
  var ATTR_HERO_PIN = 'data-cod-hero-pin';
  var ATTR_HERO_NAV = 'data-cod-hero-nav';
  var ATTR_HERO_REVEAL_TARGET = 'data-cod-hero-reveal-target';
  var ATTR_HERO_COLLAPSE_ON = 'data-cod-hero-collapse-on';
  var ATTR_HERO_COLLAPSE_OFF = 'data-cod-hero-collapse-off';
  var ATTR_HERO_DWELL = 'data-cod-hero-dwell';
  var ATTR_HERO_COLLAPSED_HEIGHT = 'data-cod-hero-collapsed-height';
  var ATTR_HERO_REVEAL_DELAY = 'data-cod-hero-reveal-delay';
  var ATTR_HERO_CRYSTALLIZE_OFFSET = 'data-cod-hero-crystallize-offset';
  var ATTR_HERO_COLLAPSED_CLASS = 'data-cod-hero-collapsed-class';
  var ATTR_HERO_BODY_CLASS = 'data-cod-hero-body-class';
  var ATTR_HERO_CRYSTALLIZED_CLASS = 'data-cod-hero-crystallized-class';
  var ATTR_HERO_HANDOFF_CLASS = 'data-cod-hero-handoff-class';
  var ATTR_HERO_REVEALED_CLASS = 'data-cod-hero-revealed-class';
  var DEFAULT_HERO_PIN = '#heroPin';
  var DEFAULT_HERO_NAV = '#siteNav';
  var DEFAULT_HERO_REVEAL_TARGET = '#proyecto';
  var DEFAULT_HERO_COLLAPSE_ON = 40;
  var DEFAULT_HERO_COLLAPSE_OFF = 8;
  var DEFAULT_HERO_DWELL = 20;
  var DEFAULT_HERO_COLLAPSED_HEIGHT = 600;
  var DEFAULT_HERO_REVEAL_DELAY = 1000;
  var DEFAULT_HERO_CRYSTALLIZE_OFFSET = 15;
  var DEFAULT_HERO_COLLAPSED_CLASS = 'is-collapsed';
  var DEFAULT_HERO_BODY_CLASS = 'hero-collapsed';
  var DEFAULT_HERO_CRYSTALLIZED_CLASS = 'is-crystallized';
  var DEFAULT_HERO_HANDOFF_CLASS = 'is-handoff';
  var DEFAULT_HERO_REVEALED_CLASS = 'is-revealed';

  // chart: gráfico declarativo simple (bar/line). Los datos viajan como JSON
  // en data-cod-chart-data y el SVG se genera en runtime con createElementNS,
  // sin librerías externas y sin interpretar el JSON como código.
  var BEHAVIOR_CHART = 'chart';
  var BEHAVIOR_VISOR_EMBED = 'visor-embed';
  var BEHAVIOR_WA_MENSAJE = 'wa-mensaje';
  var BEHAVIOR_PREFERENCIAS_COOKIES = 'preferencias-cookies';
  var BEHAVIOR_CUADRANTES = 'cuadrantes';
  var BEHAVIOR_PESTANAS = 'pestanas';
  var BEHAVIOR_MARQUESINA = 'marquesina';
  var BEHAVIOR_AVISO = 'aviso';
  var BEHAVIOR_MAPA = 'mapa';
  var ATTR_CHART_TYPE = 'data-cod-chart-type';
  var ATTR_CHART_DATA = 'data-cod-chart-data';
  var ATTR_CHART_COLOR = 'data-cod-chart-color';
  var ATTR_CHART_AXIS_COLOR = 'data-cod-chart-axis-color';
  var ATTR_CHART_GRID_COLOR = 'data-cod-chart-grid-color';
  var ATTR_CHART_LABEL_COLOR = 'data-cod-chart-label-color';
  var ATTR_CHART_WIDTH = 'data-cod-chart-width';
  var ATTR_CHART_HEIGHT = 'data-cod-chart-height';
  var DEFAULT_CHART_TYPE = 'bar';
  // Vacío a propósito: el color del gráfico no se inventa. Si el documento no
  // lo declara, colorDeAcento() lee el rol de acento del set de diseño y, si
  // tampoco está declarado, devuelve currentColor, que hereda la tinta del
  // texto. Hasta el 2026-09-16 acá había '#2271b1', el azul del panel de
  // WordPress: un gráfico pintado así no parece roto, parece decidido.
  // Ver COD_Design_Core en el plugin e issue #9.
  var DEFAULT_CHART_COLOR = '';
  var DEFAULT_CHART_AXIS_COLOR = '#5f6b7a';
  var DEFAULT_CHART_GRID_COLOR = 'rgba(0,0,0,.08)';
  var DEFAULT_CHART_LABEL_COLOR = '#27312c';
  var DEFAULT_CHART_WIDTH = 640;
  var DEFAULT_CHART_HEIGHT = 360;

  // --- Allowlist: el runtime sólo ejecuta conductas registradas aquí. -------
  var BEHAVIORS = {};
  BEHAVIORS[BEHAVIOR_SCROLL_THRESHOLD] = {
    name: BEHAVIOR_SCROLL_THRESHOLD,
    defaultThreshold: DEFAULT_THRESHOLD,
    scrolledClass: DEFAULT_SCROLLED_CLASS,
    description: 'Alterna la clase nav--scrolled cuando scrollY supera el umbral.',
  };
  BEHAVIORS[BEHAVIOR_NAV_TOGGLE] = {
    name: BEHAVIOR_NAV_TOGGLE,
    defaultToggleClass: DEFAULT_TOGGLE_CLASS,
    description: 'Alterna una clase en un target y opcionalmente en el propio botón.',
  };
  BEHAVIORS[BEHAVIOR_CAROUSEL_BASIC] = {
    name: BEHAVIOR_CAROUSEL_BASIC,
    defaultSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
    defaultActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
    description: 'Muestra un slide a la vez con navegación next/prev y dots opcionales (modo "single", default), o desliza una tira con varias fotos visibles (modo "track", data-cod-carousel-mode="track").',
  };
  BEHAVIORS[BEHAVIOR_REVEAL_ON_SCROLL] = {
    name: BEHAVIOR_REVEAL_ON_SCROLL,
    defaultRevealClass: DEFAULT_REVEAL_CLASS,
    defaultRevealThreshold: DEFAULT_REVEAL_THRESHOLD,
    description: 'Agrega una clase una sola vez cuando el elemento entra en el viewport.',
  };
  BEHAVIORS[BEHAVIOR_LIGHTBOX] = {
    name: BEHAVIOR_LIGHTBOX,
    defaultImageSelector: DEFAULT_LIGHTBOX_IMAGE_SELECTOR,
    defaultOpenClass: DEFAULT_LIGHTBOX_OPEN_CLASS,
    description: 'Overlay de foto ampliada: clic en una imagen de la fuente la abre, con navegación prev/next y cierre por Escape/clic afuera.',
  };
  BEHAVIORS[BEHAVIOR_PARCEL_MAP] = {
    name: BEHAVIOR_PARCEL_MAP,
    defaultItemSelector: DEFAULT_PARCEL_ITEM_SELECTOR,
    defaultIdAttr: DEFAULT_PARCEL_ID_ATTR,
    description: 'Plano de parcelas: hover para vista previa y clic para fijar/desfijar una parcela; colorea y cuenta disponibles al cargar.',
  };
  BEHAVIORS[BEHAVIOR_GEO_MAP] = {
    name: BEHAVIOR_GEO_MAP,
    defaultAccentColor: DEFAULT_GEO_ACCENT_COLOR,
    description: 'Mapa georreferenciado: pan por arrastre, zoom con rueda centrado en el cursor y filtro dependiente Categoría → Lugar (JSON declarativo).',
  };
  BEHAVIORS[BEHAVIOR_HERO_COLLAPSE] = {
    name: BEHAVIOR_HERO_COLLAPSE,
    defaultPinSelector: DEFAULT_HERO_PIN,
    defaultNavSelector: DEFAULT_HERO_NAV,
    defaultRevealTargetSelector: DEFAULT_HERO_REVEAL_TARGET,
    description: 'Colapso desktop del hero de entrada: colapso con histéresis de scroll y cristalización del nav encadenada a releaseScrollY.',
  };
  BEHAVIORS[BEHAVIOR_CHART] = {
    name: BEHAVIOR_CHART,
    defaultType: DEFAULT_CHART_TYPE,
    description: 'Gráfico simple de barras o líneas renderizado como SVG desde datos JSON declarativos.',
  };
  BEHAVIORS[BEHAVIOR_VISOR_EMBED] = {
    name: BEHAVIOR_VISOR_EMBED,
    defaultOpenClass: 'is-open',
    description: 'Capa a pantalla completa que muestra una página externa (un recorrido 360, un video) dentro de un iframe. La dirección se carga recién al abrir y se descarga al cerrar; solo acepta http y https. No se ejecuta dentro del editor: en el lienzo la capa se ve como un bloque más.',
  };
  BEHAVIORS[BEHAVIOR_WA_MENSAJE] = {
    name: BEHAVIOR_WA_MENSAJE,
    defaultOpenClass: 'is-open',
    description: 'Ventana para redactar el mensaje antes de abrir WhatsApp. Intercepta los enlaces de WhatsApp que se le indiquen, ofrece escrito el mensaje propio de cada sección, suma una casilla de consentimiento opcional y emite dos eventos medibles: uno al abrirse (quien pinchó) y otro al enviar (quien escribió), los dos con la zona de la que salió. No se ejecuta dentro del editor.',
  };

  BEHAVIORS[BEHAVIOR_PREFERENCIAS_COOKIES] = {
    name: BEHAVIOR_PREFERENCIAS_COOKIES,
    description: 'Reabre el panel de preferencias del banner de cookies. Va en un enlace del pie, que es donde la ley espera encontrarlo, para que alguien pueda cambiar de opinión después de haber respondido. No se le pone al elemento la clase del propio plugin de cookies porque esa clase no es un gancho sino su ícono flotante: trae position:fixed y su JavaScript le cambia el display al primer elemento que la tenga, así que el enlace se arrancaría del pie y aparecería y desaparecería solo. El reenvío del clic vive en el runtime publicado. No se ejecuta dentro del editor: acá no hay banner de cookies que abrir.',
  };

  BEHAVIORS[BEHAVIOR_CUADRANTES] = {
    name: BEHAVIOR_CUADRANTES,
    description: 'Display de cuatro contenidos (imagen, título y texto) sobre un grupo con exactamente cuatro hijos. En reposo, las cuatro imágenes forman una grilla 2x2 de cuadrados; al activar una, su imagen ocupa la mitad del bloque, su texto aparece en la otra mitad y las otras tres pasan a miniaturas (20% del lado de la celda) que conservan su disposición 2x2, con un hueco donde estaba la activa, pegadas a la esquina de la imagen que mira al centro (ítems 1 y 3: imagen a la izquierda; 2 y 4: a la derecha; 1 y 2: miniaturas abajo; 3 y 4: arriba). Botones reales, Escape y « × » para volver; respeta prefers-reduced-motion. No se ejecuta dentro del editor: allí el bloque se ve apilado y editable, sin botones encima ni textos ocultos.',
  };

  BEHAVIORS[BEHAVIOR_PESTANAS] = {
    name: BEHAVIOR_PESTANAS,
    description: 'Juego de pestañas sobre un grupo con 2 a 8 hijos: cada hijo es una pestaña, su primer hijo es la etiqueta y el resto es el panel. Al cargar queda activa la primera; al pinchar una etiqueta se muestra su panel y se ocultan los demás, con el alto del bloque viajando del valor viejo al nuevo. Las etiquetas pasan a ser botones reales (role="tab" dentro de un role="tablist"; flechas izquierda y derecha, Inicio y Fin) y cada hijo pasa a ser un role="tabpanel". Emite data-cod-pestanas-* para que la composición estile activa e inactiva; respeta prefers-reduced-motion. No se ejecuta dentro del editor: allí el bloque se ve apilado y editable, con todos los paneles a la vista.',
  };

  BEHAVIORS[BEHAVIOR_MARQUESINA] = {
    name: BEHAVIOR_MARQUESINA,
    description: 'Fila de piezas que se desplaza sola de derecha a izquierda, en bucle continuo y sin controles, sobre un grupo con 2 a 24 hijos (logos, sellos, una frase de cinta). Sin librerías: el runtime mete las piezas en una pista y agrega una copia del juego (aria-hidden, inerte, sin ids) y el movimiento es CSS puro (@keyframes y translateX(-50%)). Cuántas piezas se ven a la vez, la separación y la velocidad salen de variables (--cod-marquesina-visibles, --cod-marquesina-separacion, --cod-marquesina-duracion-pieza). Con prefers-reduced-motion: reduce se detiene y las piezas quedan quietas y a la vista. No se ejecuta dentro del editor: allí las piezas se ven apiladas y editables, sin copias.',
  };

  BEHAVIORS[BEHAVIOR_AVISO] = {
    name: BEHAVIOR_AVISO,
    description: 'Ventana emergente que aparece sola al cargar la página, una vez por visitante (se recuerda en el navegador), y se cierra con la X, con Escape o pinchando el fondo; sobre un grupo cuyos hijos son su contenido (por ejemplo un aviso de seguridad con los enlaces a las cuentas oficiales para poder verificar). Accesible: role="dialog" aria-modal="true", el foco entra al panel, el teclado no se sale mientras está abierta y el foco vuelve a donde estaba al cerrar. Si el almacenamiento está bloqueado no se rompe; si el JavaScript no corre el contenido queda legible en el flujo normal. Cada cuánto vuelve y el ancho salen de variables (--cod-aviso-vuelve-dias, --cod-aviso-ancho-maximo). No se ejecuta dentro del editor: allí el grupo se ve apilado y editable.',
  };

  BEHAVIORS[BEHAVIOR_MAPA] = {
    name: BEHAVIOR_MAPA,
    description: 'Mini mapa que, al pincharlo, despliega uno grande con un marcador y un globo, sobre un grupo cuyos hijos (la dirección escrita) quedan siempre a la vista. El mini es una imagen del propio sitio puesta por el compilador (sin JavaScript es un enlace a «cómo llegar»); el mapa grande es Mapbox GL, que se descarga SÓLO al abrirlo, con la clave pública guardada en Configuración (no en la página). Accesible: el mini es un botón (Enter y Espacio), la X y Escape cierran, el mapa no atrapa el foco y el desplazamiento respeta prefers-reduced-motion. Si Mapbox no llega se dice y se ofrece el enlace a «cómo llegar». No se ejecuta dentro del editor: allí el grupo se ve apilado y editable.',
  };

  function isAllowedBehavior(name) {
    return Object.prototype.hasOwnProperty.call(BEHAVIORS, name);
  }

  // El color de acento declarado por el set de diseño, leído del propio
  // documento. Si nadie lo declaró devuelve 'currentColor', que hereda la tinta
  // del texto: el medio resuelve lo que el set no dijo, en vez de que el plugin
  // invente un color. Ver COD_Design_Core en el plugin.
  //
  // Va como palabra clave y no como var(--...) porque el gráfico pinta con
  // atributos de presentación de SVG (fill, stroke), y ahí var() no se admite.
  function colorDeAcento(el) {
    try {
      var v = getComputedStyle(el).getPropertyValue('--cod-color-accent');
      v = v ? v.trim() : '';
      if (v) return v;
    } catch (e) {}
    return 'currentColor';
  }

  function parseThreshold(raw, fallback) {
    var n = parseFloat(raw);
    return isFinite(n) && n >= 0 ? n : fallback;
  }

  function parseClass(raw, fallback) {
    var value = String(raw == null ? '' : raw).trim();
    return value === '' ? fallback : value;
  }

  function parseIndex(raw, fallback) {
    var n = parseInt(raw, 10);
    return isFinite(n) && n >= 0 ? n : fallback;
  }

  function parseJsonAttr(el, attr) {
    var raw = String(el && el.getAttribute ? el.getAttribute(attr) || '' : '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function parsePoint(raw, fallbackX, fallbackY) {
    var parts = String(raw || '').split(',');
    var x = parseFloat(parts[0]);
    var y = parseFloat(parts[1]);
    return { x: isFinite(x) ? x : fallbackX, y: isFinite(y) ? y : fallbackY };
  }

  function extend() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i];
      if (!o) continue;
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
      }
    }
    return out;
  }

  // --- Detección de componentes nav -----------------------------------------
  function getTagName(component) {
    return String(component && component.get && component.get('tagName') || '').toLowerCase();
  }

  function getAttrObject(component) {
    if (component && typeof component.getAttributes === 'function') return component.getAttributes();
    var attrs = component && component.get && component.get('attributes');
    return attrs && typeof attrs === 'object' ? attrs : {};
  }

  function hasNavClass(component) {
    var cls = getAttrObject(component).class || '';
    return String(cls).split(/\s+/).indexOf('nav') !== -1;
  }

  function isNavComponent(component) {
    var tag = getTagName(component);
    return (tag === 'nav' || tag === 'header') && hasNavClass(component);
  }

  function walkComponents(component, cb) {
    cb(component);
    var comps = component && component.components && component.components();
    if (comps && typeof comps.each === 'function') comps.each(function (c) { walkComponents(c, cb); });
    else if (comps && Array.isArray(comps.models)) comps.models.forEach(function (m) { walkComponents(m, cb); });
  }

  function isExplicitBehavior(component, name) {
    return getAttrObject(component)[ATTR_BEHAVIOR] === name;
  }

  function scanBehavior(editor, behaviorName, options) {
    var opts = extend({ navClass: 'nav' }, options || {});
    var wrapper = editor && editor.getWrapper && editor.getWrapper();
    var found = [];
    if (!wrapper) return found;
    walkComponents(wrapper, function (comp) {
      if (behaviorName === BEHAVIOR_SCROLL_THRESHOLD) {
        var tag = getTagName(comp);
        if (tag === 'nav' || tag === 'header') {
          var attributes = getAttrObject(comp);
          var declared = attributes[ATTR_BEHAVIOR];
          // El descubrimiento legacy (nav/header con clase .nav) no debe
          // capturar componentes que ya declaran otra conducta allowlisted.
          if (declared && isAllowedBehavior(declared) && declared !== BEHAVIOR_SCROLL_THRESHOLD) return;
          var cls = attributes.class || '';
          if (
            String(cls).split(/\s+/).indexOf(opts.navClass) !== -1 ||
            declared === BEHAVIOR_SCROLL_THRESHOLD
          ) found.push(comp);
        }
      } else if (isExplicitBehavior(comp, behaviorName)) {
        found.push(comp);
      }
    });
    return found;
  }

  function scan(editor, options) {
    var found = [];
    for (var name in BEHAVIORS) {
      if (!Object.prototype.hasOwnProperty.call(BEHAVIORS, name)) continue;
      found = found.concat(scanBehavior(editor, name, options));
    }
    return found;
  }

  // --- Persistencia en el modelo (data attributes portables) ----------------
  function attachBehavior(component, behaviorName, options) {
    var opts = extend(
      {
        threshold: DEFAULT_THRESHOLD,
        scrolledClass: DEFAULT_SCROLLED_CLASS,
        toggleClass: DEFAULT_TOGGLE_CLASS,
        carouselSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
        carouselActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
      },
      options || {},
    );
    if (!component || typeof component.addAttributes !== 'function') return null;
    if (!isAllowedBehavior(behaviorName)) return null;

    var current = getAttrObject(component);
    var patch = {};
    patch[ATTR_BEHAVIOR] = behaviorName;

    if (behaviorName === BEHAVIOR_SCROLL_THRESHOLD) {
      if (current[ATTR_THRESHOLD] == null || current[ATTR_THRESHOLD] === '') {
        patch[ATTR_THRESHOLD] = String(opts.threshold);
      } else {
        // normaliza y reescribe el umbral existente como número válido
        patch[ATTR_THRESHOLD] = String(parseThreshold(current[ATTR_THRESHOLD], opts.threshold));
      }
      patch[ATTR_SCROLLED_CLASS] = parseClass(current[ATTR_SCROLLED_CLASS], opts.scrolledClass);
    } else if (behaviorName === BEHAVIOR_NAV_TOGGLE) {
      if (current[ATTR_TOGGLE_TARGET] == null || current[ATTR_TOGGLE_TARGET] === '') {
        patch[ATTR_TOGGLE_TARGET] = '';
      } else {
        patch[ATTR_TOGGLE_TARGET] = String(current[ATTR_TOGGLE_TARGET]).trim();
      }
      if (current[ATTR_TOGGLE_CLASS] == null || current[ATTR_TOGGLE_CLASS] === '') {
        patch[ATTR_TOGGLE_CLASS] = opts.toggleClass;
      } else {
        patch[ATTR_TOGGLE_CLASS] = parseClass(current[ATTR_TOGGLE_CLASS], opts.toggleClass);
      }
    } else if (behaviorName === BEHAVIOR_CAROUSEL_BASIC) {
      if (current[ATTR_CAROUSEL_SLIDE_SELECTOR] == null || current[ATTR_CAROUSEL_SLIDE_SELECTOR] === '') {
        patch[ATTR_CAROUSEL_SLIDE_SELECTOR] = opts.carouselSlideSelector;
      } else {
        patch[ATTR_CAROUSEL_SLIDE_SELECTOR] = String(current[ATTR_CAROUSEL_SLIDE_SELECTOR]).trim();
      }
      if (current[ATTR_CAROUSEL_ACTIVE_CLASS] == null || current[ATTR_CAROUSEL_ACTIVE_CLASS] === '') {
        patch[ATTR_CAROUSEL_ACTIVE_CLASS] = opts.carouselActiveClass;
      } else {
        patch[ATTR_CAROUSEL_ACTIVE_CLASS] = parseClass(current[ATTR_CAROUSEL_ACTIVE_CLASS], opts.carouselActiveClass);
      }
    } else if (behaviorName === BEHAVIOR_REVEAL_ON_SCROLL) {
      patch[ATTR_REVEAL_CLASS] = parseClass(current[ATTR_REVEAL_CLASS], opts.revealClass);
      if (current[ATTR_REVEAL_THRESHOLD] == null || current[ATTR_REVEAL_THRESHOLD] === '') {
        patch[ATTR_REVEAL_THRESHOLD] = String(opts.revealThreshold);
      } else {
        var parsedRatio = parseFloat(current[ATTR_REVEAL_THRESHOLD]);
        patch[ATTR_REVEAL_THRESHOLD] = String(isFinite(parsedRatio) && parsedRatio >= 0 && parsedRatio <= 1 ? parsedRatio : opts.revealThreshold);
      }
    }

    component.addAttributes(patch);

    // Trait opcional para edición visual en el Trait Manager (no fatal si la API difiere).
    if (behaviorName === BEHAVIOR_SCROLL_THRESHOLD) {
      try {
        var traits = component.get('traits');
        var exists = false;
        if (traits && typeof traits.where === 'function') {
          exists = traits.where({ name: ATTR_THRESHOLD }).length > 0;
        } else if (typeof component.getTrait === 'function') {
          exists = !!component.getTrait(ATTR_THRESHOLD);
        }
        if (!exists) {
          component.addTrait({
            type: 'number',
            name: ATTR_THRESHOLD,
            label: 'Umbral scroll (px)',
            min: 0,
            default: opts.threshold,
          });
        }
      } catch (e) {
        /* la ausencia de trait no rompe la persistencia */
      }
    }

    var after = getAttrObject(component);
    if (behaviorName === BEHAVIOR_SCROLL_THRESHOLD) {
      return {
        behavior: BEHAVIOR_SCROLL_THRESHOLD,
        threshold: parseThreshold(after[ATTR_THRESHOLD], opts.threshold),
        scrolledClass: parseClass(after[ATTR_SCROLLED_CLASS], opts.scrolledClass),
      };
    }
    if (behaviorName === BEHAVIOR_NAV_TOGGLE) {
      return {
        behavior: BEHAVIOR_NAV_TOGGLE,
        target: String(after[ATTR_TOGGLE_TARGET] || '').trim(),
        toggleClass: parseClass(after[ATTR_TOGGLE_CLASS], opts.toggleClass),
        selfClass: parseClass(after[ATTR_TOGGLE_SELF_CLASS], ''),
      };
    }
    if (behaviorName === BEHAVIOR_CAROUSEL_BASIC) {
      return {
        behavior: BEHAVIOR_CAROUSEL_BASIC,
        slideSelector: String(after[ATTR_CAROUSEL_SLIDE_SELECTOR] || '').trim() || opts.carouselSlideSelector,
        activeClass: parseClass(after[ATTR_CAROUSEL_ACTIVE_CLASS], opts.carouselActiveClass),
      };
    }
    if (behaviorName === BEHAVIOR_CUADRANTES) return { behavior: BEHAVIOR_CUADRANTES };
    if (behaviorName === BEHAVIOR_PESTANAS) return { behavior: BEHAVIOR_PESTANAS };
    if (behaviorName === BEHAVIOR_MARQUESINA) return { behavior: BEHAVIOR_MARQUESINA };
    if (behaviorName === BEHAVIOR_AVISO) return { behavior: BEHAVIOR_AVISO };
    if (behaviorName === BEHAVIOR_MAPA) return { behavior: BEHAVIOR_MAPA };
    return {
      behavior: BEHAVIOR_REVEAL_ON_SCROLL,
      revealClass: parseClass(after[ATTR_REVEAL_CLASS], opts.revealClass),
      revealThreshold: parseThreshold(after[ATTR_REVEAL_THRESHOLD], opts.revealThreshold),
    };
  }

  function attachToComponent(component, options) {
    return attachBehavior(component, BEHAVIOR_SCROLL_THRESHOLD, options);
  }

  // --- Núcleo del runtime (sin GrapesJS; reutilizado por editor y export) ---
  function installScrollRuntime(win, doc, opts, cleanups) {
    var nodes = doc.querySelectorAll(opts.navSelector);
    for (var i = 0; i < nodes.length; i++) {
      (function (nav) {
        // Puerta de allowlist: sólo actúa si el nodo declara una conducta reconocida.
        var declared = nav.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_SCROLL_THRESHOLD) return;

        var threshold = parseThreshold(nav.getAttribute(ATTR_THRESHOLD), opts.defaultThreshold);
        var scrolledClass = parseClass(nav.getAttribute(ATTR_SCROLLED_CLASS), opts.scrolledClass);
        nav.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_SCROLL_THRESHOLD);
        nav.setAttribute(ATTR_THRESHOLD, String(threshold));
        nav.setAttribute(ATTR_SCROLLED_CLASS, scrolledClass);

        function readScrollY() {
          if (typeof win.scrollY === 'number') return win.scrollY;
          if (typeof win.pageYOffset === 'number') return win.pageYOffset;
          if (doc.documentElement && doc.documentElement.scrollTop) return doc.documentElement.scrollTop;
          if (doc.body && doc.body.scrollTop) return doc.body.scrollTop;
          return 0;
        }
        function update() {
          var previewState = nav.getAttribute('data-cod-preview-scroll-state');
          var scrolled = previewState === 'scrolled' || (previewState !== 'entry' && readScrollY() > threshold);
          nav.classList.toggle(scrolledClass, scrolled);
        }
        update();
        if (typeof win.addEventListener === 'function') {
          win.addEventListener('scroll', update, { passive: true });
          win.addEventListener('resize', update, { passive: true });
        }
        cleanups.push(function () {
          if (typeof win.removeEventListener === 'function') {
            win.removeEventListener('scroll', update);
            win.removeEventListener('resize', update);
          }
          if (opts.autoRemove) nav.classList.remove(scrolledClass);
        });
      })(nodes[i]);
    }
  }

  function installNavToggleRuntime(win, doc, opts, cleanups) {
    var nodes = doc.querySelectorAll('[data-cod-behavior="nav-toggle"]');
    for (var i = 0; i < nodes.length; i++) {
      (function (button) {
        var declared = button.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_NAV_TOGGLE) return;

        var targetSelector = String(button.getAttribute(ATTR_TOGGLE_TARGET) || '').trim();
        if (!targetSelector) return;
        var target = null;
        try { target = doc.querySelector(targetSelector); } catch (e) { return; }
        if (!target) return;

        var toggleClass = parseClass(button.getAttribute(ATTR_TOGGLE_CLASS), opts.toggleClass);
        var selfClass = parseClass(button.getAttribute(ATTR_TOGGLE_SELF_CLASS), '');
        button.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_NAV_TOGGLE);
        button.setAttribute(ATTR_TOGGLE_TARGET, targetSelector);
        button.setAttribute(ATTR_TOGGLE_CLASS, toggleClass);
        if (selfClass) button.setAttribute(ATTR_TOGGLE_SELF_CLASS, selfClass);

        function apply(isOpen) {
          target.classList.toggle(toggleClass, isOpen);
          if (selfClass) button.classList.toggle(selfClass, isOpen);
          button.setAttribute('aria-expanded', String(isOpen));
        }
        function onClick(e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          apply(!target.classList.contains(toggleClass));
        }
        function onTargetClick(e) {
          var el = e && e.target;
          if (!el || typeof el.closest !== 'function') return;
          var link = el.closest('a[href]');
          if (link) apply(false);
        }

        button.setAttribute('aria-expanded', String(target.classList.contains(toggleClass)));
        button.addEventListener('click', onClick);
        target.addEventListener('click', onTargetClick);
        cleanups.push(function () {
          button.removeEventListener('click', onClick);
          target.removeEventListener('click', onTargetClick);
          if (opts.autoRemove) {
            target.classList.remove(toggleClass);
            if (selfClass) button.classList.remove(selfClass);
            button.setAttribute('aria-expanded', 'false');
          }
        });
      })(nodes[i]);
    }
  }

  // Técnica elegida para carousel-basic: mostrar/ocultar slides con
  // display:none !important y aria-hidden, en lugar de scroll-snap. Es la
  // variante más robusta con alturas de slide arbitrarias y markup de GrapesJS:
  // no exige un contenedor flex horizontal ni CSS de scroll obligatorio.
  // Modo "track": mide la separación real entre slides (no asume un gap fijo)
  // y traslada el track para mostrar N a la vez, con next/prev deshabilitados
  // en los extremos. Recalcula en resize (el conteo visible puede cambiar).
  function installCarouselTrackRuntime(win, doc, root, opts, cleanups) {
    var trackSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_TRACK_SELECTOR), DEFAULT_CAROUSEL_TRACK_SELECTOR);
    var slideSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR), opts.carouselSlideSelector);
    var visible = parseIndex(root.getAttribute(ATTR_CAROUSEL_VISIBLE), DEFAULT_CAROUSEL_VISIBLE) || DEFAULT_CAROUSEL_VISIBLE;
    var visibleMobileRaw = root.getAttribute(ATTR_CAROUSEL_VISIBLE_MOBILE);
    var visibleMobile = visibleMobileRaw ? parseIndex(visibleMobileRaw, visible) : visible;
    var breakpoint = parseIndex(root.getAttribute(ATTR_CAROUSEL_MOBILE_BREAKPOINT), DEFAULT_CAROUSEL_MOBILE_BREAKPOINT);

    var track = null;
    try { track = root.querySelector(trackSelector); } catch (e) { return; }
    if (!track) return;
    var slides = [];
    try { slides = Array.prototype.slice.call(track.querySelectorAll(slideSelector)); } catch (e) { return; }
    if (!slides.length) return;

    var nextBtn = root.querySelector('[' + ATTR_CAROUSEL_NEXT + ']');
    var prevBtn = root.querySelector('[' + ATTR_CAROUSEL_PREV + ']');
    var index = 0;

    // filas: 1 por defecto — con 1 el comportamiento es idéntico al de siempre.
    var rows = parseIndex(root.getAttribute(ATTR_CAROUSEL_ROWS), 1) || 1;
    function visibleCount() { return win.innerWidth <= breakpoint ? visibleMobile : visible; }
    function columnCount() { return Math.ceil(slides.length / rows); }
    function maxIndex() { return Math.max(0, columnCount() - visibleCount()); }
    function slideStep() {
      // Con varias filas el paso es el ancho de una COLUMNA: medir contra la
      // segunda diapositiva daría cero, porque queda justo debajo.
      if (rows > 1 && slides.length > rows) {
        return slides[rows].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
      }
      if (slides.length < 2) return slides[0].getBoundingClientRect().width;
      return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
    }
    function update() {
      var step = slideStep();
      track.style.setProperty('--cod-carousel-columnas', String(visibleCount()));
      track.style.transform = 'translateX(' + (-index * step) + 'px)';
      if (prevBtn) prevBtn.disabled = index <= 0;
      if (nextBtn) nextBtn.disabled = index >= maxIndex();
    }
    function onNext(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      index = Math.min(maxIndex(), index + 1);
      update();
    }
    function onPrev(e) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      index = Math.max(0, index - 1);
      update();
    }
    function onResize() {
      index = Math.min(index, maxIndex());
      update();
    }
    if (nextBtn) nextBtn.addEventListener('click', onNext);
    if (prevBtn) prevBtn.addEventListener('click', onPrev);
    win.addEventListener('resize', onResize, { passive: true });
    update();

    cleanups.push(function () {
      if (nextBtn) nextBtn.removeEventListener('click', onNext);
      if (prevBtn) prevBtn.removeEventListener('click', onPrev);
      win.removeEventListener('resize', onResize);
      if (opts.autoRemove) track.style.transform = '';
    });
  }

  function installCarouselRuntime(win, doc, opts, cleanups) {
    var roots = doc.querySelectorAll('[data-cod-behavior="carousel-basic"]');
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_CAROUSEL_BASIC) return;

        if (root.getAttribute(ATTR_CAROUSEL_MODE) === CAROUSEL_MODE_TRACK) {
          installCarouselTrackRuntime(win, doc, root, opts, cleanups);
          return;
        }

        var slideSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR), opts.carouselSlideSelector);
        var activeClass = parseClass(root.getAttribute(ATTR_CAROUSEL_ACTIVE_CLASS), opts.carouselActiveClass);
        var start = parseIndex(root.getAttribute(ATTR_CAROUSEL_START), 0);
        root.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_CAROUSEL_BASIC);
        root.setAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR, slideSelector);
        root.setAttribute(ATTR_CAROUSEL_ACTIVE_CLASS, activeClass);

        var slides = [];
        try { slides = Array.prototype.slice.call(root.querySelectorAll(slideSelector)); } catch (e) { return; }
        if (!slides.length) return;

        var current = start < slides.length ? start : 0;
        var nextBtn = root.querySelector('[' + ATTR_CAROUSEL_NEXT + ']');
        var prevBtn = root.querySelector('[' + ATTR_CAROUSEL_PREV + ']');
        var dotsHost = root.querySelector('[' + ATTR_CAROUSEL_DOTS + ']');
        if (!dotsHost && root.hasAttribute(ATTR_CAROUSEL_DOTS)) dotsHost = root;
        var dots = [];
        if (dotsHost) {
          dots = Array.prototype.slice.call(dotsHost.querySelectorAll('[' + ATTR_CAROUSEL_DOT + ']'));
          if (!dots.length) {
            for (var d = 0; d < slides.length; d++) {
              var dot = doc.createElement('button');
              dot.type = 'button';
              dot.className = 'cod-carousel__dot';
              dot.setAttribute(ATTR_CAROUSEL_DOT, '');
              dotsHost.appendChild(dot);
              dots.push(dot);
            }
          }
        }

        function show(index) {
          current = ((index % slides.length) + slides.length) % slides.length;
          for (var s = 0; s < slides.length; s++) {
            var active = s === current;
            var slide = slides[s];
            if (active) {
              if (slide.style && typeof slide.style.removeProperty === 'function') slide.style.removeProperty('display');
              slide.removeAttribute('hidden');
              slide.classList.add(activeClass);
              slide.setAttribute('aria-hidden', 'false');
            } else {
              if (slide.style && typeof slide.style.setProperty === 'function') slide.style.setProperty('display', 'none', 'important');
              slide.setAttribute('hidden', '');
              slide.classList.remove(activeClass);
              slide.setAttribute('aria-hidden', 'true');
            }
          }
          for (var q = 0; q < dots.length; q++) {
            dots[q].classList.toggle(activeClass, q === current);
            dots[q].setAttribute('aria-selected', q === current ? 'true' : 'false');
          }
        }

        var cleanupListeners = [];
        function onNext(e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          show(current + 1);
        }
        function onPrev(e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          show(current - 1);
        }
        if (nextBtn) {
          nextBtn.addEventListener('click', onNext);
          cleanupListeners.push(function () { nextBtn.removeEventListener('click', onNext); });
        }
        if (prevBtn) {
          prevBtn.addEventListener('click', onPrev);
          cleanupListeners.push(function () { prevBtn.removeEventListener('click', onPrev); });
        }
        for (var k = 0; k < dots.length; k++) {
          (function (dotIndex) {
            function onDot(e) {
              if (e && typeof e.preventDefault === 'function') e.preventDefault();
              show(dotIndex);
            }
            dots[dotIndex].addEventListener('click', onDot);
            cleanupListeners.push(function () { dots[dotIndex].removeEventListener('click', onDot); });
          })(k);
        }

        show(current);
        cleanups.push(function () {
          while (cleanupListeners.length) cleanupListeners.pop()();
          if (opts.autoRemove) {
            for (var s = 0; s < slides.length; s++) {
              var slide = slides[s];
              if (slide.style && typeof slide.style.removeProperty === 'function') slide.style.removeProperty('display');
              slide.removeAttribute('hidden');
              slide.classList.remove(activeClass);
              slide.removeAttribute('aria-hidden');
            }
            for (var q = 0; q < dots.length; q++) {
              dots[q].classList.remove(activeClass);
              dots[q].removeAttribute('aria-selected');
            }
          }
        });
      })(roots[i]);
    }
  }

  // reveal-on-scroll: agrega la clase una sola vez por elemento (no se
  // quita al salir del viewport) y deja de observar. Si el entorno no tiene
  // IntersectionObserver, revela de inmediato en vez de dejar el contenido
  // invisible para siempre — degradación segura, no un fallo silencioso.
  function installRevealRuntime(win, doc, opts, cleanups) {
    var nodes = doc.querySelectorAll('[data-cod-behavior="reveal-on-scroll"]');
    var hasIO = typeof win.IntersectionObserver === 'function';
    var observer = null;
    if (hasIO) {
      observer = new win.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var revealClass = parseClass(el.getAttribute(ATTR_REVEAL_CLASS), opts.revealClass);
          el.classList.add(revealClass);
          observer.unobserve(el);
        });
      }, { threshold: opts.revealThreshold });
    }
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        var declared = el.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_REVEAL_ON_SCROLL) return;

        var revealClass = parseClass(el.getAttribute(ATTR_REVEAL_CLASS), opts.revealClass);
        el.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_REVEAL_ON_SCROLL);
        el.setAttribute(ATTR_REVEAL_CLASS, revealClass);

        if (!hasIO) {
          el.classList.add(revealClass);
          return;
        }
        observer.observe(el);
      })(nodes[i]);
    }
    if (observer) {
      cleanups.push(function () {
        observer.disconnect();
      });
    }
  }

  // anchor: regla genérica de posicionamiento+animación (borde/esquina +
  // offset + entrada), aplicable a cualquier nodo (whatsapp, imagen, botón,
  // precio, red social...) — no exclusiva de WhatsApp. No hay <style>/clase
  // CSS involucrada: el sanitizador de HTML de Canvas no admite <style>, así
  // que el compilador deja el estado inicial en el atributo style inline y
  // aquí solo escribimos el estado final (transform + opacity) directo sobre
  // el elemento cuando entra en vista. La transición ya viene declarada en
  // ese mismo style inline.
  var ATTR_ANCHOR_REVEAL_TRANSFORM = 'data-cod-anchor-reveal-transform';

  function revealAnchor(el) {
    var transform = el.getAttribute(ATTR_ANCHOR_REVEAL_TRANSFORM);
    if (transform) el.style.transform = transform;
    el.style.opacity = '1';
  }

  function installAnchorRuntime(win, doc, opts, cleanups) {
    var nodes = doc.querySelectorAll('[data-cod-behavior="anchor"]');
    if (!nodes.length) return;
    var hasIO = typeof win.IntersectionObserver === 'function';
    var observer = null;
    if (hasIO) {
      observer = new win.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          revealAnchor(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: DEFAULT_ANCHOR_THRESHOLD });
    }
    for (var i = 0; i < nodes.length; i++) {
      var declared = nodes[i].getAttribute(ATTR_BEHAVIOR);
      if (declared !== BEHAVIOR_ANCHOR) continue;
      if (!hasIO) {
        revealAnchor(nodes[i]);
        continue;
      }
      observer.observe(nodes[i]);
    }
    if (observer) {
      cleanups.push(function () {
        observer.disconnect();
      });
    }
  }


  // lightbox: el nodo con el comportamiento ES el overlay. Todo lo demás
  // (fuente de imágenes, controles) se referencia por selector configurable,
  // así el mismo comportamiento sirve para cualquier galería, no solo una.
  function installLightboxRuntime(win, doc, opts, cleanups) {
    var roots = doc.querySelectorAll('[data-cod-behavior="lightbox"]');
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_LIGHTBOX) return;

        var sourceSelector = String(root.getAttribute(ATTR_LIGHTBOX_SOURCE) || '').trim();
        if (!sourceSelector) return;
        var source = null;
        try { source = doc.querySelector(sourceSelector); } catch (e) { return; }
        if (!source) return;

        var imageSelector = parseClass(root.getAttribute(ATTR_LIGHTBOX_IMAGE_SELECTOR), opts.lightboxImageSelector);
        var openClass = parseClass(root.getAttribute(ATTR_LIGHTBOX_OPEN_CLASS), opts.lightboxOpenClass);
        var images = [];
        try { images = Array.prototype.slice.call(source.querySelectorAll(imageSelector)); } catch (e) { return; }
        if (!images.length) return;

        function bySelector(attr) {
          var selector = String(root.getAttribute(attr) || '').trim();
          if (!selector) return null;
          try { return doc.querySelector(selector); } catch (e) { return null; }
        }
        var bigImg = bySelector(ATTR_LIGHTBOX_IMG);
        var closeBtn = bySelector(ATTR_LIGHTBOX_CLOSE);
        var prevBtn = bySelector(ATTR_LIGHTBOX_PREV);
        var nextBtn = bySelector(ATTR_LIGHTBOX_NEXT);
        if (!bigImg) return;

        var current = 0;
        // El lightbox arma su imagen ampliada copiando solo src y alt, así que
        // un giro puesto como clase en la miniatura no llega hasta acá. Por eso
        // el giro viaja en data-cod-rotation sobre la propia <img> y se repone
        // al ampliar. En 90/270 la imagen ocupa al revés, de modo que sus dos
        // límites se intercambian; si no, se recorta contra el borde equivocado.
        function aplicarGiro(destino, origen) {
          var giro = parseInt(origen.getAttribute('data-cod-rotation') || '0', 10);
          if (giro !== 90 && giro !== 180 && giro !== 270) {
            destino.style.transform = '';
            destino.style.maxWidth = '';
            destino.style.maxHeight = '';
            destino.removeAttribute('data-cod-rotation');
            return;
          }
          destino.setAttribute('data-cod-rotation', String(giro));
          destino.style.transform = 'rotate(' + giro + 'deg)';
          if (giro === 180) {
            destino.style.maxWidth = '';
            destino.style.maxHeight = '';
            return;
          }
          var caja = destino.parentNode && destino.parentNode.getBoundingClientRect
            ? destino.parentNode.getBoundingClientRect()
            : null;
          var ancho = caja && caja.width ? caja.width : window.innerWidth;
          var alto = caja && caja.height ? caja.height : window.innerHeight;
          destino.style.maxWidth = Math.round(alto) + 'px';
          destino.style.maxHeight = Math.round(ancho) + 'px';
        }
        function open(index) {
          current = ((index % images.length) + images.length) % images.length;
          bigImg.src = images[current].currentSrc || images[current].src;
          bigImg.alt = images[current].alt || '';
          aplicarGiro(bigImg, images[current]);
          root.classList.add(openClass);
        }
        function close() { root.classList.remove(openClass); }
        function isOpen() { return root.classList.contains(openClass); }

        var imageListeners = [];
        images.forEach(function (img, index) {
          function onImgClick() { open(index); }
          img.addEventListener('click', onImgClick);
          imageListeners.push(function () { img.removeEventListener('click', onImgClick); });
        });

        function onRootClick(e) {
          if (e.target === root || e.target === bigImg) close();
        }
        function onPrev(e) { if (e && typeof e.preventDefault === 'function') e.preventDefault(); open(current - 1); }
        function onNext(e) { if (e && typeof e.preventDefault === 'function') e.preventDefault(); open(current + 1); }
        function onKeydown(e) {
          if (!isOpen()) return;
          if (e.key === 'Escape') close();
          else if (e.key === 'ArrowLeft') open(current - 1);
          else if (e.key === 'ArrowRight') open(current + 1);
        }

        root.addEventListener('click', onRootClick);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (prevBtn) prevBtn.addEventListener('click', onPrev);
        if (nextBtn) nextBtn.addEventListener('click', onNext);
        doc.addEventListener('keydown', onKeydown);

        cleanups.push(function () {
          imageListeners.forEach(function (off) { off(); });
          root.removeEventListener('click', onRootClick);
          if (closeBtn) closeBtn.removeEventListener('click', close);
          if (prevBtn) prevBtn.removeEventListener('click', onPrev);
          if (nextBtn) nextBtn.removeEventListener('click', onNext);
          doc.removeEventListener('keydown', onKeydown);
          if (opts.autoRemove) root.classList.remove(openClass);
        });
      })(roots[i]);
    }
  }

  // cuadrantes: cuatro contenidos (imagen, título y texto). En reposo son una
  // grilla 2x2 de imágenes cuadradas e iguales. Al activar uno, su imagen crece
  // hasta ocupar la mitad del bloque, su texto aparece en la otra mitad y las
  // otras tres imágenes pasan a miniaturas (un 20% del lado de la celda) que
  // CONSERVAN LA DISPOSICIÓN 2x2 que tenían: forman una mini grilla con un
  // hueco donde estaba la activa (la que estaba a la derecha sigue a la
  // derecha, la de abajo sigue abajo), pegada a la esquina de la imagen que
  // mira hacia el centro del bloque:
  //
  //   ítem 1 (arriba-izquierda)  imagen a la izquierda, texto a la derecha, miniaturas abajo-derecha
  //   ítem 2 (arriba-derecha)    imagen a la derecha, texto a la izquierda, miniaturas abajo-izquierda
  //   ítem 3 (abajo-izquierda)   imagen a la izquierda, texto a la derecha, miniaturas arriba-derecha
  //   ítem 4 (abajo-derecha)     imagen a la derecha, texto a la izquierda, miniaturas arriba-izquierda
  //
  // Por eso no es un carrusel: la posición de origen de cada ítem decide el
  // lado, la esquina y el lugar de su miniatura. Es el port del módulo original
  // del sitio de Econut (ver cuadrantes_css en el plugin).
  //
  // NINGÚN ELEMENTO CAMBIA DE LUGAR EN EL DOM. Cada imagen es siempre la misma
  // celda; lo que cambia, por CSS, es su posición y su tamaño. Acá sólo se
  // marcan atributos sobre la raíz y las piezas: el estado (reposo o activo),
  // cuál está activa, el lado, la esquina, y en cada imagen su rol.
  //
  // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="cuadrantes") tiene
  // EXACTAMENTE cuatro hijos, y cada hijo es un contenedor con una imagen
  // (o video) y el resto de su contenido (título y texto). Si la forma no
  // calza, no toca nada: el contenido queda apilado y legible.
  //
  // QUÉ HACE AL DOM. Envuelve la imagen de cada ítem en un `div` propio (que es
  // la celda de la grilla), le pone un `button` transparente encima y marca
  // el texto como panel. Un ítem con varios bloques de texto suelto
  // se agrupa en un `div`. Todo se puede deshacer con la función que retorna.
  // El color y la tipografía los ponen las reglas de diseño de cada sitio.
  //
  // No se monta dentro del editor: allí el bloque debe verse apilado y
  // editable, sin botones encima ni textos ocultos que no se puedan
  // seleccionar (ver installCuadrantesRuntime en cod-behaviors.js).
  var contadorCuadrantes = 0;

  function montarCuadrantes(root, doc) {
    if (root.getAttribute('data-cod-cuadrantes-listo') === '1') return null;

    var hijos = Array.prototype.slice.call(root.children);
    if (hijos.length !== 4) return null;

    // 1) Reconocer la forma de cada ítem antes de tocar nada.
    var formas = [];
    for (var i = 0; i < hijos.length; i++) {
      var caja = null;
      var resto = [];
      var nietos = Array.prototype.slice.call(hijos[i].children);
      for (var j = 0; j < nietos.length; j++) {
        var esMedio = nietos[j].matches('img,video,picture') || nietos[j].querySelector('img,video,picture');
        if (!caja && esMedio) caja = nietos[j];
        else resto.push(nietos[j]);
      }
      if (!caja || !resto.length) return null;
      formas.push({ item: hijos[i], caja: caja, resto: resto });
    }

    contadorCuadrantes += 1;
    var numero = contadorCuadrantes;
    var deshacer = [];
    var piezas = [];
    var activo = 0; // 0 = reposo; 1..4 = cuadrante activo

    // 2) Armar las piezas de cada ítem.
    formas.forEach(function (forma, indice) {
      var n = indice + 1;

      forma.item.classList.add('cod-cuadrantes__item');
      forma.item.setAttribute('data-cod-cuadrantes-item', String(n));
      deshacer.push(function () {
        forma.item.classList.remove('cod-cuadrantes__item');
        forma.item.removeAttribute('data-cod-cuadrantes-item');
      });

      // Envoltorio de la imagen: es la celda que se posiciona y se anima.
      var medio = doc.createElement('div');
      medio.className = 'cod-cuadrantes__media';
      medio.setAttribute('data-cod-cuadrantes-item', String(n));
      forma.item.insertBefore(medio, forma.caja);
      medio.appendChild(forma.caja);
      deshacer.push(function () {
        medio.parentNode.insertBefore(forma.caja, medio);
        medio.parentNode.removeChild(medio);
      });

      // Panel de texto: el propio bloque si es uno solo; si son varios, un
      // grupo que los junta para poder ubicarlos como una sola caja.
      var panel;
      if (forma.resto.length === 1) {
        panel = forma.resto[0];
      } else {
        panel = doc.createElement('div');
        forma.item.insertBefore(panel, forma.resto[0]);
        forma.resto.forEach(function (bloque) { panel.appendChild(bloque); });
        deshacer.push(function () {
          forma.resto.forEach(function (bloque) { panel.parentNode.insertBefore(bloque, panel); });
          panel.parentNode.removeChild(panel);
        });
      }
      panel.classList.add('cod-cuadrantes__info');
      panel.setAttribute('data-cod-cuadrantes-item', String(n));
      var idPropio = panel.getAttribute('id');
      if (!idPropio) {
        panel.setAttribute('id', 'cod-cuadrantes-' + numero + '-texto-' + n);
        deshacer.push(function () { panel.removeAttribute('id'); });
      }
      deshacer.push(function () {
        panel.classList.remove('cod-cuadrantes__info');
        panel.removeAttribute('data-cod-cuadrantes-item');
        panel.removeAttribute('data-cod-cuadrantes-visible');
        panel.removeAttribute('aria-hidden');
      });

      // El nombre accesible del botón es el título; si no hay, un genérico.
      var titulo = panel.querySelector('h1,h2,h3,h4,h5,h6');
      var etiqueta = titulo ? String(titulo.textContent || '').trim() : '';
      if (!etiqueta) etiqueta = 'Contenido ' + n;

      var boton = doc.createElement('button');
      boton.type = 'button';
      boton.className = 'cod-cuadrantes__disparador';
      boton.setAttribute('aria-label', etiqueta);
      boton.setAttribute('aria-expanded', 'false');
      boton.setAttribute('aria-controls', panel.getAttribute('id'));
      boton.addEventListener('click', function () { activar(n); });
      medio.appendChild(boton);

      piezas.push({ medio: medio, panel: panel, boton: boton });
    });

    // 3) Botón «×» para volver a reposo (una sola vez, al final de la raíz).
    var botonCerrar = doc.createElement('button');
    botonCerrar.type = 'button';
    botonCerrar.className = 'cod-cuadrantes__cerrar';
    botonCerrar.setAttribute('aria-label', 'Volver a los cuatro cuadrantes');
    botonCerrar.textContent = '×';
    botonCerrar.hidden = true;
    botonCerrar.addEventListener('click', cerrar);
    root.appendChild(botonCerrar);
    deshacer.push(function () { root.removeChild(botonCerrar); });

    function enfocar(elemento) {
      if (!elemento || typeof elemento.focus !== 'function') return;
      try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
    }

    // 4) Dibujar el estado: todo sale de `activo`, nada se acumula.
    function dibujar() {
      var lado = '';
      var esquina = '';
      if (activo) {
        // Los ítems 1 y 3 están a la izquierda; el 2 y el 4, a la derecha.
        lado = activo % 2 === 1 ? 'izquierda' : 'derecha';
        // Los ítems 1 y 2 están arriba: sus miniaturas quedan abajo.
        esquina = activo <= 2 ? 'abajo' : 'arriba';
        root.setAttribute('data-cod-cuadrantes-estado', 'activo');
        root.setAttribute('data-cod-cuadrantes-activo', String(activo));
        root.setAttribute('data-cod-cuadrantes-lado', lado);
        root.setAttribute('data-cod-cuadrantes-esquina', esquina);
      } else {
        root.setAttribute('data-cod-cuadrantes-estado', 'reposo');
        root.removeAttribute('data-cod-cuadrantes-activo');
        root.removeAttribute('data-cod-cuadrantes-lado');
        root.removeAttribute('data-cod-cuadrantes-esquina');
      }

      var ranura = 0; // orden de las miniaturas (lo usa el móvil, que las pone en fila)
      piezas.forEach(function (pieza, indice) {
        var n = indice + 1;
        var rol = activo === 0 ? 'cuadrante' : (n === activo ? 'activa' : 'miniatura');
        pieza.medio.setAttribute('data-cod-cuadrantes-rol', rol);
        if (rol === 'miniatura') {
          pieza.medio.setAttribute('data-cod-cuadrantes-slot', String(ranura));
          ranura += 1;
        } else {
          pieza.medio.removeAttribute('data-cod-cuadrantes-slot');
        }
        var visible = n === activo;
        pieza.panel.setAttribute('data-cod-cuadrantes-visible', visible ? 'true' : 'false');
        pieza.panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
        pieza.boton.setAttribute('aria-expanded', visible ? 'true' : 'false');
        // La imagen ya expandida no es un destino: se sale por la «×».
        if (visible) pieza.boton.setAttribute('tabindex', '-1');
        else pieza.boton.removeAttribute('tabindex');
      });
      botonCerrar.hidden = activo === 0;
    }

    function activar(n) {
      if (n === activo) return;
      activo = n;
      dibujar();
      // El foco sigue al contenido: va a la «×», que abre el panel nuevo.
      enfocar(botonCerrar);
    }

    function cerrar() {
      if (!activo) return;
      var anterior = activo;
      activo = 0;
      dibujar();
      // Al volver a reposo el foco regresa al cuadrante que se había abierto.
      enfocar(piezas[anterior - 1].boton);
    }

    // Escape cierra, pero sólo si el foco está dentro del bloque o suelto en
    // la página: no debe robarle la tecla a un campo de otra parte.
    function alTeclado(evento) {
      if (!activo) return;
      if (evento.key !== 'Escape' && evento.key !== 'Esc') return;
      var foco = doc.activeElement;
      if (foco && foco !== doc.body && foco !== doc.documentElement && !root.contains(foco)) return;
      cerrar();
    }
    doc.addEventListener('keydown', alTeclado);
    deshacer.push(function () { doc.removeEventListener('keydown', alTeclado); });

    root.classList.add('cod-cuadrantes');
    root.setAttribute('data-cod-cuadrantes-listo', '1');
    deshacer.push(function () {
      root.classList.remove('cod-cuadrantes');
      ['data-cod-cuadrantes-listo', 'data-cod-cuadrantes-estado', 'data-cod-cuadrantes-activo',
        'data-cod-cuadrantes-lado', 'data-cod-cuadrantes-esquina'].forEach(function (nombre) {
        root.removeAttribute(nombre);
      });
    });
    dibujar();

    return function destruir() {
      while (deshacer.length) deshacer.pop()();
    };
  }

  // cuadrantes: monta el bloque sobre cada nodo declarado. Se salta en la vista
  // previa del editor (editorPreview): ahí el bloque debe seguir apilado, con
  // el texto visible y cada imagen seleccionable. Ver montarCuadrantes.
  function installCuadrantesRuntime(win, doc, opts, cleanups) {
    if (opts.editorPreview) return;
    var roots = doc.querySelectorAll('[data-cod-behavior="cuadrantes"]');
    for (var i = 0; i < roots.length; i++) {
      var declared = roots[i].getAttribute(ATTR_BEHAVIOR);
      if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_CUADRANTES) continue;
      var destruir = montarCuadrantes(roots[i], doc);
      if (destruir) cleanups.push(destruir);
    }
  }

  // pestanas: un juego de pestañas sobre un grupo con 2 a 8 hijos. Cada hijo es
  // una pestaña: su PRIMER hijo es la etiqueta (lo que se pincha: un título, un
  // número, un texto) y el RESTO es el panel de contenido. Al cargar queda
  // activa la primera; al pinchar una etiqueta se muestra su panel y se ocultan
  // los demás.
  //
  // MIRADO EN DIVI (módulo Tabs, el que usa econut.cl en sus cifras). Lo que
  // se tomó y lo que no:
  //   - Se tomó la separación en dos mitades: una fila de etiquetas arriba y los
  //     paneles debajo, con exactamente uno visible; las etiquetas de la misma
  //     fila con el mismo alto; el estado activo marcado en la etiqueta (acá con
  //     atributos data-cod-pestanas-*) para que la composición pinte activa e
  //     inactiva como quiera; y abrir una pestaña concreta desde la URL (#id).
  //   - NO se tomó su marcado: Divi usa `<li><a href="#">` sin role, sin
  //     aria-selected y sin teclado (un `<a href="#">` que no navega a ninguna
  //     parte). Acá las etiquetas son `button` reales dentro de un
  //     `role="tablist"`, con roving tabindex, flechas, Inicio y Fin.
  //   - NO se tomó su transición: Divi desvanece el panel viejo (500 ms), lo
  //     oculta, y recién ahí desvanece el nuevo (otros 500 ms), bloquea los
  //     clics mientras dura y NO anima el alto (el contenedor salta de golpe al
  //     alto del panel nuevo, medido en econut.cl). Acá el panel nuevo aparece
  //     de inmediato y el alto del bloque viaja del valor viejo al nuevo.
  //
  // NINGÚN PANEL CAMBIA DE LUGAR EN EL DOM. Cada hijo del grupo se convierte en
  // su panel (role="tabpanel"); la etiqueta se saca de él y se pone, dentro de
  // un `button`, en una lista (role="tablist") que se inserta al principio del
  // grupo. El nodo de la etiqueta viaja entero (con su clase y sus reglas), de
  // modo que la composición le sigue dando su tipografía. Para pintar la
  // etiqueta ACTIVA de otro color, la composición declara una regla con
  // scope.state = "current" sobre ese nodo (el compilador la emite atada a
  // [data-cod-pestanas-estado="activa"]); sin regla propia, el nodo hereda el
  // color del botón. Todo se deshace con la función que retorna.
  //
  // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
  //   raíz:      data-cod-pestanas-listo="1", data-cod-pestanas-activa="1..N"
  //   lista:     data-cod-pestanas-rol="lista"
  //   etiqueta:  data-cod-pestanas-item="n", data-cod-pestanas-rol="etiqueta",
  //              data-cod-pestanas-estado="activa|inactiva"
  //   panel:     data-cod-pestanas-item="n", data-cod-pestanas-rol="panel",
  //              data-cod-pestanas-visible="true|false"
  //
  // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="pestanas") tiene de 2 a
  // 8 hijos y cada uno tiene al menos 2 hijos propios (etiqueta y algo de
  // contenido). Si la forma no calza, no toca nada: el contenido queda apilado
  // y legible.
  //
  // No se monta dentro del editor: allí el bloque debe verse apilado y
  // editable, con todos los paneles a la vista (ver installPestanasRuntime).
  var contadorPestanas = 0;

  function montarPestanas(root, doc) {
    if (root.getAttribute('data-cod-pestanas-listo') === '1') return null;

    var hijos = Array.prototype.slice.call(root.children);
    if (hijos.length < 2 || hijos.length > 8) return null;

    // 1) Reconocer la forma de cada pestaña antes de tocar nada.
    var formas = [];
    for (var i = 0; i < hijos.length; i++) {
      var propios = hijos[i].children;
      if (!propios || propios.length < 2) return null;
      formas.push({ item: hijos[i], etiqueta: propios[0] });
    }

    contadorPestanas += 1;
    var numero = contadorPestanas;
    var win = doc.defaultView || window;
    var deshacer = [];
    var piezas = [];
    var activa = 1; // 1..N

    // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
    function marcar(elemento, nombre, valor) {
      var antes = elemento.getAttribute(nombre);
      elemento.setAttribute(nombre, valor);
      deshacer.push(function () {
        if (antes === null) elemento.removeAttribute(nombre);
        else elemento.setAttribute(nombre, antes);
      });
    }

    // 2) La lista de etiquetas, al principio del grupo.
    var lista = doc.createElement('div');
    lista.className = 'cod-pestanas__lista';
    lista.setAttribute('role', 'tablist');
    lista.setAttribute('data-cod-pestanas-rol', 'lista');
    root.insertBefore(lista, hijos[0]);
    deshacer.push(function () {
      if (lista.parentNode) lista.parentNode.removeChild(lista);
    });

    // 3) Armar cada pestaña: botón con la etiqueta adentro y panel con role.
    formas.forEach(function (forma, indice) {
      var n = indice + 1;
      var panel = forma.item;
      var idPanel = panel.getAttribute('id') || ('cod-pestanas-' + numero + '-panel-' + n);
      var idEtiqueta = 'cod-pestanas-' + numero + '-etiqueta-' + n;

      // El botón recibe el nodo de la etiqueta tal cual, no una copia.
      var boton = doc.createElement('button');
      boton.type = 'button';
      boton.id = idEtiqueta;
      boton.className = 'cod-pestanas__etiqueta';
      boton.setAttribute('role', 'tab');
      boton.setAttribute('aria-controls', idPanel);
      boton.setAttribute('data-cod-pestanas-item', String(n));
      boton.setAttribute('data-cod-pestanas-rol', 'etiqueta');
      boton.appendChild(forma.etiqueta);
      lista.appendChild(boton);
      deshacer.push(function () {
        // La etiqueta vuelve a ser el primer hijo de su pestaña.
        panel.insertBefore(forma.etiqueta, panel.firstChild);
        if (boton.parentNode) boton.parentNode.removeChild(boton);
      });
      boton.addEventListener('click', function () { activar(n, false); });

      // El propio hijo es el panel: conserva su caja y sus reglas.
      panel.classList.add('cod-pestanas__panel');
      marcar(panel, 'id', idPanel);
      marcar(panel, 'role', 'tabpanel');
      marcar(panel, 'aria-labelledby', idEtiqueta);
      marcar(panel, 'data-cod-pestanas-item', String(n));
      marcar(panel, 'data-cod-pestanas-rol', 'panel');
      deshacer.push(function () {
        panel.classList.remove('cod-pestanas__panel');
        panel.removeAttribute('data-cod-pestanas-visible');
        panel.removeAttribute('hidden');
      });

      piezas.push({ boton: boton, panel: panel });
    });

    // 4) Dibujar el estado: todo sale de `activa`, nada se acumula.
    function dibujar() {
      root.setAttribute('data-cod-pestanas-activa', String(activa));
      piezas.forEach(function (pieza, indice) {
        var esActiva = indice + 1 === activa;
        pieza.boton.setAttribute('data-cod-pestanas-estado', esActiva ? 'activa' : 'inactiva');
        pieza.boton.setAttribute('aria-selected', esActiva ? 'true' : 'false');
        // Roving tabindex: al conjunto se entra por la etiqueta activa y de
        // ahí se mueve con las flechas; no son N paradas de tabulación.
        pieza.boton.setAttribute('tabindex', esActiva ? '0' : '-1');
        pieza.panel.setAttribute('data-cod-pestanas-visible', esActiva ? 'true' : 'false');
        if (esActiva) pieza.panel.removeAttribute('hidden');
        else pieza.panel.setAttribute('hidden', '');
      });
    }

    // 5) El alto viaja del valor viejo al nuevo. Sin esto el bloque salta de
    // golpe cuando un panel es más alto que otro (así lo hace Divi). Se fija
    // el alto viejo en línea, se fuerza el reflujo y se pone el nuevo; el CSS
    // del plugin trae la transición (--cod-motion-response) bajo
    // prefers-reduced-motion: no-preference. Si no hay transición (movimiento
    // reducido, o el sitio no declaró el token) el alto queda en `auto` de
    // inmediato: es un estado más, no un error.
    var animando = false;
    var altoEnLinea = '';
    var temporizador = null;

    function terminarAlto() {
      if (temporizador) { win.clearTimeout(temporizador); temporizador = null; }
      root.removeEventListener('transitionend', alTerminarAlto);
      if (!animando) return;
      animando = false;
      root.style.height = altoEnLinea;
      root.removeAttribute('data-cod-pestanas-animando');
    }

    function alTerminarAlto(evento) {
      if (evento.target === root && evento.propertyName === 'height') terminarAlto();
    }

    function animarAlto(antes) {
      var reducido = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducido) return;
      var despues = root.getBoundingClientRect().height;
      if (Math.abs(despues - antes) < 1) return;
      altoEnLinea = root.style.height;
      animando = true;
      root.setAttribute('data-cod-pestanas-animando', '');
      root.style.height = antes + 'px';
      void root.offsetHeight; // reflujo: fija el punto de partida de la transición
      var duraciones = String(win.getComputedStyle(root).transitionDuration || '').split(',');
      var duracion = 0;
      duraciones.forEach(function (d) { duracion = Math.max(duracion, parseFloat(d) || 0); });
      if (!(duracion > 0)) { terminarAlto(); return; }
      root.addEventListener('transitionend', alTerminarAlto);
      root.style.height = despues + 'px';
      // Red de seguridad: si el navegador no emite transitionend, se limpia igual.
      temporizador = win.setTimeout(terminarAlto, Math.round(duracion * 1000) + 150);
    }
    deshacer.push(function () {
      terminarAlto();
    });

    function activar(n, enfocar) {
      if (n >= 1 && n <= piezas.length && n !== activa) {
        // El alto de partida se mide ANTES de tocar nada; si había un viaje a
        // medias, se parte de donde iba.
        var antes = root.getBoundingClientRect().height;
        terminarAlto();
        activa = n;
        root.setAttribute('data-cod-pestanas-cambio', '1');
        dibujar();
        animarAlto(antes);
      }
      if (enfocar && piezas[n - 1]) {
        try { piezas[n - 1].boton.focus({ preventScroll: true }); } catch (e) { piezas[n - 1].boton.focus(); }
      }
    }

    // Teclado (patrón de pestañas con activación automática): flechas mueven
    // y activan, con vuelta al otro extremo; Inicio y Fin van a los extremos.
    // En escritura de derecha a izquierda las flechas se invierten.
    function alTeclado(evento) {
      if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
      var actual = -1;
      for (var k = 0; k < piezas.length; k++) {
        if (piezas[k].boton === evento.target) { actual = k; break; }
      }
      if (actual < 0) return;
      var rtl = String(win.getComputedStyle(root).direction) === 'rtl';
      var tecla = evento.key;
      var destino = -1;
      if (tecla === 'ArrowRight' || tecla === 'Right') destino = actual + (rtl ? -1 : 1);
      else if (tecla === 'ArrowLeft' || tecla === 'Left') destino = actual + (rtl ? 1 : -1);
      else if (tecla === 'Home') destino = 0;
      else if (tecla === 'End') destino = piezas.length - 1;
      else return;
      if (destino < 0) destino = piezas.length - 1;
      if (destino >= piezas.length) destino = 0;
      evento.preventDefault();
      activar(destino + 1, true);
    }
    lista.addEventListener('keydown', alTeclado);
    deshacer.push(function () { lista.removeEventListener('keydown', alTeclado); });

    // Abrir una pestaña desde la URL: #id de su panel (o de su etiqueta). Es lo
    // que hace Divi con sus enlaces #tab-…; sólo actúa si el id existe.
    function porHash() {
      var hash = String((win.location && win.location.hash) || '').replace(/^#/, '');
      if (!hash) return false;
      try { hash = decodeURIComponent(hash); } catch (e) { /* se usa tal cual */ }
      for (var k = 0; k < piezas.length; k++) {
        if (piezas[k].panel.getAttribute('id') === hash || piezas[k].boton.getAttribute('id') === hash) {
          activar(k + 1, false);
          return true;
        }
      }
      return false;
    }
    function alCambiarHash() { porHash(); }
    win.addEventListener('hashchange', alCambiarHash);
    deshacer.push(function () { win.removeEventListener('hashchange', alCambiarHash); });

    root.classList.add('cod-pestanas');
    dibujar();
    porHash();
    marcar(root, 'data-cod-pestanas-listo', '1');
    deshacer.push(function () {
      root.classList.remove('cod-pestanas');
      ['data-cod-pestanas-activa', 'data-cod-pestanas-cambio'].forEach(function (nombre) {
        root.removeAttribute(nombre);
      });
    });

    return function destruir() {
      while (deshacer.length) deshacer.pop()();
    };
  }

  // pestanas: monta el juego sobre cada nodo declarado. Se salta en la vista
  // previa del editor (editorPreview): ahí el bloque debe seguir apilado, con
  // todos los paneles visibles y editables. Ver montarPestanas.
  function installPestanasRuntime(win, doc, opts, cleanups) {
    if (opts.editorPreview) return;
    var roots = doc.querySelectorAll('[data-cod-behavior="pestanas"]');
    for (var i = 0; i < roots.length; i++) {
      var declared = roots[i].getAttribute(ATTR_BEHAVIOR);
      if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_PESTANAS) continue;
      var destruir = montarPestanas(roots[i], doc);
      if (destruir) cleanups.push(destruir);
    }
  }

  // marquesina: una fila de piezas que se desplaza sola, de derecha a izquierda,
  // en bucle continuo y sin controles. Cada hijo del grupo es una pieza (un
  // logo, un sello, una frase). El caso que la pide: los logos de certificación
  // de la landing de Econut.
  //
  // MEDIDO EN ECONUT.CL (viewport 1440x900). Es un Swiper dentro de un módulo de
  // código de Divi, con loop:true, autoplay.delay:0 y speed:8000: un
  // desplazamiento continuo y lento, no de paso en paso; cuatro piezas a la vez
  // desde 1024px, dos entre 480 y 1023px, una en 320px; 60px de separación.
  // De ahí salen los valores por omisión de acá (ocho segundos por pieza).
  //
  // SIN LIBRERÍAS. El plugin no depende de Swiper ni de nadie para esto. El
  // mecanismo es CSS puro (ver marquesina_css en el plugin): la pista lleva el
  // juego de piezas dos veces y una animación de @keyframes la desplaza
  // translateX(-50%), que es la forma estándar de un bucle sin salto visible y
  // sin JavaScript por cuadro. Este runtime sólo arma la estructura:
  //   1) mete las piezas en una pista (data-cod-marquesina-rol="pista");
  //   2) agrega las copias que cierran el bucle (data-cod-marquesina-copia,
  //      aria-hidden, inertes y sin ids, para que nada se duplique ni se repita
  //      para quien lee la página con un lector de pantalla o con el teclado);
  //   3) cuenta cuántas piezas hay en media pista y lo deja en
  //      --cod-marquesina-piezas, de donde el CSS saca la duración (así la
  //      velocidad por pieza no cambia aunque haya más o menos).
  //
  // CUÁNTAS COPIAS. Para que el bucle cierre sin hueco, media pista tiene que
  // medir al menos lo que el contenedor. Cada pieza mide 1/visibles del ancho,
  // así que basta con que media pista tenga `visibles` piezas o más. Con pocas
  // piezas (dos logos y cuatro a la vez) el juego se repite las veces que
  // haga falta. `visibles` es --cod-marquesina-visibles, que el sitio escribe
  // con una regla properties (y que cambia por ancho con el scope.breakpoint de
  // esa regla); al cambiar el tamaño de la ventana se recalcula, y sólo si el
  // resultado cambió se rehacen las copias.
  //
  // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
  //   raíz:   data-cod-marquesina-listo="1"; style --cod-marquesina-piezas
  //   pista:  data-cod-marquesina-rol="pista"
  //   pieza:  data-cod-marquesina-rol="pieza" (los hijos originales y las copias);
  //           las copias además data-cod-marquesina-copia="1" y aria-hidden="true"
  //
  // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="marquesina") tiene de 2 a
  // 24 hijos. Si no calza, no toca nada y las piezas quedan apiladas.
  //
  // No se monta dentro del editor: allí las piezas deben verse apiladas y
  // editables, sin copias que tocar por error (ver installMarquesinaRuntime).
  function montarMarquesina(root, doc) {
    if (root.getAttribute('data-cod-marquesina-listo') === '1') return null;

    var hijos = Array.prototype.slice.call(root.children);
    if (hijos.length < 2 || hijos.length > 24) return null;

    var win = doc.defaultView || window;
    var deshacer = [];
    var VISIBLES_POR_OMISION = 4;
    var MAXIMO_DE_PIEZAS = 240; // techo de seguridad: nunca se duplica más que esto
    var copias = [];
    var juegos = 0; // cuántos juegos completos hay en la pista (el original cuenta)

    // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
    function marcar(elemento, nombre, valor) {
      var antes = elemento.getAttribute(nombre);
      elemento.setAttribute(nombre, valor);
      deshacer.push(function () {
        if (antes === null) elemento.removeAttribute(nombre);
        else elemento.setAttribute(nombre, antes);
      });
    }

    // 1) La pista, al principio del grupo, con los hijos adentro (en su orden).
    var pista = doc.createElement('div');
    pista.className = 'cod-marquesina__pista';
    pista.setAttribute('data-cod-marquesina-rol', 'pista');
    root.insertBefore(pista, hijos[0]);
    hijos.forEach(function (hijo) {
      pista.appendChild(hijo);
      hijo.classList.add('cod-marquesina__pieza');
      marcar(hijo, 'data-cod-marquesina-rol', 'pieza');
    });
    deshacer.push(function () {
      // Las piezas vuelven a ser hijos directos de la raíz, en su orden.
      hijos.forEach(function (hijo) {
        hijo.classList.remove('cod-marquesina__pieza');
        root.insertBefore(hijo, pista);
      });
      if (pista.parentNode) pista.parentNode.removeChild(pista);
    });

    // Una copia no es contenido: sin ids (no se repiten), fuera del árbol de
    // accesibilidad y fuera del recorrido del teclado.
    function copiaDe(original) {
      var copia = original.cloneNode(true);
      copia.removeAttribute('id');
      Array.prototype.forEach.call(copia.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
      copia.setAttribute('aria-hidden', 'true');
      copia.setAttribute('inert', '');
      copia.setAttribute('data-cod-marquesina-copia', '1');
      return copia;
    }

    function visibles() {
      var crudo = '';
      try { crudo = win.getComputedStyle(root).getPropertyValue('--cod-marquesina-visibles'); } catch (e) { /* se usa el valor por omisión */ }
      var n = parseFloat(crudo);
      return n > 0 ? n : VISIBLES_POR_OMISION;
    }

    // 2) Las copias: 2r juegos en total (r en cada mitad), con r lo bastante
    // grande para que media pista llene el ancho.
    function armar() {
      var porMitad = Math.max(1, Math.ceil(visibles() / hijos.length));
      while (porMitad > 1 && porMitad * 2 * hijos.length > MAXIMO_DE_PIEZAS) porMitad -= 1;
      var total = porMitad * 2;
      if (total === juegos) return;
      copias.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
      copias = [];
      for (var k = 1; k < total; k++) {
        hijos.forEach(function (hijo) {
          var copia = copiaDe(hijo);
          pista.appendChild(copia);
          copias.push(copia);
        });
      }
      juegos = total;
      root.style.setProperty('--cod-marquesina-piezas', String(porMitad * hijos.length));
    }
    deshacer.push(function () {
      copias.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
      copias = [];
      root.style.removeProperty('--cod-marquesina-piezas');
      if (root.getAttribute('style') === '') root.removeAttribute('style');
    });

    // 3) Al cambiar el tamaño pueden cambiar las piezas visibles (una regla
    // por breakpoint): se recalcula, con un respiro para no rehacer en cada píxel.
    var temporizador = null;
    function alCambiarTamano() {
      if (temporizador) win.clearTimeout(temporizador);
      temporizador = win.setTimeout(function () { temporizador = null; armar(); }, 150);
    }
    win.addEventListener('resize', alCambiarTamano, { passive: true });
    deshacer.push(function () {
      win.removeEventListener('resize', alCambiarTamano);
      if (temporizador) { win.clearTimeout(temporizador); temporizador = null; }
    });

    root.classList.add('cod-marquesina');
    armar();
    marcar(root, 'data-cod-marquesina-listo', '1');
    deshacer.push(function () { root.classList.remove('cod-marquesina'); });

    return function destruir() {
      while (deshacer.length) deshacer.pop()();
    };
  }

  // marquesina: monta la fila sobre cada nodo declarado. Se salta en la vista
  // previa del editor (editorPreview): ahí las piezas deben seguir apiladas y
  // editables, sin copias. Ver montarMarquesina.
  function installMarquesinaRuntime(win, doc, opts, cleanups) {
    if (opts.editorPreview) return;
    var roots = doc.querySelectorAll('[data-cod-behavior="marquesina"]');
    for (var i = 0; i < roots.length; i++) {
      var declared = roots[i].getAttribute(ATTR_BEHAVIOR);
      if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_MARQUESINA) continue;
      var destruir = montarMarquesina(roots[i], doc);
      if (destruir) cleanups.push(destruir);
    }
  }

  // aviso: una ventana emergente que aparece sola al cargar la página, UNA vez
  // por visitante, y se cierra con la X, con Escape o pinchando el fondo. El
  // caso que la pide: estafadores vendiendo a nombre de una empresa; el sitio
  // tenía una franja de media pantalla que sólo advertía, y hacía falta un aviso
  // que además deje VERIFICAR (las cuentas oficiales enlazadas, adentro).
  //
  // El riesgo de un emergente es volverse más invasivo que lo que reemplaza.
  // Por eso lo que lo hace aceptable es lo que más cuidado tiene acá:
  //   - se cierra de tres maneras (la X, Escape, el fondo) y no vuelve (se
  //     recuerda en el navegador; ver "una vez" abajo);
  //   - NO bloquea la página: no se fija el scroll de atrás, y si este guion
  //     no corre el contenido queda legible en el flujo normal (toda la CSS del
  //     aviso cuelga de la clase .cod-aviso, que sólo pone este guion);
  //   - es accesible de verdad: role="dialog" aria-modal="true" con nombre
  //     (el primer título del aviso, o "Aviso"), el foco entra al panel al
  //     abrir, el teclado no se sale mientras está abierto (Tab y Mayús+Tab dan
  //     la vuelta) y el foco vuelve a donde estaba al cerrar.
  //
  // UNA VEZ POR VISITANTE. Se anota la hora en que se abrió en localStorage
  // (con sessionStorage de respaldo); si el navegador bloquea el almacenamiento
  // (navegación privada, cookies rechazadas) cada lectura y cada escritura va
  // en try/catch y el aviso sigue funcionando: aparece, se puede cerrar, y
  // vuelve en la visita siguiente porque no hay dónde recordarlo. Se anota al
  // ABRIR y no al cerrar: «una vez» es una vez mostrado; si no, quien sigue uno
  // de los enlaces a las cuentas oficiales (que es para lo que está) lo
  // encontraría de nuevo al volver, sin haberlo cerrado.
  //
  // CADA CUÁNTO VUELVE y EL ANCHO MÁXIMO no son parámetros de la regla: vienen
  // de las variables CSS --cod-aviso-vuelve-dias (por omisión 0: una sola vez y
  // no vuelve) y --cod-aviso-ancho-maximo, que se escriben con una regla
  // properties sobre el nodo (así valen por breakpoint como todo lo demás).
  //
  // REABRIR. Si el grupo tiene marcador (id), cualquier enlace a #<id> lo
  // vuelve a abrir aunque ya se haya visto, y entrar con #<id> en la dirección
  // también. Es lo que permite una línea permanente y discreta («cómo verificar
  // nuestras cuentas») sin dejar una franja de media pantalla.
  //
  // ESTRUCTURA QUE ARMA. El grupo pasa a ser la capa fija; adentro, el runtime
  // fabrica el velo (el fondo) y el panel (la ventana), mete en el panel un
  // botón de cierre y le pasa los hijos originales del grupo. Nada se duplica
  // ni se pierde: todo se deshace con la función que retorna.
  //
  // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
  //   raíz:   data-cod-aviso-listo="1", data-cod-aviso-estado="abierto|cerrado"
  //   velo:   data-cod-aviso-rol="velo"   (aria-hidden)
  //   panel:  data-cod-aviso-rol="panel"  (role="dialog" aria-modal="true")
  //   cerrar: data-cod-aviso-rol="cerrar" (button, aria-label="Cerrar aviso")
  //
  // No se monta dentro del editor: allí el grupo debe verse apilado y editable
  // (ver installAvisoRuntime).
  var contadorAvisos = 0;
  var SELECTOR_ENFOCABLES = 'a[href],button,input,select,textarea,summary,iframe,audio[controls],video[controls],[contenteditable=""],[contenteditable="true"],[tabindex]';

  function montarAviso(root, doc) {
    if (root.getAttribute('data-cod-aviso-listo') === '1') return null;

    var hijos = Array.prototype.slice.call(root.children);
    if (hijos.length < 1) return null;

    contadorAvisos += 1;
    var numero = contadorAvisos;
    var win = doc.defaultView || window;
    var deshacer = [];
    var abierto = false;
    var previo = null;
    var forzandoFoco = false;
    var inicioEnFondo = null;

    // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
    function marcar(elemento, nombre, valor) {
      var antes = elemento.getAttribute(nombre);
      elemento.setAttribute(nombre, valor);
      deshacer.push(function () {
        if (antes === null) elemento.removeAttribute(nombre);
        else elemento.setAttribute(nombre, antes);
      });
    }

    // 1) Las tres partes que fabrica el runtime.
    var velo = doc.createElement('div');
    velo.className = 'cod-aviso__velo';
    velo.setAttribute('data-cod-aviso-rol', 'velo');
    velo.setAttribute('aria-hidden', 'true');

    var panel = doc.createElement('div');
    panel.className = 'cod-aviso__panel';
    panel.setAttribute('data-cod-aviso-rol', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('tabindex', '-1');

    var cerrarBoton = doc.createElement('button');
    cerrarBoton.type = 'button';
    cerrarBoton.className = 'cod-aviso__cerrar';
    cerrarBoton.setAttribute('data-cod-aviso-rol', 'cerrar');
    cerrarBoton.setAttribute('aria-label', 'Cerrar aviso');
    // La X es un SVG con trazo currentColor: toma el color del botón y no
    // trae ningún color propio. Se fabrica con createElementNS, no con
    // innerHTML, para no interpretar texto como marcado.
    var ns = 'http://www.w3.org/2000/svg';
    var equis = doc.createElementNS(ns, 'svg');
    equis.setAttribute('viewBox', '0 0 24 24');
    equis.setAttribute('aria-hidden', 'true');
    equis.setAttribute('focusable', 'false');
    var trazo = doc.createElementNS(ns, 'path');
    trazo.setAttribute('d', 'M5 5L19 19M19 5L5 19');
    trazo.setAttribute('fill', 'none');
    trazo.setAttribute('stroke', 'currentColor');
    trazo.setAttribute('stroke-width', '2');
    trazo.setAttribute('stroke-linecap', 'round');
    equis.appendChild(trazo);
    cerrarBoton.appendChild(equis);

    // El nombre de la ventana: su primer título; si no hay, "Aviso".
    var titulo = null;
    for (var i = 0; i < hijos.length && !titulo; i++) {
      var tag = String(hijos[i].tagName || '').toLowerCase();
      titulo = /^h[1-6]$/.test(tag) ? hijos[i] : (hijos[i].querySelector ? hijos[i].querySelector('h1,h2,h3,h4,h5,h6') : null);
    }
    if (titulo) {
      var idTitulo = titulo.getAttribute('id');
      if (!idTitulo) {
        idTitulo = 'cod-aviso-' + numero + '-titulo';
        marcar(titulo, 'id', idTitulo);
      }
      panel.setAttribute('aria-labelledby', idTitulo);
    } else {
      panel.setAttribute('aria-label', 'Aviso');
    }

    // 2) Armar: el botón primero en el panel, después los hijos originales.
    panel.appendChild(cerrarBoton);
    hijos.forEach(function (hijo) { panel.appendChild(hijo); });
    root.appendChild(velo);
    root.appendChild(panel);
    deshacer.push(function () {
      // Los hijos vuelven al grupo, en su orden original.
      hijos.forEach(function (hijo) { root.appendChild(hijo); });
      if (velo.parentNode) velo.parentNode.removeChild(velo);
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    });

    // 3) Una vez por visitante. Cada acceso al almacenamiento puede lanzar
    // (SecurityError en navegación privada o con cookies rechazadas, o incluso
    // sólo al LEER window.localStorage): todo va en try/catch y un fallo se
    // trata como «no hay memoria», nunca como un error del aviso.
    var clave = 'cod-aviso:' + (root.getAttribute('data-cod-node') || root.getAttribute('id') || String(numero));

    function leerVisto() {
      var visto = null;
      ['localStorage', 'sessionStorage'].forEach(function (nombre) {
        try {
          var n = parseInt(win[nombre].getItem(clave), 10);
          if (isFinite(n) && (visto === null || n > visto)) visto = n;
        } catch (e) { /* sin almacenamiento: es como no haberlo visto */ }
      });
      return visto;
    }

    function recordarVisto() {
      var ahora = String(Date.now());
      try {
        win.localStorage.setItem(clave, ahora);
      } catch (e) {
        try { win.sessionStorage.setItem(clave, ahora); } catch (e2) { /* sin dónde recordar */ }
      }
    }

    // Cada cuántos días vuelve. 0 (o nada, o algo que no es un número): una
    // sola vez. Sale de la variable CSS, que puede variar por ancho.
    function diasParaVolver() {
      var crudo = '';
      try { crudo = win.getComputedStyle(root).getPropertyValue('--cod-aviso-vuelve-dias'); } catch (e) { /* se usa el valor por omisión */ }
      var dias = parseFloat(crudo);
      if (!isFinite(dias) || dias <= 0) return 0;
      return Math.min(dias, 3650);
    }

    function debeAparecer() {
      var visto = leerVisto();
      if (visto === null) return true;
      var dias = diasParaVolver();
      if (dias <= 0) return false;
      var ahora = Date.now();
      // Un reloj corrido hacia atrás no debe silenciarlo para siempre.
      if (visto > ahora) return false;
      return ahora - visto >= dias * 86400000;
    }

    // 4) Foco: adentro mientras está abierto, y de vuelta al cerrar.
    function enfocables() {
      var candidatos = panel.querySelectorAll(SELECTOR_ENFOCABLES);
      var lista = [];
      for (var k = 0; k < candidatos.length; k++) {
        var el = candidatos[k];
        if (el.tabIndex < 0 || el.disabled) continue;
        if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
        if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) continue;
        var visibilidad = '';
        try { visibilidad = win.getComputedStyle(el).visibility; } catch (e) { /* se da por visible */ }
        if (visibilidad === 'hidden') continue;
        lista.push(el);
      }
      return lista;
    }

    function enfocar(elemento) {
      try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
    }

    function alTeclado(evento) {
      if (!abierto) return;
      var tecla = evento.key;
      if (tecla === 'Escape' || tecla === 'Esc') {
        evento.preventDefault();
        cerrar();
        return;
      }
      if (tecla !== 'Tab' || evento.altKey || evento.ctrlKey || evento.metaKey) return;
      var lista = enfocables();
      if (!lista.length) {
        evento.preventDefault();
        enfocar(panel);
        return;
      }
      var primero = lista[0];
      var ultimo = lista[lista.length - 1];
      var activo = doc.activeElement;
      var dentro = activo && panel.contains(activo);
      if (evento.shiftKey) {
        if (!dentro || activo === panel || activo === primero) {
          evento.preventDefault();
          enfocar(ultimo);
        }
      } else if (!dentro || activo === ultimo) {
        evento.preventDefault();
        enfocar(primero);
      }
    }

    // Si el foco llega a algún sitio fuera del aviso (un clic en el navegador,
    // un script ajeno), se trae de vuelta. La bandera evita que dos guiones que
    // atrapan el foco se pasen la pelota sin fin.
    function alEnfocar(evento) {
      if (!abierto || forzandoFoco) return;
      if (evento.target && root.contains(evento.target)) return;
      forzandoFoco = true;
      try { enfocar(panel); } finally { forzandoFoco = false; }
    }

    function devolverFoco() {
      var destino = previo;
      previo = null;
      if (!destino || destino === doc.body || destino === doc.documentElement) return;
      if (typeof destino.focus !== 'function' || !doc.documentElement.contains(destino)) return;
      enfocar(destino);
    }

    // 5) Abrir y cerrar.
    function estaPedidoPorLaUrl() {
      var nombre = root.getAttribute('id');
      return !!nombre && String((win.location && win.location.hash) || '').replace(/^#/, '') === nombre;
    }

    function abrir() {
      if (abierto) return;
      abierto = true;
      var activo = doc.activeElement;
      previo = activo && !root.contains(activo) ? activo : null;
      root.setAttribute('data-cod-aviso-estado', 'abierto');
      recordarVisto();
      doc.addEventListener('keydown', alTeclado, true);
      doc.addEventListener('focusin', alEnfocar, true);
      enfocar(panel);
    }

    function cerrar() {
      if (!abierto) return;
      abierto = false;
      root.setAttribute('data-cod-aviso-estado', 'cerrado');
      doc.removeEventListener('keydown', alTeclado, true);
      doc.removeEventListener('focusin', alEnfocar, true);
      // Si se llegó por la dirección, se limpia al cerrar: recargar no debe
      // reabrir lo que la persona acaba de cerrar. Por replaceState y no por
      // location.hash = '', que deja un '#' colgando y hace saltar la página.
      if (estaPedidoPorLaUrl() && win.history && win.history.replaceState) {
        try { win.history.replaceState(null, '', win.location.pathname + win.location.search); } catch (e) { /* no se limpia la dirección */ }
      }
      devolverFoco();
    }

    cerrarBoton.addEventListener('click', cerrar);

    // Pinchar el fondo cierra. Se exige que el gesto HAYA EMPEZADO en el fondo:
    // arrastrar para seleccionar texto del panel y soltar fuera genera un clic
    // sobre la capa, y eso no es pedir que se cierre.
    function alPresionar(evento) {
      inicioEnFondo = evento.target === root || evento.target === velo;
    }
    function alPinchar(evento) {
      var empezoAhi = inicioEnFondo === null ? true : inicioEnFondo;
      inicioEnFondo = null;
      if (empezoAhi && (evento.target === root || evento.target === velo)) cerrar();
    }
    root.addEventListener('pointerdown', alPresionar);
    root.addEventListener('click', alPinchar);

    // Reabrir: un enlace a #<id> del grupo, o la dirección con ese #.
    function alPincharEnlace(evento) {
      var nombre = root.getAttribute('id');
      if (!nombre || !evento.target || typeof evento.target.closest !== 'function') return;
      var enlace = evento.target.closest('a[href]');
      if (!enlace || root.contains(enlace) || enlace.hash !== '#' + nombre) return;
      if (enlace.pathname !== win.location.pathname || enlace.host !== win.location.host) return;
      evento.preventDefault();
      abrir();
    }
    function alCambiarHash() { if (estaPedidoPorLaUrl()) abrir(); }
    doc.addEventListener('click', alPincharEnlace);
    win.addEventListener('hashchange', alCambiarHash);

    deshacer.push(function () {
      cerrarBoton.removeEventListener('click', cerrar);
      root.removeEventListener('pointerdown', alPresionar);
      root.removeEventListener('click', alPinchar);
      doc.removeEventListener('click', alPincharEnlace);
      win.removeEventListener('hashchange', alCambiarHash);
      doc.removeEventListener('keydown', alTeclado, true);
      doc.removeEventListener('focusin', alEnfocar, true);
      abierto = false;
    });

    root.classList.add('cod-aviso');
    root.setAttribute('data-cod-aviso-estado', 'cerrado');
    marcar(root, 'data-cod-aviso-listo', '1');
    deshacer.push(function () {
      root.classList.remove('cod-aviso');
      root.removeAttribute('data-cod-aviso-estado');
    });

    if (estaPedidoPorLaUrl() || debeAparecer()) abrir();

    return function destruir() {
      while (deshacer.length) deshacer.pop()();
    };
  }

  // aviso: monta la ventana sobre cada nodo declarado. Se salta en la vista
  // previa del editor (editorPreview): ahí el grupo debe seguir apilado y
  // editable, con su contenido a la vista. Ver montarAviso.
  function installAvisoRuntime(win, doc, opts, cleanups) {
    if (opts.editorPreview) return;
    var roots = doc.querySelectorAll('[data-cod-behavior="aviso"]');
    for (var i = 0; i < roots.length; i++) {
      var declared = roots[i].getAttribute(ATTR_BEHAVIOR);
      if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_AVISO) continue;
      var destruir = montarAviso(roots[i], doc);
      if (destruir) cleanups.push(destruir);
    }
  }

  // mapa: un mini mapa que, al pincharlo, despliega uno grande con un marcador. El
  // caso que lo pide: el pie del sitio de Econut, que lo resolvía con JavaScript
  // pegado a mano en el tema (con un recuadro «×» y Mapbox cargado en CADA visita
  // para pintar un cuadrado de 60x60). Acá el guion vive en el plugin, con
  // pruebas, y la página sólo declara los datos.
  //
  // QUÉ ES CADA COSA, y por qué está repartido así:
  //   - El MINI es una imagen del propio sitio (un archivo generado una vez con
  //     scripts/generar-mini-mapa.mjs). La pone el COMPILADOR, no este guion: un
  //     <a><img> que sin JavaScript lleva a «cómo llegar» (OpenStreetMap). Por eso
  //     se ve sin clave, sin red hacia afuera y sin guion, y no consume cuota ni
  //     entra al consentimiento de cookies: no hay petición a un tercero mientras
  //     nadie abra el mapa. Este guion sólo cambia ese enlace por un botón.
  //   - El MAPA GRANDE sí es Mapbox GL, que se descarga de un tercero (unos 700 KB
  //     más su hoja) SÓLO la primera vez que alguien lo abre; las siguientes ya
  //     está. Nunca al cargar la página. Mientras llega se dice «Cargando el
  //     mapa…»; si no llega (sin red, bloqueado, clave rechazada, sin WebGL) se
  //     dice, y se ofrece el enlace a «cómo llegar» como salida: nunca un recuadro
  //     gris para siempre.
  //   - La CLAVE no está en la página guardada: el servidor la pone al mostrarla
  //     (data-cod-mapa-token) desde Configuración → Mapa (Mapbox). Sin ese
  //     atributo (no hay clave) este guion no monta nada y el mini queda como
  //     enlace: no se ofrece abrir lo que no se puede abrir.
  //
  // ATRIBUTOS QUE LEE (los pone el compilador y el servidor):
  //   raíz: data-cod-mapa-lat, -lng, -zoom, -globo, -globo-enlace-texto,
  //         -globo-enlace-href, -marcador, -token
  //   mini: [data-cod-mapa-rol="mini"] (el <a> con la <img>; sin él no se monta)
  // ATRIBUTOS QUE EMITE:
  //   raíz:   data-cod-mapa-listo="1", data-cod-mapa-estado="abierto|cerrado"
  //   mini:   botón con data-cod-mapa-rol="mini", aria-expanded, aria-controls
  //   grande: data-cod-mapa-rol="grande" (role="region"), aria-busy mientras carga
  //   cerrar: data-cod-mapa-rol="cerrar" (botón, aria-label="Cerrar el mapa")
  //
  // ACCESIBLE. El mini es un botón de verdad (Enter y Espacio, alcanzable con Tab,
  // aria-expanded). El mapa grande NO atrapa el foco: al abrir el foco pasa a la X
  // (el mini desaparece y el foco no puede quedarse en el aire), y Escape o la X lo
  // cierran y devuelven el foco al mini. El desplazamiento hacia el mapa respeta
  // prefers-reduced-motion: con movimiento reducido salta sin animar.
  //
  // MAPBOX GL se carga con las versiones fijas de abajo. No lleva integridad
  // (SRI): el sitio de Mapbox no la publica para cada versión y un hash equivocado
  // dejaría el mapa roto; se anota como pendiente en el CHANGELOG.
  //
  // No se monta dentro del editor: allí el grupo debe verse apilado y editable.
  var contadorMapas = 0;
  var MAPBOX_GL_VERSION = '2.14.1';
  var MAPBOX_GL_JS = 'https://api.mapbox.com/mapbox-gl-js/v' + MAPBOX_GL_VERSION + '/mapbox-gl.js';
  var MAPBOX_GL_CSS = 'https://api.mapbox.com/mapbox-gl-js/v' + MAPBOX_GL_VERSION + '/mapbox-gl.css';
  var MAPBOX_GL_ESPERA_MS = 20000;
  // Estado de la descarga de Mapbox GL, compartido por todos los mapas de la
  // página: se descarga una vez y a quien llegue después se le avisa al terminar.
  var cargaMapbox = null;

  // La misma dirección que arma el servidor para el enlace del mini (COD_Mapa::url_como_llegar).
  function urlComoLlegarMapa(lat, lng, zoom) {
    var la = String(Number(lat.toFixed(6)));
    var lo = String(Number(lng.toFixed(6)));
    return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=' + Math.round(zoom) + '/' + la + '/' + lo;
  }

  // Pide Mapbox GL (la hoja y el guion) y llama a alListo(gl) o a alFallar(). Si ya
  // está en la página (porque otro mapa lo trajo, o porque la página lo tiene),
  // responde sin descargar nada. Si falla, se olvida la descarga para que un
  // segundo intento (pinchar otra vez) vuelva a pedirlo.
  function cargarMapbox(win, doc, alListo, alFallar) {
    if (win.mapboxgl) { alListo(win.mapboxgl); return; }
    if (cargaMapbox && cargaMapbox.win === win) {
      cargaMapbox.esperando.push({ listo: alListo, falla: alFallar });
      return;
    }
    var carga = { win: win, esperando: [{ listo: alListo, falla: alFallar }] };
    cargaMapbox = carga;
    var pendientes = 2;
    var terminada = false;
    var fallo = false;
    var hoja = doc.createElement('link');
    var guion = doc.createElement('script');

    function terminar(ok) {
      if (terminada) return;
      terminada = true;
      try { win.clearTimeout(temporizador); } catch (e) { /* sin temporizador */ }
      if (cargaMapbox === carga) cargaMapbox = null;
      if (!ok) {
        fallo = true;
        [hoja, guion].forEach(function (nodo) { if (nodo.parentNode) nodo.parentNode.removeChild(nodo); });
        // Si el guion llegó pero la hoja no (o al revés), la librería quedó puesta a
        // medias: se retira también, o un reintento la encontraría ya ahí y dibujaría
        // un mapa sin su hoja. Es segura de borrar: si estaba antes, no se descargó.
        try { delete win.mapboxgl; } catch (e) { win.mapboxgl = undefined; }
      }
      var gl = win.mapboxgl;
      carga.esperando.forEach(function (espera) {
        try { if (ok && gl) espera.listo(gl); else espera.falla(); } catch (e) { /* un oyente roto no debe tumbar a los demás */ }
      });
    }
    function uno() {
      pendientes -= 1;
      if (pendientes === 0) terminar(!!win.mapboxgl);
    }
    var temporizador = win.setTimeout(function () { terminar(false); }, MAPBOX_GL_ESPERA_MS);

    hoja.rel = 'stylesheet';
    hoja.href = MAPBOX_GL_CSS;
    hoja.setAttribute('data-cod-mapa-gl', 'hoja');
    hoja.onload = uno;
    hoja.onerror = function () { terminar(false); };
    guion.async = true;
    guion.src = MAPBOX_GL_JS;
    guion.setAttribute('data-cod-mapa-gl', 'guion');
    // Un guion que llega DESPUÉS de haberse dado la descarga por fallida (la hoja falló primero,
    // o se agotó la espera) no debe dejar la librería puesta: se retira apenas aparece.
    guion.onload = function () {
      if (fallo) { try { delete win.mapboxgl; } catch (e) { win.mapboxgl = undefined; } return; }
      uno();
    };
    guion.onerror = function () { terminar(false); };
    (doc.head || doc.documentElement).appendChild(hoja);
    (doc.head || doc.documentElement).appendChild(guion);
  }

  function montarMapa(root, doc) {
    if (root.getAttribute('data-cod-mapa-listo') === '1') return null;

    // Sin clave, sin datos o sin el mini del compilador no hay nada que montar: el
    // mini sigue siendo un enlace a «cómo llegar» y la dirección escrita sigue a la vista.
    var token = root.getAttribute('data-cod-mapa-token');
    var lat = parseFloat(root.getAttribute('data-cod-mapa-lat'));
    var lng = parseFloat(root.getAttribute('data-cod-mapa-lng'));
    var zoomCrudo = parseFloat(root.getAttribute('data-cod-mapa-zoom'));
    var zoom = isFinite(zoomCrudo) && zoomCrudo >= 0 && zoomCrudo <= 22 ? zoomCrudo : 17;
    if (!token || !isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    var enlaceMini = null;
    for (var c = 0; c < root.children.length && !enlaceMini; c++) {
      if (root.children[c].getAttribute('data-cod-mapa-rol') === 'mini') enlaceMini = root.children[c];
    }
    if (!enlaceMini) return null;

    contadorMapas += 1;
    var numero = contadorMapas;
    var win = doc.defaultView || window;
    var deshacer = [];
    var abierto = false;
    var generacion = 0; // cada apertura es una; una respuesta tardía de una anterior no hace nada
    var mapa = null;
    var temporizadorMapa = null;
    var comoLlegar = urlComoLlegarMapa(lat, lng, zoom);

    // 1) El mini: el enlace del compilador se cambia por un botón con la MISMA imagen.
    var imagen = enlaceMini.querySelector('img');
    var nombre = (imagen && imagen.getAttribute('alt')) || 'Abrir el mapa de ubicación';
    var idGrande = 'cod-mapa-' + numero + '-grande';
    var boton = doc.createElement('button');
    boton.type = 'button';
    boton.className = 'cod-mapa__mini';
    boton.setAttribute('data-cod-mapa-rol', 'mini');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', idGrande);
    boton.setAttribute('aria-label', nombre);
    if (imagen) boton.appendChild(imagen);
    root.insertBefore(boton, enlaceMini);
    root.removeChild(enlaceMini);
    deshacer.push(function () {
      if (imagen) enlaceMini.appendChild(imagen);
      root.insertBefore(enlaceMini, boton);
      if (boton.parentNode) boton.parentNode.removeChild(boton);
    });

    // 2) El recuadro del mapa grande, cerrado, al final del grupo.
    var grande = doc.createElement('div');
    grande.id = idGrande;
    grande.className = 'cod-mapa__grande';
    grande.setAttribute('data-cod-mapa-rol', 'grande');
    grande.setAttribute('role', 'region');
    grande.setAttribute('aria-label', 'Mapa de ubicación');
    grande.hidden = true;

    var lienzo = doc.createElement('div');
    lienzo.className = 'cod-mapa__lienzo';

    var aviso = doc.createElement('div');
    aviso.className = 'cod-mapa__estado';
    aviso.setAttribute('role', 'status');
    aviso.hidden = true;

    var cerrarBoton = doc.createElement('button');
    cerrarBoton.type = 'button';
    cerrarBoton.className = 'cod-mapa__cerrar';
    cerrarBoton.setAttribute('data-cod-mapa-rol', 'cerrar');
    cerrarBoton.setAttribute('aria-label', 'Cerrar el mapa');
    // La X es un SVG con trazo currentColor: toma el color del botón y no trae ningún
    // color propio. Se fabrica con createElementNS, no con innerHTML.
    var ns = 'http://www.w3.org/2000/svg';
    var equis = doc.createElementNS(ns, 'svg');
    equis.setAttribute('viewBox', '0 0 24 24');
    equis.setAttribute('aria-hidden', 'true');
    equis.setAttribute('focusable', 'false');
    var trazo = doc.createElementNS(ns, 'path');
    trazo.setAttribute('d', 'M5 5L19 19M19 5L5 19');
    trazo.setAttribute('fill', 'none');
    trazo.setAttribute('stroke', 'currentColor');
    trazo.setAttribute('stroke-width', '2');
    trazo.setAttribute('stroke-linecap', 'round');
    equis.appendChild(trazo);
    cerrarBoton.appendChild(equis);

    grande.appendChild(lienzo);
    grande.appendChild(aviso);
    grande.appendChild(cerrarBoton);
    root.appendChild(grande);
    deshacer.push(function () { if (grande.parentNode) grande.parentNode.removeChild(grande); });

    function enfocar(elemento) {
      try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
    }

    // 3) Los mensajes del recuadro. Todo es texto (textContent); nada se interpreta como HTML.
    function decir(texto, conSalida) {
      while (aviso.firstChild) aviso.removeChild(aviso.firstChild);
      var linea = doc.createElement('p');
      linea.textContent = texto;
      aviso.appendChild(linea);
      if (conSalida) {
        var salida = doc.createElement('a');
        salida.href = comoLlegar;
        salida.target = '_blank';
        salida.rel = 'noopener noreferrer';
        salida.textContent = 'Cómo llegar';
        aviso.appendChild(salida);
      }
      aviso.hidden = false;
    }

    function fallar(motivo) {
      grande.setAttribute('aria-busy', 'false');
      decir(motivo || 'No se pudo cargar el mapa.', true);
    }

    // 4) El mapa de Mapbox, con el marcador y el globo.
    function contenidoDelGlobo() {
      var caja = doc.createElement('div');
      var texto = doc.createElement('p');
      texto.textContent = root.getAttribute('data-cod-mapa-globo') || '';
      caja.appendChild(texto);
      var textoEnlace = root.getAttribute('data-cod-mapa-globo-enlace-texto');
      var hrefEnlace = root.getAttribute('data-cod-mapa-globo-enlace-href');
      if (textoEnlace && hrefEnlace) {
        var enlace = doc.createElement('a');
        enlace.href = hrefEnlace;
        // Un enlace de verdad, pero sólo a destinos que no ejecutan nada: nunca javascript: ni data:.
        if (/^(https?:|mailto:|tel:)$/i.test(enlace.protocol)) {
          enlace.textContent = textoEnlace;
          if (enlace.host && enlace.host !== (win.location && win.location.host)) {
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
          }
          var parrafo = doc.createElement('p');
          parrafo.appendChild(enlace);
          caja.appendChild(parrafo);
        }
      }
      return caja;
    }

    function dibujar(gl, miGeneracion) {
      if (!abierto || miGeneracion !== generacion) return;
      var listo = false;
      try {
        if (typeof gl.supported === 'function' && !gl.supported()) {
          fallar('Este navegador no puede dibujar el mapa.');
          return;
        }
        gl.accessToken = token;
        mapa = new gl.Map({
          container: lienzo,
          style: 'mapbox://styles/mapbox/streets-v11',
          center: [lng, lat],
          zoom: zoom,
        });
        // La atribución de Mapbox y de OpenStreetMap queda en su sitio: acá es donde se
        // usa el mapa de verdad y hay espacio. Los términos de Mapbox la exigen.
        mapa.addControl(new gl.NavigationControl(), 'top-left');

        var imagenMarcador = root.getAttribute('data-cod-mapa-marcador');
        var marcador;
        if (imagenMarcador) {
          var pin = doc.createElement('img');
          pin.src = imagenMarcador;
          pin.alt = '';
          pin.style.setProperty('width', '50px');
          pin.style.setProperty('height', 'auto');
          marcador = new gl.Marker({ element: pin, anchor: 'bottom' });
        } else {
          marcador = new gl.Marker();
        }
        marcador.setLngLat([lng, lat]);
        // El globo es texto: setDOMContent con nodos fabricados arriba, nunca setHTML.
        var globo = new gl.Popup({ offset: 25 });
        globo.setDOMContent(contenidoDelGlobo());
        marcador.setPopup(globo);
        marcador.addTo(mapa);
        marcador.togglePopup();

        mapa.on('load', function () {
          if (miGeneracion !== generacion) return;
          listo = true;
          win.clearTimeout(temporizadorMapa);
          aviso.hidden = true;
          grande.setAttribute('aria-busy', 'false');
        });
        // Una clave rechazada o un estilo que no llega aparecen como error ANTES de
        // cargar: se dice en vez de dejar el recuadro en blanco.
        mapa.on('error', function (evento) {
          if (miGeneracion !== generacion || listo) return;
          var estado = evento && evento.error && evento.error.status;
          win.clearTimeout(temporizadorMapa);
          fallar(estado === 401 || estado === 403
            ? 'Mapbox rechazó la clave del sitio.'
            : 'No se pudo cargar el mapa.');
        });
        temporizadorMapa = win.setTimeout(function () {
          if (miGeneracion === generacion && !listo) fallar('El mapa tarda demasiado en cargar.');
        }, MAPBOX_GL_ESPERA_MS);
      } catch (e) {
        fallar('No se pudo cargar el mapa.');
      }
    }

    function destruirMapa() {
      win.clearTimeout(temporizadorMapa);
      if (mapa) {
        try { mapa.remove(); } catch (e) { /* ya no estaba */ }
        mapa = null;
      }
      while (lienzo.firstChild) lienzo.removeChild(lienzo.firstChild);
    }

    // 5) Abrir y cerrar.
    function irAlMapa() {
      var reducido = false;
      try { reducido = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* se anima */ }
      try {
        grande.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'nearest' });
      } catch (e) {
        grande.scrollIntoView(false);
      }
    }

    function abrir() {
      if (abierto) return;
      abierto = true;
      generacion += 1;
      var miGeneracion = generacion;
      root.setAttribute('data-cod-mapa-estado', 'abierto');
      boton.setAttribute('aria-expanded', 'true');
      grande.hidden = false;
      grande.setAttribute('aria-busy', 'true');
      decir('Cargando el mapa…', false);
      enfocar(cerrarBoton);
      irAlMapa();
      cargarMapbox(win, doc, function (gl) { dibujar(gl, miGeneracion); }, function () {
        if (abierto && miGeneracion === generacion) fallar('No se pudo cargar el mapa.');
      });
    }

    function cerrar() {
      if (!abierto) return;
      abierto = false;
      generacion += 1;
      destruirMapa();
      root.setAttribute('data-cod-mapa-estado', 'cerrado');
      boton.setAttribute('aria-expanded', 'false');
      grande.hidden = true;
      aviso.hidden = true;
      // El mini volvió a mostrarse: el foco vuelve a él, que es de donde se abrió.
      enfocar(boton);
    }

    function alPinchar() { if (abierto) cerrar(); else abrir(); }
    // Escape cierra desde dentro del mapa. No hay trampa de foco: el mapa grande es un
    // contenido más de la página, no una ventana.
    function alTeclado(evento) {
      if (!abierto) return;
      if (evento.key === 'Escape' || evento.key === 'Esc') {
        evento.preventDefault();
        cerrar();
      }
    }
    boton.addEventListener('click', alPinchar);
    cerrarBoton.addEventListener('click', cerrar);
    grande.addEventListener('keydown', alTeclado);
    deshacer.push(function () {
      boton.removeEventListener('click', alPinchar);
      cerrarBoton.removeEventListener('click', cerrar);
      grande.removeEventListener('keydown', alTeclado);
      generacion += 1;
      abierto = false;
      destruirMapa();
    });

    root.classList.add('cod-mapa');
    root.setAttribute('data-cod-mapa-estado', 'cerrado');
    root.setAttribute('data-cod-mapa-listo', '1');
    deshacer.push(function () {
      root.classList.remove('cod-mapa');
      root.removeAttribute('data-cod-mapa-estado');
      root.removeAttribute('data-cod-mapa-listo');
    });

    return function destruir() {
      while (deshacer.length) deshacer.pop()();
    };
  }

  // mapa: monta el mini y el mapa grande sobre cada nodo declarado. Se salta en la
  // vista previa del editor (editorPreview): ahí el grupo debe seguir apilado y
  // editable. Ver montarMapa.
  function installMapaRuntime(win, doc, opts, cleanups) {
    if (opts.editorPreview) return;
    var roots = doc.querySelectorAll('[data-cod-behavior="mapa"]');
    for (var i = 0; i < roots.length; i++) {
      var declared = roots[i].getAttribute(ATTR_BEHAVIOR);
      if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_MAPA) continue;
      var destruir = montarMapa(roots[i], doc);
      if (destruir) cleanups.push(destruir);
    }
  }

  // parcel-map: los datos de cada lote son atributos en el propio elemento
  // (data-cod-parcel-estado / data-cod-parcel-valor), no JSON en el root.
  function installParcelMapRuntime(win, doc, opts, cleanups) {
    var roots = doc.querySelectorAll('[data-cod-behavior="parcel-map"]');
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_PARCEL_MAP) return;

        var itemSelector = parseClass(root.getAttribute(ATTR_PARCEL_ITEM_SELECTOR), DEFAULT_PARCEL_ITEM_SELECTOR);
        var idAttr = parseClass(root.getAttribute(ATTR_PARCEL_ID_ATTR), DEFAULT_PARCEL_ID_ATTR);
        var superficie = parseClass(root.getAttribute(ATTR_PARCEL_SUPERFICIE), DEFAULT_PARCEL_SUPERFICIE);
        var accentDisponible = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_DISPONIBLE), DEFAULT_PARCEL_ACCENT_DISPONIBLE);
        var accentVendido = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_VENDIDO), DEFAULT_PARCEL_ACCENT_VENDIDO);
        var accentEmpty = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_EMPTY), DEFAULT_PARCEL_ACCENT_EMPTY);

        function bySelector(attr) {
          var selector = String(root.getAttribute(attr) || '').trim();
          if (!selector) return null;
          try { return doc.querySelector(selector); } catch (e) { return null; }
        }
        var panel = bySelector(ATTR_PARCEL_PANEL);
        var accent = bySelector(ATTR_PARCEL_ACCENT);
        var fieldN = bySelector(ATTR_PARCEL_FIELD_N);
        var fieldEstado = bySelector(ATTR_PARCEL_FIELD_ESTADO);
        var fieldSup = bySelector(ATTR_PARCEL_FIELD_SUP);
        var fieldVal = bySelector(ATTR_PARCEL_FIELD_VAL);
        var countEl = bySelector(ATTR_PARCEL_COUNT);
        var countSecondary = bySelector(ATTR_PARCEL_COUNT_SECONDARY);

        var items = [];
        try { items = Array.prototype.slice.call(root.querySelectorAll(itemSelector)); } catch (e) { return; }
        if (!items.length) return;

        var disponibles = 0;
        items.forEach(function (item) {
          var estado = String(item.getAttribute(ATTR_PARCEL_ESTADO) || '').trim().toLowerCase();
          if (estado === 'disponible') {
            disponibles++;
            item.classList.add('is-disponible');
          } else if (estado === 'vendido') {
            item.classList.add('is-vendido');
          }
        });
        if (countEl) countEl.textContent = disponibles;
        if (countSecondary) countSecondary.textContent = disponibles;

        var pinned = null;
        function render(item) {
          if (!panel) return;
          var estado = String(item.getAttribute(ATTR_PARCEL_ESTADO) || '').trim().toLowerCase();
          var valor = String(item.getAttribute(ATTR_PARCEL_VALOR) || '').trim();
          var esDisponible = estado === 'disponible';
          panel.setAttribute('data-empty', 'false');
          if (accent) accent.style.background = esDisponible ? accentDisponible : accentVendido;
          if (fieldN) fieldN.textContent = String(item.getAttribute(idAttr) || '').trim();
          if (fieldEstado) fieldEstado.textContent = esDisponible ? 'Disponible' : 'Vendida';
          if (fieldSup) fieldSup.textContent = superficie;
          if (fieldVal) fieldVal.textContent = valor ? valor : '—';
        }
        function reset() {
          if (!panel) return;
          panel.setAttribute('data-empty', 'true');
          if (accent) accent.style.background = accentEmpty;
        }

        var listeners = [];
        items.forEach(function (item) {
          function onEnter() { if (!pinned) render(item); }
          function onLeave() { if (!pinned) reset(); }
          function onClick() {
            if (pinned === item) {
              pinned = null;
              item.classList.remove('is-active');
              reset();
              return;
            }
            if (pinned) pinned.classList.remove('is-active');
            pinned = item;
            item.classList.add('is-active');
            render(item);
          }
          item.addEventListener('mouseenter', onEnter);
          item.addEventListener('mouseleave', onLeave);
          item.addEventListener('click', onClick);
          listeners.push(function () {
            item.removeEventListener('mouseenter', onEnter);
            item.removeEventListener('mouseleave', onLeave);
            item.removeEventListener('click', onClick);
          });
        });

        cleanups.push(function () {
          listeners.forEach(function (off) { off(); });
          if (opts.autoRemove) {
            items.forEach(function (item) {
              item.classList.remove('is-active');
              item.classList.remove('is-disponible');
              item.classList.remove('is-vendido');
            });
            reset();
          }
        });
      })(roots[i]);
    }
  }

  // geo-map: pan/zoom tipo "cover" + filtro dependiente Categoría → Lugar.
  // places/categories viajan como JSON en atributos y se parsean con
  // JSON.parse dentro de try/catch; si falla, el comportamiento no arranca.
  function installGeoMapRuntime(win, doc, opts, cleanups) {
    var roots = doc.querySelectorAll('[data-cod-behavior="geo-map"]');
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_GEO_MAP) return;

        var places = parseJsonAttr(root, ATTR_GEO_PLACES);
        var categories = parseJsonAttr(root, ATTR_GEO_CATEGORIES);
        if (!Array.isArray(places) || !places.length) return;
        var categoryLabels = (categories && typeof categories === 'object') ? categories : {};

        function bySelector(attr) {
          var selector = String(root.getAttribute(attr) || '').trim();
          if (!selector) return null;
          try { return doc.querySelector(selector); } catch (e) { return null; }
        }
        var svg = bySelector(ATTR_GEO_SVG);
        var selCat = bySelector(ATTR_GEO_SELECT_CATEGORIA);
        var selLugar = bySelector(ATTR_GEO_SELECT_LUGAR);
        var marker = bySelector(ATTR_GEO_MARKER);
        var panel = bySelector(ATTR_GEO_PANEL);
        var accent = bySelector(ATTR_GEO_ACCENT);
        var fieldNombre = bySelector(ATTR_GEO_FIELD_NOMBRE);
        var fieldCategoria = bySelector(ATTR_GEO_FIELD_CATEGORIA);
        var fieldDistancia = bySelector(ATTR_GEO_FIELD_DISTANCIA);
        var fieldDescripcion = bySelector(ATTR_GEO_FIELD_DESCRIPCION);
        var fieldContacto = bySelector(ATTR_GEO_FIELD_CONTACTO);
        var accentColor = parseClass(root.getAttribute(ATTR_GEO_ACCENT_COLOR), DEFAULT_GEO_ACCENT_COLOR);
        var categoryIcons = parseJsonAttr(root, ATTR_GEO_CATEGORY_ICONS);
        if (!categoryIcons || typeof categoryIcons !== 'object') categoryIcons = {};
        var markerIcon = marker ? marker.querySelector('.cod-geo-map__marker-icon') : null;
        if (!svg) return;

        // cercanía: preferimos minutos si el lugar los trae cargados (la
        // razón de negocio, no técnica: "a 10 km" suena lejos, "a 10 min"
        // suena cerca). Medir en línea recta no sirve para nada real, así
        // que ambos valores se cargan a mano mirando la ruta en Google, tal
        // como ya se hace con nombre/categoría/contacto.
        function formatCercania(lugar) {
          if (lugar.tiempoMin != null && isFinite(Number(lugar.tiempoMin))) return Number(lugar.tiempoMin) + ' min';
          return lugar.dist + ' km';
        }

        var bounds = parseJsonAttr(root, ATTR_GEO_DATA_BOUNDS) || {};
        var DATA = {
          minX: isFinite(Number(bounds.minX)) ? Number(bounds.minX) : -195,
          minY: isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -15,
          maxX: isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : 570,
          maxY: isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 590,
        };
        var initialCenter = parsePoint(root.getAttribute(ATTR_GEO_INITIAL_CENTER), 300, 400);
        var proyecto = parsePoint(root.getAttribute(ATTR_GEO_PROYECTO), 300, 270);
        var minZoomRatio = parseFloat(root.getAttribute(ATTR_GEO_MIN_ZOOM_RATIO));
        if (!isFinite(minZoomRatio) || minZoomRatio <= 0 || minZoomRatio >= 1) minZoomRatio = 0.2;
        var initialZoom = parseFloat(root.getAttribute('data-cod-geo-initial-zoom'));
        if (!isFinite(initialZoom) || initialZoom <= 0 || initialZoom > 1) initialZoom = 1;
        if (initialZoom < minZoomRatio) initialZoom = minZoomRatio;

        var FULL_W = DATA.maxX - DATA.minX;
        var FULL_H = DATA.maxY - DATA.minY;
        var dataAspect = FULL_H / FULL_W;
        var rect0 = root.getBoundingClientRect();
        var containerAspect = (rect0.height && rect0.width) ? rect0.height / rect0.width : dataAspect;

        var view = {};
        if (containerAspect <= dataAspect) {
          view.w = FULL_W;
          view.h = FULL_W * containerAspect;
        } else {
          view.h = FULL_H;
          view.w = FULL_H / containerAspect;
        }
        var MAX_W = view.w;
        var MIN_W = MAX_W * minZoomRatio;
        view.w = MAX_W * initialZoom;
        view.h = view.w * containerAspect;
        view.x = initialCenter.x - view.w / 2;
        view.y = initialCenter.y - view.h / 2;

        function applyView() {
          svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
          svg.style.setProperty('--zoom-k', view.w / MAX_W);
        }
        function clamp1D(size, dataMin, dataMax) {
          var dataSize = dataMax - dataMin;
          if (size >= dataSize) return dataMin - (size - dataSize) / 2;
          return null;
        }
        function clampView() {
          view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));
          view.h = view.w * containerAspect;
          var cx = clamp1D(view.w, DATA.minX, DATA.maxX);
          view.x = cx !== null ? cx : Math.max(DATA.minX, Math.min(DATA.maxX - view.w, view.x));
          var cy = clamp1D(view.h, DATA.minY, DATA.maxY);
          view.y = cy !== null ? cy : Math.max(DATA.minY, Math.min(DATA.maxY - view.h, view.y));
        }
        function panToLugar(px, py) {
          var pad = 1.6;
          var minX = Math.min(px, proyecto.x);
          var maxX = Math.max(px, proyecto.x);
          var minY = Math.min(py, proyecto.y);
          var maxY = Math.max(py, proyecto.y);
          var cx = (minX + maxX) / 2;
          var cy = (minY + maxY) / 2;
          var spanW = Math.max((maxX - minX) * pad, MIN_W);
          var spanH = Math.max((maxY - minY) * pad, MIN_W * containerAspect);
          if (spanH > spanW * containerAspect) { spanW = spanH / containerAspect; } else { spanH = spanW * containerAspect; }
          view.w = spanW;
          view.h = spanH;
          view.x = cx - view.w / 2;
          view.y = cy - view.h / 2;
          clampView();
          applyView();
        }
        applyView();

        var dragging = false;
        var last = null;
        function onPointerDown(e) {
          dragging = true;
          last = { x: e.clientX, y: e.clientY };
          if (e.pointerId != null && typeof root.setPointerCapture === 'function') {
            try { root.setPointerCapture(e.pointerId); } catch (err) {}
          }
          root.classList.add('is-dragging');
        }
        function onPointerMove(e) {
          if (!dragging) return;
          var rect = root.getBoundingClientRect();
          var scale = view.w / rect.width;
          view.x -= (e.clientX - last.x) * scale;
          view.y -= (e.clientY - last.y) * scale;
          last = { x: e.clientX, y: e.clientY };
          clampView();
          applyView();
        }
        function endDrag() {
          dragging = false;
          root.classList.remove('is-dragging');
        }
        function onWheel(e) {
          e.preventDefault();
          var rect = root.getBoundingClientRect();
          var mx = view.x + (e.clientX - rect.left) / rect.width * view.w;
          var my = view.y + (e.clientY - rect.top) / rect.height * view.h;
          var factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
          var newW = Math.max(MIN_W, Math.min(MAX_W, view.w * factor));
          var newH = newW * containerAspect;
          view.x = mx - (mx - view.x) * (newW / view.w);
          view.y = my - (my - view.y) * (newH / view.h);
          view.w = newW;
          view.h = newH;
          clampView();
          applyView();
        }

        root.addEventListener('pointerdown', onPointerDown);
        root.addEventListener('pointermove', onPointerMove);
        root.addEventListener('pointerup', endDrag);
        root.addEventListener('pointerleave', endDrag);
        root.addEventListener('pointercancel', endDrag);
        root.addEventListener('wheel', onWheel, { passive: false });

        function populateLugares(categoria) {
          if (!selLugar) return;
          while (selLugar.firstChild) selLugar.removeChild(selLugar.firstChild);
          var opt0 = doc.createElement('option');
          opt0.value = '';
          opt0.textContent = categoria ? 'Selecciona un lugar' : 'Elige una categoría primero';
          selLugar.appendChild(opt0);
          if (!categoria) {
            selLugar.disabled = true;
            return;
          }
          selLugar.disabled = false;
          function orderKey(lugar) {
            return (lugar.tiempoMin != null && isFinite(Number(lugar.tiempoMin))) ? Number(lugar.tiempoMin) : Number(lugar.dist);
          }
          places
            .filter(function (lugar) { return lugar.categoria === categoria; })
            .sort(function (a, b) { return orderKey(a) - orderKey(b); })
            .forEach(function (lugar) {
              var opt = doc.createElement('option');
              opt.value = lugar.nombre;
              opt.textContent = lugar.nombre + ' · ' + formatCercania(lugar);
              selLugar.appendChild(opt);
            });
        }

        function onCatChange() {
          populateLugares(selCat ? selCat.value : '');
          if (marker) marker.style.display = 'none';
          if (panel) panel.setAttribute('data-empty', 'true');
        }
        function onLugarChange() {
          var nombre = selLugar ? selLugar.value : '';
          var lugar = null;
          for (var j = 0; j < places.length; j++) {
            if (places[j].nombre === nombre) {
              lugar = places[j];
              break;
            }
          }
          if (!lugar) {
            if (marker) marker.style.display = 'none';
            if (panel) panel.setAttribute('data-empty', 'true');
            return;
          }
          if (marker) {
            marker.setAttribute('transform', 'translate(' + lugar.x + ',' + lugar.y + ')');
            marker.style.display = '';
          }
          if (markerIcon) {
            var iconPath = categoryIcons[lugar.categoria];
            if (typeof iconPath === 'string' && iconPath) {
              markerIcon.setAttribute('d', iconPath);
              markerIcon.setAttribute('transform', 'scale(1.3) translate(-12,-12)');
            } else {
              markerIcon.setAttribute('d', DEFAULT_MARKER_PATH);
              markerIcon.removeAttribute('transform');
            }
          }
          panToLugar(lugar.x, lugar.y);
          if (panel) panel.setAttribute('data-empty', 'false');
          if (accent) accent.style.background = accentColor;
          if (fieldNombre) fieldNombre.textContent = lugar.nombre;
          if (fieldCategoria) fieldCategoria.textContent = categoryLabels[lugar.categoria] || lugar.categoria;
          if (fieldDistancia) fieldDistancia.textContent = formatCercania(lugar);
          if (fieldDescripcion) fieldDescripcion.textContent = lugar.descripcionLarga || '';
          if (fieldContacto) fieldContacto.textContent = lugar.contacto || '—';
        }

        if (selCat) selCat.addEventListener('change', onCatChange);
        if (selLugar) selLugar.addEventListener('change', onLugarChange);

        cleanups.push(function () {
          root.removeEventListener('pointerdown', onPointerDown);
          root.removeEventListener('pointermove', onPointerMove);
          root.removeEventListener('pointerup', endDrag);
          root.removeEventListener('pointerleave', endDrag);
          root.removeEventListener('pointercancel', endDrag);
          root.removeEventListener('wheel', onWheel);
          if (selCat) selCat.removeEventListener('change', onCatChange);
          if (selLugar) selLugar.removeEventListener('change', onLugarChange);
          if (opts.autoRemove) root.classList.remove('is-dragging');
        });
      })(roots[i]);
    }
  }

  // hero-collapse: reconstruye el colapso del hero/banner de entrada (desktop).
  // Igual que el script original de Santa Luisa:
  //   - scrollRestoration=manual + scrollTo(0,0) una vez al arrancar;
  //   - histéresis #1 para colapsar/expandir;
  //   - histéresis #2 para cristalizar el nav, encadenada a releaseScrollY
  //     (releaseScrollY es FIJO mientras collapsed=true: COLLAPSE_ON + DWELL);
  //   - alto inline de #heroPin en el colapso y reset a '' al expandir;
  //   - reveal del target una sola vez con setTimeout.
  // La rama mobile/tablet del original NO se replica: si el contexto es
  // mobile/tablet (mismo criterio), update() simplemente no arranca.
  function installHeroCollapseRuntime(win, doc, opts, cleanups) {
    if (win && win.history && 'scrollRestoration' in win.history) {
      win.history.scrollRestoration = 'manual';
    }
    if (typeof win.scrollTo === 'function') {
      win.scrollTo(0, 0);
    }

    var roots = doc.querySelectorAll('[data-cod-behavior="hero-collapse"]');
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_HERO_COLLAPSE) return;

        var collapseOn = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSE_ON), opts.heroCollapseOn);
        var collapseOff = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSE_OFF), opts.heroCollapseOff);
        var dwell = parseThreshold(root.getAttribute(ATTR_HERO_DWELL), opts.heroDwell);
        var collapsedHeight = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSED_HEIGHT), opts.heroCollapsedHeight);
        var revealDelay = parseThreshold(root.getAttribute(ATTR_HERO_REVEAL_DELAY), opts.heroRevealDelay);
        var crystallizeOffset = parseThreshold(root.getAttribute(ATTR_HERO_CRYSTALLIZE_OFFSET), opts.heroCrystallizeOffset);

        var pinSelector = parseClass(root.getAttribute(ATTR_HERO_PIN), opts.heroPinSelector);
        var navSelector = parseClass(root.getAttribute(ATTR_HERO_NAV), opts.heroNavSelector);
        var revealTargetSelector = parseClass(root.getAttribute(ATTR_HERO_REVEAL_TARGET), opts.heroRevealTargetSelector);
        var collapsedClass = parseClass(root.getAttribute(ATTR_HERO_COLLAPSED_CLASS), opts.heroCollapsedClass);
        var bodyClass = parseClass(root.getAttribute(ATTR_HERO_BODY_CLASS), opts.heroBodyClass);
        var crystallizedClass = parseClass(root.getAttribute(ATTR_HERO_CRYSTALLIZED_CLASS), opts.heroCrystallizedClass);
        var handoffClass = parseClass(root.getAttribute(ATTR_HERO_HANDOFF_CLASS), opts.heroHandoffClass);
        var revealedClass = parseClass(root.getAttribute(ATTR_HERO_REVEALED_CLASS), opts.heroRevealedClass);

        function bySelector(selector) {
          var value = String(selector || '').trim();
          if (!value) return null;
          try { return doc.querySelector(value); } catch (e) { return null; }
        }
        var heroPin = bySelector(pinSelector);
        var nav = bySelector(navSelector);
        var revealTarget = bySelector(revealTargetSelector);

        root.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_HERO_COLLAPSE);
        root.setAttribute(ATTR_HERO_PIN, pinSelector);
        root.setAttribute(ATTR_HERO_NAV, navSelector);
        root.setAttribute(ATTR_HERO_REVEAL_TARGET, revealTargetSelector);
        root.setAttribute(ATTR_HERO_COLLAPSE_ON, String(collapseOn));
        root.setAttribute(ATTR_HERO_COLLAPSE_OFF, String(collapseOff));
        root.setAttribute(ATTR_HERO_DWELL, String(dwell));
        root.setAttribute(ATTR_HERO_COLLAPSED_HEIGHT, String(collapsedHeight));
        root.setAttribute(ATTR_HERO_REVEAL_DELAY, String(revealDelay));
        root.setAttribute(ATTR_HERO_CRYSTALLIZE_OFFSET, String(crystallizeOffset));
        root.setAttribute(ATTR_HERO_COLLAPSED_CLASS, collapsedClass);
        root.setAttribute(ATTR_HERO_BODY_CLASS, bodyClass);
        root.setAttribute(ATTR_HERO_CRYSTALLIZED_CLASS, crystallizedClass);
        root.setAttribute(ATTR_HERO_HANDOFF_CLASS, handoffClass);
        root.setAttribute(ATTR_HERO_REVEALED_CLASS, revealedClass);

        var isMobile = false;
        if (typeof win.innerWidth === 'number' && win.innerWidth <= 900) {
          isMobile = true;
        } else if (typeof win.innerWidth === 'number' && typeof win.innerHeight === 'number' && win.innerHeight > 0) {
          isMobile = (win.innerWidth / win.innerHeight) <= (4 / 5);
        }
        if (isMobile) {
          // Rama mobile/tablet: sin colapso de tamaño, pero el nav igual se
          // "cristaliza" y el hero entra en handoff con un umbral simple, sin
          // histéresis — fiel al script original.
          var updateMobile = function () {
            var pastThreshold = win.scrollY > collapseOn;
            if (nav) nav.classList.toggle(crystallizedClass, pastThreshold);
            root.classList.toggle(handoffClass, pastThreshold);
          };
          updateMobile();
          win.addEventListener('scroll', updateMobile, { passive: true });
          cleanups.push(function () {
            win.removeEventListener('scroll', updateMobile);
          });
          return;
        }

        var collapsed = false;
        var crystallized = false;
        var releaseScrollY = null;
        var proyectoRevealed = false;
        var revealTimer = null;

        function readScrollY() {
          if (typeof win.scrollY === 'number') return win.scrollY;
          if (typeof win.pageYOffset === 'number') return win.pageYOffset;
          if (doc.documentElement && doc.documentElement.scrollTop) return doc.documentElement.scrollTop;
          if (doc.body && doc.body.scrollTop) return doc.body.scrollTop;
          return 0;
        }
        function update() {
          var y = readScrollY();
          var shouldCollapse = collapsed ? (y > collapseOff) : (y > collapseOn);

          if (shouldCollapse !== collapsed) {
            collapsed = shouldCollapse;
            root.classList.toggle(collapsedClass, collapsed);
            if (doc.body) doc.body.classList.toggle(bodyClass, collapsed);

            if (collapsed) {
              releaseScrollY = collapseOn + dwell;
              if (heroPin) heroPin.style.height = (releaseScrollY + collapsedHeight) + 'px';
              if (!proyectoRevealed) {
                proyectoRevealed = true;
                revealTimer = win.setTimeout(function () {
                  if (revealTarget) revealTarget.classList.add(revealedClass);
                }, revealDelay);
              }
            } else {
              releaseScrollY = null;
              if (heroPin) heroPin.style.height = '';
              crystallized = false;
              if (nav) nav.classList.remove(crystallizedClass);
              root.classList.remove(handoffClass);
            }
          }

          if (releaseScrollY !== null) {
            var shouldCrystallize = crystallized ? (y > releaseScrollY - crystallizeOffset) : (y > releaseScrollY);
            if (shouldCrystallize !== crystallized) {
              crystallized = shouldCrystallize;
              if (nav) nav.classList.toggle(crystallizedClass, crystallized);
              root.classList.toggle(handoffClass, crystallized);
            }
          }
        }

        update();
        if (typeof win.addEventListener === 'function') {
          win.addEventListener('scroll', update, { passive: true });
        }
        cleanups.push(function () {
          if (typeof win.removeEventListener === 'function') {
            win.removeEventListener('scroll', update);
          }
          if (revealTimer !== null && typeof win.clearTimeout === 'function') {
            win.clearTimeout(revealTimer);
          }
          if (opts.autoRemove) {
            root.classList.remove(collapsedClass);
            root.classList.remove(handoffClass);
            if (doc.body) doc.body.classList.remove(bodyClass);
            if (nav) nav.classList.remove(crystallizedClass);
            if (heroPin) heroPin.style.height = '';
          }
        });
      })(roots[i]);
    }
  }

  // chart: genera un SVG accesible y sin librerías externas a partir de
  // data-cod-chart-data. El JSON se parsea con JSON.parse y cada valor se
  // valida con Number/isFinite; las etiquetas se insertan con textContent,
  // nunca con innerHTML. No se usan eval/Function/setTimeout(string).
  function installChartRuntime(win, doc, opts, cleanups) {
    var roots = doc.querySelectorAll('[data-cod-behavior="chart"]');
    var SVG_NS = 'http://www.w3.org/2000/svg';
    for (var i = 0; i < roots.length; i++) {
      (function (root) {
        var declared = root.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_CHART) return;

        var rawData = parseJsonAttr(root, ATTR_CHART_DATA);
        if (!Array.isArray(rawData)) return;
        var items = [];
        for (var r = 0; r < rawData.length; r++) {
          var row = rawData[r];
          if (!row || typeof row !== 'object') continue;
          var value = Number(row.value);
          if (!isFinite(value)) continue;
          items.push({ label: String(row.label == null ? '' : row.label), value: value });
        }
        if (!items.length) return;

        var chartType = parseClass(root.getAttribute(ATTR_CHART_TYPE), DEFAULT_CHART_TYPE);
        if (chartType !== 'bar' && chartType !== 'line') chartType = DEFAULT_CHART_TYPE;
        var color = parseClass(root.getAttribute(ATTR_CHART_COLOR), DEFAULT_CHART_COLOR) || colorDeAcento(root);
        var axisColor = parseClass(root.getAttribute(ATTR_CHART_AXIS_COLOR), DEFAULT_CHART_AXIS_COLOR);
        var gridColor = parseClass(root.getAttribute(ATTR_CHART_GRID_COLOR), DEFAULT_CHART_GRID_COLOR);
        var labelColor = parseClass(root.getAttribute(ATTR_CHART_LABEL_COLOR), DEFAULT_CHART_LABEL_COLOR);
        var width = parseIndex(root.getAttribute(ATTR_CHART_WIDTH), DEFAULT_CHART_WIDTH) || DEFAULT_CHART_WIDTH;
        var height = parseIndex(root.getAttribute(ATTR_CHART_HEIGHT), DEFAULT_CHART_HEIGHT) || DEFAULT_CHART_HEIGHT;

        root.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_CHART);
        root.setAttribute(ATTR_CHART_TYPE, chartType);

        var svg = root.querySelector('svg');
        if (!svg) {
          svg = doc.createElementNS(SVG_NS, 'svg');
          root.insertBefore(svg, root.firstChild);
        }
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', chartType === 'line' ? 'Gráfico de líneas' : 'Gráfico de barras');
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';

        var margin = { top: 24, right: 24, bottom: 52, left: 52 };
        var plotW = Math.max(0, width - margin.left - margin.right);
        var plotH = Math.max(0, height - margin.top - margin.bottom);
        var minValue = 0;
        var maxValue = 0;
        for (var v = 0; v < items.length; v++) {
          minValue = Math.min(minValue, items[v].value);
          maxValue = Math.max(maxValue, items[v].value);
        }
        if (maxValue <= minValue) maxValue = minValue + 1;
        var span = maxValue - minValue;

        function makeLine(x1, y1, x2, y2, stroke, strokeWidth) {
          var line = doc.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(x1));
          line.setAttribute('y1', String(y1));
          line.setAttribute('x2', String(x2));
          line.setAttribute('y2', String(y2));
          line.setAttribute('stroke', stroke);
          line.setAttribute('stroke-width', String(strokeWidth == null ? 1 : strokeWidth));
          svg.appendChild(line);
        }
        function makeText(content, x, y, anchor, fill, size) {
          var text = doc.createElementNS(SVG_NS, 'text');
          text.setAttribute('x', String(x));
          text.setAttribute('y', String(y));
          text.setAttribute('text-anchor', anchor || 'middle');
          text.setAttribute('fill', fill || labelColor);
          text.setAttribute('font-size', String(size || 12));
          text.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Arial, sans-serif');
          text.textContent = content;
          svg.appendChild(text);
        }
        function yFor(value) {
          return margin.top + plotH - ((value - minValue) / span) * plotH;
        }
        function xCenter(index) {
          if (items.length <= 1) return margin.left + plotW / 2;
          return margin.left + (plotW * index) / (items.length - 1);
        }
        function formatTick(value) {
          var abs = Math.abs(value);
          var rounded = Number(value.toFixed(2));
          if (abs >= 1000000) return String(Number((rounded / 1000000).toFixed(1))) + 'M';
          if (abs >= 1000) return String(Number((rounded / 1000).toFixed(1))) + 'k';
          return String(rounded);
        }

        var tickCount = 5;
        for (var t = 0; t < tickCount; t++) {
          var tickValue = minValue + (span * t) / (tickCount - 1);
          var tickY = yFor(tickValue);
          makeLine(margin.left, tickY, margin.left + plotW, tickY, gridColor, 1);
          makeText(formatTick(tickValue), margin.left - 8, tickY + 4, 'end', axisColor, 12);
        }

        var baselineY = yFor(0);
        makeLine(margin.left, margin.top, margin.left, margin.top + plotH, axisColor, 1.5);
        makeLine(margin.left, baselineY, margin.left + plotW, baselineY, axisColor, 1.5);

        for (var x = 0; x < items.length; x++) {
          makeText(items[x].label, xCenter(x), margin.top + plotH + 18, 'middle', labelColor, 12);
        }

        if (chartType === 'bar') {
          var slot = items.length ? plotW / items.length : plotW;
          var barWidth = Math.max(4, Math.min(64, slot * 0.72));
          for (var b = 0; b < items.length; b++) {
            var valueB = items[b].value;
            var barX = margin.left + slot * b + (slot - barWidth) / 2;
            var barY;
            var barH;
            if (valueB >= 0) {
              barY = yFor(valueB);
              barH = Math.max(0, baselineY - barY);
            } else {
              barY = baselineY;
              barH = Math.max(0, yFor(valueB) - baselineY);
            }
            var rect = doc.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('x', String(barX));
            rect.setAttribute('y', String(barY));
            rect.setAttribute('width', String(barWidth));
            rect.setAttribute('height', String(Math.max(0.5, barH)));
            rect.setAttribute('rx', '2');
            rect.setAttribute('fill', color);
            svg.appendChild(rect);
            var valueY = valueB >= 0 ? barY - 6 : barY + barH + 14;
            makeText(formatTick(valueB), barX + barWidth / 2, valueY, 'middle', labelColor, 11);
          }
        } else {
          var pointList = [];
          for (var p = 0; p < items.length; p++) {
            pointList.push(xCenter(p) + ',' + yFor(items[p].value));
          }
          var polyline = doc.createElementNS(SVG_NS, 'polyline');
          polyline.setAttribute('points', pointList.join(' '));
          polyline.setAttribute('fill', 'none');
          polyline.setAttribute('stroke', color);
          polyline.setAttribute('stroke-width', '2.5');
          polyline.setAttribute('stroke-linejoin', 'round');
          polyline.setAttribute('stroke-linecap', 'round');
          svg.appendChild(polyline);
          for (var c = 0; c < items.length; c++) {
            var cx = xCenter(c);
            var cy = yFor(items[c].value);
            var circle = doc.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', String(cx));
            circle.setAttribute('cy', String(cy));
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', '1.5');
            svg.appendChild(circle);
            makeText(formatTick(items[c].value), cx, cy - 8, 'middle', labelColor, 11);
          }
        }

        cleanups.push(function () {
          if (opts.autoRemove) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
          }
        });
      })(roots[i]);
    }
  }

  // env: { window, document }. Devuelve destroy().
  function createRuntime(env, options) {
    var opts = extend(
      {
        navSelector: DEFAULT_NAV_SELECTOR,
        scrolledClass: DEFAULT_SCROLLED_CLASS,
        defaultThreshold: DEFAULT_THRESHOLD,
        toggleClass: DEFAULT_TOGGLE_CLASS,
        carouselSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
        carouselActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
        revealClass: DEFAULT_REVEAL_CLASS,
        revealThreshold: DEFAULT_REVEAL_THRESHOLD,
        lightboxImageSelector: DEFAULT_LIGHTBOX_IMAGE_SELECTOR,
        lightboxOpenClass: DEFAULT_LIGHTBOX_OPEN_CLASS,
        heroPinSelector: DEFAULT_HERO_PIN,
        heroNavSelector: DEFAULT_HERO_NAV,
        heroRevealTargetSelector: DEFAULT_HERO_REVEAL_TARGET,
        heroCollapseOn: DEFAULT_HERO_COLLAPSE_ON,
        heroCollapseOff: DEFAULT_HERO_COLLAPSE_OFF,
        heroDwell: DEFAULT_HERO_DWELL,
        heroCollapsedHeight: DEFAULT_HERO_COLLAPSED_HEIGHT,
        heroRevealDelay: DEFAULT_HERO_REVEAL_DELAY,
        heroCrystallizeOffset: DEFAULT_HERO_CRYSTALLIZE_OFFSET,
        heroCollapsedClass: DEFAULT_HERO_COLLAPSED_CLASS,
        heroBodyClass: DEFAULT_HERO_BODY_CLASS,
        heroCrystallizedClass: DEFAULT_HERO_CRYSTALLIZED_CLASS,
        heroHandoffClass: DEFAULT_HERO_HANDOFF_CLASS,
        heroRevealedClass: DEFAULT_HERO_REVEALED_CLASS,
        chartType: DEFAULT_CHART_TYPE,
        chartColor: DEFAULT_CHART_COLOR,
        chartAxisColor: DEFAULT_CHART_AXIS_COLOR,
        chartGridColor: DEFAULT_CHART_GRID_COLOR,
        chartLabelColor: DEFAULT_CHART_LABEL_COLOR,
        chartWidth: DEFAULT_CHART_WIDTH,
        chartHeight: DEFAULT_CHART_HEIGHT,
        autoRemove: true,
        editorPreview: false,
      },
      options || {},
    );
    var win = env && env.window ? env.window : env;
    var doc = env && env.document ? env.document : win ? win.document : (typeof document !== 'undefined' ? document : null);
    if (!win || !doc || typeof doc.querySelectorAll !== 'function') return function () {};

    var cleanups = [];
    // El scroll dentro del iframe del editor sólo desplaza la maqueta: no debe
    // ejecutar la coreografía pública ni colapsar el banner mientras se edita.
    if (!opts.editorPreview) installHeroCollapseRuntime(win, doc, opts, cleanups);
    installScrollRuntime(win, doc, opts, cleanups);
    installNavToggleRuntime(win, doc, opts, cleanups);
    installCarouselRuntime(win, doc, opts, cleanups);
    installRevealRuntime(win, doc, opts, cleanups);
    installAnchorRuntime(win, doc, opts, cleanups);
    installLightboxRuntime(win, doc, opts, cleanups);
    installParcelMapRuntime(win, doc, opts, cleanups);
    installGeoMapRuntime(win, doc, opts, cleanups);
    installChartRuntime(win, doc, opts, cleanups);
    installCuadrantesRuntime(win, doc, opts, cleanups);
    installPestanasRuntime(win, doc, opts, cleanups);
    installMarquesinaRuntime(win, doc, opts, cleanups);
    installAvisoRuntime(win, doc, opts, cleanups);
    installMapaRuntime(win, doc, opts, cleanups);
    return function destroy() { while (cleanups.length) cleanups.pop()(); };
  }

  // --- Export: JS funcional (string). Sólo constantes allowlisted. ----------
  function runtimeScript(options) {
    var opts = extend(
      {
        navSelector: DEFAULT_NAV_SELECTOR,
        scrolledClass: DEFAULT_SCROLLED_CLASS,
        defaultThreshold: DEFAULT_THRESHOLD,
        toggleClass: DEFAULT_TOGGLE_CLASS,
        carouselSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
        carouselActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
        revealClass: DEFAULT_REVEAL_CLASS,
        revealThreshold: DEFAULT_REVEAL_THRESHOLD,
        heroPinSelector: DEFAULT_HERO_PIN,
        heroNavSelector: DEFAULT_HERO_NAV,
        heroRevealTargetSelector: DEFAULT_HERO_REVEAL_TARGET,
        heroCollapseOn: DEFAULT_HERO_COLLAPSE_ON,
        heroCollapseOff: DEFAULT_HERO_COLLAPSE_OFF,
        heroDwell: DEFAULT_HERO_DWELL,
        heroCollapsedHeight: DEFAULT_HERO_COLLAPSED_HEIGHT,
        heroRevealDelay: DEFAULT_HERO_REVEAL_DELAY,
        heroCrystallizeOffset: DEFAULT_HERO_CRYSTALLIZE_OFFSET,
        heroCollapsedClass: DEFAULT_HERO_COLLAPSED_CLASS,
        heroBodyClass: DEFAULT_HERO_BODY_CLASS,
        heroCrystallizedClass: DEFAULT_HERO_CRYSTALLIZED_CLASS,
        heroHandoffClass: DEFAULT_HERO_HANDOFF_CLASS,
        heroRevealedClass: DEFAULT_HERO_REVEALED_CLASS,
        chartType: DEFAULT_CHART_TYPE,
        chartColor: DEFAULT_CHART_COLOR,
        chartAxisColor: DEFAULT_CHART_AXIS_COLOR,
        chartGridColor: DEFAULT_CHART_GRID_COLOR,
        chartLabelColor: DEFAULT_CHART_LABEL_COLOR,
        chartWidth: DEFAULT_CHART_WIDTH,
        chartHeight: DEFAULT_CHART_HEIGHT,
      },
      options || {},
    );
    // Los valores interpolados provienen de constantes propias (no de input);
    // los nombres de conducta son literales allowlisted. Sin evaluación de
    // código externo (nada de eval/Function/setTimeout con string).
    return [
      '/* cod-behaviors runtime: scroll-threshold, nav-toggle, carousel-basic, reveal-on-scroll, lightbox, parcel-map, geo-map, hero-collapse, chart (allowlisted). Sin eval/Function. */',
      '(function () {',
      '  "use strict";',
      '  var ATTR_BEHAVIOR = "data-cod-behavior";',
      '  var ATTR_THRESHOLD = "data-cod-scroll-threshold";',
      '  var ATTR_SCROLLED_CLASS = "data-cod-scrolled-class";',
      '  var BEHAVIOR_SCROLL = "scroll-threshold";',
      '  var NAV_SELECTOR = ' + JSON.stringify(opts.navSelector) + ';',
      '  var SCROLLED_CLASS = ' + JSON.stringify(opts.scrolledClass) + ';',
      '  var DEFAULT_THRESHOLD = ' + Number(opts.defaultThreshold) + ';',
      '  var ATTR_TOGGLE_TARGET = "data-cod-toggle-target";',
      '  var ATTR_TOGGLE_CLASS = "data-cod-toggle-class";',
      '  var ATTR_TOGGLE_SELF_CLASS = "data-cod-toggle-self-class";',
      '  var BEHAVIOR_TOGGLE = "nav-toggle";',
      '  var DEFAULT_TOGGLE_CLASS = ' + JSON.stringify(opts.toggleClass) + ';',
      '  var ATTR_CAROUSEL_SLIDE_SELECTOR = "data-cod-carousel-slide-selector";',
      '  var ATTR_CAROUSEL_ACTIVE_CLASS = "data-cod-carousel-active-class";',
      '  var ATTR_CAROUSEL_START = "data-cod-carousel-start";',
      '  var ATTR_CAROUSEL_NEXT = "data-cod-carousel-next";',
      '  var ATTR_CAROUSEL_PREV = "data-cod-carousel-prev";',
      '  var ATTR_CAROUSEL_DOTS = "data-cod-carousel-dots";',
      '  var ATTR_CAROUSEL_DOT = "data-cod-carousel-dot";',
      '  var ATTR_CAROUSEL_MODE = "data-cod-carousel-mode";',
      '  var ATTR_CAROUSEL_TRACK_SELECTOR = "data-cod-carousel-track-selector";',
      '  var ATTR_CAROUSEL_VISIBLE = "data-cod-carousel-visible";',
      '  var ATTR_CAROUSEL_VISIBLE_MOBILE = "data-cod-carousel-visible-mobile";',
      '  var ATTR_CAROUSEL_MOBILE_BREAKPOINT = "data-cod-carousel-mobile-breakpoint";',
      '  var ATTR_CAROUSEL_ROWS = "data-cod-carousel-rows";',
      '  var DEFAULT_TRACK_SELECTOR = ' + JSON.stringify(DEFAULT_CAROUSEL_TRACK_SELECTOR) + ';',
      '  var BEHAVIOR_CAROUSEL = "carousel-basic";',
      '  var DEFAULT_SLIDE_SELECTOR = ' + JSON.stringify(opts.carouselSlideSelector) + ';',
      '  var DEFAULT_ACTIVE_CLASS = ' + JSON.stringify(opts.carouselActiveClass) + ';',
      '  var ATTR_REVEAL_CLASS = "data-cod-reveal-class";',
      '  var ATTR_REVEAL_THRESHOLD = "data-cod-reveal-threshold";',
      '  var BEHAVIOR_REVEAL = "reveal-on-scroll";',
      '  var DEFAULT_REVEAL_CLASS = ' + JSON.stringify(opts.revealClass) + ';',
      '  var DEFAULT_REVEAL_THRESHOLD = ' + Number(opts.revealThreshold) + ';',
      '  var BEHAVIOR_PARCEL = "parcel-map";',
      '  var ATTR_PARCEL_ITEM_SELECTOR = "data-cod-parcel-item-selector";',
      '  var ATTR_PARCEL_ID_ATTR = "data-cod-parcel-id-attr";',
      '  var ATTR_PARCEL_SUPERFICIE = "data-cod-parcel-superficie";',
      '  var ATTR_PARCEL_ACCENT_DISPONIBLE = "data-cod-parcel-accent-disponible";',
      '  var ATTR_PARCEL_ACCENT_VENDIDO = "data-cod-parcel-accent-vendido";',
      '  var ATTR_PARCEL_ACCENT_EMPTY = "data-cod-parcel-accent-empty";',
      '  var ATTR_PARCEL_PANEL = "data-cod-parcel-panel";',
      '  var ATTR_PARCEL_ACCENT = "data-cod-parcel-accent";',
      '  var ATTR_PARCEL_FIELD_N = "data-cod-parcel-field-n";',
      '  var ATTR_PARCEL_FIELD_ESTADO = "data-cod-parcel-field-estado";',
      '  var ATTR_PARCEL_FIELD_SUP = "data-cod-parcel-field-sup";',
      '  var ATTR_PARCEL_FIELD_VAL = "data-cod-parcel-field-val";',
      '  var ATTR_PARCEL_COUNT = "data-cod-parcel-count";',
      '  var ATTR_PARCEL_COUNT_SECONDARY = "data-cod-parcel-count-secondary";',
      '  var ATTR_PARCEL_ESTADO = "data-cod-parcel-estado";',
      '  var ATTR_PARCEL_VALOR = "data-cod-parcel-valor";',
      '  var BEHAVIOR_GEO = "geo-map";',
      '  var ATTR_GEO_PLACES = "data-cod-geo-places";',
      '  var ATTR_GEO_CATEGORIES = "data-cod-geo-categories";',
      '  var ATTR_GEO_DATA_BOUNDS = "data-cod-geo-data-bounds";',
      '  var ATTR_GEO_INITIAL_CENTER = "data-cod-geo-initial-center";',
      '  var ATTR_GEO_PROYECTO = "data-cod-geo-proyecto";',
      '  var ATTR_GEO_MIN_ZOOM_RATIO = "data-cod-geo-min-zoom-ratio";',
      '  var ATTR_GEO_SVG = "data-cod-geo-svg";',
      '  var ATTR_GEO_SELECT_CATEGORIA = "data-cod-geo-select-categoria";',
      '  var ATTR_GEO_SELECT_LUGAR = "data-cod-geo-select-lugar";',
      '  var ATTR_GEO_MARKER = "data-cod-geo-marker";',
      '  var ATTR_GEO_PANEL = "data-cod-geo-panel";',
      '  var ATTR_GEO_ACCENT = "data-cod-geo-accent";',
      '  var ATTR_GEO_FIELD_NOMBRE = "data-cod-geo-field-nombre";',
      '  var ATTR_GEO_FIELD_CATEGORIA = "data-cod-geo-field-categoria";',
      '  var ATTR_GEO_FIELD_DISTANCIA = "data-cod-geo-field-distancia";',
      '  var ATTR_GEO_FIELD_CONTACTO = "data-cod-geo-field-contacto";',
      '  var ATTR_GEO_ACCENT_COLOR = "data-cod-geo-accent-color";',
      '  var BEHAVIOR_HERO = "hero-collapse";',
      '  var ATTR_HERO_PIN = "data-cod-hero-pin";',
      '  var ATTR_HERO_NAV = "data-cod-hero-nav";',
      '  var ATTR_HERO_REVEAL_TARGET = "data-cod-hero-reveal-target";',
      '  var ATTR_HERO_COLLAPSE_ON = "data-cod-hero-collapse-on";',
      '  var ATTR_HERO_COLLAPSE_OFF = "data-cod-hero-collapse-off";',
      '  var ATTR_HERO_DWELL = "data-cod-hero-dwell";',
      '  var ATTR_HERO_COLLAPSED_HEIGHT = "data-cod-hero-collapsed-height";',
      '  var ATTR_HERO_REVEAL_DELAY = "data-cod-hero-reveal-delay";',
      '  var ATTR_HERO_CRYSTALLIZE_OFFSET = "data-cod-hero-crystallize-offset";',
      '  var ATTR_HERO_COLLAPSED_CLASS = "data-cod-hero-collapsed-class";',
      '  var ATTR_HERO_BODY_CLASS = "data-cod-hero-body-class";',
      '  var ATTR_HERO_CRYSTALLIZED_CLASS = "data-cod-hero-crystallized-class";',
      '  var ATTR_HERO_HANDOFF_CLASS = "data-cod-hero-handoff-class";',
      '  var ATTR_HERO_REVEALED_CLASS = "data-cod-hero-revealed-class";',
      '  var DEFAULT_HERO_PIN = ' + JSON.stringify(opts.heroPinSelector) + ';',
      '  var DEFAULT_HERO_NAV = ' + JSON.stringify(opts.heroNavSelector) + ';',
      '  var DEFAULT_HERO_REVEAL_TARGET = ' + JSON.stringify(opts.heroRevealTargetSelector) + ';',
      '  var DEFAULT_HERO_COLLAPSE_ON = ' + Number(opts.heroCollapseOn) + ';',
      '  var DEFAULT_HERO_COLLAPSE_OFF = ' + Number(opts.heroCollapseOff) + ';',
      '  var DEFAULT_HERO_DWELL = ' + Number(opts.heroDwell) + ';',
      '  var DEFAULT_HERO_COLLAPSED_HEIGHT = ' + Number(opts.heroCollapsedHeight) + ';',
      '  var DEFAULT_HERO_REVEAL_DELAY = ' + Number(opts.heroRevealDelay) + ';',
      '  var DEFAULT_HERO_CRYSTALLIZE_OFFSET = ' + Number(opts.heroCrystallizeOffset) + ';',
      '  var DEFAULT_HERO_COLLAPSED_CLASS = ' + JSON.stringify(opts.heroCollapsedClass) + ';',
      '  var DEFAULT_HERO_BODY_CLASS = ' + JSON.stringify(opts.heroBodyClass) + ';',
      '  var DEFAULT_HERO_CRYSTALLIZED_CLASS = ' + JSON.stringify(opts.heroCrystallizedClass) + ';',
      '  var DEFAULT_HERO_HANDOFF_CLASS = ' + JSON.stringify(opts.heroHandoffClass) + ';',
      '  var DEFAULT_HERO_REVEALED_CLASS = ' + JSON.stringify(opts.heroRevealedClass) + ';',
      '  var BEHAVIOR_CHART = "chart";',
      '  var ATTR_CHART_TYPE = "data-cod-chart-type";',
      '  var ATTR_CHART_DATA = "data-cod-chart-data";',
      '  var ATTR_CHART_COLOR = "data-cod-chart-color";',
      '  var ATTR_CHART_AXIS_COLOR = "data-cod-chart-axis-color";',
      '  var ATTR_CHART_GRID_COLOR = "data-cod-chart-grid-color";',
      '  var ATTR_CHART_LABEL_COLOR = "data-cod-chart-label-color";',
      '  var ATTR_CHART_WIDTH = "data-cod-chart-width";',
      '  var ATTR_CHART_HEIGHT = "data-cod-chart-height";',
      '  var DEFAULT_CHART_TYPE = ' + JSON.stringify(opts.chartType) + ';',
      '  var DEFAULT_CHART_COLOR = ' + JSON.stringify(opts.chartColor) + ';',
      '  var DEFAULT_CHART_AXIS_COLOR = ' + JSON.stringify(opts.chartAxisColor) + ';',
      '  var DEFAULT_CHART_GRID_COLOR = ' + JSON.stringify(opts.chartGridColor) + ';',
      '  var DEFAULT_CHART_LABEL_COLOR = ' + JSON.stringify(opts.chartLabelColor) + ';',
      '  var DEFAULT_CHART_WIDTH = ' + Number(opts.chartWidth) + ';',
      '  var DEFAULT_CHART_HEIGHT = ' + Number(opts.chartHeight) + ';',
      '  function colorDeAcento(el) {',
      '    try { var v = getComputedStyle(el).getPropertyValue("--cod-color-accent"); v = v ? v.trim() : ""; if (v) return v; } catch (e) {}',
      '    return "currentColor";',
      '  }',
      '  function parseThreshold(raw, fallback) { var n = parseFloat(raw); return isFinite(n) && n >= 0 ? n : fallback; }',
      '  function parseClass(raw, fallback) { var value = String(raw == null ? "" : raw).trim(); return value === "" ? fallback : value; }',
      '  function parseIndex(raw, fallback) { var n = parseInt(raw, 10); return isFinite(n) && n >= 0 ? n : fallback; }',
      '  function parseJsonAttr(el, attr) {',
      '    var raw = String(el && el.getAttribute ? el.getAttribute(attr) || "" : "").trim();',
      '    if (!raw) return null;',
      '    try { return JSON.parse(raw); } catch (e) { return null; }',
      '  }',
      '  function parsePoint(raw, fallbackX, fallbackY) {',
      '    var parts = String(raw || "").split(",");',
      '    var x = parseFloat(parts[0]);',
      '    var y = parseFloat(parts[1]);',
      '    return { x: isFinite(x) ? x : fallbackX, y: isFinite(y) ? y : fallbackY };',
      '  }',
      '',
      '  function bootScroll(w, d) {',
      '    var nodes = d.querySelectorAll(NAV_SELECTOR);',
      '    for (var i = 0; i < nodes.length; i++) {',
      '      (function (nav) {',
      '        if (nav.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_SCROLL) return;',
      '        var threshold = parseThreshold(nav.getAttribute(ATTR_THRESHOLD), DEFAULT_THRESHOLD);',
      '        var scrolledClass = parseClass(nav.getAttribute(ATTR_SCROLLED_CLASS), SCROLLED_CLASS);',
      '        nav.setAttribute(ATTR_THRESHOLD, String(threshold));',
      '        nav.setAttribute(ATTR_SCROLLED_CLASS, scrolledClass);',
      '        function readY() {',
      '          if (typeof w.scrollY === "number") return w.scrollY;',
      '          if (typeof w.pageYOffset === "number") return w.pageYOffset;',
      '          return (d.documentElement && d.documentElement.scrollTop) || (d.body && d.body.scrollTop) || 0;',
      '        }',
      '        function update() { nav.classList.toggle(scrolledClass, readY() > threshold); }',
      '        update();',
      '        w.addEventListener("scroll", update, { passive: true });',
      '        w.addEventListener("resize", update, { passive: true });',
      '      })(nodes[i]);',
      '    }',
      '  }',
      '',
      '  function bootToggle(w, d) {',
      '    var nodes = d.querySelectorAll(\'[data-cod-behavior="nav-toggle"]\');',
      '    for (var i = 0; i < nodes.length; i++) {',
      '      (function (button) {',
      '        if (button.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_TOGGLE) return;',
      '        var targetSelector = String(button.getAttribute(ATTR_TOGGLE_TARGET) || "").trim();',
      '        if (!targetSelector) return;',
      '        var target = null;',
      '        try { target = d.querySelector(targetSelector); } catch (e) { return; }',
      '        if (!target) return;',
      '        var toggleClass = parseClass(button.getAttribute(ATTR_TOGGLE_CLASS), DEFAULT_TOGGLE_CLASS);',
      '        var selfClass = parseClass(button.getAttribute(ATTR_TOGGLE_SELF_CLASS), "");',
      '        button.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_TOGGLE);',
      '        button.setAttribute(ATTR_TOGGLE_TARGET, targetSelector);',
      '        button.setAttribute(ATTR_TOGGLE_CLASS, toggleClass);',
      '        if (selfClass) button.setAttribute(ATTR_TOGGLE_SELF_CLASS, selfClass);',
      '        function apply(isOpen) {',
      '          target.classList.toggle(toggleClass, isOpen);',
      '          if (selfClass) button.classList.toggle(selfClass, isOpen);',
      '          button.setAttribute("aria-expanded", String(isOpen));',
      '        }',
      '        function onClick(e) {',
      '          if (e && typeof e.preventDefault === "function") e.preventDefault();',
      '          apply(!target.classList.contains(toggleClass));',
      '        }',
      '        function onTargetClick(e) {',
      '          var el = e && e.target;',
      '          if (!el || typeof el.closest !== "function") return;',
      '          var link = el.closest("a[href]");',
      '          if (link) apply(false);',
      '        }',
      '        button.setAttribute("aria-expanded", String(target.classList.contains(toggleClass)));',
      '        button.addEventListener("click", onClick);',
      '        target.addEventListener("click", onTargetClick);',
      '      })(nodes[i]);',
      '    }',
      '  }',
      '',
      '  function bootCarouselTrack(w, d, root) {',
      '    var trackSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_TRACK_SELECTOR), DEFAULT_TRACK_SELECTOR);',
      '    var slideSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR), DEFAULT_SLIDE_SELECTOR);',
      '    var visible = parseIndex(root.getAttribute(ATTR_CAROUSEL_VISIBLE), 1) || 1;',
      '    var visibleMobileRaw = root.getAttribute(ATTR_CAROUSEL_VISIBLE_MOBILE);',
      '    var visibleMobile = visibleMobileRaw ? parseIndex(visibleMobileRaw, visible) : visible;',
      '    var breakpoint = parseIndex(root.getAttribute(ATTR_CAROUSEL_MOBILE_BREAKPOINT), 860);',
      '    var track = null;',
      '    try { track = root.querySelector(trackSelector); } catch (e) { return; }',
      '    if (!track) return;',
      '    var slides = [];',
      '    try { slides = Array.prototype.slice.call(track.querySelectorAll(slideSelector)); } catch (e) { return; }',
      '    if (!slides.length) return;',
      '    var nextBtn = root.querySelector("[" + ATTR_CAROUSEL_NEXT + "]");',
      '    var prevBtn = root.querySelector("[" + ATTR_CAROUSEL_PREV + "]");',
      '    var index = 0;',
      '    var rows = parseIndex(root.getAttribute(ATTR_CAROUSEL_ROWS), 1) || 1;',
      '    function visibleCount() { return w.innerWidth <= breakpoint ? visibleMobile : visible; }',
      '    function columnCount() { return Math.ceil(slides.length / rows); }',
      '    function maxIndex() { return Math.max(0, columnCount() - visibleCount()); }',
      '    function slideStep() {',
      '      if (rows > 1 && slides.length > rows) { return slides[rows].getBoundingClientRect().left - slides[0].getBoundingClientRect().left; }',
      '      if (slides.length < 2) return slides[0].getBoundingClientRect().width;',
      '      return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;',
      '    }',
      '    function update() {',
      '      var step = slideStep();',
      '      track.style.setProperty("--cod-carousel-columnas", String(visibleCount()));',
      '      track.style.transform = "translateX(" + (-index * step) + "px)";',
      '      if (prevBtn) prevBtn.disabled = index <= 0;',
      '      if (nextBtn) nextBtn.disabled = index >= maxIndex();',
      '    }',
      '    if (nextBtn) nextBtn.addEventListener("click", function (e) { if (e && typeof e.preventDefault === "function") e.preventDefault(); index = Math.min(maxIndex(), index + 1); update(); });',
      '    if (prevBtn) prevBtn.addEventListener("click", function (e) { if (e && typeof e.preventDefault === "function") e.preventDefault(); index = Math.max(0, index - 1); update(); });',
      '    w.addEventListener("resize", function () { index = Math.min(index, maxIndex()); update(); }, { passive: true });',
      '    update();',
      '  }',
      '',
      '  function bootCarousel(w, d) {',
      '    var roots = d.querySelectorAll(\'[data-cod-behavior="carousel-basic"]\');',
      '    for (var i = 0; i < roots.length; i++) {',
      '      (function (root) {',
      '        if (root.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_CAROUSEL) return;',
      '        if (root.getAttribute(ATTR_CAROUSEL_MODE) === "track") { bootCarouselTrack(w, d, root); return; }',
      '        var slideSelector = parseClass(root.getAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR), DEFAULT_SLIDE_SELECTOR);',
      '        var activeClass = parseClass(root.getAttribute(ATTR_CAROUSEL_ACTIVE_CLASS), DEFAULT_ACTIVE_CLASS);',
      '        var start = parseIndex(root.getAttribute(ATTR_CAROUSEL_START), 0);',
      '        root.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_CAROUSEL);',
      '        root.setAttribute(ATTR_CAROUSEL_SLIDE_SELECTOR, slideSelector);',
      '        root.setAttribute(ATTR_CAROUSEL_ACTIVE_CLASS, activeClass);',
      '        var slides = [];',
      '        try { slides = Array.prototype.slice.call(root.querySelectorAll(slideSelector)); } catch (e) { return; }',
      '        if (!slides.length) return;',
      '        var current = start < slides.length ? start : 0;',
      '        var nextBtn = root.querySelector("[" + ATTR_CAROUSEL_NEXT + "]");',
      '        var prevBtn = root.querySelector("[" + ATTR_CAROUSEL_PREV + "]");',
      '        var dotsHost = root.querySelector("[" + ATTR_CAROUSEL_DOTS + "]");',
      '        if (!dotsHost && root.hasAttribute(ATTR_CAROUSEL_DOTS)) dotsHost = root;',
      '        var dots = [];',
      '        if (dotsHost) {',
      '          dots = Array.prototype.slice.call(dotsHost.querySelectorAll("[" + ATTR_CAROUSEL_DOT + "]"));',
      '          if (!dots.length) {',
      '            for (var j = 0; j < slides.length; j++) {',
      '              var dot = d.createElement("button");',
      '              dot.type = "button";',
      '              dot.className = "cod-carousel__dot";',
      '              dot.setAttribute(ATTR_CAROUSEL_DOT, "");',
      '              dotsHost.appendChild(dot);',
      '              dots.push(dot);',
      '            }',
      '          }',
      '        }',
      '        function show(index) {',
      '          current = ((index % slides.length) + slides.length) % slides.length;',
      '          for (var s = 0; s < slides.length; s++) {',
      '            var active = s === current;',
      '            var slide = slides[s];',
      '            if (active) {',
      '              if (slide.style && typeof slide.style.removeProperty === "function") slide.style.removeProperty("display");',
      '              slide.removeAttribute("hidden");',
      '              slide.classList.add(activeClass);',
      '              slide.setAttribute("aria-hidden", "false");',
      '            } else {',
      '              if (slide.style && typeof slide.style.setProperty === "function") slide.style.setProperty("display", "none", "important");',
      '              slide.setAttribute("hidden", "");',
      '              slide.classList.remove(activeClass);',
      '              slide.setAttribute("aria-hidden", "true");',
      '            }',
      '          }',
      '          for (var q = 0; q < dots.length; q++) {',
      '            dots[q].classList.toggle(activeClass, q === current);',
      '            dots[q].setAttribute("aria-selected", q === current ? "true" : "false");',
      '          }',
      '        }',
      '        if (nextBtn) nextBtn.addEventListener("click", function (e) { if (e && typeof e.preventDefault === "function") e.preventDefault(); show(current + 1); });',
      '        if (prevBtn) prevBtn.addEventListener("click", function (e) { if (e && typeof e.preventDefault === "function") e.preventDefault(); show(current - 1); });',
      '        for (var k = 0; k < dots.length; k++) {',
      '          (function (dotIndex) {',
      '            dots[dotIndex].addEventListener("click", function (e) { if (e && typeof e.preventDefault === "function") e.preventDefault(); show(dotIndex); });',
      '          })(k);',
      '        }',
      '        show(current);',
      '      })(roots[i]);',
      '    }',
      '  }',
      '',
      '  function bootReveal(w, d) {',
      '    var nodes = d.querySelectorAll(\'[data-cod-behavior="reveal-on-scroll"]\');',
      '    var hasIO = typeof w.IntersectionObserver === "function";',
      '    var observer = null;',
      '    if (hasIO) {',
      '      observer = new w.IntersectionObserver(function (entries) {',
      '        entries.forEach(function (entry) {',
      '          if (!entry.isIntersecting) return;',
      '          var el = entry.target;',
      '          var revealClass = parseClass(el.getAttribute(ATTR_REVEAL_CLASS), DEFAULT_REVEAL_CLASS);',
      '          el.classList.add(revealClass);',
      '          observer.unobserve(el);',
      '        });',
      '      }, { threshold: DEFAULT_REVEAL_THRESHOLD });',
      '    }',
      '    for (var i = 0; i < nodes.length; i++) {',
      '      (function (el) {',
      '        if (el.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_REVEAL) return;',
      '        var revealClass = parseClass(el.getAttribute(ATTR_REVEAL_CLASS), DEFAULT_REVEAL_CLASS);',
      '        el.setAttribute(ATTR_REVEAL_CLASS, revealClass);',
      '        if (!hasIO) { el.classList.add(revealClass); return; }',
      '        observer.observe(el);',
      '      })(nodes[i]);',
      '    }',
      '  }',
      '',
      '  function bootParcelMap(w, d) {',
      '    var roots = d.querySelectorAll(\'[data-cod-behavior="parcel-map"]\');',
      '    for (var i = 0; i < roots.length; i++) {',
      '      (function (root) {',
      '        if (root.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_PARCEL) return;',
      '        var itemSelector = parseClass(root.getAttribute(ATTR_PARCEL_ITEM_SELECTOR), ".lote");',
      '        var idAttr = parseClass(root.getAttribute(ATTR_PARCEL_ID_ATTR), "data-lote");',
      '        var superficie = parseClass(root.getAttribute(ATTR_PARCEL_SUPERFICIE), "5.000 m²");',
      '        var accentDisponible = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_DISPONIBLE), "var(--oliva-500)");',
      '        var accentVendido = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_VENDIDO), "var(--tierra-700)");',
      '        var accentEmpty = parseClass(root.getAttribute(ATTR_PARCEL_ACCENT_EMPTY), "var(--tierra-300)");',
      '        function bySelector(attr) {',
      '          var selector = String(root.getAttribute(attr) || "").trim();',
      '          if (!selector) return null;',
      '          try { return d.querySelector(selector); } catch (e) { return null; }',
      '        }',
      '        var panel = bySelector(ATTR_PARCEL_PANEL);',
      '        var accent = bySelector(ATTR_PARCEL_ACCENT);',
      '        var fieldN = bySelector(ATTR_PARCEL_FIELD_N);',
      '        var fieldEstado = bySelector(ATTR_PARCEL_FIELD_ESTADO);',
      '        var fieldSup = bySelector(ATTR_PARCEL_FIELD_SUP);',
      '        var fieldVal = bySelector(ATTR_PARCEL_FIELD_VAL);',
      '        var countEl = bySelector(ATTR_PARCEL_COUNT);',
      '        var countSecondary = bySelector(ATTR_PARCEL_COUNT_SECONDARY);',
      '        var items = [];',
      '        try { items = Array.prototype.slice.call(root.querySelectorAll(itemSelector)); } catch (e) { return; }',
      '        if (!items.length) return;',
      '        var disponibles = 0;',
      '        items.forEach(function (item) {',
      '          var estado = String(item.getAttribute(ATTR_PARCEL_ESTADO) || "").trim().toLowerCase();',
      '          if (estado === "disponible") { disponibles++; item.classList.add("is-disponible"); }',
      '          else if (estado === "vendido") item.classList.add("is-vendido");',
      '        });',
      '        if (countEl) countEl.textContent = disponibles;',
      '        if (countSecondary) countSecondary.textContent = disponibles;',
      '        var pinned = null;',
      '        function render(item) {',
      '          if (!panel) return;',
      '          var estado = String(item.getAttribute(ATTR_PARCEL_ESTADO) || "").trim().toLowerCase();',
      '          var valor = String(item.getAttribute(ATTR_PARCEL_VALOR) || "").trim();',
      '          var esDisponible = estado === "disponible";',
      '          panel.setAttribute("data-empty", "false");',
      '          if (accent) accent.style.background = esDisponible ? accentDisponible : accentVendido;',
      '          if (fieldN) fieldN.textContent = String(item.getAttribute(idAttr) || "").trim();',
      '          if (fieldEstado) fieldEstado.textContent = esDisponible ? "Disponible" : "Vendida";',
      '          if (fieldSup) fieldSup.textContent = superficie;',
      '          if (fieldVal) fieldVal.textContent = valor ? valor : "—";',
      '        }',
      '        function reset() {',
      '          if (!panel) return;',
      '          panel.setAttribute("data-empty", "true");',
      '          if (accent) accent.style.background = accentEmpty;',
      '        }',
      '        items.forEach(function (item) {',
      '          item.addEventListener("mouseenter", function () { if (!pinned) render(item); });',
      '          item.addEventListener("mouseleave", function () { if (!pinned) reset(); });',
      '          item.addEventListener("click", function () {',
      '            if (pinned === item) { pinned = null; item.classList.remove("is-active"); reset(); return; }',
      '            if (pinned) pinned.classList.remove("is-active");',
      '            pinned = item;',
      '            item.classList.add("is-active");',
      '            render(item);',
      '          });',
      '        });',
      '      })(roots[i]);',
      '    }',
      '  }',
      '',
      '  function bootGeoMap(w, d) {',
      '    var roots = d.querySelectorAll(\'[data-cod-behavior="geo-map"]\');',
      '    for (var i = 0; i < roots.length; i++) {',
      '      (function (root) {',
      '        if (root.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_GEO) return;',
      '        var places = parseJsonAttr(root, ATTR_GEO_PLACES);',
      '        var categories = parseJsonAttr(root, ATTR_GEO_CATEGORIES);',
      '        if (!Array.isArray(places) || !places.length) return;',
      '        var categoryLabels = (categories && typeof categories === "object") ? categories : {};',
      '        function bySelector(attr) {',
      '          var selector = String(root.getAttribute(attr) || "").trim();',
      '          if (!selector) return null;',
      '          try { return d.querySelector(selector); } catch (e) { return null; }',
      '        }',
      '        var svg = bySelector(ATTR_GEO_SVG);',
      '        var selCat = bySelector(ATTR_GEO_SELECT_CATEGORIA);',
      '        var selLugar = bySelector(ATTR_GEO_SELECT_LUGAR);',
      '        var marker = bySelector(ATTR_GEO_MARKER);',
      '        var panel = bySelector(ATTR_GEO_PANEL);',
      '        var accent = bySelector(ATTR_GEO_ACCENT);',
      '        var fieldNombre = bySelector(ATTR_GEO_FIELD_NOMBRE);',
      '        var fieldCategoria = bySelector(ATTR_GEO_FIELD_CATEGORIA);',
      '        var fieldDistancia = bySelector(ATTR_GEO_FIELD_DISTANCIA);',
      '        var fieldContacto = bySelector(ATTR_GEO_FIELD_CONTACTO);',
      '        var accentColor = parseClass(root.getAttribute(ATTR_GEO_ACCENT_COLOR), "var(--dorado-600)");',
      '        if (!svg) return;',
      '        var bounds = parseJsonAttr(root, ATTR_GEO_DATA_BOUNDS) || {};',
      '        var DATA = {',
      '          minX: isFinite(Number(bounds.minX)) ? Number(bounds.minX) : -195,',
      '          minY: isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -15,',
      '          maxX: isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : 570,',
      '          maxY: isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 590',
      '        };',
      '        var initialCenter = parsePoint(root.getAttribute(ATTR_GEO_INITIAL_CENTER), 300, 400);',
      '        var proyecto = parsePoint(root.getAttribute(ATTR_GEO_PROYECTO), 300, 270);',
      '        var minZoomRatio = parseFloat(root.getAttribute(ATTR_GEO_MIN_ZOOM_RATIO));',
      '        if (!isFinite(minZoomRatio) || minZoomRatio <= 0 || minZoomRatio >= 1) minZoomRatio = 0.2;',
      '        var initialZoom = parseFloat(root.getAttribute("data-cod-geo-initial-zoom"));',
      '        if (!isFinite(initialZoom) || initialZoom <= 0 || initialZoom > 1) initialZoom = 1;',
      '        if (initialZoom < minZoomRatio) initialZoom = minZoomRatio;',
      '        var FULL_W = DATA.maxX - DATA.minX;',
      '        var FULL_H = DATA.maxY - DATA.minY;',
      '        var dataAspect = FULL_H / FULL_W;',
      '        var rect0 = root.getBoundingClientRect();',
      '        var containerAspect = (rect0.height && rect0.width) ? rect0.height / rect0.width : dataAspect;',
      '        var view = {};',
      '        if (containerAspect <= dataAspect) { view.w = FULL_W; view.h = FULL_W * containerAspect; }',
      '        else { view.h = FULL_H; view.w = FULL_H / containerAspect; }',
      '        var MAX_W = view.w;',
      '        var MIN_W = MAX_W * minZoomRatio;',
      '        view.w = MAX_W * initialZoom;',
      '        view.h = view.w * containerAspect;',
      '        view.x = initialCenter.x - view.w / 2;',
      '        view.y = initialCenter.y - view.h / 2;',
      '        function applyView() {',
      '          svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);',
      '          svg.style.setProperty("--zoom-k", view.w / MAX_W);',
      '        }',
      '        function clamp1D(size, dataMin, dataMax) {',
      '          var dataSize = dataMax - dataMin;',
      '          if (size >= dataSize) return dataMin - (size - dataSize) / 2;',
      '          return null;',
      '        }',
      '        function clampView() {',
      '          view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));',
      '          view.h = view.w * containerAspect;',
      '          var cx = clamp1D(view.w, DATA.minX, DATA.maxX);',
      '          view.x = cx !== null ? cx : Math.max(DATA.minX, Math.min(DATA.maxX - view.w, view.x));',
      '          var cy = clamp1D(view.h, DATA.minY, DATA.maxY);',
      '          view.y = cy !== null ? cy : Math.max(DATA.minY, Math.min(DATA.maxY - view.h, view.y));',
      '        }',
      '        function panToLugar(px, py) {',
      '          var pad = 1.6;',
      '          var minX = Math.min(px, proyecto.x);',
      '          var maxX = Math.max(px, proyecto.x);',
      '          var minY = Math.min(py, proyecto.y);',
      '          var maxY = Math.max(py, proyecto.y);',
      '          var cx = (minX + maxX) / 2;',
      '          var cy = (minY + maxY) / 2;',
      '          var spanW = Math.max((maxX - minX) * pad, MIN_W);',
      '          var spanH = Math.max((maxY - minY) * pad, MIN_W * containerAspect);',
      '          if (spanH > spanW * containerAspect) { spanW = spanH / containerAspect; } else { spanH = spanW * containerAspect; }',
      '          view.w = spanW;',
      '          view.h = spanH;',
      '          view.x = cx - view.w / 2;',
      '          view.y = cy - view.h / 2;',
      '          clampView();',
      '          applyView();',
      '        }',
      '        applyView();',
      '        var dragging = false;',
      '        var last = null;',
      '        function onPointerDown(e) {',
      '          dragging = true;',
      '          last = { x: e.clientX, y: e.clientY };',
      '          if (e.pointerId != null && typeof root.setPointerCapture === "function") {',
      '            try { root.setPointerCapture(e.pointerId); } catch (err) {}',
      '          }',
      '          root.classList.add("is-dragging");',
      '        }',
      '        function onPointerMove(e) {',
      '          if (!dragging) return;',
      '          var rect = root.getBoundingClientRect();',
      '          var scale = view.w / rect.width;',
      '          view.x -= (e.clientX - last.x) * scale;',
      '          view.y -= (e.clientY - last.y) * scale;',
      '          last = { x: e.clientX, y: e.clientY };',
      '          clampView();',
      '          applyView();',
      '        }',
      '        function endDrag() { dragging = false; root.classList.remove("is-dragging"); }',
      '        function onWheel(e) {',
      '          e.preventDefault();',
      '          var rect = root.getBoundingClientRect();',
      '          var mx = view.x + (e.clientX - rect.left) / rect.width * view.w;',
      '          var my = view.y + (e.clientY - rect.top) / rect.height * view.h;',
      '          var factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;',
      '          var newW = Math.max(MIN_W, Math.min(MAX_W, view.w * factor));',
      '          var newH = newW * containerAspect;',
      '          view.x = mx - (mx - view.x) * (newW / view.w);',
      '          view.y = my - (my - view.y) * (newH / view.h);',
      '          view.w = newW;',
      '          view.h = newH;',
      '          clampView();',
      '          applyView();',
      '        }',
      '        root.addEventListener("pointerdown", onPointerDown);',
      '        root.addEventListener("pointermove", onPointerMove);',
      '        root.addEventListener("pointerup", endDrag);',
      '        root.addEventListener("pointerleave", endDrag);',
      '        root.addEventListener("pointercancel", endDrag);',
      '        root.addEventListener("wheel", onWheel, { passive: false });',
      '        function populateLugares(categoria) {',
      '          if (!selLugar) return;',
      '          while (selLugar.firstChild) selLugar.removeChild(selLugar.firstChild);',
      '          var opt0 = d.createElement("option");',
      '          opt0.value = "";',
      '          opt0.textContent = categoria ? "Selecciona un lugar" : "Elige una categoría primero";',
      '          selLugar.appendChild(opt0);',
      '          if (!categoria) { selLugar.disabled = true; return; }',
      '          selLugar.disabled = false;',
      '          places',
      '            .filter(function (lugar) { return lugar.categoria === categoria; })',
      '            .sort(function (a, b) { return a.dist - b.dist; })',
      '            .forEach(function (lugar) {',
      '              var opt = d.createElement("option");',
      '              opt.value = lugar.nombre;',
      '              opt.textContent = lugar.nombre + " · " + lugar.dist + " km";',
      '              selLugar.appendChild(opt);',
      '            });',
      '        }',
      '        function onCatChange() {',
      '          populateLugares(selCat ? selCat.value : "");',
      '          if (marker) marker.style.display = "none";',
      '          if (panel) panel.setAttribute("data-empty", "true");',
      '        }',
      '        function onLugarChange() {',
      '          var nombre = selLugar ? selLugar.value : "";',
      '          var lugar = null;',
      '          for (var j = 0; j < places.length; j++) {',
      '            if (places[j].nombre === nombre) { lugar = places[j]; break; }',
      '          }',
      '          if (!lugar) {',
      '            if (marker) marker.style.display = "none";',
      '            if (panel) panel.setAttribute("data-empty", "true");',
      '            return;',
      '          }',
      '          if (marker) {',
      '            marker.setAttribute("transform", "translate(" + lugar.x + "," + lugar.y + ")");',
      '            marker.style.display = "";',
      '          }',
      '          panToLugar(lugar.x, lugar.y);',
      '          if (panel) panel.setAttribute("data-empty", "false");',
      '          if (accent) accent.style.background = accentColor;',
      '          if (fieldNombre) fieldNombre.textContent = lugar.nombre;',
      '          if (fieldCategoria) fieldCategoria.textContent = categoryLabels[lugar.categoria] || lugar.categoria;',
      '          if (fieldDistancia) fieldDistancia.textContent = lugar.dist + " km";',
      '          if (fieldContacto) fieldContacto.textContent = lugar.contacto || "—";',
      '        }',
      '        if (selCat) selCat.addEventListener("change", onCatChange);',
      '        if (selLugar) selLugar.addEventListener("change", onLugarChange);',
      '      })(roots[i]);',
      '    }',
      '  }',
      '',
      '  function bootHeroCollapse(w, d) {',
      '    if (w.history && "scrollRestoration" in w.history) { w.history.scrollRestoration = "manual"; }',
      '    if (typeof w.scrollTo === "function") { w.scrollTo(0, 0); }',
      '    var roots = d.querySelectorAll(\'[data-cod-behavior="hero-collapse"]\');',
      '    for (var i = 0; i < roots.length; i++) {',
      '      (function (root) {',
      '        if (root.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_HERO) return;',
      '        var collapseOn = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSE_ON), DEFAULT_HERO_COLLAPSE_ON);',
      '        var collapseOff = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSE_OFF), DEFAULT_HERO_COLLAPSE_OFF);',
      '        var dwell = parseThreshold(root.getAttribute(ATTR_HERO_DWELL), DEFAULT_HERO_DWELL);',
      '        var collapsedHeight = parseThreshold(root.getAttribute(ATTR_HERO_COLLAPSED_HEIGHT), DEFAULT_HERO_COLLAPSED_HEIGHT);',
      '        var revealDelay = parseThreshold(root.getAttribute(ATTR_HERO_REVEAL_DELAY), DEFAULT_HERO_REVEAL_DELAY);',
      '        var crystallizeOffset = parseThreshold(root.getAttribute(ATTR_HERO_CRYSTALLIZE_OFFSET), DEFAULT_HERO_CRYSTALLIZE_OFFSET);',
      '        var pinSelector = parseClass(root.getAttribute(ATTR_HERO_PIN), DEFAULT_HERO_PIN);',
      '        var navSelector = parseClass(root.getAttribute(ATTR_HERO_NAV), DEFAULT_HERO_NAV);',
      '        var revealTargetSelector = parseClass(root.getAttribute(ATTR_HERO_REVEAL_TARGET), DEFAULT_HERO_REVEAL_TARGET);',
      '        var collapsedClass = parseClass(root.getAttribute(ATTR_HERO_COLLAPSED_CLASS), DEFAULT_HERO_COLLAPSED_CLASS);',
      '        var bodyClass = parseClass(root.getAttribute(ATTR_HERO_BODY_CLASS), DEFAULT_HERO_BODY_CLASS);',
      '        var crystallizedClass = parseClass(root.getAttribute(ATTR_HERO_CRYSTALLIZED_CLASS), DEFAULT_HERO_CRYSTALLIZED_CLASS);',
      '        var handoffClass = parseClass(root.getAttribute(ATTR_HERO_HANDOFF_CLASS), DEFAULT_HERO_HANDOFF_CLASS);',
      '        var revealedClass = parseClass(root.getAttribute(ATTR_HERO_REVEALED_CLASS), DEFAULT_HERO_REVEALED_CLASS);',
      '        function bySelector(selector) {',
      '          var value = String(selector || "").trim();',
      '          if (!value) return null;',
      '          try { return d.querySelector(value); } catch (e) { return null; }',
      '        }',
      '        var heroPin = bySelector(pinSelector);',
      '        var nav = bySelector(navSelector);',
      '        var revealTarget = bySelector(revealTargetSelector);',
      '        var isMobile = false;',
      '        if (typeof w.innerWidth === "number" && w.innerWidth <= 900) isMobile = true;',
      '        else if (typeof w.innerWidth === "number" && typeof w.innerHeight === "number" && w.innerHeight > 0) isMobile = (w.innerWidth / w.innerHeight) <= (4 / 5);',
      '        if (isMobile) {',
      '          var updateMobile = function () {',
      '            var pastThreshold = w.scrollY > collapseOn;',
      '            if (nav) nav.classList.toggle(crystallizedClass, pastThreshold);',
      '            root.classList.toggle(handoffClass, pastThreshold);',
      '          };',
      '          updateMobile();',
      '          w.addEventListener("scroll", updateMobile, { passive: true });',
      '          return;',
      '        }',
      '        var collapsed = false;',
      '        var crystallized = false;',
      '        var releaseScrollY = null;',
      '        var proyectoRevealed = false;',
      '        function readY() {',
      '          if (typeof w.scrollY === "number") return w.scrollY;',
      '          if (typeof w.pageYOffset === "number") return w.pageYOffset;',
      '          return (d.documentElement && d.documentElement.scrollTop) || (d.body && d.body.scrollTop) || 0;',
      '        }',
      '        function update() {',
      '          var y = readY();',
      '          var shouldCollapse = collapsed ? (y > collapseOff) : (y > collapseOn);',
      '          if (shouldCollapse !== collapsed) {',
      '            collapsed = shouldCollapse;',
      '            root.classList.toggle(collapsedClass, collapsed);',
      '            if (d.body) d.body.classList.toggle(bodyClass, collapsed);',
      '            if (collapsed) {',
      '              releaseScrollY = collapseOn + dwell;',
      '              if (heroPin) heroPin.style.height = (releaseScrollY + collapsedHeight) + "px";',
      '              if (!proyectoRevealed) {',
      '                proyectoRevealed = true;',
      '                w.setTimeout(function () { if (revealTarget) revealTarget.classList.add(revealedClass); }, revealDelay);',
      '              }',
      '            } else {',
      '              releaseScrollY = null;',
      '              if (heroPin) heroPin.style.height = "";',
      '              crystallized = false;',
      '              if (nav) nav.classList.remove(crystallizedClass);',
      '              root.classList.remove(handoffClass);',
      '            }',
      '          }',
      '          if (releaseScrollY !== null) {',
      '            var shouldCrystallize = crystallized ? (y > releaseScrollY - crystallizeOffset) : (y > releaseScrollY);',
      '            if (shouldCrystallize !== crystallized) {',
      '              crystallized = shouldCrystallize;',
      '              if (nav) nav.classList.toggle(crystallizedClass, crystallized);',
      '              root.classList.toggle(handoffClass, crystallized);',
      '            }',
      '          }',
      '        }',
      '        update();',
      '        w.addEventListener("scroll", update, { passive: true });',
      '      })(roots[i]);',
      '    }',
      '  }',
      '',
      '  function bootChart(w, d) {',
      '    var roots = d.querySelectorAll("[data-cod-behavior=chart]");',
      '    var SVG_NS = "http://www.w3.org/2000/svg";',
      '    for (var i = 0; i < roots.length; i++) {',
      '      (function (root) {',
      '        if (root.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR_CHART) return;',
      '        var rawData = parseJsonAttr(root, ATTR_CHART_DATA);',
      '        if (!Array.isArray(rawData)) return;',
      '        var items = [];',
      '        for (var r = 0; r < rawData.length; r++) {',
      '          var row = rawData[r];',
      '          if (!row || typeof row !== "object") continue;',
      '          var value = Number(row.value);',
      '          if (!isFinite(value)) continue;',
      '          items.push({ label: String(row.label == null ? "" : row.label), value: value });',
      '        }',
      '        if (!items.length) return;',
      '        var chartType = parseClass(root.getAttribute(ATTR_CHART_TYPE), DEFAULT_CHART_TYPE);',
      '        if (chartType !== "bar" && chartType !== "line") chartType = DEFAULT_CHART_TYPE;',
      '        var color = parseClass(root.getAttribute(ATTR_CHART_COLOR), DEFAULT_CHART_COLOR) || colorDeAcento(root);',
      '        var axisColor = parseClass(root.getAttribute(ATTR_CHART_AXIS_COLOR), DEFAULT_CHART_AXIS_COLOR);',
      '        var gridColor = parseClass(root.getAttribute(ATTR_CHART_GRID_COLOR), DEFAULT_CHART_GRID_COLOR);',
      '        var labelColor = parseClass(root.getAttribute(ATTR_CHART_LABEL_COLOR), DEFAULT_CHART_LABEL_COLOR);',
      '        var width = parseIndex(root.getAttribute(ATTR_CHART_WIDTH), DEFAULT_CHART_WIDTH) || DEFAULT_CHART_WIDTH;',
      '        var height = parseIndex(root.getAttribute(ATTR_CHART_HEIGHT), DEFAULT_CHART_HEIGHT) || DEFAULT_CHART_HEIGHT;',
      '        var svg = root.querySelector("svg");',
      '        if (!svg) { svg = d.createElementNS(SVG_NS, "svg"); root.insertBefore(svg, root.firstChild); }',
      '        while (svg.firstChild) svg.removeChild(svg.firstChild);',
      '        svg.setAttribute("viewBox", "0 0 " + width + " " + height);',
      '        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");',
      '        svg.setAttribute("role", "img");',
      '        svg.setAttribute("aria-label", chartType === "line" ? "Gráfico de líneas" : "Gráfico de barras");',
      '        svg.style.width = "100%";',
      '        svg.style.height = "auto";',
      '        svg.style.display = "block";',
      '        var margin = { top: 24, right: 24, bottom: 52, left: 52 };',
      '        var plotW = Math.max(0, width - margin.left - margin.right);',
      '        var plotH = Math.max(0, height - margin.top - margin.bottom);',
      '        var minValue = 0;',
      '        var maxValue = 0;',
      '        for (var v = 0; v < items.length; v++) {',
      '          minValue = Math.min(minValue, items[v].value);',
      '          maxValue = Math.max(maxValue, items[v].value);',
      '        }',
      '        if (maxValue <= minValue) maxValue = minValue + 1;',
      '        var span = maxValue - minValue;',
      '        function makeLine(x1, y1, x2, y2, stroke, strokeWidth) {',
      '          var line = d.createElementNS(SVG_NS, "line");',
      '          line.setAttribute("x1", String(x1));',
      '          line.setAttribute("y1", String(y1));',
      '          line.setAttribute("x2", String(x2));',
      '          line.setAttribute("y2", String(y2));',
      '          line.setAttribute("stroke", stroke);',
      '          line.setAttribute("stroke-width", String(strokeWidth == null ? 1 : strokeWidth));',
      '          svg.appendChild(line);',
      '        }',
      '        function makeText(content, x, y, anchor, fill, size) {',
      '          var text = d.createElementNS(SVG_NS, "text");',
      '          text.setAttribute("x", String(x));',
      '          text.setAttribute("y", String(y));',
      '          text.setAttribute("text-anchor", anchor || "middle");',
      '          text.setAttribute("fill", fill || labelColor);',
      '          text.setAttribute("font-size", String(size || 12));',
      '          text.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Arial, sans-serif");',
      '          text.textContent = content;',
      '          svg.appendChild(text);',
      '        }',
      '        function yFor(value) { return margin.top + plotH - ((value - minValue) / span) * plotH; }',
      '        function xCenter(index) {',
      '          if (items.length <= 1) return margin.left + plotW / 2;',
      '          return margin.left + (plotW * index) / (items.length - 1);',
      '        }',
      '        function formatTick(value) {',
      '          var abs = Math.abs(value);',
      '          var rounded = Number(value.toFixed(2));',
      '          if (abs >= 1000000) return String(Number((rounded / 1000000).toFixed(1))) + "M";',
      '          if (abs >= 1000) return String(Number((rounded / 1000).toFixed(1))) + "k";',
      '          return String(rounded);',
      '        }',
      '        var tickCount = 5;',
      '        for (var t = 0; t < tickCount; t++) {',
      '          var tickValue = minValue + (span * t) / (tickCount - 1);',
      '          var tickY = yFor(tickValue);',
      '          makeLine(margin.left, tickY, margin.left + plotW, tickY, gridColor, 1);',
      '          makeText(formatTick(tickValue), margin.left - 8, tickY + 4, "end", axisColor, 12);',
      '        }',
      '        var baselineY = yFor(0);',
      '        makeLine(margin.left, margin.top, margin.left, margin.top + plotH, axisColor, 1.5);',
      '        makeLine(margin.left, baselineY, margin.left + plotW, baselineY, axisColor, 1.5);',
      '        for (var x = 0; x < items.length; x++) {',
      '          makeText(items[x].label, xCenter(x), margin.top + plotH + 18, "middle", labelColor, 12);',
      '        }',
      '        if (chartType === "bar") {',
      '          var slot = items.length ? plotW / items.length : plotW;',
      '          var barWidth = Math.max(4, Math.min(64, slot * 0.72));',
      '          for (var b = 0; b < items.length; b++) {',
      '            var valueB = items[b].value;',
      '            var barX = margin.left + slot * b + (slot - barWidth) / 2;',
      '            var barY;',
      '            var barH;',
      '            if (valueB >= 0) {',
      '              barY = yFor(valueB);',
      '              barH = Math.max(0, baselineY - barY);',
      '            } else {',
      '              barY = baselineY;',
      '              barH = Math.max(0, yFor(valueB) - baselineY);',
      '            }',
      '            var rect = d.createElementNS(SVG_NS, "rect");',
      '            rect.setAttribute("x", String(barX));',
      '            rect.setAttribute("y", String(barY));',
      '            rect.setAttribute("width", String(barWidth));',
      '            rect.setAttribute("height", String(Math.max(0.5, barH)));',
      '            rect.setAttribute("rx", "2");',
      '            rect.setAttribute("fill", color);',
      '            svg.appendChild(rect);',
      '            var valueY = valueB >= 0 ? barY - 6 : barY + barH + 14;',
      '            makeText(formatTick(valueB), barX + barWidth / 2, valueY, "middle", labelColor, 11);',
      '          }',
      '        } else {',
      '          var pointList = [];',
      '          for (var p = 0; p < items.length; p++) {',
      '            pointList.push(xCenter(p) + "," + yFor(items[p].value));',
      '          }',
      '          var polyline = d.createElementNS(SVG_NS, "polyline");',
      '          polyline.setAttribute("points", pointList.join(" "));',
      '          polyline.setAttribute("fill", "none");',
      '          polyline.setAttribute("stroke", color);',
      '          polyline.setAttribute("stroke-width", "2.5");',
      '          polyline.setAttribute("stroke-linejoin", "round");',
      '          polyline.setAttribute("stroke-linecap", "round");',
      '          svg.appendChild(polyline);',
      '          for (var c = 0; c < items.length; c++) {',
      '            var cx = xCenter(c);',
      '            var cy = yFor(items[c].value);',
      '            var circle = d.createElementNS(SVG_NS, "circle");',
      '            circle.setAttribute("cx", String(cx));',
      '            circle.setAttribute("cy", String(cy));',
      '            circle.setAttribute("r", "4");',
      '            circle.setAttribute("fill", color);',
      '            circle.setAttribute("stroke", "#ffffff");',
      '            circle.setAttribute("stroke-width", "1.5");',
      '            svg.appendChild(circle);',
      '            makeText(formatTick(items[c].value), cx, cy - 8, "middle", labelColor, 11);',
      '          }',
      '        }',
      '      })(roots[i]);',
      '    }',
      '  }',
      '',
      '  function boot(w, d) {',
      '    bootHeroCollapse(w, d);',
      '    bootScroll(w, d);',
      '    bootToggle(w, d);',
      '    bootCarousel(w, d);',
      '    bootReveal(w, d);',
      '    bootParcelMap(w, d);',
      '    bootGeoMap(w, d);',
      '    bootChart(w, d);',
      '  }',
      '  if (typeof window !== "undefined" && window.document) {',
      '    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(window, document); });',
      '    else boot(window, document);',
      '  }',
      '})();',
    ].join('\n');
  }

  // --- Export: CSS (hook de las clases; reglas mínimas y reemplazables) ------
  function runtimeCss(options) {
    var opts = extend({ scrolledClass: DEFAULT_SCROLLED_CLASS }, options || {});
    return [
      '/* cod-behaviors: hooks declarativos. La animación real la define el',
      '   autor del sitio; estas reglas son conservadoras y sobreescribibles. */',
      '[data-cod-behavior="scroll-threshold"] { transition: background-color .2s ease, box-shadow .2s ease; }',
      '[data-cod-behavior="scroll-threshold"].nav--scrolled { box-shadow: 0 2px 10px rgba(0,0,0,.08); }',
      '[data-cod-behavior="nav-toggle"] { cursor: pointer; }',
      '/* carousel-basic: el runtime oculta los slides inactivos con display:none',
      '   importante; este hook permite que el autor publique también la variante',
      '   visual sin depender del runtime. */',
      '[data-cod-behavior="carousel-basic"] .cod-carousel__slide { display: none; }',
      '[data-cod-behavior="carousel-basic"] .cod-carousel__slide.is-active { display: block; }',
      '/* reveal-on-scroll: oculto hasta que el runtime agregue la clase de',
      '   revelado (o de inmediato si el entorno no tiene IntersectionObserver,',
      '   ver installRevealRuntime/bootReveal). El autor del sitio define la',
      '   transición real vía la clase; esta regla sólo evita el flash inicial. */',
      '[data-cod-behavior="reveal-on-scroll"] { opacity: 0; }',
      '[data-cod-behavior="reveal-on-scroll"].is-revealed { opacity: 1; transition: opacity .4s ease; }',
      '[data-cod-behavior="chart"] { container-type: inline-size; }',
      '[data-cod-behavior="chart"] svg { display: block; width: 100%; height: auto; overflow: visible; }',
    ].join('\n');
  }

  function buildExport(editor, options) {
    var html = editor.getHtml({ cleanId: false });
    var editorCss = typeof editor.getCss === 'function' ? editor.getCss({ avoidProtected: true }) : '';
    return {
      html: html,
      css: editorCss + '\n' + runtimeCss(options),
      js: runtimeScript(options),
    };
  }

  // --- Plugin GrapesJS -------------------------------------------------------
  function grapesjsPlugin(editor, options) {
    var opts = extend(
      {
        threshold: DEFAULT_THRESHOLD,
        scrolledClass: DEFAULT_SCROLLED_CLASS,
        toggleClass: DEFAULT_TOGGLE_CLASS,
        carouselSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
        carouselActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
        autoInstallCanvas: true,
      },
      options || {},
    );

    var attached = [];

    function componentKey(component) {
      if (!component) return '';
      if (component.cid) return 'cid:' + component.cid;
      if (typeof component.getId === 'function') return 'id:' + component.getId();
      return '';
    }

    function refresh() {
      attached = [];
      var seen = {};
      scan(editor, opts).forEach(function (comp) {
        var key = componentKey(comp);
        if (key && seen[key]) return;
        if (key) seen[key] = true;
        var behaviorName = getAttrObject(comp)[ATTR_BEHAVIOR];
        if (!behaviorName || !isAllowedBehavior(behaviorName)) behaviorName = BEHAVIOR_SCROLL_THRESHOLD;
        var desc = attachBehavior(comp, behaviorName, opts);
        if (desc) attached.push({ component: comp, descriptor: desc });
      });
      return attached;
    }

    refresh();

    // Faceta editor: live toggle dentro del iframe del canvas (si existe).
    var canvasDestroy = null;
    function installCanvasRuntime() {
      if (!opts.autoInstallCanvas) return;
      if (!editor.Canvas || typeof editor.Canvas.getDocument !== 'function') return;
      var cdoc = null;
      try { cdoc = editor.Canvas.getDocument(); } catch (e) { return; }
      if (!cdoc) return;
      var cwin = cdoc.defaultView || (editor.Canvas.getWindow && editor.Canvas.getWindow());
      if (!cwin) return;
      if (canvasDestroy) { try { canvasDestroy(); } catch (e) {} }
      canvasDestroy = createRuntime({ window: cwin, document: cdoc }, opts);
    }

    if (editor.on) {
      editor.on('load', installCanvasRuntime);
      editor.on('component:add', function (comp) {
        var declared = getAttrObject(comp)[ATTR_BEHAVIOR];
        if (declared && isAllowedBehavior(declared)) {
          attachBehavior(comp, declared, opts);
        } else if (isNavComponent(comp)) {
          attachBehavior(comp, BEHAVIOR_SCROLL_THRESHOLD, opts);
        }
      });
    }

    // API colgada en el editor para integradores (spike.mjs / tests).
    editor.ocdBehaviors = {
      scan: function () { return scan(editor); },
      refresh: refresh,
      installCanvasRuntime: installCanvasRuntime,
      runtimeScript: function (o) { return runtimeScript(extend(opts, o)); },
      runtimeCss: function (o) { return runtimeCss(extend(opts, o)); },
      buildExport: function (o) { return buildExport(editor, extend(opts, o)); },
      attached: function () { return attached.slice(); },
    };

    return editor.ocdBehaviors;
  }

  return {
    PLUGIN_ID: PLUGIN_ID,
    BEHAVIORS: BEHAVIORS,
    DEFAULTS: {
      threshold: DEFAULT_THRESHOLD,
      navSelector: DEFAULT_NAV_SELECTOR,
      scrolledClass: DEFAULT_SCROLLED_CLASS,
      toggleClass: DEFAULT_TOGGLE_CLASS,
      carouselSlideSelector: DEFAULT_CAROUSEL_SLIDE_SELECTOR,
      carouselActiveClass: DEFAULT_CAROUSEL_ACTIVE_CLASS,
    },
    ATTRS: {
      behavior: ATTR_BEHAVIOR,
      threshold: ATTR_THRESHOLD,
      toggleTarget: ATTR_TOGGLE_TARGET,
      toggleClass: ATTR_TOGGLE_CLASS,
      toggleSelfClass: ATTR_TOGGLE_SELF_CLASS,
      carouselSlideSelector: ATTR_CAROUSEL_SLIDE_SELECTOR,
      carouselActiveClass: ATTR_CAROUSEL_ACTIVE_CLASS,
      carouselStart: ATTR_CAROUSEL_START,
      carouselNext: ATTR_CAROUSEL_NEXT,
      carouselPrev: ATTR_CAROUSEL_PREV,
      carouselDots: ATTR_CAROUSEL_DOTS,
      parcelItemSelector: ATTR_PARCEL_ITEM_SELECTOR,
      parcelIdAttr: ATTR_PARCEL_ID_ATTR,
      parcelEstado: ATTR_PARCEL_ESTADO,
      parcelValor: ATTR_PARCEL_VALOR,
      geoPlaces: ATTR_GEO_PLACES,
      geoCategories: ATTR_GEO_CATEGORIES,
      geoSvg: ATTR_GEO_SVG,
      geoSelectCategoria: ATTR_GEO_SELECT_CATEGORIA,
      geoSelectLugar: ATTR_GEO_SELECT_LUGAR,
      chartType: ATTR_CHART_TYPE,
      chartData: ATTR_CHART_DATA,
      chartColor: ATTR_CHART_COLOR,
      chartAxisColor: ATTR_CHART_AXIS_COLOR,
      chartGridColor: ATTR_CHART_GRID_COLOR,
      chartLabelColor: ATTR_CHART_LABEL_COLOR,
      chartWidth: ATTR_CHART_WIDTH,
      chartHeight: ATTR_CHART_HEIGHT,
    },
    isAllowedBehavior: isAllowedBehavior,
    parseThreshold: parseThreshold,
    scan: scan,
    attachToComponent: attachToComponent,
    createRuntime: createRuntime,
    runtimeScript: runtimeScript,
    runtimeCss: runtimeCss,
    buildExport: buildExport,
    grapesjsPlugin: grapesjsPlugin,
  };
});
