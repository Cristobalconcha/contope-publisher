<?php
/**
 * Un ADN DERIVADO del theme.json de un tema (F2, P2.1 y la prueba de portabilidad de presets).
 *
 * ES UN FIXTURE DE PRUEBA, NO EL ADN DE BASIS. Lee lo que el tema declara y lo escribe como un contrato
 * del Core que pasa el validador, para demostrar que lo que el ADN proyecta reproduce los presets del
 * tema. Las definiciones salen `confirmed` por la regla R1 (sin eso el validador no las emite) y esa
 * confirmación es SIMULADA: lo dice la procedencia de cada una. El ADN real lo confirma una persona (5.4).
 *
 * Reglas de la derivación (cada una es una decisión, no un descuido):
 *  - El slug de una variable sale del NOMBRE del color o de la familia; para que el slug sea el del
 *    theme.json, un nombre que no da su slug (p. ej. «Naranja Basis» -> accent) se reemplaza por el slug
 *    en palabras («Accent»). El nombre de mostrar del tema (name) no viaja: es cosmético.
 *  - Sólo viajan los colores que son color-css del Core (hex, rgb, hsl, oklch). Los color-mix() (las
 *    transparencias de scale_alpha) no caben todavía: lista de ECHO en COD_ADN_Theme::fuera_del_adn().
 *  - Cada tamaño de letra del tema es un rol con el nombre de su slug («10» ... «200», Q1(a)) con la
 *    familia, el peso y el interlineado de base del tema: son relleno técnico, y el rol dice que lo es.
 *  - Los pasos de espaciado numéricos viajan; el paso «gutter» (max()/calc()) no es una longitud simple.
 *  - Los radios del custom.radius se declaran como formas cuyo nombre viene de una referencia genérica a
 *    una definición dim4.req01 (la lista de roles de forma).
 *
 * @param array{revision?: int, designId?: string} $o
 */
function adn_desde_theme_json(string $ruta_theme_json, array $o = []): string
{
    $tema = json_decode((string) file_get_contents($ruta_theme_json), true);
    if (!is_array($tema)) {
        throw new RuntimeException('No se pudo leer ' . $ruta_theme_json);
    }
    $ajustes = $tema['settings'];
    $revision = $o['revision'] ?? 1;
    $design_id = $o['designId'] ?? 'basis-web';
    $fecha = '2026-11-02T00:00:00.000Z';
    $humano = static function () use ($fecha): array {
        return [
            'state' => 'confirmed', 'authority' => 'human-confirmed', 'evidenceSourceIds' => ['obs'],
            'provenance' => [['sourceId' => 'user', 'excerpt' => 'FIXTURE DERIVADO de theme.json: confirmación simulada, no es el ADN de Basis']],
            'constraintDefinitionIds' => [], 'reviewedAt' => $fecha,
        ];
    };
    $nombre_para = static function (string $nombre, string $slug): string {
        return COD_ADN_Projection::slug($nombre) === $slug ? $nombre : ucfirst(str_replace('-', ' ', $slug));
    };
    $ref = static function (string $req, array $ruta): array {
        return ['refReqId' => $req, 'refPath' => $ruta];
    };
    $es_hex = static function (string $c): bool {
        return preg_match('/^#[0-9a-f]{3,8}$/i', $c) === 1;
    };

    // --- color
    $neutros_slug = ['fondo-pagina', 'gris', 'gris-oscuro', 'gris-claro', 'gris-suave', 'casi-blanco', 'texto-cuerpo'];
    $inst = [];
    $neut = [];
    $donde = []; // slug -> [lista, índice]
    foreach ($ajustes['color']['palette'] as $c) {
        if (!$es_hex((string) $c['color'])) {
            continue;
        }
        $item = ['name' => $nombre_para((string) $c['name'], (string) $c['slug']), 'value' => strtoupper((string) $c['color'])];
        if (in_array($c['slug'], $neutros_slug, true)) {
            $donde[$c['slug']] = ['neutros', count($neut)];
            $neut[] = $item;
        } else {
            $donde[$c['slug']] = ['institucionales', count($inst)];
            $inst[] = $item;
        }
    }
    $ref_color = static function (string $slug) use ($donde, $ref): array {
        if (!isset($donde[$slug])) {
            throw new RuntimeException('El theme.json no declara el color ' . $slug);
        }
        return $ref('dim1.req01', [$donde[$slug][0], $donde[$slug][1], 'value']);
    };
    $roles_color = [];
    foreach (['background' => 'fondo-pagina', 'text' => 'texto-cuerpo', 'accent' => 'accent', 'surface' => 'gris'] as $rol => $slug) {
        $roles_color[] = ['role' => $rol, 'color' => $ref_color($slug), 'source' => 'theme.json (derivado)', 'derivation' => ['of' => 'dim1.req01']];
    }

    // --- familias
    $familias = [];
    $indice_familia = [];
    foreach ($ajustes['typography']['fontFamilies'] as $i => $f) {
        $indice_familia[(string) $f['slug']] = $i;
        $familias[] = [
            'name' => $nombre_para((string) $f['name'], (string) $f['slug']),
            'stack' => array_map('trim', explode(',', (string) $f['fontFamily'])),
            'idiomas' => ['es'], 'licencia' => 'OFL',
        ];
    }
    $fam = static function (string $slug) use ($indice_familia, $ref): array {
        return $ref('dim2.req01', ['familias', $indice_familia[$slug], 'name']);
    };

    // --- roles tipográficos: display y cuerpo (los de Core que hacen falta) y un rol por tamaño del tema
    $estilos = [
        ['role' => 'display', 'family' => $fam('display'), 'fontSize' => '50px', 'fontWeight' => 500, 'lineHeight' => 1.2, 'source' => 'theme.json (derivado)', 'derivation' => ['of' => 'dim2.req01']],
        ['role' => 'cuerpo', 'family' => $fam('body'), 'fontSize' => '16px', 'fontWeight' => 400, 'lineHeight' => 1.7, 'source' => 'theme.json (derivado)', 'derivation' => ['of' => 'dim2.req01']],
    ];
    foreach ($ajustes['typography']['fontSizes'] as $t) {
        $estilos[] = ['role' => (string) $t['slug'], 'family' => $fam('body'), 'fontSize' => (string) $t['size'], 'fontWeight' => 400, 'lineHeight' => 1.7, 'source' => 'theme.json (derivado; peso e interlineado de base, relleno técnico)', 'derivation' => ['of' => 'dim2.req01']];
    }

    // --- espaciado
    $escala = [];
    $indice_paso = [];
    foreach ($ajustes['spacing']['spacingSizes'] as $s) {
        if (preg_match('/^\d+$/', (string) $s['slug']) !== 1) {
            continue;
        }
        $indice_paso[(int) $s['slug']] = count($escala);
        $escala[] = ['step' => (int) $s['slug'], 'value' => (string) $s['size']];
    }
    $paso = static function (int $n) use ($indice_paso, $ref): array {
        return $ref('dim3.req01', ['escala', $indice_paso[$n], 'value']);
    };
    $rol_espacio = [];
    foreach (['intraelemento' => 50, 'interelemento' => 100, 'entre-secciones' => 190] as $rol => $n) {
        $rol_espacio[] = ['role' => $rol, 'value' => $paso($n), 'source' => 'fixture (asignado por conveniencia, no medido)', 'derivation' => ['of' => 'dim3.req01']];
    }
    $contenedores = [];
    foreach (['contenido' => 'contentSize', 'amplio' => 'wideSize'] as $nombre => $clave) {
        $contenedores[] = ['nombre' => $nombre, 'maxWidth' => (string) $ajustes['layout'][$clave], 'padding' => $ref('dim3.req02', ['roleSpacing', 0, 'value']), 'relacionSoporte' => 'viewport'];
    }

    // --- formas: los radios del custom
    $roles_forma = [];
    $formas = [];
    foreach ($ajustes['custom']['radius'] as $nombre => $valor) {
        $i = count($roles_forma);
        $roles_forma[] = ['nombre' => (string) $nombre];
        $forma = ['rol' => $ref('dim4.req01', ['roles', $i, 'nombre']), 'vocabulario' => 'fixture derivado de custom.radius'];
        if ($valor === '9999px') {
            $forma['radio'] = 'pill';
        } elseif ($valor === '50%') {
            $forma['radio'] = 'circle';
        } else {
            $forma['radio'] = 'longitud';
            $forma['radioValor'] = (string) $valor;
        }
        $formas[] = $forma;
    }

    $d = static function (string $id, string $categoria, string $nombre, array $valor) use ($humano): array {
        return ['id' => $id, 'category' => $categoria, 'name' => $nombre, 'value' => $valor] + $humano();
    };
    $defs = [
        $d('dim1.req01.def1', 'color', 'Paleta', ['institucionales' => $inst, 'neutros' => $neut]),
        $d('dim1.req02.def1', 'color', 'Roles de color', ['roleColors' => $roles_color]),
        $d('dim2.req01.def1', 'typography', 'Familias', ['familias' => $familias]),
        $d('dim2.req02.def1', 'typography', 'Roles tipográficos y escala de tamaños', ['roleStyles' => $estilos]),
        $d('dim2.req07.def1', 'typography', 'Correspondencia con Configuración', ['correspondencias' => [
            ['campoPlano' => 'font_heading', 'role' => $ref('dim2.req02', ['roleStyles', 0]), 'nota' => 'fixture'],
            ['campoPlano' => 'font_body', 'role' => $ref('dim2.req02', ['roleStyles', 1]), 'nota' => 'fixture'],
        ]]),
        $d('dim3.req01.def1', 'spacing', 'Escala de espacio', ['unidad' => '1px', 'escala' => $escala]),
        $d('dim3.req02.def1', 'spacing', 'Roles de espacio', ['roleSpacing' => $rol_espacio]),
        $d('dim3.req05.def1', 'spacing', 'Contenedores', ['contenedores' => $contenedores]),
        $d('dim4.req01.def1', 'shape', 'Roles de forma', ['roles' => $roles_forma]),
        $d('dim4.req02.def1', 'shape', 'Formas', ['formas' => $formas]),
        $d('dim8.req03.def1', 'motion', 'Duraciones', ['escala' => [['nombre' => 'enter', 'duracion' => 420], ['nombre' => 'response', 'duracion' => 160]], 'ritmo' => ['descripcion' => 'fixture', 'sinPausas' => 'sin pausas']]),
        $d('dim8.req04.def1', 'motion', 'Movimientos', ['movimientos' => [
            ['caso' => 'enter', 'curva' => 'cubic-bezier(.34,1.56,.64,1)', 'trayectoria' => 'fixture', 'continuidadEspacial' => 'fixture', 'tiempo' => $ref('dim8.req03', ['escala', 0, 'duracion'])],
            ['caso' => 'response', 'curva' => 'ease', 'trayectoria' => 'fixture', 'continuidadEspacial' => 'fixture', 'tiempo' => $ref('dim8.req03', ['escala', 1, 'duracion'])],
        ], 'sinAmplitud' => 'fixture: sin amplitud']),
    ];
    $contrato = [
        'schemaVersion' => 1,
        'design' => ['id' => $design_id, 'revision' => $revision, 'createdAt' => $fecha, 'updatedAt' => $fecha],
        'sources' => [['id' => 'obs', 'technicalKind' => 'css', 'purpose' => 'observation', 'label' => 'theme.json del tema (fixture)', 'importedAt' => $fecha]],
        'definitions' => $defs,
        'developmentTasks' => [],
        'projections' => ['designMd' => null],
    ];
    return (string) json_encode($contrato, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
}
