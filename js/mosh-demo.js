/* Brainhertz: MOSH live preview (Plugins view).
   A small in-browser Gray–Scott reaction-diffusion + datamosh sketch with a Resolume-style parameter panel, so visitors
   can get a feel for the effect. It uses the parameter names from the MOSH README; the mapping is an approximation in
   canvas2D at 192x108, not the plugin itself. Kyle's MOSH output frame is used as the "clip" (dry signal).
   Pauses when off-screen, when the Plugins view is hidden, or when the tab is hidden. Starts paused under
   prefers-reduced-motion. Colours: a spectral ramp (red > orange > yellow > lime > green > cyan > blue) that never
   wraps blue back to red, plus a final guard that neutralises any purple mix, so nothing pink/magenta/purple appears. */
(function () {
  'use strict';
  var root = document.getElementById('mosh-demo'); if (!root) return;
  var cv = root.querySelector('.md-canvas'), ctx = cv && cv.getContext && cv.getContext('2d'); if (!ctx) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var W = 192, H = 108, N = W * H;
  cv.width = W; cv.height = H;
  var img = ctx.createImageData(W, H), out = img.data;
  var cur = new Float32Array(N * 3), prev = new Float32Array(N * 3), fx = new Float32Array(N * 3);
  var A = new Float32Array(N).fill(1), B = new Float32Array(N), A2 = new Float32Array(N), B2 = new Float32Array(N);
  var clip = new Float32Array(N * 3), clipLum = new Float32Array(N), hasClip = false;

  // ---------- parameters (names, ranges and defaults from the MOSH README) ----------
  var DEFS = [
    { k: 'feed', label: 'Feed', min: 0.010, max: 0.090, step: 0.0005, def: 0.0545, dec: 4, rnd: [0.02, 0.08] },
    { k: 'kill', label: 'Kill', min: 0.040, max: 0.075, step: 0.0005, def: 0.062, dec: 4, rnd: [0.05, 0.068] },
    { k: 'rate', label: 'Rate', min: 1, max: 16, step: 1, def: 8, dec: 0 },
    { k: 'size', label: 'Size', min: 0.70, max: 1.80, step: 0.01, def: 1.00, dec: 2 },
    { k: 'vectors', label: 'Vectors', min: 0, max: 4, step: 0.01, def: 1.40, dec: 2 },
    { k: 'blocks', label: 'Blocks', min: 4, max: 64, step: 1, def: 12, dec: 0 },
    { k: 'hold', label: 'Hold', min: 1, max: 90, step: 1, def: 16, dec: 0 },
    { k: 'split', label: 'Split', min: 0, max: 16, step: 1, def: 1, dec: 0 },
    { k: 'crush', label: 'Crush', min: 0, max: 16, step: 1, def: 0, dec: 0 },
    { k: 'stain', label: 'Stain', min: 0, max: 100, step: 1, def: 35, dec: 0, unit: '%' },
    { k: 'mix', label: 'Mix', min: 0, max: 100, step: 1, def: 100, dec: 0, unit: '%' }
  ];
  var HELP = {
    feed: 'Gray–Scott feed rate', kill: 'Gray–Scott kill rate', rate: 'simulation steps per frame', size: 'pattern scale',
    vectors: 'strength of the moshed block drift', blocks: 'macroblock size', hold: 'frames a moshed block holds',
    split: 'red / cyan channel split', crush: 'colour crush', stain: 'how much of the clip stains the reaction', mix: 'dry / wet'
  };
  // known-good Gray–Scott regimes for the dice (so a random roll keeps a living pattern)
  var REGIMES = [[0.0545, 0.062], [0.037, 0.06], [0.03, 0.062], [0.025, 0.06], [0.078, 0.061], [0.039, 0.058], [0.029, 0.057], [0.022, 0.051], [0.046, 0.0594], [0.062, 0.0609]];
  var P = {}; DEFS.forEach(function (d) { P[d.k] = d.def; });
  var bypass = false;

  // ---------- simulation ----------
  var s = 11;
  function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
  function stamp(cx, cy, r) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + 1) continue;
      var i = ((cy + y + H) % H) * W + (cx + x + W) % W; B[i] = 1; A[i] = 0.5;
    }
  }
  function seed(n) { for (var k = 0; k < (n || 14); k++) stamp(4 + Math.floor(rnd() * (W - 8)), 3 + Math.floor(rnd() * (H - 6)), 2); }
  function clear() { A.fill(1); B.fill(0); }
  function step() {
    var feed = P.feed, kill = P.kill, sz = P.size, dt = Math.min(1, 1.15 / sz), da = sz * dt, db = 0.5 * sz * dt;
    for (var y = 0; y < H; y++) {
      var ym = ((y - 1 + H) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
      for (var x = 0; x < W; x++) {
        var xm = (x - 1 + W) % W, xp = (x + 1) % W, i = y0 + x, a = A[i], b = B[i];
        var la = -a + .2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + .05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
        var lb = -b + .2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + .05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
        var r = a * b * b;
        A2[i] = a + da * la + dt * (-r + feed * (1 - a));
        B2[i] = b + db * lb + dt * (r - (kill + feed) * b);
      }
    }
    var t = A; A = A2; A2 = t; t = B; B = B2; B2 = t;
  }
  function stainInject() { // the clip stains the reaction: bright parts of the clip feed a little V into the field
    var st = P.stain / 100; if (!hasClip || st <= 0) return;
    var k = 0.012 * st;
    for (var i = 0; i < N; i += 1) { var l = clipLum[i]; if (l > 0.55) { B[i] += k * (l - 0.55) * A[i]; if (B[i] > 1) B[i] = 1; } }
  }
  function alive() { var m = 0; for (var i = 0; i < N; i += 7) if (B[i] > m) m = B[i]; return m > 0.08; }

  // ---------- colour ----------
  var RAMP = [[255, 59, 59], [255, 138, 31], [255, 210, 31], [196, 255, 46], [43, 255, 136], [34, 228, 255], [47, 139, 255]];
  function ramp(t, o) { // t in 0..1; never interpolates blue back to red
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var f = t * (RAMP.length - 1), j = Math.min(RAMP.length - 2, Math.floor(f)), u = f - j, c0 = RAMP[j], c1 = RAMP[j + 1];
    o[0] = c0[0] + (c1[0] - c0[0]) * u; o[1] = c0[1] + (c1[1] - c0[1]) * u; o[2] = c0[2] + (c1[2] - c0[2]) * u;
  }

  // ---------- blocks (datamosh): displaced macroblocks re-use the previous frame and smear while held ----------
  var bw = 4, cols = 0, rows = 0, bdx = new Int16Array(0), bdy = new Int16Array(0), frame = 0, lastBlocks = -1;
  function layoutBlocks() {
    bw = Math.max(2, Math.round(P.blocks * 0.3)); cols = Math.ceil(W / bw); rows = Math.ceil(H / bw);
    bdx = new Int16Array(cols * rows); bdy = new Int16Array(cols * rows); lastBlocks = P.blocks; rollBlocks();
  }
  function rollBlocks() {
    var v = P.vectors, p = v > 0 ? Math.min(0.55, 0.06 + v * 0.1) : 0;
    for (var k = 0; k < bdx.length; k++) {
      if (Math.random() < p) { bdx[k] = Math.round((Math.random() - 0.5) * 2 * v * bw * 0.7); bdy[k] = Math.round((Math.random() - 0.5) * v * bw * 0.45); }
      else { bdx[k] = 0; bdy[k] = 0; }
    }
  }

  var col = [0, 0, 0], t0 = performance.now();
  function render(now, advance) {
    if (P.blocks !== lastBlocks) layoutBlocks();
    if (advance) { frame++; if (frame % Math.max(1, Math.round(P.hold)) === 0) rollBlocks(); }
    var st = P.stain / 100, mix = bypass ? 0 : P.mix / 100;
    var tm = (now - t0) / 1000, cyc = 0.18 * (0.5 - 0.5 * Math.cos(tm * 0.35)); // slow ping-pong colour drift along the ramp
    var drift = Math.round(Math.sin(tm * 0.25) * 5); // the "footage" drifts slowly, like a moving clip
    // 1) fresh composite: dry clip vs wet datamosh
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x, c3 = i * 3, ci = (y * W + (x + drift + W) % W) * 3;
        var cr = clip[ci], cg = clip[ci + 1], cb = clip[ci + 2];
        var q = B[i] * 3.2; if (q > 1) q = 1;
        var qb = B[i] * 2; if (qb > 1) qb = 1;
        var u = qb * 1.9 + clipLum[(y * W + (x + drift + W) % W)] * 0.7 + cyc * 3 + x / W * 0.25;
        u = u % 2; if (u > 1) u = 2 - u; // triangle fold: bounces red..blue..red along the ramp, never jumps blue straight to red
        ramp(u, col); // multicolour datamosh bands
        var br = q * 1.5; if (br > 1) br = 1;
        var wk = 1 - 0.55 * st, ck = st * (0.22 + 0.5 * q);
        var wr = col[0] * br * wk + cr * ck, wg = col[1] * br * wk + cg * ck, wb = col[2] * br * wk + cb * ck;
        cur[c3] = cr + (wr - cr) * mix; cur[c3 + 1] = cg + (wg - cg) * mix; cur[c3 + 2] = cb + (wb - cb) * mix;
      }
    }
    // 2) moshed blocks pull from the previous frame (so they smear while the block is held)
    if (!bypass && mix > 0 && P.vectors > 0) {
      for (var by = 0; by < rows; by++) for (var bx = 0; bx < cols; bx++) {
        var k = by * cols + bx, dx = bdx[k], dy = bdy[k]; if (!dx && !dy) continue;
        for (var yy = by * bw; yy < Math.min(H, (by + 1) * bw); yy++) for (var xx = bx * bw; xx < Math.min(W, (bx + 1) * bw); xx++) {
          var d = (yy * W + xx) * 3, sx = (xx - dx + W) % W, sy = (yy - dy + H) % H, sp = (sy * W + sx) * 3;
          cur[d] = cur[d] + (prev[sp] - cur[d]) * mix; cur[d + 1] = cur[d + 1] + (prev[sp + 1] - cur[d + 1]) * mix; cur[d + 2] = cur[d + 2] + (prev[sp + 2] - cur[d + 2]) * mix;
        }
      }
    }
    prev.set(cur);
    // 3) red / cyan split, colour crush, purple guard -> pixels
    var sp2 = bypass ? 0 : Math.round(P.split * 0.6), L = (!bypass && P.crush > 0) ? Math.max(2, 34 - 2 * P.crush) : 0, qs = L ? 255 / (L - 1) : 0;
    for (var y2 = 0; y2 < H; y2++) {
      for (var x2 = 0; x2 < W; x2++) {
        var p = (y2 * W + x2), o = p * 4, r, g, b;
        if (sp2) {
          var ir = (y2 * W + Math.min(W - 1, x2 + sp2)) * 3, ic = (y2 * W + Math.max(0, x2 - sp2)) * 3;
          r = cur[ir]; g = cur[ic + 1]; b = cur[ic + 2];
        } else { r = cur[p * 3]; g = cur[p * 3 + 1]; b = cur[p * 3 + 2]; }
        if (L) { r = Math.round(r / qs) * qs; g = Math.round(g / qs) * qs; b = Math.round(b / qs) * qs; }
        if (r > g && b > g) g = r < b ? r : b; // never let red + blue meet without green (no pink / magenta / purple)
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- the clip: Kyle's MOSH output frame ----------
  (function () {
    for (var i = 0; i < N; i++) { var y = Math.floor(i / W); clip[i * 3] = 18; clip[i * 3 + 1] = 22 + y * 0.2; clip[i * 3 + 2] = 16; }
    var im = new Image(); im.decoding = 'async';
    im.onload = function () {
      var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
      var ox = oc.getContext('2d'); ox.drawImage(im, 0, 0, W, H);
      var d; try { d = ox.getImageData(0, 0, W, H).data; } catch (e) { return; } // file:// pages can't read image pixels: keep the fallback clip
      for (var i = 0; i < N; i++) { clip[i * 3] = d[i * 4]; clip[i * 3 + 1] = d[i * 4 + 1]; clip[i * 3 + 2] = d[i * 4 + 2]; clipLum[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255; }
      hasClip = true; if (!running) render(performance.now(), false);
    };
    im.src = root.getAttribute('data-clip') || 'assets/plugins/mosh-preview.webp';
  })();

  // ---------- panel ----------
  var panel = root.querySelector('.md-panel');
  var DICE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>';
  function fmt(d, v) { return (+v).toFixed(d.dec) + (d.unit || ''); }
  var head = document.createElement('div'); head.className = 'md-head';
  head.innerHTML = '<span class="md-title" id="md-title">MOSH</span>' +
    '<button type="button" class="md-btn md-bypass" aria-pressed="false" title="Bypass the effect (dry clip only)">Bypass</button>' +
    '<button type="button" class="md-btn md-icon md-dice-all" aria-label="Randomize all parameters" title="Randomize all">' + DICE + '</button>' +
    '<button type="button" class="md-btn md-reset" title="Reset every parameter to its default">Reset</button>';
  panel.appendChild(head);
  var rowsEl = document.createElement('div'); rowsEl.className = 'md-rows'; panel.appendChild(rowsEl);
  var inputs = {};
  DEFS.forEach(function (d) {
    var row = document.createElement('div'); row.className = 'md-row'; row.dataset.k = d.k;
    var id = 'md-' + d.k;
    row.innerHTML = '<label for="' + id + '">' + d.label + '</label>' +
      '<input type="range" id="' + id + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + d.def + '" aria-describedby="' + id + '-h">' +
      '<output for="' + id + '" id="' + id + '-o">' + fmt(d, d.def) + '</output>' +
      '<button type="button" class="md-btn md-icon md-dice" aria-label="Randomize ' + d.label + '" title="Randomize ' + d.label + '">' + DICE + '</button>' +
      '<span class="sr" id="' + id + '-h">' + HELP[d.k] + '</span>';
    rowsEl.appendChild(row);
    var inp = row.querySelector('input'), o = row.querySelector('output');
    inputs[d.k] = { d: d, inp: inp, o: o };
    function set(v) { P[d.k] = +v; o.textContent = fmt(d, v); inp.setAttribute('aria-valuetext', fmt(d, v)); inp.style.setProperty('--p', ((v - d.min) / (d.max - d.min) * 100).toFixed(1) + '%'); }
    inputs[d.k].set = function (v) { inp.value = v; set(inp.value); };
    set(d.def);
    inp.addEventListener('input', function () { set(inp.value); touched(); });
    row.querySelector('.md-dice').addEventListener('click', function () { randomize(d.k); touched(); });
  });
  var rs = document.createElement('div'); rs.className = 'md-row md-row-btn';
  rs.innerHTML = '<span class="md-lbl">Reseed</span><button type="button" class="md-btn md-reseed">Reseed</button><span class="md-hint">or drag on the preview</span>';
  rowsEl.appendChild(rs);

  function randomize(k) {
    var it = inputs[k], d = it.d;
    if (k === 'feed' || k === 'kill') { var g = REGIMES[Math.floor(Math.random() * REGIMES.length)]; inputs.feed.set(g[0]); inputs.kill.set(g[1]); return; }
    if (k === 'mix') { it.set(Math.round(60 + Math.random() * 40)); return; }
    var lo = d.rnd ? d.rnd[0] : d.min, hi = d.rnd ? d.rnd[1] : d.max, v = lo + Math.random() * (hi - lo);
    if (k === 'crush') v = Math.random() < 0.5 ? 0 : v; // keep crush off half the time
    it.set(Math.round(v / d.step) * d.step);
  }
  var bypassBtn = head.querySelector('.md-bypass');
  bypassBtn.addEventListener('click', function () { bypass = !bypass; bypassBtn.setAttribute('aria-pressed', bypass ? 'true' : 'false'); root.classList.toggle('is-bypass', bypass); touched(); });
  head.querySelector('.md-reset').addEventListener('click', function () { DEFS.forEach(function (d) { inputs[d.k].set(d.def); }); if (bypass) bypassBtn.click(); clear(); seed(); warm(300); touched(); });
  head.querySelector('.md-dice-all').addEventListener('click', function () { DEFS.forEach(function (d) { if (d.k !== 'kill') randomize(d.k); }); touched(); });
  rs.querySelector('.md-reseed').addEventListener('click', function () { clear(); seed(18); warm(40); touched(); });

  // ---------- pointer: click / drag to seed ----------
  var drawing = false;
  function seedAt(ev) {
    var r = cv.getBoundingClientRect(); if (!r.width) return;
    var x = Math.floor((ev.clientX - r.left) / r.width * W), y = Math.floor((ev.clientY - r.top) / r.height * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    stamp(x, y, 3); touched();
  }
  cv.addEventListener('pointerdown', function (ev) { drawing = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } seedAt(ev); ev.preventDefault(); });
  cv.addEventListener('pointermove', function (ev) { if (drawing) seedAt(ev); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { cv.addEventListener(t, function () { drawing = false; }); });
  // keyboard: Enter/Space on the canvas plants a seed in the middle area
  cv.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); stamp(Math.floor(W * (0.2 + Math.random() * 0.6)), Math.floor(H * (0.2 + Math.random() * 0.6)), 3); touched(); } });

  // ---------- run / pause ----------
  var playBtn = root.querySelector('.md-play');
  var paused = reduce.matches, visible = false, running = false, raf = 0, warmed = false;
  function warm(n) { for (var i = 0; i < n; i++) step(); }
  function ensureWarm() { if (warmed) return; warmed = true; seed(); warm(1400); }
  function viewOn() { return !document.hidden && visible && root.offsetParent !== null; }
  function setPlayUI() { if (!playBtn) return; playBtn.setAttribute('aria-pressed', paused ? 'false' : 'true'); playBtn.setAttribute('aria-label', paused ? 'Play the live preview' : 'Pause the live preview'); root.classList.toggle('is-paused', paused); }
  function loop(now) {
    raf = 0; if (!running) return;
    for (var i = 0; i < P.rate; i++) step();
    stainInject();
    if (frame % 240 === 0 && !alive()) seed(10);
    else if (frame % 900 === 450) seed(3);
    render(now, true);
    raf = requestAnimationFrame(loop);
  }
  function update() {
    var should = !paused && viewOn();
    if (should && !running) { ensureWarm(); running = true; raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    if (!running && visible) { ensureWarm(); render(performance.now(), false); }
  }
  function touched() { if (!running) { ensureWarm(); render(performance.now(), false); } } // paused: still show the effect of a change
  if (playBtn) playBtn.addEventListener('click', function () { paused = !paused; setPlayUI(); update(); });
  setPlayUI();
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; update(); }).observe(cv);
  else { visible = true; }
  document.addEventListener('visibilitychange', update);
  document.addEventListener('bh:view', function () { setTimeout(update, 0); });
  reduce.addEventListener && reduce.addEventListener('change', function () { if (reduce.matches && !paused) { paused = true; setPlayUI(); update(); } });
  update();
  // test hook
  var snap = null;
  window.BH_moshDemo = { params: P, set: function (k, v) { if (inputs[k]) inputs[k].set(v); touched(); }, running: function () { return running; },
    render: function () { render(performance.now(), false); }, step: function (n) { ensureWarm(); warm(n || 1); },
    snapshot: function () { ensureWarm(); snap = [A.slice(), B.slice(), prev.slice()]; }, restore: function () { if (snap) { A.set(snap[0]); B.set(snap[1]); prev.set(snap[2]); } } };
})();
