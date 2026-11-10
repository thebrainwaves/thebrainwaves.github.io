import {
  normalizeShaderState,
  STARTERS,
  SHADER_SCENES,
} from "./shader-state.js";
import { ShaderLayer } from "./shader-layer.js";
import { bindXY } from "./touch.js";
const STORAGE = "brainhertz.pixelpusher.shaders.v1";
const label = (s) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
function node(tag, attrs = {}, text = "") {
  const n = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") n.className = value;
    else n.setAttribute(key, value);
  }
  n.textContent = text;
  return n;
}
function select(id, values, current) {
  const n = node("select", { id });
  for (const value of values) {
    const [v, name] = Array.isArray(value) ? value : [value, label(value)];
    const o = node("option", { value: v }, name);
    n.append(o);
  }
  n.value = current;
  return n;
}
export class ShaderUI {
  constructor(root, { onChange = () => {}, onTarget = () => {} } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.onTarget = onTarget;
    this.state = normalizeShaderState();
    this.lastGood = this.state.fragment;
    this.layer = new ShaderLayer({ onError: (e) => this.error(e) });
    this.library = [];
    try {
      const raw = localStorage.getItem(STORAGE) || "[]";
      if (raw.length <= 600000) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved))
          this.library = saved
            .slice(-20)
            .filter(
              (s) =>
                typeof s.name === "string" &&
                typeof s.code === "string" &&
                s.code.length <= 12000,
            )
            .map((s) => ({ name: s.name.slice(0, 40), code: s.code }));
      }
    } catch {
      /* Corrupt or denied local storage must not stop the camera. */
    }
    this.render();
  }
  error(message) {
    const box = this.root.querySelector("#shader-error");
    if (box) box.textContent = message || "";
  }
  changed() {
    this.onChange();
    this.sync();
  }
  setState(value) {
    let message = "";
    let next = normalizeShaderState(value);
    if (next.scene === "custom") {
      const result = this.layer.validate(next.fragment);
      if (!result.ok) {
        next = normalizeShaderState({ ...next, fragment: this.lastGood });
        message = result.error;
      } else this.lastGood = next.fragment;
    }
    this.state = next;
    this.layer.failed = false;
    this.render();
    this.error(message);
    this.onChange();
  }
  compile(code) {
    const result = this.layer.validate(code);
    if (!result.ok) {
      this.error(result.error);
      return false;
    }
    this.lastGood = code;
    this.state = normalizeShaderState({
      ...this.state,
      scene: "custom",
      fragment: code,
    });
    this.layer.failed = false;
    this.render();
    this.error("Compiled on this device.");
    this.onChange();
    return true;
  }
  render() {
    this.unbind?.();
    const s = this.state,
      r = this.root;
    r.replaceChildren();
    r.append(
      node("h2", {}, "Shader layer"),
      node(
        "p",
        { class: "fine" },
        "Local 3D · enters the effects chain and recording. WebGL2 required. Mapped mode replaces the scene with the video surface.",
      ),
    );
    const enabled = node("label", { class: "toggle" }),
      check = node("input", { id: "shader-enabled", type: "checkbox" });
    check.checked = s.enabled;
    check.onchange = () => {
      s.enabled = check.checked;
      this.layer.failed = false;
      this.changed();
    };
    enabled.append(check, document.createTextNode(" Enable Shader layer"));
    r.append(enabled);
    const row = (name, control) => {
      const l = node("label", { class: "field" }, name);
      l.append(control);
      r.append(l);
    };
    const scene = select(
      "shader-scene",
      [
        ...SHADER_SCENES.map((v) => [
          v,
          {
            particles: "Particle field",
            mesh: "Audio-displaced mesh",
            fractal: "Raymarched fractal",
            wireframe: "Neon wireframe",
          }[v] || label(v),
        ]),
        ["custom", "Custom GLSL"],
      ],
      s.scene,
    );
    scene.onchange = () => this.setState({ ...s, scene: scene.value });
    row("Scene", scene);
    for (const [key, name, values] of [
      [
        "mode",
        "Mode",
        [
          ["background", "Background"],
          ["composite", "Composite with video"],
          ["mapped", "Video on 3D surfaces"],
        ],
      ],
      [
        "surface",
        "Mapped surface",
        [
          ["plane", "Plane warp"],
          ["cube", "Cube"],
          ["sphere", "Sphere"],
          ["tunnel", "Tunnel walls"],
        ],
      ],
      ["blend", "Blend", ["normal", "screen", "add", "multiply", "difference"]],
    ]) {
      const control = select(`shader-${key}`, values, s[key]);
      control.onchange = () => {
        s[key] = control.value;
        this.changed();
      };
      row(name, control);
    }
    const range = (
      id,
      name,
      value,
      callback,
      min = 0,
      max = 1,
      step = 0.01,
    ) => {
      const l = node("label", { class: "param" }, name),
        o = node("output", {}, Number(value).toFixed(2)),
        input = node("input", { id, type: "range", min, max, step, value });
      input.oninput = () => {
        o.value = Number(input.value).toFixed(2);
        callback(Number(input.value));
      };
      l.append(o, input);
      r.append(l);
      return input;
    };
    range("shader-opacity", "Layer opacity", s.opacity, (v) => {
      s.opacity = v;
      this.changed();
    });
    range("shader-intensity", "Intensity", s.intensity, (v) => {
      s.intensity = v;
      this.changed();
    });
    r.append(
      node(
        "p",
        { class: "fine" },
        "Animated patterns and BPM routes may flash. Motion routes add to each base value. Low / Mid / High follow the audio analyser; Beat follows onsets; BPM follows tap tempo.",
      ),
    );
    s.params.forEach((p, i) => {
      range(
        `shader-param-${i}`,
        p.name,
        p.min + s.values[i] * (p.max - p.min),
        (v) => {
          s.values[i] = (v - p.min) / (p.max - p.min);
          this.changed();
        },
        p.min,
        p.max,
        (p.max - p.min) / 100,
      );
      const d = node("details", { class: "shader-mod" }),
        summary = node("summary", {}, `${p.name} modulation`);
      d.append(summary);
      const m = s.modulations[i],
        sources = select(
          `shader-mod-${i}`,
          [
            ["none", "Off"],
            ["lfo", "LFO"],
            ["low", "Low band"],
            ["mid", "Mid band"],
            ["high", "High band"],
            ["beat", "Onset / Beat"],
            ["bpm", "BPM pulse"],
          ],
          m.source,
        );
      sources.onchange = () => {
        m.source = sources.value;
        this.changed();
      };
      d.append(sources);
      for (const [key, name] of [
        ["amount", "Amount"],
        ["rate", "LFO rate / BPM division"],
      ]) {
        const l = node("label", {}, name),
          input = node("input", {
            id: `shader-${key}-${i}`,
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: m[key],
          });
        input.oninput = () => {
          m[key] = Number(input.value);
          this.changed();
        };
        l.append(input);
        d.append(l);
      }
      r.append(d);
    });
    const xy = node("div", {
      class: "xy-pad shader-xy",
      id: "shader-xy",
      tabindex: 0,
      role: "group",
      "aria-label": "Shader XY touch pad",
    });
    xy.append(node("span", {}, "SHADER XY"), node("i", { class: "xy-dot" }));
    r.append(xy);
    this.unbind = bindXY(xy, s, () => this.changed());
    const target = node(
      "button",
      { id: "shader-target", type: "button" },
      "Control Shader on picture",
    );
    target.onclick = () => {
      this.onTarget();
      target.textContent = "Picture targets Shader";
    };
    r.append(target);
    const touch = node("details", { class: "touch-mapping" });
    touch.append(
      node("summary", {}, "Touch mapping · fingers, pinch and twist"),
    );
    const options = [
      [-2, "Unassigned"],
      [-1, "Intensity"],
      ...s.params.map((p, i) => [i, p.name]),
    ];
    for (const [key, name] of [
      ["x", "Finger 1 X"],
      ["y", "Finger 1 Y"],
      ["x2", "Finger 2 X"],
      ["y2", "Finger 2 Y"],
      ["pinch", "Pinch"],
      ["twist", "Twist"],
    ]) {
      const l = node("label", {}, name),
        control = select(`shader-touch-${key}`, options, s.touch[key]);
      control.onchange = () => {
        s.touch[key] = Number(control.value);
        this.changed();
      };
      l.append(control);
      touch.append(l);
    }
    const spring = node("label", {}),
      springInput = node("input", { id: "shader-spring", type: "checkbox" });
    springInput.checked = s.touch.spring;
    springInput.onchange = () => {
      s.touch.spring = springInput.checked;
    };
    spring.append(
      springInput,
      document.createTextNode(" Spring to base on release"),
    );
    touch.append(spring);
    r.append(touch);
    const editor = node("details", { id: "shader-editor" });
    editor.append(node("summary", {}, "Custom GLSL editor · device only"));
    editor.append(
      node(
        "p",
        { class: "fine" },
        "Use gl_FragColor, vUv and float controls: uniform float u_x; // @range 0 1. System inputs: u_time, u_resolution, u_low, u_mid, u_high, u_beat, u_bpm, u_steps (adaptive) and u_source. Common controls remain available. Limit: 12 KB, 16 custom controls, one constant loop up to 64 iterations. No directives or custom textures.",
      ),
    );
    const templates = select(
        "shader-template",
        STARTERS.map((t, i) => [i, t.name]),
        0,
      ),
      load = node(
        "button",
        { type: "button", id: "shader-load-template" },
        "Load starter",
      ),
      code = node("textarea", {
        id: "shader-code",
        maxlength: 12000,
        spellcheck: "false",
        "aria-label": "Custom fragment shader",
        rows: 12,
      });
    code.value = s.fragment;
    load.onclick = () => {
      code.value = STARTERS[Number(templates.value)].code;
    };
    const compile = node(
      "button",
      { type: "button", id: "shader-compile" },
      "Compile & apply",
    );
    compile.onclick = () => this.compile(code.value);
    editor.append(templates, load, code, compile);
    const name = node("input", {
        id: "shader-save-name",
        maxlength: 40,
        placeholder: "Custom shader name",
        "aria-label": "Custom shader name",
      }),
      save = node(
        "button",
        { type: "button", id: "shader-save" },
        "Save custom shader",
      ),
      saved = select(
        "shader-saved",
        this.library.map((t, i) => [i, t.name]),
        0,
      ),
      restore = node(
        "button",
        { type: "button", id: "shader-load-saved" },
        "Load saved shader",
      );
    save.onclick = () => {
      const title = name.value.trim();
      if (!title) {
        this.error("Name this shader first.");
        return;
      }
      if (!this.compile(code.value)) return;
      this.library = this.library.filter((t) => t.name !== title);
      this.library.push({ name: title, code: this.lastGood });
      this.library = this.library.slice(-20);
      try {
        localStorage.setItem(STORAGE, JSON.stringify(this.library));
        this.render();
        this.error("Custom shader saved on this device.");
      } catch {
        this.error("Storage unavailable or full; shader is still active.");
      }
    };
    restore.onclick = () => {
      const savedCode = this.library[Number(saved.value)]?.code;
      if (savedCode) this.compile(savedCode);
    };
    editor.append(name, save, saved, restore);
    r.append(
      editor,
      node("p", { id: "shader-error", role: "status", class: "fine" }),
      node("p", { id: "shader-quality", class: "fine" }),
    );
    this.sync();
  }
  sync() {
    const s = this.state;
    for (let i = 0; i < s.values.length; i++) {
      const input = this.root.querySelector(`#shader-param-${i}`);
      if (input) {
        const p = s.params[i];
        input.value = p.min + s.values[i] * (p.max - p.min);
        input.previousElementSibling.value = Number(input.value).toFixed(2);
      }
    }
    const intensity = this.root.querySelector("#shader-intensity");
    if (intensity) {
      intensity.value = s.intensity;
      intensity.previousElementSibling.value = s.intensity.toFixed(2);
    }
    const dot = this.root.querySelector(".xy-dot");
    if (dot) {
      const value = (index) =>
        index === -1 ? s.intensity : index >= 0 ? s.values[index] : 0.5;
      dot.style.left = `${value(s.touch.x) * 100}%`;
      dot.style.top = `${(1 - value(s.touch.y)) * 100}%`;
    }
  }
  status() {
    const l = this.layer,
      box = this.root.querySelector("#shader-quality");
    if (box)
      box.textContent = l.frames
        ? `Shader ${l.canvas.width}×${l.canvas.height} · quality ${Math.round(l.quality * 100)}% · DPR ≤1.5 · ${this.state.enabled ? "active" : "paused"}`
        : "Shader paused · no GPU work while off";
  }
}
