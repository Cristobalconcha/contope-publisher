/* Generated from ocd-canvas-grid.js; run npm run build:grid-global. */
/**
 * Open CoDesign Canvas Grid for GrapesJS.
 *
 * Turns existing CSS Grid containers into editable layout components without
 * replacing their children or flattening their HTML.  The plugin deliberately
 * stores layout rules in GrapesJS' CssComposer so they survive project export.
 */

const GRID_PRESETS = Object.freeze({
  '1/1/1': 'repeat(3, minmax(0, 1fr))',
  '2/1/1': 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
  '1/2/1': 'minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr)',
  '1/1/2': 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)',
  '1/2': 'minmax(0, 1fr) minmax(0, 2fr)',
  '2/1': 'minmax(0, 2fr) minmax(0, 1fr)',
  '45/55': 'minmax(0, 45fr) minmax(0, 55fr)',
});

const DEFAULT_BREAKPOINTS = Object.freeze({
  desktop: null,
  tablet: '(max-width: 992px)',
  mobile: '(max-width: 480px)',
});

const GRID_ATTRIBUTE = 'data-ocd-grid-id';
const CONFIG_PROPERTY = 'ocdGridConfig';

function collectionItems(collection) {
  return collection?.models ?? (typeof collection?.toArray === 'function' ? collection.toArray() : []);
}

function visit(component, callback) {
  callback(component);
  for (const child of collectionItems(component.components?.())) visit(child, callback);
}

function sanitizeIdentifier(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getGridId(component) {
  const attributes = component.getAttributes?.() ?? {};
  const existing = attributes[GRID_ATTRIBUTE];
  if (existing) return existing;

  const source = attributes.id || component.getId?.() || component.cid;
  return `ocd-grid-${sanitizeIdentifier(source)}`;
}

function getClassNames(component) {
  const classes = component.getClasses?.() ?? [];
  return classes.map((item) => (typeof item === 'string' ? item : item.get?.('name'))).filter(Boolean);
}

function ensureGridIdentity(component) {
  const gridId = getGridId(component);
  const className = gridId;
  component.addAttributes?.({ [GRID_ATTRIBUTE]: gridId });
  if (!getClassNames(component).includes(className)) component.addClass?.(className);
  return { gridId, className, selector: `.${className}` };
}

function styleDeclaresGrid(component) {
  const style = component.getStyle?.() ?? {};
  return style.display === 'grid' || style.display === 'inline-grid';
}

function computedStyleFor(component) {
  const element = component.getEl?.();
  const view = element?.ownerDocument?.defaultView;
  if (!element || element.nodeType !== 1 || !view?.getComputedStyle) return null;
  return view.getComputedStyle(element);
}

function isGridComponent(component) {
  if (!component) return false;
  if (styleDeclaresGrid(component)) return true;
  const computed = computedStyleFor(component);
  return computed?.display === 'grid' || computed?.display === 'inline-grid';
}

function normalizeWeights(weights) {
  const parsed = Array.isArray(weights)
    ? weights.map(Number)
    : String(weights)
        .trim()
        .split(/[\s/:,]+/)
        .filter(Boolean)
        .map(Number);

  if (parsed.length < 1 || parsed.some((number) => !Number.isFinite(number) || number <= 0)) {
    throw new TypeError('A custom grid needs at least one positive numeric proportion.');
  }
  return parsed;
}

function weightsToTemplate(weights) {
  return normalizeWeights(weights).map((weight) => `minmax(0, ${weight}fr)`).join(' ');
}

function templateToWeights(template) {
  if (!template) return [];
  const repeated = String(template).match(/^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0\s*,\s*([\d.]+)fr\s*\)\s*\)$/i);
  if (repeated) return Array(Number(repeated[1])).fill(Number(repeated[2]));

  const matches = [...String(template).matchAll(/(?:minmax\(\s*0\s*,\s*)?([\d.]+)fr\)?/gi)];
  return matches.map((match) => Number(match[1])).filter((number) => Number.isFinite(number));
}

/**
 * Adjust the boundary between two adjacent tracks. Positive delta makes the
 * left track wider. The total of both tracks is conserved.
 */
function resizeTrackBoundary(weights, boundaryIndex, delta, minimum = 0.1) {
  const result = normalizeWeights(weights);
  if (boundaryIndex < 0 || boundaryIndex >= result.length - 1) {
    throw new RangeError('The grid boundary does not exist.');
  }
  const pairTotal = result[boundaryIndex] + result[boundaryIndex + 1];
  const left = Math.max(minimum, Math.min(pairTotal - minimum, result[boundaryIndex] + Number(delta)));
  result[boundaryIndex] = left;
  result[boundaryIndex + 1] = pairTotal - left;
  return result;
}

function resolveBreakpoint(editor, requested, breakpoints) {
  if (requested) return requested;
  const selected = editor.DeviceManager?.getSelected?.();
  const raw = selected?.get?.('id') || selected?.get?.('name') || 'desktop';
  let normalized = String(raw).toLowerCase();
  if (normalized.startsWith('mobile')) normalized = 'mobile';
  return Object.hasOwn(breakpoints, normalized) ? normalized : 'desktop';
}

function mediaOptions(breakpoint, breakpoints) {
  const media = breakpoints[breakpoint];
  return media ? { atRuleType: 'media', atRuleParams: media } : {};
}

function setGridRule(editor, component, breakpoint, patch, breakpoints) {
  const { selector } = ensureGridIdentity(component);
  const options = mediaOptions(breakpoint, breakpoints);
  return editor.Css.setRule(selector, patch, { ...options, addStyles: true });
}

function updateStoredConfig(component, breakpoint, patch) {
  const previous = component.get?.(CONFIG_PROPERTY) ?? {};
  const next = {
    ...previous,
    [breakpoint]: { ...(previous[breakpoint] ?? {}), ...patch },
  };
  component.set?.(CONFIG_PROPERTY, next);
  return next;
}

function normalizeGap(gap) {
  return typeof gap === 'number' ? `${gap}px` : String(gap);
}

function currentTemplate(editor, component, breakpoint, breakpoints) {
  const config = component.get?.(CONFIG_PROPERTY)?.[breakpoint];
  if (config?.template) return config.template;

  const { selector } = ensureGridIdentity(component);
  const rule = editor.Css.getRule(selector, mediaOptions(breakpoint, breakpoints));
  const fromRule = rule?.getStyle?.()?.['grid-template-columns'];
  if (fromRule) return fromRule;

  if (breakpoint === 'desktop') {
    return (
      component.getStyle?.()?.['grid-template-columns'] ||
      computedStyleFor(component)?.gridTemplateColumns ||
      ''
    );
  }
  return '';
}

function addGridStyleSector(editor) {
  if (!editor.StyleManager?.addSector) return;
  editor.StyleManager.addType('ocd-grid-template', {
    create({ change }) {
      const root = document.createElement('div');
      const select = document.createElement('select');
      select.dataset.ocdGridPreset = '';
      for (const [label, value] of Object.entries(GRID_PRESETS)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = 'Personalizada…';
      select.append(customOption);

      const input = document.createElement('input');
      input.dataset.ocdGridCustom = '';
      input.placeholder = 'Ej.: 1fr 1.5fr 1fr';
      input.hidden = true;

      select.addEventListener('change', (event) => {
        const custom = event.target.value === '__custom__';
        input.hidden = !custom;
        if (custom) input.focus();
        else change({ event });
      });
      input.addEventListener('change', (event) => change({ event }));
      root.append(select, input);
      return root;
    },
    emit({ updateStyle }, { event }) {
      if (event.target.value !== '__custom__') updateStyle(event.target.value);
    },
    update({ value, el }) {
      const select = el.querySelector('[data-ocd-grid-preset]');
      const input = el.querySelector('[data-ocd-grid-custom]');
      const known = Object.values(GRID_PRESETS).includes(value);
      select.value = known ? value : '__custom__';
      input.hidden = known;
      input.value = known ? '' : value;
    },
  });
  editor.StyleManager.addSector(
    'ocd-canvas-grid',
    {
      name: 'Columnas OCD',
      open: true,
      properties: [
        {
          property: 'grid-template-columns',
          name: 'Proporción',
          type: 'ocd-grid-template',
          default: GRID_PRESETS['1/1/1'],
        },
        { property: 'gap', name: 'Separación', type: 'number', units: ['px', 'rem', 'em', '%'] },
        { property: 'column-gap', name: 'Separación horizontal', type: 'number', units: ['px', 'rem', 'em', '%'] },
        { property: 'row-gap', name: 'Separación vertical', type: 'number', units: ['px', 'rem', 'em', '%'] },
      ],
    },
    { at: 0 },
  );
}

function createCanvasGridApi(editor, options = {}) {
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...(options.breakpoints ?? {}) };

  function recognize(component) {
    if (!isGridComponent(component)) return null;
    ensureGridIdentity(component);
    component.set?.('ocdGridRecognized', true);
    return component;
  }

  function scan(root = editor.getWrapper?.()) {
    const grids = [];
    if (!root) return grids;
    visit(root, (component) => {
      const recognized = recognize(component);
      if (recognized) grids.push(recognized);
    });
    return grids;
  }

  function assertGrid(component) {
    if (!component) throw new TypeError('Select a grid container first.');
    return recognize(component) ?? (() => {
      throw new TypeError('The selected component is not a CSS Grid container.');
    })();
  }

  function applyTemplate(component, template, settings = {}) {
    assertGrid(component);
    const breakpoint = resolveBreakpoint(editor, settings.breakpoint, breakpoints);
    const style = { display: 'grid', 'grid-template-columns': template };
    if (settings.gap != null) style.gap = normalizeGap(settings.gap);
    setGridRule(editor, component, breakpoint, style, breakpoints);
    updateStoredConfig(component, breakpoint, { template, ...(settings.gap != null ? { gap: normalizeGap(settings.gap) } : {}) });
    editor.trigger?.('ocd:grid:update', { component, breakpoint, style });
    return style;
  }

  function applyPreset(component, preset, settings = {}) {
    const template = GRID_PRESETS[preset];
    if (!template) throw new RangeError(`Unknown grid preset: ${preset}`);
    return applyTemplate(component, template, settings);
  }

  function applyCustom(component, weights, settings = {}) {
    return applyTemplate(component, weightsToTemplate(weights), settings);
  }

  function setGap(component, gap, settings = {}) {
    assertGrid(component);
    const breakpoint = resolveBreakpoint(editor, settings.breakpoint, breakpoints);
    const value = normalizeGap(gap);
    setGridRule(editor, component, breakpoint, { display: 'grid', gap: value }, breakpoints);
    updateStoredConfig(component, breakpoint, { gap: value });
    editor.trigger?.('ocd:grid:update', { component, breakpoint, style: { gap: value } });
    return value;
  }

  function resizeBoundary(component, boundaryIndex, delta, settings = {}) {
    assertGrid(component);
    const breakpoint = resolveBreakpoint(editor, settings.breakpoint, breakpoints);
    const template = currentTemplate(editor, component, breakpoint, breakpoints);
    const weights = templateToWeights(template);
    if (weights.length < 2) {
      throw new TypeError('The current grid template cannot be resized as proportional tracks.');
    }
    const resized = resizeTrackBoundary(weights, boundaryIndex, delta, settings.minimum);
    applyCustom(component, resized, { ...settings, breakpoint });
    return resized;
  }

  function getHandleModel(component, settings = {}) {
    assertGrid(component);
    const breakpoint = resolveBreakpoint(editor, settings.breakpoint, breakpoints);
    const weights = templateToWeights(currentTemplate(editor, component, breakpoint, breakpoints));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let accumulated = 0;
    return weights.slice(0, -1).map((weight, boundaryIndex) => {
      accumulated += weight;
      return {
        boundaryIndex,
        positionPercent: (accumulated / total) * 100,
        totalWeight: total,
        resize(delta) {
          return resizeBoundary(component, boundaryIndex, delta, { ...settings, breakpoint });
        },
      };
    });
  }

  return {
    presets: GRID_PRESETS,
    breakpoints,
    recognize,
    scan,
    applyPreset,
    applyCustom,
    setGap,
    resizeBoundary,
    getHandleModel,
    getActiveBreakpoint: () => resolveBreakpoint(editor, null, breakpoints),
    getConfig: (component) => component?.get?.(CONFIG_PROPERTY) ?? {},
  };
}

function ocdCanvasGrid(editor, options = {}) {
  const api = createCanvasGridApi(editor, options);
  editor.OcdCanvasGrid = api;
  addGridStyleSector(editor);

  editor.Commands?.add?.('ocd-grid:scan', { run: () => api.scan() });
  editor.Commands?.add?.('ocd-grid:apply-preset', {
    run: (_editor, _sender, commandOptions = {}) =>
      api.applyPreset(commandOptions.component ?? editor.getSelected?.(), commandOptions.preset, commandOptions),
  });
  editor.Commands?.add?.('ocd-grid:apply-custom', {
    run: (_editor, _sender, commandOptions = {}) =>
      api.applyCustom(commandOptions.component ?? editor.getSelected?.(), commandOptions.weights, commandOptions),
  });
  editor.Commands?.add?.('ocd-grid:set-gap', {
    run: (_editor, _sender, commandOptions = {}) =>
      api.setGap(commandOptions.component ?? editor.getSelected?.(), commandOptions.gap, commandOptions),
  });
  editor.Commands?.add?.('ocd-grid:resize-boundary', {
    run: (_editor, _sender, commandOptions = {}) =>
      api.resizeBoundary(
        commandOptions.component ?? editor.getSelected?.(),
        commandOptions.boundaryIndex,
        commandOptions.delta,
        commandOptions,
      ),
  });

  editor.on?.('load', () => api.scan());
  editor.on?.('component:add', (component) => api.recognize(component));
  editor.on?.('component:selected', (component) => api.recognize(component));
  return api;
}

globalThis.OCDCanvasGrid = Object.freeze({
  plugin: ocdCanvasGrid,
  createCanvasGridApi,
  GRID_PRESETS,
  DEFAULT_BREAKPOINTS,
  isGridComponent,
  normalizeWeights,
  weightsToTemplate,
  templateToWeights,
  resizeTrackBoundary,
});
