/**
 * Habla con el plugin ContOpe Publisher del local de Econut por su propio
 * canal JSON-RPC, el mismo que usaría el cliente MCP.
 *
 * Por qué así y no por el MCP: el servidor MCP configurado en la sesión
 * apunta a Santa Luisa en producción. El endpoint es el mismo contrato; lo
 * único que cambia es que acá se llama a mano.
 *
 * Uso:
 *   node lienzo.mjs <herramienta> [archivo-con-argumentos.json]
 *   node lienzo.mjs cod_get_capabilities
 *   node lienzo.mjs cod_preview_canvas_composition receta.json
 */
import { readFileSync } from 'node:fs';

const ENDPOINT = process.env.ENDPOINT
  || 'http://localhost:8891/index.php?rest_route=/contope/v1/mcp';
const AUTH = readFileSync(process.env.AUTH_FILE || '/tmp/econut-local-auth.txt', 'utf8').trim();

const [herramienta, archivoArgs] = process.argv.slice(2);
if (!herramienta) {
  console.error('falta la herramienta: node lienzo.mjs <herramienta> [args.json]');
  process.exit(1);
}
const argumentos = archivoArgs ? JSON.parse(readFileSync(archivoArgs, 'utf8')) : {};

const cuerpo = {
  jsonrpc: '2.0',
  id: Date.now(),
  method: 'tools/call',
  params: { name: herramienta, arguments: argumentos },
};

// El guardado se corta solo con documentos cercanos al mega y el mismo pedido
// funciona al segundo intento; por eso se reintenta, igual que el runner.
async function llamar(intento = 1) {
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64'),
      },
      body: JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    if (!r.ok && intento < 4) {
      await new Promise((s) => setTimeout(s, 700 * intento));
      return llamar(intento + 1);
    }
    return { estado: r.status, texto };
  } catch (e) {
    if (intento < 4) {
      await new Promise((s) => setTimeout(s, 700 * intento));
      return llamar(intento + 1);
    }
    throw e;
  }
}

const { estado, texto } = await llamar();
let salida = texto;
try {
  const j = JSON.parse(texto);
  if (j.error) {
    console.log('ERROR ' + j.error.code + ': ' + j.error.message);
    if (j.error.data) console.log(JSON.stringify(j.error.data).slice(0, 600));
    process.exit(2);
  }
  const c = j.result && j.result.content;
  salida = Array.isArray(c) && c[0] && c[0].text ? c[0].text : JSON.stringify(j.result, null, 2);
} catch { /* no era JSON; se muestra crudo */ }
console.log('HTTP ' + estado);
console.log(salida);
