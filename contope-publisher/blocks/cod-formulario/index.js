/**
 * Bloque contope/formulario, lado editor.
 *
 * El formulario de verdad lo arma el runtime de Orugantt Forms en la página
 * publicada; dentro del editor se ve un marcador con el nombre del formulario
 * elegido. La lista de formularios publicados la entrega el servidor
 * (window.codBloques.formularios), y el diseño no se toca acá: sale del tema.
 *
 * Sin compilación: JavaScript plano con wp.element.
 */
(function () {
	'use strict';

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var registerBlockType = wp.blocks.registerBlockType;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;
	var SelectControl = wp.components.SelectControl;
	var Notice = wp.components.Notice;

	var datos = function () { return window.codBloques || {}; };

	registerBlockType('contope/formulario', {
		edit: function (props) {
			var a = props.attributes;
			var set = props.setAttributes;
			var lista = datos().formularios || [];
			var activo = datos().formulariosActivo !== false;
			var blockProps = useBlockProps({ className: 'cod-formulario-editor' });

			var elegido = null;
			lista.forEach(function (f) { if (f.slug === a.formSlug) { elegido = f; } });

			// Si el formulario guardado ya no está publicado, igual se conserva como opción
			// para que no se pierda en silencio al abrir el bloque.
			var opciones = [{ label: 'Elige un formulario…', value: '' }].concat(lista.map(function (f) {
				return { label: f.title + ' (' + f.slug + ')', value: f.slug };
			}));
			if (a.formSlug && !elegido) {
				opciones.push({ label: a.formSlug + ' (no publicado)', value: a.formSlug });
			}

			var aviso = !activo
				? el(Notice, { status: 'warning', isDismissible: false }, 'Orugantt Forms no está activo en este sitio: el formulario no se mostrará.')
				: (a.formSlug && !elegido
					? el(Notice, { status: 'warning', isDismissible: false }, 'Este formulario no está publicado: en la página aparecerá como «no disponible».')
					: null);

			return el(Fragment, null,
				el(InspectorControls, null,
					el(PanelBody, { title: 'Formulario', initialOpen: true },
						aviso,
						el(SelectControl, {
							label: 'Formulario',
							value: a.formSlug,
							options: opciones,
							onChange: function (v) { set({ formSlug: v }); }
						}),
						el('p', null, 'El diseño del formulario sale del tema (colores, letra, esquinas): no se cambia desde aquí.'))),
				el('div', blockProps,
					el('p', { className: 'cod-formulario-editor__titulo' }, elegido ? elegido.title : 'Formulario'),
					el('p', { className: 'cod-formulario-editor__detalle' },
						a.formSlug
							? 'Formulario «' + a.formSlug + '». Se muestra completo en la página publicada.'
							: 'Elige un formulario en el panel de la derecha.')));
		},
		save: function () {
			// Dinámico: lo dibuja el servidor llamando al plugin de formularios.
			return null;
		}
	});
})();
