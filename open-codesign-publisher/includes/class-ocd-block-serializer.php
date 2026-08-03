<?php

if (!defined('ABSPATH')) {
    exit;
}

final class OCD_Block_Serializer
{
    public function serialize_page(array $page): string
    {
        $blocks = [];
        foreach ($page['nodes'] as $node) {
            $blocks[] = $this->node_to_block($node);
        }
        return serialize_blocks($blocks);
    }

    private function node_to_block(array $node): array
    {
        $type = $node['type'];
        $children = array_map(fn(array $child): array => $this->node_to_block($child), $node['children'] ?? []);
        $metadata = ['metadata' => ['name' => $node['id']]];

        switch ($type) {
            case 'section':
            case 'group':
                return $this->container_block('core/group', $metadata, $children, 'div', 'wp-block-group');

            case 'columns':
                return $this->container_block('core/columns', $metadata, $children, 'div', 'wp-block-columns');

            case 'column':
                $width = isset($node['width']) && is_string($node['width']) ? $node['width'] : null;
                $attrs = $metadata;
                $style = '';
                if ($width !== null && preg_match('/^(100|[1-9]?[0-9](?:\.\d+)?)%$/', $width) === 1) {
                    $attrs['width'] = $width;
                    $style = ' style="flex-basis:' . esc_attr($width) . '"';
                }
                return $this->container_block('core/column', $attrs, $children, 'div', 'wp-block-column', $style);

            case 'heading':
                $level = max(1, min(6, (int) ($node['level'] ?? 2)));
                $content = wp_kses_post((string) ($node['content'] ?? ''));
                return $this->leaf_block(
                    'core/heading',
                    array_merge($metadata, ['level' => $level]),
                    sprintf('<h%d class="wp-block-heading">%s</h%d>', $level, $content, $level)
                );

            case 'paragraph':
                $content = wp_kses_post((string) ($node['content'] ?? ''));
                return $this->leaf_block('core/paragraph', $metadata, '<p>' . $content . '</p>');

            case 'separator':
                return $this->leaf_block('core/separator', $metadata, '<hr class="wp-block-separator has-alpha-channel-opacity"/>');

            case 'spacer':
                $height = max(0, min(500, (int) ($node['height'] ?? 32)));
                return $this->leaf_block('core/spacer', array_merge($metadata, ['height' => $height . 'px']), sprintf('<div style="height:%dpx" aria-hidden="true" class="wp-block-spacer"></div>', $height));

            case 'buttons':
                return $this->container_block('core/buttons', $metadata, $children, 'div', 'wp-block-buttons');

            case 'button':
                $label = esc_html((string) ($node['label'] ?? 'Botón'));
                $url = esc_url((string) ($node['url'] ?? '#'));
                $html = sprintf('<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="%s">%s</a></div>', $url, $label);
                return $this->leaf_block('core/button', $metadata, $html);

            case 'image':
                $url = esc_url((string) ($node['url'] ?? ''));
                $alt = esc_attr((string) ($node['alt'] ?? ''));
                $html = sprintf('<figure class="wp-block-image"><img src="%s" alt="%s"/></figure>', $url, $alt);
                return $this->leaf_block('core/image', $metadata, $html);
        }

        // El validador rechaza tipos desconocidos antes de alcanzar esta rama.
        throw new LogicException('Tipo de nodo no serializable.');
    }

    private function container_block(
        string $name,
        array $attrs,
        array $children,
        string $tag,
        string $class,
        string $extra_attributes = ''
    ): array
    {
        $opening = '<' . $tag . ' class="' . $class . '"' . $extra_attributes . '>';
        $inner_content = [$opening];
        foreach ($children as $_child) {
            $inner_content[] = null;
        }
        $inner_content[] = '</' . $tag . '>';

        return [
            'blockName' => $name,
            'attrs' => $attrs,
            'innerBlocks' => $children,
            'innerHTML' => $opening . '</' . $tag . '>',
            'innerContent' => $inner_content,
        ];
    }

    private function leaf_block(string $name, array $attrs, string $html): array
    {
        return [
            'blockName' => $name,
            'attrs' => $attrs,
            'innerBlocks' => [],
            'innerHTML' => $html,
            'innerContent' => [$html],
        ];
    }
}
