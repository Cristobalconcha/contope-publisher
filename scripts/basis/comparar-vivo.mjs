/**
 * Compara, NODO A NODO, el sitio original de Basis (vivo) contra el local.
 *
 * Abre las dos páginas en Chrome sin ventana al mismo ancho, recorre cada una
 * (por las animaciones de entrada) y saca de cada elemento que lleva texto
 * propio su estilo COMPUTADO: familia, tamaño, peso, interlineado, color,
 * alineación, espaciado de letras, mayúsculas, subrayado y caja. Empareja por
 * texto (con índice de aparición) e imprime sólo lo que difiere.
 *
 * Además compara las imágenes (por nombre de archivo) y las cajas con fondo,
 * borde, radio o sombra (por posición dentro de la página).
 *
 *   node comparar-vivo.mjs <pagina|todas> [ancho|todos] [SITIO-LOCAL] [carpeta-salida]
 *
 * Deja `comparacion-estilos-<pagina>-<ancho>.json` en la carpeta de salida y
 * imprime el resumen. SÓLO lee (GET) los dos sitios; no envía formularios.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const PAGINAS = {
  inicio: ['https://basisbodegas.com/', '/'],
  'basis-carpas-industriales': ['https://basisbodegas.com/basis-carpas-industriales/', '/basis-carpas-industriales/'],
  'preguntas-frecuentes': ['https://basisbodegas.com/preguntas-frecuentes/', '/preguntas-frecuentes/'],
  contactos: ['https://basisbodegas.com/contactos/', '/contactos/'],
};
const arg = process.argv.slice(2);
const cuales = !arg[0] || arg[0] === 'todas' ? Object.keys(PAGINAS) : [arg[0]];
const anchos = !arg[1] || arg[1] === 'todos' ? [1440, 768, 393] : [Number(arg[1])];
const SITIO = (arg[2] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = arg[3] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
mkdirSync(SAL, { recursive: true });

/** Se ejecuta DENTRO de la página: devuelve textos, imágenes y cajas. */
const EXTRAER = `(() => {
  const limpio = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const fuera = (el) => el.closest('[class*=cookieadmin],[id*=cookieadmin],script,style,noscript,template,svg');
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { s, r };
  };
  const rect = (r) => ({ x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) });
  // La caja de un texto es la de SUS LETRAS (los renglones), no la de su elemento: el relleno y el margen no se ven.
  const cajaDeTexto = (el) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) { if (!q.width || !q.height) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
    }
    return x1 < x0 ? null : { x: Math.round(x0 + scrollX), y: Math.round(y0 + scrollY), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  };
  const textos = [];
  const imagenes = [];
  const cajas = [];
  for (const el of document.querySelectorAll('body *')) {
    if (fuera(el)) continue;
    const v = visible(el); if (!v) continue;
    const propio = limpio([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    const { s, r } = v;
    if (propio.length > 0) {
      textos.push({
        texto: propio, tag: el.tagName.toLowerCase(), clase: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 60),
        familia: s.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), tam: s.fontSize, peso: s.fontWeight, estilo: s.fontStyle,
        inter: s.lineHeight, color: s.color, alinea: s.textAlign, espaciado: s.letterSpacing, mayus: s.textTransform,
        subrayado: s.textDecorationLine, op: s.opacity, caja: cajaDeTexto(el) || rect(r),
      });
    }
    if (el.tagName === 'IMG') imagenes.push({ archivo: (el.currentSrc || el.src || '').split('/').pop().split('?')[0], alt: el.alt, caja: rect(r), ajuste: s.objectFit });
    const fondo = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none';
    const borde = parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0 || parseFloat(s.borderLeftWidth) > 0;
    if ((fondo || borde || s.boxShadow !== 'none') && r.width >= 12 && r.height >= 12 && el.tagName !== 'IMG' && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
      cajas.push({
        tag: el.tagName.toLowerCase(), clase: String(el.className && el.className.baseVal === undefined ? el.className : '').slice(0, 50),
        fondo: s.backgroundColor, imagen: s.backgroundImage === 'none' ? '' : s.backgroundImage.replace(/url\\("?[^")]*\\/([^/")]+)"?\\)/g, 'url($1)').slice(0, 140),
        borde: borde ? s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor : '', radio: s.borderTopLeftRadius, sombra: s.boxShadow === 'none' ? '' : s.boxShadow.slice(0, 60),
        pos: s.position, caja: rect(r),
      });
    }
  }
  return { alto: Math.ceil(document.documentElement.scrollHeight), ancho: document.documentElement.scrollWidth, textos, imagenes, cajas };
})()`;

async function leer(url, ancho, local) {
  const movil = ancho < 600;
  const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: 1, movil });
  try {
    await cdp('Page.enable');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.navigate', { url });
    await dormir(3000); await esperarLaPagina(evaluar);
    await recorrerLaPagina(evaluar, 0.6); await dormir(2000); await recorrerLaPagina(evaluar, 0.6); await dormir(1200);
    await evaluar("document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; })");
    await dormir(1500); await esperarLaPagina(evaluar);
    await evaluar('window.scrollTo(0,0)'); await dormir(500);
    return await evaluar(EXTRAER);
  } finally { await cerrar(); }
}

const clave = (t) => t.texto.toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '').slice(0, 70);
const num = (v) => parseFloat(v);
const normColor = (c) => c.replace(/\s/g, '');

function compararTextos(o, l) {
  const usados = new Set();
  const filas = [];
  const vistos = new Map();
  const porClave = new Map();
  l.forEach((t, i) => { const k = clave(t); if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(i); });
  const faltan = []; const dif = [];
  let driftAnt = 0;
  for (const t of o) {
    const k = clave(t); if (!k) continue;
    const n = vistos.get(k) || 0; vistos.set(k, n + 1);
    const cand = (porClave.get(k) || []).filter((i) => !usados.has(i));
    if (!cand.length) { faltan.push(t); continue; }
    // el más cercano en posición vertical entre los libres
    const i = cand[0]; usados.add(i);
    const u = l[i]; const d = [];
    if (Math.abs(num(u.tam) - num(t.tam)) > 0.6) d.push(`tamaño ${u.tam}≠${t.tam}`);
    if (t.inter !== 'normal' && u.inter !== 'normal' && Math.abs(num(u.inter) - num(t.inter)) > 1.2) d.push(`interlineado ${u.inter}≠${t.inter}`);
    else if ((t.inter === 'normal') !== (u.inter === 'normal')) d.push(`interlineado ${u.inter}≠${t.inter}`);
    if (Math.abs(num(u.peso) - num(t.peso)) > 50) d.push(`peso ${u.peso}≠${t.peso}`);
    if (u.familia.toLowerCase() !== t.familia.toLowerCase()) d.push(`familia ${u.familia}≠${t.familia}`);
    if (normColor(u.color) !== normColor(t.color)) d.push(`color ${u.color}≠${t.color}`);
    if (u.alinea !== t.alinea && !(['start', 'left'].includes(u.alinea) && ['start', 'left'].includes(t.alinea))) d.push(`alineación ${u.alinea}≠${t.alinea}`);
    if (u.estilo !== t.estilo) d.push(`cursiva ${u.estilo}≠${t.estilo}`);
    if (u.mayus !== t.mayus) d.push(`mayúsculas ${u.mayus}≠${t.mayus}`);
    if (u.subrayado !== t.subrayado) d.push(`subrayado ${u.subrayado}≠${t.subrayado}`);
    const esp = (v) => (v === 'normal' ? 0 : num(v));
    if (Math.abs(esp(u.espaciado) - esp(t.espaciado)) > 0.3) d.push(`espaciado ${u.espaciado}≠${t.espaciado}`);
    const dx = u.caja.x - t.caja.x; const dw = u.caja.w - t.caja.w; const dy = u.caja.y - t.caja.y;
    if (Math.abs(dx) > 4) d.push(`x ${dx > 0 ? '+' : ''}${dx}`);
    // El ancho de la CAJA de un texto no se ve; lo que se ve es dónde parte la línea: si el alto cambia, cambió el reparto en renglones.
    if (Math.abs(u.caja.h - t.caja.h) > Math.max(4, t.caja.h * 0.1)) d.push(`alto del texto ${u.caja.h}≠${t.caja.h} (renglones)`);
    if (Math.abs(dy - driftAnt) > 6) { d.push(`y ${dy > 0 ? '+' : ''}${dy} (antes ${driftAnt > 0 ? '+' : ''}${driftAnt})`); }
    driftAnt = dy;
    if (d.length) dif.push({ texto: t.texto.slice(0, 60), tag: `${u.tag}/${t.tag}`, diferencias: d });
  }
  const sobran = l.filter((_, i) => !usados.has(i));
  return { comparados: o.length, dif, faltan, sobran };
}

function compararImagenes(o, l) {
  const dif = []; const usados = new Set();
  for (const im of o) {
    const i = l.findIndex((x, j) => !usados.has(j) && x.archivo === im.archivo);
    if (i < 0) { dif.push({ archivo: im.archivo, problema: 'falta en el local', original: im.caja }); continue; }
    usados.add(i); const u = l[i]; const d = [];
    if (Math.abs(u.caja.w - im.caja.w) > 4 || Math.abs(u.caja.h - im.caja.h) > 4) d.push(`tamaño ${u.caja.w}×${u.caja.h}≠${im.caja.w}×${im.caja.h}`);
    if (Math.abs(u.caja.x - im.caja.x) > 4) d.push(`x ${u.caja.x - im.caja.x}`);
    if (d.length) dif.push({ archivo: im.archivo, problema: d.join(' · ') });
  }
  return dif;
}

function compararCajas(o, l) {
  // emparejar por posición: misma esquina (±6) y mismo tamaño (±8)
  const usados = new Set(); const dif = [];
  for (const c of o) {
    let mejor = -1; let mejorD = 1e9;
    l.forEach((x, j) => {
      if (usados.has(j)) return;
      const dist = Math.abs(x.caja.x - c.caja.x) + Math.abs(x.caja.w - c.caja.w) + Math.abs(x.caja.h - c.caja.h) * 0.5;
      if (dist < mejorD && Math.abs(x.caja.y - c.caja.y) < 300) { mejorD = dist; mejor = j; }
    });
    if (mejor < 0 || mejorD > 40) { dif.push({ caja: c.caja, original: `${c.tag}.${c.clase}`.slice(0, 60), problema: 'sin caja equivalente en el local', fondo: c.fondo, imagen: c.imagen }); continue; }
    usados.add(mejor); const u = l[mejor]; const d = [];
    if (normColor(u.fondo) !== normColor(c.fondo)) d.push(`fondo ${u.fondo}≠${c.fondo}`);
    if (u.imagen !== c.imagen && (u.imagen || c.imagen)) d.push(`imagen ${u.imagen || '—'}≠${c.imagen || '—'}`);
    if (u.borde !== c.borde) d.push(`borde ${u.borde || '—'}≠${c.borde || '—'}`);
    const radioPx = (r) => Math.min(parseFloat(r) || 0, Math.min(c.caja.w, c.caja.h) / 2);
    if (Math.abs(radioPx(u.radio) - radioPx(c.radio)) > 1.5) d.push(`radio ${u.radio}≠${c.radio}`);
    if (u.sombra !== c.sombra) d.push(`sombra ${u.sombra || '—'}≠${c.sombra || '—'}`);
    if (Math.abs(u.caja.h - c.caja.h) > 6) d.push(`alto ${u.caja.h}≠${c.caja.h}`);
    if (d.length) dif.push({ caja: c.caja, original: `${c.tag}.${c.clase}`.slice(0, 60), problema: d.join(' · ') });
  }
  return dif;
}

const resumen = [];
for (const slug of cuales) {
  const [urlO, ruta] = PAGINAS[slug];
  for (const ancho of anchos) {
    const o = await leer(urlO, ancho, false);
    const l = await leer(SITIO + ruta, ancho, true);
    const t = compararTextos(o.textos, l.textos);
    const im = compararImagenes(o.imagenes, l.imagenes);
    const cj = compararCajas(o.cajas, l.cajas);
    const total = t.dif.length + t.faltan.length + t.sobran.length + im.length + cj.length;
    const rep = { pagina: slug, ancho, altoOriginal: o.alto, altoLocal: l.alto, anchoDocumentoLocal: l.ancho, totales: { textosConDiferencia: t.dif.length, textosFaltan: t.faltan.length, textosSobran: t.sobran.length, imagenes: im.length, cajas: cj.length, total }, textos: t, imagenes: im, cajas: cj };
    writeFileSync(path.join(SAL, `comparacion-estilos-${slug}-${ancho}.json`), JSON.stringify(rep, null, 2));
    console.log(`\n=== ${slug} @${ancho}: alto ${o.alto} (original) / ${l.alto} (local) · ancho doc local ${l.ancho} · ${total} diferencias`);
    for (const x of t.dif) console.log(`  TEXTO  <${x.tag}> «${x.texto}» ${x.diferencias.join(' · ')}`);
    for (const x of t.faltan) console.log(`  FALTA  <${x.tag}> «${x.texto.slice(0, 60)}»`);
    for (const x of t.sobran) console.log(`  SOBRA  <${x.tag}> «${x.texto.slice(0, 60)}»`);
    for (const x of im) console.log(`  IMAGEN ${x.archivo}: ${x.problema}`);
    for (const x of cj) console.log(`  CAJA   y=${x.caja.y} ${x.original}: ${x.problema}`);
    resumen.push(`${slug} @${ancho}: ${total} (textos ${t.dif.length}, faltan ${t.faltan.length}, sobran ${t.sobran.length}, imágenes ${im.length}, cajas ${cj.length}) · alto ${o.alto}/${l.alto}`);
  }
}
console.log('\n=== RESUMEN\n' + resumen.join('\n'));
