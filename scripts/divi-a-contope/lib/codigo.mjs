/**
 * Módulos de «código» de Divi: HTML/CSS/JS pegado a mano. No se transcribe
 * código; se RECONOCEN patrones conocidos y se reemplazan por la primitiva de
 * ContOpe que hace lo mismo. Lo que no se reconoce se reporta, nunca se
 * descarta en silencio.
 *
 * Patrones que reconoce hoy:
 *   1. botones fijos (`position: fixed`) de WhatsApp (enlace wa.me) y de
 *      ayuda/enlace con ícono SVG → nodo `whatsapp` y enlace con ícono.
 *   2. mini mapa que abre un mapa de Mapbox (`new mapboxgl.Map`) → grupo con la
 *      conducta `mapa`, con su dirección escrita al lado.
 *   3. mapa de Mapbox siempre abierto (`<div id="map">` + `new mapboxgl.Map`)
 *      → el mismo grupo `mapa` (queda cerrado hasta pincharlo: ver hueco).
 *   4. módulos con sólo `<style>` → CSS suelto: se reporta, no se aplica.
 */
import { leerHtml, textoDe, limpiarTexto, pxs, hash } from './util.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { reglasTexto } from './estilos.mjs';

/** Lee las declaraciones de una clase dentro de un <style> (sin anidados ni @media). */
const reglasCss = (css) => {
  const res = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const decl = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decl[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    }
    for (const sel of m[1].split(',')) res[sel.trim()] = { ...(res[sel.trim()] || {}), ...decl };
  }
  return res;
};

/** `background`, `border-radius`… cortos → forma larga que acepta la regla `properties`. */
const aLargas = (decl) => {
  const o = {};
  const rad = (v) => {
    const p = v.split(/\s+/);
    const [a, b = a, c = a, d = b] = p;
    return { 'border-top-left-radius': a, 'border-top-right-radius': b, 'border-bottom-right-radius': c, 'border-bottom-left-radius': d };
  };
  for (const [k, v] of Object.entries(decl)) {
    if (k === 'background') { o['background-color'] = v; continue; }
    if (k === 'border-radius') { Object.assign(o, rad(v)); continue; }
    if (k === 'transition') continue;
    o[k] = v;
  }
  return o;
};

export function transcribirCodigo(ctx, mod, { pagina, ubicacion }) {
  const html = mod.codigoHtml || '';
  const arbol = leerHtml(html);
  const todos = [];
  const recorrer = (n) => { if (n.texto !== undefined) return; todos.push(n); n.hijos.forEach(recorrer); };
  recorrer(arbol);
  const nodos = [];
  const reconocido = [];

  // ---- 1. botones fijos --------------------------------------------------
  const estilos = reglasCss(todos.filter((n) => n.tag === 'style').map(textoDe).join('\n'));
  const enlaces = todos.filter((n) => n.tag === 'a' && (n.attrs.class || '').split(/\s+/).some((c) => estilos['.' + c] && /fixed/.test(estilos['.' + c].position || '')));
  for (const a of enlaces) {
    const clase = (a.attrs.class || '').split(/\s+/).find((c) => estilos['.' + c]);
    const css = aLargas(estilos['.' + clase]);
    const hover = estilos[`.${clase}:hover`] ? aLargas(estilos[`.${clase}:hover`]) : null;
    const decl = {};
    for (const k of ['position', 'top', 'right', 'bottom', 'left', 'transform', 'width', 'height', 'background-color', 'box-shadow', 'z-index',
      'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']) if (css[k]) decl[k] = css[k];
    Object.assign(decl, { display: 'flex', 'justify-content': 'center', 'align-items': 'center' });
    const href = a.attrs.href || '';
    const wa = href.match(/^https?:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/);
    if (wa) {
      let mensaje = '';
      try { mensaje = decodeURIComponent(wa[2] || ''); } catch { mensaje = wa[2] || ''; }
      ctx.ajustes.whatsapp = { numero: wa[1], mensaje };
      const tam = Math.min(200, Math.max(24, parseInt(css.width, 10) || 60));
      const nodo = ctx.nodo('whatsapp', [...ctx.reg.propiedades(decl, {}, { prefijo: 'fijo' })],
        { message: mensaje.slice(0, 300), ariaLabel: a.attrs['aria-label'] || 'WhatsApp', size: tam, iconPadding: Math.round(tam * 0.15), iconColor: '#FFFFFF', iconStyle: 'logo', backgroundColor: css['background-color'] || 'transparent', borderRadius: /^[0-9a-z%. ]+$/i.test(estilos['.' + clase]['border-radius'] || '') ? estilos['.' + clase]['border-radius'] : '999px' });
      if (hover && hover['background-color']) nodo.ruleIds.push(ctx.reg.R('properties', { declarations: { 'background-color': hover['background-color'] } }, { state: 'hover', prefijo: 'fijo-h' }));
      nodos.push(nodo);
      ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase: clase, severidad: 'ok',
        motivo: 'botón fijo de WhatsApp → nodo `whatsapp` con iconStyle logo (la marca con su degradado verde, como el original)' });
      reconocido.push('whatsapp-fijo');
      continue;
    }
    const svg = todos.find((n) => n.tag === 'svg' && a.hijos.includes(n)) || a.hijos.map((h) => h).flatMap((h) => (h.hijos || [])).find((n) => n.tag === 'svg');
    const trazos = svg ? todos.filter((n) => n.tag === 'path' && n.attrs.d) : [];
    if (svg && trazos.length === 1 && ctx.perfil.carpetaUploads) {
      // El dibujo del original (un solo trazado) se guarda como forma del sitio y se usa con la regla «icono»:
      // el ícono es el mismo, relleno y todo, y toma el color del texto del enlace.
      const viewBox = svg.attrs.viewBox || svg.attrs.viewbox || '0 0 24 24';
      const archivo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${trazos[0].attrs.d}"/></svg>\n`;
      const nombre = 'enlace-' + hash(archivo, 8) + '.svg';
      mkdirSync(path.join(ctx.perfil.carpetaUploads, 'iconos-divi'), { recursive: true });
      writeFileSync(path.join(ctx.perfil.carpetaUploads, 'iconos-divi', nombre), archivo);
      const relleno = (svg.attrs.fill || '#FFFFFF');
      const lado = Math.round(Math.min(parseFloat(css.width) || 60, parseFloat(css.height) || 60) * 0.7);
      const reglasIcono = [...ctx.reg.propiedades(decl, {}, { prefijo: 'fijo' }),
        ctx.reg.R('icono', { forma: '/wp-content/uploads/iconos-divi/' + nombre, donde: 'antes', tamano: lado + 'px', color: /^#[0-9a-f]{3,8}$/i.test(relleno) ? relleno : (relleno === 'white' ? '#FFFFFF' : '#FFFFFF') }, { prefijo: 'ico' })];
      if (hover && hover['background-color']) reglasIcono.push(ctx.reg.R('properties', { declarations: { 'background-color': hover['background-color'] } }, { state: 'hover', prefijo: 'fijo-h' }));
      const dest = ctx.destino(href);
      nodos.push(ctx.nodo('link', reglasIcono, { label: '', href: dest ? dest.href : '#', target: a.attrs.target === '_blank' ? 'blank' : 'self' }));
      reconocido.push('enlace-fijo-icono');
      ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase, severidad: 'ok', motivo: `botón fijo con ícono SVG → enlace con la regla «icono» y el trazado original guardado como ${nombre}` });
      continue;
    }
    ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase, severidad: 'sin-transcribir', motivo: 'botón fijo con un SVG que no está en la tabla de íconos conocidos' });
  }

  // ---- 2 y 3. mapas de Mapbox ---------------------------------------------
  const script = todos.filter((n) => n.tag === 'script').map(textoDe).join('\n');
  const mapas = [...script.matchAll(/new\s+mapboxgl\.Map\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  if (mapas.length) {
    const grande = mapas[mapas.length - 1];
    const centro = grande.match(/center:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/);
    const zoom = Number((grande.match(/zoom:\s*(\d+(?:\.\d+)?)/) || [])[1] || 17);
    const popup = script.match(/setHTML\(\s*[`'"]([\s\S]*?)[`'"]\s*\)/);
    let globo = '';
    let enlace = null;
    if (popup) {
      const p = leerHtml(popup[1]);
      const a = (function buscar(n) { if (n.texto !== undefined) return null; if (n.tag === 'a') return n; for (const h of n.hijos) { const r = buscar(h); if (r) return r; } return null; })(p);
      if (a) enlace = { texto: limpiarTexto(textoDe(a)), href: a.attrs.href || '' };
      globo = limpiarTexto(textoDe(p).replace(enlace ? enlace.texto : '', '')).replace(/\s*\n\s*/g, ', ').slice(0, 300);
    }
    const direccion = todos.filter((n) => n.tag === 'div' && n.attrs.style && /color:\s*#fff/i.test(n.attrs.style));
    const textoDireccion = direccion.length ? limpiarTexto(textoDe(direccion[0])) : '';
    if (centro) {
      const esMini = /container:\s*['"]miniMap['"]/.test(mapas[0]) && mapas.length > 1 || /miniMap/.test(html);
      const contenido = {
        lat: Number(centro[2]), lng: Number(centro[1]), zoom,
        mini: esMini ? ctx.perfil.miniMapa : (ctx.perfil.miniMapaGrande || ctx.perfil.miniMapa),
        etiqueta: esMini ? 'Abrir el mapa de ubicación' : 'Abrir el mapa de ubicación',
        globo: globo || textoDireccion || 'Ubicación',
      };
      if (enlace && enlace.href) { contenido.globoEnlaceTexto = enlace.texto || enlace.href; contenido.globoEnlaceHref = enlace.href; }
      if (!contenido.mini) {
        ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase: 'mapbox', severidad: 'sin-transcribir', motivo: 'mapa de Mapbox reconocido pero el perfil no trae `miniMapa` (la imagen del mini mapa): no se emite' });
      } else {
        mapaBloque: {
        const hijos = [];
        if (textoDireccion) {
          const rol = (ctx.medidaD?.roles || []).find((r) => (r.ejemplos || []).some((e) => textoDireccion.startsWith(e.slice(0, 25))));
          const rolM = (ctx.medidaM?.roles || []).find((r) => (r.ejemplos || []).some((e) => textoDireccion.startsWith(e.slice(0, 25))));
          const reglasDir = rol ? reglasTexto(ctx.reg, { d: rol, m: rolM }) : [];
          reglasDir.push(...ctx.reg.propiedades({ 'margin-block-start': '0px', 'margin-block-end': '0px', 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0px', 'min-width': '0px' }, {}, { prefijo: 'mg-dir' }));
          hijos.push(ctx.nodo('paragraph', reglasDir, { text: textoDireccion }));
        }
        const caja = mod.caja || { w: 60, h: 60 };
        const reglasGrupo = esMini
          // Mini mapa: la imagen y la dirección escrita lado a lado; el mapa grande se despliega debajo.
          ? ctx.reg.propiedades({ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '15px', 'justify-content': 'center' }, {}, { prefijo: 'mapa' })
          // Mapa de la ficha de contacto: la imagen llena la caja que ocupaba el mapa del original.
          : ctx.reg.propiedades({ display: 'block', width: '100%', 'min-height': pxs(caja.h) }, {}, { prefijo: 'mapa' });
        const reglasMini = esMini
          ? ctx.reg.propiedades({ width: '60px', height: '60px', 'border-radius': '8px', 'object-fit': 'cover', display: 'block' }, {}, { prefijo: 'mini' })
          : ctx.reg.propiedades({ width: '100%', height: pxs(caja.h), 'border-radius': '8px', 'object-fit': 'cover', display: 'block' }, {}, { prefijo: 'mini' });
        // Sin la clave pública de Mapbox el plugin deja el mini como un enlace con una imagen de
        // 60×60 (no monta la conducta): para un mapa GRANDE eso se ve como una miniatura perdida.
        // Con `mapaGrande: "imagen"` en el perfil, el mapa de la ficha sale como la imagen a todo
        // el ancho de su caja, con enlace a «cómo llegar» (OpenStreetMap), y funciona sin clave.
        if (!esMini && ctx.perfil.mapaGrande === 'imagen') {
          const href = `https://www.openstreetmap.org/?mlat=${contenido.lat}&mlon=${contenido.lng}#map=${contenido.zoom}/${contenido.lat}/${contenido.lng}`;
          const img = ctx.nodo('image', [...ctx.reg.propiedades({ width: '100%', height: pxs(caja.h), 'object-fit': 'cover', 'border-radius': '8px', display: 'block' }, {}, { prefijo: 'mapa-img' })], { assetUrl: contenido.mini, alt: 'Mapa de ubicación: ' + (contenido.globo || '').slice(0, 120) });
          nodos.push(ctx.nodo('link', ctx.reg.propiedades({ display: 'block' }, {}, { prefijo: 'enl' }), { label: '', href, target: 'blank' }, [img]));
          ctx.avisar({ ...ubicacion, modulo: 'code', clase: 'mapbox', severidad: 'aproximado', motivo: 'mapa de Mapbox siempre abierto → imagen del mapa (recorte de la captura) con enlace a OpenStreetMap, porque sin clave de Mapbox el plugin no abre el mapa y ContOpe no tiene un mapa incrustado siempre abierto (hueco del plugin)' });
          reconocido.push('mapbox');
          break mapaBloque;
        }
        const grupo = ctx.nodo('group', [ctx.reg.R('interaction', { behavior: 'mapa' }, { prefijo: 'mapa' }), ...reglasGrupo], undefined, hijos);
        grupo.partes = { mini: reglasMini };
        // Mapa de la ficha de contacto, siempre abierto en el original (Mapbox en vivo): content.fijo (0.3.84). Con la clave
        // de Mapbox en Configuración → Mapa es un mapa incrustado del alto de la caja original; sin ella, el mini (la imagen,
        // ya dimensionada a esa caja) sigue siendo un enlace a «cómo llegar». No se carga ninguna clave desde acá.
        if (!esMini && ctx.perfil.mapaGrande === 'abierto') {
          contenido.fijo = true;
          grupo.partes.grande = ctx.reg.propiedades({ '--cod-mapa-alto': pxs(caja.h), 'margin-top': '0px', 'margin-bottom': '0px', 'max-width': 'none', 'border-radius': '8px', 'box-shadow': '2px 2px 10px rgba(0,0,0,0.2)' }, {}, { prefijo: 'mapa-grande' });
        }
        ctx.ajustes.mapa = { lat: contenido.lat, lng: contenido.lng, zoom: contenido.zoom, necesitaClaveMapbox: true };
        grupo.content = contenido;
        nodos.push(grupo);
        ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase: 'mapbox', severidad: esMini ? 'ok' : 'aproximado',
          motivo: esMini ? 'mini mapa de Mapbox → grupo con conducta `mapa` (necesita la clave pública de Mapbox en Configuración para abrir el grande)'
            : 'mapa de Mapbox siempre abierto → conducta `mapa` (mini que se abre al pincharlo): ContOpe no tiene un mapa incrustado siempre abierto (hueco del plugin)' });
        reconocido.push('mapbox');
        }
      }
    }
  }

  // ---- 4. sólo CSS ---------------------------------------------------------
  if (!nodos.length && todos.some((n) => n.tag === 'style') && !todos.some((n) => ['div', 'a', 'p', 'script', 'iframe', 'form'].includes(n.tag))) {
    ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase: 'css-suelto', severidad: 'sin-transcribir',
      motivo: `módulo de código con sólo CSS (${Object.keys(estilos).slice(0, 4).join(', ')}): no se aplica; si hacía falta, es un hueco de diseño` });
    return { nodos: [], reconocido: ['solo-css'] };
  }
  if (!nodos.length && !reconocido.length && html.trim()) {
    ctx.avisar({ pagina, ...ubicacion, modulo: 'code', clase: 'codigo', severidad: 'sin-transcribir',
      motivo: `código no reconocido (${html.length} caracteres): «${limpiarTexto(textoDe(arbol)).slice(0, 80)}»` });
  }
  return { nodos, reconocido };
}
