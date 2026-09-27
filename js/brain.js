/* Brainhertz: clear-brain neuron navigation */
(function () {
  'use strict';
  var svg = document.getElementById('brain');
  if (!svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // seeded RNG so the brain looks the same on every load
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rand = rng(4242);
  // region palette (no pink / magenta / purple / violet anywhere)
  var COLORS = { about: '#ffd21f', plugins: '#ff8a1f', live: '#ff3b3b', work: '#c4ff2e', visuals: '#22e4ff', sound: '#2f8bff', lab: '#2bff88', contact: '#eef4ff' };
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  window.BH_COLORS = COLORS;
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  // ---------- polygon of the brain (for sampling interior points) ----------
  function polygonOf(id, steps) {
    var src = document.getElementById(id);
    var tmp = el('path', { d: src.getAttribute('d'), opacity: 0 }, svg);
    var L = tmp.getTotalLength(), pts = [];
    for (var i = 0; i < steps; i++) { var p = tmp.getPointAtLength(L * i / steps); pts.push([p.x, p.y]); }
    svg.removeChild(tmp);
    return pts;
  }
  function inside(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  var cerebrum = polygonOf('shape-cerebrum', 220);
  var cerebellum = polygonOf('shape-cerebellum', 90);
  function inBrain(x, y, margin) {
    margin = margin || 0;
    var ok = function (px, py) { return inside(cerebrum, px, py) || inside(cerebellum, px, py); };
    return ok(x, y) && ok(x + margin, y) && ok(x - margin, y) && ok(x, y + margin) && ok(x, y - margin);
  }
  function samplePoint(margin) {
    for (var n = 0; n < 500; n++) { var x = 130 + rand() * 740, y = 80 + rand() * 480; if (inBrain(x, y, margin)) return [x, y]; }
    return [500, 300];
  }

  // ---------- gyri (cortex folds) ----------
  var gyri = document.getElementById('gyri');
  for (var g = 0; g < 90; g++) {
    var p = samplePoint(4), a = rand() * Math.PI * 2, d = 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    var steps = 4 + Math.floor(rand() * 5);
    for (var s = 0; s < steps; s++) {
      a += (rand() - .5) * 2.2;
      var len = 14 + rand() * 16;
      var cx = p[0] + Math.cos(a) * len * .6, cy = p[1] + Math.sin(a) * len * .6;
      a += (rand() - .5) * 1.4;
      p = [cx + Math.cos(a) * len * .6, cy + Math.sin(a) * len * .6];
      d += ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }
    el('path', { d: d }, gyri);
  }

  // tighter framing on small screens (labels are hidden there; the chain nav takes over)
  var mq = window.matchMedia('(max-width: 720px)');
  function frameBrain() { svg.setAttribute('viewBox', mq.matches ? '118 70 770 620' : '0 0 1000 720'); }
  frameBrain(); mq.addEventListener && mq.addEventListener('change', frameBrain);

  // ---------- region nodes ----------
  var nodes = {}, nodeEls = svg.querySelectorAll('.node');
  var glows = document.getElementById('region-glows');
  Array.prototype.forEach.call(nodeEls, function (n) {
    var x = +n.dataset.x, y = +n.dataset.y, r = n.dataset.region;
    n.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    var t = n.querySelector('.node-label');
    t.setAttribute('x', n.dataset.lx); t.setAttribute('y', n.dataset.ly);
    t.setAttribute('text-anchor', n.dataset.anchor);
    Array.prototype.forEach.call(t.querySelectorAll('tspan'), function (ts) { ts.setAttribute('x', n.dataset.lx); });
    var label = n.querySelector('.nl-main').textContent;
    n.setAttribute('aria-label', label + ': look inside');
    n.setAttribute('aria-haspopup', 'dialog'); n.setAttribute('aria-expanded', 'false'); n.setAttribute('aria-controls', 'cell');
    var col = COLORS[r] || '#1fb6ff', gid = 'g-region-' + r;
    var rg = el('radialGradient', { id: gid }, svg.querySelector('defs'));
    el('stop', { offset: 0, 'stop-color': col, 'stop-opacity': .6 }, rg);
    el('stop', { offset: .45, 'stop-color': col, 'stop-opacity': .2 }, rg);
    el('stop', { offset: 1, 'stop-color': col, 'stop-opacity': 0 }, rg);
    nodes[r] = { x: x, y: y, el: n, color: col, glow: el('circle', { cx: x, cy: y, r: 170, 'class': 'region-glow', fill: 'url(#' + gid + ')' }, glows), axons: [] };
  });

  // ---------- axons between regions ----------
  var links = [['about', 'work'], ['about', 'live'], ['about', 'sound'], ['work', 'live'], ['work', 'visuals'], ['work', 'sound'],
    ['work', 'lab'], ['live', 'visuals'], ['visuals', 'lab'], ['sound', 'lab'], ['lab', 'contact'], ['sound', 'contact'], ['work', 'contact'],
    ['plugins', 'about'], ['plugins', 'work'], ['plugins', 'live']];
  var axG = document.getElementById('axons'), axons = [];
  var FLOW = ['#ff3b3b', '#ff8a1f', '#ffd21f', '#c4ff2e', '#2bff88', '#22e4ff', '#2f8bff', '#22e4ff', '#2bff88', '#c4ff2e', '#ffd21f', '#ff8a1f', '#ff3b3b'];
  links.forEach(function (lk, i) {
    var A = nodes[lk[0]], B = nodes[lk[1]];
    var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    var off = (i % 2 ? 1 : -1) * L * (.12 + rand() * .1);
    var cx = mx - dy / L * off, cy = my + dx / L * off;
    // hard-stop gradient: each half carries its own region's colour (never blends through purple)
    var agid = 'g-axon-' + i, ag = el('linearGradient', { id: agid, gradientUnits: 'userSpaceOnUse', x1: A.x, y1: A.y, x2: B.x, y2: B.y }, svg.querySelector('defs'));
    el('stop', { offset: 0, 'stop-color': A.color }, ag); el('stop', { offset: .47, 'stop-color': A.color }, ag);
    el('stop', { offset: .53, 'stop-color': B.color }, ag); el('stop', { offset: 1, 'stop-color': B.color }, ag);
    // resting: a spectral gradient whose stops cycle slowly through red>orange>yellow>lime>green>cyan>blue and back,
    // each stop one step behind its neighbour, so the hue flows along the line (adjacent stops are always neighbouring hues)
    var fgid = 'g-flow-' + i, fg = el('linearGradient', { id: fgid, gradientUnits: 'userSpaceOnUse', x1: A.x, y1: A.y, x2: B.x, y2: B.y }, svg.querySelector('defs'));
    for (var st = 0; st < 5; st++) {
      var stop = el('stop', { offset: st / 4, 'stop-color': FLOW[0] }, fg);
      if (!reduce.matches) el('animate', { attributeName: 'stop-color', values: FLOW.join(';'), dur: '16s', begin: (-(i * 1.7 + st * 1.25)).toFixed(2) + 's', repeatCount: 'indefinite' }, stop);
      else stop.setAttribute('stop-color', FLOW[(i + st) % FLOW.length]);
    }
    var path = el('path', { d: 'M' + A.x + ' ' + A.y + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + B.x + ' ' + B.y, 'class': 'axon', stroke: 'url(#' + fgid + ')' }, axG);
    var ax = { a: lk[0], b: lk[1], el: path, len: path.getTotalLength(), flow: 'url(#' + fgid + ')', region: 'url(#' + agid + ')' };
    axons.push(ax); A.axons.push(ax); B.axons.push(ax);
  });

  // ---------- ambient neuron field ----------
  var cellsG = document.getElementById('ambient-cells'), edgesG = document.getElementById('ambient-edges');
  function nearest(x, y) { var best = null, bd = 1e9; for (var k in nodes) { var dd = Math.hypot(nodes[k].x - x, nodes[k].y - y); if (dd < bd) { bd = dd; best = nodes[k].color; } } return best || '#1fb6ff'; }
  var cells = [], ambient = [];
  for (var c = 0; c < 64; c++) { var q = samplePoint(10); cells.push(q); var ce = el('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: (1.2 + rand() * 1.8).toFixed(2) }, cellsG); ce.style.fill = rgba(nearest(q[0], q[1]), .7); }
  var seen = {};
  cells.forEach(function (p, i) {
    var near = cells.map(function (o, j) { return { j: j, d: Math.hypot(o[0] - p[0], o[1] - p[1]) }; })
      .filter(function (o) { return o.j !== i; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 2);
    near.forEach(function (o) {
      var key = Math.min(i, o.j) + '-' + Math.max(i, o.j); if (seen[key]) return; seen[key] = 1;
      var q = cells[o.j];
      var line = el('line', { x1: p[0].toFixed(1), y1: p[1].toFixed(1), x2: q[0].toFixed(1), y2: q[1].toFixed(1) }, edgesG);
      var nc = nearest((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      line.style.stroke = rgba(nc, .16);
      ambient.push({ el: line, len: o.d, color: nc });
    });
  });

  // ---------- pulses (glowing streaks travelling along a path) ----------
  var pulseG = document.getElementById('pulses'), live = [];
  function pulse(target, opts) {
    opts = opts || {};
    var len = target.len, seg = opts.seg || Math.min(34, len * .35);
    var tag = target.el.tagName.toLowerCase();
    var s = target.el.cloneNode(false);
    s.removeAttribute('class');
    s.setAttribute('fill', 'none');
    var pc = opts.color || '#eef4ff';
    s.setAttribute('stroke', pc);
    s.setAttribute('stroke-width', opts.width || 2.4);
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-dasharray', seg + ' ' + (len + seg * 2));
    if (opts.glow) s.setAttribute('class', 'p-region');
    s.style.filter = opts.glow ? 'drop-shadow(0 0 5px ' + pc + ') drop-shadow(0 0 12px ' + rgba(pc, .8) + ')' : 'drop-shadow(0 0 3px ' + rgba(pc, .9) + ')';
    pulseG.appendChild(s);
    live.push({ el: s, len: len, seg: seg, rev: !!opts.reverse, t0: performance.now() + (opts.delay || 0), dur: opts.dur || Math.max(420, len * 3.2), done: opts.done, tag: tag });
  }
  function stepPulses(now) {
    for (var i = live.length - 1; i >= 0; i--) {
      var P = live[i], u = (now - P.t0) / P.dur;
      if (u < 0) { P.el.style.opacity = 0; continue; }
      P.el.style.opacity = 1;
      if (u >= 1) { pulseG.removeChild(P.el); live.splice(i, 1); if (P.done) P.done(); continue; }
      var e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOut
      var off = P.rev ? (-P.len + (P.len + P.seg) * e) : (P.seg - (P.len + P.seg) * e);
      P.el.setAttribute('stroke-dashoffset', off.toFixed(1));
    }
  }

  // fire a signal outward from a region, with a second hop
  function fire(region, hops) {
    var N = nodes[region]; if (!N) return;
    N.el.classList.remove('fire'); void N.el.getBBox(); N.el.classList.add('fire');
    N.axons.forEach(function (ax) {
      var toward = ax.a === region ? ax.b : ax.a;
      pulse(ax, { reverse: ax.b === region, glow: true, color: N.color, width: 3.4, seg: 46, dur: 560, done: hops ? function () { fire(toward, hops - 1); } : function () {
        var t = nodes[toward].el; t.classList.remove('fire'); void t.getBBox(); t.classList.add('fire');
      } });
    });
  }

  // ---------- hover / focus lighting ----------
  var hotRegion = null;
  function setHot(region) {
    if (hotRegion === region) return;
    hotRegion = region;
    svg.classList.toggle('has-hot', !!region);
    Object.keys(nodes).forEach(function (k) {
      var on = k === region;
      nodes[k].el.classList.toggle('hot', on);
      nodes[k].glow.classList.toggle('on', on);
    });
    axons.forEach(function (ax) { var on = !!region && (ax.a === region || ax.b === region); ax.el.classList.toggle('lit', on); ax.el.setAttribute('stroke', on ? ax.region : ax.flow); });
    document.querySelectorAll('.topnav a[data-region]').forEach(function (a) { a.classList.toggle('is-hot', a.dataset.region === region); });
    if (region && !reduce.matches) {
      nodes[region].axons.forEach(function (ax) { pulse(ax, { reverse: ax.b === region, color: nodes[region].color, width: 2.4, dur: 700 }); });
    }
  }
  window.BH_setHot = setHot;
  // audio kicks (js/audio.js): a light signal out of one region (skipped off-screen / reduced motion)
  window.BH_fire = function (region) {
    if (reduce.matches || !heroVisible()) return;
    var ks = Object.keys(nodes); fire(region && nodes[region] ? region : ks[Math.floor(Math.random() * ks.length)], 0);
  };

  var hoverRegion = null, cellRegion = null;
  function refreshHot() { setHot(hoverRegion || cellRegion); }
  document.querySelectorAll('.topnav a[data-region], .chain a[data-region]').forEach(function (a) {
    a.addEventListener('pointerenter', function () { hoverRegion = a.dataset.region; refreshHot(); });
    a.addEventListener('pointerleave', function () { hoverRegion = null; refreshHot(); });
    a.addEventListener('focus', function () { hoverRegion = a.dataset.region; refreshHot(); });
    a.addEventListener('blur', function () { hoverRegion = null; refreshHot(); });
  });

  // ---------- click: fire, then travel ----------
  function go(id) {
    var t = document.getElementById(id); if (!t) return;
    if (window.BH_flare && nodes[id]) window.BH_flare(.9, nodes[id].color);
    t.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    if (history.pushState) history.pushState(null, '', '#' + id);
    t.focus({ preventScroll: true });
    if (t.classList.contains('disc')) { t.classList.add('flash'); setTimeout(function () { t.classList.remove('flash'); }, 1800); }
  }
  window.BH_go = go;
  function heroVisible() { var r = svg.getBoundingClientRect(); return r.bottom > 80 && r.top < window.innerHeight; }
  function fireAndGo(region) {
    if (reduce.matches || !heroVisible()) { go(region); return; }
    fire(region, 1);
    if (window.BH_flare) window.BH_flare(1, nodes[region] && nodes[region].color);
    setTimeout(function () { go(region); }, 520);
  }
  // mobile chain = direct navigation (fires a signal first)
  document.querySelectorAll('.chain a[data-region]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button > 0) return;
      ev.preventDefault(); fireAndGo(a.dataset.region);
    });
  });

  // ---------- the cell: look inside a neuron ----------
  var wrap = svg.parentNode, cell = document.getElementById('cell'), body = document.getElementById('cell-body');
  var scrim = document.getElementById('cell-scrim'), dendG = document.getElementById('dendrites');
  var mobile = window.matchMedia('(max-width: 720px)'), finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var state = { open: false, region: null, pinned: false }, openT = 0, closeT = 0, hideT = 0, suppressFocus = false;

  function labelOf(r) { return nodes[r].el.querySelector('.nl-main').textContent; }

  function growDendrites(r, angle) {
    dendG.innerHTML = '';
    var N = nodes[r], spread = [-0.95, -0.5, 0, 0.5, 0.95];
    spread.forEach(function (o, i) {
      var a = angle + o, L = 46 + (i % 2 ? 14 : 30);
      var x0 = N.x + Math.cos(a) * 17, y0 = N.y + Math.sin(a) * 17;
      var x1 = N.x + Math.cos(a) * L, y1 = N.y + Math.sin(a) * L;
      var cx = N.x + Math.cos(a + .25) * L * .55, cy = N.y + Math.sin(a + .25) * L * .55;
      var b = a + (i % 2 ? .6 : -.6), bx = x1 + Math.cos(b) * 18, by = y1 + Math.sin(b) * 18;
      var d = 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
        ' M' + ((x0 + x1) / 2 + (cx - (x0 + x1) / 2) * .5).toFixed(1) + ' ' + ((y0 + y1) / 2 + (cy - (y0 + y1) / 2) * .5).toFixed(1) + ' L' + bx.toFixed(1) + ' ' + by.toFixed(1);
      var path = el('path', { d: d, 'class': 'dendrite' }, dendG);
      var len = Math.ceil(path.getTotalLength());
      path.style.strokeDasharray = len; path.style.setProperty('--len', len); path.style.animationDelay = (i * 40) + 'ms';
      el('circle', { cx: x1.toFixed(1), cy: y1.toFixed(1), r: 2.6, 'class': 'dendrite-tip', style: 'animation-delay:' + (200 + i * 40) + 'ms' }, dendG);
    });
  }

  function place(r) {
    var N = nodes[r], m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = N.x; pt.y = N.y; var sp = pt.matrixTransform(m);
    if (mobile.matches) { cell.style.left = cell.style.top = ''; cell.style.setProperty('--ox', '50%'); cell.style.setProperty('--oy', '100%'); return Math.PI / 2; }
    var wr = wrap.getBoundingClientRect(), W = cell.offsetWidth, H = cell.offsetHeight, gap = 38, vw = document.documentElement.clientWidth;
    var right = N.x < 560;
    if (right && sp.x + gap + W > vw - 12) right = false;
    if (!right && sp.x - gap - W < 12) right = true;
    var left = right ? sp.x + gap : sp.x - gap - W;
    left = Math.max(12, Math.min(vw - 12 - W, left));
    var top = sp.y - H * .38;
    var minTop = Math.max(76, wr.top), maxTop = Math.min(window.innerHeight - 12, wr.bottom + 40) - H;
    top = Math.max(minTop, Math.min(maxTop, top));
    top = Math.max(76 > window.innerHeight - H ? 8 : 76, top);
    cell.style.left = (left - wr.left) + 'px'; cell.style.top = (top - wr.top) + 'px';
    cell.style.setProperty('--ox', (sp.x - left).toFixed(0) + 'px'); cell.style.setProperty('--oy', (sp.y - top).toFixed(0) + 'px');
    return right ? 0 : Math.PI;
  }

  function openCell(r, opts) {
    opts = opts || {};
    clearTimeout(closeT); clearTimeout(hideT);
    var same = state.open && state.region === r;
    if (!same) {
      var tpl = document.getElementById('tpl-' + r); if (!tpl) return;
      body.innerHTML = ''; body.appendChild(tpl.content.cloneNode(true));
      var act = document.createElement('div'); act.className = 'cell-actions';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cell-go';
      btn.innerHTML = 'Go to ' + labelOf(r).replace(/&/g, '&amp;') + ' <span aria-hidden="true">&rarr;</span>';
      btn.addEventListener('click', function () { closeCell(false); fireAndGo(r); });
      act.appendChild(btn); body.appendChild(act);
      Array.prototype.forEach.call(body.children, function (c, i) { c.style.setProperty('--i', i); });
      Object.keys(nodes).forEach(function (k) { nodes[k].el.setAttribute('aria-expanded', k === r ? 'true' : 'false'); nodes[k].el.classList.toggle('open', k === r); });
      cell.hidden = false; cell.classList.remove('open'); cell.dataset.region = r;
      var ang = place(r);
      dendG.style.setProperty('--rc-rgb', rgba(nodes[r].color, 1).replace(/rgba\((\d+),(\d+),(\d+),1\)/, '$1 $2 $3'));
      growDendrites(r, ang);
      void cell.offsetWidth; cell.classList.add('open');
      if (mobile.matches) { scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add('on'); }); }
    }
    state.open = true; state.region = r; state.pinned = state.pinned && same ? true : !!opts.pinned;
    cellRegion = r; refreshHot();
    if (opts.focus) { var f = body.querySelector('.cell-go'); if (f) f.focus({ preventScroll: true }); }
  }

  function closeCell(returnFocus) {
    if (!state.open) return;
    var r = state.region;
    state.open = false; state.pinned = false; state.region = null; cellRegion = null;
    cell.classList.remove('open'); scrim.classList.remove('on');
    Object.keys(nodes).forEach(function (k) { nodes[k].el.setAttribute('aria-expanded', 'false'); nodes[k].el.classList.remove('open'); });
    dendG.innerHTML = '';
    hideT = setTimeout(function () { if (!state.open) { cell.hidden = true; scrim.hidden = true; } }, reduce.matches ? 0 : 320);
    refreshHot();
    if (returnFocus && nodes[r]) { suppressFocus = true; nodes[r].el.focus({ preventScroll: true }); suppressFocus = false; }
  }
  window.BH_open = openCell; window.BH_close = closeCell;

  Array.prototype.forEach.call(nodeEls, function (n) {
    var r = n.dataset.region;
    n.addEventListener('pointerenter', function (e) {
      hoverRegion = r; refreshHot();
      if (e.pointerType === 'mouse' && finePointer.matches && !(state.pinned && state.region !== r)) {
        clearTimeout(openT); clearTimeout(closeT); openT = setTimeout(function () { openCell(r, { pinned: false }); }, 90);
      }
    });
    n.addEventListener('pointerleave', function () {
      hoverRegion = null; refreshHot(); clearTimeout(openT);
      if (state.open && !state.pinned) closeT = setTimeout(function () { closeCell(false); }, 260);
    });
    n.addEventListener('focus', function () {
      hoverRegion = r; refreshHot();
      if (!suppressFocus && n.matches(':focus-visible') && !(state.pinned && state.region !== r)) openCell(r, { pinned: false });
    });
    n.addEventListener('blur', function () {
      hoverRegion = null; refreshHot();
      setTimeout(function () {
        var a = document.activeElement;
        if (state.open && !state.pinned && !cell.contains(a) && !(a && a.classList && a.classList.contains('node'))) closeCell(false);
      }, 0);
    });
    n.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button > 0) return;
      ev.preventDefault();
      clearTimeout(openT);
      if (state.open && state.pinned && state.region === r) { closeCell(false); fireAndGo(r); return; }
      if (!reduce.matches) fire(r, 0);
      var keyboard = ev.detail === 0;
      openCell(r, { pinned: true, focus: keyboard || mobile.matches });
    });
  });

  cell.addEventListener('pointerenter', function () { clearTimeout(closeT); });
  cell.addEventListener('pointerleave', function () { if (state.open && !state.pinned) closeT = setTimeout(function () { closeCell(false); }, 260); });
  cell.addEventListener('focusin', function () { if (state.open) state.pinned = true; });
  cell.addEventListener('focusout', function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (state.open && !cell.contains(a) && !(a && a.classList && a.classList.contains('node'))) closeCell(false);
    }, 0);
  });
  cell.querySelector('.cell-close').addEventListener('click', function () { closeCell(true); });
  scrim.addEventListener('click', function () { closeCell(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) { e.preventDefault(); closeCell(true); } });
  document.addEventListener('pointerdown', function (e) {
    if (!state.open) return;
    if (cell.contains(e.target) || (e.target.closest && e.target.closest('.node'))) return;
    closeCell(false);
  });
  window.addEventListener('resize', function () { if (state.open) { growDendrites(state.region, place(state.region)); } });
  window.addEventListener('scroll', function () { if (state.open && !mobile.matches) { var r = svg.getBoundingClientRect(); if (r.bottom < 60) closeCell(false); } }, { passive: true });

  // ---------- hertz: ambient firing cadence cycles through brainwave bands ----------
  var bands = [{ n: 'α alpha', hz: 10 }, { n: 'θ theta', hz: 6 }, { n: 'β beta', hz: 16 }, { n: 'δ delta', hz: 2 }];
  var bandI = 0, hz = bands[0].hz, lastSpawn = 0, bandStart = performance.now();
  var hudBand = document.getElementById('hud-band'), hudHz = document.getElementById('hud-hz'), hudWave = document.getElementById('hud-wave');
  function setBand(i) {
    bandI = i; hz = bands[i].hz;
    if (hudBand) hudBand.textContent = bands[i].n;
    if (hudHz) hudHz.textContent = hz;
    svg.style.setProperty('--hz', Math.max(.8, 12 / hz).toFixed(2) + 's');
  }
  function drawWave(phase) {
    if (!hudWave) return;
    var d = 'M0 12', k = hz / 4;
    for (var x = 2; x <= 120; x += 2) d += ' L' + x + ' ' + (12 + Math.sin(x / 120 * Math.PI * 2 * k + phase) * 8).toFixed(1);
    hudWave.setAttribute('d', d);
  }
  setBand(0); drawWave(0);

  var running = true, raf = 0;
  function frame(now) {
    raf = 0;
    if (now - bandStart > 6500) { bandStart = now; setBand((bandI + 1) % bands.length); }
    if (now - lastSpawn > 1000 / hz) {
      lastSpawn = now;
      if (rand() < .72 && ambient.length) { var e = ambient[Math.floor(rand() * ambient.length)]; pulse(e, { reverse: rand() < .5, color: e.color, seg: 14, width: 1.6, dur: 380 + e.len * 6 }); }
      else { var ax = axons[Math.floor(rand() * axons.length)], rv = rand() < .5; pulse(ax, { reverse: rv, color: nodes[rv ? ax.b : ax.a].color, seg: 26, width: 2, dur: 900 }); }
    }
    stepPulses(now);
    drawWave(now / 1000 * 4);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() { if (reduce.matches || raf) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (e) { e.isIntersecting && !document.hidden ? start() : stop(); }); }).observe(svg);
  } else start();
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (heroVisible() && start()); });
  reduce.addEventListener && reduce.addEventListener('change', function () { reduce.matches ? stop() : start(); });
})();
