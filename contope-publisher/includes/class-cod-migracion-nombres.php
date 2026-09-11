<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Migración de los nombres viejos (Open CoDesign) a los nuevos (ContOpe).
 *
 * El proyecto cambió de nombre hasta adentro: el prefijo de clases pasó de
 * `ocd-` a `cod-`, el tipo de contenido de `ocd_canvas_doc` a `cod_canvas_doc`,
 * y todas las claves de base de datos de `_ocd_*` a `_cod_*`.
 *
 * Un sitio que ya tenía instalada la versión anterior guarda sus documentos con
 * los nombres viejos. Sin esta migración, al actualizar el plugin sus páginas
 * quedarían invisibles: el código buscaría `cod_canvas_doc` y en la base habría
 * `ocd_canvas_doc`. No se perdería nada, pero el sitio se vería vacío, que para
 * quien lo mira es lo mismo que perderlo.
 *
 * Corre sola al cargar el plugin, una única vez, y deja constancia de haber
 * corrido. Es idempotente: si se ejecuta de nuevo no hace nada, porque ya no
 * queda nada con el nombre viejo.
 *
 * Qué NO hace, a propósito:
 *
 * - No toca los snapshots ya guardados. Son fotos del pasado, y el pasado tenía
 *   los nombres viejos. Reescribirlos falsearía el respaldo justo cuando podría
 *   hacer falta.
 * - No toca contenido fuera del plugin. Solo migra lo que el plugin escribió.
 */
final class COD_Migracion_Nombres
{
    /** Deja constancia de la migración para no repetirla en cada carga. */
    public const OPTION_HECHA = 'cod_migracion_nombres_hecha';

    /** Versión del formato migrado. Subirla vuelve a correr la migración. */
    public const VERSION = 1;

    private const POST_TYPE_VIEJO = 'ocd_canvas_doc';
    private const POST_TYPE_NUEVO = 'cod_canvas_doc';

    public function register(): void
    {
        add_action('plugins_loaded', [$this, 'quizas_migrar'], 1);
    }

    public function quizas_migrar(): void
    {
        if ((int) get_option(self::OPTION_HECHA, 0) >= self::VERSION) {
            return;
        }
        $informe = $this->migrar();
        update_option(self::OPTION_HECHA, self::VERSION, true);

        if (array_sum($informe) > 0) {
            error_log('[contope-publisher] Migración de nombres completada: ' . wp_json_encode($informe));
        }
    }

    /**
     * Ejecuta la migración completa y devuelve cuántas filas cambió cada paso.
     *
     * @return array<string, int>
     */
    public function migrar(): array
    {
        global $wpdb;

        $informe = [
            'documentos' => $this->migrar_tipo_de_contenido(),
            'metadatos' => $this->migrar_claves_meta(),
            'opciones' => $this->migrar_opciones(),
            'contenido' => $this->migrar_contenido_guardado(),
        ];

        // Las páginas guardan en caché el tipo de contenido y las claves meta.
        wp_cache_flush();

        return $informe;
    }

    /** `ocd_canvas_doc` pasa a `cod_canvas_doc` en wp_posts. */
    private function migrar_tipo_de_contenido(): int
    {
        global $wpdb;

        return (int) $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$wpdb->posts} SET post_type = %s WHERE post_type = %s",
                self::POST_TYPE_NUEVO,
                self::POST_TYPE_VIEJO
            )
        );
    }

    /**
     * Toda clave meta que empiece con `_ocd_` pasa a `_cod_`.
     *
     * Va fila por fila y no con un UPDATE masivo a propósito. Un
     * `CONCAT`+`SUBSTRING` sería más corto, pero son funciones de MySQL y este
     * plugin también corre sobre SQLite, donde la traducción no es fiable. El
     * volumen es de unas decenas de filas: la portabilidad vale más que los
     * milisegundos.
     *
     * Se descubren por prefijo y no por lista de constantes porque hay claves
     * que no se pueden listar de antemano: cada snapshot guarda su contenido en
     * una meta cuyo nombre lleva un identificador aleatorio
     * (`_ocd_canvas_snap_<id>`).
     */
    private function migrar_claves_meta(): int
    {
        global $wpdb;

        $filas = $wpdb->get_results(
            "SELECT meta_id, meta_key FROM {$wpdb->postmeta} WHERE meta_key LIKE '\_ocd\_%'"
        );

        $cambiadas = 0;
        foreach ($filas as $fila) {
            $vieja = (string) $fila->meta_key;
            if (strpos($vieja, '_ocd_') !== 0) {
                continue;
            }
            $nueva = '_cod_' . substr($vieja, 5);
            $wpdb->update($wpdb->postmeta, ['meta_key' => $nueva], ['meta_id' => (int) $fila->meta_id]);
            $cambiadas++;
        }

        return $cambiadas;
    }

    /** Las opciones del sitio: `ocd_algo` pasa a `cod_algo`. */
    private function migrar_opciones(): int
    {
        global $wpdb;

        $filas = $wpdb->get_results(
            "SELECT option_id, option_name FROM {$wpdb->options} WHERE option_name LIKE 'ocd\_%'"
        );

        $cambiadas = 0;
        foreach ($filas as $fila) {
            $vieja = (string) $fila->option_name;
            if (strpos($vieja, 'ocd_') !== 0) {
                continue;
            }
            $nueva = 'cod_' . substr($vieja, 4);
            // Si por lo que sea ya existe la nueva, la vieja sobra: se borra en
            // vez de chocar contra el índice único de option_name.
            $existe = $wpdb->get_var($wpdb->prepare("SELECT option_id FROM {$wpdb->options} WHERE option_name = %s", $nueva));
            if ($existe) {
                $wpdb->delete($wpdb->options, ['option_id' => (int) $fila->option_id]);
                continue;
            }
            $wpdb->update($wpdb->options, ['option_name' => $nueva], ['option_id' => (int) $fila->option_id]);
            $cambiadas++;
        }

        return $cambiadas;
    }

    /**
     * Reescribe el prefijo dentro del contenido guardado de cada documento.
     *
     * Este es el paso delicado y el que justifica la migración entera. El HTML
     * y el CSS guardados llevan clases `ocd-*` y atributos `data-ocd-*`, y el
     * runtime del plugin ahora busca `cod-*`. Sin reescribirlos, la página se
     * guarda y se sirve, pero sin estilos ni comportamientos: el video con
     * transparencia no arranca, las galerías no abren, la grilla se deshace.
     *
     * Se limita al prefijo para no tocar texto de la persona. Una palabra
     * corriente que contenga esa secuencia es improbable, y el riesgo de dejar
     * el sitio sin estilos es mucho mayor que el de esa coincidencia.
     *
     * Cubre también la forma en MAYÚSCULAS, que existe: el CSS guardado lleva
     * un marcador `OCD-CANVAS-EDITABLE-OVERRIDES` que el editor busca para
     * saber dónde empiezan las reglas editables a mano. Un reemplazo que
     * distinguiera mayúsculas lo dejaría atrás y el editor no reconocería ese
     * bloque. Lo encontró el ensayo en local; el sitio de Santa Luisa no tenía
     * ninguno, pero otro sitio sí puede tenerlos.
     *
     * Lo que NO se toca: los identificadores de documento (`ocd-canvas-page-7`
     * y parecidos, guardados en `_cod_canvas_document_id`, en las asignaciones
     * de región y en las plantillas). Son identificadores opacos: nada deriva
     * comportamiento de su prefijo, y renombrarlos obligaría a actualizar en el
     * mismo movimiento los enlaces de navegación, las regiones y la
     * configuración de cualquier herramienta externa que los use. Se ganaría
     * estética a cambio de una clase entera de referencias rotas.
     */
    private function migrar_contenido_guardado(): int
    {
        global $wpdb;

        $claves = [
            '_cod_canvas_project_data',
            '_cod_canvas_html',
            '_cod_canvas_css',
            '_cod_canvas_composition',
        ];

        $cambiados = 0;

        foreach ($claves as $clave) {
            $filas = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT meta_id, meta_value FROM {$wpdb->postmeta}
                     WHERE meta_key = %s AND (meta_value LIKE %s OR meta_value LIKE %s)",
                    $clave,
                    '%ocd-%',
                    '%ocd_%'
                )
            );

            foreach ($filas as $fila) {
                $nuevo = str_replace(
                    ['ocd-', 'ocd_', 'OCD-', 'OCD_'],
                    ['cod-', 'cod_', 'COD-', 'COD_'],
                    (string) $fila->meta_value
                );
                if ($nuevo === (string) $fila->meta_value) {
                    continue;
                }
                $wpdb->update(
                    $wpdb->postmeta,
                    ['meta_value' => $nuevo],
                    ['meta_id' => (int) $fila->meta_id]
                );
                $cambiados++;
            }
        }

        return $cambiados;
    }
}
