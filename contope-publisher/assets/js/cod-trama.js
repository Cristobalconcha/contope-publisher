/**
 * ContOpe Publisher — módulo de trama: superficie de puntos.
 *
 * Fondo generativo y determinista: una lámina 3D de líneas punteadas que se
 * pliega en el espacio. Su forma la define por completo un CÓDIGO DE CAPTURA
 * (`SP1.…`) que se obtiene en el editor de la superficie («Copiar código»).
 * El mismo código produce siempre los mismos puntos, en cualquier equipo.
 *
 * Marcado (lo único que este runtime busca):
 *
 *   <div data-cod-trama="SP1.…"                 código de la captura (obligatorio)
 *        data-cod-trama-modo="vivo"             vivo (por defecto) | estatico
 *        data-cod-trama-interaccion="1">        1 (por defecto) | 0: sin reacción al cursor
 *     …contenido normal de la sección…
 *   </div>
 *
 * El runtime agrega un <canvas aria-hidden> DETRÁS del contenido del
 * elemento. Si no corre (sin JavaScript, sin este archivo), el elemento y su
 * contenido quedan intactos: la trama es presentación, nunca contenido.
 *
 * Para no producir lag (medido: dibujar 30.000 puntos en canvas 2D costaba
 * ~22 ms por cuadro y calcularlos ~6 ms), el trabajo se reparte como en audio:
 *   1. buffer de entrada: un Web Worker calcula la geometría por adelantado,
 *      a 12 cuadros por segundo y hasta 1 s adelante, con ESTE MISMO motor;
 *   2. interpolación: la pantalla mezcla los dos cuadros vecinos del buffer;
 *   3. dibujo en la GPU (WebGL), con canvas 2D como respaldo;
 *   4. monitoreo directo: la deformación del cursor no pasa por el buffer.
 * Además no trabaja si nadie lo ve (fuera de pantalla o pestaña oculta) y
 * respeta `prefers-reduced-motion` mostrando un cuadro fijo.
 *
 * Dos contextos, igual que cod-luma-matte-video.js:
 *   1) Runtime público: se encola en la página publicada y arranca solo.
 *   2) Vista previa del editor: `OcdTrama.createRuntime({ window, document })`
 *      con el window/document del iframe del lienzo GrapesJS.
 *
 * Sin dependencias, sin red, sin fuentes externas.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else if (typeof define === 'function' && define.amd) define([], factory);
    else root.OcdTrama = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ATTR = 'data-cod-trama';
    var MODE_ATTR = 'data-cod-trama-modo';
    var INTERACTION_ATTR = 'data-cod-trama-interaccion';
    var RUNTIME_ATTR = 'data-cod-trama-runtime';
    var CANVAS_CLASS = 'cod-trama__canvas';
    var STYLE_ID = 'cod-trama-styles';
    var CALC_FPS = 12;
    var AHEAD_SECONDS = 1;

    /**
     * EL MOTOR. Es el mismo del editor de la superficie de puntos. Esta
     * función se ejecuta en la página y su TEXTO se reutiliza para crear el
     * worker: hay un solo motor, no dos que puedan divergir.
     */
    function TRAMA_ENGINE() {
        const PERM = (() => {
          const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
          let seed = 0x2f6b9a1d;
          for (let i = 255; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
          const out = new Uint8Array(512); for (let i = 0; i < 512; i++) out[i] = p[i & 255]; return out;
        })();
        function gd(h, x, y, z) {
          switch (h & 15) {
            case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
            case 4: return x + z; case 5: return -x + z; case 6: return x - z; case 7: return -x - z;
            case 8: return y + z; case 9: return -y + z; case 10: return y - z; case 11: return -y - z;
            case 12: return x + y; case 13: return -y + z; case 14: return -x + y; default: return -y - z;
          }
        }
        function noise(x, y, z) {
          const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
          const X = fx & 255, Y = fy & 255, Z = fz & 255;
          x -= fx; y -= fy; z -= fz;
          const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10), w = z * z * z * (z * (z * 6 - 15) + 10);
          const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
          const a = gd(PERM[AA], x, y, z), b = gd(PERM[BA], x - 1, y, z), c = gd(PERM[AB], x, y - 1, z), d = gd(PERM[BB], x - 1, y - 1, z);
          const e = gd(PERM[AA + 1], x, y, z - 1), f = gd(PERM[BA + 1], x - 1, y, z - 1), g = gd(PERM[AB + 1], x, y - 1, z - 1), h = gd(PERM[BB + 1], x - 1, y - 1, z - 1);
          const ab = a + u * (b - a), cd = c + u * (d - c), ef = e + u * (f - e), gh = g + u * (h - g);
          const l1 = ab + v * (cd - ab), l2 = ef + v * (gh - ef);
          return (l1 + w * (l2 - l1)) * 0.7;
        }

        /* ---------- cámara ---------- */
        function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]; return o; }
        const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; };
        const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; };
        const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; };
        const translate = (x, y, z) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
        const hexToRgb = h => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
        const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

        /* ---------- motor: estado → puntos proyectados ----------
           Devuelve, por línea, una lista de [x, y, radio, cercanía, alfa]. */
        function computeSheet(state, W, H, quality = 1) {
          const cfg = state.cfg, t = state.time * cfg.speed;
          const N = Math.max(2, Math.round(cfg.lineCount * Math.min(1, quality * 1.2)));
          const M = Math.max(8, Math.round(cfg.points * quality));
          const aspect = W / H, d2r = Math.PI / 180;
          const f = 1 / Math.tan((aspect < 1 ? 60 : 42) * d2r / 2);
          let view = translate(0, 0, -cfg.distance * (aspect < 1 ? 1.25 : 1));
          view = mul(view, rotZ(cfg.roll * d2r));
          view = mul(view, rotX((cfg.tilt + state.cam[1] * 6 * cfg.parallax) * d2r));
          view = mul(view, rotY(state.cam[0] * 10 * cfg.parallax * d2r));
          const scalePx = H / 1080;
          const lines = [];
          const mx = state.mouse[0], my = state.mouse[1], mForce = cfg.mouseForm * state.presence, mr2 = cfg.mouseRadius * cfg.mouseRadius;

          // eje central y orientación de la sección: dependen solo de x, se calculan una vez por punto a lo largo
          const axis = new Float32Array(M * 3);   // cy, cz, theta
          for (let j = 0; j < M; j++) {
            const u = j / (M - 1), x = (u - 0.5) * cfg.sheetLength;
            axis[j*3]   = cfg.meander * (Math.sin(x * 0.35 + t * 0.5) * 0.45 + noise(x * 0.16 + 3.1, t * 0.18, 1.7) * 1.3);
            axis[j*3+1] = cfg.meander * noise(x * 0.14 + 7.3, t * 0.15, 4.2) * 1.4;
            axis[j*3+2] = cfg.twist * x * 0.28 + cfg.fold * noise(x * 0.22 * cfg.foldFreq + 11.0, t * 0.12, 8.6) * 3.2 + t * 0.15;
          }
          const half = cfg.sheetWidth / 2, curl = cfg.curl;
          for (let i = 0; i < N; i++) {
            const v = (i / (N - 1)) * 2 - 1;               // -1..1 a lo ancho
            const edge = 1 - smooth(0.82, 1.0, Math.abs(v)) * 0.85;
            const pts = [];
            for (let j = 0; j < M; j++) {
              const u = j / (M - 1), x = (u - 0.5) * cfg.sheetLength;
              const th = axis[j*3+2];
              // sección en arco: con curvatura, la lámina se enrolla sobre sí misma
              let oy, oz;
              if (Math.abs(curl) < 1e-3) { oy = Math.sin(th) * v * half; oz = Math.cos(th) * v * half; }
              else {
                const R = half / curl, a = v * curl;
                oy = R * (Math.sin(th + a) - Math.sin(th));
                oz = R * (Math.cos(th) - Math.cos(th + a));
                // centrar el arco en el eje
                oy += 0; oz += 0;
              }
              let px = x, py = axis[j*3] + oy, pz = axis[j*3+1] + oz;
              // ondulación fina, normal aproximada a la sección
              const wv = cfg.wave * noise(x * cfg.waveFreq * 0.6, v * cfg.waveFreq * 1.4 + 20, t * 0.4);
              py += wv * Math.cos(th + v * curl); pz -= wv * Math.sin(th + v * curl);
              // a la cámara
              let cx = view[0]*px + view[4]*py + view[8]*pz + view[12];
              let cy = view[1]*px + view[5]*py + view[9]*pz + view[13];
              let cz = view[2]*px + view[6]*py + view[10]*pz + view[14];
              if (cz > -0.15) { pts.push(0, 0, 0, 0, 0); continue; }   // detrás de la cámara: invisible, pero conserva su lugar
              let nx = (f / aspect) * cx / -cz, ny = f * cy / -cz - cfg.offsetY * 2;
              nx -= cfg.offsetX * 2;
              // deformación del cursor: empuja hacia la cámara y hacia afuera
              if (mForce) {
                const dx = (nx - (mx * 2 - 1)) * aspect, dy = ny - (my * 2 - 1);
                const k = mForce * Math.exp(-(dx * dx + dy * dy) / mr2);
                if (k > 1e-3) {
                  const dd = Math.hypot(dx, dy) || 1;
                  cz += k * 0.7; nx += dx / dd / aspect * k * 0.02; ny += dy / dd * k * 0.02;
                }
              }
              const depth = -cz;
              const sx = (nx + 1) / 2 * W, sy = (1 - ny) / 2 * H;
              const near = smooth(cfg.distance + 2.5, cfg.distance - 1.5, depth);
              const persp = Math.pow(cfg.distance / depth, cfg.perspectiveSize);
              const r = Math.max(0.25, cfg.size * 0.5 * persp * scalePx);
              const ends = smooth(0, 0.08, u) * smooth(1, 0.92, u);
              const a = cfg.intensity * ends * edge * (1 - cfg.depthFade * 0.8 * (1 - near));
              pts.push(sx, sy, r, near, a);
            }
            lines.push(pts);
          }
          return lines;
        }

        function packFrame(lines) {
            var n = 0, i, o = 0;
            for (i = 0; i < lines.length; i++) n += lines[i].length;
            var out = new Float32Array(n);
            for (i = 0; i < lines.length; i++) { out.set(lines[i], o); o += lines[i].length; }
            return out;
        }

        var DEFAULTS = {
            lineCount: 64, points: 480, sheetWidth: 4, sheetLength: 13, meander: 1, twist: 0.5, fold: 1.8, foldFreq: 2,
            curl: 1.8, wave: 0.22, waveFreq: 1.3, speed: 0.25, size: 1.6, perspectiveSize: 1, tilt: 18, roll: -6,
            distance: 5, offsetX: 0, offsetY: 0, intensity: 1.1, depthFade: 1, parallax: 1, mouseForm: 0.5,
            mouseRadius: 0.22, colorDeep: '#2a52d6', colorAccent: '#3dd6c0'
        };

        return { computeSheet: computeSheet, packFrame: packFrame, DEFAULTS: DEFAULTS };
    }

    var engine = TRAMA_ENGINE();

    /** Código `SP1.` → estado. Devuelve null si no es válido (nunca lanza). */
    function decode(code) {
        try {
            var raw = String(code || '').trim();
            if (raw.indexOf('SP1.') !== 0) return null;
            var st = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
            if (!st || typeof st.time !== 'number' || !st.cfg || typeof st.cfg !== 'object') return null;
            var cfg = {}, k;
            for (k in engine.DEFAULTS) cfg[k] = engine.DEFAULTS[k];
            for (k in st.cfg) if (Object.prototype.hasOwnProperty.call(engine.DEFAULTS, k)) cfg[k] = st.cfg[k];
            return { time: st.time, cfg: cfg, dotted: st.dotted !== false };
        } catch (_error) {
            return null;
        }
    }

    function hexToUnit(h) {
        return [0, 2, 4].map(function (i) { return parseInt(String(h).slice(1 + i, 3 + i), 16) / 255; });
    }

    function installStyles(doc) {
        if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
        var style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            // el canvas queda detrás del contenido, dentro del propio elemento
            '[' + ATTR + '] { position: relative; isolation: isolate; }',
            '[' + ATTR + '] > canvas.' + CANVAS_CLASS + ' { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; display: block; }'
        ].join('\n');
        doc.head.appendChild(style);
    }

    /* ---------- worker: buffer de entrada ---------- */
    var workerUrl = null;
    function workerSource() {
        return 'var E = (' + TRAMA_ENGINE.toString() + ')();\n' +
            'var job = null, gen = 0, next = 0, upTo = -1, busy = false;\n' +
            'onmessage = function (e) {\n' +
            '  var m = e.data;\n' +
            '  if (m.type === "config") { job = m; gen = m.gen; next = 0; upTo = -1; }\n' +
            '  if (m.type === "need" && job && m.gen === gen) upTo = Math.max(upTo, m.upTo);\n' +
            '  if (!busy) pump();\n' +
            '};\n' +
            // Un cuadro por turno: entre cuadro y cuadro el worker atiende
            // mensajes, así una configuración nueva (cambio de tamaño, otro
            // código) nunca espera a que termine trabajo obsoleto.
            'function pump() {\n' +
            '  if (!job || next > upTo) { busy = false; return; }\n' +
            '  busy = true;\n' +
            '  var k = next++, g = gen;\n' +
            '  var st = { time: job.start + k / job.fps, cam: [0, 0], mouse: [0.5, 0.5], presence: 0, cfg: job.cfg };\n' +
            '  var data = E.packFrame(E.computeSheet(st, job.W, job.H, 1));\n' +
            '  postMessage({ type: "frame", k: k, gen: g, data: data }, [data.buffer]);\n' +
            '  setTimeout(pump, 0);\n' +
            '}\n';
    }
    function makeWorker(win) {
        try {
            if (!win.Worker || !win.Blob || !win.URL) return null;
            if (!workerUrl) workerUrl = win.URL.createObjectURL(new win.Blob([workerSource()], { type: 'text/javascript' }));
            return new win.Worker(workerUrl);
        } catch (_error) {
            return null;   // CSP estricta u otro bloqueo: el buffer se llena en el hilo principal
        }
    }

    /* ---------- dibujo en la GPU ---------- */
    var VS = [
        'attribute vec2 aPos; attribute float aR; attribute float aNear; attribute float aA;',
        'uniform vec2 uView; uniform float uDpr; uniform vec2 uMouse; uniform float uForce; uniform float uRad2;',
        'varying float vNear; varying float vA;',
        'void main() {',
        '  vec2 ndc = vec2(aPos.x / uView.x * 2.0 - 1.0, 1.0 - aPos.y / uView.y * 2.0);',
        '  float asp = uView.x / uView.y;',
        '  vec2 d = vec2((ndc.x - uMouse.x) * asp, ndc.y - uMouse.y);',
        '  float k = uForce * exp(-dot(d, d) / uRad2);',
        '  float dl = max(length(d), 1e-4);',
        '  ndc += vec2(d.x / dl / asp, d.y / dl) * k * 0.02;',
        '  gl_Position = vec4(ndc, 0.0, 1.0);',
        '  gl_PointSize = max(1.0, aR * (1.0 + k * 0.8) * 2.0 * uDpr);',
        '  vNear = clamp(aNear + k * 0.35, 0.0, 1.0);',
        '  vA = aA * (1.0 + k * 0.6);',
        '}'
    ].join('\n');
    var FS = [
        'precision mediump float;',
        'uniform vec3 uDeep; uniform vec3 uAcc;',
        'varying float vNear; varying float vA;',
        'void main() {',
        '  vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c);',
        '  if (d > 1.0 || vA < 0.02) discard;',
        // mismos 12 tonos y 4 niveles de alfa que la exportación del editor
        '  float b = floor(vNear * 11.0 + 0.5) / 11.0;',
        '  float a = (min(3.0, floor(vA * 4.0)) + 0.5) / 4.0;',
        '  gl_FragColor = vec4(mix(uDeep, uAcc, b), a * smoothstep(1.0, 0.75, d));',
        '}'
    ].join('\n');

    function setupGL(canvas) {
        var gl = null;
        try { gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: true }); } catch (_e) { gl = null; }
        if (!gl) return null;
        function sh(type, src) {
            var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        }
        var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) return null;
        var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        gl.useProgram(prog);
        var loc = {};
        ['aPos', 'aR', 'aNear', 'aA'].forEach(function (n) { loc[n] = gl.getAttribLocation(prog, n); });
        ['uView', 'uDpr', 'uMouse', 'uForce', 'uRad2', 'uDeep', 'uAcc'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
        var vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        var S = 20;
        gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, S, 0);
        gl.enableVertexAttribArray(loc.aR); gl.vertexAttribPointer(loc.aR, 1, gl.FLOAT, false, S, 8);
        gl.enableVertexAttribArray(loc.aNear); gl.vertexAttribPointer(loc.aNear, 1, gl.FLOAT, false, S, 12);
        gl.enableVertexAttribArray(loc.aA); gl.vertexAttribPointer(loc.aA, 1, gl.FLOAT, false, S, 16);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        return { gl: gl, loc: loc };
    }

    /* ---------- respaldo sin WebGL: canvas 2D, mismos baldes de color ---------- */
    function draw2D(ctx, data, cfg, W, H) {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        var D = hexToUnit(cfg.colorDeep), A = hexToUnit(cfg.colorAccent), paths = [], i;
        for (i = 0; i < 48; i++) paths.push(new Path2D());
        for (var k = 0; k < data.length; k += 5) {
            var a = data[k + 4]; if (a < 0.02) continue;
            var b = Math.min(11, Math.round(data[k + 3] * 11)), ai = Math.min(3, Math.floor(a * 4)), r = data[k + 2], p = paths[b * 4 + ai];
            if (r < 0.9) p.rect(data[k] - r, data[k + 1] - r, r * 2, r * 2);
            else { p.moveTo(data[k] + r, data[k + 1]); p.arc(data[k], data[k + 1], r, 0, 6.2832); }
        }
        for (var bb = 0; bb < 12; bb++) for (var aa = 0; aa < 4; aa++) {
            var c = D.map(function (d, j) { return Math.round((d + (A[j] - d) * bb / 11) * 255); });
            ctx.fillStyle = 'rgba(' + c + ',' + ((aa + 0.5) / 4) + ')';
            ctx.fill(paths[bb * 4 + aa]);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- una trama en un elemento ---------- */
    function Instance(el, win, doc) {
        var state = decode(el.getAttribute(ATTR));
        if (!state) {
            if (win.console) win.console.warn('[cod-trama] código de captura inválido en', el);
            this.dead = true;
            return;
        }
        var self = this;
        var staticMode = el.getAttribute(MODE_ATTR) === 'estatico';
        var interactive = el.getAttribute(INTERACTION_ATTR) !== '0';
        var reduced = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
        var cfg = state.cfg;

        var canvas = doc.createElement('canvas');
        canvas.className = CANVAS_CLASS;
        canvas.setAttribute('aria-hidden', 'true');
        el.insertBefore(canvas, el.firstChild);

        var gpu = setupGL(canvas), ctx2d = gpu ? null : canvas.getContext('2d');
        var W = 1, H = 1, dpr = 1, gen = 0, requested = -1, buffer = new Map(), clock = 0, mix = null;
        var visible = true, raf = 0, destroyed = false;
        var mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, p: 0, tp: 0 };
        var worker = (staticMode || reduced) ? null : makeWorker(win);
        if (worker) worker.onmessage = function (e) { var m = e.data; if (m.type === 'frame' && m.gen === gen) buffer.set(m.k, m.data); };

        function frameAt(k) {
            var st = { time: state.time + k / CALC_FPS, cam: [0, 0], mouse: [0.5, 0.5], presence: 0, cfg: cfg };
            return engine.packFrame(engine.computeSheet(st, W, H, 1));
        }
        function reset() {
            gen++; buffer.clear(); requested = -1; clock = 0;
            if (worker) worker.postMessage({ type: 'config', gen: gen, cfg: cfg, W: W, H: H, fps: CALC_FPS, start: state.time });
        }
        function ensureAhead(k) {
            var upTo = k + Math.ceil(AHEAD_SECONDS * CALC_FPS);
            if (upTo <= requested) return;
            requested = upTo;
            if (worker) worker.postMessage({ type: 'need', gen: gen, upTo: upTo });
        }
        function fillLocally(k) {      // sin worker: en pausas cortas del hilo principal
            var t0 = win.performance.now();
            for (var i = k; i <= k + Math.ceil(AHEAD_SECONDS * CALC_FPS) && win.performance.now() - t0 < 8; i++) {
                if (!buffer.has(i)) buffer.set(i, frameAt(i));
            }
        }
        function draw(a, b, u) {
            if (!mix || mix.length !== a.length) mix = new Float32Array(a.length);
            for (var i = 0; i < a.length; i++) mix[i] = a[i] + (b[i] - a[i]) * u;
            if (gpu) {
                var gl = gpu.gl, loc = gpu.loc;
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                gl.bufferData(gl.ARRAY_BUFFER, mix, gl.STREAM_DRAW);
                gl.uniform2f(loc.uView, W, H); gl.uniform1f(loc.uDpr, dpr);
                gl.uniform2f(loc.uMouse, mouse.x * 2 - 1, mouse.y * 2 - 1);
                gl.uniform1f(loc.uForce, interactive ? cfg.mouseForm * mouse.p : 0);
                gl.uniform1f(loc.uRad2, cfg.mouseRadius * cfg.mouseRadius);
                gl.uniform3fv(loc.uDeep, hexToUnit(cfg.colorDeep)); gl.uniform3fv(loc.uAcc, hexToUnit(cfg.colorAccent));
                gl.drawArrays(gl.POINTS, 0, mix.length / 5);
            } else if (ctx2d) {
                ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
                draw2D(ctx2d, mix, cfg, W, H);
            }
        }
        function size() {
            var w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return false;
            dpr = Math.min(win.devicePixelRatio || 1, 2);
            W = w; H = h;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            reset();
            if (staticMode || reduced) { var f = frameAt(0); draw(f, f, 0); }
            return true;
        }
        var last = 0;
        function tick(now) {
            if (destroyed) return;
            raf = win.requestAnimationFrame(tick);
            if (doc.hidden || !visible) { last = 0; return; }       // nadie la ve: no trabaja
            var dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
            clock += dt;
            mouse.x += (mouse.tx - mouse.x) * 0.12; mouse.y += (mouse.ty - mouse.y) * 0.12; mouse.p += (mouse.tp - mouse.p) * 0.08;
            var f = clock * CALC_FPS, k = Math.floor(f), u = f - k;
            ensureAhead(k);
            if (!worker) fillLocally(k);
            var far = k + Math.ceil(AHEAD_SECONDS * CALC_FPS) + 2;
            buffer.forEach(function (_v, key) { if (key < k || key > far) buffer.delete(key); });
            var a = buffer.get(k), b = buffer.get(k + 1) || a;
            if (a) draw(a, b, u);
        }
        function onMove(e) {
            var r = el.getBoundingClientRect();
            var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
            if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { mouse.tx = x; mouse.ty = y; mouse.tp = 1; } else mouse.tp = 0;
        }

        var ro = win.ResizeObserver ? new win.ResizeObserver(function () { size(); }) : null;
        if (ro) ro.observe(el); else win.addEventListener('resize', size);
        var io = win.IntersectionObserver ? new win.IntersectionObserver(function (es) { visible = es[0].isIntersecting; }) : null;
        if (io) io.observe(el);
        if (interactive && !staticMode && !reduced) win.addEventListener('pointermove', onMove);
        size();
        if (!staticMode && !reduced) raf = win.requestAnimationFrame(tick);

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
        el.setAttribute(RUNTIME_ATTR, '1');
        void self;
    }

    /* ---------- runtime por documento ---------- */
    var runtimes = [];
    function createRuntime(options) {
        var win = (options && options.window) || (typeof window !== 'undefined' ? window : null);
        var doc = (options && options.document) || (win && win.document);
        if (!win || !doc) return null;
        for (var r = 0; r < runtimes.length; r++) if (runtimes[r].doc === doc) { runtimes[r].refresh(); return runtimes[r]; }
        installStyles(doc);
        var instances = [];
        var invalid = typeof WeakMap === 'function' ? new WeakMap() : null;   // código roto: avisar una sola vez
        function refresh() {
            // quitar las que ya no están en el documento o cambiaron de código
            instances = instances.filter(function (it) {
                var keep = doc.contains(it.el) && it.el.getAttribute(ATTR) === it.code;
                if (!keep) it.inst.destroy();
                return keep;
            });
            var nodes = doc.querySelectorAll('[' + ATTR + ']');
            for (var i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                if (instances.some(function (it) { return it.el === el; })) continue;
                var code = el.getAttribute(ATTR);
                if (invalid && invalid.get(el) === code) continue;
                var inst = new Instance(el, win, doc);
                if (!inst.dead) instances.push({ el: el, inst: inst, code: code });
                else if (invalid) invalid.set(el, code);
            }
        }
        var mo = win.MutationObserver ? new win.MutationObserver(function () { refresh(); }) : null;
        if (mo && doc.body) mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: [ATTR, MODE_ATTR, INTERACTION_ATTR] });
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

    // Runtime público: arranca solo en la página publicada.
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(typeof module === 'object' && module.exports)) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { createRuntime({ window: window, document: document }); });
        else createRuntime({ window: window, document: document });
    }

    return { createRuntime: createRuntime, decode: decode, engine: engine };
});
