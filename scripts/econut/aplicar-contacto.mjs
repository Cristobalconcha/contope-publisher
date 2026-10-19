/**
 * El ciclo completo para la página de Contacto: la crea si no existe, genera,
 * previsualiza, aplica y publica.
 *
 * Hermano de `aplicar-legal.mjs`. Se diferencia en dos cosas:
 *
 *  - La página se BUSCA por su título («Contacto») y se crea si falta, así el
 *    guion sirve igual en el espejo y en un WordPress en blanco: el número de
 *    una página cambia de una instalación a otra y no se puede dar por
 *    sabido. `ECONUT_CONTACTO_PAGE_ID` lo fuerza si hiciera falta.
 *  - Exige que el formulario `contacto-econut` esté publicado ANTES (se importa
 *    desde el panel de Orugantt Forms con `fixtures/contacto-econut.json` de
 *    ese plugin). Sin él la página saldría con la tarjeta vacía.
 *
 * Uso:
 *   node aplicar-contacto.mjs            crea (si falta), genera, previsualiza, aplica y publica
 *   node aplicar-contacto.mjs --probar    sólo previsualiza (necesita que la página ya exista)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const soloProbar = process.argv.includes('--probar');
const TITULO = 'Contacto';
const SLUG_FORMULARIO = 'contacto-econut';

const llamar = (herramienta, args) => {
  const cli = ['lienzo.mjs', herramienta];
  if (args !== undefined) {
    writeFileSync(`${aqui}/.args-contacto.json`, JSON.stringify(args));
    cli.push('.args-contacto.json');
  }
  const salida = execFileSync('node', cli, { cwd: aqui, encoding: 'utf8', maxBuffer: 1e8, env: process.env });
  const cuerpo = salida.split('\n').slice(1).join('\n').trim();
  try { return JSON.parse(cuerpo); } catch { return { _texto: cuerpo }; }
};

// 1. El formulario tiene que existir.
const formularios = llamar('cod_list_canvas_forms');
if (!formularios?.forms?.some((f) => f.slug === SLUG_FORMULARIO)) {
  console.error(`El formulario «${SLUG_FORMULARIO}» no está publicado en este sitio.\n`
    + 'Impórtalo en Orugantt Forms (Importar formulario → fixtures/contacto-econut.json) y publícalo; después repite.');
  process.exit(1);
}

// 2. La página: por variable de entorno, por título, o se crea.
let pageId = Number(process.env.ECONUT_CONTACTO_PAGE_ID || 0);
if (!pageId) {
  const lista = llamar('cod_list_canvas_pages');
  const existente = (lista?.pages || []).find((p) => p.title === TITULO);
  if (existente) {
    pageId = existente.pageId;
    console.log(`página «${TITULO}» ya existe: #${pageId}`);
  } else if (soloProbar) {
    console.error(`no existe la página «${TITULO}» y con --probar no la creo`);
    process.exit(1);
  } else {
    const creada = llamar('cod_create_canvas_page', { title: TITULO });
    pageId = creada?.pageId ?? creada?.page?.pageId ?? creada?.page?.id ?? creada?.id;
    if (!pageId) {
      console.error('no pude crear la página:', JSON.stringify(creada).slice(0, 300));
      process.exit(1);
    }
    console.log(`página «${TITULO}» creada: #${pageId}`);
  }
}
const DOCUMENT_ID = 'cod-canvas-page-' + pageId;
const entorno = { ...process.env, ECONUT_CONTACTO_PAGE_ID: String(pageId) };

// 3. La revisión que está ahora. Nunca suponerla: el apply la compara.
const estado = llamar('cod_get_canvas_page_state', { pageId });
const revision = estado?.document?.revision;
if (typeof revision !== 'number') {
  console.error('no pude leer la revisión:', JSON.stringify(estado).slice(0, 300));
  process.exit(1);
}
console.log(`revisión actual: ${revision}`);

execFileSync('node', ['componer-contacto.mjs'], {
  cwd: aqui, encoding: 'utf8', env: { ...entorno, REV_CONTACTO: String(revision) },
});

// 4. Previsualizar y aplicar con el previewId de ESA previsualización.
const previo = llamar('cod_preview_canvas_composition', JSON.parse(readFileSync(`${aqui}/contacto.json`, 'utf8')));
if (!previo?.previewId) {
  console.error('la previsualización falló:', (previo?._texto || JSON.stringify(previo)).slice(0, 600));
  process.exit(1);
}
console.log('preview ok');
if (soloProbar) {
  console.log('(--probar: no escribo)');
  process.exit(0);
}

const receta = JSON.parse(readFileSync(`${aqui}/contacto.json`, 'utf8'));
receta.previewId = previo.previewId;
const hecho = llamar('cod_apply_canvas_composition', receta);
if (!hecho?.document?.revision) {
  console.error('el apply falló:', (hecho?._texto || JSON.stringify(hecho)).slice(0, 600));
  process.exit(1);
}
console.log(`aplicado · revisión ${hecho.document.revision} · respaldo ${hecho.snapshot?.id || '(sin id)'}`);

// 5. Publicar: una página en borrador da 404 a quien no es administrador.
const publicado = llamar('cod_publish_canvas_page', {
  pageId, documentId: DOCUMENT_ID, expectedRevision: hecho.document.revision,
});
if (publicado?.page?.status === 'publish' || publicado?.page?.url) {
  console.log(`publicada · ${publicado.page.url || ''} · estado ${publicado.page.status || '(sin estado)'}`);
} else {
  console.error('ojo: el publish no confirmó:', (publicado?._texto || JSON.stringify(publicado)).slice(0, 400));
  process.exit(1);
}
