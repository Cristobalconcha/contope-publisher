/*!
 * ocd-interactions.js â€” interacciones tipo Webflow (MVP) para Open CoDesign Publisher.
 *
 * PRIMERA VERSIÃ“N LIMITADA. No es un motor generalizado de interacciones:
 * sÃ³lo admite dos disparadores y dos estados:
 *
 *   - "load"   â†’ al cargar la pÃ¡gina: se aplica el estado inicial y se transiciona
 *                al estado final durante `trigger.duration` ms (por defecto 600).
 *   - "scroll" â†’ al hacer scroll: se interpola entre el estado inicial y el final
 *                segÃºn el progreso scrollY / `trigger.threshold` px (umbral).
 *
 * Modelo de datos persistido como atributo declarativo `data-ocd-interaction`
 * (JSON). Sobrevive al saneado de WordPress (wp_kses admite `data-*`):
 *
 *   {
 *     "trigger": { "tipo": "load" | "scroll", "threshold": 200, "duration": 600 },
 *     "states": [
 *       { "label": "inicio", "properties": { "position": "...", "top": "...", ... } },
 *       { "label": "fin",    "properties": { ... } }
 *     ]
 *   }
 *
 * Propiedades permitidas (allowlist, sin eval/Function â€” ver README de
 * ocd-behaviors.js): position, top, left, right, bottom, transform, opacity.
 * El runtime sÃ³lo escribe esas propiedades vÃ­a `style.setProperty`; cualquier
 * otra clave del JSON se descarta en `parseInteraction`.
 *
 * InterpolaciÃ³n (documentaciÃ³n de decisiones):
 *   - `transform`  â†’ matrices 2D `matrix(...)` interpoladas numÃ©ricamente
 *                    (6 componentes). `none` se normaliza a identidad. matrix3d
 *                    no se interpola (escalÃ³n).
 *   - `opacity`    â†’ nÃºmero interpolado.
 *   - top/left/right/bottom â†’ longitud interpolada SOLO si ambas comparten unidad
 *                    (px/px, %/%, etc.). Unidades distintas o `auto` â†’ escalÃ³n.
 *   - `position` y cualquier valor no numÃ©rico â†’ escalÃ³n: se aplica el valor
 *     inicial mientras progress < 1 y el final cuando progress === 1.
 *
 * El runtime es singleton POR DOCUMENTO (clave `__ocdInteractionsRuntime`): la
 * instalaciÃ³n mÃ¡s reciente reemplaza a la anterior para no duplicar listeners.
 * Se usa tanto en el iframe del editor (editor-core / inspector) como en el
 * sitio publicado (ocd-canvas-public.js) â€” un Ãºnico archivo compartido, a
 * diferencia de la duplicaciÃ³n histÃ³rica de ocd-behaviors/ocd-canvas-public.
 *
 * Carga sin bundler (mismo patrÃ³n UMD que ocd-behaviors.js):
 *   <script src="ocd-interactions.js"></script> â†’ window.OcdInteractions.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.OcdInteractions = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PLUGIN_ID = 'ocd-interactions';
  var ATTR = 'data-ocd-interaction';
  var TRIGGER_LOAD = 'load';
  var TRIGGER_SCROLL = 'scroll';
  var STATE_INITIAL = 'inicio';
  var STATE_FINAL = 'fin';
  var DEFAULT_LOAD_DURATION = 600;
  var DEFAULT_SCROLL_THRESHOLD = 200;
  var RUNTIME_KEY = '__ocdInteractionsRuntime';
  var PROPERTIES = ['position', 'top', 'left', 'right', 'bottom', 'transform', 'opacity'];
  var LENGTH_KEYS = { top: true, left: true, right: true, bottom: true };

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function toFiniteNumber(value, fallback) {
    var n = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampProgress(value) {
    if (!Number.isFinite(value)) return 0;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function round3(value) {
    return Math.round(value * 1000) / 1000;
  }

  /**
   * Filtra un objeto de propiedades crudas y conserva sÃ³lo las claves de la
   * allowlist PROPERTIES, con valor normalizado a string no vacÃ­o. Cualquier
   * otra cosa se descarta (nunca llega al DOM).
   */
  function pickProperties(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (var i = 0; i < PROPERTIES.length; i++) {
      var name = PROPERTIES[i];
      var value = raw[name];
      if (value === undefined || value === null) continue;
      var text = String(value).trim();
      if (text === '') continue;
      out[name] = text;
    }
    return out;
  }

  /**
   * Parsea y normaliza el JSON de `data-ocd-interaction`. Devuelve null ante
   * cualquier forma invÃ¡lida (JSON roto, disparador no allowlisted, menos de
   * dos estados, etc.) para que el runtime lo ignore en silencio.
   */
  function parseModel(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    var model = null;
    try {
      model = JSON.parse(raw);
    } catch (_error) {
      return null;
    }
    if (!model || typeof model !== 'object' || Array.isArray(model)) return null;

    var trigger = model.trigger;
    if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) return null;
    var tipo = trigger.tipo;
    if (tipo !== TRIGGER_LOAD && tipo !== TRIGGER_SCROLL) return null;

    var states = model.states;
    if (!Array.isArray(states) || states.length < 2) return null;

    var normalizedTrigger = { tipo: tipo };
    if (tipo === TRIGGER_SCROLL) {
      normalizedTrigger.threshold = Math.max(0, toFiniteNumber(trigger.threshold, DEFAULT_SCROLL_THRESHOLD));
    } else {
      normalizedTrigger.duration = Math.max(0, toFiniteNumber(trigger.duration, DEFAULT_LOAD_DURATION));
    }

    return {
      trigger: normalizedTrigger,
      states: [
        { label: STATE_INITIAL, properties: pickProperties(states[0] && states[0].properties) },
        { label: STATE_FINAL, properties: pickProperties(states[1] && states[1].properties) }
      ]
    };
  }

  function parseInteraction(attributes) {
    return parseModel(attributes && attributes[ATTR]);
  }

  /**
   * Construye un modelo canÃ³nico a partir del disparador y de dos bloques de
   * propiedades (`states` = [{properties}, {properties}]).
   */
  function buildInteraction(trigger, states) {
    var triggerObject = trigger && typeof trigger === 'object' && !Array.isArray(trigger) ? trigger : {};
    var tipo = triggerObject.tipo === TRIGGER_LOAD ? TRIGGER_LOAD : TRIGGER_SCROLL;
    var model = { trigger: { tipo: tipo }, states: [] };
    if (tipo === TRIGGER_SCROLL) {
      model.trigger.threshold = Math.max(0, toFiniteNumber(triggerObject.threshold, DEFAULT_SCROLL_THRESHOLD));
    } else {
      model.trigger.duration = Math.max(0, toFiniteNumber(triggerObject.duration, DEFAULT_LOAD_DURATION));
    }
    model.states = [
      { label: STATE_INITIAL, properties: pickProperties(states && states[0] && states[0].properties) },
      { label: STATE_FINAL, properties: pickProperties(states && states[1] && states[1].properties) }
    ];
    return model;
  }

  function serializeInteraction(model) {
    if (!model) return '';
    try {
      return JSON.stringify(model);
    } catch (_error) {
      return '';
    }
  }

  /**
   * Captura el estado actual de un elemento del lienzo (snapshot) leyendo sus
   * estilos computados, sÃ³lo para las propiedades allowlisted. Se usa desde el
   * inspector para "Fijar estado inicial/final".
   */
  function captureState(element) {
    if (!element || !element.ownerDocument) return null;
    var view = element.ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') return null;
    var computed = null;
    try {
      computed = view.getComputedStyle(element);
    } catch (_error) {
      return null;
    }
    if (!computed) return null;
    var out = {};
    for (var i = 0; i < PROPERTIES.length; i++) {
      var name = PROPERTIES[i];
      var value = '';
      try {
        value = computed.getPropertyValue(name);
      } catch (_error) {
        continue;
      }
      if (value == null) continue;
      value = String(value).trim();
      if (value === '') continue;
      out[name] = value;
    }
    return out;
  }

  function parseMatrix(text) {
    if (text == null) return null;
    var value = String(text).trim();
    if (value === '' || value === 'none') return [1, 0, 0, 1, 0, 0];
    var match = /matrix\(\s*([^)]+)\s*\)/.exec(value);
    if (!match) return null;
    var parts = match[1].split(/[,\s]+/);
    var numbers = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '') continue;
      var n = Number.parseFloat(parts[i]);
      if (!Number.isFinite(n)) return null;
      numbers.push(n);
    }
    if (numbers.length !== 6) return null;
    return numbers;
  }

  function interpolateMatrix(fromText, toText, progress) {
    var from = parseMatrix(fromText);
    var to = parseMatrix(toText);
    if (!from || !to) return progress >= 1 ? toText : fromText;
    var out = [];
    for (var i = 0; i < 6; i++) {
      out.push(round3(from[i] + (to[i] - from[i]) * progress));
    }
    return 'matrix(' + out.join(', ') + ')';
  }

  function parseLength(text) {
    if (text == null) return null;
    var value = String(text).trim();
    if (value === '' || value === 'auto' || value === 'none' || value === 'normal') return null;
    var match = /^(-?\d*\.?\d+)(px|%|em|rem|vh|vw|vmin|vmax|pt|pc|in|cm|mm|ex|ch)?$/.exec(value);
    if (!match) return null;
    return { value: Number.parseFloat(match[1]), unit: match[2] || '' };
  }

  function interpolateLength(fromText, toText, progress) {
    var from = parseLength(fromText);
    var to = parseLength(toText);
    if (!from || !to || from.unit !== to.unit) return progress >= 1 ? toText : fromText;
    return String(round3(from.value + (to.value - from.value) * progress)) + from.unit;
  }

  function interpolateNumber(fromText, toText, progress) {
    var from = Number.parseFloat(fromText);
    var to = Number.parseFloat(toText);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return progress >= 1 ? toText : fromText;
    return String(round3(from + (to - from) * progress));
  }

  function interpolateProperty(name, fromText, toText, progress) {
    if (name === 'transform') return interpolateMatrix(fromText, toText, progress);
    if (name === 'opacity') return interpolateNumber(fromText, toText, progress);
    if (LENGTH_KEYS[name]) return interpolateLength(fromText, toText, progress);
    return progress >= 1 ? toText : fromText;
  }

  function applyProperties(element, properties) {
    if (!element || !element.style) return;
    for (var name in properties) {
      if (!own(properties, name)) continue;
      var value = properties[name];
      if (value === '' || value == null) element.style.removeProperty(name);
      else element.style.setProperty(name, value);
    }
  }

  function applyInterpolated(element, initial, final, progress) {
    if (!element || !element.style) return;
    var keys = {};
    var name;
    for (name in initial.properties) if (own(initial.properties, name)) keys[name] = true;
    for (name in final.properties) if (own(final.properties, name)) keys[name] = true;
    for (var key in keys) {
      if (!own(keys, key)) continue;
      var from = initial.properties[key] || '';
      var to = final.properties[key] || '';
      var value = interpolateProperty(key, from, to, progress);
      if (value === '' || value == null) element.style.removeProperty(key);
      else element.style.setProperty(key, value);
    }
  }

  function scrollProgress(win, threshold) {
    var scrollY = 0;
    try {
      scrollY = win.scrollY || win.pageYOffset || 0;
    } catch (_error) {
      scrollY = 0;
    }
    if (!threshold || threshold <= 0) return scrollY > 0 ? 1 : 0;
    return clampProgress(scrollY / threshold);
  }

  function transitionCss(duration) {
    var props = ['transform', 'opacity', 'top', 'left', 'right', 'bottom'];
    var parts = [];
    for (var i = 0; i < props.length; i++) {
      parts.push(props[i] + ' ' + duration + 'ms ease');
    }
    return parts.join(', ');
  }

  function installScrollController(win, element, model) {
    var initial = model.states[0];
    var final = model.states[1];
    var threshold = model.trigger.threshold;
    function update() {
      applyInterpolated(element, initial, final, scrollProgress(win, threshold));
    }
    update();
    if (typeof win.addEventListener === 'function') {
      win.addEventListener('scroll', update, { passive: true });
      win.addEventListener('resize', update, { passive: true });
    }
    return function destroy() {
      if (typeof win.removeEventListener === 'function') {
        win.removeEventListener('scroll', update);
        win.removeEventListener('resize', update);
      }
    };
  }

  function installLoadController(win, element, model) {
    var initial = model.states[0];
    var final = model.states[1];
    var duration = model.trigger.duration;
    var cleanups = [];
    var requestFrame = typeof win.requestAnimationFrame === 'function'
      ? function (fn) { return win.requestAnimationFrame(fn); }
      : function (fn) { return win.setTimeout(fn, 16); };

    applyProperties(element, initial.properties);
    var rafId = requestFrame(function () {
      element.style.setProperty('transition', transitionCss(duration));
      applyProperties(element, final.properties);
    });
    cleanups.push(function () {
      if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(rafId);
      else win.clearTimeout(rafId);
    });
    var clearTimer = win.setTimeout(function () {
      element.style.removeProperty('transition');
    }, duration + 80);
    cleanups.push(function () { win.clearTimeout(clearTimer); });

    return function destroy() {
      for (var i = 0; i < cleanups.length; i++) {
        try { cleanups[i](); } catch (_error) { /* noop */ }
      }
      element.style.removeProperty('transition');
    };
  }

  /**
   * NÃºcleo sin GrapesJS. `env` = { window, document } del contexto (iframe del
   * editor o documento publicado). Devuelve { destroy }.
   */
  function createRuntime(env, options) {
    var opts = options || {};
    var win = env && env.window;
    var doc = env && env.document;
    var noopDestroy = function () {};
    if (!win || !doc) return { destroy: noopDestroy };

    // Singleton por documento: reemplaza la instalaciÃ³n anterior.
    if (doc[RUNTIME_KEY] && typeof doc[RUNTIME_KEY].destroy === 'function') {
      try { doc[RUNTIME_KEY].destroy(); } catch (_error) { /* noop */ }
    }

    var nodes = [];
    try {
      nodes = doc.querySelectorAll('[' + ATTR + ']');
    } catch (_error) {
      nodes = [];
    }
    var cleanups = [];
    Array.prototype.forEach.call(nodes, function (element) {
      var model = parseModel(element.getAttribute(ATTR));
      if (!model) return;
      if (model.trigger.tipo === TRIGGER_SCROLL) {
        cleanups.push(installScrollController(win, element, model));
      } else {
        cleanups.push(installLoadController(win, element, model));
      }
    });

    var runtime = {
      destroy: function () {
        for (var i = 0; i < cleanups.length; i++) {
          try { cleanups[i](); } catch (_error) { /* noop */ }
        }
        cleanups = [];
        if (doc[RUNTIME_KEY] === runtime) doc[RUNTIME_KEY] = null;
      }
    };
    doc[RUNTIME_KEY] = runtime;
    return runtime;
  }

  return {
    PLUGIN_ID: PLUGIN_ID,
    ATTR: ATTR,
    TRIGGER_LOAD: TRIGGER_LOAD,
    TRIGGER_SCROLL: TRIGGER_SCROLL,
    STATE_INITIAL: STATE_INITIAL,
    STATE_FINAL: STATE_FINAL,
    PROPERTIES: PROPERTIES.slice(),
    DEFAULT_LOAD_DURATION: DEFAULT_LOAD_DURATION,
    DEFAULT_SCROLL_THRESHOLD: DEFAULT_SCROLL_THRESHOLD,
    parseInteraction: parseInteraction,
    parseModel: parseModel,
    buildInteraction: buildInteraction,
    serializeInteraction: serializeInteraction,
    captureState: captureState,
    createRuntime: createRuntime
  };
});


