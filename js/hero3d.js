/* Hero heading tilt: a small CSS 3D tilt that follows the mouse, and the text-shadow extrusion leans with it.
   Fine pointers with hover only; nothing on touch devices or with prefers-reduced-motion. */
(function () {
  'use strict';
  var h = document.getElementById('hero-title'); if (!h || !window.matchMedia) return;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)'), reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var raf = 0, tx = 0, ty = 0, on = false;
  function apply() {
    raf = 0;
    h.style.setProperty('--h3-ry', (tx * 7).toFixed(2) + 'deg');
    h.style.setProperty('--h3-rx', (-ty * 5).toFixed(2) + 'deg');
    h.style.setProperty('--h3-ex', (-tx).toFixed(3));
    h.style.setProperty('--h3-ey', (-ty).toFixed(3));
  }
  function reset() { tx = ty = 0; h.classList.remove('h3-live'); if (!raf) raf = requestAnimationFrame(apply); }
  function move(e) {
    if (!on) return;
    var r = h.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * .45)));
    ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * .45)));
    h.classList.add('h3-live'); if (!raf) raf = requestAnimationFrame(apply);
  }
  function check() { on = fine.matches && !reduce.matches; if (!on) reset(); }
  check();
  [fine, reduce].forEach(function (m) { if (m.addEventListener) m.addEventListener('change', check); });
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
})();
