/* Brainhertz: living multicolour reaction-diffusion field (Gray-Scott, like Kyle's MOSH plugin).
   One low-res simulation, ping-ponged on the GPU (WebGL2) and upscaled. It is drawn bright and clipped to the glass
   brain, and soft/dark behind the rest of the hero. Colour = spectral ramp red > orange > yellow > lime > green > cyan > blue
   (ping-pong, never wraps through magenta/purple), driven by concentration plus a slow hue drift.
   At rest: occasional small macroblock / slice-smear moshes (applied to the sim itself, so the scars evolve).
   Flares (js/flare.js) perturb feed/kill, re-seed and spike saturation. While the track plays, bass does the same (js/audio.js).
   Pauses off-screen and when the tab is hidden. prefers-reduced-motion: one static frame, no glitches.
   Fallback: canvas2D CPU sim at lower resolution. */
(function () {
  'use strict';
  var hero = document.getElementById('hero'), svg = document.getElementById('brain');
  if (!hero || !svg) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.createElement('canvas');
  cv.className = 'field'; cv.setAttribute('aria-hidden', 'true');
  hero.insertBefore(cv, hero.firstChild);
  var RAMP = [[255, 59, 59], [255, 138, 31], [255, 210, 31], [196, 255, 46], [43, 255, 136], [34, 228, 255], [47, 139, 255]];
  var DISPLAY_SCALE = 0.5, SIM_MAX = 300;
  var flare = 0, drive = 0, driveSim = 0, glitch = 0, gband = [0, 0, 0, 0], nextGlitch = performance.now() + 2500;

  // ---------- brain mask (R = inside silhouette, G = dark halo under nodes/labels) ----------
  var mask = document.createElement('canvas'), MW = 500, MH = 360; mask.width = MW; mask.height = MH;
  var brainUV = [0, 0, 1, 1];
  function vb() { var b = svg.viewBox.baseVal; return [b.x, b.y, b.width, b.height]; }
  function drawMask() {
    var v = vb(), mc = mask.getContext('2d');
    MH = Math.round(MW * v[3] / v[2]); mask.height = MH;
    mc.clearRect(0, 0, MW, MH);
    mc.save(); mc.scale(MW / v[2], MH / v[3]); mc.translate(-v[0], -v[1]);
    mc.filter = 'blur(2px)'; mc.fillStyle = '#f00';
    ['shape-cerebrum', 'shape-cerebellum', 'shape-stem'].forEach(function (id) { var p = document.getElementById(id); if (p) mc.fill(new Path2D(p.getAttribute('d'))); });
    mc.filter = 'none'; mc.globalCompositeOperation = 'lighter';
    svg.querySelectorAll('.node').forEach(function (n) {
      var x = +n.dataset.x, y = +n.dataset.y, g = mc.createRadialGradient(x, y, 0, x, y, 46);
      g.addColorStop(0, 'rgba(0,255,0,1)'); g.addColorStop(.55, 'rgba(0,160,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      mc.fillStyle = g; mc.beginPath(); mc.arc(x, y, 46, 0, Math.PI * 2); mc.fill();
      if (window.innerWidth > 720) { // label halo
        var lx = x + (+n.dataset.lx), ly = y + (+n.dataset.ly), a = n.dataset.anchor, w = 190, cx = a === 'end' ? lx - w / 2 : a === 'start' ? lx + w / 2 : lx;
        var gl = mc.createRadialGradient(cx, ly, 0, cx, ly, 70); gl.addColorStop(0, 'rgba(0,150,0,1)'); gl.addColorStop(1, 'rgba(0,0,0,1)');
        mc.save(); mc.translate(cx, ly); mc.scale(1.5, .6); mc.translate(-cx, -ly); mc.fillStyle = gl; mc.beginPath(); mc.arc(cx, ly, 70, 0, Math.PI * 2); mc.fill(); mc.restore();
      }
    });
    mc.restore();
  }
  function measure() {
    var hr = cv.getBoundingClientRect(), br = svg.getBoundingClientRect();
    if (!hr.width || !hr.height) return false;
    brainUV = [(br.left - hr.left) / hr.width, (br.top - hr.top) / hr.height, br.width / hr.width, br.height / hr.height];
    return hr;
  }

  // ---------- WebGL2 path ----------
  function initGL() {
    var gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    var VS = '#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0,1);}';
    var SIM = '#version 300 es\nprecision highp float;uniform sampler2D s;uniform vec2 px;uniform float t,fl;uniform vec3 sd;in vec2 uv;out vec4 o;\n' +
      'void main(){vec2 c=texture(s,uv).xy;' +
      'vec2 l=-c+.2*(texture(s,uv+vec2(px.x,0)).xy+texture(s,uv-vec2(px.x,0)).xy+texture(s,uv+vec2(0,px.y)).xy+texture(s,uv-vec2(0,px.y)).xy)' +
      '+.05*(texture(s,uv+px).xy+texture(s,uv-px).xy+texture(s,uv+vec2(px.x,-px.y)).xy+texture(s,uv+vec2(-px.x,px.y)).xy);' +
      // slowly drifting parameter map: coral / maze zones blend with moving-spot zones, so it never freezes
      'float z=.5+.5*sin(uv.x*7.+t*.07)*sin(uv.y*5.-t*.05+uv.x*2.);' +
      'float f=mix(.030,.056,z)+.012*fl, k=mix(.0565,.0625,z)-.003*fl;' +
      'float a=c.x,b=c.y,r=a*b*b;a+=l.x-r+f*(1.-a);b+=.5*l.y+r-(k+f)*b;' +
      'if(sd.z>0.){vec2 d=(uv-sd.xy)/px;if(dot(d,d)<sd.z*sd.z)b=1.;}' +
      'o=vec4(clamp(a,0.,1.),clamp(b,0.,1.),0,1);}';
    // mosh pass: displace a horizontal band and a few macroblocks of the sim state (the "scar" then keeps evolving)
    var MOSH = '#version 300 es\nprecision highp float;uniform sampler2D s;uniform vec4 band;uniform float seed,amt;in vec2 uv;out vec4 o;\n' +
      'float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7))+seed)*43758.5453);}' +
      'void main(){vec2 q=uv;if(uv.y>band.x&&uv.y<band.y)q.x-=band.z;vec2 bl=floor(uv*vec2(20.,12.));' +
      'if(h(bl)<amt){q+=(vec2(h(bl+1.),h(bl+2.))-.5)*.05;}o=texture(s,q);}';
    var DISP = '#version 300 es\nprecision highp float;uniform sampler2D s,m;uniform vec4 brain,gb;uniform float t,fl,gl;uniform vec2 res;in vec2 uv;out vec4 o;\n' +
      'vec3 C[7]=vec3[7](vec3(1.,.231,.231),vec3(1.,.541,.122),vec3(1.,.824,.122),vec3(.769,1.,.18),vec3(.169,1.,.533),vec3(.133,.894,1.),vec3(.184,.545,1.));' +
      'vec3 ramp(float x){x=clamp(x,0.,1.)*6.;int i=int(min(floor(x),5.));return mix(C[i],C[i+1],x-float(i));}' +
      'float h(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233))+gb.w)*43758.5453);}' +
      'void main(){vec2 sc=vec2(uv.x,1.-uv.y);vec2 q=sc;' +
      'if(gl>0.){if(sc.y>gb.x&&sc.y<gb.y)q.x-=gb.z*gl;vec2 bl=floor(sc*res/28.);if(h(bl)<.035*gl)q+=(vec2(h(bl+3.),h(bl+7.))-.5)*.06;}' +
      'vec2 c=texture(s,vec2(q.x,1.-q.y)).xy;float b=c.y;' +
      'float hh=fract(b*3.2+t*.02+q.x*.95+q.y*.45+.08*sin(q.y*9.+t*.3));vec3 col=ramp(1.-abs(2.*hh-1.));' +
      'float lum=smoothstep(.07,.40,b);float edge=smoothstep(.18,.26,b)-smoothstep(.30,.42,b);' +
      'vec2 bu=(sc-brain.xy)/brain.zw;vec2 mk=(bu.x>0.&&bu.x<1.&&bu.y>0.&&bu.y<1.)?texture(m,bu).rg:vec2(0.);' +
      'vec2 bd=max(max(brain.xy-sc,sc-(brain.xy+brain.zw)),0.);float prox=1.-.62*smoothstep(0.,.32,length(bd*vec2(res.x/res.y,1.)));' +
      'float bgf=smoothstep(0.,.08,sc.x)*smoothstep(1.,.92,sc.x)*smoothstep(1.,.85,sc.y)*prox;' +
      'float inten=mix(.15*bgf,.92,mk.r)*(1.-.72*mk.g)*(1.+.45*fl*mix(.35,1.,mk.r));' +
      'col=col*(lum*.85+edge*.35)*inten;' +
      'float g=dot(col,vec3(.3,.59,.11));col=max(mix(vec3(g),col,1.+.7*fl),0.);' +
      'o=vec4(col,clamp(max(col.r,max(col.g,col.b))*1.1,0.,1.));}';
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
    function prog(fs) { var p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return null; gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null; var u = {}; var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (var i = 0; i < n; i++) { var a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); } return { p: p, u: u }; }
    var pSim = prog(SIM), pMosh = prog(MOSH), pDisp = prog(DISP);
    if (!pSim || !pMosh || !pDisp) return null;
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var SW = 0, SH = 0, tex = [], fbo = [], cur = 0, mtex = gl.createTexture();
    function mk(data) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SW, SH, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return [t, f];
    }
    function seedData() {
      var d = new Float32Array(SW * SH * 4);
      for (var i = 0; i < SW * SH; i++) { d[i * 4] = 1; d[i * 4 + 3] = 1; }
      var n = Math.round(SW * SH / 900);
      for (var k = 0; k < n; k++) { var cx = Math.floor(Math.random() * SW), cy = Math.floor(Math.random() * SH), r = 2 + Math.floor(Math.random() * 3);
        for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) { var j = (((cy + y + SH) % SH) * SW + ((cx + x + SW) % SW)) * 4; d[j + 1] = 1; } }
      return d;
    }
    function resize(hr) {
      var w = Math.max(2, Math.round(hr.width * DISPLAY_SCALE)), h = Math.max(2, Math.round(hr.height * DISPLAY_SCALE));
      cv.width = w; cv.height = h;
      var s = Math.min(1, SIM_MAX / Math.max(hr.width / 4, hr.height / 4));
      var nw = Math.round(hr.width / 4 * s), nh = Math.round(hr.height / 4 * s);
      if (nw !== SW || nh !== SH) {
        SW = nw; SH = nh; tex.forEach(function (t) { gl.deleteTexture(t); }); fbo.forEach(function (f) { gl.deleteFramebuffer(f); });
        var d = seedData(), a = mk(d), b = mk(d); tex = [a[0], b[0]]; fbo = [a[1], b[1]]; cur = 0;
        warm(900);
      }
      drawMask();
      gl.bindTexture(gl.TEXTURE_2D, mtex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    var seedQ = null, tSim = 0;
    function step(n) {
      gl.useProgram(pSim.p); gl.viewport(0, 0, SW, SH);
      gl.uniform2f(pSim.u.px, 1 / SW, 1 / SH); gl.uniform1f(pSim.u.fl, driveSim); gl.uniform1i(pSim.u.s, 0); gl.activeTexture(gl.TEXTURE0);
      for (var i = 0; i < n; i++) {
        tSim += 1 / 60 / 8;
        gl.uniform1f(pSim.u.t, tSim);
        if (i === 0 && seedQ) { gl.uniform3f(pSim.u.sd, seedQ[0], seedQ[1], seedQ[2]); seedQ = null; } else if (i === 1) gl.uniform3f(pSim.u.sd, 0, 0, 0);
        else if (i === 0) gl.uniform3f(pSim.u.sd, 0, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); cur = 1 - cur;
      }
    }
    function warm(n) { for (var i = 0; i < n; i += 50) step(50); }
    function mosh(amt, dx) {
      var y0 = Math.random() * .9;
      gl.useProgram(pMosh.p); gl.viewport(0, 0, SW, SH); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(pMosh.u.s, 0);
      gl.uniform4f(pMosh.u.band, y0, y0 + .02 + Math.random() * .05, dx, 0); gl.uniform1f(pMosh.u.seed, Math.random() * 100); gl.uniform1f(pMosh.u.amt, amt);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); cur = 1 - cur;
    }
    function draw(now) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pDisp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.uniform1i(pDisp.u.s, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mtex); gl.uniform1i(pDisp.u.m, 1);
      gl.uniform4f(pDisp.u.brain, brainUV[0], brainUV[1], brainUV[2], brainUV[3]);
      gl.uniform4f(pDisp.u.gb, gband[0], gband[1], gband[2], gband[3]);
      gl.uniform1f(pDisp.u.t, now / 1000); gl.uniform1f(pDisp.u.fl, drive); gl.uniform1f(pDisp.u.gl, glitch);
      gl.uniform2f(pDisp.u.res, cv.width, cv.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return { resize: resize, step: step, draw: draw, mosh: mosh, seed: function (x, y, r) { seedQ = [x, y, r]; }, kind: 'webgl2' };
  }

  // ---------- canvas2D fallback (CPU, low res) ----------
  function init2D() {
    var ctx = cv.getContext('2d'); if (!ctx) return null;
    var sim = document.createElement('canvas'), sc = sim.getContext('2d'), W = 0, H = 0, A, B, A2, B2, img, t = 0;
    function resize(hr) {
      cv.width = Math.round(hr.width * DISPLAY_SCALE); cv.height = Math.round(hr.height * DISPLAY_SCALE);
      var s = Math.min(1, 140 / Math.max(hr.width / 6, hr.height / 6));
      W = Math.round(hr.width / 6 * s); H = Math.round(hr.height / 6 * s); sim.width = W; sim.height = H;
      A = new Float32Array(W * H).fill(1); B = new Float32Array(W * H); A2 = new Float32Array(W * H); B2 = new Float32Array(W * H); img = sc.createImageData(W, H);
      for (var k = 0; k < W * H / 700; k++) { var cx = 2 + Math.floor(Math.random() * (W - 4)), cy = 2 + Math.floor(Math.random() * (H - 4)); for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) B[(cy + y) * W + cx + x] = 1; }
      step(700);
    }
    function step(n) {
      for (var it = 0; it < n; it++) {
        t += 1 / 480;
        for (var y = 0; y < H; y++) { var ym = ((y - 1 + H) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
          for (var x = 0; x < W; x++) { var xm = (x - 1 + W) % W, xp = (x + 1) % W, i = y0 + x, a = A[i], b = B[i];
            var la = -a + .2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + .05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
            var lb = -b + .2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + .05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
            var z = .5 + .5 * Math.sin(x / W * 7 + t * .07) * Math.sin(y / H * 5 - t * .05), f = .030 + .026 * z + .012 * driveSim, k = .0565 + .006 * z - .003 * driveSim, r = a * b * b;
            A2[i] = a + la - r + f * (1 - a); B2[i] = b + .5 * lb + r - (k + f) * b; } }
        var tt = A; A = A2; A2 = tt; tt = B; B = B2; B2 = tt;
      }
    }
    function colorize(now, gain) {
      var d = img.data;
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var i = y * W + x, b = B[i], hh = (b * 3.2 + now / 1000 * .02 + x / W * .95 + y / H * .45) % 1, tri = 1 - Math.abs(2 * hh - 1), q = tri * 6, j = Math.min(5, Math.floor(q)), f = q - j;
        var lum = Math.max(0, Math.min(1, (b - .07) / .33)) * gain, k = i * 4;
        d[k] = (RAMP[j][0] + (RAMP[j + 1][0] - RAMP[j][0]) * f) * lum; d[k + 1] = (RAMP[j][1] + (RAMP[j + 1][1] - RAMP[j][1]) * f) * lum; d[k + 2] = (RAMP[j][2] + (RAMP[j + 1][2] - RAMP[j][2]) * f) * lum; d[k + 3] = 255 * Math.min(1, lum * 1.2);
      }
      sc.putImageData(img, 0, 0);
    }
    function draw(now) {
      var w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h); colorize(now, 1 + .4 * drive);
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = .17; ctx.drawImage(sim, 0, 0, w, h); ctx.globalAlpha = 1;
      var v = vb(); ctx.save(); ctx.translate(brainUV[0] * w, brainUV[1] * h); ctx.scale(brainUV[2] * w / v[2], brainUV[3] * h / v[3]); ctx.translate(-v[0], -v[1]);
      var p = new Path2D(); ['shape-cerebrum', 'shape-cerebellum', 'shape-stem'].forEach(function (id) { var e = document.getElementById(id); if (e) p.addPath(new Path2D(e.getAttribute('d'))); });
      ctx.clip(p); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .9; ctx.drawImage(sim, 0, 0, w, h); ctx.restore();
    }
    return { resize: resize, step: function (n) { step(Math.min(n, 2)); }, draw: draw, mosh: function () {}, seed: function (x, y) { var cx = Math.floor(x * W), cy = Math.floor(y * H); for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) B[((cy + yy + H) % H) * W + (cx + xx + W) % W] = 1; }, kind: '2d' };
  }

  var F = null;
  try { F = initGL(); } catch (e) { F = null; }
  if (!F) { var c2 = cv; cv = document.createElement('canvas'); cv.className = 'field'; cv.setAttribute('aria-hidden', 'true'); hero.replaceChild(cv, c2); F = init2D(); }
  if (!F) return;
  document.documentElement.dataset.field = F.kind;
  var hr = measure(); if (!hr) return;
  F.resize(hr);
  F.draw(performance.now());
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var r = measure(); if (r) { F.resize(r); F.draw(performance.now()); } }, 150); });
  window.matchMedia('(max-width: 720px)').addEventListener('change', function () { setTimeout(function () { var r = measure(); if (r) { F.resize(r); F.draw(performance.now()); } }, 60); });
  if (reduce) return; // one static frame only

  var lastKick = 0;
  window.BH_fieldFlare = function (a) {
    flare = Math.max(flare, Math.min(1, a || 0));
    var now = performance.now(); if (now - lastKick < 260 && a < .8) return; lastKick = now;
    for (var i = 0; i < 1 + Math.round(a * 3); i++) F.seed(Math.random(), Math.random(), 2 + Math.random() * 3);
    F.mosh(.05 + .12 * a, (Math.random() - .5) * .08 * a);
  };
  var raf = 0, last = performance.now(), visible = true, seedT = 0;
  function frame(now) {
    raf = 0;
    var dt = Math.min(50, now - last); last = now;
    flare *= Math.exp(-dt / 260);
    // audio (js/audio.js): bass pushes feed/kill + saturation through the same channel as flares, and speeds the sim a little
    var AU = window.BH_audio, ab = AU && AU.on ? AU.bass : 0;
    drive = Math.max(flare, ab * .7);        // display: saturation + intensity pulse with the bass
    driveSim = Math.max(flare, ab * .3);     // sim: a lighter feed/kill nudge so the pattern breathes without flooding
    if (glitch > 0) glitch = Math.max(0, glitch - dt / 320);
    if (now > nextGlitch) { // small periodic mosh at rest
      nextGlitch = now + 2600 + Math.random() * 3200;
      var y0 = Math.random() * .9; gband = [y0, y0 + .015 + Math.random() * .035, (Math.random() - .5) * .05, Math.random() * 100]; glitch = 1;
      F.mosh(.006, (Math.random() - .5) * .03);
    }
    if (now - seedT > 1400) { seedT = now; F.seed(Math.random(), Math.random(), 2.5); }
    if (Math.random() < .02) measure();
    F.step(8 + Math.round(ab * 4));
    F.draw(now);
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : (raf && cancelAnimationFrame(raf), raf = 0); }).observe(hero);
  document.addEventListener('visibilitychange', function () { document.hidden ? (raf && cancelAnimationFrame(raf), raf = 0) : start(); });
  start();
})();
