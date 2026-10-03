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
                        window.dataLayer.push(Object.assign({ event: nombreEventoApertura }, detalle));
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
                // Un consentimiento sin titular no es un consentimiento.
                //
                // Quien pincha el WhatsApp es anónimo: no hay nombre, ni teléfono, ni
                // correo. Mientras no escriba, lo único que se sabe es que alguien
                // pinchó. Pedirle que acepte algo ahí sólo llena una casilla que no se
                // puede asociar a nadie, y no sirve como prueba de nada. Por eso Santa
                // Luisa no la tiene. El lugar donde el consentimiento SÍ tiene sentido
                // es el formulario, donde la persona entrega su nombre y su correo.
                //
                // Si aun así un sitio pone la casilla, el campo viaja. Si no la hay, no
                // viaja: mandar siempre false se lee como «nadie acepta», que no es lo
                // mismo que «no se pregunta».
                if (consent) detalle.consentimiento = !!acepto;
                try { window.dispatchEvent(new CustomEvent('cod:whatsapp-enviado', { detail: detalle })); } catch (e) {}
                try {
                    if (Array.isArray(window.dataLayer)) {
                        // Se manda el detalle tal cual, sin nombrar los campos uno a uno:
                        // nombrarlos obliga a que la clave viaje aunque no tenga valor, y
                        // entonces «consentimiento» aparece vacío en un sitio que no lo
                        // pregunta. Así el dataLayer dice exactamente lo mismo que gtag.
                        window.dataLayer.push(Object.assign({ event: nombreEvento }, detalle));
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

    // preferencias-cookies: reabre el panel de preferencias del banner de
    // cookies desde cualquier elemento del documento — típicamente un enlace en
    // el pie, que es donde la ley espera encontrarlo.
    //
    // Por qué no se le pone al elemento la clase del propio plugin de cookies:
    // esa clase no es un gancho, es su ícono flotante. Trae `position:fixed`,
    // 50×50 y su color, y además su JavaScript le cambia el `display` al primer
    // elemento que la tenga. Un enlace del pie con esa clase se arrancaría del
    // pie y aparecería y desaparecería solo.
    //
    // Así que el documento declara una conducta nuestra, y acá se le reenvía el
    // clic al disparador que el plugin de cookies ya tiene. Si ese plugin no
    // está activo, el elemento no hace nada y tampoco estorba.
    function installPreferenciasCookies(nodes) {
        if (!nodes.length) return;
        Array.prototype.forEach.call(nodes, function (node) {
            node.addEventListener('click', function (ev) {
                ev.preventDefault();
                var disparador = document.querySelector(
                    '.cookieadmin_re_consent, .cookieadmin_customize_btn'
                );
                if (disparador && typeof disparador.click === 'function') disparador.click();
            });
        });
    }

    // El color de acento declarado por el set de diseño, leído del propio
    // documento. Si nadie lo declaró devuelve 'currentColor', que hereda la
    // tinta del texto: el medio resuelve lo que el set no dijo, en vez de que
    // el plugin invente un color. Antes acá caía el azul del panel de
    // WordPress. Ver COD_Design_Core en el plugin.
    function colorDeAcento(el) {
        try {
            var v = getComputedStyle(el).getPropertyValue('--cod-color-accent');
            v = v ? v.trim() : '';
            if (v) return v;
        } catch (e) {}
        return 'currentColor';
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
            var color = parseClass(root.getAttribute('data-cod-chart-color'), '') || colorDeAcento(root);
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

    // cuadrantes: cuatro contenidos (imagen, título y texto). En reposo son una
    // grilla 2x2 de imágenes cuadradas e iguales. Al activar uno, su imagen crece
    // hasta ocupar la mitad del bloque, su texto aparece en la otra mitad y las
    // otras tres imágenes pasan a miniaturas (un 20% del lado de la celda) que
    // CONSERVAN LA DISPOSICIÓN 2x2 que tenían: forman una mini grilla con un
    // hueco donde estaba la activa (la que estaba a la derecha sigue a la
    // derecha, la de abajo sigue abajo), pegada a la esquina de la imagen que
    // mira hacia el centro del bloque:
    //
    //   ítem 1 (arriba-izquierda)  imagen a la izquierda, texto a la derecha, miniaturas abajo-derecha
    //   ítem 2 (arriba-derecha)    imagen a la derecha, texto a la izquierda, miniaturas abajo-izquierda
    //   ítem 3 (abajo-izquierda)   imagen a la izquierda, texto a la derecha, miniaturas arriba-derecha
    //   ítem 4 (abajo-derecha)     imagen a la derecha, texto a la izquierda, miniaturas arriba-izquierda
    //
    // Por eso no es un carrusel: la posición de origen de cada ítem decide el
    // lado, la esquina y el lugar de su miniatura. Es el port del módulo original
    // del sitio de Econut (ver cuadrantes_css en el plugin).
    //
    // NINGÚN ELEMENTO CAMBIA DE LUGAR EN EL DOM. Cada imagen es siempre la misma
    // celda; lo que cambia, por CSS, es su posición y su tamaño. Acá sólo se
    // marcan atributos sobre la raíz y las piezas: el estado (reposo o activo),
    // cuál está activa, el lado, la esquina, y en cada imagen su rol.
    //
    // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="cuadrantes") tiene
    // EXACTAMENTE cuatro hijos, y cada hijo es un contenedor con una imagen
    // (o video) y el resto de su contenido (título y texto). Si la forma no
    // calza, no toca nada: el contenido queda apilado y legible.
    //
    // QUÉ HACE AL DOM. Envuelve la imagen de cada ítem en un `div` propio (que es
    // la celda de la grilla), le pone un `button` transparente encima y marca
    // el texto como panel. Un ítem con varios bloques de texto suelto
    // se agrupa en un `div`. Todo se puede deshacer con la función que retorna.
    // El color y la tipografía los ponen las reglas de diseño de cada sitio.
    //
    // No se monta dentro del editor: allí el bloque debe verse apilado y
    // editable, sin botones encima ni textos ocultos que no se puedan
    // seleccionar (ver installCuadrantesRuntime en cod-behaviors.js).
    var contadorCuadrantes = 0;

    function montarCuadrantes(root, doc) {
        if (root.getAttribute('data-cod-cuadrantes-listo') === '1') return null;

        var hijos = Array.prototype.slice.call(root.children);
        if (hijos.length !== 4) return null;

        // 1) Reconocer la forma de cada ítem antes de tocar nada.
        var formas = [];
        for (var i = 0; i < hijos.length; i++) {
            var caja = null;
            var resto = [];
            var nietos = Array.prototype.slice.call(hijos[i].children);
            for (var j = 0; j < nietos.length; j++) {
                var esMedio = nietos[j].matches('img,video,picture') || nietos[j].querySelector('img,video,picture');
                if (!caja && esMedio) caja = nietos[j];
                else resto.push(nietos[j]);
            }
            if (!caja || !resto.length) return null;
            formas.push({ item: hijos[i], caja: caja, resto: resto });
        }

        contadorCuadrantes += 1;
        var numero = contadorCuadrantes;
        var deshacer = [];
        var piezas = [];
        var activo = 0; // 0 = reposo; 1..4 = cuadrante activo

        // 2) Armar las piezas de cada ítem.
        formas.forEach(function (forma, indice) {
            var n = indice + 1;

            forma.item.classList.add('cod-cuadrantes__item');
            forma.item.setAttribute('data-cod-cuadrantes-item', String(n));
            deshacer.push(function () {
                forma.item.classList.remove('cod-cuadrantes__item');
                forma.item.removeAttribute('data-cod-cuadrantes-item');
            });

            // Envoltorio de la imagen: es la celda que se posiciona y se anima.
            var medio = doc.createElement('div');
            medio.className = 'cod-cuadrantes__media';
            medio.setAttribute('data-cod-cuadrantes-item', String(n));
            forma.item.insertBefore(medio, forma.caja);
            medio.appendChild(forma.caja);
            deshacer.push(function () {
                medio.parentNode.insertBefore(forma.caja, medio);
                medio.parentNode.removeChild(medio);
            });

            // Panel de texto: el propio bloque si es uno solo; si son varios, un
            // grupo que los junta para poder ubicarlos como una sola caja.
            var panel;
            if (forma.resto.length === 1) {
                panel = forma.resto[0];
            } else {
                panel = doc.createElement('div');
                forma.item.insertBefore(panel, forma.resto[0]);
                forma.resto.forEach(function (bloque) { panel.appendChild(bloque); });
                deshacer.push(function () {
                    forma.resto.forEach(function (bloque) { panel.parentNode.insertBefore(bloque, panel); });
                    panel.parentNode.removeChild(panel);
                });
            }
            panel.classList.add('cod-cuadrantes__info');
            panel.setAttribute('data-cod-cuadrantes-item', String(n));
            var idPropio = panel.getAttribute('id');
            if (!idPropio) {
                panel.setAttribute('id', 'cod-cuadrantes-' + numero + '-texto-' + n);
                deshacer.push(function () { panel.removeAttribute('id'); });
            }
            deshacer.push(function () {
                panel.classList.remove('cod-cuadrantes__info');
                panel.removeAttribute('data-cod-cuadrantes-item');
                panel.removeAttribute('data-cod-cuadrantes-visible');
                panel.removeAttribute('aria-hidden');
            });

            // El nombre accesible del botón es el título; si no hay, un genérico.
            var titulo = panel.querySelector('h1,h2,h3,h4,h5,h6');
            var etiqueta = titulo ? String(titulo.textContent || '').trim() : '';
            if (!etiqueta) etiqueta = 'Contenido ' + n;

            var boton = doc.createElement('button');
            boton.type = 'button';
            boton.className = 'cod-cuadrantes__disparador';
            boton.setAttribute('aria-label', etiqueta);
            boton.setAttribute('aria-expanded', 'false');
            boton.setAttribute('aria-controls', panel.getAttribute('id'));
            boton.addEventListener('click', function () { activar(n); });
            medio.appendChild(boton);

            piezas.push({ medio: medio, panel: panel, boton: boton });
        });

        // 3) Botón «×» para volver a reposo (una sola vez, al final de la raíz).
        var botonCerrar = doc.createElement('button');
        botonCerrar.type = 'button';
        botonCerrar.className = 'cod-cuadrantes__cerrar';
        botonCerrar.setAttribute('aria-label', 'Volver a los cuatro cuadrantes');
        botonCerrar.textContent = '×';
        botonCerrar.hidden = true;
        botonCerrar.addEventListener('click', cerrar);
        root.appendChild(botonCerrar);
        deshacer.push(function () { root.removeChild(botonCerrar); });

        function enfocar(elemento) {
            if (!elemento || typeof elemento.focus !== 'function') return;
            try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
        }

        // 4) Dibujar el estado: todo sale de `activo`, nada se acumula.
        function dibujar() {
            var lado = '';
            var esquina = '';
            if (activo) {
                // Los ítems 1 y 3 están a la izquierda; el 2 y el 4, a la derecha.
                lado = activo % 2 === 1 ? 'izquierda' : 'derecha';
                // Los ítems 1 y 2 están arriba: sus miniaturas quedan abajo.
                esquina = activo <= 2 ? 'abajo' : 'arriba';
                root.setAttribute('data-cod-cuadrantes-estado', 'activo');
                root.setAttribute('data-cod-cuadrantes-activo', String(activo));
                root.setAttribute('data-cod-cuadrantes-lado', lado);
                root.setAttribute('data-cod-cuadrantes-esquina', esquina);
            } else {
                root.setAttribute('data-cod-cuadrantes-estado', 'reposo');
                root.removeAttribute('data-cod-cuadrantes-activo');
                root.removeAttribute('data-cod-cuadrantes-lado');
                root.removeAttribute('data-cod-cuadrantes-esquina');
            }

            var ranura = 0; // orden de las miniaturas (lo usa el móvil, que las pone en fila)
            piezas.forEach(function (pieza, indice) {
                var n = indice + 1;
                var rol = activo === 0 ? 'cuadrante' : (n === activo ? 'activa' : 'miniatura');
                pieza.medio.setAttribute('data-cod-cuadrantes-rol', rol);
                if (rol === 'miniatura') {
                    pieza.medio.setAttribute('data-cod-cuadrantes-slot', String(ranura));
                    ranura += 1;
                } else {
                    pieza.medio.removeAttribute('data-cod-cuadrantes-slot');
                }
                var visible = n === activo;
                pieza.panel.setAttribute('data-cod-cuadrantes-visible', visible ? 'true' : 'false');
                pieza.panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
                pieza.boton.setAttribute('aria-expanded', visible ? 'true' : 'false');
                // La imagen ya expandida no es un destino: se sale por la «×».
                if (visible) pieza.boton.setAttribute('tabindex', '-1');
                else pieza.boton.removeAttribute('tabindex');
            });
            botonCerrar.hidden = activo === 0;
        }

        function activar(n) {
            if (n === activo) return;
            activo = n;
            dibujar();
            // El foco sigue al contenido: va a la «×», que abre el panel nuevo.
            enfocar(botonCerrar);
        }

        function cerrar() {
            if (!activo) return;
            var anterior = activo;
            activo = 0;
            dibujar();
            // Al volver a reposo el foco regresa al cuadrante que se había abierto.
            enfocar(piezas[anterior - 1].boton);
        }

        // Escape cierra, pero sólo si el foco está dentro del bloque o suelto en
        // la página: no debe robarle la tecla a un campo de otra parte.
        function alTeclado(evento) {
            if (!activo) return;
            if (evento.key !== 'Escape' && evento.key !== 'Esc') return;
            var foco = doc.activeElement;
            if (foco && foco !== doc.body && foco !== doc.documentElement && !root.contains(foco)) return;
            cerrar();
        }
        doc.addEventListener('keydown', alTeclado);
        deshacer.push(function () { doc.removeEventListener('keydown', alTeclado); });

        root.classList.add('cod-cuadrantes');
        root.setAttribute('data-cod-cuadrantes-listo', '1');
        deshacer.push(function () {
            root.classList.remove('cod-cuadrantes');
            ['data-cod-cuadrantes-listo', 'data-cod-cuadrantes-estado', 'data-cod-cuadrantes-activo',
                'data-cod-cuadrantes-lado', 'data-cod-cuadrantes-esquina'].forEach(function (nombre) {
                root.removeAttribute(nombre);
            });
        });
        dibujar();

        return function destruir() {
            while (deshacer.length) deshacer.pop()();
        };
    }

    function installCuadrantes(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            montarCuadrantes(root, document);
        });
    }

    // pestanas: un juego de pestañas sobre un grupo con 2 a 8 hijos. Cada hijo es
    // una pestaña: su PRIMER hijo es la etiqueta (lo que se pincha: un título, un
    // número, un texto) y el RESTO es el panel de contenido. Al cargar queda
    // activa la primera; al pinchar una etiqueta se muestra su panel y se ocultan
    // los demás.
    //
    // MIRADO EN DIVI (módulo Tabs, el que usa econut.cl en sus cifras). Lo que
    // se tomó y lo que no:
    //   - Se tomó la separación en dos mitades: una fila de etiquetas arriba y los
    //     paneles debajo, con exactamente uno visible; las etiquetas de la misma
    //     fila con el mismo alto; el estado activo marcado en la etiqueta (acá con
    //     atributos data-cod-pestanas-*) para que la composición pinte activa e
    //     inactiva como quiera; y abrir una pestaña concreta desde la URL (#id).
    //   - NO se tomó su marcado: Divi usa `<li><a href="#">` sin role, sin
    //     aria-selected y sin teclado (un `<a href="#">` que no navega a ninguna
    //     parte). Acá las etiquetas son `button` reales dentro de un
    //     `role="tablist"`, con roving tabindex, flechas, Inicio y Fin.
    //   - NO se tomó su transición: Divi desvanece el panel viejo (500 ms), lo
    //     oculta, y recién ahí desvanece el nuevo (otros 500 ms), bloquea los
    //     clics mientras dura y NO anima el alto (el contenedor salta de golpe al
    //     alto del panel nuevo, medido en econut.cl). Acá el panel nuevo aparece
    //     de inmediato y el alto del bloque viaja del valor viejo al nuevo.
    //
    // NINGÚN PANEL CAMBIA DE LUGAR EN EL DOM. Cada hijo del grupo se convierte en
    // su panel (role="tabpanel"); la etiqueta se saca de él y se pone, dentro de
    // un `button`, en una lista (role="tablist") que se inserta al principio del
    // grupo. El nodo de la etiqueta viaja entero (con su clase y sus reglas), de
    // modo que la composición le sigue dando su tipografía. Para pintar la
    // etiqueta ACTIVA de otro color, la composición declara una regla con
    // scope.state = "current" sobre ese nodo (el compilador la emite atada a
    // [data-cod-pestanas-estado="activa"]); sin regla propia, el nodo hereda el
    // color del botón. Todo se deshace con la función que retorna.
    //
    // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
    //   raíz:      data-cod-pestanas-listo="1", data-cod-pestanas-activa="1..N"
    //   lista:     data-cod-pestanas-rol="lista"
    //   etiqueta:  data-cod-pestanas-item="n", data-cod-pestanas-rol="etiqueta",
    //              data-cod-pestanas-estado="activa|inactiva"
    //   panel:     data-cod-pestanas-item="n", data-cod-pestanas-rol="panel",
    //              data-cod-pestanas-visible="true|false"
    //
    // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="pestanas") tiene de 2 a
    // 8 hijos y cada uno tiene al menos 2 hijos propios (etiqueta y algo de
    // contenido). Si la forma no calza, no toca nada: el contenido queda apilado
    // y legible.
    //
    // No se monta dentro del editor: allí el bloque debe verse apilado y
    // editable, con todos los paneles a la vista (ver installPestanasRuntime).
    var contadorPestanas = 0;

    function montarPestanas(root, doc) {
        if (root.getAttribute('data-cod-pestanas-listo') === '1') return null;

        var hijos = Array.prototype.slice.call(root.children);
        if (hijos.length < 2 || hijos.length > 8) return null;

        // 1) Reconocer la forma de cada pestaña antes de tocar nada.
        var formas = [];
        for (var i = 0; i < hijos.length; i++) {
            var propios = hijos[i].children;
            if (!propios || propios.length < 2) return null;
            formas.push({ item: hijos[i], etiqueta: propios[0] });
        }

        contadorPestanas += 1;
        var numero = contadorPestanas;
        var win = doc.defaultView || window;
        var deshacer = [];
        var piezas = [];
        var activa = 1; // 1..N

        // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
        function marcar(elemento, nombre, valor) {
            var antes = elemento.getAttribute(nombre);
            elemento.setAttribute(nombre, valor);
            deshacer.push(function () {
                if (antes === null) elemento.removeAttribute(nombre);
                else elemento.setAttribute(nombre, antes);
            });
        }

        // 2) La lista de etiquetas, al principio del grupo.
        var lista = doc.createElement('div');
        lista.className = 'cod-pestanas__lista';
        lista.setAttribute('role', 'tablist');
        lista.setAttribute('data-cod-pestanas-rol', 'lista');
        root.insertBefore(lista, hijos[0]);
        deshacer.push(function () {
            if (lista.parentNode) lista.parentNode.removeChild(lista);
        });

        // 3) Armar cada pestaña: botón con la etiqueta adentro y panel con role.
        formas.forEach(function (forma, indice) {
            var n = indice + 1;
            var panel = forma.item;
            var idPanel = panel.getAttribute('id') || ('cod-pestanas-' + numero + '-panel-' + n);
            var idEtiqueta = 'cod-pestanas-' + numero + '-etiqueta-' + n;

            // El botón recibe el nodo de la etiqueta tal cual, no una copia.
            var boton = doc.createElement('button');
            boton.type = 'button';
            boton.id = idEtiqueta;
            boton.className = 'cod-pestanas__etiqueta';
            boton.setAttribute('role', 'tab');
            boton.setAttribute('aria-controls', idPanel);
            boton.setAttribute('data-cod-pestanas-item', String(n));
            boton.setAttribute('data-cod-pestanas-rol', 'etiqueta');
            boton.appendChild(forma.etiqueta);
            lista.appendChild(boton);
            deshacer.push(function () {
                // La etiqueta vuelve a ser el primer hijo de su pestaña.
                panel.insertBefore(forma.etiqueta, panel.firstChild);
                if (boton.parentNode) boton.parentNode.removeChild(boton);
            });
            boton.addEventListener('click', function () { activar(n, false); });

            // El propio hijo es el panel: conserva su caja y sus reglas.
            panel.classList.add('cod-pestanas__panel');
            marcar(panel, 'id', idPanel);
            marcar(panel, 'role', 'tabpanel');
            marcar(panel, 'aria-labelledby', idEtiqueta);
            marcar(panel, 'data-cod-pestanas-item', String(n));
            marcar(panel, 'data-cod-pestanas-rol', 'panel');
            deshacer.push(function () {
                panel.classList.remove('cod-pestanas__panel');
                panel.removeAttribute('data-cod-pestanas-visible');
                panel.removeAttribute('hidden');
            });

            piezas.push({ boton: boton, panel: panel });
        });

        // 4) Dibujar el estado: todo sale de `activa`, nada se acumula.
        function dibujar() {
            root.setAttribute('data-cod-pestanas-activa', String(activa));
            piezas.forEach(function (pieza, indice) {
                var esActiva = indice + 1 === activa;
                pieza.boton.setAttribute('data-cod-pestanas-estado', esActiva ? 'activa' : 'inactiva');
                pieza.boton.setAttribute('aria-selected', esActiva ? 'true' : 'false');
                // Roving tabindex: al conjunto se entra por la etiqueta activa y de
                // ahí se mueve con las flechas; no son N paradas de tabulación.
                pieza.boton.setAttribute('tabindex', esActiva ? '0' : '-1');
                pieza.panel.setAttribute('data-cod-pestanas-visible', esActiva ? 'true' : 'false');
                if (esActiva) pieza.panel.removeAttribute('hidden');
                else pieza.panel.setAttribute('hidden', '');
            });
        }

        // 5) El alto viaja del valor viejo al nuevo. Sin esto el bloque salta de
        // golpe cuando un panel es más alto que otro (así lo hace Divi). Se fija
        // el alto viejo en línea, se fuerza el reflujo y se pone el nuevo; el CSS
        // del plugin trae la transición (--cod-motion-response) bajo
        // prefers-reduced-motion: no-preference. Si no hay transición (movimiento
        // reducido, o el sitio no declaró el token) el alto queda en `auto` de
        // inmediato: es un estado más, no un error.
        var animando = false;
        var altoEnLinea = '';
        var temporizador = null;

        function terminarAlto() {
            if (temporizador) { win.clearTimeout(temporizador); temporizador = null; }
            root.removeEventListener('transitionend', alTerminarAlto);
            if (!animando) return;
            animando = false;
            root.style.height = altoEnLinea;
            root.removeAttribute('data-cod-pestanas-animando');
        }

        function alTerminarAlto(evento) {
            if (evento.target === root && evento.propertyName === 'height') terminarAlto();
        }

        function animarAlto(antes) {
            var reducido = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reducido) return;
            var despues = root.getBoundingClientRect().height;
            if (Math.abs(despues - antes) < 1) return;
            altoEnLinea = root.style.height;
            animando = true;
            root.setAttribute('data-cod-pestanas-animando', '');
            root.style.height = antes + 'px';
            void root.offsetHeight; // reflujo: fija el punto de partida de la transición
            var duraciones = String(win.getComputedStyle(root).transitionDuration || '').split(',');
            var duracion = 0;
            duraciones.forEach(function (d) { duracion = Math.max(duracion, parseFloat(d) || 0); });
            if (!(duracion > 0)) { terminarAlto(); return; }
            root.addEventListener('transitionend', alTerminarAlto);
            root.style.height = despues + 'px';
            // Red de seguridad: si el navegador no emite transitionend, se limpia igual.
            temporizador = win.setTimeout(terminarAlto, Math.round(duracion * 1000) + 150);
        }
        deshacer.push(function () {
            terminarAlto();
        });

        function activar(n, enfocar) {
            if (n >= 1 && n <= piezas.length && n !== activa) {
                // El alto de partida se mide ANTES de tocar nada; si había un viaje a
                // medias, se parte de donde iba.
                var antes = root.getBoundingClientRect().height;
                terminarAlto();
                activa = n;
                root.setAttribute('data-cod-pestanas-cambio', '1');
                dibujar();
                animarAlto(antes);
            }
            if (enfocar && piezas[n - 1]) {
                try { piezas[n - 1].boton.focus({ preventScroll: true }); } catch (e) { piezas[n - 1].boton.focus(); }
            }
        }

        // Teclado (patrón de pestañas con activación automática): flechas mueven
        // y activan, con vuelta al otro extremo; Inicio y Fin van a los extremos.
        // En escritura de derecha a izquierda las flechas se invierten.
        function alTeclado(evento) {
            if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
            var actual = -1;
            for (var k = 0; k < piezas.length; k++) {
                if (piezas[k].boton === evento.target) { actual = k; break; }
            }
            if (actual < 0) return;
            var rtl = String(win.getComputedStyle(root).direction) === 'rtl';
            var tecla = evento.key;
            var destino = -1;
            if (tecla === 'ArrowRight' || tecla === 'Right') destino = actual + (rtl ? -1 : 1);
            else if (tecla === 'ArrowLeft' || tecla === 'Left') destino = actual + (rtl ? 1 : -1);
            else if (tecla === 'Home') destino = 0;
            else if (tecla === 'End') destino = piezas.length - 1;
            else return;
            if (destino < 0) destino = piezas.length - 1;
            if (destino >= piezas.length) destino = 0;
            evento.preventDefault();
            activar(destino + 1, true);
        }
        lista.addEventListener('keydown', alTeclado);
        deshacer.push(function () { lista.removeEventListener('keydown', alTeclado); });

        // Abrir una pestaña desde la URL: #id de su panel (o de su etiqueta). Es lo
        // que hace Divi con sus enlaces #tab-…; sólo actúa si el id existe.
        function porHash() {
            var hash = String((win.location && win.location.hash) || '').replace(/^#/, '');
            if (!hash) return false;
            try { hash = decodeURIComponent(hash); } catch (e) { /* se usa tal cual */ }
            for (var k = 0; k < piezas.length; k++) {
                if (piezas[k].panel.getAttribute('id') === hash || piezas[k].boton.getAttribute('id') === hash) {
                    activar(k + 1, false);
                    return true;
                }
            }
            return false;
        }
        function alCambiarHash() { porHash(); }
        win.addEventListener('hashchange', alCambiarHash);
        deshacer.push(function () { win.removeEventListener('hashchange', alCambiarHash); });

        root.classList.add('cod-pestanas');
        dibujar();
        porHash();
        marcar(root, 'data-cod-pestanas-listo', '1');
        deshacer.push(function () {
            root.classList.remove('cod-pestanas');
            ['data-cod-pestanas-activa', 'data-cod-pestanas-cambio'].forEach(function (nombre) {
                root.removeAttribute(nombre);
            });
        });

        return function destruir() {
            while (deshacer.length) deshacer.pop()();
        };
    }

    function installPestanas(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            montarPestanas(root, document);
        });
    }

    // marquesina: una fila de piezas que se desplaza sola, de derecha a izquierda,
    // en bucle continuo y sin controles. Cada hijo del grupo es una pieza (un
    // logo, un sello, una frase). El caso que la pide: los logos de certificación
    // de la landing de Econut.
    //
    // MEDIDO EN ECONUT.CL (viewport 1440x900). Es un Swiper dentro de un módulo de
    // código de Divi, con loop:true, autoplay.delay:0 y speed:8000: un
    // desplazamiento continuo y lento, no de paso en paso; cuatro piezas a la vez
    // desde 1024px, dos entre 480 y 1023px, una en 320px; 60px de separación.
    // De ahí salen los valores por omisión de acá (ocho segundos por pieza).
    //
    // SIN LIBRERÍAS. El plugin no depende de Swiper ni de nadie para esto. El
    // mecanismo es CSS puro (ver marquesina_css en el plugin): la pista lleva el
    // juego de piezas dos veces y una animación de @keyframes la desplaza
    // translateX(-50%), que es la forma estándar de un bucle sin salto visible y
    // sin JavaScript por cuadro. Este runtime sólo arma la estructura:
    //   1) mete las piezas en una pista (data-cod-marquesina-rol="pista");
    //   2) agrega las copias que cierran el bucle (data-cod-marquesina-copia,
    //      aria-hidden, inertes y sin ids, para que nada se duplique ni se repita
    //      para quien lee la página con un lector de pantalla o con el teclado);
    //   3) cuenta cuántas piezas hay en media pista y lo deja en
    //      --cod-marquesina-piezas, de donde el CSS saca la duración (así la
    //      velocidad por pieza no cambia aunque haya más o menos).
    //
    // CUÁNTAS COPIAS. Para que el bucle cierre sin hueco, media pista tiene que
    // medir al menos lo que el contenedor. Cada pieza mide 1/visibles del ancho,
    // así que basta con que media pista tenga `visibles` piezas o más. Con pocas
    // piezas (dos logos y cuatro a la vez) el juego se repite las veces que
    // haga falta. `visibles` es --cod-marquesina-visibles, que el sitio escribe
    // con una regla properties (y que cambia por ancho con el scope.breakpoint de
    // esa regla); al cambiar el tamaño de la ventana se recalcula, y sólo si el
    // resultado cambió se rehacen las copias.
    //
    // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
    //   raíz:   data-cod-marquesina-listo="1"; style --cod-marquesina-piezas
    //   pista:  data-cod-marquesina-rol="pista"
    //   pieza:  data-cod-marquesina-rol="pieza" (los hijos originales y las copias);
    //           las copias además data-cod-marquesina-copia="1" y aria-hidden="true"
    //
    // ESTRUCTURA QUE ESPERA. La raíz (data-cod-behavior="marquesina") tiene de 2 a
    // 24 hijos. Si no calza, no toca nada y las piezas quedan apiladas.
    //
    // No se monta dentro del editor: allí las piezas deben verse apiladas y
    // editables, sin copias que tocar por error (ver installMarquesinaRuntime en cod-behaviors.js).
    function montarMarquesina(root, doc) {
        if (root.getAttribute('data-cod-marquesina-listo') === '1') return null;

        var hijos = Array.prototype.slice.call(root.children);
        if (hijos.length < 2 || hijos.length > 24) return null;

        var win = doc.defaultView || window;
        var deshacer = [];
        var VISIBLES_POR_OMISION = 4;
        var MAXIMO_DE_PIEZAS = 240; // techo de seguridad: nunca se duplica más que esto
        var copias = [];
        var juegos = 0; // cuántos juegos completos hay en la pista (el original cuenta)

        // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
        function marcar(elemento, nombre, valor) {
            var antes = elemento.getAttribute(nombre);
            elemento.setAttribute(nombre, valor);
            deshacer.push(function () {
                if (antes === null) elemento.removeAttribute(nombre);
                else elemento.setAttribute(nombre, antes);
            });
        }

        // 1) La pista, al principio del grupo, con los hijos adentro (en su orden).
        var pista = doc.createElement('div');
        pista.className = 'cod-marquesina__pista';
        pista.setAttribute('data-cod-marquesina-rol', 'pista');
        root.insertBefore(pista, hijos[0]);
        hijos.forEach(function (hijo) {
            pista.appendChild(hijo);
            hijo.classList.add('cod-marquesina__pieza');
            marcar(hijo, 'data-cod-marquesina-rol', 'pieza');
        });
        deshacer.push(function () {
            // Las piezas vuelven a ser hijos directos de la raíz, en su orden.
            hijos.forEach(function (hijo) {
                hijo.classList.remove('cod-marquesina__pieza');
                root.insertBefore(hijo, pista);
            });
            if (pista.parentNode) pista.parentNode.removeChild(pista);
        });

        // Una copia no es contenido: sin ids (no se repiten), fuera del árbol de
        // accesibilidad y fuera del recorrido del teclado.
        function copiaDe(original) {
            var copia = original.cloneNode(true);
            copia.removeAttribute('id');
            Array.prototype.forEach.call(copia.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
            copia.setAttribute('aria-hidden', 'true');
            copia.setAttribute('inert', '');
            copia.setAttribute('data-cod-marquesina-copia', '1');
            return copia;
        }

        function visibles() {
            var crudo = '';
            try { crudo = win.getComputedStyle(root).getPropertyValue('--cod-marquesina-visibles'); } catch (e) { /* se usa el valor por omisión */ }
            var n = parseFloat(crudo);
            return n > 0 ? n : VISIBLES_POR_OMISION;
        }

        // 2) Las copias: 2r juegos en total (r en cada mitad), con r lo bastante
        // grande para que media pista llene el ancho.
        function armar() {
            var porMitad = Math.max(1, Math.ceil(visibles() / hijos.length));
            while (porMitad > 1 && porMitad * 2 * hijos.length > MAXIMO_DE_PIEZAS) porMitad -= 1;
            var total = porMitad * 2;
            if (total === juegos) return;
            copias.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
            copias = [];
            for (var k = 1; k < total; k++) {
                hijos.forEach(function (hijo) {
                    var copia = copiaDe(hijo);
                    pista.appendChild(copia);
                    copias.push(copia);
                });
            }
            juegos = total;
            root.style.setProperty('--cod-marquesina-piezas', String(porMitad * hijos.length));
        }
        deshacer.push(function () {
            copias.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
            copias = [];
            root.style.removeProperty('--cod-marquesina-piezas');
            if (root.getAttribute('style') === '') root.removeAttribute('style');
        });

        // 3) Al cambiar el tamaño pueden cambiar las piezas visibles (una regla
        // por breakpoint): se recalcula, con un respiro para no rehacer en cada píxel.
        var temporizador = null;
        function alCambiarTamano() {
            if (temporizador) win.clearTimeout(temporizador);
            temporizador = win.setTimeout(function () { temporizador = null; armar(); }, 150);
        }
        win.addEventListener('resize', alCambiarTamano, { passive: true });
        deshacer.push(function () {
            win.removeEventListener('resize', alCambiarTamano);
            if (temporizador) { win.clearTimeout(temporizador); temporizador = null; }
        });

        root.classList.add('cod-marquesina');
        armar();
        marcar(root, 'data-cod-marquesina-listo', '1');
        deshacer.push(function () { root.classList.remove('cod-marquesina'); });

        return function destruir() {
            while (deshacer.length) deshacer.pop()();
        };
    }

    function installMarquesina(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            montarMarquesina(root, document);
        });
    }

    // aviso: una ventana emergente que aparece sola al cargar la página, UNA vez
    // por visitante, y se cierra con la X, con Escape o pinchando el fondo. El
    // caso que la pide: estafadores vendiendo a nombre de una empresa; el sitio
    // tenía una franja de media pantalla que sólo advertía, y hacía falta un aviso
    // que además deje VERIFICAR (las cuentas oficiales enlazadas, adentro).
    //
    // El riesgo de un emergente es volverse más invasivo que lo que reemplaza.
    // Por eso lo que lo hace aceptable es lo que más cuidado tiene acá:
    //   - se cierra de tres maneras (la X, Escape, el fondo) y no vuelve (se
    //     recuerda en el navegador; ver "una vez" abajo);
    //   - NO bloquea la página: no se fija el scroll de atrás, y si este guion
    //     no corre el contenido queda legible en el flujo normal (toda la CSS del
    //     aviso cuelga de la clase .cod-aviso, que sólo pone este guion);
    //   - es accesible de verdad: role="dialog" aria-modal="true" con nombre
    //     (el primer título del aviso, o "Aviso"), el foco entra al panel al
    //     abrir, el teclado no se sale mientras está abierto (Tab y Mayús+Tab dan
    //     la vuelta) y el foco vuelve a donde estaba al cerrar.
    //
    // UNA VEZ POR VISITANTE. Se anota la hora en que se abrió en localStorage
    // (con sessionStorage de respaldo); si el navegador bloquea el almacenamiento
    // (navegación privada, cookies rechazadas) cada lectura y cada escritura va
    // en try/catch y el aviso sigue funcionando: aparece, se puede cerrar, y
    // vuelve en la visita siguiente porque no hay dónde recordarlo. Se anota al
    // ABRIR y no al cerrar: «una vez» es una vez mostrado; si no, quien sigue uno
    // de los enlaces a las cuentas oficiales (que es para lo que está) lo
    // encontraría de nuevo al volver, sin haberlo cerrado.
    //
    // CADA CUÁNTO VUELVE y EL ANCHO MÁXIMO no son parámetros de la regla: vienen
    // de las variables CSS --cod-aviso-vuelve-dias (por omisión 0: una sola vez y
    // no vuelve) y --cod-aviso-ancho-maximo, que se escriben con una regla
    // properties sobre el nodo (así valen por breakpoint como todo lo demás).
    //
    // REABRIR. Si el grupo tiene marcador (id), cualquier enlace a #<id> lo
    // vuelve a abrir aunque ya se haya visto, y entrar con #<id> en la dirección
    // también. Es lo que permite una línea permanente y discreta («cómo verificar
    // nuestras cuentas») sin dejar una franja de media pantalla.
    //
    // ESTRUCTURA QUE ARMA. El grupo pasa a ser la capa fija; adentro, el runtime
    // fabrica el velo (el fondo) y el panel (la ventana), mete en el panel un
    // botón de cierre y le pasa los hijos originales del grupo. Nada se duplica
    // ni se pierde: todo se deshace con la función que retorna.
    //
    // ATRIBUTOS QUE EMITE (el contrato para componer sin tocar el runtime):
    //   raíz:   data-cod-aviso-listo="1", data-cod-aviso-estado="abierto|cerrado"
    //   velo:   data-cod-aviso-rol="velo"   (aria-hidden)
    //   panel:  data-cod-aviso-rol="panel"  (role="dialog" aria-modal="true")
    //   cerrar: data-cod-aviso-rol="cerrar" (button, aria-label="Cerrar aviso")
    //
    // No se monta dentro del editor: allí el grupo debe verse apilado y editable
    // (ver installAvisoRuntime).
    var contadorAvisos = 0;
    var SELECTOR_ENFOCABLES = 'a[href],button,input,select,textarea,summary,iframe,audio[controls],video[controls],[contenteditable=""],[contenteditable="true"],[tabindex]';

    function montarAviso(root, doc) {
        if (root.getAttribute('data-cod-aviso-listo') === '1') return null;

        var hijos = Array.prototype.slice.call(root.children);
        if (hijos.length < 1) return null;

        contadorAvisos += 1;
        var numero = contadorAvisos;
        var win = doc.defaultView || window;
        var deshacer = [];
        var abierto = false;
        var previo = null;
        var forzandoFoco = false;
        var inicioEnFondo = null;

        // Marca un atributo estático y recuerda cómo estaba para poder deshacerlo.
        function marcar(elemento, nombre, valor) {
            var antes = elemento.getAttribute(nombre);
            elemento.setAttribute(nombre, valor);
            deshacer.push(function () {
                if (antes === null) elemento.removeAttribute(nombre);
                else elemento.setAttribute(nombre, antes);
            });
        }

        // 1) Las tres partes que fabrica el runtime.
        var velo = doc.createElement('div');
        velo.className = 'cod-aviso__velo';
        velo.setAttribute('data-cod-aviso-rol', 'velo');
        velo.setAttribute('aria-hidden', 'true');

        var panel = doc.createElement('div');
        panel.className = 'cod-aviso__panel';
        panel.setAttribute('data-cod-aviso-rol', 'panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('tabindex', '-1');

        var cerrarBoton = doc.createElement('button');
        cerrarBoton.type = 'button';
        cerrarBoton.className = 'cod-aviso__cerrar';
        cerrarBoton.setAttribute('data-cod-aviso-rol', 'cerrar');
        cerrarBoton.setAttribute('aria-label', 'Cerrar aviso');
        // La X es un SVG con trazo currentColor: toma el color del botón y no
        // trae ningún color propio. Se fabrica con createElementNS, no con
        // innerHTML, para no interpretar texto como marcado.
        var ns = 'http://www.w3.org/2000/svg';
        var equis = doc.createElementNS(ns, 'svg');
        equis.setAttribute('viewBox', '0 0 24 24');
        equis.setAttribute('aria-hidden', 'true');
        equis.setAttribute('focusable', 'false');
        var trazo = doc.createElementNS(ns, 'path');
        trazo.setAttribute('d', 'M5 5L19 19M19 5L5 19');
        trazo.setAttribute('fill', 'none');
        trazo.setAttribute('stroke', 'currentColor');
        trazo.setAttribute('stroke-width', '2');
        trazo.setAttribute('stroke-linecap', 'round');
        equis.appendChild(trazo);
        cerrarBoton.appendChild(equis);

        // El nombre de la ventana: su primer título; si no hay, "Aviso".
        var titulo = null;
        for (var i = 0; i < hijos.length && !titulo; i++) {
            var tag = String(hijos[i].tagName || '').toLowerCase();
            titulo = /^h[1-6]$/.test(tag) ? hijos[i] : (hijos[i].querySelector ? hijos[i].querySelector('h1,h2,h3,h4,h5,h6') : null);
        }
        if (titulo) {
            var idTitulo = titulo.getAttribute('id');
            if (!idTitulo) {
                idTitulo = 'cod-aviso-' + numero + '-titulo';
                marcar(titulo, 'id', idTitulo);
            }
            panel.setAttribute('aria-labelledby', idTitulo);
        } else {
            panel.setAttribute('aria-label', 'Aviso');
        }

        // 2) Armar: el botón primero en el panel, después los hijos originales.
        panel.appendChild(cerrarBoton);
        hijos.forEach(function (hijo) { panel.appendChild(hijo); });
        root.appendChild(velo);
        root.appendChild(panel);
        deshacer.push(function () {
            // Los hijos vuelven al grupo, en su orden original.
            hijos.forEach(function (hijo) { root.appendChild(hijo); });
            if (velo.parentNode) velo.parentNode.removeChild(velo);
            if (panel.parentNode) panel.parentNode.removeChild(panel);
        });

        // 3) Una vez por visitante. Cada acceso al almacenamiento puede lanzar
        // (SecurityError en navegación privada o con cookies rechazadas, o incluso
        // sólo al LEER window.localStorage): todo va en try/catch y un fallo se
        // trata como «no hay memoria», nunca como un error del aviso.
        var clave = 'cod-aviso:' + (root.getAttribute('data-cod-node') || root.getAttribute('id') || String(numero));

        function leerVisto() {
            var visto = null;
            ['localStorage', 'sessionStorage'].forEach(function (nombre) {
                try {
                    var n = parseInt(win[nombre].getItem(clave), 10);
                    if (isFinite(n) && (visto === null || n > visto)) visto = n;
                } catch (e) { /* sin almacenamiento: es como no haberlo visto */ }
            });
            return visto;
        }

        function recordarVisto() {
            var ahora = String(Date.now());
            try {
                win.localStorage.setItem(clave, ahora);
            } catch (e) {
                try { win.sessionStorage.setItem(clave, ahora); } catch (e2) { /* sin dónde recordar */ }
            }
        }

        // Cada cuántos días vuelve. 0 (o nada, o algo que no es un número): una
        // sola vez. Sale de la variable CSS, que puede variar por ancho.
        function diasParaVolver() {
            var crudo = '';
            try { crudo = win.getComputedStyle(root).getPropertyValue('--cod-aviso-vuelve-dias'); } catch (e) { /* se usa el valor por omisión */ }
            var dias = parseFloat(crudo);
            if (!isFinite(dias) || dias <= 0) return 0;
            return Math.min(dias, 3650);
        }

        function debeAparecer() {
            var visto = leerVisto();
            if (visto === null) return true;
            var dias = diasParaVolver();
            if (dias <= 0) return false;
            var ahora = Date.now();
            // Un reloj corrido hacia atrás no debe silenciarlo para siempre.
            if (visto > ahora) return false;
            return ahora - visto >= dias * 86400000;
        }

        // 4) Foco: adentro mientras está abierto, y de vuelta al cerrar.
        function enfocables() {
            var candidatos = panel.querySelectorAll(SELECTOR_ENFOCABLES);
            var lista = [];
            for (var k = 0; k < candidatos.length; k++) {
                var el = candidatos[k];
                if (el.tabIndex < 0 || el.disabled) continue;
                if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
                if (!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) continue;
                var visibilidad = '';
                try { visibilidad = win.getComputedStyle(el).visibility; } catch (e) { /* se da por visible */ }
                if (visibilidad === 'hidden') continue;
                lista.push(el);
            }
            return lista;
        }

        function enfocar(elemento) {
            try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
        }

        function alTeclado(evento) {
            if (!abierto) return;
            var tecla = evento.key;
            if (tecla === 'Escape' || tecla === 'Esc') {
                evento.preventDefault();
                cerrar();
                return;
            }
            if (tecla !== 'Tab' || evento.altKey || evento.ctrlKey || evento.metaKey) return;
            var lista = enfocables();
            if (!lista.length) {
                evento.preventDefault();
                enfocar(panel);
                return;
            }
            var primero = lista[0];
            var ultimo = lista[lista.length - 1];
            var activo = doc.activeElement;
            var dentro = activo && panel.contains(activo);
            if (evento.shiftKey) {
                if (!dentro || activo === panel || activo === primero) {
                    evento.preventDefault();
                    enfocar(ultimo);
                }
            } else if (!dentro || activo === ultimo) {
                evento.preventDefault();
                enfocar(primero);
            }
        }

        // Si el foco llega a algún sitio fuera del aviso (un clic en el navegador,
        // un script ajeno), se trae de vuelta. La bandera evita que dos guiones que
        // atrapan el foco se pasen la pelota sin fin.
        function alEnfocar(evento) {
            if (!abierto || forzandoFoco) return;
            if (evento.target && root.contains(evento.target)) return;
            forzandoFoco = true;
            try { enfocar(panel); } finally { forzandoFoco = false; }
        }

        function devolverFoco() {
            var destino = previo;
            previo = null;
            if (!destino || destino === doc.body || destino === doc.documentElement) return;
            if (typeof destino.focus !== 'function' || !doc.documentElement.contains(destino)) return;
            enfocar(destino);
        }

        // 5) Abrir y cerrar.
        function estaPedidoPorLaUrl() {
            var nombre = root.getAttribute('id');
            return !!nombre && String((win.location && win.location.hash) || '').replace(/^#/, '') === nombre;
        }

        function abrir() {
            if (abierto) return;
            abierto = true;
            var activo = doc.activeElement;
            previo = activo && !root.contains(activo) ? activo : null;
            root.setAttribute('data-cod-aviso-estado', 'abierto');
            recordarVisto();
            doc.addEventListener('keydown', alTeclado, true);
            doc.addEventListener('focusin', alEnfocar, true);
            enfocar(panel);
        }

        function cerrar() {
            if (!abierto) return;
            abierto = false;
            root.setAttribute('data-cod-aviso-estado', 'cerrado');
            doc.removeEventListener('keydown', alTeclado, true);
            doc.removeEventListener('focusin', alEnfocar, true);
            // Si se llegó por la dirección, se limpia al cerrar: recargar no debe
            // reabrir lo que la persona acaba de cerrar. Por replaceState y no por
            // location.hash = '', que deja un '#' colgando y hace saltar la página.
            if (estaPedidoPorLaUrl() && win.history && win.history.replaceState) {
                try { win.history.replaceState(null, '', win.location.pathname + win.location.search); } catch (e) { /* no se limpia la dirección */ }
            }
            devolverFoco();
        }

        cerrarBoton.addEventListener('click', cerrar);

        // Pinchar el fondo cierra. Se exige que el gesto HAYA EMPEZADO en el fondo:
        // arrastrar para seleccionar texto del panel y soltar fuera genera un clic
        // sobre la capa, y eso no es pedir que se cierre.
        function alPresionar(evento) {
            inicioEnFondo = evento.target === root || evento.target === velo;
        }
        function alPinchar(evento) {
            var empezoAhi = inicioEnFondo === null ? true : inicioEnFondo;
            inicioEnFondo = null;
            if (empezoAhi && (evento.target === root || evento.target === velo)) cerrar();
        }
        root.addEventListener('pointerdown', alPresionar);
        root.addEventListener('click', alPinchar);

        // Reabrir: un enlace a #<id> del grupo, o la dirección con ese #.
        function alPincharEnlace(evento) {
            var nombre = root.getAttribute('id');
            if (!nombre || !evento.target || typeof evento.target.closest !== 'function') return;
            var enlace = evento.target.closest('a[href]');
            if (!enlace || root.contains(enlace) || enlace.hash !== '#' + nombre) return;
            if (enlace.pathname !== win.location.pathname || enlace.host !== win.location.host) return;
            evento.preventDefault();
            abrir();
        }
        function alCambiarHash() { if (estaPedidoPorLaUrl()) abrir(); }
        doc.addEventListener('click', alPincharEnlace);
        win.addEventListener('hashchange', alCambiarHash);

        deshacer.push(function () {
            cerrarBoton.removeEventListener('click', cerrar);
            root.removeEventListener('pointerdown', alPresionar);
            root.removeEventListener('click', alPinchar);
            doc.removeEventListener('click', alPincharEnlace);
            win.removeEventListener('hashchange', alCambiarHash);
            doc.removeEventListener('keydown', alTeclado, true);
            doc.removeEventListener('focusin', alEnfocar, true);
            abierto = false;
        });

        root.classList.add('cod-aviso');
        root.setAttribute('data-cod-aviso-estado', 'cerrado');
        marcar(root, 'data-cod-aviso-listo', '1');
        deshacer.push(function () {
            root.classList.remove('cod-aviso');
            root.removeAttribute('data-cod-aviso-estado');
        });

        if (estaPedidoPorLaUrl() || debeAparecer()) abrir();

        return function destruir() {
            while (deshacer.length) deshacer.pop()();
        };
    }

    // aviso: monta la ventana sobre cada nodo declarado. Ver montarAviso (y
    // installAvisoRuntime en cod-behaviors.js, que no la monta dentro del editor).
    function installAviso(nodes) {
        Array.prototype.forEach.call(nodes, function (root) {
            montarAviso(root, document);
        });
    }

    // mapa: un mini mapa que, al pincharlo, despliega uno grande con un marcador. El
    // caso que lo pide: el pie del sitio de Econut, que lo resolvía con JavaScript
    // pegado a mano en el tema (con un recuadro «×» y Mapbox cargado en CADA visita
    // para pintar un cuadrado de 60x60). Acá el guion vive en el plugin, con
    // pruebas, y la página sólo declara los datos.
    //
    // QUÉ ES CADA COSA, y por qué está repartido así:
    //   - El MINI es una imagen del propio sitio (un archivo generado una vez con
    //     scripts/generar-mini-mapa.mjs). La pone el COMPILADOR, no este guion: un
    //     <a><img> que sin JavaScript lleva a «cómo llegar» (OpenStreetMap). Por eso
    //     se ve sin clave, sin red hacia afuera y sin guion, y no consume cuota ni
    //     entra al consentimiento de cookies: no hay petición a un tercero mientras
    //     nadie abra el mapa. Este guion sólo cambia ese enlace por un botón.
    //   - El MAPA GRANDE sí es Mapbox GL, que se descarga de un tercero (unos 700 KB
    //     más su hoja) SÓLO la primera vez que alguien lo abre; las siguientes ya
    //     está. Nunca al cargar la página. Mientras llega se dice «Cargando el
    //     mapa…»; si no llega (sin red, bloqueado, clave rechazada, sin WebGL) se
    //     dice, y se ofrece el enlace a «cómo llegar» como salida: nunca un recuadro
    //     gris para siempre.
    //   - La CLAVE no está en la página guardada: el servidor la pone al mostrarla
    //     (data-cod-mapa-token) desde Configuración → Mapa (Mapbox). Sin ese
    //     atributo (no hay clave) este guion no monta nada y el mini queda como
    //     enlace: no se ofrece abrir lo que no se puede abrir.
    //
    // ATRIBUTOS QUE LEE (los pone el compilador y el servidor):
    //   raíz: data-cod-mapa-lat, -lng, -zoom, -globo, -globo-enlace-texto,
    //         -globo-enlace-href, -marcador, -token
    //   mini: [data-cod-mapa-rol="mini"] (el <a> con la <img>; sin él no se monta)
    // ATRIBUTOS QUE EMITE:
    //   raíz:   data-cod-mapa-listo="1", data-cod-mapa-estado="abierto|cerrado"
    //   mini:   botón con data-cod-mapa-rol="mini", aria-expanded, aria-controls
    //   grande: data-cod-mapa-rol="grande" (role="region"), aria-busy mientras carga
    //   cerrar: data-cod-mapa-rol="cerrar" (botón, aria-label="Cerrar el mapa")
    //
    // ACCESIBLE. El mini es un botón de verdad (Enter y Espacio, alcanzable con Tab,
    // aria-expanded). El mapa grande NO atrapa el foco: al abrir el foco pasa a la X
    // (el mini desaparece y el foco no puede quedarse en el aire), y Escape o la X lo
    // cierran y devuelven el foco al mini. El desplazamiento hacia el mapa respeta
    // prefers-reduced-motion: con movimiento reducido salta sin animar.
    //
    // MAPBOX GL se carga con las versiones fijas de abajo. No lleva integridad
    // (SRI): el sitio de Mapbox no la publica para cada versión y un hash equivocado
    // dejaría el mapa roto; se anota como pendiente en el CHANGELOG.
    //
    // No se monta dentro del editor: allí el grupo debe verse apilado y editable.
    var contadorMapas = 0;
    var MAPBOX_GL_VERSION = '2.14.1';
    var MAPBOX_GL_JS = 'https://api.mapbox.com/mapbox-gl-js/v' + MAPBOX_GL_VERSION + '/mapbox-gl.js';
    var MAPBOX_GL_CSS = 'https://api.mapbox.com/mapbox-gl-js/v' + MAPBOX_GL_VERSION + '/mapbox-gl.css';
    var MAPBOX_GL_ESPERA_MS = 8000;
    // Estado de la descarga de Mapbox GL, compartido por todos los mapas de la
    // página: se descarga una vez y a quien llegue después se le avisa al terminar.
    var cargaMapbox = null;

    // La misma dirección que arma el servidor para el enlace del mini (COD_Mapa::url_como_llegar).
    function urlComoLlegarMapa(lat, lng, zoom) {
      var la = String(Number(lat.toFixed(6)));
      var lo = String(Number(lng.toFixed(6)));
      return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=' + Math.round(zoom) + '/' + la + '/' + lo;
    }

    // Pide Mapbox GL (la hoja y el guion) y llama a alListo(gl) o a alFallar(). Si ya
    // está en la página (porque otro mapa lo trajo, o porque la página lo tiene),
    // responde sin descargar nada. Si falla, se olvida la descarga para que un
    // segundo intento (pinchar otra vez) vuelva a pedirlo.
    function cargarMapbox(win, doc, alListo, alFallar) {
      if (win.mapboxgl) { alListo(win.mapboxgl); return; }
      if (cargaMapbox && cargaMapbox.win === win) {
        cargaMapbox.esperando.push({ listo: alListo, falla: alFallar });
        return;
      }
      var carga = { win: win, esperando: [{ listo: alListo, falla: alFallar }] };
      cargaMapbox = carga;
      var pendientes = 2;
      var terminada = false;
      var fallo = false;
      var hoja = doc.createElement('link');
      var guion = doc.createElement('script');

      function terminar(ok) {
        if (terminada) return;
        terminada = true;
        try { win.clearTimeout(temporizador); } catch (e) { /* sin temporizador */ }
        if (cargaMapbox === carga) cargaMapbox = null;
        if (!ok) {
          fallo = true;
          [hoja, guion].forEach(function (nodo) { if (nodo.parentNode) nodo.parentNode.removeChild(nodo); });
          // Si el guion llegó pero la hoja no (o al revés), la librería quedó puesta a
          // medias: se retira también, o un reintento la encontraría ya ahí y dibujaría
          // un mapa sin su hoja. Es segura de borrar: si estaba antes, no se descargó.
          try { delete win.mapboxgl; } catch (e) { win.mapboxgl = undefined; }
        }
        var gl = win.mapboxgl;
        carga.esperando.forEach(function (espera) {
          try { if (ok && gl) espera.listo(gl); else espera.falla(); } catch (e) { /* un oyente roto no debe tumbar a los demás */ }
        });
      }
      function uno() {
        pendientes -= 1;
        if (pendientes === 0) terminar(!!win.mapboxgl);
      }
      var temporizador = win.setTimeout(function () { terminar(false); }, MAPBOX_GL_ESPERA_MS);

      hoja.rel = 'stylesheet';
      hoja.href = MAPBOX_GL_CSS;
      hoja.setAttribute('data-cod-mapa-gl', 'hoja');
      hoja.onload = uno;
      hoja.onerror = function () { terminar(false); };
      guion.async = true;
      guion.src = MAPBOX_GL_JS;
      guion.setAttribute('data-cod-mapa-gl', 'guion');
      // Un guion que llega DESPUÉS de haberse dado la descarga por fallida (la hoja falló primero,
      // o se agotó la espera) no debe dejar la librería puesta: se retira apenas aparece.
      guion.onload = function () {
        if (fallo) { try { delete win.mapboxgl; } catch (e) { win.mapboxgl = undefined; } return; }
        uno();
      };
      guion.onerror = function () { terminar(false); };
      (doc.head || doc.documentElement).appendChild(hoja);
      (doc.head || doc.documentElement).appendChild(guion);
    }

    function montarMapa(root, doc) {
      if (root.getAttribute('data-cod-mapa-listo') === '1') return null;

      // Sin clave, sin datos o sin el mini del compilador no hay nada que montar: el
      // mini sigue siendo un enlace a «cómo llegar» y la dirección escrita sigue a la vista.
      var token = root.getAttribute('data-cod-mapa-token');
      var lat = parseFloat(root.getAttribute('data-cod-mapa-lat'));
      var lng = parseFloat(root.getAttribute('data-cod-mapa-lng'));
      var zoomCrudo = parseFloat(root.getAttribute('data-cod-mapa-zoom'));
      var zoom = isFinite(zoomCrudo) && zoomCrudo >= 0 && zoomCrudo <= 22 ? zoomCrudo : 17;
      if (!token || !isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      var enlaceMini = null;
      for (var c = 0; c < root.children.length && !enlaceMini; c++) {
        if (root.children[c].getAttribute('data-cod-mapa-rol') === 'mini') enlaceMini = root.children[c];
      }
      if (!enlaceMini) return null;

      contadorMapas += 1;
      var numero = contadorMapas;
      var win = doc.defaultView || window;
      var deshacer = [];
      var abierto = false;
      var generacion = 0; // cada apertura es una; una respuesta tardía de una anterior no hace nada
      var mapa = null;
      var temporizadorMapa = null;
      var comoLlegar = urlComoLlegarMapa(lat, lng, zoom);

      // 1) El mini: el enlace del compilador se cambia por un botón con la MISMA imagen.
      var imagen = enlaceMini.querySelector('img');
      var nombre = (imagen && imagen.getAttribute('alt')) || 'Abrir el mapa de ubicación';
      var idGrande = 'cod-mapa-' + numero + '-grande';
      var boton = doc.createElement('button');
      boton.type = 'button';
      boton.className = 'cod-mapa__mini';
      boton.setAttribute('data-cod-mapa-rol', 'mini');
      boton.setAttribute('aria-expanded', 'false');
      boton.setAttribute('aria-controls', idGrande);
      boton.setAttribute('aria-label', nombre);
      if (imagen) boton.appendChild(imagen);
      root.insertBefore(boton, enlaceMini);
      root.removeChild(enlaceMini);
      deshacer.push(function () {
        if (imagen) enlaceMini.appendChild(imagen);
        root.insertBefore(enlaceMini, boton);
        if (boton.parentNode) boton.parentNode.removeChild(boton);
      });

      // 2) El recuadro del mapa grande, cerrado, al final del grupo.
      var grande = doc.createElement('div');
      grande.id = idGrande;
      grande.className = 'cod-mapa__grande';
      grande.setAttribute('data-cod-mapa-rol', 'grande');
      grande.setAttribute('role', 'region');
      grande.setAttribute('aria-label', 'Mapa de ubicación');
      grande.hidden = true;

      var lienzo = doc.createElement('div');
      lienzo.className = 'cod-mapa__lienzo';

      var aviso = doc.createElement('div');
      aviso.className = 'cod-mapa__estado';
      aviso.setAttribute('role', 'status');
      aviso.hidden = true;

      var cerrarBoton = doc.createElement('button');
      cerrarBoton.type = 'button';
      cerrarBoton.className = 'cod-mapa__cerrar';
      cerrarBoton.setAttribute('data-cod-mapa-rol', 'cerrar');
      cerrarBoton.setAttribute('aria-label', 'Cerrar el mapa');
      // La X es un SVG con trazo currentColor: toma el color del botón y no trae ningún
      // color propio. Se fabrica con createElementNS, no con innerHTML.
      var ns = 'http://www.w3.org/2000/svg';
      var equis = doc.createElementNS(ns, 'svg');
      equis.setAttribute('viewBox', '0 0 24 24');
      equis.setAttribute('aria-hidden', 'true');
      equis.setAttribute('focusable', 'false');
      var trazo = doc.createElementNS(ns, 'path');
      trazo.setAttribute('d', 'M5 5L19 19M19 5L5 19');
      trazo.setAttribute('fill', 'none');
      trazo.setAttribute('stroke', 'currentColor');
      trazo.setAttribute('stroke-width', '2');
      trazo.setAttribute('stroke-linecap', 'round');
      equis.appendChild(trazo);
      cerrarBoton.appendChild(equis);

      grande.appendChild(lienzo);
      grande.appendChild(aviso);
      grande.appendChild(cerrarBoton);
      root.appendChild(grande);
      deshacer.push(function () { if (grande.parentNode) grande.parentNode.removeChild(grande); });

      function enfocar(elemento) {
        try { elemento.focus({ preventScroll: true }); } catch (e) { elemento.focus(); }
      }

      // 3) Los mensajes del recuadro. Todo es texto (textContent); nada se interpreta como HTML.
      function decir(texto, conSalida) {
        while (aviso.firstChild) aviso.removeChild(aviso.firstChild);
        var linea = doc.createElement('p');
        linea.textContent = texto;
        aviso.appendChild(linea);
        if (conSalida) {
          var salida = doc.createElement('a');
          salida.href = comoLlegar;
          salida.target = '_blank';
          salida.rel = 'noopener noreferrer';
          salida.textContent = 'Cómo llegar';
          aviso.appendChild(salida);
        }
        aviso.hidden = false;
      }

      function fallar(motivo) {
        grande.setAttribute('aria-busy', 'false');
        decir(motivo || 'No se pudo cargar el mapa.', true);
      }

      // 4) El mapa de Mapbox, con el marcador y el globo.
      function contenidoDelGlobo() {
        var caja = doc.createElement('div');
        var texto = doc.createElement('p');
        texto.textContent = root.getAttribute('data-cod-mapa-globo') || '';
        caja.appendChild(texto);
        var textoEnlace = root.getAttribute('data-cod-mapa-globo-enlace-texto');
        var hrefEnlace = root.getAttribute('data-cod-mapa-globo-enlace-href');
        if (textoEnlace && hrefEnlace) {
          var enlace = doc.createElement('a');
          enlace.href = hrefEnlace;
          // Un enlace de verdad, pero sólo a destinos que no ejecutan nada: nunca javascript: ni data:.
          if (/^(https?:|mailto:|tel:)$/i.test(enlace.protocol)) {
            enlace.textContent = textoEnlace;
            if (enlace.host && enlace.host !== (win.location && win.location.host)) {
              enlace.target = '_blank';
              enlace.rel = 'noopener noreferrer';
            }
            var parrafo = doc.createElement('p');
            parrafo.appendChild(enlace);
            caja.appendChild(parrafo);
          }
        }
        return caja;
      }

      function dibujar(gl, miGeneracion) {
        if (!abierto || miGeneracion !== generacion) return;
        var listo = false;
        try {
          if (typeof gl.supported === 'function' && !gl.supported()) {
            fallar('Este navegador no puede dibujar el mapa.');
            return;
          }
          gl.accessToken = token;
          mapa = new gl.Map({
            container: lienzo,
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [lng, lat],
            zoom: zoom,
          });
          // La atribución de Mapbox y de OpenStreetMap queda en su sitio: acá es donde se
          // usa el mapa de verdad y hay espacio. Los términos de Mapbox la exigen.
          mapa.addControl(new gl.NavigationControl(), 'top-left');

          var imagenMarcador = root.getAttribute('data-cod-mapa-marcador');
          var marcador;
          if (imagenMarcador) {
            var pin = doc.createElement('img');
            pin.src = imagenMarcador;
            pin.alt = '';
            pin.style.setProperty('width', '50px');
            pin.style.setProperty('height', 'auto');
            marcador = new gl.Marker({ element: pin, anchor: 'bottom' });
          } else {
            marcador = new gl.Marker();
          }
          marcador.setLngLat([lng, lat]);
          // El globo es texto: setDOMContent con nodos fabricados arriba, nunca setHTML.
          var globo = new gl.Popup({ offset: 25 });
          globo.setDOMContent(contenidoDelGlobo());
          marcador.setPopup(globo);
          marcador.addTo(mapa);
          marcador.togglePopup();

          mapa.on('load', function () {
            if (miGeneracion !== generacion) return;
            listo = true;
            win.clearTimeout(temporizadorMapa);
            aviso.hidden = true;
            grande.setAttribute('aria-busy', 'false');
          });
          // Una clave rechazada o un estilo que no llega aparecen como error ANTES de
          // cargar: se dice en vez de dejar el recuadro en blanco.
          mapa.on('error', function (evento) {
            if (miGeneracion !== generacion || listo) return;
            var estado = evento && evento.error && evento.error.status;
            win.clearTimeout(temporizadorMapa);
            fallar(estado === 401 || estado === 403
              ? 'Mapbox rechazó la clave del sitio.'
              : 'No se pudo cargar el mapa.');
          });
          temporizadorMapa = win.setTimeout(function () {
            if (miGeneracion === generacion && !listo) fallar('El mapa tarda demasiado en cargar.');
          }, MAPBOX_GL_ESPERA_MS);
        } catch (e) {
          fallar('No se pudo cargar el mapa.');
        }
      }

      function destruirMapa() {
        win.clearTimeout(temporizadorMapa);
        if (mapa) {
          try { mapa.remove(); } catch (e) { /* ya no estaba */ }
          mapa = null;
        }
        while (lienzo.firstChild) lienzo.removeChild(lienzo.firstChild);
      }

      // 5) Abrir y cerrar.
      function irAlMapa() {
        var reducido = false;
        try { reducido = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* se anima */ }
        try {
          grande.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'nearest' });
        } catch (e) {
          grande.scrollIntoView(false);
        }
      }

      function abrir() {
        if (abierto) return;
        abierto = true;
        generacion += 1;
        var miGeneracion = generacion;
        root.setAttribute('data-cod-mapa-estado', 'abierto');
        boton.setAttribute('aria-expanded', 'true');
        grande.hidden = false;
        grande.setAttribute('aria-busy', 'true');
        decir('Cargando el mapa…', true);
        enfocar(cerrarBoton);
        irAlMapa();
        cargarMapbox(win, doc, function (gl) { dibujar(gl, miGeneracion); }, function () {
          if (abierto && miGeneracion === generacion) fallar('No se pudo cargar el mapa.');
        });
      }

      function cerrar() {
        if (!abierto) return;
        abierto = false;
        generacion += 1;
        destruirMapa();
        root.setAttribute('data-cod-mapa-estado', 'cerrado');
        boton.setAttribute('aria-expanded', 'false');
        grande.hidden = true;
        aviso.hidden = true;
        // El mini volvió a mostrarse: el foco vuelve a él, que es de donde se abrió.
        enfocar(boton);
      }

      function alPinchar() { if (abierto) cerrar(); else abrir(); }
      // Escape cierra desde dentro del mapa. No hay trampa de foco: el mapa grande es un
      // contenido más de la página, no una ventana.
      function alTeclado(evento) {
        if (!abierto) return;
        if (evento.key === 'Escape' || evento.key === 'Esc') {
          evento.preventDefault();
          cerrar();
        }
      }
      boton.addEventListener('click', alPinchar);
      cerrarBoton.addEventListener('click', cerrar);
      grande.addEventListener('keydown', alTeclado);
      deshacer.push(function () {
        boton.removeEventListener('click', alPinchar);
        cerrarBoton.removeEventListener('click', cerrar);
        grande.removeEventListener('keydown', alTeclado);
        generacion += 1;
        abierto = false;
        destruirMapa();
      });

      root.classList.add('cod-mapa');
      root.setAttribute('data-cod-mapa-estado', 'cerrado');
      root.setAttribute('data-cod-mapa-listo', '1');
      deshacer.push(function () {
        root.classList.remove('cod-mapa');
        root.removeAttribute('data-cod-mapa-estado');
        root.removeAttribute('data-cod-mapa-listo');
      });

      return function destruir() {
        while (deshacer.length) deshacer.pop()();
      };
    }

    // mapa: monta el mini y el mapa grande sobre cada nodo declarado. Ver montarMapa
    // (y installMapaRuntime en cod-behaviors.js, que no lo monta dentro del editor).
    function installMapa(nodes) {
      Array.prototype.forEach.call(nodes, function (root) {
        montarMapa(root, document);
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
        var prefCookiesNodes = [];
        var cuadrantesNodes = [];
        var pestanasNodes = [];
        var marquesinaNodes = [];
        var avisoNodes = [];
        var mapaNodes = [];
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
            else if (behavior === 'preferencias-cookies') prefCookiesNodes.push(node);
            else if (behavior === 'cuadrantes') cuadrantesNodes.push(node);
            else if (behavior === 'pestanas') pestanasNodes.push(node);
            else if (behavior === 'marquesina') marquesinaNodes.push(node);
            else if (behavior === 'aviso') avisoNodes.push(node);
            else if (behavior === 'mapa') mapaNodes.push(node);
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
        installPreferenciasCookies(prefCookiesNodes);
        installCuadrantes(cuadrantesNodes);
        installPestanas(pestanasNodes);
        installMarquesina(marquesinaNodes);
        installAviso(avisoNodes);
        installMapa(mapaNodes);

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
