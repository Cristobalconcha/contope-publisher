# Las tipografías de este tema y su licencia

Los archivos de `../letras/` son **los mismos** que servía
`fonts.googleapis.com`, traídos al sitio para que ningún visitante le entregue
su dirección IP a Google antes de haber aceptado nada. Están acá por una razón
legal, no de rendimiento, aunque además el sitio carga más rápido.

Las tres familias se distribuyen bajo la **SIL Open Font License 1.1**, que
permite redistribuirlas —también dentro de un producto— siempre que la licencia
viaje con ellas. Por eso este directorio existe.

| Familia | Autoría | Origen |
|---|---|---|
| Big Shoulders Display | Patric King | [xotypeco/big_shoulders](https://github.com/xotypeco/big_shoulders) |
| Bodoni Moda | Owen Earl | [indestructible-type/Bodoni](https://github.com/indestructible-type/Bodoni) |
| Open Sans | Steve Matteson | [googlefonts/opensans](https://github.com/googlefonts/opensans) |

Las licencias de acá son copia literal de los `OFL.txt` del repositorio
`google/fonts`, bajadas el 3 de octubre de 2026. La condición de código abierto
de las tres está comprobada contra `fonts.google.com/metadata/fonts`
(`isOpenSource: true`), no supuesta.

**Nota sobre el nombre.** Google ya no publica «Big Shoulders Display»: la
familia pasó a llamarse **Big Shoulders**. La URL antigua sigue sirviendo la
versión 24, que es la que está acá y la que usa el sitio publicado. Si alguna
vez hay que volver a bajarla y esa URL ya no responde, el reemplazo es
`Big Shoulders` y hay que comprobar que el dibujo no cambió.

Para rehacer esta carpeta: `node scripts/traer-fuentes-de-google.mjs`.
