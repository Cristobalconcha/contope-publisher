<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Resuelve los tokens dinámicos built-in del Canvas en el HTML ya ensamblado.
 *
 * Etapa 1: sólo post_title, post_excerpt, featured_image y permalink.
 * Los placeholders se escriben a mano; la UI de inserción y ACF son etapas
 * posteriores y deliberadamente no se resuelven aquí.
 */
final class OCD_Dynamic_Token_Resolver
{
    public function resolve(string $html, int $post_id): string
    {
        if ($post_id <= 0) {
            return $html;
        }
        if (!str_contains($html, '{{') && !str_contains($html, 'data-ocd-dynamic')) {
            return $html;
        }

        $html = $this->replace_featured_image_tags($html, $post_id);
        $html = $this->replace_permalink_tags($html, $post_id);
        $html = $this->replace_text_tokens($html, $post_id);

        return $html;
    }

    private function replace_featured_image_tags(string $html, int $post_id): string
    {
        return preg_replace_callback(
            '/<img\b[^>]*\bdata-ocd-dynamic\s*=\s*(["\'])featured_image\1[^>]*>/i',
            static function () use ($post_id): string {
                return (string) get_the_post_thumbnail($post_id, 'full');
            },
            $html
        ) ?? $html;
    }

    private function replace_permalink_tags(string $html, int $post_id): string
    {
        return preg_replace_callback(
            '/<a\b[^>]*\bdata-ocd-dynamic\s*=\s*(["\'])permalink\1[^>]*>/i',
            static function (array $matches) use ($post_id): string {
                $tag = $matches[0];
                $permalink = esc_url((string) get_permalink($post_id));

                $open = preg_replace('/\s+href\s*=\s*(["\']).*?\1/i', '', $tag);
                if (!is_string($open)) {
                    $open = $tag;
                }
                $open = preg_replace('/\s*\/?>$/', '', $open);
                if (!is_string($open)) {
                    $open = $tag;
                }

                return $open . ' href="' . $permalink . '">';
            },
            $html
        ) ?? $html;
    }

    private function replace_text_tokens(string $html, int $post_id): string
    {
        $parts = preg_split('/(<[^>]*>)/', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false) {
            return $html;
        }

        foreach ($parts as $index => $part) {
            // Los tags quedan en los índices impares de preg_split con
            // PREG_SPLIT_DELIM_CAPTURE; los tokens sólo se resuelven en texto.
            if ($part === '' || ($index & 1) !== 0) {
                continue;
            }

            $parts[$index] = preg_replace_callback(
                '/\{\{(post_title|post_excerpt|featured_image|permalink)\}\}/',
                static function (array $matches) use ($post_id): string {
                    switch ($matches[1]) {
                        case 'post_title':
                            return esc_html(get_the_title($post_id));
                        case 'post_excerpt':
                            return esc_html(get_the_excerpt($post_id));
                        case 'featured_image':
                            return esc_url((string) get_the_post_thumbnail_url($post_id, 'full'));
                        case 'permalink':
                            return esc_url((string) get_permalink($post_id));
                    }

                    return $matches[0];
                },
                $part
            ) ?? $part;
        }

        return implode('', $parts);
    }
}
