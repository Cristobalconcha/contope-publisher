/**
 * Open CoDesign Publisher — pantalla Plantillas.
 *
 * Maneja el guardado de alcance/destinos por región, la creación de grupos de
 * plantilla, el agregado de regiones a una plantilla, el renombrado y el
 * borrado de regiones mediante admin-ajax con nonce. Los selectores ya vienen
 * poblados por el servidor con páginas, categorías y etiquetas reales; acá
 * sólo se traducen a reglas y se envían como JSON estructurado.
 */
(function (window, document) {
    'use strict';

    var config = window.ocdThemeBuilder;

    if (!config) {
        return;
    }

    function parseJson(value) {
        if (typeof value !== 'string' || value === '') {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function request(action, params) {
        var body = new window.URLSearchParams();
        body.set('action', action);
        body.set('nonce', config.nonce);
        Object.keys(params || {}).forEach(function (key) {
            body.set(key, params[key]);
        });

        return window
            .fetch(config.ajaxUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body.toString()
            })
            .then(function (response) {
                return response.text().then(function (text) {
                    var payload = parseJson(text);
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

    function setStatus(container, message, kind) {
        if (!container) {
            return;
        }
        var status = container.querySelector('.ocd-tb-status');
        if (!status) {
            return;
        }
        status.textContent = message;
        status.className = 'ocd-tb-status' + (kind ? ' is-' + kind : '');
    }

    function closestRegion(node) {
        while (node && node !== document) {
            if (node.classList && node.classList.contains('ocd-tb-region')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function parseRuleValue(value) {
        if (value === 'all_pages' || value === 'homepage' || value === 'all_posts') {
            return { type: value };
        }
        var separator = String(value || '').indexOf(':');
        if (separator === -1) {
            return null;
        }
        var type = String(value).slice(0, separator);
        var id = parseInt(String(value).slice(separator + 1), 10);
        if (!type || !Number.isFinite(id) || id <= 0) {
            return null;
        }
        return { type: type, id: id };
    }

    function rulesFromSelect(select) {
        var rules = [];
        Array.prototype.forEach.call(select.selectedOptions, function (option) {
            var rule = parseRuleValue(option.value);
            if (rule) {
                rules.push(rule);
            }
        });
        return rules;
    }

    function selectedLabels(select) {
        return Array.prototype.map.call(select.selectedOptions, function (option) {
            return option.textContent.trim();
        });
    }

    function scopeSummary(scope, targetsSelect, excludesSelect) {
        var parts = [];
        if (scope === 'local') {
            var targets = selectedLabels(targetsSelect);
            parts.push('Local — ' + (targets.length ? targets.join(', ') : 'sin destinos'));
        } else {
            parts.push('Global — todo el sitio');
        }

        var excludes = selectedLabels(excludesSelect);
        if (excludes.length) {
            parts.push('excluye: ' + excludes.join(', '));
        }

        return parts.join(' · ');
    }

    function refreshScopeForm(form) {
        var scope = form.querySelector('.ocd-tb-scope');
        var targets = form.querySelector('.ocd-tb-targets');
        if (!scope || !targets) {
            return;
        }
        var isLocal = scope.value === 'local';
        targets.disabled = !isLocal;
        targets.classList.toggle('is-disabled', !isLocal);
    }

    document.querySelectorAll('.ocd-tb-scope-form').forEach(function (form) {
        var scope = form.querySelector('.ocd-tb-scope');
        var targets = form.querySelector('.ocd-tb-targets');
        var excludes = form.querySelector('.ocd-tb-excludes');
        var summary = form.querySelector('.ocd-tb-scope-summary');

        if (scope) {
            scope.addEventListener('change', function () {
                refreshScopeForm(form);
            });
        }
        refreshScopeForm(form);

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var region = closestRegion(form);
            var documentId = region ? region.getAttribute('data-document-id') : '';
            var kind = region ? region.getAttribute('data-region-kind') : '';
            var scopeValue = scope ? scope.value : '';
            var targetRules = targets ? rulesFromSelect(targets) : [];
            var excludeRules = excludes ? rulesFromSelect(excludes) : [];

            if (!documentId || !kind) {
                setStatus(form, 'No se pudo identificar la región.', 'error');
                return;
            }
            if (scopeValue === 'local' && targetRules.length === 0) {
                setStatus(form, 'Una región local necesita al menos un destino.', 'error');
                return;
            }

            setStatus(form, 'Guardando alcance…');
            request(config.saveRegionAction, {
                document_id: documentId,
                region_kind: kind,
                region_scope: scopeValue,
                region_targets: JSON.stringify(targetRules),
                region_excludes: JSON.stringify(excludeRules)
            })
                .then(function () {
                    if (summary && scope && targets && excludes) {
                        summary.textContent = scopeSummary(scope.value, targets, excludes);
                    }
                    setStatus(form, 'Alcance guardado.', 'ok');
                })
                .catch(function (error) {
                    setStatus(form, 'No se pudo guardar: ' + error.message, 'error');
                });
        });
    });

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }

        var deleteButton = target.closest('.ocd-tb-delete');
        if (deleteButton) {
            event.preventDefault();
            var region = deleteButton.closest('.ocd-tb-region');
            var card = deleteButton.closest('.ocd-tb-card');
            if (!region || !card) {
                return;
            }
            var documentId = region.getAttribute('data-document-id');
            var nameNode = card.querySelector('.ocd-tb-card-name') || card.querySelector('[name="template_title"]');
            var cardName = nameNode
                ? (nameNode.value || nameNode.textContent.trim())
                : card.getAttribute('data-template-id');
            var kind = region.getAttribute('data-region-kind');
            var confirmed = window.confirm(
                '¿Quitar la región «' + kind + '» de la plantilla «' + cardName + '»? ' +
                'El documento Canvas no se borra; solo se le quita la asignación de región.'
            );
            if (!confirmed) {
                return;
            }

            setStatus(region, 'Quitando región…');
            request(config.deleteRegionAction, { document_id: documentId })
                .then(function () {
                    window.location.reload();
                })
                .catch(function (error) {
                    setStatus(region, 'No se pudo quitar: ' + error.message, 'error');
                });
            return;
        }

        var addButton = target.closest('.ocd-tb-add-region');
        if (addButton) {
            event.preventDefault();
            var addRegion = addButton.closest('.ocd-tb-region');
            var addCard = addButton.closest('.ocd-tb-card');
            var templateId = addCard ? addCard.getAttribute('data-template-id') : '';
            var kind = addRegion ? addRegion.getAttribute('data-region-kind') : '';
            if (!templateId || !kind) {
                return;
            }
            addButton.disabled = true;
            request(config.addRegionAction, { template_id: templateId, region_kind: kind })
                .then(function () {
                    window.location.reload();
                })
                .catch(function (error) {
                    addButton.disabled = false;
                    window.alert('No se pudo agregar la región: ' + error.message);
                });
        }
    });

    var createForm = document.getElementById('ocd-tb-create');
    if (createForm) {
        createForm.addEventListener('submit', function (event) {
            event.preventDefault();
            var titleInput = createForm.querySelector('[name="title"]');
            var title = titleInput ? titleInput.value.trim() : '';
            if (title === '') {
                setStatus(createForm, 'Escribí un nombre para la plantilla.', 'error');
                return;
            }

            setStatus(createForm, 'Creando plantilla…');
            request(config.createTemplateAction, { title: title })
                .then(function () {
                    window.location.reload();
                })
                .catch(function (error) {
                    setStatus(createForm, 'No se pudo crear: ' + error.message, 'error');
                });
        });
    }

    document.querySelectorAll('.ocd-tb-rename').forEach(function (form) {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            var templateId = form.getAttribute('data-template-id');
            var input = form.querySelector('[name="template_title"]');
            var title = input ? input.value.trim() : '';
            if (title === '') {
                setStatus(form, 'Escribí un nombre para la plantilla.', 'error');
                return;
            }

            setStatus(form, 'Guardando nombre…');
            request(config.renameTemplateAction, { template_id: templateId, template_title: title })
                .then(function () {
                    window.location.reload();
                })
                .catch(function (error) {
                    setStatus(form, 'No se pudo guardar: ' + error.message, 'error');
                });
        });
    });
})(window, document);
