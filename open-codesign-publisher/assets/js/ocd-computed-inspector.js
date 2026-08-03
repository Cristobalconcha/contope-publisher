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
    return `${tag}${classes.length ? `.${classes.join('.')}` : ''}`;
  }

  function createElement(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function installStyles(document) {
    if (document.getElementById('ocd-computed-inspector-css')) return;
    const style = document.createElement('style');
    style.id = 'ocd-computed-inspector-css';
    style.textContent = `
      .ocd-ci { position:fixed; z-index:10000; top:44px; right:0; bottom:0; width:320px;
        overflow:auto; background:#1f2228; color:#f4f1eb; box-shadow:-4px 0 18px #0004;
        font:12px/1.4 Inter,system-ui,sans-serif; }
      .ocd-ci * { box-sizing:border-box; }
      .ocd-ci__head { position:sticky; top:0; z-index:2; padding:14px; background:#181b20; border-bottom:1px solid #ffffff18; }
      .ocd-ci__title { font-size:13px; font-weight:650; }
      .ocd-ci__target { margin-top:5px; color:#c7bda9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ocd-ci__scope { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:10px; }
      .ocd-ci select,.ocd-ci input { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px;
        background:#2a2e36; color:#fff; padding:6px 7px; font:inherit; }
      .ocd-ci__body { padding:8px 12px 22px; }
      .ocd-ci__row { padding:9px 0; border-bottom:1px solid #ffffff12; }
      .ocd-ci__label { display:flex; justify-content:space-between; gap:8px; margin-bottom:5px; color:#ded8cc; }
      .ocd-ci__value { color:#a9d9bd; font-variant-numeric:tabular-nums; }
      .ocd-ci__origin { margin-top:4px; color:#918b82; font-size:10px; overflow-wrap:anywhere; }
      .ocd-ci__empty { padding:28px 10px; text-align:center; color:#a9a39a; }
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

    function getElement(component) {
      return component && typeof component.getEl === 'function' ? component.getEl() : null;
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
      editor.Css.setRule(`.${className}`, styles, { addStyles: true });
      selected = component;
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

    function render() {
      if (!root || !body || !targetLabel) return;
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
      }
      if (!snapshot) {
        body.appendChild(createElement(hostDocument, 'div', 'ocd-ci__empty', 'Selecciona un elemento del lienzo.'));
        return;
      }

      for (const value of Object.values(snapshot.values)) {
        const row = createElement(hostDocument, 'div', 'ocd-ci__row');
        const label = createElement(hostDocument, 'label', 'ocd-ci__label');
        label.appendChild(createElement(hostDocument, 'span', '', value.label));
        label.appendChild(createElement(hostDocument, 'span', 'ocd-ci__value', value.computedValue || '—'));
        const input = createElement(hostDocument, 'input');
        input.value = value.computedValue;
        input.dataset.property = value.property;
        input.addEventListener('change', async () => {
          const scope = scopeSelect?.value || 'local';
          if (scope === 'class') {
            let className = classSelect?.value;
            if (!className) {
              className = global.prompt?.('Nombre de la nueva clase reutilizable:', 'ocd-estilo') || '';
            }
            await applyClassStyle(value.property, input.value, className);
          } else {
            await applyLocalStyle(value.property, input.value);
          }
        });
        row.append(label, input, createElement(hostDocument, 'div', 'ocd-ci__origin', originText(value)));
        body.appendChild(row);
      }
    }

    function mount(target) {
      if (!hostDocument) return null;
      installStyles(hostDocument);
      root = target || opts.mount || createElement(hostDocument, 'aside', 'ocd-ci');
      if (!root.parentNode) hostDocument.body.appendChild(root);
      root.classList.add('ocd-ci');
      root.replaceChildren();
      const head = createElement(hostDocument, 'div', 'ocd-ci__head');
      head.appendChild(createElement(hostDocument, 'div', 'ocd-ci__title', 'Diseño efectivo'));
      targetLabel = createElement(hostDocument, 'div', 'ocd-ci__target', 'Ningún elemento seleccionado');
      head.appendChild(targetLabel);
      const scope = createElement(hostDocument, 'div', 'ocd-ci__scope');
      scopeSelect = createElement(hostDocument, 'select');
      for (const [key, text] of [
        ['local', 'Sólo este elemento'],
        ['class', 'Estilo reutilizable'],
      ]) {
        const option = createElement(hostDocument, 'option', '', text);
        option.value = key;
        scopeSelect.appendChild(option);
      }
      classSelect = createElement(hostDocument, 'select');
      scope.append(scopeSelect, classSelect);
      head.appendChild(scope);
      body = createElement(hostDocument, 'div', 'ocd-ci__body');
      root.append(head, body);
      render();
      return root;
    }

    function onSelected(component) {
      selected = component;
      refresh(component);
    }

    function onDeselected() {
      selected = editor.getSelected() || null;
      refresh(selected);
    }

    editor.on('component:selected', onSelected);
    editor.on('component:deselected', onDeselected);
    editor.on('component:styleUpdate', refreshAfterRender);

    const api = {
      inspect,
      refresh,
      getSnapshot: () => snapshot,
      applyLocalStyle,
      applyClassStyle,
      mount,
      destroy() {
        editor.off('component:selected', onSelected);
        editor.off('component:deselected', onDeselected);
        editor.off('component:styleUpdate', refreshAfterRender);
        root?.remove();
        root = null;
      },
    };

    if (opts.mount !== false) mount(opts.mount instanceof global.Element ? opts.mount : null);
    if (editor.getSelected()) refresh(editor.getSelected());
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
