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
        updateMeta(doc);
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

    function save() {
        setStatus('Guardando…');
        behaviorApi.refresh();
        var payload = {
            project_data: JSON.stringify(editor.getProjectData()),
            html: editor.getHtml(),
            css: serializedCss()
        };
        return request(config.saveAction, payload)
            .then(function (doc) {
                current = doc;
                updateMeta(doc);
                setStatus('Guardado (revisión ' + doc.revision + ').', 'ok');
            })
            .catch(function (error) {
                setStatus('No se guardó: ' + error.message, 'error');
            });
    }

    function reload() {
        setStatus('Recargando…');
        return request(config.loadAction, {})
            .then(function (doc) {
                applyDocument(doc);
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

    function applyImport() {
        var htmlInput = document.getElementById('ocd-canvas-import-html');
        var cssInput = document.getElementById('ocd-canvas-import-css');
        var split = splitStyles(htmlInput ? htmlInput.value : '');
        var css = [cssInput ? cssInput.value : '', split.css]
            .filter(function (part) {
                return part && part.trim() !== '';
            })
            .join('\n');

        editor.setComponents(split.html);
        editor.setStyle(css);
        sourceCss = css;
        window.requestAnimationFrame(ensureSourceCss);

        var note = 'HTML y CSS cargados en el lienzo. Pulsa Guardar para persistirlos.';
        if (split.hadScript) {
            note += ' Se descartaron etiquetas <script>: el documento no admite JavaScript.';
        }
        if (split.css !== '') {
            note += ' Los bloques <style> se movieron al CSS.';
        }
        setStatus(note, 'ok');
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

    on('ocd-canvas-save', save);
    on('ocd-canvas-reload', function () {
        if (window.confirm('Recargar descarta los cambios no guardados del lienzo. ¿Continuar?')) {
            reload();
        }
    });
    on('ocd-canvas-export-html', exportHtml);
    on('ocd-canvas-export-css', exportCss);
    on('ocd-canvas-import-apply', applyImport);
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
        setStatus('Documento ' + config.documentId + ' listo (revisión ' + current.revision + ').');
    } else {
        setStatus('Sin documento inicial; usa Recargar.', 'error');
    }
})(window, document);
