/**
 * Bloque contope/cuadrantes, lado editor.
 *
 * Tres niveles, como los hace WordPress con las pestañas:
 *
 *   contope/cuadrantes    el módulo (la conducta: la cuadrícula que se abre)
 *     contope/cuadrante   la unidad, con identidad propia
 *       cualquier bloque  el contenido, libre
 *
 * Esto es una corrección. La primera versión tenía dos niveles y metía los
 * contenidos directo como `core/group` con un contenido clavado a imagen,
 * título y párrafo. Cristóbal lo paró: «hay que tener cuidado que no llevemos
 * todo a textos, títulos y fotos». El patrón bueno estaba a la vista en el
 * propio WordPress —`core/tab-panel` tiene identidad y acepta cualquier cosa
 * dentro— y es el que se sigue acá.
 *
 * En el editor de WordPress el módulo se ve APILADO y editable: cuatro
 * cuadrantes uno debajo del otro. La cuadrícula, el botón sobre cada foto y el
 * panel que se abre los arma el runtime al mostrar la página. Montarlos acá
 * dejaría textos ocultos que no se pueden seleccionar y botones encima de las
 * fotos que impedirían editarlas.
 *
 * Sin compilación: JavaScript plano con wp.element.
 */
(function () {
	'use strict';

	var el = wp.element.createElement;
	var registerBlockType = wp.blocks.registerBlockType;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var useInnerBlocksProps = wp.blockEditor.useInnerBlocksProps;
	var InnerBlocks = wp.blockEditor.InnerBlocks;

	registerBlockType('contope/cuadrantes', {
		edit: function () {
			var blockProps = useBlockProps({ className: 'cod-cuadrantes-editor' });
			var innerProps = useInnerBlocksProps(blockProps, {
				// Cuatro, ni más ni menos: es una cuadrícula de 2x2 y con otro
				// número el runtime no monta nada. Lo que se bloquea es la
				// CANTIDAD, no el contenido de cada uno: dentro de cada
				// cuadrante se puede poner lo que sea.
				template: [
					['contope/cuadrante'],
					['contope/cuadrante'],
					['contope/cuadrante'],
					['contope/cuadrante']
				],
				templateLock: 'all',
				allowedBlocks: ['contope/cuadrante']
			});

			return el('div', innerProps);
		},
		save: function () {
			return el(InnerBlocks.Content);
		}
	});
})();
