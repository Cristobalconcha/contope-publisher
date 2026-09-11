<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Resuelve los tokens dinámicos built-in del Canvas en el HTML ya ensamblado.
 *
 * Etapa 1: sólo post_title, post_excerpt, featured_image y permalink.
 * Etapa 3 agrega los tokens ACF: `{{acf:CAMPO}}`, `{{acf:CAMPO:html}}` y
 * `data-cod-dynamic="acf_image:CAMPO"` sobre etiquetas `<img>`. Todas las
 * llamadas a funciones de ACF quedan detrás de `function_exists()`, de modo
 * que desactivar ACF no rompe el shortcode: esos tokens simplemente no se
 * reemplazan.
 */
final class COD_Dynamic_Token_Resolver
{
    public function resolve(string $html, int $post_id): string
    {
        if ($post_id <= 0) {
            return $html;
        }
        if (!str_contains($html, '{{') && !str_contains($html, 'data-cod-dynamic')) {
            return $html;
        }

        $html = $this->replace_featured_image_tags($html, $post_id);
        $html = $this->replace_permalink_tags($html, $post_id);
        $html = $this->replace_acf_image_tags($html, $post_id);
        $html = $this->replace_text_tokens($html, $post_id);

        return $html;
    }

    private function replace_featured_image_tags(string $html, int $post_id): string
    {
        return preg_replace_callback(
            '/<img\b[^>]*\bdata-cod-dynamic\s*=\s*(["\'])featured_image\1[^>]*>/i',
            static function () use ($post_id): string {
                return (string) get_the_post_thumbnail($post_id, 'full');
            },
            $html
        ) ?? $html;
    }

    private function replace_permalink_tags(string $html, int $post_id): string
    {
        return preg_replace_callback(
            '/<a\b[^>]*\bdata-cod-dynamic\s*=\s*(["\'])permalink\1[^>]*>/i',
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

    /**
     * Reemplaza `<img data-cod-dynamic="acf_image:CAMPO">` por la URL de la
     * imagen ACF del post. Sólo cambia `src`/`srcset`; el resto del `<img>`
     * (clases, estilos, atributos del autor) se conserva.
     */
    private function replace_acf_image_tags(string $html, int $post_id): string
    {
        return preg_replace_callback(
            '/<img\b[^>]*\bdata-cod-dynamic\s*=\s*(["\'])acf_image:([a-zA-Z0-9_\-]+)\1[^>]*>/i',
            function (array $matches) use ($post_id): string {
                $url = $this->resolve_acf_image_url($matches[2], $post_id);
                if ($url === null) {
                    return $matches[0];
                }
                $url = esc_url($url);
                if ($url === '') {
                    return $matches[0];
                }

                $tag = $matches[0];
                $tag = preg_replace('/\s+src\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $tag);
                if (!is_string($tag)) {
                    $tag = $matches[0];
                }
                $tag = preg_replace('/\s+srcset\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $tag);
                if (!is_string($tag)) {
                    $tag = $matches[0];
                }
                $tag = preg_replace('/\s*\/?>$/', '', $tag);
                if (!is_string($tag)) {
                    $tag = $matches[0];
                }

                $alt = '';
                if (preg_match('/\balt\s*=/i', $tag) !== 1) {
                    $alt = ' alt=""';
                }

                return $tag . ' src="' . $url . '"' . $alt . '>';
            },
            $html
        ) ?? $html;
    }

    /**
     * ACF puede devolver una imagen de tres formas según cómo esté configurado
     * el campo: array (`['url' => ..., 'ID' => ...]`), ID numérico o URL string.
     * Elegimos resolver las tres formas directamente: para el array se lee
     * `url`/`ID`/`id` y para el ID se usa `wp_get_attachment_image_url()` (core,
     * sin depender de helpers ACF que asumen un formato de retorno concreto).
     */
    private function resolve_acf_image_url(string $field_name, int $post_id): ?string
    {
        if (!function_exists('get_field')) {
            return null;
        }

        $value = get_field($field_name, $post_id);

        if (is_array($value)) {
            if (isset($value['url']) && is_string($value['url']) && $value['url'] !== '') {
                return $value['url'];
            }
            $attachment_id = isset($value['ID']) ? (int) $value['ID'] : 0;
            if ($attachment_id <= 0 && isset($value['id'])) {
                $attachment_id = (int) $value['id'];
            }
            return $attachment_id > 0 ? $this->attachment_image_url($attachment_id) : null;
        }

        if (is_numeric($value)) {
            $attachment_id = (int) $value;
            return $attachment_id > 0 ? $this->attachment_image_url($attachment_id) : null;
        }

        if (is_string($value) && $value !== '') {
            return $value;
        }

        return null;
    }

    private function attachment_image_url(int $attachment_id): ?string
    {
        $url = wp_get_attachment_image_url($attachment_id, 'full');
        return is_string($url) && $url !== '' ? $url : null;
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
                '/\{\{(post_title|post_excerpt|featured_image|permalink|acf:([a-zA-Z0-9_\-]+)(:html)?)\}\}/',
                function (array $matches) use ($post_id): string {
                    $acf_field = $matches[2] ?? '';
                    if ($acf_field !== '') {
                        return $this->resolve_acf_text_field(
                            $acf_field,
                            ($matches[3] ?? '') === ':html',
                            $post_id
                        );
                    }

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

    /**
     * Resuelve `{{acf:CAMPO}}` (texto plano) y `{{acf:CAMPO:html}}` (WYSIWYG).
     *
     * El texto plano se escapa con `esc_html()` para que un campo de texto no
     * inyecte etiquetas. `:html` está pensado únicamente para campos WYSIWYG:
     * su HTML legítimo se preserva, pero pasa por `wp_kses_post()` antes de
     * salir para no convertirse en un vector XSS si el campo lo editó alguien
     * sin plena confianza.
     */
    private function resolve_acf_text_field(string $field_name, bool $allow_html, int $post_id): string
    {
        $original = '{{acf:' . $field_name . ($allow_html ? ':html' : '') . '}}';
        if (!function_exists('get_field')) {
            return $original;
        }

        $value = get_field($field_name, $post_id);
        if ($value === null || is_array($value) || is_object($value)) {
            return $original;
        }

        $text = (string) $value;
        return $allow_html ? wp_kses_post($text) : esc_html($text);
    }
}
