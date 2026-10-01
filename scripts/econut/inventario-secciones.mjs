/**
 * Inventario de las secciones de una página, para comparar el original con
 * nuestra reconstrucción SIN mirar a ojo.
 *
 * Existe porque la noche del 30 de septiembre se perdió comparando de memoria
 * y por impresiones: el hero terminó con la foto de protagonista porque nadie
 * midió qué pesaba cada pieza. Acá cada sección queda descrita por datos —
 * dónde empieza, cuánto mide, qué fondo tiene, cuántas imágenes y videos, y
 * sus encabezados — y dos inventarios se comparan línea a línea.
 *
 * El criterio del proyecto es que la reconstrucción quede IGUAL que econut.cl.
 * Una diferencia que aparezca acá no se negocia con criterio propio: o se
 * corrige la composición, o se amplía el page builder hasta poder hacerlo.
 *
 * Uso:
 *   node inventario-secciones.mjs https://econut.cl original.json
 *   node inventario-secciones.mjs "http://localhost:8891/?page_id=20" local.json
 *   node inventario-secciones.mjs --comparar original.json local.json
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const ANCHO = Number(process.env.ANCHO || 1900);

// --------------------------------------------------------------- comparar
if (process.argv[2] === '--comparar') {
  const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  // Normalizar es imprescindible: el original junta palabras cuando el título
  // trae un salto de línea ("Serviciode verdad"), y las mayúsculas difieren
  // ("Vanguardia" / "vanguardia"). Sin esto, secciones que SÍ existen en los
  // dos lados salen como «falta» y «sobra», que fue justo el error de creer
  // que la sección de instalaciones no estaba.
  const normal = (t) => t.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 22);
  const clave = (s) => normal(s.encabezados[0] || s.textoInicio || 'sintitulo');
  const titulo = (s) => (s.encabezados[0] || s.textoInicio || '(sin titulo)').slice(0, 34);

  console.log('');
  console.log(`ORIGINAL: ${a.secciones.length} secciones · ${a.alto}px de alto · ancho ${a.ancho}`);
  console.log(`NUESTRA:  ${b.secciones.length} secciones · ${b.alto}px de alto · ancho ${b.ancho}`);
  console.log('');
  console.log(`${'sección'.padEnd(36)} ${'original'.padEnd(24)} ${'nuestra'.padEnd(24)} dif`);
  console.log('-'.repeat(100));

  const libres = b.secciones.map((s, i) => ({ s, i, usada: false }));
  let altoOrig = 0, altoNuestra = 0;
  for (const s of a.secciones) {
    const k = clave(s);
    const cand = libres.find((x) => !x.usada && clave(x.s) === k);
    if (cand) cand.usada = true;
    const par = cand ? cand.s : null;
    const izq = `${s.alto}px · ${s.imagenes} img · ${s.videos} vid`;
    const der = par ? `${par.alto}px · ${par.imagenes} img · ${par.videos} vid` : 'FALTA';
    const dif = par ? `${par.alto - s.alto > 0 ? '+' : ''}${par.alto - s.alto}px` : '←';
    altoOrig += s.alto;
    if (par) altoNuestra += par.alto;
    console.log(`${titulo(s).padEnd(36)} ${izq.padEnd(24)} ${der.padEnd(24)} ${dif}`);
  }
  for (const x of libres.filter((x) => !x.usada)) {
    console.log(`${titulo(x.s).padEnd(36)} ${'—'.padEnd(24)} ${(x.s.alto + 'px').padEnd(24)} SOBRA`);
  }
  console.log('-'.repeat(100));
  console.log(`alto sumado de las que calzan: original ${altoOrig}px · nuestra ${altoNuestra}px`);
  process.exit(0);
}

// --------------------------------------------------------------- inventariar
const [url, salida] = process.argv.slice(2);
if (!url || !salida) {
  console.error('uso: node inventario-secciones.mjs <url> <salida.json>  |  --comparar <a.json> <b.json>');
  process.exit(1);
}

const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho: ANCHO, alto: 950, escala: 1 });
await cdp('Page.enable');
await cdp('Page.navigate', { url });
await dormir(2500);
await esperarLaPagina(evaluar);
await recorrerLaPagina(evaluar);   // sin esto las animaciones de entrada mienten
await dormir(1500);

const guion = `(() => {
  const vistos = [];
  const secciones = [];
  const todas = document.querySelectorAll('.et_pb_section, .cod-section, section');
  for (const el of todas) {
    let dentro = false;
    for (const v of vistos) { if (v.contains(el)) { dentro = true; break; } }
    if (dentro) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 60) continue;
    vistos.push(el);
    const cs = getComputedStyle(el);
    const hs = [];
    for (const h of el.querySelectorAll('h1,h2,h3')) {
      if (hs.length >= 3) break;
      hs.push(h.textContent.trim().split(/[ \\t\\n\\r]+/).join(' ').slice(0, 60));
    }
    secciones.push({
      y: Math.round(r.top + scrollY),
      alto: Math.round(r.height),
      ancho: Math.round(r.width),
      fondo: cs.backgroundColor,
      tieneFoto: cs.backgroundImage.indexOf('url(') !== -1,
      imagenes: el.querySelectorAll('img').length,
      videos: el.querySelectorAll('video').length,
      encabezados: hs,
      textoInicio: (el.textContent || '').trim().split(/[ \\t\\n\\r]+/).join(' ').slice(0, 50)
    });
  }
  return { alto: document.documentElement.scrollHeight, ancho: window.innerWidth, secciones: secciones };
})()`;

const datos = await evaluar(guion);
writeFileSync(salida, JSON.stringify(datos, null, 2));
console.log(`${salida}: ${datos.secciones.length} secciones · ${datos.alto}px de alto · ancho ${datos.ancho}`);
await cerrar();
