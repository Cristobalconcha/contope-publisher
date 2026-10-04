<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Los JPEG del sitio se guardan en descarga progresiva.
 *
 * QUÉ CAMBIA. Un JPEG normal se dibuja línea a línea, de arriba abajo: hasta
 * que no llega el último byte, la mitad de abajo es un hueco. Uno progresivo
 * llega en pasadas: aparece entero y borroso enseguida, y se va afinando. Es
 * la misma idea del mapa que se carga por partes, pero dentro de un archivo.
 *
 * Idea de Cristóbal, el 4 de octubre de 2026, pensando en voz alta sobre cómo
 * descarga un mapa: «de hecho las propias imágenes en jpg pueden ser guardadas
 * en descarga progresiva».
 *
 * Y ADEMÁS PESAN MENOS. Medido sobre las fotos de Econut ese día: entre un 3%
 * y un 16% menos, porque la codificación progresiva agrupa mejor la
 * información. Las 42 fotos del sitio estaban todas línea a línea.
 *
 * POR QUÉ UN EDITOR PROPIO Y NO UN FILTRO. Porque WordPress no expone ningún
 * filtro para el entrelazado: la decisión está dentro de `_save()` del editor
 * de imágenes. Heredando de él y encendiendo `imageinterlace` justo antes se
 * consigue sin tocar el núcleo y sin volver a comprimir nada: se guarda una
 * sola vez, como siempre, pero progresiva.
 *
 * Sólo afecta a JPEG. PNG tiene su propio entrelazado (Adam7) que WordPress ya
 * decide, y los formatos modernos —WebP, AVIF— no lo necesitan.
 */
final class COD_Imagen_Progresiva
{
    public function register(): void
    {
        add_filter('wp_image_editors', [$this, 'editores']);
    }

    /**
     * Pone nuestro editor por delante del de GD.
     *
     * Se mantiene la lista completa detrás: si el nuestro no puede con un
     * archivo —porque falta GD, por ejemplo—, WordPress sigue probando con los
     * de siempre y la subida no se rompe.
     *
     * @param array<int, string> $editores
     * @return array<int, string>
     */
    public function editores(array $editores): array
    {
        if (!class_exists('COD_Image_Editor_GD_Progresivo')) {
            return $editores;
        }
        array_unshift($editores, 'COD_Image_Editor_GD_Progresivo');
        return $editores;
    }
}

if (class_exists('WP_Image_Editor_GD') && !class_exists('COD_Image_Editor_GD_Progresivo')) {
    /**
     * El editor de GD de WordPress, guardando los JPEG en progresivo.
     *
     * Es lo único que cambia respecto del original: una llamada a
     * `imageinterlace()` antes de que el padre escriba el archivo.
     */
    class COD_Image_Editor_GD_Progresivo extends WP_Image_Editor_GD
    {
        /**
         * @param resource|\GdImage|null $image
         * @param string|null $filename
         * @param string|null $mime_type
         * @return array|WP_Error
         */
        protected function _save($image, $filename = null, $mime_type = null)
        {
            list($extension, $tipo) = $this->get_output_format($filename, $mime_type);
            if ($tipo === 'image/jpeg' && function_exists('imageinterlace')) {
                imageinterlace($image, true);
            }
            unset($extension);

            return parent::_save($image, $filename, $mime_type);
        }
    }
}
