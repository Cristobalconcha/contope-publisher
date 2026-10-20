/**
 * Captura las páginas de un sitio de Econut (escritorio 1440 px y celular
 * 393 px) recorriéndolas primero, y comprueba el formulario de contacto SIN
 * ENVIARLO: lo llena con correos que no coinciden, aprieta «Enviar mensaje» y
 * verifica que aparece el error en su campo; y lo aprieta vacío para ver los
 * obligatorios. Cualquier petición a /submissions se aborta y se cuenta: tiene
 * que ser CERO, porque un envío en un sitio real manda correos reales.
 *
 * Uso:
 *   node capturar-paginas.mjs <base> <carpeta-de-salida> [rutas separadas por coma]
 *   node capturar-paginas.mjs http://nuevo.econut.cl ../../../Sesión\ Claude/entregables/econut/capturas-nuevo
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Cristobal concha/wp-local/node_modules/playwright-core');

const [base, salida, rutasArg] = process.argv.slice(2);
if (!base || !salida) { console.error('uso: node capturar-paginas.mjs <base> <carpeta> [rutas]'); process.exit(1); }
const RUTAS = (rutasArg || '/,/contacto/,/terminos-y-privacidad/').split(',');
mkdirSync(salida, { recursive: true });

const nombreDe = (r) => (r === '/' ? 'inicio' : r.replace(/\//g, ''));
const resultados = [];
const punto = (clave, ok, detalle) => { resultados.push(ok); console.log(`${ok ? 'OK   ' : 'FALLA'} ${clave}${detalle ? ' — ' + detalle : ''}`); };

const navegador = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errores = [];
let envios = 0;
try {
  for (const [dispositivo, ancho, alto] of [['escritorio', 1440, 900], ['celular', 393, 852]]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => {
      const ocultar = () => {
        const e = document.createElement('style');
        e.textContent = '.cookieadmin_law_container,.cookieadmin_re_consent{display:none!important}';
        (document.head || document.documentElement).appendChild(e);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ocultar); else ocultar();
    });
    // Nada llega a /submissions: se cuenta y se aborta.
    await ctx.route(/submissions/, (ruta) => { envios += 1; ruta.abort(); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(`${dispositivo}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`${dispositivo}: ${m.text()}`); });

    for (const ruta of RUTAS) {
      await page.goto(base.replace(/\/+$/, '') + ruta, { waitUntil: 'load', timeout: 60000 });
      const altoDoc = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= altoDoc; y += Math.max(200, alto - 100)) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(250);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: path.join(salida, `${nombreDe(ruta)}-${dispositivo}.png`), fullPage: true });
      punto(`${dispositivo} ${ruta}: sin desborde horizontal`, desborde <= 0, `exceso=${desborde}px`);
    }

    // El formulario, sin enviar.
    await page.goto(base.replace(/\/+$/, '') + '/contacto/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.ofr-form', { timeout: 20000 });
    const estilo = await page.evaluate(() => {
      const css = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      return {
        boton: document.querySelector('.ofr-submit')?.textContent.trim(),
        fondoBoton: css('.ofr-submit', 'backgroundColor'),
        borde: css('#ofr-correo', 'borderTopColor'),
        casillas: document.querySelectorAll('.ofr-form input[type="checkbox"]').length,
        marcada: document.querySelector('#ofr-acepta_novedades')?.checked,
      };
    });
    punto(`${dispositivo} formulario con el estilo del sitio`, estilo.boton === 'Enviar mensaje' && estilo.fondoBoton === 'rgb(46, 89, 74)' && estilo.borde === 'rgb(219, 212, 192)',
      `botón="${estilo.boton}", fondo=${estilo.fondoBoton}, borde=${estilo.borde}`);
    punto(`${dispositivo} una sola casilla, desmarcada`, estilo.casillas === 1 && estilo.marcada === false, `casillas=${estilo.casillas}, marcada=${estilo.marcada}`);

    await page.click('.ofr-submit');
    await page.waitForSelector('.ofr-field--invalid .ofr-error', { timeout: 8000 });
    const obligatorios = await page.locator('.ofr-field--invalid').count();
    punto(`${dispositivo} vacío: marca los obligatorios sin enviar`, obligatorios >= 6, `campos marcados=${obligatorios}`);

    await page.selectOption('#ofr-area', { label: 'Consultas generales' });
    await page.fill('#ofr-nombre', 'Prueba');
    await page.fill('#ofr-apellidos', 'Sin envío');
    await page.fill('#ofr-correo', 'prueba@ejemplo.cl');
    await page.fill('#ofr-correo_repite', 'otra@ejemplo.cl');
    await page.fill('#ofr-mensaje', 'No se envía.');
    await page.click('.ofr-submit');
    await page.waitForSelector('#ofr-correo_repite');
    const campo = page.locator('#ofr-correo_repite').locator('xpath=ancestor::div[contains(@class,"ofr-field")][1]');
    await campo.locator('.ofr-error').waitFor({ timeout: 5000 });
    const mensaje = await campo.locator('.ofr-error').innerText();
    punto(`${dispositivo} correos distintos: error visible en «Repite tu correo»`, mensaje === 'Los correos no coinciden.', `"${mensaje}"`);
    if (dispositivo === 'escritorio') {
      await page.screenshot({ path: path.join(salida, 'contacto-validacion-escritorio.png'), fullPage: false });
    }
    await ctx.close();
  }
} finally {
  await navegador.close();
}
punto('ninguna petición a /submissions (no se envió nada)', envios === 0, `peticiones abortadas=${envios}`);
punto('sin errores de consola ni de página', errores.length === 0, errores.slice(0, 4).join(' | '));
const fallas = resultados.filter((r) => !r).length;
console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
process.exit(fallas ? 1 : 0);
