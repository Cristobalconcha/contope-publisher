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

/** `$page->post_type === 'page'` / `$page->post_type !== 'page'` inside a method. */
function hasPostTypePageCheck(node) {
  let found = false;
  walk(node, (child) => {
    if (child.kind !== 'bin') return;
    const left = child.left;
    const right = child.right;
    const leftProp = left && left.kind === 'propertylookup' ? identifierName(left.offset) : null;
    const rightValue = literal(right);
    if (leftProp === 'post_type' && rightValue === 'page' && (child.type === '===' || child.type === '!==')) {
      found = true;
    }
  });
  return found;
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

  // Submenú de Open CoDesign con la capacidad exigida.
  const addMenu = methodOf(admin, 'add_menu');
  check(addMenu !== null, 'Falta OCD_Canvas_Editor_Admin::add_menu().');
  const menuCall = addMenu && firstCall(addMenu, 'add_submenu_page');
  check(menuCall !== null, 'add_menu() debe registrar la pantalla como submenú con add_submenu_page().');
  if (menuCall) {
    check(
      literal(menuCall.arguments[0]) === 'open-codesign-publisher' ||
        selfConstant(menuCall.arguments[0]) === 'PARENT_SLUG',
      'add_submenu_page() debe colgar del menú principal open-codesign-publisher.',
    );
    check(
      constantOf(admin, 'PARENT_SLUG') === 'open-codesign-publisher',
      'OCD_Canvas_Editor_Admin::PARENT_SLUG debe ser open-codesign-publisher.',
    );
    check(
      selfConstant(menuCall.arguments[3]) === 'CAPABILITY',
      'add_submenu_page() debe recibir self::CAPABILITY como capacidad.',
    );
    check(
      constantOf(admin, 'PAGE_SLUG') === literal(menuCall.arguments[4]) ||
        selfConstant(menuCall.arguments[4]) === 'PAGE_SLUG',
      'add_submenu_page() debe usar self::PAGE_SLUG como slug.',
    );
    check(
      stringLiterals(menuCall.arguments[1]).join(' ').includes('Experimental'),
      'El título de la página debe identificar la pantalla como experimental.',
    );
  }

  // Los dos endpoints AJAX y el render exigen capacidad antes que nada.
  for (const name of ['handle_load', 'handle_save', 'handle_resolve_assets', 'handle_publish', 'render_page']) {
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

  for (const name of ['handle_load', 'handle_save', 'handle_resolve_assets', 'handle_publish']) {
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
    check(enqueued.length === 8, 'enqueue_assets() debe encolar GrapesJS, los cuatro módulos Canvas y los assets propios.');
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

    check(
      source.includes("'autoLoadPageId'"),
      'La configuración JS debe incluir autoLoadPageId.',
    );
    check(
      source.includes("'autoLoadPageId' => $this->resolve_auto_load_page_id()"),
      'autoLoadPageId debe resolverse con resolve_auto_load_page_id().',
    );
  }

  // Botón "Editar con OCD" en la lista de Páginas y auto-carga por URL.
  const register = methodOf(admin, 'register');
  check(register !== null, 'Falta OCD_Canvas_Editor_Admin::register().');
  if (register) {
    const pageRowFilter = callsOf(register).filter((entry) => entry.name === 'add_filter');
    check(
      pageRowFilter.some((entry) => literal(entry.node.arguments[0]) === 'page_row_actions'),
      'register() debe registrar el filtro page_row_actions.',
    );
  }

  const pageRowAction = methodOf(admin, 'add_page_row_edit_with_ocd');
  check(pageRowAction !== null, 'Falta OCD_Canvas_Editor_Admin::add_page_row_edit_with_ocd().');
  if (pageRowAction) {
    const capabilityCall = firstCall(pageRowAction, 'current_user_can');
    check(capabilityCall !== null, 'El enlace de fila debe comprobar current_user_can().');
    check(
      capabilityCall !== null && selfConstant(capabilityCall.arguments[0]) === 'CAPABILITY',
      'El enlace de fila debe exigir self::CAPABILITY (manage_options).',
    );

    const adminUrlCall = firstCall(pageRowAction, 'admin_url');
    check(adminUrlCall !== null, 'El enlace de fila debe construirse con admin_url().');
    check(
      adminUrlCall !== null && literal(adminUrlCall.arguments[0]) === 'admin.php',
      'El enlace "Editar con OCD" debe apuntar a admin.php después de migrar el menú.',
    );

    const nonceUrlCall = firstCall(pageRowAction, 'wp_nonce_url');
    check(nonceUrlCall !== null, 'El enlace de fila debe firmarse con wp_nonce_url().');
    if (nonceUrlCall) {
      check(
        selfConstant(nonceUrlCall.arguments[1]) === 'NONCE_ACTION',
        'wp_nonce_url() debe reutilizar self::NONCE_ACTION.',
      );
      check(
        literal(nonceUrlCall.arguments[2]) === 'ocd_nonce',
        'El nonce de la URL debe viajar en el campo ocd_nonce.',
      );
    }
  }

  const resolveAutoLoad = methodOf(admin, 'resolve_auto_load_page_id');
  check(resolveAutoLoad !== null, 'Falta OCD_Canvas_Editor_Admin::resolve_auto_load_page_id().');
  if (resolveAutoLoad) {
    check(
      resolveAutoLoad.type?.name === 'int',
      'resolve_auto_load_page_id() debe declarar int como tipo de retorno.',
    );
    const calls = callNames(resolveAutoLoad);
    check(
      calls.includes('wp_unslash'),
      'resolve_auto_load_page_id() debe desempaquetar $_GET con wp_unslash().',
    );
    check(calls.includes('absint'), 'resolve_auto_load_page_id() debe sanitizar page_id con absint().');
    const nonceCall = firstCall(resolveAutoLoad, 'check_admin_referer');
    check(
      nonceCall !== null,
      'resolve_auto_load_page_id() debe verificar el nonce con check_admin_referer().',
    );
    if (nonceCall) {
      check(
        selfConstant(nonceCall.arguments[0]) === 'NONCE_ACTION',
        'check_admin_referer() debe reutilizar self::NONCE_ACTION.',
      );
      check(
        literal(nonceCall.arguments[1]) === 'ocd_nonce',
        'check_admin_referer() debe leer el nonce del campo ocd_nonce.',
      );
    }
    check(calls.includes('get_post'), 'resolve_auto_load_page_id() debe validar la página con get_post().');
    check(
      hasPostTypePageCheck(resolveAutoLoad),
      'resolve_auto_load_page_id() debe exigir post_type === page.',
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
  const { ast, source } = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-document-sanitizer.php');
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
    for (const tag of ['script', 'style', 'object', 'embed', 'form']) {
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
    check(
      stringLiterals(allowed).includes('iframe'),
      'allowed_html() debe admitir iframe con atributos acotados para mapas y video.',
    );
  }

  check(
    methodOf(sanitizer, 'first_invalid_iframe') !== null,
    'El saneador debe validar el origen de cada iframe admitido.',
  );

  const css = methodOf(sanitizer, 'sanitize_css');
  check(css !== null, 'Falta sanitize_css().');
  if (css) {
    const values = stringLiterals(css).map((value) => value.toLowerCase());
    for (const needle of ['javascript:', 'vbscript:', 'expression(', '@import', 'data:text/html']) {
      check(values.includes(needle), `sanitize_css() debe rechazar ${needle}.`);
    }
    check(
      source.includes("\\s*behavior\\s*:") && source.includes('preg_match'),
      'sanitize_css() debe rechazar la propiedad behavior completa sin bloquear scroll-behavior.',
    );
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
    'class-ocd-canvas-asset-resolver.php',
    'class-ocd-canvas-page-publisher.php',
    'class-ocd-dynamic-token-resolver.php',
    'class-ocd-canvas-editor-admin.php',
  ]) {
    check(bootstrap.includes(file), `El bootstrap debe requerir ${file}.`);
  }
  check(
    /new OCD_Canvas_Editor_Admin\(/.test(bootstrap) && /->register\(\)/.test(bootstrap),
    'El bootstrap debe registrar el módulo Canvas.',
  );
  check(
    /new OCD_Dynamic_Token_Resolver\(\)/.test(bootstrap),
    'El bootstrap debe instanciar el resolver de tokens dinámicos.',
  );
  check(
    /new OCD_Admin\(\$importer\)/.test(bootstrap),
    'El bootstrap no debe alterar el registro del importador existente.',
  );

  const authored = [
    'open-codesign-publisher/includes/class-ocd-canvas-editor-admin.php',
    'open-codesign-publisher/includes/class-ocd-canvas-document-repository.php',
    'open-codesign-publisher/includes/class-ocd-canvas-document-sanitizer.php',
    'open-codesign-publisher/includes/class-ocd-canvas-asset-resolver.php',
    'open-codesign-publisher/includes/class-ocd-canvas-page-publisher.php',
    'open-codesign-publisher/includes/class-ocd-dynamic-token-resolver.php',
    'open-codesign-publisher/assets/js/ocd-canvas-editor.js',
    'open-codesign-publisher/assets/js/ocd-canvas-public.js',
    'open-codesign-publisher/assets/js/ocd-computed-inspector.js',
    'open-codesign-publisher/assets/js/ocd-canvas-grid.global.js',
    'open-codesign-publisher/assets/js/ocd-grid-controls.js',
    'open-codesign-publisher/assets/js/ocd-behaviors.js',
    'open-codesign-publisher/assets/css/ocd-canvas-editor.css',
  ];
  const cdnPattern = /(unpkg\.com|jsdelivr\.net|cdnjs\.|cdn\.|fonts\.googleapis\.com|grapesjs\.com\/)/i;
  for (const relativePath of authored) {
    const source = await readFile(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8');
    check(!cdnPattern.test(source), `${relativePath} no debe referenciar un CDN.`);
    if (!relativePath.endsWith('class-ocd-canvas-document-sanitizer.php')) {
      check(
        !/<iframe/i.test(source),
        `${relativePath} no debe emitir un iframe como formato publicado.`,
      );
    }
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
  const inspectorSource = await readFile(
    fileURLToPath(new URL('open-codesign-publisher/assets/js/ocd-computed-inspector.js', repoRoot)),
    'utf8',
  );
  for (const controlId of [
    'ocd-canvas-save',
    'ocd-canvas-reload',
    'ocd-canvas-export-html',
    'ocd-canvas-export-css',
    'ocd-canvas-import-apply',
    'ocd-canvas-publish',
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
  check(
    script.includes('OCD-CANVAS-EDITABLE-OVERRIDES') && script.includes('data-ocd-source-css'),
    'El editor debe preservar el CSS fuente literalmente y separar sus overrides editables.',
  );
  check(
    /css: serializedCss\(\)/.test(script),
    'El guardado debe enviar el CSS fuente junto con la capa de overrides.',
  );
  check(
    /Components\.addType\('ocd-video'/.test(script) && /tagName === 'VIDEO'/.test(script),
    'El editor debe preservar video como componente OCD sin controles añadidos.',
  );
  check(
    script.includes("querySelectorAll('video[autoplay]')") && script.includes("setAttribute('muted', '')"),
    'La serialización debe conservar autoplay como video silencioso reproducible.',
  );
  check(
    script.includes('resolveAssetsAction') && script.includes('publishAction'),
    'El cliente debe resolver activos y publicar mediante endpoints protegidos.',
  );
  check(
    inspectorSource.includes("['fill', 'Relleno SVG']") &&
      inspectorSource.includes("['stroke', 'Trazo SVG']") &&
      inspectorSource.includes('applySvgMask') &&
      inspectorSource.includes('prefers-color-scheme: dark'),
    'El inspector debe editar SVG inline y colorear SVG externos en modos claro/oscuro.',
  );
  check(
    /saveInFlight\.then\([\s\S]*return persist\(kind\)/.test(script),
    'El autoguardado debe encolar un estado nuevo si ya existe una escritura en curso.',
  );
  check(
    adminSource.includes('data-ocd-side-panel="components"') &&
      adminSource.includes('data-ocd-side-panel="inspector"') &&
      script.includes('activateSidePanel'),
    'Los paneles nativo y Open CoDesign deben alternarse mediante pestañas.',
  );
}

async function checkPublishingAndAssets() {
  const resolver = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-asset-resolver.php');
  const resolverClass = classOf(resolver.ast, 'OCD_Canvas_Asset_Resolver');
  check(resolverClass !== null, 'Falta OCD_Canvas_Asset_Resolver.');
  if (resolverClass) {
    const resolve = methodOf(resolverClass, 'resolve');
    check(resolve !== null, 'El resolver debe exponer resolve().');
    check(
      resolver.source.includes("'open-codesign'") && resolver.source.includes('RecursiveDirectoryIterator'),
      'El resolver debe limitar su búsqueda al árbol administrado open-codesign.',
    );
    check(
      typeof constantOf(resolverClass, 'MAX_REFERENCES') === 'number' &&
        typeof constantOf(resolverClass, 'MAX_FILES_SCANNED') === 'number',
      'El resolver debe acotar referencias y archivos inspeccionados.',
    );
  }

  const publisher = await parsePhp('open-codesign-publisher/includes/class-ocd-canvas-page-publisher.php');
  const publisherClass = classOf(publisher.ast, 'OCD_Canvas_Page_Publisher');
  check(publisherClass !== null, 'Falta OCD_Canvas_Page_Publisher.');
  if (publisherClass) {
    for (const method of ['publish', 'render_shortcode', 'standalone_template']) {
      check(methodOf(publisherClass, method) !== null, `El publicador debe implementar ${method}().`);
    }
    check(
      callNames(methodOf(publisherClass, 'publish')).includes('wp_insert_post'),
      'La publicación debe crear o actualizar una página WordPress.',
    );
    check(
      callNames(methodOf(publisherClass, 'render_shortcode')).includes('wp_add_inline_style'),
      'El render publicado debe aplicar el CSS guardado del documento.',
    );
    check(
      publisher.source.includes('META_DOCUMENT_ID') && publisher.source.includes('post_status'),
      'La página publicada debe conservar identidad estable y estado editorial.',
    );
    check(
      publisher.source.includes('OCD_Dynamic_Token_Resolver'),
      'El publicador debe declarar el resolver de tokens como dependencia opcional.',
    );
    check(
      publisher.source.includes('$this->token_resolver->resolve'),
      'render_shortcode() debe resolver tokens sobre el markup ensamblado.',
    );
  }
}

// ---------------------------------------------------------------------------
// Resolver de contenido dinámico (Etapa 1: cuatro built-ins).
// ---------------------------------------------------------------------------

async function checkDynamicTokenResolver() {
  const { ast, source } = await parsePhp('open-codesign-publisher/includes/class-ocd-dynamic-token-resolver.php');
  const resolver = classOf(ast, 'OCD_Dynamic_Token_Resolver');
  check(resolver !== null, 'Falta la clase OCD_Dynamic_Token_Resolver.');
  if (!resolver) return;

  const resolve = methodOf(resolver, 'resolve');
  check(resolve !== null, 'Falta OCD_Dynamic_Token_Resolver::resolve().');
  if (resolve) {
    check(resolve.visibility === 'public', 'resolve() debe ser público.');
    check(
      resolve.arguments?.length === 2 &&
        resolve.arguments[0]?.type?.name === 'string' &&
        resolve.arguments[1]?.type?.name === 'int',
      'resolve() debe recibir string $html e int $post_id.',
    );

    const calls = callNames(resolve);
    for (const method of ['replace_featured_image_tags', 'replace_permalink_tags', 'replace_text_tokens']) {
      check(calls.includes(method), `resolve() debe ejecutar la pasada ${method}().`);
    }
    check(
      calls.indexOf('replace_featured_image_tags') !== -1 &&
        calls.indexOf('replace_featured_image_tags') < calls.indexOf('replace_permalink_tags') &&
        calls.indexOf('replace_permalink_tags') < calls.indexOf('replace_text_tokens'),
      'resolve() debe resolver imagen, enlace y texto en ese orden.',
    );
  }

  check(source.includes('$post_id <= 0'), 'resolve() debe devolver el HTML sin tocar cuando $post_id <= 0.');
  check(
    source.includes("'{{'") && source.includes("'data-ocd-dynamic'"),
    'resolve() debe devolver temprano cuando no hay ni "{{" ni data-ocd-dynamic.',
  );

  const featured = methodOf(resolver, 'replace_featured_image_tags');
  check(featured !== null, 'Falta la pasada de imagen destacada.');
  check(
    featured !== null && callNames(featured).includes('get_the_post_thumbnail'),
    'La imagen destacada debe reemplazarse con get_the_post_thumbnail().',
  );
  check(
    source.includes("'featured_image'"),
    'La pasada de imagen destacada debe reconocer data-ocd-dynamic="featured_image".',
  );

  const permalink = methodOf(resolver, 'replace_permalink_tags');
  check(permalink !== null, 'Falta la pasada de enlace.');
  if (permalink) {
    const calls = callNames(permalink);
    check(calls.includes('get_permalink'), 'La pasada de enlace debe resolver get_permalink().');
    check(calls.includes('esc_url'), 'El href resuelto debe escaparse con esc_url().');
  }
  check(
    source.includes("'permalink'"),
    'La pasada de enlace debe reconocer data-ocd-dynamic="permalink".',
  );

  const text = methodOf(resolver, 'replace_text_tokens');
  check(text !== null, 'Falta la pasada de texto.');
  if (text) {
    const calls = callNames(text);
    check(calls.includes('preg_split'), 'La pasada de texto debe separar tags y texto con preg_split().');
    check(
      source.includes("'/(<[^>]*>)/'"),
      'preg_split() debe usar la partición de tags "<[^>]*>".',
    );
    check(
      source.includes('PREG_SPLIT_DELIM_CAPTURE'),
      'preg_split() debe conservar los tags mediante PREG_SPLIT_DELIM_CAPTURE.',
    );
    check(
      source.includes('$index & 1'),
      'La pasada de texto debe saltar los índices impares (tags), nunca resolver tokens dentro de atributos.',
    );
    check(calls.includes('esc_html'), 'Los tokens de texto deben escaparse con esc_html().');
    check(calls.includes('get_the_title'), '{{post_title}} debe resolverse con get_the_title().');
    check(calls.includes('get_the_excerpt'), '{{post_excerpt}} debe resolverse con get_the_excerpt().');
    check(
      calls.includes('get_the_post_thumbnail_url'),
      '{{featured_image}} en texto debe resolverse con get_the_post_thumbnail_url().',
    );
    check(calls.includes('esc_url'), 'Los tokens de URL en texto deben escaparse con esc_url().');
  }

  check(
    source.includes('post_title|post_excerpt|featured_image|permalink'),
    'La gramática debe ser estricta y limitarse a los cuatro built-ins de la Etapa 1.',
  );
  check(!source.includes('get_field'), 'Etapa 1 no debe implementar ACF.');
  check(!source.includes('acf:'), 'Etapa 1 no debe reconocer el prefijo acf:.');
  check(!source.includes('eval('), 'El resolver no debe usar eval().');
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
  await checkPublishingAndAssets();
  await checkDynamicTokenResolver();
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
