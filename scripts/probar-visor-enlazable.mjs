/**
 * El visor a pantalla completa tiene que poder abrirse desde la dirección:
 * llegar con su nombre en el hash lo abre, cerrarlo limpia la dirección, y
 * un enlace dentro de la página también lo abre. Corre el runtime real
 * (cod-canvas-public.js) en Chrome, no una imitación.
 */
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RUNTIME = path.resolve('contope-publisher/assets/js/cod-canvas-public.js');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((c) => existsSync(c));
if (!CHROME) { console.error('no encontré Chrome'); process.exit(1); }

const temp = mkdtempSync(path.join(tmpdir(), 'cod-visor-'));

function correr(hashInicial, guion) {
  const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
    .visor360{position:fixed;inset:0;opacity:0;pointer-events:none;z-index:9000}
    .visor360.is-open{opacity:1;pointer-events:auto}
  </style></head><body class="cod-canvas-published">
  <button id="abrir-recorrido-360">Ver recorrido</button>
  <div id="recorrido-360" class="visor360"
       data-cod-behavior="visor-embed"
       data-cod-visor-src="https://example.com/tour"
       data-cod-visor-trigger="#abrir-recorrido-360"
       data-cod-visor-close=".visor360__cerrar">
    <div class="visor360__barra"><button class="visor360__cerrar">Cerrar</button></div>
    <iframe class="visor360__marco" src="about:blank"></iframe>
  </div>
  <script src="${pathToFileURL(RUNTIME).href}"></script>
  <script>
  (async () => {
    const visor = document.querySelector('#recorrido-360');
    const abierto = () => visor.classList.contains('is-open');
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    const pasos = {};
    ${guion}
    document.title = 'RESULTADO:' + JSON.stringify(pasos);
  })();
  </script></body></html>`;
  const archivo = path.join(temp, 'p.html');
  writeFileSync(archivo, pagina);
  const url = pathToFileURL(archivo).href + hashInicial;
  const r = spawnSync(CHROME, ['--headless', '--disable-gpu', '--dump-dom', '--virtual-time-budget=4000', url], { encoding: 'utf8', maxBuffer: 20e6 });
  const m = (r.stdout || '').match(/RESULTADO:(\{.*?\})</s);
  return m ? JSON.parse(m[1]) : { error: 'sin resultado' };
}

let fallas = 0;
const comprobar = (caso, ok, detalle) => {
  console.log((ok ? '  ok     ' : '  FALLA  ') + caso + (ok || detalle === undefined ? '' : '  → ' + JSON.stringify(detalle)));
  if (!ok) fallas++;
};

console.log('\n== llegar con el nombre en la direccion lo abre ==');
let r = correr('#recorrido-360', `
  await esperar(600);
  pasos.abiertoAlLlegar = abierto();
  pasos.iframeCargado = visor.querySelector('iframe').getAttribute('src');
`);
comprobar('se abre solo al llegar', r.abiertoAlLlegar === true, r);
comprobar('el iframe carga su direccion recien ahi', r.iframeCargado === 'https://example.com/tour', r.iframeCargado);

console.log('\n== sin el nombre, no se abre ==');
r = correr('', `await esperar(600); pasos.abierto = abierto(); pasos.iframe = visor.querySelector('iframe').getAttribute('src');`);
comprobar('queda cerrado', r.abierto === false, r);
comprobar('y el iframe NO carga nada (no arrastra el peso)', r.iframe === 'about:blank', r.iframe);

console.log('\n== cerrar limpia la direccion ==');
r = correr('#recorrido-360', `
  await esperar(600);
  pasos.antes = abierto();
  pasos.hashAntes = location.hash;
  visor.querySelector('.visor360__cerrar').click();
  await esperar(500);
  pasos.despues = abierto();
  pasos.hashDespues = location.hash;
`);
comprobar('estaba abierto', r.antes === true, r);
comprobar('el boton lo cierra', r.despues === false, r);
comprobar('y la direccion queda limpia', r.hashDespues === '', r.hashDespues);

console.log('\n== un enlace dentro de la pagina tambien lo abre ==');
r = correr('', `
  await esperar(400);
  pasos.antes = abierto();
  location.hash = 'recorrido-360';
  await esperar(600);
  pasos.despues = abierto();
`);
comprobar('partia cerrado', r.antes === false, r);
comprobar('el enlace lo abre', r.despues === true, r);

console.log('\n== el boton de siempre sigue funcionando ==');
r = correr('', `
  await esperar(400);
  document.querySelector('#abrir-recorrido-360').click();
  await esperar(500);
  pasos.abierto = abierto();
`);
comprobar('el boton abre igual que antes', r.abierto === true, r);

rmSync(temp, { recursive: true, force: true });
console.log('\n' + (fallas === 0 ? 'todo en orden\n' : fallas + ' comprobaciones fallaron\n'));
process.exit(fallas === 0 ? 0 : 1);
