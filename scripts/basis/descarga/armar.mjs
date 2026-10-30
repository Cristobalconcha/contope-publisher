/**
 * Arma los entregables legibles a partir de las mediciones crudas:
 *   paginas.json, secciones.json, identidad.json, IDENTIDAD.md, integraciones.json
 *   datos/codigo/<pagina>-<n>.html  (código de los módulos "Código", tal como llega)
 *
 * Uso: node armar.mjs <carpeta-original>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const raiz = process.argv[2];
const datos = path.join(raiz, 'datos');
const leer = (f) => JSON.parse(readFileSync(path.join(datos, f), 'utf8'));
const base = leer('paginas-base.json');
const restMedia = leer('rest-media.json');

const hex = (c) => {
  if (!c) return c;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c;
  const p = m[1].split(',').map((x) => Number(x.trim()));
  const h = '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  return p.length > 3 && p[3] !== 1 ? `${h} (opacidad ${p[3]})` : h;
};
const hayColor = (c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
const cargar = (arch, ancho) => { const f = `medida-${arch}-${ancho}.json`; return existsSync(path.join(datos, f)) ? leer(f) : null; };

const paginas = [];
const secciones = [];
const comunes = {};
mkdirSync(path.join(datos, 'codigo'), { recursive: true });

for (const pg of base) {
  const d = cargar(pg.archivo, 1440), m = cargar(pg.archivo, 393);
  if (!d) continue;
  const contenido = d.secciones.filter((s) => s.region === 'contenido');
  const sinDivi = !!d.contenidoPlano;
  paginas.push({
    id: pg.id, slug: pg.slug, tipo: pg.tipo || 'página', url: pg.url, titulo: pg.titulo, tituloNavegador: d.titulo, modificada: pg.modificada,
    esPaginaPorDefectoDeWordPress: !!pg.porDefecto,
    enSitemap: true, meta: { descripcion: d.metaEtiquetas.description || null, robots: d.metaEtiquetas.robots || null, ogTitulo: d.metaEtiquetas['og:title'] || null, ogImagen: d.metaEtiquetas['og:image'] || null },
    canonical: d.canonical || null, clasesBody: d.clasesBody.filter((c) => /^(page-template|page-id|home|et_|et-|single|page)/.test(c)).slice(0, 14),
    construidaConDivi: !sinDivi, seccionesDeContenido: contenido.length, seccionesTotales: d.secciones.length,
    altoEscritorio: d.altoPagina, altoMovil: m ? m.altoPagina : null,
    captura: { escritorio: `capturas/${pg.archivo}-1440.png`, movil: `capturas/${pg.archivo}-393.png` }, html: `html/${pg.archivo}.html`,
    enlacesInternos: d.enlacesInternos, enlacesExternos: d.enlacesExternos,
  });

  const lim = (mo) => { const { codigoHtml, ...resto } = mo; return resto; };
  const crudo = d.codigoOriginal || [];
  let nCodigo = 0;
  const archivosCodigo = [];
  const guardaCodigo = (mo) => {
    const i = nCodigo++;
    const src = crudo[i] !== undefined ? crudo[i] : mo.codigoHtml;
    const archivo = `datos/codigo/${pg.archivo}-${i + 1}.html`;
    writeFileSync(path.join(raiz, archivo), src);
    return archivo;
  };
  const movilPorIndice = new Map((m ? m.secciones : []).map((s) => [s.indice, s]));
  const salidaSecciones = d.secciones.map((s) => {
    const sm = movilPorIndice.get(s.indice);
    const filas = s.filas.map((f) => {
      const mapMod = (mo) => { if (mo.tipo === 'code' || mo.tipo === 'fullwidth_code') { const a = guardaCodigo(mo); const r = lim(mo); r.archivoCodigo = a; return r; } return lim(mo); };
      return f.columnas ? { ...f, columnas: f.columnas.map((c) => ({ ...c, modulos: c.modulos.map(mapMod) })) } : { ...f, modulo: f.modulo ? mapMod(f.modulo) : undefined };
    });
    const modulos = filas.flatMap((f) => (f.columnas || []).flatMap((c) => c.modulos));
    const titulo = (modulos.find((x) => x.tipo === 'heading') || {}).texto || (modulos.find((x) => x.titulo) || {}).titulo || (modulos.find((x) => x.tipo === 'text') || {}).texto || '';
    return {
      orden: s.indice, region: s.region, titulo: titulo.slice(0, 80), tipoSeccionDivi: s.tipo, id: s.id || null, clasesPropias: s.clasesPropias,
      y: s.caja.y, alto: s.caja.h, altoMovil: sm ? sm.caja.h : null,
      fondo: { color: hex(s.fondo), colorCrudo: s.fondo, imagen: s.imagenFondo === 'none' ? null : s.imagenFondo, urlsImagen: s.urlsFondo, tamano: s.tamanoFondo, posicion: s.posicionFondo, repite: s.repiteFondo, adjunto: s.adjuntoFondo, video: s.videoFondo || null, paralaje: s.paralaje },
      relleno: s.relleno, pegajosa: s.pegajosa, divisores: s.divisores, pseudoElementos: s.pseudo, clasesDivi: s.clasesDivi,
      modulosPorTipo: modulos.reduce((a, x) => { a[x.tipo] = (a[x.tipo] || 0) + 1; return a; }, {}),
      filas,
      modulosOcultosEnMovil: sm ? modulosOcultos(s, sm) : null,
    };
  });
  function modulosOcultos(a, b) {
    const va = a.filas.flatMap((f) => (f.columnas || []).flatMap((c) => c.modulos)).filter((x) => x.visible).length;
    const vb = b.filas.flatMap((f) => (f.columnas || []).flatMap((c) => c.modulos)).filter((x) => x.visible).length;
    return va - vb;
  }
  // regiones comunes (encabezado y pie) se guardan una sola vez; se verifica que sean iguales en todas
  for (const reg of ['encabezado', 'pie']) {
    const sec = salidaSecciones.filter((s) => s.region === reg);
    const firma = JSON.stringify(sec.map((s) => s.filas.map((f) => (f.columnas || []).map((c) => c.modulos.map((x) => x.texto || x.tipo).join('|')).join('/')))).replace(/\s+/g, ' ');
    if (!comunes[reg]) comunes[reg] = { origen: pg.archivo, firma, secciones: sec, igualEnTodas: true, difierenEn: [] };
    else if (comunes[reg].firma !== firma) { comunes[reg].igualEnTodas = false; comunes[reg].difierenEn.push(pg.archivo); }
  }
  secciones.push({ pagina: pg.archivo, url: pg.url, porDefecto: !!pg.porDefecto, contenidoSinDivi: d.contenidoPlano ? d.contenidoPlano : null, secciones: salidaSecciones.filter((s) => s.region === 'contenido') });
}
for (const k of Object.keys(comunes)) delete comunes[k].firma;
writeFileSync(path.join(raiz, 'paginas.json'), JSON.stringify({ sitio: 'https://basisbodegas.com/', generado: new Date().toISOString(), cantidad: paginas.length, paginas }, null, 2));
writeFileSync(path.join(raiz, 'secciones.json'), JSON.stringify({ nota: 'Encabezado y pie son plantillas del Theme Builder de Divi: se guardan una vez en "comunes". Cada página trae sólo sus secciones de contenido.', comunes, paginas: secciones }, null, 2));

// ------------------------------------------------------------ identidad
const reales = base.filter((p) => !p.porDefecto).map((p) => p.archivo);
const acum = (clave, destino, v, n) => { destino[clave] = (destino[clave] || 0) + n; };
const colTexto = {}, colFondo = {}, areaFondo = {};
const roles = {};
const radios = {};
const fuentes = {};
const variables = {};
const botones = [];
for (const arch of reales) {
  for (const ancho of [1440, 393]) {
    const d = cargar(arch, ancho); if (!d) continue;
    if (ancho === 1440) {
      for (const [c, n] of d.colores.texto) acum(hex(c), colTexto, c, n);
      for (const [c, n] of d.colores.fondo) acum(hex(c), colFondo, c, n);
      for (const [c, n] of d.colores.areaFondo) acum(hex(c), areaFondo, c, n);
      for (const r of d.radios) { const k = r.zona + ' · ' + r.elemento.replace(/\.wp-image-\d+/, '').replace(/\.et_pb_bg_layout_\w+/, '') + ' · ' + r.radio; radios[k] = radios[k] || { ...r, ocurrencias: 0, paginas: new Set() }; radios[k].ocurrencias++; radios[k].paginas.add(arch); }
      for (const f of d.fuentes) if (f.estado === 'loaded') fuentes[f.familia + ' ' + f.peso + ' ' + f.estilo] = f;
      Object.assign(variables, d.variablesCss);
    }
    for (const r of d.roles) {
      const k = r.rol + '|' + r.familia + '|' + r.peso + '|' + hex(r.color);
      const e = roles[k] || (roles[k] = { rol: r.rol, familia: r.familia, peso: r.peso, color: hex(r.color), estilo: r.estilo, mayus: r.mayus, espaciado: r.espaciado, escritorio: {}, movil: {}, ejemplos: [], paginas: new Set(), caracteres: 0 });
      const lado = ancho === 1440 ? e.escritorio : e.movil;
      lado[r.tam + '/' + r.interlineado] = (lado[r.tam + '/' + r.interlineado] || 0) + r.cantidad;
      if (ancho === 1440) { e.caracteres += r.caracteres; e.paginas.add(arch); for (const x of r.ejemplos) if (e.ejemplos.length < 2 && !e.ejemplos.includes(x)) e.ejemplos.push(x); }
    }
  }
}
const ord = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([color, v]) => ({ color, valor: v }));
const rolesLista = Object.values(roles).sort((a, b) => b.caracteres - a.caracteres).map((r) => ({ ...r, paginas: [...r.paginas] }));
const radiosLista = Object.values(radios).map((r) => ({ ...r, paginas: [...r.paginas] })).sort((a, b) => b.ocurrencias - a.ocurrencias);

// Fondos por sección y botones (estilos reales)
const fondosPorSeccion = [];
for (const arch of reales) {
  const d = cargar(arch, 1440); if (!d) continue;
  for (const s of d.secciones) {
    fondosPorSeccion.push({ pagina: arch, region: s.region, orden: s.indice, alto: s.caja.h, color: hex(s.fondo), imagen: s.urlsFondo.map((u) => u.split('/').pop()), gradiente: /gradient/.test(s.imagenFondo) ? s.imagenFondo : null, video: !!s.videoFondo });
    for (const f of s.filas) for (const c of f.columnas || []) for (const mo of c.modulos) {
      if (mo.boton) botones.push({ pagina: arch, texto: mo.boton.texto, destino: mo.boton.destino, fondo: hex(mo.boton.estilo.fondo), color: hex(mo.boton.estilo.color), familia: mo.boton.estilo.familia, tam: mo.boton.estilo.tam, peso: mo.boton.estilo.peso, radio: mo.boton.estilo.radio, borde: mo.boton.estilo.borde, relleno: mo.boton.estilo.relleno, sombra: mo.boton.estilo.sombra });
      if (mo.tipo === 'promo' && mo.boton) botones.push({ pagina: arch, texto: mo.boton.texto, destino: mo.boton.destino, fondo: hex(mo.boton.estilo.fondo), color: hex(mo.boton.estilo.color), familia: mo.boton.estilo.familia, tam: mo.boton.estilo.tam, peso: mo.boton.estilo.peso, radio: mo.boton.estilo.radio, borde: mo.boton.estilo.borde, relleno: mo.boton.estilo.relleno });
    }
  }
}
// formularios: estilo del botón de envío y campos
const contactos = cargar('contactos', 1440);
const estiloForm = contactos ? { enviar: (contactos.formularios[0] || {}).enviar, roles: contactos.roles.filter((r) => /^formulario/.test(r.rol)) } : null;

const identidad = {
  nota: 'Todo medido con estilos computados en Chrome (no leído del CSS). Colores en #HEX; "valor" de color de texto = caracteres que lo usan, de fondo = número de cajas, de área = píxeles cuadrados de superficie.',
  paginasMedidas: reales,
  cuerpo: (cargar('inicio', 1440) || {}).cuerpo,
  colores: { texto: ord(colTexto), fondosPorNumeroDeCajas: ord(colFondo), fondosPorArea: ord(areaFondo) },
  tipografia: { familiasCargadas: Object.values(fuentes).map((f) => `${f.familia} ${f.peso} ${f.estilo}`).sort(), roles: rolesLista },
  botones, formulario: estiloForm,
  radios: radiosLista.map(({ elemento, radio, caja, zona, borde, sombra, ocurrencias, paginas }) => ({ elemento, radio, caja, zona, borde, sombra, ocurrencias, paginas })),
  fondosPorSeccion, variablesCssDivi: variables,
};
writeFileSync(path.join(raiz, 'identidad.json'), JSON.stringify(identidad, null, 2));

// ------------------------------------------------------------ resumen legible
const L = [];
L.push('# Identidad medida de basisbodegas.com', '', `Medida el ${new Date().toISOString().slice(0, 10)} con Chrome, sobre estilos computados (lo que se ve), en escritorio 1440 y celular 393.`, '');
L.push('## Colores', '', '**Fondos, por superficie ocupada**', '');
for (const c of ord(areaFondo).slice(0, 10)) L.push(`- ${c.color}  (${Math.round(c.valor / 1000)} mil px²)`);
L.push('', '**Texto, por caracteres**', '');
for (const c of ord(colTexto).slice(0, 10)) L.push(`- ${c.color}  (${c.valor})`);
L.push('', '## Tipografía por rol (escritorio → celular)', '');
for (const r of rolesLista.slice(0, 40)) {
  const e = Object.keys(r.escritorio).join(' / '), mv = Object.keys(r.movil).join(' / ');
  L.push(`- **${r.rol}** — ${r.familia} ${r.peso}${r.estilo !== 'normal' ? ' ' + r.estilo : ''}${r.mayus !== 'none' ? ' ' + r.mayus : ''}, color ${r.color}, ${e} → ${mv || '—'}  (ej.: «${(r.ejemplos[0] || '').slice(0, 40)}»)`);
}
L.push('', '## Botones', '');
for (const b of botones) L.push(`- «${b.texto}» (${b.pagina}) fondo ${b.fondo}, texto ${b.color}, ${b.familia} ${b.tam}/${b.peso}, radio ${b.radio}, borde ${b.borde}, relleno ${b.relleno} → ${b.destino}`);
L.push('', '## Radios de esquina (fotos, videos, botones, tarjetas)', '');
for (const r of radiosLista.slice(0, 20)) L.push(`- ${r.zona}: ${r.elemento} → ${r.radio} (${r.caja}, ${r.ocurrencias} veces)`);
L.push('', '## Fondos por sección', '');
for (const f of fondosPorSeccion) L.push(`- ${f.pagina} · ${f.region} #${f.orden} (${f.alto}px): ${f.color}${f.imagen.length ? ' + imagen ' + f.imagen.join(', ') : ''}${f.gradiente ? ' + degradado ' + f.gradiente : ''}${f.video ? ' + video' : ''}`);
writeFileSync(path.join(raiz, 'IDENTIDAD.md'), L.join('\n'));

// ------------------------------------------------------------ integraciones
const integ = { generado: new Date().toISOString(), porPagina: {} };
const todos = { gtm: new Set(), ga: new Set(), mapboxTokens: new Set(), redes: new Set(), iframes: [], whatsapp: [], cookies: [] };
for (const pg of base) {
  const d = cargar(pg.archivo, 1440); if (!d) continue;
  const t = d.terceros;
  t.gtm.forEach((x) => todos.gtm.add(x)); t.ga.forEach((x) => todos.ga.add(x)); t.mapbox.tokens.forEach((x) => todos.mapboxTokens.add(x)); t.redes.forEach((x) => todos.redes.add(x));
  integ.porPagina[pg.archivo] = {
    formularios: d.formularios.map((f) => ({ id: f.id, motor: f.motor, envia_a: f.accion, metodo: f.metodo, honeypot: f.honeypot, recaptcha: f.recaptcha, camposOcultos: f.camposOcultos, campos: f.campos, botonEnviar: f.enviar && f.enviar.texto })),
    mapbox: t.mapbox, iframes: t.iframes, whatsapp: t.whatsapp.map((w) => ({ href: w.href, posicion: w.posicion, caja: w.caja })), redes: t.redes, contacto: t.contacto, cookies: t.cookies, gtm: t.gtm, ga: t.ga, fijos: d.fijos,
    guionesExternos: [...new Set(d.guiones.filter((g) => g.src && !g.src.startsWith('https://basisbodegas.com/')).map((g) => g.src))],
    guionesPropios: [...new Set(d.guiones.filter((g) => g.src && g.src.startsWith('https://basisbodegas.com/')).map((g) => g.src.replace('https://basisbodegas.com/', '').replace(/\?.*/, '')))],
    hojasExternas: [...new Set(d.hojas.filter((h) => !h.startsWith('https://basisbodegas.com/')))],
  };
}
// plugins y tema deducidos de rutas de scripts y hojas (todas las páginas)
const rutas = new Set();
for (const pg of base) { const d = cargar(pg.archivo, 1440); if (!d) continue; for (const u of [...d.guiones.map((g) => g.src), ...d.hojas]) { const m = (u || '').match(/wp-content\/(plugins|themes)\/([^/]+)\//); if (m) rutas.add(m[1] + ':' + m[2]); } }
integ.complementosYTemaDetectados = [...rutas].sort();
integ.resumen = { gtm: [...todos.gtm], ga: [...todos.ga], mapboxTokensPublicos: [...todos.mapboxTokens].length, redes: [...todos.redes] };
writeFileSync(path.join(raiz, 'integraciones.json'), JSON.stringify(integ, null, 2));
console.log('listo:', paginas.length, 'páginas ·', secciones.reduce((s, p) => s + p.secciones.length, 0), 'secciones de contenido ·', rolesLista.length, 'roles tipográficos');
