/**
 * Ajustes de un sitio de Econut recién armado, SOLO por la API REST de
 * WordPress y el canal MCP (con la contraseña de aplicación): sin PHP en el
 * servidor. Es lo que en el espejo se hizo desde el panel:
 *
 *   1. Portada estática: Ajustes → Lectura → «una página estática» = Inicio.
 *   2. Favicon: sube `econut-icono-512.png` como adjunto y lo pone de ícono del
 *      sitio (`site_icon`).
 *   3. Clave pública de Mapbox (la del mapa del pie), con `cod_set_mapbox_token`.
 *      Se toma de la variable MAPBOX_TOKEN y NUNCA se imprime.
 *
 * Idempotente: repetirlo no duplica nada importante (el favicon se vuelve a
 * subir sólo si el ícono actual no es ya uno del sitio).
 *
 * Variables de entorno:
 *   SITIO         base del sitio, sin barra final (por omisión http://localhost:8891)
 *   AUTH_FILE     archivo con «usuario:contraseña-de-aplicación»
 *   ECONUT_PAGE_ID  id de la página Inicio (obligatoria)
 *   ICONO         ruta del PNG del favicon (por omisión, el del espejo local)
 *   MAPBOX_TOKEN  clave pública pk.… (opcional; sin ella se omite el paso 3)
 *   NODE_TLS_REJECT_UNAUTHORIZED=0   sólo para un host sin certificado propio
 *
 * Uso:  node configurar-sitio.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SITIO = (process.env.SITIO || 'http://localhost:8891').replace(/\/+$/, '');
const AUTH = readFileSync(process.env.AUTH_FILE || 'C:/Users/Cristobal concha/wp-local-econut/.credencial-mcp-local.txt', 'utf8').trim();
const INICIO = Number(process.env.ECONUT_PAGE_ID || 0);
const ICONO = process.env.ICONO
  || 'C:/Users/Cristobal concha/wp-local-econut/wordpress/wp-content/uploads/2026/10/econut-icono-512.png';
if (!INICIO) { console.error('falta ECONUT_PAGE_ID (el id de la página Inicio)'); process.exit(1); }

const cabecera = { Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') };
const rest = async (metodo, ruta, cuerpo, extra = {}) => {
  const r = await fetch(`${SITIO}/index.php?rest_route=/wp/v2${ruta}`, {
    method: metodo,
    headers: { ...cabecera, ...(cuerpo && !extra.binario ? { 'Content-Type': 'application/json' } : {}), ...(extra.cabeceras || {}) },
    body: cuerpo ? (extra.binario ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  const texto = await r.text();
  let datos; try { datos = JSON.parse(texto); } catch { datos = { _texto: texto.slice(0, 200) }; }
  return { estado: r.status, datos };
};

// 1. Portada estática.
{
  const r = await rest('POST', '/settings', { show_on_front: 'page', page_on_front: INICIO });
  if (r.estado !== 200) { console.error('no pude fijar la portada:', JSON.stringify(r.datos).slice(0, 300)); process.exit(1); }
  console.log(`portada estática: show_on_front=${r.datos.show_on_front}, page_on_front=${r.datos.page_on_front}`);
}

// 2. Favicon.
{
  const actual = await rest('GET', '/settings');
  const iconoActual = Number(actual.datos.site_icon || 0);
  let sirve = false;
  if (iconoActual) {
    const m = await rest('GET', `/media/${iconoActual}`);
    sirve = m.estado === 200 && /econut-icono/.test(String(m.datos.source_url || ''));
  }
  if (sirve) {
    console.log(`favicon: ya es el adjunto #${iconoActual}`);
  } else {
    const bytes = readFileSync(ICONO);
    const subida = await rest('POST', '/media', bytes, {
      binario: true,
      cabeceras: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${path.basename(ICONO)}"`,
      },
    });
    if (subida.estado !== 201) { console.error('no pude subir el favicon:', JSON.stringify(subida.datos).slice(0, 300)); process.exit(1); }
    const fijado = await rest('POST', '/settings', { site_icon: subida.datos.id });
    if (fijado.estado !== 200 || Number(fijado.datos.site_icon) !== subida.datos.id) {
      console.error('subí el favicon pero no pude fijarlo:', JSON.stringify(fijado.datos).slice(0, 300)); process.exit(1);
    }
    console.log(`favicon: adjunto #${subida.datos.id} (${subida.datos.source_url}) fijado como ícono del sitio`);
  }
}

// 3. Mapbox, por el canal MCP del plugin.
{
  const token = (process.env.MAPBOX_TOKEN || '').trim();
  if (!token) {
    console.log('mapbox: sin MAPBOX_TOKEN, se omite (paso manual: Configuración → Mapa)');
  } else {
    const r = await fetch(`${SITIO}/index.php?rest_route=/contope/v1/mcp`, {
      method: 'POST',
      headers: { ...cabecera, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'cod_set_mapbox_token', arguments: { token } } }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.error) {
      // El mensaje de error no incluye la clave; se muestra tal cual.
      console.log(`mapbox: NO se pudo (${j.error.message}). Si el plugin del servidor aún no tiene cod_set_mapbox_token, es el paso manual: Configuración → Mapa.`);
    } else {
      console.log('mapbox: clave guardada (no se imprime)');
    }
  }
}
