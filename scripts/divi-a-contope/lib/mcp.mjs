/**
 * Cliente mínimo del canal MCP de ContOpe Publisher (JSON-RPC sobre HTTP).
 * Mismo contrato que scripts/econut/lienzo.mjs, pero como módulo.
 *
 *   ENDPOINT   p. ej. http://localhost:8894/index.php?rest_route=/contope/v1/mcp
 *   AUTH_FILE  archivo con «usuario:contraseña-de-aplicación» (nunca dentro del repo)
 */
import { readFileSync } from 'node:fs';

export function conectar({ endpoint = process.env.ENDPOINT, authFile = process.env.AUTH_FILE } = {}) {
  if (!endpoint) throw new Error('falta ENDPOINT');
  if (!authFile) throw new Error('falta AUTH_FILE (archivo con «usuario:contraseña-de-aplicación»)');
  const auth = readFileSync(authFile, 'utf8').trim();
  const cabecera = { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(auth).toString('base64') };

  /** Llama a una herramienta; reintenta (el guardado se corta solo con documentos grandes). */
  async function herramienta(nombre, argumentos = {}, intento = 1) {
    const cuerpo = { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: nombre, arguments: argumentos } };
    let r;
    try {
      r = await fetch(endpoint, { method: 'POST', headers: cabecera, body: JSON.stringify(cuerpo) });
    } catch (e) {
      if (intento < 4) { await new Promise((s) => setTimeout(s, 700 * intento)); return herramienta(nombre, argumentos, intento + 1); }
      throw e;
    }
    const texto = await r.text();
    if (!r.ok && intento < 4) { await new Promise((s) => setTimeout(s, 700 * intento)); return herramienta(nombre, argumentos, intento + 1); }
    let j;
    try { j = JSON.parse(texto); } catch { return { _error: `respuesta no JSON (HTTP ${r.status}): ${texto.slice(0, 300)}` }; }
    if (j.error) return { _error: `${j.error.code}: ${j.error.message}`, _datos: j.error.data };
    const c = j.result && j.result.content;
    const t = Array.isArray(c) && c[0] && c[0].text ? c[0].text : null;
    if (t === null) return j.result;
    try { return JSON.parse(t); } catch { return { _texto: t }; }
  }
  return { herramienta };
}
