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
const VERDE = '#2E594A';   // el verde de Econut, medido en el pie de econut.cl

const f = {
  logoHorizontal: M + 'Logo-horizontal-@svg.svg',
  logoCalado: M + 'Logo-calado-20.png',
  logoAltfx: M + 'Altfx-2-Calado.png',   // el crédito de diseño, en el pie
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
  // El botón de WhatsApp del encabezado, copiado del de Santa Luisa: una
  // píldora con el logotipo y la palabra al lado. Medido allá: 34 de alto,
  // radio 999, relleno 8 y 14, icono de 18, separación 8, texto en 11,5 con
  // peso 700 y 0,69 de espaciado. Lo único que cambia es el color, que acá es
  // el verde de Econut y no el oliva de Santa Luisa.
  //
  // El logo queda centrado en la barra y la píldora se va al extremo derecho
  // sin empujarlo: por eso el contenedor reparte en tres y el botón vive en la
  // tercera parte, alineado al final.
  R('h-barra', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) auto minmax(0, 1fr)',
    'align-items': 'center', width: '100%',
  } });
  R('h-wa-lado', 'properties', { declarations: {
    display: 'flex', 'justify-content': 'flex-end', 'align-items': 'center',
  } });
  R('h-wa-pildora', 'properties', { declarations: {
    display: 'inline-flex', 'align-items': 'center', gap: '8px',
    'background-color': VERDE, 'border-radius': '999px',
    'padding-top': '5px', 'padding-bottom': '5px',
    'padding-left': '14px', 'padding-right': '14px',
  } });
  // Sin interlínea 1 y sin margen el párrafo inflaba la píldora a 50 de alto.
  R('h-wa-texto', 'typography', { role: 'rotulo', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.69px', lineHeight: 1 });
  R('h-wa-sin-margen', 'properties', { declarations: {
    'margin-block-start': '0px', 'margin-block-end': '0px',
  } });
  R('h-wa-blanco', 'color', { role: 'rotulo', color: BLANCO, apply: 'text' });

  const nodes = [{
    id: 'encabezado', marker: 'encabezado', kind: 'header', ruleIds: ['h-aire', 'h-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['h-barra'], children: [
        { id: id('g'), kind: 'group', ruleIds: [], children: [] },
        { id: id('g'), kind: 'group', ruleIds: ['h-centrado'], children: [
          { id: id('i'), kind: 'image', ruleIds: ['h-logo'],
            content: { assetUrl: f.logoHorizontal, alt: 'Econut · procesos, productos, perspectiva' } },
        ] },
        { id: id('g'), kind: 'group', ruleIds: ['h-wa-lado'], children: [
          { id: id('g'), kind: 'group', ruleIds: ['h-wa-pildora'], children: [
            { id: id('w'), kind: 'whatsapp', ruleIds: [], content: {
              message: 'Hola, quiero más información sobre los servicios de Econut.',
              ariaLabel: 'Escribir a Econut por WhatsApp',
              // La primitiva no baja de 24, así que el dibujo de 18 que usa
              // Santa Luisa se consigue con 24 menos 3 de relleno por lado.
              size: 24, iconPadding: 3, iconColor: BLANCO, backgroundColor: 'transparent', borderRadius: '0px',
            } },
            { id: id('p'), kind: 'paragraph', ruleIds: ['h-wa-texto', 'h-wa-blanco', 'h-wa-sin-margen'], content: { text: 'WhatsApp' } },
          ] },
        ] },
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
  // El pie del original no es negro: es el verde de la marca, #2E594A. Y mide
  // 120px de alto con el logotipo a la izquierda, así que el aire es poco.
  R('p-superficie', 'surface', { backgroundColor: '#2E594A', foregroundColor: BLANCO });
  R('p-aire', 'spacing', { paddingBlock: '10px', paddingInline: '24px' });
  R('p-barra', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': '74px minmax(0, 1fr) 200px', 'column-gap': '40px',
    'align-items': 'center', 'max-width': '1080px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', width: '100%',
  } });
  // En el original el logotipo del pie mide 74x60, no 140 de ancho.
  R('p-logo', 'properties', { declarations: { width: '74px', 'max-width': '74px' } });
  // El crédito de quien hizo el sitio, a la derecha del todo, como el original.
  R('p-credito', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) 71px', 'column-gap': '12px',
    'align-items': 'center', 'justify-items': 'end',
  } });
  R('p-credito-texto', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4, align: 'end' });
  R('p-credito-logo', 'properties', { declarations: { width: '71px', 'max-width': '71px' } });
  // 12px con interlínea 1.4: en el original las tres líneas de la dirección
  // caben en 50px de alto, y con 13/1.6 ocupaban 71.
  R('p-texto', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4, align: 'end' });
  R('p-columna', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '0px', 'justify-items': 'end',
  } });

  const nodes = [{
    id: 'pie', marker: 'pie', kind: 'footer', ruleIds: ['p-aire', 'p-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['p-barra'], children: [
        { id: id('i'), kind: 'image', ruleIds: ['p-logo'], content: { assetUrl: f.logoCalado, alt: 'Econut' } },
        { id: id('g'), kind: 'group', ruleIds: ['p-columna'], children: [
          // La dirección, copiada literal del pie de econut.cl. La que había
          // acá —«Ruta 78 de Septiembre s/n, Parcela 3 / Rinconada de Doñihue,
          // Región del Libertador»— era otra calle, otra comuna y otra región.
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto'], content: { text: 'Av 18 de Septiembre sn Hijuela 2' } },
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto'], content: { text: 'Fundo San Rafael - Sector Nuevo Sendero,' } },
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto'], content: { text: 'Paine, Región Metropolitana' } },
        ] },
        { id: id('g'), kind: 'group', ruleIds: ['p-credito'], children: [
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-credito-texto'], content: { text: 'Diseño y desarrollo' } },
          { id: id('i'), kind: 'image', ruleIds: ['p-credito-logo'], content: { assetUrl: f.logoAltfx, alt: 'Altfx' } },
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
