# Instalar ContOpe Publisher y conectarlo con tu asistente

Esta guía es para alguien que quiere usar el constructor en **su propio sitio
WordPress** y editarlo conversando con un asistente de IA, como se hace en el
proyecto que le dio origen.

Son cuatro pasos y ninguno necesita programar. El tercero es el único que pide
pegar un texto en un archivo de configuración; el cuarto es copiar dos carpetas.

---

## Antes de empezar

**Tu sitio** necesita:

- **WordPress 6.5** o superior
- **PHP 8.0** o superior
- Estar en **HTTPS** — sin eso WordPress no permite crear contraseñas de
  aplicación, y no hay forma de conectar el asistente
- Una cuenta de **administrador**

Si no sabes qué versión tienes, aparece en *Escritorio → Actualizaciones* y en
*Herramientas → Salud del sitio → Información*.

**Tu computador** necesita:

- **Node.js 20** o superior

Esto último sorprende a mucha gente, así que conviene decirlo claro: el
asistente no habla con tu sitio directamente, levanta un pequeño puente para
hacerlo, y ese puente corre sobre Node. Sin Node, la conexión no se establece y
el mensaje de error no explica por qué.

Si no lo tienes, el instalador del paso 3 lo puede instalar por ti. O lo bajas
de [nodejs.org](https://nodejs.org) — la versión **LTS**.

---

## 1 · Instalar el plugin

1. Descarga el archivo `contope-publisher-X.Y.Z.zip` de la página de versiones
   del repositorio.
2. En tu WordPress: **Plugins → Añadir nuevo → Subir plugin**.
3. Elige el archivo y pulsa **Instalar ahora**.
4. Pulsa **Activar**.

Si todo salió bien, en el menú lateral aparece **ContOpe Design**, con cuatro
pantallas: Portabilidad, Editor visual, Plantillas y Configuración.

> **Si vienes de la versión anterior del plugin** (cuando se llamaba Open
> CoDesign): instálalo y actívalo igual. Al activarse, el plugin migra solo tus
> documentos al nombre nuevo, una sola vez. No borres el plugin viejo hasta
> comprobar que el sitio se ve bien; basta con desactivarlo.

---

## 2 · Crear una contraseña de aplicación

Es una clave aparte, sólo para que el asistente entre. No es tu contraseña, y
la puedes revocar cuando quieras sin cambiar nada más.

1. En WordPress: **Usuarios → Perfil** (tu propio perfil).
2. Baja hasta **Contraseñas de aplicación**.
3. Escribe un nombre que después reconozcas — por ejemplo `Asistente`.
4. Pulsa **Añadir nueva contraseña de aplicación**.
5. WordPress te muestra la clave **una sola vez**, con este aspecto:
   `abcd EFGH ijkl MNOP qrst UVWX`. Cópiala ahora; si la pierdes, se crea otra.

La cuenta tiene que ser **administradora**: el plugin sólo atiende a quien
puede gestionar opciones del sitio. Es a propósito — por ahí se edita el sitio
entero.

> **Si no ves la sección**, tu hosting puede tenerla desactivada, o el sitio no
> está en HTTPS. WordPress sólo permite contraseñas de aplicación sobre HTTPS.

---

## 3 · Conectar el asistente

### La forma rápida (Windows)

El repositorio trae un instalador que hace todo este paso por ti: comprueba
Node y lo instala si falta, te pide los datos, **prueba la conexión de verdad**
y sólo escribe la configuración si funcionó. Si algo falla, te dice cuál de las
tres cosas falló, que es lo que no se puede adivinar cuando se hace a mano.

Descarga el repositorio (**Code → Download ZIP**), descomprímelo, abre
PowerShell en esa carpeta y ejecuta:

```powershell
.\instalar-conexion.ps1
```

Te va a preguntar la dirección de tu sitio, tu usuario y la contraseña de
aplicación. La contraseña se escribe oculta y no queda en el historial. Antes
de tocar tu configuración hace un respaldo con fecha.

Si funcionó, salta al paso 4. Si prefieres hacerlo a mano, o no estás en
Windows, sigue leyendo.

### A mano

El plugin publica una dirección en tu propio sitio por donde el asistente entra.
Es siempre tu dominio seguido de `/wp-json/contope/v1/mcp`.

En la configuración de tu asistente de escritorio, agrega un servidor con esta
forma. Reemplaza las tres partes marcadas:

```json
{
  "mcpServers": {
    "mi-sitio": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://TU-DOMINIO.cl/wp-json/contope/v1/mcp",
        "--header",
        "Authorization:${WP_AUTH}"
      ],
      "env": {
        "WP_AUTH": "Basic PEGA-AQUÍ-LA-CLAVE-CODIFICADA"
      }
    }
  }
}
```

- **`mi-sitio`** — el nombre con que lo verás en tu asistente. Elige el que
  quieras.
- **`TU-DOMINIO.cl`** — tu dominio, tal cual, con `https://`.
- **`PEGA-AQUÍ-LA-CLAVE-CODIFICADA`** — no es la contraseña de aplicación tal
  cual, sino `usuario:contraseña` convertido a Base64. Ver abajo.

### Cómo obtener la clave codificada

Junta tu nombre de usuario de WordPress y la contraseña de aplicación separados
por dos puntos, sin espacios alrededor:

```
mi-usuario:abcd EFGH ijkl MNOP qrst UVWX
```

Eso hay que convertirlo a Base64. Pídeselo a tu asistente —"conviérteme este
texto a Base64"— o usa cualquier conversor. El resultado es una tira larga de
letras y números que va después de la palabra `Basic` y un espacio.

En Windows, desde PowerShell, también sirve:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('mi-usuario:abcd EFGH ijkl MNOP qrst UVWX'))
```

En Mac o Linux, desde la terminal:

```bash
printf 'mi-usuario:abcd EFGH ijkl MNOP qrst UVWX' | base64
```

### Comprobar que quedó conectado

Reinicia el asistente y pídele algo simple, como *"lista las páginas del sitio"*.
Si responde con tus páginas, está conectado. Si dice que no encuentra el
servidor, revisa en este orden: que el dominio esté bien escrito y con `https`,
que el plugin esté activo, y que la clave codificada no traiga espacios ni
saltos de línea pegados.

---

## 4 · Enseñarle a tu asistente cómo trabajar

Con los tres pasos anteriores el asistente ya **puede** entrar a tu sitio. Este
cuarto le enseña **cómo hacerlo bien**: qué vías de trabajo existen, en qué
orden, y las reglas duras que evitan romper un sitio en producción —cosas que
costaron horas y defectos reales antes de quedar escritas.

Sin esto también funciona, pero el asistente improvisa. Con esto, sabe.

En la carpeta `skills/` de este repositorio hay dos:

| Skill | Para qué |
|---|---|
| **`operar-canvas`** | Crear y editar páginas dentro del constructor, sin romperlo. **Es el importante.** |
| **`aplicar-set-de-diseno`** | Llevar un set de diseño aprobado en Contope Design Desktop hasta el sitio. Sólo si usas Desktop. |

### Cómo instalarlos

1. Descarga el repositorio completo: botón verde **Code → Download ZIP**, y
   descomprímelo. (No necesitas git.)
2. Copia las carpetas `skills/operar-canvas` y `skills/aplicar-set-de-diseno`
   dentro de la carpeta de skills de tu asistente:

   - **Windows:** `C:\Users\TU-USUARIO\.claude\skills\`
   - **Mac o Linux:** `~/.claude/skills/`

   La carpeta `.claude` empieza con punto, así que puede estar oculta. En
   Windows se llega escribiendo la ruta en la barra del explorador; en Mac, con
   *Ir → Ir a la carpeta*.

3. Reinicia el asistente.

En Windows, si prefieres, el repositorio trae un script que hace la copia:

```powershell
.\skills\instalar-skills.ps1
```

### Comprobar que quedó

Pídele algo que dependa del skill, por ejemplo: *"¿cómo debes editar una página
de este sitio?"*. Si responde hablando del constructor y del circuito de
edición, lo cargó. Si contesta en general sobre WordPress, revisa que las
carpetas quedaron en el lugar correcto y que reiniciaste.

> **Si editas un skill**, hazlo en el repositorio y vuelve a copiarlo. La fuente
> de verdad es el repo, para que viaje con el proyecto.

---

## Qué puedes hacer ya

Con eso, el asistente puede leer y editar las páginas de tu sitio **dentro del
constructor**, no generando archivos por fuera: crear secciones, cambiar textos,
ajustar estilos, publicar. Los cambios quedan en el editor visual, donde después
los puedes seguir refinando a mano.

En la pantalla **ContOpe Design → Configuración** encontrarás además:

- el **número de WhatsApp** que usan los botones del sitio;
- los **sitios que puedes incrustar** en un iframe — YouTube, Vimeo y Google
  Maps vienen permitidos; para cualquier otro, escribe su dominio aquí.

---

## Opcional: editar con el motor real de GrapesJS

Hay un modo de edición más fino, que hace pasar cada cambio por el mismo motor
del editor visual en vez de reconstruir el documento. Es lo que usan las recetas
de `scripts/cod-grapes-runner/`.

Necesita, además de Node (que ya tienes de la conexión), **Google Chrome**
instalado en tu computador.

No hace falta para empezar. Si más adelante lo quieres, el README de esa carpeta
explica cómo.

---

## Licencia

ContOpe Publisher se distribuye bajo **GPLv2 o posterior**, la misma licencia de
WordPress. Puedes usarlo, modificarlo y redistribuirlo; si lo redistribuyes
modificado, tiene que seguir siendo GPL.

Incluye GrapesJS, con licencia BSD-3-Clause. Ver `LICENSE`.
