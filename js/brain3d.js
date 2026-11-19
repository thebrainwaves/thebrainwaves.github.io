/* Brainhertz: 3D glass brain (homepage hero).
   Original procedural mesh (two hemispheres with gyri/sulci, cerebellum tucked in — no brainstem).
   Clear glass shell (near-zero body, fresnel rim, studio speculars; folds as highlight lines)
   with Gray-Scott neon fluid on inset additive layers (transparent dark gaps).
   Shape is a baked SDF mesh (js/brain-mesh.bin, BHB2) — cartoon scalloped cerebrum, no stem.
   Optional per-vertex groove mask (flag byte 1) drives a neon/fresnel fold highlight.
   three.js r158 is lazy-loaded from js/vendor/ (MIT, CSP script-src 'self') after first paint.
   Fallback: the existing SVG glass brain, also used for prefers-reduced-motion and no-WebGL. */
(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- tasteful scroll reveals (independent of WebGL) ----------
  if (!reduce || !reduce.matches) {
    document.documentElement.classList.add('rx-on');
    function revealNow() {
      document.querySelectorAll('.section.view:not([hidden])').forEach(function (s) { s.classList.add('in'); });
    }
    if ('IntersectionObserver' in window) {
      var rio = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
      document.querySelectorAll('.section.view').forEach(function (s) { rio.observe(s); });
    } else {
      document.querySelectorAll('.section.view').forEach(function (s) { s.classList.add('in'); });
    }
    document.addEventListener('bh:view', revealNow);
  }

  var hero = document.getElementById('hero');
  var wrap = hero && hero.querySelector('.brain-wrap');
  var svg = document.getElementById('brain');
  var canvas = document.getElementById('brain3d');
  var hotspots = document.getElementById('brain3d-hotspots');
  if (!hero || !wrap || !svg || !canvas || !hotspots) return;
  if (reduce && reduce.matches) return;

  function hasGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  if (!hasGL()) return;

  var booted = false, loading = false;

  function afterPaint(fn) {
    function go() { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  function heroOnScreen() { return hero && !hero.hidden; }

  function maybeLoad() {
    if (booted || loading) return;
    if (!heroOnScreen()) return;
    loading = true;
    Promise.all([
      import('./vendor/three.module.min.js'),
      fetch('js/brain-mesh.bin').then(function (r) {
        if (!r.ok) throw new Error('brain mesh ' + r.status);
        return r.arrayBuffer();
      })
    ]).then(function (pack) {
      try { boot(pack[0], pack[1]); }
      catch (err) { console.warn('brain3d:', err && err.message ? err.message : err); loading = false; }
    }).catch(function (err) {
      console.warn('brain3d: failed to load', err && err.message ? err.message : err);
      loading = false;
    });
  }

  afterPaint(maybeLoad);
  document.addEventListener('bh:view', function () { if (heroOnScreen()) maybeLoad(); });

  // =====================================================================
  function boot(THREE, meshBuf) {
    if (booted) return;
    booted = true;
    var narrow = window.matchMedia('(max-width: 720px)');

    var REGIONS = [
      { id: 'about',   label: 'About',                         sub: 'Frontal · identity',        anchor: 'start',  pos: [-0.35,  0.22,  0.82] },
      { id: 'plugins', label: 'Plugins',                       sub: 'Motor cortex · tools',      anchor: 'middle', pos: [-0.05,  0.78,  0.18] },
      { id: 'live',    label: 'Live, Projection & Lighting',   sub: 'Parietal · space',          anchor: 'start',  pos: [ 0.48,  0.62, -0.32] },
      { id: 'work',    label: 'Work',                          sub: 'Hippocampus · memory',      anchor: 'middle', pos: [ 0.10,  0.12,  0.72] },
      { id: 'visuals', label: 'Visuals',                       sub: 'Occipital · sight',         anchor: 'end',    pos: [ 0.38,  0.16, -0.82] },
      { id: 'sound',   label: 'Music & Sound',                 sub: 'Temporal · hearing',        anchor: 'end',    pos: [-0.80, -0.26,  0.18] },
      { id: 'lab',     label: 'Real-time Lab',                 sub: 'Cerebellum · timing',       anchor: 'end',    pos: [-0.42, -0.30, -0.70] },
      { id: 'contact', label: 'Contact',                       sub: 'Output',                    anchor: 'start',  pos: [ 0.48, -0.26, -0.68] }
    ];
    var COLORS = window.BH_COLORS || { about: '#b48cff', plugins: '#965aff', live: '#ff3b3b', work: '#f03040', visuals: '#f4f2fa', sound: '#2f6bff', lab: '#a066ff', contact: '#f2c94c' };

    // ---------- procedural geometry (original): smooth anatomical sculpture, no stem ----------
    function parseBrainMesh(buf) {
      // BHB2: magic, flags, bbox min/max float32, nverts, nidx, int16 positions, int8 normals, uint16/32 indices
      var dv = new DataView(buf);
      var u8 = new Uint8Array(buf);
      if (u8[0] !== 0x42 || u8[1] !== 0x48 || u8[2] !== 0x42 || u8[3] !== 0x32) {
        throw new Error('bad brain mesh');
      }
      var use32 = u8[4] === 1;
      var hasGroove = u8[5] === 1;
      var off = 8;
      var minx = dv.getFloat32(off, true), miny = dv.getFloat32(off + 4, true), minz = dv.getFloat32(off + 8, true);
      var maxx = dv.getFloat32(off + 12, true), maxy = dv.getFloat32(off + 16, true), maxz = dv.getFloat32(off + 20, true);
      off += 24;
      var nverts = dv.getUint32(off, true), nidx = dv.getUint32(off + 4, true);
      off += 8;
      var pos = new Float32Array(nverts * 3), nrm = new Float32Array(nverts * 3);
      var groove = new Float32Array(nverts);
      var ex = maxx - minx, ey = maxy - miny, ez = maxz - minz, i, q, s;
      for (i = 0; i < nverts; i++) {
        q = dv.getInt16(off, true); off += 2; pos[i * 3] = minx + (q + 32767) / 65534 * ex;
        q = dv.getInt16(off, true); off += 2; pos[i * 3 + 1] = miny + (q + 32767) / 65534 * ey;
        q = dv.getInt16(off, true); off += 2; pos[i * 3 + 2] = minz + (q + 32767) / 65534 * ez;
      }
      for (i = 0; i < nverts; i++) {
        s = dv.getInt8(off++); nrm[i * 3] = s / 127;
        s = dv.getInt8(off++); nrm[i * 3 + 1] = s / 127;
        s = dv.getInt8(off++); nrm[i * 3 + 2] = s / 127;
      }
      if (hasGroove) {
        for (i = 0; i < nverts; i++) groove[i] = u8[off++] / 255;
      }
      var idx = new Uint32Array(nidx), src, j;
      if (use32) {
        for (j = 0; j < nidx; j++, off += 4) idx[j] = dv.getUint32(off, true);
      } else {
        for (j = 0; j < nidx; j++, off += 2) idx[j] = dv.getUint16(off, true);
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('groove', new THREE.BufferAttribute(groove, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      return geo;
    }

    function insetGeo(geo, amount) {
      var g = geo.clone();
      var p = g.attributes.position, n = g.attributes.normal, i;
      if (!n) { g.computeVertexNormals(); n = g.attributes.normal; }
      for (i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) - n.getX(i) * amount, p.getY(i) - n.getY(i) * amount, p.getZ(i) - n.getZ(i) * amount);
      }
      g.computeVertexNormals();
      return g;
    }

    var shellGeo = parseBrainMesh(meshBuf);
    var coreGeo = insetGeo(shellGeo, 0.10);
    var shellTris = ((shellGeo.index ? shellGeo.index.count : shellGeo.attributes.position.count) / 3) | 0;
    var coreTris = ((coreGeo.index ? coreGeo.index.count : coreGeo.attributes.position.count) / 3) | 0;

    // snap a target point onto the outer surface (vertex most aligned with the aim ray)
    function snapToSurface(target) {
      var p = shellGeo.attributes.position, nrm = shellGeo.attributes.normal, i;
      var lx = Math.sqrt(target[0]*target[0]+target[1]*target[1]+target[2]*target[2]) || 1;
      var dx = target[0]/lx, dy = target[1]/lx, dz = target[2]/lx;
      var best = 0, bestS = -1e9, x, y, z, s, align;
      for (i = 0; i < p.count; i++) {
        x = p.getX(i); y = p.getY(i); z = p.getZ(i);
        align = x*dx + y*dy + z*dz;
        s = align / (Math.sqrt(x*x+y*y+z*z) + 1e-5);
        if (s > 0.55 && align > bestS) { bestS = align; best = i; }
      }
      return {
        x: p.getX(best), y: p.getY(best), z: p.getZ(best),
        nx: nrm.getX(best), ny: nrm.getY(best), nz: nrm.getZ(best)
      };
    }

    // ---------- renderer / scene ----------
    var dprCap = function () { return narrow.matches ? 1 : 1.5; };
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: !narrow.matches,
      powerPreference: 'high-performance',
      premultipliedAlpha: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0.05, 0.2, 3.4);
    camera.lookAt(0, -0.05, 0);

    // studio env still helps the gold neuron metals; glass uses a custom fake-window shader
    (function makeEnv() {
      var es = new THREE.Scene();
      es.background = new THREE.Color(0x07081a);
      function panel(w, h, color, pos) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color }));
        m.position.copy(pos);
        m.lookAt(new THREE.Vector3(0, 0, 0));
        es.add(m);
      }
      panel(12, 7, 0xffffff, new THREE.Vector3(-7, 8, 10));
      panel(3.2, 8, 0xc8d8ff, new THREE.Vector3(9, 3, 4));
      panel(8, 1.4, 0xfff4e8, new THREE.Vector3(0, 10, 2));
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      scene.environment = pmrem.fromScene(es, 0.04).texture;
      pmrem.dispose();
    })();

    scene.add(new THREE.HemisphereLight(0xb7c8ff, 0x140814, 0.45));
    var key = new THREE.DirectionalLight(0xfff7ef, 1.6);
    key.position.set(-3.4, 4.2, 3.6);
    scene.add(key);
    var rimL = new THREE.DirectionalLight(0x3d76ff, 0.7);
    rimL.position.set(3.6, 0.4, -1.8);
    scene.add(rimL);

    var group = new THREE.Group();
    group.position.y = 0.04;
    group.scale.setScalar(1.00);
    scene.add(group);

    // ---- Gray-Scott reaction-diffusion (same family as field.js), in this WebGL context ----
    var SIM = narrow.matches ? 192 : 256;
    var rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    };
    var rtA = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);
    var rtB = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);
    rtA.texture.colorSpace = THREE.NoColorSpace;
    rtB.texture.colorSpace = THREE.NoColorSpace;
    var rts = [rtA, rtB], rtCur = 0;

    var seedData = new Float32Array(SIM * SIM * 4);
    (function seedGS() {
      var i, k, x, y, cx, cy, rad, ix, iy;
      for (i = 0; i < SIM * SIM; i++) { seedData[i * 4] = 1; seedData[i * 4 + 3] = 1; }
      for (k = 0; k < 32; k++) {
        cx = (0.14 + Math.random() * 0.72) * SIM | 0;
        cy = (0.14 + Math.random() * 0.72) * SIM | 0;
        rad = 2 + (Math.random() * 5) | 0;
        for (y = -rad; y <= rad; y++) for (x = -rad; x <= rad; x++) {
          if (x * x + y * y > rad * rad) continue;
          ix = (cx + x + SIM) % SIM; iy = (cy + y + SIM) % SIM;
          seedData[(iy * SIM + ix) * 4 + 1] = 1;
        }
      }
    })();
    var seedTex = new THREE.DataTexture(seedData, SIM, SIM, THREE.RGBAFormat, THREE.FloatType);
    seedTex.needsUpdate = true;
    seedTex.wrapS = seedTex.wrapT = THREE.RepeatWrapping;
    seedTex.minFilter = seedTex.magFilter = THREE.LinearFilter;
    seedTex.colorSpace = THREE.NoColorSpace;
    seedTex.generateMipmaps = false;

    var simMat = new THREE.ShaderMaterial({
      uniforms: {
        s: { value: seedTex },
        px: { value: new THREE.Vector2(1 / SIM, 1 / SIM) },
        t: { value: 0 },
        fl: { value: 0 },
        sd: { value: new THREE.Vector3(0, 0, 0) }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'uniform sampler2D s; uniform vec2 px; uniform float t, fl; uniform vec3 sd;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec2 uv = vUv;',
        '  vec2 c = texture2D(s, uv).xy;',
        '  vec2 l = -c',
        '    + 0.2 * (texture2D(s, uv+vec2(px.x,0.0)).xy + texture2D(s, uv-vec2(px.x,0.0)).xy',
        '            + texture2D(s, uv+vec2(0.0,px.y)).xy + texture2D(s, uv-vec2(0.0,px.y)).xy)',
        '    + 0.05 * (texture2D(s, uv+px).xy + texture2D(s, uv-px).xy',
        '             + texture2D(s, uv+vec2(px.x,-px.y)).xy + texture2D(s, uv+vec2(-px.x,px.y)).xy);',
        '  float z = 0.5 + 0.5 * sin(uv.x*7.0+t*0.07)*sin(uv.y*5.0-t*0.05+uv.x*2.0);',
        '  float f = mix(0.046, 0.056, z) + 0.008*fl;',
        '  float k = mix(0.0605, 0.0630, z) - 0.002*fl;',
        '  float a = c.x, b = c.y, r = a*b*b;',
        '  a += l.x - r + f*(1.0-a);',
        '  b += 0.5*l.y + r - (k+f)*b;',
        '  if (sd.z > 0.0) {',
        '    vec2 d = (uv - sd.xy) / px;',
        '    if (dot(d,d) < sd.z*sd.z) b = 1.0;',
        '  }',
        '  gl_FragColor = vec4(clamp(a,0.0,1.0), clamp(b,0.0,1.0), 0.0, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    var simScene = new THREE.Scene();
    var simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));

    var nextSeedAt = 0;
    function stepGS(timeSec, steps, seed) {
      var prevTM = renderer.toneMapping;
      var prevCS = renderer.outputColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      simMat.uniforms.t.value = timeSec;
      if (seed) simMat.uniforms.sd.value.set(seed[0], seed[1], seed[2]);
      else simMat.uniforms.sd.value.set(0, 0, 0);
      var n, src;
      for (n = 0; n < steps; n++) {
        src = (n === 0 && simMat.uniforms.s.value === seedTex && rtCur === 0 && !rts[0].__warmed)
          ? seedTex
          : rts[rtCur].texture;
        simMat.uniforms.s.value = src;
        renderer.setRenderTarget(rts[1 - rtCur]);
        renderer.render(simScene, simCam);
        rtCur = 1 - rtCur;
        if (n === 0) rts[0].__warmed = true;
        simMat.uniforms.sd.value.set(0, 0, 0);
      }
      renderer.setRenderTarget(null);
      renderer.toneMapping = prevTM;
      renderer.outputColorSpace = prevCS;
    }
    stepGS(0, narrow.matches ? 420 : 560);
    nextSeedAt = performance.now() + 1600;

    // Clear glass: near-zero body, bright fresnel, sharp studio-window speculars (premultiplied so the rim is not a dark stroke)
    var glassMat = new THREE.ShaderMaterial({
      vertexShader: [
        'attribute float groove;',
        'varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vG;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position,1.0);',
        '  vW = w.xyz;',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  vV = cameraPosition - w.xyz;',
        '  vG = groove;',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vG;',
        'float windowSpec(vec3 R, vec3 L, vec2 sz, float sharp){',
        '  vec3 up = abs(L.y) < 0.95 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);',
        '  vec3 tu = normalize(cross(up, L));',
        '  vec3 tv = cross(L, tu);',
        '  float du = dot(R, tu) / max(sz.x, 1e-4);',
        '  float dv = dot(R, tv) / max(sz.y, 1e-4);',
        '  float along = max(0.0, dot(R, L));',
        '  return exp(-du*du*sharp) * exp(-dv*dv*sharp*1.35) * along;',
        '}',
        'void main(){',
        '  vec3 N = normalize(vN);',
        '  vec3 V = normalize(vV);',
        '  float g = smoothstep(0.12, 0.78, vG);',
        '  float fres = pow(1.0 - abs(dot(N, V)), 2.9);',
        '  fres = min(1.0, fres + g * 0.50);',
        '  vec3 R = reflect(-V, N);',
        '  vec3 spec = vec3(0.0);',
        '  spec += vec3(1.00, 0.98, 0.95) * windowSpec(R, normalize(vec3(-0.55, 0.78, 0.32)), vec2(0.16, 0.40), 8.0) * 0.85;',
        '  spec += vec3(0.70, 0.84, 1.00) * windowSpec(R, normalize(vec3(0.72, 0.18, 0.28)), vec2(0.14, 0.30), 8.0) * 0.40;',
        '  spec += vec3(1.00, 0.96, 0.90) * windowSpec(R, normalize(vec3(0.05, 0.96, 0.15)), vec2(0.50, 0.10), 10.0) * 0.32;',
        '  vec3 chroma = vec3(1.0, 0.22, 0.16) * pow(fres, 3.6) * 0.16 + vec3(0.18, 0.40, 1.0) * pow(fres, 3.0) * 0.20;',
        '  if (min(chroma.r, chroma.b) > chroma.g) {',
        '    if (chroma.r >= chroma.b) chroma.b = chroma.g; else chroma.r = chroma.g;',
        '  }',
        '  // premultiplied luminous rim (do not multiply the rim by alpha again — that made a black stroke)',
        '  float a = fres * 0.62 + min(0.55, length(spec) * 0.45);',
        '  vec3 col = vec3(0.93, 0.96, 1.0) * fres * 1.15 + chroma * fres + spec;',
        '  // Readable fold lines: bright rim in the valleys, hemisphere-tinted neon off the midline (no magenta mix).',
        '  vec3 gcol = vec3(0.93, 0.96, 1.0);',
        '  if (vW.x < -0.10) gcol = vec3(1.00, 0.122, 0.239);',
        '  else if (vW.x > 0.10) gcol = vec3(0.10, 0.36, 1.00);',
        '  col += gcol * g * 0.70;',
        '  a = min(a + g * 0.20, 0.82);',
        '  gl_FragColor = vec4(col, clamp(a, 0.0, 0.78));',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    var glassF = new THREE.Mesh(shellGeo, glassMat);
    glassF.renderOrder = 6;
    group.add(glassF);

    // Inner neon fluid: organic Gray-Scott ribbons, additive, transparent gaps, clearly inset
    var fluidVert = [
      'varying vec3 vW; varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  vec4 w = modelMatrix * vec4(position,1.0);',
      '  vW = w.xyz;',
      '  vN = normalize(mat3(modelMatrix) * normal);',
      '  vV = cameraPosition - w.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * w;',
      '}'
    ].join('\n');
    var fluidFrag = [
      'precision highp float;',
      'varying vec3 vW; varying vec3 vN; varying vec3 vV;',
      'uniform sampler2D uMap;',
      'uniform float uTime, uLayer, uGain, uSoft;',
      'vec3 ramp(float x){',
      '  x = clamp(x, 0.0, 1.0);',
      '  vec3 C0=vec3(1.00,0.122,0.239);',
      '  vec3 C1=vec3(1.00,0.07,0.12);',
      '  vec3 C2=vec3(0.62,0.02,0.06);',
      '  vec3 C3=vec3(0.0);',
      '  vec3 C4=vec3(0.0);',
      '  vec3 C5=vec3(0.04,0.28,1.00);',
      '  vec3 C6=vec3(0.10,0.38,1.00);',
      '  vec3 C7=vec3(0.14,0.46,1.00);',
      '  float s0=0.0,s1=0.12,s2=0.24,s3=0.34,s4=0.62,s5=0.72,s6=0.86,s7=1.0;',
      '  vec3 a,b; float t,y1,y0;',
      '  if (x < s1) { a=C0; b=C1; y0=s0; y1=s1; }',
      '  else if (x < s2) { a=C1; b=C2; y0=s1; y1=s2; }',
      '  else if (x < s3) { a=C2; b=C3; y0=s2; y1=s3; }',
      '  else if (x < s4) { a=C3; b=C4; y0=s3; y1=s4; }',
      '  else if (x < s5) { a=C4; b=C5; y0=s4; y1=s5; }',
      '  else if (x < s6) { a=C5; b=C6; y0=s5; y1=s6; }',
      '  else { a=C6; b=C7; y0=s6; y1=s7; }',
      '  t = (x - y0) / max(y1 - y0, 1e-5);',
      '  return mix(a, b, t);',
      '}',
      'float sampleB(vec3 p, vec3 n){',
      '  vec3 an = abs(n);',
      '  an /= (an.x + an.y + an.z + 1e-5);',
      '  return texture2D(uMap, p.yz).g * an.x + texture2D(uMap, p.xz).g * an.y + texture2D(uMap, p.xy).g * an.z;',
      '}',
      'void main(){',
      '  vec3 N = normalize(vN);',
      '  vec3 V = normalize(vV);',
      '  vec3 p = vW * mix(1.05, 1.55, uLayer) + vec3(uLayer * 0.19, uLayer * -0.13, 0.07);',
      '  p += 0.035 * vec3(sin(uTime*0.05), cos(uTime*0.04), sin(uTime*0.03));',
      '  float b = sampleB(p, N);',
      '  if (uSoft > 0.5) {',
      '    b = 0.50 * b',
      '      + 0.17 * sampleB(p + vec3(0.03, 0.0, 0.0), N)',
      '      + 0.17 * sampleB(p + vec3(0.0, 0.03, 0.0), N)',
      '      + 0.16 * sampleB(p + vec3(0.0, 0.0, 0.03), N);',
      '  }',
      '  float lum = smoothstep(uSoft > 0.5 ? 0.06 : 0.11, uSoft > 0.5 ? 0.30 : 0.38, b);',
      '  float hh = fract(b * 3.2 + uTime * 0.02 + p.x * 0.55 + p.y * 0.35 + 0.08 * sin(p.y * 5.0 + uTime * 0.3));',
      '  float u = 1.0 - abs(2.0 * hh - 1.0);',
      '  vec3 col = ramp(u);',
      '  if (min(col.r, col.b) > col.g) {',
      '    if (col.r >= col.b) col.b = col.g; else col.r = col.g;',
      '  }',
      '  float isRed = smoothstep(0.0, 0.10, col.r - max(col.g, col.b));',
      '  col *= mix(1.0, 1.15, isRed);',
      '  float facing = abs(dot(N, V));',
      '  float inten = lum * uGain * mix(0.50, 1.0, facing);',
      '  gl_FragColor = vec4(col * inten, inten);',
      '}'
    ].join('\n');

    function makeFluidMat(layer, gain, soft) {
      return new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: rts[rtCur].texture },
          uTime: { value: 0 },
          uLayer: { value: layer },
          uGain: { value: gain },
          uSoft: { value: soft ? 1 : 0 }
        },
        vertexShader: fluidVert,
        fragmentShader: fluidFrag,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
    }
    var fluidMats = [];
    var fluidSpecs = [
      { inset: 0.09, layer: 0.15, gain: 0.70, soft: false, order: 2 },
      { inset: 0.18, layer: 0.50, gain: 0.58, soft: false, order: 3 },
      { inset: 0.28, layer: 0.85, gain: 0.50, soft: false, order: 4 },
      { inset: 0.07, layer: 0.05, gain: 0.14, soft: true,  order: 1 }
    ];
    fluidSpecs.forEach(function (spec) {
      var mat = makeFluidMat(spec.layer, spec.gain, spec.soft);
      var mesh = new THREE.Mesh(insetGeo(shellGeo, spec.inset), mat);
      mesh.renderOrder = spec.order;
      group.add(mesh);
      fluidMats.push(mat);
    });

        // gold neuron markers
    var markers = [];
    var goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, metalness: 0.85, roughness: 0.28, emissive: 0x3a2a05, emissiveIntensity: 0.35
    });
    var coreGeo = new THREE.SphereGeometry(0.042, 16, 12);
    var ringGeo = new THREE.TorusGeometry(0.078, 0.012, 10, 28);
    var haloGeo = new THREE.SphereGeometry(0.12, 12, 10);
    REGIONS.forEach(function (r) {
      var s = snapToSurface(r.pos);
      // sit just outside the glass
      var lift = 0.085;
      var px = s.x + s.nx * lift, py = s.y + s.ny * lift, pz = s.z + s.nz * lift;
      var g = new THREE.Group();
      g.position.set(px, py, pz);
      var core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
        color: COLORS[r.id] || 0xd4af37, metalness: 0.35, roughness: 0.35,
        emissive: new THREE.Color(COLORS[r.id] || '#d4af37'), emissiveIntensity: 0.55
      }));
      var ring = new THREE.Mesh(ringGeo, goldMat);
      var halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
        color: COLORS[r.id] || 0xd4af37, transparent: true, opacity: 0.16,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s.nx, s.ny, s.nz).normalize());
      g.add(halo); g.add(ring); g.add(core);
      g.userData.region = r.id;
      g.renderOrder = 6;
      group.add(g);
      markers.push({ region: r.id, group: g, local: new THREE.Vector3(px, py, pz), nx: s.nx, ny: s.ny, nz: s.nz, def: r });
    });

    // HTML hotspots (tappable, track the mesh)
    hotspots.innerHTML = '';
    markers.forEach(function (m) {
      var a = document.createElement('a');
      a.className = 'node brain3d-node';
      a.href = '#' + m.region;
      a.dataset.region = m.region;
      a.setAttribute('aria-label', m.def.label + ': go to this section (focus or hover shows a preview)');
      a.setAttribute('aria-expanded', 'false');
      a.setAttribute('aria-controls', 'cell');
      a.innerHTML = '<span class="node-ring" aria-hidden="true"></span><span class="node-label"><span class="nl-main">' +
        m.def.label.replace(/&/g, '&amp;') + '</span><span class="nl-sub">' + m.def.sub + '</span></span>';
      a.style.textAnchor = m.def.anchor;
      a.dataset.anchor = m.def.anchor;
      hotspots.appendChild(a);
      m.el = a;
      a.addEventListener('click', function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button > 0) return;
        ev.preventDefault();
        if (dragging && dragMoved) return;
        if (window.BH_close) window.BH_close(false);
        if (window.BH_fireAndGo) window.BH_fireAndGo(m.region);
        else if (window.BH_go) window.BH_go(m.region);
      });
      a.addEventListener('pointerenter', function (ev) {
        setHoverLock(m.region);
        m.parked = true;
        if (window.BH_hoverEnter) window.BH_hoverEnter(m.region, ev.pointerType);
        else if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.BH_open) {
          window.BH_open(m.region, { pinned: false });
        }
      });
      a.addEventListener('pointerleave', function () {
        clearHoverLock();
        if (window.BH_hoverLeave) window.BH_hoverLeave();
      });
      a.addEventListener('focus', function () {
        setHoverLock(m.region);
        if (window.BH_open) window.BH_open(m.region, { pinned: false });
      });
    });

    // ---------- interaction ----------
    var rotY = 1.28, rotX = 0.14;
    var auto = 0, resumeAt = 0;
    var dragging = false, dragMoved = false, lastPX = 0, lastPY = 0, lastT = 0;
    var hoverLock = null, hoverClearT = 0;
    function setHoverLock(r) { clearTimeout(hoverClearT); hoverLock = r; }
    function clearHoverLock() {
      clearTimeout(hoverClearT);
      hoverClearT = setTimeout(function () { hoverLock = null; }, 280);
    }
    var parX = 0, parY = 0, tgtParX = 0, tgtParY = 0;
    var tiltOn = false, tiltX = 0, tiltY = 0;
    var world = new THREE.Vector3();
    var tmpN = new THREE.Vector3();

    var camDist = 3.8, lookY = -0.12;
    function setSize() {
      var w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!shellGeo.boundingSphere) shellGeo.computeBoundingSphere();
      var R = shellGeo.boundingSphere.radius * group.scale.x;
      var fill = 0.74; // moderate hero size — not looming
      var half = Math.tan((camera.fov * Math.PI / 180) * 0.5) * Math.min(1, camera.aspect);
      camDist = R / (fill * half);
      lookY = shellGeo.boundingSphere.center.y * group.scale.y + group.position.y;
    }
    setSize();
    window.addEventListener('resize', function () { setSize(); });
    if (narrow.addEventListener) narrow.addEventListener('change', function () { setSize(); });
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { setSize(); }).observe(wrap);
    }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true; dragMoved = false;
      lastPX = e.clientX; lastPY = e.clientY; lastT = performance.now();
      resumeAt = Infinity;
      wrap.classList.add('is-dragging');
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      enableTiltOnGesture();
    }
    function onMove(e) {
      if (dragging) {
        var dx = e.clientX - lastPX, dy = e.clientY - lastPY;
        if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
        rotY += dx * 0.0055;
        rotX += dy * 0.004;
        rotX = Math.max(-0.55, Math.min(0.7, rotX));
        lastPX = e.clientX; lastPY = e.clientY;
      }
      if (e.pointerType === 'mouse') {
        var r = wrap.getBoundingClientRect();
        tgtParX = ((e.clientX - r.left) / r.width - 0.5) * 2;
        tgtParY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      resumeAt = performance.now() + 1400;
      wrap.classList.remove('is-dragging');
      try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    wrap.addEventListener('pointerleave', function () { tgtParX = tgtParY = 0; });

    function enableTiltOnGesture() {
      if (tiltOn) return;
      tiltOn = true;
      function bind() {
        window.addEventListener('deviceorientation', function (ev) {
          if (ev.beta == null || ev.gamma == null) return;
          tiltY = Math.max(-1, Math.min(1, ev.gamma / 25));
          tiltX = Math.max(-1, Math.min(1, (ev.beta - 45) / 30));
        });
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') bind(); }).catch(function () {});
      } else {
        bind();
      }
    }

    // ---------- loop ----------
    var raf = 0, last = performance.now(), visible = true, home = true;
    var v = new THREE.Vector3();

    function projectHotspots() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      group.updateWorldMatrix(true, true);
      markers.forEach(function (m) {
        // Keep the hovered hotspot parked under the cursor so idle motion
        // cannot flicker pointerenter/leave and restart the preview bubble.
        if (hoverLock === m.region && m.parked) {
          return;
        }
        world.copy(m.local);
        group.localToWorld(world);
        v.copy(world).project(camera);
        var x = (v.x * 0.5 + 0.5) * w;
        var y = (-v.y * 0.5 + 0.5) * h;
        tmpN.set(m.nx, m.ny, m.nz).transformDirection(group.matrixWorld);
        var toCam = camera.position.clone().sub(world).normalize();
        var face = tmpN.dot(toCam);
        var wasFront = !m.el.classList.contains('is-back');
        var front = (wasFront ? face > -0.10 : face > 0.12) && v.z < 1;
        var tx = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        if (m.el.style.transform !== tx) m.el.style.transform = tx;
        m.el.classList.toggle('is-back', !front);
        m.el.dataset.anchor = m.def.anchor;
        var z = (front ? 240 : 40) + Math.round((1 - v.z) * 80);
        if (hoverLock === m.region) z += 200;
        m.el.style.zIndex = String(z);
        m.ndcZ = v.z;
        if (hoverLock === m.region) m.parked = true;
        else m.parked = false;
      });
      resolveLabelCollisions();
    }

    function boxesOverlap(a, b, pad) {
      return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x &&
             a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
    }

    function resolveLabelCollisions() {
      var vis = [];
      markers.forEach(function (m) {
        m.el.classList.remove('is-occluded');
        if (m.el.classList.contains('is-back')) return;
        var lab = m.el.querySelector('.node-label');
        if (!lab) return;
        vis.push({ m: m, r: lab.getBoundingClientRect(), z: m.ndcZ });
      });
      vis.sort(function (a, b) { return a.z - b.z; });
      var kept = [];
      vis.forEach(function (item) {
        var hit = kept.some(function (k) { return boxesOverlap(k.r, item.r, 10); });
        if (hit) item.m.el.classList.add('is-occluded');
        else kept.push(item);
      });
    }

    function frame(now) {
      raf = 0;
      var dt = Math.min(50, now - last) / 1000; last = now;
      if (home && visible && !document.hidden) {
        if (now > resumeAt && !dragging && !hoverLock) auto += dt;
        else auto += dt * 0.15;
        if (!hoverLock) {
          rotY += dt * 0.22 * (now > resumeAt && !dragging ? 1 : 0.2);
        }
        group.rotation.y = rotY + tiltY * 0.18;
        group.rotation.x = rotX + tiltX * 0.12;
        if (!hoverLock) {
          parX += (tgtParX - parX) * 0.08;
          parY += (tgtParY - parY) * 0.08;
        }
        camera.position.set(parX * 0.18, lookY + 0.28 - parY * 0.14, camDist);
        camera.lookAt(0, lookY, 0);
        var t = now * 0.001;
        if (now > nextSeedAt) {
          nextSeedAt = now + 1400 + Math.random() * 1200;
          stepGS(t, narrow.matches ? 6 : 8, [Math.random(), Math.random(), 2.4]);
        } else {
          stepGS(t, narrow.matches ? 6 : 8);
        }
        var fi, fmap = rts[rtCur].texture;
        for (fi = 0; fi < fluidMats.length; fi++) {
          fluidMats[fi].uniforms.uTime.value = t;
          fluidMats[fi].uniforms.uMap.value = fmap;
        }
        renderer.render(scene, camera);
        projectHotspots();
      }
      if (home && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && home && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    document.addEventListener('bh:view', function () {
      home = heroOnScreen();
      if (home) { setSize(); start(); }
      else stop();
    });

    // show the 3D layer, keep the SVG for layout height + reduced-motion fallback
    canvas.hidden = false;
    hotspots.hidden = false;
    svg.setAttribute('aria-hidden', 'true');
    hero.classList.add('has-brain3d');
    document.documentElement.dataset.brain3d = 'on';
    setSize();
    try {
      var gl = renderer.getContext();
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      window.BH_brain3dInfo = {
        webgl2: renderer.capabilities.isWebGL2,
        pr: renderer.getPixelRatio(),
        verts: shellGeo.attributes.position.count,
        shellTris: shellTris,
        coreTris: coreTris,
        fluidLayers: fluidMats.length,
        sim: SIM,
        baked: true,
        meshBytes: meshBuf.byteLength,
        drawnTris: shellTris + coreTris * fluidMats.length,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '',
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
      };
    window.BH_brain3dSetPose = function (y, x) {
      rotY = y;
      if (x != null && x === x) rotX = x;
      hoverLock = null;
      markers.forEach(function (m) { m.parked = false; });
    };
    window.BH_brain3dGetLabels = function () {
      return markers.map(function (m) {
        var lab = m.el.querySelector('.node-label');
        var r = lab ? lab.getBoundingClientRect() : null;
        var back = m.el.classList.contains('is-back');
        var occ = m.el.classList.contains('is-occluded');
        return {
          region: m.region,
          label: m.def.label,
          back: back,
          occluded: occ,
          visible: !back && !occ,
          z: m.ndcZ,
          box: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
        };
      });
    };

    } catch (e) { window.BH_brain3dInfo = { err: String(e) }; }
    start();
  }
})();
