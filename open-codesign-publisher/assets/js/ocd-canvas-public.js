(function (window, document) {
    'use strict';

    function compensateWordPressAdminBar(root) {
        var bar = document.getElementById('wpadminbar');
        if (!bar || !document.body.classList.contains('admin-bar')) return;

        var offset = bar.getBoundingClientRect().height || bar.offsetHeight || 32;
        root.querySelectorAll('*').forEach(function (node) {
            var style = window.getComputedStyle(node);
            var top = Number.parseFloat(style.top);
            if (style.position === 'fixed' && Number.isFinite(top) && Math.abs(top) < 1) {
                node.style.setProperty('top', offset + 'px', 'important');
                node.setAttribute('data-ocd-admin-bar-offset', String(offset));
            }
        });
    }

    function activateAutoplayVideos(root) {
        root.querySelectorAll('video[autoplay]').forEach(function (video) {
            video.muted = true;
            video.defaultMuted = true;
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            installSoundToggle(video);
            var playback = video.play();
            if (playback && typeof playback.catch === 'function') {
                playback.catch(function () {
                    // El navegador puede mantener otras políticas de ahorro;
                    // el video conserva controles/estado definidos por el diseño.
                });
            }
        });
    }

    function installSoundToggle(video) {
        if (video.getAttribute('data-ocd-sound-toggle') === 'installed') return;

        var container = video.parentElement;
        if (!container) return;

        video.setAttribute('data-ocd-sound-toggle', 'installed');
        container.classList.add('ocd-video-sound-container');

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'ocd-video-sound-toggle';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', 'Activar sonido ambiental');
        button.innerHTML = '<span aria-hidden="true">&#128263;</span><span>Activar sonido</span>';

        button.addEventListener('click', function () {
            var enableSound = video.muted;
            video.muted = !enableSound;
            video.defaultMuted = !enableSound;
            if (enableSound) video.removeAttribute('muted');
            else video.setAttribute('muted', '');

            button.setAttribute('aria-pressed', enableSound ? 'true' : 'false');
            button.setAttribute('aria-label', enableSound ? 'Silenciar sonido ambiental' : 'Activar sonido ambiental');
            button.innerHTML = enableSound
                ? '<span aria-hidden="true">&#128266;</span><span>Silenciar</span>'
                : '<span aria-hidden="true">&#128263;</span><span>Activar sonido</span>';

            var playback = video.play();
            if (playback && typeof playback.catch === 'function') playback.catch(function () {});
        });

        container.appendChild(button);
    }

    function installSoundToggleStyles() {
        if (document.getElementById('ocd-video-sound-toggle-styles')) return;
        var style = document.createElement('style');
        style.id = 'ocd-video-sound-toggle-styles';
        style.textContent = [
            '.ocd-video-sound-container{position:relative}',
            '.ocd-video-sound-toggle{position:absolute;right:1rem;bottom:1rem;z-index:20;display:inline-flex;align-items:center;gap:.5rem;padding:.65rem .9rem;border:1px solid rgba(255,255,255,.58);border-radius:999px;background:rgba(20,20,20,.68);color:#fff;font:600 13px/1.2 system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 18px rgba(0,0,0,.2)}',
            '.ocd-video-sound-toggle:hover{background:rgba(20,20,20,.84)}',
            '.ocd-video-sound-toggle:focus-visible{outline:3px solid #fff;outline-offset:3px}',
            '@media (max-width:600px){.ocd-video-sound-toggle{right:.65rem;bottom:.65rem}.ocd-video-sound-toggle span:last-child{display:none}}'
        ].join('');
        document.head.appendChild(style);
    }

    function boot() {
        var roots = document.querySelectorAll('.ocd-canvas-published');
        installSoundToggleStyles();
        Array.prototype.forEach.call(roots, function (root) {
            compensateWordPressAdminBar(root);
            activateAutoplayVideos(root);
        });

        var nodes = document.querySelectorAll('[data-ocd-behavior="scroll-threshold"]');
        Array.prototype.forEach.call(nodes, function (node) {
            var threshold = Number.parseFloat(node.getAttribute('data-ocd-scroll-threshold') || '40');
            if (!Number.isFinite(threshold) || threshold < 0) threshold = 40;
            function update() {
                node.classList.toggle('nav--scrolled', window.scrollY > threshold);
            }
            update();
            window.addEventListener('scroll', update, { passive: true });
            window.addEventListener('resize', update, { passive: true });
        });

        window.addEventListener('resize', function () {
            Array.prototype.forEach.call(roots, compensateWordPressAdminBar);
        }, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
