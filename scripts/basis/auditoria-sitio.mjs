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
 *   - los errores de la consola.
 * Sólo lee el sitio local y no envía el formulario.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const SITIO = (process.argv[2] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = process.argv[3] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
mkdirSync(SAL, { recursive: true });
const PAGINAS = [['inicio', '/'], ['basis-carpas-industriales', '/basis-carpas-industriales/'], ['preguntas-frecuentes', '/preguntas-frecuentes/'], ['contactos', '/contactos/'], ['terminos-y-privacidad', '/terminos-y-privacidad/']];
const resultados = [];
let fallas = 0;

for (const ancho of [1440, 768, 393]) {
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

      // 3. acordeones (cada grupo es un acordeón aparte: la página de preguntas tiene dos columnas, cada una con el suyo)
      const pliegues = await evaluar(`document.querySelectorAll('[data-cod-acordeon-rol="resumen"]').length`);
      if (pliegues) {
        const estado = (n) => evaluar(`(() => { const b = document.querySelectorAll('[data-cod-acordeon-rol="resumen"]')[${n}]; const p = document.getElementById(b.getAttribute('aria-controls')); const raiz = b.closest('[data-cod-behavior="acordeon"]'); const i = b.querySelector('[data-cod-acordeon-rol="icono"]'); const ri = i ? getComputedStyle(i) : null; const rp = p.getBoundingClientRect(); const hermanos = [...raiz.querySelectorAll('[data-cod-acordeon-rol="resumen"]')]; return { abierto: b.getAttribute('aria-expanded') === 'true', panelVisible: rp.height > 0 && getComputedStyle(p).display !== 'none', abiertosEnSuGrupo: hermanos.filter((h) => h.getAttribute('aria-expanded') === 'true').length, icono: i ? { estado: i.getAttribute('data-cod-acordeon-estado'), visible: ri.visibility !== 'hidden' && i.getBoundingClientRect().width > 0 } : null }; })()`);
        const total = Math.min(pliegues, 8);
        caso.notas.push(`${pliegues} pliegues`);
        let iconosAbiertoVisibles = 0; let iconosCerradoVisibles = 0;
        for (let n = 0; n < total; n++) {
          const antes = await estado(n);
          let c = await centroDe('[data-cod-acordeon-rol="resumen"]', n);
          if (!c) continue;
          if (c.h < 24) caso.problemas.push(`el pliegue ${n} mide ${Math.round(c.h)}px de alto: menos que el mínimo táctil de 24px`);
          await tocar(c.x, c.y);
          let e = await estado(n);
          if (antes.abierto) {
            // ya estaba abierto: tocarlo lo cierra
            if (e.abierto) caso.problemas.push(`el pliegue ${n} (abierto) no se cierra al tocarlo`);
          } else {
            if (!e.abierto || !e.panelVisible) caso.problemas.push(`el pliegue ${n} no se abre al tocarlo (abierto ${e.abierto}, panel visible ${e.panelVisible})`);
            if (e.abiertosEnSuGrupo > 1) caso.problemas.push(`abrir el pliegue ${n} dejó ${e.abiertosEnSuGrupo} abiertos en su acordeón (debe cerrar el anterior)`);
            if (e.icono && e.icono.visible) iconosAbiertoVisibles++;
            c = await centroDe('[data-cod-acordeon-rol="resumen"]', n);
            await tocar(c.x, c.y);
            e = await estado(n);
            if (e.abierto) caso.problemas.push(`el pliegue ${n} no se cierra al tocarlo otra vez`);
            if (e.icono && e.icono.visible) iconosCerradoVisibles++;
          }
        }
        caso.notas.push(`ícono: visible en ${iconosCerradoVisibles} pliegue(s) cerrado(s) y en ${iconosAbiertoVisibles} abierto(s) (el original lo esconde abierto)`);
        if (iconosAbiertoVisibles) caso.problemas.push(`el ícono sigue visible en ${iconosAbiertoVisibles} pliegue(s) abierto(s)`);
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
