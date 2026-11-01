/**
 * El transcriptor no deja pasar ningún color ni tipografía literal: los traduce al set (lib/tokens.mjs).
 * Pura (sin WordPress): corre sola con `node scripts/probar-transcriptor-tokens.mjs`.
 */
import { crearTraductor, distancia } from './divi-a-contope/lib/tokens.mjs';
import { Registro } from './divi-a-contope/lib/registro.mjs';

let fallas = 0;
const ok = (caso, cond, detalle = '') => { console.log(`  ${cond ? 'ok    ' : 'FALLA '} ${caso}${detalle ? '   ' + detalle : ''}`); if (!cond) fallas++; };

const paleta = [
  { slug: 'background', color: '#FFFFFF' }, { slug: 'text', color: '#666666' }, { slug: 'accent', color: '#F26621' },
  { slug: 'gris-claro', color: '#D6D6D6' }, { slug: 'dark', color: '#222222' }, { slug: 'ink', color: '#0E0C19' },
];
const familiasTema = [{ slug: 'display', fontFamily: "'Big Shoulders Display', sans-serif" }, { slug: 'boton', fontFamily: "'Roboto', Arial, sans-serif" }];
const T = () => crearTraductor({
  paleta, familiasTema,
  roles: { accent: 'var(--cod-color-accent)', text: 'var(--cod-color-ink)' },
  familias: { 'Open Sans': 'var(--cod-font-body)' },
  distanciaMaxima: 8,
});

console.log('\n== colores ==');
let t = T();
ok('exacto: el hex de la paleta → su variable', t.color('#FFFFFF') === 'var(--wp--preset--color--background)');
ok('exacto, en minúscula y en rgb()', t.color('#f26621') === 'var(--cod-color-accent)' && t.color('rgb(242, 102, 33)') === 'var(--cod-color-accent)');
ok('un rol del perfil gana sobre la variable de WordPress', t.color('#666666') === 'var(--cod-color-ink)');
ok('hex de 3 dígitos', t.color('#fff') === 'var(--wp--preset--color--background)');
ok('el más cercano', t.color('#DDDDDD') === 'var(--wp--preset--color--gris-claro)');
ok('con alfa → color-mix sobre la variable', t.color('rgba(242, 102, 33, 0.2)') === 'color-mix(in srgb, var(--cod-color-accent) 20%, transparent)');
ok('alfa decimal', t.color('rgba(0, 0, 0, 0.125)').includes(' 12.5%'));
ok('alfa 0 → transparent', t.color('rgba(255, 255, 255, 0)') === 'transparent');
ok('transparent y variables no se tocan (idempotente)', t.color('transparent') === 'transparent' && t.color('var(--cod-color-accent)') === 'var(--cod-color-accent)');
const sombra = t.color('2px 2px 10px rgba(0,0,0,0.2)');
ok('dentro de una sombra', sombra === '2px 2px 10px color-mix(in srgb, var(--wp--preset--color--ink) 20%, transparent)', sombra);
const sombra2 = t.color('rgba(0, 0, 0, 0.12) 0px 24px 72px -12px');
ok('una sombra que EMPIEZA por el color conserva sus medidas', sombra2 === 'color-mix(in srgb, var(--wp--preset--color--ink) 12%, transparent) 0px 24px 72px -12px', sombra2);
ok('dos colores en un mismo valor', t.color('#FFFFFF #F26621') === 'var(--wp--preset--color--background) var(--cod-color-accent)');
ok('la distancia: igual = 0, blanco/negro = grande', distancia({ r: 5, g: 5, b: 5 }, { r: 5, g: 5, b: 5 }) === 0 && distancia({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) > 90);

console.log('\n== el informe ==');
t = T();
t.color('#F26621'); t.color('#DDDDDD'); t.color('#0056B3');
const inf = t.informe();
ok('cuenta los exactos', inf.exactos.length === 1 && inf.exactos[0].slug === 'accent');
ok('lista el acercado con su distancia', inf.aproximados.some((a) => a.original === '#DDDDDD' && a.slug === 'gris-claro' && a.distancia > 0 && !a.fuera));
ok('marca «fuera del set» al que está lejos de todo', inf.aproximados.some((a) => a.original === '#0056B3' && a.fuera));
const sil = T(); sil.silencioso.color('#DDDDDD'); sil.silencioso.familia('Roboto');
ok('la pasada silenciosa no cuenta usos', sil.informe().aproximados.length === 0 && sil.informe().familias.length === 0);

console.log('\n== tipografías ==');
t = T();
ok('un rol del perfil', t.familia("'Open Sans', sans-serif") === 'var(--cod-font-body)');
ok('sin rol: la variable del theme.json', t.familia("'Roboto', sans-serif") === 'var(--wp--preset--font-family--boton)');
ok('la familia que el set no conoce queda literal y marcada', t.familia("'Lobster', cursive") === "'Lobster', cursive" && t.informe().familias.some((f) => f.nombre === 'Lobster' && f.token === null));
ok('una variable no se vuelve a traducir', t.familia('var(--cod-font-body)') === 'var(--cod-font-body)');

console.log('\n== reglas ==');
t = T();
const r = t.regla('color', { role: 'c-0e0c19', color: '#0E0C19', apply: 'text' });
ok('el rol de un color deja de llevar el hex', r.role === 'c-ink' && r.color === 'var(--wp--preset--color--ink)', JSON.stringify(r));
const rb = t.regla('color', { role: 'boton-fondo-f26621', color: '#F26621', apply: 'background' });
ok('  también el de un botón', rb.role === 'boton-fondo-accent', rb.role);
const ra = t.regla('color', { role: 'c-rgba00', color: 'rgba(0, 0, 0, 0.5)' });
ok('  y el de un color con alfa', /^c-rgba00$|^c-.*a50$/.test(ra.role) || ra.role.endsWith('-a50') || ra.role === 'c-rgba00', ra.role);
const ty = t.regla('typography', { role: 'x', family: "'Open Sans', sans-serif", fontSize: '16px' });
ok('typography.family', ty.family === 'var(--cod-font-body)' && ty.fontSize === '16px');
const pr = t.regla('properties', { declarations: { 'font-family': "'Roboto', sans-serif", 'background-color': '#222222', 'border-left-color': 'rgba(0, 0, 0, 0.15)', width: '60px' } });
ok('properties: familia, fondo y borde con alfa; lo demás intacto', pr.declarations['font-family'] === 'var(--wp--preset--font-family--boton)' && pr.declarations['background-color'] === 'var(--wp--preset--color--dark)' && pr.declarations['border-left-color'].startsWith('color-mix(') && pr.declarations.width === '60px');
const su = t.regla('surface', { backgroundColor: '#FFFFFF', backgroundAssetUrl: '/wp-content/uploads/a-#fff.jpg', backgroundGradient: { type: 'linear', stops: [{ color: '#F26621', at: '0%' }, { color: 'rgba(255, 255, 255, 0)', at: '100%' }] } });
ok('surface: fondo y paradas del degradado', su.backgroundColor === 'var(--wp--preset--color--background)' && su.backgroundGradient.stops[0].color === 'var(--cod-color-accent)' && su.backgroundGradient.stops[1].color === 'transparent');
ok('  y no toca una ruta de archivo aunque lleve algo parecido a un hex', su.backgroundAssetUrl === '/wp-content/uploads/a-#fff.jpg');
const fo = t.regla('form', { theme: { principal: '#F26621', tipografia: "'Open Sans', sans-serif", sombra: 'rgba(18, 25, 97, 0.08) 0px 1px 4px 0px', radio: '4px' } });
ok('form.theme: colores, tipografía y sombra', fo.theme.principal === 'var(--cod-color-accent)' && fo.theme.tipografia === 'var(--cod-font-body)' && fo.theme.sombra.startsWith('color-mix(') && fo.theme.radio === '4px');

console.log('\n== en el registro: el id se calcula sobre lo traducido ==');
const reg = new Registro({ tokens: T() });
const a = reg.R('color', { role: 'c-dddddd', color: '#DDDDDD', apply: 'text' });
const b = reg.R('color', { role: 'c-d6d6d6', color: '#D6D6D6', apply: 'text' });
ok('dos colores que caen en el mismo token comparten regla', a === b && reg.reglas.length === 1);
ok('la regla guardada no lleva literales', !/#[0-9a-f]{3,8}|rgba?\(/i.test(JSON.stringify(reg.reglas)), JSON.stringify(reg.reglas[0].value));
const sinSet = new Registro();
sinSet.R('color', { role: 'c-dddddd', color: '#DDDDDD', apply: 'text' });
ok('sin bloque «tokens» en el perfil el registro es el de siempre (nada se traduce)', sinSet.reglas[0].value.color === '#DDDDDD');

console.log(fallas ? `\n${fallas} falla(s)` : '\ntodo ok');
process.exit(fallas ? 1 : 0);
