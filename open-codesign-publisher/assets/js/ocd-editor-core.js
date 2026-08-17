/**
 * Open CoDesign Canvas — núcleo compartido del editor.
 *
 * Expone `window.OCDEditorCore.create(options)` con el motor reutilizable del
 * editor (GrapesJS, tipos de componente, agrupado, plugins, serialización y
 * persistencia por admin-ajax). No conoce la pantalla de administración: los
 * mounts del inspector, la grilla y los controles de grupo llegan por opciones
 * y el estado del documento se comunica por callbacks.
 */
(function (window, document) {
    'use strict';

    // Capturado mientras se evalúa ESTE script (ocd-editor-core.js), antes de
    // que otro script llame a `create()`. En ese momento `document.currentScript`
    // apunta al core, de modo que la base de assets se resuelve desde su propio
    // `src` y no desde el entry que lo invoque.
    var coreScript =
        document.currentScript || document.querySelector('script[src*="ocd-editor-core.js"]');
    var pluginAssetBase = coreScript && coreScript.src
        ? coreScript.src.replace(/\/assets\/js\/ocd-editor-core\.js(?:[?#].*)?$/, '/assets')
        : '';
    var featuredImageSrc = pluginAssetBase
        ? pluginAssetBase + '/img/ocd-dynamic-featured-placeholder.svg'
        : 'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
                    '<rect width="100%" height="100%" fill="#f0f6fc"/>' +
                    '<rect x="8" y="8" width="624" height="344" fill="none" stroke="#2271b1" stroke-width="2" stroke-dasharray="10 8"/>' +
                    '<text x="320" y="190" font-family="Arial, sans-serif" font-size="28" fill="#2271b1" text-anchor="middle">Imagen destacada</text>' +
                '</svg>'
            );
    var acfImageSrc =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
                '<rect width="100%" height="100%" fill="#f0f6fc"/>' +
                '<rect x="8" y="8" width="624" height="344" fill="none" stroke="#2271b1" stroke-width="2" stroke-dasharray="10 8"/>' +
                '<text x="320" y="190" font-family="Arial, sans-serif" font-size="28" fill="#2271b1" text-anchor="middle">Imagen ACF</text>' +
            '</svg>'
        );

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
                '<div class="ocd-columns" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;padding:24px">' +
                '<div class="ocd-column" style="min-width:0"><p>Columna izquierda.</p></div>' +
                '<div class="ocd-column" style="min-width:0"><p>Columna derecha.</p></div>' +
                '</div>'
        },
        {
            id: 'ocd-row',
            label: 'Fila',
            category: 'Open CoDesign',
            content:
                '<div class="ocd-columns ocd-columns--single" style="display:grid;grid-template-columns:minmax(0, 1fr);gap:24px;padding:24px">' +
                '<div class="ocd-column" style="min-width:0"><p>Contenido de la fila.</p></div>' +
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
        },
        {
            id: 'ocd-dynamic-post-title',
            label: 'Título del artículo',
            category: 'Open CoDesign — Dinámico',
            content: '<h2 class="ocd-dynamic-placeholder ocd-dynamic-post-title">{{post_title}}</h2>'
        },
        {
            id: 'ocd-dynamic-post-excerpt',
            label: 'Extracto',
            category: 'Open CoDesign — Dinámico',
            content: '<p class="ocd-dynamic-placeholder ocd-dynamic-post-excerpt">{{post_excerpt}}</p>'
        },
        {
            id: 'ocd-dynamic-featured-image',
            label: 'Imagen destacada',
            category: 'Open CoDesign — Dinámico',
            content:
                '<img class="ocd-dynamic-placeholder ocd-dynamic-featured-image" ' +
                'data-ocd-dynamic="featured_image" src="' + featuredImageSrc + '" alt="">'
        },
        {
            id: 'ocd-dynamic-permalink',
            label: 'Enlace al artículo',
            category: 'Open CoDesign — Dinámico',
            content:
                '<a class="ocd-dynamic-placeholder ocd-dynamic-permalink" ' +
                'data-ocd-dynamic="permalink" href="#">Ver más</a>'
        },
        // Mapa de ubicación (OSM): ejemplo funcional con datos de muestra y
        // todos los data-ocd-geo-* que espera el runtime. Para un proyecto real
        // NO se editan estas calles/lugares a mano: se generan antes de publicar
        // con scripts/build-geo-map.mjs (Overpass + proyección + RDP) y el
        // fragmento resultante se pega en el editor (ver docs/modulo-mapas.md).
        {
            id: 'ocd-geo-map',
            label: 'Mapa de ubicación (OSM)',
            category: 'Open CoDesign — Mapas',
            content:
                '<div class="ocd-geo-map" data-ocd-behavior="geo-map" ' +
                'data-ocd-geo-places="[{&quot;nombre&quot;:&quot;Consultorio El Alba&quot;,&quot;categoria&quot;:&quot;salud&quot;,&quot;dist&quot;:1.2,&quot;contacto&quot;:&quot;+56 9 1234 5678&quot;,&quot;x&quot;:180,&quot;y&quot;:420},' +
                '{&quot;nombre&quot;:&quot;Colegio Los Tilos&quot;,&quot;categoria&quot;:&quot;educacion&quot;,&quot;dist&quot;:2.4,&quot;contacto&quot;:&quot;+56 9 8765 4321&quot;,&quot;x&quot;:610,&quot;y&quot;:160},' +
                '{&quot;nombre&quot;:&quot;Feria Libre&quot;,&quot;categoria&quot;:&quot;comercio&quot;,&quot;dist&quot;:0.8,&quot;contacto&quot;:&quot;+56 9 5555 0000&quot;,&quot;x&quot;:300,&quot;y&quot;:80}]" ' +
                'data-ocd-geo-categories="{&quot;salud&quot;:&quot;Salud&quot;,&quot;educacion&quot;:&quot;Educación&quot;,&quot;comercio&quot;:&quot;Comercio&quot;}" ' +
                'data-ocd-geo-data-bounds="{&quot;minX&quot;:0,&quot;minY&quot;:0,&quot;maxX&quot;:800,&quot;maxY&quot;:600}" ' +
                'data-ocd-geo-initial-center="400,320" data-ocd-geo-proyecto="400,320" data-ocd-geo-min-zoom-ratio="0.2" ' +
                'data-ocd-geo-svg="#ocd-geo-map-demo-svg" ' +
                'data-ocd-geo-select-categoria="#ocd-geo-map-demo-cat" ' +
                'data-ocd-geo-select-lugar="#ocd-geo-map-demo-lugar" ' +
                'data-ocd-geo-marker="#ocd-geo-map-demo-marker" ' +
                'data-ocd-geo-panel="#ocd-geo-map-demo-panel" ' +
                'data-ocd-geo-accent="#ocd-geo-map-demo-accent" ' +
                'data-ocd-geo-field-nombre="#ocd-geo-map-demo-nombre" ' +
                'data-ocd-geo-field-categoria="#ocd-geo-map-demo-categoria" ' +
                'data-ocd-geo-field-distancia="#ocd-geo-map-demo-distancia" ' +
                'data-ocd-geo-field-contacto="#ocd-geo-map-demo-contacto" ' +
                'data-ocd-geo-accent-color="#b8860b" ' +
                'style="position:relative;width:100%;min-height:440px;overflow:hidden;background:#eef3ee;border:1px solid #d5dcd2;border-radius:6px;color:#27312c;--ocd-geo-accent:#b8860b">' +
                '<div class="ocd-geo-map__body" style="position:absolute;inset:0">' +
                '<svg id="ocd-geo-map-demo-svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de ubicación de ejemplo" style="display:block;width:100%;height:100%;touch-action:none">' +
                '<g class="ocd-geo-map__landuse"><path class="ocd-geo-map__landuse ocd-geo-map__landuse--residential" d="M-20 -20 L300 -20 L320 180 L240 380 L-20 360 Z" fill="#e4ddc9" stroke="none"/><path class="ocd-geo-map__landuse ocd-geo-map__landuse--commercial" d="M500 0 L820 0 L820 260 L520 240 L500 0 Z" fill="#eadfc8" stroke="none"/></g>' +
                '<g class="ocd-geo-map__roads">' +
                '<path class="ocd-geo-road ocd-geo-road--primary" d="M-20 540 L220 470 L520 480 L820 420" fill="none" stroke="#f4c37a" stroke-width="2.4" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="ocd-geo-road ocd-geo-road--secondary" d="M140 -20 L180 240 L360 420 L520 620" fill="none" stroke="#f6e3c4" stroke-width="1.9" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="ocd-geo-road ocd-geo-road--secondary" d="M-20 220 L240 180 L560 200 L820 160" fill="none" stroke="#f6e3c4" stroke-width="1.9" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="ocd-geo-road ocd-geo-road--tertiary" d="M-20 340 L200 300 L420 330 L640 290 L820 320" fill="none" stroke="#ffffff" stroke-width="1.4" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="ocd-geo-road ocd-geo-road--tertiary" d="M240 -20 L260 140 L220 300 L300 620" fill="none" stroke="#ffffff" stroke-width="1.4" style="vector-effect:non-scaling-stroke"/>' +
                '</g>' +
                '<g class="ocd-geo-map__project" transform="translate(400 320)" style="pointer-events:none"><g class="zoom-constant" style="transform:scale(var(--zoom-k,1));transform-origin:0 0"><circle r="18" fill="rgba(184,134,11,.20)"/><circle r="7" fill="#b8860b" stroke="#ffffff" stroke-width="2"/><text y="-14" text-anchor="middle" font-size="12" font-weight="700" fill="#27312c">Proyecto</text></g></g>' +
                '<g id="ocd-geo-map-demo-marker" transform="translate(0 0)" style="display:none"><g class="zoom-constant" style="transform:scale(var(--zoom-k,1));transform-origin:0 0"><path d="M0 -18 L8 -6 L14 -6 L10 4 L12 16 L0 10 L-12 16 L-10 4 L-14 -6 L-8 -6 Z" fill="#b8860b" stroke="#ffffff" stroke-width="1.5"/></g></g>' +
                '</svg>' +
                '<div class="ocd-geo-map__selectors" style="position:absolute;top:12px;left:12px;display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:rgba(255,255,255,.86);border-radius:8px">' +
                '<select id="ocd-geo-map-demo-cat" class="ocd-geo-map__select" aria-label="Categoría" style="min-width:160px;padding:8px 10px;border:1px solid #cdd3ca;border-radius:6px;background:#fff"><option value="">Elige una categoría</option><option value="salud">Salud</option><option value="educacion">Educación</option><option value="comercio">Comercio</option></select>' +
                '<select id="ocd-geo-map-demo-lugar" class="ocd-geo-map__select" aria-label="Lugar" disabled style="min-width:160px;padding:8px 10px;border:1px solid #cdd3ca;border-radius:6px;background:#fff"><option value="">Elige una categoría primero</option></select>' +
                '</div>' +
                '</div>' +
                '<div class="ocd-geo-map__panel" id="ocd-geo-map-demo-panel" data-empty="true" style="position:absolute;right:12px;bottom:12px;min-width:220px;padding:12px;background:rgba(255,255,255,.92);border-radius:8px;visibility:hidden">' +
                '<div class="ocd-geo-map__accent" id="ocd-geo-map-demo-accent" style="height:4px;margin-bottom:8px;border-radius:999px;background:#b8860b"></div>' +
                '<p class="ocd-geo-map__nombre" id="ocd-geo-map-demo-nombre" style="margin:0 0 2px;font-size:16px;font-weight:700"></p>' +
                '<p class="ocd-geo-map__meta" id="ocd-geo-map-demo-categoria" style="margin:0;font-size:13px"></p>' +
                '<p class="ocd-geo-map__meta" id="ocd-geo-map-demo-distancia" style="margin:0;font-size:13px"></p>' +
                '<p class="ocd-geo-map__meta" id="ocd-geo-map-demo-contacto" style="margin:0;font-size:13px"></p>' +
                '</div>' +
                '<p class="ocd-geo-map__attribution" style="position:absolute;left:12px;bottom:10px;margin:0;font-size:11px;background:rgba(255,255,255,.72);padding:2px 6px;border-radius:4px">© OpenStreetMap contributors (ODbL)</p>' +
                '</div>'
        },
        // Mapa de lotes/parcelas: ejemplo funcional con 4 lotes de muestra. Los
        // polígonos y estados reales se dibujan según el plano del proyecto; el
        // runtime sólo lee data-ocd-parcel-* de cada <g class="lote">.
        {
            id: 'ocd-parcel-map',
            label: 'Mapa de lotes/parcelas',
            category: 'Open CoDesign — Mapas',
            content:
                '<div class="ocd-parcel-map" data-ocd-behavior="parcel-map" ' +
                'data-ocd-parcel-item-selector=".lote" data-ocd-parcel-id-attr="data-lote" data-ocd-parcel-superficie="5.000 m²" ' +
                'data-ocd-parcel-accent-disponible="#7d9a4b" data-ocd-parcel-accent-vendido="#b5651d" data-ocd-parcel-accent-empty="#d8d2c2" ' +
                'data-ocd-parcel-panel="#ocd-parcel-map-demo-panel" data-ocd-parcel-accent="#ocd-parcel-map-demo-accent" ' +
                'data-ocd-parcel-field-n="#ocd-parcel-map-demo-n" data-ocd-parcel-field-estado="#ocd-parcel-map-demo-estado" ' +
                'data-ocd-parcel-field-sup="#ocd-parcel-map-demo-sup" data-ocd-parcel-field-val="#ocd-parcel-map-demo-val" ' +
                'data-ocd-parcel-count="#ocd-parcel-map-demo-count" data-ocd-parcel-count-secondary="#ocd-parcel-map-demo-count-secondary" ' +
                'style="position:relative;width:100%;min-height:460px;overflow:hidden;background:#f6f4ee;border:1px solid #ddd6c8;border-radius:6px;color:#27312c">' +
                '<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano de lotes de ejemplo" style="display:block;width:100%;height:100%">' +
                '<g class="lote" data-lote="L-01" data-ocd-parcel-estado="disponible" data-ocd-parcel-valor="145.000.000" style="cursor:pointer"><polygon points="60,80 280,80 270,220 70,210" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="160" y="155" text-anchor="middle" font-size="18" fill="#314d23">L-01</text></g>' +
                '<g class="lote" data-lote="L-02" data-ocd-parcel-estado="vendido" data-ocd-parcel-valor="—" style="cursor:pointer"><polygon points="300,80 520,80 510,220 310,210" fill="#e7d3c1" stroke="#b5651d" stroke-width="2"/><text x="405" y="155" text-anchor="middle" font-size="18" fill="#6b3f17">L-02</text></g>' +
                '<g class="lote" data-lote="L-03" data-ocd-parcel-estado="disponible" data-ocd-parcel-valor="138.000.000" style="cursor:pointer"><polygon points="60,260 280,260 270,400 70,390" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="160" y="335" text-anchor="middle" font-size="18" fill="#314d23">L-03</text></g>' +
                '<g class="lote" data-lote="L-04" data-ocd-parcel-estado="disponible" data-ocd-parcel-valor="152.000.000" style="cursor:pointer"><polygon points="300,260 520,260 510,400 310,390" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="405" y="335" text-anchor="middle" font-size="18" fill="#314d23">L-04</text></g>' +
                '</svg>' +
                '<div style="position:absolute;top:12px;left:12px;padding:8px 12px;background:rgba(255,255,255,.86);border-radius:8px;font-size:13px"><strong id="ocd-parcel-map-demo-count">0</strong> disponibles</div>' +
                '<div class="ocd-parcel-map__panel" id="ocd-parcel-map-demo-panel" data-empty="true" style="position:absolute;right:12px;bottom:12px;min-width:220px;padding:12px;background:rgba(255,255,255,.92);border-radius:8px">' +
                '<div class="ocd-parcel-map__accent" id="ocd-parcel-map-demo-accent" style="height:4px;margin-bottom:8px;border-radius:999px;background:#d8d2c2"></div>' +
                '<p style="margin:0 0 2px;font-size:16px;font-weight:700">Lote <span id="ocd-parcel-map-demo-n"></span></p>' +
                '<p style="margin:0;font-size:13px">Estado: <span id="ocd-parcel-map-demo-estado"></span></p>' +
                '<p style="margin:0;font-size:13px">Superficie: <span id="ocd-parcel-map-demo-sup"></span></p>' +
                '<p style="margin:0;font-size:13px">Valor: <span id="ocd-parcel-map-demo-val"></span></p>' +
                '<p style="margin:8px 0 0;font-size:13px;color:#5c635c">Disponibles: <span id="ocd-parcel-map-demo-count-secondary">0</span></p>' +
                '</div>' +
                '</div>'
        },
        // Gráfico declarativo: el SVG visible es solo un placeholder para que
        // el bloque se vea en el canvas; el runtime lo reemplaza por el gráfico
        // real renderizado desde data-ocd-chart-data (sin librerías externas).
        {
            id: 'ocd-chart',
            label: 'Gráfico',
            category: 'Open CoDesign — Gráficos',
            content:
                '<div class="ocd-chart" data-ocd-behavior="chart" ' +
                'data-ocd-chart-type="bar" ' +
                'data-ocd-chart-data="[{&quot;label&quot;:&quot;Ene&quot;,&quot;value&quot;:1200},{&quot;label&quot;:&quot;Feb&quot;,&quot;value&quot;:1800},{&quot;label&quot;:&quot;Mar&quot;,&quot;value&quot;:1400},{&quot;label&quot;:&quot;Abr&quot;,&quot;value&quot;:2200}]" ' +
                'data-ocd-chart-color="#2271b1" data-ocd-chart-axis-color="#5f6b7a" ' +
                'data-ocd-chart-grid-color="rgba(0,0,0,.08)" data-ocd-chart-label-color="#27312c" ' +
                'data-ocd-chart-width="640" data-ocd-chart-height="360" ' +
                'style="width:100%;background:#fff;border:1px solid #e3e6ea;border-radius:6px;padding:8px">' +
                '<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Gráfico de barras de ejemplo" style="display:block;width:100%;height:auto">' +
                '<rect width="100%" height="100%" fill="#f7f9fc"/>' +
                '<text x="320" y="188" text-anchor="middle" font-family="system-ui, Arial, sans-serif" font-size="24" fill="#5f6b7a">Gráfico</text>' +
                '</svg>' +
                '</div>'
        }
    ];

    window.OCDEditorCore = {
        /**
         * Crea una instancia del motor del editor.
         *
         * options:
         *   container         selector del contenedor (requerido).
         *   status            function (message, kind) — informa estado (opcional).
         *   blocks            arreglo de bloques (default: BLOCKS del core; `[]` para ninguno).
         *   inspectorMount    elemento o selector del inspector (opcional).
         *   gridControlsMount elemento o selector de los controles de grilla (opcional).
         *   groupControlsMount elemento o selector de los controles de grupo (opcional).
         *   ajaxUrl, nonce    config de `request()` (admin-ajax).
         *   onDocumentApplied function (doc) — invocado tras aplicar un documento.
         *   onReady           function () — invocado al terminar el armado.
         *   siteFontCss       string — CSS de @font-face autocontenido del sitio que
         *                     se inyecta en el <head> del canvas antes del CSS fuente
         *                     para que el documento gane en cascada (opcional).
         *   themeDefinitionsCss string — CSS base del tema (variables :root + reglas
         *                     de baja especificidad) inyectado ANTES del CSS de fuentes
         *                     y del CSS fuente para que el documento gane en cascada
         *                     (opcional).
         *
         * Devuelve null si faltan dependencias (informando por `status`).
         */
        create: function (options) {
            options = options || {};

            var status = typeof options.status === 'function'
                ? options.status
                : function () {};

            if (
                !window.grapesjs ||
                typeof window.grapesjs.init !== 'function' ||
                !window.OCDComputedInspector ||
                !window.OCDCanvasGrid ||
                !window.OCDGridControls ||
                !window.OcdBehaviors
            ) {
                status('No se pudo cargar el editor Canvas completo desde los archivos locales del plugin.', 'error');
                return null;
            }

            var blocks = Array.isArray(options.blocks) ? options.blocks : BLOCKS;

            var editor = window.grapesjs.init({
                container: options.container,
                height: '100%',
                width: 'auto',
                fromElement: false,
                storageManager: false,
                noticeOnUnload: false,
                // La acción de agrupar depende de la selección múltiple (Shift+Click /
                // Ctrl+Click). GrapesJS ya trae `true` por defecto; lo fijamos explícito
                // para que un cambio de versión no desactive la función en silencio.
                multipleSelection: true,
                assetManager: { upload: false, custom: false },
                blockManager: { blocks: blocks }
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
            editor.Components.addType('ocd-dynamic', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.hasAttribute && element.hasAttribute('data-ocd-dynamic')) {
                        return true;
                    }
                    var text = element.textContent || '';
                    return (
                        text.indexOf('{{post_title}}') !== -1 ||
                        text.indexOf('{{post_excerpt}}') !== -1 ||
                        /\{\{acf:[a-zA-Z0-9_]+(?::html)?\}\}/.test(text)
                    );
                }
            });
            editor.Components.addType('ocd-group', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('ocd-group');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' ocd-group ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['ocd-group'],
                        droppable: true
                    }
                }
            });
            editor.Components.addType('ocd-columns', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('ocd-columns');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' ocd-columns ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['ocd-columns'],
                        draggable: true,
                        droppable: true
                    }
                }
            });
            editor.Components.addType('ocd-column', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('ocd-column');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' ocd-column ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['ocd-column'],
                        draggable: true,
                        droppable: true
                    }
                }
            });

            function isOcdGroup(component) {
                if (!component) {
                    return false;
                }
                if (component.get && component.get('type') === 'ocd-group') {
                    return true;
                }
                var classes = component.getClasses ? component.getClasses() : [];
                return classes.indexOf('ocd-group') !== -1;
            }

            function groupSelected() {
                var selected = editor.getSelectedAll();
                if (!selected || selected.length < 2) {
                    status('Selecciona al menos dos módulos para agrupar.', 'error');
                    return false;
                }
                var parent = selected[0].parent();
                if (!parent) {
                    status('La selección actual no se puede agrupar.', 'error');
                    return false;
                }
                for (var i = 0; i < selected.length; i++) {
                    if (selected[i].parent() !== parent) {
                        status('Solo se pueden agrupar módulos del mismo nivel.', 'error');
                        return false;
                    }
                }
                var ordered = selected.slice().sort(function (left, right) {
                    return left.index() - right.index();
                });
                var group = parent.append({
                    type: 'ocd-group',
                    tagName: 'div',
                    classes: ['ocd-group'],
                    components: []
                }, { at: ordered[0].index() })[0];
                if (!group) {
                    status('No se pudo crear el contenedor del grupo.', 'error');
                    return false;
                }
                ordered.forEach(function (component) {
                    group.append(component);
                });
                editor.select(group);
                status('Módulos agrupados en un contenedor .ocd-group.', 'ok');
                return group;
            }

            function ungroupSelected() {
                var group = editor.getSelected();
                if (!isOcdGroup(group)) {
                    status('Selecciona un grupo .ocd-group para desagrupar.', 'error');
                    return false;
                }
                var parent = group.parent();
                if (!parent) {
                    status('El grupo no tiene un contenedor padre.', 'error');
                    return false;
                }
                var children = group.components().models.slice();
                var insertAt = group.index();
                children.forEach(function (child, offset) {
                    parent.append(child, { at: insertAt + offset });
                });
                group.remove();
                editor.select(children.length ? children : parent);
                status('Grupo desagrupado.', 'ok');
                return children;
            }

            editor.Commands.add('ocd-group:group', { run: groupSelected });
            editor.Commands.add('ocd-group:ungroup', { run: ungroupSelected });
            editor.Keymaps.add('ocd-group:group', 'ctrl+g', 'ocd-group:group');
            editor.Keymaps.add('ocd-group:ungroup', 'ctrl+shift+g', 'ocd-group:ungroup');

            function createGroupControls(mountNode) {
                var head = mountNode;
                if (!head) {
                    return null;
                }
                var section = document.createElement('section');
                section.className = 'ocd-groups';

                var title = document.createElement('div');
                title.className = 'ocd-groups__title';
                var titleText = document.createElement('span');
                titleText.textContent = 'Grupos de módulos';
                var target = document.createElement('span');
                target.className = 'ocd-groups__target';
                title.appendChild(titleText);
                title.appendChild(target);

                var row = document.createElement('div');
                row.className = 'ocd-groups__row';
                var groupButton = document.createElement('button');
                groupButton.type = 'button';
                groupButton.textContent = 'Agrupar selección';
                var ungroupButton = document.createElement('button');
                ungroupButton.type = 'button';
                ungroupButton.textContent = 'Desagrupar';
                row.appendChild(groupButton);
                row.appendChild(ungroupButton);

                var hint = document.createElement('div');
                hint.className = 'ocd-groups__hint';
                hint.textContent =
                    'Selecciona 2+ módulos del mismo nivel y agrupalos en un contenedor. ' +
                    'Atajos: Ctrl+G agrupa y Ctrl+Shift+G desagrupa.';
                section.appendChild(title);
                section.appendChild(row);
                section.appendChild(hint);
                head.appendChild(section);

                function refresh() {
                    var selectedAll = editor.getSelectedAll();
                    var selected = editor.getSelected();
                    var canGroup = selectedAll.length >= 2;
                    var canUngroup = isOcdGroup(selected);
                    groupButton.disabled = !canGroup;
                    ungroupButton.disabled = !canUngroup;
                    target.textContent = canUngroup
                        ? '.ocd-group'
                        : selectedAll.length
                            ? selectedAll.length + (selectedAll.length === 1 ? ' módulo' : ' módulos')
                            : 'sin selección';
                }

                groupButton.addEventListener('click', function () {
                    editor.runCommand('ocd-group:group');
                });
                ungroupButton.addEventListener('click', function () {
                    editor.runCommand('ocd-group:ungroup');
                });
                editor.on('component:selected', refresh);
                editor.on('component:deselected', refresh);
                editor.on('canvas:frame:load', refresh);
                refresh();

                return {
                    section: section,
                    refresh: refresh
                };
            }

            var CSS_OVERRIDES_MARKER = '/* OCD-CANVAS-EDITABLE-OVERRIDES */';
            var sourceCss = '';
            var siteFontCss = typeof options.siteFontCss === 'string' ? options.siteFontCss : '';
            var themeDefinitionsCss = typeof options.themeDefinitionsCss === 'string' ? options.themeDefinitionsCss : '';

            function resolveMount(value) {
                if (!value) {
                    return null;
                }
                if (typeof value === 'string') {
                    return document.querySelector(value);
                }
                return value;
            }

            var inspectorMount = resolveMount(options.inspectorMount);
            var gridControlsMount = resolveMount(options.gridControlsMount);
            var groupControlsMount = resolveMount(options.groupControlsMount);

            var gridApi = window.OCDCanvasGrid.plugin(editor);
            var behaviorApi = window.OcdBehaviors.grapesjsPlugin(editor, { threshold: 40 });
            var inspector = inspectorMount
                ? window.OCDComputedInspector.create(editor, { mount: inspectorMount })
                : null;
            var gridControls = gridControlsMount
                ? window.OCDGridControls.create(editor, gridApi, { mount: gridControlsMount })
                : null;
            var groupControls = createGroupControls(groupControlsMount);

            var ajaxUrl = options.ajaxUrl;
            var nonce = options.nonce;
            var onDocumentApplied =
                typeof options.onDocumentApplied === 'function' ? options.onDocumentApplied : null;

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
                var head = canvasDocument.head;
                var style = head.querySelector('style[data-ocd-source-css]');
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-ocd-source-css', 'preserved');
                    head.prepend(style);
                }
                style.textContent = sourceCss;

                // El CSS fuente debe quedar DESPUÉS del CSS de fuentes para ganar
                // la cascada: las reglas del documento anulan los estilos del sitio.
                var fontStyle = head.querySelector('style[data-ocd-site-css]');
                if (fontStyle && fontStyle !== style && fontStyle.nextSibling !== style) {
                    head.insertBefore(style, fontStyle.nextSibling);
                }
            }

            function ensureThemeDefinitionsCss() {
                var canvasDocument = editor.Canvas.getDocument();
                if (!canvasDocument || !canvasDocument.head) {
                    return;
                }
                var head = canvasDocument.head;
                var style = head.querySelector('style[data-ocd-theme-css]');
                if (!themeDefinitionsCss) {
                    if (style) {
                        style.parentNode.removeChild(style);
                    }
                    return;
                }
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-ocd-theme-css', 'definitions');
                    head.prepend(style);
                }
                style.textContent = themeDefinitionsCss;

                // El CSS base del tema debe quedar ANTES del CSS de fuentes y del
                // CSS fuente para perder la cascada: las reglas base del tema son
                // la capa más débil y las del documento la anulan.
                var fontStyle = head.querySelector('style[data-ocd-site-css]');
                var sourceStyle = head.querySelector('style[data-ocd-source-css]');
                var anchor = fontStyle || sourceStyle;
                if (anchor && anchor !== style && anchor.previousSibling !== style) {
                    head.insertBefore(style, anchor);
                } else if (!anchor && style.previousSibling !== null) {
                    head.insertBefore(style, head.firstChild);
                }
            }

            function ensureSiteFontCss() {
                var canvasDocument = editor.Canvas.getDocument();
                if (!canvasDocument || !canvasDocument.head) {
                    return;
                }
                var head = canvasDocument.head;
                var style = head.querySelector('style[data-ocd-site-css]');
                if (!siteFontCss) {
                    if (style) {
                        style.parentNode.removeChild(style);
                    }
                    return;
                }
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-ocd-site-css', 'fonts');
                    // Antes del CSS fuente para que el documento gane en cascada;
                    // si aún no hay CSS fuente, se antepone al <head>.
                    var sourceStyle = head.querySelector('style[data-ocd-source-css]');
                    if (sourceStyle) {
                        head.insertBefore(style, sourceStyle);
                    } else {
                        head.prepend(style);
                    }
                }
                style.textContent = siteFontCss;
            }

            /**
             * Inyecta en el iframe de GrapesJS las reglas de edición de los tokens
             * dinámicos. Se leen de `ocd-canvas-editor.css` (la hoja administrativa
             * cargada en la página) y se copian a un `<style>` del canvas; nunca
             * forman parte del CSS del documento ni del CSS exportado.
             */
            function collectDynamicPlaceholderCss() {
                var css = '';
                var sheets = document.styleSheets;
                for (var i = 0; i < sheets.length; i++) {
                    var rules = null;
                    try {
                        rules = sheets[i].cssRules;
                    } catch (_error) {
                        continue;
                    }
                    if (!rules) {
                        continue;
                    }
                    for (var j = 0; j < rules.length; j++) {
                        var text = rules[j].cssText || '';
                        if (/ocd-dynamic-placeholder|ocd-dynamic-post-title|ocd-dynamic-post-excerpt|ocd-dynamic-featured-image|ocd-dynamic-permalink/.test(text)) {
                            css += text + '\n';
                        }
                    }
                }
                return css;
            }

            function ensureDynamicPlaceholderCss() {
                var canvasDocument = editor.Canvas.getDocument();
                if (!canvasDocument || !canvasDocument.head) {
                    return;
                }
                var css = collectDynamicPlaceholderCss();
                if (!css) {
                    return;
                }
                var style = canvasDocument.head.querySelector('style[data-ocd-editor-css]');
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-ocd-editor-css', 'ocd-canvas-editor');
                    canvasDocument.head.appendChild(style);
                }
                style.textContent = css;
            }

            function refreshPresentation() {
                ensureSiteFontCss();
                ensureSourceCss();
                ensureThemeDefinitionsCss();
                ensureDynamicPlaceholderCss();
                var selected = editor.getSelected();
                if (inspector) {
                    inspector.refresh(selected);
                }
                if (gridControls) {
                    gridControls.refresh(selected);
                }
                if (groupControls) {
                    groupControls.refresh();
                }
                behaviorApi.installCanvasRuntime();
            }

            function request(action, params) {
                var body = new window.URLSearchParams();
                body.set('action', action);
                body.set('nonce', nonce);
                Object.keys(params || {}).forEach(function (key) {
                    body.set(key, params[key]);
                });

                return window
                    .fetch(ajaxUrl, {
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

            function applyFlatDocument(doc) {
                var css = splitStoredCss(doc && doc.css);
                sourceCss = css.source;
                editor.setComponents((doc && doc.html) || '');
                editor.setStyle([sourceCss, css.overrides].filter(Boolean).join('\n'));
                window.requestAnimationFrame(function () {
                    ensureSiteFontCss();
                    ensureSourceCss();
                    ensureThemeDefinitionsCss();
                });
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
                        status(
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
                    ensureSiteFontCss();
                    ensureSourceCss();
                    ensureThemeDefinitionsCss();
                    var selected = editor.getSelected();
                    if (!selected) {
                        var children = editor.getWrapper().components();
                        selected = children && children.length ? children.at(0) : null;
                        if (selected) {
                            editor.select(selected);
                        }
                    }
                    if (inspector) {
                        inspector.refresh(selected);
                    }
                    if (gridControls) {
                        gridControls.refresh(selected);
                    }
                    if (groupControls) {
                        groupControls.refresh();
                    }
                    behaviorApi.installCanvasRuntime();
                });
                if (onDocumentApplied) {
                    onDocumentApplied(doc);
                }
            }

            function snapshot() {
                behaviorApi.refresh();
                return {
                    project_data: JSON.stringify(editor.getProjectData()),
                    html: serializedHtml(),
                    css: serializedCss()
                };
            }

            function getSourceCss() {
                return sourceCss;
            }

            function setSourceCss(value) {
                sourceCss = value;
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

            if (typeof options.onReady === 'function') {
                options.onReady();
            }

            return {
                editor: editor,
                blocks: blocks,
                grid: gridApi,
                behaviors: behaviorApi,
                inspector: inspector,
                gridControls: gridControls,
                groupControls: groupControls,
                request: request,
                snapshot: snapshot,
                applyDocument: applyDocument,
                splitStoredCss: splitStoredCss,
                serializedHtml: serializedHtml,
                serializedCss: serializedCss,
                ensureSourceCss: ensureSourceCss,
                ensureSiteFontCss: ensureSiteFontCss,
                ensureThemeDefinitionsCss: ensureThemeDefinitionsCss,
                refreshPresentation: refreshPresentation,
                getSourceCss: getSourceCss,
                setSourceCss: setSourceCss,
                acfImageSrc: acfImageSrc
            };
        }
    };
})(window, document);
