/**
 * Bloque contope/whatsapp, lado editor.
 *
 * El bloque se ve en el editor como se verá en el sitio: la raíz es el propio
 * enlace (con las clases del botón de WordPress), así que los soportes de
 * bloque —color, letra, relleno, borde— se aplican al mismo elemento que en la
 * página publicada. No se pide nada al servidor: el dibujo es el mismo y no
 * cuesta una vuelta de red por cada cambio.
 *
 * El número no se edita acá: es un ajuste del sitio. Si falta, el editor lo
 * dice y lleva a donde se guarda.
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
	var RichText = wp.blockEditor.RichText;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var TextareaControl = wp.components.TextareaControl;
	var SelectControl = wp.components.SelectControl;
	var ToggleControl = wp.components.ToggleControl;
	var Notice = wp.components.Notice;

	var TRAZO_MONO = 'M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.7L3 29l7-2.1c1.9 1 4 1.6 6 1.6 7 0 12.7-5.6 12.7-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.2 1.2 1.2-4-.3-.4a10.2 10.2 0 0 1-1.6-5.4C5.4 9.7 10.1 5 16 5s10.6 4.7 10.6 10.5S21.9 25.7 16 25.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-2.6-1.6 9.7 9.7 0 0 1-1.8-2.2c-.2-.3 0-.5.1-.7l.5-.6.3-.5a.6.6 0 0 0 0-.5c-.1-.2-.7-1.7-1-2.3s-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.7c0 1.6 1.2 3.1 1.3 3.3.2.2 2.3 3.6 5.7 5a19.6 19.6 0 0 0 1.9.7 4.6 4.6 0 0 0 2.1.1c.6-.1 1.9-.8 2.2-1.5s.3-1.4.2-1.5-.3-.2-.6-.4z';

	/* El mismo dibujo que arma el servidor (COD_Block_Whatsapp::icono). Los colores del
	   logotipo son los de la marca de WhatsApp, no del sitio. */
	function icono(estilo) {
		if (estilo === 'logo') {
			return el('svg', { className: 'cod-whatsapp__icono', viewBox: '0 0 175.216 175.552', 'aria-hidden': 'true', focusable: 'false' },
				el('defs', null,
					el('linearGradient', { id: 'cod-wa-logo-editor', x1: '85.915', x2: '86.535', y1: '32.567', y2: '137.092', gradientUnits: 'userSpaceOnUse' },
						el('stop', { offset: '0', stopColor: '#57d163' }),
						el('stop', { offset: '1', stopColor: '#23b33a' }))),
				el('path', { fill: 'currentColor', d: 'm12.966 161.238 10.439-38.114a73.42 73.42 0 0 1-9.821-36.772c.017-40.556 33.021-73.55 73.578-73.55 19.681.01 38.154 7.669 52.047 21.572s21.537 32.383 21.53 52.037c-.018 40.553-33.027 73.553-73.578 73.553h-.032c-12.313-.005-24.412-3.094-35.159-8.954z' }),
				el('path', { fill: 'url(#cod-wa-logo-editor)', d: 'M87.184 25.227c-33.733 0-61.166 27.423-61.178 61.13a60.98 60.98 0 0 0 9.349 32.535l1.455 2.313-6.179 22.558 23.146-6.069 2.235 1.324c9.387 5.571 20.15 8.517 31.126 8.523h.023c33.707 0 61.14-27.426 61.153-61.135a60.75 60.75 0 0 0-17.895-43.251 60.75 60.75 0 0 0-43.235-17.928z' }),
				el('path', { fill: 'currentColor', fillRule: 'evenodd', d: 'M68.772 55.603c-1.378-3.061-2.828-3.123-4.137-3.176l-3.524-.043c-1.226 0-3.218.46-4.902 2.3s-6.435 6.287-6.435 15.332 6.588 17.785 7.506 19.013 12.718 20.381 31.405 27.75c15.529 6.124 18.689 4.906 22.061 4.6s10.877-4.447 12.408-8.74 1.532-7.971 1.073-8.74-1.685-1.226-3.525-2.146-10.877-5.367-12.562-5.981-2.91-.919-4.137.921-4.746 5.979-5.819 7.206-2.144 1.381-3.984.462-7.76-2.861-14.784-9.124c-5.465-4.873-9.154-10.891-10.228-12.73s-.114-2.835.808-3.751c.825-.824 1.838-2.147 2.759-3.22s1.224-1.84 1.836-3.065.307-2.301-.153-3.22-4.032-10.011-5.666-13.647' }));
		}
		return el('svg', { className: 'cod-whatsapp__icono', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' },
			el('path', { fill: 'currentColor', d: TRAZO_MONO }));
	}

	var datos = function () { return window.codBloques || {}; };

	registerBlockType('contope/whatsapp', {
		edit: function (props) {
			var a = props.attributes;
			var set = props.setAttributes;
			var sinTexto = !a.text;
			var clases = 'wp-block-button__link wp-element-button' + (sinTexto ? ' is-solo-icono' : '');
			// El enlace es la raíz del bloque: en el editor no se navega.
			var blockProps = useBlockProps({
				className: clases,
				href: '#',
				onClick: function (e) { e.preventDefault(); }
			});

			var aviso = datos().whatsappNumero === false
				? el(Notice, { status: 'warning', isDismissible: false },
					'Falta el número de WhatsApp del sitio. ',
					el('a', { href: datos().ajustesUrl || '#', target: '_blank', rel: 'noopener' }, 'Guárdalo en Configuración → WhatsApp.'))
				: null;

			return el(Fragment, null,
				el(InspectorControls, null,
					el(PanelBody, { title: 'Botón de WhatsApp', initialOpen: true },
						aviso,
						el(TextControl, {
							label: 'Texto del botón (opcional)',
							help: 'Vacío: sólo el ícono.',
							value: a.text,
							onChange: function (v) { set({ text: v }); }
						}),
						el(TextareaControl, {
							label: 'Mensaje inicial',
							help: 'Lo que aparece escrito al abrir WhatsApp. Puede tener varias líneas.',
							value: a.mensaje,
							rows: 4,
							onChange: function (v) { set({ mensaje: v }); }
						}),
						el(TextControl, {
							label: 'Etiqueta para lectores de pantalla',
							help: 'Vacío: «Contactar por WhatsApp» (o el texto del botón).',
							value: a.ariaLabel,
							onChange: function (v) { set({ ariaLabel: v }); }
						}),
						el(SelectControl, {
							label: 'Ícono',
							value: a.iconStyle,
							options: [
								{ label: 'Un solo color (toma el del botón)', value: 'mono' },
								{ label: 'Logotipo de WhatsApp', value: 'logo' }
							],
							onChange: function (v) { set({ iconStyle: v }); }
						})),
					el(PanelBody, { title: 'Posición', initialOpen: false },
						el(ToggleControl, {
							label: 'Fijo en una esquina de la pantalla',
							help: 'En el editor no se fija, para no tapar el contenido.',
							checked: !!a.fijo,
							onChange: function (v) { set({ fijo: v }); }
						}),
						a.fijo ? el(SelectControl, {
							label: 'Esquina',
							value: a.posicion,
							options: [
								{ label: 'Abajo a la derecha', value: 'derecha' },
								{ label: 'Abajo a la izquierda', value: 'izquierda' }
							],
							onChange: function (v) { set({ posicion: v }); }
						}) : null)),
				el('a', blockProps,
					icono(a.iconStyle),
					el(RichText, {
						tagName: 'span',
						className: 'cod-whatsapp__texto',
						value: a.text,
						onChange: function (v) { set({ text: v }); },
						allowedFormats: [],
						placeholder: 'Texto',
						withoutInteractiveFormatting: true
					})));
		},
		save: function () {
			// Dinámico: lo dibuja el servidor, que es quien sabe el número.
			return null;
		}
	});
})();
