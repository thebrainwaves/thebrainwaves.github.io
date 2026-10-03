/* Brainhertz: scroll / navigation flares.
   A brief datamosh burst (colour bands that smear sideways, RGB-split slivers, macroblocks and a light bloom sweep)
   fires as you move through the site, scaled by scroll velocity, stronger when a new view opens (js/router.js), then settles.
   Idle cost is zero: the canvas only animates while a flare is decaying. Off entirely under prefers-reduced-motion. */
(function () {
  'use strict';
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  // two families, one per burst, so translucent red never stacks on purple (that mix reads pink)
  var WARM = ['#ff3b3b', '#e5202f', '#b3121f', '#ff5a3c'], COOL = ['#8a3dff', '#a066ff', '#b48cff', '#7a2cff', '#4b1aa8', '#2f6bff'], PAL = COOL;
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
  function isWarm(c) { // red-dominant tint (hex or rgb())
    if (!c) return false; var m = /^#([0-9a-f]{6})$/i.exec(c), r, g, b;
    if (m) { var n = parseInt(m[1], 16); r = n >> 16; g = n >> 8 & 255; b = n & 255; } else { m = /(\d+)\D+(\d+)\D+(\d+)/.exec(c); if (!m) return false; r = +m[1]; g = +m[2]; b = +m[3]; }
    return r > b + 40 && r > g + 40;
  }

  var energy = 0, tint = null, sweep = -1, raf = 0, last = 0, regen = 0, bands = [], blocks = [], slivers = [];
  function regenerate(e) {
    bands = []; blocks = []; slivers = [];
    PAL = isWarm(tint) ? WARM : tint ? COOL : (rnd() < .3 ? WARM : COOL); var tc = PAL === WARM || !isWarm(tint) ? tint : null;
    var n = Math.round(3 + e * 14);
    for (var i = 0; i < n; i++) bands.push({ x: (rnd() - .3) * W, y: rnd() * H, w: W * (.15 + rnd() * .7), h: Math.max(1, (1 + rnd() * H * .05) * (.5 + e)), vx: (rnd() - .5) * 14 * (.5 + e), c: tc && rnd() < .45 ? tc : pick(), a: .05 + rnd() * .2 });
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
      ctx.fillStyle = '#a066ff'; ctx.fillRect(S.off, S.y + S.h, W, S.h);
    });
    blocks.forEach(function (K) { ctx.globalAlpha = K.a * e; ctx.fillStyle = K.c; ctx.fillRect(K.x, K.y, K.w, K.h); });
    if (sweep >= 0) {
      var cx = -W * .35 + sweep * W * 1.7, g = ctx.createLinearGradient(cx - W * .22, 0, cx + W * .22, H * .35);
      g.addColorStop(0, 'rgba(180,140,255,0)'); g.addColorStop(.42, 'rgba(180,140,255,.26)');
      g.addColorStop(.5, 'rgba(240,236,255,.42)'); g.addColorStop(.58, 'rgba(138,61,255,.22)'); g.addColorStop(1, 'rgba(47,107,255,0)');
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

  // a new view arriving (js/router.js) -> full flare in that view's colour + a short saturation / RGB-split hit on the section
  function rgbOf(el) { var v = getComputedStyle(el).getPropertyValue('--rc-rgb').trim().split(/\s+/); return v.length === 3 ? 'rgb(' + v.join(',') + ')' : null; }
  window.BH_sectionHit = function (t, amount) {
    if (!t || mq.matches || window.BH_noFlare) return;
    flare(amount == null ? 1 : amount, rgbOf(t));
    t.classList.remove('flare-hit'); void t.offsetWidth; t.classList.add('flare-hit');
    setTimeout(function () { t.classList.remove('flare-hit'); }, 700);
  };
})();
