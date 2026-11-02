#!/usr/bin/env node
// Genera fixtures/adn/fechas-v8.json: para cada cadena, lo que `Date.parse` de ESTE Node (V8) dice
// (válida / NaN). Es la verdad contra la que se mide `COD_ADN_Js::fecha_valida` (P1.1).
//
// Las cadenas que V8 acepta por una indulgencia que el puerto PHP NO reproduce (ver la nota de
// COD_ADN_Js::fecha_valida) van en NO_REPRODUCIDAS: la prueba exige que PHP las rechace, para que la
// divergencia sea explícita y estable, no un accidente.
//
//   node scripts/adn/generar-fechas-v8.mjs           escribe el archivo
//   node scripts/adn/generar-fechas-v8.mjs --verificar   falla si el archivo no coincide con este V8
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESTINO = join(RAIZ, 'fixtures', 'adn', 'fechas-v8.json');

const CADENAS = [
  '2026-08-02', '2026-08-02T00:00:00.000Z', '2026-08-02T10:00:00+02:00', '2026-02-30', '2026-02-30T00:00:00Z',
  '2026-13-01', '2026-00-10', '2026-01-32', '2026-01-31T24:00:00Z', '2026-01-31T24:00:01Z', '2026-01-31T25:00:00Z',
  '2026-01-31T23:60:00Z', '2026-01-31T23:59:60Z', '2026-08', '2026', '20260802', '2026-8-2', '2026-08-2',
  '2026/08/02', '08/02/2026', '8/2/2026', 'Aug 2, 2026', 'August 2, 2026', '2 Aug 2026',
  'Sun, 02 Aug 2026 10:00:00 GMT', 'Sun Aug 02 2026 10:00:00 GMT+0200 (CEST)', 'Aug 2 2026 10:00',
  'Aug 2, 2026 10:00:00 PM', 'yesterday', 'tomorrow', 'soon', 'someday', 'never', 'last week', '', '  ', 'foo 1',
  '2026-08-02 10:00', '2026-08-02 10:00:00Z', '2026-08-02T10:00', '2026-08-02T10:00:00', '2026-08-02T10:00:00.5Z',
  '2026-08-02T10:00:00.123456Z', '2026-08-02T10Z', '+002026-08-02T00:00:00Z', '-000001-01-01T00:00:00Z',
  '-000000-01-01T00:00:00Z', '2026-08-02t10:00:00z', '2026-08-02T10:00:00+0200', '2026-08-02T10:00:00+02',
  '2026-08-02T10:00:00 +02:00', '2026-08-02Z', '1 Jan 70', 'Jan 1 70', 'Jan 1 49', 'Jan 1 50', '12/31/99', '1/1/1',
  'Thursday, 01-Jan-1970 00:00:00 GMT', 'Aug 32 2026', 'Feb 30 2026', '2026-08-02T00:00:00.000+24:00',
  '2026-08-02T00:00:00.000+23:59', '2026-08-02T00:00:00.000-00:00', '0000-01-01', '275760-09-13',
  '+275760-09-13T00:00:00.000Z', '+275760-09-13T00:00:00.001Z', 'Aug 2, 2026 25:00', 'Aug 2, 2026 10:60',
  '2026 Aug 2', 'Aug 2026', '2 2026', '12:00', 'Mon', 'Aug', '2026-08-02T10:00:00,5Z', '2026-08-02T10:00:00.Z',
  '2026-08-02T1:00:00Z', '2026-8-02T10:00:00Z', '  2026-08-02', '2026-08-02  ', '2026-08-02T10:00:00Z ',
  '2026-08-02 ', '2026-08-02T10:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-23T14:30:00.5+02:00',
  '2026-08-23T12:30:00', '2026-13-45T00:00:00Z', 'x', 'null', 'undefined', 'NaN', '0', '1787488200',
];

// Válidas en V8 por indulgencia del analizador legado que el puerto NO reproduce.
const NO_REPRODUCIDAS = ['foo 1', '0'];

const medidas = CADENAS.map((texto) => ({ texto, valida: !Number.isNaN(Date.parse(texto)) }));
const salida = {
  generadoPor: 'scripts/adn/generar-fechas-v8.mjs',
  motor: `node ${process.version} (V8 ${process.versions.v8})`,
  noReproducidas: NO_REPRODUCIDAS,
  cadenas: medidas,
};
const texto = `${JSON.stringify(salida, null, 2)}\n`;
if (process.argv.includes('--verificar')) {
  const actual = JSON.parse(readFileSync(DESTINO, 'utf8'));
  const distintas = actual.cadenas.filter((c) => Number.isNaN(Date.parse(c.texto)) === c.valida);
  if (distintas.length > 0) {
    console.error(`FALLA: este V8 discrepa en ${distintas.length} cadena(s): ${distintas.map((c) => JSON.stringify(c.texto)).join(', ')}`);
    process.exit(1);
  }
  console.log(`ok: ${actual.cadenas.length} cadenas coinciden con este V8`);
} else {
  writeFileSync(DESTINO, texto);
  console.log(`escrito ${DESTINO} (${medidas.length} cadenas, ${medidas.filter((m) => m.valida).length} válidas)`);
}
