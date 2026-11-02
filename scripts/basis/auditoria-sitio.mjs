/**
 * Auditoría de comportamiento del sitio local de Basis, en escritorio, tablet y CELULAR de verdad (con el
 * agente y el toque de un teléfono). Referencia: scripts/santaluisa/auditoria-sitio.cjs (carruseles, acordeones,
 * lightbox, imágenes y videos) adaptada a lo que Basis tiene: acordeones de preguntas, un video de fondo, el botón
 * fijo de WhatsApp y el de ayuda, el formulario y el encabezado pegajoso.
 *
 *   node auditoria-sitio.mjs [SITIO] [carpeta-salida]
 *
 * Por página y ancho comprueba:
 *   - que la página no se desborde de costado (scrollWidth ≤ ancho);
 *   - que ninguna imagen, video o fuente falle (y que cada <img> visible tenga caja y dibujo);
 *   - los acordeones: cada pliegue se abre pinchándolo (aria-expanded, panel visible, ícono en su estado) y se cierra al
 *     abrir otro (autoclose), con el ícono del cerrado visible y el del abierto oculto;
 *   - los botones fijos: dentro de la pantalla, del tamaño de un dedo (≥ 44 px) y sin tapar el contenido principal;
 *   - el formulario: sus campos caben en el ancho, son visibles y se pueden enfocar y escribir;
 *   - el encabezado: pegado arriba y sin cubrir el título al bajar;
 *   - los errores de la consola;
 *   - que el SET DE DISEÑO gobierne el sitio (gobierno-del-set.mjs, por HTTP, una vez por página): sin colores ni
 *     font-family literales en la hoja del diseño, núcleo del set sin roles «sin declarar», variables de las
 *     definiciones de estilo emitidas y favicon que sale de las definiciones. Cada una cuenta como PROBLEMA.
 *
 *   node auditoria-sitio.mjs [SITIO] [carpeta-salida] [--solo-gobierno]
 *   (con AUTH_FILE también le pregunta al plugin por `COD_Design_Core::faltantes()`)
 *
 * Sólo lee el sitio local y no envía el formulario.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';
import { auditarGobierno } from './gobierno-del-set.mjs';

const posicionales = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SOLO_GOBIERNO = process.argv.includes('--solo-gobierno');
const SITIO = (posicionales[0] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = posicionales[1] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
mkdirSync(SAL, { recursive: true });
const PAGINAS = [['inicio', '/'], ['basis-carpas-industriales', '/basis-carpas-industriales/'], ['preguntas-frecuentes', '/preguntas-frecuentes/'], ['contactos', '/contactos/'], ['terminos-y-privacidad', '/terminos-y-privacidad/']];
/*
 * Lo que cada página DEBE tener, contado en las composiciones de origen (salida/*.componer.json: nodos de cada tipo; los íconos de
 * «Opciones comerciales» son imágenes). Está escrito a mano a propósito: si lo leyera de lo que el guion de bloques genera, un
 * guion que perdiera un acordeón perdería también la expectativa. Encontrar MENOS de lo esperado es un problema; CERO, más.
 */
const INVENTARIO = {
  inicio: { imagenes: 7, videos: 1, acordeones: 1, pliegues: 3, botones: 3, listas: 4, titulos: 11 },
  'basis-carpas-industriales': { buscadores: 1, entradas: 1, comentarios: 1, titulos: 3 },
  'preguntas-frecuentes': { acordeones: 3, pliegues: 16, imagenes: 4, listas: 1, separadores: 1, titulos: 4 },
  contactos: { formularios: 1, mapas: 1, titulos: 1 },
  'terminos-y-privacidad': { tablas: 3, listas: 3, titulos: 20 },
};
const resultados = [];
let fallas = 0;

// El set gobierna el sitio: una vez por página (no depende del ancho). Cada hallazgo es un PROBLEMA, no un aviso.
const gobierno = await auditarGobierno({ sitio: SITIO, rutas: PAGINAS.map((p) => p[1]) });
for (const g of gobierno) {
  const slug = PAGINAS.find((p) => p[1] === g.ruta)?.[0] || g.ruta;
  fallas += g.problemas.length;
  resultados.push({ pagina: slug, ancho: 'gobierno', problemas: g.problemas, notas: g.notas });
  console.log(`${g.problemas.length ? 'FALLA' : 'ok   '} ${slug} @gobierno-del-set${g.problemas.length ? '\n   - ' + g.problemas.join('\n   - ') : ''}`);
}
if (gobierno.nota) console.log(`   (${gobierno.nota})`);

for (const ancho of SOLO_GOBIERNO ? [] : [1440, 768, 393]) {
  const movil = ancho < 768;
  for (const [slug, ruta] of PAGINAS) {
    const { cdp, evaluar, dormir, cerrar, alEvento } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: movil ? 2 : 1, movil });
    const consola = []; const red = [];
    alEvento((m, p) => {
      if (m === 'Runtime.exceptionThrown') consola.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'excepción');
      if (m === 'Runtime.consoleAPICalled' && p.type === 'error') consola.push((p.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      if (m === 'Network.loadingFailed' && !/cookieadmin|googletagmanager|google-analytics|favicon/.test(p.requestId + (p.errorText || ''))) red.push(p.errorText);
    });
    const caso = { pagina: slug, ancho, problemas: [], notas: [] };
    try {
      await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp('Page.navigate', { url: SITIO + ruta });
      await dormir(2500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar, 0.6); await dormir(1500);
      await evaluar('scrollTo(0, 0)'); await dormir(300);

      const tocar = async (x, y) => {
        if (movil) {
          await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        }
        await dormir(450);
      };
      const centroDe = (sel, n = 0) => evaluar(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height }; })()`);

      // 1. desborde lateral
      const doc = await evaluar('({ sw: document.documentElement.scrollWidth, iw: innerWidth })');
      if (doc.sw > doc.iw + 1) caso.problemas.push(`se desborda de costado: ${doc.sw}px de contenido en ${doc.iw}px`);

      // 2. imágenes, videos y fuentes
      const medios = await evaluar(`(() => {
        const malas = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && (!i.complete || i.naturalWidth === 0); }).map((i) => (i.currentSrc || i.src).split('/').pop());
        const videos = [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || v.src || '').split('/').pop(), listo: v.readyState, error: v.error ? v.error.code : 0, pausado: v.paused, muted: v.muted, loop: v.loop, controles: v.controls }));
        const fuentes = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);
        return { malas, videos, fuentes, total: document.images.length };
      })()`);
      if (medios.malas.length) caso.problemas.push(`imágenes que no cargaron: ${medios.malas.join(', ')}`);
      for (const v of medios.videos) {
        if (v.error) caso.problemas.push(`video ${v.src} con error ${v.error}`);
        else caso.notas.push(`video ${v.src}: readyState ${v.listo}, ${v.pausado ? 'pausado' : 'reproduciendo'}, mudo ${v.muted}, bucle ${v.loop}, controles ${v.controles}`);
      }
      if (medios.fuentes.length) caso.problemas.push(`fuentes con error: ${medios.fuentes.join(', ')}`);

      // 3. inventario esperado de la página (bloques nativos): encontrar menos de lo esperado —sobre todo 0 donde se espera más— es un PROBLEMA
      const esperado = INVENTARIO[slug];
      const hallado = await evaluar(`(() => ({
        acordeones: document.querySelectorAll('.wp-block-accordion').length,
        pliegues: document.querySelectorAll('.wp-block-accordion-item').length,
        formularios: document.querySelectorAll('.wp-block-contope-formulario .ofr-form, .ofr-form').length,
        mapas: document.querySelectorAll('.wp-block-contope-mapa, [data-cod-behavior="mapa"]').length,
        videos: document.querySelectorAll('video').length,
        imagenes: document.querySelectorAll('figure.wp-block-image img').length,
        tablas: document.querySelectorAll('figure.wp-block-table table').length,
        listas: document.querySelectorAll('ul.wp-block-list, ol.wp-block-list').length,
        botones: document.querySelectorAll('.wp-block-button__link').length,
        titulos: document.querySelectorAll('.wp-block-heading').length,
        buscadores: document.querySelectorAll('.wp-block-search').length,
        entradas: document.querySelectorAll('.wp-block-latest-posts').length,
        comentarios: document.querySelectorAll('.wp-block-latest-comments').length,
        separadores: document.querySelectorAll('hr.wp-block-separator').length,
      }))()`);
      for (const [clave, n] of Object.entries(esperado)) {
        if (hallado[clave] < n) caso.problemas.push(`inventario: se esperaban ${n} ${clave} y hay ${hallado[clave]}${hallado[clave] === 0 ? ' (CERO donde se espera algo)' : ''}`);
      }
      caso.notas.push('inventario: ' + Object.entries(esperado).map(([k, n]) => `${k} ${hallado[k]}/${n}`).join(', '));
      const sinBloques = await evaluar(`document.querySelectorAll('[data-cod-document-id] .wp-block-contope-lienzo, .cod-canvas--bloques').length`);
      if (!sinBloques) caso.problemas.push('la página no está dibujada por el bloque contope/lienzo (¿sigue siendo un documento Canvas?)');

      // 3b. acordeones nativos (core/accordion, Interactivity API): cada pliegue se abre y se cierra al tocarlo y, con autoclose, cierra el anterior
      const pliegues = await evaluar(`document.querySelectorAll('.wp-block-accordion-heading__toggle').length`);
      if (pliegues) {
        const estado = (n) => evaluar(`(() => { const b = document.querySelectorAll('.wp-block-accordion-heading__toggle')[${n}]; const p = document.getElementById(b.getAttribute('aria-controls')); const raiz = b.closest('.wp-block-accordion'); const rp = p.getBoundingClientRect(); const hermanos = [...raiz.querySelectorAll('.wp-block-accordion-heading__toggle')]; let auto = false; try { auto = JSON.parse(raiz.getAttribute('data-wp-context') || '{}').autoclose === true; } catch (e) { /* sin contexto */ } const i = b.querySelector('.wp-block-accordion-heading__toggle-icon'); const ri = i ? i.getBoundingClientRect() : null; return { abierto: b.getAttribute('aria-expanded') === 'true', panelVisible: rp.height > 0 && !p.hidden && getComputedStyle(p).visibility !== 'hidden', abiertosEnSuGrupo: hermanos.filter((h) => h.getAttribute('aria-expanded') === 'true').length, autoclose: auto || raiz.hasAttribute('data-autoclose'), icono: !!ri && ri.width > 0 }; })()`);
        const total = Math.min(pliegues, 8);
        const modulos = await evaluar(`!!document.querySelector('script[type=importmap]')`);
        if (!modulos) caso.problemas.push('no hay mapa de importación de módulos: la Interactivity API no puede cargar y los pliegues no responden');
        caso.notas.push(`${pliegues} pliegues`);
        for (let n = 0; n < total; n++) {
          const antes = await estado(n);
          if (antes.abierto !== (await evaluar(`document.querySelectorAll('.wp-block-accordion-heading__toggle')[${n}].closest('.wp-block-accordion-item').classList.contains('is-open')`))) caso.problemas.push(`el pliegue ${n} dice aria-expanded=${antes.abierto} pero su clase is-open no coincide`);
          let c = await centroDe('.wp-block-accordion-heading__toggle', n);
          if (!c) continue;
          if (c.h < 24) caso.problemas.push(`el pliegue ${n} mide ${Math.round(c.h)}px de alto: menos que el mínimo táctil de 24px`);
          if (!antes.icono) caso.problemas.push(`el pliegue ${n} no muestra su ícono`);
          await tocar(c.x, c.y);
          let e = await estado(n);
          if (antes.abierto) {
            if (e.abierto) caso.problemas.push(`el pliegue ${n} (abierto) no se cierra al tocarlo`);
          } else {
            if (!e.abierto || !e.panelVisible) caso.problemas.push(`el pliegue ${n} no se abre al tocarlo (abierto ${e.abierto}, panel visible ${e.panelVisible})`);
            if (e.autoclose && e.abiertosEnSuGrupo > 1) caso.problemas.push(`abrir el pliegue ${n} dejó ${e.abiertosEnSuGrupo} abiertos en su acordeón (autoclose)`);
            c = await centroDe('.wp-block-accordion-heading__toggle', n);
            await tocar(c.x, c.y);
            e = await estado(n);
            if (e.abierto) caso.problemas.push(`el pliegue ${n} no se cierra al tocarlo otra vez`);
          }
        }
      }

      // 4. botones fijos
      const fijos = await evaluar(`(() => [...document.querySelectorAll('a, button')].filter((e) => getComputedStyle(e).position === 'fixed').map((e) => { const r = e.getBoundingClientRect(); return { clase: String(e.className).split(/\\s+/).slice(0, 2).join('.'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), href: (e.getAttribute('href') || '').slice(0, 40), dentro: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight }; }))()`);
      for (const f of fijos.filter((x) => !/cookie/i.test(x.clase))) {
        if (!f.dentro) caso.problemas.push(`el botón fijo ${f.clase} queda fuera de la pantalla (${f.x},${f.y} ${f.w}×${f.h})`);
        if (f.w < 44 || f.h < 44) caso.problemas.push(`el botón fijo ${f.clase} mide ${f.w}×${f.h}: menos que un dedo`);
        caso.notas.push(`botón fijo ${f.clase} ${f.w}×${f.h} en ${f.x},${f.y} → ${f.href}`);
      }

      // 5. formulario
      const form = await evaluar(`(() => { const f = document.querySelector('.ofr-form'); if (!f) return null; const campos = [...f.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(.ofr-hp), textarea')].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), dentro: r.left >= -1 && r.right <= innerWidth + 1, visible: r.width > 0 && r.height > 0 }; }); return { n: campos.length, desbordan: campos.filter((c) => !c.dentro || !c.visible).length, minAlto: Math.min(...campos.map((c) => c.h)) }; })()`);
      if (form) {
        if (form.desbordan) caso.problemas.push(`${form.desbordan} campo(s) del formulario se salen del ancho o no se ven`);
        if (form.minAlto < 36) caso.problemas.push(`un campo del formulario mide ${form.minAlto}px de alto`);
        const c = await centroDe('.ofr-form input[type=text]', 0);
        if (c) {
          await tocar(c.x, c.y);
          await cdp('Input.insertText', { text: 'prueba' });
          const v = await evaluar(`document.querySelector('.ofr-form input[type=text]').value`);
          if (v !== 'prueba') caso.problemas.push(`no se puede escribir en el primer campo (quedó «${v}»)`);
          await evaluar(`(() => { const e = document.querySelector('.ofr-form input[type=text]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        }
        caso.notas.push(`formulario: ${form.n} campos`);
      }

      // 5b. bloques nativos de WordPress (buscador, entradas y comentarios recientes): dibujados, dentro del ancho, y el buscador escribe y apunta al sitio
      const bloques = await evaluar(`(() => ['.wp-block-search', '.wp-block-latest-posts', '.wp-block-latest-comments'].flatMap((sel) => [...document.querySelectorAll(sel)].map((b) => { const r = b.getBoundingClientRect(); const f = b.querySelector('form[role=search]') || (b.matches('form') ? b : null); const i = b.querySelector('input[type=search]'); const bt = b.querySelector('button'); const ri = i && i.getBoundingClientRect(); const rb = bt && bt.getBoundingClientRect(); return { nombre: sel.replace('.wp-block-', 'core/'), vacio: b.textContent.trim() === '' && !i, w: Math.round(r.width), h: Math.round(r.height), dentro: r.left >= -1 && r.right <= innerWidth + 1, busca: i ? { accion: (f && f.getAttribute('action')) || '', campo: i.getAttribute('name'), campoVisible: !!ri && ri.width > 40 && ri.height > 24, botonVisible: !!rb && rb.width > 20 && rb.height > 20, botonDentro: !!rb && rb.right <= innerWidth + 1 } : null, enlaces: [...b.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter(Boolean).length }; })))()`);
      for (const b of bloques) {
        if (b.vacio) caso.problemas.push(`el bloque ${b.nombre} salió vacío (WordPress no lo dibujó)`);
        if (!b.dentro) caso.problemas.push(`el bloque ${b.nombre} se sale de la pantalla`);
        if (b.busca) {
          if (b.busca.campo !== 's') caso.problemas.push('el buscador no envía el campo «s» de WordPress');
          if (!b.busca.campoVisible || !b.busca.botonVisible || !b.busca.botonDentro) caso.problemas.push('el buscador no se ve completo (campo o botón)');
          const c = await centroDe('.wp-block-search input[type=search]', 0);
          if (c) {
            await tocar(c.x, c.y);
            await cdp('Input.insertText', { text: 'bodega' });
            const v = await evaluar(`document.querySelector('.wp-block-search input[type=search]').value`);
            if (v !== 'bodega') caso.problemas.push(`no se puede escribir en el buscador (quedó «${v}»)`);
            await evaluar(`document.querySelector('.wp-block-search input[type=search]').value = ''`);
          }
        }
        caso.notas.push(`bloque ${b.nombre}: ${b.w}×${b.h}, ${b.enlaces} enlace(s)${b.busca ? ', buscador con acción ' + b.busca.accion : ''}`);
      }

      // 6. encabezado pegajoso
      await evaluar('scrollTo(0, 800)'); await dormir(500);
      const cab = await evaluar(`(() => { const h = document.querySelector('header'); if (!h) return null; const r = h.getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), pos: getComputedStyle(h).position }; })()`);
      if (cab && Math.abs(cab.y) > 1 && cab.pos !== 'static') caso.problemas.push(`el encabezado no queda pegado arriba al bajar (y=${cab.y})`);
      if (cab && cab.h > 120) caso.problemas.push(`el encabezado pegado mide ${cab.h}px: tapa demasiado`);
      if (cab) caso.notas.push(`encabezado: ${cab.pos}, ${cab.h}px de alto, y=${cab.y} tras bajar 800px`);

      // 7. consola
      const reales = consola.filter((c) => !/Failed to load resource|favicon|Mapbox|mapbox|CORS|net::ERR/i.test(c));
      if (reales.length) caso.problemas.push(`errores en la consola: ${reales.slice(0, 3).join(' | ')}`);
      if (red.length) caso.notas.push(`peticiones fallidas: ${red.length}`);
    } catch (e) {
      caso.problemas.push('la auditoría se cortó: ' + e.message);
    } finally { await cerrar(); }
    fallas += caso.problemas.length;
    resultados.push(caso);
    console.log(`${caso.problemas.length ? 'FALLA' : 'ok   '} ${slug} @${ancho}${caso.problemas.length ? '\n   - ' + caso.problemas.join('\n   - ') : ''}`);
  }
}
writeFileSync(path.join(SAL, 'auditoria-sitio.json'), JSON.stringify(resultados, null, 2));
console.log(fallas ? `\n${fallas} problema(s) (ver auditoria-sitio.json)` : '\nsin problemas');
process.exit(fallas ? 1 : 0);
