/**
 * Open CoDesign Canvas — editor en línea sobre la página publicada (M2).
 *
 * Consume el núcleo compartido de `ocd-editor-core.js` (window.OCDEditorCore)
 * para montar UN lienzo compuesto con los tres documentos (Encabezado, Cuerpo
 * y Pie de página) tal como los ensambla el render público. En este corte es
 * SOLO LECTURA: no hay botón de guardar y el "Salir" es un enlace normal que
 * el PHP ya deja apuntando al permalink sin argumentos.
 *
 * ES5 (IIFE + `var`), sin eval/new Function/setTimeout-con-cadena.
 */
(function (window, document) {
    'use strict';

    var config = window.ocdInlineEditor;
    var statusNode = document.getElementById('ocd-inline-status');
    var regionNode = document.getElementById('ocd-inline-region');
    var templatesLink = document.getElementById('ocd-inline-templates');

    function setStatus(message, kind) {
        if (!statusNode) {
            return;
        }
        statusNode.textContent = message;
        statusNode.className = 'ocd-inline-status' + (kind ? ' is-' + kind : '');
    }

    if (!config) {
        setStatus('Falta la configuración del editor en línea.', 'error');
        return;
    }
    if (!window.OCDEditorCore || typeof window.OCDEditorCore.create !== 'function') {
        setStatus('No se pudo cargar el editor Canvas desde los archivos locales del plugin.', 'error');
        return;
    }

    var core = window.OCDEditorCore.create({
        container: '#ocd-inline-canvas-root',
        status: setStatus,
        blocks: [],
        ajaxUrl: config.ajaxUrl,
        nonce: config.nonce
    });

    if (!core) {
        setStatus('No se pudo iniciar el editor Canvas.', 'error');
        return;
    }

    var editor = core.editor;
    var behaviorApi = core.behaviors;
    var gridApi = core.grid;
    var refreshPresentation = core.refreshPresentation;

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

    function componentAttributes(component) {
        if (!component) {
            return {};
        }
        if (typeof component.getAttributes === 'function') {
            return component.getAttributes() || {};
        }
        if (component.get && typeof component.get === 'function') {
            return component.get('attributes') || {};
        }
        return {};
    }

    /**
     * Componentes de un documento-región para insertar dentro de su wrapper.
     * Devuelve un arreglo de componentes (ruta projectData) o una cadena HTML
     * (fallback desde `html`); ambos los acepta GrapesJS como `components`.
     */
    function regionComponents(doc) {
        if (!doc) {
            return '';
        }
        var project = parseJson(doc.projectData);
        if (project && Array.isArray(project.pages) && project.pages.length) {
            var page = project.pages[0];
            var frame = page && Array.isArray(page.frames) && page.frames.length ? page.frames[0] : null;
            var component = frame && frame.component ? frame.component : page.component;
            if (component && Array.isArray(component.components)) {
                return component.components;
            }
            if (typeof component === 'string' && component.trim() !== '') {
                return component;
            }
        }
        return typeof doc.html === 'string' ? doc.html : '';
    }

    function regionProjectStyles(doc) {
        if (!doc) {
            return [];
        }
        var project = parseJson(doc.projectData);
        if (project && Array.isArray(project.styles)) {
            return project.styles;
        }
        return [];
    }

    /**
     * HTML plano (cadena) de un documento-región, para el fallback. Es
     * independiente del camino primario: nunca usa el markup estructurado de
     * projectData, para no concatenar arreglos de objetos por accidente.
     */
    function regionFlatHtml(doc) {
        if (!doc) {
            return '';
        }
        return typeof doc.html === 'string' ? doc.html : '';
    }

    function buildComposite() {
        var bodyDoc = config.bodyDocument || {};
        var headerDoc = config.regions && config.regions.header ? config.regions.header : null;
        var footerDoc = config.regions && config.regions.footer ? config.regions.footer : null;

        var parts = [
            { kind: 'header', doc: headerDoc, label: 'Encabezado' },
            { kind: 'body', doc: bodyDoc, label: 'Cuerpo' },
            { kind: 'footer', doc: footerDoc, label: 'Pie de página' }
        ];

        var wrappers = [];
        var htmlParts = [];
        var cssParts = [];
        var mergedStyles = [];

        parts.forEach(function (part) {
            mergedStyles = mergedStyles.concat(regionProjectStyles(part.doc));
            var css = part.doc && typeof part.doc.css === 'string' ? part.doc.css : '';
            if (css && css.trim() !== '') {
                cssParts.push(css);
            }
            // Las regiones no resueltas (header/footer sin asignar) se omiten.
            if (!part.doc) {
                return;
            }
            var markup = regionComponents(part.doc);
            wrappers.push({
                tagName: 'div',
                attributes: {
                    'data-ocd-inline-region': part.kind,
                    'data-ocd-region-label': part.label
                },
                components: markup
            });
            // El HTML del fallback usa SIEMPRE el html plano del documento
            // (cadena), nunca `markup` (que puede ser un arreglo estructurado).
            htmlParts.push(
                '<div data-ocd-inline-region="' + part.kind + '" data-ocd-region-label="' + part.label + '">' +
                regionFlatHtml(part.doc) +
                '</div>'
            );
        });

        // Mismo orden que el render público: header.css + body.css + footer.css.
        var cssCombinado = cssParts.join('\n');
        var htmlCombinado = htmlParts.join('');

        var composite = {
            assets: [],
            styles: mergedStyles,
            pages: [{ component: wrappers, styles: [] }]
        };

        var loaded = false;
        try {
            editor.loadProjectData(composite);
            editor.setStyle(cssCombinado);
            loaded = true;
        } catch (error) {
            // Los datos estructurados compuestos no se pudieron cargar; se
            // reconstruye el lienzo desde el HTML/CSS planos de cada documento.
            loaded = false;
        }

        if (!loaded) {
            try {
                editor.setComponents(htmlCombinado);
                editor.setStyle(cssCombinado);
            } catch (fallbackError) {
                setStatus('No se pudo montar el lienzo compuesto: ' + fallbackError.message, 'error');
                return;
            }
        }

        if (behaviorApi && typeof behaviorApi.refresh === 'function') {
            behaviorApi.refresh();
        }
        if (behaviorApi && typeof behaviorApi.installCanvasRuntime === 'function') {
            behaviorApi.installCanvasRuntime();
        }
        if (gridApi && typeof gridApi.scan === 'function') {
            gridApi.scan();
        }
        if (typeof refreshPresentation === 'function') {
            refreshPresentation();
        }

        setStatus('Página «' + (config.pageTitle || '') + '» en modo edición (solo lectura).', 'ok');
    }

    /**
     * Sube desde el componente seleccionado hasta el primer ancestro con
     * `data-ocd-inline-region` y devuelve su valor ('header'|'body'|'footer').
     */
    function findRegion(component) {
        var node = component;
        while (node) {
            var attributes = componentAttributes(node);
            if (attributes && attributes['data-ocd-inline-region']) {
                return attributes['data-ocd-inline-region'];
            }
            if (typeof node.parent === 'function') {
                node = node.parent();
            } else {
                break;
            }
        }
        return null;
    }

    function reachFor(kind) {
        var doc = config.regions && config.regions[kind] ? config.regions[kind] : null;
        if (!doc) {
            return 'esta página y otras según sus reglas';
        }
        var reach = doc.reach;
        return reach && String(reach).trim() !== '' ? reach : 'esta página y otras según sus reglas';
    }

    function updateActiveRegion() {
        var selected = editor.getSelected();
        var kind = findRegion(selected);

        if (!kind) {
            if (regionNode) {
                regionNode.textContent = '—';
                regionNode.setAttribute('data-ocd-region-kind', '');
            }
            if (templatesLink) {
                templatesLink.hidden = true;
            }
            return;
        }

        if (regionNode) {
            if (kind === 'body') {
                regionNode.textContent = 'Cuerpo — esta página';
            } else if (kind === 'header') {
                regionNode.textContent = 'Encabezado — ítem del tema · se aplica a: ' + reachFor('header');
            } else if (kind === 'footer') {
                regionNode.textContent = 'Pie de página — ítem del tema · se aplica a: ' + reachFor('footer');
            } else {
                regionNode.textContent = kind;
            }
            regionNode.setAttribute('data-ocd-region-kind', kind);
        }

        if (templatesLink) {
            templatesLink.hidden = kind === 'body';
        }
    }

    editor.on('component:selected', updateActiveRegion);
    editor.on('component:deselected', updateActiveRegion);

    buildComposite();
})(window, document);
