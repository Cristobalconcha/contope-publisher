/**
 * Prueba los INSTRUMENTOS de prueba (F0b, P0.2 a P0.5 de docs/ESPEC-adn-unica-puerta-y-bloques.md, H12).
 *
 * Un instrumento que sólo se ha visto en verde no demuestra nada. Acá cada uno se corre en un caso que DEBE fallar (su
 * «control») y en uno que DEBE pasar, y se comprueba el código de salida y lo que dice. Este guion termina con 0 sólo si
 * todos los casos se comportan como corresponde.
 *
 *   node scripts/basis/probar-instrumentos.mjs [--sitio http://localhost:8894] [--rapido]
 *
 *   --rapido   omite las corridas de la auditoría (las más lentas) y deja sólo P0.4 y P0.5
 *
 * Necesita el sitio local de Basis arriba (por omisión http://localhost:8894). Sólo lee ese sitio; el único envío es el del
 * formulario de prueba que hace auditoria-sitio.mjs en local, y acá se omite (--sin-envio). Lo que escribe va a una carpeta
 * temporal. Para P0.5 usa el sitio de Basis como CONEJILLO del mecanismo (no hace falta que Santa Luisa ni Econut estén arriba).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const args = process.argv.slice(2);
const SITIO = (args.includes('--sitio') ? args[args.indexOf('--sitio') + 1] : 'http://localhost:8894').replace(/\/+$/, '');
const RAPIDO = args.includes('--rapido');
const tmp = mkdtempSync(path.join(tmpdir(), 'instrumentos-'));

const correr = (script, a) => {
  const r = spawnSync(process.execPath, [script, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000, cwd: raiz });
  return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}` };
};
const AUD = path.join(aqui, 'auditoria-sitio.mjs');
const CMP = path.join(aqui, 'comparar-vivo.mjs');
const LB = path.join(raiz, 'scripts', 'regresiones', 'linea-base.mjs');

let malos = 0;
const caso = (id, descripcion, esperado, r, extra) => {
  const condiciones = [[`código ${esperado.codigo}`, r.codigo === esperado.codigo], ...(esperado.contiene || []).map((re) => [`la salida dice ${re}`, re.test(r.salida)]), ...(extra || [])];
  const ok = condiciones.every(([, v]) => v);
  if (!ok) malos += 1;
  console.log(`${ok ? 'PASA ' : 'FALLA'} ${id}  ${descripcion}`);
  for (const [t, v] of condiciones) console.log(`        ${v ? '✓' : '✗'} ${t}`);
  if (!ok) console.log(r.salida.split('\n').slice(-25).map((l) => '        | ' + l).join('\n'));
  const clave = r.salida.split('\n').filter((l) => /esperaban|no se abre|FUERA DE CRITERIO|DENTRO DE CRITERIO|ALTO |SIN REFERENCIA|igual a su línea base|diferencias|no coinciden|no responde|problema|sin problemas/i.test(l)).slice(0, 4);
  for (const l of clave) console.log('        > ' + l.trim().slice(0, 170));
};
const inventarioReal = JSON.parse(readFileSync(path.join(aqui, 'inventario-esperado.json'), 'utf8'));

if (!RAPIDO) {
  console.log('\n--- P0.2  auditoria-sitio.mjs --inventario ---');
  // Caso que debe PASAR: el inventario real sobre una página real.
  caso('P0.2-a', 'contactos con su inventario real (exacto)', { codigo: 0, contiene: [/sin problemas/] },
    correr(AUD, [SITIO, tmp, '--paginas', 'contactos', '--anchos', '1440', '--sin-gobierno', '--sin-envio']));
  // CONTROL: contactos NO tiene acordeones; un inventario que espera 2 debe hacerlo salir con 1. Además espera 0 mapas donde hay 2 (más de lo esperado).
  const falso = structuredClone(inventarioReal);
  falso.paginas.contactos.acordeones = 2; falso.paginas.contactos.mapas = 0;
  const falsoRuta = path.join(tmp, 'inventario-falso.json'); writeFileSync(falsoRuta, JSON.stringify(falso));
  caso('P0.2-b', 'CONTROL: contactos con un inventario que espera 2 acordeones (hay 0) y 0 mapas (hay 2)',
    { codigo: 1, contiene: [/se esperaban 2 acordeones y hay 0 \(CERO donde se espera algo\)/, /se esperaban 0 mapas y hay 2/] },
    correr(AUD, [SITIO, tmp, '--inventario', falsoRuta, '--paginas', 'contactos', '--anchos', '1440', '--sin-gobierno', '--sin-envio']));
  // CONTROL: una página que el inventario no menciona es error de configuración, no un salto silencioso.
  const sinPagina = structuredClone(inventarioReal); delete sinPagina.paginas.contactos;
  const sinPaginaRuta = path.join(tmp, 'inventario-sin-contactos.json'); writeFileSync(sinPaginaRuta, JSON.stringify(sinPagina));
  caso('P0.2-c', 'CONTROL: el inventario no menciona la página que se audita', { codigo: 2, contiene: [/no está en el inventario/] },
    correr(AUD, [SITIO, tmp, '--inventario', sinPaginaRuta, '--paginas', 'contactos', '--anchos', '1440', '--sin-gobierno', '--sin-envio']));

  console.log('\n--- P0.3  pruebas funcionales y bloques nativos ---');
  caso('P0.3-a', 'preguntas frecuentes (acordeón nativo) y carpas (buscador): abrir/cerrar pliegues y buscar',
    { codigo: 0, contiene: [/sin problemas/] },
    correr(AUD, [SITIO, tmp, '--paginas', 'preguntas-frecuentes,basis-carpas-industriales', '--anchos', '1440', '--sin-gobierno', '--sin-envio']),
    [['quedó escrito que se hizo la búsqueda y los pliegues', (() => { try { const j = JSON.parse(readFileSync(path.join(tmp, 'auditoria-sitio.json'), 'utf8')); const n = (p) => (j.find((c) => c.pagina === p)?.notas || []).join(' | '); return /pliegues [1-9]/.test(n('preguntas-frecuentes')) && /búsqueda de prueba: \?s=bodega → HTTP 200/.test(n('basis-carpas-industriales')); } catch { return false; } })()]]);
  caso('P0.3-b', 'CONTROL: acordeón con el panel roto (escondido a propósito) en preguntas frecuentes',
    { codigo: 1, contiene: [/no se abre al tocarlo/] },
    correr(AUD, [SITIO, tmp, '--paginas', 'preguntas-frecuentes', '--anchos', '1440', '--sin-gobierno', '--sin-envio', '--control', 'acordeon-roto']));
}

console.log('\n--- P0.4  comparar-vivo.mjs contra la referencia congelada ---');
const cfgReal = JSON.parse(readFileSync(path.join(aqui, 'comparar-vivo.config.json'), 'utf8'));
caso('P0.4-a', 'con la configuración REAL el local aún no iguala al Divi congelado: no sale verde', { codigo: 1, contiene: [/FUERA DE CRITERIO/] },
  correr(CMP, ['--paginas', 'basis-carpas-industriales', '--anchos', '1440', '--sitio', SITIO, '--salida', tmp]));
// Control de P0.4: una página que NO iguala al original en su alto (contactos) no sirve para ver si el guion detecta 20 px
// de más, porque ya sale fuera de criterio. Se hace en dos pasos: (1) se mide el alto actual con todo permitido; (2) se ancla el
// criterio a ese alto (±la tolerancia escrita) y se acepta todo lo demás. Sin relleno debe PASAR; con 20 px de relleno, FALLAR.
const PAG = 'contactos';
const lee = (slug, ancho) => { try { return JSON.parse(readFileSync(path.join(tmp, `comparacion-estilos-${slug}-${ancho}.json`), 'utf8')); } catch { return null; } };
const permisiva = structuredClone(cfgReal);
Object.assign(permisiva.tolerancias, { tamLetraPx: 999, interlineadoPx: 999, espaciadoLetrasPx: 999, pesoDiferencia: 999, imagenCajaPx: 9999, fijoCajaPx: 9999, altoPaginaPx: 99999 });
permisiva.textos.sobraPermitidos = [{ expresion: '.*', motivo: 'solo para el control' }]; permisiva.textos.faltaPermitidos = [{ expresion: '.*', motivo: 'solo para el control' }];
permisiva.imagenes.sobraPermitidos = [{ expresion: '.*', motivo: 'solo para el control' }];
const permisivaRuta = path.join(tmp, 'comparar-vivo.permisiva.json'); writeFileSync(permisivaRuta, JSON.stringify(permisiva));
caso('P0.4-b0', `medir el alto actual de ${PAG} con todo permitido (queda DENTRO)`, { codigo: 0, contiene: [/DENTRO DE CRITERIO/] },
  correr(CMP, ['--config', permisivaRuta, '--paginas', PAG, '--anchos', '1440', '--sitio', SITIO, '--salida', tmp]));
const medido = lee(PAG, 1440);
const anclada = structuredClone(permisiva);
anclada.tolerancias.altoPaginaPx = Math.abs(medido.altoLocal - medido.altoReferencia) + cfgReal.tolerancias.altoPaginaPx;
const ancladaRuta = path.join(tmp, 'comparar-vivo.anclada.json'); writeFileSync(ancladaRuta, JSON.stringify(anclada));
caso('P0.4-b', `${PAG}: con el criterio anclado a su alto actual (±${cfgReal.tolerancias.altoPaginaPx} px) queda DENTRO de criterio`, { codigo: 0, contiene: [/DENTRO DE CRITERIO/] },
  correr(CMP, ['--config', ancladaRuta, '--paginas', PAG, '--anchos', '1440', '--sitio', SITIO, '--salida', tmp]), [['alto sin diferencia', lee(PAG, 1440)?.totales?.alto === 0]]);
caso('P0.4-c', 'CONTROL: la misma corrida con 20 px de relleno agregados a propósito debe salir con 1',
  { codigo: 1, contiene: [/ALTO +alto del documento [0-9]+ en el local, [0-9]+ en la referencia/] },
  correr(CMP, ['--config', ancladaRuta, '--paginas', PAG, '--anchos', '1440', '--control-relleno', '20', '--sitio', SITIO, '--salida', tmp]),
  [['el informe cuenta 1 diferencia de alto', lee(PAG, 1440)?.totales?.alto === 1], ['el alto local creció 20 px', lee(PAG, 1440)?.altoLocal === medido.altoLocal + 20]]);
const hashMalo = structuredClone(cfgReal); hashMalo.paginas['basis-carpas-industriales'].referencias['1440'].sha256 = '0'.repeat(64);
const hashMaloRuta = path.join(tmp, 'comparar-vivo.hash-malo.json'); writeFileSync(hashMaloRuta, JSON.stringify(hashMalo));
caso('P0.4-d', 'CONTROL: una referencia cuyo sha256 no calza (¿alguien la tocó?) se rechaza', { codigo: 2, contiene: [/una referencia congelada no se toca/] },
  correr(CMP, ['--config', hashMaloRuta, '--paginas', 'basis-carpas-industriales', '--anchos', '1440', '--sitio', SITIO, '--salida', tmp]));
caso('P0.4-e', 'una página sin referencia congelada (términos) es FALLO, no un salto', { codigo: 1, contiene: [/SIN REFERENCIA CONGELADA/] },
  correr(CMP, ['--paginas', 'terminos-y-privacidad', '--anchos', '1440', '--sitio', SITIO, '--salida', tmp]));
caso('P0.4-f', 'no se le puede dar un sitio de producción', { codigo: 2, contiene: [/no se le da un sitio de producción/] },
  correr(CMP, ['--paginas', 'inicio', '--anchos', '1440', '--sitio', 'https://basisbodegas.com', '--salida', tmp]));

console.log('\n--- P0.5  líneas base de Santa Luisa y Econut (mecanismo probado con el sitio de Basis como conejillo) ---');
const lbDir = path.join(tmp, 'linea-base');
caso('P0.5-a', 'guardar la línea base (cada página se baja dos veces y deben ser idénticas)', { codigo: 0, contiene: [/línea base guardada/] },
  correr(LB, ['guardar', 'santaluisa', '--base-url', SITIO, '--dir', lbDir]));
caso('P0.5-b', 'verificar sin cambios: igual', { codigo: 0, contiene: [/igual a su línea base/] },
  correr(LB, ['verificar', 'santaluisa', '--base-url', SITIO, '--dir', lbDir]));
const objetivo = path.join(lbDir, 'santaluisa', 'contactos.css');
if (existsSync(objetivo)) {
  writeFileSync(objetivo, readFileSync(objetivo, 'utf8').replace(/padding/, 'paddingX'));
  caso('P0.5-c', 'CONTROL: una diferencia en el CSS guardado de una página debe salir con 1', { codigo: 1, contiene: [/FALLA \/contactos\//] },
    correr(LB, ['verificar', 'santaluisa', '--base-url', SITIO, '--dir', lbDir]));
} else { malos += 1; console.log('FALLA P0.5-c  no se pudo preparar el control (no existe ' + objetivo + ')'); }
caso('P0.5-d', 'CONTROL: un sitio apagado NO es «igual»', { codigo: 1, contiene: [/no responde/] },
  correr(LB, ['verificar', 'santaluisa', '--base-url', 'http://localhost:1', '--dir', lbDir]));
const arriba = (u) => spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(u)}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))`]).status === 0;
for (const [n, u] of [['santaluisa', 'http://localhost:8890'], ['econut', 'http://localhost:8891']]) console.log(`INFO  ${n}: ${arriba(u) ? 'el local está arriba (' + u + '): se puede guardar su línea base' : 'el local NO está arriba (' + u + '): su línea base no se pudo guardar'}`);

console.log(malos ? `\n${malos} caso(s) NO se comportan como deben → código 1` : '\nTodos los instrumentos fallan donde deben fallar y pasan donde deben pasar → código 0');
process.exit(malos ? 1 : 0);
