/**
 * La página de términos y privacidad de econut.cl.
 *
 * ================== LÉASE ESTO ANTES DE PUBLICAR ======================
 *
 * EL TEXTO LEGAL DE ESTA PÁGINA NO ESTÁ VALIDADO POR UN ABOGADO.
 *
 * Es un modelo genérico, armado a pedido de Cristóbal, con los datos reales de
 * la empresa. Quien construye el sitio puede poner la página, enlazarla y
 * hacer que el banner funcione; lo que NO puede decidir es qué datos se
 * tratan, con qué base legal ni por cuánto tiempo. Eso lo decide un abogado, y
 * hasta que lo revise esta página es un borrador que vive en el WordPress
 * local y no en econut.cl.
 *
 * Lo que falta y tiene que completar la empresa está en
 * `Sesión Claude/econut-terminos-BORRADOR.md`, con su tabla: encargado de
 * protección de datos y plazo de conservación. Los dos aparecen en la página
 * marcados como pendientes, a propósito. Una política que dice «el tiempo
 * necesario» no dice nada, y es mejor que se vea el hueco que taparlo.
 *
 * ======================================================================
 *
 * Por qué se compone acá y no se escribe en bloques de WordPress: para que el
 * texto viva en el page builder, donde vive el resto del sitio, y Cristóbal
 * pueda corregirlo —o pegar lo que le devuelva el abogado— en el mismo lugar
 * donde edita todo lo demás, sin aprender otra herramienta.
 *
 * Uso:  node componer-legal.mjs      (genera legal.json; aplica aplicar-legal.mjs)
 */
import { writeFileSync } from 'node:fs';

const PAGE_ID = 55;
const DOCUMENT_ID = 'cod-canvas-page-55';

const VERDE = '#2E594A';
const TEXTO = '#333333';
const BEIGE = '#DBD4C0';

let n = 0;
const id = (p) => `${p}-${++n}`;

const reglas = [];
const R = (idRegla, kind, value, scope = {}) => {
  reglas.push({
    id: idRegla,
    kind,
    scope: { breakpoint: scope.bp || 'all', state: 'default', roles: [] },
    // La procedencia dice de dónde salió cada decisión. Acá no sale del sitio
    // publicado —esta página no existe en econut.cl— sino de la guía de
    // cumplimiento de la Ley 21.719, que es lo que la obliga a existir.
    provenance: {
      sources: [{
        kind: 'reference',
        reference: 'https://www.bcn.cl/leychile/navegar?idNorma=1208021',
        rationale: 'Ley 21.719: exige una política de privacidad clara y enlazada desde el sitio.',
      }],
    },
    status: 'reviewed',
    value,
  });
};

// ---------------------------------------------------------------- el diseño
//
// Una página de texto corrido. No lleva nada de la gracia del resto del sitio
// —ni velos, ni fotos, ni cuadrantes— y eso es a propósito: un documento legal
// se lee, no se recorre, y cualquier adorno acá sólo compite con la lectura.
// Lo único que se cuida es la medida de línea.

R('hoja', 'properties', {
  declarations: {
    'max-width': '760px',
    'margin-inline-start': 'auto',
    'margin-inline-end': 'auto',
    width: '100%',
    display: 'grid',
    'grid-template-columns': 'minmax(0, 1fr)',
    'row-gap': '0px',
  },
});
// El MISMO aire que el resto del sitio. Antes eran 64 px contra los 54 de la
// portada: dos valores para el mismo nombre dentro del mismo diseño, lo que
// hace imposible centralizar la hoja —la última definición ganaría para todas—.
// Si algún día esta página necesitara respirar distinto, la regla se llamaría
// distinto; una excepción tiene que decir que lo es.
R('aire', 'spacing', { paddingBlock: '54px', paddingInline: '24px' });
// En el teléfono, 24px de aire a cada lado dejan la columna en 342px, que es
// lo que hay. Lo que sí baja es el aire de arriba y abajo: 64px en una
// pantalla de 844 se come casi un sexto antes de la primera palabra.
R('aire-mobile', 'spacing', { paddingBlock: '32px', paddingInline: '20px' }, { bp: 'mobile' });

R('titulo', 'typography', { role: 'titulo', fontSize: '40px', lineHeight: 1.1, fontWeight: 700 });
R('titulo-color', 'surface', { foregroundColor: VERDE });
R('titulo-aire', 'spacing', { marginBlockEnd: '8px' });
R('titulo-mobile', 'typography', { role: 'titulo', fontSize: '30px', lineHeight: 1.15, fontWeight: 700 }, { bp: 'mobile' });

R('bajada', 'typography', { role: 'bajada', fontSize: '15px', lineHeight: 1.6 });
R('bajada-color', 'surface', { foregroundColor: '#6B6B6B' });
R('bajada-aire', 'spacing', { marginBlockEnd: '40px' });

R('seccion', 'typography', { role: 'titulo-seccion', fontSize: '22px', lineHeight: 1.2, fontWeight: 700 });
R('seccion-color', 'surface', { foregroundColor: VERDE });
R('seccion-aire', 'spacing', { marginBlockStart: '40px', marginBlockEnd: '12px' });

R('parrafo', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.7 });
R('parrafo-color', 'surface', { foregroundColor: TEXTO });
R('parrafo-aire', 'spacing', { marginBlockEnd: '16px' });

R('lista', 'typography', { role: 'cuerpo', fontSize: '16px', lineHeight: 1.7 });
R('lista-color', 'surface', { foregroundColor: TEXTO });
R('lista-aire', 'spacing', { marginBlockEnd: '16px' });

// El recuadro de lo que todavía falta. Va con el beige de la marca y no con un
// rojo de alerta: no es un error del sitio, es un dato que la empresa aún no
// definió, y pintarlo de rojo haría parecer que algo está roto.
R('pendiente', 'properties', {
  declarations: {
    'background-color': BEIGE,
    'padding-top': '16px',
    'padding-right': '20px',
    'padding-bottom': '16px',
    'padding-left': '20px',
    'border-radius': '10px',
    'margin-block-end': '16px',
  },
});
R('pendiente-texto', 'typography', { role: 'bajada', fontSize: '15px', lineHeight: 1.6 });
R('pendiente-color', 'surface', { foregroundColor: '#4A4A3F' });

R('tabla', 'properties', { declarations: { 'margin-block-end': '16px', width: '100%' } });

const P = (texto, extra = []) => ({
  id: id('p'),
  kind: 'paragraph',
  ruleIds: ['parrafo', 'parrafo-color', 'parrafo-aire', ...extra],
  content: { text: texto },
});

const H = (texto) => ({
  id: id('h'),
  kind: 'heading',
  ruleIds: ['seccion', 'seccion-color', 'seccion-aire'],
  content: { text: texto, level: 2 },
});

const L = (items) => ({
  id: id('l'),
  kind: 'list',
  ruleIds: ['lista', 'lista-color', 'lista-aire'],
  content: { ordered: false, items },
});

const PENDIENTE = (texto) => ({
  id: id('g'),
  kind: 'group',
  ruleIds: ['pendiente'],
  children: [{
    id: id('p'),
    kind: 'paragraph',
    ruleIds: ['pendiente-texto', 'pendiente-color'],
    content: { text: texto },
  }],
});

const T = (encabezados, filas) => ({
  id: id('t'),
  kind: 'table',
  ruleIds: ['tabla'],
  content: { headers: encabezados, rows: filas },
});

// ---------------------------------------------------------------- el texto
const nodes = [{
  id: 'legal', kind: 'group', ruleIds: ['aire', 'aire-mobile'], children: [{
    id: id('g'), kind: 'group', ruleIds: ['hoja'], children: [
      {
        id: id('h'), kind: 'heading',
        ruleIds: ['titulo', 'titulo-color', 'titulo-aire', 'titulo-mobile'],
        content: { text: 'Términos y privacidad', level: 1 },
      },
      P('Última actualización: 3 de octubre de 2026.', ['bajada', 'bajada-color', 'bajada-aire']),

      H('1. Quién es el responsable'),
      P('Comercializadora Econut SpA, RUT 76.717.930-8, con domicilio en Avda. 18 de '
        + 'Septiembre S/N, Hijuela 2, Fundo San Rafael, Sector Nuevo Sendero, Paine, Región '
        + 'Metropolitana, es responsable del tratamiento de los datos personales que se recogen '
        + 'en este sitio.'),
      P('Para cualquier materia relacionada con sus datos personales puede escribir a '
        + 'contacto@econut.cl o llamar al (56 2) 2 824 2229.'),

      H('2. Qué datos recogemos'),
      P('Los que usted nos entrega. Cuando completa el formulario de contacto le pedimos su '
        + 'nombre, su correo electrónico, su teléfono y el mensaje que quiera dejarnos, además '
        + 'del área a la que dirige su consulta.'),
      P('Los que se recogen solos. Si usted lo autoriza, recogemos datos sobre cómo usa el '
        + 'sitio: qué páginas visita, cuánto tiempo permanece y desde qué tipo de dispositivo '
        + 'entra. Esto se hace mediante cookies, y sólo si acepta.'),

      H('3. Para qué los usamos'),
      L([
        'Para responder su consulta.',
        'Para contactarlo si solicita información sobre nuestros productos o servicios.',
        'Si lo autoriza, para entender cómo se usa el sitio y mejorar su contenido, y para '
          + 'medir nuestras campañas de publicidad.',
      ]),
      P('No vendemos sus datos personales a terceros.'),

      H('4. Con quién los compartimos'),
      P('Usamos servicios de terceros que pueden tratar datos desde fuera de Chile. Se activan '
        + 'sólo si usted acepta las cookies correspondientes:'),
      T(['Servicio', 'Para qué', 'Dónde'], [
        ['Google (Tag Manager, Ads)', 'Medir el sitio y nuestras campañas', 'Estados Unidos'],
        ['Mapbox', 'Mostrar el mapa de cómo llegar', 'Estados Unidos'],
      ]),

      H('5. Sus derechos'),
      P('Usted puede, en cualquier momento y sin costo:'),
      L([
        'Acceder a los datos que tenemos sobre usted.',
        'Rectificarlos si están equivocados o incompletos.',
        'Cancelarlos, pidiendo que los eliminemos.',
        'Oponerse a que los usemos para un fin determinado.',
        'Portarlos, pidiendo que se los entreguemos en un formato que pueda llevarse a otra parte.',
      ]),
      P('Para ejercer cualquiera de estos derechos escriba a contacto@econut.cl indicando cuál '
        + 'de ellos quiere ejercer. Le responderemos en el plazo que establece la ley.'),
      P('Si considera que no respondimos adecuadamente, puede reclamar ante la Agencia de '
        + 'Protección de Datos Personales.'),

      H('6. Cookies'),
      P('Este sitio usa cookies. Las necesarias para que funcione están siempre activas; las de '
        + 'medición y publicidad sólo se activan si usted las acepta, y nada se carga antes de '
        + 'que responda.'),
      P('Puede cambiar su decisión cuando quiera desde «Preferencias de cookies», en el pie de '
        + 'cualquier página.'),

      H('7. Cuánto tiempo conservamos sus datos'),
      PENDIENTE('Pendiente: este plazo lo define la empresa. Debe decir un plazo concreto o un '
        + 'criterio claro, no «el tiempo necesario».'),

      H('8. Quién responde por sus datos'),
      PENDIENTE('Pendiente: la empresa debe designar a quién responde las solicitudes sobre '
        + 'datos personales, y publicar acá su contacto.'),

      H('9. Cambios a esta política'),
      P('Si cambiamos esta política publicaremos la versión nueva en esta misma página, '
        + 'indicando la fecha de la última actualización.'),

      H('Normativa aplicable'),
      P('Esta política se rige por la Ley 19.628 sobre protección de la vida privada y por la '
        + 'Ley 21.719, que entra en vigencia el 1 de diciembre de 2026.'),
    ],
  }],
}];

writeFileSync('legal.json', JSON.stringify({
  pageId: PAGE_ID,
  documentId: DOCUMENT_ID,
  expectedRevision: Number(process.env.REV_LEGAL || 0),
  design: {
    schemaVersion: 1,
    designId: 'econut-web',
    expectedDesignRevision: 2,
    reviewState: 'session',
    rules: reglas,
  },
  composition: { schemaVersion: 2, nodes },
}, null, 2));

console.log(`legal.json  · reglas: ${reglas.length}`);
