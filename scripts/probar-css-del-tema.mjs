/**
 * El CSS que produce Configuración tiene que salir IDÉNTICO antes y después de
 * cualquier refactor de la emisión. No "parecido": idéntico byte a byte.
 *
 * Guarda una referencia la primera vez (--guardar) y después compara contra
 * ella. Cubre varias configuraciones, incluida la vacía y la a medio llenar,
 * porque el principio que hay que preservar es que un campo sin valor NO emite
 * nada y no cae a un valor por omisión.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PHP = 'C:/Users/Cristobal concha/wp-local/php/php.exe';
const REFERENCIA = 'scripts/css-del-tema.referencia.json';
const GUARDAR = process.argv.includes('--guardar');

const CASOS = {
  vacio: {},
  minimo: { color_bg: '#F6F6F3', color_text: '#2b2926' },
  santaLuisa: {
    mode: 'light', color_bg: '#F6F6F3', color_text: '#2b2926',
    color_primary: '#70745E', color_accent: '#DDB441',
    font_heading: 'Montserrat', font_body: 'Montserrat', font_accent: 'Birthstone',
    size_base: '16', h1_size: '48', h2_size: '36', h3_size: '28',
    h4_size: '22', h5_size: '18', h6_size: '16',
    layout_mode: 'boxed', layout_max_width: '1200',
    radius: '8', spacing: '24', landing: '90',
  },
  liquido: { layout_mode: 'liquid', layout_max_width: '1200', color_bg: '#fff' },
  soloAterrizaje: { landing: '-40' },
  soloTipografia: { font_heading: 'Lora', h3_size: '28' },
};

const guion = `<?php
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local/wordpress/wp-load.php';
$casos = json_decode(file_get_contents(__DIR__ . '/.casos.json'), true);
$opcion = COD_Theme_Definitions::OPTION_KEY;
$antes = get_option($opcion, '');
$salida = [];
foreach ($casos as $nombre => $valores) {
    update_option($opcion, wp_json_encode($valores));
    $salida[$nombre] = COD_Theme_Definitions::css();
}
update_option($opcion, $antes);
echo wp_json_encode($salida, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`;

writeFileSync('scripts/.casos.json', JSON.stringify(CASOS));
writeFileSync('scripts/.css-tema.php', guion);
const r = spawnSync(PHP, ['scripts/.css-tema.php'], { encoding: 'utf8', maxBuffer: 20e6 });
const linea = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
let actual;
try { actual = JSON.parse(linea); } catch { console.error('sin salida del PHP:\n' + (r.stdout || '') + (r.stderr || '')); process.exit(1); }

if (GUARDAR || !existsSync(REFERENCIA)) {
  writeFileSync(REFERENCIA, JSON.stringify(actual, null, 1));
  console.log('\nreferencia guardada · ' + Object.keys(actual).length + ' casos');
  for (const [n, css] of Object.entries(actual)) console.log('  ' + n.padEnd(16) + css.length + ' bytes');
  process.exit(0);
}

const esperado = JSON.parse(readFileSync(REFERENCIA, 'utf8'));
let fallas = 0;
for (const nombre of Object.keys(esperado)) {
  const a = esperado[nombre], b = actual[nombre];
  if (a === b) { console.log('  ok     ' + nombre + '  (' + a.length + ' bytes)'); continue; }
  fallas++;
  console.log('  FALLA  ' + nombre);
  const la = a.split('\n'), lb = (b || '').split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      console.log('     antes:  ' + (la[i] ?? '(no hay línea)').slice(0, 150));
      console.log('     ahora:  ' + (lb[i] ?? '(no hay línea)').slice(0, 150));
    }
  }
}
console.log('\n' + (fallas === 0 ? 'el CSS sale idéntico\n' : fallas + ' casos cambiaron\n'));
process.exit(fallas === 0 ? 0 : 1);
