/**
 * BORRADOR de contenido para Diferenciales y Preguntas frecuentes, en el
 * ESPEJO (8890). 18-nov-2026.
 *
 * Decisión de Cristóbal: el SEO se mejora enriqueciendo las páginas que ya
 * existen, con lo técnico del proyecto. Queda FUERA todo lo de financiamiento
 * (bancos, pie, formas de pago): el dueño del proyecto no quiere publicarlo.
 * La pregunta 9 de Preguntas frecuentes queda sólo con su primera frase (el
 * financiamiento se gestiona con el banco que cada uno elija).
 *
 * Todos los datos salen de textos ya publicados y validados por el cliente:
 * las publicaciones de Instagram de la agencia y la portada del sitio. Nada
 * de acá es inventado; lo que no tenía fuente (desagüe, horario de visitas,
 * detalle del circuito de seguridad) NO se escribió.
 *
 * Lee la composición que está AHORA, agrega o cambia sólo lo listado y la
 * vuelve a entregar completa. Si ya se aplicó, no duplica.
 *
 *   node seo/contenido-borrador.mjs diferenciales [--probar]
 *   node seo/contenido-borrador.mjs preguntas [--probar]
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cual = process.argv.slice(2).find((a) => !a.startsWith('--'));
const soloProbar = process.argv.includes('--probar');

const llamar = (herramienta, datos) => {
  const archivo = `.seo-${herramienta}.json`;
  writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos));
  const salida = execFileSync('node', ['lienzo.mjs', herramienta, archivo], { cwd: carpeta, encoding: 'utf8', maxBuffer: 1e8 });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};
const buscar = (nodos, id) => {
  for (const n of nodos || []) {
    if (n.id === id) return n;
    const h = buscar(n.children, id);
    if (h) return h;
  }
  return null;
};
const parrafo = (id, ruleIds, text) => ({ id, kind: 'paragraph', role: '', marker: '', ruleIds, cadenceRuleId: '', children: [], content: { text } });

// ------------------------------------------------------------ Diferenciales
const regla = (id, declarations) => ({
  id, label: '', kind: 'properties', scope: { breakpoint: 'all', state: 'default', roles: [] },
  provenance: { sources: [{ kind: 'reference', label: '', reference: 'borrador SEO del 18-nov-2026', rationale: 'Propuesta para la galería de tarjetas; pendiente de revisión de Cristóbal.' }], confidence: null },
  status: 'reviewed', value: { declarations },
});
const diferenciales = (comp, design) => {
  for (const r of [
    regla('sl-tarjeta-foto', { 'aspect-ratio': '5 / 8', 'border-top-left-radius': '14px', 'border-top-right-radius': '14px', 'border-bottom-right-radius': '14px', 'border-bottom-left-radius': '14px' }),
    regla('sl-tarjeta-titulo', { display: 'block' }),
    regla('sl-tarjeta-texto', { display: 'block', 'font-size': '13px', 'font-weight': '400', 'line-height': '1.5', 'margin-block-start': '4px' }),
  ]) if (!design.rules.some((x) => x.id === r.id)) design.rules.push(r);
  // Validación decía «documentación y respaldo legal»; ahora dice cuál.
  const validacion = buscar(comp.nodes, 'pilar-2-cuerpo');
  validacion.content.text = 'Rol propio, plano autorizado por el SAG e inscripción en el Conservador de Bienes Raíces de Buin, disponibles para revisar antes de comprar.';

  // La urbanización era ocho fotos con un rótulo cada una y ninguna frase.
  // Pedido de Cristóbal (18-nov-2026): que sea una galería de TARJETAS, cada
  // foto con su título y un texto corto debajo, que además queda indexable.
  // El título es el rótulo que ya tenía; el texto es nuevo. Para eso el
  // plugin 0.3.89 le agregó `description` a la imagen.
  const infra = buscar(comp.nodes, 'seccion-infra');
  infra.children = infra.children.filter((n) => n.id !== 'infra-bajada');
  const TEXTOS = {
    'Agua certificada': 'Agua potable de pozo propio, con recepción de la Seremi. La red incluye grifo contra incendios.',
    'Luz subterránea': 'La electricidad del loteo se distribuye bajo tierra: la urbanización es completamente soterrada.',
    'Tablero de control': 'Un tablero eléctrico central controla las bombas y el pozo del loteo.',
    'Bombas y pozo': 'Circuitos propios para las bombas y el pozo, con estanques de respaldo de más de 40.000 litros.',
    'Empalme por parcela': 'Cada parcela tiene su propio empalme eléctrico, ya instalado.',
    'Conexión por parcela': 'Conexión eléctrica individual para cada parcela, con su cámara de registro.',
    'Urbanización soterrada': 'Las instalaciones van bajo tierra: mejor estética, mayor seguridad y menor impacto visual.',
    'Iluminación del camino': 'Caminos interiores con luminarias, preparados para entrar todo el año.',
  };
  const galeria = buscar(comp.nodes, 'infra-galeria');
  for (const item of galeria.content.items) {
    if (!TEXTOS[item.caption]) throw new Error('foto sin texto previsto: ' + item.caption);
    item.description = TEXTOS[item.caption];
  }
  // El redondeo pasa de la pieza a la FOTO: en la pieza recortaba también el
  // texto. Y la foto fija su proporción (5/8, la que ya tenía: 274×438) para
  // que las ocho midan lo mismo aunque sus textos no.
  const { pieza, ...resto } = galeria.partes || {};
  galeria.partes = { ...resto, foto: ['sl-tarjeta-foto'], 'leyenda-titulo': ['sl-tarjeta-titulo'], 'leyenda-texto': ['sl-tarjeta-texto'] };
};

// ------------------------------------------------------- Preguntas frecuentes
const NUEVAS = [
  ['¿De dónde viene el agua?',
    'De un pozo propio del loteo, con recepción de la Seremi. La red se respalda con estanques de más de 40.000 litros, y cada parcela recibe agua potable.'],
  ['¿Cómo es el acceso y la seguridad del loteo?',
    'El loteo tiene cerco perimetral completo y acceso controlado con portón eléctrico. Se llega por camino pavimentado hasta el portón.'],
  ['¿En qué estado están los caminos en invierno?',
    'Los caminos interiores están preparados para entrar con tranquilidad durante todo el año, también con lluvia, y cuentan con iluminación.'],
  ['¿Qué hay cerca de Santa Luisa de Palpi?',
    'A menos de 20 minutos están el Colegio San Isidro, el Colegio Campanario, el Club de Golf Las Araucarias, el Strip Center Alto Jahuel y la Comisaría de Carabineros. Santiago queda a 45 minutos en auto, por Ruta 5 o Autopista Acceso Sur.'],
  ['¿Desde qué precio parten las parcelas?',
    'Desde 3.590 UF. La disponibilidad cambia; escríbenos por WhatsApp y te enviamos las parcelas disponibles con su valor.'],
  ['¿Puedo comprar la parcela con casa?',
    'Sí, es opcional. Puedes elegir tu parcela y sumar una vivienda prediseñada, con un servicio que contempla arquitectura, especialidades, permisos municipales, construcción y recepción final. Hay tres modelos: Valle (140 m²), Ladera (215 m²) y Cordillera (248 m²). Parcela más casa desde 8.150 UF.'],
  ['¿Puedo visitar el proyecto antes de decidir?',
    'Sí, y lo recomendamos: la pendiente, los accesos y la orientación de cada parcela se entienden mejor en terreno. Escríbenos por WhatsApp y coordinamos tu visita.'],
];
const preguntas = (comp, design) => {
  const lista = buscar(comp.nodes, 'faq-lista');
  // El 18-nov-2026 Cristóbal quitó en producción, desde el editor, la frase
  // «Actualmente, BancoEstado no financia este tipo de operación». Acá se quita
  // el mismo nodo para que el espejo y lo que se suba digan lo mismo.
  const bancos = buscar(comp.nodes, 'faq-9');
  if (bancos) bancos.children = bancos.children.filter((n) => n.id !== 'faq-9-respuesta-2');
  // Van entre «¿se entregan cercadas?» y «etapas del proceso de compra»: lo
  // del proyecto primero, lo de la compra al final, como estaba.
  let donde = lista.children.findIndex((n) => n.id === 'faq-8');
  NUEVAS.forEach(([pregunta, respuesta], i) => {
    const id = `faq-${10 + i}`;
    if (buscar(comp.nodes, id)) return;
    lista.children.splice(donde, 0, {
      id, kind: 'group', role: '', marker: '', ruleIds: [], cadenceRuleId: '', content: [],
      children: [
        parrafo(`${id}-pregunta`, ['sl-faq-pregunta', 'sl-texto-oliva', 'sl-faq-pregunta-caja'], pregunta),
        parrafo(`${id}-respuesta-1`, ['sl-faq-respuesta', 'sl-texto-oliva', 'sl-faq-respuesta-aire'], respuesta),
      ],
    });
    donde += 1;
  });
};

const PAGINAS = { diferenciales: [62, diferenciales], preguntas: [61, preguntas] };
if (!PAGINAS[cual]) { console.error('uso: contenido-borrador.mjs diferenciales|preguntas [--probar]'); process.exit(1); }
const [pageId, cambiar] = PAGINAS[cual];

const leido = llamar('cod_read_canvas_composition', { pageId });
if (!leido.found) { console.error('la página no es una composición; no la toco.'); process.exit(1); }
const antes = leido.resumen?.nodeCount;
cambiar(leido.composition, leido.design);
const receta = { pageId: leido.page.pageId, documentId: leido.page.documentId, expectedRevision: leido.revision, design: leido.design, composition: leido.composition };
const previo = llamar('cod_preview_canvas_composition', receta);
if (!previo.previewId) { console.error('la previsualización falló:\n' + (previo._texto || JSON.stringify(previo)).slice(0, 1500)); process.exit(1); }
console.log(`${leido.page.title}: ${antes} nodos → ${previo.summary?.nodeCount ?? '?'} · ${previo.summary?.ruleCount ?? '?'} reglas`);
if (soloProbar) { console.log('(--probar: no escribo)'); process.exit(0); }
const hecho = llamar('cod_apply_canvas_composition', { ...receta, previewId: previo.previewId });
if (!hecho?.document?.revision) { console.error('el apply falló:\n' + (hecho._texto || JSON.stringify(hecho)).slice(0, 1500)); process.exit(1); }
console.log(`aplicado en el espejo · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);
