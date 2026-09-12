// Comprueba la normalización de los identificadores de medición.
//
// Los patrones NO se copian acá: se extraen del propio PHP. Una prueba que
// repite las reglas que dice comprobar deja de comprobar nada en cuanto alguien
// cambia el original, y lo peor es que sigue pasando en verde.
//
//   node scripts/probar-medicion.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHP = path.join(raiz, 'contope-publisher', 'includes', 'class-cod-medicion.php');
const fuente = readFileSync(PHP, 'utf8');

// ── los formatos, tal como los declara el PHP ────────────────────────────
const FORMATOS = {};
const declaraciones = fuente.matchAll(/'(\w+)' => \['patron' => '\/\^([^']+)\$\/'/g);
for (const [, campo, cuerpo] of declaraciones) {
  FORMATOS[campo] = new RegExp('^' + cuerpo + '$');
}
const esperados = ['gtm', 'ga4', 'ads', 'meta_pixel'];
for (const campo of esperados) {
  if (!FORMATOS[campo]) {
    console.log('No pude leer el formato de "' + campo + '" desde el PHP. ¿Cambió formatos()?');
    process.exit(1);
  }
}

// ── la limpieza de invisibles, también leída del PHP ─────────────────────
const limpieza = fuente.match(/preg_replace\('\/(\[\\s[^']+\])\+\/u'/);
if (!limpieza) {
  console.log('No pude leer la limpieza de espacios invisibles desde el PHP. ¿Cambió normalizar()?');
  process.exit(1);
}
const INVISIBLES = new RegExp(
  limpieza[1].replace(/\\x\{([0-9A-Fa-f]+)\}/g, (_, hex) => '\\u{' + hex + '}') + '+',
  'gu'
);

function normalizar(crudo, campo) {
  let texto = crudo.replace(INVISIBLES, ' ').trim();
  if (campo === 'meta_pixel') return texto.replace(/\D/g, '');
  texto = texto.toUpperCase();
  const prefijos = { gtm: 'GTM', ga4: 'G', ads: 'AW' };
  if (prefijos[campo]) {
    const hallado = texto.match(new RegExp('\\b' + prefijos[campo] + '-[A-Z0-9]{4,14}\\b'));
    if (hallado) return hallado[0];
  }
  return texto;
}

const FRAGMENTO = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-W8D7ZGDP');</script>
<!-- End Google Tag Manager -->`;

const CASOS = [
  ['el identificador limpio', 'gtm', 'GTM-W8D7ZGDP', 'GTM-W8D7ZGDP'],
  ['con espacio duro pegado (U+00A0)', 'gtm', 'GTM-W8D7ZGDP ', 'GTM-W8D7ZGDP'],
  ['con espacio de ancho cero', 'gtm', '​GTM-W8D7ZGDP', 'GTM-W8D7ZGDP'],
  ['con marca de orden de bytes', 'gtm', '﻿GTM-W8D7ZGDP', 'GTM-W8D7ZGDP'],
  ['con espacios normales', 'gtm', '  GTM-W8D7ZGDP  ', 'GTM-W8D7ZGDP'],
  ['en minúsculas', 'gtm', 'gtm-w8d7zgdp', 'GTM-W8D7ZGDP'],
  ['el fragmento completo pegado', 'gtm', FRAGMENTO, 'GTM-W8D7ZGDP'],
  ['uno de verdad inválido', 'gtm', 'GTM_W8D7', null],
  ['Analytics limpio', 'ga4', 'G-ABC1234XYZ', 'G-ABC1234XYZ'],
  ['Analytics con espacio duro', 'ga4', ' G-ABC1234XYZ ', 'G-ABC1234XYZ'],
  ['Ads en minúsculas', 'ads', 'aw-123456789', 'AW-123456789'],
  ['pixel con texto alrededor', 'meta_pixel', 'ID: 123456789012345', '123456789012345'],
];

let fallos = 0;
for (const [nombre, campo, entrada, esperado] of CASOS) {
  const salida = normalizar(entrada, campo);
  const valido = FORMATOS[campo].test(salida);
  const bien = esperado === null ? !valido : salida === esperado && valido;
  if (!bien) fallos += 1;
  console.log(
    '  ' + (bien ? 'ok   ' : 'FALLA') + '  ' + nombre.padEnd(34) +
    (esperado === null ? '(se rechaza, como debe)' : salida)
  );
}

console.log('');
console.log(fallos === 0
  ? CASOS.length + ' casos · ninguno falla'
  : CASOS.length + ' casos · ' + fallos + ' FALLAN');
process.exit(fallos ? 1 : 0);
