<?php
/**
 * Un ADN DERIVADO del theme.json de un tema (F2, P2.1 y la prueba de portabilidad de presets).
 *
 * ES UN FIXTURE DE PRUEBA, NO EL ADN DE BASIS. Lee lo que el tema declara y lo escribe como un contrato
 * del Core que pasa el validador, para demostrar que lo que el ADN proyecta reproduce el theme.json del
 * tema. Las definiciones salen `confirmed` por la regla R1 (sin eso el validador no las emite) y esa
 * confirmación es SIMULADA: lo dice la procedencia de cada una. El ADN real lo confirma una persona (5.4).
 *
 * Desde el 02-nov-2026 el ADN completo lleva TODO lo que el theme.json de Basis declara (pedidos Q1, Q3 y Q4 al Core): además de
 * color, familias, tamaños, espaciado y radios, las transparencias (dim1.req15), los degradados (dim1.req16), los pesos y
 * interlineados con nombre (dim2.req09), los quiebres (dim3.req10), el margen lateral «gutter» (dim3.req11), las medidas de texto
 * (dim3.req12), las sombras (dim4.req09), los grosores de borde (dim4.req10), los desenfoques (dim4.req11), el tema del formulario
 * (dim7.req09, las 68 variables de `custom.form`) y los valores por punto de quiebre de los tamaños de letra y los espaciados
 * (`porQuiebre`, que salen del bloque de CSS marcado `cod-escalas-con-quiebres` de `styles.css`).
 *
 * Reglas de la derivación (cada una es una decisión, no un descuido):
 *  - El slug de una variable sale del NOMBRE del color o de la familia; para que el slug sea el del
 *    theme.json, un nombre que no da su slug (p. ej. «Naranja Basis» -> accent) se reemplaza por el slug
 *    en palabras («Accent»). El nombre de mostrar del tema (name) no viaja: es cosmético.
 *  - Un color-mix() de la paleta («ink al 15 %») es una TRANSPARENCIA: la base (por referencia a la entrada de la paleta) y su
 *    opacidad. Las sombras y el formulario del tema pintan con color-mix() de colores de la paleta que NO están en la paleta del
 *    tema («ink al 20 %», «dark al 8 %»): el Core sólo admite como color de una sombra una referencia a la paleta o a una
 *    transparencia, así que cada color distinto se declara como una transparencia más. Son entradas EXTRA de la paleta del sitio
 *    destino (inertes: nada del tema las usa) y la prueba de portabilidad las exige declaradas.
 *  - La sombra que usa el formulario (`custom.form.sombra`) no está en `settings.shadow.presets`: se declara como una sombra más
 *    («formulario») para poder referirla.
 *  - Cada tamaño de letra del tema es un rol con el nombre de su slug («10» ... «200», Q1) con la familia de los títulos si mide 42 px o
 *    más y la del cuerpo si no, y un peso e interlineado de base: son relleno técnico, y el rol dice que lo es. NO se declaran los
 *    nueve roles del Core (display, cuerpo…): el plugin sólo exige la forma, y declararlos habría agregado tamaños que el tema no tiene.
 *  - Los pasos de espaciado numéricos viajan con su valor por quiebre; el paso «gutter» (max()/calc()) viaja como margen lateral.
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
    /** color-mix(in srgb, var(--wp--preset--color--<base>) <N>%, transparent) -> [base, N] o null. */
    $como_transparencia = static function (string $c): ?array {
        if (preg_match('/^color-mix\(in srgb, var\(--wp--preset--color--([a-z0-9-]+)\) (\d+(?:\.\d+)?)%, transparent\)$/D', $c, $m) !== 1) {
            return null;
        }
        return [$m[1], $m[2] + 0];
    };

    // --- color: la paleta (hex), y cada color-mix (de la paleta, de una sombra, del formulario) como transparencia
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

    $transparencias = []; // lista de entradas de dim1.req15
    $trans_slug = [];     // slug del preset -> índice
    $trans_por_valor = []; // "base|N" -> índice
    $agregar_transparencia = static function (string $base, $pct, ?string $nombre = null) use (&$transparencias, &$trans_slug, &$trans_por_valor, $donde, $ref): int {
        $clave = $base . '|' . $pct;
        if (isset($trans_por_valor[$clave])) {
            return $trans_por_valor[$clave];
        }
        if (!isset($donde[$base])) {
            throw new RuntimeException('La transparencia se apoya en el color ' . $base . ', que el theme.json no declara');
        }
        $nombre = $nombre ?? ucfirst(str_replace('-', ' ', $base)) . ' ' . $pct;
        $i = count($transparencias);
        $transparencias[] = ['nombre' => $nombre, 'base' => $ref('dim1.req01', [$donde[$base][0], $donde[$base][1]]), 'opacidad' => $pct];
        $trans_slug[COD_ADN_Projection::slug($nombre)] = $i;
        $trans_por_valor[$clave] = $i;
        return $i;
    };
    foreach ($ajustes['color']['palette'] as $c) {
        $t = $como_transparencia((string) $c['color']);
        if ($t === null) {
            continue;
        }
        // El nombre de la entrada: el slug del tema en palabras («ink-15» -> «Ink 15»), que da de vuelta ese slug.
        $agregar_transparencia($t[0], $t[1], ucfirst(str_replace('-', ' ', (string) $c['slug'])));
    }
    /** El color de una parada, de una sombra o del formulario: una referencia a la paleta o a una transparencia. */
    $ref_de_color_css = static function (string $c) use ($como_transparencia, $agregar_transparencia, &$trans_slug, $donde, $ref): ?array {
        if (preg_match('/^var\(--wp--preset--color--([a-z0-9-]+)\)$/D', $c, $m) === 1) {
            if (isset($donde[$m[1]])) {
                return $ref('dim1.req01', [$donde[$m[1]][0], $donde[$m[1]][1]]);
            }
            if (isset($trans_slug[$m[1]])) {
                return $ref('dim1.req15', ['transparencias', $trans_slug[$m[1]]]);
            }
            return null;
        }
        $t = $como_transparencia($c);
        return $t === null ? null : $ref('dim1.req15', ['transparencias', $agregar_transparencia($t[0], $t[1])]);
    };

    // --- degradados
    $degradados = [];
    foreach ($ajustes['color']['gradients'] ?? [] as $g) {
        if (preg_match('/^(linear|radial)-gradient\((?:(\d+(?:\.\d+)?)deg, )?(.+)\)$/D', (string) $g['gradient'], $m) !== 1) {
            throw new RuntimeException('Degradado que no sé leer: ' . $g['gradient']);
        }
        $paradas = [];
        foreach (explode(', ', $m[3]) as $p) {
            if (preg_match('/^(.+) (\d+(?:\.\d+)?)%$/D', $p, $pm) !== 1) {
                throw new RuntimeException('Parada que no sé leer: ' . $p);
            }
            $color = $pm[1] === 'transparent' ? 'transparent' : $ref_de_color_css($pm[1]);
            if ($color === null) {
                throw new RuntimeException('Parada con un color que no sé referir: ' . $pm[1]);
            }
            $paradas[] = ['color' => $color, 'posicion' => $pm[2] + 0];
        }
        $d = ['nombre' => $nombre_para((string) $g['name'], (string) $g['slug']), 'tipo' => $m[1]];
        if ($m[2] !== '') {
            $d['angulo'] = $m[2] + 0;
        }
        $d['paradas'] = $paradas;
        $degradados[] = $d;
    }

    // --- sombras (y la del formulario, que el tema no declara como preset)
    /** "0 4px 10px <color>" o "<color> 0px 24px 72px -12px" -> [x, y, desenfoque, expansion, color-css]. */
    $leer_sombra = static function (string $valor): array {
        $color = '';
        $resto = $valor;
        if (preg_match('/color-mix\((?:[^()]|\([^()]*\))*\)/', $valor, $m, PREG_OFFSET_CAPTURE) === 1) {
            $color = $m[0][0];
            $resto = trim(substr($valor, 0, (int) $m[0][1]) . ' ' . substr($valor, (int) $m[0][1] + strlen($color)));
        }
        $medidas = preg_split('/\s+/', $resto) ?: [];
        $medidas = array_map(static fn ($x) => preg_match('/^-?0$/D', $x) === 1 ? '0px' : $x, $medidas);
        while (count($medidas) < 4) {
            $medidas[] = '0px';
        }
        return [$medidas[0], $medidas[1], $medidas[2], $medidas[3], $color];
    };
    $sombras = [];
    $sombra_idx = []; // "x|y|b|e|color" -> índice
    $agregar_sombra = static function (string $nombre, string $valor) use (&$sombras, &$sombra_idx, $leer_sombra, $ref_de_color_css): int {
        [$x, $y, $b, $e, $color] = $leer_sombra($valor);
        $clave = implode('|', [$x, $y, $b, $e, $color]);
        if (isset($sombra_idx[$clave])) {
            return $sombra_idx[$clave];
        }
        $c = $ref_de_color_css($color);
        if ($c === null) {
            throw new RuntimeException('Sombra con un color que no sé referir: ' . $valor);
        }
        $sombra_idx[$clave] = count($sombras);
        $sombras[] = ['nombre' => $nombre, 'x' => $x, 'y' => $y, 'desenfoque' => $b, 'expansion' => $e, 'color' => $c];
        return $sombra_idx[$clave];
    };
    foreach ($ajustes['shadow']['presets'] ?? [] as $s) {
        $agregar_sombra((string) $s['slug'], (string) $s['shadow']);
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

    // --- valores por punto de quiebre: el bloque de CSS de las escalas con quiebres
    $por_quiebre = ['tablet' => [], 'mobile' => []]; // variable -> valor
    $quiebres = [];
    $css = (string) ($tema['styles']['css'] ?? '');
    if (preg_match('#/\*cod-escalas-con-quiebres\*/(.*?)/\*/cod-escalas-con-quiebres\*/#s', $css, $bloque) === 1) {
        preg_match_all('/@media ([^{]+)\{:root\{([^}]*)\}\}/', $bloque[1], $medias, PREG_SET_ORDER);
        foreach ($medias as $md) {
            $nombre_q = strpos($md[1], 'min-width') !== false ? 'tablet' : 'mobile';
            $q = ['nombre' => $nombre_q];
            if (preg_match('/min-width: ([^)]+)\)/', $md[1], $mm) === 1) {
                $q['desde'] = $mm[1];
            }
            preg_match('/max-width: ([^)]+)\)/', $md[1], $mm);
            $q['hasta'] = $mm[1];
            $quiebres[] = $q;
            foreach (array_filter(explode(';', $md[2])) as $decl) {
                [$variable, $valor] = explode(':', $decl, 2);
                $por_quiebre[$nombre_q][$variable] = $valor;
            }
        }
    }
    $quiebres_de = static function (string $variable) use ($por_quiebre): ?array {
        $lista = [];
        foreach (['tablet', 'mobile'] as $q) {
            if (isset($por_quiebre[$q][$variable])) {
                $lista[] = ['quiebre' => $q, 'valor' => $por_quiebre[$q][$variable]];
            }
        }
        return $lista === [] ? null : $lista;
    };

    // --- roles tipográficos: un rol por tamaño del tema (relleno técnico), con su tamaño por quiebre
    $estilos = [];
    $indice_rol = [];
    foreach ($ajustes['typography']['fontSizes'] as $t) {
        $px = (float) $t['size'];
        $r = ['role' => (string) $t['slug'], 'family' => $fam($px >= 42 ? 'display' : 'body'), 'fontSize' => (string) $t['size'], 'fontWeight' => 400, 'lineHeight' => 1.7];
        $q = $quiebres_de('--wp--preset--font-size--' . $t['slug']);
        if ($q !== null) {
            $r['porQuiebre'] = array_map(static fn ($x) => ['quiebre' => $x['quiebre'], 'fontSize' => $x['valor']], $q);
        }
        $r['source'] = 'theme.json (derivado; peso e interlineado de base, relleno técnico)';
        $r['derivation'] = ['of' => 'dim2.req01'];
        $indice_rol[(string) $t['slug']] = count($estilos);
        $estilos[] = $r;
    }

    // --- pesos e interlineados con nombre
    $pesos = [];
    foreach ($ajustes['custom']['typography']['fontWeight'] ?? [] as $nombre => $valor) {
        $pesos[] = ['nombre' => (string) $nombre, 'valor' => $valor + 0];
    }
    $interlineados = [];
    foreach ($ajustes['custom']['typography']['lineHeight'] ?? [] as $nombre => $valor) {
        $interlineados[] = ['nombre' => (string) $nombre, 'valor' => $valor + 0];
    }

    // --- espaciado
    $escala = [];
    $indice_paso = [];
    $gutter = null;
    foreach ($ajustes['spacing']['spacingSizes'] as $s) {
        if (preg_match('/^\d+$/', (string) $s['slug']) !== 1) {
            if (preg_match('/^max\((.+), calc\(\(100% - (var\(--wp--style--global--content-size\)|[^)]+)\) \/ 2\)\)$/D', (string) $s['size'], $gm) === 1 && (string) $s['slug'] === 'gutter') {
                $gutter = ['nombre' => 'gutter', 'minimo' => $gm[1], 'contenedor' => $ref('dim3.req05', ['contenedores', 0])];
            }
            continue;
        }
        $indice_paso[(int) $s['slug']] = count($escala);
        $paso = ['step' => (int) $s['slug'], 'value' => (string) $s['size']];
        $q = $quiebres_de('--wp--preset--spacing--' . $s['slug']);
        if ($q !== null) {
            $paso['porQuiebre'] = array_map(static fn ($x) => ['quiebre' => $x['quiebre'], 'value' => $x['valor']], $q);
        }
        $escala[] = $paso;
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
    $medidas = [];
    foreach ($ajustes['custom']['layout']['measure'] ?? [] as $nombre => $valor) {
        $medidas[] = ['nombre' => (string) $nombre, 'valor' => (string) $valor];
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
    $grosores = [];
    foreach ($ajustes['custom']['border'] ?? [] as $nombre => $valor) {
        $grosores[] = ['nombre' => (string) $nombre, 'valor' => (string) $valor];
    }
    $desenfoques = [];
    foreach ($ajustes['custom']['blur'] ?? [] as $nombre => $valor) {
        $desenfoques[] = ['nombre' => (string) $nombre, 'valor' => (string) $valor];
    }

    // --- el tema del formulario: las 68 variables de custom.form, cada una en el grupo que le toca
    $tema_form = null;
    if (isset($ajustes['custom']['form'])) {
        $form = $ajustes['custom']['form'];
        $grupos = ['colores' => [], 'tipografia' => [], 'medidas' => [], 'sombras' => []];
        foreach ($form as $variable => $valor) {
            $valor = (string) $valor;
            if (in_array($variable, COD_ADN_Requisitos::FORM_COLORES, true)) {
                $grupos['colores'][$variable] = $valor === 'transparent' ? 'transparent' : ($ref_de_color_css($valor) ?? $valor);
            } elseif ($variable === 'tipografia') {
                preg_match('/^var\(--wp--preset--font-family--([a-z0-9-]+)\)$/D', $valor, $fm);
                $grupos['tipografia']['familia'] = $ref('dim2.req01', ['familias', $indice_familia[$fm[1]]]);
            } elseif (in_array($variable, COD_ADN_Requisitos::FORM_TAMANOS, true)) {
                $grupos['tipografia'][$variable] = $valor;
            } elseif (in_array($variable, array_merge(COD_ADN_Requisitos::FORM_PESOS, COD_ADN_Requisitos::FORM_INTERLINEADOS), true)) {
                $grupos['tipografia'][$variable] = $valor + 0;
            } elseif (in_array($variable, COD_ADN_Requisitos::FORM_SOMBRAS, true)) {
                $grupos['sombras'][$variable] = $valor === 'none' ? 'none' : $ref('dim4.req09', ['sombras', $agregar_sombra('formulario', $valor)]);
            } elseif (in_array($variable, array_merge(COD_ADN_Requisitos::FORM_MEDIDAS, COD_ADN_Requisitos::FORM_ALINEACIONES, ['casillaApariencia']), true)) {
                $grupos['medidas'][$variable] = $valor;
            } else {
                throw new RuntimeException('Variable de formulario que el Core no declara: ' . $variable);
            }
        }
        $tema_form = array_filter($grupos);
    }

    $d = static function (string $id, string $categoria, string $nombre, array $valor) use ($humano): array {
        return ['id' => $id, 'category' => $categoria, 'name' => $nombre, 'value' => $valor] + $humano();
    };
    $defs = [
        $d('dim1.req01.def1', 'color', 'Paleta', ['institucionales' => $inst, 'neutros' => $neut]),
        $d('dim1.req02.def1', 'color', 'Roles de color', ['roleColors' => $roles_color]),
        $d('dim1.req15.def1', 'color', 'Transparencias', $transparencias === [] ? ['sinTransparencias' => 'el tema no declara ninguna'] : ['transparencias' => $transparencias]),
        $d('dim1.req16.def1', 'color', 'Degradados', $degradados === [] ? ['sinDegradados' => 'el tema no declara ninguno'] : ['degradados' => $degradados]),
        $d('dim2.req01.def1', 'typography', 'Familias', ['familias' => $familias]),
        $d('dim2.req02.def1', 'typography', 'Roles tipográficos y escala de tamaños', ['roleStyles' => $estilos]),
        $d('dim2.req07.def1', 'typography', 'Correspondencia con Configuración', ['correspondencias' => [
            ['campoPlano' => 'font_heading', 'role' => $ref('dim2.req02', ['roleStyles', $indice_rol['200']]), 'nota' => 'fixture: el mayor de los tamaños, en la familia de los títulos'],
            ['campoPlano' => 'font_body', 'role' => $ref('dim2.req02', ['roleStyles', $indice_rol['40']]), 'nota' => 'fixture: un tamaño de cuerpo, en la familia del cuerpo'],
        ]]),
        $d('dim2.req09.def1', 'typography', 'Pesos e interlineados', ($pesos === [] && $interlineados === []) ? ['sinEscalas' => 'el tema no declara ninguna'] : ['pesos' => $pesos, 'interlineados' => $interlineados]),
        $d('dim3.req01.def1', 'spacing', 'Escala de espacio', ['unidad' => '1px', 'escala' => $escala]),
        $d('dim3.req02.def1', 'spacing', 'Roles de espacio', ['roleSpacing' => $rol_espacio]),
        $d('dim3.req05.def1', 'spacing', 'Contenedores', ['contenedores' => $contenedores]),
        $d('dim3.req10.def1', 'spacing', 'Puntos de quiebre', $quiebres === [] ? ['sinQuiebres' => 'el tema no declara valores por quiebre'] : ['quiebres' => $quiebres]),
        $d('dim3.req11.def1', 'spacing', 'Margen lateral', $gutter === null ? ['sinMargenLateral' => 'el tema no declara un gutter'] : ['margenLateral' => $gutter]),
        $d('dim3.req12.def1', 'spacing', 'Medidas de texto', $medidas === [] ? ['sinMedidas' => 'el tema no declara ninguna'] : ['medidas' => $medidas]),
        $d('dim4.req01.def1', 'shape', 'Roles de forma', ['roles' => $roles_forma]),
        $d('dim4.req02.def1', 'shape', 'Formas', ['formas' => $formas]),
        $d('dim4.req09.def1', 'shape', 'Sombras', $sombras === [] ? ['sinSombras' => 'el tema no declara ninguna'] : ['sombras' => $sombras]),
        $d('dim4.req10.def1', 'shape', 'Grosores de borde', $grosores === [] ? ['sinGrosores' => 'el tema no declara ninguno'] : ['grosores' => $grosores]),
        $d('dim4.req11.def1', 'shape', 'Desenfoques', $desenfoques === [] ? ['sinDesenfoques' => 'el tema no declara ninguno'] : ['desenfoques' => $desenfoques]),
    ];
    if ($tema_form !== null) {
        $defs[] = $d('dim7.req09.def1', 'interaction', 'Tema del formulario', ['temaFormulario' => $tema_form]);
    }
    $defs[] = $d('dim8.req03.def1', 'motion', 'Duraciones', ['escala' => [['nombre' => 'enter', 'duracion' => 420], ['nombre' => 'response', 'duracion' => 160]], 'ritmo' => ['descripcion' => 'fixture', 'sinPausas' => 'sin pausas']]);
    $defs[] = $d('dim8.req04.def1', 'motion', 'Movimientos', ['movimientos' => [
        ['caso' => 'enter', 'curva' => 'cubic-bezier(.34,1.56,.64,1)', 'trayectoria' => 'fixture', 'continuidadEspacial' => 'fixture', 'tiempo' => $ref('dim8.req03', ['escala', 0, 'duracion'])],
        ['caso' => 'response', 'curva' => 'ease', 'trayectoria' => 'fixture', 'continuidadEspacial' => 'fixture', 'tiempo' => $ref('dim8.req03', ['escala', 1, 'duracion'])],
    ], 'sinAmplitud' => 'fixture: sin amplitud']);
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
