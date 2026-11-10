import { EFFECTS } from "./effects.js";
import { COMMON_PARAMS, SHADER_SCENES } from "./shader-state.js";
export const CATEGORIES = [
  "All",
  "Datamosh",
  "Color",
  "Distort",
  "Time",
  "Pixel",
  "Shader",
  "Custom",
  "Groups",
];
const categories = {
  smear: "Datamosh",
  rgb: "Color",
  hue: "Color",
  crush: "Color",
  neon: "Color",
  wave: "Distort",
  kaleido: "Distort",
  chroma: "Distort",
  vhs: "Time",
  trails: "Time",
  slit: "Time",
  beat: "Time",
  sort: "Pixel",
  shuffle: "Pixel",
  glyph: "Pixel",
  jitter: "Pixel",
  lattice: "Custom",
  fold: "Custom",
};
const names = {
  tunnel: "Tunnel",
  particles: "Particle field",
  mesh: "Audio mesh",
  fractal: "Folded fractal",
  wireframe: "Wire geometry",
  custom: "Custom shader",
};
export const CATALOG = [
  ...EFFECTS.map((e) => ({ ...e, kind: "fx", category: categories[e.id] })),
  ...[...SHADER_SCENES, "custom"].map((scene) => ({
    id: "shader:" + scene,
    scene,
    name: names[scene],
    kind: "shader",
    category: scene === "custom" ? "Custom" : "Shader",
    params: COMMON_PARAMS,
  })),
];
export const CATALOG_BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
export function targetState(model, id) {
  const d = CATALOG_BY_ID.get(id);
  if (!d) return null;
  if (d.kind === "fx") return model.stack.find((e) => e.id === id) || null;
  return model.shader.scene === d.scene ? model.shader : null;
}
export function isTargetOn(model, id) {
  const e = targetState(model, id);
  return !!e?.enabled;
}
