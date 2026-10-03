/* Brainhertz: "Ghosts N Goblins" (TellaVi5ion, unreleased) player + audio-reactive brain.
   One <audio id="bh-audio" preload="none"> element is shared by the Artist-section player, the mini button in the top bar
   and the Music & Sound neuron preview (anything with [data-bh-play]). Nothing plays until the visitor presses play.
   The waveform comes from precomputed peaks (assets/audio/ghosts-n-goblins.peaks.json), so the page never decodes the file.
   While playing (and not prefers-reduced-motion) a Web Audio AnalyserNode drives the visuals:
     bass  -> window.BH_audio.bass, read by js/field.js (feed/kill + saturation of the reaction-diffusion field)
     level -> --au on the brain SVG (axon / neuron-line glow)
     kicks -> small flares (js/flare.js, at most one per 650 ms, kept below the full-sweep threshold) + a light signal from one region (js/brain.js)
   Pausing or ending stops the loop and resets everything. */
(function () {
  'use strict';
  var audio = document.getElementById('bh-audio'); if (!audio) return;
  var root = document.documentElement, svg = document.getElementById('brain');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TITLE = 'Ghosts N Goblins', ARTIST = 'TellaVi5ion';
  var FALLBACK_DUR = 359.6;
  window.BH_audio = { on: false, bass: 0, level: 0, kick: 0 };

  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function dur() { return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : FALLBACK_DUR; }

  // ---------- play / pause from any [data-bh-play] ----------
  var actx = null, analyser = null, fd = null, td = null, graphTried = false;
  function buildGraph() {
    if (graphTried) return; graphTried = true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      actx = new AC();
      var src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .35; analyser.minDecibels = -85; analyser.maxDecibels = -20;
      src.connect(analyser); analyser.connect(actx.destination);
      fd = new Uint8Array(analyser.frequencyBinCount); td = new Uint8Array(analyser.fftSize);
    } catch (e) { analyser = null; }
  }
  function toggle() {
    if (audio.paused) {
      buildGraph();
      if (actx && actx.state === 'suspended') actx.resume();
      var p = audio.play(); if (p && p.catch) p.catch(function () { sync(); });
    } else audio.pause();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-bh-play]'); if (!b) return;
    e.preventDefault(); toggle();
  });

  function sync() {
    var playing = !audio.paused && !audio.ended;
    root.classList.toggle('bh-playing', playing);
    document.querySelectorAll('[data-bh-play]').forEach(function (b) {
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      b.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + TITLE + ' by ' + ARTIST);
    });
  }
  // neuron preview contents are cloned from a <template> on open: keep their buttons in sync too
  var cellBody = document.getElementById('cell-body');
  if (cellBody && 'MutationObserver' in window) new MutationObserver(sync).observe(cellBody, { childList: true });

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: TITLE, artist: ARTIST, album: 'Unreleased' });
      navigator.mediaSession.setActionHandler('play', function () { toggle(); });
      navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
      navigator.mediaSession.setActionHandler('seekto', function (d) { if (d && isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
    } catch (e) {}
  }

  // ---------- player UI: waveform, seek, time, volume ----------
  var P = document.querySelector('.gng');
  var cvs = P && P.querySelector('.gng-canvas'), seek = P && P.querySelector('.gng-seek');
  var curEl = P && P.querySelector('.gng-cur'), durEl = P && P.querySelector('.gng-dur');
  var vol = P && P.querySelector('.gng-volume'), mute = P && P.querySelector('.gng-mute');
  var peaks = null, hoverX = -1;
  var RAMP = [[0, '#ff3b3b'], [.34, '#c8102e'], [.34, '#7a2cff'], [.7, '#a066ff'], [1, '#b48cff']]; // hard stop: red never blends into purple

  function drawWave() {
    if (!cvs) return;
    var r = cvs.getBoundingClientRect(); if (!r.width) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cvs.width !== W || cvs.height !== H) { cvs.width = W; cvs.height = H; }
    var c = cvs.getContext('2d'); c.clearRect(0, 0, W, H);
    var data = peaks ? peaks.peak : null, rms = peaks ? peaks.rms : null;
    var bw = Math.max(2, Math.round(3 * dpr)), gap = Math.max(1, Math.round(dpr)), n = Math.floor(W / (bw + gap));
    var prog = audio.currentTime / dur(), mid = H / 2;
    var g = c.createLinearGradient(0, 0, W, 0); RAMP.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    var lvl = window.BH_audio.on ? window.BH_audio.level : 0;
    for (var i = 0; i < n; i++) {
      var u = i / n, v = .06, vr = .03;
      if (data) { var j = Math.min(data.length - 1, Math.floor(u * data.length)); v = data[j] / 100; vr = rms[j] / 100; }
      var h = Math.max(2 * dpr, v * (H * .92)), hr = Math.max(dpr, Math.min(h, vr * 2.1 * H * .92));
      var x = i * (bw + gap), played = u < prog;
      var hot = played && prog - u < .012;
      c.globalAlpha = played ? .38 : .22; c.fillStyle = played ? g : '#a59cb8';
      c.fillRect(x, mid - h / 2, bw, h);
      c.globalAlpha = played ? 1 : .55; c.fillStyle = played ? g : '#cbc4da';
      var hh = hr * (hot ? 1 + lvl * .6 : 1); c.fillRect(x, mid - hh / 2, bw, hh);
    }
    c.globalAlpha = 1;
    // playhead
    var px = Math.round(prog * W); c.fillStyle = '#ffffff'; c.fillRect(Math.min(W - 2 * dpr, px), 0, 2 * dpr, H);
    if (hoverX >= 0) { c.globalAlpha = .5; c.fillRect(Math.round(hoverX * dpr), 0, dpr, H); c.globalAlpha = 1; }
  }
  function updateTime() {
    if (curEl) curEl.textContent = fmt(audio.currentTime);
    if (durEl) durEl.textContent = fmt(dur());
    if (seek) {
      seek.max = dur().toFixed(1);
      if (!seeking) seek.value = audio.currentTime.toFixed(1);
      seek.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' of ' + fmt(dur()));
    }
  }
  var seeking = false;
  if (seek) {
    seek.addEventListener('input', function () { seeking = true; audio.currentTime = +seek.value; updateTime(); drawWave(); });
    seek.addEventListener('change', function () { seeking = false; });
    seek.addEventListener('pointermove', function (e) { var r = seek.getBoundingClientRect(); hoverX = e.clientX - r.left; if (audio.paused) drawWave(); });
    seek.addEventListener('pointerleave', function () { hoverX = -1; if (audio.paused) drawWave(); });
  }
  if (vol) {
    audio.volume = +vol.value;
    vol.addEventListener('input', function () { audio.volume = +vol.value; audio.muted = +vol.value === 0; });
  }
  if (mute) mute.addEventListener('click', function () { audio.muted = !audio.muted; });
  audio.addEventListener('volumechange', function () {
    var m = audio.muted || audio.volume === 0;
    if (P) P.classList.toggle('is-muted', m);
    if (mute) { mute.setAttribute('aria-pressed', m ? 'true' : 'false'); mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); }
  });

  if (P && P.dataset.peaks && window.fetch) {
    fetch(P.dataset.peaks).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.peak) { peaks = j; drawWave(); } }).catch(function () {});
  }
  var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawWave, 120); });
  updateTime(); drawWave();

  // ---------- audio-reactive loop (only while playing) ----------
  var raf = 0, slow = 0, fast = 0, lastKick = 0, lvlS = 0, bassS = 0;
  var PAL = ['#ff3b3b', '#8a3dff', '#b48cff', '#a066ff', '#f2c94c', '#2f6bff'], REG = ['sound', 'live', 'visuals', 'lab', 'work', 'about', 'plugins'];
  function heroOn() { if (!svg) return false; var r = svg.getBoundingClientRect(); return r.bottom > 60 && r.top < window.innerHeight; }
  function reactive() { return !!analyser && !mqReduce.matches; }
  function tick(now) {
    raf = 0;
    if (audio.paused) return;
    if (reactive()) {
      analyser.getByteFrequencyData(fd); analyser.getByteTimeDomainData(td);
      var binHz = actx.sampleRate / analyser.fftSize, b0 = Math.max(1, Math.round(30 / binHz)), b1 = Math.max(b0 + 1, Math.round(150 / binHz)), s = 0;
      for (var i = b0; i <= b1; i++) s += fd[i];
      var raw = s / ((b1 - b0 + 1) * 255);
      var q = 0; for (var k = 0; k < td.length; k += 4) { var d = (td[k] - 128) / 128; q += d * d; }
      var rms = Math.sqrt(q / (td.length / 4));
      feed(raw, rms, now);
    }
    updateTime(); drawWave();
    raf = requestAnimationFrame(tick);
  }
  // shared by the analyser and the headless test hook (window.BH_audioFeed)
  function feed(raw, rms, now) {
    // adaptive: a slow average tracks the section's loudness, the fast value rides on top of it (the pulse)
    fast += (raw - fast) * .6; slow += (raw - slow) * (slow ? .03 : 1);
    var dev = fast - slow, pulse = Math.max(0, Math.min(1, .5 + dev / .12)), sec = Math.max(0, Math.min(1, (slow - .15) / .55));
    bassS += (sec * .45 + pulse * .55 * (.3 + .7 * sec) - bassS) * .4;
    lvlS += (Math.min(1, rms * 5) - lvlS) * .25;
    var A = window.BH_audio; A.on = true; A.bass = bassS; A.level = lvlS; A.raw = raw;
    if (svg) { svg.classList.add('au-on'); svg.style.setProperty('--au', lvlS.toFixed(3)); svg.style.setProperty('--ab', bassS.toFixed(3)); }
    // the same values on <html>: on the other views (brain hidden) the top bar's signal line and the view marker breathe with the track
    root.style.setProperty('--au', lvlS.toFixed(3)); root.style.setProperty('--ab', bassS.toFixed(3));
    // kick / transient: bass jumps clearly above its running average; at most ~1.5 per second
    A.kick *= .85;
    if (dev > .055 && fast > .3 && now - lastKick > 650) {
      lastKick = now; A.kick = 1; A.kicks = (A.kicks || 0) + 1;
      var amt = Math.min(.34, .14 + dev * 1.2);
      if (window.BH_flare && heroOn()) window.BH_flare(amt, PAL[Math.floor(Math.random() * PAL.length)]); // only while the brain is on screen, so reading further down stays calm
      if (window.BH_fire) window.BH_fire(REG[Math.floor(Math.random() * REG.length)]);
      if (!heroOn()) { root.classList.remove('au-kick'); void root.offsetWidth; root.classList.add('au-kick'); clearTimeout(kickT); kickT = setTimeout(function () { root.classList.remove('au-kick'); }, 220); }
    }
  }
  function rest() {
    var A = window.BH_audio; A.on = false; A.bass = A.level = A.kick = 0; slow = fast = bassS = lvlS = 0;
    if (svg) { svg.classList.remove('au-on'); svg.style.removeProperty('--au'); svg.style.removeProperty('--ab'); }
    root.style.removeProperty('--au'); root.style.removeProperty('--ab'); root.classList.remove('au-kick');
  }
  var kickT = 0;
  // views (js/router.js): the waveform canvas may have been hidden at load, so redraw it when a view is shown
  document.addEventListener('bh:view', function () { requestAnimationFrame(function () { updateTime(); drawWave(); }); });
  function start() { if (!raf) raf = requestAnimationFrame(tick); }
  audio.addEventListener('play', function () { sync(); start(); });
  audio.addEventListener('playing', sync);
  audio.addEventListener('pause', function () { sync(); rest(); updateTime(); drawWave(); });
  audio.addEventListener('ended', function () { sync(); rest(); audio.currentTime = 0; updateTime(); drawWave(); });
  audio.addEventListener('loadedmetadata', function () { updateTime(); drawWave(); });
  audio.addEventListener('seeked', function () { updateTime(); drawWave(); });
  audio.addEventListener('error', function () { setTimeout(function () { if (audio.error || audio.networkState === 3) { sync(); rest(); if (P) P.classList.add('is-error'); } }, 0); }, true);
  mqReduce.addEventListener && mqReduce.addEventListener('change', function () { if (mqReduce.matches) rest(); });

  // test hook for headless screenshots (no sound card): push fake energy through the exact same path
  window.BH_audioFeed = function (raw, rms) { if (mqReduce.matches) return; feed(raw, rms, performance.now()); };
  window.BH_audioRest = rest;
  sync();
})();
