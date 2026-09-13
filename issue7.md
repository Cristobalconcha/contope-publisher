## Qué pasaba

La herramienta MCP `cod_publish_canvas_page` respondía **siempre**:

> Guarda contenido en el Canvas antes de publicarlo.

Incluso con páginas cuyo documento tenía contenido guardado y verificable. La herramienta **nunca funcionó** desde que existe.

## Por qué

La causa no era el contenido: era el llamado.

El servicio invocaba el método equivocado. Hay dos que se parecen en `COD_Canvas_Page_Publisher`:

```php
// el del editor: crea o busca la página por su cuenta
public function publish(string $document_id, string $title, int $page_id = 0)

// el correcto para MCP: recibe una página que YA existe y una revisión esperada
public function publish_existing_if_revision(
    int $page_id, string $document_id, int $expected_revision,
    string $snapshot_session, string $snapshot_label
)
```

El servicio llamaba al primero con los cinco argumentos del segundo.

**PHP no se queja de eso.** Acepta argumentos de más en funciones de usuario y convierte el `int` a `string` sin avisar. Así que en vez de fallar en el llamado, `$page_id` (un número) entraba donde se esperaba `$document_id` (un texto), el documento resultante salía vacío, y el mensaje de error terminaba acusando al contenido.

Ese es el detalle que lo hacía difícil de ver: **el código se leía razonable y el error apuntaba a otro lado.**

## Por qué recién ahora

Las páginas del sitio ya estaban publicadas desde antes. Publicar una página ya publicada no cambia nada visible, así que el error pasaba inadvertido: el contenido salía en vivo igual, porque una página publicada renderiza siempre la revisión actual de su documento.

Salió a la luz al crear una página nueva —la de Términos y condiciones— que es **la primera publicada íntegramente por MCP**.

## Cómo se arregló

Se llama al método correcto. El arreglo es de una línea; lo que costó fue el diagnóstico.

Y se agregó `scripts/probar-firmas.mjs`, que compara los 132 llamados internos del plugin contra la firma declarada de cada método y avisa si alguno pasa más o menos argumentos de los que el método acepta.

Existe porque este defecto **no se podía ver leyendo**. Una nota en la documentación habría dependido de que alguien la recordara; una prueba no. Verificada de las dos maneras: con el defecto reintroducido a propósito lo acusa con archivo y línea; sin él, pasa limpia.

## A quién afecta

A cualquier fork anterior a **0.3.14**. Si usas `cod_publish_canvas_page` desde una IA o un script, hoy no funciona y el mensaje de error te manda a buscar en el lugar equivocado.

**Arreglado en [0.3.14](https://github.com/Cristobalconcha/contope-publisher/releases/tag/v0.3.14).** Para actualizar un fork: `git pull upstream main`, o descargar el zip de la release e instalarlo sobre el plugin existente.
