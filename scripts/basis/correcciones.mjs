/**
 * Aplica `correcciones.json` (cambios de contenido pedidos por el cliente) sobre los nodos que salen del transcriptor.
 * Cada cambio tiene que encontrar su objetivo: si el original cambió y ya no está, se corta con error en vez de
 * publicar en silencio el texto viejo.
 */
const recorrer = (nodos, fn, padre = null) => {
  for (const n of [...nodos]) {
    fn(n, padre);
    if (Array.isArray(n.children)) recorrer(n.children, fn, n);
  }
};
const textoDe = (n) => String(n.content?.text ?? n.content?.label ?? '');
// La pregunta de un pliegue del acordeón es el primer párrafo del grupo.
const preguntaDe = (g) => (g.kind === 'group' && g.children?.[0]?.kind === 'paragraph' ? textoDe(g.children[0]) : null);

export function aplicarCorrecciones(slug, nodos, correcciones) {
  const hechos = [];
  const exigir = (ok, que) => { if (!ok) throw new Error(`corrección sin objetivo en ${slug}: ${que}`); hechos.push(que); };
  for (const c of (correcciones.textos || []).filter((c) => c.pagina === slug)) {
    let veces = 0;
    recorrer(nodos, (n) => {
      for (const k of ['text', 'label']) {
        if (typeof n.content?.[k] === 'string' && n.content[k].includes(c.buscar)) { n.content[k] = n.content[k].split(c.buscar).join(c.reemplazar); veces++; }
      }
    });
    exigir(veces > 0, `«${c.buscar}» → «${c.reemplazar}»`);
  }
  for (const c of (correcciones.enlaces || []).filter((c) => c.pagina === slug)) {
    let veces = 0;
    recorrer(nodos, (n) => { if (n.kind === 'button' && textoDe(n) === c.boton) { n.content.href = c.href; delete n.content.target; veces++; } });
    exigir(veces > 0, `botón «${c.boton}» → ${c.href}`);
  }
  for (const c of (correcciones.quitarDuplicados || []).filter((c) => c.pagina === slug)) {
    let vistas = 0;
    recorrer(nodos, (n, padre) => {
      if (preguntaDe(n) !== c.pregunta || !padre) return;
      if (++vistas > 1) padre.children.splice(padre.children.indexOf(n), 1);
    });
    exigir(vistas > 1, `pregunta repetida «${c.pregunta}» (${vistas - 1} copia quitada)`);
  }
  for (const c of (correcciones.agregarAntes || []).filter((c) => c.pagina === slug)) {
    let modelo = null, hecho = false;
    recorrer(nodos, (n) => { if (!modelo && textoDe(n).startsWith(c.copiarReglasDe)) modelo = n; });
    recorrer(nodos, (n, padre) => {
      if (hecho || !padre || textoDe(n) !== c.antesDe) return;
      padre.children.splice(padre.children.indexOf(n), 0, { id: `${c.kind}-correccion-${hechos.length}`, kind: c.kind, ruleIds: [...(modelo?.ruleIds || [])], content: { text: c.texto } });
      hecho = true;
    });
    exigir(hecho && modelo, `«${c.texto}» agregado`);
  }
  return hechos;
}
