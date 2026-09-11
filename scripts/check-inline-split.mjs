/**
 * Prueba headless del split-back del editor en línea (corrección de M3).
 *
 * Sin WordPress: carga el vendor local de GrapesJS 0.23.4 y el IIFE real de
 * `cod-inline-editor.js` (que expone `window.OCDInlineSplit.build/split`), arma
 * el compuesto con la MISMA lógica del plugin, edita un texto del Encabezado y
 * otro del Cuerpo vía la API de GrapesJS, corre el split-back y verifica que:
 *
 *   1. el texto editado del header queda SOLO en el project_data/html del doc
 *      header;
 *   2. el del body solo en el body;
 *   3. el footer queda intacto;
 *   4. cada project_data por doc carga con loadProjectData en una instancia
 *      GrapesJS nueva sin perder el contenido;
 *   5. un estilo compartido byte-idéntico por header y body queda COPIADO en
 *      AMBOS docs (no se pierde por colisión de firma), el exclusivo del header
 *      queda solo en header y el del footer solo en footer;
 *   6. cada doc recupera SU arreglo original de assets;
 *   7. la forma `pages[0].component` (sin frames) también aísla el contenido.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const asset = (relative) =>
  pathToFileURL(path.join(repoRoot, 'contope-publisher', 'assets', relative)).href;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temp = mkdtempSync(path.join(tmpdir(), 'cod-inline-split-'));
const fixture = path.join(temp, 'index.html');

// Escenario A: docs con `frames` (forma real de getProjectData) + estilos y
// assets. El estilo `cod-shared` es byte-idéntico en header y body.
const sharedStyle = { selectors: ['cod-shared'], style: { 'max-width': '1140px' } };
const headerOnlyStyle = { selectors: ['cod-header-only'], style: { color: '#111111' } };
const footerOnlyStyle = { selectors: ['cod-footer-only'], style: { color: '#222222' } };

function makeDocFrames(documentId, kind, text, styles, assetSrc) {
  return {
    documentId,
    projectData: JSON.stringify({
      assets: [{ src: assetSrc }],
      pages: [
        {
          frames: [
            {
              component: {
                type: 'wrapper',
                components: [{ type: 'text', tagName: 'p', content: text }],
              },
            },
          ],
        },
      ],
      styles: styles,
    }),
    html: '<p>' + text + '</p>',
    css: '.cod-' + kind + '{color:#111}',
  };
}

const docsA = {
  header: makeDocFrames('cod-doc-header', 'header', 'ENCABEZADO-ORIGINAL', [sharedStyle, headerOnlyStyle], 'https://example.test/h.png'),
  body: makeDocFrames('cod-doc-body', 'body', 'CUERPO-ORIGINAL', [sharedStyle], 'https://example.test/b.png'),
  footer: makeDocFrames('cod-doc-footer', 'footer', 'PIE-ORIGINAL', [footerOnlyStyle], 'https://example.test/f.png'),
};

// Escenario B: docs con `pages[0].component` (sin frames), solo contenido.
function makeDocNoFrames(documentId, text) {
  return {
    documentId,
    projectData: JSON.stringify({
      pages: [
        { component: { type: 'wrapper', components: [{ type: 'text', tagName: 'p', content: text }] } },
      ],
      styles: [],
    }),
    html: '<p>' + text + '</p>',
    css: '',
  };
}

const docsB = {
  header: makeDocNoFrames('cod-doc-h-noframes', 'ENCABEZADO-NOFRAMES'),
  body: makeDocNoFrames('cod-doc-b-noframes', 'CUERPO-NOFRAMES'),
  footer: makeDocNoFrames('cod-doc-f-noframes', 'PIE-NOFRAMES'),
};

// El harness no usa secuencias de escape problemáticas (`\n`), para poder
// vivir dentro del template literal del HTML sin romper el script generado.
const harness = `(function () {
  var result = { passed: false, details: {} };

  function wrapperModel(editor, kind) {
    var models = editor.getWrapper().components().models;
    for (var i = 0; i < models.length; i++) {
      var attr = models[i].getAttributes();
      if (attr && attr['data-cod-inline-region'] === kind) {
        return models[i];
      }
    }
    return null;
  }

  function selectorNames(projectData) {
    var pd = JSON.parse(projectData);
    var styles = pd.styles || [];
    return styles.map(function (s) {
      var sel = s.selectors || [];
      return sel.map(function (x) { return typeof x === 'string' ? x : (x && x.name ? x.name : ''); }).join(',');
    });
  }

  function assetSrcs(projectData) {
    var pd = JSON.parse(projectData);
    var assets = pd.assets || [];
    return assets.map(function (a) { return a && a.src ? a.src : ''; });
  }

  function hasSelector(projectData, name) {
    return selectorNames(projectData).indexOf(name) !== -1;
  }

  function runScenario(containerId, docs, headerEdit, bodyEdit) {
    var editor = grapesjs.init({
      container: containerId,
      height: '400px',
      fromElement: false,
      storageManager: false,
      noticeOnUnload: false
    });
    var config = { pageId: 42, bodyDocument: docs.body, regions: { header: docs.header, footer: docs.footer } };
    var builtResult = window.OCDInlineSplit.build(editor, config);
    if (!builtResult.ok) {
      throw new Error('No se pudo armar el compuesto (' + containerId + ').');
    }
    var built = builtResult.built;

    wrapperModel(editor, 'header').components().models[0].set('content', headerEdit);
    wrapperModel(editor, 'body').components().models[0].set('content', bodyEdit);

    return {
      header: window.OCDInlineSplit.split(editor, config, built, 'header'),
      body: window.OCDInlineSplit.split(editor, config, built, 'body'),
      footer: window.OCDInlineSplit.split(editor, config, built, 'footer')
    };
  }

  function loadsWithoutLoss(projectData, expectedText) {
    var fresh = grapesjs.init({
      container: '#fresh',
      fromElement: false,
      storageManager: false,
      noticeOnUnload: false
    });
    fresh.loadProjectData(JSON.parse(projectData));
    var html = fresh.getHtml() || '';
    var stored = JSON.stringify(fresh.getProjectData()) || '';
    return html.indexOf(expectedText) !== -1 && stored.indexOf(expectedText) !== -1;
  }

  try {
    // ---------- Escenario A: frames + estilos + assets ----------
    var A = runScenario('#r', ${JSON.stringify(docsA)}, 'ENCABEZADO-EDITADO', 'CUERPO-EDITADO');

    var headerProject = A.header.projectData;
    var bodyProject = A.body.projectData;
    var footerProject = A.footer.projectData;

    var checks = {
      headerHasEdited: headerProject.indexOf('ENCABEZADO-EDITADO') !== -1 && A.header.html.indexOf('ENCABEZADO-EDITADO') !== -1,
      headerExcludesBody: headerProject.indexOf('CUERPO-EDITADO') === -1 && A.header.html.indexOf('CUERPO-EDITADO') === -1,
      headerExcludesFooter: headerProject.indexOf('PIE-ORIGINAL') === -1 && A.header.html.indexOf('PIE-ORIGINAL') === -1,
      bodyHasEdited: bodyProject.indexOf('CUERPO-EDITADO') !== -1 && A.body.html.indexOf('CUERPO-EDITADO') !== -1,
      bodyExcludesHeader: bodyProject.indexOf('ENCABEZADO-EDITADO') === -1 && A.body.html.indexOf('ENCABEZADO-EDITADO') === -1,
      bodyExcludesFooter: bodyProject.indexOf('PIE-ORIGINAL') === -1 && A.body.html.indexOf('PIE-ORIGINAL') === -1,
      footerIntact: footerProject.indexOf('PIE-ORIGINAL') !== -1 && A.footer.html.indexOf('PIE-ORIGINAL') !== -1,
      footerExcludesEdits: footerProject.indexOf('ENCABEZADO-EDITADO') === -1 && footerProject.indexOf('CUERPO-EDITADO') === -1 && A.footer.html.indexOf('ENCABEZADO-EDITADO') === -1 && A.footer.html.indexOf('CUERPO-EDITADO') === -1,

      // Estilos: el compartido queda en AMBOS docs; cada exclusivo solo en el suyo.
      sharedInHeader: hasSelector(headerProject, 'cod-shared'),
      sharedInBody: hasSelector(bodyProject, 'cod-shared'),
      sharedNotInFooter: !hasSelector(footerProject, 'cod-shared'),
      headerOnlyInHeader: hasSelector(headerProject, 'cod-header-only'),
      headerOnlyNotInBody: !hasSelector(bodyProject, 'cod-header-only'),
      headerOnlyNotInFooter: !hasSelector(footerProject, 'cod-header-only'),
      footerOnlyInFooter: hasSelector(footerProject, 'cod-footer-only'),
      footerOnlyNotInHeader: !hasSelector(headerProject, 'cod-footer-only'),
      footerOnlyNotInBody: !hasSelector(bodyProject, 'cod-footer-only'),
      headerStyleCount: selectorNames(headerProject).length === 2,
      bodyStyleCount: selectorNames(bodyProject).length === 1,
      footerStyleCount: selectorNames(footerProject).length === 1,

      // Assets: cada doc recupera SU arreglo original.
      headerAsset: assetSrcs(headerProject).indexOf('https://example.test/h.png') !== -1 && assetSrcs(headerProject).length === 1,
      bodyAsset: assetSrcs(bodyProject).indexOf('https://example.test/b.png') !== -1 && assetSrcs(bodyProject).length === 1,
      footerAsset: assetSrcs(footerProject).indexOf('https://example.test/f.png') !== -1 && assetSrcs(footerProject).length === 1,

      headerLoads: loadsWithoutLoss(headerProject, 'ENCABEZADO-EDITADO'),
      bodyLoads: loadsWithoutLoss(bodyProject, 'CUERPO-EDITADO'),
      footerLoads: loadsWithoutLoss(footerProject, 'PIE-ORIGINAL')
    };

    // ---------- Escenario B: pages[0].component (sin frames) ----------
    var B = runScenario('#r2', ${JSON.stringify(docsB)}, 'ENCABEZADO-NOFRAMES-EDIT', 'CUERPO-NOFRAMES-EDIT');
    var bHeader = B.header.projectData;
    var bBody = B.body.projectData;
    var bFooter = B.footer.projectData;

    checks.noFramesHeaderIsolated = bHeader.indexOf('ENCABEZADO-NOFRAMES-EDIT') !== -1 && bHeader.indexOf('CUERPO-NOFRAMES-EDIT') === -1 && bHeader.indexOf('PIE-NOFRAMES') === -1;
    checks.noFramesBodyIsolated = bBody.indexOf('CUERPO-NOFRAMES-EDIT') !== -1 && bBody.indexOf('ENCABEZADO-NOFRAMES-EDIT') === -1 && bBody.indexOf('PIE-NOFRAMES') === -1;
    checks.noFramesFooterIntact = bFooter.indexOf('PIE-NOFRAMES') !== -1 && bFooter.indexOf('ENCABEZADO-NOFRAMES-EDIT') === -1 && bFooter.indexOf('CUERPO-NOFRAMES-EDIT') === -1;
    checks.noFramesHeaderLoads = loadsWithoutLoss(bHeader, 'ENCABEZADO-NOFRAMES-EDIT');
    checks.noFramesBodyLoads = loadsWithoutLoss(bBody, 'CUERPO-NOFRAMES-EDIT');

    result.details = {
      checks: checks,
      headerProjectData: headerProject,
      bodyProjectData: bodyProject,
      footerProjectData: footerProject,
      headerHtml: A.header.html,
      bodyHtml: A.body.html,
      footerHtml: A.footer.html
    };
    result.passed = Object.keys(checks).every(function (key) { return checks[key]; });
  } catch (error) {
    result.details.error = String(error && error.message) + ' | ' + String(error && error.stack);
  }
  document.documentElement.setAttribute('data-cod-split', window.btoa(JSON.stringify(result)));
})();`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${asset('vendor/grapesjs/grapes.min.css')}"></head>
<body>
<div id="r"></div><div id="r2"></div><div id="fresh" style="display:none"></div>
<script src="${asset('vendor/grapesjs/grapes.min.js')}"></script>
<script src="${asset('js/cod-inline-editor.js')}"></script>
<script>${harness}</script>
</body></html>`;

try {
  writeFileSync(fixture, html, 'utf8');
  const result = spawnSync(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--allow-file-access-from-files',
      '--virtual-time-budget=12000',
      '--dump-dom',
      pathToFileURL(fixture).href,
    ],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 12 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  const output = result.stdout || '';
  const match = output.match(/data-cod-split="([^"]+)"/);
  if (!match) {
    throw new Error('El resultado del split-back no se pudo leer del DOM: ' + (result.stderr || ''));
  }
  const payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));

  if (!payload.passed) {
    throw new Error(
      'Split-back no pasó: ' + JSON.stringify(payload.details, null, 2)
    );
  }

  console.log('OK: split-back del editor en línea pasó.');
  console.log('Forma real del projectData por doc (evidencia):');
  console.log('  header.projectData = ' + payload.details.headerProjectData);
  console.log('  body.projectData   = ' + payload.details.bodyProjectData);
  console.log('  footer.projectData = ' + payload.details.footerProjectData);
  console.log('Checks: ' + JSON.stringify(payload.details.checks));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
