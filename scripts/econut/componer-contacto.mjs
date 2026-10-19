/**
 * La página de Contacto de econut.cl, compuesta con ContOpe.
 *
 * El econut.cl publicado tiene /contactos con un formulario de Gravity Forms.
 * El sitio nuevo no tenía ninguno (LEEME-subir-econut, punto 3.5). Acá está: la
 * página «Contacto» (dirección /contacto/) con el formulario de Orugantt
 * `contacto-econut`, réplica del de Gravity Forms —área, nombre, apellidos,
 * correo y su repetición, teléfono, mensaje y una sola casilla—, y la
 * identidad del resto del sitio.
 *
 * QUÉ SE REUTILIZA Y QUÉ NO.
 *
 * Las reglas compartidas (`aire`, `s-beige`, `c-naranja`, `c-texto`,
 * `t-rotulo`, `t-seccion`, `t-lead`, `titulo-par`, `texto-sin-margen`) son
 * COPIA EXACTA de las de `componer.mjs`, con los mismos valores: la hoja
 * compartida del sitio guarda UNA regla por nombre, y si dos páginas dijeran
 * valores distintos para el mismo nombre ganaría la última en escribirse para
 * todas. Mismo criterio que `componer-legal.mjs`. Si se cambia un valor en
 * `componer.mjs`, se cambia aquí también.
 *
 * EL FORMULARIO SE ESTILA POR VARIABLES, NUNCA POR REGLAS SOBRE SUS CAMPOS (el
 * contrato del tipo `form`, ver `includes/class-ofr-design-tokens.php` en
 * Orugantt Forms): la regla `contacto-form` fija las variables del runtime con
 * colores de la paleta de Econut y la tipografía del cuerpo del tema; todo lo
 * demás —qué campos hay, el botón «Enviar mensaje», la línea con el enlace a
 * «Términos y privacidad»— vive en el propio formulario (fixtures/
 * contacto-econut.json de Orugantt Forms).
 *
 * Uso:  node componer-contacto.mjs      (genera contacto.json; aplica aplicar-contacto.mjs)
 */
import { writeFileSync } from 'node:fs';

const PAGE_ID = Number(process.env.ECONUT_CONTACTO_PAGE_ID || 0);
const DOCUMENT_ID = 'cod-canvas-page-' + PAGE_ID;
const SLUG_FORMULARIO = 'contacto-econut';

const NARANJA = '#DC4017';
const BEIGE = '#DBD4C0';
const BLANCO = '#FFFFFF';
const TEXTO = '#333333';
const SUAVE = '#666666';
const VERDE = '#2E594A';

let n = 0;
const id = (p) => `${p}-${++n}`;

const reglas = [];
const R = (idRegla, kind, value, { bp = 'all' } = {}) => {
  reglas.push({
    id: idRegla,
    kind,
    scope: { breakpoint: bp, state: 'default' },
    provenance: {
      sources: [{
        kind: 'reference',
        reference: 'https://econut.cl/contactos/',
        rationale: 'Réplica del formulario de contacto del sitio publicado, con la identidad del sitio nuevo.',
      }],
    },
    status: 'reviewed',
    value,
  });
  return idRegla;
};

// ------------------------------------------------ compartidas (copia exacta)
R('c-naranja', 'color', { role: 'titulo', color: NARANJA });
R('c-texto', 'color', { role: 'rotulo', color: SUAVE });
R('t-rotulo', 'typography', { role: 'rotulo', fontSize: '14px', fontWeight: 500, letterSpacing: '1px', lineHeight: 1.4, transform: 'uppercase' });
R('t-seccion', 'typography', { role: 'titulo-seccion', fontSize: 'clamp(34px, 4.4vw, 58px)', fontWeight: 600, lineHeight: 1.2, align: 'start' });
R('t-lead', 'typography', { role: 'bajada', fontSize: '19px', lineHeight: 1.6, measure: '54ch' });
R('aire', 'spacing', { paddingBlock: '54px', paddingInline: '24px' });
R('s-beige', 'surface', { backgroundColor: BEIGE, foregroundColor: TEXTO });
R('titulo-par', 'layout', { mode: 'stack', gap: '4px', align: 'start' });
R('texto-sin-margen', 'properties', { declarations: {
  'margin-block-start': '0px', 'margin-block-end': '0px',
} });

// ------------------------------------------------------------ propias
// Una columna angosta: un formulario se lee y se llena de corrido, y a 1080
// de ancho los campos quedarían estirados sin motivo. 760 deja el campo de
// mensaje con una línea de unos 90 caracteres.
R('caja-contacto', 'layout', { mode: 'stack', maxWidth: '760px', gap: '32px', align: 'start' });

// La tarjeta blanca sobre el beige: la misma forma del panel de los
// cuadrantes de la portada (blanco, esquinas de 28), con más aire adentro
// porque aquí hay campos.
R('contacto-tarjeta', 'properties', { declarations: {
  'background-color': BLANCO,
  'border-radius': '28px',
  'padding-top': '32px', 'padding-right': '32px', 'padding-bottom': '32px', 'padding-left': '32px',
  width: '100%',
} });
R('contacto-tarjeta-movil', 'properties', { declarations: {
  'border-radius': '20px',
  'padding-top': '20px', 'padding-right': '16px', 'padding-bottom': '20px', 'padding-left': '16px',
} }, { bp: 'mobile' });

// Las variables del runtime del formulario, con la paleta de Econut: texto
// #333, apoyo #666, bordes en el beige de las secciones y el botón en el verde
// de los demás botones del sitio (regla `boton-fondo`). Al pasar el cursor el
// botón se oscurece al #222 de la marca: sigue dentro de la paleta.
R('contacto-form', 'form', {
  surface: 'none',
  theme: {
    texto: TEXTO,
    textoSuave: SUAVE,
    fondo: BLANCO,
    superficie: BLANCO,
    superficieAlt: BEIGE,
    borde: BEIGE,
    bordeFuerte: SUAVE,
    principal: VERDE,
    principalHover: '#222222',
    principalContraste: BLANCO,
    tipografia: 'var(--font-body)',
    radio: '10px',
    espaciado: '16px',
  },
});

// ---------------------------------------------------------------- nodos
const H = (texto, nivel, reglas_) => ({ id: id('h'), kind: 'heading', ruleIds: [...reglas_, 'texto-sin-margen'], content: { text: texto, level: nivel } });
const P = (texto, reglas_) => ({ id: id('p'), kind: 'paragraph', ruleIds: [...reglas_, 'texto-sin-margen'], content: { text: texto } });
const G = (hijos, reglas_ = []) => ({ id: id('g'), kind: 'group', ruleIds: reglas_, children: hijos });

const nodes = [{
  id: 'contacto', marker: 'contacto', kind: 'section', ruleIds: ['aire', 's-beige'],
  children: [G([
    // Rótulo + título pegados (4px), como en el resto del sitio. El título es
    // el h1 de la página: aquí no hay otro.
    G([
      P('Contacto', ['t-rotulo', 'c-texto']),
      H('Escríbenos', 1, ['t-seccion', 'c-naranja']),
    ], ['titulo-par']),
    P('Cuéntanos qué necesitas. Elige el área que corresponda y te responderemos a la brevedad.', ['t-lead']),
    G([
      { id: 'formulario-contacto', kind: 'form', ruleIds: ['contacto-form'], content: { formSlug: SLUG_FORMULARIO } },
    ], ['contacto-tarjeta', 'contacto-tarjeta-movil']),
  ], ['caja-contacto'])],
}];

writeFileSync('contacto.json', JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_CONTACTO || 0),
  design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
  composition: { schemaVersion: 2, nodes },
}, null, 2));

console.log(`contacto.json  · reglas: ${reglas.length} · nodos: ${n}`);
