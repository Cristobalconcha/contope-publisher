<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pantalla "ContOpe → Diseño (ADN)": subir un ADN, ver la misma validación y el mismo diff
 * que da el MCP, y aplicarlo (ESPEC 3.4). Es la vía de PRODUCCIÓN, donde no hay MCP.
 *
 * Dos pasos, los dos con nonce y `manage_options`:
 *   1. REVISAR: sube el archivo (o pega el texto). No escribe nada: guarda el texto en un
 *      transitorio de 15 minutos, para no pedir el archivo otra vez, y muestra el resultado.
 *   2. APLICAR: sólo con el `previewId` exacto de lo que se revisó. Es el mismo camino que
 *      cod_adn_apply_import (COD_ADN_Store::aplicar).
 *
 * `permitirRuptura` sólo existe acá: una revisión que quita variables en uso se aplica
 * únicamente si una persona marca la casilla. El MCP no tiene ese argumento.
 *
 * El modo de la compuerta se cambia en su propia pantalla (COD_ADN_Gate_Admin), en los dos
 * sentidos; desde acá se enlaza.
 */
final class COD_ADN_Admin
{
    public const PAGE_SLUG = 'contope-adn';
    public const ACCION_REVISAR = 'cod_adn_revisar';
    public const ACCION_APLICAR = 'cod_adn_aplicar';
    public const CAPABILITY = 'manage_options';
    private const TRANSITORIO = 'cod_adn_pendiente_';
    private const MINUTOS = 15;

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_post_' . self::ACCION_REVISAR, [$this, 'handle_revisar']);
        add_action('admin_post_' . self::ACCION_APLICAR, [$this, 'handle_aplicar']);
    }

    public function add_menu(): void
    {
        add_submenu_page(
            COD_Theme_Builder_Admin::PARENT_SLUG,
            'Diseño (ADN)',
            'Diseño (ADN)',
            self::CAPABILITY,
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
    }

    private function volver(array $query): void
    {
        wp_safe_redirect(add_query_arg($query, admin_url('admin.php?page=' . self::PAGE_SLUG)));
        exit;
    }

    private function clave_del_transitorio(string $token): string
    {
        return self::TRANSITORIO . get_current_user_id() . '_' . preg_replace('/[^a-f0-9]/', '', $token);
    }

    public function handle_revisar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para cambiar el diseño del sitio.', 'contope-publisher'));
        }
        check_admin_referer(self::ACCION_REVISAR);
        $texto = '';
        if (!empty($_FILES['adn_archivo']['tmp_name']) && is_uploaded_file((string) $_FILES['adn_archivo']['tmp_name'])) {
            if ((int) ($_FILES['adn_archivo']['size'] ?? 0) > COD_ADN_Validator::MAX_BYTES) {
                $this->volver(['cod_adn_error' => rawurlencode('El archivo pesa más de 1 MB.')]);
            }
            $texto = (string) file_get_contents((string) $_FILES['adn_archivo']['tmp_name']);
        } elseif (isset($_POST['adn_texto'])) {
            $texto = (string) wp_unslash($_POST['adn_texto']);
        }
        if (trim($texto) === '') {
            $this->volver(['cod_adn_error' => rawurlencode('Sube un archivo de ADN o pega su contenido.')]);
        }
        $token = bin2hex(random_bytes(8));
        set_transient($this->clave_del_transitorio($token), [
            'texto' => $texto,
            'emitirPropuestas' => !empty($_POST['emitir_propuestas']),
            'fuente' => isset($_POST['fuente']) && in_array((string) $_POST['fuente'], COD_ADN_Store::FUENTES, true) ? (string) $_POST['fuente'] : 'upload',
        ], self::MINUTOS * MINUTE_IN_SECONDS);
        $this->volver(['cod_adn_token' => $token]);
    }

    public function handle_aplicar(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para cambiar el diseño del sitio.', 'contope-publisher'));
        }
        check_admin_referer(self::ACCION_APLICAR);
        $token = isset($_POST['token']) ? (string) wp_unslash($_POST['token']) : '';
        $pendiente = get_transient($this->clave_del_transitorio($token));
        if (!is_array($pendiente)) {
            $this->volver(['cod_adn_error' => rawurlencode('La revisión venció (15 minutos). Sube el archivo otra vez.')]);
        }
        $resultado = COD_ADN_Store::aplicar($pendiente['texto'], [
            'emitirPropuestas' => !empty($pendiente['emitirPropuestas']),
            'previewId' => isset($_POST['preview_id']) ? (string) wp_unslash($_POST['preview_id']) : '',
            'permitirRuptura' => !empty($_POST['permitir_ruptura']),
            'fuente' => (string) ($pendiente['fuente'] ?? 'upload'),
        ]);
        if (is_wp_error($resultado)) {
            $this->volver(['cod_adn_error' => rawurlencode($resultado->get_error_code() . ': ' . $resultado->get_error_message()), 'cod_adn_token' => $token]);
        }
        delete_transient($this->clave_del_transitorio($token));
        $this->volver(['cod_adn_listo' => rawurlencode((string) $resultado['resultado'] . ' · ' . $resultado['designId'] . ' r' . $resultado['revision'])]);
    }

    public function render_page(): void
    {
        if (!current_user_can(self::CAPABILITY)) {
            wp_die(esc_html__('No tienes permisos para ver esta pantalla.', 'contope-publisher'));
        }
        $resumen = COD_ADN_Store::resumen();
        echo '<div class="wrap"><h1>Diseño (ADN)</h1>';
        if (isset($_GET['cod_adn_listo'])) {
            echo '<div class="notice notice-success"><p>Listo: ' . esc_html(rawurldecode((string) wp_unslash($_GET['cod_adn_listo']))) . '.</p></div>';
        }
        if (isset($_GET['cod_adn_error'])) {
            echo '<div class="notice notice-error"><p>' . esc_html(rawurldecode((string) wp_unslash($_GET['cod_adn_error']))) . '</p></div>';
        }

        echo '<h2>Estado</h2>';
        if (!$resumen['activo']) {
            echo '<p>Este sitio <strong>no tiene un ADN activo</strong>: el diseño sigue saliendo del tema y de la configuración, como siempre.</p>';
        } else {
            $c = $resumen['conteos'];
            printf(
                '<p>ADN activo: <strong>%s</strong>, revisión <strong>%d</strong> (fuente: %s, importado %s). Definiciones: %d confirmadas, %d propuestas, %d observadas, %d rechazadas; %d emitidas, %d sin resolver. Modo de la compuerta: <strong>%s</strong>. theme.json: <strong>%s</strong>.</p>',
                esc_html((string) $resumen['designId']),
                (int) $resumen['revision'],
                esc_html((string) $resumen['fuente']),
                esc_html((string) $resumen['importadoEn']),
                (int) $c['confirmed'],
                (int) $c['proposed'],
                (int) $c['observed'],
                (int) $c['rejected'],
                (int) $c['emitidas'],
                (int) $c['sinResolver'],
                esc_html((string) $resumen['modo']),
                esc_html((string) $resumen['proyeccion']['themeJson'])
            );
        }
        printf('<p><a href="%s">Cambiar el modo de la compuerta</a></p>', esc_url(admin_url('admin.php?page=' . COD_ADN_Gate_Admin::PAGE_SLUG)));

        $token = isset($_GET['cod_adn_token']) ? (string) wp_unslash($_GET['cod_adn_token']) : '';
        $pendiente = $token !== '' ? get_transient($this->clave_del_transitorio($token)) : false;
        if (is_array($pendiente)) {
            $this->render_revision($token, $pendiente);
        }

        echo '<h2>Subir un ADN</h2>';
        echo '<p>Un archivo <code>design-contract.json</code> o <code>design/model.json</code>. Se revisa antes de aplicar y no se escribe nada hasta que lo confirmes.</p>';
        echo '<form method="post" enctype="multipart/form-data" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACCION_REVISAR) . '">';
        wp_nonce_field(self::ACCION_REVISAR);
        echo '<p><input type="file" name="adn_archivo" accept="application/json,.json"></p>';
        echo '<p>…o pega el contenido:<br><textarea name="adn_texto" rows="6" cols="80" class="large-text code"></textarea></p>';
        echo '<p><label><input type="checkbox" name="emitir_propuestas" value="1"> Emitir también las definiciones <code>proposed</code> (sólo para un documento de ensayo)</label></p>';
        echo '<p><label>Fuente: <select name="fuente"><option value="upload">archivo subido</option><option value="desktop">Desktop</option><option value="extractor">extractor</option></select></label></p>';
        submit_button('Revisar');
        echo '</form></div>';
    }

    /** @param array<string, mixed> $pendiente */
    private function render_revision(string $token, array $pendiente): void
    {
        $r = COD_ADN_Store::previsualizar($pendiente['texto'], ['emitirPropuestas' => !empty($pendiente['emitirPropuestas'])]);
        echo '<h2>Revisión</h2>';
        if (!$r['ok']) {
            echo '<div class="notice notice-error inline"><p><strong>No se puede aplicar.</strong></p><ul>';
            foreach ($r['errores'] as $e) {
                echo '<li><code>' . esc_html((string) $e['codigo']) . '</code> — ' . esc_html((string) $e['mensaje']) . '</li>';
            }
            echo '</ul></div>';
            return;
        }
        printf('<p>%s <strong>%s</strong> revisión %d (base: %d). Variables que se publican: %d.</p>', esc_html(['nuevo' => 'ADN nuevo:', 'actualiza' => 'Actualiza:', 'unchanged' => 'Sin cambios:'][$r['estado']] ?? ''), esc_html($r['designId']), (int) $r['revisionNueva'], (int) $r['revisionBase'], (int) ($r['proyeccion']['variables'] ?? 0));
        if ($r['estado'] === 'unchanged') {
            echo '<p>Es el mismo contenido que ya está activo; no hay nada que aplicar.</p>';
            return;
        }
        if (!empty($r['ignoradas'])) {
            echo '<p>Se guardan pero no se emiten (<code>ignored[]</code>):</p><ul>';
            foreach ($r['ignoradas'] as $i) {
                echo '<li><code>' . esc_html((string) $i['definicion']) . '</code> — ' . esc_html((string) $i['motivo']) . '</li>';
            }
            echo '</ul>';
        }
        foreach ($r['avisos'] as $a) {
            echo '<p>Aviso: ' . esc_html((string) $a['mensaje']) . '</p>';
        }
        if (is_array($r['diff'])) {
            $v = $r['diff']['variables'];
            printf('<p>Variables: %d agregadas, %d quitadas, %d renombradas, %d con otro valor, %d degradadas.</p>', count($v['agregadas']), count($v['quitadas']), count($v['renombradas']), count($v['cambiadas']), count($v['degradadas']));
        }
        $rompe = $r['rompe'];
        if ($rompe !== []) {
            echo '<div class="notice notice-warning inline"><p><strong>Esto rompe lo que el sitio sirve hoy:</strong> estas variables se quitan, se renombran o dejan de estar confirmadas y siguen en uso.</p><ul>';
            foreach ($rompe as $x) {
                echo '<li><code>' . esc_html((string) $x['variable']) . '</code> — ' . esc_html((string) $x['origen']) . ' · ' . esc_html((string) $x['documentId']) . ' · ' . esc_html((string) $x['ruta']) . ' (' . (int) $x['cantidad'] . ' uso/s)</li>';
            }
            echo '</ul></div>';
        }
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACCION_APLICAR) . '">';
        wp_nonce_field(self::ACCION_APLICAR);
        echo '<input type="hidden" name="token" value="' . esc_attr($token) . '">';
        echo '<input type="hidden" name="preview_id" value="' . esc_attr((string) $r['previewId']) . '">';
        if ($rompe !== []) {
            echo '<p><label><input type="checkbox" name="permitir_ruptura" value="1"> Entiendo que esto rompe lo anterior y quiero aplicarlo igual</label></p>';
        }
        submit_button('Aplicar este ADN');
        echo '</form>';
    }
}
