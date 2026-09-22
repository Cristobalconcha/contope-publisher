// Corrige el IDML extraído en ./idml y lo reempaqueta. Cada reemplazo de texto
// debe calzar exactamente una vez; si no, aborta sin escribir nada.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = 'idml';
const log = [];
const edits = new Map(); // ruta -> contenido nuevo
const read = f => edits.get(f) ?? fs.readFileSync(path.join(ROOT, f), 'utf8');
const set = (f, s) => edits.set(f, s);

function replaceOnce(f, from, to, label) {
  const s = read(f);
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: "${from.slice(0, 40)}" aparece ${n} veces en ${f}, esperaba 1`);
  set(f, s.replace(from, to));
  log.push(`${label}: ${f}`);
}
function replaceAll(files, from, to, label) {
  let total = 0;
  for (const f of files) {
    const s = read(f); const n = s.split(from).length - 1;
    if (n) { set(f, s.split(from).join(to)); total += n; }
  }
  log.push(`${label}: ${total} usos → ${to}`);
  return total;
}
const listar = d => fs.readdirSync(path.join(ROOT, d)).map(x => `${d}/${x}`);
const STORIES = listar('Stories'), SPREADS = listar('Spreads'), MASTERS = listar('MasterSpreads');
const TODO = [...STORIES, ...SPREADS, ...MASTERS, 'Resources/Styles.xml'];

// ---------- 1. Colores sin nombre → paleta ----------
const mapa = {
  'Color/udf': 'Color/tierra-300', 'Color/ue2': 'Color/tierra-300', 'Color/ue3': 'Color/tierra-300',
  'Color/ue4': 'Color/tierra-300', 'Color/ue5': 'Color/tierra-300',            // 214 211 200 bordes de tabla
  'Color/ue6': 'Color/tierra-300', 'Color/ue8': 'Color/tierra-300',            // 199 194 181 iconos
  'Color/ue7': 'Color/oliva-700',                                              // 111 122 82 Categoría de Vida
  'Color/ue9': 'Color/oliva-700', 'Color/uea': 'Color/oliva-700', 'Color/ueb': 'Color/oliva-700',
  'Color/uec': 'Color/oliva-700', 'Color/ued': 'Color/oliva-700', 'Color/uf6': 'Color/oliva-700', // 79 90 60 Bajadas y ranking
  'Color/uf0': 'Color/tierra-700', 'Color/uf1': 'Color/tierra-700', 'Color/uf3': 'Color/tierra-700', // CMYK 0/5/19/86 Cuerpo FAQ, Subtitle, Lecturas
  'Color/ufd': 'Color/Paper',                                                  // CMYK 0/0/0/0 Destacados
  'Color/udd': 'Color/oliva-700',                                              // CMYK 56/44/51/35 polígonos en mesa de trabajo
};
for (const [de, a] of Object.entries(mapa)) replaceAll(TODO, `"${de}"`, `"${a}"`, `color ${de}`);

// Negro puro fuera de los estilos por omisión de InDesign
replaceAll(['Spreads/Spread_u72a.xml'], '"Color/Black"', '"Color/tierra-700"', 'negro emblema pág. 12');
replaceAll(['Stories/Story_u186.xml', 'Stories/Story_u19d.xml'], '"Color/Black"', '"Color/tierra-700"', 'negro corchetes de página maestra');
replaceAll(['Stories/Story_u5fb.xml'], '"Color/Black"', '"Color/oliva-700"', 'negro icono Vida nocturna');

// Quitar de Graphic.xml los colores sin nombre que ya no usa nadie
{
  let g = read('Resources/Graphic.xml');
  for (const de of Object.keys(mapa)) {
    const refs = TODO.filter(f => read(f).includes(`"${de}"`));
    if (refs.length) throw new Error(`${de} sigue referido en ${refs}`);
    const re = new RegExp(`\\s*<Color Self="${de}"[^>]*/>`);
    if (!re.test(g)) throw new Error(`${de} no está en Graphic.xml`);
    g = g.replace(re, '');
  }
  set('Resources/Graphic.xml', g);
  log.push(`Graphic.xml: ${Object.keys(mapa).length} colores sin nombre eliminados`);
}

// ---------- 2. Erratas ----------
replaceOnce('Stories/Story_u44a.xml', 'está un aubicación excelente; Además', 'está en una ubicación excelente. Además', 'errata ubicación');
replaceOnce('Stories/Story_u265.xml', 'VIEJA CAsona', 'Vieja Casona', 'errata casona');
replaceOnce('Stories/Story_u349.xml', 'de  loteos', 'de loteos', 'doble espacio loteos');
replaceOnce('Stories/Story_u6e9.xml', '¿hay agua?,¿la luz', '¿hay agua?, ¿la luz', 'espacio tras coma');
replaceOnce('Stories/Story_u6e9.xml', 'promesa,  aquí', 'promesa, aquí', 'doble espacio promesa');
// Estos dos pueden traer espacio duro o tilde descompuesta: se buscan tolerantes
{
  const f = 'Stories/Story_u44a.xml'; const s = read(f);
  const m = /seguro y[\s ]{2,}c[oó]modo/.exec(s);
  if (!m) throw new Error('no encontré "seguro y  cómodo"');
  set(f, s.replace(m[0], 'seguro y cómodo')); log.push('doble espacio cómodo: ' + JSON.stringify(m[0]));
}
{
  const f = 'Stories/Story_u546.xml'; const s = read(f);
  const m = /Bu(í|í)n/.exec(s);
  if (!m) throw new Error('no encontré "Buín"');
  set(f, s.replace(m[0], 'Buin')); log.push('Buín → Buin: ' + JSON.stringify(m[0]));
}

// ---------- 3. Cuadro de trabajo huérfano (códigos hex fuera de la página 9) ----------
{
  const f = 'Spreads/Spread_u477.xml'; const s = read(f);
  const re = /\n[ \t]*<TextFrame Self="u649"[\s\S]*?<\/TextFrame>/;
  if (!re.test(s)) throw new Error('no encontré TextFrame u649');
  set(f, s.replace(re, ''));
  let dm = read('designmap.xml');
  if (!dm.includes(' u637')) throw new Error('u637 no está en StoryList');
  dm = dm.replace(' u637', '').replace(/\n[ \t]*<idPkg:Story src="Stories\/Story_u637.xml" \/>/, '');
  if (dm.includes('u637')) throw new Error('u637 sigue en designmap');
  set('designmap.xml', dm);
  log.push('cuadro u649 / historia u637 eliminados');
}

// ---------- Escribir a una copia y empaquetar ----------
const OUT = 'idml-corregido';
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(ROOT, OUT, { recursive: true });
for (const [f, s] of edits) fs.writeFileSync(path.join(OUT, f), s, 'utf8');
fs.rmSync(path.join(OUT, 'Stories/Story_u637.xml'));

// ZIP mínimo: mimetype primero y sin comprimir, el resto deflate.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function walk(d, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(d, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(d, rel)); else out.push(rel);
  }
  return out;
}
const files = walk(OUT).filter(f => f !== 'mimetype');
files.sort();
const order = ['mimetype', ...files];
const locals = [], centrals = []; let offset = 0;
for (const rel of order) {
  const data = fs.readFileSync(path.join(OUT, rel));
  const stored = rel === 'mimetype';
  const comp = stored ? data : zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(rel, 'utf8'); const crc = crc32(data);
  const method = stored ? 0 : 8;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
  ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
  ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
  locals.push(lh, name, comp); centrals.push(ch, name);
  offset += lh.length + name.length + comp.length;
}
const cd = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(order.length, 8); eocd.writeUInt16LE(order.length, 10);
eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
fs.writeFileSync('Santa_Luisa_Folleto_Limpio_corregido.idml', Buffer.concat([...locals, cd, eocd]));
console.log(log.join('\n'));
console.log('\nEscrito Santa_Luisa_Folleto_Limpio_corregido.idml');
