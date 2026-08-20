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
            inspectorMount: document.getElementById('ocd-canvas-inspector'),
            gridControlsMount: document.querySelector('#ocd-canvas-inspector .ocd-ci__head'),
            groupControlsMount: document.querySelector('#ocd-canvas-inspector .ocd-ci__head'),
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
    var snapshot = core.snapshot;
    var applyDocument = core.applyDocument;
    var request = core.request;
    var refreshPresentation = core.refreshPresentation;
    var getSourceCss = core.getSourceCss;
    var setSourceCss = core.setSourceCss;

    window.ocdCanvas = {
        editor: editor,
        blocks: core.blocks,
        inspector: core.inspector,
        grid: gridApi,
        gridControls: core.gridControls,
        groupControls: core.groupControls,
        behaviors: behaviorApi
    };

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
        download(
            'open-codesign-canvas.css',
            'text/css;charset=utf-8',
            getSourceCss() + '\n' + (behaviorApi.buildExport().css || '')
        );
        setStatus('CSS exportado.', 'ok');
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
        if (!fields || !fields.length) {
            return;
        }
        fields.forEach(function (field) {
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
                // se ofrecen bloques de campos ACF.
                clearAcfFieldBlocks();
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
        setStatus('Sin documento inicial; usa Recargar.', 'error');
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
