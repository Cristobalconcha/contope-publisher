/**
 * Pruebas estáticas del slice experimental "Open CoDesign Canvas (Experimental)".
 *
 * Verifican sobre el AST de PHP —no por coincidencia de texto— que la pantalla
 * comprueba capacidad y nonce, que sanea y valida las tres representaciones, y
 * que persiste en una entidad WordPress localizada por ID estable. Añaden además
 * la comprobación de integridad del vendor GrapesJS incluido en el plugin.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import parser from 'php-parser';

const repoRoot = new URL('../', import.meta.url);
const pluginRoot = new URL('open-codesign-publisher/', repoRoot);

/** Vendor esperado: GrapesJS 0.23.4, BSD-3-Clause, copiado sin CDN. */
const VENDOR = {
  version: '0.23.4',
  files: {
    'grapes.min.js': {
      bytes: 1150929,
      sha256: '66155421db3a640add8eaf77391b6a744d36af80833cd91d44f8d3220fb76231',
    },
    'grapes.min.css': {
      bytes: 61053,
      sha256: 'fb55e939b3349c280d68c0617dc87e56baa3eab55ea56a1855db9f5efcc7268d',
    },
  },
};

const engine = new parser.Engine({
  parser: { extractDoc: true, php7: true },
  ast: { withPositions: false },
});

let assertions = 0;
const failures = [];

function check(condition, message) {
  assertions++;
  if (!condition) failures.push(message);
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.kind === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    walk(node[key], visit);
  }
}

function identifierName(node) {
  if (!node) return null;
  if (typeof node === 'string') return node;
  if (node.kind === 'identifier' || node.kind === 'name') return node.name;
  if (node.kind === 'string') return node.value;
  return null;
}

function callName(node) {
  if (node.kind !== 'call' || !node.what) return null;
  const target = node.what;
  if (target.kind === 'name') return target.name;
  if (target.kind === 'propertylookup' || target.kind === 'staticlookup') {
    return identifierName(target.offset);
  }
  return null;
}

function callsOf(node) {
  const found = [];
  walk(node, (child) => {
    const name = callName(child);
    if (name) found.push({ name, node: child });
  });
  return found;
}

function callNames(node) {
  return callsOf(node).map((entry) => entry.name);
}

function firstCall(node, name) {
  return callsOf(node).find((entry) => entry.name === name)?.node ?? null;
}

function classOf(ast, name) {
  let found = null;
  walk(ast, (node) => {
    if (node.kind === 'class' && identifierName(node.name) === name) found = node;
  });
  return found;
}

function methodOf(classNode, name) {
  return classNode.body.find((node) => node.kind === 'method' && identifierName(node.name) === name) ?? null;
}

function constantOf(classNode, name) {
  for (const member of classNode.body) {
    if (member.kind !== 'classconstant') continue;
    for (const constant of member.constants) {
      if (identifierName(constant.name) === name) return literal(constant.value);
    }
  }
  return undefined;
}

function literal(node) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.kind === 'string') return node.value;
  if (node.kind === 'number') return Number(node.value);
  if (node.kind === 'boolean') return node.value;
  if (node.kind === 'nullkeyword') return null;
  return undefined;
}

/** `self::NAME` → "NAME". */
function selfConstant(node) {
  if (!node || node.kind !== 'staticlookup' || node.what?.kind !== 'selfreference') return null;
  return identifierName(node.offset);
}

function arrayEntries(node) {
  const entries = new Map();
  if (!node || node.kind !== 'array') return entries;
  for (const item of node.items) {
    if (item.kind !== 'entry' || !item.key) continue;
    const key = literal(item.key);
    if (typeof key === 'string') entries.set(key, item.value);
  }
  return entries;
}

function stringLiterals(node) {
  const values = [];
  walk(node, (child) => {
    if (child.kind === 'string') values.push(child.value);
  });
  return values;
}

async function parsePhp(relativePath) {
  const path = fileURLToPath(new URL(relativePath, repoRoot));
  const source = await readFile(path, 'utf8');
  return { ast: engine.parseCode(source, path), source };
}

// ---------------------------------------------------------------------------
// Capacidad y nonce en la superficie administrativa.
// ---------------------------------------------------------------------------

async function checkAdminSurface() {
  const { ast, source } = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-editor-admin.php');
  const admin = classOf(ast, 'OCD_Canvas_Editor_Admin');
  check(admin !== null, 'Falta la clase OCD_Canvas_Editor_Admin.');
  if (!admin) return;

  check(
    constantOf(admin, 'CAPABILITY') === 'manage_options',
    'OCD_Canvas_Editor_Admin::CAPABILITY debe ser manage_options.',
  );
  check(
    typeof constantOf(admin, 'NONCE_ACTION') === 'string' && constantOf(admin, 'NONCE_ACTION') !== '',
    'OCD_Canvas_Editor_Admin::NONCE_ACTION debe ser una cadena no vacía.',
  );
  check(
    constantOf(admin, 'GRAPESJS_VERSION') === VENDOR.version,
    `GRAPESJS_VERSION debe declarar ${VENDOR.version}.`,
  );

  // Menú bajo Herramientas con la capacidad exigida.
  const addMenu = methodOf(admin, 'add_menu');
  check(addMenu !== null, 'Falta OCD_Canvas_Editor_Admin::add_menu().');
  const menuCall = addMenu && firstCall(addMenu, 'add_management_page');
  check(menuCall !== null, 'add_menu() debe registrar la pantalla con add_management_page().');
  if (menuCall) {
    check(
      selfConstant(menuCall.arguments[2]) === 'CAPABILITY',
      'add_management_page() debe recibir self::CAPABILITY como capacidad.',
    );
    check(
      constantOf(admin, 'PAGE_SLUG') === literal(menuCall.arguments[3]) ||
        selfConstant(menuCall.arguments[3]) === 'PAGE_SLUG',
      'add_management_page() debe usar self::PAGE_SLUG como slug.',
    );
    check(
      stringLiterals(menuCall.arguments[0]).join(' ').includes('Experimental'),
      'El título del menú debe identificar la pantalla como experimental.',
    );
  }

  // Los dos endpoints AJAX y el render exigen capacidad antes que nada.
  for (const name of ['handle_load', 'handle_save', 'render_page']) {
    const method = methodOf(admin, name);
    check(method !== null, `Falta OCD_Canvas_Editor_Admin::${name}().`);
    if (!method) continue;

    const first = method.body.children[0];
    const capabilityCall = first && first.kind === 'if' ? firstCall(first.test, 'current_user_can') : null;
    check(
      capabilityCall !== null,
      `${name}() debe empezar comprobando current_user_can().`,
    );
    check(
      capabilityCall !== null && selfConstant(capabilityCall.arguments[0]) === 'CAPABILITY',
      `${name}() debe comprobar exactamente self::CAPABILITY.`,
    );
  }

  check(
    callNames(methodOf(admin, 'render_page')).includes('wp_die'),
    'render_page() debe cortar con wp_die() cuando falta la capacidad.',
  );

  for (const name of ['handle_load', 'handle_save']) {
    const method = methodOf(admin, name);
    if (!method) continue;

    const nonceCall = firstCall(method, 'check_ajax_referer');
    check(nonceCall !== null, `${name}() debe verificar el nonce con check_ajax_referer().`);
    if (nonceCall) {
      check(
        selfConstant(nonceCall.arguments[0]) === 'NONCE_ACTION',
        `${name}() debe verificar el nonce contra self::NONCE_ACTION.`,
      );
      check(
        literal(nonceCall.arguments[1]) === 'nonce',
        `${name}() debe leer el nonce del campo "nonce".`,
      );
    }
    // La verificación no puede quedar detrás de trabajo real.
    const guardIndex = method.body.children.findIndex(
      (statement) => firstCall(statement, 'check_ajax_referer') !== null,
    );
    check(
      guardIndex === 1,
      `${name}() debe verificar el nonce inmediatamente después de la capacidad.`,
    );
    check(
      callNames(method).includes('wp_send_json_error'),
      `${name}() debe responder errores con wp_send_json_error().`,
    );
  }

  // El nonce que consume el navegador se emite con la misma acción.
  const enqueue = methodOf(admin, 'enqueue_assets');
  check(enqueue !== null, 'Falta OCD_Canvas_Editor_Admin::enqueue_assets().');
  if (enqueue) {
    const nonceCreate = firstCall(enqueue, 'wp_create_nonce');
    check(nonceCreate !== null, 'enqueue_assets() debe emitir el nonce con wp_create_nonce().');
    check(
      nonceCreate !== null && selfConstant(nonceCreate.arguments[0]) === 'NONCE_ACTION',
      'wp_create_nonce() debe usar self::NONCE_ACTION.',
    );
    check(
      firstCall(enqueue, 'current_user_can') !== null,
      'enqueue_assets() no debe publicar el nonce sin comprobar la capacidad.',
    );

    // Vendor local: sin CDN y con plugins_url.
    const enqueued = callsOf(enqueue).filter(
      (entry) => entry.name === 'wp_enqueue_script' || entry.name === 'wp_enqueue_style',
    );
    check(enqueued.length === 4, 'enqueue_assets() debe encolar los dos assets vendor y los dos propios.');
    for (const entry of enqueued) {
      check(
        firstCall(entry.node.arguments[1], 'plugins_url') !== null,
        'Cada asset debe resolverse con plugins_url() desde el propio plugin.',
      );
    }
    const vendorPaths = stringLiterals(enqueue).filter((value) => value.includes('vendor/grapesjs'));
    check(
      vendorPaths.includes('assets/vendor/grapesjs/grapes.min.js') &&
        vendorPaths.includes('assets/vendor/grapesjs/grapes.min.css'),
      'enqueue_assets() debe cargar GrapesJS desde assets/vendor/grapesjs.',
    );

    const inline = firstCall(enqueue, 'wp_add_inline_script');
    check(inline !== null, 'La configuración del editor debe viajar por wp_add_inline_script().');
    check(
      callNames(enqueue).includes('wp_json_encode'),
      'La configuración en línea debe serializarse con wp_json_encode().',
    );
    check(
      /JSON_HEX_TAG/.test(source),
      'La configuración en línea debe codificarse con JSON_HEX_TAG para no romper el <script>.',
    );
  }

  // Entrada saneada: nada de $_POST crudo, ni $_GET/$_REQUEST en este módulo.
  const save = methodOf(admin, 'handle_save');
  if (save) {
    const superglobals = [];
    walk(save, (node) => {
      if (node.kind === 'variable' && ['_GET', '_REQUEST', '_COOKIE', '_SERVER'].includes(node.name)) {
        superglobals.push(node.name);
      }
    });
    check(superglobals.length === 0, `handle_save() no debe leer ${superglobals.join(', ')}.`);

    const postReads = new Set();
    walk(save, (node) => {
      if (node.kind === 'offsetlookup' && node.what?.kind === 'variable' && node.what.name === '_POST') {
        postReads.add(node);
      }
    });
    check(postReads.size >= 3, 'handle_save() debe leer projectData, HTML y CSS de $_POST.');

    const guarded = new Set();
    walk(save, (node) => {
      if (callName(node) === 'wp_unslash') {
        walk(node.arguments, (child) => {
          if (postReads.has(child)) guarded.add(child);
        });
      }
      if (node.kind === 'isset') {
        walk(node.variables, (child) => {
          if (postReads.has(child)) guarded.add(child);
        });
      }
    });
    check(
      guarded.size === postReads.size,
      'Toda lectura de $_POST debe pasar por isset() y wp_unslash().',
    );

    const saveCalls = callNames(save);
    for (const sanitizer of ['sanitize_project_data', 'sanitize_html', 'sanitize_css']) {
      check(saveCalls.includes(sanitizer), `handle_save() debe invocar ${sanitizer}().`);
    }
    check(
      saveCalls.filter((name) => name === 'is_wp_error').length >= 4,
      'handle_save() debe comprobar is_wp_error() tras cada saneamiento y tras persistir.',
    );
    check(saveCalls.includes('save'), 'handle_save() debe delegar la persistencia en el repositorio.');
  }

  return source;
}

// ---------------------------------------------------------------------------
// Saneamiento y validación.
// ---------------------------------------------------------------------------

async function checkSanitizer() {
  const { ast } = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-document-sanitizer.php');
  const sanitizer = classOf(ast, 'OCD_Canvas_Document_Sanitizer');
  check(sanitizer !== null, 'Falta la clase OCD_Canvas_Document_Sanitizer.');
  if (!sanitizer) return;

  for (const [name, max] of [
    ['MAX_HTML_BYTES', 4194304],
    ['MAX_CSS_BYTES', 1048576],
    ['MAX_PROJECT_BYTES', 8388608],
  ]) {
    const value = constantOf(sanitizer, name);
    check(
      typeof value === 'number' && value > 0 && value <= max,
      `${name} debe declarar un límite positivo y acotado.`,
    );
  }
  check(
    typeof constantOf(sanitizer, 'MAX_PROJECT_DEPTH') === 'number',
    'MAX_PROJECT_DEPTH debe acotar la profundidad del JSON.',
  );

  const html = methodOf(sanitizer, 'sanitize_html');
  check(html !== null, 'Falta sanitize_html().');
  if (html) {
    const names = callNames(html);
    check(names.includes('wp_kses'), 'sanitize_html() debe filtrar con wp_kses().');
    check(
      names.includes('add_filter') && names.includes('remove_filter'),
      'sanitize_html() debe acotar el filtro safe_style_css al propio saneamiento.',
    );
    check(
      stringLiterals(html).includes('safe_style_css'),
      'sanitize_html() debe extender las propiedades de estilo por safe_style_css.',
    );
    check(
      callNames(html).includes('unsupported_tags'),
      'sanitize_html() debe detectar las etiquetas no representables antes de filtrar.',
    );
  }

  const allowed = methodOf(sanitizer, 'allowed_html');
  check(allowed !== null, 'Falta allowed_html().');
  if (allowed) {
    const blocked = stringLiterals(allowed);
    for (const tag of ['iframe', 'script', 'style', 'object', 'embed', 'form']) {
      check(blocked.includes(tag), `allowed_html() debe retirar explícitamente <${tag}>.`);
    }
    let unsets = 0;
    walk(allowed, (node) => {
      if (node.kind === 'unset') unsets++;
    });
    check(unsets >= 1, 'allowed_html() debe eliminar las etiquetas prohibidas del conjunto de wp_kses.');
    check(
      callNames(allowed).includes('wp_kses_allowed_html'),
      'allowed_html() debe partir del conjunto permitido de WordPress.',
    );
  }

  const css = methodOf(sanitizer, 'sanitize_css');
  check(css !== null, 'Falta sanitize_css().');
  if (css) {
    const values = stringLiterals(css).map((value) => value.toLowerCase());
    for (const needle of ['javascript:', 'vbscript:', 'expression(', '@import', 'behavior:', 'data:text/html']) {
      check(values.includes(needle), `sanitize_css() debe rechazar ${needle}.`);
    }
    check(values.includes('<'), 'sanitize_css() debe rechazar el carácter "<" para no romper contextos HTML.');
    check(
      callNames(css).includes('first_invalid_css_url'),
      'sanitize_css() debe validar los esquemas de url().',
    );
  }

  const project = methodOf(sanitizer, 'sanitize_project_data');
  check(project !== null, 'Falta sanitize_project_data().');
  if (project) {
    const names = callNames(project);
    check(names.includes('json_decode'), 'sanitize_project_data() debe decodificar el JSON recibido.');
    check(names.includes('json_last_error'), 'sanitize_project_data() debe comprobar el error de json_decode().');
    check(names.includes('wp_json_encode'), 'sanitize_project_data() debe reencodificar de forma canónica.');
    const decode = firstCall(project, 'json_decode');
    check(
      decode !== null && selfConstant(decode.arguments[2]) === 'MAX_PROJECT_DEPTH',
      'json_decode() debe recibir el límite de profundidad declarado.',
    );
  }

  // Las tres rutas devuelven WP_Error ante entrada no representable.
  for (const name of ['sanitize_html', 'sanitize_css', 'sanitize_project_data']) {
    const method = methodOf(sanitizer, name);
    if (!method) continue;
    let errors = 0;
    walk(method, (node) => {
      if (node.kind === 'new' && identifierName(node.what) === 'WP_Error') errors++;
    });
    check(errors >= 1, `${name}() debe rechazar explícitamente con WP_Error.`);
  }
}

// ---------------------------------------------------------------------------
// Persistencia en una entidad WordPress con ID estable.
// ---------------------------------------------------------------------------

async function checkRepository() {
  const { ast } = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-document-repository.php');
  const repository = classOf(ast, 'OCD_Canvas_Document_Repository');
  check(repository !== null, 'Falta la clase OCD_Canvas_Document_Repository.');
  if (!repository) return;

  const documentId = constantOf(repository, 'DOCUMENT_ID');
  check(
    typeof documentId === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(documentId),
    'DOCUMENT_ID debe ser un identificador estable en minúsculas.',
  );
  const postType = constantOf(repository, 'POST_TYPE');
  check(
    typeof postType === 'string' && postType.length > 0 && postType.length <= 20,
    'POST_TYPE debe ser un nombre de entidad válido para WordPress.',
  );

  const metaKeys = ['META_DOCUMENT_ID', 'META_PROJECT_DATA', 'META_HTML', 'META_CSS', 'META_REVISION'].map((name) =>
    constantOf(repository, name),
  );
  check(
    metaKeys.every((value) => typeof value === 'string' && value.startsWith('_')),
    'Las claves meta deben existir y ser privadas (prefijo "_").',
  );
  check(
    new Set(metaKeys).size === metaKeys.length,
    'projectData, HTML y CSS deben guardarse en claves meta distintas.',
  );

  const registerType = methodOf(repository, 'register_post_type');
  check(registerType !== null, 'Falta register_post_type().');
  if (registerType) {
    const call = firstCall(registerType, 'register_post_type');
    check(call !== null, 'Debe registrarse la entidad con register_post_type().');
    if (call) {
      const args = arrayEntries(call.arguments[1]);
      for (const flag of ['public', 'publicly_queryable', 'show_ui', 'show_in_rest']) {
        check(literal(args.get(flag)) === false, `La entidad experimental debe declarar ${flag} => false.`);
      }
    }
    const metaCalls = callsOf(registerType).filter((entry) => entry.name === 'register_post_meta');
    check(metaCalls.length >= 1, 'Las metas deben registrarse con register_post_meta().');
    for (const entry of metaCalls) {
      const args = arrayEntries(entry.node.arguments[2]);
      check(args.has('auth_callback'), 'register_post_meta() debe declarar auth_callback.');
      check(literal(args.get('show_in_rest')) === false, 'Las metas no deben exponerse por REST.');
    }
    check(
      /current_user_can/.test(JSON.stringify(registerType)) &&
        stringLiterals(registerType).includes('manage_options'),
      'El auth_callback de las metas debe exigir manage_options.',
    );
  }

  // Identidad por ID estable, nunca por slug.
  const find = methodOf(repository, 'find_post_id');
  check(find !== null, 'Falta find_post_id().');
  if (find) {
    const query = firstCall(find, 'get_posts');
    check(query !== null, 'find_post_id() debe consultar con get_posts().');
    if (query) {
      const args = arrayEntries(query.arguments[0]);
      check(args.has('meta_query'), 'find_post_id() debe localizar el documento por meta_query.');
      check(
        selfConstant(args.get('post_type')) === 'POST_TYPE',
        'find_post_id() debe acotar la consulta a la entidad experimental.',
      );
      const metaQuery = JSON.stringify(args.get('meta_query') ?? {});
      check(
        metaQuery.includes('META_DOCUMENT_ID'),
        'La meta_query debe filtrar por META_DOCUMENT_ID.',
      );
    }
    const identityStrings = stringLiterals(find);
    check(
      !identityStrings.includes('post_name') && !identityStrings.includes('name'),
      'find_post_id() no debe usar el slug como identidad.',
    );
  }

  const save = methodOf(repository, 'save');
  check(save !== null, 'Falta save().');
  if (save) {
    const updates = callsOf(save).filter((entry) => entry.name === 'update_post_meta');
    const updatedConstants = updates.map((entry) => selfConstant(entry.node.arguments[1]));
    for (const meta of ['META_PROJECT_DATA', 'META_HTML', 'META_CSS', 'META_REVISION']) {
      check(updatedConstants.includes(meta), `save() debe persistir ${meta} por separado.`);
    }
    check(callNames(save).includes('ensure_post_id'), 'save() debe resolver el post por ID estable.');
  }

  const load = methodOf(repository, 'load');
  check(load !== null, 'Falta load().');
  check(
    load !== null && callNames(load).includes('ensure_post_id'),
    'load() debe resolver el post por ID estable.',
  );

  const ensure = methodOf(repository, 'ensure_post_id');
  check(
    ensure !== null && callNames(ensure).includes('wp_insert_post'),
    'ensure_post_id() debe crear la entidad cuando aún no existe.',
  );
  if (ensure) {
    const insert = firstCall(ensure, 'wp_insert_post');
    const args = insert ? arrayEntries(insert.arguments[0]) : new Map();
    check(
      literal(args.get('post_status')) === 'draft',
      'El documento experimental no debe crearse publicado.',
    );
  }
}

// ---------------------------------------------------------------------------
// Aislamiento respecto al importador y ausencia de iframe/CDN.
// ---------------------------------------------------------------------------

async function checkIsolationAndAssets() {
  const untouched = [
    'open-codesign-publisher/includes/class-ocd-admin.php',
    'open-codesign-publisher/includes/class-ocd-importer.php',
    'open-codesign-publisher/includes/class-ocd-block-serializer.php',
    'open-codesign-publisher/includes/class-ocd-package-validator.php',
  ];
  for (const relativePath of untouched) {
    const source = await readFile(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8');
    check(
      !/canvas/i.test(source),
      `${relativePath} no debe conocer el módulo Canvas: el slice es aislado.`,
    );
  }

  const bootstrap = await readFile(
    fileURLToPath(new URL('open-codesign-publisher/open-codesign-publisher.php', repoRoot)),
    'utf8',
  );
  for (const file of [
    'class-ocd-canvas-document-sanitizer.php',
    'class-ocd-canvas-document-repository.php',
    'class-ocd-canvas-editor-admin.php',
  ]) {
    check(bootstrap.includes(file), `El bootstrap debe requerir ${file}.`);
  }
  check(
    /new OCD_Canvas_Editor_Admin\(/.test(bootstrap) && /->register\(\)/.test(bootstrap),
    'El bootstrap debe registrar el módulo Canvas.',
  );
  check(
    /new OCD_Admin\(\$importer\)/.test(bootstrap),
    'El bootstrap no debe alterar el registro del importador existente.',
  );

  const authored = [
    'open-codesign-publisher/includes/class-ocd-canvas-editor-admin.php',
    'open-codesign-publisher/includes/class-ocd-canvas-document-repository.php',
    'open-codesign-publisher/includes/class-ocd-canvas-document-sanitizer.php',
    'open-codesign-publisher/assets/js/ocd-canvas-editor.js',
    'open-codesign-publisher/assets/css/ocd-canvas-editor.css',
  ];
  const cdnPattern = /(unpkg\.com|jsdelivr\.net|cdnjs\.|cdn\.|fonts\.googleapis\.com|grapesjs\.com\/)/i;
  for (const relativePath of authored) {
    const source = await readFile(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8');
    check(!cdnPattern.test(source), `${relativePath} no debe referenciar un CDN.`);
    check(
      !/<iframe/i.test(source),
      `${relativePath} no debe emitir un iframe como formato publicado.`,
    );
  }

  // La pantalla y el script comparten exactamente los mismos controles.
  const adminSource = await readFile(
    fileURLToPath(new URL('open-codesign-publisher/includes/class-ocd-canvas-editor-admin.php', repoRoot)),
    'utf8',
  );
  const script = await readFile(
    fileURLToPath(new URL('open-codesign-publisher/assets/js/ocd-canvas-editor.js', repoRoot)),
    'utf8',
  );
  for (const controlId of [
    'ocd-canvas-save',
    'ocd-canvas-reload',
    'ocd-canvas-export-html',
    'ocd-canvas-export-css',
    'ocd-canvas-import-apply',
  ]) {
    check(adminSource.includes(`"${controlId}"`), `La pantalla debe exponer el control ${controlId}.`);
    check(script.includes(`'${controlId}'`), `El editor debe enlazar el control ${controlId}.`);
  }
  check(
    /body\.set\('nonce', config\.nonce\)/.test(script),
    'Cada petición del editor debe enviar el nonce.',
  );
  check(
    /credentials: 'same-origin'/.test(script),
    'Las peticiones del editor deben usar credenciales de la misma sesión.',
  );
  check(
    /getProjectData\(\)/.test(script) && /getHtml\(\)/.test(script) && /getCss\(\)/.test(script),
    'El editor debe enviar datos estructurados, HTML y CSS por separado.',
  );
  check(
    /storageManager: false/.test(script),
    'GrapesJS no debe usar su almacenamiento propio: la persistencia es de WordPress.',
  );
}

// ---------------------------------------------------------------------------
// Integridad del vendor GrapesJS incluido en el plugin.
// ---------------------------------------------------------------------------

async function checkVendor() {
  for (const [name, expected] of Object.entries(VENDOR.files)) {
    const path = fileURLToPath(new URL(`assets/vendor/grapesjs/${name}`, pluginRoot));
    const info = await stat(path).catch(() => null);
    check(info !== null, `Falta el asset vendor ${name}.`);
    if (!info) continue;
    check(
      info.size === expected.bytes,
      `${name} debe medir ${expected.bytes} bytes documentados (mide ${info.size}).`,
    );
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    check(digest === expected.sha256, `El SHA-256 de ${name} no coincide con el documentado.`);
  }

  const script = await readFile(
    fileURLToPath(new URL('assets/vendor/grapesjs/grapes.min.js', pluginRoot)),
    'utf8',
  );
  check(
    script.startsWith(`/*! grapesjs - ${VENDOR.version} */`),
    `grapes.min.js debe declarar la versión ${VENDOR.version}.`,
  );

  const license = await readFile(
    fileURLToPath(new URL('assets/vendor/grapesjs/LICENSE', pluginRoot)),
    'utf8',
  );
  check(
    license.includes('Redistribution and use in source and binary forms'),
    'Debe incluirse el texto de la licencia BSD-3-Clause de GrapesJS.',
  );
  check(license.includes('Artur Arseniev'), 'La licencia debe conservar el aviso de copyright original.');

  const notice = await readFile(
    fileURLToPath(new URL('assets/vendor/grapesjs/README.md', pluginRoot)),
    'utf8',
  );
  for (const fragment of [VENDOR.version, 'BSD-3-Clause', String(VENDOR.files['grapes.min.js'].bytes)]) {
    check(notice.includes(fragment), `La procedencia del vendor debe documentar "${fragment}".`);
  }

  const doc = await readFile(
    fileURLToPath(new URL('docs/canvas-editor-experimental.md', repoRoot)),
    'utf8',
  );
  for (const fragment of [VENDOR.version, 'BSD-3-Clause', 'manage_options', 'nonce']) {
    check(doc.includes(fragment), `La documentación del slice debe cubrir "${fragment}".`);
  }
}

export async function runCanvasEditorChecks() {
  assertions = 0;
  failures.length = 0;

  await checkAdminSurface();
  await checkSanitizer();
  await checkRepository();
  await checkIsolationAndAssets();
  await checkVendor();

  if (failures.length > 0) {
    throw new Error(
      `Canvas editor: ${failures.length} de ${assertions} comprobaciones fallaron:\n - ${failures.join('\n - ')}`,
    );
  }

  return `Canvas editor: ${assertions} comprobaciones estáticas correctas.`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-canvas-editor.mjs')) {
  console.log(await runCanvasEditorChecks());
}
