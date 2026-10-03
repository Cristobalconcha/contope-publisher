/**
 * Bloque contope/cuadrantes, lado editor.
 *
 * En el editor de WordPress se ve APILADO y editable: cuatro grupos, cada uno
 * con su foto, su título y su texto, como cualquier otro contenido. Eso es a
 * propósito. La cuadrícula, el botón encima de cada foto y el panel que se
 * abre los arma el runtime al mostrar la página, y montarlos acá dejaría
 * textos ocultos que no se pueden seleccionar y botones encima de las fotos
 * que impedirían editarlas.
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

	// Un cuadrante: la foto primero —el runtime busca el medio para saber cuál
	// es la celda— y después el título y el texto.
	function cuadrante(titulo) {
		return ['core/group', { className: 'cod-cuadrante' }, [
			['core/image', {}],
			['core/heading', { level: 3, placeholder: titulo }],
			['core/paragraph', { placeholder: 'El texto que se abre al pinchar la foto…' }]
		]];
	}

	registerBlockType('contope/cuadrantes', {
		edit: function () {
			var blockProps = useBlockProps({ className: 'cod-cuadrantes-editor' });
			var innerProps = useInnerBlocksProps(blockProps, {
				// Exactamente cuatro, y no se pueden quitar ni agregar: el
				// módulo es una cuadrícula de 2x2 y con otro número el runtime
				// no monta nada. Más vale que el editor no deje llegar ahí.
				template: [
					cuadrante('Primer cuadrante'),
					cuadrante('Segundo cuadrante'),
					cuadrante('Tercer cuadrante'),
					cuadrante('Cuarto cuadrante')
				],
				templateLock: 'all',
				allowedBlocks: ['core/group']
			});

			return el('div', innerProps);
		},
		save: function () {
			return el(InnerBlocks.Content);
		}
	});
})();
