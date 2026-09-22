import fs from 'fs';
const places = JSON.parse(fs.readFileSync('geo-places.json', 'utf8'));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[“”"()]/g, ' ').replace(/\bp\. nacional\b/, 'parque nacional').replace(/\s+/g, ' ').trim();
const byName = places.map(p => ({ n: norm(p.nombre), p }));
function find(name) {
  const t = norm(name).replace(/ anual$/, '');
  let hit = byName.find(x => x.n === t) || byName.find(x => x.n.startsWith(t) || t.startsWith(x.n));
  if (!hit) { const tk = t.split(' ').filter(w => w.length > 3); hit = byName.find(x => tk.length && tk.every(w => x.n.includes(w))); }
  return hit && hit.p;
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const log = [], faltan = [];
for (const f of fs.readdirSync('suyo/Stories')) {
  const path = 'suyo/Stories/' + f; let x = fs.readFileSync(path, 'utf8'); if (!x.includes('<Table ')) continue;
  const names = {};
  for (const m of x.matchAll(/<Cell Self="[^"]*" Name="0:(\d+)"[^>]*>([\s\S]*?)<\/Cell>/g)) names[m[1]] = [...m[2].matchAll(/<Content>([^<]*)<\/Content>/g)].map(c => c[1]).join('');
  let changed = 0;
  x = x.replace(/(<Cell Self="[^"]*" Name="2:(\d+)"[^>]*>[\s\S]*?<Content>)([^<]*)(<\/Content>)/g, (m, pre, row, old, post) => {
    if (row === '0') { changed++; return pre + 'Tiempo' + post; }
    const p = find(names[row] || '');
    if (!p) { faltan.push(`${f}: «${names[row]}» queda «${old}»`); return m; }
    changed++; log.push(`${(names[row] || '').padEnd(32)} ${old.padEnd(9)} → ~${p.tiempoMin} min`);
    return pre + esc(`~${p.tiempoMin} min`) + post;
  });
  fs.writeFileSync(path, x, 'utf8');
}
console.log(log.join('\n')); console.log('\nSIN DATO EN EL JSON (se dejan como estaban):\n' + faltan.join('\n'));
