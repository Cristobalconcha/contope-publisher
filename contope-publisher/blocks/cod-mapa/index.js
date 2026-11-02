/**
 * Bloque contope/mapa, lado editor.
 *
 * El mapa de verdad (Mapbox GL) lo monta el runtime de la conducta «mapa» al
 * mostrar la página, y a propósito no corre dentro del editor: descargaría unos
 * 700 KB de un tercero por cada bloque y gastaría cuota de la clave sólo por
 * editar. Acá se ve una vista previa con los datos que importan —dónde cae, a
 * qué acercamiento, qué alto— y los controles para cambiarlos.
 *
 * La clave de Mapbox NO se pide acá: vive en Configuración → «Mapa (Mapbox)» y
 * nunca queda escrita en el contenido de la página.
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
	var MediaUpload = wp.blockEditor.MediaUpload;
	var MediaUploadCheck = wp.blockEditor.MediaUploadCheck;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var TextareaControl = wp.components.TextareaControl;
	var RangeControl = wp.components.RangeControl;
	var ToggleControl = wp.components.ToggleControl;
	var Button = wp.components.Button;
	var Notice = wp.components.Notice;

	var datos = function () { return window.codBloques || {}; };

	/* Una coordenada escrita por una persona: vacío = sin valor; fuera de rango = se ignora. */
	function numeroEnRango(texto, min, max) {
		if (texto === '' || texto === null || texto === undefined) { return undefined; }
		var n = parseFloat(String(texto).replace(',', '.'));
		return isFinite(n) && n >= min && n <= max ? n : undefined;
	}

	/* Un campo numérico que conserva lo que se está escribiendo («-33.» no es todavía -33). */
	function CampoNumero(p) {
		var estado = wp.element.useState(p.value === undefined || p.value === null ? '' : String(p.value));
		return el(TextControl, {
			label: p.label,
			help: p.help,
			value: estado[0],
			onChange: function (v) {
				estado[1](v);
				p.onChange(numeroEnRango(v, p.min, p.max));
			}
		});
	}

	function selectorDeImagen(etiqueta, valor, alElegir, alQuitar) {
		return el(MediaUploadCheck, null,
			el('div', { className: 'cod-mapa-editor__imagen' },
				el(MediaUpload, {
					allowedTypes: ['image'],
					onSelect: function (media) { alElegir(media && media.url ? media.url : ''); },
					render: function (p) {
						return el(Button, { variant: 'secondary', onClick: p.open }, valor ? 'Cambiar ' + etiqueta : 'Elegir ' + etiqueta);
					}
				}),
				valor ? el(Button, { variant: 'link', isDestructive: true, onClick: alQuitar }, 'Quitar') : null));
	}

	registerBlockType('contope/mapa', {
		edit: function (props) {
			var a = props.attributes;
			var set = props.setAttributes;
			var blockProps = useBlockProps({ className: 'cod-mapa-editor' });
			var hayUbicacion = typeof a.lat === 'number' && typeof a.lng === 'number';
			var sinClave = datos().mapaClave === false;

			var controles = el(InspectorControls, null,
				el(PanelBody, { title: 'Ubicación', initialOpen: true },
					sinClave ? el(Notice, { status: 'warning', isDismissible: false },
						'Falta la clave pública de Mapbox: sin ella la página muestra sólo el enlace «cómo llegar». ',
						el('a', { href: datos().ajustesUrl || '#', target: '_blank', rel: 'noopener' }, 'Guárdala en Configuración → Mapa (Mapbox).')) : null,
					el(CampoNumero, {
						label: 'Latitud',
						help: 'Entre -90 y 90. Por ejemplo -33.8041',
						value: a.lat,
						min: -90,
						max: 90,
						onChange: function (v) { set({ lat: v }); }
					}),
					el(CampoNumero, {
						label: 'Longitud',
						help: 'Entre -180 y 180. Por ejemplo -70.6816',
						value: a.lng,
						min: -180,
						max: 180,
						onChange: function (v) { set({ lng: v }); }
					}),
					el(RangeControl, {
						label: 'Acercamiento',
						help: '0 es el mundo entero; 17 es una calle.',
						value: a.zoom,
						min: 0,
						max: 22,
						step: 1,
						onChange: function (v) { set({ zoom: v === undefined ? 15 : v }); }
					}),
					el(RangeControl, {
						label: 'Alto del mapa (px)',
						value: a.alto,
						min: 120,
						max: 1200,
						step: 10,
						onChange: function (v) { set({ alto: v === undefined ? 400 : v }); }
					})),
				el(PanelBody, { title: 'Marcador y globo', initialOpen: false },
					el(TextareaControl, {
						label: 'Texto del globo',
						help: 'Se muestra sobre el marcador. Texto plano.',
						value: a.globo,
						rows: 3,
						onChange: function (v) { set({ globo: v }); }
					}),
					el('p', null, 'Imagen del marcador (opcional)'),
					selectorDeImagen('imagen del marcador', a.marcador,
						function (url) { set({ marcador: url }); },
						function () { set({ marcador: '' }); })),
				el(PanelBody, { title: 'Mapa cerrado y respaldo', initialOpen: false },
					el(ToggleControl, {
						label: 'Mapa abierto siempre',
						help: a.mini ? 'Apagado: se ve la imagen y el mapa se abre al pincharla.' : 'Sin imagen de respaldo, el mapa queda siempre abierto.',
						checked: !!a.fijo || !a.mini,
						disabled: !a.mini,
						onChange: function (v) { set({ fijo: v }); }
					}),
					el('p', null, 'Imagen de respaldo (opcional)'),
					selectorDeImagen('imagen', a.mini,
						function (url) { set({ mini: url }); },
						function () { set({ mini: '', fijo: true }); }),
					el(TextControl, {
						label: 'Texto alternativo de la imagen',
						help: 'También es el nombre del botón que abre el mapa. Vacío: «Abrir el mapa de ubicación».',
						value: a.etiqueta,
						onChange: function (v) { set({ etiqueta: v }); }
					})));

			var vista = el('div', blockProps,
				el('svg', { className: 'cod-mapa-editor__pin', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
					el('path', { fill: 'currentColor', d: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z' })),
				el('p', { className: 'cod-mapa-editor__titulo' }, 'Mapa de ubicación'),
				hayUbicacion
					? el('p', { className: 'cod-mapa-editor__detalle' }, a.lat + ', ' + a.lng + ' · acercamiento ' + a.zoom + ' · ' + a.alto + ' px de alto')
					: el('p', { className: 'cod-mapa-editor__detalle' }, 'Pon la latitud y la longitud en el panel de la derecha.'));

			return el(Fragment, null, controles, vista);
		},
		save: function () {
			// Dinámico: lo dibuja el servidor, que es quien tiene la clave.
			return null;
		}
	});
})();
