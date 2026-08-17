/**
 * Open CoDesign Publisher — pantalla Plantillas del tema.
 *
 * Tarjetas con las tres regiones (Encabezado/Cuerpo/Pie). El selector asigna
 * una región existente COMPARTIÉNDOLA entre plantillas (misma región, mismos
 * cambios para todas); el botón + bifurca la región seleccionada (o crea una
 * vacía) y abre el Canvas para construirla. Todo se autoguarda por admin-ajax
 * con nonce y las tarjetas se re-renderizan en el servidor, sin recargas.
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
        status.textContent = message || '';
        status.classList.remove('is-ok', 'is-error');
        if (kind) {
            status.classList.add('is-' + kind);
        }
    }

    function cardOf(node) {
        return node ? node.closest('.ocd-tb-card') : null;
    }

    function regionOf(node) {
        return node ? node.closest('.ocd-tb-region') : null;
    }

    function templateIdOf(card) {
        return card ? card.getAttribute('data-template-id') || '' : '';
    }

    function cardNameOf(card) {
        var name = card ? card.querySelector('.ocd-tb-card-name') : null;
        return name ? name.textContent.trim() : '';
    }

    function regionLabelOf(kind) {
        if (kind === 'header') {
            return 'Encabezado';
        }
        if (kind === 'footer') {
            return 'Pie de página';
        }
        return 'Cuerpo';
    }

    function openRegion(region, isOpen) {
        if (!region) {
            return;
        }
        var panel = region.querySelector('.ocd-tb-region-panel');
        var chevron = region.querySelector('.ocd-tb-chevron');
        region.classList.toggle('is-open', isOpen);
        if (panel) {
            panel.hidden = !isOpen;
        }
        if (chevron) {
            chevron.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
    }

    function openKindsOf(card) {
        var kinds = [];
        if (!card) {
            return kinds;
        }
        card.querySelectorAll('.ocd-tb-region.is-open').forEach(function (region) {
            var kind = region.getAttribute('data-region-kind');
            if (kind) {
                kinds.push(kind);
            }
        });
        return kinds;
    }

    function replaceCard(cardHtml, oldCard) {
        if (!cardHtml || !oldCard || !oldCard.parentNode) {
            return null;
        }
        var openKinds = openKindsOf(oldCard);
        var holder = document.createElement('div');
        holder.innerHTML = cardHtml;
        var fresh = holder.firstElementChild;
        if (!fresh) {
            return null;
        }
        oldCard.parentNode.replaceChild(fresh, oldCard);
        openKinds.forEach(function (kind) {
            openRegion(fresh.querySelector('.ocd-tb-region[data-region-kind="' + kind + '"]'), true);
        });
        return fresh;
    }

    function closeMenus(scope) {
        var root = scope || document;
        root.querySelectorAll('.ocd-tb-menu.is-open').forEach(function (menu) {
            menu.classList.remove('is-open');
            var panel = menu.querySelector('.ocd-tb-menu-panel');
            if (panel) {
                panel.hidden = true;
            }
        });
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
        if (!form) {
            return;
        }
        var scope = form.querySelector('.ocd-tb-scope');
        var targets = form.querySelector('.ocd-tb-targets');
        if (!scope || !targets) {
            return;
        }
        var isLocal = scope.value === 'local';
        targets.disabled = !isLocal;
        targets.classList.toggle('is-disabled', !isLocal);
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }

        var newButton = target.closest('#ocd-tb-new-template');
        if (newButton) {
            event.preventDefault();
            var title = (window.prompt('Nombre de la plantilla nueva:', '') || '').trim();
            if (title === '') {
                return;
            }
            newButton.disabled = true;
            request(config.createTemplateAction, { title: title })
                .then(function (data) {
                    var grid = document.getElementById('ocd-tb-grid');
                    if (grid && data.cardHtml) {
                        var holder = document.createElement('div');
                        holder.innerHTML = data.cardHtml;
                        if (holder.firstElementChild) {
                            grid.appendChild(holder.firstElementChild);
                            holder.firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                })
                .catch(function (error) {
                    window.alert('No se pudo crear la plantilla: ' + error.message);
                })
                .then(function () {
                    newButton.disabled = false;
                });
            return;
        }

        var chevron = target.closest('.ocd-tb-chevron');
        if (chevron) {
            event.preventDefault();
            var chevronRegion = regionOf(chevron);
            openRegion(chevronRegion, !chevronRegion.classList.contains('is-open'));
            return;
        }

        var fork = target.closest('.ocd-tb-fork');
        if (fork) {
            event.preventDefault();
            var forkRegion = regionOf(fork);
            var forkCard = cardOf(fork);
            if (!forkRegion || !forkCard) {
                return;
            }
            var kind = forkRegion.getAttribute('data-region-kind') || '';
            var select = forkRegion.querySelector('[data-region-select]');
            var sourceId = select ? select.value || '' : '';
            var templateName = cardNameOf(forkCard);
            var suggestion = regionLabelOf(kind) + (templateName !== '' ? ' — ' + templateName : '');
            var origin = sourceId === '' ? 'una región vacía' : 'la región seleccionada';
            var name = (window.prompt('Nombre de la región nueva (a partir de ' + origin + '):', suggestion) || '').trim();
            if (name === '') {
                return;
            }
            fork.disabled = true;
            request(config.createRegionAction, {
                template_id: templateIdOf(forkCard),
                region_kind: kind,
                title: name,
                source_document_id: sourceId
            })
                .then(function (data) {
                    if (data.editUrl) {
                        window.location.href = data.editUrl;
                    }
                })
                .catch(function (error) {
                    fork.disabled = false;
                    window.alert('No se pudo crear la región: ' + error.message);
                });
            return;
        }

        var menuToggle = target.closest('.ocd-tb-menu-toggle');
        if (menuToggle) {
            event.preventDefault();
            var menu = menuToggle.closest('.ocd-tb-menu');
            if (!menu) {
                return;
            }
            var willOpen = !menu.classList.contains('is-open');
            closeMenus(document);
            if (willOpen) {
                menu.classList.add('is-open');
                var menuPanel = menu.querySelector('.ocd-tb-menu-panel');
                if (menuPanel) {
                    menuPanel.hidden = false;
                }
            }
            return;
        }

        var menuRename = target.closest('.ocd-tb-menu-rename');
        if (menuRename) {
            event.preventDefault();
            var renameCard = cardOf(menuRename);
            closeMenus(document);
            var renameForm = renameCard ? renameCard.querySelector('.ocd-tb-rename') : null;
            if (renameForm) {
                renameForm.hidden = false;
                var renameInput = renameForm.querySelector('input[name="template_title"]');
                if (renameInput) {
                    renameInput.focus();
                }
            }
            return;
        }

        var menuDelete = target.closest('.ocd-tb-menu-delete');
        if (menuDelete) {
            event.preventDefault();
            var delCard = cardOf(menuDelete);
            closeMenus(document);
            if (!delCard) {
                return;
            }
            var confirmed = window.confirm(
                '¿Eliminar la plantilla «' + cardNameOf(delCard) + '»?\n\n' +
                'Sus regiones NO se borran: quedan disponibles en los selectores del tema.'
            );
            if (!confirmed) {
                return;
            }
            request(config.deleteTemplateAction, { template_id: templateIdOf(delCard) })
                .then(function () {
                    if (delCard.parentNode) {
                        delCard.parentNode.removeChild(delCard);
                    }
                })
                .catch(function (error) {
                    window.alert('No se pudo eliminar: ' + error.message);
                });
            return;
        }

        var renameCancel = target.closest('.ocd-tb-rename-cancel');
        if (renameCancel) {
            event.preventDefault();
            var cancelForm = renameCancel.closest('.ocd-tb-rename');
            if (cancelForm) {
                cancelForm.hidden = true;
            }
            return;
        }

        if (!target.closest('.ocd-tb-menu')) {
            closeMenus(document);
        }
    });

    document.addEventListener('change', function (event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }

        var select = target.closest('[data-region-select]');
        if (select) {
            var region = regionOf(select);
            var card = cardOf(select);
            if (!region || !card) {
                return;
            }
            var kind = region.getAttribute('data-region-kind') || '';
            select.disabled = true;
            setStatus(region, 'Guardando…');
            request(config.assignRegionAction, {
                template_id: templateIdOf(card),
                region_kind: kind,
                document_id: select.value || ''
            })
                .then(function (data) {
                    var fresh = replaceCard(data.cardHtml, card);
                    if (!fresh) {
                        select.disabled = false;
                        setStatus(region, 'Región actualizada (refrescá para ver la tarjeta).', 'ok');
                        return;
                    }
                    var statusRegion = fresh.querySelector('.ocd-tb-region[data-region-kind="' + kind + '"]');
                    setStatus(statusRegion, 'Región actualizada.', 'ok');
                })
                .catch(function (error) {
                    select.disabled = false;
                    select.value = region.getAttribute('data-assigned-document') || '';
                    setStatus(region, 'No se pudo asignar: ' + error.message, 'error');
                });
            return;
        }

        var scope = target.closest('.ocd-tb-scope');
        if (scope) {
            refreshScopeForm(scope.closest('.ocd-tb-scope-form'));
        }
    });

    document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || !form.classList) {
            return;
        }

        if (form.classList.contains('ocd-tb-scope-form')) {
            event.preventDefault();
            var region = regionOf(form);
            var documentId = region ? region.getAttribute('data-assigned-document') || '' : '';
            var kind = region ? region.getAttribute('data-region-kind') || '' : '';
            var scopeSelect = form.querySelector('.ocd-tb-scope');
            var targetsSelect = form.querySelector('.ocd-tb-targets');
            var excludesSelect = form.querySelector('.ocd-tb-excludes');
            var summary = form.querySelector('.ocd-tb-scope-summary');

            if (!documentId || !kind || !scopeSelect || !targetsSelect) {
                setStatus(form, 'No se pudo identificar la región.', 'error');
                return;
            }
            var scopeValue = scopeSelect.value;
            var targetRules = rulesFromSelect(targetsSelect);
            var excludeRules = rulesFromSelect(excludesSelect);
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
                    if (summary && scopeSelect && targetsSelect && excludesSelect) {
                        summary.textContent = scopeSummary(scopeSelect.value, targetsSelect, excludesSelect);
                    }
                    setStatus(form, 'Alcance guardado.', 'ok');
                })
                .catch(function (error) {
                    setStatus(form, 'No se pudo guardar: ' + error.message, 'error');
                });
            return;
        }

        if (form.classList.contains('ocd-tb-rename')) {
            event.preventDefault();
            var templateId = form.getAttribute('data-template-id') || '';
            var input = form.querySelector('input[name="template_title"]');
            var title = input ? input.value.trim() : '';
            if (title === '') {
                setStatus(form, 'Escribí un nombre para la plantilla.', 'error');
                return;
            }

            setStatus(form, 'Guardando nombre…');
            request(config.renameTemplateAction, { template_id: templateId, template_title: title })
                .then(function (data) {
                    if (data.cardHtml) {
                        replaceCard(data.cardHtml, cardOf(form));
                    } else {
                        form.hidden = true;
                    }
                })
                .catch(function (error) {
                    setStatus(form, 'No se pudo guardar: ' + error.message, 'error');
                });
            return;
        }

        if (form.classList.contains('ocd-tb-region-name-form')) {
            event.preventDefault();
            var nameCard = cardOf(form);
            var nameRegion = regionOf(form);
            var nameDocumentId = form.getAttribute('data-document-id') || '';
            var nameInput = form.querySelector('input[name="region_title"]');
            var regionTitle = nameInput ? nameInput.value.trim() : '';
            if (regionTitle === '') {
                setStatus(form, 'Escribí un nombre para la región.', 'error');
                return;
            }

            setStatus(form, 'Guardando nombre…');
            request(config.renameRegionAction, {
                document_id: nameDocumentId,
                template_id: templateIdOf(nameCard),
                title: regionTitle
            })
                .then(function (data) {
                    if (data.cardHtml) {
                        replaceCard(data.cardHtml, nameCard);
                    } else {
                        setStatus(form, 'Nombre guardado.', 'ok');
                    }
                })
                .catch(function (error) {
                    setStatus(form, 'No se pudo guardar: ' + error.message, 'error');
                });
            return;
        }
    });
})(window, document);
