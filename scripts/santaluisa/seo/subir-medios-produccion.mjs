/**
 * Sube a la biblioteca de medios de PRODUCCIÓN las imágenes del trabajo de SEO
 * (13-nov-2026). Si una ya está, no la repite. Imprime la dirección de cada una.
 *
 *   node scripts/santaluisa/seo/subir-medios-produccion.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const c = JSON.parse(readFileSync(path.join(aqui, '..', '..', 'cod-grapes-runner', 'cod-grapes-runner.config.json'), 'utf8'));
const auth = { Authorization: 'Basic ' + Buffer.from(`${c.username}:${c.applicationPassword}`).toString('base64') };

const MEDIOS = [
  ['medios/galeria-campo.jpg', 'Campo dorado con cerros de fondo', 'Campo dorado con cerros de fondo'],
  ['medios/drone-aerial-placeholder.jpg', 'Vista aérea de Santa Luisa de Palpi (imagen de espera del video)', 'Vista aérea del loteo de Santa Luisa de Palpi'],
  ['santa-luisa-de-palpi-portada.jpg', 'Santa Luisa de Palpi — portada para compartir', 'Casa en una parcela de Santa Luisa de Palpi al atardecer, con la cordillera al fondo'],
  ['santa-luisa-de-palpi-acceso.jpg', 'Santa Luisa de Palpi — acceso, para compartir', 'Portón de acceso a Santa Luisa de Palpi, en Paine'],
];

for (const [ruta, titulo, alt] of MEDIOS) {
  const nombre = path.basename(ruta);
  const slug = nombre.replace(/\.jpg$/, '');
  const ya = await (await fetch(`${c.siteUrl}/wp-json/wp/v2/media?slug=${slug}&_fields=id,source_url`, { headers: auth })).json();
  if (Array.isArray(ya) && ya.length) { console.log(`ya estaba  ${ya[0].id}  ${ya[0].source_url}`); continue; }
  const r = await fetch(`${c.siteUrl}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${nombre}"` },
    body: readFileSync(path.join(aqui, ruta)),
  });
  const j = await r.json();
  if (!r.ok) { console.error(`FALLÓ ${nombre}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`); process.exit(1); }
  await fetch(`${c.siteUrl}/wp-json/wp/v2/media/${j.id}`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: titulo, alt_text: alt }),
  });
  console.log(`subida     ${j.id}  ${j.source_url}`);
}
