// Focused check for the portable `.ocdsite` package contract v1.
//
// This script validates each manifest.json fixture under fixtures/package-v1
// against the authoritative, standards-compliant JSON Schema draft 2020-12
// contract in schemas/manifest-v1.schema.json, plus the cross-reference rules a
// JSON Schema cannot express on its own (entrypoint resolution, entrypoint→role
// correspondence, global path uniqueness, case-insensitive path collisions,
// unique asset identifiers and unique entrypoint references).
//
// Structural validation uses Ajv (draft 2020-12) with ajv-formats so that the
// format keywords (date-time, uri), the $schema const, the formatVersion const
// and the pattern constraints declared in the schema are REALLY enforced,
// instead of approximated by a hand-written walker. ajv and ajv-formats are
// development-only MIT dependencies (see package.json); they are never loaded by
// the WordPress plugin/theme at runtime.
//
// The core helpers (mapAjvError, crossReference, assertSchemaOk) are exported so
// they can be exercised directly by ad-hoc probes/tests; the CLI runs only when
// this file is the entry point.
//
// Negative fixtures are matched STRICTLY: the unique set of codes produced must
// equal the `expectedErrors` array declared in case.json (duplicates of the same
// code are tolerated, but no spurious code may slip through).
//
// Exit code is non-zero if the schema is malformed or if any fixture does not
// match the expectation declared in its sibling case.json (regression guard).

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const EXPECTED_ID = 'https://contope.org/schemas/package/manifest-v1.schema.json';

// Ordered so that reference resolution diagnostics are stable.
export const ENTRY_KEYS = ['content', 'theme', 'wordpressState', 'designModel', 'desktopSource', 'idml'];

// Each named entrypoint must resolve to a file inventory entry whose role matches.
export const ENTRYPOINT_ROLES = {
  content: 'content',
  theme: 'theme-config',
  wordpressState: 'wordpress-state',
  designModel: 'design-model',
  desktopSource: 'desktop-source',
  idml: 'idml',
};

const ROOT_REQUIRED = ['formatVersion', 'package', 'project', 'origin', 'requirements', 'entrypoints', 'files', 'assets', 'capabilities'];

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Convert an Ajv instancePath (JSON pointer) into the readable dotted/bracketed
// location used by the documented error codes, e.g. "/assets/0/path" ->
// "manifest.assets[0].path".
export function whereFromPointer(ptr) {
  if (!ptr) return 'manifest';
  const segs = ptr.split('/').slice(1);
  let s = 'manifest';
  for (const seg of segs) {
    s += /^\d+$/.test(seg) ? `[${seg}]` : `.${seg}`;
  }
  return s;
}

function endsWith(pointer, suffix) {
  return pointer === suffix || pointer.endsWith('/' + suffix);
}

// Map a single Ajv error into one of the stable documented codes. Location rules
// take precedence over keyword rules so that, e.g., any error on formatVersion
// (wrong type OR wrong const) collapses to FORMAT_VERSION.
export function mapAjvError(err) {
  const ptr = err.instancePath || '';
  const where = whereFromPointer(ptr);
  const kw = err.keyword;
  const params = err.params || {};

  // --- Location-specific overrides (independent of keyword) ---
  if (ptr === '/formatVersion') return { code: 'FORMAT_VERSION', where };
  if (ptr === '/$schema') return { code: 'SCHEMA_ID_MISMATCH', where };
  if (ptr.startsWith('/capabilities/requiredBlocks/')) return { code: 'INVALID_BLOCK', where };

  // --- Keyword-specific mapping ---
  if (kw === 'required') {
    const base = ptr === '' ? 'manifest' : where;
    return { code: 'MISSING_REQUIRED', where: `${base}.${params.missingProperty}` };
  }
  if (kw === 'additionalProperties') {
    const base = ptr === '' ? 'manifest' : where;
    return { code: 'UNKNOWN_FIELD', where: `${base}.${params.additionalProperty}` };
  }
  if (kw === 'const') {
    // Only formatVersion (handled above) and $schema (handled above) use const.
    return { code: 'SCHEMA_VIOLATION', where, keyword: kw };
  }
  if (kw === 'enum') {
    if (endsWith(ptr, 'role')) return { code: 'INVALID_ROLE', where };
    return { code: 'SCHEMA_VIOLATION', where, keyword: kw };
  }
  if (kw === 'uniqueItems') {
    if (endsWith(ptr, 'requiredBlocks')) return { code: 'DUPLICATE_BLOCK', where };
    return { code: 'SCHEMA_VIOLATION', where, keyword: kw };
  }
  if (kw === 'type') {
    const types = typeof params.type === 'string' ? [params.type] : Array.isArray(params.type) ? params.type : [];
    if (endsWith(ptr, 'revision')) return { code: 'INVALID_REVISION', where };
    if (endsWith(ptr, 'size')) return { code: 'INVALID_SIZE', where };
    if (types.includes('object')) {
      return { code: ptr === '' ? 'MANIFEST_NOT_OBJECT' : 'NOT_OBJECT', where };
    }
    if (types.includes('array')) return { code: 'NOT_ARRAY', where };
    if (types.includes('boolean')) return { code: 'NOT_BOOLEAN', where };
    if (types.includes('integer')) return { code: 'INVALID_SIZE', where };
    return { code: 'TYPE_MISMATCH', where };
  }
  if (kw === 'pattern') {
    if (ptr === '/package/id' || (endsWith(ptr, 'id') && ptr.startsWith('/package/'))) return { code: 'PACKAGE_ID_FORMAT', where };
    if (ptr === '/project/id' || (endsWith(ptr, 'id') && ptr.startsWith('/project/'))) return { code: 'PROJECT_ID_FORMAT', where };
    if (ptr === '/origin/siteId') return { code: 'SITE_ID_FORMAT', where };
    if (endsWith(ptr, 'id') && ptr.startsWith('/assets/')) return { code: 'ASSET_ID_FORMAT', where };
    if (endsWith(ptr, 'path') || ptr.startsWith('/entrypoints/')) return { code: 'PATH_NOT_NORMALIZED', where };
    if (endsWith(ptr, 'sha256')) return { code: 'INVALID_SHA256', where };
    if (endsWith(ptr, 'mime')) return { code: 'INVALID_MIME', where };
    if (ptr === '/requirements/canvas' || ptr === '/requirements/publisher' || ptr === '/requirements/wordpress' || ptr === '/origin/producerVersion') {
      return { code: 'VERSION_FORMAT', where };
    }
    return { code: 'SCHEMA_PATTERN', where };
  }
  if (kw === 'format') {
    if (params.format === 'date-time') return { code: 'INVALID_DATE_TIME', where };
    if (params.format === 'uri') return { code: 'INVALID_URI', where };
    return { code: 'INVALID_FORMAT', where, format: params.format };
  }
  if (kw === 'minimum' || kw === 'exclusiveMinimum') {
    if (endsWith(ptr, 'size')) return { code: 'INVALID_SIZE', where };
    return { code: 'SCHEMA_MINIMUM', where };
  }
  if (kw === 'minLength' || kw === 'maxLength') {
    if (endsWith(ptr, 'revision')) return { code: 'INVALID_REVISION', where };
    if (endsWith(ptr, 'name')) return { code: 'INVALID_NAME', where };
    if (endsWith(ptr, 'producer')) return { code: 'INVALID_PRODUCER', where };
    return { code: 'SCHEMA_LENGTH', where };
  }
  return { code: 'SCHEMA_VIOLATION', where, keyword: kw };
}

// Cross-reference rules JSON Schema cannot express on its own. Defensive: only
// inspects shapes it can trust, so a structurally broken manifest does not crash
// the harness (Ajv already reported the structural problem).
export function crossReference(manifest) {
  const errors = [];
  if (!isObject(manifest)) return errors;

  const exact = new Set();
  const folded = new Set();
  const fileRoles = new Map();

  function notePath(value, where) {
    if (typeof value !== 'string') return;
    if (exact.has(value)) {
      errors.push({ code: 'DUPLICATE_PATH', where, value });
    } else if (folded.has(value.toLowerCase())) {
      // Case-insensitive collision: on case-insensitive filesystems (Windows,
      // macOS default) these would overwrite each other inside the ZIP, so the
      // declared inventory is ambiguous even though it is case-unique.
      errors.push({ code: 'DUPLICATE_PATH_CASE', where, value });
    } else {
      exact.add(value);
      folded.add(value.toLowerCase());
    }
  }

  if (Array.isArray(manifest.files)) {
    manifest.files.forEach((entry, index) => {
      if (!isObject(entry)) return;
      const where = `manifest.files[${index}].path`;
      notePath(entry.path, where);
      if (typeof entry.path === 'string' && typeof entry.role === 'string' && !fileRoles.has(entry.path)) {
        fileRoles.set(entry.path, entry.role);
      }
    });
  }

  if (Array.isArray(manifest.assets)) {
    const assetIds = new Set();
    manifest.assets.forEach((entry, index) => {
      if (!isObject(entry)) return;
      if (typeof entry.id === 'string') {
        if (assetIds.has(entry.id)) {
          errors.push({ code: 'DUPLICATE_ID', where: `manifest.assets[${index}].id`, value: entry.id });
        } else {
          assetIds.add(entry.id);
        }
      }
      notePath(entry.path, `manifest.assets[${index}].path`);
    });
  }

  if (isObject(manifest.entrypoints)) {
    const seenRefs = new Map();
    for (const key of ENTRY_KEYS) {
      if (!(key in manifest.entrypoints)) continue;
      const value = manifest.entrypoints[key];
      if (typeof value !== 'string') continue; // Ajv reports the type problem.
      const where = `manifest.entrypoints.${key}`;
      if (seenRefs.has(value)) {
        errors.push({ code: 'DUPLICATE_REFERENCE', where, value, also: seenRefs.get(value) });
      } else {
        seenRefs.set(value, key);
      }
      if (fileRoles.has(value)) {
        const expectedRole = ENTRYPOINT_ROLES[key];
        const actualRole = fileRoles.get(value);
        if (actualRole !== expectedRole) {
          errors.push({ code: 'ENTRYPOINT_ROLE_MISMATCH', where, value, expected: expectedRole, actual: actualRole });
        }
      } else {
        errors.push({ code: 'UNRESOLVED_REFERENCE', where, value });
      }
    }
  }

  return errors;
}

export function assertSchemaOk(schema) {
  const problems = [];
  if (!isObject(schema)) {
    problems.push('schema is not a JSON object');
    return problems;
  }
  if (schema.$id !== EXPECTED_ID) problems.push(`$id mismatch: ${schema.$id}`);
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') problems.push('$schema is not draft 2020-12');
  if (schema.type !== 'object') problems.push('top-level type is not "object"');
  if (schema.additionalProperties !== false) problems.push('top-level additionalProperties is not false');
  if (typeof schema.title !== 'string' || schema.title.length === 0) problems.push('title missing');
  if (schema.properties?.$schema?.const !== EXPECTED_ID) problems.push('properties.$schema is not the exact const $id');
  if (!Array.isArray(schema.required)) {
    problems.push('required is not an array');
  } else {
    for (const k of ROOT_REQUIRED) {
      if (!schema.required.includes(k)) problems.push(`required missing "${k}"`);
    }
  }
  const defs = schema.$defs;
  if (!isObject(defs)) problems.push('$defs missing');
  else {
    for (const defName of ['portablePath', 'ocdPackageId', 'ocdProjectId', 'ocdSiteId', 'ocdAssetId', 'sha256']) {
      if (typeof defs[defName]?.pattern !== 'string') problems.push(`$defs.${defName}.pattern missing`);
    }
    for (const role of ['design-model', 'desktop-source', 'idml']) {
      if (!Array.isArray(defs.fileRole?.enum) || !defs.fileRole.enum.includes(role)) {
        problems.push(`$defs.fileRole.enum missing "${role}"`);
      }
    }
    if (defs.assetEntry?.additionalProperties !== false) problems.push('$defs.assetEntry.additionalProperties is not false');
  }
  const epProps = schema.properties?.entrypoints?.properties;
  if (!epProps || !epProps.designModel || !epProps.desktopSource || !epProps.idml) {
    problems.push('entrypoints optional interchange entrypoints missing');
  }
  return problems;
}

// Build a compiled validator (+ schema object) from a loaded schema. Exported so
// probes can reuse the exact compilation used by the CLI.
export async function loadChecker(schemaFilePath) {
  const { readFile: rf } = await import('node:fs/promises');
  const schema = JSON.parse(await rf(schemaFilePath, 'utf8'));
  const problems = assertSchemaOk(schema);
  if (problems.length) {
    const err = new Error(`schema self-check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    err.problems = problems;
    throw err;
  }
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return { schema, validate };
}

// Run the structural (Ajv) + cross-reference layers and return the combined
// stable-code errors for a single manifest object.
export function checkManifest(validate, manifest) {
  const structural = validate(manifest) ? [] : (validate.errors || []).map(mapAjvError).filter(Boolean);
  const referential = crossReference(manifest);
  return [...structural, ...referential];
}

function setsEqual(produced, expected) {
  if (produced.length !== expected.length) return false;
  return expected.every((code) => produced.includes(code));
}

async function discoverCases(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await discoverCases(child)));
    } else if (entry.isFile() && entry.name === 'manifest.json') {
      out.push(dir);
    }
  }
  return out;
}

async function readJson(file) {
  const text = await readFile(file, 'utf8');
  return JSON.parse(text);
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const schemaPath = join(root, 'schemas/manifest-v1.schema.json');
  const fixturesRoot = join(root, 'fixtures/package-v1');

  const STDOUT_LINES = [];
  const print = (line) => STDOUT_LINES.push(line);
  let failed = false;
  const die = () => {
    for (const line of STDOUT_LINES) console.log(line);
    process.exit(1);
  };

  try {
    let validate;
    let schema;
    try {
      ({ schema, validate } = await loadChecker(schemaPath));
    } catch (error) {
      print(`FAIL: ${error.message}`);
      die();
    }
    print(`schema: OK (${relative(root, schemaPath)}, $id=${schema.$id}, ajv draft 2020-12 + formats)`);

    const caseDirs = (await discoverCases(fixturesRoot)).sort();
    if (caseDirs.length === 0) {
      print('FAIL: no fixture cases discovered under fixtures/package-v1');
      die();
    }

    print('cases:');
    let validExpected = 0;
    let invalidExpected = 0;
    let matched = 0;

    for (const dir of caseDirs) {
      const rel = relative(fixturesRoot, dir).split(path.sep).join('/');

      let caseSpec;
      try {
        caseSpec = await readJson(join(dir, 'case.json'));
      } catch (error) {
        print(`  FAIL ${rel} (missing or invalid case.json: ${error.message})`);
        failed = true;
        continue;
      }
      const expect = caseSpec.expect;
      if (expect === 'valid') validExpected += 1;
      else if (expect === 'invalid') invalidExpected += 1;
      else {
        print(`  FAIL ${rel} (case.json expect must be "valid" or "invalid", got ${JSON.stringify(expect)})`);
        failed = true;
        continue;
      }

      let errors;
      try {
        const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
        errors = checkManifest(validate, manifest);
      } catch (error) {
        errors = [{ code: 'INVALID_JSON', where: 'manifest.json', message: error.message }];
      }

      const codes = errors.map((e) => e.code);
      const unique = [...new Set(codes)];
      let ok;
      let detail;
      if (expect === 'valid') {
        ok = errors.length === 0;
        detail = ok ? 'no errors' : `unexpected errors: ${codes.join(', ')}`;
      } else {
        const expected = caseSpec.expectedErrors;
        if (!Array.isArray(expected) || expected.length === 0) {
          print(`  FAIL ${rel} (invalid case must declare a non-empty expectedErrors array)`);
          failed = true;
          continue;
        }
        ok = setsEqual(unique, expected);
        detail = ok
          ? `expected/produced unique [${expected.join(',')}]`
          : `expected [${expected.join(',')}] produced unique [${unique.join(',')}]`;
      }

      if (ok) {
        matched += 1;
        print(`  PASS ${rel} (${expect}; ${detail})`);
      } else {
        failed = true;
        print(`  FAIL ${rel} (${expect}; ${detail})`);
        for (const e of errors) {
          const extra = e.value !== undefined ? ` value=${JSON.stringify(e.value)}` : '';
          const roleInfo = e.expected ? ` expected=${e.expected} actual=${e.actual}` : '';
          print(`        ${e.code} at ${e.where}${roleInfo}${extra}`);
        }
      }
    }

    print('');
    if (failed) {
      print(`FAIL: ${matched}/${caseDirs.length} cases matched expectations.`);
      process.exitCode = 1;
    } else {
      print(`OK: ${matched}/${caseDirs.length} cases matched expectations (${validExpected} valid, ${invalidExpected} invalid).`);
    }
  } catch (error) {
    print(`FAIL: unexpected error: ${error && error.stack ? error.stack : error}`);
    failed = true;
  }

  for (const line of STDOUT_LINES) console.log(line);
  if (failed && !process.exitCode) process.exitCode = 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
