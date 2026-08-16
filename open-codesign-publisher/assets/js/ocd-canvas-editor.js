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
    var activeSegment = null;
    var originalEditorShellParent = null;
    var pageLoadInFlight = false;

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

    function populateRegionFields(doc) {
        var kindField = document.getElementById('ocd-region-kind');
        var scopeField = document.getElementById('ocd-region-scope');
        var targetsField = document.getElementById('ocd-region-targets');
        var excludesField = document.getElementById('ocd-region-excludes');
        if (!doc || !kindField || !scopeField || !targetsField || !excludesField) {
            return;
        }
        kindField.value = doc.regionKind || '';
        scopeField.value = doc.regionScope || '';
        targetsField.value =
            doc.regionTargets && doc.regionTargets.length
                ? JSON.stringify(doc.regionTargets)
                : '';
        excludesField.value =
            doc.regionExcludes && doc.regionExcludes.length
                ? JSON.stringify(doc.regionExcludes)
                : '';
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
                if (activeSegment && pageRegionDocs[activeSegment]) {
                    pageRegionDocs[activeSegment] = doc;
                    setRegionPreview(activeSegment, doc);
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

    function getRegionPanel(kind) {
        return document.querySelector('[data-ocd-region-segment-panel="' + kind + '"]');
    }

    function setRegionPreview(kind, doc) {
        var panel = getRegionPanel(kind);
        var preview = panel ? panel.querySelector('[data-ocd-region-preview]') : null;
        if (!preview) {
            return;
        }
        preview.innerHTML = '';
        if (!doc) {
            var empty = document.createElement('p');
            empty.className = 'ocd-region-empty';
            empty.textContent = 'Sin ' + regionLabel(kind) + ' asignado.';
            preview.appendChild(empty);
            panel.classList.add('is-empty');
            return;
        }
        panel.classList.remove('is-empty');
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

    function updateRegionSegmentTabs() {
        var tabs = document.querySelectorAll('[data-ocd-region-segment]');
        Array.prototype.forEach.call(tabs, function (tab) {
            var kind = tab.getAttribute('data-ocd-region-segment');
            var doc = pageRegionDocs && pageRegionDocs[kind] ? pageRegionDocs[kind] : null;
            var active = kind === activeSegment && !!doc;
            tab.disabled = !doc;
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.classList.toggle('button-primary', active);
            tab.classList.toggle('is-disabled', !doc);
        });

        var panels = document.querySelectorAll('[data-ocd-region-segment-panel]');
        Array.prototype.forEach.call(panels, function (panel) {
            var kind = panel.getAttribute('data-ocd-region-segment-panel');
            var doc = pageRegionDocs && pageRegionDocs[kind] ? pageRegionDocs[kind] : null;
            panel.classList.toggle('is-active', kind === activeSegment && !!doc);
            panel.classList.toggle('is-empty', !doc);
        });

        var segmentRoot = document.querySelector('.ocd-region-segments');
        if (segmentRoot) {
            segmentRoot.setAttribute('data-ocd-active-segment', activeSegment || '');
        }
    }

    function moveEditorShellInto(kind) {
        var shell = document.querySelector('.ocd-canvas-editor-shell');
        var slot = document.querySelector('[data-ocd-region-canvas-slot="' + kind + '"]');
        if (!shell || !slot) {
            return;
        }
        if (!originalEditorShellParent) {
            originalEditorShellParent = shell.parentNode;
        }
        if (shell.parentNode !== slot) {
            slot.appendChild(shell);
        }
        window.setTimeout(function () {
            if (typeof editor.refresh === 'function') editor.refresh();
        }, 0);
    }

    function clearActiveSegment() {
        activeSegment = null;
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
        var shell = document.querySelector('.ocd-canvas-editor-shell');
        if (shell && originalEditorShellParent && shell.parentNode !== originalEditorShellParent) {
            originalEditorShellParent.appendChild(shell);
        }
        if (bodyDocument) {
            applyDocument(bodyDocument);
        } else {
            activeDocumentId = bodyDocumentId;
            config.documentId = bodyDocumentId;
            current = null;
            dirty = false;
            editor.setComponents('');
            editor.setStyle('');
            behaviorApi.refresh();
            gridApi.scan();
            updateMeta(null);
            window.requestAnimationFrame(function () {
                dirty = false;
            });
        }
        populateRegionFields(bodyDocument || {
            regionKind: '',
            regionScope: '',
            regionTargets: [],
            regionExcludes: []
        });
        updateRegionSegmentTabs();
        window.setTimeout(function () {
            if (typeof editor.refresh === 'function') editor.refresh();
        }, 0);
    }

    function setActiveRegionSegment(kind, doc) {
        if (!doc || !doc.documentId) {
            pageStatus('La región ' + regionLabel(kind) + ' no tiene un documento editable.', 'error');
            return;
        }
        activeSegment = kind;
        pageRegionDocs[kind] = doc;
        setRegionPreview(kind, doc);
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
        moveEditorShellInto(kind);
        updateRegionSegmentTabs();
        applyDocument(doc);
        populateRegionFields(doc);
        dirty = false;
        pageStatus(
            'Editando ' + regionLabel(kind) + ' de la página «' + (pageContext ? pageContext.pageTitle : '') + '».',
            'ok'
        );
    }

    function hasUnsavedChanges() {
        return dirty || autosaveTimer !== null;
    }

    function activateRegionSegment(kind) {
        var doc = pageRegionDocs && pageRegionDocs[kind] ? pageRegionDocs[kind] : null;
        if (!doc) {
            pageStatus('La región ' + regionLabel(kind) + ' no está asignada a esta página.', 'error');
            return;
        }
        if (kind === activeSegment) {
            function returnToBody() {
                clearActiveSegment();
                pageStatus('Volviendo al documento Canvas del cuerpo.', 'ok');
            }
            if (hasUnsavedChanges()) {
                pageStatus('Guardando ' + regionLabel(kind) + ' antes de volver…');
                return persist('manual').then(function (savedDoc) {
                    if (savedDoc && savedDoc.documentId) {
                        pageRegionDocs[kind] = savedDoc;
                        setRegionPreview(kind, savedDoc);
                    }
                    returnToBody();
                }).catch(function (error) {
                    pageStatus('No se volvió al documento: ' + error.message, 'error');
                });
            }
            returnToBody();
            return;
        }

        var previousKind = activeSegment;
        if (previousKind && current) {
            pageRegionDocs[previousKind] = current;
            setRegionPreview(previousKind, current);
        }

        function proceed() {
            setActiveRegionSegment(kind, doc);
        }

        if (hasUnsavedChanges()) {
            pageStatus('Guardando el documento actual antes de cambiar…');
            return persist('manual').then(function (savedDoc) {
                if (previousKind && savedDoc && savedDoc.documentId) {
                    pageRegionDocs[previousKind] = savedDoc;
                    setRegionPreview(previousKind, savedDoc);
                }
                proceed();
            }).catch(function (error) {
                pageStatus('No se cambió de segmento: ' + error.message, 'error');
            });
        }
        proceed();
    }

    function setPageContext(data) {
        pageContext = data;
        pageRegionDocs = {
            header: data.regions && data.regions.header ? data.regions.header : null,
            footer: data.regions && data.regions.footer ? data.regions.footer : null
        };
        setRegionPreview('header', pageRegionDocs.header);
        setRegionPreview('footer', pageRegionDocs.footer);
        updateRegionSegmentTabs();
    }

    /**
     * Carga el contexto de una página (sus regiones resueltas) sin robar el
     * foco al documento del cuerpo. Es la vía que usa "Editar con OCD": el
     * documento activo sigue siendo el documento Canvas de la página, por lo
     * que Guardar y Publicar operan sobre esa página, no sobre una región.
     */
    function loadPageContext(pageIdOverride) {
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

        pageLoadInFlight = true;
        pageStatus('Resolviendo página ' + pageId + '…');
        return request(config.resolvePageAction, { page_id: String(pageId) })
            .then(function (data) {
                setPageContext(data);
                loadAcfFields(pageId);
                pageStatus(
                    'Editando el documento Canvas de «' + data.pageTitle +
                        '». Usá Encabezado/Pie de página para editar regiones.',
                    'ok'
                );
            })
            .catch(function (error) {
                clearAcfFieldBlocks();
                pageStatus('No se pudo cargar la página: ' + error.message, 'error');
            })
            .finally(function () {
                pageLoadInFlight = false;
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

        pageLoadInFlight = true;
        pageStatus('Resolviendo página ' + pageId + '…');
        return request(config.resolvePageAction, { page_id: String(pageId) })
            .then(function (data) {
                setPageContext(data);
                loadAcfFields(pageId);

                var preferredKind = null;
                if (pageRegionDocs.header) {
                    preferredKind = 'header';
                } else if (pageRegionDocs.footer) {
                    preferredKind = 'footer';
                }

                function clearWithoutRegion() {
                    clearActiveSegment();
                    pageStatus(
                        'Esta página no tiene regiones de Encabezado ni Pie de página asignadas.',
                        'error'
                    );
                }

                if (!preferredKind) {
                    if (activeDocumentId && hasUnsavedChanges()) {
                        pageStatus('Guardando el documento actual antes de descartar el segmento activo…');
                        return persist('manual').then(clearWithoutRegion).catch(function (error) {
                            pageStatus('No se cargó la página: ' + error.message, 'error');
                        });
                    }
                    clearWithoutRegion();
                    return;
                }

                function proceedToRegion() {
                    setActiveRegionSegment(preferredKind, pageRegionDocs[preferredKind]);
                }

                if (activeDocumentId && hasUnsavedChanges()) {
                    pageStatus('Guardando el documento actual antes de cargar la página…');
                    return persist('manual').then(proceedToRegion).catch(function (error) {
                        pageStatus('No se cargó la página: ' + error.message, 'error');
                    });
                }
                proceedToRegion();
            })
            .catch(function (error) {
                clearAcfFieldBlocks();
                pageStatus('No se pudo cargar la página: ' + error.message, 'error');
            })
            .finally(function () {
                pageLoadInFlight = false;
            });
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
    document.querySelectorAll('[data-ocd-region-segment]').forEach(function (tab) {
        tab.addEventListener('click', function () {
            activateRegionSegment(tab.getAttribute('data-ocd-region-segment'));
        });
    });
    var pageTarget = document.getElementById('ocd-page-target');
    if (pageTarget) {
        pageTarget.addEventListener('change', function () {
            loadTargetPage();
        });
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
