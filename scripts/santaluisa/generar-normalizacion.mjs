/**
 * Arma el archivo de `--build` para unificar tamaños de letra, leyendo los
 * cuerpos de regla que ya existen.
 *
 * POR QUÉ UN GENERADOR Y NO ESCRIBIRLO A MANO. `setRule` del editor REEMPLAZA la
 * regla entera: si se escribe sólo `font-size`, el resto del cuerpo se borra en
 * silencio. Copiar a mano veinte cuerpos de regla es garantizar que uno salga
 * mal. Esto los lee del documento y cambia una sola propiedad.
 *
 * CÓMO SE USA. Se declara el mapa de abajo —selector → tamaño nuevo— y el guion
 * produce el JSON. Las reglas que ya están en el tamaño pedido se omiten, y las
 * que no existen se avisan en vez de inventarse.
 *
 * Respeta los cortes de pantalla: una regla que vive dentro de un @media se
 * reescribe dentro del mismo @media, porque esos cortes están congelados por
 * decisión de Cristóbal (nacen de la diferencia real entre iPhone y Android).
 *
 *   node generar-normalizacion.mjs > normalizar-santaluisa.json
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const WP = 'C:/Users/Cristobal concha/wp-local/wordpress/wp-load.php';
const TMP = 'C:/Users/Cristobal concha/wp-local/.generar-normalizacion.php';
const DOC = 'ocd-canvas-page-7';

/**
 * LO APROBADO POR CRISTÓBAL el 5 de octubre de 2026, mirando la comparación
 * visual. Cada familia a un solo tamaño.
 */
const PLAN = {
  // Texto que se lee dentro de una tarjeta o una lista.
  '.faq__item p': '13px',
  '.contacto__list': '13px',
  '.exit-card__desc': '13px',
  '.lote-ficha__row': '13px',

  // Etiquetas y controles: el mismo papel, el mismo tamaño.
  '.ubicacion__filters select': '11.5px',
  '.feature-card__label': '11.5px',
  '.ubicacion__maps': '11.5px',
  '.plano-contacto__btn': '11.5px',

  // Notas al pie. Las cinco en tierra-500, de 9,5 a 11,5.
  '.plano-frame__legend-osm p': '11.5px',
  '.plano-frame__attrib': '11.5px',
  '.lote-ficha--compact .lote-ficha__hint': '11.5px',
  '.modelos-nota': '11.5px',
  '.lote-legend': '11.5px',

  // Etiquetas en versales, peso 700.
  '.plano-frame__legend-title': '11.5px',

  // LOS TÍTULOS DE SECCIÓN, en los DOS niveles de la escala.
  //
  // Van como clamp() y no como un número: son los valores de la escala, con su
  // extremo de teléfono y el de escritorio. Escribir sólo el número mataría el
  // escalado y los dejaría fijos.
  //
  // Las variantes nacen de los recuadros del plano, y para eso la escala tiene
  // el nivel RECUADRO: lo que está dentro de una caja usa el nivel de abajo.
  '.section__title-script': 'clamp(40px, 5vw, 58px)',
  '.historia__quote': 'clamp(40px, 5vw, 58px)',
  '.plano-frame__title .section__title-script': 'clamp(32px, 3.8vw, 44px)',
  '.plano-frame__header .section__title-script': 'clamp(32px, 3.8vw, 44px)',
  '.section__title-caps': 'clamp(26px, 3.4vw, 36px)',
  '.plano-frame__title .section__title-caps': 'clamp(20px, 2.4vw, 26px)',
  '.plano-frame__header .section__title-caps': 'clamp(20px, 2.4vw, 26px)',
  '.plano-frame__title h3': 'clamp(20px, 2.4vw, 26px)',

  // Texto diminuto: lo que hoy está en 10 o 10,5, todo a 10,5.
  '.plano-frame__coords': '10.5px',
  '.plano-frame__title p': '10.5px',
  '.social-card--contact .social-card__cta': '10.5px',
  '.plano-contacto__rotulo': '10.5px',
  '.wa-ventana__nota': '10.5px',
  '.precio-gancho__pie': '10.5px',
  '.precio-gancho__batch': '10.5px',
  '.visor360__titulo': '10.5px',
  '.plano-360': '10.5px',
  '.social-card--contact .social-card__msg': '10.5px',
  '.huincha-legal': '10.5px',
  '.precio-gancho__rotulo': '10.5px',
};

/* ---------------------------------------------------------------- leer --- */
writeFileSync(TMP, `<?php
define('WP_USE_THEMES', false);
require ${JSON.stringify(WP)};
global $wpdb;
$pid = (int) $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} m ON m.post_id=p.ID WHERE p.post_type='cod_canvas_doc' AND m.meta_key='_cod_canvas_document_id' AND m.meta_value=%s LIMIT 1", ${JSON.stringify(DOC)}));
echo get_post_meta($pid, '_cod_canvas_css', true);`);
const css = execFileSync(PHP, [TMP], { encoding: 'utf8', maxBuffer: 1e9 });
unlinkSync(TMP);

/** Trocea el CSS en { selector, cuerpo, media } sin perder el anidamiento. */
const reglas = [];
const trozos = [];
let prof = 0, inicio = 0;
for (let i = 0; i < css.length; i++) {
  if (css[i] === '{') prof++;
  else if (css[i] === '}') { prof--; if (prof === 0) { trozos.push(css.slice(inicio, i + 1).trim()); inicio = i + 1; } }
}
const partir = (texto, media) => {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    reglas.push({ sel: m[1].trim().replace(/\s+/g, ' '), cuerpo: m[2], media });
  }
};
for (const t of trozos) {
  if (t.startsWith('@media')) {
    const cond = t.slice(6, t.indexOf('{')).trim();
    partir(t.slice(t.indexOf('{') + 1, t.lastIndexOf('}')), cond);
  } else if (!t.startsWith('@')) {
    partir(t, '');
  }
}

const declaraciones = (cuerpo) => {
  const o = {};
  // Parte por ';' respetando los paréntesis: un var(--x, a) o un rgba(1, 2, 3)
  // no se puede cortar por la coma ni por un punto y coma de adentro.
  let p = 0, actual = '';
  for (const c of cuerpo) {
    if (c === '(') p++;
    else if (c === ')') p--;
    if (c === ';' && p === 0) { if (actual.trim()) { const k = actual.indexOf(':'); o[actual.slice(0, k).trim()] = actual.slice(k + 1).trim(); } actual = ''; }
    else actual += c;
  }
  if (actual.trim()) { const k = actual.indexOf(':'); o[actual.slice(0, k).trim()] = actual.slice(k + 1).trim(); }
  return o;
};

/* --------------------------------------------------------------- armar --- */
const styles = [];
const avisos = [];
const vistos = new Set();

for (const [sel, nuevo] of Object.entries(PLAN)) {
  const suyas = reglas.filter((r) => r.sel === sel);
  if (suyas.length === 0) { avisos.push(`no encontré ${sel}`); continue; }
  for (const r of suyas) {
    const clave = sel + '||' + r.media;
    if (vistos.has(clave)) continue;          // la hoja trae bloques repetidos
    vistos.add(clave);
    const d = declaraciones(r.cuerpo);
    if (!d['font-size']) continue;
    if (d['font-size'] === nuevo) continue;   // ya está
    const antes = d['font-size'];
    d['font-size'] = nuevo;
    styles.push({
      selector: sel,
      ...(r.media ? { media: r.media } : {}),
      _antes: antes,
      style: d,
    });
  }
}

const salida = {
  _comentario: 'Unifica los tamaños de letra repetidos de la portada de Santa Luisa. Cada familia a un solo valor, aprobado por Cristóbal el 5 de octubre de 2026 mirando la comparación visual: texto en tarjetas y listas a 13px, etiquetas y controles a 11,5, notas al pie a 11,5, versales a 11,5 y texto diminuto a 10,5. Lo generó generar-normalizacion.mjs leyendo los cuerpos actuales: cada regla va COMPLETA porque setRule reemplaza la regla entera. Los cortes de pantalla no se tocan: una regla que vive dentro de un @media se reescribe dentro del mismo.',
  mode: 'append',
  structure: [],
  styles,
};

process.stdout.write(JSON.stringify(salida, null, 2));
if (avisos.length) process.stderr.write('\n' + avisos.join('\n') + '\n');
process.stderr.write(`\n${styles.length} reglas a cambiar (de ${Object.keys(PLAN).length} selectores)\n`);
