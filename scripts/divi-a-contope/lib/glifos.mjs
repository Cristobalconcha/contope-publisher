/**
 * Glifos de las fuentes de íconos de Divi (FontAwesome, ETmodules) → SVG de Medios.
 *
 * Divi dibuja sus íconos con una FUENTE: un carácter del área privada de Unicode. ContOpe
 * lleva íconos como SVG (la regla `icono` con `forma`), así que se toma el contorno del
 * glifo de la propia fuente del sitio original (`datos/glifos.json`, que saca
 * `scripts/basis/descarga/glifos.mjs`) y se guarda como archivo del sitio nuevo. El ícono es
 * EL MISMO, no un parecido en otro set (30-oct: «Material Symbols» no trae el estilo relleno
 * de FontAwesome y sustituirlo cambiaba el dibujo).
 *
 * El SVG sale CUADRADO (de lado el mayor entre el ancho del glifo y el alto de la fuente) y con el
 * glifo centrado: la regla `icono` dibuja en una caja cuadrada y nunca deforma.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const familiaDe = (nombre) => (/awesome/i.test(nombre) ? 'FontAwesome' : /etmodules/i.test(nombre) ? 'ETmodules' : nombre);

/**
 * @returns {{forma: string, lado: number, escala: number, ancho: number, alto: number}|null}
 *   `escala` = px por unidad de la fuente para un tamaño de fuente `tam` (px): px = unidades × tam / alto.
 */
export function svgDeGlifo(ctx, familiaMedida, codepointHex, tam) {
  const familia = familiaDe(familiaMedida);
  const g = ctx.glifos?.[familia]?.[codepointHex];
  if (!g || !g.d || !ctx.perfil.carpetaUploads) return null;
  const lado = Math.max(g.ancho, g.alto);
  const dx = Math.round(((lado - g.ancho) / 2) * 1000) / 1000;
  const dy = Math.round(((lado - g.alto) / 2) * 1000) / 1000;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}"><path transform="translate(${dx} ${dy})" d="${g.d}"/></svg>\n`;
  const nombre = `${familia.toLowerCase()}-${codepointHex}.svg`;
  mkdirSync(path.join(ctx.perfil.carpetaUploads, 'iconos-divi'), { recursive: true });
  writeFileSync(path.join(ctx.perfil.carpetaUploads, 'iconos-divi', nombre), svg);
  const escala = tam / g.alto;
  return { forma: `/wp-content/uploads/iconos-divi/${nombre}`, lado, escala, ancho: g.ancho, alto: g.alto };
}

/** El carácter de una cadena medida (`contenido: "\""`) o un glifo suelto → codepoint hexadecimal. */
export const codepointDe = (texto) => {
  const t = String(texto || '').replace(/^"|"$/g, '');
  const ch = [...t][0];
  return ch ? ch.codePointAt(0).toString(16) : '';
};
