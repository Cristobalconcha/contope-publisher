/**
 * ocd-preload.js — retiene la página hasta que lo que se ve arriba está listo.
 *
 * POR QUÉ EXISTE: la portada se armaba a la vista. El video con máscara de
 * luminancia se compone cuadro a cuadro en un lienzo, así que hasta el primer
 * cuadro se alcanzaba a ver el material crudo —imagen arriba, máscara abajo—
 * como un parche oscuro. El logotipo es un símbolo SVG que se define más abajo
 * en el documento, así que aparecía después que el resto. Y el efecto de fijado
 * de la portada ya estaba corriendo mientras todo eso pasaba, de modo que las
 * piezas se montaban unas sobre otras.
 *
 * QUÉ HACE: una cortina del color de fondo del sitio cubre la página desde el
 * primer instante y se retira cuando de verdad está todo listo:
 *   - las tipografías cargadas (si no, el texto salta de fuente),
 *   - las imágenes y el resto de recursos (evento load),
 *   - el símbolo del logotipo ya definido en el documento,
 *   - el video con máscara con su primer cuadro ya compuesto.
 *
 * SIEMPRE se retira: hay un tope de tiempo, y también se retira ante cualquier
 * error. Una cortina que se queda pegada es peor que el defecto que arregla.
 */
(function () {
    'use strict';

    var CLASE = 'ocd-precarga';
    var TOPE_MS = 5000;

    var doc = document;
    var raiz = doc.documentElement;
    if (!raiz.classList.contains(CLASE)) return;

    var retirada = false;
    var pendientes = 0;
    var vencido = false;

    function retirar() {
        if (retirada) return;
        retirada = true;
        raiz.classList.remove(CLASE);
        raiz.classList.add('ocd-precarga-lista');
        // La clase de transición se limpia sola, para no dejar rastro en el DOM.
        window.setTimeout(function () { raiz.classList.remove('ocd-precarga-lista'); }, 900);
    }

    /** Cada espera suma uno; cuando todas responden (o vence el tope), se retira. */
    function esperar(promesa) {
        pendientes += 1;
        var listo = false;
        var terminar = function () {
            if (listo) return;
            listo = true;
            pendientes -= 1;
            if (pendientes <= 0 && !vencido) retirar();
        };
        try {
            promesa.then(terminar, terminar);
        } catch (_error) {
            terminar();
        }
    }

    /** El documento terminó de cargar imágenes y demás recursos. */
    function recursos() {
        return new Promise(function (listo) {
            if (doc.readyState === 'complete') { listo(); return; }
            window.addEventListener('load', function () { listo(); }, { once: true });
        });
    }

    /** Las tipografías, para que ningún texto cambie de letra a la vista. */
    function tipografias() {
        if (!doc.fonts || !doc.fonts.ready) return Promise.resolve();
        return doc.fonts.ready;
    }

    /**
     * El logotipo es un <use> que apunta a un símbolo definido más abajo en el
     * documento. Se espera a que ese símbolo exista.
     */
    function logotipo() {
        var uso = doc.querySelector('use[href^="#"], use[*|href^="#"]');
        if (!uso) return Promise.resolve();
        var id = (uso.getAttribute('href') || uso.getAttribute('xlink:href') || '').slice(1);
        if (!id) return Promise.resolve();
        if (doc.getElementById(id)) return Promise.resolve();
        return new Promise(function (listo) {
            var observador = new MutationObserver(function () {
                if (!doc.getElementById(id)) return;
                observador.disconnect();
                listo();
            });
            observador.observe(doc.documentElement, { childList: true, subtree: true });
            // Si el símbolo no aparece nunca, no se retiene la página por eso.
            window.setTimeout(function () { observador.disconnect(); listo(); }, TOPE_MS);
        });
    }

    /**
     * El video con máscara avisa cuando compuso su primer cuadro. Si en esta
     * página no hay ninguno, no hay nada que esperar.
     */
    function videoConMascara() {
        var envoltorios = doc.querySelectorAll('[data-ocd-luma-matte]');
        if (!envoltorios.length) return Promise.resolve();
        var faltan = [];
        for (var i = 0; i < envoltorios.length; i += 1) {
            if (!envoltorios[i].classList.contains('ocd-luma-matte--listo')) faltan.push(envoltorios[i]);
        }
        if (!faltan.length) return Promise.resolve();
        return new Promise(function (listo) {
            var restantes = faltan.length;
            faltan.forEach(function (envoltorio) {
                envoltorio.addEventListener('ocd-luma-matte-listo', function () {
                    restantes -= 1;
                    if (restantes <= 0) listo();
                }, { once: true });
            });
        });
    }

    esperar(recursos());
    esperar(tipografias());
    esperar(logotipo());
    esperar(videoConMascara());

    // Tope duro: pase lo que pase, la página se muestra.
    window.setTimeout(function () { vencido = true; retirar(); }, TOPE_MS);
    // Y si algo revienta en cualquier script, tampoco se queda tapada.
    window.addEventListener('error', retirar);
}());
