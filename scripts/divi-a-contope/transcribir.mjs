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
 *                        [--paginas inicio,contactos] [--anchos 1440,393,768]
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
import { traductorDePerfil, informeDeTokens } from './lib/tokens.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

/**
 * El transcriptor como función, para que lo usen los guiones de cada sitio.
 *
 * `anchos` = [escritorio, celular, tablet?]. Con el tercero (p. ej. 768) se transcribe OTRA VEZ la
 * misma página contra esa medición y sus diferencias con escritorio pasan a reglas con scope
 * `tablet`: ver `fusionarTablet`.
 */
export function transcribirSitio({ original, perfil, paginas, anchos = [1440, 393], carpetaPerfil = process.cwd() }) {
  const [anchoD, anchoM, anchoT] = anchos;
  // El set de diseño del sitio (perfil.tokens): si el perfil lo declara, ningún color ni tipografía llega literal a las reglas.
  const tokens = traductorDePerfil(perfil, carpetaPerfil, (base, rel) => path.resolve(base, rel));
  const reg = new Registro({ tokens, referencia: perfil.origen || '', razon: `Transcrito de ${perfil.origen || 'el sitio original'} (Divi) por divi-a-contope: estilos computados medidos con el navegador.` });
  const informe = [];
  const ajustes = {};
  const salida = { paginas: {}, regiones: null, informe, ajustes, reg, tokens };
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

  // Glifos de las fuentes de íconos del original (datos/glifos.json, ver descarga/glifos.mjs).
  const fGlifos = path.join(original, 'datos', 'glifos.json');
  const glifos = existsSync(fGlifos) ? leer(fGlifos) : {};

  for (const slug of paginas) {
    if (tokens) tokens.pagina = slug;
    const medD = leer(path.join(original, 'datos', `medida-${slug}-${anchoD}.json`));
    const leerOpc = (ancho) => { const f = path.join(original, 'datos', `medida-${slug}-${ancho}.json`); return ancho && existsSync(f) ? leer(f) : null; };
    const medM = leerOpc(anchoM);
    const medT = anchoT ? leerOpc(anchoT) : null;
    // Medición complementaria: una imagen con carga diferida que no se alcanzó a cargar al medir sale con
    // natural 0x0 y su módulo colapsado. Si hay otra medición de la misma página (perfil.medicionComplemento),
    // esos módulos se toman de ella, por posición.
    if (perfil.medicionComplemento) {
      for (const [ancho, med] of [[anchoD, medD], [anchoM, medM], [anchoT, medT]]) {
        const fc = path.join(perfil.medicionComplemento, 'datos', `medida-${slug}-${ancho}.json`);
        if (!med || !existsSync(fc)) continue;
        const comp = leer(fc);
        med.secciones.forEach((sec, i) => (sec.filas || []).forEach((fila, j) => (fila.columnas || []).forEach((col, k) => (col.modulos || []).forEach((mod, n) => {
          if (mod.tipo !== 'image' || !(mod.imagenes || []).some((im) => im.natural === '0x0')) return;
          const alt = comp.secciones?.[i]?.filas?.[j]?.columnas?.[k]?.modulos?.[n];
          if (!alt || alt.tipo !== 'image' || (alt.imagenes || []).some((im) => im.natural === '0x0')) return;
          col.modulos[n] = { ...alt, estiloCaja: mod.estiloCaja || alt.estiloCaja };
          informe.push({ pagina: slug, region: sec.region, seccion: i, fila: j, columna: k, modulo: 'image', clase: 'carga diferida', severidad: 'ok', motivo: `imagen sin cargar al medir (${ancho}): se toma su caja de la medición complementaria` });
        }))));
      }
    }
    const fHtml = path.join(original, 'html', `${slug}.html`);
    const animaciones = { seccion: [], fila: [], columna: [], modulo: [] };
    if (existsSync(fHtml)) {
      for (const e of animacionesPorPosicion(leerHtml(readFileSync(fHtml, 'utf8')))) animaciones[e.nivel].push(e.animacion);
    }

    /** Una pasada completa contra una medición «de celular» (393 o 768). */
    const pasada = (medX, regX, informeX, ajustesX) => {
      const cont = { seccion: 0, fila: 0, columna: 0, modulo: 0 };
      let n = 0;
      const ctx = {
        reg: regX, perfil, ajustes: ajustesX, pagina: slug, informe: informeX, medidaD: medD, medidaM: medX, ubicacionActual: {}, glifos,
        nodo(kind, ruleIds, content, children) {
          const nodo = { id: `${kind}-${++n}`, kind, ruleIds: ruleIds || [] };
          if (content !== undefined) nodo.content = content;
          if (children && children.length) nodo.children = children;
          return nodo;
        },
        avisar(e) { informeX.push({ pagina: slug, ...e }); },
        url(u, ubic, { silencioso = false } = {}) {
          const l = aLocal(u) || (perfil.reemplazos?.medios?.[String(u).split('/').pop().replace(/\?.*$/, '')] || null);
          if (!l && !silencioso) this.avisar({ ...(ubic || this.ubicacionActual), modulo: 'medio', clase: String(u).split('/').pop(), severidad: 'faltante', motivo: `el archivo ${u} no está en la descarga: el nodo queda sin ese medio` });
          return l;
        },
        destino,
        animacion(nivel) { const a = animaciones[nivel][cont[nivel]]; cont[nivel]++; return a || null; },
        get reglasMapaMini() { return perfil.reglasMapa?.mini || []; },
        get reglasMapaGrande() { return perfil.reglasMapa?.grande || []; },
      };
      return transcribirMedicion(ctx, medD, medX);
    };

    const r = pasada(medM, reg, informe, ajustes);
    if (medT) {
      // La pasada de tablet usa un registro y un informe propios: de ella sólo se toma lo que difiere de escritorio.
      const regT = new Registro({ tokens: tokens?.silencioso || null, referencia: perfil.origen || '', razon: reg.razon });
      const rT = pasada(medT, regT, [], {});
      const avisos = [];
      for (const region of ['contenido', 'encabezado', 'pie']) fusionarTablet(r[region], rT[region], reg, regT, avisos, `${slug}/${region}`);
      for (const a of avisos) informe.push({ pagina: slug, modulo: 'tablet', clase: 'estructura', severidad: 'aproximado', motivo: a });
    }
    salida.paginas[slug] = { titulo: (perfil.paginas?.[slug]?.titulo) || medD.titulo, nodos: r.contenido, encabezado: r.encabezado, pie: r.pie, anchoMedido: [medD.ancho, medM?.ancho || null, medT?.ancho || null] };
  }
  return salida;
}

/**
 * TABLET sin tocar ninguna función de transcripción: se transcribe la página una segunda vez contra la
 * medición de tablet (768) como si fuera «el celular»; todo lo que esa pasada guarda como variante `mobile`
 * es, en rigor, lo que cambia a ese ancho respecto de escritorio. Acá esas variantes se re-escopan a
 * `tablet` en el registro de la pasada principal y se agregan a los nodos que corresponden (se emparejan
 * los árboles por posición; si no tienen la misma forma se avisa y esa rama queda con escritorio).
 *
 * Un solo cuidado de orden: las variantes nuevas van al FINAL del registro, después de sus bases, porque en
 * la hoja gana la regla que viene después.
 */
export function fusionarTablet(nodosA, nodosB, regA, regB, avisos, donde) {
  const aTablet = (id) => {
    const m = regB.meta.get(id);
    if (!m || m.bp !== 'mobile') return null;
    return regA.R(m.kind, m.value, { bp: 'tablet', base: m.base, prefijo: m.prefijo, state: m.state });
  };
  const unir = (a, b, ruta) => {
    if (a.kind !== b.kind || (a.children || []).length !== (b.children || []).length) {
      avisos.push(`la forma del nodo ${ruta} (${a.kind}, ${(a.children || []).length} hijos) no calza con la de la pasada de tablet (${b.kind}, ${(b.children || []).length}): esa rama no lleva variantes de tablet`);
      return;
    }
    const extra = (b.ruleIds || []).map(aTablet).filter(Boolean);
    if (extra.length) a.ruleIds = [...(a.ruleIds || []), ...extra.filter((x) => !(a.ruleIds || []).includes(x))];
    if (b.partes) {
      a.partes ||= {};
      for (const [parte, ids] of Object.entries(b.partes)) {
        const ex = ids.map(aTablet).filter(Boolean);
        if (ex.length) a.partes[parte] = [...(a.partes[parte] || []), ...ex.filter((x) => !(a.partes[parte] || []).includes(x))];
      }
    }
    (a.children || []).forEach((h, i) => unir(h, b.children[i], `${ruta}/${h.kind}-${i}`));
  };
  if ((nodosA || []).length !== (nodosB || []).length) {
    avisos.push(`${donde}: ${(nodosA || []).length} secciones en la pasada principal y ${(nodosB || []).length} en la de tablet: sin variantes de tablet`);
    return;
  }
  nodosA.forEach((a, i) => unir(a, nodosB[i], `${donde}/${i}`));
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
  if (!original || !perfilArchivo) { console.error('uso: node transcribir.mjs --original <carpeta> --perfil <perfil.json> --salida <carpeta> [--paginas a,b] [--anchos 1440,393,768]'); process.exit(1); }
  const perfil = JSON.parse(readFileSync(perfilArchivo, 'utf8'));
  const paginas = (arg('paginas') || (perfil.paginasReales || []).join(',')).split(',').filter(Boolean);
  const anchos = (arg('anchos') || '1440,393,768').split(',').map(Number);
  const r = transcribirSitio({ original, perfil, paginas, anchos, carpetaPerfil: path.dirname(path.resolve(perfilArchivo)) });
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
  writeFileSync(path.join(salidaDir, 'INFORME.md'), informeMarkdown(r.informe) + (r.tokens ? '\n' + informeDeTokens(r.tokens.informe()) + '\n' : ''));
  writeFileSync(path.join(salidaDir, 'ajustes.json'), JSON.stringify(r.ajustes, null, 2));
  console.log(`reglas: ${r.reg.reglas.length} · avisos: ${r.informe.length}`);
}
