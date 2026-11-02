<?php
/**
 * Sesión de administrador PARA PRUEBAS, sin contraseña: firma las cookies de autenticación y los nonces
 * con las claves del propio WordPress (las de su wp-config), igual que lo hace WordPress al iniciar sesión.
 * Así las pruebas de las pantallas de wp-admin entran como una persona real (cookie + nonce) sin escribir
 * ninguna contraseña en ningún lado.
 *
 * Es sólo para WordPress LOCALES de desarrollo: se niega a correr si WP_ENVIRONMENT_TYPE no es "local".
 *
 *   php sesion-de-prueba.php <ruta a wp-load.php> crear <accion1,accion2,...>   → JSON {user, token, cookies, nonces}
 *   php sesion-de-prueba.php <ruta a wp-load.php> cerrar <token>                 → destruye esa sesión (deja el usuario como estaba)
 */
define('WP_USE_THEMES', false);
[$_script, $wp_load, $modo, $argumento] = array_pad($argv, 4, '');
if (!is_file($wp_load)) {
    fwrite(STDERR, "No existe $wp_load\n");
    exit(2);
}
require $wp_load;
if (wp_get_environment_type() !== 'local') {
    fwrite(STDERR, "Este WordPress no es local (WP_ENVIRONMENT_TYPE): no se crean sesiones de prueba.\n");
    exit(2);
}
$admins = get_users(['role' => 'administrator', 'number' => 1, 'orderby' => 'ID', 'order' => 'ASC']);
if ($admins === []) {
    fwrite(STDERR, "No hay administradores.\n");
    exit(2);
}
$usuario = $admins[0];

if ($modo === 'crear') {
    $caduca = time() + 900;
    $gestor = WP_Session_Tokens::get_instance($usuario->ID);
    $token = $gestor->create($caduca);
    $cookies = [
        AUTH_COOKIE => wp_generate_auth_cookie($usuario->ID, $caduca, 'auth', $token),
        LOGGED_IN_COOKIE => wp_generate_auth_cookie($usuario->ID, $caduca, 'logged_in', $token),
    ];
    $_COOKIE[LOGGED_IN_COOKIE] = $cookies[LOGGED_IN_COOKIE];
    wp_set_current_user($usuario->ID);
    $nonces = [];
    foreach (array_filter(explode(',', $argumento)) as $accion) {
        $nonces[$accion] = wp_create_nonce($accion);
    }
    echo json_encode(['user' => $usuario->user_login, 'token' => $token, 'cookies' => $cookies, 'nonces' => $nonces]);
    exit(0);
}
if ($modo === 'cerrar') {
    WP_Session_Tokens::get_instance($usuario->ID)->destroy($argumento);
    echo json_encode(['cerrada' => true, 'sesionesRestantes' => count(WP_Session_Tokens::get_instance($usuario->ID)->get_all())]);
    exit(0);
}
fwrite(STDERR, "Uso: php sesion-de-prueba.php <wp-load.php> crear <acciones> | cerrar <token>\n");
exit(2);
