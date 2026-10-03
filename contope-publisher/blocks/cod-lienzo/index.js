/**
 * Bloque contope/lienzo, lado editor.
 *
 * No dibuja nada propio: es un contenedor. Lo que hace en el editor de
 * WordPress es dejar escribir dentro con todas las herramientas de siempre
 * —títulos, párrafos, imágenes, listas, tablas— y recordar de qué documento de
 * ContOpe sale la forma.
 *
 * LA DISPOSICIÓN ES DE LA PÁGINA, NO DE CADA BLOQUE. El 3 de octubre de 2026,
 * mirando la página de términos ya hecha de bloques, Cristóbal señaló lo que
 * faltaba: «el body tiene reglas generales que son de la página: si es líquida
 * o no, y el ancho máximo. Esto no tiene límites ni márgenes». Tenía razón —el
 * texto iba de borde a borde de la pantalla—.
 *
 * Y no hubo que inventar esas medidas: el tema YA las declara en su theme.json
 * (`contentSize: 1180px`, `wideSize: 1360px`). Lo que faltaba era que este
 * bloque le dijera a WordPress que tiene disposición, con `supports.layout`.
 * Con eso WordPress centra el contenido en el ancho del tema solo, y cada
 * bloque de dentro puede salirse a «ancho» o «completo» cuando se quiera —que
 * es, en WordPress, la forma de decir si una pieza es líquida o no—.
 *
 * Sin compilación: JavaScript plano con wp.element, igual que ocd/heading.
 */
(function () {
	'use strict';

	var el = wp.element.createElement;
	var registerBlockType = wp.blocks.registerBlockType;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var useInnerBlocksProps = wp.blockEditor.useInnerBlocksProps;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;

	registerBlockType('contope/lienzo', {
		edit: function (props) {
			var blockProps = useBlockProps({ className: 'cod-canvas-editor' });
			var innerProps = useInnerBlocksProps(blockProps, {
				// Sin lista de bloques permitidos: el contenido es de
				// WordPress y no nos toca a nosotros decidir qué se puede
				// escribir en una página.
				templateLock: false
			});

			return el(
				wp.element.Fragment,
				null,
				el(
					InspectorControls,
					null,
					el(
						PanelBody,
						{ title: 'ContOpe', initialOpen: true },
						el('p', null,
							'Este contenido se edita acá. La forma —tipografías, colores, ' +
							'disposición— se la da ContOpe desde el editor visual.'
						),
						el('p', null,
							'El ancho de la página y si es líquida se controlan en ' +
							'«Diseño», más abajo en este mismo panel.'
						),
						props.attributes.documentId
							? el('p', { style: { opacity: 0.7, fontSize: '12px' } }, props.attributes.documentId)
							: null
					)
				),
				el('div', innerProps)
			);
		},
		save: function () {
			// Dinámico: el HTML del front lo arma render.php. Pero los bloques
			// de dentro sí se guardan, que es justo lo que queremos: el
			// contenido vive en post_content, en bloques de WordPress.
			return el(wp.blockEditor.InnerBlocks.Content);
		}
	});
})();
