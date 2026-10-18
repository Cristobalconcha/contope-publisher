// Auditoría de un sitio en producción: lo que se ve, lo que se carga y lo que se puede pinchar.
// uso: node auditoria-sitio.cjs https://santaluisadepalpi.cl /,/diferenciales/,...
const { chromium } = require('C:/Users/Cristobal concha/wp-local/node_modules/playwright-core');
const base = process.argv[2];
const rutas = (process.argv[3] || '/').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const hallazgos = [];
  const anota = (ruta, vp, tipo, detalle) => { hallazgos.push({ ruta, vp, tipo, detalle }); };
  for (const ruta of rutas) {
    for (const [vn, vp, mob] of [['esc', { width: 1440, height: 900 }, false], ['cel', { width: 412, height: 915 }, true]]) {
      const p = await b.newPage({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
      const fallos = new Set(), errores = [];
      p.on('response', (r) => { if (r.status() >= 400) fallos.add(r.status() + ' ' + r.url().slice(0, 140)); });
      p.on('pageerror', (e) => errores.push(e.message.slice(0, 140)));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 140)); });
      try { await p.goto(base + ruta, { waitUntil: 'load', timeout: 90000 }); } catch (e) { anota(ruta, vn, 'NO CARGA', String(e).slice(0, 80)); await p.close(); continue; }
      await p.waitForTimeout(2500);
      // recorrer la página despacio, como una persona
      await p.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let t = 0; t < h; t += 350) { window.scrollTo(0, t); await new Promise((r) => setTimeout(r, 160)); } window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 1200)); });
      // 1) desborde horizontal
      const des = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (des > 1) anota(ruta, vn, 'DESBORDE HORIZONTAL', des + ' px');
      // 2) carruseles: avanzar hasta el final y comprobar que cada foto a la vista cargó
      const nCar = await p.locator('[data-cod-behavior="carousel-basic"]').count();
      for (let c = 0; c < nCar; c++) {
        const car = p.locator('[data-cod-behavior="carousel-basic"]').nth(c);
        await car.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
        const sig = car.locator('[data-cod-carousel-next]');
        let pasos = 0;
        const sinCargar = new Set();
        const mira = async () => car.evaluate((root) => { const cr = root.getBoundingClientRect(); return [...root.querySelectorAll('img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.right > cr.left + 5 && r.left < cr.right - 5; }).filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => (i.getAttribute('src') || '').split('/').pop()); });
        // Descargada no es lo mismo que vista: el 19-oct-2026 las 8 fotos de Diferenciales
        // cargaban pero quedaban fuera del recorte de la pista, y esta auditoría daba «sin
        // hallazgos». Se cuenta como vista sólo la foto cuyo centro es lo que el navegador pinta.
        const vistas = new Set();
        const pinta = async () => car.evaluate((root) => [...root.querySelectorAll('img')].filter((i) => { if (!(i.complete && i.naturalWidth > 0)) return false; const r = i.getBoundingClientRect(); if (!r.width) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; return document.elementFromPoint(x, y) === i; }).map((i) => (i.getAttribute('src') || '').split('/').pop()));
        (await mira()).forEach((x) => sinCargar.add(x)); (await pinta()).forEach((x) => vistas.add(x));
        while ((await sig.count()) && !(await sig.first().isDisabled()) && pasos < 30) { await sig.first().click(); await p.waitForTimeout(1300); pasos++; (await mira()).forEach((x) => sinCargar.add(x)); (await pinta()).forEach((x) => vistas.add(x)); }
        if (sinCargar.size) anota(ruta, vn, 'CARRUSEL: foto a la vista sin cargar', [...sinCargar].join(', '));
        const todas = await car.evaluate((root) => [...new Set([...root.querySelectorAll('.cod-carousel__track img')].map((i) => (i.getAttribute('src') || '').split('/').pop()).filter(Boolean))]);
        const nunca = todas.filter((x) => !vistas.has(x));
        if (nunca.length) anota(ruta, vn, 'CARRUSEL: fotos que nunca se ven al recorrerlo', nunca.join(', '));
        const total = await car.locator('img').count();
        if (pasos === 0 && total > 4 && vn === 'cel') anota(ruta, vn, 'CARRUSEL: no avanza', total + ' fotos');
      }
      // 3) imágenes que no cargan con la página ya recorrida (las visibles y las de fuera de cuadro sin lazy)
      const rotas = await p.evaluate(() => [...document.images].filter((i) => i.getAttribute('src') && !i.closest('[data-cod-behavior="carousel-basic"]') && i.getBoundingClientRect().width > 0 && !(i.complete && i.naturalWidth > 0)).map((i) => (i.currentSrc || i.src).split('/').pop()));
      if (rotas.length) anota(ruta, vn, 'IMAGEN SIN CARGAR', [...new Set(rotas)].join(', '));
      // 4) videos
      const vids = await p.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || (v.querySelector('source') && v.querySelector('source').src) || '').split('/').pop(), err: v.error ? v.error.code : 0, rs: v.readyState, oculto: v.hidden })));
      vids.filter((v) => v.err || (v.rs === 0 && !v.oculto)).forEach((v) => anota(ruta, vn, 'VIDEO con problema', JSON.stringify(v)));
      // 5) acordeones y pestañas: abrir cada uno
      const nAc = await p.locator('[data-cod-acordeon-rol="resumen"]').count();
      let malosAc = 0;
      for (let i = 0; i < Math.min(nAc, 12); i++) { const r = p.locator('[data-cod-acordeon-rol="resumen"]').nth(i); await r.scrollIntoViewIfNeeded(); const antes = await r.getAttribute('aria-expanded'); await r.click(); await p.waitForTimeout(450); const ab = await r.getAttribute('aria-expanded'); if (ab === antes) malosAc++; }
      if (malosAc) anota(ruta, vn, 'ACORDEÓN no abre', malosAc + ' de ' + Math.min(nAc, 12));
      // 6) lightbox de galería
      const gal = p.locator('[data-cod-lightbox-close]'); if (await gal.count()) {
        const foto = p.locator('.cod-mcp-gallery__item img, [data-cod-behavior="lightbox"] img').first();
        if (await foto.count()) { await foto.scrollIntoViewIfNeeded(); await foto.click({ force: true }).catch(() => {}); await p.waitForTimeout(900);
          const lb = await p.evaluate(() => { const i = document.getElementById('galleryLightboxImg') || document.querySelector('[data-cod-lightbox] img'); return i ? { src: (i.getAttribute('src') || '').slice(0, 30), ok: i.complete && i.naturalWidth > 0 } : null; });
          if (lb && !lb.ok) anota(ruta, vn, 'LIGHTBOX no muestra la foto', JSON.stringify(lb));
          await p.keyboard.press('Escape'); }
      }
      // 7) respuestas con error y errores de consola
      fallos.forEach((f) => anota(ruta, vn, 'PETICIÓN FALLIDA', f));
      errores.forEach((e) => anota(ruta, vn, 'ERROR DE CONSOLA', e));
      await p.close();
    }
  }
  console.log(hallazgos.length ? hallazgos.map((h) => `${h.ruta.padEnd(24)} ${h.vp}  ${h.tipo}: ${h.detalle}`).join('\n') : 'SIN HALLAZGOS');
  await b.close();
})();
