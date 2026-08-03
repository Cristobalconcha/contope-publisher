(function installOcdGridControls(global) {
  'use strict';

  function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function installStyles(document) {
    if (document.getElementById('ocd-grid-controls-css')) return;
    const style = document.createElement('style');
    style.id = 'ocd-grid-controls-css';
    style.textContent = `
      .ocd-gc { margin-top:12px; padding-top:12px; border-top:1px solid #ffffff18; }
      .ocd-gc__title { display:flex; justify-content:space-between; gap:8px; margin-bottom:7px; font-weight:650; }
      .ocd-gc__target { color:#c7bda9; font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ocd-gc__row { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:7px; }
      .ocd-gc label { display:grid; gap:4px; color:#aaa49b; font-size:10px; }
      .ocd-gc select,.ocd-gc input,.ocd-gc button { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px;
        background:#2a2e36; color:#fff; padding:6px 7px; font:inherit; }
      .ocd-gc button { cursor:pointer; background:#a7641a; border-color:#b8752a; font-weight:650; }
      .ocd-gc button:disabled,.ocd-gc select:disabled,.ocd-gc input:disabled { opacity:.42; cursor:not-allowed; }
      .ocd-gc__hint { margin-top:7px; color:#918b82; font-size:10px; }
    `;
    document.head.appendChild(style);
  }

  function describe(component) {
    if (!component) return 'sin contenedor';
    const classes = component.getClasses?.() ?? [];
    return classes.length ? `.${classes.join('.')}` : component.get('tagName') || 'grid';
  }

  function create(editor, gridApi, options) {
    if (!editor || !gridApi) throw new Error('OCD Grid Controls requiere editor y Canvas Grid API.');
    const opts = options || {};
    const hostDocument = opts.document || global.document;
    const mount = opts.mount || hostDocument.querySelector('.ocd-ci__head') || hostDocument.body;
    installStyles(hostDocument);

    const root = element(hostDocument, 'section', 'ocd-gc');
    const title = element(hostDocument, 'div', 'ocd-gc__title');
    title.append(element(hostDocument, 'span', '', 'Columnas'), element(hostDocument, 'span', 'ocd-gc__target', 'sin contenedor'));
    const firstRow = element(hostDocument, 'div', 'ocd-gc__row');
    const presetLabel = element(hostDocument, 'label', '', 'Preset');
    const preset = element(hostDocument, 'select');
    for (const name of Object.keys(gridApi.presets)) {
      const option = element(hostDocument, 'option', '', name);
      option.value = name;
      preset.appendChild(option);
    }
    const breakpointLabel = element(hostDocument, 'label', '', 'Dispositivo');
    const breakpoint = element(hostDocument, 'select');
    for (const [value, label] of [['desktop', 'Escritorio'], ['tablet', 'Tablet'], ['mobile', 'Móvil']]) {
      const option = element(hostDocument, 'option', '', label);
      option.value = value;
      breakpoint.appendChild(option);
    }
    presetLabel.appendChild(preset);
    breakpointLabel.appendChild(breakpoint);
    firstRow.append(presetLabel, breakpointLabel);

    const secondRow = element(hostDocument, 'div', 'ocd-gc__row');
    const customLabel = element(hostDocument, 'label', '', 'Proporción libre');
    const custom = element(hostDocument, 'input');
    custom.placeholder = '1 / 2 / 1';
    const gapLabel = element(hostDocument, 'label', '', 'Separación');
    const gap = element(hostDocument, 'input');
    gap.placeholder = '2rem';
    customLabel.appendChild(custom);
    gapLabel.appendChild(gap);
    secondRow.append(customLabel, gapLabel);

    const thirdRow = element(hostDocument, 'div', 'ocd-gc__row');
    const applyPreset = element(hostDocument, 'button', '', 'Aplicar preset');
    const applyCustom = element(hostDocument, 'button', '', 'Aplicar proporción');
    thirdRow.append(applyPreset, applyCustom);
    const hint = element(hostDocument, 'div', 'ocd-gc__hint', 'Selecciona una tarjeta o su contenedor. Las líneas del lienzo permiten arrastrar cada división.');
    root.append(title, firstRow, secondRow, thirdRow, hint);
    mount.appendChild(root);

    let selectedGrid = null;
    let overlay = null;

    function findGrid(component) {
      let current = component;
      while (current) {
        if (gridApi.recognize(current)) return current;
        current = current.parent?.();
      }
      return null;
    }

    function setEnabled(enabled) {
      for (const control of [preset, breakpoint, custom, gap, applyPreset, applyCustom]) control.disabled = !enabled;
    }

    function removeOverlay() {
      overlay?.remove();
      overlay = null;
    }

    function renderHandles() {
      removeOverlay();
      if (!selectedGrid) return;
      const gridElement = selectedGrid.getEl?.();
      const document = gridElement?.ownerDocument;
      if (!gridElement || !document) return;
      const rect = gridElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const handles = gridApi.getHandleModel(selectedGrid, { breakpoint: breakpoint.value });
      if (!handles.length) return;

      overlay = document.createElement('div');
      overlay.dataset.ocdGridOverlay = 'true';
      Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483000', pointerEvents: 'none' });
      for (const handle of handles) {
        const grip = document.createElement('button');
        grip.type = 'button';
        grip.title = 'Arrastra para modificar la proporción de columnas';
        grip.setAttribute('aria-label', `Separador de columnas ${handle.boundaryIndex + 1}`);
        Object.assign(grip.style, {
          position: 'fixed',
          left: `${rect.left + (rect.width * handle.positionPercent) / 100 - 5}px`,
          top: `${rect.top}px`,
          width: '10px',
          height: `${rect.height}px`,
          padding: '0',
          border: '0',
          borderLeft: '2px solid #d88729',
          borderRight: '2px solid #d88729',
          background: 'rgba(216,135,41,.18)',
          cursor: 'col-resize',
          pointerEvents: 'auto',
        });
        grip.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          grip.setPointerCapture?.(event.pointerId);
          let lastX = event.clientX;
          const onMove = (moveEvent) => {
            const pixels = moveEvent.clientX - lastX;
            if (Math.abs(pixels) < 1) return;
            lastX = moveEvent.clientX;
            const delta = (pixels / rect.width) * handle.totalWeight;
            handle.resize(delta);
            global.requestAnimationFrame(renderHandles);
          };
          const onUp = () => {
            grip.removeEventListener('pointermove', onMove);
            grip.removeEventListener('pointerup', onUp);
            grip.removeEventListener('pointercancel', onUp);
            refresh(selectedGrid);
          };
          grip.addEventListener('pointermove', onMove);
          grip.addEventListener('pointerup', onUp);
          grip.addEventListener('pointercancel', onUp);
        });
        overlay.appendChild(grip);
      }
      document.body.appendChild(overlay);
    }

    function refresh(component) {
      selectedGrid = findGrid(component || editor.getSelected?.());
      setEnabled(Boolean(selectedGrid));
      root.querySelector('.ocd-gc__target').textContent = describe(selectedGrid);
      if (selectedGrid) {
        const config = gridApi.getConfig(selectedGrid)[breakpoint.value] || {};
        if (config.gap) gap.value = config.gap;
      }
      global.requestAnimationFrame(renderHandles);
      return selectedGrid;
    }

    applyPreset.addEventListener('click', () => {
      if (!selectedGrid) return;
      gridApi.applyPreset(selectedGrid, preset.value, { breakpoint: breakpoint.value, ...(gap.value ? { gap: gap.value } : {}) });
      refresh(selectedGrid);
    });
    applyCustom.addEventListener('click', () => {
      if (!selectedGrid || !custom.value.trim()) return;
      gridApi.applyCustom(selectedGrid, custom.value, { breakpoint: breakpoint.value, ...(gap.value ? { gap: gap.value } : {}) });
      refresh(selectedGrid);
    });
    gap.addEventListener('change', () => {
      if (selectedGrid && gap.value.trim()) gridApi.setGap(selectedGrid, gap.value, { breakpoint: breakpoint.value });
      refresh(selectedGrid);
    });
    breakpoint.addEventListener('change', () => refresh(selectedGrid));

    const onSelected = (component) => refresh(component);
    const onUpdated = ({ component }) => refresh(component);
    editor.on('component:selected', onSelected);
    editor.on('ocd:grid:update', onUpdated);
    editor.on('canvas:frame:load', () => refresh(editor.getSelected?.()));
    setEnabled(false);
    refresh(editor.getSelected?.());

    const api = {
      root,
      refresh,
      getSelectedGrid: () => selectedGrid,
      destroy() {
        editor.off('component:selected', onSelected);
        editor.off('ocd:grid:update', onUpdated);
        removeOverlay();
        root.remove();
      },
    };
    editor.OCDGridControls = api;
    return api;
  }

  global.OCDGridControls = { create };
})(typeof globalThis !== 'undefined' ? globalThis : window);
