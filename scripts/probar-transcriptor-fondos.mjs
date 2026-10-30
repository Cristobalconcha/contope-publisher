/**
 * El transcriptor Divi → ContOpe traduce los degradados a `backgroundGradient`
 * (ya no los aplana en un velo).
 *
 * Lo que se mide:
 *  - los tres degradados reales de la medición de Basis (portada, aviso naranja, radial);
 *  - el orden respecto de la foto (`gradientPlacement`) y que el tamaño/posición/repetición
 *    medidos —uno por capa— se toman de la capa de la IMAGEN y no de «la última»;
 *  - lo que no cabe se AVISA como `aproximado` diciendo qué se perdió, nunca en silencio;
 *  - lo que sí cabe sale con severidad `ok`.
 *
 * Uso: node scripts/probar-transcriptor-fondos.mjs   (código de salida 0 = pasó)
 */
import { capasDeFondo, partirNivel, traducirDegradado } from './divi-a-contope/lib/fondos.mjs';
import { superficieSeccion } from './divi-a-contope/lib/estilos.mjs';

let fallas = 0;
const ok = (cond, msg, detalle = '') => { console.log((cond ? 'ok   ' : 'FALLA') + ' ' + msg + (!cond && detalle ? '  → ' + detalle : '')); if (!cond) fallas++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PORTADA = 'linear-gradient(rgb(12, 113, 195) 0%, rgba(255, 255, 255, 0) 100%), url("https://basisbodegas.com/wp-content/uploads/2025/07/portada.jpg")';
const NARANJA = 'linear-gradient(65deg, rgb(0, 0, 0) 0%, rgba(255, 255, 255, 0) 100%)';
const RADIAL = 'radial-gradient(circle at 0% 0%, rgba(214, 218, 255, 0.7) 50%, rgba(214, 218, 255, 0.3) 100%)';

console.log('-- capas');
ok(igual(partirNivel('a(1, 2), b, c(d(e, f))'), ['a(1, 2)', 'b', 'c(d(e, f))']), 'partirNivel respeta los paréntesis anidados');
const capas = capasDeFondo(PORTADA);
ok(capas.length === 2 && capas[0].tipo === 'degradado' && capas[1].tipo === 'imagen', 'la portada tiene un degradado y, debajo, la foto', JSON.stringify(capas.map((c) => c.tipo)));
ok(capasDeFondo('none').length === 0 && capasDeFondo('').length === 0, 'sin fondo, sin capas');

console.log('-- los tres degradados reales');
let r = traducirDegradado(capas[0].texto);
ok(igual(r.valor, { type: 'linear', stops: [{ color: 'rgb(12, 113, 195)', at: '0%' }, { color: 'rgba(255, 255, 255, 0)', at: '100%' }] }) && r.perdidas.length === 0,
  'portada: azul 0% → transparente 100%, hacia abajo (sin ángulo), nada perdido', JSON.stringify(r));
r = traducirDegradado(NARANJA);
ok(igual(r.valor, { type: 'linear', angle: '65deg', stops: [{ color: 'rgb(0, 0, 0)', at: '0%' }, { color: 'rgba(255, 255, 255, 0)', at: '100%' }] }) && r.perdidas.length === 0,
  'aviso naranja: 65deg, negro → transparente', JSON.stringify(r));
r = traducirDegradado(RADIAL);
ok(igual(r.valor, { type: 'radial', shape: 'circle', at: '0% 0%', stops: [{ color: 'rgba(214, 218, 255, 0.7)', at: '50%' }, { color: 'rgba(214, 218, 255, 0.3)', at: '100%' }] }) && r.perdidas.length === 0,
  'radial: circle at 0% 0%, dos paradas con alfa', JSON.stringify(r));

console.log('-- variantes que sí caben');
r = traducirDegradado('linear-gradient(to right, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor?.angle === '90deg' && r.perdidas.length === 0, '«to right» es 90deg');
r = traducirDegradado('linear-gradient(to bottom, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor && r.valor.angle === undefined, '«to bottom» es el valor por omisión: sin ángulo');
r = traducirDegradado('linear-gradient(0.25turn, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor?.angle === '90deg', 'turn → deg');
r = traducirDegradado('repeating-linear-gradient(45deg, rgb(0, 0, 0) 0px, rgb(255, 255, 255) 10px)');
ok(r.valor?.repeating === true && r.valor.stops[1].at === '10px', 'repeating y paradas en px');
r = traducirDegradado('linear-gradient(rgb(1, 2, 3) 0%, rgb(4, 5, 6) 30% 60%, rgb(7, 8, 9) 100%)');
ok(r.valor?.stops.length === 4 && r.valor.stops[1].at === '30%' && r.valor.stops[2].at === '60%' && r.valor.stops[2].color === 'rgb(4, 5, 6)' && r.perdidas.length === 0,
  'una parada con dos posiciones se expande en dos', JSON.stringify(r));
r = traducirDegradado('radial-gradient(ellipse at center, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor?.shape === 'ellipse' && r.valor.at === 'center', 'radial ellipse at center');
r = traducirDegradado('radial-gradient(rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor && r.valor.shape === undefined && r.valor.at === undefined, 'radial sin cabeza');

console.log('-- lo que no cabe se avisa');
r = traducirDegradado('linear-gradient(to top right, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor?.angle === '45deg' && r.perdidas.some((p) => /proporción/.test(p)), '«to top right» se aproxima con 45deg y lo dice', JSON.stringify(r));
r = traducirDegradado('linear-gradient(rgb(1, 2, 3), 30%, rgb(4, 5, 6))');
ok(r.valor?.stops.length === 2 && r.perdidas.some((p) => /punto medio/.test(p)), 'una pista de punto medio se omite y lo dice', JSON.stringify(r));
r = traducirDegradado('radial-gradient(circle closest-side at 50% 50%, rgb(1, 2, 3), rgb(4, 5, 6))');
ok(r.valor?.shape === 'circle' && r.perdidas.some((p) => /closest-side/.test(p)), 'un tamaño de radial distinto del predeterminado se avisa', JSON.stringify(r));
const nueve = 'linear-gradient(' + Array.from({ length: 10 }, (_, i) => `rgb(${i}, 0, 0) ${i * 10}%`).join(', ') + ')';
r = traducirDegradado(nueve);
ok(r.valor?.stops.length === 8 && r.valor.stops[7].at === '90%' && r.perdidas.some((p) => /admite 8/.test(p)), 'más de 8 paradas: conserva 7 y la última, y lo dice', JSON.stringify(r.perdidas));
r = traducirDegradado('linear-gradient(color(display-p3 1 0 0), color(display-p3 0 1 0))');
ok(r.valor === null && r.perdidas.length > 0, 'colores que no se pueden escribir como color seguro: no se inventa nada', JSON.stringify(r));
r = traducirDegradado('conic-gradient(red, blue)');
ok(r.valor === null, 'un degradado cónico no se traduce');

console.log('-- la superficie de una sección');
const regs = [];
const reg = { R: (kind, valor, op) => { regs.push({ kind, valor, op }); return 'regla-' + regs.length; } };
const seccion = (extra) => ({ fondo: 'rgba(0, 0, 0, 0)', urlsFondo: [], tamanoFondo: 'auto', posicionFondo: '0% 0%', repiteFondo: 'repeat', imagenFondo: 'none', ...extra });
const urlLocal = (u) => '/wp-content/uploads/2025/07/' + u.split('/').pop();

let s = superficieSeccion(reg, seccion({ imagenFondo: PORTADA, urlsFondo: ['https://basisbodegas.com/wp-content/uploads/2025/07/portada.jpg'], tamanoFondo: 'auto, cover', posicionFondo: '0% 0%, 50% 50%', repiteFondo: 'repeat, no-repeat' }), { urlLocal });
let v = regs.at(-1).valor;
ok(v.backgroundGradient?.type === 'linear' && v.backgroundAssetUrl === '/wp-content/uploads/2025/07/portada.jpg', 'portada: degradado + foto en la misma regla surface', JSON.stringify(v));
ok(v.backgroundSize === 'cover' && v.backgroundPosition === '50% 50%' && v.backgroundRepeat === 'no-repeat', 'tamaño, posición y repetición salen de la capa de la FOTO (la segunda), no de la primera', JSON.stringify(v));
ok(v.gradientPlacement === undefined && v.overlayColor === undefined, 'degradado encima de la foto = valor por omisión (no se escribe); ya no se aplana en un velo', JSON.stringify(v));
ok(s.notas.length === 1 && s.notas[0].severidad === 'ok', 'el aviso es «ok», no «aproximado»', JSON.stringify(s.notas));

s = superficieSeccion(reg, seccion({ imagenFondo: 'url("https://basisbodegas.com/x/foto.jpg"), linear-gradient(rgb(0, 0, 0) 0%, rgba(0, 0, 0, 0) 100%)', urlsFondo: ['https://basisbodegas.com/x/foto.jpg'], tamanoFondo: 'cover, auto', posicionFondo: '10% 20%, 0% 0%', repiteFondo: 'no-repeat, repeat' }), { urlLocal });
v = regs.at(-1).valor;
ok(v.gradientPlacement === 'below' && v.backgroundSize === 'cover' && v.backgroundPosition === '10% 20%', 'degradado DEBAJO de la foto: gradientPlacement below y la foto toma SU capa (la primera)', JSON.stringify(v));

s = superficieSeccion(reg, seccion({ fondo: 'rgb(245, 130, 32)', imagenFondo: NARANJA }), { urlLocal });
v = regs.at(-1).valor;
ok(v.backgroundColor === '#F58220' && v.backgroundGradient?.angle === '65deg' && v.gradientPlacement === undefined && v.backgroundAssetUrl === undefined,
  'aviso naranja: color plano + degradado a 65deg, sin foto ni placement', JSON.stringify(v));

s = superficieSeccion(reg, seccion({ imagenFondo: PORTADA + ', ' + NARANJA, urlsFondo: ['https://basisbodegas.com/wp-content/uploads/2025/07/portada.jpg'] }), { urlLocal });
ok(s.notas.some((n) => n.severidad === 'aproximado' && /2 degradados/.test(n.motivo)), 'dos degradados en una sección: se transcribe uno y se avisa del otro', JSON.stringify(s.notas));

s = superficieSeccion(reg, seccion({ fondo: 'rgb(10, 20, 30)' }), { urlLocal });
ok(s.notas.length === 0 && regs.at(-1).valor.backgroundGradient === undefined, 'una sección sin degradado no cambia: sólo su color');

console.log(fallas === 0 ? '\nprobar-transcriptor-fondos.mjs   TODO OK' : `\nprobar-transcriptor-fondos.mjs   ${fallas} falla(s)`);
process.exit(fallas === 0 ? 0 : 1);
