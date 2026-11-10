// UI-only materials. No canvas drawing, network, or animation loop.
export function lowMaterialQuality(previousLow, frameMs, scale) {
  if (frameMs > 34 || scale < 0.85) return true;
  return !!previousLow && (frameMs > 24 || scale < 0.95);
}
let gaugeId = 0;
export function valueGauge(label, variant = "accent") {
  const ns = "http://www.w3.org/2000/svg";
  const make = (name, attrs = {}) => {
    const n = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const node = document.createElement("span");
  node.className = "value-gauge";
  node.dataset.variant = variant;
  node.setAttribute("role", "img");
  const svg = make("svg", { viewBox: "0 0 64 64", "aria-hidden": "true" });
  const defs = make("defs"),
    id = "pp-value-" + ++gaugeId;
  const gradient = make("linearGradient", {
    id,
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
  });
  for (const [offset, color] of [
    ["0%", "#7b5cff"],
    ["100%", "#b04dff"],
  ])
    gradient.append(make("stop", { offset, "stop-color": color }));
  defs.append(gradient);
  const track = make("circle", { cx: 32, cy: 32, r: 25, class: "gauge-track" });
  const arc = make("circle", {
    cx: 32,
    cy: 32,
    r: 25,
    class: "gauge-arc",
    pathLength: 100,
    stroke: "url(#" + id + ")",
    transform: "rotate(-90 32 32)",
  });
  svg.append(defs, track, arc);
  const number = document.createElement("span");
  number.className = "gauge-number";
  node.append(svg, number);
  let previous = -1;
  return {
    node,
    update(value, text = null) {
      const n = Math.round(
        Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100,
      );
      if (n === previous && (!text || text === number.textContent)) return;
      previous = n;
      arc.setAttribute("stroke-dasharray", n + " 100");
      arc.setAttribute("opacity", n === 0 ? "0" : "1");
      number.textContent = text ?? String(n);
      if (node.getAttribute("role") === "slider") {
        node.setAttribute("aria-valuenow", String(value));
        node.setAttribute("aria-valuetext", text ?? n + "%");
      } else node.setAttribute("aria-label", label + " " + n + "%");
      node.title = label + " " + n + "%";
    },
  };
}

export function effectSwitch(label, onToggle) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "effect-switch";
  b.setAttribute("role", "switch");
  b.setAttribute("aria-checked", "false");
  b.setAttribute("aria-label", label);
  b.title = label;
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggle();
  });
  return b;
}

export class PreviewGauges {
  constructor(root, read) {
    this.read = read;
    this.last = 0;
    const output = document.getElementById("output"),
      stage = output.closest(".stage");
    const place = () => {
      const c = output.getBoundingClientRect(),
        s = stage.getBoundingClientRect();
      if (!s.width) return;
      const p = badgeOffsets(s.width, c.left - s.left, c.right - s.left);
      root.style.setProperty("--badge-primary", p.primary + "px");
      root.style.setProperty("--badge-secondary", p.secondary + "px");
    };
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(place);
      this.observer.observe(output);
      this.observer.observe(stage);
    } else window.addEventListener("resize", place);
    queueMicrotask(place);

    this.badges = ["accent", "blue"].map((variant, i) => {
      const n = document.createElement("div");
      n.className =
        "preview-badge preview-badge--" + (i ? "secondary" : "primary");
      const g = valueGauge(i ? "Main parameter" : "Intensity", variant),
        label = document.createElement("span");
      label.className = "preview-badge-label";
      n.append(g.node, label);
      root.append(n);
      return { n, g, label };
    });
  }
  sync(now) {
    if (now - this.last < 100) return;
    this.last = now;
    const s = this.read();
    if (!s) return;
    this.badges[0].g.update(s.intensity);
    const title = s.name + (s.enabled ? "" : " · off");
    if (this.badges[0].label.textContent !== title)
      this.badges[0].label.textContent = title;
    this.badges[1].g.update(s.value);
    if (this.badges[1].label.textContent !== s.param)
      this.badges[1].label.textContent = s.param;
  }
}

export const dialValue = (base, dx, dy) =>
  Math.max(0, Math.min(1, base + dx / 240 - dy / 120));
export function bindRingDial(gauge, input, get, label) {
  const n = gauge.node;
  n.classList.add("param-ring-dial");
  n.setAttribute("role", "slider");
  n.tabIndex = 0;
  n.setAttribute("aria-label", label + " dial");
  n.setAttribute("aria-valuemin", "0");
  n.setAttribute("aria-valuemax", "1");
  n.setAttribute("aria-valuenow", String(get()));
  n.title = "Drag up/down or use arrow keys";
  let drag = null;
  const change = (v) => {
    input.value = String(v * (Number(input.max) || 1));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    n.setAttribute("aria-valuenow", String(get()));
  };
  n.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  n.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    n.focus();
    n.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, value: get() };
  });
  n.addEventListener("pointermove", (e) => {
    if (drag?.id !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    change(dialValue(drag.value, e.clientX - drag.x, e.clientY - drag.y));
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    n.addEventListener(type, (e) => {
      if (drag?.id === e.pointerId) drag = null;
    });
  n.addEventListener("keydown", (e) => {
    let v = get(),
      step = e.shiftKey ? 0.1 : 0.01;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") v += step;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") v -= step;
    else if (e.key === "Home") v = 0;
    else if (e.key === "End") v = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    change(Math.max(0, Math.min(1, v)));
  });
}

export function badgeOffsets(width, left, right) {
  return {
    primary: Math.max(-6, left - 94),
    secondary: Math.max(0, Math.min(width - 100, right - 8)),
  };
}
