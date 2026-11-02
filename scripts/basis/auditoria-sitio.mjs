/**
 * Auditoría de comportamiento del sitio local de Basis, en escritorio, tablet y CELULAR de verdad (con el
 * agente y el toque de un teléfono). Referencia: scripts/santaluisa/auditoria-sitio.cjs (carruseles, acordeones,
 * lightbox, imágenes y videos) adaptada a lo que Basis tiene: acordeones de preguntas, un video de fondo, el botón
 * fijo de WhatsApp y el de ayuda, el formulario y el encabezado pegajoso.
 *
 *   node auditoria-sitio.mjs [SITIO] [carpeta-salida] [opciones]
 *
 * P0.2 y P0.3 de docs/ESPEC-adn-unica-puerta-y-bloques.md (H12: antes esta auditoría quedaba verde sin probar):
 *   - INVENTARIO (--inventario <archivo>, por omisión inventario-esperado.json junto al guion): dice, por página, cuántos
 *     acordeones, pliegues, formularios, mapas, galerías, bloques nativos... se ESPERAN. Lo hallado debe ser EXACTAMENTE eso:
 *     0 donde se espera más de 0 es FALLO («CERO donde se espera algo»), y más o menos de lo esperado también. Lo que el
 *     archivo no menciona se espera en 0. Una página que no está en el archivo, o una clave que el guion no conoce, es
 *     error de configuración (código 2).
 *   - Se cuentan los bloques PROPIOS (data-cod-*, contope/*, .ofr-form) y los NATIVOS de WordPress (.wp-block-accordion*,
 *     .wp-block-search, .wp-block-tabs*, .wp-block-details, .wp-block-gallery...).
 *   - Pruebas FUNCIONALES, no sólo de presencia: cada pliegue se abre y se cierra pinchándolo (y el panel se ve), el buscador
 *     busca (la URL llega a ?s=… y WordPress responde 200), las pestañas cambian de panel, los <details> se abren y el
 *     formulario se ENVÍA (envío de prueba, sólo en un sitio local) y muestra su agradecimiento. Si el inventario espera algo y
 *     su prueba funcional no llegó a correr, es FALLO (no hay saltos silenciosos).
 *
 * Por página y ancho comprueba además:
 *   - que la página no se desborde de costado (scrollWidth ≤ ancho);
 *   - que ninguna imagen, video o fuente falle (y que cada <img> visible tenga caja y dibujo);
 *   - los botones fijos: dentro de la pantalla, del tamaño de un dedo (≥ 44 px) y sin tapar el contenido principal;
 *   - el encabezado: pegado arriba y sin cubrir el título al bajar;
 *   - los errores de la consola;
 *   - que el SET DE DISEÑO gobierne el sitio (gobierno-del-set.mjs, por HTTP, una vez por página): sin colores ni
 *     font-family literales en la hoja del diseño, núcleo del set sin roles «sin declarar», variables de las
 *     definiciones de estilo emitidas y favicon que sale de las definiciones. Cada una cuenta como PROBLEMA.
 *     (con AUTH_FILE también le pregunta al plugin por `COD_Design_Core::faltantes()`)
 *
 * Opciones:
 *   --inventario <archivo>   inventario esperado (ver arriba)
 *   --paginas a,b            sólo esas páginas (por defecto las cinco)
 *   --anchos 1440,393        sólo esos anchos (por defecto 1440, 768 y 393)
 *   --solo-gobierno          sólo la comprobación del set de diseño
 *   --sin-gobierno           omite la del set de diseño (para controles; queda anotado en la salida)
 *   --sin-envio              no envía el formulario de prueba (queda anotado como SALTADO; si el inventario espera un
 *                            formulario, el envío no corrido cuenta igual como problema salvo que se pida esta opción)
 *   --control acordeon-roto  CONTROL: rompe a propósito el panel de cada acordeón; la apertura DEBE fallar
 *
 * Termina con código 1 si hay problemas y con 2 si la configuración está mal. Sólo lee el sitio local; el único envío
 * es el del formulario de prueba, y sólo si el sitio es localhost.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';
import { auditarGobierno } from './gobierno-del-set.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const banderas = new Map();
const posicionales = [];
{
  const a = process.argv.slice(2);
  const conValor = new Set(['inventario', 'paginas', 'anchos', 'control']);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) { const k = a[i].slice(2); banderas.set(k, conValor.has(k) ? a[++i] : 'si'); } else posicionales.push(a[i]);
  }
}
const abortar = (msg) => { console.error('ERROR DE CONFIGURACIÓN: ' + msg); process.exit(2); };
const SOLO_GOBIERNO = banderas.has('solo-gobierno');
const SIN_GOBIERNO = banderas.has('sin-gobierno');
const SIN_ENVIO = banderas.has('sin-envio');
const CONTROL = banderas.get('control') || '';
if (CONTROL && CONTROL !== 'acordeon-roto') abortar(`el control «${CONTROL}» no existe (hay: acordeon-roto)`);
const SITIO = (posicionales[0] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = posicionales[1] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
const ES_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITIO);
mkdirSync(SAL, { recursive: true });
const TODAS = [['inicio', '/'], ['basis-carpas-industriales', '/basis-carpas-industriales/'], ['preguntas-frecuentes', '/preguntas-frecuentes/'], ['contactos', '/contactos/'], ['terminos-y-privacidad', '/terminos-y-privacidad/']];
const pedidas = banderas.get('paginas') ? banderas.get('paginas').split(',') : TODAS.map((p) => p[0]);
for (const c of pedidas) if (!TODAS.some((p) => p[0] === c)) abortar(`la página «${c}» no existe (${TODAS.map((p) => p[0]).join(', ')})`);
const PAGINAS = TODAS.filter((p) => pedidas.includes(p[0]));
const ANCHOS = banderas.get('anchos') ? banderas.get('anchos').split(',').map(Number) : [1440, 768, 393];

/*
 * Lo que cada página DEBE tener: el archivo de inventario (escrito a mano a propósito, contado en las composiciones de
 * origen salida/*.componer.json: si lo leyera de lo que el guion de bloques genera, un guion que perdiera un acordeón perdería
 * también la expectativa). EXACTO: más, menos o cero donde se espera algo es un PROBLEMA.
 */
const CLAVES = {
  // bloques de interacción, propios y nativos
  acordeones: ['.wp-block-accordion', '[data-cod-acordeon]'],
  pliegues: ['.wp-block-accordion-item', '[data-cod-acordeon-rol="resumen"]'],
  pestanas: ['.wp-block-tabs', '[data-cod-behavior="pestanas"]'],
  detalles: ['details.wp-block-details'],
  formularios: ['.ofr-form'],
  mapas: ['.wp-block-contope-mapa', '[data-cod-behavior="mapa"]'],
  galerias: ['.wp-block-gallery', '[data-cod-behavior="lightbox"]', '[data-cod-behavior="carousel-basic"]', '.cod-mcp-gallery'],
  buscadores: ['.wp-block-search'],
  entradas: ['.wp-block-latest-posts'],
  comentarios: ['.wp-block-latest-comments'],
  // contenido
  videos: ['video'],
  imagenes: ['figure.wp-block-image img'],
  iconos: ['.wp-block-icon svg'],
  tablas: ['figure.wp-block-table table'],
  listas: ['ul.wp-block-list', 'ol.wp-block-list'],
  botones: ['.wp-block-button__link'],
  titulos: ['.wp-block-heading'],
  separadores: ['hr.wp-block-separator'],
};
const INV_RUTA = banderas.get('inventario') || path.join(aqui, 'inventario-esperado.json');
if (!existsSync(INV_RUTA)) abortar(`no existe el inventario ${INV_RUTA} (se pasa con --inventario <archivo>)`);
const INV = JSON.parse(readFileSync(INV_RUTA, 'utf8')).paginas || abortar(`${INV_RUTA} no tiene la clave «paginas»`);
for (const [slug] of PAGINAS) {
  if (!INV[slug]) abortar(`la página «${slug}» no está en el inventario ${INV_RUTA}`);
  for (const k of Object.keys(INV[slug])) {
    if (k.startsWith('_')) continue;
    if (!(k in CLAVES)) abortar(`el inventario de «${slug}» usa la clave «${k}», que el guion no conoce (${Object.keys(CLAVES).join(', ')})`);
    if (!Number.isInteger(INV[slug][k]) || INV[slug][k] < 0) abortar(`el inventario de «${slug}.${k}» no es un entero ≥ 0`);
  }
}
if (!ES_LOCAL && !SIN_ENVIO && !SOLO_GOBIERNO) abortar(`${SITIO} no es un sitio local: el envío de prueba del formulario sólo se hace en localhost. Para auditar otro sitio se pasa --sin-envio (y queda anotado como SALTADO).`);
const resultados = [];
let fallas = 0;
let envioHecho = false; // el formulario se envía UNA vez por corrida (un envío por ancho ensuciaría la base local con tres filas)

// El set gobierna el sitio: una vez por página (no depende del ancho). Cada hallazgo es un PROBLEMA, no un aviso.
if (SIN_GOBIERNO) {
  console.log('   (SALTADO por --sin-gobierno: el gobierno del set de diseño no se comprobó en esta corrida)');
} else {
  const gobierno = await auditarGobierno({ sitio: SITIO, rutas: PAGINAS.map((p) => p[1]) });
  for (const g of gobierno) {
    const slug = PAGINAS.find((p) => p[1] === g.ruta)?.[0] || g.ruta;
    fallas += g.problemas.length;
    resultados.push({ pagina: slug, ancho: 'gobierno', problemas: g.problemas, notas: g.notas });
    console.log(`${g.problemas.length ? 'FALLA' : 'ok   '} ${slug} @gobierno-del-set${g.problemas.length ? '\n   - ' + g.problemas.join('\n   - ') : ''}`);
  }
  if (gobierno.nota) console.log(`   (${gobierno.nota})`);
}

for (const ancho of SOLO_GOBIERNO ? [] : ANCHOS) {
  const movil = ancho < 768;
  for (const [slug, ruta] of PAGINAS) {
    const { cdp, evaluar, dormir, cerrar, alEvento } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: movil ? 2 : 1, movil });
    const consola = []; const red = []; const envios = [];
    alEvento((m, p) => {
      if (m === 'Runtime.exceptionThrown') consola.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'excepción');
      if (m === 'Runtime.consoleAPICalled' && p.type === 'error') consola.push((p.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 200));
      if (m === 'Network.loadingFailed' && !/cookieadmin|googletagmanager|google-analytics|favicon/.test(p.requestId + (p.errorText || ''))) red.push(p.errorText);
      if (m === 'Network.responseReceived' && /\/orugantt-forms\/v1\/submissions/.test(p.response.url)) envios.push(p.response.status);
    });
    const caso = { pagina: slug, ancho, problemas: [], notas: [] };
    // Qué pruebas funcionales llegaron a correr (para que «esperado > 0» sin prueba sea fallo y no un salto silencioso)
    const ejec = { pliegues: 0, buscadores: 0, pestanas: 0, detalles: 0, formularios: 0 };
    try {
      await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp('Page.navigate', { url: SITIO + ruta });
      await dormir(2500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar, 0.6); await dormir(1500);
      await evaluar('scrollTo(0, 0)'); await dormir(300);
      if (CONTROL === 'acordeon-roto') {
        // CONTROL (P0.3): el panel de cada acordeón queda roto (no se dibuja); abrir un pliegue DEBE fallar.
        await evaluar(`(() => { const s = document.createElement('style'); s.textContent = '.wp-block-accordion-panel, [data-cod-acordeon-rol="panel"] { display: none !important; }'; document.head.appendChild(s); })()`);
        caso.notas.push('CONTROL acordeon-roto: panel de los acordeones escondido a propósito');
      }

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

      // 3. inventario (P0.2): lo hallado debe ser EXACTAMENTE lo esperado. Lo que el archivo no menciona se espera en 0.
      const esperado = Object.fromEntries(Object.keys(CLAVES).map((k) => [k, INV[slug][k] ?? 0]));
      const hallado = await evaluar(`(() => { const C = ${JSON.stringify(CLAVES)}; return Object.fromEntries(Object.entries(C).map(([k, sels]) => [k, document.querySelectorAll(sels.join(',')).length])); })()`);
      for (const [clave, n] of Object.entries(esperado)) {
        if (hallado[clave] === n) continue;
        const cero = hallado[clave] === 0 && n > 0;
        caso.problemas.push(`inventario: se esperaban ${n} ${clave} y hay ${hallado[clave]}${cero ? ' (CERO donde se espera algo)' : ''}`);
      }
      caso.notas.push('inventario (hallado/esperado): ' + Object.keys(CLAVES).filter((k) => hallado[k] || esperado[k]).map((k) => `${k} ${hallado[k]}/${esperado[k]}`).join(', '));
      const sinBloques = await evaluar(`document.querySelectorAll('[data-cod-document-id] .wp-block-contope-lienzo, .cod-canvas--bloques').length`);
      if (!sinBloques) caso.problemas.push('la página no está dibujada por el bloque contope/lienzo (¿sigue siendo un documento Canvas?)');

      // 3b. acordeones nativos (core/accordion, Interactivity API): cada pliegue se abre y se cierra al tocarlo y, con autoclose, cierra el anterior
      const pliegues = await evaluar(`document.querySelectorAll('.wp-block-accordion-heading__toggle').length`);
      if (pliegues) {
        const estado = (n) => evaluar(`(() => { const b = document.querySelectorAll('.wp-block-accordion-heading__toggle')[${n}]; const p = document.getElementById(b.getAttribute('aria-controls')); const raiz = b.closest('.wp-block-accordion'); const rp = p.getBoundingClientRect(); const hermanos = [...raiz.querySelectorAll('.wp-block-accordion-heading__toggle')]; let auto = false; try { auto = JSON.parse(raiz.getAttribute('data-wp-context') || '{}').autoclose === true; } catch (e) { /* sin contexto */ } const i = b.querySelector('.wp-block-accordion-heading__toggle-icon'); const ri = i ? i.getBoundingClientRect() : null; return { abierto: b.getAttribute('aria-expanded') === 'true', panelVisible: rp.height > 0 && !p.hidden && getComputedStyle(p).visibility !== 'hidden' && getComputedStyle(p).display !== 'none', abiertosEnSuGrupo: hermanos.filter((h) => h.getAttribute('aria-expanded') === 'true').length, autoclose: auto || raiz.hasAttribute('data-autoclose'), icono: !!ri && ri.width > 0 }; })()`);
        const total = Math.min(pliegues, 8);
        const modulos = await evaluar(`!!document.querySelector('script[type=importmap]')`);
        if (!modulos) caso.problemas.push('no hay mapa de importación de módulos: la Interactivity API no puede cargar y los pliegues no responden');
        caso.notas.push(`${pliegues} pliegues`);
        for (let n = 0; n < total; n++) {
          const antes = await estado(n);
          if (antes.abierto !== (await evaluar(`document.querySelectorAll('.wp-block-accordion-heading__toggle')[${n}].closest('.wp-block-accordion-item').classList.contains('is-open')`))) caso.problemas.push(`el pliegue ${n} dice aria-expanded=${antes.abierto} pero su clase is-open no coincide`);
          if (antes.abierto && !antes.panelVisible) caso.problemas.push(`el pliegue ${n} está marcado como abierto pero su panel no se ve`);
          let c = await centroDe('.wp-block-accordion-heading__toggle', n);
          if (!c) continue;
          if (c.h < 24) caso.problemas.push(`el pliegue ${n} mide ${Math.round(c.h)}px de alto: menos que el mínimo táctil de 24px`);
          const iconoEscondidoAlAbrir = antes.abierto && await evaluar(`/-ninguno-/.test(document.querySelectorAll('.wp-block-accordion-heading__toggle')[${n}].closest('.wp-block-accordion-item').className)`);
          if (!antes.icono && !iconoEscondidoAlAbrir) caso.problemas.push(`el pliegue ${n} no muestra su ícono`);
          if (antes.icono && iconoEscondidoAlAbrir) caso.problemas.push(`el pliegue ${n} está abierto y su estilo dice «sin ícono al abrir», pero lo muestra`);
          await tocar(c.x, c.y);
          let e = await estado(n);
          ejec.pliegues += 1;
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

      // 3c. pestañas nativas (core/tabs): cada pestaña, al tocarla, queda seleccionada y su panel se ve
      const nPest = await evaluar(`document.querySelectorAll('.wp-block-tabs [role=tab]').length`);
      if (nPest) {
        const quedoBien = (n) => evaluar(`(() => { const t = document.querySelectorAll('.wp-block-tabs [role=tab]')[${n}]; const p = document.getElementById(t.getAttribute('aria-controls')); const r = p && p.getBoundingClientRect(); return { sel: t.getAttribute('aria-selected') === 'true', panel: !!p && r.height > 0 && !p.hidden && getComputedStyle(p).display !== 'none' }; })()`);
        for (let n = 0; n < Math.min(nPest, 8); n++) {
          const c = await centroDe('.wp-block-tabs [role=tab]', n);
          if (!c) continue;
          await tocar(c.x, c.y);
          const e = await quedoBien(n);
          ejec.pestanas += 1;
          if (!e.sel || !e.panel) caso.problemas.push(`la pestaña ${n} no se activa al tocarla (seleccionada ${e.sel}, panel visible ${e.panel})`);
        }
      }

      // 3d. <details> nativos (core/details): el resumen abre y cierra
      const nDet = await evaluar(`document.querySelectorAll('details.wp-block-details').length`);
      for (let n = 0; n < Math.min(nDet, 8); n++) {
        const antes = await evaluar(`document.querySelectorAll('details.wp-block-details')[${n}].open`);
        const c = await centroDe('details.wp-block-details > summary', n);
        if (!c) continue;
        await tocar(c.x, c.y);
        const despues = await evaluar(`document.querySelectorAll('details.wp-block-details')[${n}].open`);
        ejec.detalles += 1;
        if (despues === antes) caso.problemas.push(`el bloque details ${n} no cambia de estado al tocar su resumen`);
      }

      // 4. botones fijos
      const fijos = await evaluar(`(() => [...document.querySelectorAll('a, button')].filter((e) => getComputedStyle(e).position === 'fixed').map((e) => { const r = e.getBoundingClientRect(); return { clase: String(e.className).split(/\\s+/).slice(0, 2).join('.'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), href: (e.getAttribute('href') || '').slice(0, 40), dentro: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight }; }))()`);
      for (const f of fijos.filter((x) => !/cookie/i.test(x.clase))) {
        if (!f.dentro) caso.problemas.push(`el botón fijo ${f.clase} queda fuera de la pantalla (${f.x},${f.y} ${f.w}×${f.h})`);
        if (f.w < 44 || f.h < 44) caso.problemas.push(`el botón fijo ${f.clase} mide ${f.w}×${f.h}: menos que un dedo`);
        caso.notas.push(`botón fijo ${f.clase} ${f.w}×${f.h} en ${f.x},${f.y} → ${f.href}`);
      }

      // 5. formulario: caben en el ancho, se ven, se puede escribir; y UNA vez por corrida se ENVÍA de verdad (envío de prueba, sólo en local)
      const form = await evaluar(`(() => { const f = document.querySelector('.ofr-form'); if (!f) return null; const campos = [...f.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(.ofr-hp), textarea')].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), dentro: r.left >= -1 && r.right <= innerWidth + 1, visible: r.width > 0 && r.height > 0 }; }); return { n: campos.length, desbordan: campos.filter((c) => !c.dentro || !c.visible).length, minAlto: Math.min(...campos.map((c) => c.h)) }; })()`);
      if (form) {
        if (form.desbordan) caso.problemas.push(`${form.desbordan} campo(s) del formulario se salen del ancho o no se ven`);
        if (form.minAlto < 36) caso.problemas.push(`un campo del formulario mide ${form.minAlto}px de alto`);
        const escribir = async (selector, texto) => {
          const c = await centroDe(selector, 0);
          if (!c) return false;
          await tocar(c.x, c.y);
          await cdp('Input.insertText', { text: texto });
          return true;
        };
        const valorDe = (selector) => evaluar(`(document.querySelector(${JSON.stringify(selector)}) || {}).value`);
        if (SIN_ENVIO || envioHecho) {
          if (!await escribir('.ofr-form input[type=text]', 'prueba')) caso.problemas.push('no se pudo tocar el primer campo del formulario');
          const v = await valorDe('.ofr-form input[type=text]');
          if (v !== 'prueba') caso.problemas.push(`no se puede escribir en el primer campo (quedó «${v}»)`);
          await evaluar(`(() => { const e = document.querySelector('.ofr-form input[type=text]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
          ejec.formularios += 1;
          if (SIN_ENVIO) caso.notas.push('envío del formulario: SALTADO por --sin-envio');
        } else {
          const datos = [['#ofr-nombre', 'Prueba'], ['#ofr-apellidos', 'Auditoria'], ['#ofr-correo', 'prueba-auditoria@example.invalid'], ['#ofr-correo_repite', 'prueba-auditoria@example.invalid'], ['#ofr-mensaje', 'Envío de prueba de la auditoría del sitio local (auditoria-sitio.mjs). Se puede borrar.']];
          for (const [sel, texto] of datos) {
            if (!await escribir(sel, texto)) { caso.problemas.push(`el formulario no tiene el campo ${sel}: no se pudo hacer el envío de prueba`); continue; }
            const v = await valorDe(sel);
            if (v !== texto) caso.problemas.push(`no se puede escribir en ${sel} (quedó «${v}»)`);
          }
          const b = await centroDe('.ofr-submit', 0);
          if (!b) caso.problemas.push('el formulario no tiene botón de envío (.ofr-submit)');
          else {
            await tocar(b.x, b.y); await dormir(3500);
            envioHecho = true; ejec.formularios += 1;
            const gracias = await evaluar(`(() => { const g = document.querySelector('.ofr-thankyou'); if (!g) return null; const r = g.getBoundingClientRect(); return { visible: r.width > 0 && r.height > 0, texto: g.textContent.trim().slice(0, 80) }; })()`);
            if (!envios.length) caso.problemas.push('el envío de prueba no llegó al servidor (ninguna petición a /orugantt-forms/v1/submissions)');
            else if (!envios.every((s) => s >= 200 && s < 300)) caso.problemas.push(`el servidor rechazó el envío de prueba (HTTP ${envios.join(', ')})`);
            if (!gracias || !gracias.visible) caso.problemas.push('tras el envío de prueba el formulario no muestra su agradecimiento (.ofr-thankyou)');
            caso.notas.push(`envío de prueba: HTTP ${envios.join(',') || '—'}, agradecimiento «${gracias ? gracias.texto : 'no aparece'}»`);
          }
        }
        caso.notas.push(`formulario: ${form.n} campos`);
      }

      // 5b. bloques nativos de WordPress (buscador, entradas y comentarios recientes): dibujados, dentro del ancho, y el buscador escribe y apunta al sitio
      const bloques = await evaluar(`(() => ['.wp-block-search', '.wp-block-latest-posts', '.wp-block-latest-comments'].flatMap((sel) => [...document.querySelectorAll(sel)].map((b) => { const r = b.getBoundingClientRect(); const f = b.querySelector('form[role=search]') || (b.matches('form') ? b : null); const i = b.querySelector('input[type=search]'); const bt = b.querySelector('button'); const ri = i && i.getBoundingClientRect(); const rb = bt && bt.getBoundingClientRect(); return { nombre: sel.replace('.wp-block-', 'core/'), vacio: b.textContent.trim() === '' && !i, w: Math.round(r.width), h: Math.round(r.height), dentro: r.left >= -1 && r.right <= innerWidth + 1, busca: i ? { accion: (f && f.getAttribute('action')) || '', campo: i.getAttribute('name'), campoVisible: !!ri && ri.width > 40 && ri.height > 24, botonVisible: !!rb && rb.width > 20 && rb.height > 20, botonDentro: !!rb && rb.right <= innerWidth + 1 } : null, enlaces: [...b.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter(Boolean).length }; })))()`);
      let buscar = false;
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
            else buscar = true;
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

      // 8. el buscador BUSCA: se manda la consulta escrita y WordPress responde con la página de resultados (al final: navega y deja la página)
      if (buscar) {
        const c = await centroDe('.wp-block-search button, .wp-block-search input[type=submit]', 0);
        if (c) {
          await tocar(c.x, c.y); await dormir(2500);
          const r = await evaluar(`({ url: location.search, estado: (performance.getEntriesByType('navigation')[0] || {}).responseStatus, texto: document.body.innerText.toLowerCase().includes('bodega') })`);
          ejec.buscadores += 1;
          if (!/[?&]s=bodega/.test(r.url)) caso.problemas.push(`el buscador no navegó a ?s=bodega (quedó en «${r.url}»)`);
          else if (r.estado !== 200) caso.problemas.push(`la búsqueda ?s=bodega respondió HTTP ${r.estado}`);
          else if (!r.texto) caso.problemas.push('la página de resultados de ?s=bodega no menciona lo buscado');
          caso.notas.push(`búsqueda de prueba: ${r.url} → HTTP ${r.estado}`);
        } else caso.problemas.push('el buscador no tiene botón de búsqueda que se pueda tocar');
      }

      // 9. SIN SALTOS SILENCIOSOS: lo que el inventario espera, su prueba funcional tuvo que correr
      const exigidas = [['pliegues', Math.min(esperado.pliegues, 8), 'abrir y cerrar cada pliegue'], ['buscadores', esperado.buscadores, 'buscar con el buscador'], ['pestanas', Math.min(esperado.pestanas, 8), 'activar cada pestaña'], ['detalles', Math.min(esperado.detalles, 8), 'abrir cada details'], ['formularios', esperado.formularios, 'escribir en el formulario']];
      for (const [k, n, que] of exigidas) if (n > 0 && ejec[k] < n) caso.problemas.push(`prueba funcional no corrida: se esperaban ${n} (${que}) y sólo se hicieron ${ejec[k]}`);
      caso.notas.push('pruebas funcionales hechas: ' + Object.entries(ejec).map(([k, n]) => `${k} ${n}`).join(', '));
    } catch (e) {
      caso.problemas.push('la auditoría se cortó: ' + e.message);
    } finally { await cerrar(); }
    fallas += caso.problemas.length;
    resultados.push(caso);
    console.log(`${caso.problemas.length ? 'FALLA' : 'ok   '} ${slug} @${ancho}${caso.problemas.length ? '\n   - ' + caso.problemas.join('\n   - ') : ''}`);
  }
}
if (!SOLO_GOBIERNO && !SIN_ENVIO && !envioHecho && PAGINAS.some(([slug]) => (INV[slug].formularios ?? 0) > 0)) {
  fallas += 1;
  console.log('FALLA el inventario espera un formulario y el envío de prueba nunca se hizo');
  resultados.push({ pagina: '*', ancho: 'envío', problemas: ['el envío de prueba del formulario nunca se hizo'], notas: [] });
}
writeFileSync(path.join(SAL, 'auditoria-sitio.json'), JSON.stringify(resultados, null, 2));
console.log(fallas ? `\n${fallas} problema(s) (ver auditoria-sitio.json)` : '\nsin problemas');
process.exit(fallas ? 1 : 0);
