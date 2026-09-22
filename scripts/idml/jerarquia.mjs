// node jerarquia.mjs <carpeta-idml> <Spread_xxx> [...]  — jerarquía de ítems con posiciones en coordenadas de pliego
import fs from 'fs';
import path from 'path';
const [, , DIR, ...spreads] = process.argv;
const R = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const txt = sid => { const p = `Stories/Story_${sid}.xml`; if (!fs.existsSync(path.join(DIR, p))) return ''; return [...R(p).matchAll(/<Content>([^<]*)<\/Content>/g)].map(m => m[1]).join(' ').replace(/\s+/g, ' ').slice(0, 70); };
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const TAGS = ['TextFrame', 'Rectangle', 'Polygon', 'Oval', 'Group', 'GraphicLine'];
// tokeniza sólo las etiquetas que nos interesan y arma un árbol por profundidad
function children(xml) {
  const re = new RegExp(`<(${TAGS.join('|')})\\b([^>]*?)(/?)>|</(${TAGS.join('|')})>`, 'g');
  const out = []; const stack = []; let m;
  while ((m = re.exec(xml))) {
    if (m[4]) { const top = stack.pop(); if (top && stack.length === 0) { top.end = m.index; out.push(top); } continue; }
    const node = { tag: m[1], attrs: m[2], start: m.index, bodyStart: m.index + m[0].length };
    if (m[3] === '/') { if (stack.length === 0) out.push(node); continue; }
    stack.push(node);
  }
  return out.map(n => ({ ...n, xml: xml.slice(n.start, n.end), inner: xml.slice(n.bodyStart, n.end) }));
}
function show(xml, ptr, depth) {
  for (const c of children(xml)) {
    const g = k => (new RegExp(k + '="([^"]*)"').exec(c.attrs) || [])[1];
    const tr = mul(ptr, (g('ItemTransform') || '1 0 0 1 0 0').split(' ').map(Number));
    const geom = c.inner.split('</PathGeometry>')[0];
    const pts = [...geom.matchAll(/<PathPointType Anchor="([-\d.]+) ([-\d.]+)"/g)].map(p => [+p[1] * tr[0] + +p[2] * tr[2] + tr[4], +p[1] * tr[1] + +p[2] * tr[3] + tr[5]]);
    let b = '';
    if (pts.length) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); b = `[${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)} → ${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}]`; }
    const link = (/<Link [^>]*LinkResourceURI="[^"]*\/([^"\/]*)"/.exec(c.inner) || [])[1];
    const info = g('ParentStory') ? `«${txt(g('ParentStory'))}» (${g('ParentStory')})` : link ? 'img ' + decodeURIComponent(link) : '';
    const tables = (c.inner.match(/<Table /g) || []).length;
    console.log('  '.repeat(depth) + c.tag.padEnd(9), (g('Self') || '').padEnd(5), b.padEnd(26), (g('FillColor') || '').replace('Color/', '').padEnd(11), info, tables ? `(tabla×${tables})` : '');
    if (c.tag === 'Group') show(c.inner, tr, depth + 1);
  }
}
for (const s of spreads) { console.log('#####', s); const x = R(`Spreads/${s}.xml`); show(x.slice(x.lastIndexOf('</Page>')), [1, 0, 0, 1, 0, 0], 0); }
