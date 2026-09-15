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
                node.setAttribute('data-cod-admin-bar-offset', String(offset));
            }
        });
    }

    function activateAutoplayVideos(root) {
        root.querySelectorAll('video[autoplay]').forEach(function (video) {
            // Los videos con transparencia (luma matte) viven ocultos dentro de
            // su wrapper y los arranca el compositor de canvas; no llevan botón
            // de sonido porque no tienen pista audible que destapar.
            if (typeof video.closest === 'function' && video.closest('[data-cod-luma-matte="1"]')) {
                return;
            }
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            var playback = video.play();
            if (playback && typeof playback.catch === 'function') {
                playback.catch(function () {
                    // El navegador puede mantener otras políticas de ahorro;
                    // el video conserva controles/estado definidos por el diseño.
                });
            }
        });
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
            var threshold = Number.parseFloat(node.getAttribute('data-cod-scroll-threshold') || '40');
            if (!Number.isFinite(threshold) || threshold < 0) threshold = 40;
            var scrolledClass = parseClass(node.getAttribute('data-cod-scrolled-class'), 'nav--scrolled');
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
                    var revealClass = parseClass(element.getAttribute('data-cod-reveal-class'), 'is-revealed');
                    element.classList.add(revealClass);
                    observer.unobserve(element);
                });
            }, { threshold: 0.15 })
            : null;
        Array.prototype.forEach.call(nodes, function (element) {
            var revealClass = parseClass(element.getAttribute('data-cod-reveal-class'), 'is-revealed');
            if (!hasIO) {
                element.classList.add(revealClass);
                return;
            }
            observer.observe(element);
        });
    }

    // anchor: regla genérica de posicionamiento+animación (borde/esquina +
    // offset + entrada) aplicable a CUALQUIER nodo, no solo whatsapp — un
    // módulo estático (whatsapp, imagen, botón, precio, red social...)
    // puede vivir dentro de un contenedor con esta regla. El nodo YA trae su
    // estado inicial (oculto, desplazado en la dirección desde la que
    // "nace") en su propio atributo style; acá solo se escribe el estado
    // final (data-cod-anchor-reveal-transform) cuando entra en el viewport,
    // igual que installReveal.
    function installAnchor(nodes) {
        var hasIO = typeof window.IntersectionObserver === 'function';
        function reveal(el) {
            var transform = el.getAttribute('data-cod-anchor-reveal-transform');
            if (transform) el.style.transform = transform;
            el.style.opacity = '1';
        }
        function hide(el) {
            var initial = el.getAttribute('data-cod-anchor-initial-transform');
            if (initial) el.style.transform = initial;
            el.style.opacity = '0';
        }
        // repeat es una propiedad real de la regla anchor (ver
        // normalize_anchor_rule en el compilador), no una decisión fija acá:
        // con repeat="1" la entrada vuelve a jugar cada vez que el nodo sale
        // y vuelve a aparecer (guardando su transform inicial, que si no se
        // pierde apenas se revela una vez); con repeat="0" se comporta como
        // antes — se revela una sola vez y deja de observarse.
        var observer = hasIO
            ? new window.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    var node = entry.target;
                    var repeat = node.getAttribute('data-cod-anchor-repeat') !== '0';
                    if (entry.isIntersecting) {
                        reveal(node);
                        if (!repeat) observer.unobserve(node);
                    } else if (repeat) {
                        hide(node);
                    }
                });
            }, { threshold: 0.3 })
            : null;
        Array.prototype.forEach.call(nodes, function (node) {
            node.setAttribute('data-cod-anchor-initial-transform', node.style.transform || '');
            if (!hasIO) {
                reveal(node);
                return;
            }
            observer.observe(node);
        });
    }

    function installNavToggle(nodes) {
        Array.prototype.forEach.call(nodes, function (button) {
            var targetSelector = String(button.getAttribute('data-cod-toggle-target') || '').trim();
            if (!targetSelector) return;
            var target = null;
            try { target = document.querySelector(targetSelector); } catch (error) { return; }
            if (!target) return;

            var toggleClass = parseClass(button.getAttribute('data-cod-toggle-class'), 'is-menu-open');
            var selfClass = parseClass(button.getAttribute('data-cod-toggle-self-class'), '');

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
        var trackSelector = parseClass(root.getAttribute('data-cod-carousel-track-selector'), '.cod-carousel__track');
        var slideSelector = parseClass(root.getAttribute('data-cod-carousel-slide-selector'), '.cod-carousel__slide');
        var visible = parseIndex(root.getAttribute('data-cod-carousel-visible'), 1) || 1;
        var visibleMobileRaw = root.getAttribute('data-cod-carousel-visible-mobile');
        var visibleMobile = visibleMobileRaw ? parseIndex(visibleMobileRaw, visible) : visible;
        var breakpoint = parseIndex(root.getAttribute('data-cod-carousel-mobile-breakpoint'), 860);
        // filas: 1 por defecto. Con 2 la pista se llena por columnas.
        var rows = parseIndex(root.getAttribute('data-cod-carousel-rows'), 1) || 1;

        var track = null;
        try { track = root.querySelector(trackSelector); } catch (error) { return; }
        if (!track) return;
        var slides = [];
        try { slides = Array.prototype.slice.call(track.querySelectorAll(slideSelector)); } catch (error) { return; }
        if (!slides.length) return;

        var nextButton = root.querySelector('[data-cod-carousel-next]');
        var previousButton = root.querySelector('[data-cod-carousel-prev]');
        var index = 0;

        function visibleCount() { return window.innerWidth <= breakpoint ? visibleMobile : visible; }
        function columnCount() { return Math.ceil(slides.length / rows); }
        function maxIndex() { return Math.max(0, columnCount() - visibleCount()); }
        function slideStep() {
            // Con varias filas el paso es el ancho de una COLUMNA: la distancia
            // hasta la diapositiva que abre la columna siguiente. Medir contra
            // la segunda diapositiva daría cero, porque queda justo debajo.
            if (rows > 1 && slides.length > rows) {
                return slides[rows].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
            }
            if (slides.length < 2) return slides[0].getBoundingClientRect().width;
            return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
        }
        function update() {
            var step = slideStep();
            // El CSS reparte el ancho según cuántas columnas caben.
            track.style.setProperty('--cod-carousel-columnas', String(visibleCount()));
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
            if (root.getAttribute('data-cod-carousel-mode') === 'track') {
                installCarouselTrack(root);
                return;
            }
            var slideSelector = parseClass(root.getAttribute('data-cod-carousel-slide-selector'), '.cod-carousel__slide');
            var activeClass = parseClass(root.getAttribute('data-cod-carousel-active-class'), 'is-active');
            var start = parseIndex(root.getAttribute('data-cod-carousel-start'), 0);
            var slides = [];
            try { slides = Array.prototype.slice.call(root.querySelectorAll(slideSelector)); } catch (error) { return; }
            if (!slides.length) return;

            var current = start < slides.length ? start : 0;
            var nextButton = root.querySelector('[data-cod-carousel-next]');
            var previousButton = root.querySelector('[data-cod-carousel-prev]');
            var dotsHost = root.querySelector('[data-cod-carousel-dots]');
            if (!dotsHost && root.hasAttribute('data-cod-carousel-dots')) dotsHost = root;
            var dots = [];
            if (dotsHost) {
                dots = Array.prototype.slice.call(dotsHost.querySelectorAll('[data-cod-carousel-dot]'));
                if (!dots.length) {
                    for (var i = 0; i < slides.length; i++) {
                        var dot = document.createElement('button');
                        dot.type = 'button';
                        dot.className = 'cod-carousel__dot';
                        dot.setAttribute('data-cod-carousel-dot', '');
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
            var sourceSelector = String(root.getAttribute('data-cod-lightbox-source') || '').trim();
            if (!sourceSelector) return;
            var source = null;
            try { source = document.querySelector(sourceSelector); } catch (error) { return; }
            if (!source) return;

            var imageSelector = parseClass(root.getAttribute('data-cod-lightbox-image-selector'), 'img');
            var openClass = parseClass(root.getAttribute('data-cod-lightbox-open-class'), 'is-open');
            var images = [];
            try { images = Array.prototype.slice.call(source.querySelectorAll(imageSelector)); } catch (error) { return; }
            if (!images.length) return;

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var bigImg = bySelector('data-cod-lightbox-img');
            var closeBtn = bySelector('data-cod-lightbox-close');
            var prevBtn = bySelector('data-cod-lightbox-prev');
            var nextBtn = bySelector('data-cod-lightbox-next');
            if (!bigImg) return;

            var current = 0;
            // El lightbox arma su imagen ampliada copiando solo src y alt, así
            // que un giro puesto como clase en la miniatura no llega hasta acá.
            // Por eso el giro viaja en data-cod-rotation sobre la propia <img> y
            // se repone al ampliar. En 90/270 la imagen ocupa al revés, de modo
            // que sus dos límites se intercambian; si no, se recorta contra el
            // borde equivocado.
            function aplicarGiro(destino, origen) {
                var giro = parseInt(origen.getAttribute('data-cod-rotation') || '0', 10);
                if (giro !== 90 && giro !== 180 && giro !== 270) {
                    destino.style.transform = '';
                    destino.style.maxWidth = '';
                    destino.style.maxHeight = '';
                    destino.removeAttribute('data-cod-rotation');
                    return;
                }
                destino.setAttribute('data-cod-rotation', String(giro));
                destino.style.transform = 'rotate(' + giro + 'deg)';
                if (giro === 180) {
                    destino.style.maxWidth = '';
                    destino.style.maxHeight = '';
                    return;
                }
                var caja = destino.parentNode && destino.parentNode.getBoundingClientRect
                    ? destino.parentNode.getBoundingClientRect()
                    : null;
                var ancho = caja && caja.width ? caja.width : window.innerWidth;
                var alto = caja && caja.height ? caja.height : window.innerHeight;
                destino.style.maxWidth = Math.round(alto) + 'px';
                destino.style.maxHeight = Math.round(ancho) + 'px';
            }
            function open(index) {
                current = ((index % images.length) + images.length) % images.length;
                bigImg.src = images[current].currentSrc || images[current].src;
                bigImg.alt = images[current].alt || '';
                aplicarGiro(bigImg, images[current]);
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

    // visor-embed: el nodo con el comportamiento ES la capa que se abre. Sirve
    // para mostrar algo que vive en otro sitio —un recorrido 360, un video, un
    // plano interactivo— sin sacar a la persona de la página.
    //
    // Dos decisiones que no son cosméticas:
    //
    // 1. La dirección NO se pone en el iframe hasta que alguien abre el visor.
    //    Un iframe con src puesto se carga con la página aunque esté oculto, y
    //    un recorrido 360 pesa: la portada entera arrastraría ese peso para
    //    todos, incluso para quien nunca lo abre. Al cerrar se descarga, para
    //    que no siga consumiendo memoria ni sonando de fondo.
    //
    // 2. Solo se aceptan direcciones http y https. El atributo viaja dentro del
    //    contenido guardado, así que hay que tratarlo como texto de afuera: una
    //    dirección "javascript:" en un iframe es ejecución de código ajeno.
    function installVisorEmbed(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var crudo = String(root.getAttribute('data-cod-visor-src') || '').trim();
            var direccion = '';
            try {
                var u = new URL(crudo, window.location.href);
                if (u.protocol === 'http:' || u.protocol === 'https:') direccion = u.href;
            } catch (error) { direccion = ''; }
            if (!direccion) return;

            function porSelector(attr, alternativa) {
                var selector = String(root.getAttribute(attr) || '').trim() || alternativa || '';
                if (!selector) return null;
                try { return root.querySelector(selector); } catch (error) { return null; }
            }
            var marco = porSelector('data-cod-visor-frame', 'iframe');
            if (!marco) return;

            var disparadores = [];
            var selectorDisparador = String(root.getAttribute('data-cod-visor-trigger') || '').trim();
            if (selectorDisparador) {
                try { disparadores = Array.prototype.slice.call(document.querySelectorAll(selectorDisparador)); }
                catch (error) { disparadores = []; }
            }
            if (!disparadores.length) return;

            var claseAbierto = String(root.getAttribute('data-cod-visor-open-class') || '').trim() || 'is-open';
            var cerrar1 = porSelector('data-cod-visor-close', '');
            var desplazamientoPrevio = '';
            var temporizador = null;

            var nombreEnlace = String(root.getAttribute('data-cod-visor-hash') || '').trim() || String(root.id || '').trim();
            function pedidaEnLaUrl() {
                return !!nombreEnlace && String(window.location.hash || '').replace(/^#/, '') === nombreEnlace;
            }

            function estaAbierto() { return root.classList.contains(claseAbierto); }

            function abrir(evento) {
                if (evento && typeof evento.preventDefault === 'function') evento.preventDefault();
                if (temporizador) { window.clearTimeout(temporizador); temporizador = null; }
                if (marco.getAttribute('src') !== direccion) marco.setAttribute('src', direccion);
                root.classList.add(claseAbierto);
                desplazamientoPrevio = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                if (cerrar1 && typeof cerrar1.focus === 'function') cerrar1.focus();
            }

            function cerrar() {
                if (!estaAbierto()) return;
                // Si se llegó por la dirección, se limpia al cerrar: recargar o
                // volver atrás no debe reabrir lo que la persona acaba de
                // cerrar. Va por replaceState y no por location.hash='', que
                // deja un '#' colgando y hace saltar el desplazamiento.
                if (pedidaEnLaUrl() && window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                root.classList.remove(claseAbierto);
                document.body.style.overflow = desplazamientoPrevio;
                // Se espera a que termine la transición antes de descargar, para
                // que no se vea el marco vaciarse mientras la capa se desvanece.
                temporizador = window.setTimeout(function () {
                    marco.setAttribute('src', 'about:blank');
                    temporizador = null;
                }, 320);
            }

            disparadores.forEach(function (boton) { boton.addEventListener('click', abrir); });
            if (cerrar1) cerrar1.addEventListener('click', cerrar);
            root.addEventListener('click', function (evento) { if (evento.target === root) cerrar(); });
            document.addEventListener('keydown', function (evento) {
                if (estaAbierto() && evento.key === 'Escape') cerrar();
            });

            // Abrirla desde la dirección. Sin esto la capa tiene una sola manera
            // de abrirse —apretar su botón— y por lo tanto no tiene dirección:
            // no se puede enlazar desde el menú, un correo ni un código QR.
            //
            // El nombre sale de data-cod-visor-hash si está declarado, y si no
            // del id del propio nodo, que es lo que el editor llama Marcador.
            // Así el mismo nombre sirve para enlazar y para identificar, en vez
            // de inventar un segundo sistema de nombres al lado del primero.
            if (nombreEnlace) {
                window.addEventListener('hashchange', function () { if (pedidaEnLaUrl()) abrir(); });
                // Al entrar con la dirección ya puesta. Se espera un cuadro para
                // no pelear con el desplazamiento inicial del navegador.
                if (pedidaEnLaUrl()) window.setTimeout(abrir, 0);
            }
        });
    }

    // wa-mensaje: una ventana para redactar el mensaje antes de abrir WhatsApp.
    //
    // El nodo que declara el comportamiento ES la ventana, igual que el
    // lightbox y el visor. No reemplaza los enlaces de WhatsApp: los
    // INTERCEPTA. Eso importa por tres razones:
    //
    //   1. Cada botón conserva el mensaje propio de su sección, que ya viaja
    //      en su enlace. La ventana lo lee de ahí y lo ofrece escrito.
    //   2. El número sale del propio enlace, así que no hay un segundo lugar
    //      donde configurarlo ni forma de que queden distintos.
    //   3. Si este archivo no cargara, los enlaces siguen funcionando como
    //      siempre: abren WhatsApp directo. Se pierde la ventana, no el
    //      contacto.
    //
    // El motivo de que exista: un clic que se va del sitio se mide mal, sobre
    // todo en teléfono, donde la aplicación toma el control antes de que se
    // alcance a registrar. Con un botón de envío DENTRO de la página, el
    // evento se emite antes de salir y sí se puede contar como conversión.
    function installWaMensaje(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var selectorDisparador = String(root.getAttribute('data-cod-wa-trigger') || '').trim();
            if (!selectorDisparador) return;
            var enlaces = [];
            try { enlaces = Array.prototype.slice.call(document.querySelectorAll(selectorDisparador)); }
            catch (error) { return; }
            if (!enlaces.length) return;

            function dentro(attr, alternativa) {
                var s = String(root.getAttribute(attr) || '').trim() || alternativa || '';
                if (!s) return null;
                try { return root.querySelector(s); } catch (error) { return null; }
            }
            var enviar = dentro('data-cod-wa-send', '');
            var cerrar1 = dentro('data-cod-wa-close', '');
            if (!enviar) return;

            // El campo de texto y la casilla los CREA este código, no vienen en
            // el documento guardado. No es un capricho: el sanitizador bloquea
            // <textarea> e <input> a propósito, para que un documento traído de
            // otro sitio no pueda incluir un formulario falso que pida claves o
            // datos de tarjeta. Ese bloqueo protege de verdad y no corresponde
            // debilitarlo por una ventana de contacto.
            //
            // Lo que sí viaja en el documento son los huecos donde van, así que
            // quien diseña decide dónde se ubican y cómo se ven; las clases son
            // las mismas y se estilan en el editor como cualquier otra cosa.
            function crearEn(attr, fabricar) {
                var hueco = dentro(attr, '');
                if (!hueco) return null;
                var ya = hueco.querySelector('textarea, input');
                if (ya) return ya;
                var control = fabricar();
                hueco.appendChild(control);
                return control;
            }

            var campo = crearEn('data-cod-wa-field', function () {
                var e = document.createElement('textarea');
                e.className = 'wa-ventana__campo';
                e.rows = 3;
                e.setAttribute('aria-label', String(root.getAttribute('data-cod-wa-field-label') || 'Tu mensaje'));
                var pista = String(root.getAttribute('data-cod-wa-placeholder') || '').trim();
                if (pista) e.placeholder = pista;
                return e;
            });
            if (!campo) return;

            var consent = crearEn('data-cod-wa-consent', function () {
                var e = document.createElement('input');
                e.type = 'checkbox';
                e.className = 'wa-ventana__casilla';
                // Desmarcada siempre: un consentimiento premarcado no es
                // consentimiento, y en varias legislaciones directamente no vale.
                e.checked = false;
                return e;
            });

            var claseAbierto = String(root.getAttribute('data-cod-wa-open-class') || '').trim() || 'is-open';
            var lineaConsent = String(root.getAttribute('data-cod-wa-consent-text') || '').trim();
            var nombreEvento = String(root.getAttribute('data-cod-wa-event') || '').trim() || 'whatsapp_enviado';
            // Quien pincha el ícono y cierra sin escribir también es interés, y
            // hasta ahora no quedaba en ninguna parte: sólo se avisaba al enviar.
            var nombreEventoApertura = String(root.getAttribute('data-cod-wa-event-open') || '').trim() || 'whatsapp_abierto';

            var destino = '';   // número, sacado del enlace que abrió la ventana
            var origen = '';    // qué botón fue, para poder distinguirlo al medir
            var ultimoDisparador = null;

            function estaAbierto() { return root.classList.contains(claseAbierto); }

            function abrir(enlace, evento) {
                if (evento && typeof evento.preventDefault === 'function') evento.preventDefault();
                var href = String(enlace.getAttribute('href') || '');
                var num = href.match(/wa\.me\/(\d+)/);
                if (!num) return;   // no se reconoce: se deja pasar el enlace tal cual
                destino = num[1];

                // El mensaje propio de esta sección viaja en el enlace.
                var texto = '';
                var puesto = href.match(/[?&]text=([^&]*)/);
                if (puesto) {
                    try { texto = decodeURIComponent(puesto[1].replace(/\+/g, ' ')); } catch (e) { texto = ''; }
                }
                campo.value = texto;

                // De dónde salió: sirve para saber qué sección convierte.
                var seccion = enlace.closest ? enlace.closest('section') : null;
                origen = String(
                    enlace.getAttribute('data-cod-wa-origen') ||
                    (seccion && (seccion.id || seccion.className)) ||
                    'general'
                ).split(' ')[0];

                ultimoDisparador = enlace;
                root.classList.add(claseAbierto);
                revisar();
                window.setTimeout(function () {
                    try { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
                    catch (e) { /* da igual si el navegador no deja */ }
                }, 180);
                avisarApertura();
            }

            // Mismo camino que avisar(), por las mismas tres vías. No viaja
            // nada de lo que la persona escriba: sólo de qué zona salió.
            function avisarApertura() {
                var detalle = { origen: origen };
                try { window.dispatchEvent(new CustomEvent('cod:whatsapp-abierto', { detail: detalle })); } catch (e) {}
                try {
                    if (Array.isArray(window.dataLayer)) {
                        window.dataLayer.push({ event: nombreEventoApertura, origen: detalle.origen });
                    }
                } catch (e) {}
                try {
                    if (typeof window.gtag === 'function') window.gtag('event', nombreEventoApertura, detalle);
                } catch (e) {}
            }

            function cerrar() {
                if (!estaAbierto()) return;
                root.classList.remove(claseAbierto);
                if (ultimoDisparador && typeof ultimoDisparador.focus === 'function') ultimoDisparador.focus();
            }

            // Un mensaje vacío no se manda.
            function revisar() {
                var vacio = String(campo.value || '').trim() === '';
                if ('disabled' in enviar) enviar.disabled = vacio;
                enviar.setAttribute('aria-disabled', vacio ? 'true' : 'false');
            }

            // Se avisa por las tres vías que se usan, y ninguna depende de las
            // otras. Si el sitio no tiene ninguna herramienta instalada, no
            // pasa nada. Nunca viaja lo que la persona escribió: solo de qué
            // botón salió y si aceptó recibir novedades.
            function avisar(acepto) {
                var detalle = { origen: origen };
                // Si no hay casilla, no se manda el campo. Mandar siempre
                // false se lee como "nadie acepta", que no es lo mismo que
                // "no se pregunta".
                if (consent) detalle.consentimiento = !!acepto;
                try { window.dispatchEvent(new CustomEvent('cod:whatsapp-enviado', { detail: detalle })); } catch (e) {}
                try {
                    if (Array.isArray(window.dataLayer)) {
                        window.dataLayer.push({ event: nombreEvento, origen: detalle.origen, consentimiento: detalle.consentimiento });
                    }
                } catch (e) {}
                try {
                    if (typeof window.gtag === 'function') window.gtag('event', nombreEvento, detalle);
                } catch (e) {}
            }

            function mandar(evento) {
                if (evento && typeof evento.preventDefault === 'function') evento.preventDefault();
                var texto = String(campo.value || '').trim();
                if (!texto || !destino) return;
                var acepto = !!(consent && consent.checked);
                if (acepto && lineaConsent) texto += '\n\n' + lineaConsent;

                avisar(acepto);
                window.open('https://wa.me/' + destino + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
                cerrar();
            }

            enlaces.forEach(function (enlace) {
                enlace.addEventListener('click', function (evento) { abrir(enlace, evento); });
            });
            enviar.addEventListener('click', mandar);
            campo.addEventListener('input', revisar);
            if (cerrar1) cerrar1.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); cerrar(); });
            document.addEventListener('keydown', function (evento) {
                if (estaAbierto() && evento.key === 'Escape') cerrar();
            });
            revisar();
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
    // atributos data-cod-parcel-* (no como un objeto JS separado), así el dato
    // queda junto al elemento que describe y no hay JSON que parsear en el root.
    function installParcelMap(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var itemSelector = parseClass(root.getAttribute('data-cod-parcel-item-selector'), '.lote');
            var idAttr = parseClass(root.getAttribute('data-cod-parcel-id-attr'), 'data-lote');
            var superficie = parseClass(root.getAttribute('data-cod-parcel-superficie'), '5.000 m²');
            var accentDisponible = parseClass(root.getAttribute('data-cod-parcel-accent-disponible'), 'var(--oliva-500)');
            var accentVendido = parseClass(root.getAttribute('data-cod-parcel-accent-vendido'), 'var(--tierra-700)');
            var accentEmpty = parseClass(root.getAttribute('data-cod-parcel-accent-empty'), 'var(--tierra-300)');

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var panel = bySelector('data-cod-parcel-panel');
            var accent = bySelector('data-cod-parcel-accent');
            var fieldN = bySelector('data-cod-parcel-field-n');
            var fieldEstado = bySelector('data-cod-parcel-field-estado');
            var fieldSup = bySelector('data-cod-parcel-field-sup');
            var fieldVal = bySelector('data-cod-parcel-field-val');
            var countEl = bySelector('data-cod-parcel-count');
            var countSecondary = bySelector('data-cod-parcel-count-secondary');

            var items = [];
            try { items = Array.prototype.slice.call(root.querySelectorAll(itemSelector)); } catch (error) { return; }
            if (!items.length) return;

            var disponibles = 0;
            items.forEach(function (item) {
                var estado = String(item.getAttribute('data-cod-parcel-estado') || '').trim().toLowerCase();
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
                var estado = String(item.getAttribute('data-cod-parcel-estado') || '').trim().toLowerCase();
                var valor = String(item.getAttribute('data-cod-parcel-valor') || '').trim();
                var esDisponible = estado === 'disponible';
                panel.setAttribute('data-empty', 'false');
                if (accent) accent.style.background = esDisponible ? accentDisponible : accentVendido;
                if (fieldN) fieldN.textContent = String(item.getAttribute(idAttr) || '').trim();
                if (fieldEstado) fieldEstado.textContent = esDisponible ? 'Disponible' : 'Vendida';
                if (fieldSup) fieldSup.textContent = superficie;
                if (fieldVal) fieldVal.textContent = valor ? valor : '—';
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
    // CATEGORIAS llegan como JSON en atributos data-cod-geo-* y se parsean con
    // JSON.parse dentro de try/catch — nunca se interpretan como código.
    function installGeoMap(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var places = parseJsonAttr(root, 'data-cod-geo-places');
            var categories = parseJsonAttr(root, 'data-cod-geo-categories');
            if (!Array.isArray(places) || !places.length) return;
            var categoryLabels = (categories && typeof categories === 'object') ? categories : {};

            function bySelector(attr) {
                var selector = String(root.getAttribute(attr) || '').trim();
                if (!selector) return null;
                try { return document.querySelector(selector); } catch (error) { return null; }
            }
            var svg = bySelector('data-cod-geo-svg');
            var selCat = bySelector('data-cod-geo-select-categoria');
            var selLugar = bySelector('data-cod-geo-select-lugar');
            var marker = bySelector('data-cod-geo-marker');
            var panel = bySelector('data-cod-geo-panel');
            var accent = bySelector('data-cod-geo-accent');
            var fieldNombre = bySelector('data-cod-geo-field-nombre');
            var fieldCategoria = bySelector('data-cod-geo-field-categoria');
            var fieldDistancia = bySelector('data-cod-geo-field-distancia');
            var fieldDescripcion = bySelector('data-cod-geo-field-descripcion');
            var fieldContacto = bySelector('data-cod-geo-field-contacto');
            var accentColor = parseClass(root.getAttribute('data-cod-geo-accent-color'), 'var(--dorado-600)');
            var categoryIcons = parseJsonAttr(root, 'data-cod-geo-category-icons');
            if (!categoryIcons || typeof categoryIcons !== 'object') categoryIcons = {};
            var markerIcon = marker ? marker.querySelector('.cod-geo-map__marker-icon') : null;
            var DEFAULT_MARKER_PATH = 'M0 -18 L8 -6 L14 -6 L10 4 L12 16 L0 10 L-12 16 L-10 4 L-14 -6 L-8 -6 Z';
            if (!svg) return;

            // cercanía: minutos si el lugar los trae cargados, si no la
            // distancia en km. Ambos datos se cargan a mano mirando la ruta
            // real en Google — medir en línea recta no representa nada útil.
            function formatCercania(lugar) {
                if (lugar.tiempoMin != null && Number.isFinite(Number(lugar.tiempoMin))) return Number(lugar.tiempoMin) + ' min';
                return lugar.dist + ' km';
            }

            var bounds = parseJsonAttr(root, 'data-cod-geo-data-bounds') || {};
            var DATA = {
                minX: Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : -195,
                minY: Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : -15,
                maxX: Number.isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : 570,
                maxY: Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 590
            };
            var initialCenter = parsePoint(root.getAttribute('data-cod-geo-initial-center'), 300, 400);
            var proyecto = parsePoint(root.getAttribute('data-cod-geo-proyecto'), 300, 270);
            var minZoomRatio = Number.parseFloat(root.getAttribute('data-cod-geo-min-zoom-ratio'));
            if (!Number.isFinite(minZoomRatio) || minZoomRatio <= 0 || minZoomRatio >= 1) minZoomRatio = 0.2;
            var initialZoom = Number.parseFloat(root.getAttribute('data-cod-geo-initial-zoom'));
            if (!Number.isFinite(initialZoom) || initialZoom <= 0 || initialZoom > 1) initialZoom = 1;
            if (initialZoom < minZoomRatio) initialZoom = minZoomRatio;

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
            // El acercamiento inicial es una fracción del alcance total: el
            // mapa puede cubrir mucho territorio y aun así abrir de cerca.
            view.w = MAX_W * initialZoom;
            view.h = view.w * containerAspect;
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
                function orderKey(lugar) {
                    return (lugar.tiempoMin != null && Number.isFinite(Number(lugar.tiempoMin))) ? Number(lugar.tiempoMin) : Number(lugar.dist);
                }
                places
                    .filter(function (lugar) { return lugar.categoria === categoria; })
                    .sort(function (a, b) { return orderKey(a) - orderKey(b); })
                    .forEach(function (lugar) {
                        var opt = document.createElement('option');
                        opt.value = lugar.nombre;
                        opt.textContent = lugar.nombre + ' · ' + formatCercania(lugar);
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
                if (markerIcon) {
                    var iconPath = categoryIcons[lugar.categoria];
                    if (typeof iconPath === 'string' && iconPath) {
                        markerIcon.setAttribute('d', iconPath);
                        markerIcon.setAttribute('transform', 'scale(1.3) translate(-12,-12)');
                    } else {
                        markerIcon.setAttribute('d', DEFAULT_MARKER_PATH);
                        markerIcon.removeAttribute('transform');
                    }
                }
                panToLugar(lugar.x, lugar.y);
                if (panel) panel.setAttribute('data-empty', 'false');
                if (accent) accent.style.background = accentColor;
                if (fieldNombre) fieldNombre.textContent = lugar.nombre;
                if (fieldCategoria) fieldCategoria.textContent = categoryLabels[lugar.categoria] || lugar.categoria;
                if (fieldDistancia) fieldDistancia.textContent = formatCercania(lugar);
                if (fieldDescripcion) fieldDescripcion.textContent = lugar.descripcionLarga || '';
                if (fieldContacto) fieldContacto.textContent = lugar.contacto || '—';
            }

            if (selCat) selCat.addEventListener('change', onCatChange);
            if (selLugar) selLugar.addEventListener('change', onLugarChange);
        });
    }

    // chart: genera un SVG declarativo de barras o líneas desde
    // data-cod-chart-data. Igual que en el runtime del editor: JSON.parse,
    // createElementNS y textContent, sin librerías externas ni eval/Function.
    function installChart(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            var rawData = parseJsonAttr(root, 'data-cod-chart-data');
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

            var chartType = parseClass(root.getAttribute('data-cod-chart-type'), 'bar');
            if (chartType !== 'bar' && chartType !== 'line') chartType = 'bar';
            var color = parseClass(root.getAttribute('data-cod-chart-color'), '#2271b1');
            var axisColor = parseClass(root.getAttribute('data-cod-chart-axis-color'), '#5f6b7a');
            var gridColor = parseClass(root.getAttribute('data-cod-chart-grid-color'), 'rgba(0,0,0,.08)');
            var labelColor = parseClass(root.getAttribute('data-cod-chart-label-color'), '#27312c');
            var width = parseIndex(root.getAttribute('data-cod-chart-width'), 640) || 640;
            var height = parseIndex(root.getAttribute('data-cod-chart-height'), 360) || 360;

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
            var collapseOn = parseThreshold(root.getAttribute('data-cod-hero-collapse-on'), 40);
            var collapseOff = parseThreshold(root.getAttribute('data-cod-hero-collapse-off'), 8);
            var dwell = parseThreshold(root.getAttribute('data-cod-hero-dwell'), 20);
            var collapsedHeight = parseThreshold(root.getAttribute('data-cod-hero-collapsed-height'), 600);
            var revealDelay = parseThreshold(root.getAttribute('data-cod-hero-reveal-delay'), 1000);
            var crystallizeOffset = parseThreshold(root.getAttribute('data-cod-hero-crystallize-offset'), 15);

            var pinSelector = parseClass(root.getAttribute('data-cod-hero-pin'), '#heroPin');
            var navSelector = parseClass(root.getAttribute('data-cod-hero-nav'), '#siteNav');
            var revealTargetSelector = parseClass(root.getAttribute('data-cod-hero-reveal-target'), '#proyecto');
            var collapsedClass = parseClass(root.getAttribute('data-cod-hero-collapsed-class'), 'is-collapsed');
            var bodyClass = parseClass(root.getAttribute('data-cod-hero-body-class'), 'hero-collapsed');
            var crystallizedClass = parseClass(root.getAttribute('data-cod-hero-crystallized-class'), 'is-crystallized');
            var handoffClass = parseClass(root.getAttribute('data-cod-hero-handoff-class'), 'is-handoff');
            var revealedClass = parseClass(root.getAttribute('data-cod-hero-revealed-class'), 'is-revealed');

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
        var roots = document.querySelectorAll('.cod-canvas-published');
        Array.prototype.forEach.call(roots, function (root) {
            compensateWordPressAdminBar(root);
            activateAutoplayVideos(root);
        });

        var behaviorNodes = document.querySelectorAll('[data-cod-behavior]');
        var scrollNodes = [];
        var toggleNodes = [];
        var carouselNodes = [];
        var revealNodes = [];
        var lightboxNodes = [];
        var parcelMapNodes = [];
        var geoMapNodes = [];
        var heroCollapseNodes = [];
        var chartNodes = [];
        var anchorNodes = [];
        var visorNodes = [];
        var waNodes = [];
        Array.prototype.forEach.call(behaviorNodes, function (node) {
            var behavior = node.getAttribute('data-cod-behavior');
            if (behavior === 'scroll-threshold') scrollNodes.push(node);
            else if (behavior === 'nav-toggle') toggleNodes.push(node);
            else if (behavior === 'carousel-basic') carouselNodes.push(node);
            else if (behavior === 'reveal-on-scroll') revealNodes.push(node);
            else if (behavior === 'lightbox') lightboxNodes.push(node);
            else if (behavior === 'parcel-map') parcelMapNodes.push(node);
            else if (behavior === 'geo-map') geoMapNodes.push(node);
            else if (behavior === 'hero-collapse') heroCollapseNodes.push(node);
            else if (behavior === 'chart') chartNodes.push(node);
            else if (behavior === 'anchor') anchorNodes.push(node);
            else if (behavior === 'visor-embed') visorNodes.push(node);
            else if (behavior === 'wa-mensaje') waNodes.push(node);
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
        installAnchor(anchorNodes);
        installVisorEmbed(visorNodes);
        installWaMensaje(waNodes);

        // Interacciones tipo Webflow (data-cod-interaction): el mismo motor que
        // corre en el iframe del editor (cod-interactions.js) se instala acá
        // sobre el documento publicado, sin duplicar la lógica de interpolación.
        if (window.OcdInteractions && typeof window.OcdInteractions.createRuntime === 'function') {
            window.OcdInteractions.createRuntime({ window: window, document: document });
        }

        window.addEventListener('resize', function () {
            Array.prototype.forEach.call(roots, compensateWordPressAdminBar);
        }, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
