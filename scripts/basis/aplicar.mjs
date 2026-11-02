/**
 * Aplica TODO Basis al WordPress local (o a uno de prueba), en orden:
 *   1. formulario de contacto (Orugantt Forms, por REST)
 *   2. íconos de Material que usa el diseño (el plugin los trae y los guarda)
 *   3. regiones (encabezado, pie)
 *   4. páginas del transcriptor + términos y privacidad
 *   5. ajustes (portada estática, favicon, número de WhatsApp)
 *
 *   SITIO=http://localhost:8894 AUTH_FILE=<archivo usuario:clave> node aplicar.mjs [--probar]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dc = path.join(aqui, '../divi-a-contope');
const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const env = { ...process.env, SITIO, ENDPOINT: process.env.ENDPOINT || `${SITIO}/index.php?rest_route=/contope/v1/mcp` };
if (!env.AUTH_FILE) { console.error('falta AUTH_FILE'); process.exit(1); }
const probar = process.argv.includes('--probar') ? ['--probar'] : [];
const original = process.env.ORIGINAL || 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/medicion-3';
const correr = (guion, args) => console.log(execFileSync('node', [guion, ...args], { cwd: aqui, env, encoding: 'utf8', maxBuffer: 1e8 }).trimEnd());
const perfil = JSON.parse(readFileSync(path.join(aqui, 'perfil.json'), 'utf8'));

console.log('== formulario');
if (!probar.length) correr(path.join(dc, 'formulario-a-orugantt.mjs'), ['--original', original, '--pagina', 'contactos', '--perfil', path.join(aqui, 'perfil.json'), '--salida', path.join(aqui, 'contacto-basis.fixture.json'), '--instalar']);
console.log('== íconos');
const aj = JSON.parse(readFileSync(path.join(aqui, 'salida/ajustes.json'), 'utf8'));
const auth = readFileSync(env.AUTH_FILE, 'utf8').trim();
for (const nombre of aj.iconos || []) {
  if (probar.length) break;
  const r = await fetch(`${SITIO}/index.php?rest_route=/contope/v1/iconos/cachear`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(auth).toString('base64') }, body: JSON.stringify({ nombre }) });
  console.log(`  ${nombre}: ${r.ok ? 'ok' : 'NO (' + r.status + ')'}`);
}
console.log('== regiones');
// La compuerta del diseño (enforce) no deja entrar valores literales: antes de aplicar, las reglas medidas de cada región pasan a
// referencias del sistema (escalar-regiones.mjs → salida/bloques/region-<k>.escalada.json). Si una región no pasa, se dice y se sigue
// con la otra; al final el guion sale con error.
correr(path.join(aqui, 'escalar-regiones.mjs'), []);
let regionesFallidas = 0;
for (const k of ['header', 'footer']) {
  try { correr(path.join(dc, 'aplicar.mjs'), ['region', k, path.join(aqui, `salida/bloques/region-${k}.escalada.json`), ...probar]); }
  catch (e) { regionesFallidas++; console.log(`  ✗ región ${k} NO se aplicó: ${String(e.stderr || e.message).slice(0, 700)}`); }
}
if (regionesFallidas) process.exitCode = 1;
console.log('== páginas');
for (const slug of [...perfil.paginasReales, 'terminos-y-privacidad']) correr(path.join(dc, 'aplicar.mjs'), ['pagina', path.join(aqui, `salida/${slug}.componer.json`), ...probar]);
console.log('== ajustes');
if (!probar.length) correr(path.join(aqui, 'configurar-sitio.mjs'), []);
void perfil;
