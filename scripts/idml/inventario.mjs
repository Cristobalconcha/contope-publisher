import fs from 'fs';
const dm = fs.readFileSync('designmap.xml', 'utf8');
const order = [...dm.matchAll(/idPkg:Spread src="Spreads\/(Spread_\w+)\.xml"/g)].map(m => m[1]);
const LS = String.fromCharCode(0x2028);
function storyText(sid) {
  const p = `Stories/Story_${sid}.xml`; if (!fs.existsSync(p)) return null;
  const x = fs.readFileSync(p, 'utf8'); const out = [];
  for (const m of x.matchAll(/<ParagraphStyleRange[^>]*AppliedParagraphStyle="ParagraphStyle\/([^"]*)"[^>]*>([\s\S]*?)<\/ParagraphStyleRange>/g)) {
    let txt = '';
    for (const c of m[2].matchAll(/<Content>([\s\S]*?)<\/Content>|<Br\s*\/>/g)) txt += c[1] !== undefined ? c[1] : '⏎';
    out.push([m[1].replace(/%3a/g, ':'), txt.split(LS).join('⏎')]);
  }
  return out;
}
for (const s of order) {
  const x = fs.readFileSync(`Spreads/${s}.xml`, 'utf8');
  const pages = [...x.matchAll(/<Page [^>]*Name="([^"]*)"/g)].map(m => m[1]);
  const frames = [...x.matchAll(/<TextFrame [^>]*>/g)].map(m => { const t = m[0]; return [/ParentStory="(\w+)"/.exec(t)?.[1], /ItemTransform="([^"]*)"/.exec(t)?.[1]]; });
  const rects = (x.match(/<Rectangle /g) || []).length, imgs = (x.match(/<Image /g) || []).length;
  console.log(`\n===== ${s} páginas [${pages}] | marcos texto ${frames.length} | rectángulos ${rects} | imágenes ${imgs} =====`);
  for (const [sid, tr] of frames) {
    const st = storyText(sid); if (!st) { console.log(`  [${sid}] SIN HISTORIA`); continue; }
    console.log(`  --- historia ${sid} @ ${tr}`);
    for (const [ps, t] of st) console.log(`     (${ps}) ${t.slice(0, 400)}`);
  }
}
