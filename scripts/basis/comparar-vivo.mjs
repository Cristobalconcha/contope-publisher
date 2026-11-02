/**
 * Compara el sitio LOCAL de Basis contra la referencia CONGELADA del Divi original (P0.4 de
 * docs/ESPEC-adn-unica-puerta-y-bloques.md, H12).
 *
 * Qué cambió respecto de la versión anterior (que quedaba verde sin probar):
 *   - El «original» ya no es basisbodegas.com (que ahora es ContOpe y que F10 cambia): es la medida
 *     congelada del Divi, en `entregables/basis/original/datos/medida-<pagina>-<ancho>.json` (el 768 sale de
 *     `medicion-3/`, medido el mismo día sobre el mismo Divi). Cada archivo va con su sha256 en la configuración:
 *     si cambia, el guion se niega a comparar. Este guion no hace NINGUNA petición a producción.
 *   - Páginas × anchos salen de `comparar-vivo.config.json`, igual que las tolerancias (nada escrito en el código).
 *   - Termina con código 1 si algo queda fuera de criterio; 2 si la configuración o una referencia están mal
 *     (archivo ausente, hash distinto, nada que comparar). Una página sin referencia es FALLO, no se salta.
 *
 * Qué compara, por página y ancho: alto del documento; cada texto de la referencia (que esté, y su familia, tamaño,
 * peso, interlineado, color, alineación, mayúsculas, cursiva, subrayado y espaciado); cada texto del local que no
 * está en la referencia (SOBRA); cada imagen (que esté, su caja y su recorte); y los botones fijos.
 *
 *   node comparar-vivo.mjs [pagina|todas] [ancho|todos] [SITIO-LOCAL] [carpeta-salida]
 *   opciones:  --config <archivo>        (por omisión comparar-vivo.config.json, junto al guion)
 *              --paginas a,b             (alternativa al primer argumento)
 *              --anchos 1440,393         (alternativa al segundo)
 *              --sitio <url>             (alternativa al tercero; sólo sitios locales)
 *              --salida <carpeta>        (alternativa al cuarto)
 *              --control-relleno <px>    CONTROL: agrega ese relleno arriba del contenido del local antes de medir;
 *                                        con 20 el guion DEBE terminar con código 1 (lo prueba probar-instrumentos.mjs)
 *
 * Deja `comparacion-estilos-<pagina>-<ancho>.json` en la carpeta de salida. SÓLO lee el sitio local.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const banderas = new Map();
const posicionales = [];
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) { banderas.set(a[i].slice(2), a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'si'); } else posicionales.push(a[i]);
  }
}
const CONFIG_RUTA = banderas.get('config') || path.join(aqui, 'comparar-vivo.config.json');
const abortar = (msg) => { console.error('ERROR DE CONFIGURACIÓN: ' + msg); process.exit(2); };
if (!existsSync(CONFIG_RUTA)) abortar(`no existe ${CONFIG_RUTA}`);
const CFG = JSON.parse(readFileSync(CONFIG_RUTA, 'utf8'));
for (const k of ['altoPaginaPx', 'imagenCajaPx', 'fijoCajaPx', 'tamLetraPx', 'interlineadoPx', 'espaciadoLetrasPx', 'pesoDiferencia']) {
  if (typeof CFG.tolerancias?.[k] !== 'number') abortar(`falta la tolerancia «${k}» en ${CONFIG_RUTA}`);
}
const TOL = CFG.tolerancias;
const RAIZ = process.env.BASIS_REFERENCIA || CFG.referenciaRaiz;

const pedidas = banderas.get('paginas') || posicionales[0];
const cuales = !pedidas || pedidas === 'todas' ? Object.keys(CFG.paginas) : pedidas.split(',');
for (const c of cuales) if (!CFG.paginas[c]) abortar(`la página «${c}» no está en la configuración (${Object.keys(CFG.paginas).join(', ')})`);
const pedidosAnchos = banderas.get('anchos') || posicionales[1];
const anchos = !pedidosAnchos || pedidosAnchos === 'todos' ? CFG.anchos : pedidosAnchos.split(',').map(Number);
const SITIO = (banderas.get('sitio') || posicionales[2] || 'http://localhost:8894').replace(/\/+$/, '');
const SAL = banderas.get('salida') || posicionales[3] || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/capturas-comparacion';
const CONTROL_RELLENO = banderas.has('control-relleno') ? Number(banderas.get('control-relleno')) : 0;
if (/basisbodegas\.com|econut\.cl|santaluisadepalpi\.cl/.test(SITIO)) abortar('este guion compara el sitio LOCAL contra la referencia congelada; no se le da un sitio de producción');
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
  // Todo el texto del cuerpo, también el de lo que está oculto (un pliegue cerrado sigue siendo contenido); sin guiones ni hojas de estilo.
  const textoDelCuerpo = () => { const t = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.parentElement || n.parentElement.closest('script,style,noscript,template,[class*=cookieadmin],[id*=cookieadmin]')) continue; t.push(n.textContent); } return limpio(t.join(' ')); };
  const textos = [];
  const imagenes = [];
  // Puntas que se VEN en una foto: su propio border-radius o el de un contenedor cercano que la recorta (overflow distinto de visible).
  // Sin esto una foto con puntas redondeadas en el original y rectas en el local pasaba como «igual» (pasó en Econut y en Basis).
  const puntasDe = (img) => { let e = img; for (let k = 0; k < 4 && e; k++, e = e.parentElement) { const c = getComputedStyle(e); if (c.borderTopLeftRadius !== '0px' && (e === img || c.overflow !== 'visible')) return c.borderTopLeftRadius; } return '0px'; };
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
    if (el.tagName === 'IMG') imagenes.push({ archivo: (el.currentSrc || el.src || '').split('/').pop().split('?')[0].replace(/-[0-9]+x[0-9]+(?=.[a-z0-9]+$)/i, ''), alt: el.alt, caja: rect(r), ajuste: s.objectFit, puntas: puntasDe(el) });
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
  const fijos = [...document.querySelectorAll('a, button')].filter((e) => getComputedStyle(e).position === 'fixed' && !fuera(e)).map((e) => { const r = e.getBoundingClientRect(); return { clase: String(e.className && e.className.baseVal === undefined ? e.className : '').slice(0, 60), caja: { w: Math.round(r.width), h: Math.round(r.height) } }; });
  return { alto: Math.ceil(document.documentElement.scrollHeight), ancho: document.documentElement.scrollWidth, textos, imagenes, cajas, fijos, cuerpoTexto: textoDelCuerpo() };
})()`;

async function leer(url, ancho) {
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
    if (CONTROL_RELLENO) {
      // CONTROL: relleno agregado a propósito arriba del contenido. Todo lo de abajo baja ese tanto y el alto crece igual.
      await evaluar(`(() => { const m = document.querySelector('main') || document.body; m.style.paddingTop = (parseFloat(getComputedStyle(m).paddingTop) + ${CONTROL_RELLENO}) + 'px'; })()`);
      await dormir(400);
    }
    return await evaluar(EXTRAER);
  } finally { await cerrar(); }
}

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]/g, '');
const clave = (t) => norm(t).slice(0, 70);
const num = (v) => parseFloat(v);
const normColor = (c) => String(c).replace(/\s/g, '');
const archivoDe = (src) => String(src || '').split('?')[0].split('/').pop().replace(/-[0-9]+x[0-9]+(?=\.[a-z0-9]+$)/i, '');

/** Carga una referencia congelada, verificando su sha256. Devuelve { med } o { error }. */
function cargarReferencia(ref) {
  const ruta = path.join(RAIZ, ref.archivo);
  if (!existsSync(ruta)) return { error: `no existe la referencia ${ruta}` };
  const bytes = readFileSync(ruta);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== ref.sha256) return { error: `la referencia ${ref.archivo} cambió (sha256 ${hash.slice(0, 12)}… ≠ ${ref.sha256.slice(0, 12)}…): una referencia congelada no se toca` };
  return { med: JSON.parse(bytes.toString('utf8')) };
}

/** De la medida congelada del Divi saca los textos con estilo, el pajar de todo el texto, las imágenes y los fijos. */
function aplanar(med) {
  const bloques = []; const pajar = [];
  const add = (texto, estilo, de) => { if (texto && String(texto).trim()) bloques.push({ texto: String(texto).replace(/\s+/g, ' ').trim(), estilo: estilo || null, de }); };
  for (const s of med.secciones || []) for (const f of s.filas || []) for (const c of f.columnas || []) for (const m of c.modulos || []) {
    pajar.push(m.texto || '');
    if (m.tipo === 'text') for (const b of m.bloques || []) add(b.texto, b.estilo, `text/${b.etiqueta}`);
    else if (m.tipo === 'heading') add(m.texto, m.estilo, `heading/${m.etiqueta}`);
    else if (m.tipo === 'button') add(m.boton?.texto, m.boton?.estilo, 'button');
    else if (m.tipo === 'blurb') { add(m.titulo, m.estiloTitulo, 'blurb/titulo'); add(m.descripcion, m.estiloDescripcion, 'blurb/descripcion'); }
    else if (m.tipo === 'promo') { add(m.titulo, m.estiloTitulo, 'promo/titulo'); add(m.descripcion, m.estiloDescripcion, 'promo/descripcion'); add(m.boton?.texto, m.boton?.estilo, 'promo/boton'); }
    else if (m.tipo === 'accordion') for (const it of m.items || []) { add(it.titulo, it.estiloTitulo, 'accordion/titulo'); add(it.contenido, it.estiloContenido, 'accordion/contenido'); }
  }
  for (const m of med.menu || []) pajar.push(m.texto || '');
  for (const r of med.roles || []) for (const e of r.ejemplos || []) pajar.push(e);
  const radios = med.radios || [];
  const fondos = new Set((med.fondos || []).flatMap((f) => f.urls || []).map(archivoDe));
  // Imágenes que en la referencia estaban ocultas (0×0, p. ej. dentro de un pliegue cerrado): el local puede mostrarlas recortadas sin que sea «sobra».
  const ocultas = new Set((med.imagenes || []).filter((i) => !i.caja || !(i.caja.w > 0 && i.caja.h > 0)).map((i) => archivoDe(i.src || i.actual)));
  const imagenes = (med.imagenes || []).filter((i) => i.caja && i.caja.w > 0 && i.caja.h > 0).map((i) => {
    const wh = `${i.caja.w}x${i.caja.h}`;
    const r = radios.find((q) => q.caja === wh && q.radio !== '0px' && /image|img/.test(q.elemento));
    return { archivo: archivoDe(i.src || i.actual), caja: i.caja, zona: i.zona, puntas: r ? r.radio : '0px' };
  });
  return { bloques, pajar: norm(pajar.join(' ')), imagenes, fondos, ocultas, fijos: med.fijos || [], alto: med.altoPagina };
}

function compararTextos(ref, l) {
  const dif = []; const faltan = []; const sinElemento = [];
  const usados = new Set();
  const hayLocal = norm(l.cuerpoTexto);
  const permitidosFalta = (CFG.textos?.faltaPermitidos || []).map((p) => new RegExp(p.expresion || p));
  const porClave = l.textos.map((t, i) => ({ k: clave(t.texto), i }));
  for (const b of ref.bloques) {
    const F = clave(b.texto); if (!F) continue;
    if (!hayLocal.includes(F)) { if (!permitidosFalta.some((re) => re.test(F))) faltan.push(b); continue; }
    if (!b.estilo) continue;
    let c = porClave.find((x) => !usados.has(x.i) && x.k === F);
    if (!c) c = porClave.find((x) => !usados.has(x.i) && x.k.length >= 12 && (F.startsWith(x.k) || x.k.startsWith(F)));
    if (!c) { sinElemento.push(b); continue; }
    usados.add(c.i);
    const u = l.textos[c.i]; const t = b.estilo; const d = [];
    if (Math.abs(num(u.tam) - num(t.tam)) > TOL.tamLetraPx) d.push(`tamaño ${u.tam}≠${t.tam}`);
    if (t.interlineado !== 'normal' && u.inter !== 'normal') { if (Math.abs(num(u.inter) - num(t.interlineado)) > TOL.interlineadoPx) d.push(`interlineado ${u.inter}≠${t.interlineado}`); } else if ((t.interlineado === 'normal') !== (u.inter === 'normal')) d.push(`interlineado ${u.inter}≠${t.interlineado}`);
    if (Math.abs(num(u.peso) - num(t.peso)) > TOL.pesoDiferencia) d.push(`peso ${u.peso}≠${t.peso}`);
    if (u.familia.toLowerCase() !== String(t.familia).toLowerCase()) d.push(`familia ${u.familia}≠${t.familia}`);
    if (normColor(u.color) !== normColor(t.color)) d.push(`color ${u.color}≠${t.color}`);
    const izq = ['start', 'left'];
    if (u.alinea !== t.alinea && !(izq.includes(u.alinea) && izq.includes(t.alinea))) d.push(`alineación ${u.alinea}≠${t.alinea}`);
    if (u.estilo !== t.estilo) d.push(`cursiva ${u.estilo}≠${t.estilo}`);
    if (u.mayus !== t.mayus) d.push(`mayúsculas ${u.mayus}≠${t.mayus}`);
    const esp = (v) => (v === 'normal' ? 0 : num(v));
    if (Math.abs(esp(u.espaciado) - esp(t.espaciado)) > TOL.espaciadoLetrasPx) d.push(`espaciado ${u.espaciado}≠${t.espaciado}`);
    if (d.length) dif.push({ texto: b.texto.slice(0, 60), de: b.de, tag: u.tag, diferencias: d });
  }
  // SOBRA: texto del local que la referencia no tiene (ni entero ni palabra por palabra, para el texto partido por etiquetas en línea)
  const palabras = new Set(ref.pajarTokens);
  const permitidos = (CFG.textos?.sobraPermitidos || []).map((p) => new RegExp(p.expresion || p));
  const sobran = [];
  for (const t of l.textos) {
    const k = norm(t.texto); if (k.length < 3) continue;
    if (ref.pajar.includes(k)) continue;
    const toks = (t.texto.toLowerCase().match(/[a-z0-9áéíóúñü]{2,}/g) || []);
    if (toks.length >= 3 && toks.every((w) => palabras.has(w))) continue;
    if (permitidos.some((re) => re.test(k))) continue;
    sobran.push(t);
  }
  return { comparados: ref.bloques.length, dif, faltan, sobran, sinElemento };
}

function compararImagenes(ref, l) {
  const dif = []; const usados = new Set();
  const T = TOL.imagenCajaPx;
  for (const im of ref.imagenes) {
    const i = l.imagenes.findIndex((x, j) => !usados.has(j) && x.archivo === im.archivo);
    if (i < 0) { dif.push({ archivo: im.archivo, problema: 'FALTA en el local', referencia: im.caja }); continue; }
    usados.add(i); const u = l.imagenes[i]; const d = [];
    if (Math.abs(u.caja.w - im.caja.w) > T || Math.abs(u.caja.h - im.caja.h) > T) d.push(`tamaño ${u.caja.w}×${u.caja.h}≠${im.caja.w}×${im.caja.h}`);
    if (Math.abs(u.caja.x - im.caja.x) > T) d.push(`x ${u.caja.x}≠${im.caja.x}`);
    if (Math.abs((parseFloat(u.puntas) || 0) - (parseFloat(im.puntas) || 0)) > 1.5) d.push(`puntas ${u.puntas}≠${im.puntas}`);
    if (d.length) dif.push({ archivo: im.archivo, problema: d.join(' · ') });
  }
  const permitidos = (CFG.imagenes?.sobraPermitidos || []).map((p) => new RegExp(p.expresion || p));
  l.imagenes.forEach((x, j) => { if (!usados.has(j) && !ref.fondos.has(x.archivo) && !ref.ocultas.has(x.archivo) && !permitidos.some((re) => re.test(x.archivo))) dif.push({ archivo: x.archivo, problema: 'SOBRA en el local (la referencia no la tiene)', local: x.caja }); });
  return dif;
}

function compararFijos(ref, l) {
  const dif = []; const T = TOL.fijoCajaPx;
  const lf = l.fijos.filter((f) => !/cookie/i.test(f.clase));
  if (lf.length !== ref.fijos.length) dif.push({ problema: `botones fijos: ${lf.length} en el local, ${ref.fijos.length} en la referencia` });
  const orden = (a) => [...a].sort((p, q) => p.caja.w - q.caja.w || p.caja.h - q.caja.h);
  const a = orden(ref.fijos); const b = orden(lf);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (Math.abs(a[i].caja.w - b[i].caja.w) > T || Math.abs(a[i].caja.h - b[i].caja.h) > T) dif.push({ problema: `botón fijo ${b[i].clase || '?'} mide ${b[i].caja.w}×${b[i].caja.h}, la referencia ${a[i].caja.w}×${a[i].caja.h}` });
  }
  return dif;
}

const resumen = [];
let diferenciasTotales = 0; let sinReferencia = 0; let comparaciones = 0;
for (const slug of cuales) {
  const pagina = CFG.paginas[slug];
  if (!pagina.referencias) {
    sinReferencia += 1;
    console.log(`\n=== ${slug}: SIN REFERENCIA CONGELADA (FALLO, no se salta): ${pagina.motivo || 'la configuración no declara referencia'}`);
    resumen.push(`${slug}: SIN REFERENCIA`);
    continue;
  }
  for (const ancho of anchos) {
    const refDecl = pagina.referencias[String(ancho)];
    if (!refDecl) { sinReferencia += 1; console.log(`\n=== ${slug} @${ancho}: SIN REFERENCIA para ese ancho (FALLO)`); resumen.push(`${slug} @${ancho}: SIN REFERENCIA`); continue; }
    const cargada = cargarReferencia(refDecl);
    if (cargada.error) abortar(`${slug} @${ancho}: ${cargada.error}`);
    const ref = aplanar(cargada.med);
    // las palabras sueltas salen del texto original, no del normalizado
    const crudo = [];
    for (const b of ref.bloques) crudo.push(b.texto);
    for (const s of cargada.med.secciones || []) for (const f of s.filas || []) for (const c of f.columnas || []) for (const m of c.modulos || []) crudo.push(m.texto || '');
    for (const m of cargada.med.menu || []) crudo.push(m.texto || '');
    ref.pajarTokens = [...new Set((crudo.join(' ').toLowerCase().match(/[a-z0-9áéíóúñü]{2,}/g) || []))];
    const l = await leer(SITIO + pagina.ruta, ancho);
    comparaciones += 1;
    const t = compararTextos(ref, l);
    const im = compararImagenes(ref, l);
    const fj = compararFijos(ref, l);
    const alto = Math.abs(l.alto - ref.alto) > TOL.altoPaginaPx ? [{ problema: `alto del documento ${l.alto} en el local, ${ref.alto} en la referencia (${l.alto - ref.alto > 0 ? '+' : ''}${l.alto - ref.alto}; tolerancia ±${TOL.altoPaginaPx})` }] : [];
    const total = t.dif.length + t.faltan.length + t.sobran.length + im.length + fj.length + alto.length;
    diferenciasTotales += total;
    const rep = { pagina: slug, ancho, referencia: refDecl.archivo, altoReferencia: ref.alto, altoLocal: l.alto, anchoDocumentoLocal: l.ancho, controlRelleno: CONTROL_RELLENO || undefined, totales: { alto: alto.length, textosConDiferencia: t.dif.length, textosFaltan: t.faltan.length, textosSobran: t.sobran.length, imagenes: im.length, fijos: fj.length, total }, tolerancias: TOL, alto, textos: { comparados: t.comparados, dif: t.dif, faltan: t.faltan, sobran: t.sobran.map((x) => x.texto.slice(0, 80)), sinElementoComparable: t.sinElemento.map((x) => x.texto.slice(0, 80)) }, imagenes: im, fijos: fj };
    writeFileSync(path.join(SAL, `comparacion-estilos-${slug}-${ancho}.json`), JSON.stringify(rep, null, 2));
    console.log(`\n=== ${slug} @${ancho}: alto ${ref.alto} (referencia) / ${l.alto} (local) · ${t.comparados} textos de la referencia · ${total} diferencias`);
    for (const x of alto) console.log(`  ALTO   ${x.problema}`);
    for (const x of t.dif) console.log(`  TEXTO  <${x.tag}> «${x.texto}» ${x.diferencias.join(' · ')}`);
    for (const x of t.faltan) console.log(`  FALTA  (${x.de}) «${x.texto.slice(0, 70)}»`);
    for (const x of t.sobran) console.log(`  SOBRA  <${x.tag}> «${x.texto.slice(0, 70)}»`);
    for (const x of im) console.log(`  IMAGEN ${x.archivo}: ${x.problema}`);
    for (const x of fj) console.log(`  FIJO   ${x.problema}`);
    if (t.sinElemento.length) console.log(`  (info) ${t.sinElemento.length} texto(s) de la referencia están en la página pero sin elemento propio comparable: no se les midió el estilo`);
    resumen.push(`${slug} @${ancho}: ${total} (alto ${alto.length}, textos ${t.dif.length}, faltan ${t.faltan.length}, sobran ${t.sobran.length}, imágenes ${im.length}, fijos ${fj.length}) · alto ${ref.alto}/${l.alto}`);
  }
}
console.log('\n=== RESUMEN\n' + resumen.join('\n'));
if (comparaciones === 0 && !sinReferencia) abortar('no se comparó nada (¿páginas o anchos vacíos?)');
const fallo = diferenciasTotales > 0 || sinReferencia > 0;
console.log(fallo ? `\nFUERA DE CRITERIO: ${diferenciasTotales} diferencia(s)${sinReferencia ? ` y ${sinReferencia} comparación(es) sin referencia` : ''} → código 1` : `\nDENTRO DE CRITERIO: ${comparaciones} comparación(es), 0 diferencias → código 0`);
process.exit(fallo ? 1 : 0);
