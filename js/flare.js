/* Brainhertz: scroll / navigation flares.
   A brief datamosh burst (colour bands that smear sideways, RGB-split slivers, macroblocks and a light bloom sweep)
   fires as you move through the site, scaled by scroll velocity, stronger when a new section arrives, then settles.
   Idle cost is zero: the canvas only animates while a flare is decaying. Off entirely under prefers-reduced-motion. */
(function () {
  'use strict';
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var PAL = ['#ff3b3b', '#ff8a1f', '#ffd21f', '#c4ff2e', '#2bff88', '#22e4ff', '#2f8bff'];
  var cv = document.createElement('canvas');
  cv.className = 'flare-layer'; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d'); if (!ctx) return;
  var SCALE = 3, W = 0, H = 0;
  function size() { W = cv.width = Math.ceil(window.innerWidth / SCALE); H = cv.height = Math.ceil(window.innerHeight / SCALE); }
  size(); window.addEventListener('resize', size);

  var seed = 20260927;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function pick() { return PAL[Math.floor(rnd() * PAL.length)]; }

  var energy = 0, tint = null, sweep = -1, raf = 0, last = 0, regen = 0, bands = [], blocks = [], slivers = [];
  function regenerate(e) {
    bands = []; blocks = []; slivers = [];
    var n = Math.round(3 + e * 14);
    for (var i = 0; i < n; i++) bands.push({ x: (rnd() - .3) * W, y: rnd() * H, w: W * (.15 + rnd() * .7), h: Math.max(1, (1 + rnd() * H * .05) * (.5 + e)), vx: (rnd() - .5) * 14 * (.5 + e), c: tint && rnd() < .45 ? tint : pick(), a: .05 + rnd() * .2 });
    var m = Math.round(e * 5);
    for (var j = 0; j < m; j++) slivers.push({ y: rnd() * H, h: 1 + rnd() * 2.5, off: 3 + e * 9 });
    var b = Math.round(e * 20);
    for (var k = 0; k < b; k++) { var s = 3 + Math.floor(rnd() * 9); blocks.push({ x: Math.floor(rnd() * W / s) * s, y: Math.floor(rnd() * H / s) * s, w: s * (1 + Math.floor(rnd() * 5)), h: s, c: pick(), a: .08 + rnd() * .25 }); }
  }
  function draw(e, dt) {
    ctx.clearRect(0, 0, W, H);
    bands.forEach(function (B) { B.x += B.vx * dt / 16; ctx.globalAlpha = B.a * e; ctx.fillStyle = B.c; ctx.fillRect(B.x, B.y, B.w, B.h); });
    slivers.forEach(function (S) {
      ctx.globalAlpha = .34 * e; ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-S.off, S.y, W, S.h);
      ctx.fillStyle = '#22e4ff'; ctx.fillRect(S.off, S.y + S.h, W, S.h);
    });
    blocks.forEach(function (K) { ctx.globalAlpha = K.a * e; ctx.fillStyle = K.c; ctx.fillRect(K.x, K.y, K.w, K.h); });
    if (sweep >= 0) {
      var cx = -W * .35 + sweep * W * 1.7, g = ctx.createLinearGradient(cx - W * .22, 0, cx + W * .22, H * .35);
      g.addColorStop(0, 'rgba(255,210,31,0)'); g.addColorStop(.42, 'rgba(255,210,31,.26)');
      g.addColorStop(.5, 'rgba(255,250,232,.42)'); g.addColorStop(.58, 'rgba(255,138,31,.22)'); g.addColorStop(1, 'rgba(255,59,59,0)');
      ctx.globalAlpha = Math.max(0, 1 - sweep) * .85; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    var dt = Math.min(50, now - last); last = now;
    energy *= Math.exp(-dt / 170);                      // settles in roughly 0.5 s
    if (sweep >= 0) { sweep += dt / 480; if (sweep > 1.15) sweep = -1; }
    if (now - regen > 70) { regen = now; regenerate(energy); } // glitch cadence ~14 fps: reads as mosh, not strobe
    draw(energy, dt);
    if (energy < .025 && sweep < 0) { ctx.clearRect(0, 0, W, H); cv.classList.remove('on'); raf = 0; tint = null; return; }
    raf = requestAnimationFrame(frame);
  }
  function flare(amount, color) {
    if (mq.matches || document.hidden || window.BH_noFlare) return;
    amount = Math.max(0, Math.min(1, amount || 0));
    if (amount > energy) energy = amount;
    if (window.BH_fieldFlare) window.BH_fieldFlare(amount);
    if (color) tint = color;
    if (amount >= .6 && sweep < 0) sweep = 0;
    if (!raf) { last = regen = performance.now(); regenerate(energy); cv.classList.add('on'); raf = requestAnimationFrame(frame); }
  }
  window.BH_flare = flare;

  // scroll velocity -> gentle flare (rAF-throttled)
  var lastY = window.scrollY, lastT = performance.now(), pending = false;
  window.addEventListener('scroll', function () {
    if (pending || mq.matches) return; pending = true;
    requestAnimationFrame(function () {
      pending = false;
      var now = performance.now(), dy = Math.abs(window.scrollY - lastY), dt = Math.max(16, now - lastT);
      lastY = window.scrollY; lastT = now;
      var v = dy / dt; // px per ms
      if (v > .7) flare(Math.min(.45, (v - .7) * .2));
    });
  }, { passive: true });

  // a new section arriving -> full flare in that section's colour + a short saturation / RGB-split hit on the section
  var ready = false, lastHit = 0;
  setTimeout(function () { ready = true; }, 800);
  function rgbOf(el) { var v = getComputedStyle(el).getPropertyValue('--rc-rgb').trim().split(/\s+/); return v.length === 3 ? 'rgb(' + v.join(',') + ')' : null; }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || !ready || mq.matches) return;
        var now = performance.now(); if (now - lastHit < 450) return; lastHit = now;
        flare(1, rgbOf(e.target));
        var t = e.target; t.classList.remove('flare-hit'); void t.offsetWidth; t.classList.add('flare-hit');
        setTimeout(function () { t.classList.remove('flare-hit'); }, 700);
      });
    }, { rootMargin: '-38% 0px -58% 0px' });
    document.querySelectorAll('main section[id], body > section[id], .section[id]').forEach(function (s) { if (s.id !== 'hero') io.observe(s); });
  }
})();
