/**
 * La página de muestra de las familias nuevas del catálogo: posición,
 * desborde, transformación e icono.
 *
 * POR QUÉ UNA PÁGINA Y NO UNA CAPTURA. Porque tres de las cuatro sólo se ven
 * funcionando: una posición pegada necesita que la página se desplace, un
 * recorte necesita algo que se salga, y un hover necesita un ratón. Una hoja de
 * contactos no prueba ninguna de las tres.
 *
 * Se compone con las clases de regla nuevas, que es la vía por la que yo
 * trabajo; la ventana del lápiz hace lo mismo para quien edita a mano.
 *
 * Uso:  node componer-primitivas.mjs   (genera primitivas.json)
 */
import { writeFileSync } from 'node:fs';

const PAGE_ID = Number(process.env.PAGE_PRIMITIVAS || 0);
const DOCUMENT_ID = process.env.DOC_PRIMITIVAS || '';

const VERDE = '#2E594A';
const BEIGE = '#DBD4C0';
const BLANCO = '#FFFFFF';
const NARANJA = '#DC4017';
const I = '/wp-content/uploads/2026/10/icono-';

let n = 0;
const id = (p) => `${p}-${++n}`;

const reglas = [];
const R = (idRegla, kind, value, state = 'default') => {
  reglas.push({
    id: idRegla,
    kind,
    scope: { breakpoint: 'all', state, roles: [] },
    provenance: { sources: [{ kind: 'user', rationale: 'Muestra de las familias nuevas del catálogo.' }] },
    status: 'reviewed',
    value,
  });
};

// ------------------------------------------------------------------ el diseño
R('titulo', 'typography', { role: 'titulo', fontSize: '34px', lineHeight: 1.15, fontWeight: 700 });
R('rotulo', 'typography', { role: 'rotulo', fontSize: '13px', lineHeight: 1.4, transform: 'uppercase', letterSpacing: '0.08em' });
R('cuerpo', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.7 });
R('verde', 'surface', { backgroundColor: VERDE, foregroundColor: BLANCO });
R('clara', 'surface', { backgroundColor: BEIGE, foregroundColor: VERDE });
R('blanca', 'surface', { backgroundColor: BLANCO, foregroundColor: VERDE });
R('aire', 'spacing', { paddingBlock: '56px', paddingInline: '24px' });
R('aire-largo', 'spacing', { paddingBlock: '160px', paddingInline: '24px' });
R('caja', 'properties', { declarations: { 'max-width': '760px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', width: '100%' } });
R('columna', 'layout', { mode: 'stack', gap: '16px' });

// --------------------------------------------------------------- las familias
// POSICIÓN. La etiqueta se queda pegada mientras la sección pasa por detrás.
// Sin distancia no se pegaría nunca: el compilador la pone en 0 solo, y acá se
// declara 16px para que no toque el filo de la ventana.
R('pegada', 'posicion', { modo: 'pegada', arriba: '16px', capa: 2 });
// Una pieza pegada necesita fondo propio: lo que pasa por detrás tiene que
// quedar tapado, o se lee como dos textos encimados y parece un defecto.
R('pegada-fondo', 'surface', { backgroundColor: VERDE, foregroundColor: BLANCO });
R('pegada-aire', 'spacing', { paddingBlock: '10px', paddingInline: '12px' });
R('insignia-pos', 'posicion', { modo: 'relativa', arriba: '-34px', izquierda: '12px' });

// TRANSFORMACIÓN. Un estado, no una animación. Y el hover es la MISMA regla
// con otro alcance: eso es lo que Divi necesita resolver con un subsistema.
R('torcida', 'transformacion', { rotar: '-4deg' });
R('crece', 'transformacion', { escalar: 1 });
R('crece-hover', 'transformacion', { escalar: 1.06 }, 'hover');

// DESBORDE. La foto es más grande que su marco; recortar es lo que hace que la
// esquina redondeada afecte a lo de dentro.
R('marco', 'desborde', { horizontal: 'oculto', vertical: 'oculto' });
R('marco-forma', 'shape', { radius: '18px' });
R('marco-medida', 'properties', { declarations: { width: '260px', height: '170px' } });
R('foto-grande', 'properties', { declarations: { width: '420px', 'max-width': 'none' } });

// ICONO. El dibujo es un recurso del sitio, y el color lo hereda del texto.
R('ico-flecha', 'icono', { forma: `${I}flecha.svg`, donde: 'despues', tamano: '1.1em', separacion: '.5em' });
// POR NOMBRE, no por ruta. El documento guarda «schedule» y el ESTILO lo pone
// el sitio al mostrar la página: cambiar el ajuste de outlined a rounded
// cambia los cuatro de una vez, sin tocar esta página ni ninguna otra.
R('ico-reloj', 'icono', { nombre: 'schedule', tamano: '1.2em' });
R('ico-ubicacion', 'icono', { nombre: 'location_on', tamano: '1.2em' });
R('ico-hoja', 'icono', { nombre: 'eco', tamano: '1.2em' });
R('ico-correo', 'icono', { nombre: 'email', tamano: '1.2em', color: NARANJA });
R('boton', 'button', { variant: 'solid', tone: 'primary', size: 'md' });
R('lista-aire', 'spacing', { paddingBlock: '0px', paddingInline: '0px', gap: '10px' });

const parrafo = (texto, ...extra) => ({ id: id('p'), kind: 'paragraph', ruleIds: ['cuerpo', ...extra], content: { text: texto } });
const rotulo = (texto, ...extra) => ({ id: id('r'), kind: 'paragraph', ruleIds: ['rotulo', ...extra], content: { text: texto } });

const nodes = [
  {
    id: 'intro', kind: 'section', ruleIds: ['blanca', 'aire'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['caja', 'columna'],
      children: [
        { id: id('h'), kind: 'heading', ruleIds: ['titulo'], content: { text: 'Primitivas nuevas', level: 1 } },
        parrafo('Cuatro familias que antes había que escribir como CSS suelto y que ahora tienen '
          + 'su propia clase de regla y su control: posición —con «pegada» como un modo más—, '
          + 'desborde, transformación e icono.'),
      ],
    }],
  },

  // --- posición -------------------------------------------------------------
  {
    id: 'pos', kind: 'section', ruleIds: ['verde', 'aire-largo'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['caja', 'columna'],
      children: [
        { id: id('e'), kind: 'paragraph', ruleIds: ['rotulo', 'pegada', 'pegada-fondo', 'pegada-aire'], content: { text: 'Posición · pegada al desplazar' } },
        parrafo('Esta etiqueta se queda arriba mientras la sección pasa por detrás. Para Divi, '
          + '«sticky» es un subsistema aparte con su propia pestaña; acá es un valor más de la '
          + 'misma familia, que es como lo pidió Cristóbal.'),
        parrafo('Una posición pegada sin distancia no se pega nunca —el navegador la deja quieta y '
          + 'parece un control roto—, así que si no se declara, el compilador la pone en cero.'),
        parrafo('Y si algún contenedor de más arriba recortara su contenido, la pegada tampoco '
          + 'funcionaría. Esa combinación se rechaza al componer nombrando los dos nodos, en vez de '
          + 'dejar una pieza que no se pega y no avisa.'),
      ],
    }],
  },

  // --- transformación -------------------------------------------------------
  {
    id: 'tra', kind: 'section', ruleIds: ['clara', 'aire'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['caja', 'columna'],
      children: [
        rotulo('Transformación'),
        parrafo('Girar, escalar, mover o inclinar sin tocar el espacio que ocupa. Es un estado, no '
          + 'una animación: ésa es la familia «movimiento».'),
        { id: id('h'), kind: 'heading', ruleIds: ['titulo', 'torcida'], content: { text: 'Este título está torcido 4 grados', level: 2 } },
        parrafo('Y el botón de abajo crece al pasar el ratón. No hace falta nada nuevo para eso: es '
          + 'la misma regla con el estado «hover». Divi, en cambio, declara un gemelo de hover por '
          + 'cada campo transformable.'),
        {
          id: id('b'), kind: 'button', ruleIds: ['boton', 'crece', 'crece-hover', 'ico-flecha'],
          content: { label: 'Pasa el ratón por encima', href: '#tra' },
        },
      ],
    }],
  },

  // --- desborde -------------------------------------------------------------
  {
    id: 'des', kind: 'section', ruleIds: ['blanca', 'aire'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['caja', 'columna'],
      children: [
        rotulo('Desborde'),
        parrafo('La foto de abajo es más ancha que su marco. Recortar es la única forma de que una '
          + 'esquina redondeada afecte de verdad al contenido de dentro.'),
        {
          id: id('m'), kind: 'group', ruleIds: ['marco', 'marco-forma', 'marco-medida'],
          children: [{
            id: id('i'), kind: 'image', ruleIds: ['foto-grande'],
            content: { assetUrl: '/wp-content/uploads/2026/09/Aerea-Econut-01-1024x768.jpg', alt: 'Vista aérea del fundo, más ancha que su marco' },
          }],
        },
        parrafo('Es también lo que rompe una posición pegada, y por eso las dos familias se '
          + 'construyeron juntas.'),
      ],
    }],
  },

  // --- icono ----------------------------------------------------------------
  {
    id: 'ico', kind: 'section', ruleIds: ['verde', 'aire'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['caja', 'columna'],
      children: [
        rotulo('Icono'),
        parrafo('El dibujo es un SVG de Medios, no una lista cerrada: el mismo principio abierto que '
          + 'el divisor. Y la decisión contraria en lo único que importa —un divisor se estira a lo '
          + 'ancho a propósito; un icono no se deforma nunca—.'),
        {
          id: id('l'), kind: 'group', ruleIds: ['columna', 'lista-aire'],
          children: [
            parrafo('Lunes a viernes, de 9 a 18', 'ico-reloj'),
            parrafo('Paine, Región Metropolitana', 'ico-ubicacion'),
            parrafo('Nueces con cáscara y sin cáscara', 'ico-hoja'),
            parrafo('Escríbenos: el icono lleva su propio color', 'ico-correo'),
          ],
        },
        parrafo('Los cuatro de arriba heredan el color del texto. El del sobre declara el suyo, '
          + 'que es la excepción y no la norma: si lo hereda, cambiar la tinta del sistema lo '
          + 'arrastra sin tocar la página.'),
      ],
    }],
  },
];

writeFileSync('primitivas.json', JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_PRIMITIVAS || 0),
  design: {
    schemaVersion: 1,
    designId: 'econut-web',
    expectedDesignRevision: 2,
    reviewState: 'session',
    rules: reglas,
  },
  composition: { schemaVersion: 2, nodes },
}, null, 2));

console.log(`primitivas.json  · ${reglas.length} reglas`);
