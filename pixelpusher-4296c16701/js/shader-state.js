// Scalar controls are normalized exactly like the effects stack; ranges are presentation/GLSL units.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const SHADER_SCENES = [
  "tunnel",
  "particles",
  "mesh",
  "fractal",
  "wireframe",
];
export const COMMON_PARAMS = [
  ["u_speed", "Speed", 0.35],
  ["u_scale", "Scale", 0.45],
  ["u_detail", "Detail", 0.5],
  ["u_glow", "Glow", 0.55],
  ["u_warp", "Warp", 0.35],
  ["u_palette", "Palette", 0.35],
  ["u_rotation", "Rotation", 0.15],
].map(([uniform, name, value]) => ({ uniform, name, value, min: 0, max: 1 }));
export const STARTERS = [
  {
    name: "Phase rings",
    code: "uniform float u_frequency; // @range 1 24\nuniform float u_depth; // @range 0 1\nvoid main(){vec2 p=vUv-.5;float ring=.5+.5*sin(length(p)*u_frequency*6.0-u_time);vec3 c=ppPalette(floor(ring*3.0));gl_FragColor=vec4(c*pow(ring,3.0)*u_depth,1.0);}",
  },
  {
    name: "Signal grid",
    code: "uniform float u_cells; // @range 3 40\nuniform float u_drift; // @range 0 2\nvoid main(){vec2 p=vUv+vec2(sin(u_time*.2)*u_drift*.05,0.0);vec2 g=abs(fract(p*u_cells)-.5);float line=1.0-smoothstep(.015,.04,min(g.x,g.y));gl_FragColor=vec4(vec3(.008,.012,.03)+ppPalette(1.0)*line*.8,1.0);}",
  },
  {
    name: "Band contours",
    code: "uniform float u_density; // @range 2 30\nuniform float u_bend; // @range 0 3\nvoid main(){float x=vUv.x+sin(vUv.y*8.0+u_time)*u_bend*.03;float s=pow(.5+.5*sin(x*u_density+u_low*4.0),12.0);gl_FragColor=vec4(ppPalette(2.0)*s,1.0);}",
  },
];
const RESERVED = new Set([
  "u_time",
  "u_resolution",
  "u_low",
  "u_mid",
  "u_high",
  "u_beat",
  "u_bpm",
  "u_source",
  "u_steps",
  ...COMMON_PARAMS.map((p) => p.uniform),
]);
export function parseShader(source) {
  if (typeof source !== "string" || source.length > 12000)
    throw new Error("Shader source must be at most 12,000 characters.");
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (!/void\s+main\s*\(/.test(clean)) throw new Error("Provide void main().");
  if (/#|\b(?:while|do)\b|\b(?:sampler\w*|image\w*|buffer)\b/.test(clean))
    throw new Error(
      "Directives, custom samplers and unbounded loops are not supported.",
    );
  const loops = [...clean.matchAll(/\bfor\s*\(([^)]*)\)/g)];
  if (
    loops.length > 1 ||
    loops.some(
      (m) =>
        !/^\s*int\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(?:[1-9]|[1-5]\d|6[0-4])\s*;\s*\1\+\+\s*$/.test(
          m[1],
        ),
    )
  )
    throw new Error(
      "Use at most one constant integer for-loop, starting at 0, with fewer than 65 steps.",
    );
  const tokens = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  const declarations = [...tokens.matchAll(/\buniform\s+(\w+)\s+(\w+)\s*;/g)],
    out = [],
    seen = new Set();
  if (declarations.length !== [...tokens.matchAll(/\buniform\b/g)].length)
    throw new Error(
      "Declare one float uniform per declaration; arrays are not supported.",
    );
  if (declarations.length > 16)
    throw new Error("At most 16 custom scalar uniforms.");
  for (const declaration of declarations) {
    const [, type, uniform] = declaration,
      tail = source
        .slice(declaration.index + declaration[0].length)
        .split("\n", 1)[0];
    if (
      type !== "float" ||
      RESERVED.has(uniform) ||
      !/^u_[a-zA-Z]\w{0,31}$/.test(uniform) ||
      seen.has(uniform)
    )
      throw new Error(
        "Use unique float u_name uniforms; built-in names are reserved.",
      );
    seen.add(uniform);
    const range = tail.match(
        /^\s*\/\/[^\n]*?@range\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/,
      ),
      min = range ? Number(range[1]) : 0,
      max = range ? Number(range[2]) : 1;
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min >= max ||
      Math.abs(min) > 10000 ||
      Math.abs(max) > 10000
    )
      throw new Error("Invalid uniform range.");
    out.push({
      uniform,
      name: uniform
        .slice(2)
        .replace(/_/g, " ")
        .replace(/^./, (s) => s.toUpperCase()),
      min,
      max,
      value: 0.5,
    });
  }
  return out;
}
export function normalizeShaderState(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  let scene = [...SHADER_SCENES, "custom"].includes(raw.scene)
      ? raw.scene
      : "tunnel",
    fragment =
      typeof raw.fragment === "string" ? raw.fragment : STARTERS[0].code,
    custom = [];
  try {
    custom = parseShader(fragment);
  } catch {
    fragment = STARTERS[0].code;
    custom = parseShader(fragment);
    if (scene === "custom") scene = "tunnel";
  }
  const params = [
      ...COMMON_PARAMS.map((p) => ({ ...p })),
      ...(scene === "custom" ? custom : []),
    ],
    n = params.length;
  const s = {
    id: "shader",
    params,
    enabled: raw.enabled === true,
    scene,
    fragment,
    mode: ["background", "composite", "mapped"].includes(raw.mode)
      ? raw.mode
      : "background",
    surface: ["plane", "cube", "sphere", "tunnel"].includes(raw.surface)
      ? raw.surface
      : "plane",
    blend: ["normal", "screen", "add", "multiply", "difference"].includes(
      raw.blend,
    )
      ? raw.blend
      : "screen",
    opacity: Number.isFinite(raw.opacity) ? clamp(raw.opacity) : 0.8,
    intensity: Number.isFinite(raw.intensity) ? clamp(raw.intensity) : 1,
    values: params.map((p, i) =>
      Number.isFinite(raw.values?.[i]) ? clamp(raw.values[i]) : p.value,
    ),
    touch: {
      x: 1,
      y: 4,
      x2: 3,
      y2: 6,
      pinch: 1,
      twist: 6,
      spring: raw.touch?.spring === true,
    },
    modulations: params.map((p, i) => {
      const m = raw.modulations?.[i] || {};
      return {
        source: ["none", "lfo", "low", "mid", "high", "beat", "bpm"].includes(
          m.source,
        )
          ? m.source
          : "none",
        amount: Number.isFinite(m.amount) ? clamp(m.amount) : 0.3,
        rate: Number.isFinite(m.rate) ? clamp(m.rate) : 0.5,
      };
    }),
  };
  for (const k of ["x", "y", "x2", "y2", "pinch", "twist"])
    if (
      Number.isInteger(raw.touch?.[k]) &&
      raw.touch[k] >= -2 &&
      raw.touch[k] < n
    )
      s.touch[k] = raw.touch[k];
  return s;
}
export function modulatedValues(
  s,
  time,
  { low = 0, mid = 0, high = 0, beat = 0, bpm = 120, phase } = {},
  out = new Float32Array(s.values.length),
) {
  for (let i = 0; i < s.values.length; i++) {
    const m = s.modulations[i];
    let drive = 0;
    if (m?.source === "lfo")
      drive = Math.sin(time * Math.PI * 2 * (0.05 + m.rate * 1.95));
    else if (m?.source === "bpm")
      drive = Math.sin(
        (Number.isFinite(phase) ? phase : (time * bpm) / 60) *
          Math.PI *
          2 *
          (1 + Math.floor(m.rate * 3)),
      );
    else if (m?.source === "beat") drive = beat;
    else if (m?.source === "low") drive = low;
    else if (m?.source === "mid") drive = mid;
    else if (m?.source === "high") drive = high;
    out[i] = clamp(s.values[i] + drive * (m?.amount || 0));
  }
  return out;
}
