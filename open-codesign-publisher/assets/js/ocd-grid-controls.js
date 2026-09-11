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
      .ocd-gc__row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin-top:7px; }
      .ocd-gc label { display:grid; gap:4px; color:#aaa49b; font-size:10px; }
      .ocd-gc select,.ocd-gc input,.ocd-gc button { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px;
        background:#2a2e36; color:#fff; padding:6px 7px; font:inherit; }
      .ocd-gc button { cursor:pointer; background:#a7641a; border-color:#b8752a; font-weight:650; }
      .ocd-gc button:disabled,.ocd-gc input:disabled { opacity:.42; cursor:not-allowed; }
      .ocd-gc__breakpoints { display:flex; align-items:center; gap:3px; margin-left:auto; }
      .ocd-gc__breakpoint { width:34px !important; height:27px; padding:3px !important; border-color:#ffffff24 !important; background:#252930 !important; color:#aeb4bd !important; }
      .ocd-gc__breakpoint svg { display:block; width:100%; height:100%; }
      .ocd-gc__breakpoint.is-active { border-color:#72aee6 !important; background:#315b83 !important; color:#fff !important; }
    `;
    document.head.appendChild(style);
  }

  function describe(component) {
    if (!component) return 'sin contenedor';
    const classes = component.getClasses?.() ?? [];
    return classes.length ? `.${classes.join('.')}` : component.get('tagName') || 'grid';
  }

  // ------------------------------------------------------------------
  // Snap-to-guide para el arrastre de separadores: el arrastre sigue siendo
  // libre/continuo por defecto (no hay incrementos fijos); sólo cuando el
  // borde pasa a pocos píxeles de una guía se "engancha" ahí, como el
  // snapping estándar de un editor de diseño (Figma/Sketch). Guías:
  //   - el borde de las OTRAS columnas de la misma fila (no se mueven
  //     durante este arrastre, así que se calculan una sola vez al empezar).
  //   - fracciones de referencia del ancho total: 1/4, 1/3, 1/2, 2/3, 3/4.
  // ------------------------------------------------------------------
  const SNAP_THRESHOLD_PX = 6;
  // Doce columnas virtuales cubren tercios, cuartos, mitades y sextos con
  // una sola lógica, además de permitir 1/12…11/12 como en una grilla editorial.
  const SNAP_FRACTIONS = Array.from({ length: 11 }, (_, index) => (index + 1) / 12);

  function snapGuidesPx(handles, currentBoundaryIndex, rectWidth) {
    const guides = new Set();
    for (const fraction of SNAP_FRACTIONS) guides.add(fraction * rectWidth);
    for (const other of handles) {
      if (other.boundaryIndex === currentBoundaryIndex) continue;
      guides.add((other.positionPercent / 100) * rectWidth);
    }
    return [...guides];
  }

  function nearestSnapGuide(offsetPx, guides, thresholdPx) {
    let nearest = null;
    let nearestDistance = thresholdPx;
    for (const guide of guides) {
      const distance = Math.abs(offsetPx - guide);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearest = guide;
      }
    }
    return nearest;
  }

  function boundaryOffsetPxFromWeights(weights, boundaryIndex, rectWidth) {
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let accumulated = 0;
    for (let i = 0; i <= boundaryIndex; i++) accumulated += weights[i];
    return (accumulated / total) * rectWidth;
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
    const row = element(hostDocument, 'div', 'ocd-gc__row');
    const presetLabel = element(hostDocument, 'label', '', 'Preset');
    const preset = element(hostDocument, 'button', '', 'Elegir…');
    preset.type = 'button';
    preset.title = 'Abrir la paleta visual de distribuciones de columnas';
    const customLabel = element(hostDocument, 'label', '', 'Manual');
    const custom = element(hostDocument, 'input');
    custom.placeholder = '1/1';
    custom.title = 'Una cifra por columna. Ejemplos: 1 = una columna; 1/1 = dos iguales; 1/2 = un tercio y dos tercios; 1/3 = un cuarto y tres cuartos. Admite hasta 12 partes.';
    custom.setAttribute('aria-label', 'Proporción manual de columnas');
    const gapLabel = element(hostDocument, 'label', '', 'Gap');
    const gap = element(hostDocument, 'input');
    gap.placeholder = '0px';
    gap.title = 'Separación entre columnas. Puedes usar px, rem, em o %.';
    customLabel.appendChild(custom);
    gapLabel.appendChild(gap);
    presetLabel.appendChild(preset);
    row.append(presetLabel, customLabel, gapLabel);
    root.append(title, row);
    mount.appendChild(root);

    const breakpointBar = element(hostDocument, 'div', 'ocd-gc__breakpoints');
    const breakpointButtons = new Map();
    const breakpointIcons = {
      desktop: '<svg viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="2" width="20" height="12" rx="1"/><path d="M8 17h8M12 14v3"/></svg>',
      tablet: '<svg viewBox="0 0 18 22" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="1" width="14" height="20" rx="1.5"/><circle cx="9" cy="18" r=".7" fill="currentColor"/></svg>',
      mobile: '<svg viewBox="0 0 14 22" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1" y="1" width="12" height="20" rx="2"/><path d="M5 3h4"/></svg>',
    };
    for (const [value, label] of [['desktop', 'Escritorio'], ['tablet', 'Tablet'], ['mobile', 'Móvil']]) {
      const button = element(hostDocument, 'button', 'ocd-gc__breakpoint');
      button.type = 'button'; button.title = label; button.setAttribute('aria-label', label); button.innerHTML = breakpointIcons[value];
      breakpointButtons.set(value, button); breakpointBar.appendChild(button);
    }
    (mount.querySelector('.ocd-ci__headbar') || mount).appendChild(breakpointBar);

    let selectedGrid = null;
    let overlay = null;
    let draggingBoundary = false;
    let activeBreakpoint = typeof gridApi.getActiveBreakpoint === 'function' ? gridApi.getActiveBreakpoint() : 'desktop';

    function findGrid(component) {
      let current = component;
      while (current) {
        if (gridApi.recognize(current)) return current;
        current = current.parent?.();
      }
      return null;
    }

    function setEnabled(enabled) {
      for (const control of [preset, custom, gap]) control.disabled = !enabled;
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
      const handles = gridApi.getHandleModel(selectedGrid, { breakpoint: activeBreakpoint });
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
          draggingBoundary = true;
          let lastX = event.clientX;
          // Posición actual del borde en píxeles (relativa al borde izquierdo
          // del grid); se recalcula tras cada resize a partir del resultado
          // real (ver abajo) para no acumular desvío durante un arrastre
          // largo, ya que `resizeTrackBoundary` puede clampear el pedido.
          let currentOffset = (rect.width * handle.positionPercent) / 100;
          const guides = snapGuidesPx(handles, handle.boundaryIndex, rect.width);
          const onMove = (moveEvent) => {
            const rawPixels = moveEvent.clientX - lastX;
            if (Math.abs(rawPixels) < 1) return;
            lastX = moveEvent.clientX;
            const proposedOffset = currentOffset + rawPixels;
            const guide = nearestSnapGuide(proposedOffset, guides, SNAP_THRESHOLD_PX);
            const targetOffset = guide == null ? proposedOffset : guide;
            const pixels = targetOffset - currentOffset;
            const delta = (pixels / rect.width) * handle.totalWeight;
            const resized = handle.resize(delta);
            currentOffset = Array.isArray(resized)
              ? boundaryOffsetPxFromWeights(resized, handle.boundaryIndex, rect.width)
              : targetOffset;
            // No reconstruir el overlay durante el gesto: eliminar el grip
            // corta pointer capture y el drag muere en el primer movimiento.
            grip.style.left = `${rect.left + currentOffset - 5}px`;
          };
          const onUp = () => {
            draggingBoundary = false;
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

    function templateToNotation(template) {
      const source = String(template || '').trim();
      const repeated = source.match(/^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0\s*,\s*([\d.]+)fr\s*\)\s*\)$/i);
      if (repeated) return Array(Number(repeated[1])).fill(String(Number(repeated[2]))).join('/');
      const fr = [...source.matchAll(/(?:minmax\(\s*0\s*,\s*)?([\d.]+)fr\)?/gi)].map((match) => Number(match[1]));
      if (fr.length) return fr.map((value) => String(Number(value.toFixed(3)))).join('/');
      return '';
    }

    function refresh(component) {
      selectedGrid = findGrid(component || editor.getSelected?.());
      setEnabled(Boolean(selectedGrid));
      root.querySelector('.ocd-gc__target').textContent = describe(selectedGrid);
      breakpointButtons.forEach((button, value) => button.classList.toggle('is-active', value === activeBreakpoint));
      if (selectedGrid) {
        const config = gridApi.getConfig(selectedGrid)[activeBreakpoint] || {};
        custom.value = templateToNotation(config.template) || '1';
        gap.value = config.gap || '';
      } else {
        custom.value = '';
        gap.value = '';
      }
      global.requestAnimationFrame(renderHandles);
      return selectedGrid;
    }

    preset.addEventListener('click', () => {
      if (!selectedGrid) return;
      editor.OCDComputedInspector?.openColumnPresets?.(selectedGrid, preset);
    });
    custom.addEventListener('change', () => {
      if (!selectedGrid || !custom.value.trim()) return;
      gridApi.applyCustom(selectedGrid, custom.value, { breakpoint: activeBreakpoint, ...(gap.value ? { gap: gap.value } : {}) });
      refresh(selectedGrid);
    });
    gap.addEventListener('change', () => {
      if (selectedGrid && gap.value.trim()) gridApi.setGap(selectedGrid, gap.value, { breakpoint: activeBreakpoint });
      refresh(selectedGrid);
    });
    breakpointButtons.forEach((button, value) => button.addEventListener('click', () => {
      activeBreakpoint = value;
      if (typeof editor.setDevice === 'function') editor.setDevice(value === 'mobile' ? 'mobilePortrait' : value);
      refresh(selectedGrid);
    }));

    const onSelected = (component) => refresh(component);
    const onUpdated = ({ component }) => {
      if (!draggingBoundary) refresh(component);
    };
    const onDeviceSelected = () => {
      activeBreakpoint = typeof gridApi.getActiveBreakpoint === 'function' ? gridApi.getActiveBreakpoint() : 'desktop';
      refresh(selectedGrid || editor.getSelected?.());
    };
    editor.on('component:selected', onSelected);
    editor.on('ocd:grid:update', onUpdated);
    editor.on('device:select', onDeviceSelected);
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
        editor.off('device:select', onDeviceSelected);
        removeOverlay();
        breakpointBar.remove();
        root.remove();
      },
    };
    editor.OCDGridControls = api;
    return api;
  }

  global.OCDGridControls = { create };
})(typeof globalThis !== 'undefined' ? globalThis : window);
