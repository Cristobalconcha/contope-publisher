/**
 * ContOpe Publisher — worker de tramas con LÍNEAS.
 *
 * Es el worker del motor de core (`crearAtendedor` de @contope/trama, el
 * mismo protocolo que `vendor/contope-trama/contope-trama-worker.js`) con
 * una sola cosa más: a cada cuadro le agrega las TIRAS de triángulos de sus
 * líneas (`tirasDeTramos`), ya calculadas.
 *
 * POR QUÉ EXISTE. Las líneas se dibujan con grosor real: cada trazo es una
 * tira de triángulos con uniones en inglete. Armar esas tiras con la función
 * del motor cuesta ~27 ms por cuadro con la configuración por defecto
 * (medido en Node, 64 × 480 puntos, ~80.000 vértices): en el hilo principal
 * eso es un tirón en cada cuadro. Acá se calcula junto con el cuadro, a 12
 * por segundo, y la página sólo interpola.
 *
 * NO HAY MOTOR ACÁ. Se carga `contope-trama.js` (el motor único, traído de
 * core y verificado por sha256) con `importScripts`, desde la misma carpeta
 * del plugin. Ni `blob:` ni el texto de una función: un archivo propio, que
 * una política de seguridad estricta (`worker-src 'self'`) permite.
 *
 * Protocolo: el de core, y en el mensaje `configurar` un campo más,
 * `escala` (multiplica posiciones y grosor; por omisión 1). El mensaje
 * `cuadro` vuelve con `tiras` (Float32Array transferido: x, y, r, g, b, alfa
 * por vértice) y `vertices` (cuántos).
 */
/* global importScripts, ContopeTrama */
'use strict';

importScripts(new URL('../vendor/contope-trama/contope-trama.js' + (self.location.search || ''), self.location.href).href);

(function () {
    var T = ContopeTrama;
    var trama = null, escala = 1, calidad = 1;

    function conTiras(m, transferir) {
        if (m.tipo === 'cuadro' && trama && T.conLineas(trama.dibujo.modo)) {
            // La configuración puede estar animada (grosor u opacidad de
            // línea, cantidad de puntos): se lee la del instante del cuadro.
            var cfg = T.estadoEn(trama, m.t).motor.configuracion;
            var puntos = T.dimensionesDeLamina(cfg, calidad).puntos;
            var tramos = T.tramosDeLinea(m.datos, puntos, { grosorLinea: cfg.grosorLinea, opacidadLinea: cfg.opacidadLinea });
            var tiras = T.tirasDeTramos(m.datos, tramos, T.tonosPorProfundidad(m.colores.lejos, m.colores.cerca), { escala: escala });
            m.tiras = tiras.vertices;
            m.vertices = tiras.cantidad;
            transferir = (transferir || []).concat([tiras.vertices.buffer]);
        }
        self.postMessage(m, transferir || []);
    }

    var atender = T.crearAtendedor(conTiras, function (fn) { setTimeout(fn, 0); });

    self.onmessage = function (e) {
        var m = e.data;
        if (m && m.tipo === 'configurar') {
            var lectura = T.leerTrama(m.trama);
            trama = lectura.ok ? lectura.trama : null;
            escala = typeof m.escala === 'number' && m.escala > 0 ? m.escala : 1;
            calidad = typeof m.calidad === 'number' && m.calidad > 0 && m.calidad <= 1 ? m.calidad : 1;
        }
        atender(m);
    };
})();
