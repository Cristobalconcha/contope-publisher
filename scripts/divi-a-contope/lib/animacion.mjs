/**
 * Animaciones de entrada de Divi → regla `motion` de ContOpe.
 *
 * Qué mira, en el HTML renderizado de cada módulo/fila/columna/sección:
 *   - clases `et_pb_animation_<estilo>` (left, right, top, bottom, fade_in) y sus
 *     variantes `_tablet` / `_phone`; `et_pb_animation_off` las apaga.
 *   - atributos `data-animation-style`, `-duration`, `-delay`, `-speed-curve`,
 *     `-repeat` (Divi 4.10+).
 *
 * Qué devuelve: { base?, tablet?, mobile?, notas[] } con valores de regla
 * `motion`, o null si el elemento no se anima. Lo que no tiene equivalente
 * exacto se aproxima y la aproximación queda en `notas` (el informe la muestra).
 *
 * Estado de la prueba: el sitio de Basis NO anima ningún módulo (sólo trae la
 * clase `et_pb_animation_off`), así que esto se probó con HTML sintético
 * (pruebas/probar-animacion.mjs), no contra un sitio real.
 */
const EFECTO = {
  left: 'slide-left', right: 'slide-right', top: 'rise', bottom: 'rise', fade_in: 'fade', fade: 'fade',
  slide: 'slide-left', zoom: 'scale', bounce: 'rise', flip: 'fade', fold: 'fade', roll: 'fade',
};
const APROX = {
  top: 'entra desde arriba: ContOpe sólo tiene «rise» (desde abajo)',
  bounce: 'rebote: se aproxima con «rise»',
  flip: 'giro: se aproxima con «fade»',
  fold: 'pliegue: se aproxima con «fade»',
  roll: 'rodar: se aproxima con «fade»',
};
const ms = (v, defecto) => {
  if (v === undefined || v === null || v === '') return defecto;
  const m = String(v).match(/^(-?\d+(?:\.\d+)?)\s*(ms|s)?$/);
  if (!m) return defecto;
  return Math.round(Number(m[1]) * (m[2] === 's' ? 1000 : 1));
};

export function leerAnimacion(attrs = {}, clases = []) {
  const cl = new Set(clases);
  const notas = [];
  const porAncho = {};
  for (const [bp, sufijo] of [['base', ''], ['tablet', '_tablet'], ['mobile', '_phone']]) {
    if (cl.has('et_pb_animation_off' + sufijo)) { porAncho[bp] = 'off'; continue; }
    const hit = ['left', 'right', 'top', 'bottom', 'fade_in'].find((k) => cl.has(`et_pb_animation_${k}${sufijo}`));
    if (hit) porAncho[bp] = hit;
  }
  const estiloData = attrs['data-animation-style'];
  if (estiloData && estiloData !== 'none') {
    const k = String(estiloData).replace(/-/g, '_');
    if (!porAncho.base || porAncho.base === 'off') porAncho.base = k === 'fade' ? 'fade_in' : k;
  }
  const efectoDe = (k) => {
    if (APROX[k]) notas.push(APROX[k]);
    return EFECTO[k] || 'fade';
  };
  const duracion = Math.min(5000, Math.max(0, ms(attrs['data-animation-duration'], 1000)));
  const retraso = Math.min(5000, Math.max(0, ms(attrs['data-animation-delay'], 0)));
  const curva = { linear: 'linear', ease: 'ease', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out' }[attrs['data-animation-speed-curve']] || 'ease-in-out';
  const mk = (k) => ({ trigger: 'scroll', effect: efectoDe(k), duration: duracion, delay: retraso, easing: curva, threshold: 0.15 });
  const salida = { notas };
  if (porAncho.base && porAncho.base !== 'off') salida.base = mk(porAncho.base);
  for (const bp of ['tablet', 'mobile']) {
    const k = porAncho[bp];
    if (!k) continue;
    if (k === 'off') {
      if (!salida.base) continue;
      salida[bp] = { trigger: 'scroll', effect: 'fade', duration: 0, delay: 0, easing: 'linear', threshold: 0.15 };
      notas.push(`animación apagada en ${bp === 'mobile' ? 'celular' : 'tablet'}: se aproxima con duración 0`);
    } else if (!salida.base || salida.base.effect !== EFECTO[k]) {
      salida[bp] = mk(k);
    }
  }
  if (attrs['data-animation-repeat'] && attrs['data-animation-repeat'] !== 'once') notas.push('repetición de la animación: ContOpe anima una sola vez');
  if (!salida.base && !salida.tablet && !salida.mobile) return null;
  return salida;
}

/**
 * Recorre el HTML ya leído (ver util.leerHtml) y devuelve, EN ORDEN DE
 * DOCUMENTO, una entrada por sección / fila / columna / módulo con su
 * animación (o null). Es el mismo orden en que el medidor recorre la página,
 * así que se asocia por posición.
 */
export function animacionesPorPosicion(raiz) {
  const res = [];
  const visitar = (n) => {
    if (n.texto !== undefined) return;
    const cl = (n.attrs.class || '').split(/\s+/).filter(Boolean);
    const nivel = cl.includes('et_pb_section') ? 'seccion'
      : cl.includes('et_pb_row') ? 'fila'
        : cl.includes('et_pb_column') ? 'columna'
          : cl.includes('et_pb_module') ? 'modulo' : null;
    if (nivel) res.push({ nivel, clases: cl, animacion: leerAnimacion(n.attrs, cl) });
    for (const h of n.hijos) visitar(h);
  };
  visitar(raiz);
  return res;
}
