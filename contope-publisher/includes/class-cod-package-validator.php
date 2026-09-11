<?php

if (!defined('ABSPATH')) {
    exit;
}

final class COD_Package_Validator
{
    private const MAX_PAGES = 50;
    private const MAX_NODES = 5000;
    private const ALLOWED_TYPES = [
        'section',
        'group',
        'columns',
        'column',
        'heading',
        'paragraph',
        'image',
        'buttons',
        'button',
        'details',
        'list',
        'video',
        'separator',
        'spacer',
    ];

    /**
     * @return true|WP_Error
     */
    public function validate(array $document)
    {
        if (($document['schemaVersion'] ?? null) !== 0) {
            return new WP_Error('cod_schema_version', 'La versión del formato no es compatible.');
        }

        $project = $document['project'] ?? null;
        if (!is_array($project) || !$this->valid_id($project['id'] ?? null) || !$this->text($project['name'] ?? null)) {
            return new WP_Error('cod_project', 'Los metadatos del proyecto son inválidos.');
        }

        $pages = $document['pages'] ?? null;
        if (!is_array($pages) || count($pages) < 1 || count($pages) > self::MAX_PAGES) {
            return new WP_Error('cod_pages', 'El documento debe contener entre 1 y 50 páginas.');
        }

        $page_ids = [];
        $slugs = [];
        $node_ids = [];
        $node_count = 0;

        foreach ($pages as $page) {
            if (!is_array($page)) {
                return new WP_Error('cod_page', 'La definición de una página es inválida.');
            }
            $page_id = $page['id'] ?? null;
            $slug = $page['slug'] ?? null;
            if (!$this->valid_id($page_id) || isset($page_ids[$page_id])) {
                return new WP_Error('cod_page_id', 'Los IDs de página deben ser válidos y únicos.');
            }
            if (!$this->text($page['title'] ?? null) || !is_string($slug) || sanitize_title($slug) !== $slug || isset($slugs[$slug])) {
                return new WP_Error('cod_page_fields', 'Cada página necesita título y slug válido y único.');
            }
            if (!isset($page['nodes']) || !is_array($page['nodes'])) {
                return new WP_Error('cod_page_nodes', 'Cada página debe contener una lista de nodos.');
            }
            $page_ids[$page_id] = true;
            $slugs[$slug] = true;

            $result = $this->validate_nodes($page['nodes'], $node_ids, $node_count, null);
            if (is_wp_error($result)) {
                return $result;
            }
        }

        return true;
    }

    /**
     * @return true|WP_Error
     */
    private function validate_nodes(array $nodes, array &$node_ids, int &$node_count, ?string $parent_type)
    {
        foreach ($nodes as $node) {
            $node_count++;
            if ($node_count > self::MAX_NODES) {
                return new WP_Error('cod_node_limit', 'El documento supera el límite de nodos.');
            }
            if (!is_array($node) || !$this->valid_id($node['id'] ?? null)) {
                return new WP_Error('cod_node_id', 'Cada nodo necesita un ID válido.');
            }
            if (isset($node_ids[$node['id']])) {
                return new WP_Error('cod_duplicate_node', 'Los IDs de nodo deben ser únicos en el proyecto.');
            }
            $node_ids[$node['id']] = true;

            $type = $node['type'] ?? null;
            if (!is_string($type) || !in_array($type, self::ALLOWED_TYPES, true)) {
                return new WP_Error('cod_node_type', 'El documento contiene un tipo de nodo desconocido.');
            }
            if ($type === 'column' && $parent_type !== 'columns') {
                return new WP_Error('cod_column_parent', 'Una columna debe pertenecer directamente a un nodo columns.');
            }
            if ($parent_type === 'columns' && $type !== 'column') {
                return new WP_Error('cod_columns_child', 'Un nodo columns solo puede contener columnas.');
            }
            if ($type === 'list') {
                $items = $node['items'] ?? null;
                if (!is_array($items) || count($items) < 1 || count($items) > 100) {
                    return new WP_Error('cod_list_items', 'Un nodo list necesita entre 1 y 100 elementos.');
                }
                foreach ($items as $item) {
                    if (!is_string($item) || trim($item) === '') {
                        return new WP_Error('cod_list_item', 'Cada elemento de lista debe contener texto.');
                    }
                }
            }
            if ($type === 'details' && !$this->text($node['summary'] ?? null)) {
                return new WP_Error('cod_details_summary', 'Un nodo details necesita un resumen.');
            }

            $children = $node['children'] ?? [];
            if (!is_array($children)) {
                return new WP_Error('cod_children', 'La colección children debe ser una lista.');
            }
            $result = $this->validate_nodes($children, $node_ids, $node_count, $type);
            if (is_wp_error($result)) {
                return $result;
            }
        }
        return true;
    }

    private function valid_id($value): bool
    {
        return is_string($value) && preg_match('/^[a-z0-9][a-z0-9._-]{0,127}$/', $value) === 1;
    }

    private function text($value): bool
    {
        return is_string($value) && trim($value) !== '' && strlen($value) <= 500;
    }
}
