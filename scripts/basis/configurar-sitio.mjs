/**
 * Ajustes del sitio de Basis, SÓLO por la API REST de WordPress y el canal MCP
 * (con la contraseña de aplicación): sin PHP en el servidor.
 *
 *   1. Portada estática: Ajustes → Lectura → «una página estática» = Inicio.
 *   2. Ícono del sitio (favicon): sube el PNG del original y lo fija.
 *   3. Número de WhatsApp (el de los botones del original), por MCP.
 *   4. Título y descripción del sitio.
 *
 * Idempotente. NO guarda la clave de Mapbox: es una credencial y la pone quien
 * publica el sitio (cod_set_mapbox_token, o Configuración → Mapa).
 *
 *   SITIO, AUTH_FILE: como en los demás guiones. ICONO: ruta del PNG.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar } from '../divi-a-contope/lib/mcp.mjs';

const SITIO = (process.env.SITIO || 'http://localhost:8894').replace(/\/+$/, '');
const AUTH = readFileSync(process.env.AUTH_FILE, 'utf8').trim();
const ICONO = process.env.ICONO || 'C:/Users/Cristobal concha/wp-local-basis/wordpress/wp-content/uploads/2025/07/cropped-aFabicon-OK.png';
const cab = { Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') };
const rest = async (metodo, ruta, cuerpo, extra = {}) => {
  const r = await fetch(`${SITIO}/index.php?rest_route=/wp/v2${ruta}`, {
    method: metodo,
    headers: { ...cab, ...(cuerpo && !extra.binario ? { 'Content-Type': 'application/json' } : {}), ...(extra.cabeceras || {}) },
    body: cuerpo ? (extra.binario ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { _texto: t.slice(0, 200) }; }
  return { estado: r.status, datos: d };
};

const mcp = conectar({ endpoint: `${SITIO}/index.php?rest_route=/contope/v1/mcp`, authFile: process.env.AUTH_FILE });
const lista = await mcp.herramienta('cod_list_canvas_pages', {});
const inicio = (lista.pages || []).find((p) => p.title === 'Inicio');
if (!inicio) { console.error('no encuentro la página «Inicio»'); process.exit(1); }

let r = await rest('POST', '/settings', { show_on_front: 'page', page_on_front: inicio.pageId, title: 'Basis bodegas', description: 'Bodegas temporales inteligentes' });
if (r.estado !== 200) { console.error('no pude fijar la portada:', JSON.stringify(r.datos).slice(0, 300)); process.exit(1); }
console.log(`portada estática: page_on_front=${r.datos.page_on_front}`);

const actual = await rest('GET', '/settings');
let sirve = false;
if (Number(actual.datos.site_icon || 0)) { const m = await rest('GET', `/media/${actual.datos.site_icon}`); sirve = m.estado === 200 && /cropped-aFabicon/.test(String(m.datos.source_url || '')); }
if (sirve) console.log(`favicon: ya es el adjunto #${actual.datos.site_icon}`);
else {
  const sub = await rest('POST', '/media', readFileSync(ICONO), { binario: true, cabeceras: { 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${path.basename(ICONO)}"` } });
  if (sub.estado !== 201) { console.error('no pude subir el favicon:', JSON.stringify(sub.datos).slice(0, 300)); process.exit(1); }
  const fij = await rest('POST', '/settings', { site_icon: sub.datos.id });
  console.log(`favicon: adjunto #${sub.datos.id} ${fij.estado === 200 ? 'fijado' : 'NO fijado'}`);
}

// WhatsApp: el número y el mensaje salen de lo que descubrió el transcriptor.
try {
  const aj = JSON.parse(readFileSync(process.env.AJUSTES || path.join(path.dirname(fileURLToPath(import.meta.url)), 'salida/ajustes.json'), 'utf8'));
  if (aj.whatsapp?.numero) {
    const w = await mcp.herramienta('cod_set_whatsapp_number', { number: aj.whatsapp.numero });
    console.log('whatsapp:', w._error ? `NO (${w._error.slice(0, 160)})` : 'número guardado');
  }
} catch (e) { console.log('whatsapp: sin ajustes.json (' + e.message.slice(0, 60) + ')'); }
