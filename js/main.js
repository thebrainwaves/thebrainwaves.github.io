(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  // synapse dividers: a neuron strand with a travelling pulse
  document.querySelectorAll('.synapse').forEach(function (box, i) {
    var s = el('svg', { viewBox: '0 0 1200 90', preserveAspectRatio: 'xMidYMid meet' }, box);
    var gid = 'g-syn-' + i, defs = el('defs', {}, s), lg = el('linearGradient', { id: gid, x1: 0, x2: 1 }, defs);
    // warm (red-orange-yellow) and cool (blue-cyan-green) strands alternate; neither blends through purple
    var warm = ['#ff3b3b', '#ff8a1f', '#ffd21f'], cool = ['#2f8bff', '#22e4ff', '#2bff88'], set = i % 2 ? cool : warm;
    set.forEach(function (c, k) { el('stop', { offset: k / 2, 'stop-color': c }, lg); });
    box.style.setProperty('--rc-rgb', ['255 210 31', '34 228 255', '255 59 59', '43 255 136', '255 138 31', '47 139 255'][i % 6]);
    var amp = 18 + (i % 3) * 6, flip = i % 2 ? -1 : 1;
    var d = 'M0 45 C150 45 200 ' + (45 - amp * flip) + ' 300 ' + (45 - amp * flip) + ' S450 ' + (45 + amp * flip) + ' 600 45 S800 ' + (45 - amp * flip) + ' 900 ' + (45 - amp * .6 * flip) + ' S1100 45 1200 45';
    var p = el('path', { d: d, 'class': 'syn-path' }, s);
    var q = el('path', { d: d, 'class': 'syn-pulse', stroke: 'url(#' + gid + ')' }, s);
    q.style.stroke = 'url(#' + gid + ')'; q.style.animationDelay = (-i * 1.3) + 's';
    var L = p.getTotalLength();
    [0.12, 0.3, 0.5, 0.7, 0.88].forEach(function (f, k) {
      var pt = p.getPointAtLength(L * f);
      el('circle', { cx: pt.x, cy: pt.y, r: k === 2 ? 5 : 3.5, 'class': 'syn-node' + (k === 2 ? ' big' : '') }, s);
      if (k % 2) { el('line', { x1: pt.x, y1: pt.y, x2: pt.x + 30, y2: pt.y + (k === 1 ? -24 : 24), 'class': 'syn-path' }, s); }
    });
  });

  // footer: faint static network
  var fn = document.querySelector('.footer-net');
  if (fn) {
    var s = el('svg', { viewBox: '0 0 1200 240', preserveAspectRatio: 'xMidYMid slice' }, fn), seed = 7;
    function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var pts = []; for (var i = 0; i < 36; i++) pts.push([r() * 1200, r() * 240]);
    pts.forEach(function (a, i) {
      pts.slice(i + 1).forEach(function (b) { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 150) el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'rgba(255,210,31,.13)' }, s); });
      el('circle', { cx: a[0], cy: a[1], r: 1.9, fill: ['#ff3b3b', '#ff8a1f', '#ffd21f', '#2bff88', '#22e4ff', '#2f8bff'][i % 6] }, s);
    });
  }

  // reveal on scroll
  var revealables = document.querySelectorAll('.sec-head, .about-text, .toolkit, .disc, .g-item, .timeline li, .contact-card, .artist-bio, .artist-player, .artist-video');
  if ('IntersectionObserver' in window && !reduce) {
    revealables.forEach(function (e) { e.classList.add('reveal'); });
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    revealables.forEach(function (e) { io.observe(e); });
  }

  // spine: active section
  var spineLinks = document.querySelectorAll('.spine a');
  if ('IntersectionObserver' in window) {
    var so = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) spineLinks.forEach(function (a) { a.classList.toggle('active', a.dataset.spine === e.target.id); }); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['hero', 'about', 'disciplines', 'artist', 'work', 'plugins', 'contact'].forEach(function (id) { var t = document.getElementById(id); if (t) so.observe(t); });
  }

  // top-nav: flash discipline cards when jumping to them
  document.querySelectorAll('.topnav a[data-region]').forEach(function (a) {
    a.addEventListener('click', function () {
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t && t.classList.contains('disc')) { t.classList.add('flash'); setTimeout(function () { t.classList.remove('flash'); }, 1800); }
    });
  });

  // lazy YouTube: thumbnail button -> privacy-enhanced (youtube-nocookie) iframe on click only
  document.querySelectorAll('.yt[data-yt]').forEach(function (box) {
    var btn = box.querySelector('.yt-play'); if (!btn) return;
    btn.addEventListener('click', function () {
      var id = box.dataset.yt; if (!/^[\w-]{11}$/.test(id)) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
      f.title = box.dataset.title || 'YouTube video';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('allowfullscreen', '');
      box.replaceChild(f, btn); box.classList.add('is-playing');
      f.focus();
    });
  });

  // in-page links inside the neuron preview (e.g. Sound -> #artist): close the cell, then travel
  var cellEl = document.getElementById('cell');
  if (cellEl) cellEl.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]'); if (!a) return;
    var id = a.getAttribute('href').slice(1), t = document.getElementById(id); if (!t) return;
    ev.preventDefault();
    if (window.BH_close) window.BH_close(false);
    if (window.BH_go) window.BH_go(id); else t.scrollIntoView();
  });

  // MOSH card: lightweight Gray–Scott reaction-diffusion illustration (README defaults: feed .0545, kill .062)
  (function () {
    var cv = document.getElementById('rd-canvas'); if (!cv || !cv.getContext) return;
    var W = 96, H = 54, ctx = cv.getContext('2d');
    cv.width = W; cv.height = H;
    var img = ctx.createImageData(W, H), N = W * H;
    var A = new Float32Array(N).fill(1), B = new Float32Array(N), A2 = new Float32Array(N), B2 = new Float32Array(N);
    var feed = 0.0545, kill = 0.062, s = 11;
    var RAMP = [[5, 6, 12], [90, 8, 14], [255, 45, 55], [255, 138, 31], [255, 210, 31], [255, 250, 225]];
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    function seed() { for (var k = 0; k < 14; k++) { var cx = 4 + Math.floor(rnd() * (W - 8)), cy = 3 + Math.floor(rnd() * (H - 6)); for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) B[(cy + y) * W + cx + x] = 1; } }
    seed();
    function step() {
      for (var y = 0; y < H; y++) {
        var ym = ((y - 1 + H) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
        for (var x = 0; x < W; x++) {
          var xm = (x - 1 + W) % W, xp = (x + 1) % W, i = y0 + x;
          var a = A[i], b = B[i];
          var la = -a + .2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + .05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
          var lb = -b + .2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + .05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
          var r = a * b * b;
          A2[i] = a + (la - r + feed * (1 - a));
          B2[i] = b + (.5 * lb + r - (kill + feed) * b);
        }
      }
      var t = A; A = A2; A2 = t; t = B; B = B2; B2 = t;
    }
    function draw(tm) {
      var d = img.data, shift = Math.floor(tm / 900) % 6; // subtle block offset for a mosh feel
      for (var y = 0; y < H; y++) {
        var off = ((y >> 3) % 3 === shift % 3) ? 2 : 0;
        for (var x = 0; x < W; x++) {
          var v = B[y * W + (x + off) % W], k = (y * W + x) * 4;
          var q = Math.min(1, v * 3.2);
          // heat ramp: ink -> deep red -> signal red -> orange -> yellow -> white-hot core (no purple)
          var P = RAMP, t = q * (P.length - 1), j = Math.min(P.length - 2, Math.floor(t)), f = t - j, c0 = P[j], c1 = P[j + 1];
          d[k] = c0[0] + (c1[0] - c0[0]) * f; d[k + 1] = c0[1] + (c1[1] - c0[1]) * f; d[k + 2] = c0[2] + (c1[2] - c0[2]) * f; d[k + 3] = 255;
          if (off && q < .25) { d[k + 2] = Math.min(255, d[k + 2] + 60); d[k + 1] = Math.min(255, d[k + 1] + 20); } // blue smear on displaced blocks
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    for (var w = 0; w < 1400; w++) step();
    draw(0);
    if (reduce) return;
    var running = false, raf = 0, frames = 0;
    function loop(tm) { for (var i = 0; i < 6; i++) step(); if (++frames % 900 === 0) seed(); draw(tm); if (running) raf = requestAnimationFrame(loop); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); } else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); } }); }).observe(cv);
    }
  })();
})();
