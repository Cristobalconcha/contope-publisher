/**
 * Formulario de Gravity Forms (medido en el sitio Divi) → formulario de
 * Orugantt Forms, e instalación por la API REST.
 *
 *   node formulario-a-orugantt.mjs --original <carpeta> --pagina contactos --perfil <perfil.json> --salida <fixture.json> [--instalar]
 *
 * Lo que traduce (por la clase `gfield--type-*` de cada campo):
 *   name → nombre + apellidos (dos columnas) · email (con repetición) → correo
 *   + «repite» con `confirmarCon` · phone → teléfono · text → texto · textarea →
 *   texto largo · consent / checkbox → casilla · select / radio → selector.
 * Lo que NO traduce se reporta (tipos de campo sin equivalente, lógica
 * condicional, archivos adjuntos, honeypot —que Orugantt reemplaza por el suyo).
 *
 * DESTINO DE LOS AVISOS: NO se inventa. El fixture sale con las notificaciones
 * APAGADAS y un marcador `PENDIENTE-DESTINO@…invalid`; quien publique el sitio
 * pone la casilla real. Nunca se envía un formulario a una casilla real.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };

const quitarAsterisco = (t) => String(t || '').replace(/\*\s*$/, '').trim();
const id = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo';

export function fixtureDesdeGravity(form, { nombre, maxLength, avisos = [] }) {
  const items = [];
  const usados = new Set();
  const unico = (b) => { let x = b, i = 2; while (usados.has(x)) x = `${b}_${i++}`; usados.add(x); return x; };
  for (const c of form.campos) {
    const clase = c.clase || '';
    const tipo = (clase.match(/gfield--type-([a-z]+)/) || [])[1] || 'desconocido';
    const etiqueta = quitarAsterisco(c.etiqueta);
    const req = !!c.requerido;
    const e = c.entradas || [];
    if (tipo === 'honeypot') { avisos.push({ campo: etiqueta, motivo: 'campo trampa (honeypot) de Gravity Forms: Orugantt Forms trae el suyo' }); continue; }
    if (tipo === 'name') {
      const a = unico('nombre'), b = unico('apellidos');
      items.push({ type: 'GridSection', id: unico('fila_nombre'), titulo: etiqueta || 'Nombre', obligatorio: req, items: [
        { type: 'texto', id: a, label: quitarAsterisco(e[0]?.etiqueta || 'Nombre'), obligatorio: req, registrarEnDb: true, autocompletar: 'given-name', layoutClasses: ['col-6'] },
        { type: 'texto', id: b, label: quitarAsterisco(e[1]?.etiqueta || 'Apellidos'), obligatorio: req, registrarEnDb: true, autocompletar: 'family-name', layoutClasses: ['col-6'] },
      ] });
    } else if (tipo === 'email') {
      const a = unico('correo');
      if (e.length > 1) {
        const b = unico('correo_repite');
        items.push({ type: 'GridSection', id: unico('fila_correo'), titulo: etiqueta || 'Email', obligatorio: req, items: [
          { type: 'texto', id: a, label: quitarAsterisco(e[0].etiqueta || 'Correo'), obligatorio: req, registrarEnDb: true, tipoEntrada: 'email', autocompletar: 'email', layoutClasses: ['col-6'] },
          { type: 'texto', id: b, label: quitarAsterisco(e[1].etiqueta || 'Repite tu correo'), obligatorio: req, registrarEnDb: false, tipoEntrada: 'email', autocompletar: 'email', confirmarCon: a, confirmarMensaje: 'Los correos no coinciden.', layoutClasses: ['col-6'] },
        ] });
      } else items.push({ type: 'texto', id: a, label: etiqueta || 'Correo', obligatorio: req, registrarEnDb: true, tipoEntrada: 'email', autocompletar: 'email' });
    } else if (tipo === 'phone') {
      items.push({ type: 'texto', id: unico('telefono'), label: etiqueta || 'Teléfono', obligatorio: req, registrarEnDb: true, tipoEntrada: 'tel', autocompletar: 'tel' });
    } else if (tipo === 'text') {
      items.push({ type: 'texto', id: unico(id(etiqueta)), label: etiqueta, obligatorio: req, registrarEnDb: true });
    } else if (tipo === 'textarea') {
      items.push({ type: 'texto-largo', id: unico(id(etiqueta) || 'mensaje'), label: etiqueta, obligatorio: req, registrarEnDb: true, rows: 5, ...(maxLength ? { maxLength } : {}), ...(c.descripcion ? { ayuda: c.descripcion } : {}) });
    } else if (tipo === 'consent' || tipo === 'checkbox') {
      items.push({ type: 'boolean_check', id: unico(id(etiqueta) || 'acepta'), label: etiqueta, obligatorio: req, registrarEnDb: true, opciones: [{ value: 'si', label: e[0]?.etiqueta || etiqueta }] });
    } else if (tipo === 'select' || tipo === 'radio') {
      items.push({ type: 'selector', id: unico(id(etiqueta)), label: etiqueta, obligatorio: req, registrarEnDb: true, placeholder: 'Elige una opción', opciones: c.opciones || [] });
    } else {
      avisos.push({ campo: etiqueta, motivo: `tipo de campo «${tipo}» sin traducción: se omite` });
    }
  }
  return {
    name: nombre,
    _formMetadata: {
      sinTitulo: true,
      botonEnviar: form.enviar?.texto || 'Enviar',
      thankYou: { title: '¡Gracias por escribirnos!', body: 'Recibimos tu mensaje. Te responderemos a la brevedad.' },
      notificaciones: { activo: false, para: 'PENDIENTE-DESTINO@basis.invalid', asunto: 'Contacto web · {{campo:nombre}} {{campo:apellidos}}', reglas: [] },
    },
    items,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const original = arg('original'); const pagina = arg('pagina'); const perfil = JSON.parse(readFileSync(arg('perfil'), 'utf8'));
  const med = JSON.parse(readFileSync(path.join(original, 'datos', `medida-${pagina}-1440.json`), 'utf8'));
  const f = med.formularios[0];
  const cfg = perfil.formularios?.[0] || {};
  const avisos = [];
  const fx = fixtureDesdeGravity(f, { nombre: cfg.nombre || 'Contacto Basis', maxLength: cfg.maxLength, avisos });
  writeFileSync(arg('salida'), JSON.stringify(fx, null, 2));
  console.log(`fixture: ${fx.items.length} elementos · avisos: ${avisos.length}`);
  for (const a of avisos) console.log(`  - ${a.campo}: ${a.motivo}`);
  if (process.argv.includes('--instalar')) {
    const SITIO = (process.env.SITIO || '').replace(/\/+$/, '');
    const AUTH = readFileSync(process.env.AUTH_FILE, 'utf8').trim();
    const api = async (metodo, ruta, cuerpo) => {
      const r = await fetch(`${SITIO}/index.php?rest_route=/orugantt-forms/v1${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { _texto: t.slice(0, 300) }; }
      return { estado: r.status, datos: d };
    };
    const lista = await api('GET', '/constructor/forms');
    if (lista.estado !== 200) { console.error('no pude listar los formularios', JSON.stringify(lista.datos).slice(0, 300)); process.exit(1); }
    const ex = (lista.datos.forms || []).find((x) => x.title === fx.name);
    let fid;
    if (ex) { fid = ex.id; const g = await api('POST', '/constructor/forms', { id: fid, module: fx }); if (g.estado !== 200) { console.error('no pude actualizar', JSON.stringify(g.datos).slice(0, 300)); process.exit(1); } console.log(`ya existía (#${fid}): borrador actualizado`); }
    else { const c = await api('POST', '/constructor/forms', { module: fx, title: fx.name }); if (c.estado !== 201) { console.error('no pude crear', JSON.stringify(c.datos).slice(0, 300)); process.exit(1); } fid = c.datos.id; console.log(`creado #${fid} (${c.datos.slug})`); }
    const p = await api('POST', `/constructor/forms/${fid}/publish`);
    if (p.estado !== 200 && p.estado !== 201) { console.error('no pude publicar', JSON.stringify(p.datos).slice(0, 300)); process.exit(1); }
    console.log('publicado');
  }
}
