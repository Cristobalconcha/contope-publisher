/**
 * Open CoDesign Canvas — compositor de video con transparencia real (luma matte).
 *
 * Convención del archivo fuente (documentada en el inspector del editor):
 *   Un único MP4 H.264 con el video RGB ARRIBA y la máscara blanco/negro ABAJO
 *   (mismo ancho, el doble de alto que el video final). Ej.: video final de
 *   1080×1920 → archivo fuente de 1080×3840 (0–1919 = RGB, 1920–3839 = matte).
 *   Blanco = visible, negro = transparente.
 *
 * Este script NO depende de un bundler y funciona en dos contextos:
 *   1) Runtime público: se encola en la página publicada y se auto-arranca
 *      escaneando `[data-ocd-luma-matte="1"]`.
 *   2) Previsualización del editor: el core (`ocd-editor-core.js`) lo invoca
 *      con `OcdLumaMatteVideo.createRuntime({ window, document })` usando el
 *      `window`/`document` del iframe del lienzo GrapesJS.
 *
 * Composición por canvas 2D, cuadro a cuadro:
 *   - Dibuja la mitad superior del frame fuente (RGB) normalmente.
 *   - Dibuja la mitad inferior (matte) en un canvas temporal, convierte su
 *     luminancia a canal alfa (getImageData) y aplica `destination-in` sobre
 *     el canvas visible. H.264 no lleva alfa en el archivo; por eso el brillo
 *     del matte se materializa como alfa real antes del `destination-in`.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else if (typeof define === 'function' && define.amd) define([], factory);
    else root.OcdLumaMatteVideo = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ATTR = 'data-ocd-luma-matte';
    var RUNTIME_ATTR = 'data-ocd-luma-matte-runtime';
    var VIDEO_CLASS = 'ocd-luma-matte__video';
    var CANVAS_CLASS = 'ocd-luma-matte__canvas';
    var STYLE_ID = 'ocd-luma-matte-video-styles';

    var activeRuntimes = [];

    function toArray(list) {
        return Array.prototype.slice.call(list || []);
    }

    function installStyles(doc) {
        if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
        var style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '[data-ocd-luma-matte="1"] { position:relative; display:block; line-height:0; }',
            '[data-ocd-luma-matte="1"] .' + VIDEO_CLASS + ' { display:none !important; }',
            '[data-ocd-luma-matte="1"] .' + CANVAS_CLASS + ' { display:block; width:100%; height:auto; }'
        ].join('');
        doc.head.appendChild(style);
    }

    function findVideo(wrapper) {
        return wrapper && wrapper.querySelector ? wrapper.querySelector('video') : null;
    }

    function findCanvas(wrapper) {
        return wrapper && wrapper.querySelector ? wrapper.querySelector('canvas') : null;
    }

    function cancelScheduled(state) {
        if (state.rafId === null || state.rafId === undefined) return;
        try {
            if (typeof state.video.cancelVideoFrameCallback === 'function') {
                state.video.cancelVideoFrameCallback(state.rafId);
            } else if (state.win.cancelAnimationFrame) {
                state.win.cancelAnimationFrame(state.rafId);
            } else {
                state.win.clearTimeout(state.rafId);
            }
        } catch (_error) {
            // Un frame ya ejecutado no debe tumbar el loop.
        }
        state.rafId = null;
    }

    function schedule(state) {
        if (state.destroyed) return;
        cancelScheduled(state);
        if (typeof state.video.requestVideoFrameCallback === 'function') {
            state.rafId = state.video.requestVideoFrameCallback(state.renderFrame);
        } else if (state.win.requestAnimationFrame) {
            state.rafId = state.win.requestAnimationFrame(state.renderFrame);
        } else {
            state.rafId = state.win.setTimeout(state.renderFrame, 33);
        }
    }

    function installWrapper(wrapper, win, doc, cleanups) {
        if (!wrapper || wrapper.nodeType !== 1) return;
        if (wrapper.getAttribute(ATTR) !== '1') return;
        if (wrapper.getAttribute(RUNTIME_ATTR) === '1') return;

        var video = findVideo(wrapper);
        var canvas = findCanvas(wrapper);
        if (!video || !canvas) return;

        var ctx = null;
        try { ctx = canvas.getContext('2d'); } catch (_error) { ctx = null; }
        if (!ctx) return;

        var matte = doc.createElement('canvas');
        var matteCtx = null;
        try { matteCtx = matte.getContext('2d'); } catch (_error) { matteCtx = null; }
        if (!matteCtx) return;

        // El MP4 apilado se reproduce como un video normal (H.264): autoplay
        // muted + playsinline es la combinación que todos los navegadores
        // modernos permiten sin gesto del usuario.
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        if (!video.hasAttribute('autoplay')) video.setAttribute('autoplay', '');
        if (!video.hasAttribute('loop')) video.setAttribute('loop', '');

        var state = {
            wrapper: wrapper,
            video: video,
            canvas: canvas,
            ctx: ctx,
            matte: matte,
            matteCtx: matteCtx,
            win: win,
            destroyed: false,
            rafId: null,
            lastVideoTime: -1,
            width: 0,
            height: 0,
            gestureHandler: null
        };

        function sourceSize() {
            var vw = video.videoWidth || 0;
            var vh = video.videoHeight || 0;
            if (vw > 0 && vh >= 2) {
                return { width: vw, height: Math.floor(vh / 2) };
            }
            return null;
        }

        function ensureSize() {
            var size = sourceSize();
            if (!size) {
                var attrWidth = Number.parseInt(canvas.getAttribute('width'), 10);
                var attrHeight = Number.parseInt(canvas.getAttribute('height'), 10);
                if (Number.isFinite(attrWidth) && Number.isFinite(attrHeight) && attrWidth > 0 && attrHeight > 0) {
                    size = { width: attrWidth, height: attrHeight };
                }
            }
            if (!size) {
                try {
                    var rect = wrapper.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) size = { width: rect.width, height: rect.height };
                } catch (_error) {
                    size = null;
                }
            }
            if (!size || size.width <= 0 || size.height <= 0) return false;

            if (canvas.width !== size.width) canvas.width = size.width;
            if (canvas.height !== size.height) canvas.height = size.height;
            if (matte.width !== size.width) matte.width = size.width;
            if (matte.height !== size.height) matte.height = size.height;
            state.width = size.width;
            state.height = size.height;
            return true;
        }

        function renderFrame() {
            if (state.destroyed) return;
            if (video.readyState < 2) {
                schedule(state);
                return;
            }
            if (video.currentTime === state.lastVideoTime) {
                schedule(state);
                return;
            }
            state.lastVideoTime = video.currentTime;
            if (!ensureSize()) {
                schedule(state);
                return;
            }

            try {
                // 1) Mitad superior del frame fuente = video RGB final.
                ctx.globalCompositeOperation = 'source-over';

                // Primer cuadro compuesto: recién ahora hay algo que mostrar.
                if (!state.primerCuadro) {
                    state.primerCuadro = true;
                    wrapper.classList.add('ocd-luma-matte--listo');
                    try {
                        wrapper.dispatchEvent(new CustomEvent('ocd-luma-matte-listo', { bubbles: true }));
                    } catch (_error) {
                        // Navegadores sin CustomEvent: la clase basta.
                    }
                }
                ctx.clearRect(0, 0, state.width, state.height);
                ctx.drawImage(video, 0, 0, state.width, state.height, 0, 0, state.width, state.height);

                // 2) Mitad inferior = matte. Se copia a un canvas temporal y su
                // luminancia se convierte en alfa real (H.264 no trae alfa).
                matteCtx.globalCompositeOperation = 'source-over';
                matteCtx.clearRect(0, 0, state.width, state.height);
                matteCtx.drawImage(video, 0, state.height, state.width, state.height, 0, 0, state.width, state.height);

                var image = null;
                try {
                    image = matteCtx.getImageData(0, 0, state.width, state.height);
                } catch (_error) {
                    image = null;
                }
                if (image) {
                    var data = image.data;
                    for (var i = 0; i < data.length; i += 4) {
                        // Blanco (255) = opaco, negro (0) = transparente.
                        var alpha = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                        data[i + 3] = alpha;
                    }
                    matteCtx.putImageData(image, 0, 0);
                }

                // 3) El alfa del matte recorta lo ya dibujado.
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(matte, 0, 0, state.width, state.height, 0, 0, state.width, state.height);
                ctx.globalCompositeOperation = 'source-over';
            } catch (_error) {
                // Un frame con error no debe romper la página ni detener el loop.
            }
            schedule(state);
        }

        state.renderFrame = renderFrame;

        function onLoadedData() {
            if (state.destroyed) return;
            ensureSize();
            renderFrame();
        }

        function playVideo() {
            var playback = video.play();
            if (playback && typeof playback.catch === 'function') {
                playback.catch(function () {
                    // Autoplay bloqueado por el navegador: reintentamos con el
                    // primer gesto del usuario sobre el canvas visible. Es el
                    // mismo patrón de `.ocd-video-sound-toggle` del runtime
                    // público, adaptado a un video oculto y silencioso.
                    if (state.destroyed) return;
                    if (state.gestureHandler || !wrapper.addEventListener) return;
                    state.gestureHandler = function () {
                        if (state.destroyed) return;
                        var retry = video.play();
                        if (retry && typeof retry.catch === 'function') retry.catch(function () {});
                        if (wrapper.removeEventListener) {
                            wrapper.removeEventListener('click', state.gestureHandler);
                            wrapper.removeEventListener('touchend', state.gestureHandler);
                        }
                        state.gestureHandler = null;
                    };
                    wrapper.addEventListener('click', state.gestureHandler);
                    wrapper.addEventListener('touchend', state.gestureHandler);
                });
            }
        }

        video.addEventListener('loadeddata', onLoadedData);
        wrapper.setAttribute(RUNTIME_ATTR, '1');
        playVideo();
        ensureSize();
        renderFrame();

        cleanups.push(function () {
            state.destroyed = true;
            cancelScheduled(state);
            try { video.removeEventListener('loadeddata', onLoadedData); } catch (_error) {}
            if (state.gestureHandler && wrapper.removeEventListener) {
                wrapper.removeEventListener('click', state.gestureHandler);
                wrapper.removeEventListener('touchend', state.gestureHandler);
            }
            wrapper.removeAttribute(RUNTIME_ATTR);
        });
    }

    /**
     * Instala el compositor sobre `env.window`/`env.document` (acepta tanto
     * `{window, document}` como un `window` directo). Reemplaza cualquier
     * runtime previo para el mismo documento para que sea idempotente.
     *
     * @returns {Function} destroy() que desarma listeners y loops.
     */
    function createRuntime(env, options) {
        var win = env && env.window ? env.window : env;
        var doc = env && env.document ? env.document : (win && win.document ? win.document : null);
        if (!win || !doc || typeof doc.querySelectorAll !== 'function') return function () {};

        for (var i = activeRuntimes.length - 1; i >= 0; i -= 1) {
            if (activeRuntimes[i].doc === doc) {
                var previous = activeRuntimes[i];
                activeRuntimes.splice(i, 1);
                try { previous.destroy(); } catch (_error) {}
            }
        }

        var cleanups = [];
        var roots = toArray(doc.querySelectorAll('[' + ATTR + '="1"]'));
        if (roots.length > 0) {
            installStyles(doc);
            roots.forEach(function (wrapper) {
                installWrapper(wrapper, win, doc, cleanups);
            });
        }

        var destroyed = false;
        var destroy = function () {
            if (destroyed) return;
            destroyed = true;
            for (var j = activeRuntimes.length - 1; j >= 0; j -= 1) {
                if (activeRuntimes[j].destroy === destroy) activeRuntimes.splice(j, 1);
            }
            while (cleanups.length) {
                var cleanup = cleanups.pop();
                try { cleanup(); } catch (_error) {}
            }
        };

        activeRuntimes.push({ doc: doc, destroy: destroy });
        return destroy;
    }

    function install(root, options) {
        var doc = root && root.ownerDocument ? root.ownerDocument : (typeof document !== 'undefined' ? document : null);
        var win = doc && doc.defaultView ? doc.defaultView : (typeof window !== 'undefined' ? window : null);
        return createRuntime({ window: win, document: doc }, options);
    }

    // Auto-arranque del runtime público. En el admin del editor no hay wrappers
    // en el documento principal (viven en el iframe del lienzo), así que no
    // tiene efecto visible; el core los instala por su cuenta en el iframe.
    if (typeof document !== 'undefined') {
        var boot = function () {
            createRuntime({ window: window, document: document });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    }

    return {
        ATTR: ATTR,
        createRuntime: createRuntime,
        install: install
    };
});
