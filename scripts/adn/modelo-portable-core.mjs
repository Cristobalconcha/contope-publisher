// Puente con el Core (ContOpeDesign-Core): genera y valida un `design/model.json` con las funciones
// REALES del Core (`projectPortableDesignModel`, `parsePortableDesignModel`), no con el puerto de PHP.
//
// Existe para que el fixture de `fixtures/package-v1/valid/desktop-interchange/design/model.json` y
// el modelo que exporta el plugin se midan contra el validador de quien lo produce en Desktop.
//
// Uso:
//   node scripts/adn/modelo-portable-core.mjs validar <archivo.json>
//   node scripts/adn/modelo-portable-core.mjs generar <contrato.json> <salida.json> \
//        --paquete urn:ocd:package:… --revision <texto> --proyecto urn:ocd:project:… --nombre <texto> \
//        --version 0.1.0 --fecha 2026-11-02T12:00:00Z
//
// El Core se busca en ../ContOpeDesign-Core (o en CONTOPE_CORE). Se carga con el gancho de TypeScript
// del propio Core (`scripts/lib/registrar-hook-ts.mjs`), que este script registra relanzándose.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(aqui, '..', '..');
const core = path.resolve(process.env.CONTOPE_CORE ?? path.join(repo, '..', 'ContOpeDesign-Core'));
const gancho = path.join(core, 'scripts', 'lib', 'registrar-hook-ts.mjs');
const portable = path.join(core, 'packages', 'core', 'src', 'design-contract-portable.ts');

if (!existsSync(gancho) || !existsSync(portable)) {
  console.error(`No encuentro el Core en ${core} (falta ${existsSync(gancho) ? portable : gancho}). Define CONTOPE_CORE.`);
  process.exit(2);
}

// Relanzarse con el gancho de TypeScript del Core.
if (!process.execArgv.some((a) => a.includes('registrar-hook-ts'))) {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(gancho).href, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { parsePortableDesignModel, projectPortableDesignModel, serializePortableDesignModel } = await import(pathToFileURL(portable).href);

const [orden, ...resto] = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = resto.indexOf(`--${nombre}`);
  return i >= 0 && resto[i + 1] !== undefined ? resto[i + 1] : porDefecto;
};

if (orden === 'validar') {
  const archivo = resto[0];
  const valor = JSON.parse(readFileSync(archivo, 'utf8'));
  const modelo = parsePortableDesignModel(valor);
  if (modelo === null) {
    console.error(`FALLA  ${archivo}: parsePortableDesignModel del Core lo rechaza.`);
    process.exit(1);
  }
  console.log(`ok     ${archivo}: lo acepta parsePortableDesignModel del Core (diseño ${modelo.design.id} r${modelo.design.revision}).`);
} else if (orden === 'generar') {
  const [contratoArchivo, salida] = resto;
  const contract = JSON.parse(readFileSync(contratoArchivo, 'utf8'));
  const modelo = projectPortableDesignModel({
    contract,
    transport: {
      package: { id: opcion('paquete', 'urn:ocd:package:prueba'), revision: opcion('revision', '2026-11-02T12:00:00Z') },
      project: { id: opcion('proyecto', 'urn:ocd:project:prueba'), name: opcion('nombre', 'Proyecto de prueba') },
    },
    producerVersion: opcion('version', '0.1.0'),
    exportedAt: opcion('fecha', '2026-11-02T12:00:00Z'),
  });
  writeFileSync(salida, serializePortableDesignModel(modelo));
  console.log(`ok     escrito ${salida}`);
} else {
  console.error('Uso: validar <archivo> | generar <contrato.json> <salida.json> [--paquete … --revision … --proyecto … --nombre … --version … --fecha …]');
  process.exit(2);
}
