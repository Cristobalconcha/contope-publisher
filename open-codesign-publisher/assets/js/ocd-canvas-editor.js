/**
 * Open CoDesign Canvas — editor experimental.
 *
 * Slice vertical aislado: inicializa GrapesJS local (sin CDN), importa HTML+CSS,
 * y persiste projectData, HTML y CSS por separado mediante admin-ajax con nonce.
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

    if (
        !window.grapesjs ||
        typeof window.grapesjs.init !== 'function' ||
        !window.OCDComputedInspector ||
        !window.OCDCanvasGrid ||
        !window.OCDGridControls ||
        !window.OcdBehaviors
    ) {
        setStatus('No se pudo cargar el editor Canvas completo desde los archivos locales del plugin.', 'error');
        return;
    }

    var BLOCKS = [
        {
            id: 'ocd-section',
            label: 'Sección',
            category: 'Open CoDesign',
            content:
                '<section class="ocd-section" style="padding:48px 24px">' +
                '<h2>Título de sección</h2>' +
                '<p>Texto editable de la sección.</p>' +
                '</section>'
        },
        {
            id: 'ocd-columns',
            label: 'Dos columnas',
            category: 'Open CoDesign',
            content:
                '<div class="ocd-columns" style="display:flex;flex-wrap:wrap;gap:24px;padding:24px">' +
                '<div class="ocd-column" style="flex:1 1 280px"><p>Columna izquierda.</p></div>' +
                '<div class="ocd-column" style="flex:1 1 280px"><p>Columna derecha.</p></div>' +
                '</div>'
        },
        {
            id: 'ocd-heading',
            label: 'Título',
            category: 'Open CoDesign',
            content: '<h2 class="ocd-heading">Título editable</h2>'
        },
        {
            id: 'ocd-paragraph',
            label: 'Párrafo',
            category: 'Open CoDesign',
            content: '<p class="ocd-paragraph">Párrafo editable.</p>'
        },
        {
            id: 'ocd-image',
            label: 'Imagen',
            category: 'Open CoDesign',
            select: true,
            content: { type: 'image' }
        },
        {
            id: 'ocd-button',
            label: 'Botón',
            category: 'Open CoDesign',
            content:
                '<a class="ocd-button" href="#" style="display:inline-block;padding:12px 24px;border-radius:4px;' +
                'background:#1d2327;color:#fff;text-decoration:none">Acción</a>'
        }
    ];

    var editor = window.grapesjs.init({
        container: '#ocd-canvas-editor-root',
        height: '100%',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        noticeOnUnload: false,
        assetManager: { upload: false, custom: false },
        blockManager: { blocks: BLOCKS }
    });
    editor.Components.addType('ocd-video', {
        isComponent: function (element) {
            return element && element.tagName === 'VIDEO';
        },
        model: {
            defaults: {
                tagName: 'video',
                droppable: false
            }
        }
    });
    var CSS_OVERRIDES_MARKER = '/* OCD-CANVAS-EDITABLE-OVERRIDES */';
    var sourceCss = '';
    var gridApi = window.OCDCanvasGrid.plugin(editor);
    var behaviorApi = window.OcdBehaviors.grapesjsPlugin(editor, { threshold: 40 });
    var inspector = window.OCDComputedInspector.create(editor, {
        mount: document.getElementById('ocd-canvas-inspector')
    });
    var gridControls = window.OCDGridControls.create(editor, gridApi, {
        mount: document.querySelector('#ocd-canvas-inspector .ocd-ci__head')
    });

    window.ocdCanvas = {
        editor: editor,
        inspector: inspector,
        grid: gridApi,
        gridControls: gridControls,
        behaviors: behaviorApi
    };

    /** Estado del documento tal como lo devolvió el servidor por última vez. */
    var current = config.document || null;
    var activeDocumentId = config.documentId || null;
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

    function parseJson(value) {
        if (typeof value !== 'string' || value === '') {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

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

    function applyFlatDocument(doc) {
        var css = splitStoredCss(doc && doc.css);
        sourceCss = css.source;
        editor.setComponents((doc && doc.html) || '');
        editor.setStyle([sourceCss, css.overrides].filter(Boolean).join('\n'));
        window.requestAnimationFrame(ensureSourceCss);
    }

    function applyDocument(doc) {
        var css = splitStoredCss(doc && doc.css);
        sourceCss = css.source;
        var project = parseJson(doc && doc.projectData);
        var hasPages = project && Array.isArray(project.pages) && project.pages.length > 0;
        if (hasPages) {
            try {
                editor.loadProjectData(project);
            } catch (error) {
                // Los datos estructurados no son utilizables: el HTML y el CSS
                // guardados siguen siendo una reconstrucción válida.
                applyFlatDocument(doc);
                setStatus(
                    'Los datos estructurados no se pudieron cargar (' +
                        error.message +
                        '); se reconstruyó el lienzo desde el HTML y el CSS guardados.',
                    'error'
                );
            }
        } else {
            applyFlatDocument(doc);
        }
        behaviorApi.refresh();
        gridApi.scan();
        window.requestAnimationFrame(function () {
            ensureSourceCss();
            var selected = editor.getSelected();
            if (!selected) {
                var children = editor.getWrapper().components();
                selected = children && children.length ? children.at(0) : null;
                if (selected) {
                    editor.select(selected);
                }
            }
            inspector.refresh(selected);
            gridControls.refresh(selected);
            behaviorApi.installCanvasRuntime();
        });
        current = doc;
        if (doc && doc.documentId) {
            activeDocumentId = doc.documentId;
            config.documentId = doc.documentId;
        }
        updateMeta(doc);
        window.requestAnimationFrame(function () {
            dirty = false;
        });
    }

    function request(action, params) {
        var body = new window.URLSearchParams();
        body.set('action', action);
        body.set('nonce', config.nonce);
        Object.keys(params || {}).forEach(function (key) {
            body.set(key, params[key]);
        });

        return window
            .fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString()
            })
            .then(function (response) {
                return response.text().then(function (text) {
                    var payload = parseJson(text);
                    if (!payload || payload.success !== true) {
                        var message =
                            (payload && payload.data && payload.data.message) ||
                            'El servidor rechazó la petición (HTTP ' + response.status + ').';
                        throw new Error(message);
                    }
                    return payload.data;
                });
            });
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

    function snapshot() {
        behaviorApi.refresh();
        return {
            project_data: JSON.stringify(editor.getProjectData()),
            html: serializedHtml(),
            css: serializedCss()
        };
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
            '<style>\n' + sourceCss + '\n' + exported.css + '\n</style>\n</head>\n' +
            bodyMarkup +
            '\n<script>\n' + exported.js + '\n<\/script>\n</html>\n';
        download('open-codesign-canvas.html', 'text/html;charset=utf-8', page);
        setStatus('HTML/CSS y comportamientos declarativos exportados.', 'ok');
    }

    function splitStoredCss(value) {
        var css = String(value || '');
        var marker = css.indexOf(CSS_OVERRIDES_MARKER);
        return {
            source: marker === -1 ? css : css.slice(0, marker).trimEnd(),
            overrides: marker === -1 ? '' : css.slice(marker + CSS_OVERRIDES_MARKER.length).trim()
        };
    }

    function serializedCss() {
        return sourceCss.trimEnd() + '\n\n' + CSS_OVERRIDES_MARKER + '\n' + (editor.getCss() || '');
    }

    function serializedHtml() {
        var html = editor.getHtml() || '';
        var parsed = new window.DOMParser().parseFromString(html, 'text/html');
        parsed.body.querySelectorAll('base, meta, link, title').forEach(function (node) {
            node.remove();
        });
        parsed.body.querySelectorAll('video[autoplay]').forEach(function (video) {
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
        });
        return parsed.body ? parsed.body.innerHTML : html;
    }

    function ensureSourceCss() {
        var canvasDocument = editor.Canvas.getDocument();
        if (!canvasDocument || !canvasDocument.head) {
            return;
        }
        var style = canvasDocument.head.querySelector('style[data-ocd-source-css]');
        if (!style) {
            style = canvasDocument.createElement('style');
            style.setAttribute('data-ocd-source-css', 'preserved');
            canvasDocument.head.prepend(style);
        }
        style.textContent = sourceCss;
    }

    function refreshPresentation() {
        ensureSourceCss();
        var selected = editor.getSelected();
        inspector.refresh(selected);
        gridControls.refresh(selected);
        behaviorApi.installCanvasRuntime();
    }

    editor.on('canvas:frame:load', function () {
        window.requestAnimationFrame(refreshPresentation);
    });
    editor.on('project:load', function () {
        window.requestAnimationFrame(refreshPresentation);
    });
    editor.on('load', function () {
        window.requestAnimationFrame(refreshPresentation);
    });

    function exportCss() {
        download(
            'open-codesign-canvas.css',
            'text/css;charset=utf-8',
            sourceCss + '\n' + (behaviorApi.buildExport().css || '')
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
                sourceCss = resolved.css;
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
        activeDocumentId = null;
        config.documentId = null;
        current = null;
        dirty = false;
        window.clearTimeout(autosaveTimer);
        autosaveTimer = null;
        updateMeta(null);
        populateRegionFields({
            regionKind: '',
            regionScope: '',
            regionTargets: [],
            regionExcludes: []
        });
        var shell = document.querySelector('.ocd-canvas-editor-shell');
        if (shell && originalEditorShellParent && shell.parentNode !== originalEditorShellParent) {
            originalEditorShellParent.appendChild(shell);
        }
        updateRegionSegmentTabs();
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

        if (previousKind && hasUnsavedChanges()) {
            pageStatus('Guardando ' + regionLabel(previousKind) + ' antes de cambiar…');
            return persist('manual').then(function (savedDoc) {
                if (savedDoc && savedDoc.documentId) {
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

    function loadTargetPage() {
        if (pageLoadInFlight) {
            return;
        }
        var input = document.getElementById('ocd-page-target');
        var pageId = input ? parseInt(input.value, 10) : 0;
        if (!pageId || pageId <= 0) {
            pageStatus('Ingresá un ID de página válido.', 'error');
            return;
        }

        pageLoadInFlight = true;
        pageStatus('Resolviendo página ' + pageId + '…');
        return request(config.resolvePageAction, { page_id: String(pageId) })
            .then(function (data) {
                pageContext = data;
                pageRegionDocs = {
                    header: data.regions && data.regions.header ? data.regions.header : null,
                    footer: data.regions && data.regions.footer ? data.regions.footer : null
                };

                setRegionPreview('header', pageRegionDocs.header);
                setRegionPreview('footer', pageRegionDocs.footer);
                updateRegionSegmentTabs();

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
        pageTarget.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadTargetPage();
            }
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
    // Abrir siempre con los controles Open CoDesign visibles. La pestaña de
    // componentes conserva GrapesJS, pero no debe ocultar Brand por un estado antiguo.
    activateSidePanel('inspector');
    window.setTimeout(function () {
        autosaveEnabled = true;
    }, 0);
})(window, document);
