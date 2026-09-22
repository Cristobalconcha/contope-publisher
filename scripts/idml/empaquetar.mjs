// node empaquetar.mjs <carpeta> <salida.idml> — mimetype primero y sin comprimir, el resto deflate.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
const [, , DIR, OUTFILE] = process.argv;
function crc32(buf) { let c, crc = 0xffffffff; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function walk(d, base = '') { const out = []; for (const e of fs.readdirSync(path.join(d, base), { withFileTypes: true })) { const rel = base ? `${base}/${e.name}` : e.name; if (e.isDirectory()) out.push(...walk(d, rel)); else out.push(rel); } return out; }
const files = walk(DIR).filter(f => f !== 'mimetype').sort();
const order = ['mimetype', ...files];
const locals = [], centrals = []; let offset = 0;
for (const rel of order) {
  const data = fs.readFileSync(path.join(DIR, rel));
  const stored = rel === 'mimetype';
  const comp = stored ? data : zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(rel, 'utf8'); const crc = crc32(data); const method = stored ? 0 : 8;
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
  locals.push(lh, name, comp); centrals.push(ch, name); offset += lh.length + name.length + comp.length;
}
const cd = Buffer.concat(centrals); const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(order.length, 8); eocd.writeUInt16LE(order.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
fs.writeFileSync(OUTFILE, Buffer.concat([...locals, cd, eocd]));
console.log('escrito', OUTFILE, order.length, 'archivos');
