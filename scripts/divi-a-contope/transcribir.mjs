/**
 * Transcriptor Divi → ContOpe.
 *
 * Entrada:  las mediciones de una descarga (datos/medida-<pagina>-<ancho>.json,
 *           hechas con el navegador sobre el sitio vivo: estilos computados, no
 *           CSS leído) y, si están, los HTML renderizados (html/<pagina>.html)
 *           para leer las animaciones.
 * Salida:   por página, un JSON con las reglas de diseño y el árbol de nodos en
 *           el formato que entiende `cod_preview_canvas_composition` (el mismo
 *           de scripts/econut/componer.mjs), más las regiones globales
 *           (encabezado y pie), un informe de lo que no supo transcribir y los
 *           ajustes del sitio que descubrió (p. ej. el número de WhatsApp).
 *
 * Uso:
 *   node transcribir.mjs --original <carpeta> --perfil <perfil.json> --salida <carpeta>
 *                        [--paginas inicio,contactos] [--anchos 1440,393]
 *
 * <carpeta> es la de la descarga: contiene datos/ y html/. Ver README.md.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Registro } from './lib/registro.mjs';
import { leerHtml } from './lib/util.mjs';
import { animacionesPorPosicion } from './lib/animacion.mjs';
import { transcribirMedicion } from './lib/estructura.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

/** El transcriptor como función, para que lo usen los guiones de cada sitio. */
export function transcribirSitio({ original, perfil, paginas, anchos = [1440, 393] }) {
  const [anchoD, anchoM] = anchos;
  const reg = new Registro({ referencia: perfil.origen || '', razon: `Transcrito de ${perfil.origen || 'el sitio original'} (Divi) por divi-a-contope: estilos computados medidos con el navegador.` });
  const informe = [];
  const ajustes = {};
  const salida = { paginas: {}, regiones: null, informe, ajustes, reg };
  const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));

  // URL original → URL del sitio nuevo, sólo si el archivo está de verdad en el uploads local.
  const origen = (perfil.origen || '').replace(/\/+$/, '');
  const aLocal = (u) => {
    try {
      const url = new URL(u, origen + '/');
      if (url.origin !== new URL(origen).origin) return null;
      const m = url.pathname.match(/\/wp-content\/uploads\/(.+)$/);
      if (!m) return null;
      const rel = decodeURIComponent(m[1]);
      const sinTam = rel.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1');
      for (const r of [rel, sinTam]) if (perfil.carpetaUploads && existsSync(path.join(perfil.carpetaUploads, r))) return '/wp-content/uploads/' + r.split('/').map(encodeURIComponent).join('/').replace(/%40/g, '@');
      return null;
    } catch { return null; }
  };
  const destino = (href) => {
    if (!href) return null;
    const h = String(href).trim();
    if (!h || h === '#') return null;
    if (/^(mailto:|tel:)/.test(h) || /^https?:\/\/(wa\.me|api\.whatsapp)/.test(h)) return { href: h, blank: true };
    if (h.startsWith('#')) return { href: h, blank: false };
    try {
      const url = new URL(h, origen + '/');
      if (url.origin === new URL(origen).origin) {
        if (/\/wp-content\/uploads\//.test(url.pathname)) { const l = aLocal(h); return l ? { href: l, blank: true } : null; }
        let p = url.pathname.replace(/\/+$/, '') + '/';
        if (perfil.rutas && perfil.rutas[p]) p = perfil.rutas[p];
        return { href: p + (url.hash || ''), blank: false };
      }
      return { href: url.href, blank: true };
    } catch { return null; }
  };

  for (const slug of paginas) {
    const medD = leer(path.join(original, 'datos', `medida-${slug}-${anchoD}.json`));
    const fM = path.join(original, 'datos', `medida-${slug}-${anchoM}.json`);
    const medM = existsSync(fM) ? leer(fM) : null;
    const fHtml = path.join(original, 'html', `${slug}.html`);
    const anim = { seccion: [], fila: [], columna: [], modulo: [] };
    if (existsSync(fHtml)) {
      for (const e of animacionesPorPosicion(leerHtml(readFileSync(fHtml, 'utf8')))) anim[e.nivel].push(e.animacion);
    }
    const cont = { seccion: 0, fila: 0, columna: 0, modulo: 0 };
    let n = 0;
    const ctx = {
      reg, perfil, ajustes, pagina: slug, informe, medidaD: medD, medidaM: medM, ubicacionActual: {},
      nodo(kind, ruleIds, content, children) {
        const nodo = { id: `${kind}-${++n}`, kind, ruleIds: ruleIds || [] };
        if (content !== undefined) nodo.content = content;
        if (children && children.length) nodo.children = children;
        return nodo;
      },
      avisar(e) { informe.push({ pagina: slug, ...e }); },
      url(u, ubic, { silencioso = false } = {}) {
        const l = aLocal(u) || (perfil.reemplazos?.medios?.[String(u).split('/').pop().replace(/\?.*$/, '')] || null);
        if (!l && !silencioso) this.avisar({ ...(ubic || this.ubicacionActual), modulo: 'medio', clase: String(u).split('/').pop(), severidad: 'faltante', motivo: `el archivo ${u} no está en la descarga: el nodo queda sin ese medio` });
        return l;
      },
      destino,
      animacion(nivel) { const a = anim[nivel][cont[nivel]]; cont[nivel]++; return a || null; },
      get reglasMapaMini() { return perfil.reglasMapa?.mini || []; },
      get reglasMapaGrande() { return perfil.reglasMapa?.grande || []; },
    };
    const r = transcribirMedicion(ctx, medD, medM);
    salida.paginas[slug] = { titulo: (perfil.paginas?.[slug]?.titulo) || medD.titulo, nodos: r.contenido, encabezado: r.encabezado, pie: r.pie, anchoMedido: [medD.ancho, medM?.ancho || null] };
  }
  return salida;
}

/** Ids de regla que usa un árbol de nodos (ruleIds y partes). */
export const reglasUsadas = (nodos) => {
  const s = new Set();
  const v = (n) => {
    (n.ruleIds || []).forEach((i) => s.add(i));
    if (n.partes) Object.values(n.partes).forEach((l) => l.forEach((i) => s.add(i)));
    (n.children || []).forEach(v);
  };
  nodos.forEach(v);
  return s;
};

export const disenoDe = (reg, nodos, designId) => ({
  schemaVersion: 1, designId, expectedDesignRevision: 2, reviewState: 'session',
  rules: reg.reglas.filter((r) => reglasUsadas(nodos).has(r.id)),
});

export function informeMarkdown(informe, titulo = 'Informe del transcriptor Divi → ContOpe') {
  const orden = { faltante: 0, 'sin-transcribir': 1, aproximado: 2, ok: 3 };
  const por = {};
  for (const e of informe) (por[e.severidad] ||= []).push(e);
  const L = [`# ${titulo}`, ''];
  const res = Object.keys(orden).map((k) => `${k}: ${(por[k] || []).length}`).join(' · ');
  L.push(res, '');
  L.push('«faltante» = un archivo que el original usa y no está en la descarga · «sin-transcribir» = un módulo o patrón que el transcriptor no supo convertir · «aproximado» = se convirtió con una diferencia conocida · «ok» = informativo.', '');
  for (const k of Object.keys(orden)) {
    if (!(por[k] || []).length) continue;
    L.push(`## ${k}`, '');
    const vistos = new Set();
    for (const e of por[k]) {
      const lugar = [e.pagina, e.region, e.seccion !== undefined ? `sección ${e.seccion}` : '', e.fila !== undefined ? `fila ${e.fila}` : '', e.columna !== undefined ? `col ${e.columna}` : '', e.modulo, e.clase].filter((x) => x !== undefined && x !== '').join(' › ');
      const linea = `- ${lugar}: ${e.motivo}`;
      if (vistos.has(linea)) continue;
      vistos.add(linea);
      L.push(linea);
    }
    L.push('');
  }
  return L.join('\n');
}

// ---- CLI ------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = arg('original');
  const perfilArchivo = arg('perfil');
  const salidaDir = arg('salida', 'salida');
  if (!original || !perfilArchivo) { console.error('uso: node transcribir.mjs --original <carpeta> --perfil <perfil.json> --salida <carpeta> [--paginas a,b] [--anchos 1440,393]'); process.exit(1); }
  const perfil = JSON.parse(readFileSync(perfilArchivo, 'utf8'));
  const paginas = (arg('paginas') || (perfil.paginasReales || []).join(',')).split(',').filter(Boolean);
  const anchos = (arg('anchos') || '1440,393').split(',').map(Number);
  const r = transcribirSitio({ original, perfil, paginas, anchos });
  mkdirSync(salidaDir, { recursive: true });
  const designId = perfil.designId || 'sitio-web';
  for (const [slug, p] of Object.entries(r.paginas)) {
    writeFileSync(path.join(salidaDir, `${slug}.componer.json`), JSON.stringify({ titulo: p.titulo, slug, design: disenoDe(r.reg, p.nodos, designId), composition: { schemaVersion: 2, nodes: p.nodos } }, null, 2));
    console.log(`${slug}: ${p.nodos.length} secciones`);
  }
  const primera = Object.values(r.paginas)[0];
  if (primera) {
    writeFileSync(path.join(salidaDir, 'region-header.componer.json'), JSON.stringify({ design: disenoDe(r.reg, primera.encabezado, designId), composition: { schemaVersion: 2, nodes: primera.encabezado } }, null, 2));
    writeFileSync(path.join(salidaDir, 'region-footer.componer.json'), JSON.stringify({ design: disenoDe(r.reg, primera.pie, designId), composition: { schemaVersion: 2, nodes: primera.pie } }, null, 2));
  }
  writeFileSync(path.join(salidaDir, 'informe.json'), JSON.stringify(r.informe, null, 2));
  writeFileSync(path.join(salidaDir, 'INFORME.md'), informeMarkdown(r.informe));
  writeFileSync(path.join(salidaDir, 'ajustes.json'), JSON.stringify(r.ajustes, null, 2));
  console.log(`reglas: ${r.reg.reglas.length} · avisos: ${r.informe.length}`);
}
