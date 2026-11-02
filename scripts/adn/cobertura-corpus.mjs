#!/usr/bin/env node
// P0.1 (ESPEC-adn-unica-puerta-y-bloques, F0): cobertura del corpus compartido de ADN.
//
// Lee del FUENTE del Core cada `return null` de `parseDesignContract` y de
// `parsePortableDesignModel` (y de los analizadores auxiliares que cuelgan de ellas, ver
// AMBITO) por `archivo:línea`, y exige que algún caso de `fixtures/adn/core/` declare
// `cubre: <archivo:línea>`.
//
// Falla (código distinto de 0) si:
//   - el corpus está vacío o no tiene casos válidos e inválidos;
//   - queda una rama `return null` sin ningún caso;
//   - un `cubre` apunta a una línea que no existe, o que ya no es un `return null`;
//   - el corpus fue generado contra otra versión del fuente (huella de meta.json);
//   - no se encuentra el fuente del Core (nunca se aprueba a ciegas).
//
// Control obligatorio (ver docs/ESPEC..., P0.1): quitar de core/ un caso que cubra una rama
// única debe hacer fallar este script. Cómo mostrarlo, sin tocar el corpus real:
//   node scripts/adn/cobertura-corpus.mjs --control
// copia el corpus a una carpeta temporal, quita el caso que cubre en solitario una rama,
// corre la comprobación sobre la copia y exige que falle (y que el corpus completo pase).
//
// Uso:
//   node scripts/adn/cobertura-corpus.mjs [--core <carpeta del Core>] [--corpus <fixtures/adn>] [--control]
// Por omisión: --core ../ContOpeDesign-Core (o la variable CONTOPE_CORE) y --corpus fixtures/adn.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Funciones del Core cuyas ramas `return null` debe cubrir el corpus. Las dos nombradas por la
 *  espec más los analizadores auxiliares que ellas llaman: una rama `null` de `parseSource` es
 *  una rama de `parseDesignContract`. Se queda fuera `cloneContract` (no parsea: envuelve al
 *  parser en la proyección y su `null` es la rama de un `catch`). */
const AMBITO = {
  'packages/core/src/design-contract.ts': [
    'parseSource',
    'parseProvenanceEntry',
    'parseDefinition',
    'parseDevelopmentTask',
    'parseDesignContract',
  ],
  'packages/core/src/design-contract-portable.ts': [
    'parseTransport',
    'parseProvenance',
    'parsePortableDesignModel',
  ],
};
const HUELLAS = [
  ...Object.keys(AMBITO),
  'packages/core/src/design-contract-design-md.ts',
];

const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const normalizar = (texto) => texto.replace(/\r\n/gu, '\n');
const sha256 = (texto) => createHash('sha256').update(normalizar(texto)).digest('hex');

/** Cada archivo declara sus funciones en la columna 0 y las cierra con `}` en la columna 0. */
function ramasDe(core, archivo) {
  const ruta = join(core, archivo);
  if (!existsSync(ruta)) {
    throw new EntornoError(`no existe el fuente del Core: ${ruta}`);
  }
  const lineas = readFileSync(ruta, 'utf8').split('\n');
  const ramas = [];
  let actual = null;
  lineas.forEach((cruda, i) => {
    const linea = cruda.replace(/\r$/u, '');
    const abre = /^(?:export )?function (\w+)/u.exec(linea);
    if (abre) actual = abre[1];
    const recortada = linea.trim();
    const esComentario = recortada.startsWith('*') || recortada.startsWith('//');
    if (!esComentario && /\breturn null\b/u.test(linea)) {
      if (actual === null) throw new EntornoError(`${archivo}:${i + 1}: return null fuera de una función`);
      ramas.push({ archivo, linea: i + 1, funcion: actual });
    }
    if (linea === '}') actual = null;
  });
  return { ramas, totalLineas: lineas.length, lineasTexto: lineas.map((l) => l.replace(/\r$/u, '')) };
}

class EntornoError extends Error {}

function comprobar({ core, corpus }) {
  const problemas = [];
  const fuentes = {};
  const ramasAmbito = [];
  for (const [archivo, funciones] of Object.entries(AMBITO)) {
    const leido = ramasDe(core, archivo);
    fuentes[archivo] = leido;
    for (const r of leido.ramas) if (funciones.includes(r.funcion)) ramasAmbito.push(r);
  }
  if (ramasAmbito.length === 0) {
    throw new EntornoError('el ámbito no tiene ninguna rama `return null`: ¿cambió el fuente del Core?');
  }
  const claves = new Map(ramasAmbito.map((r) => [`${r.archivo}:${r.linea}`, r]));

  // --- el corpus ---
  const dirCore = join(corpus, 'core');
  const archivos = existsSync(dirCore) ? readdirSync(dirCore).filter((n) => n.endsWith('.json')).sort() : [];
  if (archivos.length === 0) {
    problemas.push(`el corpus está vacío: no hay ningún .json en ${dirCore}`);
    return { problemas, resumen: null };
  }
  const casos = [];
  for (const nombre of archivos) {
    try {
      casos.push({ nombre, caso: JSON.parse(readFileSync(join(dirCore, nombre), 'utf8')) });
    } catch (e) {
      problemas.push(`${nombre}: no es JSON válido (${e.message})`);
    }
  }
  let validos = 0;
  let invalidos = 0;
  const cubiertas = new Map(); // clave -> [nombres de caso]
  const rotas = new Map(); // referencia rota -> { motivo, casos }
  const romper = (ref, motivo, nombre) => {
    if (!rotas.has(ref)) rotas.set(ref, { motivo, casos: [] });
    rotas.get(ref).casos.push(nombre);
  };
  for (const { nombre, caso } of casos) {
    if (caso === null || typeof caso !== 'object' || typeof caso.esperado?.valido !== 'boolean') {
      problemas.push(`${nombre}: le falta \`esperado.valido\` (booleano)`);
      continue;
    }
    if (caso.esperado.valido) validos += 1;
    else invalidos += 1;
    if (!Array.isArray(caso.cubre)) {
      problemas.push(`${nombre}: \`cubre\` debe ser una lista de "archivo:línea"`);
      continue;
    }
    if (caso.esperado.valido && caso.cubre.length > 0) {
      problemas.push(`${nombre}: es un caso válido y declara \`cubre\`; un caso válido no pasa por ningún return null`);
    }
    for (const ref of caso.cubre) {
      const m = typeof ref === 'string' ? /^(.+):(\d+)$/u.exec(ref) : null;
      if (!m) {
        problemas.push(`${nombre}: \`cubre\` con formato inválido (${JSON.stringify(ref)}); se espera "archivo:línea"`);
        continue;
      }
      const archivo = m[1];
      const linea = Number(m[2]);
      const fuente = fuentes[archivo];
      if (!fuente) {
        problemas.push(`${nombre}: \`cubre\` apunta a ${ref}, un archivo fuera del ámbito (${Object.keys(AMBITO).join(', ')})`);
        continue;
      }
      if (linea < 1 || linea > fuente.totalLineas) {
        romper(ref, `una línea que no existe (el archivo tiene ${fuente.totalLineas})`, nombre);
        continue;
      }
      if (!claves.has(ref)) {
        const texto = (fuente.lineasTexto[linea - 1] ?? '').trim();
        romper(ref, `que ya no es un return null del ámbito (la línea dice: ${JSON.stringify(texto)}); el fuente cambió, hay que regenerar el corpus`, nombre);
        continue;
      }
      if (!cubiertas.has(ref)) cubiertas.set(ref, []);
      cubiertas.get(ref).push(nombre);
    }
  }
  for (const [ref, { motivo, casos: afectados }] of rotas) {
    const ejemplo = afectados.slice(0, 2).join(', ');
    problemas.push(`\`cubre\` apunta a ${ref}, ${motivo} — ${afectados.length} caso(s): ${ejemplo}${afectados.length > 2 ? ', …' : ''}`);
  }
  if (validos === 0) problemas.push('el corpus no tiene ningún caso válido');
  if (invalidos === 0) problemas.push('el corpus no tiene ningún caso inválido');

  // --- ramas sin caso ---
  const sinCaso = ramasAmbito.filter((r) => !cubiertas.has(`${r.archivo}:${r.linea}`));
  for (const r of sinCaso) {
    problemas.push(`rama sin caso: ${r.archivo}:${r.linea} (${r.funcion}) — ningún caso de core/ declara cubrirla`);
  }

  // --- el corpus corresponde a este fuente ---
  const rutaMeta = join(corpus, 'meta.json');
  if (!existsSync(rutaMeta)) {
    problemas.push(`falta ${rutaMeta}: sin la huella del fuente no se sabe contra qué versión se generó el corpus`);
  } else {
    try {
      const meta = JSON.parse(readFileSync(rutaMeta, 'utf8'));
      for (const archivo of HUELLAS) {
        const esperada = meta?.fuente?.[archivo]?.sha256;
        const real = sha256(readFileSync(join(core, archivo), 'utf8'));
        if (esperada === undefined) problemas.push(`meta.json no trae la huella de ${archivo}`);
        else if (esperada !== real) problemas.push(`${archivo} cambió desde que se generó el corpus (huella ${esperada.slice(0, 12)}… contra ${real.slice(0, 12)}…); regenerar con scripts/exportar-corpus-adn.ts del Core`);
      }
    } catch (e) {
      problemas.push(`meta.json no se pudo leer (${e.message})`);
    }
  }

  return {
    problemas,
    resumen: {
      casos: casos.length,
      validos,
      invalidos,
      ramas: ramasAmbito.length,
      cubiertas: ramasAmbito.length - sinCaso.length,
      porRama: ramasAmbito.map((r) => ({ ...r, casos: (cubiertas.get(`${r.archivo}:${r.linea}`) ?? []).length })),
      soloUnCaso: ramasAmbito
        .filter((r) => (cubiertas.get(`${r.archivo}:${r.linea}`) ?? []).length === 1)
        .map((r) => ({ rama: `${r.archivo}:${r.linea}`, funcion: r.funcion, caso: cubiertas.get(`${r.archivo}:${r.linea}`)[0] })),
    },
  };
}

function imprimir(resultado, etiqueta) {
  const { problemas, resumen } = resultado;
  if (resumen) {
    console.log(`${etiqueta}: ${resumen.casos} casos (${resumen.validos} válidos, ${resumen.invalidos} inválidos); ramas \`return null\`: ${resumen.cubiertas}/${resumen.ramas} con caso.`);
  }
  if (problemas.length > 0) {
    console.error(`${etiqueta}: FALLA con ${problemas.length} problema(s):`);
    for (const p of problemas) console.error(`  - ${p}`);
  } else {
    console.log(`${etiqueta}: OK`);
  }
}

function main() {
  const core = resolve(argumento('--core') ?? process.env['CONTOPE_CORE'] ?? join(RAIZ, '..', 'ContOpeDesign-Core'));
  const corpus = resolve(argumento('--corpus') ?? join(RAIZ, 'fixtures', 'adn'));

  if (process.argv.includes('--control')) {
    const completo = comprobar({ core, corpus });
    imprimir(completo, 'corpus completo');
    if (completo.problemas.length > 0) {
      console.error('CONTROL INVÁLIDO: el corpus completo debe pasar antes de poder demostrar que detecta una falta.');
      return 1;
    }
    const unico = completo.resumen.soloUnCaso[0];
    if (!unico) {
      console.error('CONTROL INVÁLIDO: ninguna rama depende de un solo caso; no hay caso que quitar para la demostración.');
      return 1;
    }
    const temporal = mkdtempSync(join(tmpdir(), 'cobertura-corpus-'));
    try {
      cpSync(corpus, temporal, { recursive: true });
      rmSync(join(temporal, 'core', unico.caso));
      console.log(`\nCONTROL: se quitó ${unico.caso} (única cobertura de ${unico.rama}, ${unico.funcion}) de una COPIA del corpus.`);
      const sin = comprobar({ core, corpus: temporal });
      imprimir(sin, 'corpus sin ese caso');
      const detectado = sin.problemas.some((p) => p.includes(`rama sin caso: ${unico.rama}`));
      if (!detectado) {
        console.error(`CONTROL FALLIDO: el instrumento NO detectó la falta de ${unico.rama}.`);
        return 1;
      }
      console.log(`CONTROL OK: el instrumento detectó la falta (${unico.rama}) y salió con error.`);
      return 0;
    } finally {
      rmSync(temporal, { recursive: true, force: true });
    }
  }

  const resultado = comprobar({ core, corpus });
  imprimir(resultado, 'cobertura del corpus');
  return resultado.problemas.length > 0 ? 1 : 0;
}

try {
  if (!existsSync(RAIZ) || !statSync(RAIZ).isDirectory()) throw new EntornoError('no se encontró la raíz del repositorio');
  process.exitCode = main();
} catch (e) {
  if (e instanceof EntornoError) {
    console.error(`No se puede comprobar: ${e.message}`);
    process.exitCode = 2;
  } else {
    throw e;
  }
}
