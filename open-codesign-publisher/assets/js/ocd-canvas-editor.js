/**
 * Open CoDesign Canvas — editor experimental (entry de administración).
 *
 * Consume el núcleo compartido de `ocd-editor-core.js` (window.OCDEditorCore)
 * y aporta el chrome de la pantalla admin: toolbar, picker de página, tabs de
 * región, import/export, panel de región y bloques ACF. La persistencia sigue
 * siendo por admin-ajax con nonce; el motor reutilizable vive en el core.
 */
(function (window, document) {
    'use strict';

    var config = window.ocdCanvasEditor;
    var root = document.getElementById('ocd-canvas-editor-root');
    var statusNode = document.getElementById('ocd-canvas-status');

    if (!config || !root) {
        return;
    }

    function setStatus(message, kind) {
        if (!statusNode) {
            return;
        }
        statusNode.textContent = message;
        statusNode.className = 'ocd-canvas-status' + (kind ? ' is-' + kind : '');
    }

    // ------------------------------------------------------------------
    // Zoom-to-fit del lienzo. La preferencia vive en `localStorage` (no en
    // el documento guardado) y el escalado usa el mecanismo NATIVO de
    // GrapesJS 0.23.4 (`editor.Canvas.setZoom` / `fitViewport`), que ya
    // corrige las coordenadas de mouse y los badges de selección con el
    // zoom aplicado. El ancho de página se configura también en la toolbar.
    // ------------------------------------------------------------------
    var ZOOM_STORAGE_KEY = 'ocdCanvasEditor:zoom';
    var WIDTH_STORAGE_KEY = 'ocdCanvasEditor:canvasWidth';
    var DEFAULT_CANVAS_WIDTH = 1920;
    var CANVAS_WIDTH_OPTIONS = [1920, 1440, 1280];
    var ZOOM_MODES = ['fit', '100', '75', '50'];

    function readStoredCanvasWidth() {
        var fallback = parseInt(config.canvasWidth, 10);
        if (isNaN(fallback) || CANVAS_WIDTH_OPTIONS.indexOf(fallback) === -1) {
            fallback = DEFAULT_CANVAS_WIDTH;
        }
        try {
            var stored = parseInt(window.localStorage.getItem(WIDTH_STORAGE_KEY), 10);
            if (CANVAS_WIDTH_OPTIONS.indexOf(stored) !== -1) {
                return stored;
            }
        } catch (_error) {
            // Sin acceso a localStorage el editor sigue con el ancho por defecto.
        }
        return fallback;
    }

    function readStoredZoom() {
        try {
            var stored = window.localStorage.getItem(ZOOM_STORAGE_KEY);
            if (ZOOM_MODES.indexOf(stored) !== -1) {
                return stored;
            }
        } catch (_error) {
            // Sin acceso a localStorage el editor arranca en "Ajustar a pantalla".
        }
        return 'fit';
    }

    var initialCanvasWidth = readStoredCanvasWidth();
    var currentZoomMode = readStoredZoom();

    var core = window.OCDEditorCore && typeof window.OCDEditorCore.create === 'function'
        ? window.OCDEditorCore.create({
            container: '#ocd-canvas-editor-root',
            status: setStatus,
            ajaxUrl: config.ajaxUrl,
            nonce: config.nonce,
            siteFontCss: config.siteFontCss || '',
            themeDefinitionsCss: config.themeDefinitionsCss || '',
            siteUrl: config.siteUrl || '',
            oruganttForms: config.oruganttForms || [],
            canvasWidth: initialCanvasWidth,
            inspectorMount: document.getElementById('ocd-canvas-inspector'),
            gridControlsMount: '#ocd-canvas-inspector .ocd-ci__head',
            groupControlsMount: '#ocd-canvas-inspector .ocd-ci__head',
            onDocumentApplied: function (doc) {
                current = doc;
                if (doc && doc.documentId) {
                    activeDocumentId = doc.documentId;
                    config.documentId = doc.documentId;
                }
                if (activeSegment === null && doc && doc.documentId) {
                    bodyDocument = doc;
                    bodyDocumentId = doc.documentId;
                }
                updateMeta(doc);
                window.requestAnimationFrame(function () {
                    dirty = false;
                });
            }
        })
        : null;

    if (!core) {
        setStatus('No se pudo cargar el editor Canvas completo desde los archivos locales del plugin.', 'error');
        return;
    }

    var editor = core.editor;
    var behaviorApi = core.behaviors;
    var gridApi = core.grid;
    var acfImageSrc = core.acfImageSrc;
    // Expuesto para que ocd-computed-inspector.js (control universal "Fuente
    // de contenido") pueda usar el mismo placeholder de imagen ACF sin
    // duplicar el data URI ni importar este closure.
    window.OCDCanvasEditor = window.OCDCanvasEditor || {};
    window.OCDCanvasEditor.acfImageSrc = acfImageSrc;
    var snapshot = core.snapshot;
    var applyDocument = core.applyDocument;
    var request = core.request;
    var refreshPresentation = core.refreshPresentation;
    var getSourceCss = core.getSourceCss;
    var setSourceCss = core.setSourceCss;
    var serializedCss = core.serializedCss;

    window.ocdCanvas = {
        editor: editor,
        blocks: core.blocks,
        inspector: core.inspector,
        grid: gridApi,
        gridControls: core.gridControls,
        groupControls: core.groupControls,
        behaviors: behaviorApi
    };

    // ------------------------------------------------------------------
    // Zoom-to-fit del lienzo (control de toolbar). No se guarda en el
    // documento: es una preferencia de la sesión de edición.
    // ------------------------------------------------------------------
    var zoomSelect = document.getElementById('ocd-canvas-zoom');
    var widthSelect = document.getElementById('ocd-canvas-width');
    var heightInput = document.getElementById('ocd-canvas-height');
    var canvasRoot = document.getElementById('ocd-canvas-editor-root');

    function persistZoomMode(mode) {
        try {
            window.localStorage.setItem(ZOOM_STORAGE_KEY, mode);
        } catch (_error) {
            // El editor sigue funcionando cuando el almacenamiento local está bloqueado.
        }
    }

    function persistCanvasWidth(width) {
        try {
            window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
        } catch (_error) {
            // El editor sigue funcionando cuando el almacenamiento local está bloqueado.
        }
    }

    function applyZoomMode(mode) {
        currentZoomMode = mode;
        if (!editor || !editor.Canvas) {
            return;
        }
        if (mode === 'fit') {
            if (typeof editor.Canvas.fitViewport === 'function') {
                // El dispositivo debe caber COMPLETO en el área de edición.
                // Ajustar sólo por ancho agrandaba Mobile hasta sacar su alto
                // fuera del canvas y obligaba a desplazar la página exterior.
                editor.Canvas.fitViewport({ ignoreHeight: false, gap: 16 });
            }
            return;
        }
        var zoom = parseInt(mode, 10);
        if (isNaN(zoom)) {
            return;
        }
        if (typeof editor.Canvas.setZoom === 'function') {
            // Al salir de "Ajustar a pantalla" conviene devolver el origen
            // arriba a la izquierda: `fitViewport` centra el lienzo y, si
            // sólo se cambiara el zoom, un 100% posterior podría quedar
            // desplazado fuera del área visible.
            if (typeof editor.Canvas.setCoords === 'function') {
                editor.Canvas.setCoords(0, 0);
            }
            editor.Canvas.setZoom(zoom);
        }
    }

    function updateCanvasWidth(width) {
        if (!editor) {
            return;
        }
        var device = editor.Devices && typeof editor.Devices.get === 'function'
            ? editor.Devices.get('desktop')
            : null;
        if (device && typeof device.set === 'function') {
            device.set({ width: String(width) + 'px', widthMedia: '' });
        }
        if (editor.Canvas && typeof editor.Canvas.updateDevice === 'function') {
            editor.Canvas.updateDevice();
        }
        persistCanvasWidth(width);
        if (widthSelect) {
            widthSelect.value = String(width);
        }
        applyZoomMode(currentZoomMode);
        window.setTimeout(function () {
            if (typeof editor.refresh === 'function') {
                editor.refresh({ tools: true });
            }
        }, 0);
    }

    if (zoomSelect) {
        zoomSelect.value = currentZoomMode;
        zoomSelect.addEventListener('change', function () {
            persistZoomMode(zoomSelect.value);
            applyZoomMode(zoomSelect.value);
        });
    }

    if (widthSelect) {
        widthSelect.value = String(initialCanvasWidth);
        widthSelect.addEventListener('change', function () {
            var width = parseInt(widthSelect.value, 10);
            if (CANVAS_WIDTH_OPTIONS.indexOf(width) === -1) {
                width = DEFAULT_CANVAS_WIDTH;
            }
            updateCanvasWidth(width);
        });
    }

    function selectedDeviceModel() {
        if (!editor || !editor.Devices) return null;
        if (typeof editor.Devices.getSelected === 'function') return editor.Devices.getSelected();
        var selectedId = typeof editor.getDevice === 'function' ? editor.getDevice() : '';
        return selectedId && typeof editor.Devices.get === 'function' ? editor.Devices.get(selectedId) : null;
    }

    function syncPreviewHeightInput() {
        if (!heightInput) return;
        var device = selectedDeviceModel();
        var height = parseInt(device && typeof device.get === 'function' ? device.get('height') : '', 10);
        if (Number.isFinite(height)) heightInput.value = String(height);
    }

    if (heightInput) {
        heightInput.addEventListener('change', function () {
            var height = Math.max(240, Math.min(2000, parseInt(heightInput.value, 10) || 568));
            var device = selectedDeviceModel();
            if (device && typeof device.set === 'function') {
                device.set('height', height + 'px');
                if (editor.Canvas && typeof editor.Canvas.updateDevice === 'function') editor.Canvas.updateDevice();
                scheduleFitRecalc();
            }
            heightInput.value = String(height);
        });
    }

    // `load` se emite de forma asíncrona una vez que GrapesJS ya renderizó
    // el canvas; es el momento correcto para un primer "Ajustar a pantalla"
    // (necesita dimensiones reales del viewport). Para porcentajes fijos no
    // esperamos y se aplica de inmediato para que el usuario no vea un
    // flash del layout anterior.
    if (currentZoomMode !== 'fit') {
        applyZoomMode(currentZoomMode);
    }
    editor.on('load', function () {
        applyZoomMode(currentZoomMode);
    });

    // Recalcula "Ajustar a pantalla" cuando cambia el ancho disponible del
    // panel del lienzo. El listener de `window.resize` cumple el caso
    // explícito de redimensionar la ventana; `ResizeObserver` sobre el
    // contenedor cubre además el cambio de panel lateral (inspector ⇄
    // componentes), que modifica el ancho del lienzo sin `window.resize`.
    var fitRecalcFrame = null;
    function scheduleFitRecalc() {
        if (currentZoomMode !== 'fit') {
            return;
        }
        if (fitRecalcFrame) {
            return;
        }
        fitRecalcFrame = window.requestAnimationFrame(function () {
            fitRecalcFrame = null;
            if (currentZoomMode === 'fit' && editor.Canvas && typeof editor.Canvas.fitViewport === 'function') {
                editor.Canvas.fitViewport({ ignoreHeight: false, gap: 16 });
            }
        });
    }

    window.addEventListener('resize', scheduleFitRecalc);
    editor.on('device:select', function () {
        // El frame cambia sus dos dimensiones al alternar Desktop/Tablet/Móvil;
        // esperar un frame evita medir todavía el dispositivo anterior.
        window.requestAnimationFrame(scheduleFitRecalc);
        syncPreviewHeightInput();
    });
    if (canvasRoot && typeof window.ResizeObserver === 'function') {
        // Cubre además el cambio de panel lateral (inspector ⇄ componentes),
        // que modifica el ancho del lienzo sin disparar `window.resize`.
        new window.ResizeObserver(scheduleFitRecalc).observe(canvasRoot);
    }

    // ------------------------------------------------------------------
    // "Guardar como módulo" (Súper-Módulo, MVP): registra en el
    // BlockManager los módulos personalizados que el usuario ya guardó
    // (icono genérico + categoría propia elegida al guardar, así cada
    // categoría inventada se vuelve su propia sección de la paleta) y
    // expone `window.OCDCanvasEditor.saveCustomModule()` para que el botón
    // del inspector (ocd-computed-inspector.js) pueda guardar uno nuevo sin
    // que ese archivo necesite conocer `ajaxUrl`/`nonce` — mismo puente
    // `window.OCDCanvasEditor` que ya usan `acfFields` y `acfImageSrc`.
    // ------------------------------------------------------------------
    window.OCDCanvasEditor = window.OCDCanvasEditor || {};

    function customModuleBlockIcon() {
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" ' +
            'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>' +
            '<rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' +
            '</svg>'
        );
    }

    /**
     * Extrae del CSS completo del lienzo sólo las reglas relevantes al HTML
     * del componente guardado: por CLASE (estilos reutilizables) y por ID
     * (estilos locales — GrapesJS también guarda el estilo "sólo este
     * elemento" del inspector como una regla `#id{...}` propia del
     * componente, no sólo como clase). Es un filtro de texto simple (no un
     * parser CSS completo: no distingue @media anidados), en la misma línea
     * que collectDynamicGroupCss() del núcleo — suficiente para el MVP,
     * documentado como límite conocido.
     */
    function extractRelevantCss(fullCss, html) {
        var selectors = [];
        var seen = {};

        function collectAttr(attrName, prefix) {
            var pattern = new RegExp(attrName + '="([^"]*)"', 'g');
            var match;
            while ((match = pattern.exec(String(html || ''))) !== null) {
                match[1].split(/\s+/).forEach(function (name) {
                    var trimmed = name.trim();
                    var key = prefix + trimmed;
                    if (trimmed && !seen[key]) {
                        seen[key] = true;
                        selectors.push(prefix + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    }
                });
            }
        }

        collectAttr('class', '\\.');
        collectAttr('id', '#');

        if (!selectors.length) {
            return '';
        }
        var combinedRegex = new RegExp('(?:' + selectors.join('|') + ')(?![a-zA-Z0-9_-])');
        var blocks = String(fullCss || '').match(/[^{}]+\{[^{}]*\}/g) || [];
        return blocks
            .filter(function (block) {
                var selector = block.split('{')[0];
                return combinedRegex.test(selector);
            })
            .join('\n');
    }

    var customModuleBlockIds = [];

    /**
     * Registra (o vuelve a registrar) un módulo guardado como bloque del
     * BlockManager. Se usa tanto al arrancar el editor (lista completa) como
     * justo después de guardar uno nuevo, para que quede usable sin recargar.
     */
    function registerCustomModuleBlock(module) {
        var id = module && module.id ? String(module.id) : '';
        var html = module && module.html ? String(module.html) : '';
        if (!id || !html || !editor.BlockManager) {
            return;
        }
        if (module.css && editor.Css && typeof editor.Css.addRules === 'function') {
            try {
                editor.Css.addRules(String(module.css));
            } catch (_error) {
                // Un CSS guardado inválido no debe impedir registrar el bloque.
            }
        }
        try {
            editor.BlockManager.add(id, {
                label: module.label ? String(module.label) : id,
                category: module.category ? String(module.category) : 'Módulos guardados',
                media: customModuleBlockIcon(),
                content: html
            });
            customModuleBlockIds.push(id);
        } catch (_error) {
            // Un módulo guardado corrupto no debe tumbar el arranque del editor.
        }
    }

    /**
     * Pide al servidor la lista de módulos guardados y los registra todos.
     * Se llama una única vez al arrancar el editor (no depende de qué página
     * esté cargada: los módulos guardados son globales al sitio), mismo
     * momento en que se cargan los campos ACF y el bloque de Orugantt.
     */
    function loadCustomModuleBlocks() {
        if (!config.customModuleListAction) {
            return;
        }
        request(config.customModuleListAction, {})
            .then(function (data) {
                var list = data && Array.isArray(data.modules) ? data.modules : [];
                list.forEach(registerCustomModuleBlock);
            })
            .catch(function () {
                // Sin lista de módulos guardados el editor sigue funcionando
                // con los bloques base; no es un error bloqueante.
            });
    }

    /**
     * Guarda el componente seleccionado (con todo su contenido adentro) como
     * un módulo reutilizable nuevo. Llamado desde el botón "Guardar como
     * módulo" del inspector, que ya recogió label/category por prompt().
     * Registra el bloque nuevo de inmediato al terminar, para que quede
     * disponible sin recargar el editor.
     */
    window.OCDCanvasEditor.saveCustomModule = function (component, label, category) {
        if (!config.customModuleSaveAction || !component || typeof component.toHTML !== 'function') {
            return Promise.reject(new Error('Guardado de módulos no disponible.'));
        }
        var html = String(component.toHTML() || '').trim();
        if (!html) {
            return Promise.reject(new Error('El elemento seleccionado no tiene contenido para guardar.'));
        }
        var css = extractRelevantCss(editor.getCss() || '', html);

        return request(config.customModuleSaveAction, {
            label: String(label || ''),
            category: String(category || ''),
            html: html,
            css: css
        }).then(function (entry) {
            registerCustomModuleBlock(entry);
            return entry;
        });
    };

    loadCustomModuleBlocks();

    /** Estado del documento tal como lo devolvió el servidor por última vez. */
    var current = config.document || null;
    var activeDocumentId = config.documentId || null;
    var bodyDocument = current;
    var bodyDocumentId = config.documentId || null;
    var autosaveEnabled = false;
    var autosaveTimer = null;
    var saveInFlight = null;
    var isSaving = false;
    var dirty = false;
    var pageRegionDocs = { header: null, footer: null };
    var pageContext = null;
    // activeSegment: legado, solo lo lee código muerto (saveRegion(), nunca
    // se dispara desde la interfaz) — se deja en null a propósito, no tocar.
    var activeSegment = null;
    /**
     * activeSlot: 'body'|'header'|'footer' — cuál de los tres espacios de
     * la página ensamblada es el lienzo editable ahora mismo. Reemplaza a
     * activeSegment para la interacción real (ver enterSlot()).
     * pageBodyDocumentId guarda el document_id del cuerpo, para volver ahí
     * cuando se entra a otro espacio.
     */
    var activeSlot = 'body';
    var pageBodyDocumentId = '';
    var originalEditorShellParent = null;
    var pageLoadInFlight = false;

    /**
     * Fuente de verdad de las reglas de región en el cliente. Los campos
     * ocultos #ocd-region-targets / #ocd-region-excludes se sincronizan desde
     * acá en cada cambio y son lo que saveRegion() envía por AJAX.
     */
    var regionRules = { targets: [], excludes: [] };

    /**
     * Vocabulario de reglas espejo del sancionado por
     * OCD_Canvas_Document_Repository::sanitize_match_rules(). Solo es UI.
     */
    var RULE_TYPE_DEFS = {
        post: { entity: 'pages', prefix: 'Página', reachEntity: 'la página' },
        children_of: { entity: 'pages', prefix: 'Hijas de', reachEntity: 'páginas hijas de' },
        category: { entity: 'categories', prefix: 'Categoría', reachEntity: 'entradas de la categoría' },
        tag: { entity: 'tags', prefix: 'Etiqueta', reachEntity: 'entradas de la etiqueta' },
        homepage: { standalone: true, label: 'La portada', reach: 'la portada' },
        all_pages: { standalone: true, label: 'Todas las páginas', reach: 'todas las páginas' },
        all_posts: { standalone: true, label: 'Todas las entradas', reach: 'todas las entradas' }
    };

    function updateMeta(doc) {
        var revision = document.getElementById('ocd-canvas-revision');
        var updated = document.getElementById('ocd-canvas-updated');
        if (revision) {
            revision.textContent = doc && typeof doc.revision === 'number' ? String(doc.revision) : '—';
        }
        if (updated) {
            updated.textContent = doc && doc.updatedAt ? doc.updatedAt : '—';
        }
    }

    function persist(kind) {
        if (!activeDocumentId) {
            setStatus('No hay un documento activo para guardar.', 'error');
            return Promise.reject(new Error('No hay un documento activo para guardar.'));
        }
        if (saveInFlight) {
            return saveInFlight.then(function () {
                return persist(kind);
            });
        }
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
        isSaving = true;
        setStatus(kind === 'auto' ? 'Autoguardando cambios…' : 'Guardando…');
        var payload = snapshot();
        payload.document_id = activeDocumentId;
        saveInFlight = request(config.saveAction, payload)
            .then(function (doc) {
                current = doc;
                if (doc && doc.documentId) {
                    activeDocumentId = doc.documentId;
                    config.documentId = doc.documentId;
                }
                if (activeSegment === null && doc && doc.documentId) {
                    bodyDocument = doc;
                    bodyDocumentId = doc.documentId;
                }
                dirty = false;
                updateMeta(doc);
                setStatus(
                    (kind === 'auto' ? 'Autoguardado' : 'Guardado') + ' (revisión ' + doc.revision + ').',
                    'ok'
                );
                return doc;
            })
            .catch(function (error) {
                setStatus('No se pudo guardar el borrador: ' + error.message, 'error');
                throw error;
            })
            .finally(function () {
                saveInFlight = null;
                isSaving = false;
            });
        return saveInFlight;
    }

    function save() {
        return persist('manual').catch(function (_error) {
            // `persist` ya deja el error visible en la franja de estado.
        });
    }

    function regionStatus(message, kind) {
        var node = document.getElementById('ocd-canvas-region-status');
        if (!node) {
            return;
        }
        node.textContent = message;
        node.className = 'ocd-canvas-status' + (kind ? ' is-' + kind : '');
    }

    function regionLabel(kind) {
        if (kind === 'header') return 'Encabezado';
        if (kind === 'body') return 'Cuerpo';
        if (kind === 'footer') return 'Pie de página';
        return kind;
    }

    function parseRegionRuleList(value, label) {
        var raw = String(value || '').trim() === '' ? '[]' : String(value).trim();
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_error) {
            regionStatus('Las ' + label + ' deben ser JSON válido, p. ej. [{"type":"post","id":12}].', 'error');
            return null;
        }
        if (!Array.isArray(parsed)) {
            regionStatus('Las ' + label + ' deben ser un arreglo JSON.', 'error');
            return null;
        }
        return parsed;
    }

    function ruleChoices() {
        return (config && config.ruleChoices) ? config.ruleChoices : {};
    }

    function ruleEntityChoices(type) {
        var def = RULE_TYPE_DEFS[type];
        if (!def || !def.entity) {
            return [];
        }
        return ruleChoices()[def.entity] || [];
    }

    function ruleEntityName(type, id) {
        var idNumber = Number(id);
        var list = ruleEntityChoices(type);
        for (var i = 0; i < list.length; i++) {
            if (Number(list[i].id) === idNumber) {
                return list[i].title || list[i].name || '';
            }
        }
        return '';
    }

    function ruleLabel(rule) {
        if (!rule || !rule.type) {
            return 'Regla sin tipo';
        }
        var type = String(rule.type);
        var def = RULE_TYPE_DEFS[type];
        if (!def) {
            return 'Regla desconocida (' + type + ')';
        }
        if (def.standalone) {
            return def.label;
        }
        var id = Number(rule.id);
        var name = ruleEntityName(type, id);
        if (name) {
            return def.prefix + ': ' + name;
        }
        return def.prefix + ' #' + id + ' (inexistente)';
    }

    function ruleKey(rule) {
        if (!rule || !rule.type) {
            return '';
        }
        var type = String(rule.type);
        var def = RULE_TYPE_DEFS[type];
        if (def && def.standalone) {
            return type;
        }
        return type + ':' + Number(rule.id || 0);
    }

    function isOrphanRule(rule) {
        if (!rule || !rule.type) {
            return false;
        }
        var def = RULE_TYPE_DEFS[String(rule.type)];
        if (!def || def.standalone) {
            return false;
        }
        return ruleEntityName(rule.type, rule.id) === '';
    }

    function hasRule(list, rule) {
        var key = ruleKey(rule);
        for (var i = 0; i < list.length; i++) {
            if (ruleKey(list[i]) === key) {
                return true;
            }
        }
        return false;
    }

    function normalizeRules(value) {
        if (!Array.isArray(value)) {
            return [];
        }
        return value.map(function (rule) {
            if (!rule || typeof rule !== 'object') {
                return { type: String(rule || '') };
            }
            var normalized = { type: String(rule.type || '') };
            if (rule.id !== undefined && rule.id !== null && rule.id !== '') {
                normalized.id = Number(rule.id);
            }
            return normalized;
        });
    }

    function renderRuleChips(listName) {
        var container = document.querySelector('[data-ocd-rule-list="' + listName + '"]');
        if (!container) {
            return;
        }
        container.innerHTML = '';
        var rules = regionRules[listName] || [];
        rules.forEach(function (rule) {
            var chip = document.createElement('span');
            chip.className = 'ocd-rule-chip';
            chip.setAttribute('role', 'listitem');
            if (isOrphanRule(rule)) {
                chip.classList.add('is-orphan');
            }

            var label = document.createElement('span');
            label.className = 'ocd-rule-chip__label';
            label.textContent = ruleLabel(rule);
            chip.appendChild(label);

            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'ocd-rule-chip__remove';
            remove.setAttribute('aria-label', 'Quitar ' + ruleLabel(rule));
            remove.textContent = '×';
            remove.addEventListener('click', function () {
                removeRule(listName, rule);
            });
            chip.appendChild(remove);

            container.appendChild(chip);
        });
    }

    function removeRule(listName, rule) {
        var key = ruleKey(rule);
        regionRules[listName] = (regionRules[listName] || []).filter(function (existing) {
            return ruleKey(existing) !== key;
        });
        syncRegionState();
    }

    function addRule(listName, rule) {
        var list = regionRules[listName];
        if (!Array.isArray(list)) {
            list = regionRules[listName] = [];
        }
        if (hasRule(list, rule)) {
            regionStatus('Esa regla ya está agregada.', 'error');
            return;
        }
        list.push(rule);
        syncRegionState();
    }

    function populateEntitySelect(listName, entityKind) {
        var entitySelect = document.querySelector('[data-ocd-rule-entity="' + listName + '"]');
        if (!entitySelect) {
            return;
        }
        entitySelect.innerHTML = '';
        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Elegir…';
        entitySelect.appendChild(placeholder);
        var choices = ruleChoices()[entityKind] || [];
        choices.forEach(function (choice) {
            var option = document.createElement('option');
            option.value = String(choice.id);
            option.textContent = choice.title || choice.name || ('#' + choice.id);
            entitySelect.appendChild(option);
        });
    }

    function updateRulePicker(listName) {
        var typeSelect = document.querySelector('[data-ocd-rule-type="' + listName + '"]');
        var entitySelect = document.querySelector('[data-ocd-rule-entity="' + listName + '"]');
        if (!typeSelect) {
            return;
        }
        var type = typeSelect.value;
        var def = RULE_TYPE_DEFS[type];
        if (!def) {
            if (entitySelect) {
                entitySelect.hidden = true;
            }
            return;
        }
        if (def.standalone) {
            // Los tipos sin id se agregan directamente al seleccionarlos.
            if (entitySelect) {
                entitySelect.hidden = true;
            }
            addRule(listName, { type: type });
            typeSelect.value = '';
            return;
        }
        populateEntitySelect(listName, def.entity);
        if (entitySelect) {
            entitySelect.hidden = false;
        }
    }

    function addRuleFromPicker(listName) {
        var typeSelect = document.querySelector('[data-ocd-rule-type="' + listName + '"]');
        if (!typeSelect) {
            return;
        }
        var type = typeSelect.value;
        var def = RULE_TYPE_DEFS[type];
        if (!def) {
            regionStatus('Elegí un tipo de regla.', 'error');
            return;
        }
        if (def.standalone) {
            addRule(listName, { type: type });
            typeSelect.value = '';
            updateRulePicker(listName);
            return;
        }
        var entitySelect = document.querySelector('[data-ocd-rule-entity="' + listName + '"]');
        var entityId = entitySelect ? parseInt(entitySelect.value, 10) : 0;
        if (!entityId || entityId <= 0) {
            regionStatus('Elegí una opción de la lista.', 'error');
            return;
        }
        addRule(listName, { type: type, id: entityId });
        typeSelect.value = '';
        if (entitySelect) {
            entitySelect.value = '';
            entitySelect.hidden = true;
        }
    }

    function updateRuleFieldsetState() {
        var scopeField = document.getElementById('ocd-region-scope');
        var scope = scopeField ? scopeField.value : '';
        var targetsFieldset = document.querySelector('[data-ocd-rule-fieldset="targets"]');
        if (!targetsFieldset) {
            return;
        }
        var isGlobal = scope === 'global';
        targetsFieldset.classList.toggle('is-scoped-out', isGlobal);
        var hint = targetsFieldset.querySelector('[data-ocd-rule-scope-hint="targets"]');
        if (hint) {
            hint.hidden = !isGlobal;
        }
        var controls = targetsFieldset.querySelectorAll('select, button');
        Array.prototype.forEach.call(controls, function (control) {
            control.disabled = isGlobal;
        });
    }

    function describeRule(rule) {
        if (!rule || !rule.type) {
            return '';
        }
        var type = String(rule.type);
        var def = RULE_TYPE_DEFS[type];
        if (!def) {
            return '';
        }
        if (def.standalone) {
            return def.reach;
        }
        var name = ruleEntityName(type, rule.id);
        if (!name) {
            return '';
        }
        return def.reachEntity + ' «' + name + '»';
    }

    function describeRules(rules) {
        var parts = [];
        (rules || []).forEach(function (rule) {
            var description = describeRule(rule);
            if (description) {
                parts.push(description);
            }
        });
        return parts.join(', ');
    }

    function updateRegionReach() {
        var node = document.getElementById('ocd-region-reach');
        if (!node) {
            return;
        }
        var scopeField = document.getElementById('ocd-region-scope');
        var scope = scopeField ? scopeField.value : '';
        var targets = regionRules.targets || [];
        var excludes = regionRules.excludes || [];

        if (scope === 'global') {
            if (excludes.length === 0) {
                node.textContent = 'Se aplica a: todo el sitio.';
                return;
            }
            var excludedGlobal = describeRules(excludes);
            node.textContent = excludedGlobal
                ? 'Se aplica a: todo el sitio, salvo: ' + excludedGlobal + '.'
                : 'Se aplica a: todo el sitio, salvo exclusiones.';
            return;
        }

        if (scope === 'local') {
            var label = describeRules(targets);
            if (!label) {
                node.textContent = 'El alcance local aún no define destinos.';
                return;
            }
            var text = 'Se aplica a: ' + label;
            if (excludes.length > 0) {
                var excludedLocal = describeRules(excludes);
                if (excludedLocal) {
                    text += '; salvo ' + excludedLocal;
                }
            }
            node.textContent = text + '.';
            return;
        }

        node.textContent = '';
    }

    function advancedJsonValue() {
        return JSON.stringify(
            { targets: regionRules.targets || [], excludes: regionRules.excludes || [] },
            null,
            2
        );
    }

    function updateAdvancedJson() {
        var area = document.getElementById('ocd-region-json');
        if (!area) {
            return;
        }
        if (document.activeElement === area) {
            return;
        }
        area.value = advancedJsonValue();
    }

    function syncRegionState() {
        var targetsHidden = document.getElementById('ocd-region-targets');
        var excludesHidden = document.getElementById('ocd-region-excludes');
        if (targetsHidden) {
            targetsHidden.value = JSON.stringify(regionRules.targets || []);
        }
        if (excludesHidden) {
            excludesHidden.value = JSON.stringify(regionRules.excludes || []);
        }
        renderRuleChips('targets');
        renderRuleChips('excludes');
        updateRuleFieldsetState();
        updateRegionReach();
        updateAdvancedJson();
    }

    function onAdvancedJsonBlur() {
        var area = document.getElementById('ocd-region-json');
        if (!area) {
            return;
        }
        var value = String(area.value || '').trim();
        if (value === '') {
            regionRules = { targets: [], excludes: [] };
            syncRegionState();
            regionStatus('JSON avanzado vacío: se vaciaron destinos y exclusiones.', 'ok');
            return;
        }
        var parsed;
        try {
            parsed = JSON.parse(value);
        } catch (_error) {
            regionStatus('El JSON avanzado no es válido.', 'error');
            area.value = advancedJsonValue();
            return;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
            !Array.isArray(parsed.targets) || !Array.isArray(parsed.excludes)) {
            regionStatus('El JSON avanzado debe ser un objeto {"targets":[…],"excludes":[…]}.', 'error');
            area.value = advancedJsonValue();
            return;
        }
        regionRules.targets = normalizeRules(parsed.targets);
        regionRules.excludes = normalizeRules(parsed.excludes);
        syncRegionState();
        regionStatus('Reglas reconstruidas desde el JSON avanzado.', 'ok');
    }

    function populateRegionFields(doc) {
        var kindField = document.getElementById('ocd-region-kind');
        var scopeField = document.getElementById('ocd-region-scope');
        if (!doc) {
            doc = {};
        }
        if (kindField) {
            kindField.value = doc.regionKind || '';
        }
        if (scopeField) {
            scopeField.value = doc.regionScope || '';
        }
        regionRules.targets = normalizeRules(doc.regionTargets);
        regionRules.excludes = normalizeRules(doc.regionExcludes);
        syncRegionState();
    }

    function saveRegion() {
        var kindField = document.getElementById('ocd-region-kind');
        var scopeField = document.getElementById('ocd-region-scope');
        var targetsField = document.getElementById('ocd-region-targets');
        var excludesField = document.getElementById('ocd-region-excludes');
        if (!kindField || !scopeField || !targetsField || !excludesField) {
            return;
        }
        if (!activeDocumentId) {
            regionStatus('No hay un documento activo para guardar la región.', 'error');
            return;
        }
        var parsedTargets = parseRegionRuleList(targetsField.value, 'destinos');
        if (parsedTargets === null) {
            return;
        }
        var parsedExcludes = parseRegionRuleList(excludesField.value, 'exclusiones');
        if (parsedExcludes === null) {
            return;
        }

        regionStatus('Guardando región…');
        request(config.saveRegionAction, {
            document_id: activeDocumentId,
            region_kind: kindField.value,
            region_scope: scopeField.value,
            region_targets: JSON.stringify(parsedTargets),
            region_excludes: JSON.stringify(parsedExcludes)
        })
            .then(function (doc) {
                var regionPatch = {
                    regionKind: doc.regionKind || '',
                    regionScope: doc.regionScope || '',
                    regionTargets: doc.regionTargets || [],
                    regionExcludes: doc.regionExcludes || []
                };
                current = Object.assign({}, current || {}, regionPatch);
                if (doc && doc.documentId) {
                    activeDocumentId = doc.documentId;
                    config.documentId = doc.documentId;
                }
                if (activeSegment && pageRegionDocs[activeSegment]) {
                    pageRegionDocs[activeSegment] = Object.assign({}, pageRegionDocs[activeSegment], regionPatch);
                }
                populateRegionFields(doc);
                regionStatus('Región guardada.', 'ok');
            })
            .catch(function (error) {
                regionStatus('No se pudo guardar la región: ' + error.message, 'error');
            });
    }

    function scheduleAutosave() {
        if (!autosaveEnabled || isSaving) return;
        window.clearTimeout(autosaveTimer);
        setStatus('Cambios pendientes de autoguardado…');
        autosaveTimer = window.setTimeout(function () {
            autosaveTimer = null;
            persist('auto').catch(function () {
                // `persist` ya deja el error visible en la franja de estado.
            });
        }, 1200);
    }

    function reload() {
        if (!activeDocumentId) {
            setStatus('No hay un documento activo para recargar.', 'error');
            return Promise.resolve();
        }
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
        dirty = false;
        setStatus('Recargando…');
        return request(config.loadAction, { document_id: activeDocumentId })
            .then(function (doc) {
                if (activeSlot !== 'body' && pageRegionDocs[activeSlot]) {
                    pageRegionDocs[activeSlot] = doc;
                    renderSlotPreview(activeSlot, doc);
                }
                applyDocument(doc);
                populateRegionFields(doc);
                setStatus('Documento recargado desde WordPress.', 'ok');
            })
            .catch(function (error) {
                setStatus('No se recargó: ' + error.message, 'error');
            });
    }

    function download(filename, mime, content) {
        var blob = new window.Blob([content], { type: mime });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () {
            window.URL.revokeObjectURL(url);
        }, 0);
    }

    function exportHtml() {
        behaviorApi.refresh();
        var exported = behaviorApi.buildExport();
        var markup = exported.html || '';
        var bodyMarkup = /^\s*<body[\s>]/i.test(markup) ? markup : '<body>\n' + markup + '\n</body>';
        var page =
            '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
            '<title>Open CoDesign Canvas</title>\n' +
            '<style>\n' + getSourceCss() + '\n' + exported.css + '\n</style>\n</head>\n' +
            bodyMarkup +
            '\n<script>\n' + exported.js + '\n<\/script>\n</html>\n';
        download('open-codesign-canvas.html', 'text/html;charset=utf-8', page);
        setStatus('HTML/CSS y comportamientos declarativos exportados.', 'ok');
    }

    function exportCss() {
        // El CSS real que se valida/guarda es serializedCss() (fuente +
        // reglas de Grupo Dinamico + overrides de GrapesJS), no solo la
        // fuente base -- exportar solo la fuente ocultaba por completo el
        // problema real de tamaño la primera vez que se diagnostico esto.
        var full = typeof serializedCss === 'function' ? serializedCss() : '';
        download(
            'open-codesign-canvas.css',
            'text/css;charset=utf-8',
            full || (getSourceCss() + '\n' + (behaviorApi.buildExport().css || ''))
        );
        setStatus('CSS exportado (' + Math.round((full || '').length / 1024) + ' KB, el mismo que se guarda).', 'ok');
    }

    /**
     * Separa `<style>` del HTML pegado para que la hoja de estilos no se pierda
     * en silencio al cargar el lienzo, y descarta `<script>` avisando.
     */
    function splitStyles(html) {
        var extracted = [];
        var withoutStyle = String(html).replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, function (_match, css) {
            extracted.push(css);
            return '';
        });
        var hadScript = /<script\b/i.test(withoutStyle);
        var clean = withoutStyle.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        return { html: clean, css: extracted.join('\n'), hadScript: hadScript };
    }

    function collectLocalAssetReferences(html, css) {
        var references = [];
        var source = String(html || '') + '\n' + String(css || '');
        var patterns = [
            /(?:src|poster)\s*=\s*(["'])(.*?)\1/gi,
            /url\(\s*(["']?)(.*?)\1\s*\)/gi
        ];
        patterns.forEach(function (pattern) {
            var match;
            while ((match = pattern.exec(source)) !== null) {
                var reference = match[2].trim();
                if (/^file:/i.test(reference) || /^(?:\.\/)?assets\//i.test(reference)) {
                    references.push(reference);
                }
            }
        });
        return Array.from(new Set(references));
    }

    function replaceAssetReferences(value, mapping) {
        var result = String(value || '');
        Object.keys(mapping || {})
            .sort(function (left, right) { return right.length - left.length; })
            .forEach(function (reference) {
                result = result.split(reference).join(mapping[reference]);
            });
        return result;
    }

    function resolveAssets(html, css) {
        var references = collectLocalAssetReferences(html, css);
        if (!references.length) {
            return Promise.resolve({ html: html, css: css, resolved: 0, missing: [] });
        }
        setStatus('Resolviendo ' + references.length + ' activos locales…');
        return request(config.resolveAssetsAction, { asset_refs: JSON.stringify(references) }).then(function (result) {
            return {
                html: replaceAssetReferences(html, result.mapping),
                css: replaceAssetReferences(css, result.mapping),
                resolved: Object.keys(result.mapping || {}).length,
                missing: result.missing || []
            };
        });
    }

    function applyImport() {
        var htmlInput = document.getElementById('ocd-canvas-import-html');
        var cssInput = document.getElementById('ocd-canvas-import-css');
        var split = splitStyles(htmlInput ? htmlInput.value : '');
        var css = [cssInput ? cssInput.value : '', split.css]
            .filter(function (part) {
                return part && part.trim() !== '';
            })
            .join('\n');

        return resolveAssets(split.html, css)
            .then(function (resolved) {
                editor.setComponents(resolved.html);
                editor.setStyle(resolved.css);
                setSourceCss(resolved.css);
                behaviorApi.refresh();
                window.requestAnimationFrame(refreshPresentation);

                var note = 'HTML y CSS cargados. ' + resolved.resolved + ' activos remotos resueltos.';
                if (resolved.missing.length) {
                    note += ' Faltan ' + resolved.missing.length + ' activos locales.';
                }
                if (split.hadScript) {
                    note += ' Se descartaron scripts no declarativos.';
                }
                return persist('auto').then(function (doc) {
                    setStatus(
                        note + ' Borrador autoguardado en la revisión ' + doc.revision + '.',
                        resolved.missing.length ? 'error' : 'ok'
                    );
                });
            })
            .catch(function (error) {
                setStatus('No se pudo completar la importación: ' + error.message, 'error');
            });
    }

    function updatePublishedPage(page) {
        var link = document.getElementById('ocd-canvas-view-page');
        var title = document.getElementById('ocd-canvas-page-title');
        if (title && page && page.title) title.value = page.title;
        if (!link) return;
        if (page && page.url) {
            link.href = page.url;
            link.removeAttribute('hidden');
        } else {
            link.setAttribute('hidden', 'hidden');
        }
    }

    var acfBlockIds = [];

    function clearAcfFieldBlocks() {
        acfBlockIds.forEach(function (id) {
            if (!editor.BlockManager || typeof editor.BlockManager.remove !== 'function') {
                return;
            }
            try {
                editor.BlockManager.remove(id);
            } catch (_error) {
                // Un bloque ya removido no debe impedir limpiar el resto.
            }
        });
        acfBlockIds = [];
    }

    function acfFieldBlockIcon(type) {
        if (type === 'image') {
            return '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-5 3 3 3-4 5 6"/></svg>';
        }
        if (type === 'wysiwyg') {
            return '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="13" y2="16"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="4" rx="1"/><rect x="3" y="14" width="18" height="4" rx="1"/></svg>';
    }

    function acfFieldBlockContent(name, type) {
        if (type === 'image') {
            return (
                '<img class="ocd-dynamic-placeholder ocd-dynamic-acf-image" ' +
                'data-ocd-dynamic="acf_image:' + name + '" src="' + acfImageSrc + '" alt="">'
            );
        }

        // Los campos WYSIWYG llevan el sufijo `:html` para que el resolver
        // preserve su HTML después de `wp_kses_post()`. El resto son texto plano
        // y se insertan como `<span>` para que convivan en flujos de texto.
        var htmlSuffix = type === 'wysiwyg' ? ':html' : '';
        var tag = type === 'wysiwyg' ? 'div' : 'span';
        return (
            '<' + tag + ' class="ocd-dynamic-placeholder ocd-dynamic-acf-field" ' +
            'data-ocd-dynamic="acf:' + name + htmlSuffix + '">{{acf:' + name + htmlSuffix + '}}</' + tag + '>'
        );
    }

    function renderAcfFieldBlocks(fields) {
        clearAcfFieldBlocks();
        var list = fields || [];
        // Única fuente de verdad de los campos ACF cargados, expuesta fuera de
        // este closure para que el control universal "Fuente de contenido" del
        // inspector (ocd-computed-inspector.js) los pueda leer. El evento cubre
        // el caso en que el inspector ya esté montado y escuchando antes de que
        // esta lista exista.
        window.OCDCanvasEditor = window.OCDCanvasEditor || {};
        window.OCDCanvasEditor.acfFields = list;
        document.dispatchEvent(new CustomEvent('ocd:acf-fields-loaded', { detail: { fields: list } }));
        if (!list.length) {
            return;
        }
        list.forEach(function (field) {
            var name = field && field.name ? String(field.name) : '';
            if (!name) {
                return;
            }
            var type = field && field.type ? String(field.type) : 'text';
            var label = field && field.label ? String(field.label) : name;
            var id = 'ocd-dynamic-acf-' + name;
            try {
                editor.BlockManager.add(id, {
                    label: label + ' (ACF)',
                    category: 'Open CoDesign — Dinámico',
                    media: acfFieldBlockIcon(type),
                    content: acfFieldBlockContent(name, type)
                });
                acfBlockIds.push(id);
            } catch (_error) {
                // Un campo con nombre no soportado no debe tumbar el panel.
            }
        });
    }

    function loadAcfFields(pageId) {
        var page = Number(pageId);
        if (!config.acfFieldsAction || !page || page <= 0) {
            clearAcfFieldBlocks();
            return;
        }
        request(config.acfFieldsAction, { page_id: String(page) })
            .then(function (data) {
                renderAcfFieldBlocks(data && data.fields ? data.fields : []);
            })
            .catch(function (_error) {
                // Sin conexión o sin ACF el editor sigue funcionando; sólo no
                // se ofrecen bloques de campos ACF. Pasa por renderAcfFieldBlocks
                // (en vez de sólo clearAcfFieldBlocks) para que la lista expuesta
                // en window.OCDCanvasEditor.acfFields también quede vacía y no
                // arrastre campos de una página anterior.
                renderAcfFieldBlocks([]);
            });
    }

    function publishPage() {
        if (!activeDocumentId) {
            setStatus('No hay un documento activo para publicar.', 'error');
            return Promise.resolve();
        }
        var title = document.getElementById('ocd-canvas-page-title');
        var button = document.getElementById('ocd-canvas-publish');
        var previewWindow = null;
        try {
            previewWindow = window.open('', 'ocd-canvas-published-page');
            if (previewWindow) {
                previewWindow.document.title = 'Publicando Open CoDesign Canvas…';
                previewWindow.document.body.textContent = 'Guardando y publicando la página…';
            }
        } catch (_error) {
            previewWindow = null;
        }

        if (button) button.disabled = true;
        setStatus('Guardando y publicando la página…');
        var payload = snapshot();
        payload.document_id = activeDocumentId;
        payload.title = title ? title.value : '';

        return request(config.publishAction, payload)
            .then(function (page) {
                current = Object.assign({}, current || {}, {
                    revision: page.revision,
                    updatedAt: page.updatedAt
                });
                updateMeta(current);
                updatePublishedPage(page);
                setStatus('Página publicada correctamente. Abriendo la vista pública…', 'ok');
                if (previewWindow && page.url) {
                    previewWindow.location.replace(page.url);
                }
                return page;
            })
            .catch(function (error) {
                if (previewWindow && !previewWindow.closed) previewWindow.close();
                setStatus('PUBLICACIÓN FALLIDA: ' + error.message, 'error');
                window.alert('No se pudo publicar la página:\n\n' + error.message);
            })
            .finally(function () {
                if (button) button.disabled = false;
            });
    }

    function readFileInto(fileInput, textarea) {
        if (!fileInput || !textarea) {
            return;
        }
        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) {
                return;
            }
            var reader = new window.FileReader();
            reader.onload = function () {
                textarea.value = String(reader.result || '');
                setStatus('Archivo «' + file.name + '» cargado en el formulario.', 'ok');
            };
            reader.onerror = function () {
                setStatus('No fue posible leer «' + file.name + '».', 'error');
            };
            reader.readAsText(file);
        });
    }

    function on(id, handler) {
        var node = document.getElementById(id);
        if (node) {
            node.addEventListener('click', handler);
        }
    }

    function activateSidePanel(name) {
        var workspace = document.querySelector('.ocd-canvas-workspace');
        var tabs = document.querySelectorAll('[data-ocd-side-panel]');
        if (!workspace || (name !== 'components' && name !== 'inspector')) return;
        workspace.setAttribute('data-ocd-active-panel', name);
        Array.prototype.forEach.call(tabs, function (tab) {
            var active = tab.getAttribute('data-ocd-side-panel') === name;
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.classList.toggle('button-primary', active);
        });
        try {
            window.localStorage.setItem('ocdCanvasSidePanel', name);
        } catch (_error) {
            // El editor sigue funcionando cuando el almacenamiento local está bloqueado.
        }
        window.setTimeout(function () {
            if (typeof editor.refresh === 'function') editor.refresh({ tools: true });
        }, 0);
    }

    function pageStatus(message, kind) {
        var node = document.getElementById('ocd-canvas-page-status');
        if (!node) {
            return;
        }
        node.textContent = message;
        node.className = 'ocd-canvas-status' + (kind ? ' is-' + kind : '');
    }

    function getSlotElement(kind) {
        return document.querySelector('[data-ocd-slot="' + kind + '"]');
    }

    function getSlotPreviewElement(kind) {
        return document.querySelector('[data-ocd-slot-preview="' + kind + '"]');
    }

    function getSlotCanvasElement(kind) {
        return document.querySelector('[data-ocd-slot-canvas="' + kind + '"]');
    }

    /**
     * Dibuja el contenido estático (no editable) de un espacio que no está
     * activo ahora mismo. Para header/footer, sin `doc` el espacio entero
     * se oculta — esta página no tiene esa región en Plantillas, nada que
     * mostrar ni que ofrecer editar ahí. El cuerpo nunca se oculta.
     */
    function renderSlotPreview(kind, doc) {
        var slot = getSlotElement(kind);
        var preview = getSlotPreviewElement(kind);
        if (!slot || !preview) {
            return;
        }
        if (kind !== 'body') {
            slot.hidden = !doc;
        }
        preview.innerHTML = '';
        preview.hidden = false;
        if (!doc) {
            return;
        }
        if (doc.css) {
            var style = document.createElement('style');
            style.textContent = doc.css;
            preview.appendChild(style);
        }
        var content = document.createElement('div');
        content.className = 'ocd-region-preview-content';
        content.innerHTML = doc.html || '';
        preview.appendChild(content);
    }

    /**
     * Resuelve y dibuja las previsualizaciones de Encabezado/Pie de página
     * de una página, sin tocar el cuerpo (que ya está cargado y activo).
     * Nunca bloquea nada: sin regiones asignadas, sus espacios quedan
     * ocultos y listo.
     */
    function refreshRegionPreviews(pageId) {
        return request(config.resolvePageAction, { page_id: String(pageId) })
            .then(function (data) {
                pageRegionDocs.header = (data.regions && data.regions.header) || null;
                pageRegionDocs.footer = (data.regions && data.regions.footer) || null;
                renderSlotPreview('header', pageRegionDocs.header);
                renderSlotPreview('footer', pageRegionDocs.footer);
            })
            .catch(function () {
                pageRegionDocs.header = null;
                pageRegionDocs.footer = null;
                renderSlotPreview('header', null);
                renderSlotPreview('footer', null);
            });
    }

    /**
     * Mueve el lienzo vivo (GrapesJS) al espacio `kind` y esconde su
     * previsualización estática — es el mismo contenido, ahora editable.
     */
    function moveShellInto(kind) {
        var shell = document.getElementById('ocd-canvas-editor-shell');
        var target = getSlotCanvasElement(kind);
        var preview = getSlotPreviewElement(kind);
        if (!shell || !target) {
            return;
        }
        if (shell.parentNode !== target) {
            target.appendChild(shell);
        }
        if (preview) {
            preview.hidden = true;
        }
        window.setTimeout(function () {
            if (typeof editor.refresh === 'function') editor.refresh();
        }, 0);
    }

    function hasUnsavedChanges() {
        return dirty || autosaveTimer !== null;
    }

    /**
     * Cambia cuál de los tres espacios (header/body/footer) es el lienzo
     * editable ahora mismo. Se dispara con un clic en la previsualización
     * del espacio al que se quiere entrar — no hay pestañas ni botón
     * "volver" separados, entrar a cualquier otro espacio ES la salida del
     * actual. Si el que se deja tiene cambios sin guardar, pregunta si
     * guardarlos (avisando si es una región compartida con otras páginas)
     * o descartarlos — nunca se guardan dos documentos juntos.
     */
    function enterSlot(kind) {
        if (kind === activeSlot || pageLoadInFlight) {
            return;
        }
        var targetId = kind === 'body' ? pageBodyDocumentId : ((pageRegionDocs[kind] || {}).documentId || '');
        if (!targetId) {
            return;
        }
        var leavingKind = activeSlot;
        var leavingIsShared = leavingKind !== 'body';

        function refreshLeavingPreview() {
            var leavingId = leavingKind === 'body' ? pageBodyDocumentId : ((pageRegionDocs[leavingKind] || {}).documentId || '');
            if (!leavingId) {
                return Promise.resolve();
            }
            return request(config.loadAction, { document_id: leavingId }).then(function (freshDoc) {
                if (leavingKind !== 'body') {
                    pageRegionDocs[leavingKind] = freshDoc;
                }
                renderSlotPreview(leavingKind, freshDoc);
            });
        }

        function proceed() {
            pageStatus('Cargando…');
            return request(config.loadAction, { document_id: targetId })
                .then(function (doc) {
                    activeDocumentId = targetId;
                    config.documentId = targetId;
                    moveShellInto(kind);
                    applyDocument(doc);
                    activeSlot = kind;
                    pageStatus(
                        kind === 'body'
                            ? 'Editando el cuerpo de la página.'
                            : 'Editando el ' + regionLabel(kind) + ' compartido — guardar acá afecta a todas las páginas que lo usan.',
                        'ok'
                    );
                })
                .catch(function (error) {
                    pageStatus('No se pudo cargar: ' + error.message, 'error');
                });
        }

        if (activeDocumentId && hasUnsavedChanges()) {
            var question = leavingIsShared
                ? 'Tenés cambios sin guardar en el ' + regionLabel(leavingKind) + ' compartido.\n\nGuardar afectará a TODAS las páginas que lo usan.\n\n¿Guardar los cambios? (Cancelar = descartarlos)'
                : 'Tenés cambios sin guardar en el cuerpo de esta página.\n\n¿Guardar los cambios? (Cancelar = descartarlos)';
            if (window.confirm(question)) {
                pageStatus('Guardando antes de cambiar…');
                return persist('manual').then(refreshLeavingPreview).then(proceed).catch(function (error) {
                    pageStatus('No se guardó: ' + error.message, 'error');
                });
            }
            dirty = false;
            window.clearTimeout(autosaveTimer);
            autosaveTimer = null;
            return refreshLeavingPreview().then(proceed);
        }

        return refreshLeavingPreview().then(proceed);
    }

    /**
     * Resuelve el contexto de una página (sus regiones) sin recargar el
     * cuerpo, que ya llegó cargado desde PHP. Es la vía que usa "Editar con
     * OCD" desde el listado de páginas.
     */
    function loadPageContext(pageIdOverride) {
        var pageId = Number(pageIdOverride);
        if (!pageId || pageId <= 0) {
            return;
        }
        pageBodyDocumentId = activeDocumentId;
        activeSlot = 'body';
        moveShellInto('body');
        pageStatus('Editando la página «' + config.pageTitle + '».', 'ok');
        refreshRegionPreviews(pageId);
    }

    /**
     * Carga el cuerpo propio de una página en el lienzo principal. Siempre
     * funciona, tenga o no regiones de Encabezado/Pie de página asignadas
     * en Plantillas — esa asignación es un dato de Plantillas, no un
     * requisito para poder abrir y editar el contenido de la página.
     */
    /**
     * "Versiones anteriores": el servidor ya crea automáticamente un
     * snapshot al abrir cada sesión de edición (y otro "antes de restaurar"
     * cada vez que se restaura uno), pero nunca existió una interfaz para
     * verlos ni usarlos — se armó recién ahora, en una emergencia real de
     * recuperación, reusando los endpoints AJAX ya construidos.
     */
    function closeSnapshotsPanel() {
        var existing = document.getElementById('ocd-snapshots-panel');
        if (existing) existing.remove();
        document.removeEventListener('keydown', onSnapshotsKeydown);
    }

    function onSnapshotsKeydown(event) {
        if (event.key === 'Escape') closeSnapshotsPanel();
    }

    function formatSnapshotDate(iso) {
        try {
            var date = new Date(iso);
            if (isNaN(date.getTime())) return iso || '';
            return date.toLocaleString();
        } catch (_error) {
            return iso || '';
        }
    }

    function restoreSnapshot(snapshotId, label) {
        if (!activeDocumentId) return;
        var ok = window.confirm(
            'Restaurar "' + (label || snapshotId) + '"?\n\n' +
            'El estado actual se guarda como una versión nueva antes de restaurar, no se pierde nada.'
        );
        if (!ok) return;
        pageStatus('Restaurando versión…');
        request(config.snapshotLoadAction, { document_id: activeDocumentId, snapshot_id: snapshotId })
            .then(function () {
                return request(config.loadAction, { document_id: activeDocumentId });
            })
            .then(function (doc) {
                applyDocument(doc);
                closeSnapshotsPanel();
                pageStatus('Versión restaurada.', 'ok');
            })
            .catch(function (error) {
                pageStatus('No se pudo restaurar: ' + error.message, 'error');
            });
    }

    function openSnapshotsPanel() {
        if (!activeDocumentId) {
            pageStatus('Cargá una página primero.', 'error');
            return;
        }
        closeSnapshotsPanel();
        var panel = document.createElement('div');
        panel.id = 'ocd-snapshots-panel';
        panel.style.cssText =
            'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(0,0,0,.45);';
        var box = document.createElement('div');
        box.style.cssText =
            'background:#1d2327;color:#f0f0f1;border-radius:8px;max-width:480px;width:90%;max-height:70vh;' +
            'overflow-y:auto;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.4);';
        var title = document.createElement('h2');
        title.textContent = 'Versiones anteriores de esta página';
        title.style.cssText = 'margin:0 0 12px;font-size:16px;';
        box.appendChild(title);
        var list = document.createElement('div');
        list.textContent = 'Cargando…';
        box.appendChild(list);
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'button';
        closeBtn.textContent = 'Cerrar';
        closeBtn.style.cssText = 'margin-top:14px;';
        closeBtn.addEventListener('click', closeSnapshotsPanel);
        box.appendChild(closeBtn);
        panel.appendChild(box);
        panel.addEventListener('click', function (event) {
            if (event.target === panel) closeSnapshotsPanel();
        });
        document.body.appendChild(panel);
        document.addEventListener('keydown', onSnapshotsKeydown);

        request(config.snapshotsListAction, { document_id: activeDocumentId })
            .then(function (result) {
                var snapshots = (result && result.snapshots) || [];
                list.textContent = '';
                if (!snapshots.length) {
                    list.textContent = 'Todavía no hay versiones guardadas para esta página.';
                    return;
                }
                snapshots.forEach(function (snap) {
                    var row = document.createElement('div');
                    row.style.cssText =
                        'display:flex;justify-content:space-between;align-items:center;gap:10px;' +
                        'padding:10px 0;border-bottom:1px solid #3c434a;';
                    var info = document.createElement('div');
                    var labelEl = document.createElement('div');
                    labelEl.textContent = snap.label || snap.session || snap.id;
                    labelEl.style.cssText = 'font-weight:600;';
                    var dateEl = document.createElement('div');
                    dateEl.textContent = formatSnapshotDate(snap.createdAt) + ' · revisión ' + snap.revision;
                    dateEl.style.cssText = 'font-size:12px;color:#a7aaad;';
                    info.appendChild(labelEl);
                    info.appendChild(dateEl);
                    var restoreBtn = document.createElement('button');
                    restoreBtn.type = 'button';
                    restoreBtn.className = 'button button-primary';
                    restoreBtn.textContent = 'Restaurar';
                    restoreBtn.addEventListener('click', function () {
                        restoreSnapshot(snap.id, snap.label || snap.session);
                    });
                    row.appendChild(info);
                    row.appendChild(restoreBtn);
                    list.appendChild(row);
                });
            })
            .catch(function (error) {
                list.textContent = 'No se pudieron cargar las versiones: ' + error.message;
            });
    }

    /**
     * Bug encontrado 2026-08-21: el snapshot de "entrada de sesión" (el que
     * hace que "Versiones anteriores" tenga algo para mostrar) solo se
     * disparaba desde ocd-inline-editor.js (edición en línea sobre la
     * página publicada) -- nunca desde esta pantalla (Editor de página),
     * que es la que realmente se usa. Por eso el panel siempre aparecía
     * vacío. Se llama una vez por documento cargado, sin bloquear nada si
     * falla (mismo criterio que ocd-inline-editor.js).
     */
    var ocdSessionId = null;
    function ocdSessionOpenId() {
        if (ocdSessionId) return ocdSessionId;
        var key = 'ocd-canvas-editor-session';
        try {
            var existing = window.sessionStorage.getItem(key);
            if (existing) {
                ocdSessionId = existing;
                return ocdSessionId;
            }
        } catch (_error) { /* sin sessionStorage, seguimos igual */ }
        ocdSessionId = 'sid-' + Date.now() + '-' + Math.floor(Math.random() * 1000000000);
        try { window.sessionStorage.setItem(key, ocdSessionId); } catch (_error) {}
        return ocdSessionId;
    }
    function openSessionForDocument(documentIdForSession) {
        if (!config.sessionOpenAction || !documentIdForSession) return;
        request(config.sessionOpenAction, {
            session_id: ocdSessionOpenId(),
            document_ids: JSON.stringify([documentIdForSession])
        }).catch(function () {
            // Sin snapshot de entrada el editor sigue funcionando igual;
            // solo "Versiones anteriores" quedaría sin esa entrada puntual.
        });
    }

    var pageCreateInFlight = false;

    /**
     * Botón "+ Nueva página": crea una página WordPress en borrador con su
     * documento Canvas ya vinculado, la agrega al selector sin recargar la
     * pantalla, y la carga de inmediato para que el usuario empiece a
     * construir. No pasa por el flujo normal de "Páginas" de WordPress
     * porque una página Canvas creada ahí queda vacía (solo el shortcode)
     * hasta vincularla a mano — acá se resuelve en un solo paso.
     */
    function createNewPage() {
        if (pageCreateInFlight) {
            return;
        }
        var title = window.prompt('Título de la nueva página:', '');
        if (title === null) {
            return;
        }
        pageCreateInFlight = true;
        pageStatus('Creando página nueva…');
        request(config.createPageAction, { title: title })
            .then(function (result) {
                var select = document.getElementById('ocd-page-target');
                if (select) {
                    var option = document.createElement('option');
                    option.value = String(result.pageId);
                    option.setAttribute('data-document-id', result.documentId);
                    option.textContent = (result.title || 'Página sin título') + ' — Canvas';
                    select.appendChild(option);
                    select.value = String(result.pageId);
                }
                pageStatus('Página creada.', 'ok');
                loadTargetPage(result.pageId);
            })
            .catch(function (error) {
                pageStatus('No se pudo crear la página: ' + error.message, 'error');
            })
            .finally(function () {
                pageCreateInFlight = false;
            });
    }

    function loadTargetPage(pageIdOverride) {
        if (pageLoadInFlight) {
            return;
        }
        var input = document.getElementById('ocd-page-target');
        var overrideId = Number(pageIdOverride);
        var pageId = overrideId > 0 ? overrideId : (input ? parseInt(input.value, 10) : 0);
        if (!pageId || pageId <= 0) {
            pageStatus('Elegí una página de la lista.', 'error');
            return;
        }

        var option = input ? input.querySelector('option[value="' + pageId + '"]') : null;
        var documentId = option ? (option.getAttribute('data-document-id') || '') : '';
        if (documentId === '') {
            pageStatus('Esta página no tiene un documento Canvas asociado.', 'error');
            return;
        }

        function proceedToLoad() {
            pageLoadInFlight = true;
            pageStatus('Cargando página ' + pageId + '…');
            loadAcfFields(pageId);
            pageBodyDocumentId = documentId;
            activeSlot = 'body';
            moveShellInto('body');
            return request(config.loadAction, { document_id: documentId })
                .then(function (doc) {
                    activeDocumentId = documentId;
                    config.documentId = documentId;
                    applyDocument(doc);
                    openSessionForDocument(documentId);
                    pageStatus('Página cargada.', 'ok');
                    refreshRegionPreviews(pageId);
                })
                .catch(function (error) {
                    clearAcfFieldBlocks();
                    pageStatus('No se pudo cargar la página: ' + error.message, 'error');
                })
                .finally(function () {
                    pageLoadInFlight = false;
                });
        }

        if (activeDocumentId && hasUnsavedChanges()) {
            pageStatus('Guardando el documento actual antes de cargar la página…');
            return persist('manual').then(proceedToLoad).catch(function (error) {
                pageStatus('No se cargó la página: ' + error.message, 'error');
            });
        }
        return proceedToLoad();
    }

    on('ocd-canvas-save', save);
    on('ocd-canvas-reload', function () {
        if (window.confirm('Recargar descarta los cambios no guardados del lienzo. ¿Continuar?')) {
            reload();
        }
    });
    on('ocd-canvas-export-html', exportHtml);
    on('ocd-canvas-export-css', exportCss);
    on('ocd-canvas-import-apply', applyImport);
    on('ocd-canvas-publish', publishPage);
    on('ocd-canvas-save-region', saveRegion);
    editor.on('update', function () {
        dirty = true;
        scheduleAutosave();
    });
    document.querySelectorAll('[data-ocd-side-panel]').forEach(function (tab) {
        tab.addEventListener('click', function () {
            activateSidePanel(tab.getAttribute('data-ocd-side-panel'));
        });
    });
    on('ocd-page-load', loadTargetPage);
    on('ocd-page-create', createNewPage);
    on('ocd-snapshots-open', openSnapshotsPanel);
    document.querySelectorAll('[data-ocd-slot-preview]').forEach(function (preview) {
        var kind = preview.getAttribute('data-ocd-slot-preview');
        preview.addEventListener('click', function () {
            enterSlot(kind);
        });
        preview.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                enterSlot(kind);
            }
        });
    });
    var pageTarget = document.getElementById('ocd-page-target');
    if (pageTarget) {
        pageTarget.addEventListener('change', function () {
            loadTargetPage();
        });
    }

    Array.prototype.forEach.call(
        document.querySelectorAll('[data-ocd-rule-type]'),
        function (select) {
            var listName = select.getAttribute('data-ocd-rule-type');
            select.addEventListener('change', function () {
                updateRulePicker(listName);
            });
        }
    );
    Array.prototype.forEach.call(
        document.querySelectorAll('[data-ocd-rule-add]'),
        function (button) {
            var listName = button.getAttribute('data-ocd-rule-add');
            button.addEventListener('click', function () {
                addRuleFromPicker(listName);
            });
        }
    );
    var regionScopeSelect = document.getElementById('ocd-region-scope');
    if (regionScopeSelect) {
        regionScopeSelect.addEventListener('change', function () {
            updateRuleFieldsetState();
            updateRegionReach();
        });
    }
    var advancedJsonArea = document.getElementById('ocd-region-json');
    if (advancedJsonArea) {
        advancedJsonArea.addEventListener('blur', onAdvancedJsonBlur);
    }

    on('ocd-canvas-toggle-import', function (event) {
        var panel = document.getElementById('ocd-canvas-import');
        if (!panel) {
            return;
        }
        var willShow = panel.hasAttribute('hidden');
        if (willShow) {
            panel.removeAttribute('hidden');
        } else {
            panel.setAttribute('hidden', 'hidden');
        }
        event.currentTarget.setAttribute('aria-expanded', willShow ? 'true' : 'false');
    });

    readFileInto(
        document.getElementById('ocd-canvas-import-html-file'),
        document.getElementById('ocd-canvas-import-html')
    );
    readFileInto(
        document.getElementById('ocd-canvas-import-css-file'),
        document.getElementById('ocd-canvas-import-css')
    );

    if (config.loadError) {
        setStatus('No fue posible abrir el documento: ' + config.loadError, 'error');
    } else if (current) {
        applyDocument(current);
        populateRegionFields(current);
        setStatus('Documento ' + activeDocumentId + ' listo (revisión ' + current.revision + ').');
    } else {
        setStatus('Elegí una página en «Página objetivo» y hacé clic en «Cargar página» para empezar a editar.');
    }
    updatePublishedPage(config.publishedPage || null);
    var pageTitleInput = document.getElementById('ocd-canvas-page-title');
    if (pageTitleInput && config.pageTitle) {
        pageTitleInput.value = config.pageTitle;
    }
    // Abrir siempre con los controles Open CoDesign visibles. La pestaña de
    // componentes conserva GrapesJS, pero no debe ocultar Brand por un estado antiguo.
    activateSidePanel('inspector');
    if (config.autoLoadPageId && config.autoLoadPageId > 0) {
        var autoTarget = document.getElementById('ocd-page-target');
        if (autoTarget) {
            autoTarget.value = String(config.autoLoadPageId);
        }
        loadPageContext(config.autoLoadPageId);
    }
    window.setTimeout(function () {
        autosaveEnabled = true;
    }, 0);
})(window, document);
