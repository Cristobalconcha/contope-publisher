import fs from 'fs';
const fix = (f, row, val) => {
  let x = fs.readFileSync(f, 'utf8');
  const re = new RegExp(`(<Cell Self="[^"]*" Name="2:${row}"[^>]*>[\\s\\S]*?<Content>)([^<]*)(</Content>)`);
  if (!re.test(x)) throw new Error('no encontré la celda en ' + f);
  x = x.replace(re, (m, a, old, c) => { console.log(f, old, '→', val); return a + val + c; });
  fs.writeFileSync(f, x, 'utf8');
};
fix('suyo/Stories/Story_ubca.xml', 5, '~45 min'); // Altos de Cantillana, en auto (Google Maps 22-09)
fix('suyo/Stories/Story_ud95.xml', 4, '~44 min'); // Buses Paine (Santiago), transporte público San Borja–Paine (Google Maps 22-09)
