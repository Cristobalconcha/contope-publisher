<?php
/**
 * El aire de aterrizaje del sitio: que el campo de Configuración se guarde con
 * su signo, que produzca la variable y que la regla salga sin peso (:where),
 * para que un valor puesto a mano en un bloque le gane sin pelear.
 */
define('WP_USE_THEMES', false);
require __DIR__ . '/../../wp-local/wordpress/wp-load.php';

$fallas = 0;
$comprobar = function (string $caso, bool $ok) use (&$fallas) {
    echo ($ok ? '  ok     ' : '  FALLA  ') . $caso . "\n";
    if (!$ok) { $fallas++; }
};

echo "\n== el campo existe en Configuracion ==\n";
$campos = [];
foreach (COD_Theme_Definitions::schema() as $grupo) {
    foreach ($grupo['fields'] as $campo) { $campos[$campo['id']] = $campo; }
}
$comprobar('hay un campo landing', isset($campos['landing']));
$comprobar('admite negativos (min < 0)', isset($campos['landing']) && $campos['landing']['min'] < 0);

echo "\n== el guardado conserva el signo ==\n";
$guardado = COD_Theme_Definitions::sanitize(['landing' => '-40', 'spacing' => '-40']);
$comprobar('landing guarda -40', ($guardado['landing'] ?? '') === '-40');
$comprobar('un campo que NO admite negativos sigue descartando el signo, como antes', ($guardado['spacing'] ?? '') === '40');

echo "\n== fuera de rango se acota ==\n";
$tope = COD_Theme_Definitions::sanitize(['landing' => '-9999']);
$comprobar('se acota al minimo declarado', ($tope['landing'] ?? '') === '-400');

echo "\n== la regla que aplica el valor a todo bloque con marcador ==\n";
$opcion = COD_Theme_Definitions::OPTION_KEY;
$antes = get_option($opcion, '');
$valores = json_decode(is_string($antes) ? $antes : '', true);
if (!is_array($valores)) { $valores = []; }
$valores['landing'] = '-40';
update_option($opcion, wp_json_encode($valores));
$css = str_replace(' ', '', COD_Theme_Definitions::css());
$comprobar('declara la variable --cod-landing:-40px', strpos($css, '--cod-landing:-40px') !== false);
$comprobar('aplica scroll-margin a todo bloque con id', strpos($css, ':where([id]){scroll-margin-block-start:var(--cod-landing);}') !== false);
$comprobar('la regla va en :where, o sea con peso cero', strpos($css, ':where([id])') !== false);

echo "\n== sin valor declarado no se emite nada ==\n";
$valores['landing'] = '';
update_option($opcion, wp_json_encode($valores));
$vacio = str_replace(' ', '', COD_Theme_Definitions::css());
$comprobar('no aparece la variable', strpos($vacio, '--cod-landing') === false);
$comprobar('no aparece la regla', strpos($vacio, ':where([id])') === false);

update_option($opcion, $antes);

echo "\n" . ($fallas === 0 ? "todo en orden\n" : $fallas . " comprobaciones fallaron\n");
exit($fallas === 0 ? 0 : 1);
