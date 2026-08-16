(function (window, document) {
    'use strict';

    function compensateWordPressAdminBar(root) {
        var bar = document.getElementById('wpadminbar');
        if (!bar || !document.body.classList.contains('admin-bar')) return;

        var offset = bar.getBoundingClientRect().height || bar.offsetHeight || 32;
        root.querySelectorAll('*').forEach(function (node) {
            var style = window.getComputedStyle(node);
            var top = Number.parseFloat(style.top);
            if (style.position === 'fixed' && Number.isFinite(top) && Math.abs(top) < 1) {
                node.style.setProperty('top', offset + 'px', 'important');
                node.setAttribute('data-ocd-admin-bar-offset', String(offset));
            }
        });
    }

    function activateAutoplayVideos(root) {
        root.querySelectorAll('video[autoplay]').forEach(function (video) {
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            installSoundToggle(video);
            var playback = video.play();
            if (playback && typeof playback.catch === 'function') {
                playback.catch(function () {
                    // El navegador puede mantener otras políticas de ahorro;
                    // el video conserva controles/estado definidos por el diseño.
                });
            }
        });
    }

    function installSoundToggle(video) {
        if (video.getAttribute('data-ocd-sound-toggle') === 'installed') return;

        var container = video.parentElement;
        if (!container) return;

        video.setAttribute('data-ocd-sound-toggle', 'installed');
        container.classList.add('ocd-video-sound-container');

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'ocd-video-sound-toggle';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', 'Activar sonido ambiental');
        button.innerHTML = '<span aria-hidden="true">&#128263;</span><span>Activar sonido</span>';

        button.addEventListener('click', function () {
            var enableSound = video.muted;
            video.muted = !enableSound;
            video.defaultMuted = !enableSound;
            if (enableSound) video.removeAttribute('muted');
            else video.setAttribute('muted', '');

            button.setAttribute('aria-pressed', enableSound ? 'true' : 'false');
            button.setAttribute('aria-label', enableSound ? 'Silenciar sonido ambiental' : 'Activar sonido ambiental');
            button.innerHTML = enableSound
                ? '<span aria-hidden="true">&#128266;</span><span>Silenciar</span>'
                : '<span aria-hidden="true">&#128263;</span><span>Activar sonido</span>';

            var playback = video.play();
            if (playback && typeof playback.catch === 'function') playback.catch(function () {});
        });

        container.appendChild(button);
    }

    function installSoundToggleStyles() {
        if (document.getElementById('ocd-video-sound-toggle-styles')) return;
        var style = document.createElement('style');
        style.id = 'ocd-video-sound-toggle-styles';
        style.textContent = [
            '.ocd-video-sound-container{position:relative}',
            '.ocd-video-sound-toggle{position:absolute;right:1rem;bottom:1rem;z-index:20;display:inline-flex;align-items:center;gap:.5rem;padding:.65rem .9rem;border:1px solid rgba(255,255,255,.58);border-radius:999px;background:rgba(20,20,20,.68);color:#fff;font:600 13px/1.2 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 18px rgba(0,0,0,.2)}',
            '.ocd-video-sound-toggle:hover{background:rgba(20,20,20,.84)}',
            '.ocd-video-sound-toggle:focus-visible{outline:3px solid #fff;outline-offset:3px}',
            '@media (max-width:600px){.ocd-video-sound-toggle{right:.65rem;bottom:.65rem}.ocd-video-sound-toggle span:last-child{display:none}}'
        ].join('');
        document.head.appendChild(style);
    }

    function parseClass(raw, fallback) {
        var value = String(raw == null ? '' : raw).trim();
        return value === '' ? fallback : value;
    }

    function parseIndex(raw, fallback) {
        var n = Number.parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    }

    function parseThreshold(raw, fallback) {
        var n = Number.parseFloat(raw);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    }

    function installScrollThreshold(nodes) {
        Array.prototype.forEach.call(nodes, function (node) {
            var threshold = Number.parseFloat(node.getAttribute('data-ocd-scroll-threshold') || '40');
            if (!Number.isFinite(threshold) || threshold < 0) threshold = 40;
            var scrolledClass = parseClass(node.getAttribute('data-ocd-scrolled-class'), 'nav--scrolled');
            function update() {
                node.classList.toggle(scrolledClass, window.scrollY > threshold);
            }
            update();
            window.addEventListener('scroll', update, { passive: true });
            window.addEventListener('resize', update, { passive: true });
        });
    }

    // reveal-on-scroll: agrega la clase una sola vez cuando el elemento entra
    // en el viewport y deja de observar. Sin IntersectionObserver, revela de
    // inmediato en vez de dejar contenido invisible para siempre.
    function installReveal(nodes) {
        var hasIO = typeof window.IntersectionObserver === 'function';
        var observer = hasIO
            ? new window.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var element = entry.target;
                    var revealClass = parseClass(element.getAttribute('data-ocd-reveal-class'), 'is-revealed');
                    element.classList.add(revealClass);
                    observer.unobserve(element);
                });
            }, { threshold: 0.15 })
            : null;
        Array.prototype.forEach.call(nodes, function (element) {
            var revealClass = parseClass(element.getAttribute('data-ocd-reveal-class'), 'is-revealed');
            if (!hasIO) {
                element.classList.add(revealClass);
                return;
            }
            observer.observe(element);
        });
    }

    function installNavToggle(nodes) {
        Array.prototype.forEach.call(nodes, function (button) {
            var targetSelector = String(button.getAttribute('data-ocd-toggle-target') || '').trim();
            if (!targetSelector) return;
            var target = null;
            try { target = document.querySelector(targetSelector); } catch (error) { return; }
            if (!target) return;

            var toggleClass = parseClass(button.getAttribute('data-ocd-toggle-class'), 'is-menu-open');
            var selfClass = parseClass(button.getAttribute('data-ocd-toggle-self-class'), '');

            function apply(isOpen) {
                target.classList.toggle(toggleClass, isOpen);
                if (selfClass) button.classList.toggle(selfClass, isOpen);
                button.setAttribute('aria-expanded', String(isOpen));
            }
            button.setAttribute('aria-expanded', String(target.classList.contains(toggleClass)));
            button.addEventListener('click', function (event) {
                if (event && typeof event.preventDefault === 'function') event.preventDefault();
                apply(!target.classList.contains(toggleClass));
            });
            target.addEventListener('click', function (event) {
                var element = event && event.target;
                if (!element || typeof element.closest !== 'function') return;
                var link = element.closest('a[href]');
                if (link) apply(false);
            });
        });
    }

    // Modo "track": desliza una tira con varias fotos visibles a la vez
    // (transform translateX medido de la separación real entre slides), en
    // vez de mostrar/ocultar un slide a la vez. Es el patrón de la galería
    // real del sitio (4 fotos visibles, 2 en mobile).
    function installCarouselTrack(root) {
        var trackSelector = parseClass(root.getAttribute('data-ocd-carousel-track-selector'), '.ocd-carousel__track');
        var slideSelector = parseClass(root.getAttribute('data-ocd-carousel-slide-selector'), '.ocd-carousel__slide');
        var visible = parseIndex(root.getAttribute('data-ocd-carousel-visible'), 1) || 1;
        var visibleMobileRaw = root.getAttribute('data-ocd-carousel-visible-mobile');
        var visibleMobile = visibleMobileRaw ? parseIndex(visibleMobileRaw, visible) : visible;
        var breakpoint = parseIndex(root.getAttribute('data-ocd-carousel-mobile-breakpoint'), 860);

        var track = null;
        try { track = root.querySelector(trackSelector); } catch (error) { return; }
        if (!track) return;
        var slides = [];
        try { slides = Array.prototype.slice.call(track.querySelectorAll(slideSelector)); } catch (error) { return; }
        if (!slides.length) return;

        var nextButton = root.querySelector('[data-ocd-carousel-next]');
        var previousButton = root.querySelector('[data-ocd-carousel-prev]');
        var index = 0;

        function visibleCount() { return window.innerWidth <= breakpoint ? visibleMobile : visible; }
        function maxIndex() { return Math.max(0, slides.length - visibleCount()); }
        function slideStep() {
            if (slides.length < 2) return slides[0].getBoundingClientRect().width;
            return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
        }
        function update() {
            var step = slideStep();
            track.style.transform = 'translateX(' + (-index * step) + 'px)';
            if (previousButton) previousButton.disabled = index <= 0;
            if (nextButton) nextButton.disabled = index >= maxIndex();
        }
        if (nextButton) {
            nextButton.addEventListener('click', function (event) {
                if (event && typeof event.preventDefault === 'function') event.preventDefault();
                index = Math.min(maxIndex(), index + 1);
                update();
            });
        }
        if (previousButton) {
            previousButton.addEventListener('click', function (event) {
                if (event && typeof event.preventDefault === 'function') event.preventDefault();
                index = Math.max(0, index - 1);
                update();
            });
        }
        window.addEventListener('resize', function () {
            index = Math.min(index, maxIndex());
            update();
        }, { passive: true });
        update();
    }

    function installCarousel(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            if (root.getAttribute('data-ocd-carousel-mode') === 'track') {
                installCarouselTrack(root);
                return;
            }
            var slideSelector = parseClass(root.getAttribute('data-ocd-carousel-slide-selector'), '.ocd-carousel__slide');
            var activeClass = parseClass(root.getAttribute('data-ocd-carousel-active-class'), 'is-active');
            var start = parseIndex(root.getAttribute('data-ocd-carousel-start'), 0);
            var slides = [];
            try { slides = Array.prototype.slice.call(root.querySelectorAll(slideSelector)); } catch (error) { return; }
            if (!slides.length) return;

            var current = start < slides.length ? start : 0;
            var nextButton = root.querySelector('[data-ocd-carousel-next]');
            var previousButton = root.querySelector('[data-ocd-carousel-prev]');
            var dotsHost = root.querySelector('[data-ocd-carousel-dots]');
            if (!dotsHost && root.hasAttribute('data-ocd-carousel-dots')) dotsHost = root;
            var dots = [];
            if (dotsHost) {
                dots = Array.prototype.slice.call(dotsHost.querySelectorAll('[data-ocd-carousel-dot]'));
                if (!dots.length) {
                    for (var i = 0; i < slides.length; i++) {
                        var dot = document.createElement('button');
                        dot.type = 'button';
                        dot.className = 'ocd-carousel__dot';
                        dot.setAttribute('data-ocd-carousel-dot', '');
                        dotsHost.appendChild(dot);
                        dots.push(dot);
                    }
                }
            }

            function show(index) {
                current = ((index % slides.length) + slides.length) % slides.length;
                slides.forEach(function (slide, slideIndex) {
                    var active = slideIndex === current;
                    if (active) {
                        if (slide.style && typeof slide.style.removeProperty === 'function') slide.style.removeProperty('display');
                        slide.removeAttribute('hidden');
                        slide.classList.add(activeClass);
                        slide.setAttribute('aria-hidden', 'false');
                    } else {
                        if (slide.style && typeof slide.style.setProperty === 'function') slide.style.setProperty('display', 'none', 'important');
                        slide.setAttribute('hidden', '');
                        slide.classList.remove(activeClass);
                        slide.setAttribute('aria-hidden', 'true');
                    }
                });
                dots.forEach(function (dot, dotIndex) {
                    dot.classList.toggle(activeClass, dotIndex === current);
                    dot.setAttribute('aria-selected', dotIndex === current ? 'true' : 'false');
                });
            }

            if (nextButton) {
                nextButton.addEventListener('click', function (event) {
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                    show(current + 1);
                });
            }
            if (previousButton) {
                previousButton.addEventListener('click', function (event) {
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                    show(current - 1);
                });
            }
            dots.forEach(function (dot, dotIndex) {
                dot.addEventListener('click', function (event) {
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                    show(dotIndex);
                });
            });

            show(current);
        });
    }

    // lightbox: el nodo con el comportamiento ES el overlay. La fuente de
    // imágenes y los controles se referencian por selector configurable, así
    // el mismo comportamiento sirve para cualquier galería.
    function installLightbox(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var sourceSelector = String(root.getAttribute('data-ocd-lightbox-source') || '').trim();
            if (!sourceSelector) return;
            var source = null;
            try { source = document.querySelector(sourceSelector); } catch (error) { return; }
            if (!source) return;

            var imageSelector = parseClass(root.getAttribute('data-ocd-lightbox-image-selector'), 'img');
            var openClass = parseClass(root.getAttribute('data-ocd-lightbox-open-class'), 'is-open');
            var images = [];
            try { images = Array.prototype.slice.call(source.querySelectorAll(imageSelector)); } catch (error) { return; }
            if (!images.length) return;

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var bigImg = bySelector('data-ocd-lightbox-img');
            var closeBtn = bySelector('data-ocd-lightbox-close');
            var prevBtn = bySelector('data-ocd-lightbox-prev');
            var nextBtn = bySelector('data-ocd-lightbox-next');
            if (!bigImg) return;

            var current = 0;
            function open(index) {
                current = ((index % images.length) + images.length) % images.length;
                bigImg.src = images[current].currentSrc || images[current].src;
                bigImg.alt = images[current].alt || '';
                root.classList.add(openClass);
            }
            function close() { root.classList.remove(openClass); }
            function isOpen() { return root.classList.contains(openClass); }

            images.forEach(function (img, index) {
                img.addEventListener('click', function () { open(index); });
            });
            root.addEventListener('click', function (event) {
                if (event.target === root || event.target === bigImg) close();
            });
            if (closeBtn) closeBtn.addEventListener('click', close);
            if (prevBtn) {
                prevBtn.addEventListener('click', function (event) {
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                    open(current - 1);
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', function (event) {
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                    open(current + 1);
                });
            }
            document.addEventListener('keydown', function (event) {
                if (!isOpen()) return;
                if (event.key === 'Escape') close();
                else if (event.key === 'ArrowLeft') open(current - 1);
                else if (event.key === 'ArrowRight') open(current + 1);
            });
        });
    }

    // parseJsonAttr: lee un atributo data-* como JSON sin evaluar código. Nunca
    // se interpreta el contenido como ejecutable: falla a null ante JSON inválido.
    function parseJsonAttr(root, attr) {
        var raw = String(root.getAttribute(attr) || '').trim();
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (error) { return null; }
    }

    function parsePoint(raw, fallbackX, fallbackY) {
        var parts = String(raw || '').split(',');
        var x = Number.parseFloat(parts[0]);
        var y = Number.parseFloat(parts[1]);
        if (!Number.isFinite(x)) x = fallbackX;
        if (!Number.isFinite(y)) y = fallbackY;
        return { x: x, y: y };
    }

    // parcel-map: mapa de parcelas con hover (vista previa) y clic (fija la
    // parcela). Los datos de estado/valor viven en cada <g class="lote"> como
    // atributos data-ocd-parcel-* (no como un objeto JS separado), así el dato
    // queda junto al elemento que describe y no hay JSON que parsear en el root.
    function installParcelMap(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var itemSelector = parseClass(root.getAttribute('data-ocd-parcel-item-selector'), '.lote');
            var idAttr = parseClass(root.getAttribute('data-ocd-parcel-id-attr'), 'data-lote');
            var superficie = parseClass(root.getAttribute('data-ocd-parcel-superficie'), '5.000 m²');
            var accentDisponible = parseClass(root.getAttribute('data-ocd-parcel-accent-disponible'), 'var(--oliva-500)');
            var accentVendido = parseClass(root.getAttribute('data-ocd-parcel-accent-vendido'), 'var(--tierra-700)');
            var accentEmpty = parseClass(root.getAttribute('data-ocd-parcel-accent-empty'), 'var(--tierra-300)');

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var panel = bySelector('data-ocd-parcel-panel');
            var accent = bySelector('data-ocd-parcel-accent');
            var fieldN = bySelector('data-ocd-parcel-field-n');
            var fieldEstado = bySelector('data-ocd-parcel-field-estado');
            var fieldSup = bySelector('data-ocd-parcel-field-sup');
            var fieldVal = bySelector('data-ocd-parcel-field-val');
            var countEl = bySelector('data-ocd-parcel-count');
            var countSecondary = bySelector('data-ocd-parcel-count-secondary');

            var items = [];
            try { items = Array.prototype.slice.call(root.querySelectorAll(itemSelector)); } catch (error) { return; }
            if (!items.length) return;

            var disponibles = 0;
            items.forEach(function (item) {
                var estado = String(item.getAttribute('data-ocd-parcel-estado') || '').trim().toLowerCase();
                if (estado === 'disponible') {
                    disponibles++;
                    item.classList.add('is-disponible');
                } else if (estado === 'vendido') {
                    item.classList.add('is-vendido');
                }
            });
            if (countEl) countEl.textContent = disponibles;
            if (countSecondary) countSecondary.textContent = disponibles;

            var pinned = null;

            function render(item) {
                if (!panel) return;
                var estado = String(item.getAttribute('data-ocd-parcel-estado') || '').trim().toLowerCase();
                var valor = String(item.getAttribute('data-ocd-parcel-valor') || '').trim();
                var esDisponible = estado === 'disponible';
                panel.setAttribute('data-empty', 'false');
                if (accent) accent.style.background = esDisponible ? accentDisponible : accentVendido;
                if (fieldN) fieldN.textContent = String(item.getAttribute(idAttr) || '').trim();
                if (fieldEstado) fieldEstado.textContent = esDisponible ? 'Disponible' : 'Vendida';
                if (fieldSup) fieldSup.textContent = superficie;
                if (fieldVal) fieldVal.textContent = esDisponible && valor ? valor : '—';
            }
            function reset() {
                if (!panel) return;
                panel.setAttribute('data-empty', 'true');
                if (accent) accent.style.background = accentEmpty;
            }

            items.forEach(function (item) {
                item.addEventListener('mouseenter', function () { if (!pinned) render(item); });
                item.addEventListener('mouseleave', function () { if (!pinned) reset(); });
                item.addEventListener('click', function () {
                    if (pinned === item) {
                        pinned = null;
                        item.classList.remove('is-active');
                        reset();
                        return;
                    }
                    if (pinned) pinned.classList.remove('is-active');
                    pinned = item;
                    item.classList.add('is-active');
                    render(item);
                });
            });
        });
    }

    // geo-map: pan por arrastre, zoom con rueda centrado en el cursor, ajuste
    // "cover" inicial y filtro dependiente Categoría → Lugar. LUGARES y
    // CATEGORIAS llegan como JSON en atributos data-ocd-geo-* y se parsean con
    // JSON.parse dentro de try/catch — nunca se interpretan como código.
    function installGeoMap(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var places = parseJsonAttr(root, 'data-ocd-geo-places');
            var categories = parseJsonAttr(root, 'data-ocd-geo-categories');
            if (!Array.isArray(places) || !places.length) return;
            var categoryLabels = (categories && typeof categories === 'object') ? categories : {};

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var svg = bySelector('data-ocd-geo-svg');
            var selCat = bySelector('data-ocd-geo-select-categoria');
            var selLugar = bySelector('data-ocd-geo-select-lugar');
            var marker = bySelector('data-ocd-geo-marker');
            var panel = bySelector('data-ocd-geo-panel');
            var accent = bySelector('data-ocd-geo-accent');
            var fieldNombre = bySelector('data-ocd-geo-field-nombre');
            var fieldCategoria = bySelector('data-ocd-geo-field-categoria');
            var fieldDistancia = bySelector('data-ocd-geo-field-distancia');
            var fieldContacto = bySelector('data-ocd-geo-field-contacto');
            var accentColor = parseClass(root.getAttribute('data-ocd-geo-accent-color'), 'var(--dorado-600)');
            if (!svg) return;

            var bounds = parseJsonAttr(root, 'data-ocd-geo-data-bounds') || {};
            var DATA = {
                minX: Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : -195,
                minY: Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -15,
                maxX: Number.isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : 570,
                maxY: Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 590
            };
            var initialCenter = parsePoint(root.getAttribute('data-ocd-geo-initial-center'), 300, 400);
            var proyecto = parsePoint(root.getAttribute('data-ocd-geo-proyecto'), 300, 270);
            var minZoomRatio = Number.parseFloat(root.getAttribute('data-ocd-geo-min-zoom-ratio'));
            if (!Number.isFinite(minZoomRatio) || minZoomRatio <= 0 || minZoomRatio >= 1) minZoomRatio = 0.2;

            var FULL_W = DATA.maxX - DATA.minX;
            var FULL_H = DATA.maxY - DATA.minY;
            var dataAspect = FULL_H / FULL_W;
            var containerAspect = dataAspect;
            var view = { x: 0, y: 0, w: FULL_W, h: FULL_H };
            var MAX_W = FULL_W;
            var MIN_W = MAX_W * minZoomRatio;

            // El tamaño real del recuadro puede no estar asentado todavía en el
            // primer frame (fuentes/layout en curso) y además puede cambiar si
            // la ventana se redimensiona — por eso esto se recalcula, no se mide
            // una sola vez al cargar (ese era el bug: un recuadro medido mal una
            // vez dejaba el mapa recortado en una tira angosta para siempre).
            function measureContainer() {
                var rect = root.getBoundingClientRect();
                return (rect.height && rect.width) ? (rect.height / rect.width) : dataAspect;
            }
            function computeBaseline() {
                containerAspect = measureContainer();
                if (containerAspect <= dataAspect) {
                    view.w = FULL_W;
                    view.h = FULL_W * containerAspect;
                } else {
                    view.h = FULL_H;
                    view.w = FULL_H / containerAspect;
                }
                MAX_W = view.w;
                MIN_W = MAX_W * minZoomRatio;
            }
            computeBaseline();
            view.x = initialCenter.x - view.w / 2;
            view.y = initialCenter.y - view.h / 2;

            function handleResize() {
                var cx = view.x + view.w / 2;
                var cy = view.y + view.h / 2;
                var zoomFraction = MAX_W ? (view.w / MAX_W) : 1;
                computeBaseline();
                view.w = MAX_W * zoomFraction;
                view.h = view.w * containerAspect;
                view.x = cx - view.w / 2;
                view.y = cy - view.h / 2;
                clampView();
                applyView();
            }

            function applyView() {
                svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
                svg.style.setProperty('--zoom-k', view.w / MAX_W);
            }
            function clamp1D(size, dataMin, dataMax) {
                var dataSize = dataMax - dataMin;
                if (size >= dataSize) return dataMin - (size - dataSize) / 2;
                return null;
            }
            function clampView() {
                view.w = Math.max(MIN_W, Math.min(MAX_W, view.w));
                view.h = view.w * containerAspect;
                var cx = clamp1D(view.w, DATA.minX, DATA.maxX);
                view.x = cx !== null ? cx : Math.max(DATA.minX, Math.min(DATA.maxX - view.w, view.x));
                var cy = clamp1D(view.h, DATA.minY, DATA.maxY);
                view.y = cy !== null ? cy : Math.max(DATA.minY, Math.min(DATA.maxY - view.h, view.y));
            }
            function panToLugar(px, py) {
                var pad = 1.6;
                var minX = Math.min(px, proyecto.x);
                var maxX = Math.max(px, proyecto.x);
                var minY = Math.min(py, proyecto.y);
                var maxY = Math.max(py, proyecto.y);
                var cx = (minX + maxX) / 2;
                var cy = (minY + maxY) / 2;
                var spanW = Math.max((maxX - minX) * pad, MIN_W);
                var spanH = Math.max((maxY - minY) * pad, MIN_W * containerAspect);
                if (spanH > spanW * containerAspect) { spanW = spanH / containerAspect; } else { spanH = spanW * containerAspect; }
                view.w = spanW;
                view.h = spanH;
                view.x = cx - view.w / 2;
                view.y = cy - view.h / 2;
                clampView();
                applyView();
            }
            applyView();
            window.addEventListener('resize', handleResize, { passive: true });
            // Un resize del navegador no es la única forma en que el recuadro
            // puede terminar de asentar su tamaño real después del primer
            // frame (fuentes, imágenes cercanas cargando) — un reintento corto
            // sin esperar un resize real cubre ese caso sin costo perceptible.
            window.setTimeout(handleResize, 250);

            var dragging = false;
            var last = null;
            function onPointerDown(event) {
                dragging = true;
                last = { x: event.clientX, y: event.clientY };
                if (event.pointerId != null && typeof root.setPointerCapture === 'function') {
                    try { root.setPointerCapture(event.pointerId); } catch (error) {}
                }
                root.classList.add('is-dragging');
            }
            function onPointerMove(event) {
                if (!dragging) return;
                var rect = root.getBoundingClientRect();
                var scale = view.w / rect.width;
                view.x -= (event.clientX - last.x) * scale;
                view.y -= (event.clientY - last.y) * scale;
                last = { x: event.clientX, y: event.clientY };
                clampView();
                applyView();
            }
            function endDrag() {
                dragging = false;
                root.classList.remove('is-dragging');
            }
            function onWheel(event) {
                event.preventDefault();
                var rect = root.getBoundingClientRect();
                var mx = view.x + (event.clientX - rect.left) / rect.width * view.w;
                var my = view.y + (event.clientY - rect.top) / rect.height * view.h;
                var factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
                var newW = Math.max(MIN_W, Math.min(MAX_W, view.w * factor));
                var newH = newW * containerAspect;
                view.x = mx - (mx - view.x) * (newW / view.w);
                view.y = my - (my - view.y) * (newH / view.h);
                view.w = newW;
                view.h = newH;
                clampView();
                applyView();
            }

            root.addEventListener('pointerdown', onPointerDown);
            root.addEventListener('pointermove', onPointerMove);
            root.addEventListener('pointerup', endDrag);
            root.addEventListener('pointerleave', endDrag);
            root.addEventListener('pointercancel', endDrag);
            root.addEventListener('wheel', onWheel, { passive: false });

            function populateLugares(categoria) {
                if (!selLugar) return;
                while (selLugar.firstChild) selLugar.removeChild(selLugar.firstChild);
                var opt0 = document.createElement('option');
                opt0.value = '';
                opt0.textContent = categoria ? 'Selecciona un lugar' : 'Elige una categoría primero';
                selLugar.appendChild(opt0);
                if (!categoria) {
                    selLugar.disabled = true;
                    return;
                }
                selLugar.disabled = false;
                places
                    .filter(function (lugar) { return lugar.categoria === categoria; })
                    .sort(function (a, b) { return a.dist - b.dist; })
                    .forEach(function (lugar) {
                        var opt = document.createElement('option');
                        opt.value = lugar.nombre;
                        opt.textContent = lugar.nombre + ' · ' + lugar.dist + ' km';
                        selLugar.appendChild(opt);
                    });
            }

            function onCatChange() {
                populateLugares(selCat ? selCat.value : '');
                if (marker) marker.style.display = 'none';
                if (panel) panel.setAttribute('data-empty', 'true');
            }
            function onLugarChange() {
                var nombre = selLugar ? selLugar.value : '';
                var lugar = null;
                for (var i = 0; i < places.length; i++) {
                    if (places[i].nombre === nombre) {
                        lugar = places[i];
                        break;
                    }
                }
                if (!lugar) {
                    if (marker) marker.style.display = 'none';
                    if (panel) panel.setAttribute('data-empty', 'true');
                    return;
                }
                if (marker) {
                    marker.setAttribute('transform', 'translate(' + lugar.x + ',' + lugar.y + ')');
                    marker.style.display = '';
                }
                panToLugar(lugar.x, lugar.y);
                if (panel) panel.setAttribute('data-empty', 'false');
                if (accent) accent.style.background = accentColor;
                if (fieldNombre) fieldNombre.textContent = lugar.nombre;
                if (fieldCategoria) fieldCategoria.textContent = categoryLabels[lugar.categoria] || lugar.categoria;
                if (fieldDistancia) fieldDistancia.textContent = lugar.dist + ' km';
                if (fieldContacto) fieldContacto.textContent = lugar.contacto || '—';
            }

            if (selCat) selCat.addEventListener('change', onCatChange);
            if (selLugar) selLugar.addEventListener('change', onLugarChange);
        });
    }

    // chart: genera un SVG declarativo de barras o líneas desde
    // data-ocd-chart-data. Igual que en el runtime del editor: JSON.parse,
    // createElementNS y textContent, sin librerías externas ni eval/Function.
    function installChart(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var rawData = parseJsonAttr(root, 'data-ocd-chart-data');
            if (!Array.isArray(rawData)) return;
            var items = [];
            for (var r = 0; r < rawData.length; r++) {
                var row = rawData[r];
                if (!row || typeof row !== 'object') continue;
                var value = Number(row.value);
                if (!Number.isFinite(value)) continue;
                items.push({ label: String(row.label == null ? '' : row.label), value: value });
            }
            if (!items.length) return;

            var chartType = parseClass(root.getAttribute('data-ocd-chart-type'), 'bar');
            if (chartType !== 'bar' && chartType !== 'line') chartType = 'bar';
            var color = parseClass(root.getAttribute('data-ocd-chart-color'), '#2271b1');
            var axisColor = parseClass(root.getAttribute('data-ocd-chart-axis-color'), '#5f6b7a');
            var gridColor = parseClass(root.getAttribute('data-ocd-chart-grid-color'), 'rgba(0,0,0,.08)');
            var labelColor = parseClass(root.getAttribute('data-ocd-chart-label-color'), '#27312c');
            var width = parseIndex(root.getAttribute('data-ocd-chart-width'), 640) || 640;
            var height = parseIndex(root.getAttribute('data-ocd-chart-height'), 360) || 360;

            var SVG_NS = 'http://www.w3.org/2000/svg';
            var svg = root.querySelector('svg');
            if (!svg) {
                svg = document.createElementNS(SVG_NS, 'svg');
                root.insertBefore(svg, root.firstChild);
            }
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', chartType === 'line' ? 'Gráfico de líneas' : 'Gráfico de barras');
            svg.style.width = '100%';
            svg.style.height = 'auto';
            svg.style.display = 'block';

            var margin = { top: 24, right: 24, bottom: 52, left: 52 };
            var plotW = Math.max(0, width - margin.left - margin.right);
            var plotH = Math.max(0, height - margin.top - margin.bottom);
            var minValue = 0;
            var maxValue = 0;
            for (var v = 0; v < items.length; v++) {
                minValue = Math.min(minValue, items[v].value);
                maxValue = Math.max(maxValue, items[v].value);
            }
            if (maxValue <= minValue) maxValue = minValue + 1;
            var span = maxValue - minValue;

            function makeLine(x1, y1, x2, y2, stroke, strokeWidth) {
                var line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', String(x1));
                line.setAttribute('y1', String(y1));
                line.setAttribute('x2', String(x2));
                line.setAttribute('y2', String(y2));
                line.setAttribute('stroke', stroke);
                line.setAttribute('stroke-width', String(strokeWidth == null ? 1 : strokeWidth));
                svg.appendChild(line);
            }
            function makeText(content, x, y, anchor, fill, size) {
                var text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', String(x));
                text.setAttribute('y', String(y));
                text.setAttribute('text-anchor', anchor || 'middle');
                text.setAttribute('fill', fill || labelColor);
                text.setAttribute('font-size', String(size || 12));
                text.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Arial, sans-serif');
                text.textContent = content;
                svg.appendChild(text);
            }
            function yFor(value) {
                return margin.top + plotH - ((value - minValue) / span) * plotH;
            }
            function xCenter(index) {
                if (items.length <= 1) return margin.left + plotW / 2;
                return margin.left + (plotW * index) / (items.length - 1);
            }
            function formatTick(value) {
                var abs = Math.abs(value);
                var rounded = Number(value.toFixed(2));
                if (abs >= 1000000) return String(Number((rounded / 1000000).toFixed(1))) + 'M';
                if (abs >= 1000) return String(Number((rounded / 1000).toFixed(1))) + 'k';
                return String(rounded);
            }

            var tickCount = 5;
            for (var t = 0; t < tickCount; t++) {
                var tickValue = minValue + (span * t) / (tickCount - 1);
                var tickY = yFor(tickValue);
                makeLine(margin.left, tickY, margin.left + plotW, tickY, gridColor, 1);
                makeText(formatTick(tickValue), margin.left - 8, tickY + 4, 'end', axisColor, 12);
            }

            var baselineY = yFor(0);
            makeLine(margin.left, margin.top, margin.left, margin.top + plotH, axisColor, 1.5);
            makeLine(margin.left, baselineY, margin.left + plotW, baselineY, axisColor, 1.5);

            for (var x = 0; x < items.length; x++) {
                makeText(items[x].label, xCenter(x), margin.top + plotH + 18, 'middle', labelColor, 12);
            }

            if (chartType === 'bar') {
                var slot = items.length ? plotW / items.length : plotW;
                var barWidth = Math.max(4, Math.min(64, slot * 0.72));
                for (var b = 0; b < items.length; b++) {
                    var valueB = items[b].value;
                    var barX = margin.left + slot * b + (slot - barWidth) / 2;
                    var barY;
                    var barH;
                    if (valueB >= 0) {
                        barY = yFor(valueB);
                        barH = Math.max(0, baselineY - barY);
                    } else {
                        barY = baselineY;
                        barH = Math.max(0, yFor(valueB) - baselineY);
                    }
                    var rect = document.createElementNS(SVG_NS, 'rect');
                    rect.setAttribute('x', String(barX));
                    rect.setAttribute('y', String(barY));
                    rect.setAttribute('width', String(barWidth));
                    rect.setAttribute('height', String(Math.max(0.5, barH)));
                    rect.setAttribute('rx', '2');
                    rect.setAttribute('fill', color);
                    svg.appendChild(rect);
                    var valueY = valueB >= 0 ? barY - 6 : barY + barH + 14;
                    makeText(formatTick(valueB), barX + barWidth / 2, valueY, 'middle', labelColor, 11);
                }
            } else {
                var pointList = [];
                for (var p = 0; p < items.length; p++) {
                    pointList.push(xCenter(p) + ',' + yFor(items[p].value));
                }
                var polyline = document.createElementNS(SVG_NS, 'polyline');
                polyline.setAttribute('points', pointList.join(' '));
                polyline.setAttribute('fill', 'none');
                polyline.setAttribute('stroke', color);
                polyline.setAttribute('stroke-width', '2.5');
                polyline.setAttribute('stroke-linejoin', 'round');
                polyline.setAttribute('stroke-linecap', 'round');
                svg.appendChild(polyline);
                for (var c = 0; c < items.length; c++) {
                    var cx = xCenter(c);
                    var cy = yFor(items[c].value);
                    var circle = document.createElementNS(SVG_NS, 'circle');
                    circle.setAttribute('cx', String(cx));
                    circle.setAttribute('cy', String(cy));
                    circle.setAttribute('r', '4');
                    circle.setAttribute('fill', color);
                    circle.setAttribute('stroke', '#ffffff');
                    circle.setAttribute('stroke-width', '1.5');
                    svg.appendChild(circle);
                    makeText(formatTick(items[c].value), cx, cy - 8, 'middle', labelColor, 11);
                }
            }
        });
    }

    // hero-collapse: reconstruye el colapso del banner de entrada en desktop.
    // Son DOS máquinas de estado con histéresis encadenadas:
    //   1) colapso del hero (scrollY con COLLAPSE_ON / COLLAPSE_OFF);
    //   2) cristalización del nav, encadenada a releaseScrollY (fijo mientras
    //      el hero está colapsado, NO recalculado con la y en vivo).
    // En mobile/tablet el modo se decide una sola vez al cargar y este
    // comportamiento no arranca: los demás comportamientos ya cubren ese
    // contexto (scroll-threshold/reveal-on-scroll).
    function installHeroCollapse(nodes) {
        if (window.history && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
        if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);

        Array.prototype.forEach.call(nodes, function (root) {
            var collapseOn = parseThreshold(root.getAttribute('data-ocd-hero-collapse-on'), 40);
            var collapseOff = parseThreshold(root.getAttribute('data-ocd-hero-collapse-off'), 8);
            var dwell = parseThreshold(root.getAttribute('data-ocd-hero-dwell'), 20);
            var collapsedHeight = parseThreshold(root.getAttribute('data-ocd-hero-collapsed-height'), 600);
            var revealDelay = parseThreshold(root.getAttribute('data-ocd-hero-reveal-delay'), 1000);
            var crystallizeOffset = parseThreshold(root.getAttribute('data-ocd-hero-crystallize-offset'), 15);

            var pinSelector = parseClass(root.getAttribute('data-ocd-hero-pin'), '#heroPin');
            var navSelector = parseClass(root.getAttribute('data-ocd-hero-nav'), '#siteNav');
            var revealTargetSelector = parseClass(root.getAttribute('data-ocd-hero-reveal-target'), '#proyecto');
            var collapsedClass = parseClass(root.getAttribute('data-ocd-hero-collapsed-class'), 'is-collapsed');
            var bodyClass = parseClass(root.getAttribute('data-ocd-hero-body-class'), 'hero-collapsed');
            var crystallizedClass = parseClass(root.getAttribute('data-ocd-hero-crystallized-class'), 'is-crystallized');
            var handoffClass = parseClass(root.getAttribute('data-ocd-hero-handoff-class'), 'is-handoff');
            var revealedClass = parseClass(root.getAttribute('data-ocd-hero-revealed-class'), 'is-revealed');

            function bySelector(selector) {
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var heroPin = bySelector(pinSelector);
            var nav = bySelector(navSelector);
            var revealTarget = bySelector(revealTargetSelector);

            var isMobile = false;
            if (typeof window.innerWidth === 'number' && window.innerWidth <= 900) {
                isMobile = true;
            } else if (typeof window.innerWidth === 'number' && typeof window.innerHeight === 'number' && window.innerHeight > 0) {
                isMobile = (window.innerWidth / window.innerHeight) <= (4 / 5);
            }
            if (isMobile) {
                // Rama mobile/tablet: sin colapso de tamaño (no hay espacio para
                // esa coreografía), pero el nav igual se "cristaliza" y el hero
                // entra en handoff con un umbral simple, sin histéresis — fiel
                // al script original. El aviso .features ya lo cubre por su
                // cuenta el comportamiento reveal-on-scroll (redundancia inofensiva).
                function updateMobile() {
                    var pastThreshold = window.scrollY > collapseOn;
                    if (nav) nav.classList.toggle(crystallizedClass, pastThreshold);
                    root.classList.toggle(handoffClass, pastThreshold);
                }
                updateMobile();
                window.addEventListener('scroll', updateMobile, { passive: true });
                return;
            }

            var collapsed = false;
            var crystallized = false;
            var releaseScrollY = null;
            var proyectoRevealed = false;

            function update() {
                var y = window.scrollY;
                var shouldCollapse = collapsed ? (y > collapseOff) : (y > collapseOn);

                if (shouldCollapse !== collapsed) {
                    collapsed = shouldCollapse;
                    root.classList.toggle(collapsedClass, collapsed);
                    document.body.classList.toggle(bodyClass, collapsed);

                    if (collapsed) {
                        releaseScrollY = collapseOn + dwell;
                        if (heroPin) heroPin.style.height = (releaseScrollY + collapsedHeight) + 'px';
                        if (!proyectoRevealed) {
                            proyectoRevealed = true;
                            window.setTimeout(function () {
                                if (revealTarget) revealTarget.classList.add(revealedClass);
                            }, revealDelay);
                        }
                    } else {
                        releaseScrollY = null;
                        if (heroPin) heroPin.style.height = '';
                        crystallized = false;
                        if (nav) nav.classList.remove(crystallizedClass);
                        root.classList.remove(handoffClass);
                    }
                }

                if (releaseScrollY !== null) {
                    var shouldCrystallize = crystallized ? (y > releaseScrollY - crystallizeOffset) : (y > releaseScrollY);
                    if (shouldCrystallize !== crystallized) {
                        crystallized = shouldCrystallize;
                        if (nav) nav.classList.toggle(crystallizedClass, crystallized);
                        root.classList.toggle(handoffClass, crystallized);
                    }
                }
            }

            update();
            window.addEventListener('scroll', update, { passive: true });
        });
    }

    function boot() {
        var roots = document.querySelectorAll('.ocd-canvas-published');
        installSoundToggleStyles();
        Array.prototype.forEach.call(roots, function (root) {
            compensateWordPressAdminBar(root);
            activateAutoplayVideos(root);
        });

        var behaviorNodes = document.querySelectorAll('[data-ocd-behavior]');
        var scrollNodes = [];
        var toggleNodes = [];
        var carouselNodes = [];
        var revealNodes = [];
        var lightboxNodes = [];
        var parcelMapNodes = [];
        var geoMapNodes = [];
        var heroCollapseNodes = [];
        var chartNodes = [];
        Array.prototype.forEach.call(behaviorNodes, function (node) {
            var behavior = node.getAttribute('data-ocd-behavior');
            if (behavior === 'scroll-threshold') scrollNodes.push(node);
            else if (behavior === 'nav-toggle') toggleNodes.push(node);
            else if (behavior === 'carousel-basic') carouselNodes.push(node);
            else if (behavior === 'reveal-on-scroll') revealNodes.push(node);
            else if (behavior === 'lightbox') lightboxNodes.push(node);
            else if (behavior === 'parcel-map') parcelMapNodes.push(node);
            else if (behavior === 'geo-map') geoMapNodes.push(node);
            else if (behavior === 'hero-collapse') heroCollapseNodes.push(node);
            else if (behavior === 'chart') chartNodes.push(node);
        });
        installHeroCollapse(heroCollapseNodes);
        installScrollThreshold(scrollNodes);
        installNavToggle(toggleNodes);
        installCarousel(carouselNodes);
        installReveal(revealNodes);
        installLightbox(lightboxNodes);
        installParcelMap(parcelMapNodes);
        installGeoMap(geoMapNodes);
        installChart(chartNodes);

        window.addEventListener('resize', function () {
            Array.prototype.forEach.call(roots, compensateWordPressAdminBar);
        }, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
