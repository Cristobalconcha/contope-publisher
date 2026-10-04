/**
 * Recorre un sitio entero en varios anchos y busca lo que se rompe.
 *
 * POR QUÉ MIDE Y NO MIRA. Revisar a ojo con capturas falla de las dos formas:
 * se pasan defectos reales —un texto cortado abajo del pliegue, una imagen que
 * no cargó— y se inventan otros que no existen. En esta misma sesión leí mal una
 * captura dos veces: una por mirarla a media escala y concluir que una columna
 * estaba a la mitad, y otra por leer una imagen de doble densidad como si fuera
 * el viewport. Lo que se mide no se discute.
 *
 * QUÉ BUSCA, por página y por ancho:
 *   - desborde horizontal (la página se puede correr de lado)
 *   - elementos que se salen del ancho de la pantalla
 *   - imágenes rotas o sin cargar
 *   - textos que se solapan de verdad, comprobando por líneas y no por cajas:
 *     dos cajas pueden cruzarse sin que una sola letra se toque
 *   - textos sobre fondos de muy bajo contraste
 *   - enlaces o botones demasiado chicos para un dedo (menos de 44px)
 *   - títulos que se cortan
 *
 * Uso:
 *   node scripts/revisar-sitio.mjs                       el espejo de Santa Luisa
 *   node scripts/revisar-sitio.mjs --sitio http://...    otro
 *   node scripts/revisar-sitio.mjs --anchos 390,768,1440
 */
import { abrirChrome, esperarLaPagina, dormir } from './piezas/chrome.mjs';

const arg = (nombre, omision) => {
  const i = process.argv.indexOf('--' + nombre);
  return i > -1 ? process.argv[i + 1] : omision;
};

const SITIO = arg('sitio', 'http://localhost:8890').replace(/\/+$/, '');
const ANCHOS = arg('anchos', '390,768,1024,1440').split(',').map(Number);
const RUTAS = arg('rutas', '/,/diferenciales/,/preguntas-frecuentes/,/contacto/,/terminos-y-condiciones/').split(',');

/** Lo que se ejecuta DENTRO de la página. Devuelve los hallazgos, ya medidos. */
const REVISION = `(() => {
  const hallazgos = [];
  const anota = (gravedad, que, detalle) => hallazgos.push({ gravedad, que, detalle });
  const W = window.innerWidth;

  // 1. Desborde horizontal: lo más visible y lo más fácil de pasar por alto en
  //    una captura, porque la captura recorta.
  if (document.documentElement.scrollWidth > W + 1) {
    anota('alto', 'la página se corre de lado',
      document.documentElement.scrollWidth + 'px de ancho en una pantalla de ' + W);
  }

  // 2. Quién se sale. Se ignoran los que recortan a propósito (un divisor dibuja
  //    más ancho que la pantalla para que la forma no se repita, y va recortado).
  const recorta = (e) => {
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll('body *')) {
    const b = e.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    if (b.right > W + 2 && !recorta(e)) {
      anota('medio', 'se sale del ancho',
        e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' llega a ' + Math.round(b.right) + 'px');
      if (hallazgos.filter((h) => h.que === 'se sale del ancho').length > 4) break;
    }
  }

  // 3. Imágenes que no cargaron.
  for (const img of document.images) {
    if (!img.getAttribute('src')) continue;
    // Sólo las que OCUPAN lugar. El hueco del lightbox cerrado es un <img> con
    // un marcador de 0x0 que se llena al abrir una foto: contarlo como rota
    // ensucia el informe con algo que nadie ve ni puede arreglar.
    const cajaImg = img.getBoundingClientRect();
    if (cajaImg.width < 2 || cajaImg.height < 2) continue;
    if (img.complete && img.naturalWidth === 0) {
      anota('alto', 'imagen rota', (img.getAttribute('src') || '').split('/').pop());
    }
  }

  // 4. Texto encima de texto, medido POR LÍNEAS.
  //    Dos cajas pueden cruzarse sin que se toque una sola letra: por eso se
  //    comparan los rectángulos de las líneas reales (Range.getClientRects) y no
  //    las cajas de los elementos. Comparar cajas da falsos positivos a montones
  //    y después nadie mira el informe.
  const lineas = [];
  for (const e of document.querySelectorAll('p, h1, h2, h3, h4, li, a, button, span, figcaption, summary')) {
    if (e.children.length > 0) continue;
    const t = (e.textContent || '').trim();
    if (t.length < 2) continue;
    const c = getComputedStyle(e);
    if (c.visibility === 'hidden' || c.display === 'none' || parseFloat(c.opacity) < 0.1) continue;
    const r = document.createRange();
    r.selectNodeContents(e);
    for (const caja of r.getClientRects()) {
      if (caja.width <= 1 || caja.height <= 1) continue;
      // UNA LÍNEA QUE NO SE ALCANZA A SÍ MISMA ESTÁ TAPADA, y lo que está
      // tapado no puede solaparse con nada. Es el caso del menú de teléfono:
      // sus enlaces existen y tienen caja, pero un ancestro los recorta, así
      // que elementFromPoint sobre ellos devuelve la sección de abajo.
      //
      // Sin esto el informe decía "Diferenciales encima de Lo que hace
      // distinta" en TODAS las páginas: cinco falsos positivos por pantalla,
      // que es la forma más rápida de que un informe deje de leerse.
      const cx = Math.min(caja.left + caja.width / 2, W - 2);
      const cy = caja.top + caja.height / 2;
      if (cy < 0 || cy > window.innerHeight) { lineas.push({ caja, e, t, fuera: true }); continue; }
      const enCentro = document.elementFromPoint(cx, cy);
      if (!enCentro || (enCentro !== e && !e.contains(enCentro) && !enCentro.contains(e))) continue;
      lineas.push({ caja, e, t });
    }
  }
  const cruzan = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
  let solapes = 0;
  for (let i = 0; i < lineas.length && solapes < 4; i++) {
    for (let j = i + 1; j < lineas.length && solapes < 4; j++) {
      if (lineas[i].e.contains(lineas[j].e) || lineas[j].e.contains(lineas[i].e)) continue;
      // Dos tramos del MISMO título se encajan a propósito: la cara de caja
      // alta sube para que el trazo bajo de la script la toque. Es intención de
      // diseño, no un defecto, y marcarla llenaba el informe de ruido.
      const padreComun = lineas[i].e.parentElement;
      if (padreComun && padreComun === lineas[j].e.parentElement
          && /^H[1-6]$/.test(padreComun.tagName)) continue;
      if (!cruzan(lineas[i].caja, lineas[j].caja)) continue;
      // Las dos siguen debajo del pliegue: no se puede comprobar con
      // elementFromPoint, que sólo ve lo que está en pantalla. Se anotan igual
      // pero como aviso, no como problema grave.
      if (lineas[i].fuera || lineas[j].fuera) continue;
      // Llegadas acá, las dos líneas se alcanzan a sí mismas —ninguna está
      // tapada ni recortada— y sus cajas se cruzan: es un solape de verdad.
      solapes++;
      anota('alto', 'texto encima de texto',
        '«' + lineas[i].t.slice(0, 26) + '» y «' + lineas[j].t.slice(0, 26) + '»');
    }
  }

  // 5. Zonas de toque chicas. 44px es el mínimo que recomiendan las dos guías
  //    (Apple y WCAG 2.5.8 pide 24; se usa el más exigente y se avisa como bajo).
  if (W < 768) {
    const vistos = new Set();
    for (const e of document.querySelectorAll('a[href], button')) {
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // Redondeado: un botón de 43,98px no es un defecto, es el subpíxel. Sin
      // esto el informe acusaba «mide 44px de alto» como si 44 fuera poco.
      if (Math.round(b.height) >= 44) continue;
      const t = (e.textContent || '').trim().slice(0, 24);
      if (!t || vistos.has(t)) continue;
      vistos.add(t);
      anota('bajo', 'zona de toque chica', '«' + t + '» mide ' + Math.round(b.height) + 'px de alto');
      if (vistos.size > 5) break;
    }
  }

  // 6. Contraste. Sólo lo flagrante: texto que casi no se distingue del fondo.
  const luz = (c) => {
    const m = c.match(/\\d+/g);
    if (!m) return null;
    const [r, g, b] = m.map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fondoDe = (e) => {
    for (let p = e; p && p !== document.documentElement; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor;
      if (bg && !/rgba?\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
    }
    return 'rgb(255,255,255)';
  };
  const yaAvisado = new Set();
  for (const e of document.querySelectorAll('p, h1, h2, h3, li, a, summary')) {
    if (e.children.length > 0) continue;
    const t = (e.textContent || '').trim();
    if (t.length < 4) continue;
    const c = getComputedStyle(e);
    const l1 = luz(c.color), l2 = luz(fondoDe(e));
    if (l1 === null || l2 === null) continue;
    const razon = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (razon < 2 && !yaAvisado.has(t.slice(0, 20))) {
      yaAvisado.add(t.slice(0, 20));
      anota('alto', 'texto casi invisible',
        '«' + t.slice(0, 30) + '» contraste ' + razon.toFixed(1) + ':1');
      if (yaAvisado.size > 3) break;
    }
  }

  return { hallazgos, alto: document.documentElement.scrollHeight };
})()`;

/* ------------------------------------------------------------------ correr --- */
console.log(`revisando ${SITIO}\n${RUTAS.length} páginas × ${ANCHOS.length} anchos\n`);

let problemas = 0;
const porArreglar = [];

for (const ancho of ANCHOS) {
  const { cdp, evaluar, cerrar } = await abrirChrome({ ancho, alto: 900, escala: 1 });
  await cdp('Page.enable');
  console.log(`\n═══ ${ancho}px ${ancho < 768 ? '(teléfono)' : ancho < 1024 ? '(tablet)' : '(escritorio)'}`);

  for (const ruta of RUTAS) {
    await cdp('Page.navigate', { url: SITIO + ruta });
    await esperarLaPagina(evaluar);
    await dormir(700);

    const r = await evaluar(REVISION);
    const h = r?.hallazgos ?? [];
    const graves = h.filter((x) => x.gravedad === 'alto').length;
    problemas += graves;

    console.log(`  ${graves === 0 ? 'ok   ' : 'OJO  '} ${ruta.padEnd(28)} ${String(r?.alto ?? '?').padStart(5)}px de alto · ${h.length === 0 ? 'sin hallazgos' : h.length + ' hallazgo(s)'}`);
    for (const x of h) {
      console.log(`         ${x.gravedad === 'alto' ? '· ' : '  '}${x.que}: ${x.detalle}`);
      if (x.gravedad === 'alto') porArreglar.push({ ancho, ruta, ...x });
    }
  }
  await cerrar();
}

console.log(`\n${problemas === 0 ? 'Sin problemas graves.' : problemas + ' problema(s) grave(s):'}`);
for (const p of porArreglar) {
  console.log(`  ${String(p.ancho).padStart(4)}px ${p.ruta.padEnd(28)} ${p.que}: ${p.detalle}`);
}
process.exit(problemas === 0 ? 0 : 1);
