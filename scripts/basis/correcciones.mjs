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
  // Una marca es el id de HTML de una sección (destino de un enlace #marca): va en la sección de primer nivel que contiene el texto.
  for (const c of (correcciones.marcas || []).filter((c) => c.pagina === slug)) {
    let hecho = false;
    for (const sec of nodos) {
      let tiene = false;
      recorrer([sec], (n) => { if (textoDe(n) === c.seccionConTexto) tiene = true; });
      if (tiene && sec.kind === 'section') { sec.marker = c.marca; hecho = true; break; }
    }
    exigir(hecho, `marca #${c.marca} en la sección de «${c.seccionConTexto}»`);
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
  const paraEsta = (c) => c.pagina === slug || c.pagina === '*';
  // Reglas de diseño agregadas a nodos (rediseño pedido, no del original). Elegir por tipo de nodo, por la sección que
  // contiene un texto o por el grupo que tiene ese texto como hijo directo.
  for (const c of (correcciones.agregarReglas || []).filter(paraEsta)) {
    let veces = 0;
    const sumar = (n) => { for (const r of c.reglas) if (!n.ruleIds.includes(r)) n.ruleIds.push(r); veces++; };
    // sóloFotos: imágenes de foto (jpg/webp), no íconos ni dibujos en png/svg.
    if (c.kind) recorrer(nodos, (n) => { if (n.kind === c.kind && (!c.soloFotos || /.(jpe?g|webp)$/i.test(n.content?.assetUrl || ''))) sumar(n); });
    if (c.seccionConTexto) for (const sec of nodos) { let t = false; recorrer([sec], (n) => { if (textoDe(n) === c.seccionConTexto) t = true; }); if (t && sec.kind === 'section') { sumar(sec); break; } }
    // filaConTexto: el recuadro (fila) que contiene la columna con ese texto.
    if (c.filaConTexto) recorrer(nodos, (n) => { if (n.kind === 'group' && (n.children || []).some((col) => col.kind === 'group' && (col.children || []).some((h) => textoDe(h) === c.filaConTexto))) sumar(n); });
    if (c.grupoConTexto) recorrer(nodos, (n) => { if (n.kind === 'group' && (n.children || []).some((h) => textoDe(h) === c.grupoConTexto)) sumar(n); });
    if (c.pagina === '*' && !veces) continue; // la página no tiene ese tipo de nodo
    exigir(veces > 0, `reglas ${c.reglas.join(', ')} → ${veces} nodo(s)`);
  }
  // Una lista con subpuntos pasa a acordeón: cada punto con subpuntos es un pliegue (su título y la sublista adentro).
  // Los puntos sin subpuntos no tienen nada que desplegar: quedan como lista común, arriba o abajo del acordeón.
  for (const c of (correcciones.listaAAcordeon || []).filter(paraEsta)) {
    let hecho = false;
    recorrer(nodos, (n, padre) => {
      if (hecho || n.kind !== 'list' || !padre) return;
      const items = n.content?.items || [];
      if (typeof items[0] !== 'object' || items[0].text !== c.primerItem) return;
      const sueltos = items.filter((x) => typeof x === 'string');
      const plegables = items.filter((x) => typeof x === 'object');
      const subRegla = n.partes?.sublista || [];
      const pliegues = plegables.map((it, i) => ({
        id: `group-rd-${n.id}-${i}`, kind: 'group', ruleIds: ['col-542b47'], children: [
          { id: `paragraph-rd-${n.id}-${i}`, kind: 'paragraph', ruleIds: ['mg-a343db', ...(c.reglasTitulo || [])], content: { text: it.text.replace(/:$/, '') } },
          { id: `list-rd-${n.id}-${i}`, kind: 'list', ruleIds: [...n.ruleIds.filter((r) => /^(t|c)-/.test(r)), ...subRegla, 'mg-a343db'], content: { ordered: false, items: it.items } },
        ] }));
      const acordeon = { id: `group-rd-${n.id}`, kind: 'group', ruleIds: [...c.acordeon], partes: c.partes, children: pliegues };
      const lista = sueltos.length ? { ...n, id: `${n.id}-sueltos`, ruleIds: [...n.ruleIds, ...(c.reglasSueltos || [])], content: { ordered: false, items: sueltos }, partes: undefined } : null;
      const nuevos = c.sueltosArriba ? [lista, acordeon] : [acordeon, lista];
      padre.children.splice(padre.children.indexOf(n), 1, ...nuevos.filter(Boolean));
      hecho = true;
    });
    exigir(hecho, `lista «${c.primerItem}…» → acordeón (varios abiertos a la vez)`);
  }
  return hechos;
}

/** Cambia el valor de una declaración en las reglas de diseño de la página (estilo pedido por el cliente, no del original). */
export function corregirReglas(slug, design, correcciones, nodos = []) {
  const hechos = [];
  const usadas = new Set(JSON.stringify(nodos).match(/"bas-[a-z-]+"/g)?.map((x) => x.slice(1, -1)) || []);
  const modelo = (design.rules || [])[0];
  for (const r of (correcciones.reglasNuevas || []).filter((c) => c.pagina === slug || c.pagina === '*')) {
    if (r.pagina === '*' && !usadas.has(r.id)) continue;
    const { pagina, _porque, ...regla } = r;
    design.rules.push({ ...regla, provenance: { sources: [{ kind: 'reference', reference: 'scripts/basis/correcciones.json', rationale: _porque || 'Rediseño pedido por el cliente sobre el original.' }] }, status: modelo?.status || 'reviewed' });
    hechos.push(`regla nueva ${r.id}`);
  }
  for (const c of (correcciones.declaraciones || []).filter((c) => c.pagina === slug)) {
    let veces = 0;
    for (const r of design.rules || []) {
      const d = r.value?.declarations;
      if (d && d[c.propiedad] === c.valor) { d[c.propiedad] = c.nuevo; veces++; }
    }
    if (!veces) throw new Error(`corrección sin objetivo en ${slug}: ${c.propiedad} ${c.valor}`);
    hechos.push(`${c.propiedad} ${c.valor} → ${c.nuevo} (${veces} regla${veces > 1 ? 's' : ''})`);
  }
  return hechos;
}
