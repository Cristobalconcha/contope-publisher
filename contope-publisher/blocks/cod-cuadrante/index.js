/**
 * Bloque contope/cuadrante, lado editor.
 *
 * El contenido va SIN restringir, y esto es lo importante del bloque.
 *
 * La primera versión dejaba cada cuadrante clavado a imagen + título +
 * párrafo, bloqueado. Cristóbal lo paró a tiempo: «hay que tener cuidado que
 * no llevemos todo a textos, títulos y fotos». Tenía razón — con eso, un
 * cuadrante que mañana necesite un vídeo, una lista o una tabla no se puede
 * hacer, y el módulo deja de servir para lo que no se previó el primer día.
 *
 * El patrón es el de WordPress con `core/tab-panel`: la unidad tiene identidad
 * propia y su contenido es libre. Lo único que se ofrece es un punto de
 * partida —una imagen, un título y un texto— que se puede cambiar entero.
 */
(function () {
	'use strict';

	var el = wp.element.createElement;
	var registerBlockType = wp.blocks.registerBlockType;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var useInnerBlocksProps = wp.blockEditor.useInnerBlocksProps;
	var InnerBlocks = wp.blockEditor.InnerBlocks;

	registerBlockType('contope/cuadrante', {
		edit: function () {
			var blockProps = useBlockProps({ className: 'cod-cuadrante-editor' });
			var innerProps = useInnerBlocksProps(blockProps, {
				// Punto de partida, NO contrato: se puede borrar, reordenar y
				// poner cualquier otro bloque. Lo único que el módulo necesita
				// es que haya una imagen (o un vídeo) y algo de texto; eso no
				// se fuerza acá sino que se avisa en la descripción, porque un
				// bloqueo convertiría el módulo en un formulario.
				template: [
					['core/image', {}],
					['core/heading', { level: 3 }],
					['core/paragraph', {}]
				],
				templateLock: false
			});

			return el('div', innerProps);
		},
		save: function () {
			return el(InnerBlocks.Content);
		}
	});
})();
