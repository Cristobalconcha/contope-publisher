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
  var ATTR_CHART_TYPE = 'data-cod-chart-type';
  var ATTR_CHART_DATA = 'data-cod-chart-data';
  var ATTR_CHART_COLOR = 'data-cod-chart-color';
  var ATTR_CHART_AXIS_COLOR = 'data-cod-chart-axis-color';
  var ATTR_CHART_GRID_COLOR = 'data-cod-chart-grid-color';
  var ATTR_CHART_LABEL_COLOR = 'data-cod-chart-label-color';
  var ATTR_CHART_WIDTH = 'data-cod-chart-width';
  var ATTR_CHART_HEIGHT = 'data-cod-chart-height';
  var DEFAULT_CHART_TYPE = 'bar';
  var DEFAULT_CHART_COLOR = '#2271b1';
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

  function isAllowedBehavior(name) {
    return Object.prototype.hasOwnProperty.call(BEHAVIORS, name);
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
          if (fieldVal) fieldVal.textContent = esDisponible && valor ? valor : '—';
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
        var color = parseClass(root.getAttribute(ATTR_CHART_COLOR), DEFAULT_CHART_COLOR);
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
      '          if (fieldVal) fieldVal.textContent = esDisponible && valor ? valor : "—";',
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
      '        var color = parseClass(root.getAttribute(ATTR_CHART_COLOR), DEFAULT_CHART_COLOR);',
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
