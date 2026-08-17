/**
 * Open CoDesign Canvas — editor en línea sobre la página publicada (M3).
 *
 * Consume el núcleo compartido de `ocd-editor-core.js` (window.OCDEditorCore)
 * para montar UN lienzo compuesto con los tres documentos (Encabezado, Cuerpo
 * y Pie de página) tal como los ensambla el render público. A partir de M3 el
 * editor deja de ser solo lectura:
 *
 *   - Abre una sesión (sessionStorage) y crea snapshots de entrada por doc.
 *   - Lleva suciedad (dirty) POR REGIÓN y guarda únicamente la región activa,
 *     haciendo el "split-back" del lienzo compuesto a los documentos de origen.
 *   - Bloquea la edición de contenido dinámico (tokens `{{…}}` / ACF).
 *
 * ES5 (IIFE + `var`), sin eval/new Function/setTimeout-con-cadena.
 *
 * La parte pura del split-back se expone en `window.OCDInlineSplit` para que
 * `scripts/check-inline-split.mjs` la ejercite sin WordPress (GrapesJS local +
 * este mismo IIFE), y no depende de OCDEditorCore.
 */
(function (window, document) {
    'use strict';

    // ---------------------------------------------------------------------
    // Módulo puro y testeable: arma el compuesto y vuelve a separar (split)
    // el estado del lienzo en documentos por región. No usa OCDEditorCore:
    // sólo necesita una instancia de GrapesJS y la configuración del editor.
    // ---------------------------------------------------------------------
    var CSS_OVERRIDES_MARKER = '/* OCD-CANVAS-EDITABLE-OVERRIDES */';
    var REGION_ORDER = ['header', 'body', 'footer'];

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

    function regionFlatHtml(doc) {
        if (!doc) {
            return '';
        }
        return typeof doc.html === 'string' ? doc.html : '';
    }

    /** Assets (imágenes) originales del projectData de un documento. */
    function regionAssets(doc) {
        if (!doc) {
            return [];
        }
        var project = parseJson(doc.projectData);
        if (project && Array.isArray(project.assets)) {
            return project.assets;
        }
        return [];
    }

    /** Espejo local de `splitStoredCss` del core, para no depender de él. */
    function splitStoredCss(value) {
        var css = String(value || '');
        var markerIndex = css.indexOf(CSS_OVERRIDES_MARKER);
        return {
            source: markerIndex === -1 ? css : css.slice(0, markerIndex).trimEnd(),
            overrides: markerIndex === -1 ? '' : css.slice(markerIndex + CSS_OVERRIDES_MARKER.length).trim(),
            hadMarker: markerIndex !== -1
        };
    }

    /**
     * Firma estable de un estilo de proyecto, robusta a las dos formas de
     * `selectors` (arreglo de nombres o arreglo de `{name,type}`). Se usa para
     * saber de qué documento vino cada estilo sin depender de la normalización
     * exacta de GrapesJS.
     */
    function styleSignature(style) {
        if (!style) {
            return '';
        }
        var rawSelectors = Array.isArray(style.selectors) ? style.selectors : [];
        var names = rawSelectors.map(function (selector) {
            if (typeof selector === 'string') {
                return selector;
            }
            return selector && selector.name ? String(selector.name) : '';
        }).filter(function (name) {
            return name !== '';
        }).sort();
        var declarations = [];
        Object.keys(style.style || {}).sort().forEach(function (prop) {
            declarations.push(prop + ':' + style.style[prop]);
        });
        return names.join(',') + '|' + declarations.join(';') + '|' + (style.state || '') + '|' + (style.mediaText || '');
    }

    function docForKind(config, kind) {
        if (!config) {
            return null;
        }
        if (kind === 'body') {
            return config.bodyDocument || null;
        }
        return config.regions && config.regions[kind] ? config.regions[kind] : null;
    }

    function findWrapperModel(editor, kind) {
        if (!editor || !editor.getWrapper) {
            return null;
        }
        var top = editor.getWrapper().components();
        var models = top && top.models ? top.models : [];
        for (var i = 0; i < models.length; i++) {
            var attributes = componentAttributes(models[i]);
            if (attributes && attributes['data-ocd-inline-region'] === kind) {
                return models[i];
            }
        }
        return null;
    }

    /**
     * Best-effort: ¿algún componente dentro de `component` matchea el selector?
     * `selector.type` sigue los constantes de GrapesJS (1 clase, 2 id, 3 tag).
     */
    function componentTreeMatches(component, selector) {
        if (!component || !selector || !selector.name) {
            return false;
        }
        var name = selector.name;
        var type = selector.type;
        if (type === 2) {
            if (typeof component.getId === 'function' && component.getId() === name) {
                return true;
            }
        } else if (type === 3) {
            if (component.get && component.get('tagName') === name) {
                return true;
            }
        } else {
            var classes = typeof component.getClasses === 'function' ? component.getClasses() : [];
            if (classes.indexOf(name) !== -1) {
                return true;
            }
        }
        var children = component.components ? component.components().models : [];
        for (var i = 0; i < children.length; i++) {
            if (componentTreeMatches(children[i], selector)) {
                return true;
            }
        }
        return false;
    }

    function styleMatchesWrapper(editor, kind, style) {
        var selectors = style && style.selectors;
        if (!Array.isArray(selectors) || !selectors.length) {
            return false;
        }
        var wrapper = findWrapperModel(editor, kind);
        if (!wrapper) {
            return false;
        }
        for (var i = 0; i < selectors.length; i++) {
            var selector = selectors[i];
            var name = typeof selector === 'string' ? selector : (selector && selector.name ? selector.name : '');
            var type = typeof selector === 'string' ? 1 : (selector && selector.type ? selector.type : 1);
            if (name && componentTreeMatches(wrapper, { name: name, type: type })) {
                return true;
            }
        }
        return false;
    }

    /**
     * Atribuye un estilo nuevo (no presente en ningún documento original) a una
     * región por selector. Header/footer primero; si no es determinable o solo
     * matchea el cuerpo, cae en 'body'.
     */
    function attributeNewStyle(editor, built, style) {
        var kinds = ['header', 'footer'];
        for (var i = 0; i < kinds.length; i++) {
            if (built.wrapperByKind[kinds[i]] && styleMatchesWrapper(editor, kinds[i], style)) {
                return kinds[i];
            }
        }
        return 'body';
    }

    /**
     * Serialización best-effort de un estilo de proyecto a CSS. Solo se usa
     * para no perder en silencio un cambio de estilos hecho en el compuesto;
     * las ediciones de texto no generan estilos y no pasan por acá.
     */
    function styleEntryToCss(entry) {
        if (!entry || !entry.style) {
            return '';
        }
        var selectors = (Array.isArray(entry.selectors) ? entry.selectors : []).map(function (selector) {
            var name = typeof selector === 'string' ? selector : (selector && selector.name ? selector.name : '');
            var type = typeof selector === 'string' ? 1 : (selector && selector.type ? selector.type : 1);
            if (!name) {
                return '';
            }
            if (type === 2) {
                return name.charAt(0) === '#' ? name : '#' + name;
            }
            if (type === 3) {
                return name;
            }
            if (name.charAt(0) === '.' || name.charAt(0) === '#') {
                return name;
            }
            return '.' + name;
        }).filter(function (selector) {
            return selector !== '';
        });
        if (!selectors.length) {
            return '';
        }
        var declarations = [];
        Object.keys(entry.style).forEach(function (prop) {
            declarations.push(prop + ':' + entry.style[prop] + ';');
        });
        if (!declarations.length) {
            return '';
        }
        var state = entry.state || '';
        var body = selectors.map(function (selector) {
            return state ? selector + ':' + state : selector;
        }).join(', ') + '{' + declarations.join('') + '}';
        return entry.mediaText ? '@media ' + entry.mediaText + '{' + body + '}' : body;
    }

    function topLevelWrapperJson(current) {
        var pages = current && Array.isArray(current.pages) ? current.pages : [];
        var page = pages[0];
        if (!page) {
            return [];
        }
        var frames = Array.isArray(page.frames) ? page.frames : [];
        var frame = frames[0];
        var component = (frame && frame.component) ? frame.component : page.component;
        if (component && Array.isArray(component.components)) {
            return component.components;
        }
        return [];
    }

    /**
     * Arma el compuesto (3 wrappers top-level con `data-ocd-inline-region`) y
     * devuelve los metadatos que el split-back necesita para reatribuir estilos
     * y CSS. No inyecta el CSS fuente: eso lo hace el entry mediante
     * `setSourceCss` del core (espejando la ruta estructurada del admin).
     */
    function buildComposite(editor, config) {
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
        var sourceParts = [];
        var mergedStyles = [];
        var mergedAssets = [];
        var cssByDoc = {};
        var labels = {};
        var wrapperByKind = {};

        // Origen de estilos por documento, con copias independientes. Un estilo
        // byte-idéntico compartido por dos docs debe quedar COPIADO en ambos: no
        // se indexa con un mapa de un solo valor (que haría que el último doc
        // pise al anterior). `allOriginalSignatures` solo marca qué firmas
        // existían en el combinado, para detectar estilos "nuevos".
        var originalStylesByKind = { header: [], body: [], footer: [] };
        var allOriginalSignatures = {};
        var mergedSignatures = {};

        // Assets originales por documento. El lienzo los deduplica por `src`;
        // el split devuelve a cada doc SU arreglo original.
        var assetsByKind = { header: [], body: [], footer: [] };
        var mergedAssetKeys = {};

        parts.forEach(function (part) {
            labels[part.kind] = part.label;
            var doc = part.doc || null;
            var split = splitStoredCss(doc && typeof doc.css === 'string' ? doc.css : '');
            cssByDoc[part.kind] = split;
            if (split.source && split.source.trim() !== '') {
                sourceParts.push(split.source);
            }

            var styles = regionProjectStyles(doc);
            originalStylesByKind[part.kind] = styles.slice();
            styles.forEach(function (style) {
                var signature = styleSignature(style);
                allOriginalSignatures[signature] = true;
                // Dedupe SOLO para el lienzo: GrapesJS no necesita el mismo
                // estilo dos veces; los originales por doc quedan intactos.
                if (!mergedSignatures[signature]) {
                    mergedSignatures[signature] = true;
                    mergedStyles.push(style);
                }
            });

            var assets = regionAssets(doc);
            assetsByKind[part.kind] = assets.slice();
            assets.forEach(function (asset) {
                var key = asset && asset.src ? String(asset.src) : (asset ? JSON.stringify(asset) : '');
                if (key !== '' && !mergedAssetKeys[key]) {
                    mergedAssetKeys[key] = true;
                    mergedAssets.push(asset);
                }
            });

            // Las regiones no resueltas (header/footer sin asignar) se omiten.
            if (!doc) {
                return;
            }
            wrapperByKind[part.kind] = true;
            var markup = regionComponents(doc);
            wrappers.push({
                tagName: 'div',
                attributes: {
                    'data-ocd-inline-region': part.kind,
                    'data-ocd-region-label': part.label
                },
                components: markup
            });
            htmlParts.push(
                '<div data-ocd-inline-region="' + part.kind + '" data-ocd-region-label="' + part.label + '">' +
                regionFlatHtml(doc) +
                '</div>'
            );
        });

        var htmlCombinado = htmlParts.join('');

        var composite = {
            assets: mergedAssets,
            styles: mergedStyles,
            pages: [{ component: wrappers, styles: [] }]
        };

        var loaded = false;
        try {
            editor.loadProjectData(composite);
            loaded = true;
        } catch (error) {
            loaded = false;
        }

        if (!loaded) {
            try {
                editor.setComponents(htmlCombinado);
            } catch (fallbackError) {
                return { ok: false, built: null, error: fallbackError };
            }
        }

        return {
            ok: true,
            built: {
                parts: parts,
                wrapperByKind: wrapperByKind,
                cssByDoc: cssByDoc,
                sourceCssCombinado: sourceParts.join('\n'),
                originalStylesByKind: originalStylesByKind,
                allOriginalSignatures: allOriginalSignatures,
                assetsByKind: assetsByKind,
                labels: labels
            },
            composite: composite
        };
    }

    /**
     * Split-back: devuelve el contenido del documento `kind` reconstruido desde
     * el estado actual del compuesto, sin tocar el lienzo.
     *
     * `current.pages[0].frames[0].component.components` son los wrappers (la
     * forma real de `getProjectData()`); el contenido de cada región son sus
     * `components`. El HTML se toma de los MODELOS vivos (`toHTML()`), que es
     * la representación que ya aplica ediciones y comportamientos.
     */
    function computeSplit(editor, config, built, kind) {
        var doc = docForKind(config, kind);
        var current = editor.getProjectData();

        var childJson = [];
        var wrappersJson = topLevelWrapperJson(current);
        for (var i = 0; i < wrappersJson.length; i++) {
            var attributes = wrappersJson[i] && wrappersJson[i].attributes ? wrappersJson[i].attributes : {};
            if (attributes['data-ocd-inline-region'] === kind) {
                childJson = Array.isArray(wrappersJson[i].components) ? wrappersJson[i].components : [];
                break;
            }
        }

        var html = '';
        var wrapperModel = findWrapperModel(editor, kind);
        if (wrapperModel) {
            html = wrapperModel.components().models.map(function (component) {
                return component.toHTML();
            }).join('');
        } else if (doc && typeof doc.html === 'string') {
            html = doc.html;
        }

        var currentStyles = Array.isArray(current.styles) ? current.styles : [];
        var currentSignatures = {};
        currentStyles.forEach(function (style) {
            currentSignatures[styleSignature(style)] = true;
        });

        var stylesK = [];
        var newCss = '';

        // 1) Estilos ORIGINALES de este documento que siguen presentes en el
        //    lienzo. Cada doc conserva su propia copia: un estilo compartido
        //    byte-idéntico por header y body queda en AMBOS (no se descarta por
        //    colisión de firma). Si el usuario lo borró del lienzo, la firma
        //    ya no está y el estilo se elimina del doc.
        (built.originalStylesByKind[kind] || []).forEach(function (style) {
            if (currentSignatures[styleSignature(style)]) {
                stylesK.push(style);
            }
        });

        // 2) Estilos NUEVOS (firma no presente en ningún original). Se atribuyen
        //    a UNA sola región por selector (header/footer primero; fallback
        //    body), para no duplicarlos.
        currentStyles.forEach(function (style) {
            var signature = styleSignature(style);
            if (built.allOriginalSignatures[signature]) {
                return;
            }
            if (attributeNewStyle(editor, built, style) === kind) {
                stylesK.push(style);
                var serialized = styleEntryToCss(style);
                if (serialized) {
                    newCss += serialized + '\n';
                }
            }
        });

        var stored = built.cssByDoc[kind] || { source: '', overrides: '', hadMarker: false };
        var css = stored.source.trimEnd();
        if (stored.hadMarker) {
            css += '\n\n' + CSS_OVERRIDES_MARKER + '\n';
        }
        css += stored.overrides;
        if (newCss !== '') {
            css += (css !== '' && css.charAt(css.length - 1) !== '\n' ? '\n' : '') + newCss;
        }

        // Assets: cada doc recupera SU arreglo original. Los assets nuevos son
        // imposibles hoy porque el Asset Manager está deshabilitado en el core
        // (`assetManager: { upload: false, custom: false }`).
        var projectData = JSON.stringify({
            assets: built.assetsByKind[kind] || [],
            pages: [{ frames: [{ component: { type: 'wrapper', components: childJson } }] }],
            styles: stylesK
        });

        return {
            kind: kind,
            documentId: doc ? doc.documentId : null,
            label: built.labels[kind] || kind,
            reach: doc ? (doc.reach || '') : '',
            projectData: projectData,
            html: html,
            css: css,
            revision: doc ? doc.revision : 0
        };
    }

    window.OCDInlineSplit = {
        build: buildComposite,
        split: computeSplit,
        marker: CSS_OVERRIDES_MARKER,
        REGION_ORDER: REGION_ORDER
    };

    // ---------------------------------------------------------------------
    // Entry del editor en línea.
    // ---------------------------------------------------------------------
    var config = window.ocdInlineEditor;
    var statusNode = document.getElementById('ocd-inline-status');
    var regionNode = document.getElementById('ocd-inline-region');
    var saveButton = document.getElementById('ocd-inline-save');
    var templatesLink = document.getElementById('ocd-inline-templates');
    var historyButton = document.getElementById('ocd-inline-history');

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
        nonce: config.nonce,
        siteFontCss: config.siteFontCss || '',
        themeDefinitionsCss: config.themeDefinitionsCss || ''
    });

    if (!core) {
        setStatus('No se pudo iniciar el editor Canvas.', 'error');
        return;
    }

    var editor = core.editor;
    var behaviorApi = core.behaviors;
    var gridApi = core.grid;
    var refreshPresentation = core.refreshPresentation;
    var setSourceCss = core.setSourceCss;
    var request = core.request;

    var dirty = { header: false, body: false, footer: false };
    var lastActiveRegion = null;
    var saving = false;
    var saveCount = 0;
    var built = null;
    var sessionId = null;
    var sessionWarning = false;

    function regionLabel(kind) {
        if (kind === 'header') {
            return 'Encabezado';
        }
        if (kind === 'footer') {
            return 'Pie de página';
        }
        return 'Cuerpo';
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

    function activeRegionKind() {
        var selected = editor.getSelected();
        var kind = findRegion(selected);
        return kind || lastActiveRegion || 'body';
    }

    /**
     * ¿Hay una región activa real? (selección dentro de una región o la última
     * región usada). Sin esto no se debe marcar suciedad ni forzar 'body'.
     */
    function hasActiveRegion() {
        var selected = editor.getSelected();
        return !!(findRegion(selected) || lastActiveRegion);
    }

    function reachFor(kind) {
        var doc = docForKind(config, kind);
        if (!doc) {
            return 'esta página y otras según sus reglas';
        }
        var reach = doc.reach;
        return reach && String(reach).trim() !== '' ? reach : 'esta página y otras según sus reglas';
    }

    /**
     * ¿El cuerpo que se está editando es una región de tema `body` (no el
     * documento propio de la página)? Cuando lo es, guardar afecta a todas las
     * páginas de su alcance, igual que header/footer.
     */
    function bodyIsRegion() {
        // La decisión real la toma el servidor (región body resuelta con html
        // no vacío) y viaja explícita en la config.
        return config.bodyIsRegion === true;
    }

    function updateDirtyUi() {
        if (!hasActiveRegion()) {
            // Todavía no hay región activa (badge en "—"): nada que marcar.
            if (regionNode) {
                regionNode.classList.remove('is-dirty');
            }
            if (saveButton) {
                saveButton.disabled = true;
            }
            return;
        }
        var kind = activeRegionKind();
        if (regionNode) {
            if (dirty[kind]) {
                regionNode.classList.add('is-dirty');
            } else {
                regionNode.classList.remove('is-dirty');
            }
        }
        if (saveButton) {
            saveButton.disabled = !dirty[kind] || saving;
        }
    }

    /**
     * Marca la región activa como sucia y refresca botón + badge. Es la MISMA
     * ruta que usan `update`, `component:update` y el listener de input del
     * canvas: sin región activa no hace nada (evita caer en 'body').
     */
    function markDirty() {
        if (!hasActiveRegion()) {
            return;
        }
        var kind = activeRegionKind();
        dirty[kind] = true;
        updateDirtyUi();
        setStatus('Cambios sin guardar en ' + regionLabel(kind) + '.', 'warn');
    }

    // Feedback de cambios EN VIVO mientras se teclea en el RTE. GrapesJS sólo
    // dispara `update`/`component:update` cuando el RTE sincroniza al modelo
    // (blur/click-out), así que escuchamos `input` directamente en el documento
    // del iframe, con un throttle por timestamp (sin timers).
    var lastInputAt = 0;
    var canvasInputDocument = null;
    var INPUT_THROTTLE_MS = 250;

    function onCanvasInput() {
        var now = Date.now();
        if (now - lastInputAt < INPUT_THROTTLE_MS) {
            return;
        }
        lastInputAt = now;
        markDirty();
    }

    function attachCanvasInputListener() {
        var canvasDocument = null;
        try {
            canvasDocument = editor.Canvas.getDocument();
        } catch (error) {
            canvasDocument = null;
        }
        if (!canvasDocument || canvasDocument === canvasInputDocument) {
            return;
        }
        // Si el iframe se recreó, quita el listener viejo antes de sumar el
        // nuevo: guarda la referencia y evita listeners duplicados.
        if (canvasInputDocument && typeof canvasInputDocument.removeEventListener === 'function') {
            canvasInputDocument.removeEventListener('input', onCanvasInput, true);
        }
        canvasInputDocument = canvasDocument;
        if (typeof canvasDocument.addEventListener === 'function') {
            canvasDocument.addEventListener('input', onCanvasInput, true);
        }
    }

    function isDynamicComponent(component) {
        if (!component) {
            return false;
        }
        var attributes = componentAttributes(component);
        if (attributes && attributes['data-ocd-dynamic']) {
            return true;
        }
        var element = component.getEl ? component.getEl() : null;
        var text = element && element.textContent ? element.textContent : '';
        return text.indexOf('{{') !== -1;
    }

    function updateActiveRegion() {
        var selected = editor.getSelected();
        var kind = findRegion(selected);
        if (!kind) {
            // Sin selección: se mantiene visible la última región activa, para
            // que el badge y su marca de suciedad sigan siendo coherentes.
            kind = lastActiveRegion;
        }

        if (!kind) {
            // Todavía no hay ninguna región: badge neutro y sin punto sucio.
            if (regionNode) {
                regionNode.textContent = '\u2014';
                regionNode.setAttribute('data-ocd-region-kind', '');
                regionNode.classList.remove('is-dirty');
            }
            if (templatesLink) {
                templatesLink.hidden = true;
            }
            if (saveButton) {
                saveButton.disabled = true;
            }
            return;
        }

        lastActiveRegion = kind;

        if (regionNode) {
            if (kind === 'body') {
                regionNode.textContent = bodyIsRegion()
                    ? 'Cuerpo \u2014 ítem del tema · se aplica a: ' + reachFor('body')
                    : 'Cuerpo \u2014 esta página';
            } else if (kind === 'header') {
                regionNode.textContent = 'Encabezado \u2014 ítem del tema · se aplica a: ' + reachFor('header');
            } else if (kind === 'footer') {
                regionNode.textContent = 'Pie de página \u2014 ítem del tema · se aplica a: ' + reachFor('footer');
            } else {
                regionNode.textContent = kind;
            }
            regionNode.setAttribute('data-ocd-region-kind', kind);
        }

        if (templatesLink) {
            templatesLink.hidden = kind === 'body' && !bodyIsRegion();
        }

        if (isDynamicComponent(selected)) {
            setStatus('Contenido dinámico \u2014 se edita en su campo de origen.', 'warn');
        }

        updateDirtyUi();
    }

    function walkComponents(component, visit) {
        if (!component) {
            return;
        }
        visit(component);
        var children = component.components ? component.components().models : [];
        for (var i = 0; i < children.length; i++) {
            walkComponents(children[i], visit);
        }
    }

    function lockDynamicComponents() {
        var top = editor.getWrapper().components().models;
        top.forEach(function (wrapper) {
            walkComponents(wrapper, function (component) {
                if (!isDynamicComponent(component)) {
                    return;
                }
                try {
                    component.set('editable', false);
                } catch (error) {
                    // Un componente que no admite `editable` no debe tumbar el armado.
                }
            });
        });
    }

    function hasAnyDirty() {
        return dirty.header || dirty.body || dirty.footer;
    }

    function hhmm() {
        var date = new Date();
        function pad(number) {
            return number < 10 ? '0' + number : String(number);
        }
        return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function sessionStorageKey() {
        return 'ocd-inline-session-' + (config.pageId || 'page');
    }

    function loadOrCreateSession() {
        var key = sessionStorageKey();
        var existing = null;
        try {
            existing = window.sessionStorage.getItem(key);
        } catch (error) {
            existing = null;
        }
        if (existing) {
            return existing;
        }
        var generated = 'sid-' + Date.now() + '-' + Math.floor(Math.random() * 1000000000);
        try {
            window.sessionStorage.setItem(key, generated);
        } catch (error) {
            // Sin almacenamiento de sesión el editor sigue funcionando.
        }
        return generated;
    }

    function documentIdsForSession() {
        var ids = [];
        ['body', 'header', 'footer'].forEach(function (kind) {
            var doc = docForKind(config, kind);
            if (doc && doc.documentId) {
                ids.push(doc.documentId);
            }
        });
        return ids;
    }

    function saveActiveRegion() {
        if (saving) {
            return;
        }
        var kind = activeRegionKind();
        var doc = docForKind(config, kind);
        if (!doc || !doc.documentId) {
            setStatus('No hay un documento ' + regionLabel(kind) + ' para guardar.', 'error');
            return;
        }

        if (kind === 'header' || kind === 'footer' || (kind === 'body' && bodyIsRegion())) {
            var reach = doc.reach || 'esta página y otras según sus reglas';
            if (!window.confirm(
                'Vas a guardar el ' + regionLabel(kind) +
                ' \u2014 ítem del tema · se aplica a: ' + reach +
                '. El cambio se publica de inmediato en todas esas páginas. ¿Continuar?'
            )) {
                return;
            }
        }

        if (!built) {
            setStatus('El lienzo compuesto todavía no está listo.', 'error');
            return;
        }

        saving = true;
        updateDirtyUi();
        if (saveButton) {
            saveButton.classList.add('is-saving');
        }
        setStatus('Guardando ' + regionLabel(kind) + '…');

        var split = window.OCDInlineSplit.split(editor, config, built, kind);
        saveCount += 1;

        request(config.saveAction, {
            document_id: split.documentId,
            project_data: split.projectData,
            html: split.html,
            css: split.css,
            snapshot_session: sessionId,
            snapshot_label: 'antes del guardado ' + saveCount + ' \u2014 ' + hhmm()
        })
            .then(function (savedDoc) {
                dirty[kind] = false;
                saving = false;
                if (saveButton) {
                    saveButton.classList.remove('is-saving');
                }
                updateDirtyUi();

                // Refresca la caché local del documento con la respuesta.
                if (kind === 'body') {
                    config.bodyDocument = savedDoc;
                } else if (config.regions && config.regions[kind]) {
                    config.regions[kind] = savedDoc;
                }

                setStatus(
                    'Guardado (revisión ' + savedDoc.revision + ') \u2014 se aplica a: ' +
                    (kind === 'body' && !bodyIsRegion() ? 'esta página' : reachFor(kind)),
                    'ok'
                );
            })
            .catch(function (error) {
                saving = false;
                if (saveButton) {
                    saveButton.classList.remove('is-saving');
                }
                updateDirtyUi();
                setStatus('No se pudo guardar ' + regionLabel(kind) + ': ' + error.message, 'error');
            });
    }

    // ---------------------------------------------------------------------
    // Historial de snapshots del documento activo (M5.2). Un modal simple
    // (sin librerías) lista los snapshots del segmento activo y permite
    // restaurar uno: el servidor congela primero el estado actual y después
    // recarga la página para reflejar el estado restaurado.
    // ---------------------------------------------------------------------
    var historyOverlay = null;
    var historyList = null;
    var historyMessage = null;
    var restoring = false;

    function snapshotLabel(entry) {
        var label = entry && entry.label ? String(entry.label) : '';
        if (label === 'session-open') {
            return 'Apertura de sesión';
        }
        return label === '' ? 'guardado' : label;
    }

    function snapshotOrigin(entry) {
        return (entry && entry.label === 'session-open') ? 'Sesión' : 'Guardado';
    }

    function snapshotDateLabel(entry) {
        var createdAt = entry && entry.createdAt;
        if (!createdAt) {
            return '';
        }
        var date = new Date(createdAt);
        if (isNaN(date.getTime())) {
            return String(createdAt);
        }
        return date.toLocaleString();
    }

    /**
     * Documento del segmento activo, según el split real del lienzo
     * (`computeSplit` → `split.documentId`), con fallback a la config cuando
     * el compuesto todavía no está armado.
     */
    function activeSegmentDocumentId() {
        var kind = activeRegionKind();
        if (built) {
            try {
                var split = window.OCDInlineSplit.split(editor, config, built, kind);
                if (split && split.documentId) {
                    return split.documentId;
                }
            } catch (error) {
                // Sin split utilizable se cae al documento resuelto por config.
            }
        }
        var doc = docForKind(config, kind);
        return doc && doc.documentId ? doc.documentId : null;
    }

    function setHistoryMessage(message, kind) {
        if (!historyMessage) {
            return;
        }
        historyMessage.textContent = message;
        historyMessage.className = 'ocd-inline-history-message' + (kind ? ' is-' + kind : '');
    }

    function clearHistoryList() {
        while (historyList && historyList.firstChild) {
            historyList.removeChild(historyList.firstChild);
        }
    }

    function historyEmptyNode(message) {
        var node = document.createElement('li');
        node.className = 'ocd-inline-history-empty';
        node.textContent = message;
        return node;
    }

    function disableHistoryItems(disabled) {
        if (!historyList) {
            return;
        }
        var buttons = historyList.querySelectorAll('.ocd-inline-history-restore');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].disabled = disabled;
        }
    }

    function closeHistory() {
        if (historyOverlay) {
            historyOverlay.hidden = true;
        }
        if (!restoring) {
            setHistoryMessage('', '');
            clearHistoryList();
        }
        var history_button = document.getElementById('ocd-inline-history');
        if (history_button) {
            history_button.focus();
        }
    }

    function buildHistoryOverlay() {
        if (historyOverlay) {
            return;
        }

        historyOverlay = document.createElement('div');
        historyOverlay.className = 'ocd-inline-history-overlay';
        historyOverlay.hidden = true;
        historyOverlay.setAttribute('role', 'dialog');
        historyOverlay.setAttribute('aria-modal', 'true');
        historyOverlay.setAttribute('aria-label', 'Historial de snapshots');

        var card = document.createElement('div');
        card.className = 'ocd-inline-history-card';

        var header = document.createElement('div');
        header.className = 'ocd-inline-history-header';

        var title = document.createElement('h2');
        title.className = 'ocd-inline-history-title';
        title.textContent = 'Historial';

        var closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'ocd-inline-history-close';
        closeButton.setAttribute('aria-label', 'Cerrar historial');
        closeButton.textContent = '\u00d7';
        closeButton.addEventListener('click', closeHistory);

        header.appendChild(title);
        header.appendChild(closeButton);

        historyMessage = document.createElement('div');
        historyMessage.className = 'ocd-inline-history-message';
        historyMessage.setAttribute('role', 'status');
        historyMessage.setAttribute('aria-live', 'polite');

        historyList = document.createElement('ul');
        historyList.className = 'ocd-inline-history-list';

        card.appendChild(header);
        card.appendChild(historyMessage);
        card.appendChild(historyList);
        historyOverlay.appendChild(card);
        document.body.appendChild(historyOverlay);

        historyOverlay.addEventListener('click', function (event) {
            if (event.target === historyOverlay) {
                closeHistory();
            }
        });
        document.addEventListener('keydown', function (event) {
            if ((event.key === 'Escape' || event.keyCode === 27) && historyOverlay && !historyOverlay.hidden) {
                closeHistory();
            }
        });
    }

    function historyItem(entry) {
        var item = document.createElement('li');
        item.className = 'ocd-inline-history-item';

        var meta = document.createElement('div');
        meta.className = 'ocd-inline-history-meta';

        var origin = document.createElement('span');
        origin.className = 'ocd-inline-history-origin';
        origin.textContent = snapshotOrigin(entry);

        var label = document.createElement('span');
        label.className = 'ocd-inline-history-label';
        label.textContent = snapshotLabel(entry);

        var date = document.createElement('span');
        date.className = 'ocd-inline-history-date';
        date.textContent = snapshotDateLabel(entry);

        meta.appendChild(origin);
        meta.appendChild(label);
        meta.appendChild(date);

        var restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'ocd-inline-history-restore';
        restoreButton.textContent = 'Restaurar';
        restoreButton.disabled = restoring;
        restoreButton.addEventListener('click', function () {
            restoreSnapshot(entry);
        });

        item.appendChild(meta);
        item.appendChild(restoreButton);
        return item;
    }

    function renderHistoryList(data) {
        var snapshots = data && Array.isArray(data.snapshots) ? data.snapshots : [];
        clearHistoryList();
        setHistoryMessage('', '');

        if (!snapshots.length) {
            historyList.appendChild(historyEmptyNode(
                'Todavía no hay snapshots de este documento. Se crean al abrir sesión y al guardar desde el editor en línea.'
            ));
            return;
        }

        snapshots.forEach(function (entry) {
            historyList.appendChild(historyItem(entry));
        });
    }

    function restoreSnapshot(entry) {
        if (restoring) {
            return;
        }
        var documentId = activeSegmentDocumentId();
        if (!documentId || !entry || !entry.id) {
            setHistoryMessage('No se pudo restaurar: falta el documento o el snapshot.', 'error');
            return;
        }

        if (typeof hasAnyDirty === 'function' && hasAnyDirty()) {
            var dirty_ok = window.confirm(
                'Hay cambios sin guardar en el lienzo que se perderán al restaurar. ¿Continuar?'
            );
            if (!dirty_ok) {
                return;
            }
        }

        var confirmed = window.confirm(
            'Se restaurará el documento al estado del snapshot \u00ab' + snapshotLabel(entry) +
            '\u00bb. El estado persistido se guarda en el historial antes de restaurar.'
        );
        if (!confirmed) {
            return;
        }

        restoring = true;
        setHistoryMessage('Restaurando\u2026', 'loading');
        disableHistoryItems(true);

        request(config.snapshotLoadAction, {
            document_id: documentId,
            snapshot_id: entry.id
        })
            .then(function () {
                // Si el usuario cancela el beforeunload, el modal no queda
                // atascado: se rehabilita antes de la recarga.
                restoring = false;
                setHistoryMessage('Restaurado. Recargando\u2026', 'loading');
                window.location.reload();
            })
            .catch(function (error) {
                restoring = false;
                disableHistoryItems(false);
                setHistoryMessage('No se pudo restaurar: ' + error.message, 'error');
            });
    }

    function openHistory() {
        buildHistoryOverlay();
        historyOverlay.hidden = false;
        var close_button = historyOverlay.querySelector('.ocd-inline-history-close');
        if (close_button) {
            close_button.focus();
        }
        setHistoryMessage('Cargando historial\u2026', 'loading');
        clearHistoryList();

        var documentId = activeSegmentDocumentId();
        if (!documentId) {
            setHistoryMessage('No se pudo determinar el documento del segmento activo.', 'error');
            historyList.appendChild(historyEmptyNode('No hay un documento activo para listar su historial.'));
            return;
        }

        request(config.snapshotsListAction, { document_id: documentId })
            .then(renderHistoryList)
            .catch(function (error) {
                setHistoryMessage('No se pudo cargar el historial: ' + error.message, 'error');
                historyList.appendChild(historyEmptyNode('No se pudo cargar el historial.'));
            });
    }

    function bootEditor() {
        var builtResult = window.OCDInlineSplit.build(editor, config);
        if (!builtResult.ok) {
            setStatus('No se pudo montar el lienzo compuesto: ' + (builtResult.error && builtResult.error.message), 'error');
            return;
        }
        built = builtResult.built;

        // El CSS fuente (antes del marcador) se inyecta fuera del CssComposer,
        // igual que en la ruta estructurada del editor admin.
        if (typeof setSourceCss === 'function') {
            setSourceCss(built.sourceCssCombinado);
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

        lockDynamicComponents();
        attachCanvasInputListener();
        updateDirtyUi();

        if (sessionWarning) {
            setStatus('Página «' + (config.pageTitle || '') + '» en modo edición \u2014 sin historial de sesión.', 'warn');
        } else {
            setStatus('Página «' + (config.pageTitle || '') + '» en modo edición.', 'ok');
        }
    }

    sessionId = loadOrCreateSession();

    editor.on('component:selected', updateActiveRegion);
    editor.on('component:deselected', updateActiveRegion);
    editor.on('update', markDirty);
    editor.on('component:update', markDirty);
    editor.on('canvas:frame:load', attachCanvasInputListener);

    if (saveButton) {
        saveButton.addEventListener('click', saveActiveRegion);
    }

    if (historyButton) {
        historyButton.addEventListener('click', openHistory);
    }

    window.addEventListener('beforeunload', function (event) {
        if (!hasAnyDirty()) {
            return;
        }
        event.preventDefault();
        event.returnValue = '';
        return '';
    });

    // Abre la sesión ANTES de armar el compuesto. Si falla, se sigue igual
    // pero el estado queda marcado como "sin historial de sesión".
    var sessionPromise = config.sessionOpenAction
        ? request(config.sessionOpenAction, {
            session_id: sessionId,
            document_ids: JSON.stringify(documentIdsForSession())
        }).catch(function () {
            sessionWarning = true;
            return null;
        })
        : Promise.resolve(null);

    sessionPromise.then(bootEditor, function () {
        sessionWarning = true;
        bootEditor();
    });
})(window, document);
