import { EFFECTS } from "./effects.js";
import { CATALOG_BY_ID, targetState } from "./effect-catalog.js";
import {
  normalizeShaderState,
  modulatedValues,
  SHADER_SCENES,
} from "./shader-state.js";
export const MAX_GROUP_ROUTES = 96;
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const num = (n, f = 0.5) => (Number.isFinite(n) ? clamp(n) : f);
const ROUTE_INDEX = { macro: 0, x: 1, y: 2 };
const SOURCES = ["none", "lfo", "low", "mid", "high", "beat", "bpm"];
export const GROUP_PARAMS = [
  { name: "Macro", value: 0.5 },
  { name: "Axis X", value: 0.5 },
  { name: "Axis Y", value: 0.5 },
];
const groupId = (id) =>
  typeof id === "string" && /^group:g[1-9]\d{0,8}$/.test(id);
export function normalizeMembers(raw) {
  const members = [];
  let shader = false;
  for (const id of Array.isArray(raw) ? raw.slice(0, 64) : []) {
    const def = CATALOG_BY_ID.get(id);
    if (!def || members.includes(id) || members.length >= 18) continue;
    if (def.kind === "shader") {
      if (shader) continue;
      shader = true;
    }
    members.push(id);
  }
  return members;
}
export function normalizeRoute(r, members) {
  if (!r || !members.includes(r.target)) return null;
  const def = CATALOG_BY_ID.get(r.target);
  let param = r.param;
  if (param !== -1) {
    if (def.kind === "fx") {
      if (!Number.isInteger(param) || param < 0 || param >= def.params.length)
        return null;
    } else if (typeof param !== "string" || !/^u_[a-zA-Z]\w{0,31}$/.test(param))
      return null;
  }
  let min = num(r.min, 0),
    max = num(r.max, 1);
  if (min > max) [min, max] = [max, min];
  return {
    target: r.target,
    param,
    source: ["macro", "x", "y"].includes(r.source) ? r.source : "macro",
    min,
    max,
    invert: r.invert === true,
  };
}
function normalizeGroup(raw) {
  if (!raw || !groupId(raw.id)) return null;
  const members = normalizeMembers(raw.members);
  if (!members.length) return null;
  const routes = [],
    seen = new Set();
  for (const r of Array.isArray(raw.routes) ? raw.routes.slice(0, 192) : []) {
    const n = normalizeRoute(r, members);
    if (!n) continue;
    const key = n.target + ":" + n.param;
    if (seen.has(key) || routes.length >= MAX_GROUP_ROUTES) continue;
    seen.add(key);
    routes.push(n);
  }
  const touch = {
    x: 1,
    y: 2,
    x2: 0,
    y2: -1,
    pinch: 0,
    twist: 1,
    spring: raw.touch?.spring === true,
  };
  for (const k of ["x", "y", "x2", "y2", "pinch", "twist"])
    if (
      Number.isInteger(raw.touch?.[k]) &&
      raw.touch[k] >= -2 &&
      raw.touch[k] < 3
    )
      touch[k] = raw.touch[k];
  return {
    id: raw.id,
    kind: "group",
    name:
      typeof raw.name === "string"
        ? raw.name.trim().slice(0, 32) || "Untitled group"
        : "Untitled group",
    members,
    enabled: raw.enabled === true,
    intensity: num(raw.intensity, 1),
    values: [0, 1, 2].map((i) => num(raw.values?.[i])),
    params: GROUP_PARAMS,
    touch,
    modulations: [0, 1, 2].map((i) => {
      const m = raw.modulations?.[i] || {};
      return {
        source: SOURCES.includes(m.source) ? m.source : "none",
        amount: num(m.amount, 0.3),
        rate: num(m.rate, 0.5),
      };
    }),
    routes,
  };
}
export function normalizeScene(raw, groups) {
  if (
    !raw ||
    typeof raw.effects !== "object" ||
    !raw.effects ||
    Array.isArray(raw.effects)
  )
    return null;
  const effects = {};
  for (const d of EFFECTS) effects[d.id] = raw.effects[d.id] === true;
  const on = {};
  for (const g of groups) on[g.id] = raw.groups?.[g.id] === true;
  return {
    effects,
    shader: {
      enabled: raw.shader?.enabled === true,
      scene: [...SHADER_SCENES, "custom"].includes(raw.shader?.scene)
        ? raw.shader.scene
        : "tunnel",
    },
    groups: on,
  };
}
export function normalizeConsoleState(raw = {}) {
  raw = raw && typeof raw === "object" ? raw : {};
  const groups = [],
    seen = new Set();
  for (const entry of Array.isArray(raw.groups)
    ? raw.groups.slice(0, 40)
    : []) {
    const g = normalizeGroup(entry);
    if (g && !seen.has(g.id) && groups.length < 12) {
      groups.push(g);
      seen.add(g.id);
    }
  }
  const max = groups.reduce((a, g) => Math.max(a, Number(g.id.slice(7))), 0);
  return {
    version: 1,
    nextId: Math.max(
      max + 1,
      Number.isSafeInteger(raw.nextId) && raw.nextId > 0 && raw.nextId < 1e9
        ? raw.nextId
        : 1,
    ),
    groups,
    scenes: [0, 1, 2, 3].map((i) => normalizeScene(raw.scenes?.[i], groups)),
    crossfade: Number.isFinite(raw.crossfade) ? clamp(raw.crossfade, 0, 10) : 0,
    holdMode: raw.holdMode === true,
  };
}
export function createGroup(state, name, rawMembers) {
  if (state.groups.length >= 12)
    throw new Error("12 groups reached. Delete one before adding another.");
  const candidates = [...new Set(Array.isArray(rawMembers) ? rawMembers : [])];
  if (
    candidates.filter((id) => CATALOG_BY_ID.get(id)?.kind === "shader").length >
    1
  )
    throw new Error("Choose only one shader scene per group.");
  const members = normalizeMembers(candidates);
  if (!members.length) throw new Error("Select at least one effect member.");
  if (typeof name !== "string" || !name.trim())
    throw new Error("Name this group first.");
  if (state.nextId >= 1e9) throw new Error("Group ID limit reached.");
  const routes = [];
  for (const target of members) {
    const def = CATALOG_BY_ID.get(target),
      p = (i) => (def.kind === "shader" ? def.params[i].uniform : i);
    routes.push({
      target,
      param: p(0),
      source: "macro",
      min: 0.15,
      max: 0.85,
      invert: false,
    });
    if (def.params.length > 1)
      routes.push({
        target,
        param: p(1),
        source: "x",
        min: 0.1,
        max: 0.9,
        invert: false,
      });
    routes.push({
      target,
      param: -1,
      source: "y",
      min: 0.3,
      max: 1,
      invert: false,
    });
  }
  const g = normalizeGroup({
    id: "group:g" + state.nextId++,
    name,
    members,
    routes,
  });
  state.groups.push(g);
  return g;
}
export function captureScene(model, groups) {
  return normalizeScene(
    {
      effects: Object.fromEntries(model.stack.map((e) => [e.id, e.enabled])),
      shader: model.shader,
      groups: Object.fromEntries(groups.map((g) => [g.id, g.enabled])),
    },
    groups,
  );
}
const copyShader = (s) => normalizeShaderState(JSON.parse(JSON.stringify(s)));
function copyState(dst, src) {
  const values = dst.values || [];
  Object.assign(dst, src);
  dst.values = values;
  values.length = src.values.length;
  for (let i = 0; i < values.length; i++) values[i] = src.values[i];
  return dst;
}
export class ConsoleEngine {
  constructor(raw) {
    this.pool = new Map();
    this.groupValues = new Map();
    this.result = { stack: [], shader: { values: [] } };
    this.stats = { frames: 0, routeWrites: 0 };
    this.shaderSlot = { state: null, gain: 0 };
    this.setState(raw);
  }
  setState(raw) {
    this.state = normalizeConsoleState(raw);
    this.transition = null;
    this.groupValues.clear();
    return this.state;
  }
  cancelTransition() {
    this.transition = null;
  }
  removeGroup(id) {
    this.state.groups = this.state.groups.filter((g) => g.id !== id);
    this.groupValues.delete(id);
    for (const scene of this.state.scenes) if (scene) delete scene.groups[id];
  }
  moveGroup(id, delta) {
    const a = this.state.groups,
      i = a.findIndex((g) => g.id === id),
      j = i + delta;
    if (i >= 0 && j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]];
  }
  progress(now) {
    return this.transition
      ? clamp((now - this.transition.start) / this.transition.duration)
      : 1;
  }
  gain(type, id, on, p) {
    const t = this.transition;
    if (!t) return on ? 1 : 0;
    const from = t.from[type][id] || 0,
      to = t.to[type][id] ? 1 : 0;
    return from + (to - from) * p;
  }
  shaderFrame(model, p) {
    const slot = this.shaderSlot,
      t = this.transition;
    if (!t) {
      slot.state = model.shader;
      slot.gain = model.shader.enabled ? 1 : 0;
      return slot;
    }
    const a = t.fromShader,
      b = model.shader,
      from = t.fromShaderGain,
      to = b.enabled ? 1 : 0;
    if (a.scene !== b.scene && from > 0 && to > 0) {
      slot.state = p < 0.5 ? a : b;
      slot.gain = p < 0.5 ? from * (1 - p * 2) : to * (p * 2 - 1);
    } else {
      slot.state = from > 0 && to === 0 ? a : b;
      slot.gain = from + (to - from) * p;
    }
    return slot;
  }
  recall(scene, model, now) {
    const clean = normalizeScene(scene, this.state.groups);
    if (!clean) return model.shader;
    const p = this.progress(now),
      from = { effects: {}, groups: {} };
    for (const e of model.stack)
      from.effects[e.id] = this.gain("effects", e.id, e.enabled, p);
    for (const g of this.state.groups)
      from.groups[g.id] = this.gain("groups", g.id, g.enabled, p);
    const current = this.shaderFrame(model, p),
      fromShader = copyShader(current.state),
      fromShaderGain = current.gain;
    for (const e of model.stack) e.enabled = !!clean.effects[e.id];
    for (const g of this.state.groups) g.enabled = !!clean.groups[g.id];
    const next = normalizeShaderState({
      ...model.shader,
      enabled: clean.shader.enabled,
      scene: clean.shader.scene,
    });
    this.transition =
      this.state.crossfade > 0
        ? {
            start: now,
            duration: this.state.crossfade * 1000,
            from,
            to: clean,
            fromShader,
            fromShaderGain,
          }
        : null;
    return next;
  }
  compose(model, time, bands = {}, now = time * 1000) {
    let p = this.progress(now);
    if (this.transition && p >= 1) {
      this.transition = null;
      p = 1;
    }
    const result = this.result;
    result.stack.length = model.stack.length;
    for (let i = 0; i < model.stack.length; i++) {
      const src = model.stack[i];
      let out = this.pool.get(src.id);
      if (!out) {
        out = { values: [] };
        this.pool.set(src.id, out);
      }
      copyState(out, src);
      result.stack[i] = out;
    }
    const sh = this.shaderFrame(model, p);
    copyState(result.shader, sh.state);
    this.stats.routeWrites = 0;
    for (const g of this.state.groups) {
      const weight = this.gain("groups", g.id, g.enabled, p) * g.intensity;
      if (weight <= 0) continue;
      let values = this.groupValues.get(g.id);
      if (!values) {
        values = new Float32Array(3);
        this.groupValues.set(g.id, values);
      }
      modulatedValues(g, time, bands, values);
      for (const r of g.routes) {
        const target = targetState(result, r.target);
        if (!target) continue;
        const index =
          r.param === -1
            ? -1
            : typeof r.param === "string"
              ? target.params.findIndex((p) => p.uniform === r.param)
              : r.param;
        if ((index < 0 && r.param !== -1) || index >= target.values.length)
          continue;
        let v = values[ROUTE_INDEX[r.source]];
        if (r.invert) v = 1 - v;
        const mapped = r.min + (r.max - r.min) * v;
        if (index === -1)
          target.intensity += (mapped - target.intensity) * weight;
        else target.values[index] += (mapped - target.values[index]) * weight;
        this.stats.routeWrites++;
      }
    }
    for (let i = 0; i < model.stack.length; i++) {
      const src = model.stack[i],
        out = result.stack[i],
        gain = this.gain("effects", src.id, src.enabled, p);
      out.enabled = gain > 0;
      out.intensity *= gain;
    }
    result.shader.enabled = sh.gain > 0;
    result.shader.intensity *= sh.gain;
    this.stats.frames++;
    return result;
  }
}
