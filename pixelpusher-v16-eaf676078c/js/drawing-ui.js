import {
  normalizeDrawing,
  hsvToHex,
  hexToHsv,
  THEMES,
} from "./drawing-state.js";
const $ = (id) => document.getElementById(id),
  KEY = "brainhertz.pixelpusher.drawing.v1",
  THEME = "brainhertz.pixelpusher.accent.v1";
export function loadDrawing() {
  try {
    const raw = localStorage.getItem(KEY) || "{}";
    return normalizeDrawing(raw.length <= 16384 ? JSON.parse(raw) : {});
  } catch {
    return normalizeDrawing();
  }
}
export class DrawingUI {
  constructor(layer, canvas, { cancelPicture, closeParameters, note }) {
    this.layer = layer;
    this.canvas = canvas;
    this.mode = false;
    this.note = note;
    this.cancelPicture = cancelPicture;
    this.closeParameters = closeParameters;
    this.hsv = hexToHsv(layer.model.settings.color);
    this.lastSync = 0;
    document.addEventListener("effect-inspector", () => this.open(false));
    $("draw-tool").addEventListener("click", () => this.setMode(!this.mode));
    $("close-drawing").addEventListener("click", () => this.open(false));
    $("effect-gestures").addEventListener("click", () => this.setMode(false));
    const fields = {
      brush: "draw-brush",
      size: "draw-size",
      opacity: "draw-opacity",
      placement: "draw-placement",
      fadeMode: "draw-fade",
      fadeSeconds: "draw-fade-seconds",
      enabled: "draw-enabled",
      pulseSource: "draw-pulse-source",
      pulse: "draw-pulse",
    };
    for (const [key, id] of Object.entries(fields)) {
      const n = $(id);
      if (n.type === "checkbox") n.checked = layer.model.settings[key];
      else n.value = layer.model.settings[key];
      n.addEventListener("input", () => {
        const v =
          n.type === "checkbox"
            ? n.checked
            : n.type === "range"
              ? +n.value
              : n.value;
        layer.model.settings = normalizeDrawing({
          ...layer.model.settings,
          [key]: v,
        });
        if (key === "fadeMode" || key === "fadeSeconds") layer.resetFade();
        this.persist();
        this.sync(true);
      });
    }
    $("draw-color").value = layer.model.settings.color;
    $("draw-color").addEventListener("input", (e) =>
      this.setColor(e.target.value),
    );
    $("draw-hue").value = this.hsv[0];
    $("draw-hue").addEventListener("input", (e) => {
      this.hsv[0] = +e.target.value;
      this.setColor(hsvToHex(...this.hsv), false);
    });
    const wheel = $("draw-hue-wheel");
    const pickHue = (e) => {
      const r = wheel.getBoundingClientRect();
      this.hsv[0] =
        ((Math.atan2(
          e.clientY - r.top - r.height / 2,
          e.clientX - r.left - r.width / 2,
        ) *
          180) /
          Math.PI +
          360) %
        360;
      this.setColor(hsvToHex(...this.hsv), false);
    };
    wheel.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wheel.setPointerCapture(e.pointerId);
      this.huePointer = e.pointerId;
      pickHue(e);
    });
    wheel.addEventListener("pointermove", (e) => {
      if (this.huePointer === e.pointerId) pickHue(e);
    });
    for (const type of ["pointerup", "pointercancel"])
      wheel.addEventListener(type, () => (this.huePointer = null));
    wheel.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") this.hsv[0] += step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
        this.hsv[0] -= step;
      else if (e.key === "Home") this.hsv[0] = 0;
      else if (e.key === "End") this.hsv[0] = 359;
      else return;
      e.preventDefault();
      this.hsv[0] = (this.hsv[0] + 360) % 360;
      this.setColor(hsvToHex(...this.hsv), false);
    });
    const square = $("draw-sv");
    const pick = (e) => {
      const r = square.getBoundingClientRect();
      this.hsv[1] = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.hsv[2] =
        1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      this.setColor(hsvToHex(...this.hsv), false);
    };
    square.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      square.setPointerCapture(e.pointerId);
      this.colorPointer = e.pointerId;
      pick(e);
    });
    square.addEventListener("pointermove", (e) => {
      if (this.colorPointer === e.pointerId) pick(e);
    });
    for (const type of ["pointerup", "pointercancel"])
      square.addEventListener(type, () => (this.colorPointer = null));
    square.addEventListener("keydown", (e) => {
      const v = e.shiftKey ? 0.1 : 0.02;
      if (e.key === "ArrowLeft") this.hsv[1] -= v;
      else if (e.key === "ArrowRight") this.hsv[1] += v;
      else if (e.key === "ArrowUp") this.hsv[2] += v;
      else if (e.key === "ArrowDown") this.hsv[2] -= v;
      else return;
      e.preventDefault();
      this.hsv[1] = Math.max(0, Math.min(1, this.hsv[1]));
      this.hsv[2] = Math.max(0, Math.min(1, this.hsv[2]));
      this.setColor(hsvToHex(...this.hsv), false);
    });
    $("save-draw-color").addEventListener("click", () => {
      const s = layer.model.settings;
      s.colors = [...new Set([...s.colors, s.color])].slice(-12);
      this.persist();
      this.swatches();
    });
    $("draw-undo").addEventListener("click", () => {
      layer.finish();
      layer.model.undo();
      this.sync(true);
    });
    $("draw-clear").addEventListener("click", () => {
      layer.finish();
      layer.model.clear();
      this.sync(true);
    });
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ])
      canvas.addEventListener(type, (e) => this.pointer(e), {
        capture: true,
        passive: false,
      });
    canvas.addEventListener("lostpointercapture", (e) => {
      if (this.layer.active === e.pointerId) {
        this.layer.finish();
        this.sync(true);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.layer.finish();
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.mode) e.preventDefault();
      },
      { passive: false },
    );
    $("settings-privacy").addEventListener("click", () => {
      $("settings-dialog").close();
      $("privacy-dialog").showModal();
    });
    $("studio-settings").addEventListener("click", () =>
      $("settings-dialog").showModal(),
    );
    $("close-settings").addEventListener("click", () =>
      $("settings-dialog").close(),
    );
    let theme = "purple";
    try {
      theme = localStorage.getItem(THEME) || theme;
    } catch {}
    this.setTheme(theme);
    $("accent-theme").addEventListener("change", (e) =>
      this.setTheme(e.target.value),
    );
    this.swatches();
    this.paintSquare();
    this.sync(true);
  }
  setTheme(theme) {
    theme = THEMES.includes(theme) ? theme : "purple";
    document.documentElement.dataset.accent = theme;
    $("accent-theme").value = theme;
    try {
      localStorage.setItem(THEME, theme);
    } catch {
      this.note(
        "Theme is active for this session; device storage is unavailable.",
        true,
      );
    }
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.layer.model.settings));
    } catch {
      this.note(
        "Drawing settings cannot be saved on this device. Artwork remains available this session.",
        true,
      );
    }
  }
  setMode(on) {
    this.layer.finish();
    this.cancelPicture();
    this.mode = !!on;
    document.body.dataset.pictureMode = on ? "draw" : "effects";
    $("draw-tool").setAttribute("aria-pressed", String(on));
    if (on) this.closeParameters();
    this.open(on);
    this.sync(true);
  }
  open(on) {
    $("drawing-panel").hidden = !on;
    document.body.classList.toggle("drawing-panel-open", on);
  }
  position(e) {
    const c = this.canvas,
      r = c.getBoundingClientRect(),
      scale = Math.min(r.width / c.width, r.height / c.height),
      w = c.width * scale,
      h = c.height * scale;
    return {
      x: (e.clientX - r.left - (r.width - w) / 2) / w,
      y: (e.clientY - r.top - (r.height - h) / 2) / h,
    };
  }
  pointer(e) {
    if (!this.mode) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const m = this.layer.model;
    if (e.type === "pointerdown") {
      if (this.layer.active !== null) return;
      const p = this.position(e);
      if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
      this.layer.active = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
      m.settings.enabled = true;
      $("draw-enabled").checked = true;
      m.begin(p.x, p.y, e.pressure || 0.5, performance.now() / 1000);
      if (e.button === 5) m.current.brush = "eraser";
    } else if (this.layer.active === e.pointerId) {
      if (e.type === "pointermove") {
        const samples = e.getCoalescedEvents?.();
        for (const a of samples?.length ? samples : [e]) {
          const p = this.position(a);
          m.point(p.x, p.y, a.pressure || 0.5, performance.now() / 1000);
        }
      } else {
        this.layer.finish();
        if (this.canvas.hasPointerCapture(e.pointerId))
          this.canvas.releasePointerCapture(e.pointerId);
      }
    }
    this.sync(true);
  }
  setColor(color, reset = true) {
    this.layer.model.settings.color = color;
    if (reset) this.hsv = hexToHsv(color);
    $("draw-color").value = color;
    $("draw-hue").value = this.hsv[0];
    this.paintSquare();
    this.persist();
  }
  paintWheel() {
    const h = Math.round(this.hsv[0]);
    if (this.lastWheelHue === h) return;
    this.lastWheelHue = h;
    const c = $("draw-hue-wheel"),
      x = c.getContext("2d"),
      r = 35;
    x.clearRect(0, 0, 96, 96);
    x.lineWidth = 14;
    for (let i = 0; i < 360; i++) {
      x.strokeStyle = hsvToHex(i, 1, 1);
      x.beginPath();
      x.arc(48, 48, r, (i * Math.PI) / 180, ((i + 1.5) * Math.PI) / 180);
      x.stroke();
    }
    const a = (h * Math.PI) / 180;
    x.fillStyle = hsvToHex(h, 1, 1);
    x.strokeStyle = "white";
    x.lineWidth = 2;
    x.beginPath();
    x.arc(48 + Math.cos(a) * r, 48 + Math.sin(a) * r, 5, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.fillStyle = "#e8dfff";
    x.font = "600 12px system-ui";
    x.textAlign = "center";
    x.fillText(h + "°", 48, 52);
    c.setAttribute("aria-valuenow", String(h));
  }
  paintSquare() {
    this.paintWheel();
    const c = $("draw-sv"),
      x = c.getContext("2d");
    x.fillStyle = hsvToHex(this.hsv[0], 1, 1);
    x.fillRect(0, 0, c.width, c.height);
    let g = x.createLinearGradient(0, 0, c.width, 0);
    g.addColorStop(0, "white");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "black");
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = "white";
    x.lineWidth = 2;
    x.beginPath();
    x.arc(
      this.hsv[1] * c.width,
      (1 - this.hsv[2]) * c.height,
      5,
      0,
      Math.PI * 2,
    );
    x.stroke();
    c.setAttribute("aria-valuenow", String(Math.round(this.hsv[1] * 100)));
    c.setAttribute(
      "aria-valuetext",
      `Hue ${Math.round(this.hsv[0])}, saturation ${Math.round(this.hsv[1] * 100)}, brightness ${Math.round(this.hsv[2] * 100)}`,
    );
  }
  swatches() {
    const root = $("draw-swatches");
    root.replaceChildren();
    for (const color of [
      ...new Set([
        "#ff3645",
        "#386cff",
        "#8754ff",
        "#31d385",
        "#ffffff",
        "#000000",
        ...this.layer.model.settings.colors,
      ]),
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "draw-swatch";
      b.style.backgroundColor = color;
      b.setAttribute("aria-label", "Draw color " + color);
      b.addEventListener("click", () => this.setColor(color));
      root.append(b);
    }
  }
  sync(force = false, now = performance.now()) {
    if (!force && now - this.lastSync < 100) return;
    this.lastSync = now;
    const s = this.layer.model.settings,
      n = this.layer.model.strokes.length + (this.layer.model.current ? 1 : 0);
    $("draw-count").textContent = n + " stroke" + (n === 1 ? "" : "s");
    $("draw-undo").disabled = !n && !this.layer.model.cleared;
    $("draw-clear").disabled = !n;
    $("draw-mode-indicator").hidden = !this.mode;
    $("draw-mode-indicator").textContent = "Draw · " + s.brush;
    $("draw-size-value").textContent = Math.round(s.size);
    $("draw-opacity-value").textContent = Math.round(s.opacity * 100) + "%";
    $("draw-fade-value").textContent = s.fadeSeconds + "s";
    $("draw-pulse-value").textContent = Math.round(s.pulse * 100) + "%";
    if (force || this.lastCount !== n)
      document.dispatchEvent(new Event("drawing-change"));
    this.lastCount = n;
  }
}
