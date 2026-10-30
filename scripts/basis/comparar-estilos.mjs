/**
 * Compara los ESTILOS COMPUTADOS del sitio local contra lo medido en el original.
 *
 * Por cada bloque de texto medido (módulos de texto, títulos, botones, blurbs,
 * pliegues) busca en la página local el elemento más chico que contiene ese
 * texto y compara tamaño, interlineado, peso, familia, color, alineación y
 * ancho de caja. Sólo imprime lo que difiere. Es la misma idea de
 * scripts/econut/comparar-estilos.mjs, pero leyendo las mediciones de Divi.
 *
 *   node comparar-estilos.mjs <pagina> <ruta-local> [ancho=1440] [SITIO]
 */
import { readFileSync } from 'node:fs';
import { abrirChrome, esperarLaPagina, recorrerLaPagina } from '../piezas/chrome.mjs';

const [pagina, ruta, anchoArg, sitioArg] = process.argv.slice(2);
const ancho = Number(anchoArg || 1440);
const SITIO = (sitioArg || 'http://localhost:8894').replace(/\/+$/, '');
const ORIG = 'C:/Users/Cristobal concha/Sesión Claude/entregables/basis/medicion-3';
const med = JSON.parse(readFileSync(`${ORIG}/datos/medida-${pagina}-${ancho}.json`, 'utf8'));

const esperados = [];
const limpio = (t) => (t || '').replace(/\s+/g, ' ').trim();
for (const s of med.secciones) for (const f of s.filas) for (const c of (f.columnas || [])) for (const m of c.modulos) {
  const reg = `${s.region}`;
  for (const b of (m.bloques || [])) if (b.estilo && limpio(b.texto).length > 3 && b.etiqueta !== 'li') esperados.push({ reg, texto: limpio(b.texto), est: b.estilo, tipo: m.tipo, cajaW: m.caja.w, cajaY: m.caja.y });
  if (m.estilo && m.texto) esperados.push({ reg, texto: limpio(m.texto), est: m.estilo, tipo: m.tipo, cajaW: m.caja.w, cajaY: m.caja.y });
  if (m.estiloTitulo && m.titulo) esperados.push({ reg, texto: limpio(m.titulo), est: m.estiloTitulo, tipo: m.tipo + ':titulo', cajaW: m.caja.w, cajaY: m.caja.y });
  if (m.estiloDescripcion && m.descripcion) esperados.push({ reg, texto: limpio(m.descripcion), est: m.estiloDescripcion, tipo: m.tipo + ':desc', cajaW: m.caja.w, cajaY: m.caja.y });
  if (m.boton) esperados.push({ reg, texto: limpio(m.boton.texto), est: m.boton.estilo, tipo: 'boton', cajaW: m.boton.caja?.w, cajaY: m.boton.caja?.y });
  for (const it of (m.items || [])) if (it.estiloTitulo) esperados.push({ reg, texto: limpio(it.titulo), est: it.estiloTitulo, tipo: 'pliegue', cajaW: it.tamano?.w, cajaY: it.tamano?.y });
}

const movil = ancho < 600;
const { cdp, evaluar, dormir, cerrar } = await abrirChrome({ ancho, alto: movil ? 852 : 950, escala: movil ? 2 : 1, movil });
try {
  await cdp('Page.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Page.navigate', { url: SITIO + ruta });
  await dormir(2500); await esperarLaPagina(evaluar); await recorrerLaPagina(evaluar); await dormir(1500);
  const res = await evaluar(`(() => {
    const esp = ${JSON.stringify(esperados)};
    const limpio = (t) => (t || '').replace(/\\s+/g, ' ').trim();
    const todos = [...document.querySelectorAll('body *')];
    return esp.map((e) => {
      const buscar = e.texto.slice(0, 60);
      let mejor = null;
      for (const el of todos) {
        if (el.closest('[class*=cookieadmin]') || ['SCRIPT','STYLE','NOSCRIPT','TITLE','TEMPLATE'].includes(el.tagName) || el.closest('script,style,noscript,template')) continue;
        const rr = el.getBoundingClientRect(); if (!rr.width || !rr.height) continue;
        const t = limpio(el.textContent);
        if (!t.includes(buscar)) continue;
        if (!mejor || t.length <= limpio(mejor.textContent).length) mejor = el;
      }
      if (!mejor) return { e, falta: true };
      const s = getComputedStyle(mejor); const r = mejor.getBoundingClientRect();
      return { e, tam: s.fontSize, inter: s.lineHeight, peso: s.fontWeight, fam: s.fontFamily.split(',')[0].replace(/['"]/g, ''), color: s.color, alinea: s.textAlign, w: Math.round(r.width), y: Math.round(r.top + scrollY), tag: mejor.tagName.toLowerCase() };
    });
  })()`);
  let n = 0;
  for (const r of res) {
    const e = r.e;
    if (r.falta) { console.log(`FALTA  [${e.reg}/${e.tipo}] «${e.texto.slice(0, 50)}»`); n++; continue; }
    const dif = [];
    const num = (v) => parseFloat(v);
    if (Math.abs(num(r.tam) - num(e.est.tam)) > 0.6) dif.push(`tam ${r.tam}≠${e.est.tam}`);
    if (e.est.interlineado !== 'normal' && Math.abs(num(r.inter) - num(e.est.interlineado)) > 1.2) dif.push(`interl ${r.inter}≠${e.est.interlineado}`);
    if (Math.abs(num(r.peso) - num(e.est.peso)) > 50) dif.push(`peso ${r.peso}≠${e.est.peso}`);
    if (r.fam.toLowerCase() !== String(e.est.familia).toLowerCase()) dif.push(`fam ${r.fam}≠${e.est.familia}`);
    if (r.color.replace(/\s/g, '') !== String(e.est.color).replace(/\s/g, '')) dif.push(`color ${r.color}≠${e.est.color}`);
    if (e.cajaW && r.w && Math.abs(r.w - e.cajaW) > 4 && ['text','heading','boton','pliegue'].includes(e.tipo.split(':')[0]) && !/boton|pliegue/.test(e.tipo)) dif.push(`ancho ${r.w}≠${e.cajaW}`);
    if (process.env.POSICIONES) console.log(`POS ${String(r.y - e.cajaY).padStart(5)}  y=${String(r.y).padStart(5)} esperado=${String(e.cajaY).padStart(5)}  [${e.reg}/${e.tipo}] «${e.texto.slice(0, 36)}»`);
    if (dif.length) { console.log(`DIF    [${e.reg}/${e.tipo}] <${r.tag}> «${e.texto.slice(0, 40)}» ${dif.join(' · ')}`); n++; }
  }
  console.log(`${res.length} textos comparados, ${n} con diferencias`);
} finally { await cerrar(); }
