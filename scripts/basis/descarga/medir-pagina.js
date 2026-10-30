// Se evalúa DENTRO de la página (ya cargada y recorrida). Devuelve un objeto JSON.
// Sólo lectura: no hace clic, no escribe en formularios. Estilos computados, no CSS leído.
(async () => {
  const q = (s, r = document) => [...r.querySelectorAll(s)];
  const limpio = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const cs = (e, p) => getComputedStyle(e, p);
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const abs = (u) => { try { return u ? new URL(u, location.href).href : ''; } catch (e) { return u || ''; } };
  const familia = (s) => (s.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
  const tipo = (e) => { const s = cs(e); return { familia: familia(s), pila: s.fontFamily, tam: s.fontSize, peso: s.fontWeight, estilo: s.fontStyle, interlineado: s.lineHeight, espaciado: s.letterSpacing, mayus: s.textTransform, alinea: s.textAlign, color: s.color }; };
  // El estilo de lo que se VE: si todo el texto de un bloque está dentro de un único <span> o <a> (Divi guarda ahí el color,
  // el tamaño o el peso: «Divi guarda el color/tamaño de un texto en un <span style> que lo envuelve todo»), manda ése y no su <p>.
  const hojaDeTexto = (e) => {
    let cur = e;
    for (let i = 0; i < 4; i++) {
      const propio = [...cur.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const hijos = [...cur.children].filter((c) => c.tagName !== 'BR');
      if (propio || hijos.length !== 1 || !['SPAN', 'A'].includes(hijos[0].tagName) || !limpio(hijos[0].textContent)) break;
      cur = hijos[0];
    }
    return cur;
  };
  const tipoTexto = (e) => tipo(hojaDeTexto(e));
  const lados4 = (e, p) => ['top', 'right', 'bottom', 'left'].map((l) => parseFloat(cs(e)[p + '-' + l]) || 0);
  const caja = (e) => { const s = cs(e); return { fondo: s.backgroundColor, imagenFondo: s.backgroundImage, radio: s.borderRadius, borde: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor, sombra: s.boxShadow, relleno: s.padding, margen: s.margin }; };
  const urlsDeFondo = (v) => { const r = []; const re = /url\(["']?([^"')]+)["']?\)/g; let m; while ((m = re.exec(v || ''))) r.push(abs(m[1])); return r; };
  const nombreClase = (e) => ((e.className && e.className.baseVal === undefined ? e.className : '') + '');

  const MODULOS = ['text', 'image', 'heading', 'blurb', 'button', 'promo', 'cta', 'code', 'fullwidth_code', 'toggle', 'accordion', 'accordion_item', 'tabs', 'tab', 'slider', 'slide', 'fullwidth_slider', 'video', 'video_slider', 'map', 'fullwidth_map', 'contact_form', 'number_counter', 'circle_counter', 'bar_counters', 'gallery', 'fullwidth_image', 'menu', 'fullwidth_menu', 'testimonial', 'team_member', 'divider', 'sidebar', 'search', 'social_media_follow', 'audio', 'countdown_timer', 'pricing_tables', 'portfolio', 'blog', 'post_title', 'fullwidth_header', 'fullwidth_portfolio', 'comments', 'login', 'signup', 'icon', 'lottie'];
  const tipoModulo = (m) => {
    const cl = [...m.classList];
    for (const t of MODULOS) if (cl.includes('et_pb_' + t)) return t;
    if (cl.includes('et_pb_button_module_wrapper') || m.querySelector(':scope > .et_pb_button')) return 'button';
    if (m.querySelector('.gform_wrapper')) return 'gravityforms';
    const otro = cl.filter((c) => /^et_pb_[a-z_]+$/.test(c) && !/^et_pb_(module|column|row|section|text_align|bg_layout|with|animation|css|sticky|equal|empty|button_module_wrapper|button_alignment)/.test(c));
    return otro.length ? 'otro:' + otro[0].replace('et_pb_', '') : 'desconocido';
  };

  const enlaces = (el) => q('a[href]', el).map((a) => ({ texto: limpio(a.textContent) || (a.querySelector('img') ? '[imagen]' : ''), href: a.getAttribute('href'), destino: abs(a.getAttribute('href')), target: a.target || '' }));
  const imagenes = (el) => q('img', el).map((i) => ({
    src: i.getAttribute('src') || '', actual: i.currentSrc || i.src, srcset: i.getAttribute('srcset') || '', alt: i.alt, natural: i.naturalWidth + 'x' + i.naturalHeight,
    caja: rect(i), radio: cs(i).borderRadius, objectFit: cs(i).objectFit, carga: i.loading || '',
    enlace: i.closest('a') ? i.closest('a').getAttribute('href') : '',
  }));

  const campoGravity = (f) => {
    const campos = [];
    for (const c of q('.gfield', f)) {
      const lab = c.querySelector('.gfield_label, legend');
      const ent = q('input, textarea, select', c).filter((x) => x.type !== 'hidden');
      campos.push({
        etiqueta: lab ? limpio(lab.textContent) : '', requerido: !!c.querySelector('.gfield_required') || c.classList.contains('gfield_contains_required'),
        clase: [...c.classList].filter((x) => /^gfield--|^gfield_|field_sublabel|gfield--width/.test(x)).join(' '),
        entradas: ent.map((x) => ({ etiqueta: x.id ? limpio((document.querySelector('label[for="' + x.id + '"]') || {}).textContent) : '', tipo: x.tagName.toLowerCase() === 'input' ? x.type : x.tagName.toLowerCase(), nombre: x.name, marcador: x.placeholder || '', requerido: x.required || x.getAttribute('aria-required') === 'true', marcado: !!x.checked })),
        opciones: q('select option', c).map((o) => limpio(o.textContent)),
        descripcion: limpio((c.querySelector('.gfield_description') || {}).textContent),
      });
    }
    // Forma del formulario (30-oct): lo que el contrato de diseño de Orugantt Forms necesita para igualarlo.
    const unaEntrada = f.querySelector('input[type=text], input[type=email], input[type=tel]');
    const area = f.querySelector('textarea');
    const etiquetaGrupo = f.querySelector('legend.gfield_label, label.gfield_label');
    const subetiqueta = f.querySelector('.gform-field-label--type-sub, .gfield_label_before_complex ~ * label, fieldset label.gform-field-label');
    const ayuda = f.querySelector('.gfield_description');
    const contador = f.querySelector('.ginput_counter');
    const consentimiento = f.querySelector('.ginput_container_consent label, .gchoice label');
    const pie = f.querySelector('.gform_footer, .gform-footer');
    const entradaEstilo = (x) => (x ? Object.assign({}, tipo(x), caja(x), { alto: Math.round(x.getBoundingClientRect().height), ancho: Math.round(x.getBoundingClientRect().width), relleno4: lados4(x, 'padding'), bordeAncho: cs(x).borderTopWidth, bordeColor: cs(x).borderTopColor, bordeEstilo: cs(x).borderTopStyle }) : null);
    const forma = { entrada: entradaEstilo(unaEntrada), area: entradaEstilo(area), etiquetaGrupo: etiquetaGrupo ? Object.assign({}, tipo(etiquetaGrupo), { margenInferior: cs(etiquetaGrupo).marginBottom }) : null, subetiqueta: subetiqueta ? Object.assign({}, tipo(subetiqueta), { margenInferior: cs(subetiqueta).marginBottom }) : null, ayuda: ayuda ? Object.assign({}, tipo(ayuda), { relleno4: lados4(ayuda, 'padding'), margenInferior: cs(ayuda).marginBottom }) : null, contador: contador ? Object.assign({}, tipo(contador), { relleno4: lados4(contador, 'padding') }) : null, consentimiento: consentimiento ? Object.assign({}, tipo(consentimiento), { relleno4: lados4(consentimiento, 'padding') }) : null, pie: pie ? { relleno4: lados4(pie, 'padding'), margen4: lados4(pie, 'margin'), caja: rect(pie) } : null, campos: q('.gfield', f).map((c) => ({ caja: rect(c), margenInferior: cs(c).marginBottom })) };
    const enviar = f.querySelector('input[type=submit], button[type=submit], .gform_button');
    return { forma, campos, enviar: enviar ? { texto: enviar.value || limpio(enviar.textContent), estilo: Object.assign({}, tipo(enviar), caja(enviar), { ancho: Math.round(enviar.getBoundingClientRect().width), alto: Math.round(enviar.getBoundingClientRect().height), relleno4: lados4(enviar, 'padding'), bordeAncho: cs(enviar).borderTopWidth }) } : null };
  };

  const formularios = () => q('form').map((f) => Object.assign({
    id: f.id, clase: f.className, accion: abs(f.getAttribute('action')), metodo: (f.method || 'get').toLowerCase(), enctype: f.enctype,
    camposOcultos: q('input[type=hidden]', f).map((h) => h.name).filter(Boolean),
    recaptcha: !!f.querySelector('.g-recaptcha, [data-sitekey], .gform_recaptcha_container') || !!document.querySelector('script[src*="recaptcha"]'),
    honeypot: !!f.querySelector('.gform_validation_container'),
  }, f.closest('.gform_wrapper') ? Object.assign({ motor: 'Gravity Forms' }, campoGravity(f)) : { motor: 'otro', campos: q('input, textarea, select', f).filter((x) => x.type !== 'hidden').map((x) => ({ tipo: x.type || x.tagName.toLowerCase(), nombre: x.name, marcador: x.placeholder })) }));

  const detalleModulo = (m, tipoM) => {
    const d = { tipo: tipoM, caja: rect(m), visible: !!(m.offsetWidth || m.offsetHeight), clasesPropias: [...m.classList].filter((c) => !/^et_pb_|^et-|^et_|^clearfix$/.test(c)), id: m.id || '' };
    d.texto = limpio(m.innerText || m.textContent);
    if (tipoM === 'text') {
      const inner = m.querySelector('.et_pb_text_inner') || m;
      d.html = inner.innerHTML.trim();
      d.bloques = q('h1,h2,h3,h4,h5,h6,p,li,blockquote', inner).map((x) => ({ etiqueta: x.tagName.toLowerCase(), texto: limpio(x.textContent), estilo: tipoTexto(x), estiloBloque: tipo(x), caja: rect(x), margen4: lados4(x, 'margin'), relleno4: lados4(x, 'padding') }));
      // Listas (ul/ol) con su sangría y su viñeta: la del primer nivel y la de cada sublista.
      d.listas = q('ul, ol', inner).map((l) => ({ etiqueta: l.tagName.toLowerCase(), nivel: q('ul, ol', inner).filter((o) => o !== l && o.contains(l)).length, relleno4: lados4(l, 'padding'), margen4: lados4(l, 'margin'), vineta: cs(l).listStyleType, posicionVineta: cs(l).listStylePosition, caja: rect(l) }));
      d.enlaces = enlaces(inner);
    } else if (tipoM === 'heading') {
      const h = m.querySelector('h1,h2,h3,h4,h5,h6,.et_pb_module_heading');
      d.etiqueta = h ? h.tagName.toLowerCase() : ''; d.texto = h ? limpio(h.textContent) : d.texto; if (h) d.estilo = tipo(h);
    } else if (tipoM === 'image') {
      d.imagenes = imagenes(m); d.enlaces = enlaces(m);
    } else if (tipoM === 'blurb') {
      const h = m.querySelector('.et_pb_module_header, h1,h2,h3,h4,h5,h6');
      d.titulo = h ? limpio(h.textContent) : ''; d.etiqueta = h ? h.tagName.toLowerCase() : ''; if (h) d.estiloTitulo = tipo(h);
      const desc = m.querySelector('.et_pb_blurb_description'); d.descripcion = desc ? limpio(desc.textContent) : ''; d.descripcionHtml = desc ? desc.innerHTML.trim() : ''; if (desc) { const pd = desc.querySelector('p'); d.estiloDescripcion = tipoTexto(pd || desc); d.estiloDescripcionContenedor = tipo(desc); }
      d.imagenes = imagenes(m);
      const ic = m.querySelector('.et-pb-icon'); if (ic) d.icono = Object.assign({ glifo: limpio(ic.textContent) }, tipo(ic));
      d.posicionImagen = [...m.classList].filter((c) => /blurb_position|text_align/.test(c)).join(' ');
      d.enlaces = enlaces(m);
      d.cajaBlurb = caja(m);
    } else if (tipoM === 'button') {
      const b = m.querySelector('a.et_pb_button, .et_pb_button');
      if (b) d.boton = { texto: limpio(b.textContent), href: b.getAttribute('href'), destino: abs(b.getAttribute('href')), target: b.target || '', estilo: Object.assign({}, tipo(b), caja(b)), caja: rect(b), clase: b.className };
      d.alineacion = [...m.classList].filter((c) => /button_alignment/.test(c)).join(' ');
    } else if (tipoM === 'promo' || tipoM === 'cta') {
      const h = m.querySelector('h1,h2,h3,h4,h5,h6'); d.titulo = h ? limpio(h.textContent) : ''; d.etiqueta = h ? h.tagName.toLowerCase() : ''; if (h) d.estiloTitulo = tipo(h);
      const desc = m.querySelector('.et_pb_promo_description, .et_pb_cta_description'); d.descripcion = desc ? limpio(desc.textContent.replace(d.titulo, '')) : '';
      if (desc) { const pd = desc.querySelector('p'); d.estiloDescripcion = tipoTexto(pd || desc); d.estiloDescripcionContenedor = tipo(desc); }
      const b = m.querySelector('.et_pb_button'); if (b) d.boton = { texto: limpio(b.textContent), href: b.getAttribute('href'), destino: abs(b.getAttribute('href')), estilo: Object.assign({}, tipo(b), caja(b)) };
      d.cajaPromo = caja(m);
    } else if (tipoM === 'code' || tipoM === 'fullwidth_code') {
      const inner = m.querySelector('.et_pb_code_inner') || m;
      d.codigoLongitud = inner.innerHTML.length; d.contieneScript = !!inner.querySelector('script'); d.contieneStyle = !!inner.querySelector('style'); d.contieneIframe = !!inner.querySelector('iframe');
      d.resumen = limpio(inner.textContent).slice(0, 400);
      d.enlaces = enlaces(inner).slice(0, 20);
      d.codigoHtml = inner.innerHTML;
    } else if (tipoM === 'toggle' || tipoM === 'accordion_item') {
      const t = m.querySelector('.et_pb_toggle_title'); const c = m.querySelector('.et_pb_toggle_content');
      d.titulo = t ? limpio(t.textContent) : ''; d.contenido = c ? limpio(c.textContent) : ''; d.contenidoCaja = c ? rect(c) : null; d.contenidoBloques = c ? [...c.children].map((x) => ({ tag: x.tagName.toLowerCase(), caja: rect(x), margen4: lados4(x, 'margin'), relleno4: lados4(x, 'padding') })) : []; d.contenidoHtml = c ? c.innerHTML.trim() : '';
      d.abierto = m.classList.contains('et_pb_toggle_open'); if (t) d.estiloTitulo = tipo(t); if (c) d.estiloContenido = tipoTexto(c.querySelector('p, li') || c); d.cajaToggle = caja(m);
      const p = cs(t || m, '::before'); d.iconoToggle = { contenido: p.content, color: p.color, tam: p.fontSize, familia: familia(p), display: p.display, posicion: p.position, arriba: p.top, derecha: p.right, ancho: p.width, alto: p.height, margenSuperior: p.marginTop, fondo: p.backgroundColor, radio: p.borderRadius };
      d.enlaces = c ? enlaces(c) : [];
      d.imagenes = c ? imagenes(c) : [];
    } else if (tipoM === 'accordion' || tipoM === 'tabs') {
      d.items = q('.et_pb_toggle, .et_pb_tab', m).map((t) => {
        const ti = t.querySelector('.et_pb_toggle_title'); const co = t.querySelector('.et_pb_toggle_content') || t;
        const p = ti ? cs(ti, '::before') : null;
        return { titulo: ti ? limpio(ti.textContent) : limpio(t.getAttribute('class')), contenido: limpio(co.textContent), contenidoHtml: co.innerHTML.trim(), contenidoCaja: rect(co), contenidoBloques: [...co.children].map((x) => ({ tag: x.tagName.toLowerCase(), caja: rect(x), margen4: lados4(x, 'margin'), relleno4: lados4(x, 'padding') })), abierto: t.classList.contains('et_pb_toggle_open'), enlaces: enlaces(co), imagenes: imagenes(co),
          estiloTitulo: ti ? tipo(ti) : null, estiloContenido: tipoTexto(co.querySelector('p, li') || co), caja: caja(t), tamano: rect(t), tituloRelleno4: ti ? lados4(ti, 'padding') : null, contenidoRelleno4: lados4(co, 'padding'), margenInferior: cs(t).marginBottom, iconoToggle: p ? { contenido: p.content, color: p.color, tam: p.fontSize, familia: familia(p), display: p.display, posicion: p.position, arriba: p.top, derecha: p.right, ancho: p.width, alto: p.height, margenSuperior: p.marginTop, fondo: p.backgroundColor, radio: p.borderRadius } : null };
      });
      d.cajaAcordeon = caja(m);
    } else if (tipoM === 'gravityforms') {
      d.formularios = q('form', m).map((f) => ({ id: f.id }));
    } else {
      d.enlaces = enlaces(m).slice(0, 20); d.imagenes = imagenes(m);
    }
    // Relleno y margen PROPIOS del módulo (Divi: Design → Spacing), por lado y en px: la caja medida los
    // incluye, y sin ellos el texto queda pegado al borde de su columna. Se guardan para TODO módulo.
    d.estiloCaja = Object.assign(caja(m), {
      relleno4: lados4(m, 'padding'), margen4: lados4(m, 'margin'),
      ancho: cs(m).width, anchoMaximo: cs(m).maxWidth, posicion: cs(m).position, boxSizing: cs(m).boxSizing,
    });
    const interior = m.querySelector('.et_pb_text_inner, .et_pb_blurb_container, .et_pb_promo_description, .et_pb_code_inner');
    if (interior) d.estiloInterior = { clase: interior.className.split(/\s+/)[0], relleno4: lados4(interior, 'padding'), margen4: lados4(interior, 'margin'), caja: rect(interior) };
    return d;
  };

  const detalleSeccion = (s, indice, region) => {
    const c = cs(s);
    const cl = [...s.classList];
    const sec = {
      indice, region, id: s.id || '', clasesPropias: cl.filter((x) => !/^et_pb_|^et-|^et_|^clearfix$/.test(x)),
      clasesDivi: cl.filter((x) => /^et_pb_|^et_section/.test(x) && !/_tb_|_\d+(_|$)/.test(x)),
      tipo: cl.includes('et_section_specialty') ? 'especialidad' : cl.includes('et_pb_fullwidth_section') ? 'ancho completo' : 'regular',
      caja: rect(s), fondo: c.backgroundColor, imagenFondo: c.backgroundImage, urlsFondo: urlsDeFondo(c.backgroundImage),
      tamanoFondo: c.backgroundSize, posicionFondo: c.backgroundPosition, repiteFondo: c.backgroundRepeat, adjuntoFondo: c.backgroundAttachment,
      relleno: c.padding, pegajosa: cl.includes('et_pb_sticky_module') || c.position === 'sticky' || c.position === 'fixed',
      paralaje: !!s.querySelector('.et_parallax_bg'), conVideoFondo: cl.includes('et_pb_section_video'),
    };
    // Trama y máscara de fondo de Divi (Design → Background): son elementos hijos de la sección; sólo importa el que tiene imagen.
    const fondoExtra = (sel) => { const e = s.querySelector(':scope > ' + sel); if (!e) return null; const x = cs(e); const img = x.backgroundImage !== 'none' ? x.backgroundImage : (x.maskImage && x.maskImage !== 'none' ? x.maskImage : (x.webkitMaskImage || 'none')); return { imagen: img.slice(0, 400), color: x.backgroundColor, tamano: x.backgroundSize, posicion: x.backgroundPosition, repite: x.backgroundRepeat, opacidad: x.opacity }; };
    sec.fondoTrama = fondoExtra('.et_pb_background_pattern');
    sec.fondoMascara = fondoExtra('.et_pb_background_mask');
    const vf = s.querySelector('.et_pb_section_video_bg video');
    if (vf) sec.videoFondo = { fuentes: q('source', vf).map((x) => abs(x.src)).concat(vf.src ? [abs(vf.src)] : []), autoplay: vf.autoplay, bucle: vf.loop, silenciado: vf.muted, poster: abs(vf.poster), caja: rect(vf), objectFit: cs(vf).objectFit };
    sec.divisores = q(':scope > .et_pb_top_inside_divider, :scope > .et_pb_bottom_inside_divider', s).map((d) => ({ cual: d.classList.contains('et_pb_top_inside_divider') ? 'arriba' : 'abajo', clases: [...d.classList].join(' '), alto: cs(d).height, fondo: cs(d).backgroundImage, fondoColor: cs(d).backgroundColor }));
    const pb = cs(s, '::before'), pa = cs(s, '::after');
    sec.pseudo = { antes: pb.content !== 'none' && pb.content !== 'normal' ? { contenido: pb.content, fondo: pb.backgroundColor, imagen: pb.backgroundImage.slice(0, 200) } : null, despues: pa.content !== 'none' && pa.content !== 'normal' ? { contenido: pa.content, fondo: pa.backgroundColor, imagen: pa.backgroundImage.slice(0, 200) } : null };
    sec.filas = [];
    for (const f of [...s.children]) {
      if (!f.classList.contains('et_pb_row') && !f.classList.contains('et_pb_module') && !f.classList.contains('et_pb_fullwidth_header')) continue;
      const fila = { clase: [...f.classList].filter((x) => /^et_pb_row$|equal_columns|fullwidth|specialty|gutter/.test(x)).join(' '), caja: rect(f), estilo: caja(f), columnas: [] };
      if (f.classList.contains('et_pb_row')) {
        for (const col of [...f.children].filter((x) => x.classList.contains('et_pb_column'))) {
          const medida = ([...col.classList].find((x) => /^et_pb_column_\d_\d$/.test(x)) || '').replace('et_pb_column_', '');
          const colInfo = { medida, caja: rect(col), estilo: caja(col), modulos: [] };
          for (const m of q('.et_pb_module', col)) {
            const padre = m.parentElement.closest('.et_pb_module');
            if (padre && col.contains(padre)) continue; // módulo dentro de otro módulo
            colInfo.modulos.push(detalleModulo(m, tipoModulo(m)));
          }
          fila.columnas.push(colInfo);
        }
      } else { fila.modulo = detalleModulo(f, tipoModulo(f)); }
      sec.filas.push(fila);
    }
    return sec;
  };

  // --- regiones y secciones
  const regiones = [['encabezado', '.et-l--header'], ['contenido', '.et-l--post'], ['pie', '.et-l--footer']];
  const secciones = [];
  let n = 0;
  for (const [nombre, sel] of regiones) {
    const r = document.querySelector(sel);
    if (!r) continue;
    for (const s of q('.et_pb_section', r)) { if (s.parentElement.closest('.et_pb_section')) continue; secciones.push(detalleSeccion(s, n++, nombre)); }
  }
  let contenidoPlano = null;
  if (!document.querySelector('.et-l--post .et_pb_section')) {
    const a = document.querySelector('#left-area, #main-content article, #main-content');
    if (a) contenidoPlano = { texto: limpio(a.innerText).slice(0, 3000), html: a.innerHTML.slice(0, 20000), caja: rect(a) };
  }

  // --- roles de tipografía: agrupar estilos computados reales
  const grupos = {};
  const zona = (e) => (e.closest('.et-l--header') ? 'encabezado' : e.closest('.et-l--footer') ? 'pie' : 'contenido');
  const tomar = (rol, e, sinTexto) => {
    const t = limpio(e.textContent);
    if (!t && !sinTexto) return;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const ty = tipo(e);
    const clave = rol + '|' + [ty.familia, ty.tam, ty.peso, ty.estilo, ty.interlineado, ty.espaciado, ty.mayus, ty.color].join('|');
    const g = grupos[clave] || (grupos[clave] = Object.assign({ rol }, ty, { cantidad: 0, caracteres: 0, ejemplos: [] }));
    g.cantidad++; g.caracteres += t.length; if (g.ejemplos.length < 3) g.ejemplos.push(t.slice(0, 70));
  };
  for (const e of q('h1,h2,h3,h4,h5,h6')) tomar(zona(e) + ':' + e.tagName.toLowerCase(), e);
  for (const e of q('.et_pb_text_inner p, .et_pb_text_inner li, .et_pb_blurb_description, .et_pb_toggle_content, .et_pb_promo_description')) tomar(zona(e) + ':cuerpo', e);
  for (const e of q('.et_pb_text_inner a, .et_pb_code_inner a')) tomar(zona(e) + ':enlace', e);
  for (const e of q('.et_pb_button')) tomar(zona(e) + ':boton', e);
  for (const e of q('.et_pb_toggle_title')) tomar(zona(e) + ':toggle-titulo', e);
  for (const e of q('.et_pb_module_header')) tomar(zona(e) + ':blurb-titulo', e);
  for (const e of q('.gform_wrapper label, .gform_wrapper legend')) tomar('formulario:etiqueta', e);
  for (const e of q('.gform_wrapper input:not([type=hidden]):not([type=submit]), .gform_wrapper textarea, .gform_wrapper select')) tomar('formulario:campo', e, true);
  for (const e of q('.gform_wrapper .gform_button, .gform_wrapper input[type=submit]')) tomar('formulario:enviar', e, true);
  const textoPropio = (e) => [...e.childNodes].some((n2) => n2.nodeType === 3 && n2.textContent.trim());
  for (const e of q('.et-l--header .et_pb_text_inner *, .et-l--footer .et_pb_text_inner *, .et-l--footer .et_pb_code_inner *')) if (textoPropio(e)) tomar(zona(e) + ':texto-' + e.tagName.toLowerCase(), e);
  const roles = Object.values(grupos).sort((a, b) => b.caracteres - a.caracteres);

  // --- colores: texto por caracteres, fondos por área
  const colorTexto = {}, colorFondo = {}, areaFondo = {};
  for (const e of q('body *')) {
    const s = cs(e); const r = e.getBoundingClientRect();
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const dir = [...e.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent.trim()).join('').length;
    if (dir && r.width) colorTexto[s.color] = (colorTexto[s.color] || 0) + dir;
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent' && r.width * r.height > 2500) { colorFondo[s.backgroundColor] = (colorFondo[s.backgroundColor] || 0) + 1; areaFondo[s.backgroundColor] = (areaFondo[s.backgroundColor] || 0) + Math.round(r.width * r.height); }
  }
  const ordenar = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

  // --- radios de esquina de lo visual
  const radios = [];
  const selRad = 'img, video, .et_pb_button, .et_pb_blurb, .et_pb_toggle, .et_pb_promo, .et_pb_image_wrap, .gform_wrapper input:not([type=hidden]), .gform_wrapper textarea, .gform_wrapper select, .gform_button, iframe, .logo-wsp-sticky';
  for (const e of q(selRad)) {
    const s = cs(e); const r = e.getBoundingClientRect(); if (!r.width) continue;
    radios.push({ elemento: e.tagName.toLowerCase() + '.' + nombreClase(e).split(/\s+/).filter((x) => x && !/_\d+$/.test(x)).slice(0, 2).join('.'), radio: s.borderRadius, caja: Math.round(r.width) + 'x' + Math.round(r.height), zona: zona(e), borde: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor, sombra: s.boxShadow });
  }
  const envolturas = q('.et_pb_image_wrap, .et_pb_image, .et_pb_module').filter((e) => cs(e).overflow !== 'visible' && cs(e).borderRadius !== '0px').map((e) => ({ clase: nombreClase(e).split(/\s+/).slice(0, 3).join('.'), radio: cs(e).borderRadius, overflow: cs(e).overflow }));

  // --- fuentes cargadas
  const fuentes = [...document.fonts].map((f) => ({ familia: f.family.replace(/['"]/g, ''), peso: f.weight, estilo: f.style, estado: f.status }));
  const variables = {};
  try { for (const h of document.styleSheets) { let reglas; try { reglas = h.cssRules; } catch (e) { continue; } for (const r of reglas) { if (r.selectorText && /^:root$|^html$/.test(r.selectorText) && r.style) for (const p of r.style) if (p.startsWith('--') && !/^--(wp|wc)--/.test(p)) variables[p] = r.style.getPropertyValue(p).trim().slice(0, 120); } } } catch (e) {}
  const raiz = cs(document.documentElement);
  const cuerpo = cs(document.body);

  // --- metadatos y terceros
  const meta = {};
  for (const m of q('meta[name], meta[property]')) meta[m.getAttribute('name') || m.getAttribute('property')] = m.content;
  const guiones = q('script').map((s) => ({ src: s.src || '', tipo: s.type || '', id: s.id || '', longitud: s.src ? 0 : s.textContent.length }));
  const pajar = document.documentElement.outerHTML;
  const buscar = (re) => { const r = new Set(); const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(pajar))) r.add(m[0]); return [...r]; };
  const terceros = {
    gtm: buscar(/GTM-[A-Z0-9]+/), ga: buscar(/\bG-[A-Z0-9]{8,12}\b/), ua: buscar(/UA-\d+-\d+/), gads: buscar(/AW-\d+/), fbpixel: buscar(/fbq\(\s*['"]init['"]\s*,\s*['"]\d+/),
    mapbox: { script: q('script[src*="mapbox"]').map((s) => s.src), hojas: q('link[href*="mapbox"]').map((s) => s.href), tokens: buscar(/pk\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/), contenedores: q('[id*="map" i], .mapboxgl-map').map((e) => ({ id: e.id, clase: nombreClase(e).slice(0, 80), caja: rect(e) })) },
    iframes: q('iframe').map((i) => ({ src: abs(i.src), titulo: i.title, caja: rect(i) })),
    recaptcha: buscar(/recaptcha[^"' ]{0,60}/),
    cookies: q('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [class*="cmplz" i], [id*="cmplz" i]').map((e) => ({ id: e.id, clase: nombreClase(e).slice(0, 80), texto: limpio(e.textContent).slice(0, 160), visible: !!(e.offsetWidth || e.offsetHeight) })),
    whatsapp: q('a[href*="wa.me"], a[href*="whatsapp"]').map((a) => ({ href: a.getAttribute('href'), clase: a.className, caja: rect(a), posicion: cs(a).position, estilo: caja(a) })),
    redes: q('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="linkedin.com"], a[href*="youtube.com"], a[href*="twitter.com"], a[href*="tiktok.com"]').map((a) => a.href),
    contacto: { mailto: q('a[href^="mailto:"]').map((a) => a.getAttribute('href')), tel: q('a[href^="tel:"]').map((a) => a.getAttribute('href')) },
  };
  const fijos = q('body *').filter((e) => { const p = cs(e).position; return (p === 'fixed' || p === 'sticky') && e.getBoundingClientRect().width > 0; }).map((e) => ({ etiqueta: e.tagName.toLowerCase(), id: e.id, clase: nombreClase(e).slice(0, 100), posicion: cs(e).position, caja: rect(e), z: cs(e).zIndex }));
  const listaSecc = q('.et_pb_section').filter((x) => !x.parentElement.closest('.et_pb_section'));
  const todasImgs = q('img').map((i) => ({ actual: i.currentSrc || i.src, src: i.getAttribute('src') || '', srcset: i.getAttribute('srcset') || '', alt: i.alt, natural: i.naturalWidth + 'x' + i.naturalHeight, caja: rect(i), zona: zona(i), seccion: listaSecc.indexOf(i.closest('.et_pb_section')) }));
  const fondos = [];
  q('body *').forEach((e) => { const bi = cs(e).backgroundImage; if (bi && bi.includes('url(')) fondos.push({ urls: urlsDeFondo(bi), elemento: e.tagName.toLowerCase() + '.' + nombreClase(e).split(/\s+/).slice(0, 2).join('.'), caja: rect(e), zona: zona(e), seccion: listaSecc.indexOf(e.closest('.et_pb_section')) }); });
  const videos = q('video').map((v) => ({ src: abs(v.currentSrc || v.src), fuentes: q('source', v).map((s) => abs(s.src)), poster: abs(v.poster), autoplay: v.autoplay, loop: v.loop, muted: v.muted, controles: v.controls, caja: rect(v), radio: cs(v).borderRadius, duracion: v.duration, ancho: v.videoWidth + 'x' + v.videoHeight, zona: zona(v), seccion: listaSecc.indexOf(v.closest('.et_pb_section')) }));
  const pdfs = q('a[href]').filter((a) => /\.pdf(\?|$)/i.test(a.getAttribute('href'))).map((a) => ({ href: abs(a.getAttribute('href')), texto: limpio(a.textContent), zona: zona(a) }));
  const iconos = q('link[rel*="icon"]').map((l) => ({ rel: l.rel, href: abs(l.href), tamanos: l.sizes ? l.sizes.value : '' }));
  const hojas = q('link[rel=stylesheet]').map((l) => abs(l.href));

  // Código de los módulos tal como llega del servidor (antes de que corran los scripts)
  let codigoOriginal = [];
  try { const crudo = await (await fetch(location.href, { credentials: "omit" })).text(); const dom = new DOMParser().parseFromString(crudo, "text/html"); codigoOriginal = [...dom.querySelectorAll(".et_pb_code_inner")].map((e) => e.innerHTML); } catch (e) { codigoOriginal = ["ERROR " + e.message]; }

  return {
    codigoOriginal, url: location.href, ancho: innerWidth, altoPagina: document.documentElement.scrollHeight, titulo: document.title, lang: document.documentElement.lang,
    metaEtiquetas: meta, canonical: (document.querySelector('link[rel=canonical]') || {}).href || '', clasesBody: [...document.body.classList], iconos,
    cuerpo: { fondo: cuerpo.backgroundColor, color: cuerpo.color, familia: familia(cuerpo), tam: cuerpo.fontSize, peso: cuerpo.fontWeight, interlineado: cuerpo.lineHeight, htmlFondo: raiz.backgroundColor },
    secciones, contenidoPlano, roles, colores: { texto: ordenar(colorTexto).slice(0, 14), fondo: ordenar(colorFondo).slice(0, 14), areaFondo: ordenar(areaFondo).slice(0, 14) },
    radios, envolturas, fuentes, variablesCss: variables, terceros, fijos, formularios: formularios(), imagenes: todasImgs, fondos, videos, pdfs, guiones, hojas,
    menu: q('.et-l--header a[href], .et-l--footer a[href]').map((a) => ({ texto: limpio(a.textContent) || '[imagen]', href: a.getAttribute('href'), destino: abs(a.getAttribute('href')), zona: zona(a) })),
    enlacesInternos: [...new Set(q('a[href]').map((a) => abs(a.getAttribute('href'))).filter((u) => u.startsWith(location.origin)))],
    enlacesExternos: [...new Set(q('a[href]').map((a) => abs(a.getAttribute('href'))).filter((u) => /^https?:/.test(u) && !u.startsWith(location.origin)))],
  };
})()
