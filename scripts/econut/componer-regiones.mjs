/**
 * Compone el encabezado y el pie de Econut COMO REGIONES GLOBALES, no como
 * secciones dentro de la página.
 *
 * Por qué: un encabezado dentro del cuerpo se repite y se edita por página, y
 * eso es exactamente lo que el sistema de plantillas del publisher existe para
 * evitar. Las regiones se crean con `crear-regiones.php` y se escriben por el
 * canal MCP con `pageId: 0` más el documentId de la región.
 *
 * Medido en econut.cl el 2026-09-30: el encabezado es una franja blanca de
 * 100px con el logotipo horizontal de 164x60 CENTRADO, y nada más. No hay menú.
 *
 * Deja dos archivos, `region-header.json` y `region-footer.json`, listos para
 * `cod_preview_canvas_composition` y `cod_apply_canvas_composition`.
 */
import { REDES } from './redes.mjs';
import { writeFileSync } from 'node:fs';

const M = '/wp-content/uploads/2026/09/';
const BLANCO = '#FFFFFF';
const OSCURO = '#222222';
const TEXTO = '#333333';
const VERDE = '#2E594A';   // el verde de Econut, medido en el pie de econut.cl

// ¿Hay número de WhatsApp? Hoy no: econut.cl no publica ninguno —lo busqué en
// la portada, en /contactos y en el botón flotante, que va a /contacto y no a
// WhatsApp—, y el local tampoco lo tiene configurado.
//
// Sin número, el plugin omite el icono (bien: un botón que no lleva a ninguna
// parte es peor que nada), pero el envoltorio y la palabra «WhatsApp» quedaban
// sueltos en el encabezado. Por eso la píldora entera es condicional.
//
// PARA ACTIVARLA: guardar el número en Configuración → WhatsApp, poner esto en
// true y volver a correr este guion.
const HAY_WHATSAPP = false;

// La página de términos y privacidad, por su DIRECCIÓN y no por su número.
// El número de una página cambia de una instalación a otra —en el espejo local
// es la 3, en econut.cl será otra— y un enlace con el número funciona en un
// lado y lleva a otra parte en el otro. Por eso el espejo local tiene los
// enlaces permanentes bonitos activos, igual que econut.cl, que tiene
// /contactos.
const LEGAL = '/terminos-y-privacidad/';

// La imagen del mini mapa. Es un archivo del SITIO, no una llamada a Mapbox:
// se generó una sola vez con `scripts/generar-mini-mapa.mjs` a zoom 2 —el país
// entero— y se subió a Medios. El encuadre del mini nunca cambia, así que
// pedírselo a Mapbox en cada visita sería pagar un viaje por algo que ya
// sabemos cómo se ve. Y además lo deja fuera del consentimiento de cookies:
// una imagen propia no le cuenta a nadie quién entró al sitio.
const MINI_MAPA = '/wp-content/uploads/2026/10/mini-mapa-econut.png';

// El pin de Econut, el mismo del sitio publicado. Vive en el TEMA y no en
// Medios porque WordPress rechaza subir SVG —con razón: un SVG puede traer
// JavaScript dentro— y no vale la pena abrir esa puerta en todo el sitio por
// una imagen. Como recurso del tema además viaja con él al desplegar.
// Comprobado antes de copiarlo: sólo trae <svg>, <defs>, <style>, <g> y
// <path>, sin <script>, sin manejadores de evento y sin referencias externas.
const PIN = '/wp-content/uploads/2026/10/pin-econut.svg';

const f = {
  logoHorizontal: M + 'Logo-horizontal-@svg.svg',
  logoCalado: M + 'Logo-calado-20.png',
  logoAltfx: M + 'Altfx-2-Calado.png',   // el crédito de diseño, en el pie
};

let n = 0;
const id = (p) => `${p}-${++n}`;

const hacerReglas = () => {
  const reglas = [];
  const R = (rid, kind, value, { bp = 'all' } = {}) => {
    reglas.push({
      id: rid, kind,
      scope: { breakpoint: bp, state: 'default', roles: [] },
      provenance: { sources: [{ kind: 'reference', reference: 'https://econut.cl/', rationale: 'Medido del sitio real con el navegador.' }] },
      status: 'reviewed', value,
    });
  };
  return { reglas, R };
};

// ---------------------------------------------------------------- encabezado
{
  const { reglas, R } = hacerReglas();
  R('h-superficie', 'surface', { backgroundColor: BLANCO, foregroundColor: TEXTO });
  R('h-aire', 'spacing', { paddingBlock: '20px', paddingInline: '24px' });
  R('h-centrado', 'properties', { declarations: {
    display: 'flex', 'justify-content': 'center', 'align-items': 'center', width: '100%',
  } });
  R('h-logo', 'properties', { declarations: { width: '164px', 'max-width': '164px' } });
  // El botón de WhatsApp del encabezado, copiado del de Santa Luisa: una
  // píldora con el logotipo y la palabra al lado. Medido allá: 34 de alto,
  // radio 999, relleno 8 y 14, icono de 18, separación 8, texto en 11,5 con
  // peso 700 y 0,69 de espaciado. Lo único que cambia es el color, que acá es
  // el verde de Econut y no el oliva de Santa Luisa.
  //
  // El logo queda centrado en la barra y la píldora se va al extremo derecho
  // sin empujarlo: por eso el contenedor reparte en tres y el botón vive en la
  // tercera parte, alineado al final.
  R('h-barra', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) auto minmax(0, 1fr)',
    'align-items': 'center', width: '100%',
  } });
  R('h-wa-lado', 'properties', { declarations: {
    display: 'flex', 'justify-content': 'flex-end', 'align-items': 'center', gap: '10px',
  } });
  R('h-wa-pildora', 'properties', { declarations: {
    display: 'inline-flex', 'align-items': 'center', gap: '8px',
    'background-color': VERDE, 'border-radius': '999px',
    'padding-top': '5px', 'padding-bottom': '5px',
    'padding-left': '14px', 'padding-right': '14px',
  } });
  // Sin interlínea 1 y sin margen el párrafo inflaba la píldora a 50 de alto.
  R('h-wa-texto', 'typography', { role: 'rotulo', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.69px', lineHeight: 1 });
  R('h-wa-sin-margen', 'properties', { declarations: {
    'margin-block-start': '0px', 'margin-block-end': '0px',
  } });
  R('h-wa-blanco', 'color', { role: 'rotulo', color: BLANCO, apply: 'text' });

  const nodes = [{
    id: 'encabezado', marker: 'encabezado', kind: 'header', ruleIds: ['h-aire', 'h-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['h-barra'], children: [
        { id: id('g'), kind: 'group', ruleIds: [], children: [] },
        { id: id('g'), kind: 'group', ruleIds: ['h-centrado'], children: [
          { id: id('i'), kind: 'image', ruleIds: ['h-logo'],
            content: { assetUrl: f.logoHorizontal, alt: 'Econut · procesos, productos, perspectiva' } },
        ] },
        { id: id('g'), kind: 'group', ruleIds: ['h-wa-lado'], children: [
          // Las cuentas oficiales, siempre a la vista. Acá van sin el nombre
          // —el encabezado no da para tanto— y el nombre completo está en el
          // pie. Lo que importa de este par es que existan y se vean: desde
          // cualquier página se llega a la cuenta verdadera en un clic.
          ...Object.entries(REDES).map(([red, d]) => ({
            id: id('s'), kind: 'social', ruleIds: [], content: {
              network: red, url: d.url,
              size: 30, iconPadding: 7, iconColor: VERDE,
              backgroundColor: 'transparent', borderRadius: '999px',
            },
          })),
          // La píldora de WhatsApp sólo se compone si hay número configurado.
          // Sin él, el plugin omite el icono —bien, un botón que no lleva a
          // ninguna parte es peor que nada— pero el envoltorio y la palabra
          // «WhatsApp» quedaban igual, sueltos y sin sentido.
          //
          // Para activarla: guardar el número en Configuración y poner acá
          // HAY_WHATSAPP en true. Está en dos pasos a propósito: el número lo
          // pone quien administra el sitio, y esto se recompone después.
          ...(HAY_WHATSAPP ? [{ id: id('g'), kind: 'group', ruleIds: ['h-wa-pildora'], children: [
            { id: id('w'), kind: 'whatsapp', ruleIds: [], content: {
              message: 'Hola, quiero más información sobre los servicios de Econut.',
              ariaLabel: 'Escribir a Econut por WhatsApp',
              // La primitiva no baja de 24, así que el dibujo de 18 que usa
              // Santa Luisa se consigue con 24 menos 3 de relleno por lado.
              size: 24, iconPadding: 3, iconColor: BLANCO, backgroundColor: 'transparent', borderRadius: '0px',
            } },
            { id: id('p'), kind: 'paragraph', ruleIds: ['h-wa-texto', 'h-wa-blanco', 'h-wa-sin-margen'], content: { text: 'WhatsApp' } },
          ] }] : []),
        ] },
      ],
    }],
  }];

  writeFileSync('region-header.json', JSON.stringify({
    pageId: 0,
    documentId: 'cod-region-header',
    expectedRevision: Number(process.env.REV_HEADER || 0),
    design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
    composition: { schemaVersion: 2, nodes },
  }, null, 2));
  console.log('region-header.json  · reglas:', reglas.length);
}

// ----------------------------------------------------------------------- pie
{
  const { reglas, R } = hacerReglas();
  // El pie del original no es negro: es el verde de la marca, #2E594A. Y mide
  // 120px de alto con el logotipo a la izquierda, así que el aire es poco.
  R('p-superficie', 'surface', { backgroundColor: '#2E594A', foregroundColor: BLANCO });
  R('p-aire', 'spacing', { paddingBlock: '10px', paddingInline: '24px' });
  R('p-barra', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': '74px minmax(0, 1fr) 220px 200px', 'column-gap': '40px',
    'align-items': 'center', 'max-width': '1080px', 'margin-inline-start': 'auto', 'margin-inline-end': 'auto', width: '100%',
  } });
  // En el original el logotipo del pie mide 74x60, no 140 de ancho.
  R('p-logo', 'properties', { declarations: { width: '74px', 'max-width': '74px' } });
  // El crédito de quien hizo el sitio, a la derecha del todo, como el original.
  R('p-credito', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) 71px', 'column-gap': '12px',
    'align-items': 'center', 'justify-items': 'end',
  } });
  R('p-credito-texto', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4, align: 'end' });
  R('p-credito-logo', 'properties', { declarations: { width: '71px', 'max-width': '71px' } });
  // Las cuentas, en columna y con el nombre a la vista. En vertical y no en
  // fila porque lo que hay que poder leer es el nombre completo, no el icono:
  // el icono dice «hay Instagram», el nombre dice CUÁL.
  R('p-redes', 'properties', { declarations: {
    display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start', gap: '6px',
  } });
  // En pantallas angostas el pie NO puede seguir repartido en cuatro columnas:
  // a la dirección le quedaban 91px y se cortaba a tres palabras por línea.
  // Se apila, y todo se alinea a la izquierda para que se lea de corrido.
  // OJO: hacen falta las dos, móvil Y tablet. El escalón móvil del plugin
  // llega hasta 767, y un iPad vertical mide justo 768: por un píxel se queda
  // con la disposición de escritorio y la dirección vuelve a 91px de ancho.
  for (const bp of ['mobile', 'tablet']) {
    R(`p-barra-${bp}`, 'properties', { declarations: {
      'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '18px', 'justify-items': 'start',
    } }, { bp });
    R(`p-texto-${bp}`, 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4, align: 'start' }, { bp });
  }
  R('p-red-item', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4 });
  // 12px con interlínea 1.4: en el original las tres líneas de la dirección
  // caben en 50px de alto, y con 13/1.6 ocupaban 71.
  R('p-texto', 'typography', { role: 'pie', fontSize: '12px', lineHeight: 1.4, align: 'end' });
  R('p-columna', 'properties', { declarations: {
    display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)', 'row-gap': '0px', 'justify-items': 'end',
  } });

  // ------------------------------------------------------------- el mapa
  //
  // El cuadradito junto a la dirección. Cerrado funciona como un ICONO, no
  // como un mapa: se ve Chile entero y se entiende de qué va sin tener que
  // leerlo. Al pincharlo despliega el mapa grande sobre la planta de Paine.
  //
  // La imagen del mini es un archivo del sitio, generado UNA vez con
  // `scripts/generar-mini-mapa.mjs`. Por eso el mini no le pide nada a
  // Mapbox: se ve sin red hacia afuera, sin consumir cuota y —lo que importa
  // esta semana— sin entrar en el consentimiento de cookies. El mapa grande
  // sí usa Mapbox, y sólo se descarga cuando alguien lo abre.
  //
  // La CLAVE no va acá: vive en Configuración → Mapa, y el plugin la inyecta
  // al mostrar la página. Así cambiarla llega a todas sin recomponer, y no
  // queda escrita en el documento.
  R('p-mapa', 'interaction', { behavior: 'mapa' });
  // La dirección va DENTRO del grupo del mapa, no al lado: así la conducta
  // está pensada, y es lo que permite que al abrirse el mapa grande baje a su
  // propia línea mientras la dirección se queda donde estaba.
  //
  // `flex` con `flex-wrap`, porque el `.cod-group` base es una grilla y en una
  // grilla el mini y la dirección no se ponen uno al lado del otro. El salto
  // de línea del mapa grande lo da su propio `flex-basis:100%`.
  R('p-mapa-grupo', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center',
    gap: '12px', 'justify-content': 'flex-end',
    // El tope del mapa abierto. Lo pone el sitio y no el plugin: es la medida
    // del contenido del pie, los mismos 1080 que mide la barra de arriba.
    'max-width': '1080px',
  } });
  for (const bp of ['mobile', 'tablet']) {
    R(`p-mapa-grupo-${bp}`, 'properties', { declarations: { 'justify-content': 'flex-start' } }, { bp });
  }

  // -------------------------------------------------------- la línea legal
  //
  // Esto NO está en econut.cl, y es una de las pocas cosas que se agregan a
  // propósito en vez de copiarse. El original no tiene página de privacidad ni
  // enlace legal en ninguna parte —comprobado recorriendo el sitio, no
  // supuesto—, y eso es justamente una de las cosas que no cumple: la Ley
  // 21.719 exige una política enlazada desde el sitio, y exige poder CAMBIAR
  // el consentimiento, no sólo darlo.
  //
  // Son dos piezas distintas y por eso no son dos enlaces iguales:
  //
  //  - «Términos y privacidad» es un enlace normal: lleva a esa página.
  //  - «Preferencias de cookies» lleva TAMBIÉN a esa página, y encima declara
  //    la conducta `preferencias-cookies` del plugin, que le quita el salto al
  //    clic y reabre el panel del banner. El destino no es relleno: sin
  //    JavaScript no hay panel que reabrir, y entonces el enlace lleva a la
  //    página que explica las cookies, que es lo segundo mejor. Primero algo
  //    que funciona, y encima lo mejor.
  R('p-legal-barra', 'properties', { declarations: {
    display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'center',
    gap: '10px', 'max-width': '1080px',
    'margin-inline-start': 'auto', 'margin-inline-end': 'auto',
    'margin-block-start': '10px', 'padding-block-start': '10px', width: '100%',
    // Una línea de un píxel para separarla de la barra de arriba sin meter un
    // elemento más. El blanco a un 18% sobre el verde da una raya que se
    // insinúa y no compite con nada.
    //
    // En tres partes y no como `border-top`: el plugin rechaza las abreviadas
    // porque GrapesJS las descarta en silencio al guardar.
    'border-top-width': '1px',
    'border-top-style': 'solid',
    'border-top-color': 'rgba(255, 255, 255, 0.18)',
  } });
  R('p-legal-texto', 'typography', { role: 'pie', fontSize: '11px', lineHeight: 1.4 });
  // El separador va más apagado que los dos rótulos: es puntuación, no texto.
  R('p-legal-punto', 'typography', { role: 'pie', fontSize: '11px', lineHeight: 1.4 });
  R('p-legal-punto-color', 'properties', { declarations: { opacity: '0.5' } });
  R('p-preferencias', 'interaction', { behavior: 'preferencias-cookies' });

  const nodes = [{
    id: 'pie', marker: 'pie', kind: 'footer', ruleIds: ['p-aire', 'p-superficie'],
    children: [{
      id: id('g'), kind: 'group', ruleIds: ['p-barra', 'p-barra-mobile', 'p-barra-tablet'], children: [
        { id: id('i'), kind: 'image', ruleIds: ['p-logo'], content: { assetUrl: f.logoCalado, alt: 'Econut' } },
        {
            id: id('g'), kind: 'group',
            ruleIds: ['p-mapa', 'p-mapa-grupo', 'p-mapa-grupo-mobile', 'p-mapa-grupo-tablet'],
            content: {
              lat: -33.804136, lng: -70.681617, zoom: 17,
              mini: MINI_MAPA,
              etiqueta: 'Ver en el mapa dónde está la planta de Econut, en Paine',
              marcador: PIN,
              // El texto del globo, como en el código del sitio publicado:
              // «Planta Econut» y la dirección. Allá va en varias líneas con
              // <br>; acá el globo es texto plano a propósito —se arma con
              // textContent y no con setHTML— así que va de corrido.
              globo: 'Planta Econut · Av 18 de Septiembre sn Hijuela 2, Fundo San Rafael - Sector Nuevo Sendero, Paine, Región Metropolitana',
              globoEnlaceTexto: 'www.econut.cl',
              globoEnlaceHref: 'https://www.econut.cl',
            },
            children: [
              { id: id('g'), kind: 'group', ruleIds: ['p-columna'], children: [
                // La dirección, copiada literal del pie de econut.cl. La que
                // había acá —«Ruta 78 de Septiembre s/n, Parcela 3 /
                // Rinconada de Doñihue, Región del Libertador»— era otra
                // calle, otra comuna y otra región.
                { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto', 'p-texto-mobile', 'p-texto-tablet'], content: { text: 'Av 18 de Septiembre sn Hijuela 2' } },
                { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto', 'p-texto-mobile', 'p-texto-tablet'], content: { text: 'Fundo San Rafael - Sector Nuevo Sendero,' } },
                { id: id('p'), kind: 'paragraph', ruleIds: ['p-texto', 'p-texto-mobile', 'p-texto-tablet'], content: { text: 'Paine, Región Metropolitana' } },
              ] },
            ],
          },
        // Las cuentas oficiales, CON el nombre escrito. Acá el nombre importa
        // más que el icono: es lo que una persona puede comparar letra por
        // letra con la cuenta que le escribió. Hay estafadores vendiendo a
        // nombre de Econut, y hasta ahora el sitio no daba con qué comprobar.
        { id: id('g'), kind: 'group', ruleIds: ['p-redes'], children: [
          ...Object.entries(REDES).map(([red, d]) => ({
            id: id('s'), kind: 'social', ruleIds: ['p-red-item'], content: {
              network: red, url: d.url, handle: d.handle,
              size: 28, iconPadding: 6, iconColor: BLANCO,
              backgroundColor: 'transparent', borderRadius: '999px',
            },
          })),
        ] },
        { id: id('g'), kind: 'group', ruleIds: ['p-credito'], children: [
          { id: id('p'), kind: 'paragraph', ruleIds: ['p-credito-texto'], content: { text: 'Diseño y desarrollo' } },
          { id: id('i'), kind: 'image', ruleIds: ['p-credito-logo'], content: { assetUrl: f.logoAltfx, alt: 'Altfx' } },
        ] },
      ],
    }, {
      id: id('g'), kind: 'group', ruleIds: ['p-legal-barra'], children: [
        { id: id('l'), kind: 'link', ruleIds: ['p-legal-texto'], content: {
          label: 'Términos y privacidad', href: LEGAL,
        } },
        { id: id('p'), kind: 'paragraph', ruleIds: ['p-legal-punto', 'p-legal-punto-color'], content: { text: '·' } },
        { id: id('l'), kind: 'link', ruleIds: ['p-legal-texto', 'p-preferencias'], content: {
          label: 'Preferencias de cookies', href: LEGAL,
        } },
      ],
    }],
  }];

  writeFileSync('region-footer.json', JSON.stringify({
    pageId: 0,
    documentId: 'cod-region-footer',
    expectedRevision: Number(process.env.REV_FOOTER || 0),
    design: { schemaVersion: 1, designId: 'econut-web', expectedDesignRevision: 2, reviewState: 'session', rules: reglas },
    composition: { schemaVersion: 2, nodes },
  }, null, 2));
  console.log('region-footer.json  · reglas:', reglas.length);
}
