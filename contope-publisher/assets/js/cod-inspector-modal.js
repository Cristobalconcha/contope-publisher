/**
 * ContOpe Canvas — Inspector modal por componente (primera versión).
 *
 * Agrega un engranaje flotante sobre los componentes de tipo Título
 * (`cod-heading`) cuando están seleccionados en el lienzo y abre un modal con
 * 3 pestañas fijas: Content / Design / Advanced. Convive con el panel lateral
 * existente (`cod-computed-inspector.js`); no lo reemplaza ni lo migra.
 *
 * Dependencias de runtime: `window.ocdCanvas.editor` (creado por
 * `cod-canvas-editor.js`) y `editor.OCDComputedInspector` (creado por
 * `cod-computed-inspector.js`). El engranaje vive en el documento del iframe
 * del lienzo (mismo patrón que los grips de `cod-grid-controls.js`); el modal
 * vive en el documento anfitrión de la pantalla admin.
 */
(function installOcdInspectorModal(global) {
  'use strict';

  var HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  // Un LÁPIZ y no un engranaje. Cristóbal, el 3 de octubre de 2026: «prefiero
  // un lápiz, no un engranaje, porque es más eso: son las características
  // visuales». Un engranaje promete ajustes de sistema; un lápiz dice «edita
  // esto», que es lo que la ventana hace. Las categorías —contenido, diseño—
  // van DENTRO de la ventana, en sus pestañas, no en el icono.
  var LAPIZ_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';

  // ------------------------------------------------------------------
  // Capa flotante compartida: cierre con click afuera, Escape y botón.
  // Es la misma convención de comportamiento del popover "Presets de
  // columnas" (cod-computed-inspector.js), extraída acá para reusarla sin
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
      return componentClasses(component).indexOf('cod-heading') !== -1;
    }

    /**
     * De qué clase es este objeto, para saber qué ofrecerle en «Content».
     *
     * Se mira lo que el objeto ES —su etiqueta y sus atributos— y no una lista
     * de clases nuestras, para que funcione igual con algo compuesto a mano.
     */
    function claseDeObjeto(component) {
      if (!component) return '';
      if (isHeadingComponent(component)) return 'titulo';
      var tag = String(component.get ? component.get('tagName') || '' : '').toLowerCase();
      var attrs = componentAttributes(component);
      if (tag === 'img' || attrs.src !== undefined) return 'imagen';
      if (tag === 'a' || attrs.href !== undefined) return 'enlace';
      if (HEADING_TAGS.indexOf(tag) !== -1) return 'titulo';
      if (tag === 'p' || tag === 'span' || tag === 'li' || tag === 'figcaption') return 'texto';
      if (tag === 'video' || tag === 'audio' || tag === 'iframe') return 'medio';
      return 'contenedor';
    }

    /**
     * ¿Este objeto lleva engranaje?
     *
     * POR QUÉ CAMBIÓ. Hasta el 3 de octubre de 2026 el engranaje sólo aparecía
     * sobre los TÍTULOS: `updateGearButton` se cortaba en la primera línea si
     * el componente no era uno. Para todo lo demás no había forma de abrir la
     * ventana contextual, aunque la ventana ya estuviera construida y sus
     * pestañas Design y Advanced fueran genéricas.
     *
     * Cristóbal: «cada objeto tenga el icono de un lápiz para editarse en una
     * ventana contextual, como el engranaje de DIVI». Lo había pedido antes.
     *
     * Qué NO lleva engranaje, y por qué: el envoltorio del lienzo y el `body`
     * no son objetos de nadie, y un icono flotando sobre ellos aparecería en
     * cualquier sitio vacío. Lo demás sí: un contenedor también es un objeto
     * que se configura, igual que en Divi lo es una fila o una sección.
     */
    /** Cómo se llama este objeto para una persona. */
    function nombreDeObjeto(component) {
      var nombres = {
        titulo: 'el título',
        texto: 'el texto',
        imagen: 'la imagen',
        enlace: 'el enlace',
        medio: 'el medio',
        contenedor: 'el bloque'
      };
      return nombres[claseDeObjeto(component)] || 'el objeto';
    }

    function llevaEngranaje(component) {
      if (!component) return false;
      if (typeof component.parent === 'function' && !component.parent()) return false;
      var tag = String(component.get ? component.get('tagName') || '' : '').toLowerCase();
      if (tag === 'body' || tag === 'html') return false;
      // Un nodo de texto suelto no es un objeto: lo es su elemento.
      if (component.get && component.get('type') === 'textnode') return false;
      return !!getElement(component);
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
      if (!hostDocument.getElementById('cod-inspector-modal-css')) {
        var style = hostDocument.createElement('style');
        style.id = 'cod-inspector-modal-css';
        style.textContent = [
          '.cod-im-backdrop { position:fixed; inset:0; z-index:2147483646; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,.45); }',
          '.cod-im-backdrop[hidden] { display:none; }',
          '.cod-im-modal { position:relative; z-index:1; width:min(680px, 100%); max-height:min(80vh, 640px); display:flex; flex-direction:column; background:#1f2228; color:#f4f1eb; border:1px solid #ffffff2e; border-radius:8px; box-shadow:0 12px 40px #000c; font:12px/1.4 Inter,system-ui,sans-serif; overflow:hidden; }',
          '.cod-im-modal * { box-sizing:border-box; }',
          '.cod-im-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:#181b20; border-bottom:1px solid #ffffff18; }',
          '.cod-im-title { font-size:13px; font-weight:650; }',
          '.cod-im-close { width:28px; height:28px; border:1px solid #ffffff26; border-radius:5px; background:#2a2e36; color:#fff; cursor:pointer; font-size:16px; line-height:1; }',
          '.cod-im-close:hover { border-color:#70b9e9; }',
          '.cod-im-tabs { display:grid; grid-template-columns:repeat(3, 1fr); background:#181b20; border-bottom:1px solid #ffffff18; }',
          '.cod-im-tab { border:0; border-right:1px solid #ffffff18; padding:10px; background:transparent; color:#ded8cc; cursor:pointer; font:inherit; font-weight:650; }',
          '.cod-im-tab:last-child { border-right:0; }',
          '.cod-im-tab.is-active { background:#397ba1; color:#fff; }',
          '.cod-im-body { padding:14px 16px; overflow:auto; }',
          '.cod-im-pane { display:grid; gap:12px; }',
          '.cod-im-field { display:grid; gap:5px; color:#c7bda9; font-size:10px; }',
          '.cod-im-field input, .cod-im-field select { width:100%; min-width:0; border:1px solid #ffffff24; border-radius:5px; background:#2a2e36; color:#fff; padding:7px 8px; font:inherit; }',
          '.cod-im-field input[type="color"] { min-height:36px; padding:3px; cursor:pointer; }',
          '.cod-im-field input:disabled { opacity:.55; cursor:not-allowed; }',
          '.cod-im-hint { margin:0; color:#a9a39a; font-size:10px; }',
          '.cod-im-note { padding:14px; border:1px dashed #ffffff2e; border-radius:6px; color:#a9a39a; text-align:center; }',
        ].join('\n');
        hostDocument.head.appendChild(style);
      }

      ensureGearStyles(getFrameDocument());
    }

    function ensureGearStyles(frameDocument) {
      if (!frameDocument || !frameDocument.head || frameDocument.getElementById('cod-objeto-lapiz-css')) return;
      var gearStyle = frameDocument.createElement('style');
      gearStyle.id = 'cod-objeto-lapiz-css';
      gearStyle.textContent = [
        '.cod-objeto-lapiz { position:fixed; z-index:2147483000; width:28px; height:28px; padding:0; border:1px solid #ffffff38; border-radius:6px; background:#1f2228; color:#f4f1eb; cursor:pointer; box-shadow:0 4px 12px #0008; display:flex; align-items:center; justify-content:center; }',
        '.cod-objeto-lapiz:hover { border-color:#70b9e9; color:#fff; }',
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
      if (!llevaEngranaje(component)) return;

      var element = getElement(component);
      var frameDocument = element && element.ownerDocument ? element.ownerDocument : getFrameDocument();
      if (!frameDocument || !frameDocument.body) return;
      ensureGearStyles(frameDocument);

      var button = frameDocument.createElement('button');
      button.type = 'button';
      button.className = 'cod-objeto-lapiz';
      var rotuloLapiz = 'Editar ' + nombreDeObjeto(component);
      button.title = rotuloLapiz;
      button.setAttribute('aria-label', rotuloLapiz);
      button.innerHTML = LAPIZ_SVG;
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
      var currentFieldName = dynamicSourceFieldFromAttribute(attributes['data-cod-dynamic']);
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
        if (!target) return;
        applySource(target, select.value);
      });

      return select;
    }

    /**
     * Cuelga en la pestaña Configuración los behaviors con sus gatilladores.
     *
     * Cristóbal, el 3 de octubre de 2026, cuando se quitó la tercera pestaña:
     * «no sobra para nada, porque en esas configuraciones se incorporan los
     * behaviors asociados a gatilladores». Quitar la pestaña estuvo bien;
     * quitar su contenido, no. Esto lo devuelve donde corresponde.
     *
     * El panel NO se escribe acá: se pide al inspector lateral, que ya lo
     * tiene. Copiarlo habría repetido el error que este mismo editor ya tenía
     * —seis funciones definidas dos veces, con la segunda ganando en silencio—
     * y el día que alguien cambiara el disparador en un sitio, el otro
     * seguiría igual.
     */
    function agregarInteracciones(pane, component) {
      var inspector = inspectorApi();
      if (!inspector || typeof inspector.renderInteractionsPanel !== 'function') return;
      var panel = null;
      try {
        panel = inspector.renderInteractionsPanel(component);
      } catch (_error) {
        return;
      }
      if (panel) pane.appendChild(panel);
    }

    /** Un campo que escribe en un atributo del objeto. */
    function campoDeAtributo(component, atributo, rotulo, pista) {
      var campo = createElement(hostDocument, 'label', 'cod-im-field');
      campo.appendChild(createElement(hostDocument, 'span', '', rotulo));
      var input = createElement(hostDocument, 'input');
      input.type = 'text';
      input.value = String(componentAttributes(component)[atributo] || '');
      if (pista) input.placeholder = pista;
      input.addEventListener('change', function () {
        var destino = editor.getSelected() || currentComponent;
        if (!destino || typeof destino.addAttributes !== 'function') return;
        var valor = {};
        valor[atributo] = input.value.trim();
        destino.addAttributes(valor);
      });
      campo.appendChild(input);
      return campo;
    }

    /** Un campo que escribe el texto interior del objeto. */
    function campoDeTexto(component, rotulo) {
      var campo = createElement(hostDocument, 'label', 'cod-im-field');
      campo.appendChild(createElement(hostDocument, 'span', '', rotulo));
      var input = createElement(hostDocument, 'input');
      input.type = 'text';
      var el = getElement(component);
      input.value = el ? String(el.textContent || '').trim() : '';
      input.addEventListener('change', function () {
        var destino = editor.getSelected() || currentComponent;
        if (!destino) return;
        setHeadingText(destino, input.value);
      });
      campo.appendChild(input);
      return campo;
    }

    function renderContentPane(component) {
      var pane = panes.content;
      pane.replaceChildren();

      var element = getElement(component);
      var attributes = componentAttributes(component);
      var isDynamic = !!attributes['data-cod-dynamic'];
      var clase = claseDeObjeto(component);

      // Cada objeto trae lo suyo. Antes esta pestaña era de títulos y sólo de
      // títulos —un cuadro de Texto y un selector de Nivel—, porque el lápiz
      // únicamente aparecía sobre ellos. Abierto a todos los objetos, ofrecerle
      // «Nivel del título» a una fotografía sería peor que no ofrecer nada.
      if (clase === 'imagen') {
        pane.appendChild(campoDeAtributo(component, 'src', 'Imagen', '/wp-content/uploads/…'));
        pane.appendChild(campoDeAtributo(component, 'alt', 'Texto alternativo', 'Lo que oye quien no la ve'));
        pane.appendChild(createElement(hostDocument, 'p', 'cod-im-hint',
          'El texto alternativo no es opcional: es lo que se lee en voz alta y lo que aparece si la imagen no carga.'));
        return;
      }

      if (clase === 'enlace') {
        pane.appendChild(campoDeTexto(component, 'Rótulo'));
        pane.appendChild(campoDeAtributo(component, 'href', 'Destino', '/contacto, https://…'));
        return;
      }

      if (clase === 'medio') {
        pane.appendChild(campoDeAtributo(component, 'src', 'Archivo', '/wp-content/uploads/…'));
        return;
      }

      if (clase === 'contenedor') {
        pane.appendChild(createElement(hostDocument, 'div', 'cod-im-note',
          'Este bloque no tiene contenido propio: lo que se edita son las piezas de dentro. '
          + 'Pínchalas para abrir su lápiz. En «Diseño» sí se configura este bloque.'));
        agregarInteracciones(pane, component);
        return;
      }

      // Título y texto comparten el cuadro de Texto; sólo el título lleva Nivel.
      var textField = createElement(hostDocument, 'label', 'cod-im-field');
      textField.appendChild(createElement(hostDocument, 'span', '', 'Texto'));
      var textInput = createElement(hostDocument, 'input');
      textInput.type = 'text';
      textInput.value = element ? (element.textContent || '') : '';
      textInput.disabled = isDynamic;
      textInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        setHeadingText(target, textInput.value);
      });
      textField.appendChild(textInput);
      pane.appendChild(textField);
      if (isDynamic) {
        pane.appendChild(createElement(hostDocument, 'p', 'cod-im-hint', 'El contenido viene de un campo ACF. Volvé a "Fijo" para editarlo a mano.'));
      }

      var levelField = createElement(hostDocument, 'label', 'cod-im-field');
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

      var sourceField = createElement(hostDocument, 'label', 'cod-im-field');
      sourceField.appendChild(createElement(hostDocument, 'span', '', 'Fuente de contenido'));
      sourceField.appendChild(buildSourceSelect(component));
      pane.appendChild(sourceField);
      pane.appendChild(createElement(hostDocument, 'p', 'cod-im-hint', 'Fijo usa el texto de acá. Campo ACF reusa el binding universal ya existente (data-cod-dynamic).'));
    }

    function renderDesignPane(component) {
      var pane = panes.design;
      pane.replaceChildren();
      var style = computedStyleFor(component);
      if (!style) {
        pane.appendChild(createElement(hostDocument, 'div', 'cod-im-note', 'No se pudo leer el estilo del elemento.'));
        return;
      }

      var colorField = createElement(hostDocument, 'label', 'cod-im-field');
      colorField.appendChild(createElement(hostDocument, 'span', '', 'Color'));
      var colorInput = createElement(hostDocument, 'input');
      colorInput.type = 'color';
      colorInput.value = rgbToHex(style.color);
      colorInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'color', colorInput.value);
      });
      colorField.appendChild(colorInput);
      pane.appendChild(colorField);

      var sizeField = createElement(hostDocument, 'label', 'cod-im-field');
      sizeField.appendChild(createElement(hostDocument, 'span', '', 'Tamaño de fuente'));
      var sizeInput = createElement(hostDocument, 'input');
      sizeInput.type = 'text';
      sizeInput.value = style.fontSize || '';
      sizeInput.placeholder = 'ej. 32px';
      sizeInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'font-size', sizeInput.value);
      });
      sizeField.appendChild(sizeInput);
      pane.appendChild(sizeField);

      var alignField = createElement(hostDocument, 'label', 'cod-im-field');
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
        if (!target) return;
        applyDesignStyle(target, 'text-align', alignSelect.value);
      });
      alignField.appendChild(alignSelect);
      pane.appendChild(alignField);

      // POSICIÓN, con «pegado» como un valor más y no como una función aparte.
      //
      // Divi mete Sticky en su pestaña «Avanzado», como si fuera una capacidad
      // del sistema. Cristóbal, el 3 de octubre de 2026: «para mí sticky es una
      // propiedad visual que se maneja igual que cualquier posición de CSS».
      // Tiene razón y además ordena el reparto entre las dos pestañas: en
      // Diseño va lo que es apariencia —y una posición lo es—, y en
      // Configuración lo que es conducta, o sea los behaviors y sus
      // gatilladores.
      var posField = createElement(hostDocument, 'label', 'cod-im-field');
      posField.appendChild(createElement(hostDocument, 'span', '', 'Posición'));
      var posSelect = createElement(hostDocument, 'select');
      var posOptions = [
        ['static', 'Normal (sigue el flujo)'],
        ['relative', 'Relativa'],
        ['sticky', 'Pegada al desplazar'],
        ['absolute', 'Absoluta'],
        ['fixed', 'Fija a la pantalla'],
      ];
      for (var p = 0; p < posOptions.length; p++) {
        var posOption = createElement(hostDocument, 'option', '', posOptions[p][1]);
        posOption.value = posOptions[p][0];
        posSelect.appendChild(posOption);
      }
      posSelect.value = String(style.position || 'static');
      posField.appendChild(posSelect);
      pane.appendChild(posField);

      // Una posición pegada sin distancia no se pega a nada: el navegador
      // necesita saber desde dónde. Por eso el campo aparece con ella.
      var desdeField = createElement(hostDocument, 'label', 'cod-im-field');
      desdeField.appendChild(createElement(hostDocument, 'span', '', 'Distancia desde arriba'));
      var desdeInput = createElement(hostDocument, 'input');
      desdeInput.type = 'text';
      desdeInput.placeholder = '0px, 1rem…';
      var topActual = String(style.top || '');
      desdeInput.value = topActual === 'auto' ? '' : topActual;
      desdeField.appendChild(desdeInput);
      pane.appendChild(desdeField);

      function mostrarDistancia() {
        var v = posSelect.value;
        desdeField.hidden = v === 'static' || v === 'relative';
      }
      mostrarDistancia();

      posSelect.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'position', posSelect.value);
        // Pegada y sin distancia, se pone 0 para que haga algo: una posición
        // pegada sin `top` se comporta como si no estuviera, y eso parece un
        // control roto en vez de uno sin terminar de configurar.
        if (posSelect.value === 'sticky' && !desdeInput.value.trim()) {
          desdeInput.value = '0px';
          applyDesignStyle(target, 'top', '0px');
        }
        mostrarDistancia();
      });

      desdeInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'top', desdeInput.value.trim());
      });

      // ORDEN DE CAPAS. Va junto a la posición y no en una familia propia: sin
      // posición casi no hace nada, y la pregunta que resuelve es la misma
      // —dónde queda esto respecto de lo demás—.
      var capaField = createElement(hostDocument, 'label', 'cod-im-field');
      capaField.appendChild(createElement(hostDocument, 'span', '', 'Orden de capas'));
      var capaInput = createElement(hostDocument, 'input');
      capaInput.type = 'number';
      capaInput.min = '-10';
      capaInput.max = '100';
      capaInput.placeholder = 'auto';
      var capaActual = String(style['z-index'] || '');
      capaInput.value = capaActual === 'auto' ? '' : capaActual;
      capaInput.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'z-index', capaInput.value.trim());
      });
      capaField.appendChild(capaInput);
      pane.appendChild(capaField);

      // DESBORDE. Recortar es la única forma de que una esquina redondeada
      // afecte al contenido de dentro —y es además lo que rompe una posición
      // pegada, de ahí el aviso—.
      var desbField = createElement(hostDocument, 'label', 'cod-im-field');
      desbField.appendChild(createElement(hostDocument, 'span', '', 'Desborde'));
      var desbSelect = createElement(hostDocument, 'select');
      var desbOptions = [
        ['visible', 'Visible (se sale)'],
        ['hidden', 'Oculto (recorta)'],
        ['auto', 'Desplazable si hace falta'],
        ['scroll', 'Siempre con barra'],
      ];
      for (var d = 0; d < desbOptions.length; d++) {
        var desbOption = createElement(hostDocument, 'option', '', desbOptions[d][1]);
        desbOption.value = desbOptions[d][0];
        desbSelect.appendChild(desbOption);
      }
      desbSelect.value = String(style.overflow || 'visible');
      desbSelect.addEventListener('change', function () {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        applyDesignStyle(target, 'overflow', desbSelect.value);
        avisarRecorte();
      });
      desbField.appendChild(desbSelect);
      pane.appendChild(desbField);

      // El aviso existe porque este par es el motivo número uno de «el sticky
      // no funciona», y la causa nunca está donde se la busca.
      var avisoRecorte = createElement(hostDocument, 'p', 'cod-im-hint', '');
      pane.appendChild(avisoRecorte);
      function avisarRecorte() {
        var choca = desbSelect.value === 'hidden' && posSelect.value === 'sticky';
        avisoRecorte.textContent = choca
          ? 'Ojo: recortar impide que lo de dentro se pegue al desplazar. Si algo tiene que quedarse pegado aquí dentro, deja el desborde visible.'
          : '';
      }
      avisarRecorte();

      // TRANSFORMACIÓN. Girar y escalar sin tocar el espacio que ocupa. Son
      // dos campos y no siete porque son los dos que se usan; el resto está en
      // el contrato de la regla para quien componga.
      var girarField = createElement(hostDocument, 'label', 'cod-im-field');
      girarField.appendChild(createElement(hostDocument, 'span', '', 'Girar'));
      var girarInput = createElement(hostDocument, 'input');
      girarInput.type = 'text';
      girarInput.placeholder = '-6deg';
      girarField.appendChild(girarInput);
      pane.appendChild(girarField);

      var escalarField = createElement(hostDocument, 'label', 'cod-im-field');
      escalarField.appendChild(createElement(hostDocument, 'span', '', 'Escalar'));
      var escalarInput = createElement(hostDocument, 'input');
      escalarInput.type = 'number';
      escalarInput.min = '0';
      escalarInput.max = '10';
      escalarInput.step = '0.01';
      escalarInput.placeholder = '1';
      escalarField.appendChild(escalarInput);
      pane.appendChild(escalarField);

      var transformActual = String(style.transform || '');
      var mGirar = transformActual.match(/rotate\(([^)]+)\)/);
      var mEscalar = transformActual.match(/scale\(([^,)]+)\)/);
      girarInput.value = mGirar ? mGirar[1].trim() : '';
      escalarInput.value = mEscalar ? mEscalar[1].trim() : '';

      // Se escriben juntos porque `transform` es UNA propiedad: escribir el
      // giro por su lado borraría la escala, que es el error clásico al tocar
      // transform desde dos controles distintos.
      function aplicarTransformacion() {
        var target = editor.getSelected() || currentComponent;
        if (!target) return;
        var partes = [];
        if (girarInput.value.trim()) partes.push('rotate(' + girarInput.value.trim() + ')');
        if (escalarInput.value.trim()) partes.push('scale(' + escalarInput.value.trim() + ')');
        applyDesignStyle(target, 'transform', partes.join(' '));
      }
      girarInput.addEventListener('change', aplicarTransformacion);
      escalarInput.addEventListener('change', aplicarTransformacion);

      pane.appendChild(createElement(hostDocument, 'p', 'cod-im-hint', 'Estos controles aplican estilo local al elemento seleccionado (mismo mecanismo que el panel lateral).'));
    }

    function renderAllPanes() {
      if (!currentComponent) return;
      renderContentPane(currentComponent);
      renderDesignPane(currentComponent);
    }

    function switchTab(name) {
      activeTab = name;
      for (var i = 0; i < tabButtons.length; i++) {
        var isActive = tabButtons[i].getAttribute('data-cod-im-tab') === name;
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

      backdrop = createElement(hostDocument, 'div', 'cod-im-backdrop');
      backdrop.hidden = true;

      dialog = createElement(hostDocument, 'section', 'cod-im-modal');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'cod-im-title');

      var head = createElement(hostDocument, 'header', 'cod-im-head');
      var title = createElement(hostDocument, 'div', 'cod-im-title', 'Inspector · Título');
      title.id = 'cod-im-title';
      var closeButton = createElement(hostDocument, 'button', 'cod-im-close', '×');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Cerrar inspector');
      closeButton.addEventListener('click', close);
      head.appendChild(title);
      head.appendChild(closeButton);

      var tabs = createElement(hostDocument, 'div', 'cod-im-tabs');
      tabs.setAttribute('role', 'tablist');
      tabButtons = [];
      // Las categorías van acá dentro, no en el icono: el lápiz dice «edita esto»
      // y la ventana separa QUÉ dice de CÓMO se ve.
      var tabDefs = [['content', 'Configuración'], ['design', 'Diseño']];
      for (var i = 0; i < tabDefs.length; i++) {
        var tab = createElement(hostDocument, 'button', 'cod-im-tab', tabDefs[i][1]);
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('data-cod-im-tab', tabDefs[i][0]);
        (function (name) {
          tab.addEventListener('click', function () { switchTab(name); });
        })(tabDefs[i][0]);
        tabs.appendChild(tab);
        tabButtons.push(tab);
      }

      var body = createElement(hostDocument, 'div', 'cod-im-body');
      panes = {};
      for (var j = 0; j < tabDefs.length; j++) {
        var pane = createElement(hostDocument, 'div', 'cod-im-pane');
        pane.setAttribute('data-cod-im-pane', tabDefs[j][0]);
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
