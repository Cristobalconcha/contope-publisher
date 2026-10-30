/**
 * Acordeón / toggle de Divi → grupo con la conducta `acordeon` de ContOpe, que
 * equivale al bloque core/accordion de WordPress (item, resumen, panel).
 *
 *   - Cada pliegue es un grupo: su PRIMER hijo es lo que se pincha (el título)
 *     y el resto, lo que se despliega.
 *   - El aspecto sale de las PARTES del acordeón (item, resumen, panel), no de
 *     reglas sobre cada nodo: así lo cerrado y lo abierto (`state: current`) se
 *     estilan por separado, como en Divi (cerrado gris claro, abierto blanco).
 *   - Un pliegue sin caja (0×0: el «vacio» que Divi deja de marcador) no se
 *     transcribe.
 *   - `toggle` de Divi (independientes) → `autoclose: false`; `accordion` → true.
 */
import { px, pxs, lados, leerHtml, textoDe, limpiarTexto, marcasEnLinea, colorRegla } from './util.mjs';
import { reglasTexto, reglasMargen, valorTipografia } from './estilos.mjs';
import { svgDeGlifo, codepointDe } from './glifos.mjs';

const margenInferior = (e) => lados(e?.margen)[2];

export function moduloAcordeon(ctx, d, m, { gapD, gapM, ubicacion, independiente = false }) {
  const todos = d.items || (d.titulo ? [d] : []);
  const todosM = m?.items || (m?.titulo ? [m] : []);
  const visibles = todos.map((it, i) => ({ it, iM: todosM[i] })).filter(({ it }) => {
    const t = it.tamano || it.caja2 || null;
    const oculto = t && t.w === 0 && t.h === 0;
    if (oculto) ctx.avisar({ ...ubicacion, modulo: d.tipo, clase: 'pliegue oculto', severidad: 'ok', motivo: `pliegue «${it.titulo}» sin caja (0×0), marcador interno de Divi: se omite` });
    return !oculto;
  });
  if (!visibles.length) return [];
  const pliegues = [];
  let abierto = null;
  const cuerpoDe = (it, iM) => {
    const arbol = leerHtml(it.contenidoHtml || '');
    const estC = it.estiloContenido; const estCM = iM?.estiloContenido;
    const contenido = [];
    // Separación entre los bloques del pliegue: la que midió el navegador (caja de cada hijo del contenido), no un valor supuesto.
    const blD = it.contenidoBloques || []; const blM = iM?.contenidoBloques || [];
    // Lo que se VE de cada hijo: su última imagen si la tiene (un <img style="margin: 20px auto"> sobresale de su <p>) o su propia caja.
    const cajasImg = { d: (it.imagenes || []).map((x) => x.caja), m: (iM?.imagenes || []).map((x) => x.caja) };
    let nImg = 0;
    const visto = []; // por hijo: { d: caja, m: caja }
    const brecha = (bl, vis, k, cual) => {
      if (k + 1 >= bl.length) return 0;
      const v = vis[k]?.[cual] || bl[k].caja;
      return Math.max(0, Math.round(bl[k + 1].caja.y - (v.y + v.h)));
    };
    // Aire antes del primer hijo: lo que lo separa del relleno de arriba del contenido (el margen del <img> que sale del <p>).
    const arriba = (cajaCont, rellenoCont, bl) => (cajaCont && bl.length ? Math.max(0, Math.round(bl[0].caja.y - (cajaCont.y + (rellenoCont ? rellenoCont[0] : 0)))) : 0);
    const arribaD = arriba(it.contenidoCaja, it.contenidoRelleno4, blD);
    const arribaM = iM ? arriba(iM.contenidoCaja, iM.contenidoRelleno4, blM) : arribaD;
    let k = -1;
    const cerrarBloque = () => {
      const ult = contenido[contenido.length - 1];
      if (!ult || k < 0 || !blD.length) return;
      if (k === 0 && (arribaD || arribaM)) ctx.reg.inicioPendiente = { d: arribaD, m: arribaM };
      ult.ruleIds = [...ult.ruleIds.filter((r) => !r.startsWith('mg-')), ...reglasMargen(ctx.reg, brecha(blD, visto, k, 'd'), blM.length ? brecha(blM, visto, k, 'm') : brecha(blD, visto, k, 'd'))];
      ctx.reg.inicioPendiente = null;
    };
    const parrafo = (t) => ctx.nodo('paragraph', [...(estC ? reglasTexto(ctx.reg, { d: estC, m: estCM }) : []), ...reglasMargen(ctx.reg, 12, 12)], { text: t });
    const buscar = (n, tag, acc = []) => { if (n.texto !== undefined) return acc; if (n.tag === tag) acc.push(n); n.hijos.forEach((h) => buscar(h, tag, acc)); return acc; };
    for (const h of arbol.hijos) {
      if (h.texto !== undefined) { const t = limpiarTexto(h.texto); if (t) contenido.push(parrafo(t)); continue; }
      if (k >= 0) cerrarBloque();
      k += 1;
      if (h.tag === 'p' || h.tag === 'div') {
        const imgs = buscar(h, 'img'); const enl = buscar(h, 'a');
        const t = limpiarTexto(textoDe(h));
        for (const im of imgs) {
          const medida = (it.imagenes || [])[nImg];
          visto[k] = { d: cajasImg.d[nImg] || null, m: cajasImg.m[nImg] || null };
          nImg += 1;
          const url = ctx.url(im.attrs.src, ubicacion);
          if (!url) continue;
          const a = enl.find((x) => buscar(x, 'img').includes(im)) || null;
          const dim = medida?.caja;
          const nodoImg = ctx.nodo('image', [...ctx.reg.propiedades({ width: dim ? pxs(dim.w) : '100px', 'max-width': '100%', display: 'block', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto' }, {}, { prefijo: 'img' }), ...reglasMargen(ctx.reg, 12, 12)], { assetUrl: url, alt: im.attrs.alt || '' });
          const dest = a && ctx.destino(a.attrs.href);
          contenido.push(dest ? ctx.nodo('link', ctx.reg.propiedades({ display: 'block' }, {}, { prefijo: 'enl' }), { label: '', href: dest.href, target: dest.blank || a.attrs.target === '_blank' ? 'blank' : 'self' }, [nodoImg]) : nodoImg);
        }
        if (t) {
          const marcas = [...marcasEnLinea(h)].filter((x) => x !== 'img' && !(x === 'a' && imgs.length));
          if (marcas.length) ctx.avisar({ ...ubicacion, modulo: 'toggle', clase: marcas.join(','), severidad: 'aproximado', motivo: `formato en línea (${marcas.join(', ')}) dentro del pliegue «${it.titulo.slice(0, 40)}»: queda como texto plano` });
          contenido.push(parrafo(t));
        }
      } else if (h.tag === 'ul' || h.tag === 'ol') {
        const items = h.hijos.filter((x) => x.tag === 'li').map((li) => limpiarTexto(textoDe(li)));
        contenido.push(ctx.nodo('list', [...(estC ? reglasTexto(ctx.reg, { d: estC, m: estCM }) : []), ...ctx.reg.propiedades({ 'padding-inline-start': '1em' }, {}, { prefijo: 'lista' }), ...reglasMargen(ctx.reg, 12, 12)], { ordered: h.tag === 'ol', items }));
      } else if (h.tag === 'hr') {
        contenido.push(ctx.nodo('separator', reglasMargen(ctx.reg, 12, 12), {}));
      } else {
        ctx.avisar({ ...ubicacion, modulo: 'toggle', clase: `<${h.tag}>`, severidad: 'sin-transcribir', motivo: `<${h.tag}> dentro del pliegue «${it.titulo.slice(0, 40)}»: se omite` });
      }
    }
    cerrarBloque();
    // El último bloque del pliegue no lleva aire debajo.
    const ult = contenido[contenido.length - 1];
    if (ult) ult.ruleIds = [...ult.ruleIds.filter((r) => !r.startsWith('mg-')), ...reglasMargen(ctx.reg, 0, 0)];
    if (!contenido.length) contenido.push(ctx.nodo('paragraph', reglasMargen(ctx.reg, 0, 0), { text: ' ' }));
    return contenido;
  };

  for (const { it, iM } of visibles) {
    const titulo = ctx.nodo('paragraph', reglasMargen(ctx.reg, 0, 0), { text: it.titulo });
    const pliegue = ctx.nodo('group', [ctx.reg.R('layout', { mode: 'stack', gap: '0px', align: 'stretch' }, { prefijo: 'plg-g' })], undefined, [titulo, ...cuerpoDe(it, iM)]);
    pliegues.push(pliegue);
    if (it.abierto && !abierto) abierto = pliegue;
  }

  // Aspecto: lo CERRADO de un pliegue cerrado; lo ABIERTO (state: current) de uno abierto.
  const cerrado = visibles.find(({ it }) => !it.abierto) || visibles[0];
  const abiertoV = visibles.find(({ it }) => it.abierto);
  const cajaDe = (e) => {
    const r = { };
    if (e.fondo && colorRegla(e.fondo) !== 'transparent') r['background-color'] = colorRegla(e.fondo);
    if (e.radio && e.radio !== '0px') r['border-radius'] = e.radio;
    const [t, rr, b, l] = lados(e.relleno);
    Object.assign(r, { 'padding-top': pxs(t), 'padding-right': pxs(rr), 'padding-bottom': pxs(b), 'padding-left': pxs(l) });
    return r;
  };
  const cj = cerrado.it.cajaToggle || cerrado.it.caja || {};
  const partes = { item: ctx.reg.propiedades(cajaDe(cj), {}, { prefijo: 'plg' }) };
  const tipC = cerrado.it.estiloTitulo;
  // El ícono del encabezado (Divi: el ::before del título, un glifo de ETmodules). Se lleva como la parte `icono` del
  // acordeón (0.3.84, showIcon de core/accordion-heading) con el SVG del glifo original; abierto, lo que mida el abierto.
  const ic = cerrado.it.iconoToggle;
  const icA = abiertoV?.it.iconoToggle;
  let icono = null;
  if (ic && ic.display !== 'none' && ic.contenido) {
    const tamIc = px(ic.tam) || 16;
    const cp = codepointDe(ic.contenido);
    const cerradoSvg = svgDeGlifo(ctx, ic.familia, cp, tamIc);
    let abiertoSvg = null;
    if (icA && icA.display !== 'none') abiertoSvg = svgDeGlifo(ctx, icA.familia, codepointDe(icA.contenido), px(icA.tam) || tamIc);
    if (cerradoSvg) {
      icono = { cerrado: cerradoSvg, abierto: abiertoSvg, ninguno: !!icA && icA.display === 'none', color: colorRegla(ic.color), lado: Math.round(cerradoSvg.lado * cerradoSvg.escala * 100) / 100, tam: tamIc };
    } else {
      ctx.avisar({ ...ubicacion, modulo: d.tipo, clase: 'icono del pliegue', severidad: 'sin-transcribir', motivo: `el glifo ${ic.familia} U+${cp} del pliegue no está en datos/glifos.json: los pliegues quedan sin su ícono` });
    }
  }
  // Distancia entre el título y el ícono: el título de Divi reserva 50px a la derecha (padding-right) y el ícono va pegado al borde.
  const reservaTitulo = px(cerrado.it.estiloTitulo?.relleno4?.[1]) || (cerrado.it.tituloRelleno4 ? cerrado.it.tituloRelleno4[1] : 0) || 50;
  partes.resumen = [
    ...ctx.reg.propiedades({ width: '100%', 'padding-top': '0px', 'padding-right': icono ? '0px' : '40px', 'padding-bottom': '0px', 'padding-left': '0px', 'text-align': 'start', 'background-color': 'transparent', 'border-width': '0px', cursor: 'pointer', ...(icono ? { gap: pxs(Math.max(0, reservaTitulo - icono.lado)) } : {}) }, {}, { prefijo: 'plg-r' }),
    ...(tipC ? reglasTexto(ctx.reg, { d: tipC, m: cerrado.iM?.estiloTitulo }) : []),
  ];
  if (icono) partes.icono = ctx.reg.propiedades({ 'background-color': icono.color, width: pxs(icono.lado), height: pxs(icono.lado) }, {}, { prefijo: 'plg-i' });
  partes.panel = ctx.reg.propiedades({ 'padding-top': '20px', 'margin-block-start': '0px' }, {}, { prefijo: 'plg-p' });
  if (abiertoV) {
    const cjA = abiertoV.it.cajaToggle || abiertoV.it.caja || {};
    const dif = Object.fromEntries(Object.entries(cajaDe(cjA)).filter(([k, v]) => cajaDe(cj)[k] !== v));
    if (Object.keys(dif).length) partes.item.push(ctx.reg.R('properties', { declarations: dif }, { state: 'current', prefijo: 'plg-a' }));
    const tipA = abiertoV.it.estiloTitulo;
    if (tipA && tipC && colorRegla(tipA.color) !== colorRegla(tipC.color)) {
      partes.resumen.push(ctx.reg.R('properties', { declarations: { color: colorRegla(tipA.color) } }, { state: 'current', prefijo: 'c-a' }));
    }
  }
  const separacion = margenInferior(cj) || 30;
  const cjM = cerrado.iM ? (cerrado.iM.cajaToggle || cerrado.iM.caja || null) : null;
  const separacionM = cjM ? (margenInferior(cjM) ?? separacion) : separacion;
  const reglas = [
    ctx.reg.R('interaction', {
      behavior: 'acordeon', ...(independiente ? { autoclose: false } : {}), ...(abierto ? { openNodeId: abierto.id } : { startClosed: true }),
      ...(icono ? { showIcon: true, iconPosition: 'right', iconoCerrado: icono.cerrado.forma, iconoAbierto: icono.ninguno ? 'ninguno' : (icono.abierto ? icono.abierto.forma : icono.cerrado.forma) } : {}),
    }, { prefijo: 'acordeon' }),
    // La separación entre pliegues es el margen inferior de cada uno, y en celular suele ser otro (10px contra 30).
    ...ctx.reg.conAnchos('layout', { mode: 'stack', gap: pxs(separacion), align: 'stretch' },
      separacionM !== separacion ? { mobile: { mode: 'stack', gap: pxs(separacionM) } } : {}, { prefijo: 'pila' }),
    ...reglasMargen(ctx.reg, gapD, gapM),
  ];
  const nodo = ctx.nodo('group', reglas, undefined, pliegues);
  nodo.partes = partes;
  ctx.avisar({ ...ubicacion, modulo: d.tipo, clase: 'et_pb_toggle', severidad: 'ok', motivo: `${pliegues.length} pliegues → grupo con conducta \`acordeon\` (equivale a core/accordion de WordPress)${icono ? '; con su ícono (showIcon + la parte icono)' : ''}` });
  return [nodo];
}
