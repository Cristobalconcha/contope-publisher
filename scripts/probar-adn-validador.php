<?php
/**
 * P1.1 / P1.4 / P1.8 / P1.9 (ESPEC-adn-unica-puerta-y-bloques, F1): el validador PHP del ADN
 * contra el corpus compartido con el Core.
 *
 *   core/    (capas 1 y 2) PARIDAD EXACTA: mismo válido/inválido, misma traza de rechazo
 *            (cada `return null` del Core que se recorre, por archivo:línea) y, si es válido,
 *            la misma salida normalizada.
 *   destino/ (capa 3) cada caso cumple el resultado escrito: R1, R2, R4, R6.
 *   fechas   `Date.parse` de V8 contra COD_ADN_Js::fecha_valida (el Core usa Date.parse).
 *
 * NO usa WordPress ni la red: PHP solo.
 *
 * Esta prueba puede fallar de verdad:
 *   - PISO: falla si el corpus no tiene casos válidos o no tiene inválidos, si ejecutó menos
 *     casos que archivos hay en disco o si los conteos no coinciden con fixtures/adn/meta.json.
 *   - CONTROL (se corre siempre): rompe a propósito el corpus en memoria (voltea el veredicto
 *     de un caso, altera un DESIGN.md, cambia una traza) y exige que el instrumento lo
 *     detecte. Si el instrumento no ve la alteración, la prueba falla.
 *
 * Uso:  php scripts/probar-adn-validador.php [--ver]
 */
define('ABSPATH', __DIR__ . '/');
$plugin = realpath(__DIR__ . '/../contope-publisher/includes');
foreach (['js', 'design-md', 'parser', 'requisitos', 'validator'] as $parte) {
    require_once $plugin . '/class-cod-adn-' . $parte . '.php';
}

$ver = in_array('--ver', $argv, true);
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
$corpus = $raiz . '/fixtures/adn';

/** @return array<int, array{nombre: string, caso: stdClass}> */
$leer = static function (string $carpeta): array {
    $casos = [];
    $archivos = glob($carpeta . '/*.json') ?: [];
    sort($archivos);
    foreach ($archivos as $ruta) {
        $caso = json_decode((string) file_get_contents($ruta), false);
        if (!$caso instanceof stdClass) {
            echo '  FALLA  ' . basename($ruta) . ' no es un caso JSON' . "\n";
            exit(1);
        }
        $casos[] = ['nombre' => basename($ruta), 'caso' => $caso];
    }
    return $casos;
};

/**
 * Corre los casos de core/ y devuelve las discrepancias (lista de textos).
 *
 * @param array<int, array{nombre: string, caso: stdClass}> $casos
 * @return array{discrepancias: array<int, string>, validos: int, invalidos: int}
 */
$correr_core = static function (array $casos): array {
    $disc = [];
    $validos = 0;
    $invalidos = 0;
    foreach ($casos as $c) {
        $caso = $c['caso'];
        $nombre = $c['nombre'];
        $res = $caso->funcion === 'parsePortableDesignModel'
            ? COD_ADN_Parser::analizar_portable($caso->entrada)
            : COD_ADN_Parser::analizar_contrato($caso->entrada);
        $espera_valido = $caso->esperado->valido === true;
        $espera_valido ? ++$validos : ++$invalidos;
        if ($res['valido'] !== $espera_valido) {
            $disc[] = "$nombre: el Core dice " . ($espera_valido ? 'válido' : 'inválido') . ' y PHP dice ' . ($res['valido'] ? 'válido' : 'inválido') . ' (traza PHP: ' . implode(', ', $res['traza']) . ')';
            continue;
        }
        if ($espera_valido) {
            $esperada = COD_ADN_Validator::json_canonico($caso->esperado->salida);
            $obtenida = COD_ADN_Validator::json_canonico($res['salida']);
            if ($esperada !== $obtenida) {
                $disc[] = "$nombre: válido en los dos, pero la salida normalizada difiere";
            }
        } else {
            $cubre = array_values(array_unique($caso->cubre));
            $traza = $res['traza'];
            sort($cubre);
            sort($traza);
            if ($cubre !== $traza) {
                $disc[] = "$nombre: rechazado en los dos, pero por otra razón. Core: [" . implode(', ', $cubre) . '] PHP: [' . implode(', ', $traza) . ']';
            }
        }
    }
    return ['discrepancias' => $disc, 'validos' => $validos, 'invalidos' => $invalidos];
};

// ---------------------------------------------------------------------------
echo "\n== 1. core/ (capas 1 y 2): paridad exacta con el Core ==\n";
$archivos_core = glob($corpus . '/core/*.json') ?: [];
$casos_core = $leer($corpus . '/core');
$meta = json_decode((string) file_get_contents($corpus . '/meta.json'), true);
$comprobar('el corpus core/ tiene casos (' . count($casos_core) . ')', count($casos_core) > 0);
$comprobar('se leyeron todos los archivos de core/ (' . count($casos_core) . ' de ' . count($archivos_core) . ')', count($casos_core) === count($archivos_core));
$r = $correr_core($casos_core);
$comprobar('piso: hay casos válidos (' . $r['validos'] . ')', $r['validos'] > 0);
$comprobar('piso: hay casos inválidos (' . $r['invalidos'] . ')', $r['invalidos'] > 0);
$comprobar('los conteos coinciden con meta.json (core ' . ($meta['conteo']['core'] ?? '?') . ', válidos ' . ($meta['conteo']['coreValidos'] ?? '?') . ', inválidos ' . ($meta['conteo']['coreInvalidos'] ?? '?') . ')',
    ($meta['conteo']['core'] ?? -1) === count($casos_core) && ($meta['conteo']['coreValidos'] ?? -1) === $r['validos'] && ($meta['conteo']['coreInvalidos'] ?? -1) === $r['invalidos']);
if ($ver || $r['discrepancias'] !== []) {
    foreach ($r['discrepancias'] as $d) {
        echo '           ' . $d . "\n";
    }
}
$comprobar('PARIDAD 100 %: PHP y el Core coinciden en los ' . count($casos_core) . ' casos (válido/inválido, traza de rechazo y salida)', $r['discrepancias'] === [], count($r['discrepancias']) . ' discrepancia(s)');
$incomodos = array_filter($casos_core, static function (array $c): bool {
    return !empty($c['caso']->incomodo);
});
$comprobar('los casos incómodos siguen en el corpus (' . count($incomodos) . ')', count($incomodos) >= 5);

// ---------------------------------------------------------------------------
echo "\n== 2. CONTROL de la paridad: el instrumento ve una alteración ==\n";
$control = static function (string $nombre, callable $alterar) use ($casos_core, $correr_core, $comprobar): void {
    $copia = unserialize(serialize($casos_core));
    $alterar($copia);
    $r2 = $correr_core($copia);
    $comprobar("control: $nombre → el instrumento reporta una discrepancia", $r2['discrepancias'] !== [], 'el instrumento NO vio la alteración');
};
$control('se voltea el veredicto de un caso válido', static function (array &$casos): void {
    foreach ($casos as &$c) {
        if ($c['caso']->esperado->valido === true) {
            $c['caso']->esperado->valido = false;
            return;
        }
    }
});
$control('se voltea el veredicto de un caso inválido', static function (array &$casos): void {
    foreach ($casos as &$c) {
        if ($c['caso']->esperado->valido === false) {
            $c['caso']->esperado->valido = true;
            $c['caso']->esperado->salida = new stdClass();
            return;
        }
    }
});
$control('se altera a mano el DESIGN.md de un envoltorio válido', static function (array &$casos): void {
    foreach ($casos as &$c) {
        if ($c['caso']->funcion === 'parsePortableDesignModel' && $c['caso']->esperado->valido === true) {
            $c['caso']->entrada->designMd->content .= ' ';
            return;
        }
    }
});
$control('se cambia la traza esperada de un rechazo', static function (array &$casos): void {
    foreach ($casos as &$c) {
        if ($c['caso']->esperado->valido === false) {
            $c['caso']->cubre = ['packages/core/src/design-contract.ts:1'];
            return;
        }
    }
});
$control('se altera un valor de la salida esperada', static function (array &$casos): void {
    foreach ($casos as &$c) {
        if ($c['caso']->esperado->valido === true && !empty($c['caso']->esperado->salida->definitions)) {
            $c['caso']->esperado->salida->definitions[0]->name .= 'x';
            return;
        }
    }
});

// DESIGN.md alterado a mano → rechazo en PHP (P1.1, caso explícito).
$md = null;
foreach ($casos_core as $c) {
    if ($c['caso']->funcion === 'parsePortableDesignModel' && $c['caso']->esperado->valido === true) {
        $md = $c['caso']->entrada;
        break;
    }
}
if ($md !== null) {
    $ok_original = COD_ADN_Parser::analizar_portable($md)['valido'];
    $alterado = unserialize(serialize($md));
    $alterado->designMd->content = str_replace('Confirmed definitions', 'Confirmed  definitions', $alterado->designMd->content);
    $res_alt = COD_ADN_Parser::analizar_portable($alterado);
    $comprobar('el envoltorio original es válido y el mismo con el DESIGN.md retocado a mano se RECHAZA', $ok_original && !$res_alt['valido'] && in_array('packages/core/src/design-contract-portable.ts:239', $res_alt['traza'], true));
}

// ---------------------------------------------------------------------------
echo "\n== 3. Date.parse de V8 contra COD_ADN_Js::fecha_valida ==\n";
$fechas = json_decode((string) file_get_contents($corpus . '/fechas-v8.json'), true);
$no_repro = $fechas['noReproducidas'] ?? [];
$malas = [];
$n_fechas = 0;
foreach ($fechas['cadenas'] as $f) {
    ++$n_fechas;
    $php = COD_ADN_Js::fecha_valida($f['texto']);
    if (in_array($f['texto'], $no_repro, true)) {
        if ($php !== false) {
            $malas[] = json_encode($f['texto']) . ' estaba declarada como no reproducida y PHP la acepta';
        }
        continue;
    }
    if ($php !== $f['valida']) {
        $malas[] = json_encode($f['texto']) . ' V8=' . json_encode($f['valida']) . ' PHP=' . json_encode($php);
    }
}
$comprobar("piso: la batería tiene cadenas ($n_fechas)", $n_fechas >= 50);
foreach ($malas as $m) {
    echo '           ' . $m . "\n";
}
$comprobar('PHP coincide con V8 en toda la batería (salvo las ' . count($no_repro) . ' no reproducidas, declaradas y exigidas como rechazo)', $malas === []);

// ---------------------------------------------------------------------------
echo "\n== 4. destino/ (capa 3): R1, R2, R4, R6 cumplen lo escrito ==\n";
$casos_destino = $leer($corpus . '/destino');
$comprobar('el corpus destino/ tiene casos (' . count($casos_destino) . ')', count($casos_destino) >= 25);
$comprobar('los conteos coinciden con meta.json (destino ' . ($meta['conteo']['destino'] ?? '?') . ')', ($meta['conteo']['destino'] ?? -1) === count($casos_destino));

/**
 * @param array<int, array{nombre: string, caso: stdClass}> $casos
 * @return array<int, string>
 */
$correr_destino = static function (array $casos): array {
    $disc = [];
    foreach ($casos as $c) {
        $caso = $c['caso'];
        $opciones = ['emitirPropuestas' => !empty($caso->opciones->emitirPropuestas)];
        $res = COD_ADN_Validator::validar($caso->entrada, $opciones);
        $e = $caso->esperado;
        if ($e->import === 'rechaza') {
            if ($res['ok']) {
                $disc[] = $caso->id . ': debía rechazar (' . $e->codigo . ') y el validador aceptó';
                continue;
            }
            $primero = $res['errores'][0] ?? null;
            if ($primero === null || $primero['codigo'] !== $e->codigo) {
                $disc[] = $caso->id . ': debía rechazar con ' . $e->codigo . ' y dio ' . ($primero['codigo'] ?? 'nada');
                continue;
            }
            if (isset($e->definicion) && ($primero['definicion'] ?? null) !== $e->definicion) {
                $disc[] = $caso->id . ': rechazo en la definición equivocada (' . ($primero['definicion'] ?? '-') . ' en vez de ' . $e->definicion . ')';
            }
            if (isset($e->ruta) && ($primero['ruta'] ?? null) !== $e->ruta) {
                $disc[] = $caso->id . ': ruta del rechazo "' . ($primero['ruta'] ?? '-') . '" en vez de "' . $e->ruta . '"';
            }
            continue;
        }
        if (!$res['ok']) {
            $disc[] = $caso->id . ': debía aceptar y rechazó con ' . ($res['errores'][0]['codigo'] ?? '?') . ' — ' . ($res['errores'][0]['mensaje'] ?? '');
            continue;
        }
        foreach (get_object_vars($e->definiciones) as $id => $esp) {
            $obt = $res['definiciones'][$id] ?? null;
            if ($obt === null) {
                $disc[] = $caso->id . ": la definición $id no figura en el resultado";
                continue;
            }
            foreach (['estadoEfectivo', 'guardada', 'emitida', 'ignorada'] as $campo) {
                if ($obt[$campo] !== $esp->{$campo}) {
                    $disc[] = $caso->id . ": $id.$campo = " . json_encode($obt[$campo]) . ' y debía ser ' . json_encode($esp->{$campo});
                }
            }
        }
        if (count($res['definiciones']) !== count(get_object_vars($e->definiciones))) {
            $disc[] = $caso->id . ': el resultado trae ' . count($res['definiciones']) . ' definiciones y el caso espera ' . count(get_object_vars($e->definiciones));
        }
    }
    return $disc;
};
$disc_destino = $correr_destino($casos_destino);
foreach ($disc_destino as $d) {
    echo '           ' . $d . "\n";
}
$comprobar('cada caso de destino/ cumple el resultado escrito (' . count($casos_destino) . ' casos)', $disc_destino === [], count($disc_destino) . ' discrepancia(s)');
$por_regla = [];
foreach ($casos_destino as $c) {
    $por_regla[$c['caso']->regla] = ($por_regla[$c['caso']->regla] ?? 0) + 1;
}
$comprobar('piso: R1, R2, R4 y R6 tienen casos (' . json_encode($por_regla) . ')', isset($por_regla['R1'], $por_regla['R2'], $por_regla['R4'], $por_regla['R6']));
$copia = unserialize(serialize($casos_destino));
foreach ($copia as &$c) {
    if ($c['caso']->esperado->import === 'rechaza') {
        $c['caso']->esperado->codigo = 'ADN_NO_EXISTE';
        break;
    }
}
unset($c);
$comprobar('control: si un rechazo esperado cambia de código, el instrumento lo reporta', $correr_destino($copia) !== []);
$copia = unserialize(serialize($casos_destino));
foreach ($copia as &$c) {
    if ($c['caso']->esperado->import === 'acepta') {
        foreach (get_object_vars($c['caso']->esperado->definiciones) as $id => $esp) {
            $c['caso']->esperado->definiciones->{$id}->emitida = !$esp->emitida;
            break 2;
        }
    }
}
unset($c);
$comprobar('control: si una emisión esperada se invierte, el instrumento lo reporta', $correr_destino($copia) !== []);

// ---------------------------------------------------------------------------
echo "\n== 5. P1.4 — R1 y los contratos reales que produce el Core ==\n";
$real = null;
foreach ($casos_core as $c) {
    if ($c['nombre'] === '007-contrato-ok-restriccion-legal-activa.json') {
        $real = $c['caso']->entrada;
    }
}
$comprobar('el contrato producido por el Core con una restricción legal activa existe en el corpus', $real !== null);
if ($real !== null) {
    $v = COD_ADN_Validator::validar($real);
    $comprobar('el plugin ACEPTA lo que el Core produce (restricción legal confirmada + deterministic-extraction con reviewedAt)', $v['ok'], json_encode($v['errores']));
    $ign = array_column($v['ignoradas'], 'motivo', 'definicion');
    $comprobar('la restricción legal queda guardada y listada en ignored[] (R4), no emitida', ($ign['legal-restriction'] ?? '') === 'R4-no-proyectada' && $v['definiciones']['legal-restriction']['emitida'] === false && $v['definiciones']['legal-restriction']['guardada'] === true);
    $sin_revision = unserialize(serialize($real));
    foreach ($sin_revision->definitions as $d) {
        if ($d->id === 'legal-restriction') {
            unset($d->reviewedAt);
        }
    }
    $v2 = COD_ADN_Validator::validar($sin_revision);
    $comprobar('control: la misma restricción SIN reviewedAt se rechaza (ADN_CONFIRMED_WITHOUT_HUMAN)', !$v2['ok'] && ($v2['errores'][0]['codigo'] ?? '') === 'ADN_CONFIRMED_WITHOUT_HUMAN');
    $como_variable = unserialize(serialize($real));
    foreach ($como_variable->definitions as $d) {
        if ($d->id === 'legal-restriction') {
            $d->id = 'dim1.req01.def1';
            $d->category = 'color';
            $d->value = (object) ['institucionales' => [(object) ['name' => 'Verde', 'value' => '#5B6B3A']], 'neutros' => [(object) ['name' => 'Carbón', 'value' => '#222222']]];
        }
    }
    $v3 = COD_ADN_Validator::validar($como_variable);
    $comprobar('control: la misma extracción determinista, si ALIMENTA una variable (dim1.req01), se rechaza', !$v3['ok'] && ($v3['errores'][0]['codigo'] ?? '') === 'ADN_CONFIRMED_WITHOUT_HUMAN');
}

// ---------------------------------------------------------------------------
echo "\n== 6. R5 — el ADN es entrada no confiable ==\n";
$base = $real !== null ? json_encode($real) : '{}';
$comprobar('más de 1 MB → ADN_TOO_LARGE', (COD_ADN_Validator::validar(str_repeat(' ', COD_ADN_Validator::MAX_BYTES + 1) . $base)['errores'][0]['codigo'] ?? '') === 'ADN_TOO_LARGE');
$comprobar('texto que no es JSON → ADN_INVALID', (COD_ADN_Validator::validar('{no es json')['errores'][0]['codigo'] ?? '') === 'ADN_INVALID');
$profundo = 'x';
for ($i = 0; $i < 14; ++$i) {
    $profundo = ['n' => $profundo];
}
if ($real !== null) {
    $hondo = json_decode($base, false);
    $hondo->definitions[0]->value = json_decode(json_encode($profundo), false);
    $comprobar('un value de profundidad 14 → ADN_TOO_LARGE', (COD_ADN_Validator::validar($hondo)['errores'][0]['codigo'] ?? '') === 'ADN_TOO_LARGE');
    $ancho = json_decode($base, false);
    for ($i = 0; $i < 2001; ++$i) {
        $d = clone $ancho->definitions[0];
        $d->id = 'extra-' . $i;
        $ancho->definitions[] = $d;
    }
    $comprobar('más de 2000 definiciones → ADN_TOO_LARGE', (COD_ADN_Validator::validar($ancho)['errores'][0]['codigo'] ?? '') === 'ADN_TOO_LARGE');
    $comprobar('control: el contrato original, sin tocar, pasa', COD_ADN_Validator::validar($base)['ok']);
}

echo "\n" . ($fallas === 0 ? "TODO VERDE ($ejecutadas comprobaciones)" : "FALLARON $fallas de $ejecutadas comprobaciones") . "\n";
exit($fallas === 0 ? 0 : 1);
