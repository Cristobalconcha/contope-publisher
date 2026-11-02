#!/usr/bin/env node
// Valores CALCULADOS en el navegador de todos los elementos de las páginas de Basis (P2.5 / P2.6 de
// docs/ESPEC-adn-unica-puerta-y-bloques.md): color de fondo, texto, familia, tamaño, peso, interlineado,
// espaciado de letras, radio y bordes. Sirve para demostrar que tocar las hojas del tema (o el filtro de
// theme.json) NO cambió lo que ve la gente: se mide ANTES, se mide DESPUÉS, y se compara elemento por elemento.
//
//   node scripts/basis/medir-calculados.mjs guardar <archivo.json> [--sitio http://localhost:8894] [--anchos 1440,393]
//   node scripts/basis/medir-calculados.mjs comparar <antes.json> <despues.json>        (código 1 si algo difiere)
//   node scripts/basis/medir-calculados.mjs estable <a.json> <b.json>                   (dos tomas SIN cambios: mide el ruido)
//
// Sólo lee el sitio local. Una toma se identifica por página+ancho; cada elemento, por su camino de hijos
// (tag:n > tag:n …), de modo que un elemento que aparece o desaparece también cuenta como diferencia.
import { readFileSync, writeFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const PAGINAS = { inicio: '/', carpas: '/basis-carpas-industriales/', faq: '/preguntas-frecuentes/', contactos: '/contactos/', terminos: '/terminos-y-privacidad/' };
const PROPS = [
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-style',
  'text-transform', 'text-align', 'border-top-left-radius', 'border-top-width', 'border-top-color', 'border-bottom-color',
  'padding-top', 'padding-left', 'margin-top', 'margin-bottom', 'width', 'height', 'display', 'opacity', 'fill',
];

const args = process.argv.slice(2);
const orden = args[0];
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const SITIO = String(flag('--sitio', 'http://localhost:8894')).replace(/\/+$/, '');
const ANCHOS = String(flag('--anchos', '1440,393')).split(',').map(Number);

async function tomar() {
  const out = {};
  for (const ancho of ANCHOS) {
    const nav = await abrirChrome({ ancho, alto: 900 });
    try {
      for (const [nombre, ruta] of Object.entries(PAGINAS)) {
        await nav.cdp('Page.enable');
        await nav.cdp('Page.navigate', { url: SITIO + ruta });
        await nav.dormir(1500);
        await esperarLaPagina(nav.evaluar);
        await recorrerLaPagina(nav.evaluar);
        await nav.dormir(600);
        // Se congelan transiciones y animaciones para que una toma a medias no se confunda con un cambio.
        await nav.evaluar(`(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(s); })()`);
        await nav.dormir(300);
        const filas = await nav.evaluar(`(() => {
          const props = ${JSON.stringify(PROPS)};
          const camino = (e) => { const p = []; for (; e && e !== document.documentElement; e = e.parentElement) { const i = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0; p.unshift(e.tagName.toLowerCase() + ':' + i); } return p.join('>'); };
          const out = {};
          const medir = (e, clave) => { const cs = getComputedStyle(e); const f = {}; for (const p of props) f[p] = cs.getPropertyValue(p); out[clave] = f; };
          medir(document.documentElement, 'html');
          for (const e of document.body.querySelectorAll('*')) {
            if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName)) continue;
            medir(e, 'body>' + camino(e));
          }
          medir(document.body, 'body');
          return out;
        })()`);
        out[`${nombre}@${ancho}`] = filas;
      }
    } finally {
      await nav.cerrar();
    }
  }
  return out;
}

// Una pila de fuentes "ampliada": el valor nuevo EMPIEZA por el viejo (misma primera familia, la que se dibuja) y
// agrega las familias de respaldo que declara el theme.json. Pasa a ser la pila completa del preset en vez de la sola
// primera familia que daba --cod-font-*. Se cuenta aparte y no es un fallo; cualquier otro cambio sí lo es.
const esPilaAmpliada = (p, antes, despues) => p === 'font-family' && despues.startsWith(antes + ', ') && antes.split(',').length === 1;

function comparar(a, b) {
  const difs = [];
  let elementos = 0;
  let pilas = 0;
  for (const toma of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[toma] || !b[toma]) { difs.push(`${toma}: toma ausente en uno de los archivos`); continue; }
    for (const el of new Set([...Object.keys(a[toma]), ...Object.keys(b[toma])])) {
      elementos += 1;
      if (!a[toma][el] || !b[toma][el]) { difs.push(`${toma} ${el}: ${a[toma][el] ? 'desaparece' : 'aparece'}`); continue; }
      for (const p of PROPS) {
        if (a[toma][el][p] !== b[toma][el][p] && esPilaAmpliada(p, a[toma][el][p], b[toma][el][p])) { pilas += 1; continue; }
        if (a[toma][el][p] !== b[toma][el][p]) difs.push(`${toma} ${el} ${p}: «${a[toma][el][p]}» -> «${b[toma][el][p]}»`);
      }
    }
  }
  return { difs, elementos, pilas };
}

if (orden === 'guardar') {
  const archivo = args[1];
  if (!archivo) { console.error('Falta el archivo de salida.'); process.exit(2); }
  const t = await tomar();
  writeFileSync(archivo, JSON.stringify(t));
  const n = Object.values(t).reduce((s, x) => s + Object.keys(x).length, 0);
  console.log(`guardado ${archivo}: ${Object.keys(t).length} tomas, ${n} elementos`);
} else if (orden === 'comparar' || orden === 'estable') {
  const a = JSON.parse(readFileSync(args[1], 'utf8'));
  const b = JSON.parse(readFileSync(args[2], 'utf8'));
  const { difs, elementos, pilas } = comparar(a, b);
  console.log(`${elementos} elementos comparados × ${PROPS.length} propiedades · ${difs.length} diferencias${pilas ? ` · ${pilas} font-family con la pila ampliada (misma primera familia, ya contadas aparte)` : ''}`);
  for (const d of difs.slice(0, 40)) console.log('  ' + d);
  if (elementos < 500) { console.error('Se compararon muy pocos elementos: la medición no vale.'); process.exit(2); }
  process.exit(difs.length === 0 ? 0 : 1);
} else {
  console.error('Uso: medir-calculados.mjs guardar <archivo> | comparar <antes> <despues> | estable <a> <b>');
  process.exit(2);
}
