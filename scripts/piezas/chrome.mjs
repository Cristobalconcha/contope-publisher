/**
 * Arranca un Chrome sin ventana y devuelve el hilo para manejarlo.
 *
 * Los cinco guiones de esta carpeta tenían estas mismas cuarenta líneas
 * copiadas. Una corrección —el tope de tiempo en las esperas— hubo que
 * escribirla dos veces antes de darse cuenta. Por eso viven acá una sola vez.
 *
 * Se maneja Chrome por su protocolo de depuración, con el WebSocket que Node
 * ya trae. Sin dependencias.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const CHROME = process.env.CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opciones
 *   ancho, alto   medidas de la ventana, en puntos
 *   escala        densidad de píxeles; 1 para imprimir, 3 para capturar
 *   movil         emula un teléfono; por defecto, cuando el ancho baja de 600
 *   ventanaPx     fija el tamaño de la ventana en PÍXELES en vez de puntos.
 *                 Hace falta para capturar con nitidez: si la superficie de
 *                 dibujo mide de verdad 360x640, pedir una imagen de 1080x1920
 *                 devuelve una ampliación y no detalle.
 */
export async function abrirChrome(opciones = {}) {
  const ancho = Number(opciones.ancho || 360);
  const alto = Number(opciones.alto || 800);
  const escala = Number(opciones.escala || 1);
  const movil = opciones.movil === undefined ? ancho < 600 : Boolean(opciones.movil);
  const perfil = mkdtempSync(path.join(tmpdir(), 'pz-'));
  const puerto = 9200 + Math.floor(Math.random() * 700);

  const argumentos = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--mute-audio',
    '--remote-debugging-port=' + puerto,
    '--user-data-dir=' + perfil,
  ];
  if (opciones.ventanaPx) {
    argumentos.push('--force-device-scale-factor=' + escala);
    argumentos.push('--window-size=' + (ancho * escala) + ',' + (alto * escala));
  } else {
    argumentos.push('--window-size=' + ancho + ',' + alto);
  }
  argumentos.push('about:blank');

  const chrome = spawn(CHROME, argumentos, { stdio: 'ignore' });

  let direccion = '';
  for (let i = 0; i < 80 && !direccion; i += 1) {
    try {
      const r = await fetch('http://127.0.0.1:' + puerto + '/json/list');
      const t = (await r.json()).find((x) => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) direccion = t.webSocketDebuggerUrl;
    } catch { /* todavía no levanta */ }
    if (!direccion) await dormir(250);
  }
  if (!direccion) {
    chrome.kill();
    throw new Error('Chrome no abrió su puerto de depuración');
  }

  const ws = new WebSocket(direccion);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { res, rej } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const cdp = (method, params = {}) => {
    id += 1;
    const mio = id;
    return new Promise((res, rej) => {
      pendientes.set(mio, { res, rej });
      ws.send(JSON.stringify({ id: mio, method, params }));
    });
  };
  async function evaluar(expresion) {
    const r = await cdp('Runtime.evaluate', {
      expression: expresion, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || 'error en la página');
    }
    return r.result.value;
  }

  await cdp('Emulation.setDeviceMetricsOverride', {
    width: ancho, height: alto, deviceScaleFactor: escala, mobile: movil,
  });

  const cerrar = async () => { ws.close(); chrome.kill(); };
  return { cdp, evaluar, dormir, cerrar, ancho, alto, escala };
}

/**
 * Espera a que la página esté lista de verdad, con tope de tiempo en cada paso.
 *
 * El tope no es prolijidad: una imagen diferida que nunca entra en pantalla no
 * dispara load ni error, así que esa promesa queda abierta para siempre y el
 * guion se cuelga sin decir una palabra. Pasó de verdad y dejó 22 Chrome
 * colgados de fondo, que a su vez trababan todo lo demás.
 */
export async function esperarLaPagina(evaluar, tope = 8000) {
  await evaluar(`(async () => {
    const tope = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    await tope(document.fonts.ready, ${tope});
    await tope(new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r))), ${tope});
    await tope(Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))), ${tope});
  })()`);
}

/**
 * Recorre la página entera y vuelve arriba: así se disparan las apariciones al
 * entrar en pantalla y los bloques que sólo se dibujan cuando se los mira.
 */
export async function recorrerLaPagina(evaluar, paso = 0.8) {
  await evaluar(`(async () => {
    const paso = innerHeight * ${paso};
    for (let y = 0; y < document.body.scrollHeight; y += paso) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
    scrollTo(0, 0);
  })()`);
}

/**
 * Deja en su estado final lo que la animación de entrada dejó a medias. Un PDF
 * es una foto: un bloque a medio aparecer saldría translúcido.
 *
 * OJO con lo que NO hay que tocar, que son dos familias y las dos costaron un
 * archivo inservible:
 *
 * 1. Los TELONES de pantalla completa escondidos con opacity 0 —la galería
 *    ampliada, la ventana de WhatsApp, el visor 360—. Encenderlos tapa el
 *    documento entero: un PDF salió íntegramente negro porque este paso le
 *    subió la opacidad a #difGalleryLightbox, un telón casi negro.
 * 2. Los CARRUSELES. Su posición ES una transformación; borrarla no «termina»
 *    ninguna animación, desarma el carrusel y encima dos diapositivas.
 */
export async function fijarLasAnimaciones(evaluar) {
  return evaluar(`(() => {
    let n = 0;
    for (const e of document.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (s.position === 'fixed' || s.position === 'absolute') continue;
      if (e.closest('[class*="lightbox"], [class*="ventana"], [class*="visor"], dialog')) continue;
      if (e.closest('[class*="carousel"], [class*="carrusel"], [class*="slider"], [class*="track"]')) continue;
      if (parseFloat(s.opacity) < 1 || (s.transform && s.transform !== 'none')) {
        const r = e.getBoundingClientRect();
        if (r.width > 40 && r.height > 20) {
          e.style.setProperty('opacity', '1', 'important');
          e.style.setProperty('transform', 'none', 'important');
          e.style.setProperty('transition', 'none', 'important');
          e.style.setProperty('animation', 'none', 'important');
          n += 1;
        }
      }
    }
    return n;
  })()`);
}

/** Quita del documento lo que sólo tiene sentido en pantalla. */
export async function quitar(evaluar, selectores) {
  for (const sel of selectores) {
    const n = await evaluar(`(() => { const l=[...document.querySelectorAll(${JSON.stringify(sel)})]; l.forEach(e=>e.remove()); return l.length; })()`);
    if (n) console.log('quitado ' + sel + ': ' + n);
  }
}
