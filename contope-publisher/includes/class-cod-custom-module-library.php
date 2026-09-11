<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Biblioteca de "Súper-Módulos" personalizados guardados por el usuario.
 *
 * MVP de "Guardar como módulo": persiste una lista plana de bloques
 * reutilizables (HTML + CSS ya saneados) como una única opción de WordPress,
 * en vez de un custom post type nuevo — no hace falta más que eso para este
 * alcance (ver class-cod-theme-definitions.php para el mismo patrón de
 * opción-JSON usado en este plugin).
 *
 * Cada entrada tiene un `id` estable en forma de slug (`cod-custom-<uuid4>`),
 * NUNCA un entero incremental: este proyecto tiene un bug recurrente de IDs
 * numéricos que no sobreviven una migración entre instalaciones de WordPress
 * (ver la nota de `document_id` en COD_Canvas_Editor_Admin), y una biblioteca
 * de módulos reusables viaja entre sitios en un paquete exactamente igual que
 * los documentos Canvas.
 */
final class COD_Custom_Module_Library
{
    public const OPTION_KEY = 'cod_custom_modules';

    /** Límites defensivos, en el mismo espíritu que COD_Canvas_Document_Sanitizer. */
    private const MAX_LABEL_LENGTH = 120;
    private const MAX_CATEGORY_LENGTH = 80;
    private const DEFAULT_CATEGORY = 'Módulos guardados';

    /**
     * Guarda una entrada nueva y devuelve la entrada completa tal como quedó
     * persistida (con su id generado y su createdAt).
     *
     * $html y $css deben llegar YA saneados por el llamador (se reutiliza
     * COD_Canvas_Document_Sanitizer::sanitize_html()/sanitize_css(), igual que
     * el resto del documento Canvas) — esta clase no vuelve a sanear el
     * contenido, sólo lo persiste.
     *
     * @return array{id: string, label: string, category: string, html: string, css: string, createdAt: string}
     */
    public function save(string $label, string $category, string $html, string $css): array
    {
        $label = function_exists('mb_substr')
            ? mb_substr(trim($label), 0, self::MAX_LABEL_LENGTH)
            : substr(trim($label), 0, self::MAX_LABEL_LENGTH);
        if ($label === '') {
            $label = 'Módulo guardado';
        }

        $category = function_exists('mb_substr')
            ? mb_substr(trim($category), 0, self::MAX_CATEGORY_LENGTH)
            : substr(trim($category), 0, self::MAX_CATEGORY_LENGTH);
        if ($category === '') {
            $category = self::DEFAULT_CATEGORY;
        }

        $entry = [
            'id' => 'cod-custom-' . wp_generate_uuid4(),
            'label' => $label,
            'category' => $category,
            'html' => $html,
            'css' => $css,
            'createdAt' => gmdate('c'),
        ];

        $entries = $this->read_all();
        $entries[] = $entry;
        $this->write_all($entries);

        return $entry;
    }

    /**
     * @return array<int, array{id: string, label: string, category: string, html: string, css: string, createdAt: string}>
     */
    public function list_all(): array
    {
        return $this->read_all();
    }

    /**
     * @return array<int, array{id: string, label: string, category: string, html: string, css: string, createdAt: string}>
     */
    private function read_all(): array
    {
        $raw = get_option(self::OPTION_KEY, '');
        if (!is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $entries = [];
        foreach ($decoded as $item) {
            if (!is_array($item)) {
                continue;
            }
            $id = isset($item['id']) ? (string) $item['id'] : '';
            if ($id === '') {
                continue;
            }
            $entries[] = [
                'id' => $id,
                'label' => isset($item['label']) ? (string) $item['label'] : $id,
                'category' => isset($item['category']) ? (string) $item['category'] : self::DEFAULT_CATEGORY,
                'html' => isset($item['html']) ? (string) $item['html'] : '',
                'css' => isset($item['css']) ? (string) $item['css'] : '',
                'createdAt' => isset($item['createdAt']) ? (string) $item['createdAt'] : '',
            ];
        }

        return $entries;
    }

    /**
     * @param array<int, array{id: string, label: string, category: string, html: string, css: string, createdAt: string}> $entries
     */
    private function write_all(array $entries): void
    {
        // autoload=false: esta lista puede crecer y no hace falta en cada
        // carga de página del sitio público, sólo la lee el editor Canvas.
        update_option(self::OPTION_KEY, wp_json_encode($entries), false);
    }
}
