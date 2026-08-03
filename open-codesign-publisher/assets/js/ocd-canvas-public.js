(function (window, document) {
    'use strict';

    function boot() {
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
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
