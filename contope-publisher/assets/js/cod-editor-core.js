/**
 * ContOpe Canvas — núcleo compartido del editor.
 *
 * Expone `window.OCDEditorCore.create(options)` con el motor reutilizable del
 * editor (GrapesJS, tipos de componente, agrupado, plugins, serialización y
 * persistencia por admin-ajax). No conoce la pantalla de administración: los
 * mounts del inspector, la grilla y los controles de grupo llegan por opciones
 * y el estado del documento se comunica por callbacks.
 */
(function (window, document) {
    'use strict';

    // Capturado mientras se evalúa ESTE script (cod-editor-core.js), antes de
    // que otro script llame a `create()`. En ese momento `document.currentScript`
    // apunta al core, de modo que la base de assets se resuelve desde su propio
    // `src` y no desde el entry que lo invoque.
    var coreScript =
        document.currentScript || document.querySelector('script[src*="cod-editor-core.js"]');
    var pluginAssetBase = coreScript && coreScript.src
        ? coreScript.src.replace(/\/assets\/js\/cod-editor-core\.js(?:[?#].*)?$/, '/assets')
        : '';
    var featuredImageSrc = pluginAssetBase
        ? pluginAssetBase + '/img/cod-dynamic-featured-placeholder.svg'
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
    var dynamicGroupImageSrc =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">' +
                '<rect width="100%" height="100%" fill="#f6f8fa"/>' +
                '<rect x="8" y="8" width="624" height="344" fill="none" stroke="#2271b1" stroke-width="2" stroke-dasharray="10 8"/>' +
                '<text x="320" y="190" font-family="Arial, sans-serif" font-size="28" fill="#2271b1" text-anchor="middle">Imagen de tarjeta</text>' +
            '</svg>'
        );

    var BLOCKS = [
        {
            id: 'cod-section',
            label: 'Sección',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
            // Una Sección es solo estructura (fondo, padding) — nunca guarda
            // contenido propio. Antes traía un <h2>/<p> pegados directo a la
            // sección, sin Fila ni Columna ni módulos reales de por medio;
            // eso rompía la jerarquía Sección > Fila > Módulo (una sección
            // no puede tener título ni texto, solo un módulo de Título o de
            // Párrafo puede). Ahora viene sólo con una Fila y una Columna
            // vacía: el contenido se agrega exclusivamente mediante módulos.
            content:
                '<section class="cod-section" style="padding:48px 24px">' +
                '<div class="cod-columns cod-columns--single" style="display:grid;grid-template-columns:minmax(0, 1fr);gap:24px">' +
                '<div class="cod-column" style="min-width:0"></div>' +
                '</div>' +
                '</section>'
        },
        {
            id: 'cod-columns',
            label: 'Fila de 2 columnas',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="7.5" height="16" rx="1"/><rect x="13.5" y="4" width="7.5" height="16" rx="1"/></svg>',
            content:
                '<div class="cod-columns" style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;padding:24px">' +
                '<div class="cod-column" style="min-width:0"></div>' +
                '<div class="cod-column" style="min-width:0"></div>' +
                '</div>'
        },
        {
            id: 'cod-row',
            label: 'Fila',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="6.5" rx="1"/><rect x="3" y="13.5" width="18" height="6.5" rx="1"/></svg>',
            content:
                '<div class="cod-columns cod-columns--single" style="display:grid;grid-template-columns:minmax(0, 1fr);gap:24px;padding:24px">' +
                '<div class="cod-column" style="min-width:0"></div>' +
                '</div>'
        },
        {
            id: 'cod-heading',
            label: 'Título',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/></svg>',
            content: '<h2 class="cod-heading">Título editable</h2>'
        },
        {
            id: 'cod-paragraph',
            label: 'Párrafo',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="4" y1="16" x2="14" y2="16"/></svg>',
            content: '<p class="cod-paragraph">Párrafo editable.</p>'
        },
        {
            id: 'cod-image',
            label: 'Imagen',
            category: 'ContOpe Design',
            select: true,
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M4 17l5-5 3.5 3.5L16 12l4 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            content: { type: 'image' }
        },
        {
            id: 'cod-video',
            label: 'Video',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M10 9.5l5 2.5-5 2.5z" stroke-linejoin="round"/></svg>',
            content:
                '<video class="cod-video" controls muted playsinline preload="auto" ' +
                'style="width:100%;height:auto;display:block"><source src="" type="video/mp4"></video>'
        },
        {
            id: 'cod-button',
            label: 'Botón',
            category: 'ContOpe Design',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="8" width="18" height="8" rx="4"/><line x1="8" y1="12" x2="14" y2="12" stroke-linecap="round"/></svg>',
            content:
                '<a class="cod-button" href="#" style="display:inline-block;padding:12px 24px;border-radius:4px;' +
                'background:#1d2327;color:#fff;text-decoration:none">Acción</a>'
        },
        {
            id: 'cod-dynamic-post-title',
            label: 'Título del artículo',
            category: 'ContOpe Design — Dinámico',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="1.5" stroke-dasharray="2.4 2"/><line x1="7" y1="9" x2="17" y2="9" stroke-width="1.8"/><line x1="7" y1="13" x2="13" y2="13"/></svg>',
            content: '<h2 class="cod-dynamic-placeholder cod-dynamic-post-title">{{post_title}}</h2>'
        },
        {
            id: 'cod-dynamic-post-excerpt',
            label: 'Extracto',
            category: 'ContOpe Design — Dinámico',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="1.5" stroke-dasharray="2.4 2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="15" y2="13"/></svg>',
            content: '<p class="cod-dynamic-placeholder cod-dynamic-post-excerpt">{{post_excerpt}}</p>'
        },
        {
            id: 'cod-dynamic-featured-image',
            label: 'Imagen destacada',
            category: 'ContOpe Design — Dinámico',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5" stroke-dasharray="2.4 2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M4 17l5-5 3.5 3.5L16 12l4 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            content:
                '<img class="cod-dynamic-placeholder cod-dynamic-featured-image" ' +
                'data-cod-dynamic="featured_image" src="' + featuredImageSrc + '" alt="">'
        },
        {
            id: 'cod-dynamic-permalink',
            label: 'Enlace al artículo',
            category: 'ContOpe Design — Dinámico',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 15l6-6"/><path d="M10 7l1-1a3 3 0 0 1 4.2 4.2l-1 1"/><path d="M14 17l-1 1a3 3 0 0 1-4.2-4.2l1-1"/></svg>',
            content:
                '<a class="cod-dynamic-placeholder cod-dynamic-permalink" ' +
                'data-cod-dynamic="permalink" href="#">Ver más</a>'
        },
        {
            id: 'cod-dynamic-group',
            label: 'Grupo Dinámico',
            category: 'ContOpe Design — Dinámico',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
            content:
                '<div data-cod-dynamic-group class="cod-dynamic-group cod-dynamic-group--grid-2">' +
                '<div class="cod-dynamic-group__card">' +
                '<img class="cod-dynamic-group__image" src="' + dynamicGroupImageSrc + '" alt="">' +
                '<h3 class="cod-dynamic-group__title">Título de tarjeta</h3>' +
                '<p class="cod-dynamic-group__text">Texto editable de la tarjeta.</p>' +
                '</div>' +
                '<div class="cod-dynamic-group__card">' +
                '<img class="cod-dynamic-group__image" src="' + dynamicGroupImageSrc + '" alt="">' +
                '<h3 class="cod-dynamic-group__title">Título de tarjeta</h3>' +
                '<p class="cod-dynamic-group__text">Texto editable de la tarjeta.</p>' +
                '</div>' +
                '</div>'
        },
        // Mapa de ubicación (OSM): ejemplo funcional con datos de muestra y
        // todos los data-cod-geo-* que espera el runtime. Para un proyecto real
        // NO se editan estas calles/lugares a mano: se generan antes de publicar
        // con scripts/build-geo-map.mjs (Overpass + proyección + RDP) y el
        // fragmento resultante se pega en el editor (ver docs/modulo-mapas.md).
        {
            id: 'cod-geo-map',
            label: 'Mapa de ubicación (OSM)',
            category: 'ContOpe Design — Mapas',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
            content:
                '<div class="cod-geo-map" data-cod-behavior="geo-map" ' +
                'data-cod-geo-places="[{&quot;nombre&quot;:&quot;Consultorio El Alba&quot;,&quot;categoria&quot;:&quot;salud&quot;,&quot;tiempoMin&quot;:6,&quot;dist&quot;:1.2,&quot;contacto&quot;:&quot;+56 9 1234 5678&quot;,&quot;descripcionLarga&quot;:&quot;Urgencia y consultas generales, atención todo el día.&quot;,&quot;x&quot;:180,&quot;y&quot;:420},' +
                '{&quot;nombre&quot;:&quot;Colegio Los Tilos&quot;,&quot;categoria&quot;:&quot;educacion&quot;,&quot;tiempoMin&quot;:10,&quot;dist&quot;:2.4,&quot;contacto&quot;:&quot;+56 9 8765 4321&quot;,&quot;descripcionLarga&quot;:&quot;Educación básica y media, transporte escolar disponible.&quot;,&quot;x&quot;:610,&quot;y&quot;:160},' +
                '{&quot;nombre&quot;:&quot;Feria Libre&quot;,&quot;categoria&quot;:&quot;comercio&quot;,&quot;tiempoMin&quot;:4,&quot;dist&quot;:0.8,&quot;contacto&quot;:&quot;+56 9 5555 0000&quot;,&quot;descripcionLarga&quot;:&quot;Frutas, verduras y productos locales, martes y viernes.&quot;,&quot;x&quot;:300,&quot;y&quot;:80}]" ' +
                'data-cod-geo-categories="{&quot;salud&quot;:&quot;Salud&quot;,&quot;educacion&quot;:&quot;Educación&quot;,&quot;comercio&quot;:&quot;Comercio&quot;}" ' +
                'data-cod-geo-category-icons="{&quot;salud&quot;:&quot;M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8.5-2h3v-3.5H17v-3h-3.5V7h-3v3.5H7v3h3.5z&quot;,&quot;educacion&quot;:&quot;M12 3 1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z&quot;,&quot;comercio&quot;:&quot;m21.9 8.89-1.05-4.37c-.22-.9-1-1.52-1.91-1.52H5.05c-.9 0-1.69.63-1.9 1.52L2.1 8.89c-.24 1.02-.02 2.06.62 2.88.08.11.19.19.28.29V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6.94c.09-.09.2-.18.28-.28.64-.82.87-1.87.62-2.89zm-2.99-3.9 1.05 4.37c.1.42.01.84-.25 1.17-.14.18-.44.47-.94.47-.61 0-1.14-.49-1.21-1.14L16.98 5l1.93-.01zM13 5h1.96l.54 4.52c.05.39-.07.78-.33 1.07-.22.26-.54.41-.95.41-.67 0-1.22-.59-1.22-1.31V5zM8.49 9.52 9.04 5H11v4.69c0 .72-.55 1.31-1.29 1.31-.34 0-.65-.15-.89-.41a1.42 1.42 0 0 1-.33-1.07zm-4.45-.16L5.05 5h1.97l-.58 4.86c-.08.65-.6 1.14-1.21 1.14-.49 0-.8-.29-.93-.47-.27-.32-.36-.75-.26-1.17zM5 19v-6.03c.08.01.15.03.23.03.87 0 1.66-.36 2.24-.95.6.6 1.4.95 2.31.95.87 0 1.65-.36 2.23-.93.59.57 1.39.93 2.29.93.84 0 1.64-.35 2.24-.95.58.59 1.37.95 2.24.95.08 0 .15-.02.23-.03V19H5z&quot;}" ' +
                'data-cod-geo-data-bounds="{&quot;minX&quot;:0,&quot;minY&quot;:0,&quot;maxX&quot;:800,&quot;maxY&quot;:600}" ' +
                'data-cod-geo-initial-center="400,320" data-cod-geo-proyecto="400,320" data-cod-geo-min-zoom-ratio="0.2" ' +
                'data-cod-geo-svg="#cod-geo-map-demo-svg" ' +
                'data-cod-geo-select-categoria="#cod-geo-map-demo-cat" ' +
                'data-cod-geo-select-lugar="#cod-geo-map-demo-lugar" ' +
                'data-cod-geo-marker="#cod-geo-map-demo-marker" ' +
                'data-cod-geo-panel="#cod-geo-map-demo-panel" ' +
                'data-cod-geo-accent="#cod-geo-map-demo-accent" ' +
                'data-cod-geo-field-nombre="#cod-geo-map-demo-nombre" ' +
                'data-cod-geo-field-categoria="#cod-geo-map-demo-categoria" ' +
                'data-cod-geo-field-distancia="#cod-geo-map-demo-distancia" ' +
                'data-cod-geo-field-descripcion="#cod-geo-map-demo-descripcion" ' +
                'data-cod-geo-field-contacto="#cod-geo-map-demo-contacto" ' +
                'data-cod-geo-accent-color="#b8860b" ' +
                'style="position:relative;width:100%;min-height:440px;overflow:hidden;background:#eef3ee;border:1px solid #d5dcd2;border-radius:6px;color:#27312c;--cod-geo-accent:#b8860b">' +
                '<div class="cod-geo-map__body" style="position:absolute;inset:0">' +
                '<svg id="cod-geo-map-demo-svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de ubicación de ejemplo" style="display:block;width:100%;height:100%;touch-action:none">' +
                '<g class="cod-geo-map__landuse"><path class="cod-geo-map__landuse cod-geo-map__landuse--residential" d="M-20 -20 L300 -20 L320 180 L240 380 L-20 360 Z" fill="#e4ddc9" stroke="none"/><path class="cod-geo-map__landuse cod-geo-map__landuse--commercial" d="M500 0 L820 0 L820 260 L520 240 L500 0 Z" fill="#eadfc8" stroke="none"/></g>' +
                '<g class="cod-geo-map__roads">' +
                '<path class="cod-geo-road cod-geo-road--primary" d="M-20 540 L220 470 L520 480 L820 420" fill="none" stroke="#f4c37a" stroke-width="2.4" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="cod-geo-road cod-geo-road--secondary" d="M140 -20 L180 240 L360 420 L520 620" fill="none" stroke="#f6e3c4" stroke-width="1.9" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="cod-geo-road cod-geo-road--secondary" d="M-20 220 L240 180 L560 200 L820 160" fill="none" stroke="#f6e3c4" stroke-width="1.9" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="cod-geo-road cod-geo-road--tertiary" d="M-20 340 L200 300 L420 330 L640 290 L820 320" fill="none" stroke="#ffffff" stroke-width="1.4" style="vector-effect:non-scaling-stroke"/>' +
                '<path class="cod-geo-road cod-geo-road--tertiary" d="M240 -20 L260 140 L220 300 L300 620" fill="none" stroke="#ffffff" stroke-width="1.4" style="vector-effect:non-scaling-stroke"/>' +
                '</g>' +
                '<g class="cod-geo-map__project" transform="translate(400 320)" style="pointer-events:none"><g class="zoom-constant" style="transform:scale(var(--zoom-k,1));transform-origin:0 0"><circle r="18" fill="rgba(184,134,11,.20)"/><circle r="7" fill="#b8860b" stroke="#ffffff" stroke-width="2"/><text y="-14" text-anchor="middle" font-size="12" font-weight="700" fill="#27312c">Proyecto</text></g></g>' +
                '<g id="cod-geo-map-demo-marker" transform="translate(0 0)" style="display:none"><g class="zoom-constant" style="transform:scale(var(--zoom-k,1));transform-origin:0 0"><path class="cod-geo-map__marker-icon" d="M0 -18 L8 -6 L14 -6 L10 4 L12 16 L0 10 L-12 16 L-10 4 L-14 -6 L-8 -6 Z" fill="#b8860b" stroke="#ffffff" stroke-width="1.5"/></g></g>' +
                '</svg>' +
                '<div class="cod-geo-map__selectors" style="position:absolute;top:12px;left:12px;display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:rgba(255,255,255,.86);border-radius:8px">' +
                '<select id="cod-geo-map-demo-cat" class="cod-geo-map__select" aria-label="Categoría" style="min-width:160px;padding:8px 10px;border:1px solid #cdd3ca;border-radius:6px;background:#fff"><option value="">Elige una categoría</option><option value="salud">Salud</option><option value="educacion">Educación</option><option value="comercio">Comercio</option></select>' +
                '<select id="cod-geo-map-demo-lugar" class="cod-geo-map__select" aria-label="Lugar" disabled style="min-width:160px;padding:8px 10px;border:1px solid #cdd3ca;border-radius:6px;background:#fff"><option value="">Elige una categoría primero</option></select>' +
                '</div>' +
                '</div>' +
                '<div class="cod-geo-map__panel" id="cod-geo-map-demo-panel" data-empty="true" style="position:absolute;right:12px;bottom:12px;min-width:220px;padding:12px;background:rgba(255,255,255,.92);border-radius:8px;visibility:hidden">' +
                '<div class="cod-geo-map__accent" id="cod-geo-map-demo-accent" style="height:4px;margin-bottom:8px;border-radius:999px;background:#b8860b"></div>' +
                '<p class="cod-geo-map__nombre" id="cod-geo-map-demo-nombre" style="margin:0 0 2px;font-size:16px;font-weight:700"></p>' +
                '<p class="cod-geo-map__meta" id="cod-geo-map-demo-categoria" style="margin:0;font-size:13px"></p>' +
                '<p class="cod-geo-map__meta" id="cod-geo-map-demo-distancia" style="margin:0;font-size:13px"></p>' +
                '<p class="cod-geo-map__descripcion" id="cod-geo-map-demo-descripcion" style="margin:6px 0 0;font-size:12px;line-height:1.4"></p>' +
                '<p class="cod-geo-map__meta" id="cod-geo-map-demo-contacto" style="margin:0;font-size:13px"></p>' +
                '</div>' +
                '<p class="cod-geo-map__attribution" style="position:absolute;left:12px;bottom:10px;margin:0;font-size:11px;background:rgba(255,255,255,.72);padding:2px 6px;border-radius:4px">© OpenStreetMap contributors (ODbL)</p>' +
                '</div>'
        },
        // Mapa de lotes/parcelas: ejemplo funcional con 4 lotes de muestra. Los
        // polígonos y estados reales se dibujan según el plano del proyecto; el
        // runtime sólo lee data-cod-parcel-* de cada <g class="lote">.
        {
            id: 'cod-parcel-map',
            label: 'Mapa de lotes/parcelas',
            category: 'ContOpe Design — Mapas',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
            content:
                '<div class="cod-parcel-map" data-cod-behavior="parcel-map" ' +
                'data-cod-parcel-item-selector=".lote" data-cod-parcel-id-attr="data-lote" data-cod-parcel-superficie="5.000 m²" ' +
                'data-cod-parcel-accent-disponible="#7d9a4b" data-cod-parcel-accent-vendido="#b5651d" data-cod-parcel-accent-empty="#d8d2c2" ' +
                'data-cod-parcel-panel="#cod-parcel-map-demo-panel" data-cod-parcel-accent="#cod-parcel-map-demo-accent" ' +
                'data-cod-parcel-field-n="#cod-parcel-map-demo-n" data-cod-parcel-field-estado="#cod-parcel-map-demo-estado" ' +
                'data-cod-parcel-field-sup="#cod-parcel-map-demo-sup" data-cod-parcel-field-val="#cod-parcel-map-demo-val" ' +
                'data-cod-parcel-count="#cod-parcel-map-demo-count" data-cod-parcel-count-secondary="#cod-parcel-map-demo-count-secondary" ' +
                'style="position:relative;width:100%;min-height:460px;overflow:hidden;background:#f6f4ee;border:1px solid #ddd6c8;border-radius:6px;color:#27312c">' +
                '<svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Plano de lotes de ejemplo" style="display:block;width:100%;height:100%">' +
                '<g class="lote" data-lote="L-01" data-cod-parcel-estado="disponible" data-cod-parcel-valor="145.000.000" style="cursor:pointer"><polygon points="60,80 280,80 270,220 70,210" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="160" y="155" text-anchor="middle" font-size="18" fill="#314d23">L-01</text></g>' +
                '<g class="lote" data-lote="L-02" data-cod-parcel-estado="vendido" data-cod-parcel-valor="—" style="cursor:pointer"><polygon points="300,80 520,80 510,220 310,210" fill="#e7d3c1" stroke="#b5651d" stroke-width="2"/><text x="405" y="155" text-anchor="middle" font-size="18" fill="#6b3f17">L-02</text></g>' +
                '<g class="lote" data-lote="L-03" data-cod-parcel-estado="disponible" data-cod-parcel-valor="138.000.000" style="cursor:pointer"><polygon points="60,260 280,260 270,400 70,390" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="160" y="335" text-anchor="middle" font-size="18" fill="#314d23">L-03</text></g>' +
                '<g class="lote" data-lote="L-04" data-cod-parcel-estado="disponible" data-cod-parcel-valor="152.000.000" style="cursor:pointer"><polygon points="300,260 520,260 510,400 310,390" fill="#dce7c8" stroke="#7d9a4b" stroke-width="2"/><text x="405" y="335" text-anchor="middle" font-size="18" fill="#314d23">L-04</text></g>' +
                '</svg>' +
                '<div style="position:absolute;top:12px;left:12px;padding:8px 12px;background:rgba(255,255,255,.86);border-radius:8px;font-size:13px"><strong id="cod-parcel-map-demo-count">0</strong> disponibles</div>' +
                '<div class="cod-parcel-map__panel" id="cod-parcel-map-demo-panel" data-empty="true" style="position:absolute;right:12px;bottom:12px;min-width:220px;padding:12px;background:rgba(255,255,255,.92);border-radius:8px">' +
                '<div class="cod-parcel-map__accent" id="cod-parcel-map-demo-accent" style="height:4px;margin-bottom:8px;border-radius:999px;background:#d8d2c2"></div>' +
                '<p style="margin:0 0 2px;font-size:16px;font-weight:700">Lote <span id="cod-parcel-map-demo-n"></span></p>' +
                '<p style="margin:0;font-size:13px">Estado: <span id="cod-parcel-map-demo-estado"></span></p>' +
                '<p style="margin:0;font-size:13px">Superficie: <span id="cod-parcel-map-demo-sup"></span></p>' +
                '<p style="margin:0;font-size:13px">Valor: <span id="cod-parcel-map-demo-val"></span></p>' +
                '<p style="margin:8px 0 0;font-size:13px;color:#5c635c">Disponibles: <span id="cod-parcel-map-demo-count-secondary">0</span></p>' +
                '</div>' +
                '</div>'
        },
        // Gráfico declarativo: el SVG visible es solo un placeholder para que
        // el bloque se vea en el canvas; el runtime lo reemplaza por el gráfico
        // real renderizado desde data-cod-chart-data (sin librerías externas).
        {
            id: 'cod-chart',
            label: 'Gráfico',
            category: 'ContOpe Design — Gráficos',
            media: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="10"/><line x1="10" y1="21" x2="10" y2="4"/><line x1="16" y1="21" x2="16" y2="14"/><line x1="3" y1="21" x2="21" y2="21"/></svg>',
            content:
                '<div class="cod-chart" data-cod-behavior="chart" ' +
                'data-cod-chart-type="bar" ' +
                'data-cod-chart-data="[{&quot;label&quot;:&quot;Ene&quot;,&quot;value&quot;:1200},{&quot;label&quot;:&quot;Feb&quot;,&quot;value&quot;:1800},{&quot;label&quot;:&quot;Mar&quot;,&quot;value&quot;:1400},{&quot;label&quot;:&quot;Abr&quot;,&quot;value&quot;:2200}]" ' +
                // Sin color propio: un gráfico recién insertado toma el acento
                // del set de diseño. Antes nacía con el azul del panel de
                // WordPress, y un bloque que nace con un color ajeno lo arrastra
                // para siempre, salvo que alguien se acuerde de cambiarlo.
                'data-cod-chart-axis-color="#5f6b7a" ' +
                'data-cod-chart-grid-color="rgba(0,0,0,.08)" data-cod-chart-label-color="#27312c" ' +
                'data-cod-chart-width="640" data-cod-chart-height="360" ' +
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
         *   canvasWidth       ancho REAL de escritorio en px (default: 1920).
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
         *   siteUrl           string — base pública del sitio (con barra final) para
         *                     vistas en iframe del canvas (opcional).
         *   oruganttForms     array — lista [{slug, title}] de formularios publicados
         *                     de Orugantt Forms; con lista vacía no se registra el
         *                     bloque "Formulario Orugantt" (opcional).
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

            // Ancho REAL de escritorio al que debe renderizar el iframe del
            // lienzo. El zoom-to-fit se aplica por encima con el mecanismo
            // nativo de GrapesJS (`editor.Canvas.setZoom`), de modo que el
            // documento se calcula siempre a este ancho y el navegador sólo
            // escala la presentación. Mantenemos `widthMedia` vacío en
            // desktop para que `getCurrentMedia()` no envuelva el CSS nuevo
            // en un `@media (max-width: …)` — el comportamiento histórico del
            // editor es CSS sin media query de escritorio.
            var canvasWidth = parseInt(options.canvasWidth, 10);
            if (isNaN(canvasWidth) || canvasWidth < 320) {
                canvasWidth = 1920;
            }

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
                blockManager: { blocks: blocks },
                deviceManager: {
                    default: 'desktop',
                    devices: [
                        { id: 'desktop', name: 'Desktop', width: canvasWidth + 'px', height: '1080px', widthMedia: '' },
                        { id: 'tablet', name: 'Tablet', width: '770px', height: '1024px', widthMedia: '992px' },
                        { id: 'mobileLandscape', name: 'Mobile landscape', width: '568px', height: '320px', widthMedia: '768px' },
                        { id: 'mobilePortrait', name: 'Mobile portrait', width: '320px', height: '568px', widthMedia: '480px' }
                    ]
                }
            });
            editor.Components.addType('cod-video', {
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
            editor.Components.addType('cod-luma-matte', {
                isComponent: function (element) {
                    return (
                        !!element &&
                        element.nodeType === 1 &&
                        typeof element.hasAttribute === 'function' &&
                        element.getAttribute('data-cod-luma-matte') === '1'
                    );
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['cod-luma-matte'],
                        droppable: false,
                        draggable: true
                    }
                }
            });
            editor.Components.addType('cod-dynamic', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.hasAttribute && element.hasAttribute('data-cod-dynamic')) {
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
            editor.Components.addType('cod-group', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('cod-group');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' cod-group ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['cod-group'],
                        droppable: true
                    }
                }
            });
            // Estructura estricta: Sección > Fila/contenedor de columnas >
            // Columna > Módulo. Las tres primeras capas no son editables.
            editor.Components.addType('cod-section', {
                isComponent: function (element) {
                    return !!(
                        element &&
                        element.nodeType === 1 &&
                        element.classList &&
                        element.classList.contains('cod-section')
                    );
                },
                model: {
                    defaults: {
                        tagName: 'section',
                        classes: ['cod-section'],
                        editable: false,
                        droppable: '.cod-columns'
                    }
                }
            });
editor.Components.addType('cod-columns', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('cod-columns');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' cod-columns ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['cod-columns'],
                        editable: false,
                        draggable: '.cod-section',
                        droppable: '.cod-column'
                    }
                }
            });
            editor.Components.addType('cod-column', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains('cod-column');
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' cod-column ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: ['cod-column'],
                        editable: false,
                        draggable: '.cod-columns',
                        droppable: true
                    }
                }
            });

            // ------------------------------------------------------------------
            // Grupo Dinámico (`cod-dynamic-group`): contenedor de tarjetas con
            // presets de layout por clase CSS. La repetición es manual (el editor
            // agrega/quita tarjetas), sin dependencia de ACF PRO.
            // ------------------------------------------------------------------
            var DYNAMIC_GROUP_LAYOUTS = ['grid-2', 'grid-3', 'grid-4', 'list', 'carousel'];
            var DYNAMIC_GROUP_BASE_CLASS = 'cod-dynamic-group';
            var DYNAMIC_GROUP_LAYOUT_PREFIX = 'cod-dynamic-group--';

            function dynamicGroupLayoutFromClasses(component) {
                if (!component || typeof component.getClasses !== 'function') {
                    return 'grid-2';
                }
                var classes = component.getClasses() || [];
                for (var i = 0; i < classes.length; i++) {
                    var className = classes[i];
                    if (className && className.indexOf(DYNAMIC_GROUP_LAYOUT_PREFIX) === 0) {
                        var layout = className.slice(DYNAMIC_GROUP_LAYOUT_PREFIX.length);
                        if (DYNAMIC_GROUP_LAYOUTS.indexOf(layout) !== -1) {
                            return layout;
                        }
                    }
                }
                return 'grid-2';
            }

            function applyDynamicGroupLayout(component, layout) {
                if (!component || typeof component.setClass !== 'function') {
                    return;
                }
                if (DYNAMIC_GROUP_LAYOUTS.indexOf(layout) === -1) {
                    layout = 'grid-2';
                }
                var classes = (component.getClasses && component.getClasses()) || [];
                var next = [];
                for (var i = 0; i < classes.length; i++) {
                    var className = classes[i];
                    if (
                        className !== DYNAMIC_GROUP_BASE_CLASS &&
                        className.indexOf(DYNAMIC_GROUP_LAYOUT_PREFIX) !== 0
                    ) {
                        next.push(className);
                    }
                }
                next.push(DYNAMIC_GROUP_BASE_CLASS);
                next.push(DYNAMIC_GROUP_LAYOUT_PREFIX + layout);
                component.setClass(next);
            }

            editor.Components.addType('cod-dynamic-group', {
                isComponent: function (element) {
                    if (!element || element.nodeType !== 1) {
                        return false;
                    }
                    if (element.hasAttribute && element.hasAttribute('data-cod-dynamic-group')) {
                        return true;
                    }
                    if (element.classList && element.classList.contains) {
                        return element.classList.contains(DYNAMIC_GROUP_BASE_CLASS);
                    }
                    return (' ' + (element.className || '') + ' ').indexOf(' ' + DYNAMIC_GROUP_BASE_CLASS + ' ') !== -1;
                },
                model: {
                    defaults: {
                        tagName: 'div',
                        classes: [DYNAMIC_GROUP_BASE_CLASS, 'cod-dynamic-group--grid-2'],
                        draggable: true,
                        droppable: true,
                        traits: [
                            {
                                type: 'select',
                                name: 'layout',
                                label: 'Layout',
                                changeProp: true,
                                options: [
                                    { id: 'grid-2', name: 'Grid 2 columnas' },
                                    { id: 'grid-3', name: 'Grid 3 columnas' },
                                    { id: 'grid-4', name: 'Grid 4 columnas' },
                                    { id: 'list', name: 'Lista (apilado vertical)' },
                                    { id: 'carousel', name: 'Carrusel (scroll horizontal)' }
                                ],
                                getValue: function (opts) {
                                    return dynamicGroupLayoutFromClasses(opts && opts.component);
                                }
                            },
                            {
                                type: 'button',
                                name: 'add-card',
                                label: 'Tarjetas',
                                text: '+ Agregar tarjeta',
                                full: true,
                                command: function (editor, trait) {
                                    var component = trait && trait.target ? trait.target : editor.getSelected();
                                    if (!component) {
                                        return;
                                    }
                                    var cards = component.components ? component.components() : null;
                                    var last = cards && cards.length ? cards.at(cards.length - 1) : null;
                                    if (!last || typeof last.clone !== 'function') {
                                        return;
                                    }
                                    component.append(last.clone());
                                }
                            }
                        ]
                    },
                    init: function () {
                        this.on('change:layout', this.handleDynamicGroupLayoutChange);
                    },
                    handleDynamicGroupLayoutChange: function (model, layout) {
                        applyDynamicGroupLayout(model || this, layout);
                    }
                }
            });

            // ------------------------------------------------------------------
            // OF-BRIDGE: bloque "Formulario Orugantt" (Orugantt Forms).
            // Solo se registra si el servidor envió formularios publicados.
            // El iframe de preview vive ÚNICAMENTE en la vista del canvas: no es
            // hijo del modelo, así que editor.getHtml() serializa solo el
            // marcador <div data-orugantt-form="{slug}" class="cod-orugantt-form">.
            // ------------------------------------------------------------------
            var oruganttForms = Array.isArray(options.oruganttForms) ? options.oruganttForms : [];
            var oruganttSiteUrl = typeof options.siteUrl === 'string' ? options.siteUrl : '';

            // Variables de diseño publicadas por el runtime de formularios.
            // El inspector arma sus controles con esta lista: si el runtime
            // suma una variable, aparece sola; si no hay lista, no hay
            // controles de diseño (mejor eso que perillas que no hacen nada).
            var oruganttFormTokens = Array.isArray(options.oruganttFormTokens)
                ? options.oruganttFormTokens.filter(function (t) {
                    return t && typeof t.key === 'string' && typeof t.token === 'string';
                })
                : [];

            /**
             * Traits de diseño, uno por variable. Las curadas van primero y
             * las avanzadas después, con el grupo en la etiqueta para que se
             * lean agrupadas aunque el inspector las muestre en una lista.
             */
            function oruganttThemeTraits() {
                var curadas = [];
                var avanzadas = [];
                oruganttFormTokens.forEach(function (token) {
                    var trait = {
                        // El prefijo evita chocar con traits existentes
                        // ('form', 'height') y con futuros atributos.
                        name: 'ofrtheme__' + token.key,
                        label: token.label,
                        type: token.type === 'color' ? 'color' : 'text'
                    };
                    if (token.type === 'length') {
                        trait.placeholder = 'ej. 12px';
                    } else if (token.type === 'font') {
                        trait.placeholder = 'ej. Montserrat, sans-serif';
                    }
                    if (token.curated) {
                        curadas.push(trait);
                    } else {
                        trait.label = '· ' + token.group + ': ' + token.label;
                        avanzadas.push(trait);
                    }
                });

                return curadas.concat(avanzadas);
            }
            if (oruganttForms.length > 0) {
                var oruganttFormChoices = oruganttForms
                    .map(function (form) {
                        var slug = String(form && form.slug ? form.slug : '');
                        return {
                            id: slug,
                            name: String(form && form.title ? form.title : slug)
                        };
                    })
                    .filter(function (choice) {
                        return choice.id !== '';
                    });

                if (oruganttFormChoices.length > 0) {
                    var oruganttFormFirstSlug = oruganttFormChoices[0].id;

                    function oruganttFormPreviewUrl(slug) {
                        if (!oruganttSiteUrl || !slug) {
                            return '';
                        }
                        return (
                            oruganttSiteUrl +
                            'index.php?ofr_render=' + encodeURIComponent(slug) +
                            '&ofr_ctx=canvas'
                        );
                    }

                    editor.BlockManager.add('cod-orugantt-form', {
                        label: 'Formulario Orugantt',
                        category: 'ContOpe Design — Formularios',
                        media:
                            '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" ' +
                            'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
                            '<rect x="4" y="4" width="16" height="16" rx="2"/>' +
                            '<path d="M8 9h8M8 12h8M8 15h5"/>' +
                            '</svg>',
                        content:
                            '<div data-orugantt-form="' + oruganttFormFirstSlug + '" class="cod-orugantt-form"></div>'
                    });

                    editor.Components.addType('cod-orugantt-form', {
                        isComponent: function (element) {
                            return (
                                !!element &&
                                element.nodeType === 1 &&
                                typeof element.hasAttribute === 'function' &&
                                element.hasAttribute('data-orugantt-form')
                            );
                        },
                        model: {
                            defaults: {
                                tagName: 'div',
                                draggable: true,
                                droppable: false,
                                traits: [
                                    {
                                        type: 'select',
                                        name: 'form',
                                        label: 'Formulario',
                                        options: oruganttFormChoices,
                                        default: oruganttFormFirstSlug
                                    },
                                    {
                                        type: 'number',
                                        name: 'height',
                                        label: 'Alto del formulario (px)',
                                        min: 240,
                                        default: 620
                                    }
                                ].concat(oruganttThemeTraits())
                            },
                            init: function () {
                                this.on('change:form', this.handleOruganttFormTraitChange);
                                // Un solo escucha para todas las variables de
                                // diseño: cambiar cualquiera reescribe la regla
                                // completa del formulario.
                                oruganttFormTokens.forEach(function (token) {
                                    this.on('change:ofrtheme__' + token.key, this.applyOruganttTheme);
                                }, this);
                            },

                            /**
                             * Escribe las variables como una regla CSS real del
                             * documento.
                             *
                             * POR QUÉ NO BASTA CON EL ESTILO DEL PROPIO NODO:
                             * el runtime del formulario declara sus valores por
                             * defecto sobre `.ofr-form`, que está DENTRO de este
                             * contenedor. Una variable puesta en el contenedor
                             * se hereda, pero una declaración sobre el propio
                             * elemento siempre gana sobre lo heredado. Por eso
                             * la regla apunta al elemento interno.
                             */
                            applyOruganttTheme: function () {
                                if (!editor || !editor.Css || oruganttFormTokens.length === 0) {
                                    return;
                                }
                                var declaraciones = {};
                                var hayAlguna = false;
                                oruganttFormTokens.forEach(function (token) {
                                    var valor = this.get('ofrtheme__' + token.key);
                                    if (typeof valor === 'string' && valor.trim() !== '') {
                                        declaraciones[token.token] = valor.trim();
                                        hayAlguna = true;
                                    }
                                }, this);

                                var id = typeof this.getId === 'function' ? this.getId() : '';
                                if (id === '') {
                                    return;
                                }
                                var selector = '#' + id + ' .ofr-form';
                                if (!hayAlguna) {
                                    // Sin ninguna variable puesta, la regla se
                                    // vacía en vez de quedar como resto muerto.
                                    editor.Css.setRule(selector, {});
                                    return;
                                }
                                editor.Css.setRule(selector, declaraciones);
                            },
                            handleOruganttFormTraitChange: function (model, value) {
                                // El trait 'form' vive como atributo del modelo; el
                                // marcador persistido usa data-orugantt-form.
                                var slug = String(value || '');
                                var attributes = model.getAttributes ? model.getAttributes() : {};
                                if (slug !== '' && attributes['data-orugantt-form'] !== slug) {
                                    model.addAttributes({ 'data-orugantt-form': slug });
                                }
                            }
                        },
                        view: {
                            // El iframe es decoración SOLO del canvas: se inyecta
                            // como nodo DOM de la vista, nunca como componente hijo.
                            init: function () {
                                // En GrapesJS 0.23 el set de attributes dispara
                                // 'change:attributes' (no hay evento por atributo
                                // individual), así que se escucha el genérico; el
                                // render es idempotente (compara src y alto).
                                this.listenTo(
                                    this.model,
                                    'change:attributes',
                                    this.renderOruganttFormPreview
                                );
                                this.listenTo(
                                    this.model,
                                    'change:height',
                                    this.renderOruganttFormPreview
                                );

                                // Documento cargado desde HTML: sincroniza el trait
                                // "form" con el slug real del marcador (el default
                                // del trait es el primer slug de la lista).
                                var attributes = this.model.getAttributes ? this.model.getAttributes() : {};
                                var slug = String(attributes['data-orugantt-form'] || '');
                                if (slug !== '' && this.model.get('form') !== slug) {
                                    this.model.set('form', slug, { silent: true });
                                }

                                // Documento guardado: los controles de diseño
                                // deben mostrar lo que la regla ya dice, o el
                                // primer cambio borraría el resto del tema.
                                if (oruganttFormTokens.length > 0 && editor && editor.Css) {
                                    var id = this.model.getId ? this.model.getId() : '';
                                    if (id !== '') {
                                        var regla = editor.Css.getRule('#' + id + ' .ofr-form');
                                        var estilo = regla && typeof regla.getStyle === 'function' ? regla.getStyle() : null;
                                        if (estilo) {
                                            oruganttFormTokens.forEach(function (token) {
                                                var valor = estilo[token.token];
                                                if (typeof valor === 'string' && valor !== '') {
                                                    this.model.set('ofrtheme__' + token.key, valor, { silent: true });
                                                }
                                            }, this);
                                        }
                                    }
                                }
                            },
                            onRender: function () {
                                this.renderOruganttFormPreview();
                            },
                            onActive: function () {
                                if (this.el && this.el.classList) {
                                    this.el.classList.add('is-cod-selected');
                                }
                            },
                            onInactive: function () {
                                if (this.el && this.el.classList) {
                                    this.el.classList.remove('is-cod-selected');
                                }
                            },
                            renderOruganttFormPreview: function () {
                                var model = this.model;
                                var attributes = model.getAttributes ? model.getAttributes() : {};
                                var slug = String(attributes['data-orugantt-form'] || '');
                                var height = parseInt(model.get('height'), 10);
                                // Mismo umbral mínimo que el trait (240): por
                                // debajo se vuelve al default.
                                if (!isFinite(height) || height < 240) {
                                    height = 620;
                                }

                                var iframe = this.oruganttFormPreviewEl;
                                if (!iframe || !iframe.parentNode) {
                                    iframe = document.createElement('iframe');
                                    this.oruganttFormPreviewEl = iframe;
                                    this.el.appendChild(iframe);
                                }
                                iframe.setAttribute('title', 'Formulario Orugantt');
                                iframe.style.height = height + 'px';

                                var src = oruganttFormPreviewUrl(slug);
                                // Sin slug (atributo borrado a mano): se limpia el
                                // iframe para no dejar una preview obsoleta.
                                if (src === '') {
                                    iframe.removeAttribute('src');
                                    iframe.style.display = 'none';
                                } else {
                                    iframe.style.display = '';
                                    if (iframe.getAttribute('src') !== src) {
                                        iframe.setAttribute('src', src);
                                    }
                                }
                            }
                        }
                    });
                }
            }

            function isOcdGroup(component) {
                if (!component) {
                    return false;
                }
                if (component.get && component.get('type') === 'cod-group') {
                    return true;
                }
                var classes = component.getClasses ? component.getClasses() : [];
                return classes.indexOf('cod-group') !== -1;
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
                    type: 'cod-group',
                    tagName: 'div',
                    classes: ['cod-group'],
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
                status('Módulos agrupados en un contenedor .cod-group.', 'ok');
                return group;
            }

            function ungroupSelected() {
                var group = editor.getSelected();
                if (!isOcdGroup(group)) {
                    status('Selecciona un grupo .cod-group para desagrupar.', 'error');
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

            editor.Commands.add('cod-group:group', { run: groupSelected });
            editor.Commands.add('cod-group:ungroup', { run: ungroupSelected });
            editor.Keymaps.add('cod-group:group', 'ctrl+g', 'cod-group:group');
            editor.Keymaps.add('cod-group:ungroup', 'ctrl+shift+g', 'cod-group:ungroup');

            function createGroupControls(mountNode) {
                var head = mountNode;
                if (!head) {
                    return null;
                }
                var section = document.createElement('section');
                section.className = 'cod-groups';

                var title = document.createElement('div');
                title.className = 'cod-groups__title';
                var titleText = document.createElement('span');
                titleText.textContent = 'Grupos de módulos';
                var target = document.createElement('span');
                target.className = 'cod-groups__target';
                title.appendChild(titleText);
                title.appendChild(target);

                var row = document.createElement('div');
                row.className = 'cod-groups__row';
                var groupButton = document.createElement('button');
                groupButton.type = 'button';
                groupButton.textContent = 'Agrupar selección';
                var ungroupButton = document.createElement('button');
                ungroupButton.type = 'button';
                ungroupButton.textContent = 'Desagrupar';
                row.appendChild(groupButton);
                row.appendChild(ungroupButton);

                var hint = document.createElement('div');
                hint.className = 'cod-groups__hint';
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
                        ? '.cod-group'
                        : selectedAll.length
                            ? selectedAll.length + (selectedAll.length === 1 ? ' módulo' : ' módulos')
                            : 'sin selección';
                }

                groupButton.addEventListener('click', function () {
                    editor.runCommand('cod-group:group');
                });
                ungroupButton.addEventListener('click', function () {
                    editor.runCommand('cod-group:ungroup');
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

            var CSS_OVERRIDES_MARKER = '/* COD-CANVAS-EDITABLE-OVERRIDES */';
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

            var gridApi = window.OCDCanvasGrid.plugin(editor);
            var behaviorApi = window.OcdBehaviors.grapesjsPlugin(editor, {
                threshold: 40,
                editorPreview: true
            });
            var inspector = inspectorMount
                ? window.OCDComputedInspector.create(editor, { mount: inspectorMount })
                : null;

            // gridControlsMount/groupControlsMount se resuelven RECIEN ACA,
            // despues de crear el inspector: apuntan a ".cod-ci__head", un
            // elemento que el propio OCDComputedInspector.create() recien
            // construye arriba. Bug encontrado 2026-08-21: antes,
            // cod-canvas-editor.js resolvia ese selector con
            // document.querySelector() de entrada, ANTES de que el inspector
            // existiera, asi que siempre llegaba null y ni los controles de
            // grilla (con los manejadores para arrastrar el borde entre
            // columnas) ni los de grupo se llegaban a montar nunca.
            var gridControlsMount = resolveMount(options.gridControlsMount);
            var groupControlsMount = resolveMount(options.groupControlsMount);
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
                    tieneMarcador: marker !== -1,
                    source: marker === -1 ? css : css.slice(0, marker).trimEnd(),
                    overrides: marker === -1 ? '' : dedupeCssRules(css.slice(marker + CSS_OVERRIDES_MARKER.length).trim())
                };
            }

            /**
             * Recorre el CSS por bloques de primer nivel contando llaves.
             *
             * Partir por "}" —como hacía la versión anterior— funciona hasta
             * que aparece un @media, que termina en "}}": se perdía la llave
             * de cierre y TODO lo que venía después quedaba encerrado dentro
             * de esa consulta de medios. Reglas de escritorio convertidas en
             * reglas de un solo ancho, sin ningún error a la vista. Medido
             * sobre los cuatro documentos de Santa Luisa: la portada perdía
             * 16 llaves, una por cada @media.
             */
            function bloquesDeCss(css) {
                var texto = String(css || '');
                var salida = [];
                var i = 0;
                while (i < texto.length) {
                    var abre = texto.indexOf('{', i);
                    if (abre < 0) {
                        break;
                    }
                    var profundidad = 1;
                    var j = abre + 1;
                    while (j < texto.length && profundidad > 0) {
                        if (texto[j] === '{') {
                            profundidad += 1;
                        } else if (texto[j] === '}') {
                            profundidad -= 1;
                        }
                        j += 1;
                    }
                    var bloque = texto.slice(i, j).trim();
                    if (bloque !== '' && bloque.indexOf('{') !== -1) {
                        salida.push(bloque);
                    }
                    i = j;
                }
                return salida;
            }

            /** Dos reglas idénticas salvo espacios son la misma regla. */
            function claveDeRegla(regla) {
                return String(regla).replace(/\s+/g, '');
            }

            /**
             * Bug de larga data (encontrado 2026-08-21): setStyle() cargaba
             * sourceCss DENTRO del composer de GrapesJS ademas de guardarlo
             * aparte como prefijo -- cada ciclo de abrir->guardar sumaba una
             * copia mas de las reglas base (reset, body, html, el SVG del
             * logo) dentro de "overrides". Un documento con muchos ciclos
             * llego a tener la misma regla repetida 10-20 veces, superando
             * el limite de tamano. Esto limpia duplicados conservando solo la
             * primera aparicion, sin tocar reglas distintas aunque compartan
             * selector (esas SI pueden ser cascada intencional).
             *
             * Dentro de un @media se deduplica aparte: la misma regla en dos
             * anchos distintos no es una copia.
             */
            function dedupeCssRules(css) {
                if (!css) {
                    return css;
                }
                var vistas = Object.create(null);
                var salida = [];
                var bloques = bloquesDeCss(css);
                for (var i = 0; i < bloques.length; i++) {
                    var bloque = bloques[i];
                    var anidado = bloque.match(/^(@[^{]*\{)([\s\S]*)\}$/);
                    if (anidado) {
                        bloque = anidado[1] + dedupeCssRules(anidado[2]) + '}';
                    }
                    var clave = claveDeRegla(bloque);
                    if (vistas[clave]) {
                        continue;
                    }
                    vistas[clave] = true;
                    salida.push(bloque);
                }
                return salida.join('');
            }

            /**
             * Quita de "a" las reglas que "b" ya trae, comparando sin espacios.
             *
             * Hace falta cuando la hoja guardada NO lleva el marcador: ahí todo
             * el contenido se toma como CSS fuente, pero GrapesJS reexporta por
             * su cuenta las mismas reglas desde projectData, y al guardar la
             * hoja queda dos veces. Le pasa a cualquier documento cuyo último
             * guardado vino del runner o del MCP, que escriben la hoja plana.
             */
            function restarReglasConocidas(a, b) {
                var conocidas = Object.create(null);
                var deB = bloquesDeCss(b);
                for (var k = 0; k < deB.length; k++) {
                    conocidas[claveDeRegla(deB[k])] = true;
                }
                var salida = [];
                var deA = bloquesDeCss(a);
                for (var i = 0; i < deA.length; i++) {
                    if (!conocidas[claveDeRegla(deA[i])]) {
                        salida.push(deA[i]);
                    }
                }
                return salida.join('\n');
            }

            function serializedCss() {
                // Las reglas base del Grupo Dinámico NO se escriben acá.
                //
                // Hasta la 0.3.22 este método pegaba en el documento, en cada
                // guardado, las reglas que collectDynamicGroupCss() raspaba de
                // la hoja del admin — encima de un sourceCss que ya traía la
                // copia del guardado anterior. Una copia por ciclo: la portada
                // de Santa Luisa llegó a tener cada una siete veces. Se había
                // tapado deduplicando al serializar, que limpia el resultado
                // pero no impide que se siga copiando, y encima no alcanza a
                // los guardados del runner ni del MCP, que escriben la hoja
                // plana. Ver la issue #12.
                //
                // Ahora las emite el plugin en la página publicada
                // (COD_Canvas_Page_Publisher::dynamic_group_css), antes del CSS
                // del documento, así que el documento lleva sólo lo del
                // usuario. ensureDynamicGroupCss() las sigue inyectando en el
                // lienzo del editor: eso es para ver, no se guarda.
                //
                // La deduplicación queda como red, no como solución: hay
                // documentos guardados que todavía arrastran las copias viejas.
                return dedupeCssRules(sourceCss.trimEnd()) + '\n\n' + CSS_OVERRIDES_MARKER + '\n' + dedupeCssRules(editor.getCss() || '');
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
                var style = head.querySelector('style[data-cod-source-css]');
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-cod-source-css', 'preserved');
                    head.prepend(style);
                }
                style.textContent = sourceCss;

                // El CSS fuente debe quedar DESPUÉS del CSS de fuentes para ganar
                // la cascada: las reglas del documento anulan los estilos del sitio.
                var fontStyle = head.querySelector('style[data-cod-site-css]');
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
                var style = head.querySelector('style[data-cod-theme-css]');
                if (!themeDefinitionsCss) {
                    if (style) {
                        style.parentNode.removeChild(style);
                    }
                    return;
                }
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-cod-theme-css', 'definitions');
                    head.prepend(style);
                }
                style.textContent = themeDefinitionsCss;

                // El CSS base del tema debe quedar ANTES del CSS de fuentes y del
                // CSS fuente para perder la cascada: las reglas base del tema son
                // la capa más débil y las del documento la anulan.
                var fontStyle = head.querySelector('style[data-cod-site-css]');
                var sourceStyle = head.querySelector('style[data-cod-source-css]');
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
                var style = head.querySelector('style[data-cod-site-css]');
                if (!siteFontCss) {
                    if (style) {
                        style.parentNode.removeChild(style);
                    }
                    return;
                }
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-cod-site-css', 'fonts');
                    // Antes del CSS fuente para que el documento gane en cascada;
                    // si aún no hay CSS fuente, se antepone al <head>.
                    var sourceStyle = head.querySelector('style[data-cod-source-css]');
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
             * dinámicos y del marcador del formulario Orugantt. Se leen de
             * `cod-canvas-editor.css` (la hoja administrativa cargada en la página)
             * y se copian a un `<style>` del canvas; nunca forman parte del CSS del
             * documento ni del CSS exportado.
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
                        if (/cod-dynamic-placeholder|cod-dynamic-post-title|cod-dynamic-post-excerpt|cod-dynamic-featured-image|cod-dynamic-permalink|cod-orugantt-form/.test(text)) {
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
                var style = canvasDocument.head.querySelector('style[data-cod-editor-css]');
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-cod-editor-css', 'cod-canvas-editor');
                    canvasDocument.head.appendChild(style);
                }
                style.textContent = css;
            }

            /**
             * Recolecta las reglas funcionales del Grupo Dinámico desde
             * `cod-canvas-editor.css` (misma estrategia que los tokens dinámicos)
             * para poder aplicarlas en el iframe del canvas. A diferencia de los
             * placeholders, estas reglas SÍ se exportan: `serializedCss()` las
             * incorpora al CSS del documento para que el layout funcione publicado.
             */
            function collectDynamicGroupCss() {
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
                        if (/cod-dynamic-group/.test(text)) {
                            css += text + '\n';
                        }
                    }
                }
                return css;
            }

            function ensureDynamicGroupCss() {
                var canvasDocument = editor.Canvas.getDocument();
                if (!canvasDocument || !canvasDocument.head) {
                    return;
                }
                var css = collectDynamicGroupCss();
                if (!css) {
                    return;
                }
                var style = canvasDocument.head.querySelector('style[data-cod-dynamic-group-css]');
                if (!style) {
                    style = canvasDocument.createElement('style');
                    style.setAttribute('data-cod-dynamic-group-css', 'layout');
                    canvasDocument.head.appendChild(style);
                }
                style.textContent = css;
            }

            function installCanvasLumaRuntime() {
                if (
                    !window.OcdLumaMatteVideo ||
                    typeof window.OcdLumaMatteVideo.createRuntime !== 'function'
                ) {
                    return;
                }
                if (!editor.Canvas || typeof editor.Canvas.getDocument !== 'function') {
                    return;
                }
                var canvasDocument = null;
                try {
                    canvasDocument = editor.Canvas.getDocument();
                } catch (_error) {
                    return;
                }
                if (!canvasDocument) {
                    return;
                }
                var canvasWindow =
                    canvasDocument.defaultView ||
                    (typeof editor.Canvas.getWindow === 'function' ? editor.Canvas.getWindow() : null);
                if (!canvasWindow) {
                    return;
                }
                try {
                    window.OcdLumaMatteVideo.createRuntime({
                        window: canvasWindow,
                        document: canvasDocument
                    });
                } catch (_error) {
                    // La composición es progresiva: si el iframe todavía no está
                    // listo, no debe bloquear el resto de la presentación.
                }
            }

            /**
             * Instala en el iframe del canvas el runtime de interacciones
             * (`data-cod-interaction`). Mismo patrón dual que el luma matte:
             * el mismo motor que corre publicado se ejecuta acá para previsualizar.
             */
            function installCanvasInteractionsRuntime() {
                if (
                    !window.OcdInteractions ||
                    typeof window.OcdInteractions.createRuntime !== 'function'
                ) {
                    return;
                }
                if (!editor.Canvas || typeof editor.Canvas.getDocument !== 'function') {
                    return;
                }
                var canvasDocument = null;
                try {
                    canvasDocument = editor.Canvas.getDocument();
                } catch (_error) {
                    return;
                }
                if (!canvasDocument) {
                    return;
                }
                var canvasWindow =
                    canvasDocument.defaultView ||
                    (typeof editor.Canvas.getWindow === 'function' ? editor.Canvas.getWindow() : null);
                if (!canvasWindow) {
                    return;
                }
                try {
                    window.OcdInteractions.createRuntime({
                        window: canvasWindow,
                        document: canvasDocument
                    });
                } catch (_error) {
                    // Progresivo: si el iframe todavía no está listo, se reintenta
                    // en el próximo refresco de presentación.
                }
            }

            function refreshPresentation() {
                ensureSiteFontCss();
                ensureSourceCss();
                ensureThemeDefinitionsCss();
                ensureDynamicPlaceholderCss();
                ensureDynamicGroupCss();
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
                installCanvasLumaRuntime();
                installCanvasInteractionsRuntime();
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
                // sourceCss NO va acá: ensureSourceCss() ya lo inyecta directo
                // en el iframe del canvas por separado. Meterlo tambien en el
                // composer de GrapesJS (via setStyle) era la causa real de la
                // duplicacion -- serializedCss() lo vuelve a agregar como
                // prefijo al guardar, así que quedaba dos veces, y cada ciclo
                // de abrir->guardar sumaba una copia mas.
                editor.setStyle(css.overrides || '');
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
                        // La fuente del CSS es projectData y ninguna otra.
                        // Decisión de Cristóbal, 2026-09-16. Antes la hoja
                        // plana guardada se tomaba como «CSS fuente» y se
                        // volvía a escribir al guardar; eso es una segunda
                        // fuente y por ahí entró la duplicación de la #12.
                        //
                        // Se resta SIEMPRE lo que el modelo ya conoce, no
                        // sólo cuando falta el marcador. En un documento
                        // migrado eso deja la hoja en nada, que es el fin
                        // buscado: el CSS sale del JSON.
                        sourceCss = restarReglasConocidas(sourceCss, editor.getCss() || '');

                        // Lo que sobra es CSS que el modelo NO tiene. No se
                        // tira en silencio —sería perder estilos de un sitio
                        // publicado— pero tampoco se acepta callado: se
                        // conserva y se avisa, para que se migre al JSON.
                        if (sourceCss.trim() !== '') {
                            var sobrantes = bloquesDeCss(sourceCss).length;
                            status(
                                'Aviso: ' + sobrantes + ' regla(s) de CSS guardadas no están en los datos ' +
                                'estructurados. Se conservan, pero deberían migrarse: mientras vivan sólo en ' +
                                'la hoja, nadie las puede editar desde el lienzo.'
                            );
                        }
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
                    // Distinguir "documento nuevo o vacío" de "documento con el
                    // árbol ILEGIBLE". El segundo caso se reconstruía en
                    // silencio, y eso esconde un daño real: pasó con la portada
                    // de Santa Luisa, cuyo projectData quedó sin las barras de
                    // escape y no era JSON válido (2026-09-08). Reconstruir
                    // está bien; callarlo, no.
                    if (typeof (doc && doc.projectData) === 'string' && doc.projectData !== '' && !project) {
                        status(
                            'Atención: los datos estructurados de este documento están dañados y no se pudieron leer. ' +
                                'El lienzo se reconstruyó desde el HTML y el CSS guardados, que están intactos. ' +
                                'Al guardar quedarán reparados.',
                            'error'
                        );
                    }
                }
                behaviorApi.refresh();
                gridApi.scan();
                window.requestAnimationFrame(function () {
                    ensureSiteFontCss();
                    ensureSourceCss();
                    ensureThemeDefinitionsCss();
                    // No se auto-selecciona nada al cargar: en la vista ensamblada
                    // de página esto hacía que el header quedara seleccionado (y su
                    // panel de estados abierto) apenas se entraba al editor, sin que
                    // el usuario hubiera tocado nada.
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
                    installCanvasLumaRuntime();
                    installCanvasInteractionsRuntime();
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
