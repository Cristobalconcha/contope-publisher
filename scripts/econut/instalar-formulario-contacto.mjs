/**
 * Instala y publica el formulario `contacto-econut` de Orugantt Forms en un
 * sitio, SOLO por su API REST (con la contraseña de aplicación): sin PHP en el
 * servidor, sin `wp eval-file`, sin pasar por el panel.
 *
 * Es el equivalente remoto de «Orugantt Forms → Importar formulario →
 * Publicar». Idempotente: si el formulario ya existe (mismo título) actualiza
 * su borrador con el JSON del fixture y publica una versión nueva sólo si el
 * JSON cambió.
 *
 * Variables de entorno (las mismas que el resto de los guiones de esta carpeta):
 *   SITIO      base del sitio, sin barra final   (por omisión http://localhost:8891)
 *   AUTH_FILE  archivo con «usuario:contraseña-de-aplicación»
 *   FIXTURE    ruta del JSON (por omisión, el del repositorio de Orugantt Forms)
 *   NODE_TLS_REJECT_UNAUTHORIZED=0   sólo para un host sin certificado propio
 *
 * Uso:  node instalar-formulario-contacto.mjs
 */
import { readFileSync } from 'node:fs';

const SITIO = (process.env.SITIO || 'http://localhost:8891').replace(/\/+$/, '');
const FIXTURE = process.env.FIXTURE
  || 'C:/Users/Cristobal concha/wp-local/wordpress/wp-content/plugins/orugantt-forms/fixtures/contacto-econut.json';
const RUTA_CREDENCIAL = process.env.AUTH_FILE
  || 'C:/Users/Cristobal concha/wp-local-econut/.credencial-mcp-local.txt';

const AUTH = readFileSync(RUTA_CREDENCIAL, 'utf8').trim();
const modulo = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const titulo = modulo.name;

const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${SITIO}/index.php?rest_route=/orugantt-forms/v1${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64'),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = { _texto: texto.slice(0, 300) }; }
  return { estado: r.status, datos };
};

// 1. ¿Ya existe?
const lista = await api('GET', '/constructor/forms');
if (lista.estado !== 200) {
  console.error(`no pude listar los formularios (HTTP ${lista.estado}):`, JSON.stringify(lista.datos).slice(0, 300));
  process.exit(1);
}
const existente = (lista.datos.forms || []).find((f) => f.title === titulo);

let id;
if (existente) {
  id = existente.id;
  const g = await api('POST', '/constructor/forms', { id, module: modulo });
  if (g.estado !== 200) { console.error('no pude actualizar el borrador:', JSON.stringify(g.datos).slice(0, 300)); process.exit(1); }
  console.log(`el formulario ya existía (#${id}, ${existente.status}): borrador actualizado`);
} else {
  const c = await api('POST', '/constructor/forms', { module: modulo, title: titulo });
  if (c.estado !== 201) { console.error('no pude crear el formulario:', JSON.stringify(c.datos).slice(0, 300)); process.exit(1); }
  id = c.datos.id;
  console.log(`formulario creado: #${id} (${c.datos.slug})`);
}

// 2. Publicar. Una versión es inmutable: publicar de nuevo con el mismo JSON
//    sólo agregaría una versión idéntica, así que si ya estaba publicado y el
//    JSON publicado es igual al del fixture, no se vuelve a publicar.
const hoy = await api('GET', `/constructor/forms/${id}`);
const publicado = existente && existente.status === 'published';
let igual = false;
if (publicado) {
  const pub = await fetch(`${SITIO}/index.php?rest_route=/orugantt-forms/v1/forms&slug=${encodeURIComponent(existente.slug)}`);
  if (pub.ok) {
    const vigente = (await pub.json()).module;
    igual = JSON.stringify(vigente) === JSON.stringify(hoy.datos.module);
  }
}
if (igual) {
  console.log('la versión publicada ya es igual al fixture: no se publica otra');
} else {
  const p = await api('POST', `/constructor/forms/${id}/publish`);
  if (p.estado !== 200 && p.estado !== 201) { console.error('no pude publicar:', JSON.stringify(p.datos).slice(0, 300)); process.exit(1); }
  console.log(`publicado: ${JSON.stringify(p.datos).slice(0, 200)}`);
}
