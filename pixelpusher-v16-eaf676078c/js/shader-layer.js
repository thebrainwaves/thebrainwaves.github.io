import * as T from "../vendor/three-selected.js";
import {
  HEADER,
  QUAD_VERTEX,
  SURFACE_VERTEX,
  PARTICLE_VERTEX,
  FRAGMENTS,
} from "./scene-shaders.js";
import { parseShader, modulatedValues } from "./shader-state.js";
export class ShaderLayer {
  constructor({ onError = () => {} } = {}) {
    this.onError = onError;
    this.frames = 0;
    this.quality = 1;
    this.slow = 0;
    this.cooldown = 0;
    this.key = "";
    this.error = "";
    this.failed = false;
  }
  ensure() {
    if (this.renderer) return;
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
      });
    if (!context)
      throw new Error(
        "Shader layer requires WebGL2; existing effects still work.",
      );
    this.renderer = new T.WebGLRenderer({
      canvas,
      context,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.debug.onShaderError = (gl, p, v, f) => {
      this.error =
        gl.getShaderInfoLog(f) ||
        gl.getProgramInfoLog(p) ||
        "Shader compilation failed.";
    };
    this.canvas = canvas;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.failed = true;
      this.onError(
        "Shader graphics context interrupted; effects continue without the layer.",
      );
    });
    canvas.addEventListener("webglcontextrestored", () => {
      this.failed = false;
      this.key = "";
    });
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#050812");
    this.ortho = new T.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.camera = new T.PerspectiveCamera(48, 1, 0.1, 50);
    this.camera.position.z = 4;
    this.output = document.createElement("canvas");
    this.ctx = this.output.getContext("2d", { alpha: false });
    this.texture = new T.Texture();
    this.texture.generateMipmaps = false;
    this.texture.minFilter = this.texture.magFilter;
    this.mediaCanvas = document.createElement("canvas");
    this.mediaCtx = this.mediaCanvas.getContext("2d", { alpha: false });
    this.uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new T.Vector2(360, 640) },
      u_low: { value: 0 },
      u_mid: { value: 0 },
      u_high: { value: 0 },
      u_beat: { value: 0 },
      u_bpm: { value: 120 },
      u_steps: { value: 48 },
      u_source: { value: this.texture },
    };
    this.cache = new Map();
    this.geometry = {
      quad: new T.PlaneGeometry(2, 2),
      plane: new T.PlaneGeometry(3.2, 3.2, 36, 36),
      cube: new T.BoxGeometry(1.7, 1.7, 1.7, 8, 8, 8),
      sphere: new T.SphereGeometry(1.25, 32, 24),
      tunnel: new T.CylinderGeometry(1.7, 1.7, 8, 32, 16, true),
      mesh: new T.PlaneGeometry(3.6, 3.6, 48, 48),
      wireframe: new T.IcosahedronGeometry(1.3, 1),
      wireframe0: new T.IcosahedronGeometry(1.3, 0),
      wireframe2: new T.IcosahedronGeometry(1.3, 2),
    };
    this.geometry.tunnel.rotateX(Math.PI / 2);
    const positions = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const rand = (n) => {
        const x = Math.sin(n * 127.1 + 71.7) * 43758.5453;
        return x - Math.floor(x);
      };
      positions[i * 3] = (rand(i * 3) - 0.5) * 5;
      positions[i * 3 + 1] = (rand(i * 3 + 1) - 0.5) * 7;
      positions[i * 3 + 2] = rand(i * 3 + 2) * 7 - 3.5;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    this.geometry.particles = g;
  }
  validate(code) {
    try {
      parseShader(code);
      this.ensure();
      const gl = this.renderer.getContext(),
        objects = [];
      let program;
      try {
        const make = (type, text) => {
          const s = gl.createShader(type);
          objects.push(s);
          gl.shaderSource(s, text);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(s) || "Shader compile failed.");
          return s;
        };
        const v = make(
          gl.VERTEX_SHADER,
          "#version 300 es\nprecision highp float;out vec2 vUv;out float vHeight;void main(){vUv=vec2(0.);vHeight=0.;gl_Position=vec4(0.,0.,0.,1.);}",
        );
        const f = make(
          gl.FRAGMENT_SHADER,
          "#version 300 es\n#define varying in\n#define texture2D texture\nout highp vec4 ppOutput;\n#define gl_FragColor ppOutput\n" +
            HEADER +
            code,
        );
        program = gl.createProgram();
        gl.attachShader(program, v);
        gl.attachShader(program, f);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(
            gl.getProgramInfoLog(program) || "Shader link failed.",
          );
        return { ok: true, error: "" };
      } finally {
        for (const s of objects) gl.deleteShader(s);
        if (program) gl.deleteProgram(program);
      }
    } catch (e) {
      return { ok: false, error: String(e.message).slice(0, 3000) };
    }
  }
  configure(s) {
    const key =
      s.mode === "mapped"
        ? "mapped:" + s.surface
        : s.scene + (s.scene === "custom" ? ":" + s.fragment : "");
    if (this.key === key) return;
    this.scene.clear();
    let object = this.cache.get(key);
    if (!object) {
      const mapped = s.mode === "mapped",
        points = !mapped && s.scene === "particles",
        quad = !mapped && ["tunnel", "fractal", "custom"].includes(s.scene),
        geometry = this.geometry[mapped ? s.surface : quad ? "quad" : s.scene];
      const fragment = mapped
        ? FRAGMENTS.media
        : s.scene === "custom"
          ? HEADER + s.fragment
          : FRAGMENTS[s.scene];
      const material = new T.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: points
          ? PARTICLE_VERTEX
          : quad
            ? QUAD_VERTEX
            : SURFACE_VERTEX,
        fragmentShader: fragment,
        side: T.DoubleSide,
        wireframe: !mapped && s.scene === "wireframe",
        transparent: points,
        depthWrite: !points,
        ...(points ? { blending: T.AdditiveBlending } : {}),
      });
      object = points
        ? new T.Points(geometry, material)
        : new T.Mesh(geometry, material);
      if (s.scene === "mesh" && !mapped) object.rotation.x = -0.4;
      if (mapped && s.surface === "tunnel") object.position.z = -1;
      this.cache.set(key, object);
      if (this.cache.size > 14) {
        const oldest = [...this.cache.keys()].find((k) =>
          k.startsWith("custom:"),
        );
        if (oldest && oldest !== key) {
          this.cache.get(oldest).material.dispose();
          this.cache.delete(oldest);
        }
      }
    }
    this.scene.add(object);
    this.object = object;
    this.activeCamera =
      s.mode !== "mapped" && ["tunnel", "fractal", "custom"].includes(s.scene)
        ? this.ortho
        : this.camera;
    this.error = "";
    this.renderer.compile(this.scene, this.activeCamera);
    if (this.error) throw new Error(this.error);
    this.key = key;
  }
  render(
    source,
    s,
    time,
    { width = 540, height = 960, bands = {}, frameMs = 16 } = {},
  ) {
    if (!s.enabled || s.intensity === 0 || this.failed) return source;
    try {
      this.ensure();
      if (this.cooldown > 0) this.cooldown--;
      else if (frameMs > 40) {
        if (++this.slow > 20) {
          this.quality = Math.max(0.35, this.quality * 0.75);
          this.slow = 0;
          this.cooldown = 60;
        }
      } else {
        this.slow = 0;
        if (frameMs < 22 && this.frames % 240 === 0)
          this.quality = Math.min(1, this.quality / 0.85);
      }
      const scale = Math.min(1, 540 / Math.min(width, height)) * this.quality,
        bounded =
          Math.max(128, Math.round(Math.min(width, height) * scale)) /
          Math.min(width, height),
        w = Math.round(width * bounded),
        h = Math.round(height * bounded);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.renderer.setSize(w / this.dpr, h / this.dpr, false);
        this.uniforms.u_resolution.value.set(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (this.output.width !== width || this.output.height !== height) {
        this.output.width = width;
        this.output.height = height;
      }
      if (!this.values || this.values.length !== s.values.length)
        this.values = new Float32Array(s.values.length);
      // Retired custom controls must not accumulate after repeated live edits.
      if (this.params !== s.params) {
        const next = new Set(s.params.map((p) => p.uniform));
        for (const name of this.controlNames || [])
          if (!next.has(name)) delete this.uniforms[name];
        this.controlNames = next;
        this.params = s.params;
      }
      modulatedValues(s, time, bands, this.values);
      for (let i = 0; i < s.params.length; i++) {
        const p = s.params[i],
          value = p.min + this.values[i] * (p.max - p.min);
        if (!this.uniforms[p.uniform]) this.uniforms[p.uniform] = { value };
        else this.uniforms[p.uniform].value = value;
      }
      this.uniforms.u_time.value = time;
      for (const [uniform, k] of [
        ["u_low", "low"],
        ["u_mid", "mid"],
        ["u_high", "high"],
        ["u_beat", "beat"],
        ["u_bpm", "bpm"],
      ])
        this.uniforms[uniform].value = bands[k] || (k === "bpm" ? 120 : 0);
      this.uniforms.u_steps.value = Math.round(
        12 + this.quality * (12 + this.values[2] * 24),
      );
      this.geometry.particles.setDrawRange(
        0,
        Math.round(180 + this.quality * this.values[2] * 1320),
      );
      if (
        s.mode === "mapped" ||
        (s.scene === "custom" && /\bu_source\b/.test(s.fragment))
      ) {
        const sw = source.videoWidth || source.naturalWidth || source.width,
          sh = source.videoHeight || source.naturalHeight || source.height;
        if (sw && sh) {
          const ratio = Math.min(1, 1024 / Math.max(sw, sh)),
            mw = Math.max(1, Math.round(sw * ratio)),
            mh = Math.max(1, Math.round(sh * ratio));
          if (this.mediaCanvas.width !== mw || this.mediaCanvas.height !== mh) {
            this.mediaCanvas.width = mw;
            this.mediaCanvas.height = mh;
            // Three uses immutable texture storage: recreate when source dimensions change.
            this.texture.dispose();
            this.texture = new T.Texture(this.mediaCanvas);
            this.texture.generateMipmaps = false;
            this.texture.minFilter = this.texture.magFilter;
            this.uniforms.u_source.value = this.texture;
          }
          this.mediaCtx.drawImage(source, 0, 0, mw, mh);
          this.texture.image = this.mediaCanvas;
          this.texture.needsUpdate = true;
        }
      }
      this.configure(s);
      if (s.scene === "wireframe" && s.mode !== "mapped")
        this.object.geometry =
          this.geometry[
            this.values[2] < 0.34
              ? "wireframe0"
              : this.values[2] > 0.67
                ? "wireframe2"
                : "wireframe"
          ];
      if (this.activeCamera === this.camera) {
        const framed =
          (s.scene === "wireframe" && s.mode !== "mapped") ||
          (s.mode === "mapped" && ["cube", "sphere"].includes(s.surface));
        const fit = framed ? Math.min(1, this.camera.aspect / 0.8) : 1;
        this.object.scale.setScalar((0.65 + this.values[1] * 0.8) * fit);
        this.object.rotation.y =
          this.values[6] * Math.PI * 2 + time * (0.04 + this.values[0] * 0.12);
        if (s.surface !== "tunnel" || s.mode !== "mapped")
          this.object.rotation.z = Math.sin(time * 0.15) * 0.1;
      }
      this.renderer.render(this.scene, this.activeCamera);
      if (this.error) throw new Error(this.error);
      const c = this.ctx;
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.fillStyle = "#050812";
      c.fillRect(0, 0, width, height);
      if (s.mode === "composite" || s.opacity * s.intensity < 1)
        this.cover(source, width, height);
      if (s.mode === "composite") {
        c.globalCompositeOperation = {
          normal: "source-over",
          screen: "screen",
          add: "lighter",
          multiply: "multiply",
          difference: "difference",
        }[s.blend];
      }
      c.globalAlpha = s.opacity * s.intensity;
      c.drawImage(this.canvas, 0, 0, width, height);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      this.frames++;
      return this.output;
    } catch (e) {
      this.failed = true;
      this.onError(String(e.message));
      return source;
    }
  }
  cover(source, w, h) {
    const sw = source.videoWidth || source.naturalWidth || source.width,
      sh = source.videoHeight || source.naturalHeight || source.height;
    if (!sw || !sh) return;
    const scale = Math.max(w / sw, h / sh),
      cw = w / scale,
      ch = h / scale;
    this.ctx.drawImage(
      source,
      (sw - cw) / 2,
      (sh - ch) / 2,
      cw,
      ch,
      0,
      0,
      w,
      h,
    );
  }
  destroy() {
    if (!this.renderer) return;
    for (const o of this.cache.values()) o.material.dispose();
    for (const g of Object.values(this.geometry)) g.dispose();
    this.texture.dispose();
    this.renderer.dispose();
  }
}
