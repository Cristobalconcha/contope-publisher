(() => {
  // La barra lateral del tema de Divi en una página que NO usa el constructor (buscador, entradas y comentarios recientes):
  // la caja y el estilo computado de cada parte, para llevarla a una composición. Sólo lee.
  const raiz = document.querySelector('#main-content');
  const cont = document.querySelector('#main-content > .container');
  if (!raiz || !cont || !document.querySelector('#sidebar')) return null;
  const PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'background-color', 'display', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-basis', 'align-items', 'gap', 'box-sizing', 'width', 'height', 'min-width', 'position', 'overflow', 'list-style-type'];
  const med = (e, pseudo) => {
    const s = getComputedStyle(e, pseudo || null); const r = e.getBoundingClientRect(); const o = {};
    for (const p of PROPS) o[p] = s.getPropertyValue(p);
    if (!pseudo) o.caja = { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
    return o;
  };
  const uno = (sel, desde) => { const e = (desde || document).querySelector(sel); return e ? med(e) : null; };
  const out = {
    principal: med(raiz), contenedor: med(cont), contenedorAntes: med(cont, '::before'), contenedorDespues: med(cont, '::after'),
    area: uno('#content-area'), izquierda: uno('#left-area'), articulo: uno('#left-area article'), titulo: uno('#left-area .entry-title'),
    lateral: uno('#sidebar'), lateralAntes: med(document.querySelector('#sidebar'), '::before'),
    widgets: [...document.querySelectorAll('#sidebar > div')].map((w) => ({ id: w.id, clase: w.className, ...med(w) })),
    buscador: uno('#sidebar form.wp-block-search'), etiqueta: uno('#sidebar .wp-block-search__label'), envoltura: uno('#sidebar .wp-block-search__inside-wrapper'),
    entrada: uno('#sidebar .wp-block-search__input'), boton: uno('#sidebar .wp-block-search__button'),
    botonHover: null,
    grupos: [...document.querySelectorAll('#sidebar .wp-block-group')].map((g) => med(g)),
    titulos: [...document.querySelectorAll('#sidebar .wp-block-heading')].map((h) => ({ texto: h.textContent.trim(), ...med(h) })),
    lista: uno('#sidebar .wp-block-latest-posts__list'), item: uno('#sidebar .wp-block-latest-posts__list li'), enlace: uno('#sidebar .wp-block-latest-posts__post-title'),
    comentarios: uno('#sidebar .wp-block-latest-comments'),
    html: document.querySelector('#sidebar').innerHTML.replace(/\s+/g, ' ').trim(),
  };
  return out;
})()
