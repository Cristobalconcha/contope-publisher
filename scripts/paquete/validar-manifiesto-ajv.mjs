// Valida un `manifest.json` de un paquete `.ocdsite` con el MISMO motor del contrato (Ajv, draft 2020-12 +
// las referencias cruzadas de scripts/check-package-v1.mjs). Lo usan las pruebas de F1b para medir el
// manifiesto que EXPORTA el plugin contra el esquema real, no contra un puerto.
//
// Uso:  node scripts/paquete/validar-manifiesto-ajv.mjs <manifest.json>
// Salida: una línea JSON `{"ok":bool,"codes":[...]}`; código de salida 1 si hay errores.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChecker, checkManifest } from '../check-package-v1.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/paquete/validar-manifiesto-ajv.mjs <manifest.json>');
  process.exit(2);
}
const { validate } = await loadChecker(path.join(raiz, 'schemas', 'manifest-v1.schema.json'));
let errores;
try {
  errores = checkManifest(validate, JSON.parse(await readFile(archivo, 'utf8')));
} catch (e) {
  errores = [{ code: 'INVALID_JSON', where: archivo }];
}
const codes = [...new Set(errores.map((e) => e.code))];
console.log(JSON.stringify({ ok: errores.length === 0, codes, detalle: errores.slice(0, 10).map((e) => `${e.code} ${e.where}`) }));
process.exit(errores.length === 0 ? 0 : 1);
