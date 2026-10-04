/**
 * Habla con el plugin del ESPEJO LOCAL de Santa Luisa (puerto 8890).
 *
 * Es el mismo canal JSON-RPC que usa `econut/lienzo.mjs` y el mismo contrato;
 * lo único que cambia es a qué sitio apunta y con qué credencial. Por eso esto
 * no reimplementa nada: delega en aquél pasándole el destino por entorno, que
 * es algo que aquél ya admite.
 *
 * NUNCA apunta a santaluisadepalpi.cl. El sitio publicado es de un cliente y
 * ningún guion de esta carpeta lo escribe.
 *
 * Uso, igual que el otro:
 *   node lienzo.mjs cod_get_capabilities
 *   node lienzo.mjs cod_preview_canvas_composition receta.json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const aqui = path.dirname(fileURLToPath(import.meta.url));

const r = spawnSync('node', [path.join(aqui, '..', 'econut', 'lienzo.mjs'), ...process.argv.slice(2)], {
  cwd: aqui,
  stdio: 'inherit',
  env: {
    ...process.env,
    ENDPOINT: process.env.ENDPOINT || 'http://localhost:8890/index.php?rest_route=/contope/v1/mcp',
    AUTH_FILE: process.env.AUTH_FILE
      || 'C:/Users/Cristobal concha/wp-local/.credencial-mcp-local.txt',
  },
});
process.exit(r.status === null ? 1 : r.status);
