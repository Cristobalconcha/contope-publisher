<?php
/**
 * La proyección COMPLETA del ADN sobre el theme.json, sin WordPress (02-nov-2026, pedidos Q1, Q3 y Q4 al Core).
 *
 * Deriva un ADN completo del theme.json CONGELADO de Basis (fixtures/adn/f2/basis-theme.local-5e118c5.json), lo valida con el
 * validador del plugin, lo proyecta con COD_ADN_Projection y compara `settings` con el del archivo: TODO el árbol tiene que ser
 * igual (scripts/adn/lib/comparar-ajustes.php dice las pocas excepciones, una por una). Es la versión sin servidor de la prueba de
 * portabilidad: la que la completa, con el WordPress limpio y el navegador, es scripts/adn/probar-portabilidad-presets.mjs.
 *
 * Puede fallar de verdad: cada pieza nueva tiene su CONTROL (quitarla del ADN HACE FALLAR la comparación), y el piso de cada
 * comparación (cuántas transparencias, degradados, sombras, variables del formulario…) impide compararlas en vacío.
 *
 * Uso:  php scripts/probar-adn-theme-json.php
 */
define('ABSPATH', __DIR__ . '/');
if (!class_exists('WP_Error')) {
    // La proyección sólo usa WP_Error cuando dos definiciones empatan; aquí basta un doble mínimo.
    class WP_Error
    {
        /** @var string */
        public $code;
        /** @var string */
        public $message;

        public function __construct($code = '', $message = '')
        {
            $this->code = $code;
            $this->message = $message;
        }

        public function add_data($d): void
        {
        }
    }
}
$plugin = realpath(__DIR__ . '/../contope-publisher/includes');
foreach (['js', 'design-md', 'parser', 'projection', 'requisitos', 'validator', 'theme'] as $parte) {
    require_once $plugin . '/class-cod-adn-' . $parte . '.php';
}
require __DIR__ . '/adn/lib/adn-desde-theme-json.php';
require __DIR__ . '/adn/lib/comparar-ajustes.php';

$fallas = 0;
$ejecutadas = 0;
$comprobar = static function (string $caso, bool $ok, string $detalle = '') use (&$fallas, &$ejecutadas): void {
    ++$ejecutadas;
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . ($detalle !== '' && !$ok ? '   -> ' . $detalle : '') . "\n";
    if (!$ok) {
        ++$fallas;
    }
};

$raiz = realpath(__DIR__ . '/..');
$F_LOCAL = $raiz . '/fixtures/adn/f2/basis-theme.local-5e118c5.json';
$ref = json_decode((string) file_get_contents($F_LOCAL), true);
/** Las entradas que sólo el destino lleva: lo que el ADN necesita para referir el color de las sombras y del formulario. */
$EXTRAS = ['paleta' => ['ink-20', 'ink-12', 'dark-8'], 'sombras' => ['formulario'], 'custom' => ['spacing', 'motion']];
$F_ATRASADO = $raiz . '/fixtures/adn/f2/basis-theme.destino-atrasado-b7b0478.json';
$atrasado = json_decode((string) file_get_contents($F_ATRASADO), true);
/** Lo que serviría un sitio con el theme.json ATRASADO de producción y este ADN encima (la misma mezcla que hace WordPress con el filtro). */
$sobre_atrasado = static function (array $proyeccion) use ($atrasado): array {
    return COD_ADN_Theme::mezclar($atrasado, $proyeccion['themeJson'])['settings'];
};

/** @return array{ok: bool, validacion: array<string, mixed>, proyeccion: array<string, mixed>|null, errores: array<int, array<string, mixed>>} */
$proyectar = static function (string $json): array {
    $v = COD_ADN_Validator::validar($json, ['emitirPropuestas' => false]);
    if (!$v['ok']) {
        return ['ok' => false, 'validacion' => $v, 'proyeccion' => null, 'errores' => $v['errores']];
    }
    $p = COD_ADN_Projection::construir($v['contrato'], $v);
    return ['ok' => is_array($p), 'validacion' => $v, 'proyeccion' => is_array($p) ? $p : null, 'errores' => []];
};

echo "\n== 1. el ADN completo derivado del theme.json de Basis es válido y se proyecta ==\n";
$json = adn_desde_theme_json($F_LOCAL, ['revision' => 1]);
$r = $proyectar($json);
$comprobar('el ADN derivado pasa el validador del plugin (forma, nombres y referencias)', $r['ok'], json_encode(array_slice($r['errores'], 0, 2), JSON_UNESCAPED_UNICODE));
if (!$r['ok']) {
    echo "\nFALLARON $fallas de $ejecutadas\n";
    exit(1);
}
$def = $r['validacion']['definiciones'];
$nuevos = ['dim1.req15', 'dim1.req16', 'dim2.req09', 'dim3.req10', 'dim3.req11', 'dim3.req12', 'dim4.req09', 'dim4.req10', 'dim4.req11', 'dim7.req09'];
$no_emitidos = array_filter($nuevos, static fn (string $q): bool => empty($def[$q . '.def1']['emitida']));
$comprobar('las 10 definiciones nuevas quedan EMITIDAS (ninguna ignorada)', $no_emitidos === [], implode(', ', $no_emitidos));
$comprobar('la proyección no avisa de nada (sin colisiones de slug, degradados incompletos, referencias sin color…)', $r['proyeccion']['avisos'] === [], json_encode($r['proyeccion']['avisos'], JSON_UNESCAPED_UNICODE));
$proy = $r['proyeccion'];
$ajustes = $sobre_atrasado($proy);

echo "\n== 2. settings del theme.json ATRASADO + el ADN == settings de Basis (todo el árbol) ==\n";
$dif = comparar_ajustes($ref['settings'], $ajustes, $EXTRAS);
foreach (array_slice($dif, 0, 15) as $d) {
    echo '           ' . $d . "\n";
}
$comprobar('IGUALES: ' . count($dif) . ' diferencia(s) entre `settings` de Basis y los del theme.json atrasado con el ADN encima (salvo los extras declarados: 3 colores, 1 sombra, custom.spacing y custom.motion)', $dif === [], (string) count($dif));
$comprobar('piso: 14 colores del tema + 3 extras (ink-20, ink-12, dark-8) en la paleta; 2 degradados; 3 sombras + la del formulario; 20 tamaños; 32 espaciados (31 + gutter)',
    count($ajustes['color']['palette']) === 17 && count($ajustes['color']['gradients']) === 2 && count($ajustes['shadow']['presets']) === 4 && count($ajustes['typography']['fontSizes']) === 20 && count($ajustes['spacing']['spacingSizes']) === 32,
    json_encode([count($ajustes['color']['palette']), count($ajustes['color']['gradients']), count($ajustes['shadow']['presets']), count($ajustes['typography']['fontSizes']), count($ajustes['spacing']['spacingSizes'])]));
$comprobar('piso: custom con radius, border, typography (6 pesos y 9 interlineados), layout.measure, blur y las 68 variables de form',
    count($ajustes['custom']['radius'] ?? []) === 6 && count($ajustes['custom']['border'] ?? []) === 2 && count($ajustes['custom']['typography']['fontWeight'] ?? []) === 6 && count($ajustes['custom']['typography']['lineHeight'] ?? []) === 9
    && count($ajustes['custom']['layout']['measure'] ?? []) === 2 && count($ajustes['custom']['blur'] ?? []) === 1 && count($ajustes['custom']['form'] ?? []) === 68,
    json_encode(array_map('count', $ajustes['custom'])));
$agregadas = array_values(array_diff(array_keys($ajustes['custom']), array_keys($ref['settings']['custom']), ['adn']));
sort($agregadas);
$comprobar('las únicas claves de `custom` que el ADN agrega al tema son los roles de espacio y el movimiento (y no hay custom.typography.<rol> por rol)', $agregadas === ['motion', 'spacing'], json_encode($agregadas));
$comprobar('los nombres de los pasos son los de Configuración: «30 (16px / 15px / 14px)», «20 (4px)» y el gutter', (function () use ($ajustes) {
    $tam = array_column($ajustes['typography']['fontSizes'], 'name', 'slug');
    $esp = array_column($ajustes['spacing']['spacingSizes'], 'name', 'slug');
    return ($tam['30'] ?? '') === '30 (16px / 15px / 14px)' && ($tam['180'] ?? '') === '180 (50px / 50px / 34px)' && ($esp['20'] ?? '') === '20 (4px)' && ($esp['10'] ?? '') === '10 (0px / 0px / 20px)'
        && ($esp['gutter'] ?? '') === 'gutter (max(10%, calc((100% - var(--wp--style--global--content-size)) / 2)))';
})());
$comprobar('settings.shadow.defaultPresets y settings.color.defaultGradients quedan apagados (el ADN es la autoridad)', ($ajustes['shadow']['defaultPresets'] ?? null) === false && ($ajustes['color']['defaultGradients'] ?? null) === false);

echo "\n== 3. styles.css: los valores por punto de quiebre ==\n";
$css_ref = (string) $ref['styles']['css'];
preg_match('#/\*cod-escalas-con-quiebres\*/.*?/\*/cod-escalas-con-quiebres\*/#s', $css_ref, $m_ref);
$bloque = (string) ($proy['themeJson']['styles']['css'] ?? '');
$comprobar('el bloque de CSS del ADN es BYTE A BYTE el del theme.json de Basis (mismas variables, mismo orden, mismos anchos de pantalla)', $bloque !== '' && ($m_ref[0] ?? null) === $bloque, substr($bloque, 0, 160));
$comprobar('piso: el bloque declara las variables de 7 tamaños y 13 espaciados en tablet y de 9 y 15 en celular',
    substr_count(explode('@media (max-width', $bloque)[0], '--wp--preset--font-size--') === 7 && substr_count(explode('@media (max-width', $bloque)[0], '--wp--preset--spacing--') === 13
    && substr_count(explode('@media (max-width', $bloque)[1] ?? '', '--wp--preset--font-size--') === 9 && substr_count(explode('@media (max-width', $bloque)[1] ?? '', '--wp--preset--spacing--') === 15);
$con = COD_ADN_Theme::con_bloque_de_quiebres((string) $ref['styles']['css'], $bloque);
$comprobar('empalmar el bloque sobre el CSS de Basis lo deja IGUAL (no duplica ni pisa el CSS de los estilos de bloque)', $con === trim($css_ref) || preg_replace('/\s+/', '', $con) === preg_replace('/\s+/', '', $css_ref), strlen($con) . ' contra ' . strlen($css_ref));
$comprobar('y sobre un CSS ajeno agrega el bloque al final y conserva lo que había', COD_ADN_Theme::con_bloque_de_quiebres('a{b:c}', $bloque) === "a{b:c}\n" . $bloque && COD_ADN_Theme::con_bloque_de_quiebres('', $bloque) === $bloque);
$comprobar('rehacer el empalme es idempotente', COD_ADN_Theme::con_bloque_de_quiebres(COD_ADN_Theme::con_bloque_de_quiebres('a{b:c}', $bloque), $bloque) === "a{b:c}\n" . $bloque);

echo "\n== 4. CONTROLES: quitar cada pieza del ADN hace fallar la comparación ==\n";
$sin = static function (callable $quitar) use ($json, $proyectar, $ref, $EXTRAS, $sobre_atrasado): array {
    $c = json_decode($json, false);
    $quitar($c);
    $r = $proyectar((string) json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
    if (!$r['ok']) {
        return ['invalido' => true, 'dif' => array_map(static fn ($e): string => 'el ADN deja de ser válido: ' . (string) ($e['codigo'] ?? '?'), $r['errores'])];
    }
    return ['invalido' => false, 'dif' => comparar_ajustes($ref['settings'], $sobre_atrasado($r['proyeccion']), $EXTRAS), 'proyeccion' => $r['proyeccion']];
};
$definicion = static function (stdClass $c, string $id): stdClass {
    foreach ($c->definitions as $d) {
        if ($d->id === $id) {
            return $d;
        }
    }
    throw new RuntimeException($id);
};
$control = static function (string $titulo, callable $quitar, ?string $esperado = null) use ($sin, $comprobar): void {
    $r = $sin($quitar);
    $visto = $r['dif'] !== [] && ($esperado === null || strpos(implode(' ', $r['dif']), $esperado) !== false);
    $comprobar("control: $titulo → la comparación lo ve", $visto, $esperado . ' | ' . json_encode(array_slice($r['dif'], 0, 2), JSON_UNESCAPED_UNICODE));
};
$control('una transparencia de la paleta con otra opacidad (ink 15 % -> 16 %)', static function (stdClass $c) use ($definicion): void {
    foreach ($definicion($c, 'dim1.req15.def1')->value->transparencias as $t) {
        if ($t->nombre === 'Ink 15') {
            $t->opacidad = 16;
        }
    }
}, 'ink-15');
$control('sin los degradados', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim1.req16.def1')->value = (object) ['sinDegradados' => 'quitados a propósito'];
}, 'gradients');
$control('sin las sombras (se declara la ausencia)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim4.req09.def1')->value = (object) ['sinSombras' => 'quitadas a propósito'];
});
$control('sin los pesos e interlineados con nombre', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim2.req09.def1')->value = (object) ['sinEscalas' => 'quitadas a propósito'];
}, 'typography');
$control('sin el margen lateral (gutter)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim3.req11.def1')->value = (object) ['sinMargenLateral' => 'quitado a propósito'];
}, 'spacingSizes');
$control('sin las medidas de texto', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim3.req12.def1')->value = (object) ['sinMedidas' => 'quitadas a propósito'];
}, 'custom.layout');
$control('sin los grosores de borde', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim4.req10.def1')->value = (object) ['sinGrosores' => 'quitados a propósito'];
}, 'custom.border');
$control('sin los desenfoques', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim4.req11.def1')->value = (object) ['sinDesenfoques' => 'quitados a propósito'];
}, 'custom.blur');
$control('sin el tema del formulario (68 variables)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim7.req09.def1')->value = (object) ['sinTemaFormulario' => 'quitado a propósito'];
}, 'custom.form');
$control('una variable del formulario con otro valor (botonRadio 3px -> 4px)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim7.req09.def1')->value->temaFormulario->medidas->botonRadio = '4px';
}, 'botonRadio');
$control('un tamaño sin su valor por quiebre (el rol 30 pierde el de tablet)', static function (stdClass $c) use ($definicion): void {
    foreach ($definicion($c, 'dim2.req02.def1')->value->roleStyles as $r) {
        if ($r->role === '30') {
            $r->porQuiebre = [$r->porQuiebre[1]];
        }
    }
}, 'fontSizes');
$r_sin_css = $sin(static function (stdClass $c) use ($definicion): void {
    foreach ($definicion($c, 'dim3.req01.def1')->value->escala as $e) {
        unset($e->porQuiebre);
    }
});
$comprobar('control: un espaciado sin sus valores por quiebre → el nombre del paso y el bloque de CSS cambian', $r_sin_css['dif'] !== [] && ($r_sin_css['proyeccion']['themeJson']['styles']['css'] ?? '') !== $bloque);
$control('una sombra con la expansión con otro signo (-12px -> 12px)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim4.req09.def1')->value->sombras[2]->expansion = '12px';
}, 'shadow.presets');
$control('un degradado con otro ángulo (65° -> 66°)', static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim1.req16.def1')->value->degradados[0]->angulo = 66;
}, 'gradients');

echo "\n== 5. una ausencia declarada no emite nada, y lista + ausencia a la vez tampoco ==\n";
$r = $sin(static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim4.req10.def1')->value->sinGrosores = 'razón';
});
$comprobar('lista Y ausencia a la vez: no emite la escala y avisa ADN_AUSENCIA_Y_LISTA', !isset($r['proyeccion']['themeJson']['settings']['custom']['border']) && in_array('ADN_AUSENCIA_Y_LISTA', array_column($r['proyeccion']['avisos'] ?? [], 'codigo'), true), json_encode($r['proyeccion']['avisos'] ?? null));
$r = $sin(static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim3.req10.def1')->value = (object) ['sinQuiebres' => 'usar los de la web'];
});
$comprobar('quiebres sin declarar sus anchos: el CSS usa los de la web y se avisa ADN_QUIEBRES_HEREDADOS', ($r['proyeccion']['themeJson']['styles']['css'] ?? '') !== '' && in_array('ADN_QUIEBRES_HEREDADOS', array_column($r['proyeccion']['avisos'] ?? [], 'codigo'), true) && strpos($r['proyeccion']['themeJson']['styles']['css'], COD_ADN_Projection::QUIEBRE_TABLET) !== false, json_encode($r['proyeccion']['avisos'] ?? null));
$r = $sin(static function (stdClass $c) use ($definicion): void {
    $definicion($c, 'dim1.req16.def1')->value->degradados[0]->paradas = [$definicion($c, 'dim1.req16.def1')->value->degradados[0]->paradas[0]];
});
$comprobar('un degradado con una sola parada no se proyecta y se avisa ADN_DEGRADADO_INCOMPLETO', in_array('ADN_DEGRADADO_INCOMPLETO', array_column($r['proyeccion']['avisos'] ?? [], 'codigo'), true) && count($r['proyeccion']['themeJson']['settings']['color']['gradients'] ?? []) === 1);

echo "\n== 6. el registro de variables conoce lo nuevo ==\n";
$reg = $proy['registro'];
foreach (['--wp--preset--color--ink-15', '--wp--preset--color--ink-20', '--wp--preset--gradient--ink-a-accent-65', '--wp--preset--shadow--30', '--wp--preset--spacing--gutter', '--wp--custom--typography--font-weight--medium', '--wp--custom--typography--line-height--tight', '--wp--custom--layout--measure--m', '--wp--custom--border--thick', '--wp--custom--blur--s', '--wp--custom--form--texto-suave', '--wp--custom--form--boton-sombra', '--wp--custom--form--tipografia'] as $nombre) {
    $comprobar("el registro trae $nombre", isset($reg[$nombre]), $nombre);
}
$comprobar('y ya no trae las variables por rol que nadie imprimía (--wp--custom--typography--<rol>--weight)', array_filter(array_keys($reg), static fn (string $k): bool => preg_match('/^--wp--custom--typography--[^-]+--(weight|line-height|letter-spacing)$/', $k) === 1) === []);

echo "\n";
echo $fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)\n" : "FALLARON $fallas de $ejecutadas\n";
exit($fallas === 0 ? 0 : 1);
