/**
 * Descarga los medios que USA un sitio WordPress público (GET), en su tamaño
 * original, respetando la ruta uploads/AAAA/MM, y arma medios.json con tamaño
 * y dónde aparece cada uno.
 *
 * Fuentes de la lista: mediciones del navegador (imágenes, fondos, videos,
 * PDF, íconos), el registro de red de cada carga (tipografías, videos), los
 * HTML tal como llegaron y la biblioteca pública /wp-json/wp/v2/media.
 *
 * "Original": WordPress guarda miniaturas como nombre-300x200.jpg; se prueba
 * sin el sufijo y, si el servidor lo tiene (HEAD 200), se baja ése.
 *
 * Uso: node descargar-medios.mjs <carpeta-original>
 * Sólo lectura sobre el sitio; pausa entre peticiones.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const raiz = process.argv[2];
const ORIGEN = 'https://basisbodegas.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
const datos = path.join(raiz, 'datos');

const clave = new Map(); // urlOriginalProbable -> registro
const nuevo = (u) => ({ url: u, variantes: new Set(), usos: [], enBiblioteca: false, mimeRed: '' });
const registrar = (url, uso, variante) => {
  if (!url || url.startsWith('data:')) return;
  let u = url.split('#')[0];
  const esUpload = /\/wp-content\/uploads\//.test(u);
  const esOtroMedio = /\.(woff2?|ttf|otf|eot|mp4|webm|mov|pdf)(\?|$)/i.test(u) && u.startsWith(ORIGEN + '/wp-content/');
  if (!esUpload && !esOtroMedio) return;
  u = u.replace(/\?.*$/, '');
  const base = u.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
  const r = clave.get(base) || (() => { const x = nuevo(base); clave.set(base, x); return x; })();
  if (base !== u) r.variantes.add(u);
  if (uso) r.usos.push(uso);
  return r;
};

// 1. biblioteca pública
for (const m of leer(path.join(datos, 'rest-media.json'))) {
  const r = registrar(m.source_url, null);
  if (r) { r.enBiblioteca = true; r.idBiblioteca = m.id; r.mime = m.mime_type; r.alt = m.alt_text || ''; if (m.media_details && m.media_details.width) r.dim = m.media_details.width + 'x' + m.media_details.height; }
}
// 2. mediciones y red
const archivos = readdirSync(datos);
for (const f of archivos.filter((x) => /^medida-.*-1440\.json$/.test(x))) {
  const pagina = f.replace(/^medida-/, '').replace(/-1440\.json$/, '');
  const d = leer(path.join(datos, f));
  for (const i of d.imagenes) {
    registrar(i.actual, { pagina, zona: i.zona, seccion: i.seccion, como: 'img', caja: i.caja, alt: i.alt }, null);
    for (const u of [i.src, ...i.srcset.split(',').map((s) => s.trim().split(' ')[0])]) if (u) registrar(abs(u), null);
  }
  for (const x of d.fondos) for (const u of x.urls) registrar(u, { pagina, zona: x.zona, seccion: x.seccion, como: 'fondo css', elemento: x.elemento, caja: x.caja });
  for (const v of d.videos) { for (const u of [v.src, ...v.fuentes, v.poster]) registrar(u, { pagina, zona: v.zona, seccion: v.seccion, como: 'video', caja: v.caja }); }
  for (const s of d.secciones) if (s.videoFondo) for (const u of [...s.videoFondo.fuentes, s.videoFondo.poster]) registrar(u, { pagina, zona: s.region, seccion: s.indice, como: 'video de fondo de sección' });
  for (const p of d.pdfs) registrar(p.href, { pagina, zona: p.zona, como: 'enlace a PDF', texto: p.texto });
  for (const i of d.iconos) registrar(i.href, { pagina, como: 'ícono del sitio (' + i.rel + ' ' + i.tamanos + ')' });
  for (const k of ['og:image', 'twitter:image']) if (d.metaEtiquetas[k]) registrar(d.metaEtiquetas[k], { pagina, como: 'meta ' + k });
}
function abs(u) { try { return u ? new URL(u, ORIGEN).href : ''; } catch { return ''; } }
for (const f of archivos.filter((x) => /^red-.*-1440\.json$/.test(x))) {
  const pagina = f.replace(/^red-/, '').replace(/-1440\.json$/, '');
  for (const e of leer(path.join(datos, f))) {
    if (/^(font|video|application\/pdf|application\/font)/.test(e.mime || '') || /\.(woff2?|ttf|otf|mp4|webm)(\?|$)/i.test(e.url) || e.tipo === 'Font' || e.tipo === 'Media') {
      const r = registrar(e.url, { pagina, como: 'red:' + (e.tipo || e.mime) });
      if (r) r.mimeRed = e.mime || r.mimeRed;
    }
  }
}
// 3. HTML tal como llegó
for (const f of readdirSync(path.join(raiz, 'html'))) {
  const pagina = f.replace(/\.html$/, '');
  const h = readFileSync(path.join(raiz, 'html', f), 'utf8');
  for (const m of h.matchAll(/https?:\/\/basisbodegas\.com\/wp-content\/uploads\/[^"'\s)\\,]+\.(?:png|jpe?g|gif|webp|svg|mp4|webm|pdf|ico|avif)/gi)) registrar(m[0], { pagina, como: 'html' });
}

// fuentes externas (Google Fonts): del registro de red
const fuentesExternas = new Map();
for (const f of archivos.filter((x) => /^red-.*-1440\.json$/.test(x))) for (const e of leer(path.join(datos, f))) if (/fonts\.(gstatic|googleapis)\.com/.test(e.url) || (/^font\//.test(e.mime || '') && !e.url.startsWith(ORIGEN))) fuentesExternas.set(e.url, e);

// ---- descarga
const sal = path.join(raiz, 'medios');
const resultado = [];
const baja = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || '' };
};
const existe = async (url) => { try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }); return r.ok; } catch { return false; } };
const medidaImagen = (buf) => {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20);
    if (buf[0] === 0xff && buf[1] === 0xd8) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const t = buf[i + 1]; if (t >= 0xc0 && t <= 0xcf && t !== 0xc4 && t !== 0xc8 && t !== 0xcc) return buf.readUInt16BE(i + 7) + 'x' + buf.readUInt16BE(i + 5); i += 2 + buf.readUInt16BE(i + 2); } }
  } catch { /* sin medida */ }
  return '';
};

for (const r of clave.values()) {
  let url = r.url; let nota = '';
  // Si la "base" (sin sufijo) no existe, usar la variante vista más grande.
  if (r.variantes.size && !(await existe(url))) {
    const v = [...r.variantes].sort((a, b) => (Number((b.match(/-(\d+)x\d+\./) || [])[1]) || 0) - (Number((a.match(/-(\d+)x\d+\./) || [])[1]) || 0))[0];
    nota = 'el original sin sufijo no existe; se bajó la variante más grande vista'; url = v;
    await pausa(300);
  }
  const rel = decodeURIComponent(url.replace(ORIGEN + '/wp-content/', ''));
  const destino = path.join(sal, rel);
  mkdirSync(path.dirname(destino), { recursive: true });
  try {
    let buf, mime;
    if (existsSync(destino) && statSync(destino).size > 0) { buf = readFileSync(destino); mime = r.mime || ''; } else { ({ buf, mime } = await baja(url)); writeFileSync(destino, buf); await pausa(450); }
    resultado.push({ archivo: path.basename(destino), rutaLocal: path.relative(raiz, destino).replace(/\\/g, '/'), urlOriginal: url, bytes: buf.length, tipo: mime.split(';')[0] || r.mime || r.mimeRed, dimensiones: medidaImagen(buf) || r.dim || '', alt: r.alt || '', enBibliotecaWordPress: r.enBiblioteca, idBiblioteca: r.idBiblioteca || null, variantesVistas: [...r.variantes].map((x) => x.split('/').pop()), usadoEn: r.usos, nota });
  } catch (e) {
    resultado.push({ archivo: path.basename(destino), urlOriginal: url, error: e.message, usadoEn: r.usos, nota });
  }
}
// tipografías externas
for (const [url, e] of fuentesExternas) {
  const nombre = url.includes('fonts.gstatic.com') ? url.split('/').slice(-3).join('_') : url.includes('fonts.googleapis.com') ? 'css_' + Buffer.from(url).toString('base64').slice(0, 24).replace(/[^a-z0-9]/gi, '') + '.css' : url.split('/').pop();
  const destino = path.join(sal, 'fonts-externas', nombre);
  mkdirSync(path.dirname(destino), { recursive: true });
  try { const { buf, mime } = await baja(url); writeFileSync(destino, buf); await pausa(400); resultado.push({ archivo: nombre, rutaLocal: path.relative(raiz, destino).replace(/\\/g, '/'), urlOriginal: url, bytes: buf.length, tipo: mime.split(';')[0], usadoEn: [{ como: 'tipografía de Google Fonts' }] }); }
  catch (er) { resultado.push({ archivo: nombre, urlOriginal: url, error: er.message }); }
}
resultado.sort((a, b) => (a.rutaLocal || '').localeCompare(b.rutaLocal || ''));
const total = resultado.reduce((s, x) => s + (x.bytes || 0), 0);
writeFileSync(path.join(raiz, 'medios.json'), JSON.stringify({ generado: new Date().toISOString(), cantidad: resultado.length, bytesTotales: total, megabytes: Math.round(total / 1048576 * 100) / 100, medios: resultado }, null, 2));
console.log(`${resultado.length} medios · ${(total / 1048576).toFixed(2)} MB · errores: ${resultado.filter((x) => x.error).length}`);
