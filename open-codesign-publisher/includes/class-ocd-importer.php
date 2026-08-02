<?php

if (!defined('ABSPATH')) {
    exit;
}

final class OCD_Importer
{
    public function __construct(
        private OCD_Package_Validator $validator,
        private OCD_Block_Serializer $serializer
    ) {
    }

    /**
     * @return array<int, int>|WP_Error Map of source page IDs to WordPress post IDs.
     */
    public function import_json(string $json)
    {
        if (strlen($json) > 2 * MB_IN_BYTES) {
            return new WP_Error('ocd_file_size', 'El documento supera el límite de 2 MB.');
        }

        try {
            $document = json_decode($json, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            return new WP_Error('ocd_json', 'El documento JSON no es válido.');
        }
        if (!is_array($document)) {
            return new WP_Error('ocd_document', 'El documento debe ser un objeto JSON.');
        }

        $valid = $this->validator->validate($document);
        if (is_wp_error($valid)) {
            return $valid;
        }

        $created = [];
        $result = [];
        foreach ($document['pages'] as $page) {
            $post_id = wp_insert_post(
                [
                    'post_type' => 'page',
                    'post_status' => 'draft',
                    'post_title' => sanitize_text_field($page['title']),
                    'post_name' => sanitize_title($page['slug']),
                    'post_content' => $this->serializer->serialize_page($page),
                    'meta_input' => [
                        '_ocd_project_id' => sanitize_key($document['project']['id']),
                        '_ocd_page_id' => sanitize_key($page['id']),
                        '_ocd_schema_version' => 0,
                    ],
                ],
                true
            );
            if (is_wp_error($post_id)) {
                foreach ($created as $created_id) {
                    wp_delete_post($created_id, true);
                }
                return $post_id;
            }
            $created[] = $post_id;
            $result[$page['id']] = $post_id;
        }

        return $result;
    }
}

