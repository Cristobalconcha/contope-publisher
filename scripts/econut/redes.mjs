/**
 * Las cuentas oficiales de Econut.
 *
 * Viven acá y no dentro de un generador porque las usan los dos: el pie y el
 * encabezado se componen en `componer-regiones.mjs` y el cuerpo en
 * `componer.mjs`. Repetirlas en ambos es pedir que un día digan cosas
 * distintas, y en esto una dirección equivocada no es una errata: es el sitio
 * avalando una cuenta que no es de la empresa.
 *
 * Por qué importan. Hay estafadores vendiendo nueces a nombre de Econut —llegó
 * gente a la planta a buscar lo que había pagado por internet— y econut.cl no
 * daba ninguna forma de verificar cuál es la cuenta verdadera. Publicarlas con
 * el nombre a la vista es lo que permite comparar letra por letra.
 *
 * Y el sitio es el árbitro justamente porque es lo único que el suplantador no
 * controla: puede copiar el logotipo, el nombre y hasta poner econut.cl en su
 * biografía, pero no puede hacer que econut.cl lo enlace de vuelta.
 *
 * Las direcciones van LIMPIAS. Las que figuran en la biografía de Instagram
 * traen parámetros de seguimiento pegados (`?si=…`, `?mibextid=…`) que no se
 * publican. Y el enlace corto `facebook.com/share/1CuGPZ7cF3/` resuelve a la
 * misma página `EconutChile`: no son dos páginas, es una compartida de dos
 * formas.
 *
 * PROVISORIO (3 de octubre de 2026): en Instagram hay DOS cuentas con el
 * logotipo de Econut, `econutchile.oficial` (19 publicaciones) y `econutchile`
 * (2 publicaciones). Se usa la primera porque es la que tiene el contenido y la
 * que enlaza al sitio y a las otras tres redes. Arturo confirma cuál queda.
 * Si queda la otra, se cambia esta línea y nada más.
 *
 * Nota para cuando se decida: `econutchile`, sin sufijo, es el nombre que
 * conviene. Coincide con el de YouTube, y un sufijo como «.oficial» no
 * protege —es lo primero que copia quien suplanta—. Lo que distingue de verdad
 * es la insignia de la plataforma y que el sitio la enlace.
 */
export const REDES = {
  instagram: {
    url: 'https://www.instagram.com/econutchile.oficial/',
    handle: '@econutchile.oficial',
  },
  facebook: {
    url: 'https://www.facebook.com/EconutChile',
    handle: 'EconutChile',
  },
  youtube: {
    url: 'https://www.youtube.com/@econutchile',
    handle: '@econutchile',
  },
  linkedin: {
    url: 'https://www.linkedin.com/company/comercializadora-econut-ltda',
    handle: 'Comercializadora Econut Ltda',
  },
  // Pendiente: WhatsApp Business, en disputa con Meta mientras se recupera la
  // propiedad de la marca. Cuando se resuelva, apuntar a la cuenta verificada.
};
