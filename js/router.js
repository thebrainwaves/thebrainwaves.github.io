/* Brainhertz: views.
   The brain on the home view is the site map; every section is its own view, shown one at a time.
   Hash routing in this single page (#about, #visuals, #sound, #artist, #live, #lab, #work, #plugins, #contact)
   so the Ghosts N Goblins player (js/audio.js) never reloads or stops. Deep links work on load, back/forward
   work, unknown hashes fall back to the map. Old in-page anchors (#lighting, #direction, #mosh, #track,
   #music-video, #disciplines, #top, #hero) resolve to the view that holds them. */
(function () {
  'use strict';
  var ORDER = ['about', 'visuals', 'sound', 'artist', 'live', 'lab', 'work', 'plugins', 'contact'];
  var LABEL = { home: 'Map', about: 'About', visuals: 'Visuals', sound: 'Music & Sound', artist: 'Artist: Tellavi5ion', live: 'Live, Projection & Lighting', lab: 'Real-time Lab', work: 'Work', plugins: 'Plugins', contact: 'Contact' };
  // brain region each view belongs to (Artist lives in the Music & Sound region)
  var REGION = { about: 'about', visuals: 'visuals', sound: 'sound', artist: 'sound', live: 'live', lab: 'lab', work: 'work', plugins: 'plugins', contact: 'contact' };
  var ALIAS = { '': 'home', map: 'home', home: 'home', top: 'home', hero: 'home', disciplines: 'home', main: 'home' };
  var SITE = 'Brainhertz Productions';

  var root = document.documentElement, hero = document.getElementById('hero');
  var views = {}; ORDER.forEach(function (id) { var v = document.getElementById(id); if (v) views[id] = v; });
  if (!hero || !views.about) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var homeTitle = document.title;
  var current = null, currentKey = null;

  function resolve(hash) {
    var h = (hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
    if (Object.prototype.hasOwnProperty.call(ALIAS, h)) return { view: ALIAS[h], target: null, known: true };
    if (views[h]) return { view: h, target: null, known: true };
    var el = h && document.getElementById(h);
    if (el) {
      var v = el.closest && el.closest('.view');
      if (v && views[v.id]) return { view: v.id, target: el, known: true };
      if (hero.contains(el)) return { view: 'home', target: null, known: true };
    }
    return { view: 'home', target: null, known: false };
  }
  function urlFor(r) { return r.view === 'home' ? location.pathname + location.search : '#' + (r.target ? r.target.id : r.view); }

  // ---------- chrome injected into each view: back to the map (top) + previous / next (bottom) ----------
  var ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var BRAIN = '<svg viewBox="0 0 32 32" aria-hidden="true"><use href="#glyph-brain"/></svg>';
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  ORDER.forEach(function (id, i) {
    var v = views[id]; if (!v) return;
    var bar = document.createElement('div');
    bar.className = 'view-bar';
    bar.innerHTML = '<a class="back-map" href="#map">' + ARROW_L + BRAIN + '<span>Back to the map</span></a>' +
      '<span class="vb-crumb" aria-hidden="true"><span class="vb-dot"></span>' + esc(LABEL[id]) + '<span class="vb-pos">' + (i + 1) + ' / ' + ORDER.length + '</span></span>';
    v.insertBefore(bar, v.firstChild);
    var prev = ORDER[i - 1] || 'home', next = ORDER[i + 1] || 'home';
    var pg = document.createElement('nav');
    pg.className = 'pager'; pg.setAttribute('aria-label', 'Previous and next section');
    pg.innerHTML =
      '<a class="pg-prev" href="' + (prev === 'home' ? '#map' : '#' + prev) + '" data-to="' + prev + '">' + ARROW_L + '<span><small>' + (prev === 'home' ? 'Back to' : 'Previous') + '</small><b>' + esc(prev === 'home' ? 'The map' : LABEL[prev]) + '</b></span></a>' +
      '<a class="pg-map" href="#map" aria-label="Back to the map">' + BRAIN + '<span>Map</span></a>' +
      '<a class="pg-next" href="' + (next === 'home' ? '#map' : '#' + next) + '" data-to="' + next + '"><span><small>' + (next === 'home' ? 'Back to' : 'Next') + '</small><b>' + esc(next === 'home' ? 'The map' : LABEL[next]) + '</b></span>' + ARROW_R + '</a>';
    v.appendChild(pg);
    var h = v.querySelector('h2'); if (h && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  });
  var h1 = document.getElementById('hero-title'); if (h1 && !h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');

  // ---------- menu (small screens): the site map as a list ----------
  var menuBtn = document.querySelector('.menu-btn'), menu = document.getElementById('sitemap-menu');
  function setMenu(open) {
    if (!menuBtn || !menu) return;
    menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('menu-open', open);
    if (open) { var a = menu.querySelector('a[aria-current]') || menu.querySelector('a'); if (a) a.focus({ preventScroll: true }); }
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
    document.addEventListener('click', function (ev) {
      if (menu.hidden) return;
      if (menu.contains(ev.target) || menuBtn.contains(ev.target)) return;
      setMenu(false);
    });
    window.matchMedia('(min-width: 1101px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  // ---------- show a view ----------
  var navLinks = document.querySelectorAll('.topnav a[href^="#"], .sitemap-menu a[href^="#"], .spine a[href^="#"]');
  function markNav(view) {
    Array.prototype.forEach.call(navLinks, function (a) {
      var r = resolve(a.getAttribute('href')), on = r.view === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function show(r, opts) {
    opts = opts || {};
    var view = r.view, prev = current, key = view + '|' + (r.target ? r.target.id : '');
    if (key === currentKey && !opts.force) return;
    current = view; currentKey = key;
    root.classList.add('js-views');
    root.dataset.view = view;
    if (view !== 'home' && window.BH_close) window.BH_close(false); // close any open neuron preview
    setMenu(false);
    hero.hidden = view !== 'home';
    ORDER.forEach(function (id) { if (views[id]) views[id].hidden = id !== view; });
    document.title = view === 'home' ? homeTitle : (views[view].dataset.title || LABEL[view]) + ' | ' + SITE;
    markNav(view);
    var el = view === 'home' ? hero : views[view];
    // restart the enter animation
    el.classList.remove('view-in'); void el.offsetWidth; if (!reduce.matches && !opts.initial) el.classList.add('view-in');
    if (r.target && r.target !== el) {
      var tgt = r.target; tgt.scrollIntoView({ block: 'start', behavior: 'auto' });
      // late layout (lazy embeds, fonts) can push the target down: re-align a few times unless the visitor has scrolled
      var setY = window.scrollY;
      [150, 500, 1200, 2500].forEach(function (ms) {
        setTimeout(function () {
          if (current !== view || Math.abs(window.scrollY - setY) > 4) return;
          tgt.scrollIntoView({ block: 'start', behavior: 'auto' }); setY = window.scrollY;
        }, ms);
      });
    } else window.scrollTo(0, 0);
    if (opts.focus) {
      var f = null;
      if (view === 'home' && prev && prev !== 'home' && opts.fromKey) f = document.querySelector('.node[data-region="' + REGION[prev] + '"]');
      if (!f) f = view === 'home' ? h1 : views[view].querySelector('h2');
      if (f) f.focus({ preventScroll: true });
    }
    if (!opts.initial && prev !== view) {
      if (view === 'home') { window.dispatchEvent(new Event('resize')); if (window.BH_flare) window.BH_flare(.8, 'rgb(255,210,31)'); }
      else if (window.BH_sectionHit) window.BH_sectionHit(views[view], 1);
    }
    document.dispatchEvent(new CustomEvent('bh:view', { detail: { view: view, prev: prev, target: r.target ? r.target.id : null } }));
  }

  function navigate(hash, opts) {
    var r = resolve(hash);
    var url = urlFor(r), now = r.view === 'home' ? location.pathname + location.search + location.hash : location.hash;
    if (url !== now || (r.view === 'home' && location.hash)) history.pushState(null, '', url);
    show(r, { focus: true, force: !!(opts && opts.force), fromKey: opts && opts.fromKey });
  }
  window.BH_route = function (id, opts) { navigate('#' + id, opts); };
  window.BH_view = function () { return current; };

  // in-page links anywhere (top nav, menu, spine, pager, back control, cards, the neuron preview)
  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button > 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest('a[href^="#"]'); if (!a) return;
    if (a.target && a.target !== '_self') return;
    var href = a.getAttribute('href');
    if (a.classList.contains('skip')) { // skip link: straight to the current view's heading
      ev.preventDefault();
      var f = current === 'home' ? h1 : views[current].querySelector('h2'); if (f) f.focus();
      return;
    }
    if (href === '#') return;
    ev.preventDefault();
    navigate(href, { fromKey: ev.detail === 0 });
  });

  // back / forward and hand-edited hashes
  function sync() {
    var r = resolve(location.hash);
    if (!r.known && location.hash) history.replaceState(null, '', location.pathname + location.search);
    show(r, { focus: true });
  }
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);

  // Escape: close the menu, else leave a view for the map
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || ev.defaultPrevented) return;
    if (menu && !menu.hidden) { setMenu(false); if (menuBtn) menuBtn.focus(); return; }
    var t = ev.target;
    if (t && (t.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'range'))) return;
    if (current && current !== 'home') { ev.preventDefault(); navigate('#map', { fromKey: true }); }
  });

  // initial view (deep links): no flare, no focus steal
  (function () {
    var r = resolve(location.hash);
    if (!r.known && location.hash) history.replaceState(null, '', location.pathname + location.search);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    show(r, { initial: true });
  })();
})();
