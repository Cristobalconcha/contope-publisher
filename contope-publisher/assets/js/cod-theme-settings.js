/**
 * ContOpe Publisher — pantalla Configuración (definiciones del tema).
 *
 * Autoguarda el formulario de definiciones de estilo por admin-ajax con nonce.
 * El cambio/input de cualquier campo agenda un guardado con debounce de 600ms;
 * el botón "Guardar ahora" fuerza el guardado inmediato. Nunca recarga la
 * página: el estado se refleja en el indicador `#cod-settings-status`.
 */
(function (window, document) {
    'use strict';

    var config = window.ocdThemeSettings;

    if (!config) {
        return;
    }

    var form = document.getElementById('cod-settings-form');
    var statusNode = document.getElementById('cod-settings-status');
    var saveNowButton = document.getElementById('cod-settings-save-now');

    var debounceTimer = null;
    var saving = false;
    var queued = false;

    function setStatus(message, kind) {
        if (!statusNode) {
            return;
        }
        statusNode.textContent = message;
        statusNode.className = 'cod-settings-status' + (kind ? ' is-' + kind : '');
    }

    function collect() {
        var map = {};
        var fields = form ? form.querySelectorAll('[data-field-id]') : [];
        Array.prototype.forEach.call(fields, function (field) {
            // Un color "sin definir" viaja como '': el navegador normaliza el
            // input a #000000, así que el estado real lo marca data-cod-undefined.
            var isUndefinedColor =
                field.getAttribute('type') === 'color' &&
                field.getAttribute('data-cod-undefined') === '1';
            map[field.getAttribute('data-field-id')] = isUndefinedColor ? '' : (field.value || '');
        });
        return map;
    }

    function refreshColorValues() {
        if (!form) {
            return;
        }
        var inputs = form.querySelectorAll('input[type="color"]');
        Array.prototype.forEach.call(inputs, function (input) {
            var wrap = input.closest('.cod-settings-color');
            if (!wrap) {
                return;
            }
            var value = wrap.querySelector('.cod-settings-color-value');
            if (value) {
                value.textContent = input.value ? input.value : 'Sin definir';
            }
        });
    }

    function request(definitions) {
        var body = new window.URLSearchParams();
        body.set('action', config.saveAction);
        body.set('nonce', config.nonce);
        body.set('definitions', JSON.stringify(definitions));

        return window
            .fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString()
            })
            .then(function (response) {
                return response.text().then(function (text) {
                    var payload;
                    try {
                        payload = JSON.parse(text);
                    } catch (error) {
                        payload = null;
                    }
                    if (!payload || payload.success !== true) {
                        var message =
                            (payload && payload.data && payload.data.message) ||
                            'El servidor rechazó la petición (HTTP ' + response.status + ').';
                        throw new Error(message);
                    }
                    return payload.data;
                });
            });
    }

    function doSave() {
        if (saving) {
            queued = true;
            return;
        }

        saving = true;
        window.clearTimeout(debounceTimer);
        debounceTimer = null;

        var definitions = collect();
        setStatus('Guardando…');

        request(definitions)
            .then(function () {
                setStatus('Guardado ✓', 'ok');
            })
            .catch(function (error) {
                setStatus('No se pudo guardar: ' + error.message, 'error');
            })
            .then(function () {
                saving = false;
                if (queued) {
                    queued = false;
                    doSave();
                }
            });
    }

    function schedule() {
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(function () {
            debounceTimer = null;
            doSave();
        }, 600);
    }

    function markTouchedColor(target) {
        if (target && target.getAttribute && target.getAttribute('type') === 'color') {
            target.removeAttribute('data-cod-undefined');
        }
    }

    if (form) {
        form.addEventListener('input', function (event) {
            markTouchedColor(event.target);
            refreshColorValues();
            schedule();
        });
        form.addEventListener('change', function (event) {
            markTouchedColor(event.target);
            refreshColorValues();
            schedule();
        });
        // Enter en un input no debe recargar la página: guarda y queda.
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            window.clearTimeout(debounceTimer);
            debounceTimer = null;
            doSave();
        });
    }

    if (saveNowButton) {
        saveNowButton.addEventListener('click', function () {
            window.clearTimeout(debounceTimer);
            debounceTimer = null;
            doSave();
        });
    }
})(window, document);

/**
 * Campo de imagen: abre la biblioteca de medios de WordPress y guarda la
 * dirección del archivo elegido.
 *
 * Se usa la biblioteca de WordPress y no un campo de subida propio por dos
 * razones. La primera es que el archivo queda donde el sitio guarda todo lo
 * demás, y viaja en el paquete de exportación como cualquier otro medio. La
 * segunda es que el validador del servidor sólo acepta direcciones que estén
 * dentro de `uploads` de este sitio: una URL de afuera se descarta, porque el
 * valor termina en un <link> de la cabecera de todas las páginas.
 */
(function (window, document) {
    'use strict';

    function marcar(campo, url) {
        var oculto = campo.querySelector('input[type="hidden"]');
        var vista = campo.querySelector('.cod-settings-image-preview');
        var quitar = campo.querySelector('.cod-settings-image-quitar');
        if (!oculto || !vista) {
            return;
        }
        oculto.value = url || '';
        vista.innerHTML = '';
        if (url) {
            var img = document.createElement('img');
            img.src = url;
            img.alt = '';
            vista.appendChild(img);
        } else {
            var vacio = document.createElement('span');
            vacio.className = 'cod-settings-image-vacio';
            vacio.textContent = 'Sin definir';
            vista.appendChild(vacio);
        }
        if (quitar) {
            quitar.disabled = !url;
        }
        // El formulario se autoguarda escuchando change; un valor puesto por
        // JavaScript no lo dispara solo.
        oculto.dispatchEvent(new Event('change', { bubbles: true }));
    }

    document.addEventListener('click', function (evento) {
        var elegir = evento.target.closest && evento.target.closest('.cod-settings-image-elegir');
        var quitar = evento.target.closest && evento.target.closest('.cod-settings-image-quitar');
        if (!elegir && !quitar) {
            return;
        }
        var campo = evento.target.closest('[data-cod-image-field]');
        if (!campo) {
            return;
        }
        evento.preventDefault();

        if (quitar) {
            marcar(campo, '');
            return;
        }
        if (!window.wp || !window.wp.media) {
            window.alert('La biblioteca de medios no está disponible en esta pantalla.');
            return;
        }
        var marco = window.wp.media({
            title: 'Elegir el ícono del sitio',
            button: { text: 'Usar este archivo' },
            library: { type: 'image' },
            multiple: false
        });
        marco.on('select', function () {
            var elegido = marco.state().get('selection').first();
            if (!elegido) {
                return;
            }
            var datos = elegido.toJSON();
            marcar(campo, datos.url || '');
        });
        marco.open();
    });
})(window, document);
