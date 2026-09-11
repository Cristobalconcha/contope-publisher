/**
 * Salvaguardas del guardado.
 *
 * GrapesJS reexporta la hoja de estilos completa cada vez que guarda, y en esa
 * reexportación puede perder cosas sin decir nada. Este módulo mide qué se
 * perdería, repone lo que se puede reponer, y devuelve un informe para que
 * quien llame pueda decidir.
 *
 * Las tres protecciones nacieron de defectos reales en producción, no de
 * hipótesis. Cada una lleva anotado el caso que la originó, porque sin esa
 * historia parecen precauciones exageradas y alguien las quita.
 *
 * Lo usan los dos motores headless del plugin. No depende de nada externo.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Leer el CSS
 * ───────────────────────────────────────────────────────────────────────── */

/** Quita los comentarios sin romper el resto. */
function sinComentarios(css) {
  return String(css || '')
    .split('/*')
    .map((parte, i) => (i === 0 ? parte : parte.slice(parte.indexOf('*/') + 2)))
    .join(' ');
}

/**
 * El conjunto de selectores declarados en una hoja.
 *
 * Comparar tamaños en bytes engaña: GrapesJS reescribe el CSS compacto, sin
 * comentarios ni sangría, así que una hoja puede encoger un 25% sin perder
 * una sola regla. Lo que hay que comparar son los selectores.
 */
export function selectoresDe(css) {
  const set = new Set();
  sinComentarios(css)
    .split('}')
    .forEach((chunk) => {
      // Ojo con el escape de esta expresión: `/s+/` sin barra invertida parte
      // por la LETRA "s" y convierte `.site-nav` en `. ite-nav`. El informe de
      // pérdidas queda lleno de reglas fantasma. Pasó de verdad (2026-09-08).
      const sel = chunk.split('{')[0].trim().split(/\s+/).join(' ');
      if (sel && !sel.startsWith('@') && sel.length < 160) set.add(sel);
    });
  return set;
}

/** Parte la hoja en bloques de primer nivel, respetando el anidamiento. */
export function bloquesDe(css) {
  const salida = [];
  const texto = String(css || '');
  let i = 0;
  while (i < texto.length) {
    const abre = texto.indexOf('{', i);
    if (abre < 0) break;
    let profundidad = 1;
    let j = abre + 1;
    while (j < texto.length && profundidad > 0) {
      if (texto[j] === '{') profundidad += 1;
      else if (texto[j] === '}') profundidad -= 1;
      j += 1;
    }
    const bloque = texto.slice(i, j).trim();
    if (bloque !== '' && bloque.includes('{')) salida.push(bloque);
    i = j;
  }
  return salida;
}

/**
 * Los selectores REALES de un bloque, incluso si está envuelto en un @media.
 *
 * Un @media envuelve sus reglas: sus selectores viven adentro, y selectoresDe()
 * descarta a propósito todo lo que empieza con "@". Sin desenvolverlo, un
 * @media quedaba con CERO selectores, y con cero el rescate lo reponía SIEMPRE,
 * existiera ya o no. Cada guardado sumaba una copia: la hoja de una portada
 * llegó a 204 copias, el 27,6% de su peso (2026-09-10).
 */
function selectoresReales(bloque) {
  const t = String(bloque || '').trim();
  if (!t.startsWith('@')) return selectoresDe(t);
  const abre = t.indexOf('{');
  const cierra = t.lastIndexOf('}');
  if (abre < 0 || cierra <= abre) return new Set();
  return selectoresDe(t.slice(abre + 1, cierra));
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1 · Abreviadas con variable
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * GrapesJS expande las declaraciones abreviadas a sus partes y, al no poder
 * resolver una variable CSS, las DESCARTA.
 *
 * Pasó el 2026-09-05: se perdieron ocho fondos, incluido el de un bloque con
 * texto blanco que quedó ilegible. La comparación por selectores no lo vio,
 * porque el selector seguía existiendo — vacío de esa declaración.
 */
const ABREVIADAS = [
  'background', 'border', 'margin', 'padding', 'font', 'transition',
  'box-shadow', 'border-bottom', 'border-top', 'border-left', 'border-right',
  'flex', 'outline',
];

function declaracionesConVariable(css) {
  const fuera = [];
  const bloques = sinComentarios(css).match(/[^{}]+\{[^}]*\}/g) || [];
  for (const b of bloques) {
    const sel = b.split('{')[0].trim().split(/\s+/).join(' ');
    if (!sel || sel.startsWith('@')) continue;
    const cuerpo = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
    for (const d of cuerpo.split(';')) {
      const j = d.indexOf(':');
      if (j < 0) continue;
      const prop = d.slice(0, j).trim();
      const valor = d.slice(j + 1).trim();
      if (ABREVIADAS.includes(prop) && valor.includes('var(')) fuera.push({ sel, prop, valor });
    }
  }
  return fuera;
}

const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function abreviadasEnRiesgo(cssAntes, cssDespues) {
  return declaracionesConVariable(cssAntes).filter(({ sel, prop, valor }) => {
    const variable = (valor.match(/var\(\s*(--[\w-]+)/) || [])[1];
    const m = String(cssDespues || '').match(new RegExp(escaparRe(sel) + '\\s*\\{([^}]*)\\}', 'i'));
    if (!m) return true;
    if (variable && m[1].includes(variable)) return false;
    return !m[1].includes(prop);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2 · Rescate de reglas que GrapesJS no conoce
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Repone las reglas que viven en la hoja guardada pero no en projectData.
 *
 * Hay herramientas que escriben directo en el CSS guardado sin pasar por el
 * editor. GrapesJS no las conoce, así que al reexportar simplemente no las
 * escribe y desaparecen. Este rescate las devuelve.
 *
 * Reglas del rescate, todas aprendidas a golpes:
 *
 * · Un bloque solo se repone si su selector NO figura en el CSS nuevo. Si
 *   figura, la versión que vale es la nueva: reponer la vieja al final la haría
 *   ganar por orden y el cambio pedido no se vería.
 * · Salvo para @media, porque su selector interior suele existir también como
 *   regla base, y ese criterio descartaría la variante responsive.
 * · Un selector que ESTA edición nombra a propósito nunca se repone aunque
 *   desaparezca: desaparecer era el punto.
 * · La comparación va sin espacios, porque GrapesJS reserializa con otro
 *   formato y el mismo bloque vuelve escrito distinto.
 * · Un bloque idéntico no se repone dos veces en la misma pasada: así las
 *   copias ya acumuladas se colapsan a una sola en el próximo guardado.
 *
 * @param {string} cssAntes     la hoja como estaba guardada
 * @param {string} cssDespues   la hoja que produjo GrapesJS
 * @param {string[]} tocados    selectores que esta edición nombra a propósito
 */
function rescatarReglas(cssAntes, cssDespues, tocados) {
  const aProposito = new Set((tocados || []).map((s) => String(s || '').trim()).filter(Boolean));
  const aplanar = (t) => String(t || '').replace(/\s+/g, '');
  const nuevoPlano = aplanar(cssDespues);
  const yaDeclarados = selectoresDe(cssDespues);
  const rescatadas = [];
  const yaRepuesto = new Set();

  for (const bloque of bloquesDe(cssAntes)) {
    const propios = selectoresReales(bloque);

    let tocado = false;
    for (const s of propios) if (aProposito.has(s)) { tocado = true; break; }
    if (tocado) continue;

    const plano = aplanar(bloque);
    if (plano === '' || nuevoPlano.includes(plano) || yaRepuesto.has(plano)) continue;

    if (!String(bloque).trim().startsWith('@')) {
      let todosPresentes = propios.size > 0;
      for (const s of propios) if (!yaDeclarados.has(s)) { todosPresentes = false; break; }
      if (todosPresentes) continue;
    }

    yaRepuesto.add(plano);
    rescatadas.push(bloque);
  }

  return rescatadas;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Punto de entrada
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Aplica las tres salvaguardas al resultado de una edición.
 *
 * No decide nada: repone lo que se puede reponer y devuelve el informe. Quien
 * llama decide si guarda, si aparta la versión como recuperación, o si avisa.
 *
 * @returns {{css: string, informe: {
 *   repuestas: number,
 *   selectoresPerdidos: string[],
 *   abreviadasEnRiesgo: Array<{sel: string, prop: string, valor: string}>,
 *   reglasAntes: number,
 *   reglasDespues: number,
 *   hayPerdida: boolean
 * }}}
 */
export function aplicarSalvaguardas(cssAntes, cssDespues, opciones = {}) {
  const tocados = opciones.selectoresTocados || [];
  const rescatar = opciones.rescatar !== false;

  const enRiesgo = abreviadasEnRiesgo(cssAntes, cssDespues);

  let css = String(cssDespues || '');
  const rescatadas = rescatar ? rescatarReglas(cssAntes, css, tocados) : [];
  if (rescatadas.length > 0) css += rescatadas.join('');

  const antes = selectoresDe(cssAntes);
  const despues = selectoresDe(css);
  const aProposito = new Set(tocados.map((s) => String(s || '').trim()).filter(Boolean));
  const perdidos = [...antes].filter((s) => !despues.has(s) && !aProposito.has(s));

  return {
    css,
    informe: {
      repuestas: rescatadas.length,
      selectoresPerdidos: perdidos,
      abreviadasEnRiesgo: enRiesgo,
      reglasAntes: antes.size,
      reglasDespues: despues.size,
      hayPerdida: perdidos.length > 0 || enRiesgo.length > 0,
    },
  };
}
