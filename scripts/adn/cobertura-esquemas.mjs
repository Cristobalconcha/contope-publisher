#!/usr/bin/env node
// La capa 4 del corpus (fixtures/adn/esquemas + payload-schemas.json, 02-nov-2026) es coherente consigo misma y con el Core que la generó.
//
//   node scripts/adn/cobertura-esquemas.mjs [--core <ruta>] [--corpus <ruta>]
//   node scripts/adn/cobertura-esquemas.mjs --control        (rompe una COPIA del corpus de tres maneras y exige que cada una se vea)
//
// Qué comprueba:
//   1. Las huellas de `meta.fuenteEsquemas` son las de los archivos del Core (requirement-manifest/*.ts): si el Core cambió un
//      manifiesto o un validador y el corpus no se regeneró, falla. Sin el repositorio del Core cerca NO se aprueba a ciegas.
//   2. Los conteos de meta.json (esquemas, ok, soloForma, mal) son los del disco.
//   3. Cada caso es coherente: `ok` = forma válida y predicado cumple; `soloForma` = forma válida y predicado no; `mal` = forma inválida;
//      `rutas` y `motivos` son del mismo largo; el requisito del caso está en payload-schemas.json; la versión del manifiesto del
//      caso es la de payload-schemas.json.
//   4. Cada requisito "nuevo" o "ampliado" de payload-schemas.json tiene al menos un caso `ok` y uno `mal`.
//
// La paridad del PLUGIN con esos casos (mismos veredictos y mismas rutas) la mide scripts/probar-adn-validador.php, sección 7.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

function comprobar({ core, corpus }) {
  const problemas = [];
  const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
  const meta = leer(join(corpus, 'meta.json'));
  const manifiesto = leer(join(corpus, 'payload-schemas.json')).requisitos;
  const carpeta = join(corpus, 'esquemas');
  const archivos = readdirSync(carpeta).filter((n) => n.endsWith('.json')).sort();
  const casos = archivos.map((n) => ({ nombre: n, caso: leer(join(carpeta, n)) }));

  // 1. huellas del fuente
  const huellas = meta.fuenteEsquemas ?? {};
  if (Object.keys(huellas).length === 0) problemas.push('meta.json no trae `fuenteEsquemas`: sin las huellas no se sabe contra qué versión del Core se generó la capa 4');
  for (const [archivo, { sha256: esperada }] of Object.entries(huellas)) {
    const ruta = join(core, archivo);
    if (!existsSync(ruta)) {
      problemas.push(`${archivo}: no está en ${core}; sin el Core cerca no se puede comprobar que el corpus corresponda a su fuente`);
      continue;
    }
    const real = sha256(readFileSync(ruta, 'utf8'));
    if (real !== esperada) problemas.push(`${archivo} cambió desde que se generó la capa 4 (huella ${esperada.slice(0, 12)}… contra ${real.slice(0, 12)}…); regenerar con \`pnpm corpus:adn\` del Core`);
  }

  // 2. conteos
  const cuenta = { ok: 0, soloForma: 0, mal: 0 };
  for (const { caso } of casos) cuenta[caso.intencion] = (cuenta[caso.intencion] ?? 0) + 1;
  const conteo = meta.conteo ?? {};
  for (const [clave, real] of [['esquemas', casos.length], ['esquemasOk', cuenta.ok], ['esquemasSoloForma', cuenta.soloForma], ['esquemasMal', cuenta.mal]]) {
    if (conteo[clave] !== real) problemas.push(`meta.json dice ${clave}=${conteo[clave]} y en disco hay ${real}`);
  }

  // 3. coherencia de cada caso
  for (const { nombre, caso } of casos) {
    const e = caso.esperado ?? {};
    const mundo = manifiesto[caso.requisito];
    if (!mundo) problemas.push(`${nombre}: el requisito ${caso.requisito} no está en payload-schemas.json`);
    else if (caso.manifiesto?.manifestVersion !== mundo.manifestVersion || caso.manifiesto?.revision !== mundo.revision) {
      problemas.push(`${nombre}: se generó con el manifiesto ${caso.manifiesto?.manifestVersion}/r${caso.manifiesto?.revision} y payload-schemas.json trae ${mundo.manifestVersion}/r${mundo.revision}`);
    }
    const coherente =
      (caso.intencion === 'ok' && e.forma === 'valida' && e.predicado === 'cumple') ||
      (caso.intencion === 'soloForma' && e.forma === 'valida' && e.predicado === 'no-cumple') ||
      (caso.intencion === 'mal' && e.forma === 'invalida');
    if (!coherente) problemas.push(`${nombre}: la intención "${caso.intencion}" no corresponde a forma=${e.forma} predicado=${e.predicado}`);
    if ((e.rutas ?? []).length !== (e.motivos ?? []).length) problemas.push(`${nombre}: ${(e.rutas ?? []).length} ruta(s) y ${(e.motivos ?? []).length} motivo(s)`);
    if (e.forma === 'valida' && (e.rutas ?? []).length > 0) problemas.push(`${nombre}: forma válida con rutas de motivo`);
    if (e.forma === 'invalida' && (e.rutas ?? []).length === 0) problemas.push(`${nombre}: forma inválida sin ninguna ruta de motivo`);
  }

  // 4. cobertura por requisito
  for (const [req, m] of Object.entries(manifiesto)) {
    if (m.estado === 'portado') continue;
    const suyos = casos.filter((c) => c.caso.requisito === req);
    if (!suyos.some((c) => c.caso.intencion === 'ok')) problemas.push(`${req} (${m.estado}): ningún caso \`ok\``);
    if (!suyos.some((c) => c.caso.intencion === 'mal')) problemas.push(`${req} (${m.estado}): ningún caso \`mal\``);
  }
  return { problemas, resumen: { casos: casos.length, ...cuenta, requisitos: Object.keys(manifiesto).length } };
}

function imprimir({ problemas, resumen }, etiqueta) {
  console.log(`${etiqueta}: ${resumen.casos} casos (ok ${resumen.ok}, soloForma ${resumen.soloForma}, mal ${resumen.mal}); ${resumen.requisitos} requisitos en el manifiesto.`);
  if (problemas.length > 0) {
    console.error(`${etiqueta}: FALLA con ${problemas.length} problema(s):`);
    for (const p of problemas.slice(0, 12)) console.error(`  - ${p}`);
  } else {
    console.log(`${etiqueta}: OK`);
  }
}

function main() {
  const core = resolve(argumento('--core') ?? process.env['CONTOPE_CORE'] ?? join(RAIZ, '..', 'ContOpeDesign-Core'));
  const corpus = resolve(argumento('--corpus') ?? join(RAIZ, 'fixtures', 'adn'));
  if (!process.argv.includes('--control')) {
    const r = comprobar({ core, corpus });
    imprimir(r, 'capa 4 del corpus');
    return r.problemas.length > 0 ? 1 : 0;
  }
  const completo = comprobar({ core, corpus });
  imprimir(completo, 'capa 4 completa');
  if (completo.problemas.length > 0) {
    console.error('CONTROL INVÁLIDO: la capa 4 completa debe pasar antes de poder demostrar que detecta una alteración.');
    return 1;
  }
  const alteraciones = [
    ['se quita un caso `mal` (el conteo de meta.json ya no coincide)', (c) => rmSync(join(c, 'esquemas', readdirSync(join(c, 'esquemas')).find((n) => n.includes('dim4.req09-desenfoque-negativo')) ?? 'x'))],
    ['se voltea el veredicto de un caso sin tocar su intención', (c) => {
      const ruta = join(c, 'esquemas', readdirSync(join(c, 'esquemas')).find((n) => n.includes('dim4.req09-tres-sombras')));
      const caso = JSON.parse(readFileSync(ruta, 'utf8'));
      caso.esperado.forma = 'invalida';
      writeFileSync(ruta, JSON.stringify(caso, null, 2));
    }],
    ['se cambia la huella de un archivo del Core en meta.json', (c) => {
      const ruta = join(c, 'meta.json');
      const meta = JSON.parse(readFileSync(ruta, 'utf8'));
      const primero = Object.keys(meta.fuenteEsquemas)[0];
      meta.fuenteEsquemas[primero].sha256 = '0'.repeat(64);
      writeFileSync(ruta, JSON.stringify(meta, null, 2));
    }],
  ];
  let todo = true;
  for (const [titulo, alterar] of alteraciones) {
    const temporal = mkdtempSync(join(tmpdir(), 'cobertura-esquemas-'));
    try {
      cpSync(corpus, temporal, { recursive: true });
      alterar(temporal);
      const r = comprobar({ core, corpus: temporal });
      const visto = r.problemas.length > 0;
      console.log(`CONTROL ${visto ? 'OK    ' : 'FALLIDO'} ${titulo}${visto ? ` → ${r.problemas[0]}` : ' → el instrumento NO lo vio'}`);
      if (!visto) todo = false;
    } finally {
      rmSync(temporal, { recursive: true, force: true });
    }
  }
  return todo ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`No se puede comprobar: ${e.message}`);
  process.exitCode = 2;
}
