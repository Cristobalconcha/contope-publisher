/**
 * ContOpe Publisher — reproductor de tramas generativas.
 *
 * Decisión 36 (2026-10-09): «Core genera las tramas. El reproductor solo los
 * muestra». Este archivo es SÓLO el reproductor: lee un archivo de trama y lo
 * dibuja detrás del contenido de una sección, sin ninguna interfaz visible.
 * El motor, la línea de tiempo, el formato, los tramos y las tiras son de
 * `ContopeTrama` (`assets/vendor/contope-trama/contope-trama.js`), traído de
 * contopedesign-core con `scripts/traer-motor-trama.mjs` y verificado por
 * sha256. Acá no hay motor: si lo hubiera, habría dos que pueden divergir.
 *
 * Marcado (lo único que este reproductor busca):
 *
 *   <section data-cod-trama="CT1.…"              la trama en línea: CT1., SP1. o JSON
 *            data-cod-trama-fuente="/wp-content/uploads/…/x.trama.json"
 *                                                  o un archivo de Medios (PHP lo pone en
 *                                                  línea al servir la página, ver COD_Trama)
 *            data-cod-trama-modo="vivo"           vivo (por omisión) | estatico
 *            data-cod-trama-interaccion="1"       1 = lo que diga el archivo (por omisión)
 *                                                  0 | cursor | paralaje | ambos
 *            data-cod-trama-fondo="1">            1 = pinta el fondo del archivo | 0 = transparente
 *     <script type="application/json" data-cod-trama-receta>…</script>   (lo pone PHP)
 *     …contenido normal de la sección…
 *   </section>
 *
 * Qué hace:
 *   - Un worker (archivo del plugin, nunca `blob:`) calcula los cuadros por
 *     adelantado, a 12 por segundo y hasta 1 s adelante, con el motor único.
 *   - La pantalla interpola entre dos cuadros vecinos, sólo si miden lo mismo.
 *   - Dibuja en WebGL (canvas 2D de respaldo) los tres modos del archivo:
 *     puntos, líneas (tiras de triángulos con grosor real, calculadas en el
 *     worker) y mixto (líneas debajo, puntos encima), con su tinta: luz
 *     (suma) o tinta (multiplica), sobre el fondo del archivo.
 *   - En vivo no tiene final; una secuencia sigue su línea de tiempo.
 *   - El cursor (y el paralaje, si el archivo lo pide) se aplican en la GPU,
 *     sin pasar por el buffer: sin retraso.
 *   - No trabaja fuera de pantalla ni con la pestaña oculta. Con
 *     `prefers-reduced-motion` o en modo estático muestra el `cuadroQuieto`.
 *   - Diagnóstico sólo en desarrollo (`codTramaConfig.diagnostico`, que PHP
 *     enciende con WP_DEBUG, o para quien administra con
 *     `?cod-trama-diagnostico=1`): en la consola. El público nunca ve nada.
 *
 * Dos contextos, igual que cod-luma-matte-video.js:
 *   1) Página publicada: arranca solo.
 *   2) Editor: `OcdTrama.createRuntime({ window, document, buscarFuente: true })`
 *      con el window/document del iframe del lienzo. En el editor la receta
 *      de Medios no viene en línea (no pasó por PHP), así que se lee del
 *      propio sitio.
 *
 * Sin red en la página publicada (la receta viaja en el HTML), sin
 * dependencias externas, sin fuentes.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        var T = null;
        try { T = require('../vendor/contope-trama/contope-trama.js'); } catch (_e) { T = null; }
        module.exports = factory(T);
    } else {
        root.OcdTrama = factory(root.ContopeTrama || null);
    }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (T) {
    'use strict';

    var ATTR = 'data-cod-trama';
    var FUENTE_ATTR = 'data-cod-trama-fuente';
    var MODE_ATTR = 'data-cod-trama-modo';
    var INTERACTION_ATTR = 'data-cod-trama-interaccion';
    var FONDO_ATTR = 'data-cod-trama-fondo';
    var RECETA_ATTR = 'data-cod-trama-receta';
    var RUNTIME_ATTR = 'data-cod-trama-runtime';
    var OBSERVED = [ATTR, FUENTE_ATTR, MODE_ATTR, INTERACTION_ATTR, FONDO_ATTR];
    var CANVAS_CLASS = 'cod-trama__canvas';
    var STYLE_ID = 'cod-trama-styles';
    var CALC_FPS = 12;
    var AHEAD_SECONDS = 1;

    /* ---------- configuración que pone PHP ---------- */

    // La URL de este script, para deducir las de los workers si PHP no las
    // pasó (una página de prueba fuera de WordPress, por ejemplo).
    var scriptSrc = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';

    function config() {
        var c = (typeof window !== 'undefined' && window.codTramaConfig) || {};
        var base = scriptSrc ? scriptSrc.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : '';
        return {
            worker: c.worker || (base ? base + '../vendor/contope-trama/contope-trama-worker.js' : ''),
            workerTiras: c.workerTiras || (base ? base + 'cod-trama-tiras-worker.js' : ''),
            diagnostico: !!c.diagnostico
        };
    }

    /* ---------- leer la trama ---------- */

    /**
     * Lee una trama (JSON, `CT1.…`, `SP1.…` u objeto) con el lector del motor.
     * Devuelve `{ ok, trama, origen, avisos, compat? }` o `{ ok: false, errores }`.
     * Nunca lanza.
     *
     * COMPATIBILIDAD SP1. Un código de captura viejo se dibujaba sobre un
     * lienzo transparente que tomaba la proporción de la sección. Para que lo
     * publicado se siga viendo igual, de un SP1 no se pinta el fondo y el
     * lienzo queda libre (aunque la captura anotara `format: 1920x1080`).
     */
    function leer(fuente) {
        if (!T) return { ok: false, errores: [{ ruta: '', mensaje: 'no está cargado el motor de tramas (ContopeTrama)' }] };
        var r;
        try { r = T.leerTrama(fuente); } catch (e) { r = { ok: false, errores: [{ ruta: '', mensaje: String((e && e.message) || e) }] }; }
        if (r.ok && r.origen === 'sp1') {
            r.trama.lienzo = { tipo: 'libre' };
            r.compat = { sinFondo: true };
        }
        return r;
    }

    /** La receta en línea que pone PHP (`<script type="application/json" data-cod-trama-receta>`). */
    function recetaEnLinea(el) {
        for (var i = 0; i < el.children.length; i++) {
            var c = el.children[i];
            if (c.tagName === 'SCRIPT' && c.hasAttribute(RECETA_ATTR)) return c.textContent || '';
        }
        return '';
    }

    function hexAUnidad(hex) {
        var c = T.hexARgb(hex);
        return [c[0] / 255, c[1] / 255, c[2] / 255];
    }

    function installStyles(doc) {
        if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
        var style = doc.createElement('style');
        style.id = STYLE_ID;
        // Sólo los elementos donde la trama de verdad corre: una trama
        // inválida no le cambia el `position` a nadie. `isolation` es lo que
        // deja al z-index:-1 por encima del fondo de la sección y por debajo
        // de su texto.
        style.textContent = [
            '[' + RUNTIME_ATTR + '] { position: relative; isolation: isolate; }',
            '[' + RUNTIME_ATTR + '] > canvas.' + CANVAS_CLASS + ' { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; display: block; }'
        ].join('\n');
        doc.head.appendChild(style);
    }

    /* ---------- dibujo en la GPU ---------- */

    // El cursor y el paralaje no pasan por el buffer: se aplican acá. La
    // deformación del cursor es la de la primera versión; el paralaje es una
    // aproximación en pantalla del giro de cámara del motor (desplaza más lo
    // que está lejos del centro de la lámina en profundidad).
    var VS_COMUN = [
        'uniform vec2 uView; uniform vec2 uOff; uniform vec2 uMouse; uniform float uForce; uniform float uRad2; uniform vec2 uPar;',
        'vec3 deformar(vec2 pos, float near) {',
        '  vec2 ndc = vec2((pos.x - uOff.x) / uView.x * 2.0 - 1.0, 1.0 - (pos.y - uOff.y) / uView.y * 2.0);',
        '  ndc += uPar * (near - 0.5);',
        '  float asp = uView.x / uView.y;',
        '  vec2 d = vec2((ndc.x - uMouse.x) * asp, ndc.y - uMouse.y);',
        '  float k = uForce * exp(-dot(d, d) / uRad2);',
        '  float dl = max(length(d), 1e-4);',
        '  ndc += vec2(d.x / dl / asp, d.y / dl) * k * 0.02;',
        '  return vec3(ndc, k);',
        '}'
    ].join('\n');
    var VS_PUNTOS = [
        'attribute vec2 aPos; attribute float aR; attribute float aNear; attribute float aA;',
        'uniform float uDpr; uniform float uOpac;',
        VS_COMUN,
        'varying float vNear; varying float vA;',
        'void main() {',
        '  vec3 n = deformar(aPos, aNear);',
        '  gl_Position = vec4(n.xy, 0.0, 1.0);',
        '  gl_PointSize = max(1.0, aR * (1.0 + n.z * 0.8) * 2.0 * uDpr);',
        '  vNear = clamp(aNear + n.z * 0.35, 0.0, 1.0);',
        '  vA = aA * uOpac * (1.0 + n.z * 0.6);',
        '}'
    ].join('\n');
    var FS_PUNTOS = [
        'precision mediump float;',
        'uniform vec3 uDeep; uniform vec3 uAcc; uniform float uTinta;',
        'varying float vNear; varying float vA;',
        'void main() {',
        '  vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c);',
        '  if (d > 1.0 || vA < 0.02) discard;',
        // los 12 tonos y 4 niveles de alfa del motor (tonoDeCercania, nivelDeAlfa)
        '  float b = floor(vNear * 11.0 + 0.5) / 11.0;',
        '  float a = (min(3.0, floor(vA * 4.0)) + 0.5) / 4.0 * smoothstep(1.0, 0.75, d);',
        '  vec3 col = mix(uDeep, uAcc, b);',
        '  gl_FragColor = uTinta > 0.5 ? vec4(col * a, a) : vec4(col, a);',
        '}'
    ].join('\n');
    var VS_TIRAS = [
        'attribute vec2 aPos; attribute vec3 aCol; attribute float aA;',
        'uniform vec3 uDeep; uniform vec3 uAcc;',
        VS_COMUN,
        'varying vec3 vCol; varying float vA;',
        'void main() {',
        // la cercanía de un vértice se recupera de su tono (lejos → cerca)
        '  vec3 e = uAcc - uDeep; float ee = dot(e, e);',
        '  float near = ee > 1e-6 ? clamp(dot(aCol - uDeep, e) / ee, 0.0, 1.0) : 0.5;',
        '  vec3 n = deformar(aPos, near);',
        '  gl_Position = vec4(n.xy, 0.0, 1.0);',
        '  vCol = aCol; vA = aA;',
        '}'
    ].join('\n');
    var FS_TIRAS = [
        'precision mediump float;',
        'uniform float uTinta;',
        'varying vec3 vCol; varying float vA;',
        'void main() {',
        '  gl_FragColor = uTinta > 0.5 ? vec4(vCol * vA, vA) : vec4(vCol, vA);',
        '}'
    ].join('\n');
    var UNIFORMS = ['uView', 'uOff', 'uMouse', 'uForce', 'uRad2', 'uPar', 'uDpr', 'uOpac', 'uDeep', 'uAcc', 'uTinta'];
    var LAYOUT_PUNTOS = [['aPos', 2], ['aR', 1], ['aNear', 1], ['aA', 1]];
    var LAYOUT_TIRAS = [['aPos', 2], ['aCol', 3], ['aA', 1]];

    /**
     * El antialias (MSAA) sólo con líneas: suaviza el borde de las tiras. Con
     * puntos solos queda apagado, como en la primera versión, y así un SP1
     * publicado se dibuja idéntico, píxel a píxel (comprobado con capturas).
     */
    function setupGL(canvas, antialias) {
        var gl = null;
        try { gl = canvas.getContext('webgl', { antialias: !!antialias, premultipliedAlpha: false, alpha: true }); } catch (_e) { gl = null; }
        if (!gl) return null;
        function sh(type, src) {
            var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        }
        function programa(vsSrc, fsSrc, layout) {
            var vs = sh(gl.VERTEX_SHADER, vsSrc), fs = sh(gl.FRAGMENT_SHADER, fsSrc);
            if (!vs || !fs) return null;
            var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
            var loc = {};
            layout.forEach(function (a) { loc[a[0]] = gl.getAttribLocation(p, a[0]); });
            UNIFORMS.forEach(function (n) { loc[n] = gl.getUniformLocation(p, n); });
            return { p: p, loc: loc, layout: layout, vbo: gl.createBuffer() };
        }
        var puntos = programa(VS_PUNTOS, FS_PUNTOS, LAYOUT_PUNTOS);
        var tiras = programa(VS_TIRAS, FS_TIRAS, LAYOUT_TIRAS);
        if (!puntos || !tiras) return null;
        return { gl: gl, puntos: puntos, tiras: tiras };
    }

    function usar(gl, prog) {
        gl.useProgram(prog.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, prog.vbo);
        // Los dos programas comparten índices de atributo: se apagan todos
        // antes de prender los propios.
        for (var i = 0; i < 4; i++) gl.disableVertexAttribArray(i);
        var stride = 0, off = 0, k;
        for (k = 0; k < prog.layout.length; k++) stride += prog.layout[k][1] * 4;
        for (k = 0; k < prog.layout.length; k++) {
            var l = prog.loc[prog.layout[k][0]];
            if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, prog.layout[k][1], gl.FLOAT, false, stride, off); }
            off += prog.layout[k][1] * 4;
        }
    }

    /** El worker es un ARCHIVO del plugin: nunca `blob:` ni el texto de una función. */
    function makeWorker(win, url, cfg) {
        if (!url || !win.Worker) return null;
        try {
            return new win.Worker(url);
        } catch (_error) {
            // CSP estricta u otro bloqueo: el buffer se llena en el hilo principal.
            if (cfg.diagnostico && win.console) win.console.info('[cod-trama] no se pudo crear el worker', url);
            return null;
        }
    }

    /* ---------- una trama en un elemento ---------- */

    function Instance(el, win, doc, lectura, cfgGlobal) {
        var trama = lectura.trama;
        var interAttr = (el.getAttribute(INTERACTION_ATTR) || '1').toLowerCase();
        var fondoAttr = el.getAttribute(FONDO_ATTR);
        var reduced = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var quieto = el.getAttribute(MODE_ATTR) === 'estatico' || reduced;
        var vivo = trama.tiempo.modo === 'vivo';
        var pintarFondo = fondoAttr === '0' ? false : fondoAttr === '1' ? true : !(lectura.compat && lectura.compat.sinFondo);

        // La interacción la decide el archivo; el atributo puede apagarla o forzarla.
        var inter = { cursor: trama.interaccion.cursor, paralaje: trama.interaccion.paralaje };
        if (interAttr === '0') inter = { cursor: false, paralaje: false };
        else if (interAttr === 'cursor') inter = { cursor: true, paralaje: false };
        else if (interAttr === 'paralaje') inter = { cursor: false, paralaje: true };
        else if (interAttr === 'ambos') inter = { cursor: true, paralaje: true };
        // En una secuencia manda lo grabado: el cursor real no la toca.
        var reacciona = vivo && !quieto && (inter.cursor || inter.paralaje);

        var modo = trama.dibujo.modo;
        var conPuntos = T.conPuntos(modo), conLineas = T.conLineas(modo);
        var tinta = T.modoDeTinta(trama.dibujo.tinta, trama.color.fondo.hex) === 'tinta';
        var totalSecuencia = T.cuadrosDeSecuencia(trama, CALC_FPS);
        var detener = !vivo && trama.tiempo.alTerminar === 'detener';

        var canvas = doc.createElement('canvas');
        canvas.className = CANVAS_CLASS;
        canvas.setAttribute('aria-hidden', 'true');
        // Tinta sin fondo propio: se multiplica contra el fondo de la sección.
        if (tinta && !pintarFondo) canvas.style.mixBlendMode = 'multiply';
        el.insertBefore(canvas, el.firstChild);

        var gpu = setupGL(canvas, conLineas), ctx2d = gpu ? null : canvas.getContext('2d');
        var W = 1, H = 1, Wc = 1, Hc = 1, ox = 0, oy = 0, dpr = 1;
        var gen = 0, requested = -1, buffer = new Map(), clock = 0, mixPts = null, mixTiras = null;
        var visible = true, raf = 0, destroyed = false, terminado = false, last = 0;
        var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, p: 0, tp: 0 };
        var stats = { cuadros: 0, ms: 0, desde: 0, recibidos: 0 };

        function diag() {
            if (!cfgGlobal.diagnostico || !win.console) return;
            win.console.info.apply(win.console, ['[cod-trama]'].concat(Array.prototype.slice.call(arguments)));
        }

        // Con líneas, el worker del plugin que agrega las tiras; si no, el
        // worker de core tal cual. Los dos son archivos y usan el motor único.
        var worker = quieto ? null : makeWorker(win, conLineas ? cfgGlobal.workerTiras : cfgGlobal.worker, cfgGlobal);
        if (worker) {
            worker.onmessage = function (e) {
                var m = e.data;
                if (!m || m.gen !== gen) return;
                if (m.tipo === 'cuadro') { stats.recibidos++; buffer.set(m.k, empaquetar(m.k, m.t, m.datos, m.colores, m.tiras || null)); }
                else if (m.tipo === 'error') diag('el worker rechazó la trama', m.errores);
            };
            worker.onerror = function () {
                // El worker no cargó (archivo bloqueado, CSP): se sigue en el hilo principal.
                diag('el worker no cargó; el buffer se llena en el hilo principal');
                try { worker.terminate(); } catch (_e) { /* nada */ }
                worker = null;
                requested = -1;
            };
        }

        /** Un cuadro listo para dibujar, con la configuración de su instante. */
        function empaquetar(k, t, datos, colores, tiras) {
            return { k: k, t: t, datos: datos, colores: colores, cfg: T.estadoEn(trama, t).motor.configuracion, tiras: tiras };
        }
        /** Lo mismo que hace el worker, en el hilo principal (cuadro quieto o sin worker). */
        function calcularLocal(k, t) {
            var r = T.cuadroEn(trama, t, Wc, Hc, 1), cfg = r.estado.motor.configuracion, tiras = null;
            if (conLineas && gpu) {
                var tramos = T.tramosDeLinea(r.cuadro, T.dimensionesDeLamina(cfg, 1).puntos, { grosorLinea: cfg.grosorLinea, opacidadLinea: cfg.opacidadLinea });
                tiras = T.tirasDeTramos(r.cuadro, tramos, T.tonosPorProfundidad(r.estado.colores.lejos, r.estado.colores.cerca)).vertices;
            }
            return { k: k, t: t, datos: r.cuadro, colores: r.estado.colores, cfg: cfg, tiras: tiras };
        }

        function reset() {
            gen++; buffer.clear(); requested = -1; clock = 0; terminado = false; last = 0;
            if (worker) worker.postMessage({ tipo: 'configurar', gen: gen, trama: trama, ancho: Wc, alto: Hc, fps: CALC_FPS, calidad: 1, escala: 1 });
        }
        function ensureAhead(k) {
            var upTo = k + Math.ceil(AHEAD_SECONDS * CALC_FPS);
            if (upTo <= requested) return;
            requested = upTo;
            if (worker) worker.postMessage({ tipo: 'pedir', gen: gen, hasta: upTo });
        }
        function fillLocally(k) {      // sin worker: en pausas cortas del hilo principal
            var t0 = win.performance.now();
            for (var i = k; i <= k + Math.ceil(AHEAD_SECONDS * CALC_FPS) && win.performance.now() - t0 < 8; i++) {
                if (!buffer.has(i)) buffer.set(i, calcularLocal(i, T.instanteDeCuadro(trama, i, CALC_FPS)));
            }
        }

        function draw(a, b, u) {
            var t0 = win.performance.now();
            // Sólo se mezclan cuadros del mismo largo: si la línea de tiempo
            // cambia la cantidad de líneas o puntos, se salta al más cercano.
            if (a.datos.length !== b.datos.length) { a = u >= 0.5 ? b : a; b = a; u = 0; }
            var pts = u === 0 ? a.datos : (mixPts = T.mezclarCuadros(a.datos, b.datos, u, mixPts));
            var lejos = u === 0 ? a.colores.lejos : T.mezclarHex(a.colores.lejos, b.colores.lejos, u);
            var cerca = u === 0 ? a.colores.cerca : T.mezclarHex(a.colores.cerca, b.colores.cerca, u);
            var cfg = u < 0.5 ? a.cfg : b.cfg;
            var tiras = null;
            if (conLineas && gpu) {
                // Las tiras se interpolan vértice a vértice cuando las dos
                // tienen la misma forma (lo normal); si un tramo aparece o
                // desaparece entre los dos cuadros, se usa la más cercana.
                if (u > 0 && a.tiras && b.tiras && a.tiras.length === b.tiras.length) tiras = mixTiras = T.mezclarCuadros(a.tiras, b.tiras, u, mixTiras);
                else tiras = (u < 0.5 ? a.tiras : b.tiras) || a.tiras;
            }
            var force = reacciona && inter.cursor ? cfg.deformacionCursor * mouse.p : 0;
            var par = [0, 0];
            if (reacciona && inter.paralaje) {
                var asp = W / H, f = 1 / Math.tan((asp < 1 ? 60 : 42) * Math.PI / 360), kk = 4 / Math.max(0.5, cfg.distancia), rad = Math.PI / 180;
                par = [(f / asp) * (mouse.x * 2 - 1) * cfg.paralaje * 10 * rad * kk, f * (mouse.y * 2 - 1) * cfg.paralaje * 6 * rad * kk];
            }
            if (gpu) drawGL(pts, tiras, lejos, cerca, cfg, force, par);
            else if (ctx2d) draw2D(pts, lejos, cerca, cfg);
            stats.cuadros++; stats.ms += win.performance.now() - t0;
        }

        function uniforms(prog, lejos, cerca, cfg, force, par) {
            var gl = gpu.gl, loc = prog.loc;
            gl.uniform2f(loc.uView, W, H); gl.uniform2f(loc.uOff, ox, oy);
            gl.uniform2f(loc.uMouse, mouse.x * 2 - 1, mouse.y * 2 - 1);
            gl.uniform1f(loc.uForce, force);
            gl.uniform1f(loc.uRad2, Math.max(1e-4, cfg.radioCursor * cfg.radioCursor));
            gl.uniform2f(loc.uPar, par[0], par[1]);
            gl.uniform1f(loc.uDpr, dpr);
            gl.uniform1f(loc.uOpac, cfg.opacidadPunto);
            gl.uniform3fv(loc.uDeep, hexAUnidad(lejos)); gl.uniform3fv(loc.uAcc, hexAUnidad(cerca));
            gl.uniform1f(loc.uTinta, tinta ? 1 : 0);
        }
        function drawGL(pts, tiras, lejos, cerca, cfg, force, par) {
            var gl = gpu.gl;
            gl.viewport(0, 0, canvas.width, canvas.height);
            if (pintarFondo) { var c = hexAUnidad(trama.color.fondo.hex); gl.clearColor(c[0], c[1], c[2], 1); }
            else if (tinta) gl.clearColor(1, 1, 1, 1);        // blanco: neutro al multiplicar con la sección
            else gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);
            // luz: los puntos suman luz. tinta: oscurecen, como en papel.
            if (tinta) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            if (tiras && tiras.length) {          // líneas: debajo
                usar(gl, gpu.tiras);
                uniforms(gpu.tiras, lejos, cerca, cfg, force, par);
                gl.bufferData(gl.ARRAY_BUFFER, tiras, gl.STREAM_DRAW);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, tiras.length / 6);
            }
            if (conPuntos && cfg.opacidadPunto > 0.005) {   // puntos: encima
                usar(gl, gpu.puntos);
                uniforms(gpu.puntos, lejos, cerca, cfg, force, par);
                gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STREAM_DRAW);
                gl.drawArrays(gl.POINTS, 0, pts.length / 5);
            }
        }

        /* respaldo sin WebGL: canvas 2D, con los tonos, niveles y tramos del motor */
        function draw2D(pts, lejos, cerca, cfg) {
            var ctx = ctx2d;
            ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
            ctx.globalCompositeOperation = 'source-over';
            if (pintarFondo || tinta) {
                ctx.fillStyle = pintarFondo ? trama.color.fondo.hex : '#ffffff';
                ctx.fillRect(ox, oy, W, H);
            } else ctx.clearRect(ox, oy, W, H);
            ctx.globalCompositeOperation = tinta ? 'multiply' : 'lighter';
            var tonos = T.tonosPorProfundidad(lejos, cerca);
            if (conLineas) {
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                var tramos = T.tramosDeLinea(pts, T.dimensionesDeLamina(cfg, 1).puntos, { grosorLinea: cfg.grosorLinea, opacidadLinea: cfg.opacidadLinea });
                for (var i = 0; i < tramos.length; i++) {
                    var tr = tramos[i], trazos = T.trazosDeTramo(pts, tr);
                    ctx.strokeStyle = 'rgba(' + tonos[tr.tono].join(',') + ',' + Math.min(1, tr.alfa) + ')';
                    ctx.lineWidth = tr.grosor;
                    ctx.beginPath();
                    for (var s = 0; s < trazos.length; s++) {
                        var q = trazos[s];
                        ctx.moveTo(pts[q[0]], pts[q[0] + 1]);
                        for (var j = 1; j < q.length; j++) ctx.lineTo(pts[q[j]], pts[q[j] + 1]);
                    }
                    ctx.stroke();
                }
            }
            if (conPuntos) {
                var grupos = [];
                T.recorrerPuntos(pts, cfg.opacidadPunto, function (k, tono, nivel) {
                    var gi = tono * 4 + nivel, p = grupos[gi] || (grupos[gi] = new win.Path2D()), r = pts[k + 2];
                    if (r < 0.9) p.rect(pts[k] - r, pts[k + 1] - r, r * 2, r * 2);
                    else { p.moveTo(pts[k] + r, pts[k + 1]); p.arc(pts[k], pts[k + 1], r, 0, 6.2832); }
                });
                for (var g = 0; g < 48; g++) {
                    if (!grupos[g]) continue;
                    ctx.fillStyle = 'rgba(' + tonos[Math.floor(g / 4)].join(',') + ',' + T.alfaDeNivel(g % 4) + ')';
                    ctx.fill(grupos[g]);
                }
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        /** Tamaño del cuadro: la sección, o lo que la cubre con la proporción del lienzo. */
        function medidas(w, h) {
            var l = trama.lienzo, p = null;
            if (l.tipo === 'proporcion') p = l.proporcion;
            else if (l.tipo === 'medida') p = l.ancho / l.alto;
            if (!p) return [w, h];
            return w / h > p ? [w, w / p] : [h * p, h];
        }
        function size() {
            var w = el.clientWidth, h = el.clientHeight;
            if (!w || !h || destroyed) return false;
            var d = Math.min(win.devicePixelRatio || 1, 2);
            // El ResizeObserver avisa también al empezar: si nada cambió, no
            // se reconfigura el worker.
            if (w === W && h === H && d === dpr && gen > 0) return true;
            dpr = d; W = w; H = h;
            var m = medidas(w, h);
            Wc = Math.round(m[0]); Hc = Math.round(m[1]); ox = (Wc - W) / 2; oy = (Hc - H) / 2;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            reset();
            if (quieto) {
                var f = calcularLocal(0, trama.cuadroQuieto || 0);
                draw(f, f, 0);
            } else if (!raf) {
                raf = win.requestAnimationFrame(tick);   // también reanuda una secuencia que se había detenido
            }
            diag('lista', { origen: lectura.origen, modo: modo, tiempo: trama.tiempo.modo, tinta: tinta ? 'tinta' : 'luz', fondo: pintarFondo, lienzo: trama.lienzo.tipo, cuadro: [Wc, Hc], gpu: !!gpu, worker: !!worker, quieto: quieto, interaccion: reacciona ? inter : null, avisos: lectura.avisos });
            return true;
        }

        function tick(now) {
            raf = 0;
            if (destroyed || terminado) return;
            raf = win.requestAnimationFrame(tick);
            if (doc.hidden || !visible) { last = 0; return; }       // nadie la ve: no trabaja
            var dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
            clock += dt;
            mouse.x += (mouse.tx - mouse.x) * 0.12; mouse.y += (mouse.ty - mouse.y) * 0.12; mouse.p += (mouse.tp - mouse.p) * 0.08;
            var f = clock * CALC_FPS, k = Math.floor(f), u = f - k;
            var alFinal = detener && k >= totalSecuencia;
            if (alFinal) { k = totalSecuencia; u = 0; }
            ensureAhead(k);
            if (!worker) fillLocally(k);
            var far = k + Math.ceil(AHEAD_SECONDS * CALC_FPS) + 2;
            buffer.forEach(function (_v, key) { if (key < k || key > far) buffer.delete(key); });
            var a = buffer.get(k), b = buffer.get(k + 1) || a;
            if (a) {
                draw(a, b, u);
                // Una secuencia que se detiene queda en su último instante y
                // el reproductor deja de trabajar.
                if (alFinal) { terminado = true; win.cancelAnimationFrame(raf); raf = 0; }
            }
            if (cfgGlobal.diagnostico) {
                if (!stats.desde) stats.desde = now;
                if (now - stats.desde > 5000) {
                    diag('últimos 5 s:', stats.cuadros, 'cuadros dibujados,', (stats.ms / Math.max(1, stats.cuadros)).toFixed(2), 'ms por cuadro en el hilo principal,', stats.recibidos, 'calculados en el worker, buffer de', buffer.size);
                    stats = { cuadros: 0, ms: 0, desde: now, recibidos: 0 };
                }
            }
        }
        function onMove(e) {
            var r = el.getBoundingClientRect();
            var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
            if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { mouse.tx = x; mouse.ty = y; mouse.tp = 1; } else { mouse.tp = 0; mouse.tx = 0.5; mouse.ty = 0.5; }
        }

        var ro = win.ResizeObserver ? new win.ResizeObserver(function () { size(); }) : null;
        if (ro) ro.observe(el); else win.addEventListener('resize', size);
        var io = win.IntersectionObserver ? new win.IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; }) : null;
        if (io) io.observe(el);
        if (reacciona) win.addEventListener('pointermove', onMove);
        el.setAttribute(RUNTIME_ATTR, '1');
        size();

        this.el = el;
        this.destroy = function () {
            destroyed = true;
            if (raf) win.cancelAnimationFrame(raf);
            if (worker) worker.terminate();
            if (ro) ro.disconnect(); else win.removeEventListener('resize', size);
            if (io) io.disconnect();
            win.removeEventListener('pointermove', onMove);
            if (gpu) { var ext = gpu.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            el.removeAttribute(RUNTIME_ATTR);
        };
    }

    /* ---------- runtime por documento ---------- */

    function soloNuestroCanvas(nodes) {
        for (var i = 0; i < nodes.length; i++) if (!(nodes[i].nodeType === 1 && nodes[i].classList && nodes[i].classList.contains(CANVAS_CLASS))) return false;
        return true;
    }

    var runtimes = [];
    function createRuntime(options) {
        options = options || {};
        var win = options.window || (typeof window !== 'undefined' ? window : null);
        var doc = options.document || (win && win.document);
        if (!win || !doc || !T) return null;
        for (var r = 0; r < runtimes.length; r++) if (runtimes[r].doc === doc) { runtimes[r].refresh(); return runtimes[r]; }
        installStyles(doc);
        var cfg = config();
        var instances = [];
        var invalid = new WeakMap();      // trama inválida: avisar una sola vez por firma
        var pendientes = new WeakMap();   // fuentes de Medios que se están leyendo (sólo editor)
        var leidas = {};

        function firma(el) {
            return OBSERVED.map(function (a) { return el.getAttribute(a) || ''; }).join('|') + '|' + recetaEnLinea(el).length;
        }
        function fuenteDe(el) {
            var receta = recetaEnLinea(el);
            if (receta) return receta;
            var v = (el.getAttribute(ATTR) || '').trim();
            if (v && v !== '1') return v;
            var url = (el.getAttribute(FUENTE_ATTR) || '').trim();
            if (url && options.buscarFuente) return Object.prototype.hasOwnProperty.call(leidas, url) ? leidas[url] : { url: url };
            return null;
        }
        function leerDelSitio(el, url) {
            // Sólo en el editor, y sólo del propio sitio: en la página
            // publicada la receta ya viene en línea y no hay petición extra.
            var abs;
            try { abs = new win.URL(url, doc.baseURI || win.location.href); } catch (_e) { return; }
            var origen = (typeof window !== 'undefined' ? window : win).location.origin;
            if (abs.origin !== origen || !win.fetch) return;
            pendientes.set(el, url);
            var listo = function (texto) {
                if (pendientes.get(el) === url) pendientes.delete(el);
                leidas[url] = texto || '';
                refresh();
            };
            win.fetch(abs.href, { credentials: 'same-origin' })
                .then(function (res) { return res.ok ? res.text() : ''; })
                .then(listo, function () { listo(''); });
        }
        function refresh() {
            // quitar las que ya no están en el documento o cambiaron
            instances = instances.filter(function (it) {
                var keep = doc.contains(it.el) && firma(it.el) === it.firma;
                if (!keep) it.inst.destroy();
                return keep;
            });
            var nodes = doc.querySelectorAll('[' + ATTR + '], [' + FUENTE_ATTR + ']');
            for (var i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                if (instances.some(function (it) { return it.el === el; })) continue;
                if (invalid.get(el) === firma(el) || pendientes.has(el)) continue;
                var f = fuenteDe(el);
                if (f === null) continue;
                if (typeof f === 'object') { leerDelSitio(el, f.url); continue; }
                var lectura = leer(f);
                if (!lectura.ok) {
                    // Una trama rota deja la sección intacta: el contenido manda.
                    if (cfg.diagnostico && win.console) win.console.warn('[cod-trama] trama inválida en', el, lectura.errores);
                    invalid.set(el, firma(el));
                    continue;
                }
                instances.push({ el: el, inst: new Instance(el, win, doc, lectura, cfg), firma: firma(el) });
            }
        }
        var mo = win.MutationObserver ? new win.MutationObserver(function (records) {
            // Los cambios que hace el propio reproductor (su canvas) no cuentan.
            for (var i = 0; i < records.length; i++) {
                var rec = records[i];
                if (rec.type === 'attributes' || !soloNuestroCanvas(rec.addedNodes) || !soloNuestroCanvas(rec.removedNodes)) { refresh(); return; }
            }
        }) : null;
        if (mo && doc.body) mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED });
        refresh();
        var api = {
            doc: doc,
            refresh: refresh,
            destroy: function () {
                if (mo) mo.disconnect();
                instances.forEach(function (it) { it.inst.destroy(); });
                instances = [];
                runtimes = runtimes.filter(function (x) { return x !== api; });
            }
        };
        runtimes.push(api);
        return api;
    }

    // Página publicada: arranca solo.
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(typeof module === 'object' && module.exports)) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { createRuntime({ window: window, document: document }); });
        else createRuntime({ window: window, document: document });
    }

    return { createRuntime: createRuntime, leer: leer, motor: T };
});
