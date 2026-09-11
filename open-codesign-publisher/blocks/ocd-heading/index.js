/**
 * Bloque Gutenberg ocd/heading (POC Fase 1).
 *
 * Sin pipeline de build: JS plano + wp.element.createElement.
 * Bloque dinámico: el render del front está en render.php y save() devuelve null.
 */
(function () {
	'use strict';

	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var registerBlockType = wp.blocks.registerBlockType;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var RichText = wp.blockEditor.RichText;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;
	var SelectControl = wp.components.SelectControl;

	var LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6].map(function (level) {
		return {
			value: level,
			label: 'H' + level
		};
	});

	registerBlockType('ocd/heading', {
		title: __('Título OCD', 'open-codesign-publisher'),
		description: __('Título con nivel h1-h6 como bloque Gutenberg nativo.', 'open-codesign-publisher'),
		icon: 'heading',
		category: 'text',
		keywords: ['título', 'titulo', 'heading', 'encabezado'],
		attributes: {
			content: {
				type: 'string',
				default: ''
			},
			level: {
				type: 'integer',
				default: 2
			},
			ocdEnhancements: {
				type: 'object',
				default: {}
			}
		},
		edit: function (props) {
			var attributes = props.attributes;
			var setAttributes = props.setAttributes;
			var blockProps = useBlockProps();
			var tagName = 'h' + attributes.level;

			return el(
				wp.element.Fragment,
				null,
				el(
					InspectorControls,
					null,
					el(
						PanelBody,
						{
							title: __('Nivel del título', 'open-codesign-publisher'),
							initialOpen: true
						},
						el(SelectControl, {
							label: __('Nivel', 'open-codesign-publisher'),
							value: attributes.level,
							options: LEVEL_OPTIONS,
							onChange: function (value) {
								setAttributes({ level: parseInt(value, 10) });
							}
						})
					)
				),
				el(RichText, Object.assign({}, blockProps, {
					tagName: tagName,
					value: attributes.content,
					placeholder: __('Escribí el título…', 'open-codesign-publisher'),
					allowedFormats: ['core/bold', 'core/italic'],
					onChange: function (value) {
						setAttributes({ content: value });
					}
				}))
			);
		},
		save: function () {
			return null;
		}
	});
})();
