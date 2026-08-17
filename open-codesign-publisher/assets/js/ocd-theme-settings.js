/**
 * Open CoDesign Publisher — pantalla Configuración (definiciones del tema).
 *
 * Autoguarda el formulario de definiciones de estilo por admin-ajax con nonce.
 * El cambio/input de cualquier campo agenda un guardado con debounce de 600ms;
 * el botón "Guardar ahora" fuerza el guardado inmediato. Nunca recarga la
 * página: el estado se refleja en el indicador `#ocd-settings-status`.
 */
(function (window, document) {
    'use strict';

    var config = window.ocdThemeSettings;

    if (!config) {
        return;
    }

    var form = document.getElementById('ocd-settings-form');
    var statusNode = document.getElementById('ocd-settings-status');
    var saveNowButton = document.getElementById('ocd-settings-save-now');

    var debounceTimer = null;
    var saving = false;
    var queued = false;

    function setStatus(message, kind) {
        if (!statusNode) {
            return;
        }
        statusNode.textContent = message;
        statusNode.className = 'ocd-settings-status' + (kind ? ' is-' + kind : '');
    }

    function collect() {
        var map = {};
        var fields = form ? form.querySelectorAll('[data-field-id]') : [];
        Array.prototype.forEach.call(fields, function (field) {
            // Un color "sin definir" viaja como '': el navegador normaliza el
            // input a #000000, así que el estado real lo marca data-ocd-undefined.
            var isUndefinedColor =
                field.getAttribute('type') === 'color' &&
                field.getAttribute('data-ocd-undefined') === '1';
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
            var wrap = input.closest('.ocd-settings-color');
            if (!wrap) {
                return;
            }
            var value = wrap.querySelector('.ocd-settings-color-value');
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
            target.removeAttribute('data-ocd-undefined');
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
