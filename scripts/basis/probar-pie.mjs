/**
 * Prueba en el navegador (Chrome sin ventana, con el celular emulado) que el PIE de Basis cumple lo que se pidió:
 *
 *   1. Márgenes: a 375 px el contenido del pie queda a 24 px de cada borde (la fila y la línea legal).
 *   2. Línea legal: «Términos y privacidad» lleva a /terminos-y-privacidad/ y «Preferencias de cookies» tiene la conducta
 *      `preferencias-cookies` (con la misma dirección de respaldo).
 *   3. Con el banner de cookies RECHAZADO, pinchar «Preferencias de cookies» abre el panel de CookieAdmin.
 *   4. El mapa abierto mide el ancho del contenido (375 − 48 = 327).
 *   5. Alineación de celular: nada a la derecha del pie ni texto centrado; interlineado de celular.
 *
 *   node scripts/basis/probar-pie.mjs            (SITIO=http://localhost:8894 por omisión; sólo lee el sitio local)
 */
import { abrirChrome, esperarLaPagina } from '../piezas/chrome.mjs';

const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const ANCHO = 375;
let malas = 0;
const ok = (cond, que, dato = '') => { console.log(`${cond ? 'ok   ' : 'FALLA'}  ${que}${dato ? '  → ' + dato : ''}`); if (!cond) malas++; };
const PIE = "document.querySelector('footer.cod-canvas-region-footer')";

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 812, escala: 2, movil: true });
try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: SITIO + '/' });
  await dormir(3500); await esperarLaPagina(evaluar);
  await evaluar(`${PIE}.scrollIntoView({block:'end'})`);
  await dormir(500);

  const medidas = JSON.parse(await evaluar(`(() => {
    const pie = ${PIE};
    const caja = (el) => { const r = el.getBoundingClientRect(), c = getComputedStyle(el); return { izq: r.left + parseFloat(c.paddingLeft), der: innerWidth - (r.right - parseFloat(c.paddingRight)) }; };
    const fila = pie.querySelector('.cod-rule--fila-44e63a');
    const legal = pie.querySelector('.cod-rule--bas-pie-legal-barra');
    const cs = (el) => { const c = getComputedStyle(el); return { alinea: c.textAlign, interlineado: parseFloat(c.lineHeight) / parseFloat(c.fontSize) }; };
    const parrafo = (re) => [...pie.querySelectorAll('p')].find((p) => re.test(p.textContent));
    const enlaces = [...pie.querySelectorAll('a')].filter((a) => /Términos|Preferencias/.test(a.textContent)).map((a) => ({ txt: a.textContent.trim(), href: a.getAttribute('href'), conducta: a.getAttribute('data-cod-behavior') }));
    const hijos = [...pie.querySelectorAll('img, p, a')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect());
    return JSON.stringify({ fila: caja(fila), legal: caja(legal), direccion: cs(parrafo(/Av 18/)), credito: cs(parrafo(/Diseño/)), enlaces, minIzq: Math.min(...hijos.map((r) => r.left)), maxDer: Math.max(...hijos.map((r) => r.right)), desborde: document.documentElement.scrollWidth > innerWidth });
  })()`));
  ok(Math.abs(medidas.fila.izq - 24) < 0.6 && Math.abs(medidas.fila.der - 24) < 0.6, 'la fila del pie deja 24 px a cada lado', `izq ${medidas.fila.izq} · der ${medidas.fila.der}`);
  ok(Math.abs(medidas.legal.izq - 24) < 0.6 && Math.abs(medidas.legal.der - 24) < 0.6, 'la línea legal deja 24 px a cada lado', `izq ${medidas.legal.izq} · der ${medidas.legal.der}`);
  ok(medidas.minIzq >= 23.5 && medidas.maxDer <= ANCHO - 23.5, 'nada del pie se sale de los 24 px de margen', `del ${medidas.minIzq} al ${medidas.maxDer}`);
  ok(!medidas.desborde, 'la página no se desborda hacia el lado');
  ok(['start', 'left'].includes(medidas.direccion.alinea), 'la dirección va alineada a la izquierda', medidas.direccion.alinea);
  ok(['start', 'left'].includes(medidas.credito.alinea), 'el crédito «Diseño y desarrollo» va alineado a la izquierda', medidas.credito.alinea);
  ok(medidas.direccion.interlineado >= 1.45 && medidas.credito.interlineado >= 1.45, 'interlineado de celular de 1,5', `dirección ${medidas.direccion.interlineado.toFixed(2)} · crédito ${medidas.credito.interlineado.toFixed(2)}`);
  const terminos = medidas.enlaces.find((e) => /Términos/.test(e.txt));
  const prefs = medidas.enlaces.find((e) => /Preferencias/.test(e.txt));
  ok(terminos && terminos.href === '/terminos-y-privacidad/', '«Términos y privacidad» lleva a /terminos-y-privacidad/', JSON.stringify(terminos));
  ok(prefs && prefs.conducta === 'preferencias-cookies' && prefs.href === '/terminos-y-privacidad/', '«Preferencias de cookies» declara la conducta y tiene la dirección de respaldo', JSON.stringify(prefs));

  // El panel de CookieAdmin: con el banner rechazado, el enlace del pie lo abre.
  const panelVisible = () => evaluar(`(() => { const p = document.querySelector('.cookieadmin_cookie_modal'); if (!p) return false; const r = p.getBoundingClientRect(), c = getComputedStyle(p); return c.display !== 'none' && c.visibility !== 'hidden' && r.height > 40; })()`);
  ok(!(await panelVisible()), 'antes de tocar nada, el panel de preferencias está cerrado');
  await evaluar("document.querySelector('#cookieadmin_reject_button').click()");
  await dormir(1500);
  const bannerCerrado = await evaluar("(() => { const b = document.querySelector('.cookieadmin_law_container'); return !b || getComputedStyle(b).display === 'none' || b.getBoundingClientRect().height < 5; })()");
  ok(bannerCerrado, 'se rechazó el banner (queda cerrado)');
  await evaluar("[...document.querySelectorAll('footer.cod-canvas-region-footer a')].find((a) => /Preferencias de cookies/.test(a.textContent)).click()");
  await dormir(1200);
  ok(await panelVisible(), 'pinchar «Preferencias de cookies» abre el panel de CookieAdmin');
  const ruta = await evaluar('location.pathname');
  ok(ruta === '/', 'y no navega: la persona sigue en la misma página', ruta);
  await evaluar("document.querySelector('.cookieadmin_close_pref')?.click()");
  await dormir(500);

  // El mapa abierto.
  await evaluar(`${PIE}.scrollIntoView({block:'end'})`);
  await dormir(400);
  await evaluar("document.querySelector('footer .cod-mapa__mini').click()");
  await dormir(2500);
  const mapa = JSON.parse(await evaluar(`(() => { const g = document.querySelector('footer .cod-mapa__grande'); if (!g) return JSON.stringify(null); const r = g.getBoundingClientRect(); return JSON.stringify({ ancho: r.width, alto: r.height, izq: r.left, der: innerWidth - r.right }); })()`));
  ok(mapa && Math.abs(mapa.ancho - (ANCHO - 48)) < 1.5, 'el mapa abierto mide el ancho del contenido (327)', mapa ? `ancho ${mapa.ancho} · izq ${mapa.izq} · der ${mapa.der} · alto ${mapa.alto}` : 'no se abrió');
} finally { await cerrar(); }
console.log(malas ? `\n${malas} comprobaciones fallaron` : '\ntodo en orden');
process.exit(malas ? 1 : 0);
