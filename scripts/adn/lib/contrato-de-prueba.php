<?php
/**
 * Contratos de ADN para las pruebas de F1 (almacén, atomicidad, concurrencia).
 *
 * ES UN FIXTURE DE PRUEBA, NO EL ADN DE BASIS. Las definiciones salen marcadas como
 * confirmadas por una persona porque las reglas del validador (R1) lo exigen para emitir
 * variables; esa confirmación es SIMULADA y lo dice la procedencia de cada una. Nunca se
 * importa en un sitio real: las pruebas sólo lo usan en el WordPress local de Basis y lo
 * borran al terminar.
 *
 * Los colores salen de contope-basis/theme.json para que los slugs y los valores sean los de
 * un sitio de verdad; más seis colores "Prueba A".."Prueba F" cuyas variables las pruebas
 * ponen en uso a propósito.
 */

/**
 * @param array{
 *   revision?: int, designId?: string, extras_color?: array<string, string>, sin_color?: array<int, string>,
 *   roles?: string, tipografia?: string, estado_paleta?: string, autoridad_paleta?: string, tag?: string
 * } $o  roles/tipografia: 'ok' | 'pendiente' | 'sin'
 */
function adn_de_prueba(array $o = []): string
{
    $revision = $o['revision'] ?? 1;
    $design_id = $o['designId'] ?? 'basis-web';
    $tema = json_decode((string) file_get_contents(__DIR__ . '/../../../contope-basis/theme.json'), true);
    $paleta = [];
    foreach (array_slice($tema['settings']['color']['palette'], 0, 6) as $c) {
        $paleta[$c['name']] = strtoupper($c['color']);
    }
    foreach (['A' => '#112233', 'B' => '#223344', 'C' => '#334455', 'D' => '#445566', 'E' => '#556677', 'F' => '#667788'] as $letra => $hex) {
        $paleta['Prueba ' . $letra] = $hex;
    }
    foreach ($o['extras_color'] ?? [] as $nombre => $hex) {
        $paleta[$nombre] = $hex;
    }
    foreach ($o['sin_color'] ?? [] as $nombre) {
        unset($paleta[$nombre]);
    }
    $institucionales = [];
    $neutros = [];
    $i = 0;
    foreach ($paleta as $nombre => $hex) {
        $item = ['name' => $nombre, 'value' => $hex];
        // Los primeros seis son los de Basis; los neutros son los grises.
        if (stripos($nombre, 'gris') !== false || $nombre === 'Fondo de la página') {
            $neutros[] = $item;
        } else {
            $institucionales[] = $item;
        }
        ++$i;
    }
    $fecha = '2026-11-02T00:00:00.000Z';
    $humano = static function (string $autoridad = 'human-confirmed') use ($fecha): array {
        return [
            'state' => 'confirmed',
            'authority' => $autoridad,
            'evidenceSourceIds' => ['obs'],
            'provenance' => [['sourceId' => 'user', 'excerpt' => 'FIXTURE DE PRUEBA: confirmación simulada, no es el ADN de Basis']],
            'constraintDefinitionIds' => [],
            'reviewedAt' => $fecha,
        ];
    };
    $pendiente = static function (string $id, string $categoria): array {
        return [
            'id' => $id, 'category' => $categoria, 'name' => $id, 'value' => new stdClass(),
            'state' => 'proposed', 'authority' => 'model-proposal',
            'evidenceSourceIds' => [], 'provenance' => [], 'constraintDefinitionIds' => [],
        ];
    };

    $defs = [];
    $tareas = [];
    $defs[] = [
        'id' => 'dim1.req01.def1', 'category' => 'color', 'name' => 'Paleta',
        'value' => ['institucionales' => $institucionales, 'neutros' => $neutros],
    ] + $humano($o['autoridad_paleta'] ?? 'human-confirmed');
    if (isset($o['estado_paleta'])) {
        $defs[0]['state'] = $o['estado_paleta'];
        if ($o['estado_paleta'] !== 'confirmed') {
            $defs[0]['authority'] = 'model-proposal';
            unset($defs[0]['reviewedAt']);
        }
    }
    $roles = $o['roles'] ?? 'ok';
    if ($roles === 'ok') {
        $defs[] = [
            'id' => 'dim1.req02.def1', 'category' => 'color', 'name' => 'Roles de color',
            'value' => ['roleColors' => [
                ['role' => 'background', 'color' => ['refReqId' => 'dim1.req01', 'refPath' => ['institucionales', 0, 'value']], 'source' => 'prueba', 'derivation' => ['of' => 'dim1.req01']],
                ['role' => 'text', 'color' => ['refReqId' => 'dim1.req01', 'refPath' => ['institucionales', 1, 'value']], 'source' => 'prueba', 'derivation' => ['of' => 'dim1.req01']],
                ['role' => 'accent', 'color' => '#F26621', 'source' => 'prueba', 'derivation' => ['of' => 'direct', 'rule' => 'literal de prueba']],
            ]],
        ] + $humano();
    } elseif ($roles === 'pendiente') {
        $defs[] = $pendiente('dim1.req02.def1', 'color');
        $tareas[] = ['id' => 't-color', 'definitionId' => 'dim1.req02.def1', 'state' => 'active', 'constraintDefinitionIds' => [], 'candidateDefinitionIds' => []];
    }
    $defs[] = [
        'id' => 'dim2.req01.def1', 'category' => 'typography', 'name' => 'Familias',
        'value' => ['familias' => [
            ['name' => 'Títulos', 'stack' => ["'Big Shoulders Display'", "'Arial Narrow'", 'sans-serif'], 'idiomas' => ['es'], 'licencia' => 'OFL'],
            ['name' => 'Cuerpo', 'stack' => ["'Open Sans'", 'system-ui', 'sans-serif'], 'idiomas' => ['es'], 'licencia' => 'OFL'],
        ]],
    ] + $humano();
    $tipografia = $o['tipografia'] ?? 'ok';
    if ($tipografia === 'ok') {
        $defs[] = [
            'id' => 'dim2.req02.def1', 'category' => 'typography', 'name' => 'Roles tipográficos',
            'value' => ['roleStyles' => [
                ['role' => 'display', 'family' => ['refReqId' => 'dim2.req01', 'refPath' => ['familias', 0, 'name']], 'fontSize' => '3rem', 'fontWeight' => 700, 'lineHeight' => 1.1, 'source' => 'prueba', 'derivation' => ['of' => 'dim2.req01']],
                ['role' => 'cuerpo', 'family' => ['refReqId' => 'dim2.req01', 'refPath' => ['familias', 1, 'name']], 'fontSize' => '1rem', 'fontWeight' => 400, 'lineHeight' => 1.6, 'letterSpacing' => '0', 'source' => 'prueba', 'derivation' => ['of' => 'dim2.req01']],
            ]],
        ] + $humano();
    } elseif ($tipografia === 'pendiente') {
        $defs[] = $pendiente('dim2.req02.def1', 'typography');
        $tareas[] = ['id' => 't-tipo', 'definitionId' => 'dim2.req02.def1', 'state' => 'active', 'constraintDefinitionIds' => [], 'candidateDefinitionIds' => []];
    }
    $defs[] = [
        'id' => 'dim3.req01.def1', 'category' => 'spacing', 'name' => 'Escala de espacio',
        'value' => ['unidad' => '4px', 'escala' => [['step' => 1, 'value' => '4px'], ['step' => 2, 'value' => '8px'], ['step' => 4, 'value' => '16px']]],
    ] + $humano();
    $defs[] = [
        'id' => 'dim8.req03.def1', 'category' => 'motion', 'name' => 'Duraciones',
        'value' => ['escala' => [['nombre' => 'rápido', 'duracion' => 150], ['nombre' => 'lento', 'duracion' => 400]], 'ritmo' => ['descripcion' => 'prueba', 'sinPausas' => 'sin pausas']],
    ] + $humano();
    $defs[] = [
        'id' => 'restriccion-legal.logo', 'category' => 'iconography', 'name' => 'Despeje del logo',
        'value' => ['rule' => 'el logo necesita 24 px de despeje'],
    ] + $humano('deterministic-extraction');

    $contrato = [
        'schemaVersion' => 1,
        'design' => ['id' => $design_id, 'revision' => $revision, 'createdAt' => $fecha, 'updatedAt' => $fecha],
        'sources' => [['id' => 'obs', 'technicalKind' => 'css', 'purpose' => 'observation', 'label' => 'Medición de prueba', 'importedAt' => $fecha]],
        'definitions' => $defs,
        'developmentTasks' => $tareas,
        'projections' => ['designMd' => null],
    ];
    // json_encode con objetos explícitos: `value: {}` tiene que salir como {} y no como [].
    return (string) json_encode($contrato, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
}
