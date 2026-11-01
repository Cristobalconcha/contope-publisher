/**
 * Registro de reglas de diseño con DEDUPLICACIÓN POR VALOR.
 *
 * Una regla = (tipo, valor, ancho). Si dos nodos piden lo mismo, comparten la
 * misma regla y el mismo id; si piden algo distinto, reciben otro id aunque el
 * nombre legible sea parecido. El id lleva un hash del contenido, así que es
 * estable entre páginas: la hoja compartida del sitio guarda UNA regla por id,
 * y dos páginas nunca pueden decir cosas distintas bajo el mismo nombre.
 *
 * Las reglas por ancho (mobile / tablet) se atan a la regla base que
 * corrigen. Es deliberado: en la hoja cada regla móvil tiene que venir
 * DESPUÉS de su propia base, o gana la de escritorio. Si una regla móvil se
 * compartiera entre dos bases distintas, una de ellas quedaría detrás de su
 * base.
 *
 * TOKENS. Si el registro trae un traductor de tokens (lib/tokens.mjs), el valor de
 * cada regla se traduce al set de diseño ANTES de calcular su clave y su id: ningún
 * color ni tipografía literal llega a la regla, y dos valores que caen en el mismo
 * token comparten regla.
 */
import { hash } from './util.mjs';

export class Registro {
  constructor({ referencia, razon = 'Medido del sitio original con el navegador (estilos computados).', tokens = null } = {}) {
    this.tokens = tokens;
    this.referencia = referencia || '';
    this.razon = razon;
    this.reglas = [];
    this.porClave = new Map();
    /** id → cómo se pidió (tipo, valor, ancho, base, prefijo, estado): permite re-escopar una variante a otro ancho. */
    this.meta = new Map();
  }

  /** @returns {string} id de la regla (nueva, o la que ya existía con ese valor) */
  R(kind, value, { bp = 'all', base = '', prefijo = '', state = 'default' } = {}) {
    if (this.tokens) value = this.tokens.regla(kind, value);
    const clave = JSON.stringify([kind, value, bp, base, state]);
    const previo = this.porClave.get(clave);
    if (previo) return previo;
    const id = `${prefijo || kind}-${hash(clave)}`;
    this.reglas.push({
      id,
      kind,
      scope: { breakpoint: bp, state },
      provenance: { sources: [{ kind: 'reference', reference: this.referencia, rationale: this.razon }] },
      status: 'reviewed',
      value,
    });
    this.porClave.set(clave, id);
    this.meta.set(id, { kind, value, bp, base, prefijo, state });
    return id;
  }

  /**
   * Una regla de escritorio y, si el valor de tablet/móvil difiere, su variante
   * por ancho atada a la base. `cambios` = { mobile: valor, tablet: valor }.
   */
  conAnchos(kind, valorBase, cambios = {}, { prefijo = '' } = {}) {
    const ids = [];
    const base = this.R(kind, valorBase, { prefijo });
    ids.push(base);
    for (const bp of ['tablet', 'mobile']) {
      const v = cambios[bp];
      if (v && Object.keys(v).length) ids.push(this.R(kind, v, { bp, base, prefijo }));
    }
    return ids;
  }

  /** Para `properties`: sólo las declaraciones que cambian por ancho. */
  propiedades(declBase, declPorAncho = {}, opts = {}) {
    const lim = (d) => Object.fromEntries(Object.entries(d || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const base = lim(declBase);
    const ids = [];
    let idBase = '';
    if (Object.keys(base).length) {
      idBase = this.R('properties', { declarations: base }, opts);
      ids.push(idBase);
    }
    for (const bp of ['tablet', 'mobile']) {
      const d = lim(declPorAncho[bp]);
      const dif = Object.fromEntries(Object.entries(d).filter(([k, v]) => base[k] !== v));
      if (Object.keys(dif).length) ids.push(this.R('properties', { declarations: dif }, { bp, base: idBase, prefijo: opts.prefijo }));
    }
    return ids;
  }
}
