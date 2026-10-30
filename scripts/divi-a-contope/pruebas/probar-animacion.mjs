/**
 * Prueba de la lectura de animaciones de Divi con HTML SINTÉTICO (Basis no anima
 * nada, así que no hay una muestra real). Si algún día hay un sitio con
 * animaciones medidas, esta prueba debe repetirse contra él.
 */
import assert from 'node:assert/strict';
import { leerHtml } from '../lib/util.mjs';
import { animacionesPorPosicion, leerAnimacion } from '../lib/animacion.mjs';

const html = `
<div class="et_pb_section et_pb_section_0">
  <div class="et_pb_row"><div class="et_pb_column">
    <div class="et_pb_module et_pb_text et-waypoint et_pb_animation_left et_pb_animation_left_tablet et_pb_animation_off_phone" data-animation-duration="800ms" data-animation-delay="200ms" data-animation-speed-curve="ease-out"></div>
    <div class="et_pb_module et_pb_image et_pb_animation_off et_pb_animation_off_tablet et_pb_animation_off_phone"></div>
    <div class="et_pb_module et_pb_blurb et-waypoint et_pb_animation_top" data-animation-duration="1.2s"></div>
  </div></div>
</div>`;
const lista = animacionesPorPosicion(leerHtml(html));
assert.deepEqual(lista.map((e) => e.nivel), ['seccion', 'fila', 'columna', 'modulo', 'modulo', 'modulo']);
const [, , , texto, imagen, blurb] = lista;

assert.equal(texto.animacion.base.effect, 'slide-left');
assert.equal(texto.animacion.base.duration, 800);
assert.equal(texto.animacion.base.delay, 200);
assert.equal(texto.animacion.base.easing, 'ease-out');
assert.equal(texto.animacion.mobile.duration, 0, 'apagada en celular → duración 0');
assert.equal(imagen.animacion, null, 'et_pb_animation_off no anima');
assert.equal(blurb.animacion.base.effect, 'rise');
assert.equal(blurb.animacion.base.duration, 1200);
assert.ok(blurb.animacion.notas.some((n) => /arriba/.test(n)), 'la entrada desde arriba se avisa como aproximada');
assert.equal(leerAnimacion({}, ['et_pb_module']), null);
console.log('probar-animacion: ok (6 comprobaciones con HTML sintético)');
