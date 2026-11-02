/**
 * Lleva al WordPress local de Basis (`wp-local-basis`, puerto 8894) el plugin ContOpe, el tema contope-basis y lo que Orugantt Forms
 * necesita de la rama `basis-tokens`. SÓLO al local: nunca sube nada a producción.
 *
 *   node sincronizar-local.mjs
 *
 * - contope-publisher: espejo completo (robocopy /MIR) desde este repositorio.
 * - contope-basis: copia por encima (robocopy /E, SIN borrar): el local guarda además las tipografías y medios que genera
 *   `preparar-tema.mjs` y que no se versionan.
 * - orugantt-forms: el contrato de diseño (class-ofr-design-tokens.php) y el runtime compilado (assets/dist), desde el clon
 *   `C:\Users\Cristobal concha\orugantt-forms-basis` (rama basis-tokens). Antes hay que compilar allí: `npm run build` en runtime-src.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WP = 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-content';
const FORMS = 'C:/Users/Cristobal concha/orugantt-forms-basis';
const aWin = (p) => p.split('/').join('\\');
for (const [origen, destino, modo] of [
  [`${repo}/contope-publisher`, `${WP}/plugins/contope-publisher`, '/MIR'],
  [`${repo}/contope-basis`, `${WP}/themes/contope-basis`, '/E'],
]) {
  const r = spawnSync('robocopy', [aWin(origen), aWin(destino), modo, '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD', 'node_modules', '.git', '/XF', '*.log'], { encoding: 'utf8' });
  if (r.status === null || r.status >= 8) { console.error(`robocopy falló en ${origen} (${r.status})\n${r.stdout}${r.stderr}`); process.exit(1); }
  console.log(`ok ${path.basename(origen)}`);
}
// Los estilos de bloque del tema (styles/blocks) se ESPEJAN: uno que ya no existe en el repositorio no puede seguir registrado en el local
// (WordPress registra todo archivo de esa carpeta y las pruebas medirían un estilo viejo).
{
  const delRepo = `${repo}/contope-basis/styles/blocks`;
  const delLocal = `${WP}/themes/contope-basis/styles/blocks`;
  if (existsSync(delLocal)) {
    const vigentes = new Set(existsSync(delRepo) ? readdirSync(delRepo) : []);
    for (const f of readdirSync(delLocal)) if (!vigentes.has(f)) { unlinkSync(`${delLocal}/${f}`); console.log(`quitado del local: styles/blocks/${f}`); }
  }
}
for (const rel of ['includes/class-ofr-design-tokens.php', 'assets/dist/orugantt-forms-runtime.js', 'assets/dist/orugantt-forms-runtime.css']) {
  copyFileSync(`${FORMS}/${rel}`, `${WP}/plugins/orugantt-forms/${rel}`);
  console.log(`ok orugantt-forms/${rel}`);
}
