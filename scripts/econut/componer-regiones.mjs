/**
 * Compone el encabezado y el pie de Econut COMO REGIONES GLOBALES, no como
 * secciones dentro de la página.
 *
 * Por qué: un encabezado dentro del cuerpo se repite y se edita por página, y
 * eso es exactamente lo que el sistema de plantillas del publisher existe para
 * evitar. Las regiones se crean con `crear-regiones.php` y se escriben por el
 * canal MCP con `pageId: 0` más el documentId de la región.
 *
 * Medido en econut.cl el 2026-09-30: el encabezado es una franja blanca de
 * 100px con el logotipo horizontal de 164x60 CENTRADO, y nada más. No hay menú.
 *
 * Deja dos archivos, `region-header.json` y `region-footer.json`, listos para
 * `cod_preview_canvas_composition` y `cod_apply_canvas_composition`.
 */
import { writeFileSync } from 'node:fs';

const M = '/wp-content/uploads/2026/09/';
const BLANCO = '#FFFFFF';
const OSCURO = '#222222';
const TEXTO = '#333333';

const f = {
  logoHorizontal: M + 'Logo-horizontal-@svg.svg',
  logoCalado: M + 'Logo-calado-20.png',
};

let n = 0;
const id = (p) => `${p}-${++n}`;

const hacerReglas = () => {
  const reglas = [];
  const R = (rid, kind, value) => {
    reglas.push({
      id: rid, kind,
      scope: { breakpoint: 'all', state: 'default', roles: [] },
      provenance: { sources: [{ kind: 'reference', reference: 'https://econut.cl/', rationale: 'Medido del sitio real con el navegador.' }] },
      status: 'reviewed', value,
    });
  };
  return { reglas, R };
};

// ---------------------------------------------------------------- encabezado
{
  const { reglas, R } = hacerReglas();
  R('h-superficie', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
  R('h-aire', 'spacing', { paddingBlock: '20px', paddingInline: '24px' });
  R('h-centrado', 'properties', { declarations: {
    display: 'flex', 'justify-content': 'center', 'align-items': 'center', width: '100%',
  } });
  R('h-logo', 'properties', { declarations: { width: '164px', 'max-width': '164px' } });

  const nodes = [{
    id: 'encabezado', marker: 'encabezado', kind: 'header', ruleIds: ['h-aire', 'h-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['h-centrado'], children: [
        { id: id('i'), kind: 'image', ruleIds: ['h-logo'],
          content: { assetUrl: f.logoHorizontal, alt: 'Econut · procesos, productos, perspectiva' } },
      ],
    }],
  }];

  writeFileSync('region-header.json', JSON.stringify({
    pageId: 0,
    documentId: 'cod-region-header',
    expectedRevision: Number(process.env.REV_HEADER || 0),
    design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
    composition: { schemaVersion: 2, nodes },
  }, null, 2));
  console.log('region-header.json  · reglas:', reglas.length);
}

// ----------------------------------------------------------------------- pie
{
  const { reglas, R } = hacerReglas();
  R('p-superficie', 'surface', { backgroundColor: OSCURO, foregroundColor: BLANCO });
  R('p-aire', 'spacing', { paddingBlock: '30px', paddingInline: '24px' });
  R('p-barra', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': '164px minmax(0, 1fr)', 'column-gap': '40px',
    'align-items': 'center', 'max-width': '1180px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', width: '100%',
  } });
  R('p-logo', 'properties', { declarations: { width: '140px', 'max-width': '140px' } });
  R('p-texto', 'typography', { role: 'pie', fontSize: '13px', lineHeight: 1.6, align: 'end' });
  R('p-columna', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '4px', 'justify-items': 'end',
  } });

  const nodes = [{
    id: 'pie', marker: 'pie', kind: 'footer', ruleIds: ['p-aire', 'p-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['p-barra'], children: [
        { id: id('i'), kind: 'image', ruleIds: ['p-logo'], content: { assetUrl: f.logoCalado, alt: 'Econut' } },
        { id: id('g'), kind: 'group', ruleIds: ['p-columna'], children: [
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto'], content: { text: 'Ruta 78 de Septiembre s/n, Parcela 3, Fundo San Rafael' } },
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto'], content: { text: 'Rinconada de Doñihue, Región del Libertador' } },
        ] },
      ],
    }],
  }];

  writeFileSync('region-footer.json', JSON.stringify({
    pageId: 0,
    documentId: 'cod-region-footer',
    expectedRevision: Number(process.env.REV_FOOTER || 0),
    design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
    composition: { schemaVersion: 2, nodes },
  }, null, 2));
  console.log('region-footer.json  · reglas:', reglas.length);
}
