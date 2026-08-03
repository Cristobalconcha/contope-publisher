/*!
 * ocd-behaviors.js — capa de comportamiento declarativo para GrapesJS (spike).
 *
 * Objetivo del spike: recuperar UN solo comportamiento perdido al pasar el
 * sitio React de Santa Luisa por DOM renderizado → GrapesJS: el menú `.nav`
 * que cambia de estado al hacer scroll. Ver README.md "Límites todavía
 * abiertos": "Los handlers y estados React no sobreviven automáticamente al
 * paso por DOM renderizado; requieren tipos semánticos o una capa de
 * comportamiento preservada." Este archivo es esa capa, reducida a una única
 * conducta.
 *
 * Carga SIN BUNDLER (tres vías equivalentes):
 *   1) Navegador, script clásico:
 *        <script src="./plugins/ocd-behaviors.js"></script>
 *        → expone window.OcdBehaviors.
 *   2) Node / ESM (raíz del repo es "type":"module"):
 *        import OcdBehaviors from './plugins/ocd-behaviors.js'
 *        → default export = este objeto (la carpeta plugins/ es CommonJS).
 *   3) Node / CJS:
 *        const OcdBehaviors = require('./plugins/ocd-behaviors.js')
 *
 * SEGURIDAD — conducta declarativa con allowlist:
 *   El runtime NUNCA evalúa código importado ni del usuario (sin eval/Function/
 *   setTimeout(string)). Sólo reconoce el valor literal "scroll-threshold"
 *   dentro del allowlist BEHAVIORS y lee atributos numéricos validados. Cualquier
 *   otro valor de `data-ocd-behavior` se ignora. No hay superficie para
 *   ejecutar código arbitrario.
 *
 * CONTRATO PÚBLICO (API):
 *   OcdBehaviors.PLUGIN_ID            → "ocd-behaviors"
 *   OcdBehaviors.BEHAVIORS            → { "scroll-threshold": {...} }  (allowlist)
 *   OcdBehaviors.DEFAULTS             → { threshold, navSelector, scrolledClass }
 *   OcdBehaviors.ATTRS                → { behavior, threshold }  (nombres data-*)
 *   OcdBehaviors.isAllowedBehavior(name)
 *   OcdBehaviors.parseThreshold(raw, fallback)
 *   OcdBehaviors.scan(editor)                       → [Component, ...]  navs con clase .nav
 *   OcdBehaviors.attachToComponent(component, opts) → descriptor persistido
 *   OcdBehaviors.createRuntime(env, opts)           → destroy()  (núcleo, sin GrapesJS)
 *   OcdBehaviors.runtimeScript(opts)                → string JS funcional para export
 *   OcdBehaviors.runtimeCss(opts)                   → string CSS para export
 *   OcdBehaviors.buildExport(editor, opts)          → { html, css, js }
 *   OcdBehaviors.grapesjsPlugin(editor, opts)       → plugin GrapesJS (editor.use / Plugin.add)
 *
 *   Integración en spike.mjs (documentada, no invasiva):
 *     import OcdBehaviors from './plugins/ocd-behaviors.js';
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

  var PLUGIN_ID = 'ocd-behaviors';
  var BEHAVIOR_SCROLL_THRESHOLD = 'scroll-threshold';
  var ATTR_BEHAVIOR = 'data-ocd-behavior';
  var ATTR_THRESHOLD = 'data-ocd-scroll-threshold';
  var DEFAULT_NAV_SELECTOR = '.nav';
  var DEFAULT_SCROLLED_CLASS = 'nav--scrolled';
  var DEFAULT_THRESHOLD = 40;

  // --- Allowlist: el runtime sólo ejecuta conductas registradas aquí. -------
  var BEHAVIORS = {};
  BEHAVIORS[BEHAVIOR_SCROLL_THRESHOLD] = {
    name: BEHAVIOR_SCROLL_THRESHOLD,
    defaultThreshold: DEFAULT_THRESHOLD,
    scrolledClass: DEFAULT_SCROLLED_CLASS,
    description: 'Alterna la clase nav--scrolled cuando scrollY supera el umbral.',
  };

  function isAllowedBehavior(name) {
    return Object.prototype.hasOwnProperty.call(BEHAVIORS, name);
  }

  function parseThreshold(raw, fallback) {
    var n = parseFloat(raw);
    return isFinite(n) && n >= 0 ? n : fallback;
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
    return getTagName(component) === 'nav' && hasNavClass(component);
  }

  function walkComponents(component, cb) {
    cb(component);
    var comps = component && component.components && component.components();
    if (comps && typeof comps.each === 'function') comps.each(function (c) { walkComponents(c, cb); });
    else if (comps && Array.isArray(comps.models)) comps.models.forEach(function (m) { walkComponents(m, cb); });
  }

  function scan(editor, options) {
    var opts = extend({ navClass: 'nav' }, options || {});
    var wrapper = editor && editor.getWrapper && editor.getWrapper();
    var found = [];
    if (!wrapper) return found;
    walkComponents(wrapper, function (comp) {
      if (getTagName(comp) === 'nav') {
        var cls = getAttrObject(comp).class || '';
        if (String(cls).split(/\s+/).indexOf(opts.navClass) !== -1) found.push(comp);
      }
    });
    return found;
  }

  // --- Persistencia en el modelo (data attributes portables) ----------------
  function attachToComponent(component, options) {
    var opts = extend({ threshold: DEFAULT_THRESHOLD, scrolledClass: DEFAULT_SCROLLED_CLASS }, options || {});
    if (!component || typeof component.addAttributes !== 'function') return null;

    var current = getAttrObject(component);
    var patch = {};
    patch[ATTR_BEHAVIOR] = BEHAVIOR_SCROLL_THRESHOLD;
    if (current[ATTR_THRESHOLD] == null || current[ATTR_THRESHOLD] === '') {
      patch[ATTR_THRESHOLD] = String(opts.threshold);
    } else {
      // normaliza y reescribe el umbral existente como número válido
      patch[ATTR_THRESHOLD] = String(parseThreshold(current[ATTR_THRESHOLD], opts.threshold));
    }
    component.addAttributes(patch);

    // Trait opcional para edición visual en el Trait Manager (no fatal si la API difiere).
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

    var after = getAttrObject(component);
    return {
      behavior: BEHAVIOR_SCROLL_THRESHOLD,
      threshold: parseThreshold(after[ATTR_THRESHOLD], opts.threshold),
      scrolledClass: opts.scrolledClass,
    };
  }

  // --- Núcleo del runtime (sin GrapesJS; reutilizado por editor y export) ---
  // env: { window, document }. Devuelve destroy().
  function createRuntime(env, options) {
    var opts = extend(
      { navSelector: DEFAULT_NAV_SELECTOR, scrolledClass: DEFAULT_SCROLLED_CLASS, defaultThreshold: DEFAULT_THRESHOLD, autoRemove: true },
      options || {},
    );
    var win = env && env.window ? env.window : env;
    var doc = env && env.document ? env.document : win ? win.document : (typeof document !== 'undefined' ? document : null);
    if (!win || !doc || typeof doc.querySelectorAll !== 'function') return function () {};

    var cleanups = [];
    var nodes = doc.querySelectorAll(opts.navSelector);
    for (var i = 0; i < nodes.length; i++) {
      (function (nav) {
        // Puerta de allowlist: sólo actúa si el nodo declara una conducta reconocida.
        var declared = nav.getAttribute(ATTR_BEHAVIOR);
        if (!isAllowedBehavior(declared) || declared !== BEHAVIOR_SCROLL_THRESHOLD) return;

        var threshold = parseThreshold(nav.getAttribute(ATTR_THRESHOLD), opts.defaultThreshold);
        nav.setAttribute(ATTR_BEHAVIOR, BEHAVIOR_SCROLL_THRESHOLD);
        nav.setAttribute(ATTR_THRESHOLD, String(threshold));

        function readScrollY() {
          if (typeof win.scrollY === 'number') return win.scrollY;
          if (typeof win.pageYOffset === 'number') return win.pageYOffset;
          if (doc.documentElement && doc.documentElement.scrollTop) return doc.documentElement.scrollTop;
          if (doc.body && doc.body.scrollTop) return doc.body.scrollTop;
          return 0;
        }
        function update() {
          nav.classList.toggle(opts.scrolledClass, readScrollY() > threshold);
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
          if (opts.autoRemove) nav.classList.remove(opts.scrolledClass);
        });
      })(nodes[i]);
    }
    return function destroy() { while (cleanups.length) cleanups.pop()(); };
  }

  // --- Export: JS funcional (string). Sólo constantes allowlisted. ----------
  function runtimeScript(options) {
    var opts = extend(
      { navSelector: DEFAULT_NAV_SELECTOR, scrolledClass: DEFAULT_SCROLLED_CLASS, defaultThreshold: DEFAULT_THRESHOLD },
      options || {},
    );
    // Los valores interpolados provienen de constantes propias (no de input);
    // el nombre de conducta es el literal allowlisted. Sin evaluación de código externo.
    return [
      '/* ocd-behaviors runtime: scroll-threshold (allowlisted). Sin eval/Function. */',
      '(function () {',
      '  var ATTR_BEHAVIOR = "data-ocd-behavior";',
      '  var ATTR_THRESHOLD = "data-ocd-scroll-threshold";',
      '  var BEHAVIOR = "scroll-threshold";',
      '  var SELECTOR = ' + JSON.stringify(opts.navSelector) + ';',
      '  var SCROLLED_CLASS = ' + JSON.stringify(opts.scrolledClass) + ';',
      '  var DEFAULT_THRESHOLD = ' + Number(opts.defaultThreshold) + ';',
      '  function parseThreshold(raw, fallback) { var n = parseFloat(raw); return isFinite(n) && n >= 0 ? n : fallback; }',
      '  function boot(w, d) {',
      '    var nodes = d.querySelectorAll(SELECTOR);',
      '    for (var i = 0; i < nodes.length; i++) {',
      '      (function (nav) {',
      '        if (nav.getAttribute(ATTR_BEHAVIOR) !== BEHAVIOR) return;',
      '        var threshold = parseThreshold(nav.getAttribute(ATTR_THRESHOLD), DEFAULT_THRESHOLD);',
      '        nav.setAttribute(ATTR_THRESHOLD, String(threshold));',
      '        function readY() {',
      '          if (typeof w.scrollY === "number") return w.scrollY;',
      '          if (typeof w.pageYOffset === "number") return w.pageYOffset;',
      '          return (d.documentElement && d.documentElement.scrollTop) || (d.body && d.body.scrollTop) || 0;',
      '        }',
      '        function update() { nav.classList.toggle(SCROLLED_CLASS, readY() > threshold); }',
      '        update();',
      '        w.addEventListener("scroll", update, { passive: true });',
      '        w.addEventListener("resize", update, { passive: true });',
      '      })(nodes[i]);',
      '    }',
      '  }',
      '  if (typeof window !== "undefined" && window.document) {',
      '    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(window, document); });',
      '    else boot(window, document);',
      '  }',
      '})();',
    ].join('\n');
  }

  // --- Export: CSS (hook de la clase; regla visual mínima y reemplazable) ---
  function runtimeCss(options) {
    var opts = extend({ scrolledClass: DEFAULT_SCROLLED_CLASS }, options || {});
    return [
      '/* ocd-behaviors: hook scroll-threshold. La animación real la define el',
      '   autor del sitio; estas reglas son conservadoras y sobreescribibles. */',
      '.nav { transition: background-color .2s ease, box-shadow .2s ease; }',
      '.nav.nav--scrolled { box-shadow: 0 2px 10px rgba(0,0,0,.08); }',
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
      { threshold: DEFAULT_THRESHOLD, scrolledClass: DEFAULT_SCROLLED_CLASS, autoInstallCanvas: true },
      options || {},
    );

    var attached = [];

    function refresh() {
      attached = [];
      scan(editor).forEach(function (comp) {
        var desc = attachToComponent(comp, opts);
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
        if (isNavComponent(comp)) attachToComponent(comp, opts);
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
    },
    ATTRS: { behavior: ATTR_BEHAVIOR, threshold: ATTR_THRESHOLD },
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
