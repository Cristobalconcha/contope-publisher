<?php
/**
 * Compara dos `settings` de theme.json (el de referencia, p. ej. el que sirve el local de Basis, y el que sirve el sitio importado)
 * y devuelve las diferencias, una por ruta. Sirve a la prueba de portabilidad (scripts/probar-adn-proyeccion.php) y a
 * scripts/adn/probar-proyeccion-completa.php.
 *
 * Acepta las dos formas en que llegan los presets: la cruda del archivo (lista) y la de `wp_get_global_settings()`
 * (`{default, theme, custom}`, de las que toma `theme`).
 *
 * Es ESTRICTA: todo el árbol de `settings` tiene que ser igual, con estas excepciones, todas declaradas y de a una:
 *  - `custom.adn`: el sello del propio ADN (designId, revisión, digest).
 *  - el ORDEN de la paleta: el ADN la lleva en dos listas (institucionales y neutros), no en el orden del archivo. Se compara por slug.
 *  - el `name` de un color o de una familia cuyo slug NO es slug(nombre): el slug de la variable sale del nombre y ese nombre de
 *    mostrar no puede viajar (COD_ADN_Theme::fuera_del_adn()).
 *  - el TEXTO de una sombra (el preset y `custom.form.sombra|botonSombra`): el ADN la escribe «x y desenfoque expansión color» y el
 *    tema la escribió a mano en otro orden («0 4px 10px color», «color 0 24px 72px -12px»). Se compara lo que dibuja: las cuatro
 *    medidas (0 = 0px, la expansión que falta vale 0) y el color.
 *  - las entradas EXTRA que `$extras` declara: colores de la paleta y sombras que el ADN necesita para poder referir lo que el tema
 *    escribe a mano (el color de una sombra tiene que ser una referencia a la paleta o a una transparencia), y las claves de
 *    `custom` que el ADN agrega porque lleva lo que el local guarda en Configuración y no en el archivo (los roles de espacio y el
 *    movimiento). Cada extra declarado TIENE que estar en el destino y NO estar en la referencia.
 *
 * @param array<string, mixed> $ref
 * @param array<string, mixed> $dest
 * @param array{paleta?: array<int, string>, sombras?: array<int, string>, custom?: array<int, string>} $extras lo que sólo el destino lleva
 * @return array<int, string>
 */
function comparar_ajustes(array $ref, array $dest, array $extras = []): array
{
    $dif = [];
    $ref = ajustes_comparables($ref);
    $dest = ajustes_comparables($dest);

    // --- las claves de `custom` que el ADN agrega y el archivo del tema no declara (declaradas)
    foreach ($extras['custom'] ?? [] as $clave) {
        if (isset($ref['custom'][$clave])) {
            $dif[] = "custom.$clave: el extra declarado ya estaba en la referencia";
        }
        if (!isset($dest['custom'][$clave])) {
            $dif[] = "custom.$clave: el extra declarado no llegó al destino";
        }
        unset($dest['custom'][$clave]);
    }

    // --- las entradas extra declaradas
    foreach (['paleta' => ['color', 'palette'], 'sombras' => ['shadow', 'presets']] as $clave => [$a, $b]) {
        $en_ref = array_column($ref[$a][$b] ?? [], null, 'slug');
        $en_dest = array_column($dest[$a][$b] ?? [], null, 'slug');
        foreach ($extras[$clave] ?? [] as $slug) {
            if (isset($en_ref[$slug])) {
                $dif[] = "{$a}.{$b}: el extra declarado «{$slug}» ya estaba en la referencia";
            }
            if (!isset($en_dest[$slug])) {
                $dif[] = "{$a}.{$b}: el extra declarado «{$slug}» no llegó al destino";
            }
            unset($en_dest[$slug]);
        }
        $ref[$a][$b] = array_values($en_ref);
        $dest[$a][$b] = array_values(array_filter($dest[$a][$b] ?? [], static fn ($p): bool => !in_array($p['slug'] ?? '', $extras[$clave] ?? [], true)));
    }

    // --- la paleta, por slug y sin el orden
    $por_slug = static function (array $lista): array {
        $out = [];
        foreach ($lista as $p) {
            $out[(string) $p['slug']] = $p;
        }
        ksort($out);
        return $out;
    };
    $nombre_viaja = static function (array $p): bool {
        return COD_ADN_Projection::slug((string) ($p['name'] ?? '')) === (string) $p['slug'];
    };
    $pal_ref = $por_slug($ref['color']['palette'] ?? []);
    $pal_dest = $por_slug($dest['color']['palette'] ?? []);
    foreach ($pal_ref as $slug => $p) {
        if (!isset($pal_dest[$slug])) {
            $dif[] = "color.palette: falta «{$slug}»";
            continue;
        }
        if (!$nombre_viaja($p)) {
            unset($p['name'], $pal_dest[$slug]['name']);
        }
        if (canon_json($p) !== canon_json($pal_dest[$slug])) {
            $dif[] = "color.palette[$slug]: " . canon_json($p) . ' contra ' . canon_json($pal_dest[$slug]);
        }
    }
    foreach (array_diff(array_keys($pal_dest), array_keys($pal_ref)) as $sobra) {
        $dif[] = "color.palette: sobra «{$sobra}»";
    }
    unset($ref['color']['palette'], $dest['color']['palette']);

    // --- las familias: el nombre sólo cuenta si da su slug
    foreach (($ref['typography']['fontFamilies'] ?? []) as $i => $f) {
        if (!$nombre_viaja($f)) {
            unset($ref['typography']['fontFamilies'][$i]['name'], $dest['typography']['fontFamilies'][$i]['name']);
        }
    }

    // --- las sombras, por lo que dibujan
    $ref_sombras = $ref['shadow']['presets'] ?? [];
    $dest_sombras = $dest['shadow']['presets'] ?? [];
    if (count($ref_sombras) !== count($dest_sombras)) {
        $dif[] = 'shadow.presets: ' . count($ref_sombras) . ' en la referencia y ' . count($dest_sombras) . ' en el destino';
    }
    foreach ($ref_sombras as $i => $p) {
        $q = $dest_sombras[$i] ?? null;
        if ($q === null) {
            continue;
        }
        if ((string) $p['slug'] !== (string) $q['slug'] || (string) ($p['name'] ?? '') !== (string) ($q['name'] ?? '') || sombra_normalizada((string) $p['shadow']) !== sombra_normalizada((string) $q['shadow'])) {
            $dif[] = 'shadow.presets[' . $p['slug'] . ']: «' . $p['shadow'] . '» contra «' . $q['shadow'] . '»';
        }
    }
    unset($ref['shadow']['presets'], $dest['shadow']['presets']);
    foreach (['sombra', 'botonSombra'] as $v) {
        if (isset($ref['custom']['form'][$v])) {
            if (!isset($dest['custom']['form'][$v]) || sombra_normalizada((string) $ref['custom']['form'][$v]) !== sombra_normalizada((string) $dest['custom']['form'][$v])) {
                $dif[] = "custom.form.$v: «" . $ref['custom']['form'][$v] . '» contra «' . ($dest['custom']['form'][$v] ?? '(falta)') . '»';
            }
            unset($ref['custom']['form'][$v], $dest['custom']['form'][$v]);
        }
    }

    // --- el resto, igual a igual
    return array_merge($dif, diferencias_de_arbol($ref, $dest, ''));
}

/** Los `settings` con los presets como listas (la forma cruda) y sin el sello del ADN. @param array<string, mixed> $s @return array<string, mixed> */
function ajustes_comparables(array $s): array
{
    foreach ([['color', 'palette'], ['color', 'gradients'], ['shadow', 'presets'], ['typography', 'fontSizes'], ['typography', 'fontFamilies'], ['spacing', 'spacingSizes']] as [$a, $b]) {
        if (isset($s[$a][$b]) && is_array($s[$a][$b]) && array_key_exists('theme', $s[$a][$b])) {
            $s[$a][$b] = $s[$a][$b]['theme'];
        } elseif (isset($s[$a][$b]) && is_array($s[$a][$b]) && (array_key_exists('default', $s[$a][$b]) || array_key_exists('custom', $s[$a][$b]))) {
            unset($s[$a][$b]); // sin lista del tema
        }
    }
    unset($s['custom']['adn']);
    return $s;
}

/** Un valor como JSON con las claves ordenadas (para comparar mapas sin mirar su orden). @param mixed $v */
function canon_json($v): string
{
    $orden = static function ($x) use (&$orden) {
        if (!is_array($x)) {
            return $x;
        }
        $es_lista = $x === [] || array_keys($x) === range(0, count($x) - 1);
        $y = array_map($orden, $x);
        if (!$es_lista) {
            ksort($y);
        }
        return $y;
    };
    return (string) json_encode($orden($v), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * Lo que dibuja una sombra: «x|y|desenfoque|expansión|color», con 0 = 0px y la expansión que falta valiendo 0, sin importar si el
 * color va antes o después de las medidas.
 */
function sombra_normalizada(string $valor): string
{
    $color = '';
    $resto = $valor;
    if (preg_match('/color-mix\((?:[^()]|\([^()]*\))*\)/', $valor, $m, PREG_OFFSET_CAPTURE) === 1) {
        $color = $m[0][0];
        $resto = trim(substr($valor, 0, (int) $m[0][1]) . ' ' . substr($valor, (int) $m[0][1] + strlen($color)));
    }
    $medidas = array_values(array_filter(preg_split('/\s+/', $resto) ?: [], static fn ($x): bool => $x !== ''));
    $medidas = array_map(static fn ($x): string => preg_match('/^-?0(?:px)?$/D', $x) === 1 ? '0' : $x, $medidas);
    while (count($medidas) < 4) {
        $medidas[] = '0';
    }
    return implode('|', array_merge($medidas, [$color]));
}

/**
 * Las diferencias entre dos árboles, una por ruta hoja.
 *
 * @param mixed $a
 * @param mixed $b
 * @return array<int, string>
 */
function diferencias_de_arbol($a, $b, string $ruta): array
{
    if (is_array($a) && is_array($b)) {
        $out = [];
        $es_lista_a = $a === [] || array_keys($a) === range(0, count($a) - 1);
        if ($es_lista_a && $b !== [] && array_keys($b) === range(0, count($b) - 1)) {
            if (count($a) !== count($b)) {
                $out[] = ($ruta === '' ? '(raíz)' : $ruta) . ': lista de ' . count($a) . ' elementos contra ' . count($b);
            }
            foreach ($a as $i => $x) {
                if (array_key_exists($i, $b)) {
                    $out = array_merge($out, diferencias_de_arbol($x, $b[$i], $ruta . '[' . $i . ']'));
                }
            }
            return $out;
        }
        foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $k) {
            $r = $ruta === '' ? (string) $k : $ruta . '.' . $k;
            if (!array_key_exists($k, $a)) {
                $out[] = "$r: sobra en el destino";
            } elseif (!array_key_exists($k, $b)) {
                $out[] = "$r: falta en el destino";
            } else {
                $out = array_merge($out, diferencias_de_arbol($a[$k], $b[$k], $r));
            }
        }
        return $out;
    }
    return $a === $b ? [] : [($ruta === '' ? '(raíz)' : $ruta) . ': ' . json_encode($a, JSON_UNESCAPED_UNICODE) . ' contra ' . json_encode($b, JSON_UNESCAPED_UNICODE)];
}
