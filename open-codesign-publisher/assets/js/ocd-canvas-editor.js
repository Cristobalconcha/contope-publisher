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

    var editorScript = document.currentScript || document.querySelector('script[src*="ocd-canvas-editor.js"]');
    var pluginAssetBase = editorScript && editorScript.src
        ? editorScript.src.replace(/\/assets\/js\/ocd-canvas-editor\.js(?:[?#].*)?$/, '/assets')
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

    var editor = window.grapesjs.init({
        container: '#ocd-canvas-editor-root',
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
            setStatus('Selecciona al menos dos módulos para agrupar.', 'error');
            return false;
        }
        var parent = selected[0].parent();
        if (!parent) {
            setStatus('La selección actual no se puede agrupar.', 'error');
            return false;
        }
        for (var i = 0; i < selected.length; i++) {
            if (selected[i].parent() !== parent) {
                setStatus('Solo se pueden agrupar módulos del mismo nivel.', 'error');
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
            setStatus('No se pudo crear el contenedor del grupo.', 'error');
            return false;
        }
        ordered.forEach(function (component) {
            group.append(component);
        });
        editor.select(group);
        setStatus('Módulos agrupados en un contenedor .ocd-group.', 'ok');
        return group;
    }

    function ungroupSelected() {
        var group = editor.getSelected();
        if (!isOcdGroup(group)) {
            setStatus('Selecciona un grupo .ocd-group para desagrupar.', 'error');
            return false;
        }
        var parent = group.parent();
        if (!parent) {
            setStatus('El grupo no tiene un contenedor padre.', 'error');
            return false;
        }
        var children = group.components().models.slice();
        var insertAt = group.index();
        children.forEach(function (child, offset) {
            parent.append(child, { at: insertAt + offset });
        });
        group.remove();
        editor.select(children.length ? children : parent);
        setStatus('Grupo desagrupado.', 'ok');
        return children;
    }

    editor.Commands.add('ocd-group:group', { run: groupSelected });
    editor.Commands.add('ocd-group:ungroup', { run: ungroupSelected });
    editor.Keymaps.add('ocd-group:group', 'ctrl+g', 'ocd-group:group');
    editor.Keymaps.add('ocd-group:ungroup', 'ctrl+shift+g', 'ocd-group:ungroup');

    function createGroupControls(mountNode) {
        var head = mountNode || document.querySelector('#ocd-canvas-inspector .ocd-ci__head');
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
    var gridApi = window.OCDCanvasGrid.plugin(editor);
    var behaviorApi = window.OcdBehaviors.grapesjsPlugin(editor, { threshold: 40 });
    var inspector = window.OCDComputedInspector.create(editor, {
        mount: document.getElementById('ocd-canvas-inspector')
    });
    var gridControls = window.OCDGridControls.create(editor, gridApi, {
        mount: document.querySelector('#ocd-canvas-inspector .ocd-ci__head')
    });
    var groupControls = createGroupControls(
        document.querySelector('#ocd-canvas-inspector .ocd-ci__head')
    );

    window.ocdCanvas = {
        editor: editor,
        blocks: BLOCKS,
        inspector: inspector,
        grid: gridApi,
        gridControls: gridControls,
        groupControls: groupControls,
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
            if (groupControls) {
                groupControls.refresh();
            }
            behaviorApi.installCanvasRuntime();
        });
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
        ensureSourceCss();
        ensureDynamicPlaceholderCss();
        var selected = editor.getSelected();
        inspector.refresh(selected);
        gridControls.refresh(selected);
        if (groupControls) {
            groupControls.refresh();
        }
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
            pageStatus('Ingresá un ID de página válido.', 'error');
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
            pageStatus('Ingresá un ID de página válido.', 'error');
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
