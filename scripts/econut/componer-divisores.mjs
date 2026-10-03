/**
 * La página de muestra de divisores.
 *
 * POR QUÉ UNA PÁGINA APARTE Y NO LA PORTADA. La portada de Econut tiene un
 * requisito que manda sobre cualquier otra cosa: «que quede igual que la web
 * actual». Meterle un divisor sería mejorarla por mi cuenta y romper eso. Esta
 * página existe para VER las formas aplicadas de verdad —no en una hoja de
 * contactos— sin tocar lo que tiene que quedar fiel.
 *
 * Se compone con la clase de regla `divisor`, que es la vía por la que yo
 * trabajo. El panel del inspector hace lo mismo para quien edita a mano.
 *
 * Uso:  node componer-divisores.mjs   (genera divisores.json)
 */
import { writeFileSync } from 'node:fs';

const PAGE_ID = Number(process.env.PAGE_DIVISORES || 0);
const DOCUMENT_ID = process.env.DOC_DIVISORES || '';

const VERDE = '#2E594A';
const BEIGE = '#DBD4C0';
const BLANCO = '#FFFFFF';
const NARANJA = '#DC4017';
const M = '/wp-content/uploads/2026/10/divisor-';

let n = 0;
const id = (p) => `${p}-${++n}`;

const reglas = [];
const R = (idRegla, kind, value, scope = {}) => {
  reglas.push({
    id: idRegla,
    kind,
    scope: { breakpoint: scope.bp || 'all', state: 'default', roles: [] },
    provenance: {
      sources: [{
        kind: 'user',
        rationale: 'Muestra de divisores: formas de partida generadas con scripts/generar-formas-divisor.mjs.',
      }],
    },
    status: 'reviewed',
    value,
  });
};

// ---------------------------------------------------------------- el diseño
R('hoja', 'spacing', { paddingBlock: '0px', paddingInline: '0px' });
R('titulo', 'typography', { role: 'titulo', fontSize: '34px', lineHeight: 1.15, fontWeight: 700 });
R('titulo-color', 'surface', { foregroundColor: VERDE });
R('intro', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.7 });
R('intro-aire', 'spacing', { paddingBlock: '48px', paddingInline: '24px' });
R('intro-caja', 'properties', {
  declarations: {
    'max-width': '760px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', width: '100%',
  },
});

// Las bandas: una oscura y una clara, para que el divisor se vea recortado
// entre dos colores. Un divisor sobre un fondo del mismo color no se ve.
R('banda-oscura', 'surface', { backgroundColor: VERDE, foregroundColor: BLANCO });
R('banda-clara', 'surface', { backgroundColor: BEIGE, foregroundColor: VERDE });
R('banda-blanca', 'surface', { backgroundColor: BLANCO, foregroundColor: VERDE });
// El aire de abajo tiene que superar el alto del divisor más alto (140px en
// la cordillera): un divisor se monta sobre el contenido a propósito, pero en
// una muestra el rótulo tiene que leerse.
R('banda-aire', 'spacing', { paddingBlock: '72px', paddingInline: '24px' });
R('banda-aire-alta', 'spacing', { paddingBlock: '160px', paddingInline: '24px' });
R('rotulo', 'typography', { role: 'rotulo', fontSize: '13px', lineHeight: 1.4, transform: 'uppercase', letterSpacing: '0.08em' });
R('rotulo-centro', 'properties', { declarations: { 'text-align': 'center' } });

/**
 * Las muestras. El `color` de cada divisor es el color de la banda SIGUIENTE:
 * un divisor es la banda de abajo invadiendo a la de arriba, no una pieza de
 * un tercer color. Equivocarse en eso es el error más común al usarlos.
 */
const MUESTRAS = [
  { forma: 'pendiente', rotulo: 'Pendiente', fondo: 'banda-oscura', sigue: BEIGE },
  { forma: 'pendiente-suave', rotulo: 'Pendiente suave · volteada', fondo: 'banda-clara', sigue: BLANCO, voltear: true },
  { forma: 'onda', rotulo: 'Onda', fondo: 'banda-blanca', sigue: VERDE },
  { forma: 'onda-suave', rotulo: 'Onda suave', fondo: 'banda-oscura', sigue: BEIGE },
  { forma: 'ondas', rotulo: 'Ondas · repetida 2 veces', fondo: 'banda-clara', sigue: BLANCO, repeticion: 2 },
  { forma: 'curva', rotulo: 'Curva', fondo: 'banda-blanca', sigue: VERDE },
  { forma: 'cerros', rotulo: 'Cerros', fondo: 'banda-oscura', sigue: BEIGE },
  { forma: 'cordillera', rotulo: 'Cordillera · alta', fondo: 'banda-clara', sigue: BLANCO, alto: '140px' },
  { forma: 'nubes', rotulo: 'Nubes', fondo: 'banda-blanca', sigue: VERDE },
  { forma: 'dientes', rotulo: 'Dientes', fondo: 'banda-oscura', sigue: BEIGE },
  { forma: 'escalones', rotulo: 'Escalones', fondo: 'banda-clara', sigue: BLANCO },
  { forma: 'triangulo', rotulo: 'Triángulo', fondo: 'banda-blanca', sigue: VERDE },
  { forma: 'asimetrica', rotulo: 'Asimétrica', fondo: 'banda-oscura', sigue: BEIGE },
  { forma: 'curva-invertida', rotulo: 'Curva invertida · arriba y abajo', fondo: 'banda-clara', sigue: BLANCO, donde: 'ambos' },
];

const bandas = MUESTRAS.map((m, i) => {
  const reglaDiv = `div-${m.forma}-${i}`;
  const valor = { forma: `${M}${m.forma}.svg`, donde: m.donde || 'abajo' };
  if (m.alto) valor.alto = m.alto;
  if (m.repeticion) valor.repeticion = m.repeticion;
  if (m.voltear) valor.voltear = true;
  // El color del divisor es el de la banda SIGUIENTE: un divisor es la banda
  // de abajo invadiendo a la de arriba, no una pieza de un tercer color.
  valor.color = m.sigue;
  R(reglaDiv, 'divisor', valor);

  return {
    id: id('banda'),
    kind: 'section',
    ruleIds: [m.fondo, m.alto ? 'banda-aire-alta' : 'banda-aire', reglaDiv],
    children: [
      {
        id: id('r'),
        kind: 'paragraph',
        ruleIds: ['rotulo', 'rotulo-centro'],
        content: { text: m.rotulo },
      },
    ],
  };
});

const nodes = [
  {
    id: 'intro',
    kind: 'section',
    ruleIds: ['banda-blanca', 'intro-aire'],
    children: [{
      id: id('g'),
      kind: 'group',
      ruleIds: ['intro-caja'],
      children: [
        { id: id('h'), kind: 'heading', ruleIds: ['titulo', 'titulo-color'], content: { text: 'Divisores', level: 1 } },
        {
          id: id('p'),
          kind: 'paragraph',
          ruleIds: ['intro'],
          content: {
            text: 'Catorce formas de partida, generadas con un guion y subidas a Medios. '
              + 'No son el catálogo: cualquier SVG del sitio sirve como divisor. '
              + 'Cada banda de abajo usa una, con su color, su alto y, en algunos casos, repetida o volteada.',
          },
        },
      ],
    }],
  },
  ...bandas,
];

writeFileSync('divisores.json', JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_DIVISORES || 0),
  design: {
    schemaVersion: 1,
    designId: 'econut-web',
    expectedDesignRevision: 2,
    reviewState: 'session',
    rules: reglas,
  },
  composition: { schemaVersion: 2, nodes },
}, null, 2));

console.log(`divisores.json  · ${MUESTRAS.length} muestras · ${reglas.length} reglas`);
