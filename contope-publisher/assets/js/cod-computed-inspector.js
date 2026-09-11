(function installOcdComputedInspector(global) {
  'use strict';

  const DEFAULT_PROPERTIES = [
    ['border-top-left-radius', 'Radio superior izquierdo'],
    ['border-top-right-radius', 'Radio superior derecho'],
    ['border-bottom-right-radius', 'Radio inferior derecho'],
    ['border-bottom-left-radius', 'Radio inferior izquierdo'],
    ['width', 'Ancho'],
    ['height', 'Alto'],
    ['min-height', 'Alto mínimo'],
    ['max-width', 'Ancho máximo'],
    ['display', 'Display'],
    ['grid-template-columns', 'Columnas'],
    ['gap', 'Separación'],
    ['padding', 'Padding'],
    ['margin', 'Margen'],
    ['background-color', 'Fondo'],
    ['color', 'Color'],
    ['fill', 'Relleno SVG'],
    ['stroke', 'Trazo SVG'],
    ['font-family', 'Tipografía'],
    ['font-size', 'Tamaño tipográfico'],
  ];

  const INHERITED_PROPERTIES = new Set([
    'color',
    'cursor',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'line-height',
    'text-align',
    'text-transform',
    'visibility',
  ]);

  const SHORTHAND_CANDIDATES = {
    'border-top-left-radius': ['border-radius'],
    'border-top-right-radius': ['border-radius'],
    'border-bottom-right-radius': ['border-radius'],
    'border-bottom-left-radius': ['border-radius'],
    'padding-top': ['padding'],
    'padding-right': ['padding'],
    'padding-bottom': ['padding'],
    'padding-left': ['padding'],
    'margin-top': ['margin'],
    'margin-right': ['margin'],
    'margin-bottom': ['margin'],
    'margin-left': ['margin'],
    'column-gap': ['gap'],
    'row-gap': ['gap'],
  };

  // Etiquetas de "contenido" que puede tomar el control universal "Fuente de
  // contenido": título/párrafo/botón/etiqueta de texto. Los contenedores
  // estructurales (sección/fila/columnas) son <section>/<div> y quedan fuera
  // a propósito porque no están en esta lista.
  const DYNAMIC_TEXT_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'span', 'a', 'button', 'label', 'li', 'strong', 'em',
  ]);

  function splitSelectors(selectorText) {
    const result = [];
    let current = '';
    let round = 0;
    let square = 0;
    let quote = '';
    for (const character of selectorText || '') {
      if (quote) {
        current += character;
        if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        current += character;
      } else if (character === '(') {
        round += 1;
        current += character;
      } else if (character === ')') {
        round -= 1;
        current += character;
      } else if (character === '[') {
        square += 1;
        current += character;
      } else if (character === ']') {
        square -= 1;
        current += character;
      } else if (character === ',' && round === 0 && square === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
      } else {
        current += character;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  function specificity(selector) {
    const withoutWhere = selector.replace(/:where\([^)]*\)/g, '');
    const ids = (withoutWhere.match(/#[\w-]+/g) || []).length;
    const classes = (withoutWhere.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || [])
      .length;
    const cleaned = withoutWhere
      .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?/g, ' ')
      .replace(/[>*+~]/g, ' ');
    const types = (cleaned.match(/(?:^|\s)[a-zA-Z][\w-]*/g) || []).length;
    return [0, ids, classes, types];
  }

  function compareSpecificity(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
  }

  function safeMatches(element, selector) {
    if (!selector || selector.includes('::')) return false;
    try {
      return element.matches(selector);
    } catch (_error) {
      return false;
    }
  }

  function walkCssRules(window, rules, callback, context, counter) {
    if (!rules) return;
    for (const rule of rules) {
      const nextOrder = counter.value;
      counter.value += 1;
      if (rule.type === window.CSSRule.STYLE_RULE) {
        callback(rule, { ...context, order: nextOrder });
        continue;
      }

      const nestedRules = rule.cssRules;
      if (!nestedRules) continue;
      if (rule.type === window.CSSRule.MEDIA_RULE && !window.matchMedia(rule.conditionText).matches) {
        continue;
      }
      if (
        typeof window.CSSSupportsRule !== 'undefined' &&
        rule instanceof window.CSSSupportsRule &&
        window.CSS &&
        typeof window.CSS.supports === 'function' &&
        !window.CSS.supports(rule.conditionText)
      ) {
        continue;
      }
      walkCssRules(
        window,
        nestedRules,
        callback,
        { ...context, atRule: rule.conditionText || rule.name || context.atRule },
        counter,
      );
    }
  }

  function styleSheetsFor(document) {
    const results = [];
    for (const sheet of document.styleSheets) {
      try {
        results.push({
          sheet,
          rules: sheet.cssRules,
          source:
            sheet.href ||
            sheet.ownerNode?.dataset?.ocdRawCss ||
            sheet.ownerNode?.id ||
            'estilo embebido',
        });
      } catch (_error) {
        results.push({ sheet, rules: null, source: sheet.href || 'hoja de estilo inaccesible' });
      }
    }
    return results;
  }

  function declarationCandidates(element, property) {
    const document = element.ownerDocument;
    const window = document.defaultView;
    const candidates = [];
    const counter = { value: 0 };

    for (const { rules, source } of styleSheetsFor(document)) {
      walkCssRules(
        window,
        rules,
        (rule, context) => {
          const matchingSelectors = splitSelectors(rule.selectorText).filter((selector) =>
            safeMatches(element, selector),
          );
          if (!matchingSelectors.length) return;
          const declaredProperty = [property, ...(SHORTHAND_CANDIDATES[property] || [])].find(
            (candidate) => rule.style.getPropertyValue(candidate),
          );
          const value = declaredProperty ? rule.style.getPropertyValue(declaredProperty) : '';
          if (!value) return;
          const selector = matchingSelectors.sort((left, right) =>
            compareSpecificity(specificity(right), specificity(left)),
          )[0];
          candidates.push({
            selector,
            property: declaredProperty,
            value: value.trim(),
            important: rule.style.getPropertyPriority(declaredProperty) === 'important',
            specificity: specificity(selector),
            order: context.order,
            source,
            atRule: context.atRule || '',
            inheritedFrom: null,
          });
        },
        { source, atRule: '' },
        counter,
      );
    }

    const inlineProperty = [property, ...(SHORTHAND_CANDIDATES[property] || [])].find((candidate) =>
      element.style.getPropertyValue(candidate),
    );
    const inlineValue = inlineProperty ? element.style.getPropertyValue(inlineProperty) : '';
    if (inlineValue) {
      candidates.push({
        selector: 'style="…"',
        property: inlineProperty,
        value: inlineValue.trim(),
        important: element.style.getPropertyPriority(inlineProperty) === 'important',
        specificity: [1, 0, 0, 0],
        order: Number.MAX_SAFE_INTEGER,
        source: 'estilo local',
        atRule: '',
        inheritedFrom: null,
      });
    }
    return candidates;
  }

  function winningCandidate(element, property) {
    const candidates = declarationCandidates(element, property);
    candidates.sort((left, right) => {
      if (left.important !== right.important) return left.important ? 1 : -1;
      const specificityResult = compareSpecificity(left.specificity, right.specificity);
      return specificityResult || left.order - right.order;
    });
    const winner = candidates.at(-1) || null;
    if (winner || !INHERITED_PROPERTIES.has(property)) return winner;
    const parent = element.parentElement;
    if (!parent) return null;
    const inherited = winningCandidate(parent, property);
    return inherited
      ? { ...inherited, inheritedFrom: parent.id ? `#${parent.id}` : parent.tagName.toLowerCase() }
      : null;
  }

  function variableProvenance(element, declaredValue) {
    const variables = [];
    const expression = /var\(\s*(--[\w-]+)/g;
    let match;
    while ((match = expression.exec(declaredValue || ''))) {
      const name = match[1];
      let current = element;
      let declaration = null;
      while (current && !declaration) {
        declaration = winningCandidate(current, name);
        current = current.parentElement;
      }
      variables.push({
        name,
        computedValue: element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue(name).trim(),
        declaration,
      });
    }
    return variables;
  }

  function componentClasses(component) {
    if (!component || typeof component.getClasses !== 'function') return [];
    const classes = component.getClasses();
    return Array.isArray(classes) ? classes.filter(Boolean) : String(classes || '').split(/\s+/).filter(Boolean);
  }

  function normalizeClassName(className) {
    return String(className || '')
      .trim()
      .replace(/^\./, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  function describeComponent(component) {
    if (!component) return 'Ningún elemento seleccionado';
    const tag = component.get('tagName') || component.get('type') || 'elemento';
    const classes = componentClasses(component);
    if (classes.includes('cod-luma-matte__canvas')) return 'Transparencia del video';
    if (classes.includes('cod-luma-matte')) return 'Video con transparencia';
    if (String(tag).toLowerCase() === 'header') return 'Encabezado';
    if (String(tag).toLowerCase() === 'img') return 'Imagen';
    return `${tag}${classes.length ? `.${classes.join('.')}` : ''}`;
  }

  function createElement(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function installStyles(document) {
    if (document.getElementById('cod-computed-inspector-css')) return;
    const style = document.createElement('style');
    style.id = 'cod-computed-inspector-css';
    style.textContent = `
      .cod-ci { position:fixed; z-index:10000; top:44px; right:0; bottom:0; width:320px;
        overflow:auto; background:#1f2228; color:#f4f1eb; box-shadow:-4px 0 18px #0004;
        font:12px/1.4 Inter,system-ui,sans-serif; }
      .cod-ci * { box-sizing:border-box; }
      .cod-ci__head { position:sticky; top:0; z-index:2; padding:14px; background:#181b20; border-bottom:1px solid #ffffff18; }
      .cod-ci__headbar { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .cod-ci__title { font-size:13px; font-weight:650; }
      .cod-ci__head-toggle { width:auto !important; padding:3px 7px !important; font-size:10px !important; cursor:pointer; }
      .cod-ci__head.is-collapsed { padding:8px 14px; }
      .cod-ci__identity { min-width:0; }
      .cod-ci__head.is-collapsed .cod-ci__scope { display:none; }
      .cod-ci__target { margin-top:5px; color:#f0cfa6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cod-ci__scope { display:grid; gap:8px; margin-top:12px; }
      .cod-ci__scope-label { display:grid; gap:4px; color:#d9d2c7; font-size:10px; }
      .cod-ci__scope-label > span { font-weight:650; letter-spacing:.01em; }
      .cod-ci__scope-help { color:#aaa397; font-size:10px; line-height:1.35; }
      .cod-ci__scope-class[hidden] { display:none; }
      .cod-ci select,.cod-ci input,.cod-ci textarea { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px;
        background:#2a2e36; color:#fff; padding:6px 7px; font:inherit; }
      .cod-ci select:disabled,.cod-ci input:disabled,.cod-ci button:disabled { color:#d5d0c8; opacity:.62; }
      .cod-ci__body { padding:8px 12px 22px; }
      .cod-ci__row { padding:9px 0; border-bottom:1px solid #ffffff12; }
      .cod-ci__label { display:flex; justify-content:space-between; gap:8px; margin-bottom:5px; color:#ded8cc; }
      .cod-ci__value { color:#a9d9bd; font-variant-numeric:tabular-nums; }
      .cod-ci__origin { margin-top:4px; color:#918b82; font-size:10px; overflow-wrap:anywhere; }
      .cod-ci__empty { padding:28px 10px; text-align:center; color:#a9a39a; }
      .cod-ci__svg { margin:8px 0; padding:10px; border:1px solid #a7641a66; border-radius:6px; background:#a7641a14; }
      .cod-ci__svg-title { margin-bottom:8px; color:#f0c28e; font-weight:650; }
      .cod-ci__svg-colors { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .cod-ci__svg-colors label { display:grid; gap:4px; color:#c7bda9; font-size:10px; }
      .cod-ci__svg input[type="color"] { min-height:34px; padding:3px; cursor:pointer; }
      .cod-ci__svg button { width:100%; margin-top:8px; border:1px solid #b8752a; border-radius:5px;
        padding:7px; background:#a7641a; color:#fff; cursor:pointer; font:inherit; font-weight:650; }
      .cod-ci__svg-hint { margin-top:7px; color:#a9a39a; font-size:10px; }
      .cod-ci__header-state { margin:8px 0; padding:10px; border:1px solid #67a4ce66; border-radius:6px; background:#397ba118; }
      .cod-ci__header-title { display:flex; align-items:center; justify-content:space-between; gap:8px;
        margin-bottom:8px; color:#b9ddf5; font-weight:650; }
      .cod-ci__header-tabs { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:9px; }
      .cod-ci__header-tabs button,.cod-ci__header-activate { border:1px solid #ffffff26; border-radius:5px;
        padding:7px; background:#292e36; color:#ded8cc; cursor:pointer; font:inherit; }
      .cod-ci__header-tabs button.is-active { border-color:#70b9e9; background:#397ba1; color:#fff; }
      .cod-ci__header-activate { width:100%; border-color:#70b9e9; background:#397ba1; color:#fff; font-weight:650; }
      .cod-ci__header-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .cod-ci__header-grid label { display:grid; gap:4px; color:#c7d7e1; font-size:10px; }
      .cod-ci__header-grid .is-wide { grid-column:1 / -1; }
      .cod-ci__header-hint { margin-top:8px; color:#9eabb4; font-size:10px; }
      .cod-ci__luma { margin:8px 0; padding:10px; border:1px solid #8a7cf166; border-radius:6px; background:#5b4fb114; }
      .cod-ci__luma-title { margin-bottom:8px; color:#d9c9ff; font-weight:650; }
      .cod-ci__luma-field { display:grid; gap:4px; margin-bottom:8px; color:#c7bda9; font-size:10px; }
      .cod-ci__luma-toggle { display:flex; align-items:center; gap:7px; color:#ded8cc; cursor:pointer; }
      /* GrapesJS resetea appearance y fuerza width:100% en TODO input de
         forma global -- sin esto el checkbox queda estirado e irreconocible
         (invisible en la practica) en vez de un cuadradito tildable. */
      .cod-ci__luma-toggle input[type="checkbox"] {
        -webkit-appearance: checkbox; -moz-appearance: checkbox; appearance: checkbox;
        width: 16px; height: 16px; min-width: 16px; flex: none;
        margin: 0; accent-color: #8a7cf1; cursor: pointer;
      }
      .cod-ci__luma-hint { margin-top:7px; color:#a9a39a; font-size:10px; }
      .cod-ci__rotacion { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; }
      .cod-ci__rotacion-boton {
        padding:6px 4px; border:1px solid #8a7cf155; border-radius:5px;
        background:#2b2740; color:#ded8cc; font-size:10px; cursor:pointer;
      }
      .cod-ci__rotacion-boton:hover { border-color:#8a7cf1aa; }
      .cod-ci__rotacion-boton.is-active { background:#5b4fb1; border-color:#8a7cf1; color:#fff; font-weight:650; }
      .cod-ci__interactions { margin:8px 0; padding:10px; border:1px solid #b98ae666; border-radius:6px; background:#8a6df114; }
      .cod-ci__interactions-title { margin-bottom:8px; color:#e2c7ff; font-weight:650; }
      .cod-ci__interactions-field { display:grid; gap:4px; margin-bottom:8px; color:#c7bda9; font-size:10px; }
      .cod-ci__interactions-buttons { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      .cod-ci__interactions-buttons button { border:1px solid #ffffff26; border-radius:5px; padding:7px; background:#2a2e36; color:#ded8cc; cursor:pointer; font:inherit; font-weight:650; }
      .cod-ci__interactions-buttons button:hover { border-color:#b98ae6; color:#fff; }
      .cod-ci__interactions-status { margin-top:8px; color:#a9a39a; font-size:10px; }
      .cod-ci__interactions-clear { width:100%; margin-top:8px; border:1px solid #ffffff26; border-radius:5px; padding:7px; background:transparent; color:#c7bda9; cursor:pointer; font:inherit; }
      .cod-ci__interactions-clear:hover { border-color:#e06c6c; color:#ffb4b4; }
      .cod-ci__content { margin:8px 0; padding:10px; border:1px solid #e0b34d80; border-radius:6px; background:#e0b34d14; }
      .cod-ci__content-title { margin-bottom:8px; color:#f0d9a6; font-weight:650; }
      .cod-ci__content-field { min-height:64px; resize:vertical; line-height:1.4; }
      .cod-ci__content-hint { margin-top:7px; color:#a9a39a; font-size:10px; line-height:1.35; }
      .cod-ci__presentation { margin:8px 0; padding:10px; border:1px solid #62a8df66; border-radius:6px; background:#397ba114; }
      .cod-ci__presentation-title { margin-bottom:8px; color:#b9ddf5; font-weight:650; }
      .cod-ci__presentation-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
      .cod-ci__presentation-grid label { display:grid; gap:4px; color:#c7d7e1; font-size:10px; }
      .cod-ci__presentation-responsive { display:grid; gap:8px; margin-top:10px; }
      .cod-ci__presentation-device { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:0; padding:8px; border:1px solid #ffffff18; border-radius:5px; }
      .cod-ci__presentation-device legend { padding:0 4px; color:#b9ddf5; font-size:11px; font-weight:650; }
      .cod-ci__presentation-device label { display:grid; gap:3px; color:#c7d7e1; font-size:10px; }
      .cod-ci__presentation-device select { width:100%; }
      .cod-ci__presentation-hint { margin-top:8px; color:#9eabb4; font-size:10px; }
      .cod-ci__dyn { margin:8px 0; padding:10px; border:1px solid #4fb1a166; border-radius:6px; background:#1f8f7a14; }
      .cod-ci__dyn-title { margin-bottom:8px; color:#8fe0cd; font-weight:650; }
      .cod-ci__dyn select { width:100%; }
      .cod-ci__dyn-hint { margin-top:7px; color:#a9a39a; font-size:10px; }
      .cod-ci__save-module { margin:8px 0; }
      .cod-ci__save-module button { width:100%; border:1px solid #ffffff26; border-radius:5px;
        padding:8px; background:#2a2e36; color:#ded8cc; cursor:pointer; font:inherit; font-weight:650; }
      .cod-ci__save-module button:hover { border-color:#70b9e9; color:#fff; }
      .cod-ci__save-module button:disabled { opacity:.6; cursor:default; }
      .cod-ci__supermodule { margin:0 0 14px; padding:12px; border:1px solid #ffffff20; border-radius:7px; background:#20242c; }
      .cod-ci__supermodule-title { margin-bottom:9px; color:#fff; font-size:12px; font-weight:700; }
      .cod-ci__supermodule-list { display:grid; gap:7px; }
      .cod-ci__supermodule-item { display:flex; align-items:center; min-height:38px; padding:0 5px 0 11px; border:1px solid #ffffff12; border-radius:5px; background:#2a2f39; }
      .cod-ci__supermodule-name { min-width:0; flex:1; overflow:hidden; color:#f2f4f7; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
      .cod-ci__supermodule-settings { display:grid; width:30px; height:30px; padding:0; place-items:center; border:0; border-radius:4px; background:transparent; color:#bec6d1; font-size:15px; cursor:pointer; }
      .cod-ci__supermodule-settings:hover, .cod-ci__supermodule-settings:focus-visible { background:#405de6; color:#fff; outline:none; }
      .cod-ci__supermodule-trail { display:flex; align-items:center; gap:7px; margin:0 0 12px; color:#aeb7c5; font-size:10px; }
      .cod-ci__supermodule-trail button { padding:4px 7px; border:0; border-radius:4px; background:#343a46; color:#fff; cursor:pointer; }
      .cod-ci__col-presets { margin:8px 0; padding:10px; border:1px solid #d8872966; border-radius:6px; background:#a7641a14; }
      .cod-ci__col-presets-title { margin-bottom:8px; color:#f0c28e; font-weight:650; }
      .cod-ci__col-presets-toggle { width:100%; border:1px solid #b8752a; border-radius:5px;
        padding:8px; background:#a7641a; color:#fff; cursor:pointer; font:inherit; font-weight:650; }
      .cod-ci__col-presets-toggle:hover { background:#c07620; }
      .cod-ci__col-presets-pop { position:fixed; z-index:2147483647; width:280px; max-height:min(70vh, 520px);
        overflow-y:auto; overflow-x:hidden; background:#1f2228; color:#f4f1eb; border:1px solid #ffffff2e;
        border-radius:8px; box-shadow:0 12px 32px #0008; padding:12px; font:12px/1.4 Inter,system-ui,sans-serif; }
      .cod-ci__col-presets-pop * { box-sizing:border-box; }
      .cod-ci__col-presets-device { margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #ffffff18;
        color:#c7bda9; font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
      .cod-ci__col-presets-group { margin-bottom:12px; }
      .cod-ci__col-presets-group:last-child { margin-bottom:0; }
      .cod-ci__col-presets-group-title { font-size:10px; text-transform:uppercase; letter-spacing:.04em;
        color:#c7bda9; margin-bottom:6px; }
      .cod-ci__col-presets-grid { display:flex; flex-wrap:wrap; gap:6px; }
      .cod-ci__col-presets-thumb { display:flex; align-items:center; justify-content:center; width:52px; height:34px;
        border:1px solid #ffffff26; border-radius:5px; background:#2a2e36; color:#d8b98a; padding:5px; cursor:pointer;
        line-height:0; }
      .cod-ci__col-presets-thumb:hover { border-color:#d88729; color:#d88729; background:#33291d; }
      .cod-ci__col-presets-thumb svg { display:block; width:100%; height:100%; }
      .gjs-toolbar-item.cod-header-state-tool { position:relative; width:auto; min-width:28px; padding:5px 7px;
        border-left:1px solid #ffffff38; font-weight:750; text-align:center; }
      .gjs-toolbar-item.cod-header-state-tool::before { display:block; min-width:14px; line-height:16px; }
      .gjs-toolbar-item.cod-header-state-pin::before { content:'⚑'; font-size:15px; }
      .gjs-toolbar-item.cod-header-state-entry::before { content:'E'; }
      .gjs-toolbar-item.cod-header-state-scroll::before { content:'S'; }
      .gjs-toolbar-item.cod-header-state-tool.is-active { background:#a7641a; box-shadow:inset 0 -2px #fff; }
    `;
    document.head.appendChild(style);
  }

  function createOcdComputedInspector(editor, options) {
    if (!editor) throw new Error('OCD Computed Inspector requiere una instancia de GrapesJS.');
    const opts = options || {};
    const properties = opts.properties || DEFAULT_PROPERTIES;
    const hostDocument = opts.document || global.document;
    let selected = null;
    let snapshot = null;
    let root = null;
    let body = null;
    let targetLabel = null;
    let scopeSelect = null;
    let classSelect = null;
    let classField = null;
    let headerState = 'entry';
    let previewHeaderElement = null;
    let headerIdentityCounter = 0;
    let toolbarComponent = null;
    let toolbarOriginal = null;
    let columnPresetsPopoverEl = null;
    let columnPresetsAnchorEl = null;
    let supermoduleContext = null;

    function getElement(component) {
      return component && typeof component.getEl === 'function' ? component.getEl() : null;
    }

    function componentAttributes(component) {
      return component && typeof component.getAttributes === 'function'
        ? component.getAttributes()
        : component?.get?.('attributes') || {};
    }

    function isHeaderComponent(component) {
      if (!component) return false;
      const tag = String(component.get?.('tagName') || '').toLowerCase();
      const attributes = componentAttributes(component);
      return tag === 'header' || tag === 'nav' || attributes['data-cod-behavior'] === 'scroll-threshold';
    }

    function hasAttr(attributes, name) {
      const value = attributes[name];
      return value !== undefined && value !== null && value !== false;
    }

    function escapeAttr(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function isVideoComponent(component) {
      return !!component && String(component.get?.('tagName') || '').toLowerCase() === 'video';
    }

    function isImageComponent(component) {
      return !!component && String(component.get?.('tagName') || '').toLowerCase() === 'img';
    }

    function isDynamicTextComponent(component) {
      if (!component) return false;
      const tag = String(component.get?.('tagName') || '').toLowerCase();
      return DYNAMIC_TEXT_TAGS.has(tag);
    }

    function dynamicSourceApplicable(component) {
      return isImageComponent(component) || isDynamicTextComponent(component);
    }

    function currentAcfFields() {
      const fields = global.OCDCanvasEditor && global.OCDCanvasEditor.acfFields;
      return Array.isArray(fields) ? fields : [];
    }

    function currentAcfImageSrc() {
      return (global.OCDCanvasEditor && global.OCDCanvasEditor.acfImageSrc) || '';
    }

    function acfFieldByName(fields, name) {
      return fields.find((field) => field && String(field.name || '') === name) || null;
    }

    function isLumaMatteComponent(component) {
      if (!component) return false;
      const attributes = componentAttributes(component);
      return attributes['data-cod-luma-matte'] === '1' || attributes['data-cod-luma-matte'] === 'true';
    }

    function lumaMatteTargetFor(component) {
      if (!component) return null;
      let current = component;
      while (current) {
        if (isLumaMatteComponent(current)) return { kind: 'luma', component: current };
        current = typeof current.parent === 'function' ? current.parent() : null;
      }
      current = component;
      while (current) {
        if (isVideoComponent(current)) return { kind: 'video', component: current };
        current = typeof current.parent === 'function' ? current.parent() : null;
      }
      return null;
    }

    function firstVideoComponent(component) {
      if (!component || typeof component.find !== 'function') return null;
      const found = component.find('video');
      return found && found[0] ? found[0] : null;
    }

    function firstCanvasComponent(component) {
      if (!component || typeof component.find !== 'function') return null;
      const found = component.find('canvas');
      return found && found[0] ? found[0] : null;
    }

    function videoSourceDescriptor(video) {
      if (!video) return { src: '', type: '' };
      const attributes = componentAttributes(video);
      const src = String(attributes.src || '');
      if (src) return { src, type: String(attributes.type || '') };
      let source = null;
      if (typeof video.find === 'function') {
        const found = video.find('source');
        source = found && found[0] ? found[0] : null;
      }
      if (!source) return { src: '', type: '' };
      const sourceAttributes = componentAttributes(source);
      return { src: String(sourceAttributes.src || ''), type: String(sourceAttributes.type || '') };
    }

    function lumaMatteMarkup(video) {
      const attributes = componentAttributes(video);
      const source = videoSourceDescriptor(video);
      const classes = componentClasses(video).filter((name) => name !== 'cod-luma-matte__video');
      const id = attributes.id ? ` id="${escapeAttr(attributes.id)}"` : '';
      const style = String(attributes.style || '');
      const poster = attributes.poster ? ` poster="${escapeAttr(attributes.poster)}"` : '';
      const width = attributes.width ? ` width="${escapeAttr(attributes.width)}"` : '';
      const height = attributes.height ? ` height="${escapeAttr(attributes.height)}"` : '';
      const preload = attributes.preload ? String(attributes.preload) : 'auto';
      const controls = hasAttr(attributes, 'controls') ? ' controls' : '';
      const videoClasses = ['cod-luma-matte__video', ...classes];
      const sourceHtml = source.src
        ? `<source src="${escapeAttr(source.src)}"${source.type ? ` type="${escapeAttr(source.type)}"` : ''}>`
        : '';
      const canvasStyle = style ? ` style="${escapeAttr(style)}"` : '';
      return (
        '<div data-cod-luma-matte="1" class="cod-luma-matte">' +
        `<video class="${escapeAttr(videoClasses.join(' '))}"${id}${controls} hidden autoplay muted loop playsinline preload="${escapeAttr(preload)}"${poster}${width}${height}>` +
        sourceHtml +
        '</video>' +
        `<canvas class="cod-luma-matte__canvas"${width}${height}${canvasStyle}></canvas>` +
        '</div>'
      );
    }

    function normalVideoMarkup(wrapper) {
      const video = firstVideoComponent(wrapper);
      const canvas = firstCanvasComponent(wrapper);
      const videoAttributes = video ? componentAttributes(video) : {};
      const canvasAttributes = canvas ? componentAttributes(canvas) : {};
      const source = video ? videoSourceDescriptor(video) : { src: '', type: '' };
      const classes = video
        ? componentClasses(video).filter((name) => name !== 'cod-luma-matte__video')
        : [];
      const id = videoAttributes.id ? ` id="${escapeAttr(videoAttributes.id)}"` : '';
      const style = String(canvasAttributes.style || videoAttributes.style || '');
      const poster = videoAttributes.poster ? ` poster="${escapeAttr(videoAttributes.poster)}"` : '';
      const width = canvasAttributes.width || videoAttributes.width
        ? ` width="${escapeAttr(canvasAttributes.width || videoAttributes.width)}"`
        : '';
      const height = canvasAttributes.height || videoAttributes.height
        ? ` height="${escapeAttr(canvasAttributes.height || videoAttributes.height)}"`
        : '';
      const preload = videoAttributes.preload ? String(videoAttributes.preload) : 'auto';
      const controls = hasAttr(videoAttributes, 'controls') ? ' controls' : '';
      const loop = hasAttr(videoAttributes, 'loop') ? ' loop' : '';
      const muted = hasAttr(videoAttributes, 'muted') ? ' muted' : '';
      const autoplay = hasAttr(videoAttributes, 'autoplay') ? ' autoplay' : '';
      const playsinline = hasAttr(videoAttributes, 'playsinline') ? ' playsinline' : '';
      const classAttr = classes.length ? ` class="${escapeAttr(classes.join(' '))}"` : '';
      const styleAttr = style ? ` style="${escapeAttr(style)}"` : '';
      const srcAttr = source.src ? ` src="${escapeAttr(source.src)}"` : '';
      return `<video${classAttr}${id}${srcAttr}${poster}${controls}${loop}${muted}${autoplay}${playsinline} preload="${escapeAttr(preload)}"${width}${height}${styleAttr}></video>`;
    }

    function inferVideoType(url, fallback) {
      const clean = String(url || '').split(/[?#]/)[0].toLowerCase();
      if (/\.mp4$/.test(clean)) return 'video/mp4';
      if (/\.webm$/.test(clean)) return 'video/webm';
      if (/\.mov$/.test(clean)) return 'video/quicktime';
      if (/\.m4v$/.test(clean)) return 'video/mp4';
      return fallback || '';
    }

    function setVideoSource(component, url) {
      const target = lumaMatteTargetFor(component);
      if (!target) return;
      const video = target.kind === 'luma' ? firstVideoComponent(target.component) : target.component;
      if (!video) return;
      const source = url && url.trim() ? url.trim() : '';
      if (typeof video.find === 'function') {
        const sources = video.find('source');
        if (sources && sources[0]) {
          const existing = componentAttributes(sources[0]);
          const type = inferVideoType(source, String(existing.type || 'video/mp4'));
          sources[0].addAttributes({ src: source, type });
          return;
        }
      }
      video.addAttributes({ src: source });
    }

    function installCanvasLumaRuntime() {
      if (!global.OcdLumaMatteVideo || typeof global.OcdLumaMatteVideo.createRuntime !== 'function') return;
      let canvasDocument = null;
      try { canvasDocument = editor.Canvas?.getDocument?.(); } catch (_error) { return; }
      if (!canvasDocument) return;
      const canvasWindow =
        canvasDocument.defaultView ||
        (typeof editor.Canvas?.getWindow === 'function' ? editor.Canvas.getWindow() : null);
      if (!canvasWindow) return;
      try {
        global.OcdLumaMatteVideo.createRuntime({ window: canvasWindow, document: canvasDocument });
      } catch (_error) {
        // La composición es progresiva; si el lienzo no está listo se reintenta
        // en la próxima selección o refresco del editor.
      }
    }

    function interactionsApi() {
      return global.OcdInteractions || null;
    }

    function installCanvasInteractionsRuntime() {
      const api = interactionsApi();
      if (!api || typeof api.createRuntime !== 'function') return;
      let canvasDocument = null;
      try { canvasDocument = editor.Canvas?.getDocument?.(); } catch (_error) { return; }
      if (!canvasDocument) return;
      const canvasWindow =
        canvasDocument.defaultView ||
        (typeof editor.Canvas?.getWindow === 'function' ? editor.Canvas.getWindow() : null);
      if (!canvasWindow) return;
      try {
        api.createRuntime({ window: canvasWindow, document: canvasDocument });
      } catch (_error) {
        // Progresivo: el runtime se reintenta en la próxima selección/refresco.
      }
    }

    function headerForComponent(component) {
      let current = component || null;
      while (current) {
        if (isHeaderComponent(current)) return current;
        current = typeof current.parent === 'function' ? current.parent() : null;
      }
      return null;
    }

    function headerIsActive(component) {
      return componentAttributes(component)['data-cod-behavior'] === 'scroll-threshold';
    }

    function prepareHeader(component) {
      if (!component || !isHeaderComponent(component)) return null;
      ensureHeaderIdentity(component);
      global.OcdBehaviors?.attachToComponent?.(component, { threshold: 40 });
      return component;
    }

    function ensureHeaderIdentity(component) {
      const attributes = componentAttributes(component);
      if (attributes['data-cod-header-id']) return attributes['data-cod-header-id'];
      headerIdentityCounter += 1;
      const source = component.getId?.() || component.cid || `header-${headerIdentityCounter}`;
      const identity = `cod-${normalizeClassName(source)}`;
      component.addAttributes({ 'data-cod-header-id': identity });
      return identity;
    }

    function headerSelector(component, state) {
      const identity = ensureHeaderIdentity(component);
      const base = `[data-cod-header-id="${identity}"]`;
      return state === 'scrolled' ? `${base}.nav--scrolled` : base;
    }

    function previewHeaderState(component, state) {
      if (previewHeaderElement && previewHeaderElement !== getElement(component)) {
        previewHeaderElement.removeAttribute('data-cod-preview-scroll-state');
        previewHeaderElement.classList.remove('nav--scrolled');
      }
      const element = getElement(component);
      previewHeaderElement = element || null;
      if (element) {
        element.setAttribute('data-cod-preview-scroll-state', state);
        element.classList.toggle('nav--scrolled', state === 'scrolled');
      }
    }

    function applyHeaderStateStyle(component, property, value, descendants) {
      const header = prepareHeader(component);
      const selector = headerSelector(header, headerState);
      if (!selector) throw new Error('El encabezado necesita una clase CSS para guardar sus estados.');
      const scopedSelector = descendants
        ? descendants
            .split(',')
            .map((part) => `${selector} ${part.trim()}`)
            .join(', ')
        : selector;
      editor.Css.setRule(scopedSelector, { [property]: value }, { addStyles: true });
      previewHeaderState(header, headerState);
      selected = header;
      return refreshAfterRender();
    }

    function openInspectorPanel() {
      const tab = hostDocument.querySelector('[data-cod-side-panel="inspector"]');
      if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    }

    function setHeaderPreviewState(state, component) {
      const target = component || editor.getSelected() || selected;
      const header = headerForComponent(target);
      if (!header) return null;
      prepareHeader(header);
      headerState = state === 'scrolled' ? 'scrolled' : 'entry';
      previewHeaderState(header, headerState);
      global.ocdCanvas?.behaviors?.refresh?.();
      global.ocdCanvas?.behaviors?.installCanvasRuntime?.();
      previewHeaderState(header, headerState);
      updateHeaderToolbar(target);
      refresh(target);
      return header;
    }

    function fallbackToolbar(component) {
      const tools = [];
      if (component?.get?.('draggable')) {
        tools.push({ attributes: { class: 'fa fa-arrows', title: 'Mover' }, command: 'tlb-move' });
      }
      if (component?.parent?.()) {
        tools.push({ attributes: { class: 'fa fa-arrow-up', title: 'Seleccionar contenedor' }, command: 'select-parent' });
      }
      if (component?.get?.('copyable') !== false) {
        tools.push({ attributes: { class: 'fa fa-clone', title: 'Duplicar' }, command: 'tlb-clone' });
      }
      if (component?.get?.('removable') !== false) {
        tools.push({ attributes: { class: 'fa fa-trash-o', title: 'Eliminar' }, command: 'tlb-delete' });
      }
      return tools;
    }

    function restoreHeaderToolbar() {
      if (!toolbarComponent) return;
      if (toolbarOriginal == null) toolbarComponent.unset?.('toolbar', { silent: true });
      else toolbarComponent.set?.('toolbar', toolbarOriginal, { silent: true });
      toolbarComponent = null;
      toolbarOriginal = null;
    }

    function updateHeaderToolbar(component) {
      const header = headerForComponent(component);
      if (!component) {
        restoreHeaderToolbar();
        editor.refresh?.({ tools: true });
        return;
      }

      if (toolbarComponent !== component) {
        restoreHeaderToolbar();
        toolbarComponent = component;
        const current = component?.get?.('toolbar');
        toolbarOriginal = Array.isArray(current) ? current.slice() : current ?? null;
      }

      const standard = Array.isArray(toolbarOriginal) && toolbarOriginal.length
        ? toolbarOriginal
        : fallbackToolbar(component);
      const tools = [
        {
          attributes: {
            class: 'fa fa-cog cod-entity-settings-tool',
            title: 'Configurar esta entidad',
            'aria-label': 'Configurar esta entidad',
          },
          command: 'cod-entity-settings-open',
        },
      ];
      if (header) tools.push(
        {
          attributes: {
            class: 'cod-header-state-tool cod-header-state-pin',
            title: headerIsActive(header) ? 'Abrir estados del encabezado' : 'Guardar estado y agregar estado Scroll',
            'data-cod-header-tool': 'pin',
          },
          command: 'cod-header-states-open',
        },
      );
      if (header && headerIsActive(header)) {
        tools.push(
          {
            attributes: {
              class: `cod-header-state-tool cod-header-state-entry${headerState === 'entry' ? ' is-active' : ''}`,
              title: 'Previsualizar y editar Entrada',
              'data-cod-header-tool': 'entry',
            },
            command: 'cod-header-state-entry',
          },
          {
            attributes: {
              class: `cod-header-state-tool cod-header-state-scroll${headerState === 'scrolled' ? ' is-active' : ''}`,
              title: 'Previsualizar y editar Scroll',
              'data-cod-header-tool': 'scroll',
            },
            command: 'cod-header-state-scroll',
          },
        );
      }
      component.set?.('toolbar', [...tools, ...standard], { silent: true });
      editor.refresh?.({ tools: true });
    }

    function inspect(component) {
      const target = component || editor.getSelected();
      const element = getElement(target);
      if (!target || !element || !element.ownerDocument?.defaultView) return null;
      const computed = element.ownerDocument.defaultView.getComputedStyle(element);
      const values = {};
      for (const [property, label] of properties) {
        const declaration = winningCandidate(element, property);
        values[property] = {
          property,
          label,
          computedValue: computed.getPropertyValue(property).trim(),
          declaration,
          variables: variableProvenance(element, declaration?.value || ''),
        };
      }
      return {
        component: target,
        element,
        description: describeComponent(target),
        classes: componentClasses(target),
        values,
      };
    }

    function refresh(component) {
      selected = component || editor.getSelected() || selected;
      const selectedHeader = headerForComponent(selected);
      if (selectedHeader && headerIsActive(selectedHeader)) {
        previewHeaderState(selectedHeader, headerState);
      } else if (previewHeaderElement) {
        const previewWindow = previewHeaderElement.ownerDocument?.defaultView;
        previewHeaderElement.removeAttribute('data-cod-preview-scroll-state');
        previewHeaderElement.classList.remove('nav--scrolled');
        previewHeaderElement = null;
        previewWindow?.dispatchEvent?.(new previewWindow.Event('resize'));
      }
      snapshot = inspect(selected);
      render();
      if (typeof opts.onChange === 'function') opts.onChange(snapshot);
      return snapshot;
    }

    function applyLocalStyle(propertyOrStyles, value) {
      const component = editor.getSelected() || selected;
      if (!component) throw new Error('Selecciona un elemento antes de aplicar un estilo local.');
      const styles =
        typeof propertyOrStyles === 'string' ? { [propertyOrStyles]: value } : propertyOrStyles;
      if (isHeaderComponent(component) && headerIsActive(component)) {
        const selector = headerSelector(component, headerState);
        editor.Css.setRule(selector, styles, { addStyles: true });
        previewHeaderState(component, headerState);
        selected = component;
        return refreshAfterRender();
      }
      component.addStyle(styles);
      selected = component;
      return refreshAfterRender();
    }

    function applyClassStyle(propertyOrStyles, valueOrClassName, maybeClassName) {
      const component = editor.getSelected() || selected;
      if (!component) throw new Error('Selecciona un elemento antes de aplicar un estilo de clase.');
      const isProperty = typeof propertyOrStyles === 'string';
      const styles = isProperty ? { [propertyOrStyles]: valueOrClassName } : propertyOrStyles;
      const requestedClass = isProperty ? maybeClassName : valueOrClassName;
      const existingClasses = componentClasses(component);
      const className = normalizeClassName(requestedClass || existingClasses[0]);
      if (!className) throw new Error('Indica una clase para crear un estilo reutilizable.');
      if (!existingClasses.includes(className)) component.addClass(className);
      const selector =
        isHeaderComponent(component) && headerIsActive(component) && headerState === 'scrolled'
          ? `.${className}.nav--scrolled`
          : `.${className}`;
      editor.Css.setRule(selector, styles, { addStyles: true });
      selected = component;
      return refreshAfterRender();
    }

    /**
     * Control universal "Fuente de contenido": conecta un componente de
     * contenido ya puesto en el lienzo (texto o imagen) a un campo ACF de la
     * página actual, siguiendo exactamente la misma convención que ya usa
     * `acfFieldBlockContent()` en cod-canvas-editor.js (mismo atributo
     * `data-cod-dynamic`, mismo placeholder `{{acf:CAMPO}}`, misma imagen de
     * marcador de posición) para que el resultado sea indistinguible de un
     * bloque ACF prearmado. `data-cod-dynamic-original` guarda el contenido
     * fijo original para poder restaurarlo al volver a "Fijo".
     */
    function applyDynamicSource(component, fieldName) {
      const element = getElement(component);
      if (!component || !element) return refreshAfterRender();
      const isImage = isImageComponent(component);
      const attributes = componentAttributes(component);
      const hadDynamic = !!attributes['data-cod-dynamic'];

      if (!fieldName) {
        const original = attributes['data-cod-dynamic-original'];
        component.removeAttributes(['data-cod-dynamic']);
        if (original !== undefined && original !== null) {
          if (isImage) setImageSrc(component, original);
          else component.components(original);
          component.removeAttributes(['data-cod-dynamic-original']);
        }
        selected = component;
        return refreshAfterRender();
      }

      const field = acfFieldByName(currentAcfFields(), fieldName);
      const type = field && field.type ? String(field.type) : 'text';

      if (!hadDynamic) {
        const originalValue = isImage ? getImageSrc(component, element) : element.innerHTML;
        component.addAttributes({ 'data-cod-dynamic-original': originalValue });
      }

      if (isImage) {
        component.addAttributes({ 'data-cod-dynamic': 'acf_image:' + fieldName });
        setImageSrc(component, currentAcfImageSrc());
      } else {
        const htmlSuffix = type === 'wysiwyg' ? ':html' : '';
        component.addAttributes({ 'data-cod-dynamic': 'acf:' + fieldName + htmlSuffix });
        component.components('{{acf:' + fieldName + htmlSuffix + '}}');
      }
      selected = component;
      return refreshAfterRender();
    }

    /**
     * El tipo de componente Image nativo de GrapesJS guarda su origen real en
     * la propiedad de modelo `src` (no sólo en `attributes.src`) y la vuelve a
     * escribir sobre los atributos en cada render (`updateSrc()`); si sólo
     * tocáramos `attributes.src` un refresco posterior del lienzo podría pisar
     * el cambio. Por eso getImageSrc/setImageSrc leen y escriben ambos lugares.
     */
    function getImageSrc(component, element) {
      const modelSrc = component?.get?.('src');
      if (typeof modelSrc === 'string' && modelSrc) return modelSrc;
      return element?.getAttribute?.('src') || '';
    }

    function setImageSrc(component, url) {
      component.set?.('src', url);
      component.addAttributes({ src: url });
    }

    function dynamicSourceFieldFromAttribute(value) {
      const match = /^acf(?:_image)?:([a-zA-Z0-9_-]+)(?::html)?$/.exec(String(value || ''));
      return match ? match[1] : '';
    }

    /**
     * "Presets de columnas": picker flotante de miniaturas para el contenedor
     * Fila/Columnas (`.cod-columns`, tipo de componente `cod-columns` — ver
     * `cod-editor-core.js`). Escribe el ancho de cada columna con el MISMO
     * mecanismo que ya usa el control "Columnas" (sección `.cod-gc`, montada en
     * `.cod-ci__head` por `cod-grid-controls.js`) y que respalda su fila
     * "Proporción" del Style Manager nativo de GrapesJS (`cod-canvas-grid.js`,
     * compilado a `cod-canvas-grid.global.js`): siempre `editor.OcdCanvasGrid`
     * (`applyCustom` → `applyTemplate` → `editor.Css.setRule(...)`), nunca un
     * atributo o estilo paralelo. Así el arrastre de los separadores (mismo
     * archivo `cod-grid-controls.js`) y este picker quedan sobre la misma
     * fuente de verdad (`component.get('ocdGridConfig')` + la regla CSS real).
     */
    const COLUMN_PRESET_GROUPS = [
      {
        count: 2,
        variants: [
          { label: '50 / 50', weights: [1, 1] },
          { label: '33 / 67', weights: [1, 2] },
          { label: '67 / 33', weights: [2, 1] },
          { label: '25 / 75', weights: [1, 3] },
          { label: '75 / 25', weights: [3, 1] },
        ],
      },
      {
        count: 3,
        variants: [
          { label: '33 / 33 / 33', weights: [1, 1, 1] },
          { label: '25 / 50 / 25', weights: [1, 2, 1] },
          { label: '50 / 25 / 25', weights: [2, 1, 1] },
          { label: '25 / 25 / 50', weights: [1, 1, 2] },
        ],
      },
      {
        count: 4,
        variants: [
          { label: 'Iguales', weights: [1, 1, 1, 1] },
          { label: 'Primera doble', weights: [2, 1, 1, 1] },
        ],
      },
      {
        count: 5,
        variants: [
          { label: 'Iguales', weights: [1, 1, 1, 1, 1] },
          { label: 'Primera doble', weights: [2, 1, 1, 1, 1] },
        ],
      },
      {
        count: 6,
        variants: [
          { label: 'Iguales', weights: [1, 1, 1, 1, 1, 1] },
          { label: 'Primera doble', weights: [2, 1, 1, 1, 1, 1] },
        ],
      },
    ];

    function isColumnsContainer(component) {
      return !!component && componentClasses(component).includes('cod-columns');
    }

    /**
     * Techo de columnas por breakpoint (criterio de diseño responsivo,
     * recuperado del picker equivalente que ya existía en Orugantt): en
     * mobile no tiene sentido ofrecer una fila de 6 columnas, y 2 columnas ya
     * es angosto ahí, así que el techo se baja escalonadamente en vez de
     * mostrar siempre los mismos 5 grupos sin importar el dispositivo activo.
     */
    const COLUMN_PRESET_MAX_BY_BREAKPOINT = { desktop: 6, tablet: 4, mobile: 3 };
    const COLUMN_PRESET_BREAKPOINT_LABEL = { desktop: 'Escritorio', tablet: 'Tablet', mobile: 'Móvil' };

    function activeColumnPresetBreakpoint() {
      const gridApi = editor.OcdCanvasGrid;
      const breakpoint = gridApi && typeof gridApi.getActiveBreakpoint === 'function'
        ? gridApi.getActiveBreakpoint()
        : 'desktop';
      return Object.hasOwn(COLUMN_PRESET_MAX_BY_BREAKPOINT, breakpoint) ? breakpoint : 'desktop';
    }

    function columnPresetGroupsForBreakpoint(breakpoint) {
      const max = COLUMN_PRESET_MAX_BY_BREAKPOINT[breakpoint] ?? COLUMN_PRESET_MAX_BY_BREAKPOINT.desktop;
      return COLUMN_PRESET_GROUPS.filter((group) => group.count <= max);
    }

    function svgColumnPresetIcon(weights) {
      const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
      const width = 40;
      const height = 24;
      const gap = 2;
      const pad = 1;
      const usable = width - pad * 2 - gap * (weights.length - 1);
      let x = pad;
      let rects = '';
      for (const weight of weights) {
        const rectWidth = Math.max(1, (weight / total) * usable);
        rects += `<rect x="${x.toFixed(1)}" y="${pad}" width="${rectWidth.toFixed(1)}" height="${height - pad * 2}" rx="1.5"/>`;
        x += rectWidth + gap;
      }
      return `<svg viewBox="0 0 ${width} ${height}" fill="none" stroke="currentColor" stroke-width="1.4">${rects}</svg>`;
    }

    function columnDefinition() {
      return {
        tagName: 'div',
        type: 'cod-column',
        classes: ['cod-column'],
        style: { 'min-width': '0' },
        components: [{ tagName: 'p', content: 'Columna' }],
      };
    }

    /**
     * Iguala la cantidad de columnas hijas al preset elegido: clona la última
     * columna existente para crecer (conserva su contenido/clases, igual que
     * "+ Agregar tarjeta" en `cod-dynamic-group` un poco más arriba en este
     * mismo archivo) y quita desde el final para achicar.
     */
    function ensureColumnCount(component, targetCount) {
      const collection = component && typeof component.components === 'function' ? component.components() : null;
      if (!collection) return;
      let models = collection.models ? collection.models.slice() : [];
      while (models.length > targetCount) {
        const last = models.pop();
        if (last && typeof last.remove === 'function') last.remove();
      }
      while (models.length < targetCount) {
        const template = models.length ? models[models.length - 1] : null;
        const source = template && typeof template.clone === 'function' ? template.clone() : columnDefinition();
        const appended = typeof component.append === 'function' ? component.append(source) : null;
        const added = Array.isArray(appended) ? appended[0] : appended;
        models.push(added || source);
      }
    }

    function closeColumnPresetsPopover() {
      if (columnPresetsPopoverEl) {
        columnPresetsPopoverEl.remove();
        columnPresetsPopoverEl = null;
      }
      columnPresetsAnchorEl = null;
      hostDocument.removeEventListener('pointerdown', onColumnPresetsOutsideClick, true);
      hostDocument.removeEventListener('keydown', onColumnPresetsKeydown, true);
    }

    function onColumnPresetsOutsideClick(event) {
      if (!columnPresetsPopoverEl) return;
      if (columnPresetsPopoverEl.contains(event.target)) return;
      if (columnPresetsAnchorEl && columnPresetsAnchorEl.contains(event.target)) return;
      closeColumnPresetsPopover();
    }

    function onColumnPresetsKeydown(event) {
      if (event.key === 'Escape') closeColumnPresetsPopover();
    }

    function applyColumnPreset(component, weights) {
      if (!component) return;
      const gridApi = editor.OcdCanvasGrid;
      if (!gridApi || typeof gridApi.applyCustom !== 'function') {
        global.alert?.('El motor de columnas (OcdCanvasGrid) no está disponible todavía.');
        return;
      }
      ensureColumnCount(component, weights.length);
      try {
        gridApi.applyCustom(component, weights, {});
      } catch (error) {
        global.alert?.('No se pudo aplicar el preset de columnas: ' + (error && error.message ? error.message : 'error desconocido'));
        return;
      }
      selected = component;
      closeColumnPresetsPopover();
      refreshAfterRender();
    }

    function openColumnPresetsPopover(component, anchorEl) {
      closeColumnPresetsPopover();
      const breakpoint = activeColumnPresetBreakpoint();
      const groups = columnPresetGroupsForBreakpoint(breakpoint);
      const popover = createElement(hostDocument, 'div', 'cod-ci__col-presets-pop');
      popover.appendChild(
        createElement(
          hostDocument,
          'div',
          'cod-ci__col-presets-device',
          `Dispositivo activo: ${COLUMN_PRESET_BREAKPOINT_LABEL[breakpoint] || 'Escritorio'}`,
        ),
      );
      for (const group of groups) {
        const section = createElement(hostDocument, 'div', 'cod-ci__col-presets-group');
        section.appendChild(
          createElement(hostDocument, 'div', 'cod-ci__col-presets-group-title', `${group.count} columnas`),
        );
        const grid = createElement(hostDocument, 'div', 'cod-ci__col-presets-grid');
        for (const variant of group.variants) {
          const thumb = createElement(hostDocument, 'button', 'cod-ci__col-presets-thumb');
          thumb.type = 'button';
          thumb.title = `${group.count} columnas — ${variant.label}`;
          thumb.setAttribute('aria-label', `Aplicar ${group.count} columnas, proporción ${variant.label}`);
          thumb.innerHTML = svgColumnPresetIcon(variant.weights);
          thumb.addEventListener('click', () => applyColumnPreset(component, variant.weights));
          grid.appendChild(thumb);
        }
        section.appendChild(grid);
        popover.appendChild(section);
      }
      hostDocument.body.appendChild(popover);

      const rect = anchorEl.getBoundingClientRect();
      const view = hostDocument.defaultView || global;
      const viewportWidth = view.innerWidth || 1024;
      const viewportHeight = view.innerHeight || 768;
      const popRect = popover.getBoundingClientRect();
      // El picker se ancla junto al botón que lo abre. El inspector `.cod-ci`
      // vive pegado al borde derecho de la pantalla, así que por defecto el
      // panel se abre hacia la izquierda del botón para no salirse del
      // viewport (a diferencia del bug de Orugantt: acá nunca queda recortado
      // ni depende de scroll horizontal, ver comentario de clase arriba).
      let left = rect.left - popRect.width - 8;
      if (left < 8) left = Math.max(8, Math.min(rect.right - popRect.width, viewportWidth - popRect.width - 8));
      let top = rect.top;
      if (top + popRect.height > viewportHeight - 8) top = Math.max(8, viewportHeight - popRect.height - 8);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;

      columnPresetsPopoverEl = popover;
      columnPresetsAnchorEl = anchorEl;
      hostDocument.addEventListener('pointerdown', onColumnPresetsOutsideClick, true);
      hostDocument.addEventListener('keydown', onColumnPresetsKeydown, true);
    }

    function renderColumnPresetsPanel(component) {
      if (!isColumnsContainer(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__col-presets');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__col-presets-title', 'Presets de columnas'));
      const button = createElement(hostDocument, 'button', 'cod-ci__col-presets-toggle', 'Elegir preset…');
      button.type = 'button';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (columnPresetsPopoverEl) {
          closeColumnPresetsPopover();
          return;
        }
        openColumnPresetsPopover(component, button);
      });
      panel.appendChild(button);
      return panel;
    }

    /**
     * "Guardar como módulo" (Súper-Módulo, MVP): botón que aparece con
     * cualquier componente seleccionado que tenga hijos adentro (no se filtra
     * de forma estricta por tipo de contenedor — con hijos alcanza para este
     * alcance). Pide nombre y categoría por prompt() (no hay ningún modal de
     * GrapesJS ya en uso en este código para justificar construir uno propio)
     * y delega el guardado real en `window.OCDCanvasEditor.saveCustomModule`,
     * expuesto por cod-canvas-editor.js — este archivo no tiene `ajaxUrl`/
     * `nonce` propios, así que no puede hablar con el servidor por su cuenta.
     */
    function componentHasChildren(component) {
      if (!component || typeof component.components !== 'function') return false;
      const children = component.components();
      return !!(children && typeof children.length === 'number' && children.length > 0);
    }

    function componentClasses(component) {
      return component && typeof component.getClasses === 'function' ? component.getClasses() : [];
    }

    function isSupermodule(component) {
      if (!componentHasChildren(component)) return false;
      const attributes = componentAttributes(component);
      const classes = componentClasses(component);
      return attributes['data-cod-supermodule'] === '1' || classes.includes('cod-group') || classes.includes('cod-dynamic-group');
    }

    function componentDisplayName(component, index) {
      const attributes = componentAttributes(component);
      const explicit = attributes['data-cod-module-label'] || attributes['aria-label'] || attributes.alt;
      if (explicit) return String(explicit);
      const classes = componentClasses(component);
      const usefulClass = classes.find((name) => !/^cod-(?:column|group|dynamic-group)/.test(name));
      if (usefulClass) return `.${usefulClass}`;
      const type = String(component?.get?.('type') || '');
      const tag = String(component?.get?.('tagName') || '').toLowerCase();
      const names = { text: 'Texto', image: 'Imagen', video: 'Video', link: 'Enlace', 'cod-video': 'Video', 'cod-luma-matte': 'Video con transparencia', 'cod-dynamic-group': 'Grupo dinámico', 'cod-group': 'Grupo de módulos' };
      return names[type] || names[tag] || (tag ? tag.toUpperCase() : `Entidad ${index + 1}`);
    }

    function directChildren(component) {
      if (!component || typeof component.components !== 'function') return [];
      const collection = component.components();
      return collection?.models ? collection.models.slice() : [];
    }

    function renderSupermodulePanel(component) {
      if (!isSupermodule(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__supermodule');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__supermodule-title', 'Entidades del supermódulo'));
      const list = createElement(hostDocument, 'div', 'cod-ci__supermodule-list');
      directChildren(component).forEach((child, index) => {
        const row = createElement(hostDocument, 'div', 'cod-ci__supermodule-item');
        const name = createElement(hostDocument, 'span', 'cod-ci__supermodule-name', componentDisplayName(child, index));
        const settings = createElement(hostDocument, 'button', 'cod-ci__supermodule-settings', '⚙');
        settings.type = 'button';
        settings.title = `Configurar ${name.textContent}`;
        settings.setAttribute('aria-label', settings.title);
        settings.addEventListener('click', () => { supermoduleContext = component; editor.select(child); openInspectorPanel(); });
        row.append(name, settings);
        list.appendChild(row);
      });
      panel.appendChild(list);
      return panel;
    }

    function renderSupermoduleBreadcrumb(component) {
      if (!supermoduleContext || component === supermoduleContext) return null;
      let current = component;
      let belongs = false;
      while (current) {
        if (current === supermoduleContext) { belongs = true; break; }
        current = current.parent?.();
      }
      if (!belongs) { supermoduleContext = null; return null; }
      const trail = createElement(hostDocument, 'nav', 'cod-ci__supermodule-trail');
      const back = createElement(hostDocument, 'button', '', '← Supermódulo');
      back.type = 'button';
      back.addEventListener('click', () => editor.select(supermoduleContext));
      trail.append(back, createElement(hostDocument, 'span', '', `› ${componentDisplayName(component, 0)}`));
      return trail;
    }

    function componentClasses(component) {
      return component && typeof component.getClasses === 'function' ? component.getClasses() : [];
    }

    function isSupermodule(component) {
      if (!componentHasChildren(component)) return false;
      const attributes = componentAttributes(component);
      const classes = componentClasses(component);
      return attributes['data-cod-supermodule'] === '1' || classes.includes('cod-group') || classes.includes('cod-dynamic-group');
    }

    function componentDisplayName(component, index) {
      const attributes = componentAttributes(component);
      const explicit = attributes['data-cod-module-label'] || attributes['aria-label'] || attributes.alt;
      if (explicit) return String(explicit);
      const classes = componentClasses(component);
      const usefulClass = classes.find((name) => !/^cod-(?:column|group|dynamic-group)/.test(name));
      if (usefulClass) return `.${usefulClass}`;
      const type = String(component?.get?.('type') || '');
      const tag = String(component?.get?.('tagName') || '').toLowerCase();
      const names = { text: 'Texto', image: 'Imagen', video: 'Video', link: 'Enlace', 'cod-video': 'Video', 'cod-luma-matte': 'Video con transparencia', 'cod-dynamic-group': 'Grupo dinámico', 'cod-group': 'Grupo de módulos' };
      return names[type] || names[tag] || (tag ? tag.toUpperCase() : `Entidad ${index + 1}`);
    }

    function directChildren(component) {
      if (!component || typeof component.components !== 'function') return [];
      const collection = component.components();
      return collection?.models ? collection.models.slice() : [];
    }

    function renderSupermodulePanel(component) {
      if (!isSupermodule(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__supermodule');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__supermodule-title', 'Entidades del supermódulo'));
      const list = createElement(hostDocument, 'div', 'cod-ci__supermodule-list');
      directChildren(component).forEach((child, index) => {
        const row = createElement(hostDocument, 'div', 'cod-ci__supermodule-item');
        const name = createElement(hostDocument, 'span', 'cod-ci__supermodule-name', componentDisplayName(child, index));
        const settings = createElement(hostDocument, 'button', 'cod-ci__supermodule-settings', '⚙');
        settings.type = 'button';
        settings.title = `Configurar ${name.textContent}`;
        settings.setAttribute('aria-label', settings.title);
        settings.addEventListener('click', () => { supermoduleContext = component; editor.select(child); openInspectorPanel(); });
        row.append(name, settings);
        list.appendChild(row);
      });
      panel.appendChild(list);
      return panel;
    }

    function renderSupermoduleBreadcrumb(component) {
      if (!supermoduleContext || component === supermoduleContext) return null;
      let current = component;
      let belongs = false;
      while (current) {
        if (current === supermoduleContext) { belongs = true; break; }
        current = current.parent?.();
      }
      if (!belongs) { supermoduleContext = null; return null; }
      const trail = createElement(hostDocument, 'nav', 'cod-ci__supermodule-trail');
      const back = createElement(hostDocument, 'button', '', '← Supermódulo');
      back.type = 'button';
      back.addEventListener('click', () => editor.select(supermoduleContext));
      trail.append(back, createElement(hostDocument, 'span', '', `› ${componentDisplayName(component, 0)}`));
      return trail;
    }

    function renderSaveModulePanel(component) {
      if (!componentHasChildren(component)) return null;
      const bridge = global.OCDCanvasEditor;
      if (!bridge || typeof bridge.saveCustomModule !== 'function') return null;

      const panel = createElement(hostDocument, 'section', 'cod-ci__save-module');
      const button = createElement(hostDocument, 'button', '', 'Guardar como módulo');
      button.type = 'button';
      button.addEventListener('click', async () => {
        const rawLabel = global.prompt?.('Nombre del módulo guardado:', '');
        if (!rawLabel) return;
        const label = String(rawLabel).trim();
        if (!label) return;
        const rawCategory = global.prompt?.(
          'Categoría (agrupa este módulo con otros del mismo nombre en la paleta):',
          'Módulos guardados',
        );
        if (rawCategory === null || rawCategory === undefined) return;
        const category = String(rawCategory).trim() || 'Módulos guardados';

        button.disabled = true;
        try {
          await bridge.saveCustomModule(component, label, category);
        } catch (error) {
          global.alert?.('No se pudo guardar el módulo: ' + (error && error.message ? error.message : 'error desconocido'));
        } finally {
          button.disabled = false;
        }
      });
      panel.appendChild(button);
      return panel;
    }

    function renderDynamicSourcePanel(component) {
      if (!dynamicSourceApplicable(component)) return null;
      const attributes = componentAttributes(component);
      const currentFieldName = dynamicSourceFieldFromAttribute(attributes['data-cod-dynamic']);
      const fields = currentAcfFields();

      const panel = createElement(hostDocument, 'section', 'cod-ci__dyn');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__dyn-title', 'Fuente de contenido'));

      const select = createElement(hostDocument, 'select');
      const fixedOption = createElement(hostDocument, 'option', '', 'Fijo');
      fixedOption.value = '';
      select.appendChild(fixedOption);

      let matchedCurrent = false;
      for (const field of fields) {
        const name = field && field.name ? String(field.name) : '';
        if (!name) continue;
        const option = createElement(hostDocument, 'option', '', field.label ? String(field.label) : name);
        option.value = name;
        select.appendChild(option);
        if (name === currentFieldName) matchedCurrent = true;
      }
      // El componente ya venía con un campo dinámico de una sesión anterior
      // pero la lista de campos ACF todavía no cargó (o el campo ya no existe):
      // igual se refleja el estado real en el select, con su nombre técnico
      // como texto visible.
      if (currentFieldName && !matchedCurrent) {
        const fallbackOption = createElement(hostDocument, 'option', '', currentFieldName);
        fallbackOption.value = currentFieldName;
        select.appendChild(fallbackOption);
      }
      select.value = currentFieldName;

      select.addEventListener('change', async () => {
        await applyDynamicSource(editor.getSelected() || component, select.value);
      });

      panel.appendChild(select);
      panel.appendChild(
        createElement(
          hostDocument,
          'div',
          'cod-ci__dyn-hint',
          'Conecta este elemento ya puesto en el lienzo a un campo ACF de la página actual, en vez de arrastrar un bloque nuevo.',
        ),
      );
      return panel;
    }

    function isExternalSvgImage(component) {
      if (!component || String(component.get('tagName') || '').toLowerCase() !== 'img') return false;
      const source = String(component.getAttributes?.().src || '');
      return /\.svg(?:[?#].*)?$/i.test(source) || /^data:image\/svg\+xml[;,]/i.test(source);
    }

    function externalSvgImageFor(component) {
      if (isExternalSvgImage(component)) return component;
      if (!component || typeof component.find !== 'function') return null;
      return component.find('img').find(isExternalSvgImage) || null;
    }

    function firstExternalSvgImage() {
      const wrapper = typeof editor.getWrapper === 'function' ? editor.getWrapper() : null;
      if (!wrapper || typeof wrapper.find !== 'function') return null;
      return wrapper.find('img').find(isExternalSvgImage) || null;
    }

    function firstBrandVector() {
      const wrapper = typeof editor.getWrapper === 'function' ? editor.getWrapper() : null;
      if (!wrapper || typeof wrapper.find !== 'function') return null;
      return wrapper.find('[data-cod-brand-logo]')[0] || null;
    }

    async function svgSourceText(source) {
      if (/^data:image\/svg\+xml[,;]/i.test(source)) {
        const payload = source.slice(source.indexOf(',') + 1);
        return source.includes(';base64,') ? global.atob(payload) : decodeURIComponent(payload);
      }
      const response = await global.fetch(source, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('No fue posible leer el SVG de marca.');
      return response.text();
    }

    function cleanBrandSvg(svgText, imageComponent) {
      const imageElement = getElement(imageComponent);
      const imageWindow = imageElement?.ownerDocument?.defaultView;
      const imageBounds = imageElement?.getBoundingClientRect();
      const imageStyle = imageElement && imageWindow ? imageWindow.getComputedStyle(imageElement) : null;
      const measuredWidth = imageBounds?.width || Number.parseFloat(imageStyle?.width || '0');
      const measuredHeight = imageBounds?.height || Number.parseFloat(imageStyle?.height || '0');
      const parser = new global.DOMParser();
      const parsed = parser.parseFromString(svgText, 'image/svg+xml');
      const sourceSvg = parsed.documentElement;
      if (!sourceSvg || sourceSvg.localName !== 'svg' || parsed.querySelector('parsererror')) {
        throw new Error('El archivo seleccionado no contiene un SVG válido.');
      }

      sourceSvg.querySelectorAll('script, foreignObject, iframe, object, embed, image, use').forEach((node) => node.remove());
      sourceSvg.querySelectorAll('*').forEach((node) => {
        Array.from(node.attributes).forEach((attribute) => {
          if (/^on/i.test(attribute.name) || /^(?:href|xlink:href)$/i.test(attribute.name)) {
            node.removeAttribute(attribute.name);
          }
        });
      });

      const frameDocument = editor.Canvas?.getDocument?.() || hostDocument;
      const scratch = frameDocument.createElement('div');
      scratch.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden';
      scratch.innerHTML = sourceSvg.outerHTML;
      frameDocument.body.appendChild(scratch);
      const renderedSvg = scratch.querySelector('svg');
      renderedSvg.querySelectorAll('path,g,circle,rect,line,polyline,polygon').forEach((node) => {
        const style = frameDocument.defaultView.getComputedStyle(node);
        if (style.fillRule) node.setAttribute('fill-rule', style.fillRule);
        if (style.strokeLinecap) node.setAttribute('stroke-linecap', style.strokeLinecap);
        if (style.strokeLinejoin) node.setAttribute('stroke-linejoin', style.strokeLinejoin);
        if (style.strokeWidth && style.strokeWidth !== '0px') node.setAttribute('stroke-width', style.strokeWidth);
      });
      renderedSvg.querySelectorAll('defs,style').forEach((node) => node.remove());

      const imageAttributes = imageComponent.getAttributes?.() || {};
      renderedSvg.setAttribute('data-cod-brand-logo', 'primary');
      renderedSvg.setAttribute('role', 'img');
      renderedSvg.setAttribute('aria-label', imageAttributes.alt || 'Logotipo de marca');
      if (imageAttributes.id) renderedSvg.setAttribute('id', imageAttributes.id);
      if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
        renderedSvg.setAttribute('width', String(Math.round(measuredWidth * 100) / 100));
        renderedSvg.style.width = `${measuredWidth}px`;
      }
      if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
        renderedSvg.setAttribute('height', String(Math.round(measuredHeight * 100) / 100));
        renderedSvg.style.height = `${measuredHeight}px`;
      }
      if (imageStyle?.display && imageStyle.display !== 'inline') {
        renderedSvg.style.display = imageStyle.display;
      }
      const classes = componentClasses(imageComponent).filter((name) => name !== 'cod-brand-logo');
      renderedSvg.setAttribute('class', [...classes, 'cod-brand-logo'].join(' '));
      scratch.remove();
      return renderedSvg.outerHTML;
    }

    function setBrandColorRules(lightColor, darkColor) {
      editor.Css.setRule(
        '.cod-brand-logo',
        { '--cod-brand-color': lightColor, '--cod-brand-color-dark': darkColor },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.cod-brand-logo path, .cod-brand-logo g, .cod-brand-logo circle, .cod-brand-logo rect, .cod-brand-logo line, .cod-brand-logo polyline, .cod-brand-logo polygon',
        { fill: 'var(--cod-brand-color)' },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.dark .cod-brand-logo, [data-theme="dark"] .cod-brand-logo',
        { '--cod-brand-color': 'var(--cod-brand-color-dark)' },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.cod-brand-logo',
        { '--cod-brand-color': 'var(--cod-brand-color-dark)' },
        { addStyles: true, atRuleType: 'media', atRuleParams: '(prefers-color-scheme: dark)' },
      );
    }

    async function applySvgMask(lightColor, darkColor) {
      let brand = firstBrandVector();
      if (!brand) {
        const selection = editor.getSelected() || selected;
        const image = externalSvgImageFor(selection) || firstExternalSvgImage();
        if (!image) throw new Error('El documento no contiene un logotipo SVG para configurar como Brand.');
        const source = String(image.getAttributes().src || '');
        const svgText = await svgSourceText(source);
        const markup = cleanBrandSvg(svgText, image);
        const replacement = image.replaceWith(markup);
        brand = Array.isArray(replacement) ? replacement[0] : replacement;
        if (!brand) brand = firstBrandVector();
      }

      setBrandColorRules(lightColor, darkColor);
      selected = brand;
      if (brand) editor.select(brand);
      return refreshAfterRender();
    }

    function refreshAfterRender() {
      const view = getElement(selected);
      const window = view?.ownerDocument?.defaultView || global;
      return new Promise((resolve) => {
        (window.requestAnimationFrame || window.setTimeout)(() => resolve(refresh(selected)), 0);
      });
    }

    function originText(value) {
      const declaration = value.declaration;
      if (!declaration) return 'Procedencia: valor inicial/computado por el navegador';
      const variables = value.variables
        .map((variable) => `${variable.name} = ${variable.computedValue || 'sin resolver'}`)
        .join(' · ');
      return `Procedencia: ${declaration.selector} → ${declaration.value}${variables ? ` · ${variables}` : ''}`;
    }

    function headerValue(component, property, descendants) {
      previewHeaderState(component, headerState);
      const header = getElement(component);
      const target = descendants ? header?.querySelector(descendants) : header;
      const view = target?.ownerDocument?.defaultView;
      return target && view ? view.getComputedStyle(target).getPropertyValue(property).trim() : '';
    }

    function renderHeaderStatePanel(component) {
      if (!isHeaderComponent(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__header-state');
      const title = createElement(hostDocument, 'div', 'cod-ci__header-title');
      title.append(
        createElement(hostDocument, 'span', '', 'Encabezado · estados'),
        createElement(hostDocument, 'span', '', headerIsActive(component) ? 'Activo' : 'Sin activar'),
      );
      panel.appendChild(title);

      if (!headerIsActive(component)) {
        const activate = createElement(hostDocument, 'button', 'cod-ci__header-activate', 'Activar estado con scroll');
        activate.type = 'button';
        activate.addEventListener('click', () => {
          setHeaderPreviewState('entry', editor.getSelected() || component);
        });
        panel.append(
          activate,
          createElement(
            hostDocument,
            'div',
            'cod-ci__header-hint',
            'Crea dos estados CSS del mismo encabezado y activa el cambio declarativo al desplazarse.',
          ),
        );
        return panel;
      }

      const tabs = createElement(hostDocument, 'div', 'cod-ci__header-tabs');
      for (const [state, label] of [['entry', 'Entrada'], ['scrolled', 'Con scroll']]) {
        const button = createElement(
          hostDocument,
          'button',
          headerState === state ? 'is-active' : '',
          label,
        );
        button.type = 'button';
        button.addEventListener('click', () => {
          setHeaderPreviewState(state, editor.getSelected() || component);
        });
        tabs.appendChild(button);
      }
      panel.appendChild(tabs);

      const grid = createElement(hostDocument, 'div', 'cod-ci__header-grid');
      const attributes = componentAttributes(component);
      const fields = [
        ['background-color', 'Fondo', '', ''],
        ['color', 'Texto y enlaces', 'a', ''],
        ['fill', 'Logo SVG', '.cod-brand-logo path, .cod-brand-logo g, .cod-brand-logo circle, .cod-brand-logo rect, .cod-brand-logo polygon', ''],
        ['min-height', 'Alto mínimo', '', ''],
        ['padding', 'Padding', '', 'is-wide'],
        ['box-shadow', 'Sombra', '', 'is-wide'],
        ['backdrop-filter', 'Desenfoque', '', ''],
        ['transition-duration', 'Transición', '', ''],
      ];
      for (const [property, labelText, descendants, className] of fields) {
        const label = createElement(hostDocument, 'label', className, labelText);
        const input = createElement(hostDocument, 'input');
        input.value = headerValue(component, property, descendants);
        input.placeholder = property === 'backdrop-filter' ? 'blur(12px)' : '';
        input.addEventListener('change', async () => {
          if (property === 'color' && descendants === 'a') {
            await applyHeaderStateStyle(component, property, input.value);
            await applyHeaderStateStyle(component, property, input.value, ' a');
            return;
          }
          await applyHeaderStateStyle(component, property, input.value, descendants ? ` ${descendants}` : '');
        });
        label.appendChild(input);
        grid.appendChild(label);
      }

      const thresholdLabel = createElement(hostDocument, 'label', '', 'Cambio desde (px)');
      const thresholdInput = createElement(hostDocument, 'input');
      thresholdInput.type = 'number';
      thresholdInput.min = '0';
      thresholdInput.value = String(attributes['data-cod-scroll-threshold'] || '40');
      thresholdInput.addEventListener('change', () => {
        const value = Math.max(0, Number.parseFloat(thresholdInput.value) || 0);
        component.addAttributes({ 'data-cod-scroll-threshold': String(value) });
        global.ocdCanvas?.behaviors?.installCanvasRuntime?.();
        thresholdInput.value = String(value);
      });
      thresholdLabel.appendChild(thresholdInput);
      grid.prepend(thresholdLabel);
      panel.append(
        grid,
        createElement(
          hostDocument,
          'div',
          'cod-ci__header-hint',
          'La pestaña fuerza sólo la previsualización del Canvas. Al publicar, el estado cambia automáticamente al superar el umbral.',
        ),
      );
      return panel;
    }

    function renderLumaMattePanel(component) {
      const target = lumaMatteTargetFor(component);
      if (!target) return null;
      const video = target.kind === 'luma' ? firstVideoComponent(target.component) : target.component;
      const source = video ? videoSourceDescriptor(video) : { src: '', type: '' };
      const panel = createElement(hostDocument, 'section', 'cod-ci__luma');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__luma-title', 'Video · transparencia'));

      const sourceLabel = createElement(hostDocument, 'label', 'cod-ci__luma-field', 'Fuente del video (MP4/WebM)');
      const sourceInput = createElement(hostDocument, 'input');
      sourceInput.type = 'text';
      sourceInput.value = source.src;
      sourceInput.placeholder = 'https://…/video.mp4';
      sourceInput.addEventListener('change', async () => {
        setVideoSource(target.component, sourceInput.value);
        installCanvasLumaRuntime();
        await refreshAfterRender();
      });
      sourceLabel.appendChild(sourceInput);
      panel.appendChild(sourceLabel);

      const toggleLabel = createElement(hostDocument, 'label', 'cod-ci__luma-toggle');
      const toggle = createElement(hostDocument, 'input');
      toggle.type = 'checkbox';
      toggle.checked = target.kind === 'luma';
      toggleLabel.append(
        toggle,
        createElement(hostDocument, 'span', '', 'Transparencia (matte apilado arriba/abajo)'),
      );
      panel.appendChild(toggleLabel);

      toggle.addEventListener('change', async () => {
        const currentTarget = lumaMatteTargetFor(editor.getSelected() || component);
        if (!currentTarget) return;
        if (toggle.checked && currentTarget.kind === 'video') {
          const replacement = currentTarget.component.replaceWith(lumaMatteMarkup(currentTarget.component));
          selected = Array.isArray(replacement) ? replacement[0] : replacement;
          if (selected) editor.select(selected);
          installCanvasLumaRuntime();
          await refreshAfterRender();
        } else if (!toggle.checked && currentTarget.kind === 'luma') {
          const replacement = currentTarget.component.replaceWith(normalVideoMarkup(currentTarget.component));
          selected = Array.isArray(replacement) ? replacement[0] : replacement;
          if (selected) editor.select(selected);
          installCanvasLumaRuntime();
          await refreshAfterRender();
        } else {
          toggle.checked = currentTarget.kind === 'luma';
        }
      });

      panel.appendChild(
        createElement(
          hostDocument,
          'div',
          'cod-ci__luma-hint',
          'Formato del archivo: un único MP4 H.264 con el video RGB arriba y la máscara blanco/negro abajo (mismo ancho, el doble de alto que el video final). Ej.: video final 1080×1920 → archivo 1080×3840 (mitad superior = RGB, mitad inferior = matte). Blanco = visible, negro = transparente. Exportalo desde After Effects + Media Encoder.',
        ),
      );
      return panel;
    }

    /**
     * Giro de una imagen, en cuartos de vuelta. El giro es propiedad de la
     * IMAGEN y no del marco: dentro de una galería cada foto lleva el suyo, y
     * el lightbox arma su vista ampliada copiando sólo src y alt, así que el
     * dato viaja en la propia <img> (clase para verse sin JavaScript,
     * data-cod-rotation para que el runtime lo reponga al ampliar).
     *
     * El caso real: WordPress borra la orientación EXIF al generar las copias
     * pero no gira los píxeles, así que el material vertical de teléfono llega
     * acostado.
     */
    const ROTACIONES = [0, 90, 180, 270];

    function imageRotationTargetFor(component) {
      if (!component) return null;
      if (isImageComponent(component)) return component;
      // Si el clic cayó en el <figure> que la envuelve, se toma su imagen.
      if (typeof component.find === 'function') {
        const found = component.find('img');
        if (found && found[0]) return found[0];
      }
      return null;
    }

    function currentRotation(image) {
      const attributes = componentAttributes(image);
      const raw = Number.parseInt(attributes['data-cod-rotation'] || '0', 10);
      return ROTACIONES.indexOf(raw) >= 0 ? raw : 0;
    }

    function applyRotation(image, rotation) {
      const parent = typeof image.parent === 'function' ? image.parent() : null;
      ROTACIONES.forEach((value) => {
        if (value !== 0) image.removeClass(`cod-rot-${value}`);
      });
      if (parent && typeof parent.removeClass === 'function') parent.removeClass('cod-marco-girado');

      if (rotation === 0) {
        image.addAttributes({ 'data-cod-rotation': '0' });
        return;
      }
      image.addClass(`cod-rot-${rotation}`);
      image.addAttributes({ 'data-cod-rotation': String(rotation) });
      // 90 y 270 cambian la forma de la caja, así que el marco tiene que pasar
      // a ser contenedor de tamaño para poder intercambiar alto y ancho. 180 no
      // la cambia y no necesita marco especial.
      if ((rotation === 90 || rotation === 270) && parent && typeof parent.addClass === 'function') {
        parent.addClass('cod-marco-girado');
      }
    }

    function renderImageRotationPanel(component) {
      const image = imageRotationTargetFor(component);
      if (!image) return null;

      const panel = createElement(hostDocument, 'section', 'cod-ci__luma');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__luma-title', 'Imagen · giro'));

      const grid = createElement(hostDocument, 'div', 'cod-ci__rotacion');
      const botones = [];
      const pintarActivo = (valor) => {
        botones.forEach((boton) => {
          boton.classList.toggle('is-active', Number(boton.dataset.rotacion) === valor);
        });
      };

      ROTACIONES.forEach((valor) => {
        const boton = createElement(hostDocument, 'button', 'cod-ci__rotacion-boton', valor === 0 ? 'Sin giro' : `${valor}°`);
        boton.type = 'button';
        boton.dataset.rotacion = String(valor);
        boton.addEventListener('click', async () => {
          const objetivo = imageRotationTargetFor(editor.getSelected() || component);
          if (!objetivo) return;
          applyRotation(objetivo, valor);
          pintarActivo(valor);
          await refreshAfterRender();
        });
        botones.push(boton);
        grid.appendChild(boton);
      });
      pintarActivo(currentRotation(image));
      panel.appendChild(grid);

      panel.appendChild(
        createElement(
          hostDocument,
          'div',
          'cod-ci__luma-hint',
          'El giro viaja con la imagen: se respeta en la página y también al ampliarla en el lightbox. Útil cuando una foto vertical de teléfono se ve acostada, porque WordPress borra la orientación del archivo al generar sus copias.',
        ),
      );
      return panel;
    }

    function interactionsFor(component) {
      const api = interactionsApi();
      if (!api || typeof api.parseInteraction !== 'function') return null;
      return api.parseInteraction(componentAttributes(component));
    }

    async function saveInteractionModel(component, model) {
      if (!component) return refreshAfterRender();
      const api = interactionsApi();
      if (!api) return refreshAfterRender();
      if (!model) {
        component.removeAttributes?.([api.ATTR || 'data-cod-interaction']);
      } else {
        const serialized = api.serializeInteraction(model);
        if (serialized) {
          component.addAttributes({ [api.ATTR || 'data-cod-interaction']: serialized });
        } else {
          component.removeAttributes?.([api.ATTR || 'data-cod-interaction']);
        }
      }
      selected = component;
      installCanvasInteractionsRuntime();
      return refreshAfterRender();
    }

    async function captureInteractionState(component, stateLabel) {
      const api = interactionsApi();
      if (!api) return;
      const element = getElement(component);
      if (!element) {
        global.alert?.('No se pudo leer el elemento para fijar el estado.');
        return;
      }
      const properties = api.captureState(element);
      if (!properties) {
        global.alert?.('No se pudo capturar el estado actual del elemento.');
        return;
      }
      const current = interactionsFor(component);
      const trigger = current && current.trigger
        ? current.trigger
        : { tipo: api.TRIGGER_SCROLL, threshold: api.DEFAULT_SCROLL_THRESHOLD || 200 };
      const states = current
        ? current.states.map((state) => ({ properties: state.properties }))
        : [{ properties: {} }, { properties: {} }];
      if (stateLabel === api.STATE_FINAL) states[1] = { properties };
      else states[0] = { properties };
      await saveInteractionModel(component, api.buildInteraction(trigger, states));
    }

    function renderInteractionsPanel(component) {
      if (!component) return null;
      const api = interactionsApi();
      if (!api || !getElement(component)) return null;

      const interaction = interactionsFor(component);
      const triggerType = interaction ? interaction.trigger.tipo : '';
      const threshold = interaction && interaction.trigger.threshold != null
        ? interaction.trigger.threshold
        : api.DEFAULT_SCROLL_THRESHOLD || 200;
      const duration = interaction && interaction.trigger.duration != null
        ? interaction.trigger.duration
        : api.DEFAULT_LOAD_DURATION || 600;
      const hasInitial = !!interaction && Object.keys(interaction.states[0].properties).length > 0;
      const hasFinal = !!interaction && Object.keys(interaction.states[1].properties).length > 0;

      const panel = createElement(hostDocument, 'section', 'cod-ci__interactions');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__interactions-title', 'Interacciones'));

      const triggerField = createElement(hostDocument, 'label', 'cod-ci__interactions-field');
      triggerField.appendChild(createElement(hostDocument, 'span', '', 'Disparador'));
      const triggerSelect = createElement(hostDocument, 'select');
      const noneOption = createElement(hostDocument, 'option', '', 'Sin interacción');
      noneOption.value = '';
      const loadOption = createElement(hostDocument, 'option', '', 'Al cargar la página');
      loadOption.value = api.TRIGGER_LOAD;
      const scrollOption = createElement(hostDocument, 'option', '', 'Al hacer scroll (con umbral en px)');
      scrollOption.value = api.TRIGGER_SCROLL;
      triggerSelect.append(noneOption, loadOption, scrollOption);
      triggerSelect.value = triggerType;
      triggerField.appendChild(triggerSelect);
      panel.appendChild(triggerField);

      const paramField = createElement(hostDocument, 'label', 'cod-ci__interactions-field');
      const paramInput = createElement(hostDocument, 'input');
      paramInput.type = 'number';
      paramInput.min = '0';
      paramInput.step = '1';
      if (triggerType === api.TRIGGER_SCROLL) {
        paramField.appendChild(createElement(hostDocument, 'span', '', 'Umbral (px)'));
        paramInput.value = String(threshold);
      } else if (triggerType === api.TRIGGER_LOAD) {
        paramField.appendChild(createElement(hostDocument, 'span', '', 'Duración (ms)'));
        paramInput.value = String(duration);
      } else {
        paramField.style.display = 'none';
      }
      paramField.appendChild(paramInput);
      panel.appendChild(paramField);

      triggerSelect.addEventListener('change', async () => {
        const target = editor.getSelected() || component;
        const value = triggerSelect.value;
        if (!value) {
          await saveInteractionModel(target, null);
          return;
        }
        const current = interactionsFor(target);
        const states = current
          ? current.states.map((state) => ({ properties: state.properties }))
          : [{ properties: {} }, { properties: {} }];
        const fallback = value === api.TRIGGER_SCROLL
          ? api.DEFAULT_SCROLL_THRESHOLD || 200
          : api.DEFAULT_LOAD_DURATION || 600;
        const numeric = Number.parseFloat(paramInput.value);
        const currentParameter = value === api.TRIGGER_SCROLL
          ? current && current.trigger.threshold
          : current && current.trigger.duration;
        const parameter = Number.isFinite(currentParameter) && currentParameter >= 0
          ? currentParameter
          : Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
        const trigger = value === api.TRIGGER_SCROLL
          ? { tipo: api.TRIGGER_SCROLL, threshold: parameter }
          : { tipo: api.TRIGGER_LOAD, duration: parameter };
        await saveInteractionModel(target, api.buildInteraction(trigger, states));
      });

      paramInput.addEventListener('change', async () => {
        const target = editor.getSelected() || component;
        const current = interactionsFor(target);
        if (!current) return;
        const value = Number.parseFloat(paramInput.value);
        if (!Number.isFinite(value) || value < 0) return;
        if (current.trigger.tipo === api.TRIGGER_SCROLL) current.trigger.threshold = value;
        else current.trigger.duration = value;
        await saveInteractionModel(target, current);
      });

      const buttons = createElement(hostDocument, 'div', 'cod-ci__interactions-buttons');
      const initialButton = createElement(hostDocument, 'button', '', 'Fijar estado inicial');
      initialButton.type = 'button';
      initialButton.addEventListener('click', () => captureInteractionState(component, api.STATE_INITIAL));
      const finalButton = createElement(hostDocument, 'button', '', 'Fijar estado final');
      finalButton.type = 'button';
      finalButton.addEventListener('click', () => captureInteractionState(component, api.STATE_FINAL));
      buttons.append(initialButton, finalButton);
      panel.appendChild(buttons);

      const statusText = interaction
        ? `${interaction.trigger.tipo === api.TRIGGER_SCROLL ? 'Scroll' : 'Carga'} · inicio ${hasInitial ? 'fijado' : 'pendiente'} · fin ${hasFinal ? 'fijado' : 'pendiente'}${hasInitial && hasFinal ? ' (interpolando)' : ''}`
        : 'Fijá ambos estados para interpolar.';
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__interactions-status', statusText));

      if (interaction) {
        const clear = createElement(hostDocument, 'button', 'cod-ci__interactions-clear', 'Quitar interacción');
        clear.type = 'button';
        clear.addEventListener('click', () => saveInteractionModel(editor.getSelected() || component, null));
        panel.appendChild(clear);
      }

      return panel;
    }

    const PRESENTATION_BREAKPOINTS = {
      desktop: null,
      tablet: '(max-width: 992px)',
      mobile: '(max-width: 480px)',
    };

    function ensurePresentationIdentity(component) {
      const attributes = componentAttributes(component);
      let identity = String(attributes['data-cod-presentation-id'] || '').trim();
      if (!identity) {
        identity = `cod-presentation-${normalizeClassName(component.getId?.() || component.cid || 'elemento')}`;
        component.addAttributes({ 'data-cod-presentation-id': identity });
      }
      return identity;
    }

    function presentationRule(component, breakpoint) {
      const selector = `[data-cod-presentation-id="${ensurePresentationIdentity(component)}"]`;
      const media = PRESENTATION_BREAKPOINTS[breakpoint];
      const options = media ? { atRuleType: 'media', atRuleParams: media } : {};
      return { selector, options, rule: editor.Css.getRule(selector, options) };
    }

    function presentationOffset(component, breakpoint) {
      const { rule } = presentationRule(component, breakpoint);
      const value = String(rule?.getStyle?.()?.translate || '').trim();
      const match = /^0(?:px)?\s+(-?\d*\.?\d+)px$/.exec(value);
      return match ? match[1] : '';
    }

    async function setPresentationOffset(component, breakpoint, rawValue) {
      const numeric = Number.parseFloat(rawValue);
      const { selector, options } = presentationRule(component, breakpoint);
      const translate = Number.isFinite(numeric) ? `0 ${numeric}px` : '';
      editor.Css.setRule(selector, { translate }, { ...options, addStyles: true });
      selected = component;
      await refreshAfterRender();
    }

    function presentationValue(component, breakpoint, property) {
      const { rule } = presentationRule(component, breakpoint);
      return String(rule?.getStyle?.()?.[property] || '').trim();
    }

    async function setPresentationValue(component, breakpoint, property, rawValue) {
      const value = String(rawValue || '').trim();
      const { selector, options } = presentationRule(component, breakpoint);
      editor.Css.setRule(selector, { [property]: value }, { ...options, addStyles: true });
      if (property === 'position' && value === 'absolute') {
        const parent = component.parent?.();
        if (parent && !presentationValue(parent, breakpoint, 'position')) {
          const parentRule = presentationRule(parent, breakpoint);
          editor.Css.setRule(parentRule.selector, { position: 'relative' }, { ...parentRule.options, addStyles: true });
        }
      }
      selected = component;
      await refreshAfterRender();
    }

    function appendPresentationField(container, component, breakpoint, property, labelText, placeholder) {
      const label = createElement(hostDocument, 'label', '', labelText);
      const input = createElement(hostDocument, 'input');
      input.type = 'text';
      input.placeholder = placeholder || (breakpoint === 'desktop' ? 'sin definir' : 'hereda');
      input.value = presentationValue(component, breakpoint, property);
      input.addEventListener('change', () => setPresentationValue(component, breakpoint, property, input.value));
      label.appendChild(input);
      container.appendChild(label);
    }

    /**
     * Etiquetas que NUNCA se editan como texto simple: tienen su propio
     * significado (fuente, medio) y ya cuentan con un panel dedicado, o no
     * son elementos de contenido en absoluto.
     */
    const TEXTO_NO_APLICA = new Set(['img', 'video', 'audio', 'source', 'picture', 'svg', 'iframe', 'canvas', 'input', 'select', 'textarea', 'br', 'hr']);

    /**
     * Un componente es "texto simple" cuando es una hoja: no tiene
     * componentes hijos propios (nada seleccionable por separado adentro).
     * Eso cubre exactamente lo que hoy solo se puede tocar entrando al
     * lienzo — un botón, un enlace, un título, un párrafo — y excluye
     * naturalmente los contenedores (secciones, columnas, grupos), que sí
     * tienen estructura interna y no tienen "el" contenido como un único
     * texto.
     */
    function esTextoSimple(component) {
      if (!component) return false;
      const el = getElement(component);
      if (!el) return false;
      const tag = String(component.get?.('tagName') || '').toLowerCase();
      if (TEXTO_NO_APLICA.has(tag)) return false;
      const hijos = typeof component.components === 'function' ? component.components() : null;
      if (hijos && typeof hijos.length === 'number' && hijos.length > 0) return false;
      return true;
    }

    function textoActual(component) {
      const el = getElement(component);
      return el ? el.textContent.trim() : '';
    }

    function renderContentPanel(component) {
      if (!esTextoSimple(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__content');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__content-title', 'Contenido de texto'));
      const campo = createElement(hostDocument, 'textarea', 'cod-ci__content-field');
      campo.rows = 2;
      campo.value = textoActual(component);
      campo.placeholder = 'Texto de este elemento…';
      let ultimoAplicado = campo.value;
      function aplicar() {
        const nuevo = campo.value;
        if (nuevo === ultimoAplicado) return;
        ultimoAplicado = nuevo;
        // Misma vía que usa el puente headless para lo mismo: reemplaza los
        // hijos del componente por el texto, por la API real de Grapes — no
        // innerHTML a mano, y sin pasar por el editor de texto del lienzo,
        // que es donde vive el defecto de los espacios.
        component.components(nuevo);
      }
      campo.addEventListener('blur', aplicar);
      campo.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          aplicar();
          campo.blur();
        }
      });
      panel.appendChild(campo);
      panel.appendChild(createElement(
        hostDocument, 'div', 'cod-ci__content-hint',
        'Enter o clic afuera para aplicar. Reemplaza el uso del editor del lienzo para este texto.',
      ));
      return panel;
    }

    function renderPresentationPanel(component) {
      if (!component || !getElement(component)) return null;
      const panel = createElement(hostDocument, 'section', 'cod-ci__presentation');
      panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__presentation-title', 'Presentación · posición'));
      const grid = createElement(hostDocument, 'div', 'cod-ci__presentation-grid');
      for (const [breakpoint, labelText] of [['desktop', 'Escritorio'], ['tablet', 'Tablet'], ['mobile', 'Móvil']]) {
        const label = createElement(hostDocument, 'label', '', `${labelText} (Y px)`);
        const input = createElement(hostDocument, 'input');
        input.type = 'number';
        input.step = '1';
        input.placeholder = breakpoint === 'desktop' ? '0' : 'hereda';
        input.value = presentationOffset(component, breakpoint);
        input.addEventListener('change', () => setPresentationOffset(component, breakpoint, input.value));
        label.appendChild(input);
        grid.appendChild(label);
      }
      const responsive = createElement(hostDocument, 'div', 'cod-ci__presentation-responsive');
      for (const [breakpoint, labelText] of [['desktop', 'Escritorio'], ['tablet', 'Tablet'], ['mobile', 'Móvil']]) {
        const group = createElement(hostDocument, 'fieldset', 'cod-ci__presentation-device');
        group.appendChild(createElement(hostDocument, 'legend', '', labelText));
        const positionLabel = createElement(hostDocument, 'label', '', 'Posición');
        const position = createElement(hostDocument, 'select');
        for (const [value, text] of [['', 'Heredar / normal'], ['relative', 'Relativa'], ['absolute', 'Absoluta'], ['fixed', 'Fija'], ['sticky', 'Sticky']]) {
          const option = createElement(hostDocument, 'option', '', text);
          option.value = value;
          position.appendChild(option);
        }
        position.value = presentationValue(component, breakpoint, 'position');
        position.addEventListener('change', () => setPresentationValue(component, breakpoint, 'position', position.value));
        positionLabel.appendChild(position);
        group.appendChild(positionLabel);
        appendPresentationField(group, component, breakpoint, 'min-height', 'Alto mínimo', '30vh / 30svh');
        for (const property of ['top', 'right', 'bottom', 'left']) {
          appendPresentationField(group, component, breakpoint, property, property, 'auto / 5px / 3vh / 10%');
        }
        responsive.appendChild(group);
      }
      panel.append(
        grid,
        responsive,
        createElement(
          hostDocument,
          'div',
          'cod-ci__presentation-hint',
          'Los valores aceptan px, %, vh y svh. Al elegir posición absoluta, el contenedor padre se ancla automáticamente como relativo. Tablet y Móvil heredan Escritorio mientras estén vacíos.',
        ),
      );
      return panel;
    }

    function render() {
      if (!root || !body || !targetLabel) return;
      // Cualquier render (cambio de selección, edición, etc.) invalida el
      // botón que ancla el picker de presets — ciérralo siempre para no dejar
      // un popover flotante apuntando a un componente que ya no es el
      // seleccionado.
      closeColumnPresetsPopover();
      targetLabel.textContent = snapshot?.description || 'Ningún elemento seleccionado';
      body.replaceChildren();
      const classes = snapshot?.classes || [];
      if (classSelect) {
        classSelect.replaceChildren();
        if (!classes.length) {
          const option = createElement(hostDocument, 'option', '', 'Nueva clase…');
          option.value = '';
          classSelect.appendChild(option);
        } else {
          for (const className of classes) {
            const option = createElement(hostDocument, 'option', '', `.${className}`);
            option.value = className;
            classSelect.appendChild(option);
          }
        }
        if (classField) classField.hidden = scopeSelect?.value !== 'class';
      }
      const contentPanel = renderContentPanel(snapshot?.component);
      if (contentPanel) body.appendChild(contentPanel);
      const headerPanel = renderHeaderStatePanel(headerForComponent(snapshot?.component));
      if (headerPanel) body.appendChild(headerPanel);
      const supermoduleTrail = renderSupermoduleBreadcrumb(snapshot?.component);
      if (supermoduleTrail) body.appendChild(supermoduleTrail);
      const supermodulePanel = renderSupermodulePanel(snapshot?.component);
      if (supermodulePanel) body.appendChild(supermodulePanel);
      const lumaPanel = renderLumaMattePanel(snapshot?.component);
      if (lumaPanel) body.appendChild(lumaPanel);
      const rotationPanel = renderImageRotationPanel(snapshot?.component);
      if (rotationPanel) body.appendChild(rotationPanel);
      const presentationPanel = renderPresentationPanel(snapshot?.component);
      if (presentationPanel) body.appendChild(presentationPanel);
      const interactionsPanel = renderInteractionsPanel(snapshot?.component);
      if (interactionsPanel) body.appendChild(interactionsPanel);
      const dynamicSourcePanel = renderDynamicSourcePanel(snapshot?.component);
      if (dynamicSourcePanel) body.appendChild(dynamicSourcePanel);
      const columnPresetsPanel = renderColumnPresetsPanel(snapshot?.component);
      // La paleta visual se abre desde el control principal de Columnas.
      const saveModulePanel = renderSaveModulePanel(snapshot?.component);
      if (saveModulePanel) body.appendChild(saveModulePanel);
      const svgImage = externalSvgImageFor(snapshot?.component) || firstExternalSvgImage();
      const brandVector = firstBrandVector();
      if (svgImage || brandVector) {
        const panel = createElement(hostDocument, 'div', 'cod-ci__svg');
        panel.appendChild(createElement(hostDocument, 'div', 'cod-ci__svg-title', 'Brand · logotipo vectorial'));
        const colors = createElement(hostDocument, 'div', 'cod-ci__svg-colors');
        const lightLabel = createElement(hostDocument, 'label', '', 'Color claro');
        const lightInput = createElement(hostDocument, 'input');
        lightInput.type = 'color';
        lightInput.value = '#111111';
        lightLabel.appendChild(lightInput);
        const darkLabel = createElement(hostDocument, 'label', '', 'Color oscuro');
        const darkInput = createElement(hostDocument, 'input');
        darkInput.type = 'color';
        darkInput.value = '#ffffff';
        darkLabel.appendChild(darkInput);
        colors.append(lightLabel, darkLabel);
        const apply = createElement(
          hostDocument,
          'button',
          '',
          brandVector ? 'Aplicar colores de marca' : 'Convertir SVG en Brand y aplicar',
        );
        apply.type = 'button';
        apply.addEventListener('click', async () => {
          apply.disabled = true;
          try {
            await applySvgMask(lightInput.value, darkInput.value);
          } finally {
            apply.disabled = false;
          }
        });
        panel.append(
          colors,
          apply,
          createElement(
            hostDocument,
            'div',
            'cod-ci__svg-hint',
            brandVector
              ? 'SVG nativo editable. Los colores son propiedades de Brand y responden al modo claro u oscuro.'
              : 'El SVG externo se convertirá en geometría vectorial nativa; no se tratará como una imagen.',
          ),
        );
        body.appendChild(panel);
      }

      if (!snapshot) {
        body.appendChild(createElement(hostDocument, 'div', 'cod-ci__empty', 'Selecciona un elemento del lienzo.'));
        return;
      }

      for (const value of Object.values(snapshot.values)) {
        const row = createElement(hostDocument, 'div', 'cod-ci__row');
        const label = createElement(hostDocument, 'label', 'cod-ci__label');
        label.appendChild(createElement(hostDocument, 'span', '', value.label));
        label.appendChild(createElement(hostDocument, 'span', 'cod-ci__value', value.computedValue || '—'));
        const input = createElement(hostDocument, 'input');
        input.value = value.computedValue;
        input.dataset.property = value.property;
        input.addEventListener('change', async () => {
          const scope = scopeSelect?.value || 'local';
          if (scope === 'class') {
            let className = classSelect?.value;
            if (!className) {
              className = global.prompt?.('Nombre de la nueva clase reutilizable:', 'cod-estilo') || '';
            }
            await applyClassStyle(value.property, input.value, className);
          } else {
            await applyLocalStyle(value.property, input.value);
          }
        });
        row.append(label, input, createElement(hostDocument, 'div', 'cod-ci__origin', originText(value)));
        body.appendChild(row);
      }
    }

    function mount(target) {
      if (!hostDocument) return null;
      installStyles(hostDocument);
      root = target || opts.mount || createElement(hostDocument, 'aside', 'cod-ci');
      if (!root.parentNode) hostDocument.body.appendChild(root);
      root.classList.add('cod-ci');
      root.replaceChildren();
      const head = createElement(hostDocument, 'div', 'cod-ci__head');
      head.classList.add('is-collapsed');
      const headbar = createElement(hostDocument, 'div', 'cod-ci__headbar');
      const identity = createElement(hostDocument, 'div', 'cod-ci__identity');
      identity.appendChild(createElement(hostDocument, 'div', 'cod-ci__title', 'Elemento seleccionado'));
      targetLabel = createElement(hostDocument, 'div', 'cod-ci__target', 'Ningún elemento seleccionado');
      identity.appendChild(targetLabel);
      headbar.appendChild(identity);
      const headToggle = createElement(hostDocument, 'button', 'cod-ci__head-toggle', 'Mostrar alcance');
      headToggle.type = 'button';
      headToggle.setAttribute('aria-expanded', 'false');
      headToggle.addEventListener('click', () => {
        const expanded = head.classList.toggle('is-collapsed') === false;
        headToggle.textContent = expanded ? 'Ocultar alcance' : 'Mostrar alcance';
        headToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
      head.appendChild(headbar);
      head.appendChild(headToggle);
      const scope = createElement(hostDocument, 'div', 'cod-ci__scope');
      const scopeField = createElement(hostDocument, 'label', 'cod-ci__scope-label');
      scopeField.appendChild(createElement(hostDocument, 'span', '', '¿Dónde aplicar los cambios?'));
      scopeSelect = createElement(hostDocument, 'select');
      for (const [key, text] of [
        ['local', 'Solamente al elemento seleccionado'],
        ['class', 'A todos los elementos de una clase'],
      ]) {
        const option = createElement(hostDocument, 'option', '', text);
        option.value = key;
        scopeSelect.appendChild(option);
      }
      scopeField.append(
        scopeSelect,
        createElement(hostDocument, 'div', 'cod-ci__scope-help', 'Normalmente usa la primera opción. La segunda permite compartir el mismo diseño entre varios elementos.'),
      );
      classField = createElement(hostDocument, 'label', 'cod-ci__scope-label cod-ci__scope-class');
      classField.appendChild(createElement(hostDocument, 'span', '', 'Clase que compartirá el diseño'));
      classSelect = createElement(hostDocument, 'select');
      classField.appendChild(classSelect);
      classField.hidden = true;
      scopeSelect.addEventListener('change', () => {
        classField.hidden = scopeSelect.value !== 'class';
      });
      scope.append(scopeField, classField);
      head.appendChild(scope);
      body = createElement(hostDocument, 'div', 'cod-ci__body');
      root.append(head, body);
      render();
      return root;
    }

    function onSelected(component) {
      selected = component;
      refresh(component);
      updateHeaderToolbar(component);
    }

    function onDeselected() {
      selected = editor.getSelected() || null;
      refresh(selected);
      if (selected) updateHeaderToolbar(selected);
      else restoreHeaderToolbar();
    }

    editor.Commands.add('cod-header-states-open', () => {
      const target = editor.getSelected() || selected;
      const header = headerForComponent(target);
      if (!header) return;
      if (!headerIsActive(header)) setHeaderPreviewState('entry', target);
      else {
        updateHeaderToolbar(target);
        refresh(target);
      }
      openInspectorPanel();
    });
    editor.Commands.add('cod-entity-settings-open', () => {
      const target = editor.getSelected() || selected;
      if (!target) return;
      refresh(target);
      openInspectorPanel();
    });
    editor.Commands.add('cod-header-state-entry', () => {
      setHeaderPreviewState('entry', editor.getSelected() || selected);
    });
    editor.Commands.add('cod-header-state-scroll', () => {
      setHeaderPreviewState('scrolled', editor.getSelected() || selected);
    });

    function onAcfFieldsLoaded() {
      // La lista de campos ACF puede llegar después de que el panel ya esté
      // montado y un componente de contenido ya esté seleccionado; re-renderiza
      // para que el <select> "Fuente de contenido" ofrezca las opciones.
      render();
    }

    editor.on('component:selected', onSelected);
    editor.on('component:deselected', onDeselected);
    editor.on('component:styleUpdate', refreshAfterRender);
    hostDocument?.addEventListener?.('ocd:acf-fields-loaded', onAcfFieldsLoaded);

    const api = {
      inspect,
      refresh,
      getSnapshot: () => snapshot,
      applyLocalStyle,
      applyClassStyle,
      applySvgMask,
      headerForComponent,
      setHeaderPreviewState,
      lumaMatteMarkup,
      normalVideoMarkup,
      lumaMatteTargetFor,
      videoSourceDescriptor,
      openColumnPresets(component, anchor) {
        if (!component || !anchor) return;
        if (columnPresetsPopoverEl) closeColumnPresetsPopover();
        else openColumnPresetsPopover(component, anchor);
      },
      mount,
      destroy() {
        editor.off('component:selected', onSelected);
        editor.off('component:deselected', onDeselected);
        editor.off('component:styleUpdate', refreshAfterRender);
        hostDocument?.removeEventListener?.('ocd:acf-fields-loaded', onAcfFieldsLoaded);
        previewHeaderElement?.removeAttribute('data-cod-preview-scroll-state');
        previewHeaderElement?.classList.remove('nav--scrolled');
        previewHeaderElement = null;
        restoreHeaderToolbar();
        editor.Commands.remove?.('cod-header-states-open');
        editor.Commands.remove?.('cod-header-state-entry');
        editor.Commands.remove?.('cod-header-state-scroll');
        root?.remove();
        root = null;
      },
    };

    if (opts.mount !== false) mount(opts.mount instanceof global.Element ? opts.mount : null);
    if (editor.getSelected()) {
      refresh(editor.getSelected());
      updateHeaderToolbar(editor.getSelected());
    }
    editor.OCDComputedInspector = api;
    return api;
  }

  function plugin(editor, options) {
    return createOcdComputedInspector(editor, options);
  }

  global.OCDComputedInspector = {
    create: createOcdComputedInspector,
    plugin,
    defaultProperties: DEFAULT_PROPERTIES.map(([property, label]) => ({ property, label })),
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
