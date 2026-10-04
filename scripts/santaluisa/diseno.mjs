/**
 * El set de diseño de Santa Luisa, compartido por todas sus páginas.
 *
 * POR QUÉ ESTÁ EN UN SOLO ARCHIVO. Las páginas de este sitio se habían armado
 * cada una con su propia hoja de estilo plana: 11 KB en Contacto, 15 en
 * Preguntas, 18 en Diferenciales, 77 en la portada. Cristóbal, el 4 de octubre
 * de 2026: «no tiene por qué generarse una hoja de estilo por cada página de un
 * sitio; la hoja tiene que ser centralizada».
 *
 * Con todas las páginas compartiendo este `designId`, el plugin escribe UNA
 * hoja por diseño y la sirve como archivo. Que el pie se repita como nodos en
 * cada página no vuelve a pinchar el neumático: lo que se repetía era el CSS,
 * y el CSS sale de acá una sola vez.
 *
 * DE DÓNDE SALEN LOS VALORES. Medidos en el navegador sobre el espejo local,
 * con getComputedStyle, no copiados del CSS ni recordados. Los colores y las
 * tipografías NO se escriben como literales: se referencian del tema, que es
 * donde vive la identidad (`--oliva-700`, `--dorado-600`, `--font-hero`…). Eso
 * sólo se pudo hacer desde la 0.3.67, cuando las reglas semánticas empezaron a
 * admitir var().
 */

export const DESIGN_ID = 'santaluisa-web';

/** Arma una regla con su procedencia. Todo lo de acá se midió en el sitio. */
const reglas = [];
const R = (id, kind, value, { quien = 'reference', bp = 'all', estado = 'default', porque = 'Medido con getComputedStyle sobre el espejo local.' } = {}) => {
  reglas.push({
    id,
    kind,
    scope: { breakpoint: bp, state: estado },
    provenance: { sources: [{ kind: quien, reference: 'espejo local de santaluisadepalpi.cl', rationale: porque }] },
    status: 'reviewed',
    value,
  });
  return id;
};

// --- La caja del sitio -------------------------------------------------------
// .wrap: 1180 de ancho máximo, centrado, con 24 de aire a los lados. max-width
// lleva variable del tema, así que va por properties en forma larga.
R('sl-wrap', 'properties', { declarations: {
  'max-width': 'var(--max-width)',
  'margin-inline-start': 'auto',
  'margin-inline-end': 'auto',
  'padding-inline-start': '24px',
  'padding-inline-end': '24px',
} });

// --- La banda oliva ----------------------------------------------------------
// La sección de contacto: fondo --oliva-700 y texto --tierra-50.
R('sl-banda-oliva', 'surface', { backgroundColor: 'var(--oliva-700)', foregroundColor: 'var(--tierra-50)' });
// padding 125/70 y margen superior -69: la sección se mete bajo el encabezado.
// Asimétrico, así que no cabe en spacing.paddingBlock.
R('sl-banda-aire', 'properties', { declarations: {
  'padding-block-start': '125px',
  'padding-block-end': '70px',
  // El aire lateral lo pone el wrap, no la sección. Hay que anular el del CSS
  // base del motor (.cod-section trae 24px): si no, se suman a los 24 del wrap
  // y el contenido queda 24px más adentro que en el original. Medido.
  'padding-inline-start': '0',
  'padding-inline-end': '0',
  'margin-block-start': '-69px',
} });

// --- Rótulo ------------------------------------------------------------------
R('sl-rotulo', 'typography', { role: 'rotulo', family: 'var(--font-body)', fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', lineHeight: 1, transform: 'uppercase' });
R('sl-rotulo-color', 'color', { role: 'rotulo', color: 'var(--dorado-600)' });
R('sl-rotulo-aire', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '6px' } });

// --- El título de dos caras --------------------------------------------------
// La firma tipográfica del sitio: una cara script y una de caja alta dentro del
// MISMO encabezado. Hasta la 0.3.66 esto no se podía decir en el constructor, y
// es probablemente la razón por la que estas páginas terminaron escritas a mano.
R('sl-titulo-script', 'typography', { role: 'titulo-script', family: 'var(--font-hero)', fontSize: 'clamp(40px, 5vw, 58px)', fontWeight: 400, lineHeight: 1 });
R('sl-titulo-script-caja', 'properties', { declarations: { display: 'block' } });
R('sl-titulo-caps', 'typography', { role: 'titulo-caps', family: 'var(--font-body)', fontSize: 'clamp(26px, 3.4vw, 36px)', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.05, transform: 'uppercase' });
// El -10 es el encaje entre las dos caras: la de caja alta sube para que el
// trazo bajo de la script la toque. Es intención de diseño, no un ajuste suelto.
R('sl-titulo-caps-encaje', 'properties', { declarations: { display: 'block', 'margin-block-start': '-10px' } });
R('sl-titulo-claro', 'color', { role: 'titulo', color: '#FFFFFF' });
R('sl-titulo-aire', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '18px' } });

// --- Cuerpo ------------------------------------------------------------------
R('sl-cuerpo', 'typography', { role: 'cuerpo', fontSize: '15px', lineHeight: 1.5, measure: '480px' });
R('sl-cuerpo-color', 'color', { role: 'cuerpo', color: 'var(--tierra-100)' });
R('sl-cuerpo-aire', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '20px' } });

// --- El pie, que es de todo el sitio ----------------------------------------
// Va como nodos en cada página y no como región porque el MCP puede LEER
// regiones pero no crearlas ni darles alcance. Anotado como lo que falta; el
// CSS igual sale una sola vez, que era el problema de fondo.
R('sl-pie', 'surface', { backgroundColor: '#2A2C22', foregroundColor: 'var(--tierra-300)' });
R('sl-pie-aire', 'properties', { declarations: {
  'padding-block-start': '28px',
  'padding-block-end': '28px',
  'text-align': 'center',
} });
R('sl-pie-texto', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.5, align: 'center' });
// 44px de alto mínimo para tocar con el dedo sin errarle: medido, los enlaces
// del pie daban 18. El relleno vertical es lo que los agranda sin mover el texto.
R('sl-pie-enlace', 'properties', { declarations: {
  'display': 'inline-block',
  'padding-block-start': '13px', 'padding-block-end': '13px',
  color: 'inherit',
  'text-decoration-line': 'underline',
  cursor: 'pointer',
} });

export const REGLAS_COMPARTIDAS = reglas;

/** Envuelve las reglas compartidas más las propias de una página. */
export function diseno(propias = [], revision = 0) {
  return {
    schemaVersion: 1,
    designId: DESIGN_ID,
    expectedDesignRevision: revision,
    reviewState: 'session',
    rules: [...REGLAS_COMPARTIDAS, ...propias],
  };
}

/** Atajo para declarar una regla propia de una página, con la misma forma. */
export function regla(id, kind, value, { bp = 'all', estado = 'default', porque = 'Medido con getComputedStyle sobre el espejo local.' } = {}) {
  return {
    id,
    kind,
    scope: { breakpoint: bp, state: estado },
    provenance: { sources: [{ kind: 'reference', reference: 'espejo local de santaluisadepalpi.cl', rationale: porque }] },
    status: 'reviewed',
    value,
  };
}
