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
      .ocd-ci__svg { margin:8px 0; padding:10px; border:1px solid #a7641a66; border-radius:6px; background:#a7641a14; }
      .ocd-ci__svg-title { margin-bottom:8px; color:#f0c28e; font-weight:650; }
      .ocd-ci__svg-colors { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .ocd-ci__svg-colors label { display:grid; gap:4px; color:#c7bda9; font-size:10px; }
      .ocd-ci__svg input[type="color"] { min-height:34px; padding:3px; cursor:pointer; }
      .ocd-ci__svg button { width:100%; margin-top:8px; border:1px solid #b8752a; border-radius:5px;
        padding:7px; background:#a7641a; color:#fff; cursor:pointer; font:inherit; font-weight:650; }
      .ocd-ci__svg-hint { margin-top:7px; color:#a9a39a; font-size:10px; }
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
      return wrapper.find('[data-ocd-brand-logo]')[0] || null;
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
      renderedSvg.setAttribute('data-ocd-brand-logo', 'primary');
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
      const classes = componentClasses(imageComponent).filter((name) => name !== 'ocd-brand-logo');
      renderedSvg.setAttribute('class', [...classes, 'ocd-brand-logo'].join(' '));
      scratch.remove();
      return renderedSvg.outerHTML;
    }

    function setBrandColorRules(lightColor, darkColor) {
      editor.Css.setRule(
        '.ocd-brand-logo',
        { '--ocd-brand-color': lightColor, '--ocd-brand-color-dark': darkColor },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.ocd-brand-logo path, .ocd-brand-logo g, .ocd-brand-logo circle, .ocd-brand-logo rect, .ocd-brand-logo line, .ocd-brand-logo polyline, .ocd-brand-logo polygon',
        { fill: 'var(--ocd-brand-color)' },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.dark .ocd-brand-logo, [data-theme="dark"] .ocd-brand-logo',
        { '--ocd-brand-color': 'var(--ocd-brand-color-dark)' },
        { addStyles: true },
      );
      editor.Css.setRule(
        '.ocd-brand-logo',
        { '--ocd-brand-color': 'var(--ocd-brand-color-dark)' },
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
      const svgImage = externalSvgImageFor(snapshot?.component) || firstExternalSvgImage();
      const brandVector = firstBrandVector();
      if (svgImage || brandVector) {
        const panel = createElement(hostDocument, 'div', 'ocd-ci__svg');
        panel.appendChild(createElement(hostDocument, 'div', 'ocd-ci__svg-title', 'Brand · logotipo vectorial'));
        const colors = createElement(hostDocument, 'div', 'ocd-ci__svg-colors');
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
            'ocd-ci__svg-hint',
            brandVector
              ? 'SVG nativo editable. Los colores son propiedades de Brand y responden al modo claro u oscuro.'
              : 'El SVG externo se convertirá en geometría vectorial nativa; no se tratará como una imagen.',
          ),
        );
        body.appendChild(panel);
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
      applySvgMask,
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
