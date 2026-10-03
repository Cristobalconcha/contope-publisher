/**
 * Bloque contope/lienzo, lado editor.
 *
 * No dibuja nada propio: es un contenedor. Lo único que hace en el editor de
 * WordPress es dejar escribir dentro con todas las herramientas de siempre
 * —títulos, párrafos, imágenes, listas, tablas— y recordar de qué documento de
 * ContOpe sale la forma.
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
