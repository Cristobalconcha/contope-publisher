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

// --- LA ESCALA DE TÍTULOS: TRES NIVELES --------------------------------------
//
// Aprobada por Cristóbal el 4 de octubre de 2026, con sus palabras como
// criterio: «la portada tiene en el hero una clase especial porque es un tamaño
// más grande; las secciones tienen un título de sección; los mapas podrían
// tener un tipo de título un poco más pequeño, porque están metidos en un
// recuadro».
//
// DE DÓNDE SALE. El sitio entregado tenía 26 tamaños de letra distintos entre
// sus cinco páginas y 47 tratamientos tipográficos en la portada, cada uno usado
// una vez. Los inventé yo al construirlo; nadie los pidió. Él: «si vamos a
// considerar que es un tipo de título distinto porque es más chico o más grande,
// entonces ni servirían los estilos CSS, mejor sería hacerlo con estilos en
// línea… estamos trabajando en un sistema de diseño sin sistema de diseño».
//
// DOS EJES, no uno. El NIVEL es el tamaño —de qué jerarquía es este título—. La
// CARA es el trazo: cursiva (Birthstone), versales (Montserrat en caja alta) o
// llana (Montserrat tal cual). La cursiva no es otro nivel: es la otra cara del
// mismo título, y por eso las dos van dentro del MISMO encabezado.
//
//   nivel      cursiva   versales   llana     dónde
//   portada       64        68        32      el hero, y el título de un documento
//   sección       58        36        24      la entrada de cada sección
//   recuadro      44        26        18      un título dentro de una caja o un mapa
//
// LAS MEDIDAS NO SON INVENTADAS. Portada y sección salen de medir el sitio que
// funciona: 68 es el hero, 58/36 es lo que usan las cuatro interiores, 32/24 son
// los títulos de la página legal. Lo que SÍ estaba inventado y desaparece es la
// dispersión de la portada —55 y 48 en la cursiva, 34 y 30 en las versales—, que
// no eran niveles sino descuido.
//
// El nivel RECUADRO es el único que no estaba, porque el sitio nunca lo declaró:
// sus medidas son un paso proporcional (0,74 del nivel de sección, el mismo
// salto que hay entre portada y sección), no un número elegido a ojo.
//
// El límite inferior de cada clamp es la medida en teléfono y el superior la de
// escritorio; entre medio escala con el ancho.

// Portada. Un solo título por sitio: el hero. Tener su propia clase es
// exactamente lo que él pidió, y lo que evita que «más grande» se resuelva
// estirando el de sección.
// Medido en el hero del sitio publicado: 68px, peso 800, espaciado NEGATIVO
// (-0,01em) y altura de línea 0,98. El espaciado negativo no es un detalle: a
// este tamaño junta las letras y es lo que le da el bloque compacto.
R('sl-titulo-portada', 'typography', { role: 'titulo-portada', family: 'var(--font-body)', fontSize: 'clamp(38px, 5.4vw, 68px)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 0.98, transform: 'uppercase' });
// Y su cara cursiva, que yo había dado por inexistente: es «Aquí ya hay vida»,
// en Birthstone a 64px y en el dorado de la marca, pegada al título por un
// margen inferior negativo. No es un rótulo: es la otra cara del mismo título.
R('sl-titulo-portada-script', 'typography', { role: 'titulo-portada-script', family: 'var(--font-hero)', fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 400, lineHeight: 1 });
R('sl-titulo-portada-script-encaje', 'properties', { declarations: { display: 'block', 'margin-block-end': '-14px' } });
R('sl-titulo-portada-llana', 'typography', { role: 'titulo-portada-llana', family: 'var(--font-body)', fontSize: 'clamp(26px, 2.8vw, 32px)', fontWeight: 700, lineHeight: 1.05 });

// Sección. El nivel de trabajo del sitio: lo usan las cuatro interiores y casi
// toda la portada. Sus dos caras son sl-titulo-script y sl-titulo-caps, que ya
// existían con estas mismas medidas; acá quedan NOMBRADAS como un nivel para que
// se note cuándo algo se sale de la escala.
R('sl-titulo-seccion-llana', 'typography', { role: 'titulo-seccion-llana', family: 'var(--font-body)', fontSize: 'clamp(20px, 2.1vw, 24px)', fontWeight: 700, lineHeight: 1.05 });

// Recuadro. Para un título que vive DENTRO de algo —una tarjeta, el marco de un
// mapa—, donde el de sección compite con el contenido que lo rodea.
R('sl-titulo-recuadro-script', 'typography', { role: 'titulo-recuadro-script', family: 'var(--font-hero)', fontSize: 'clamp(32px, 3.8vw, 44px)', fontWeight: 400, lineHeight: 1 });
R('sl-titulo-recuadro', 'typography', { role: 'titulo-recuadro', family: 'var(--font-body)', fontSize: 'clamp(20px, 2.4vw, 26px)', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.05, transform: 'uppercase' });
R('sl-titulo-recuadro-llana', 'typography', { role: 'titulo-recuadro-llana', family: 'var(--font-body)', fontSize: 'clamp(16px, 1.6vw, 18px)', fontWeight: 700, lineHeight: 1.1 });

// --- Cuerpo ------------------------------------------------------------------
R('sl-cuerpo', 'typography', { role: 'cuerpo', fontSize: '15px', lineHeight: 1.5, measure: '480px' });
R('sl-cuerpo-color', 'color', { role: 'cuerpo', color: 'var(--tierra-100)' });
R('sl-cuerpo-aire', 'properties', { declarations: { 'margin-block-start': '0', 'margin-block-end': '20px' } });

// --- Los botones: tres niveles, uno por jerarquía ---------------------------
//
// NO SON INVENTO. Salen de «Ancho, ritmo y botones» (9 de septiembre de 2026),
// el documento que norma el diseño de este sitio y que el cliente aprobó. Nació
// de una observación suya —«los botones no son consistentes»— medida en el sitio
// publicado: había CUATRO tratamientos distintos conviviendo y dos páginas cuyo
// llamado a la acción era un enlace sin estilo.
//
// La regla que el documento fija, textual: «Primario y secundario comparten
// EXACTAMENTE la misma altura, radio, tipografía y espaciado interno. Solo
// cambia el relleno». Por eso la base es una sola regla y los niveles sólo
// agregan color.
//
// Y la razón por la que esto está acá y no en cada página: el 4 de octubre
// compuse cuatro páginas sin abrir el documento y volví a hacer lo mismo que
// condena —dos botones primarios distintos entre sí, 14px sin mayúsculas en una
// y 12,5px con otro espaciado en la otra—. Un sistema que vive en una sola
// regla no se puede desviar página por página.
R('sl-btn', 'properties', { declarations: {
  display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center',
  'column-gap': '8px',
  'font-size': '12.5px', 'font-weight': '700', 'letter-spacing': '0.04em',
  'text-transform': 'uppercase', 'text-decoration-line': 'none',
  'padding-top': '13px', 'padding-right': '26px',
  'padding-bottom': '13px', 'padding-left': '26px',
  'border-top-left-radius': '999px', 'border-top-right-radius': '999px',
  'border-bottom-right-radius': '999px', 'border-bottom-left-radius': '999px',
  'border-top-width': '1px', 'border-right-width': '1px',
  'border-bottom-width': '1px', 'border-left-width': '1px',
  'border-top-style': 'solid', 'border-right-style': 'solid',
  'border-bottom-style': 'solid', 'border-left-style': 'solid',
  cursor: 'pointer', 'white-space': 'nowrap',
} });

// El primario: la acción que queremos que ocurra. UNO solo por pantalla, dice
// el documento. El dorado es suyo.
R('sl-btn-primario', 'properties', { declarations: {
  'background-color': 'var(--dorado-600)', color: '#2B2210',
  'border-top-color': 'var(--dorado-600)', 'border-right-color': 'var(--dorado-600)',
  'border-bottom-color': 'var(--dorado-600)', 'border-left-color': 'var(--dorado-600)',
} });

// El secundario: alternativas válidas. Misma forma y tamaño; sólo cambia que
// no lleva relleno.
R('sl-btn-secundario', 'properties', { declarations: {
  'background-color': 'transparent', color: 'var(--oliva-700)',
  'border-top-color': 'var(--oliva-500)', 'border-right-color': 'var(--oliva-500)',
  'border-bottom-color': 'var(--oliva-500)', 'border-left-color': 'var(--oliva-500)',
} });

// El enlace de texto: navegación entre páginas, no compite con los otros dos.
//
// OJO, una contradicción del documento que conviene saber: sus viñetas dicen
// que «el dorado queda reservado para el primario; hoy también lo usa la línea
// bajo los enlaces, lo que diluye su valor de señal», pero la muestra que el
// cliente vio renderizada SÍ lleva la línea dorada. Se sigue lo que se vio,
// que es lo que se aprobó, y queda anotado para resolverlo con él.
R('sl-enlace-flecha', 'properties', { declarations: {
  'font-size': '13px', 'font-weight': '700', 'letter-spacing': '0.04em',
  'text-transform': 'uppercase', 'text-decoration-line': 'none',
  color: 'var(--oliva-700)',
  'border-bottom-width': '1px', 'border-bottom-style': 'solid',
  'border-bottom-color': 'var(--dorado-600)',
  'padding-bottom': '3px', display: 'inline-block',
} });

// El foco por teclado, que el documento marca como ausente hoy: «queda visible
// en los tres. Hoy no lo está». Va en su propia regla con scope focus.
R('sl-btn-foco', 'properties', { declarations: {
  'outline-width': '2px', 'outline-style': 'solid',
  'outline-color': 'var(--dorado-600)', 'outline-offset': '3px',
} }, { estado: 'focus' });

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
