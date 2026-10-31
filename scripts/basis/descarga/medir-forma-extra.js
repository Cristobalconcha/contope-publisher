(() => {
  // Lo que el contrato de diseño de Orugantt Forms (segunda parte, 30-oct) necesita además de `forma`: los rellenos,
  // márgenes y separaciones entre las partes de un formulario de Gravity Forms, y la casilla propia. Sólo lee.
  const f = document.querySelector('.gform_wrapper');
  if (!f) return null;
  const cs = (e, p) => getComputedStyle(e, p || null);
  const r = (e) => e.getBoundingClientRect();
  const n = (v) => Math.round(parseFloat(v) * 100) / 100;
  const out = {};
  // Título de grupo → etiqueta chica (el primer fieldset con leyenda y subetiqueta)
  const grupo = [...f.querySelectorAll('fieldset.gfield')].find((g) => g.querySelector('legend') && g.querySelector('label'));
  if (grupo) {
    const leg = grupo.querySelector('legend'); const sub = grupo.querySelector('label'); const ent = grupo.querySelector('input');
    out.grupoTituloSeparacion = n(r(sub).top - r(leg).bottom);
    out.subetiquetaEntradaSeparacion = n(r(ent).top - r(sub).bottom);
  }
  // Un campo simple (el teléfono): relleno superior de su etiqueta y separación con el cuadro
  const simple = f.querySelector('.gfield--type-phone');
  if (simple) {
    const lab = simple.querySelector('label'); const ent = simple.querySelector('input');
    out.etiquetaRellenoSuperior = n(r(lab).top - r(simple).top);
    out.etiquetaSeparacion = n(r(ent).top - r(lab).bottom);
  }
  // Separación entre columnas: la de las filas (teléfono | consentimiento) y la de las celdas de un grupo con título (Nombre | Apellidos)
  const telf = f.querySelector('.gfield--type-phone'); const cons0 = f.querySelector('.gfield--type-consent');
  if (telf && cons0) {
    if (Math.abs(r(cons0).left - r(telf).left) < 2) out.rejillaFilaSeparacion = n(r(cons0).top - r(telf).bottom); // apiladas: la separación vertical
    else out.rejillaSeparacion = n(r(cons0).left - r(telf).right);
  }
  if (grupo) { const es = [...grupo.querySelectorAll('input')]; if (es.length > 1 && Math.abs(r(es[1]).left - r(es[0]).left) > 2) out.rejillaSubSeparacion = n(r(es[1]).left - r(es[0]).right); }
  // Consentimiento
  const cons = f.querySelector('.gfield--type-consent');
  if (cons) {
    const leg = cons.querySelector('legend'); const lab = cons.querySelector('.gfield_consent_label'); const cont = cons.querySelector('.ginput_container');
    out.opcionEtiquetaRellenoSuperior = n(r(leg).top - r(cons).top);
    out.legendSeparacion = n(r(cont).top - r(leg).bottom);
    const ls = cs(lab); const b = cs(lab, '::before');
    out.opcionSangria = n(ls.marginLeft);
    out.opcionesRellenoY = Math.max(0, n((r(cons).height - r(leg).height - out.legendSeparacion - r(cont).height) / 2));
    out.casilla = { tamano: n(b.width), fondo: b.backgroundColor, radio: b.borderTopLeftRadius, relleno: n(ls.paddingLeft), izquierda: n(b.left), arriba: n(b.top), altoEtiqueta: n(r(lab).height), centrada: Math.abs(n(b.top) - r(lab).height / 2) < 1.5 };
    const aft = cs(lab, '::after');
    out.casillaMarca = { contenido: aft.content, fondo: aft.backgroundColor, color: aft.color, ancho: aft.width };
  }
  // Ayuda, cuadro de texto y contador
  const ay = f.querySelector('.gfield_description'); const ta = f.querySelector('textarea'); const co = f.querySelector('.ginput_counter'); const pie = f.querySelector('.gform_footer, .gform-footer');
  if (ay && ta) out.ayudaSeparacion = n(r(ta).top - r(ay).bottom);
  if (ta && co) { out.contadorSeparacion = n(r(co).top - r(ta).bottom); out.contadorTexto = co.textContent.replace(/\s+/g, ' ').trim(); out.contadorAlinea = cs(co).textAlign; }
  if (co && pie) out.pieSeparacion = n(r(pie).top - r(co).bottom);
  if (pie) { const p = cs(pie); out.pieRelleno = [n(p.paddingTop), n(p.paddingBottom)]; out.pieMargenSuperior = n(p.marginTop); }
  return out;
})()
