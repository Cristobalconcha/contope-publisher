/**
 * Open CoDesign Canvas — Inspector modal por componente (primera versión).
 *
 * Agrega un engranaje flotante sobre los componentes de tipo Título
 * (`ocd-heading`) cuando están seleccionados en el lienzo y abre un modal con
 * 3 pestañas fijas: Content / Design / Advanced. Convive con el panel lateral
 * existente (`ocd-computed-inspector.js`); no lo reemplaza ni lo migra.
 *
 * Dependencias de runtime: `window.ocdCanvas.editor` (creado por
 * `ocd-canvas-editor.js`) y `editor.OCDComputedInspector` (creado por
 * `ocd-computed-inspector.js`). El engranaje vive en el documento del iframe
 * del lienzo (mismo patrón que los grips de `ocd-grid-controls.js`); el modal
 * vive en el documento anfitrión de la pantalla admin.
 */
(function installOcdInspectorModal(global) {
  'use strict';

  var HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  var GEAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"></path></svg>';

  // ------------------------------------------------------------------
  // Capa flotante compartida: cierre con click afuera, Escape y botón.
  // Es la misma convención de comportamiento del popover "Presets de
  // columnas" (ocd-computed-inspector.js), extraída acá para reusarla sin
  // duplicar la lógica de apertura/cierre.
  // ------------------------------------------------------------------
  function createFloatingLayer(options) {
    var opts = options || {};
    var doc = opts.document || global.document;
    var element = opts.element || null;
    var anchor = opts.anchor || null;
    var onClose = typeof opts.onClose === 'function' ? opts.onClose : function () {};
    var removeElementOnClose = opts.removeElementOnClose !== false;
    var closed = false;

    function handleOutsidePointer(event) {
      if (!element || closed) return;
      if (element.contains(event.target)) return;
      if (anchor && anchor.contains && anchor.contains(event.target)) return;
      close();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') close();
    }

    function close() {
      if (closed) return;
      closed = true;
      doc.removeEventListener('pointerdown', handleOutsidePointer, true);
      doc.removeEventListener('keydown', handleKeydown, true);
      if (removeElementOnClose && element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      onClose();
    }

    doc.addEventListener('pointerdown', handleOutsidePointer, true);
    doc.addEventListener('keydown', handleKeydown, true);

    return {
      close: close,
      isOpen: function () { return !closed; },
    };
  }

  function createElement(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createModal(editor, options) {
    if (!editor) throw new Error('OCD Inspector Modal requiere una instancia de GrapesJS.');

    var opts = options || {};
    var hostDocument = opts.document || global.document;
    var currentComponent = null;
    var activeTab = 'content';
    var layer = null;
    var backdrop = null;
    var dialog = null;
    var panes = {};
    var tabButtons = [];
    var gearButton = null;
    var gearRafId = null;

    // ---------------------------------------------------------------
    // Utilidades del componente.
    // ---------------------------------------------------------------
    function getElement(component) {
      return component && typeof component.getEl === 'function' ? component.getEl() : null;
    }

    function componentClasses(component) {
      if (!component || typeof component.getClasses !== 'function') return [];
      var classes = component.getClasses();
      return Array.isArray(classes) ? classes.filter(Boolean) : String(classes || '').split(/\s+/).filter(Boolean);
    }

    function componentAttributes(component) {
      return component && typeof component.getAttributes === 'function'
        ? component.getAttributes()
        : (component && component.get ? component.get('attributes') || {} : {});
    }

    function isHeadingComponent(component) {
      if (!component) return false;
      var tag = String(component.get ? component.get('tagName') || '' : '').toLowerCase();
      if (HEADING_TAGS.indexOf(tag) === -1) return false;
      return componentClasses(component).indexOf('ocd-heading') !== -1;
    }

    function getFrameDocument() {
      var canvas = editor && editor.Canvas;
      var frame = canvas && typeof canvas.getFrameEl === 'function' ? canvas.getFrameEl() : null;
      return frame && frame.contentDocument ? frame.contentDocument : null;
    }

    function inspectorApi() {
      if (global.ocdCanvas && global.ocdCanvas.inspector) return global.ocdCanvas.inspector;
      return editor.OCDComputedInspector || null;
    }

    function currentAcfFields() {
      var fields = global.OCDCanvasEditor && global.OCDCanvasEditor.acfFields;
      return Array.isArray(fields) ? fields : [];
    }

    function dynamicSourceFieldFromAttribute(value) {
      var match = /^acf(?:_image)?:([a-zA-Z0-9_-]+)(?::html)?$/.exec(String(value || ''));
      return match ? match[1] : '';
    }

    function computedStyleFor(component) {
      var element = getElement(component);
      var view = element && element.ownerDocument ? element.ownerDocument.defaultView : null;
      if (!view || typeof view.getComputedStyle !== 'function') return null;
      return view.getComputedStyle(element);
    }

    function rgbToHex(value) {
      var match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(String(value || ''));
      if (!match) return '#000000';
      var toHex = function (number) {
        var clamped = Math.max(0, Math.min(255, Math.round(Number(number))));
        var hex = clamped.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      return '#' + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
    }

    function normalizeTextAlign(value) {
      var normalized = String(value || '').toLowerCase();
      if (normalized === 'start') return 'left';
      if (normalized === 'end') return 'right';
      return ['left', 'center', 'right', 'justify'].indexOf(normalized) !== -1 ? normalized : 'left';
    }

    // ---------------------------------------------------------------
    // Estilos inyectados (host + frame del lienzo).
    // ---------------------------------------------------------------
    function installStyles() {
      if (!hostDocument.getElementById('ocd-inspector-modal-css')) {
        var style = hostDocument.createElement('style');
        style.id = 'ocd-inspector-modal-css';
        style.textContent = [
          '.ocd-im-backdrop { position:fixed; inset:0; z-index:2147483646; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.45); }',
          '.ocd-im-backdrop[hidden] { display:none; }',
          '.ocd-im-modal { position:relative; z-index:1; width:min(680px, 100%); max-height:min(80vh, 640px); display:flex; flex-direction:column; background:#1f2228; color:#f4f1eb; border:1px solid #ffffff2e; border-radius:8px; box-shadow:0 12px 40px #000c; font:12px/1.4 Inter,system-ui,sans-serif; overflow:hidden; }',
          '.ocd-im-modal * { box-sizing:border-box; }',
          '.ocd-im-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:#181b20; border-bottom:1px solid #ffffff18; }',
          '.ocd-im-title { font-size:13px; font-weight:650; }',
          '.ocd-im-close { width:28px; height:28px; border:1px solid #ffffff26; border-radius:5px; background:#2a2e36; color:#fff; cursor:pointer; font-size:16px; line-height:1; }',
          '.ocd-im-close:hover { border-color:#70b9e9; }',
          '.ocd-im-tabs { display:grid; grid-template-columns:repeat(3, 1fr); background:#181b20; border-bottom:1px solid #ffffff18; }',
          '.ocd-im-tab { border:0; border-right:1px solid #ffffff18; padding:10px; background:transparent; color:#ded8cc; cursor:pointer; font:inherit; font-weight:650; }',
          '.ocd-im-tab:last-child { border-right:0; }',
          '.ocd-im-tab.is-active { background:#397ba1; color:#fff; }',
          '.ocd-im-body { padding:14px 16px; overflow:auto; }',
          '.ocd-im-pane { display:grid; gap:12px; }',
          '.ocd-im-field { display:grid; gap:5px; color:#c7bda9; font-size:10px; }',
          '.ocd-im-field input, .ocd-im-field select { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px; background:#2a2e36; color:#fff; padding:7px 8px; font:inherit; }',
          '.ocd-im-field input[type="color"] { min-height:36px; padding:3px; cursor:pointer; }',
          '.ocd-im-field input:disabled { opacity:.55; cursor:not-allowed; }',
          '.ocd-im-hint { margin:0; color:#a9a39a; font-size:10px; }',
          '.ocd-im-note { padding:14px; border:1px dashed #ffffff2e; border-radius:6px; color:#a9a39a; text-align:center; }',
        ].join('\n');
        hostDocument.head.appendChild(style);
      }

      ensureGearStyles(getFrameDocument());
    }

    function ensureGearStyles(frameDocument) {
      if (!frameDocument || !frameDocument.head || frameDocument.getElementById('ocd-heading-gear-css')) return;
      var gearStyle = frameDocument.createElement('style');
      gearStyle.id = 'ocd-heading-gear-css';
      gearStyle.textContent = [
        '.ocd-heading-gear { position:fixed; z-index:2147483000; width:28px; height:28px; padding:0; border:1px solid #ffffff38; border-radius:6px; background:#1f2228; color:#f4f1eb; cursor:pointer; box-shadow:0 4px 12px #0008; display:flex; align-items:center; justify-content:center; }',
        '.ocd-heading-gear:hover { border-color:#70b9e9; color:#fff; }',
      ].join('\n');
      frameDocument.head.appendChild(gearStyle);
    }

    // ---------------------------------------------------------------
    // Engranaje flotante en el iframe del lienzo.
    // ---------------------------------------------------------------
    function positionGear() {
      if (!gearButton || !currentComponent) return;
      if (!gearButton.isConnected) {
        removeGearButton();
        updateGearButton(currentComponent);
        return;
      }
      var element = getElement(currentComponent);
      if (!element) {
        removeGearButton();
        return;
      }
      var frameDocument = element.ownerDocument || getFrameDocument();
      if (!frameDocument || gearButton.ownerDocument !== frameDocument) {
        removeGearButton();
        updateGearButton(currentComponent);
        return;
      }
      var rect = element.getBoundingClientRect();
      var view = frameDocument.defaultView;
      var viewportW = view ? view.innerWidth : 0;
      var viewportH = view ? view.innerHeight : 0;
      var size = 28;
      var margin = 4;
      var left = rect.right - size + margin;
      var top = rect.top - size + margin;
      if (viewportW > size + margin * 2) {
        left = Math.max(margin, Math.min(left, viewportW - size - margin));
      }
      if (viewportH > size + margin * 2) {
        top = Math.max(margin, Math.min(top, viewportH - size - margin));
      }
      gearButton.style.left = left + 'px';
      gearButton.style.top = top + 'px';
    }

    function startGearLoop() {
      if (gearRafId != null) return;
      var tick = function () {
        if (!currentComponent) {
          gearRafId = null;
          return;
        }
        if (!gearButton || !gearButton.isConnected) {
          gearRafId = null;
          updateGearButton(currentComponent);
          return;
        }
        positionGear();
        gearRafId = global.requestAnimationFrame(tick);
      };
      gearRafId = global.requestAnimationFrame(tick);
    }

    function stopGearLoop() {
      if (gearRafId != null) {
        global.cancelAnimationFrame(gearRafId);
        gearRafId = null;
      }
    }

    function removeGearButton() {
      stopGearLoop();
      if (gearButton && gearButton.parentNode) gearButton.parentNode.removeChild(gearButton);
      gearButton = null;
    }

    function updateGearButton(component) {
      removeGearButton();
      if (!isHeadingComponent(component)) return;

      var element = getElement(component);
      var frameDocument = element && element.ownerDocument ? element.ownerDocument : getFrameDocument();
      if (!frameDocument || !frameDocument.body) return;
      ensureGearStyles(frameDocument);

      var button = frameDocument.createElement('button');
      button.type = 'button';
      button.className = 'ocd-heading-gear';
      button.title = 'Abrir inspector del título';
      button.setAttribute('aria-label', 'Abrir inspector del título');
      button.innerHTML = GEAR_SVG;
      button.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        open(editor.getSelected() || currentComponent);
      });
      frameDocument.body.appendChild(button);
      gearButton = button;
      positionGear();
      startGearLoop();
    }

    // ---------------------------------------------------------------
    // Acciones sobre el componente (reusan la API del panel lateral).
    // ---------------------------------------------------------------
    function setHeadingText(component, value) {
      var text = String(value == null ? '' : value);
      var collection = typeof component.components === 'function' ? component.components() : null;
      var children = collection && collection.models ? collection.models : [];
      if (children.length === 1 && children[0].get && children[0].get('type') === 'textnode') {
        children[0].set('content', text);
      } else if (typeof component.components === 'function') {
        component.components(text);
      }
      var inspector = inspectorApi();
      if (inspector && typeof inspector.refresh === 'function') inspector.refresh(component);
    }

    function applyDesignStyle(component, property, value) {
      var inspector = inspectorApi();
      if (!inspector || typeof inspector.applyLocalStyle !== 'function') return Promise.resolve();
      return inspector.applyLocalStyle(property, value).then(function () {
        refreshModal();
      });
    }

    function applySource(component, value) {
      var inspector = inspectorApi();
      if (!inspector || typeof inspector.applyDynamicSource !== 'function') return Promise.resolve();
      return inspector.applyDynamicSource(component, value).then(function () {
        refreshModal();
      }).catch(function (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('OCD Inspector Modal: no se pudo aplicar la fuente de contenido.', error);
        }
      });
    }

    // ---------------------------------------------------------------
    // Render de pestañas.
    // ---------------------------------------------------------------
    function buildSourceSelect(component) {
      var attributes = componentAttributes(component);
      var currentFieldName = dynamicSourceFieldFromAttribute(attributes['data-ocd-dynamic']);
      var fields = currentAcfFields();
      var select = createElement(hostDocument, 'select');

      var fixedOption = createElement(hostDocument, 'option', '', 'Fijo');
      fixedOption.value = '';
      select.appendChild(fixedOption);

      var matchedCurrent = false;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var name = field && field.name ? String(field.name) : '';
        if (!name) continue;
        var option = createElement(hostDocument, 'option', '', field.label ? String(field.label) : name);
        option.value = name;
        select.appendChild(option);
        if (name === currentFieldName) matchedCurrent = true;
      }
      if (currentFieldName && !matchedCurrent) {
        var fallbackOption = createElement(hostDocument, 'option', '', currentFieldName);
        fallbackOption.value = currentFieldName;
        select.appendChild(fallbackOption);
      }
      select.value = currentFieldName;

      select.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        applySource(target, select.value);
      });

      return select;
    }

    function renderContentPane(component) {
      var pane = panes.content;
      pane.replaceChildren();

      var element = getElement(component);
      var attributes = componentAttributes(component);
      var isDynamic = !!attributes['data-ocd-dynamic'];

      var textField = createElement(hostDocument, 'label', 'ocd-im-field');
      textField.appendChild(createElement(hostDocument, 'span', '', 'Texto'));
      var textInput = createElement(hostDocument, 'input');
      textInput.type = 'text';
      textInput.value = element ? (element.textContent || '') : '';
      textInput.disabled = isDynamic;
      textInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        setHeadingText(target, textInput.value);
      });
      textField.appendChild(textInput);
      pane.appendChild(textField);
      if (isDynamic) {
        pane.appendChild(createElement(hostDocument, 'p', 'ocd-im-hint', 'El contenido viene de un campo ACF. Volvé a "Fijo" para editarlo a mano.'));
      }

      var levelField = createElement(hostDocument, 'label', 'ocd-im-field');
      levelField.appendChild(createElement(hostDocument, 'span', '', 'Nivel'));
      var levelSelect = createElement(hostDocument, 'select');
      for (var i = 0; i < HEADING_TAGS.length; i++) {
        var option = createElement(hostDocument, 'option', '', HEADING_TAGS[i].toUpperCase());
        option.value = HEADING_TAGS[i];
        levelSelect.appendChild(option);
      }
      var currentTag = String(component.get ? component.get('tagName') || '' : '').toLowerCase();
      levelSelect.value = HEADING_TAGS.indexOf(currentTag) !== -1 ? currentTag : 'h2';
      levelSelect.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        if (target.set) target.set('tagName', levelSelect.value);
        var inspector = inspectorApi();
        if (inspector && typeof inspector.refresh === 'function') inspector.refresh(target);
      });
      levelField.appendChild(levelSelect);
      pane.appendChild(levelField);

      var sourceField = createElement(hostDocument, 'label', 'ocd-im-field');
      sourceField.appendChild(createElement(hostDocument, 'span', '', 'Fuente de contenido'));
      sourceField.appendChild(buildSourceSelect(component));
      pane.appendChild(sourceField);
      pane.appendChild(createElement(hostDocument, 'p', 'ocd-im-hint', 'Fijo usa el texto de acá. Campo ACF reusa el binding universal ya existente (data-ocd-dynamic).'));
    }

    function renderDesignPane(component) {
      var pane = panes.design;
      pane.replaceChildren();
      var style = computedStyleFor(component);
      if (!style) {
        pane.appendChild(createElement(hostDocument, 'div', 'ocd-im-note', 'No se pudo leer el estilo del elemento.'));
        return;
      }

      var colorField = createElement(hostDocument, 'label', 'ocd-im-field');
      colorField.appendChild(createElement(hostDocument, 'span', '', 'Color'));
      var colorInput = createElement(hostDocument, 'input');
      colorInput.type = 'color';
      colorInput.value = rgbToHex(style.color);
      colorInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        applyDesignStyle(target, 'color', colorInput.value);
      });
      colorField.appendChild(colorInput);
      pane.appendChild(colorField);

      var sizeField = createElement(hostDocument, 'label', 'ocd-im-field');
      sizeField.appendChild(createElement(hostDocument, 'span', '', 'Tamaño de fuente'));
      var sizeInput = createElement(hostDocument, 'input');
      sizeInput.type = 'text';
      sizeInput.value = style.fontSize || '';
      sizeInput.placeholder = 'ej. 32px';
      sizeInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        applyDesignStyle(target, 'font-size', sizeInput.value);
      });
      sizeField.appendChild(sizeInput);
      pane.appendChild(sizeField);

      var alignField = createElement(hostDocument, 'label', 'ocd-im-field');
      alignField.appendChild(createElement(hostDocument, 'span', '', 'Alineación'));
      var alignSelect = createElement(hostDocument, 'select');
      var alignOptions = [
        ['left', 'Izquierda'],
        ['center', 'Centrada'],
        ['right', 'Derecha'],
        ['justify', 'Justificada'],
      ];
      for (var i = 0; i < alignOptions.length; i++) {
        var option = createElement(hostDocument, 'option', '', alignOptions[i][1]);
        option.value = alignOptions[i][0];
        alignSelect.appendChild(option);
      }
      alignSelect.value = normalizeTextAlign(style.textAlign);
      alignSelect.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!isHeadingComponent(target)) return;
        applyDesignStyle(target, 'text-align', alignSelect.value);
      });
      alignField.appendChild(alignSelect);
      pane.appendChild(alignField);

      pane.appendChild(createElement(hostDocument, 'p', 'ocd-im-hint', 'Estos controles aplican estilo local al elemento seleccionado (mismo mecanismo que el panel lateral).'));
    }

    function renderAdvancedPane() {
      var pane = panes.advanced;
      pane.replaceChildren();
      pane.appendChild(createElement(hostDocument, 'div', 'ocd-im-note', 'Próximamente. Interacciones, Sticky Position, clases/ID y condiciones de visualización se migrarán acá en una pasada posterior.'));
    }

    function renderAllPanes() {
      if (!currentComponent) return;
      renderContentPane(currentComponent);
      renderDesignPane(currentComponent);
      renderAdvancedPane();
    }

    function switchTab(name) {
      activeTab = name;
      for (var i = 0; i < tabButtons.length; i++) {
        var isActive = tabButtons[i].getAttribute('data-ocd-im-tab') === name;
        tabButtons[i].classList.toggle('is-active', isActive);
        tabButtons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
      var paneNames = Object.keys(panes);
      for (var j = 0; j < paneNames.length; j++) {
        panes[paneNames[j]].hidden = paneNames[j] !== name;
      }
    }

    // ---------------------------------------------------------------
    // Shell del modal (documento anfitrión).
    // ---------------------------------------------------------------
    function ensureShell() {
      if (backdrop) {
        if (dialog && dialog.parentNode !== backdrop) backdrop.appendChild(dialog);
        return;
      }

      backdrop = createElement(hostDocument, 'div', 'ocd-im-backdrop');
      backdrop.hidden = true;

      dialog = createElement(hostDocument, 'section', 'ocd-im-modal');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'ocd-im-title');

      var head = createElement(hostDocument, 'header', 'ocd-im-head');
      var title = createElement(hostDocument, 'div', 'ocd-im-title', 'Inspector · Título');
      title.id = 'ocd-im-title';
      var closeButton = createElement(hostDocument, 'button', 'ocd-im-close', '×');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Cerrar inspector');
      closeButton.addEventListener('click', close);
      head.appendChild(title);
      head.appendChild(closeButton);

      var tabs = createElement(hostDocument, 'div', 'ocd-im-tabs');
      tabs.setAttribute('role', 'tablist');
      tabButtons = [];
      var tabDefs = [['content', 'Content'], ['design', 'Design'], ['advanced', 'Advanced']];
      for (var i = 0; i < tabDefs.length; i++) {
        var tab = createElement(hostDocument, 'button', 'ocd-im-tab', tabDefs[i][1]);
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-ocd-im-tab', tabDefs[i][0]);
        (function (name) {
          tab.addEventListener('click', function () { switchTab(name); });
        })(tabDefs[i][0]);
        tabs.appendChild(tab);
        tabButtons.push(tab);
      }

      var body = createElement(hostDocument, 'div', 'ocd-im-body');
      panes = {};
      for (var j = 0; j < tabDefs.length; j++) {
        var pane = createElement(hostDocument, 'div', 'ocd-im-pane');
        pane.setAttribute('data-ocd-im-pane', tabDefs[j][0]);
        pane.hidden = true;
        panes[tabDefs[j][0]] = pane;
        body.appendChild(pane);
      }

      dialog.appendChild(head);
      dialog.appendChild(tabs);
      dialog.appendChild(body);
      backdrop.appendChild(dialog);
      hostDocument.body.appendChild(backdrop);
    }

    function showShell() {
      if (backdrop) backdrop.hidden = false;
    }

    function hideShell() {
      if (backdrop) backdrop.hidden = true;
    }

    // ---------------------------------------------------------------
    // Apertura/cierre.
    // ---------------------------------------------------------------
    function open(component) {
      if (!isHeadingComponent(component)) return;
      ensureShell();
      currentComponent = component;
      activeTab = 'content';
      renderAllPanes();
      switchTab(activeTab);
      showShell();
      if (!layer) {
        layer = createFloatingLayer({
          document: hostDocument,
          element: dialog,
          removeElementOnClose: false,
          onClose: function () {
            hideShell();
            layer = null;
          },
        });
      }
    }

    function close() {
      if (layer) layer.close();
    }

    function refreshModal() {
      var component = editor.getSelected() || currentComponent;
      if (!isHeadingComponent(component)) {
        close();
        return;
      }
      currentComponent = component;
      renderAllPanes();
      switchTab(activeTab);
    }

    // ---------------------------------------------------------------
    // Conexión con el ciclo de selección de GrapesJS.
    // ---------------------------------------------------------------
    function onSelected(component) {
      currentComponent = component;
      updateGearButton(component);
      if (layer) refreshModal();
    }

    function onDeselected() {
      currentComponent = null;
      removeGearButton();
      if (layer) refreshModal();
    }

    function onStyleUpdate() {
      if (layer) refreshModal();
    }

    function onAcfFieldsLoaded() {
      if (layer) refreshModal();
    }

    editor.on('component:selected', onSelected);
    editor.on('component:deselected', onDeselected);
    editor.on('component:styleUpdate', onStyleUpdate);
    hostDocument.addEventListener('ocd:acf-fields-loaded', onAcfFieldsLoaded);

    installStyles();
    if (editor.getSelected()) onSelected(editor.getSelected());

    return {
      open: open,
      close: close,
      refresh: refreshModal,
      isHeadingComponent: isHeadingComponent,
      updateGearButton: updateGearButton,
      destroy: function () {
        close();
        removeGearButton();
        editor.off('component:selected', onSelected);
        editor.off('component:deselected', onDeselected);
        editor.off('component:styleUpdate', onStyleUpdate);
        hostDocument.removeEventListener('ocd:acf-fields-loaded', onAcfFieldsLoaded);
        if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        backdrop = null;
        dialog = null;
        panes = {};
        tabButtons = [];
        currentComponent = null;
      },
    };
  }

  function bootstrap() {
    var canvas = global.ocdCanvas;
    if (!canvas || !canvas.editor) return null;
    if (canvas.editor.OCDInspectorModal) return canvas.editor.OCDInspectorModal;
    var api = createModal(canvas.editor, {});
    canvas.editor.OCDInspectorModal = api;
    return api;
  }

  global.OCDInspectorModal = {
    create: createModal,
    createFloatingLayer: createFloatingLayer,
    bootstrap: bootstrap,
  };

  bootstrap();
})(typeof globalThis !== 'undefined' ? globalThis : window);
