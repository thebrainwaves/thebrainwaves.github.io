import { DrawingState } from "./drawing-state.js";
const canvas = () => document.createElement("canvas");
const hash = (n) => {
  const x = Math.sin(n * 91.17) * 43758.5453;
  return x - Math.floor(x);
};
export class DrawingLayer {
  constructor(settings) {
    this.model = new DrawingState(settings);
    this.canvas = canvas();
    this.base = canvas();
    this.under = canvas();
    this.lastRevision = -1;
    this.baseKey = "";
    this.active = null;
    this.fadeSince = 0;
    this.opacity = 1;
  }
  finish() {
    this.model.end();
    this.active = null;
  }
  resetFade() {
    this.fadeSince = performance.now() / 1000;
    this.lastRevision = -1;
  }
  snapshot() {
    this.finish();
    return this.model.snapshot();
  }
  restore(s) {
    this.finish();
    this.model.restore({ ...s, settings: this.model.settings });
    this.lastRevision = -1;
    this.baseKey = "";
  }
  frame(w, h, time, bands = {}) {
    const m = this.model,
      s = m.settings;
    const band =
      s.pulseSource === "bpm"
        ? (1 - Math.cos((bands.phase || 0) * Math.PI * 2)) * 0.5
        : bands[s.pulseSource] || 0;
    this.opacity = 1 - s.pulse + s.pulse * (0.2 + 0.8 * band);
    m.expire(time, this.fadeSince);
    if (!s.enabled || !m.hasInk) return null;
    const resizing = this.canvas.width !== w || this.canvas.height !== h;
    if (resizing) {
      for (const c of [this.canvas, this.base, this.under]) {
        c.width = w;
        c.height = h;
      }
      this.baseKey = "";
      this.lastRevision = -1;
    }
    const fading = s.fadeMode !== "off";
    if (m.revision !== this.lastRevision || fading) {
      const c = this.canvas.getContext("2d");
      c.clearRect(0, 0, w, h);
      const count =
          m.strokes.reduce((a, b) => a + b.points.length, 0) +
          (m.current?.points.length || 0),
        step = Math.max(1, Math.ceil(count / 8192));
      if (fading) {
        for (const stroke of m.strokes)
          this.paint(c, stroke, w, h, time, s, step);
      } else {
        const key = m.strokes.map((a) => a.seed).join(",");
        if (key !== this.baseKey) {
          const x = this.base.getContext("2d");
          x.clearRect(0, 0, w, h);
          for (const stroke of m.strokes)
            this.paint(x, stroke, w, h, time, s, step);
          this.baseKey = key;
        }
        c.drawImage(this.base, 0, 0);
      }
      if (m.current) this.paint(c, m.current, w, h, time, s, step);
      this.lastRevision = m.revision;
      this.canvas.inkRevision = (this.canvas.inkRevision || 0) + 1;
    }
    return this.canvas;
  }
  paint(c, stroke, w, h, time, s, step) {
    const pts = stroke.points,
      unit = Math.min(w, h) / 360,
      size = stroke.size * unit;
    const alpha = (p) =>
      s.fadeMode === "off"
        ? 1
        : Math.max(
            0,
            1 -
              (time -
                Math.max(
                  this.fadeSince,
                  s.fadeMode === "trail" ? p.t : stroke.ended,
                )) /
                s.fadeSeconds,
          );
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = c.fillStyle = stroke.color;
    c.globalCompositeOperation =
      stroke.brush === "eraser" ? "destination-out" : "source-over";
    if (stroke.brush === "neon") {
      c.shadowColor = stroke.color;
      c.shadowBlur = Math.min(14, size * 0.8);
    }
    let prev = pts[0];
    const dot = (p, i) => {
      c.globalAlpha =
        stroke.opacity * alpha(p) * (stroke.brush === "marker" ? 0.42 : 1);
      const radius = size * (0.35 + p.p * 0.65) * 0.5;
      if (stroke.brush === "spray") {
        for (let n = 0; n < 6; n++) {
          const angle = hash(i * 7 + n + stroke.seed) * Math.PI * 2,
            dist = Math.sqrt(hash(i * 17 + n + stroke.seed)) * radius * 2;
          c.beginPath();
          c.arc(
            p.x * w + Math.cos(angle) * dist,
            p.y * h + Math.sin(angle) * dist,
            Math.max(0.6, unit * 0.7),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      } else {
        c.beginPath();
        c.arc(
          p.x * w,
          p.y * h,
          radius * (stroke.brush === "marker" ? 1.6 : 1),
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    };
    dot(prev, 0);
    for (let i = step; i < pts.length; i += step) {
      const p = pts[i],
        next = pts[Math.min(pts.length - 1, i + step)],
        mx = (p.x + next.x) * 0.5 * w,
        my = (p.y + next.y) * 0.5 * h;
      c.globalAlpha =
        stroke.opacity * alpha(p) * (stroke.brush === "marker" ? 0.42 : 1);
      c.lineWidth =
        size *
        (0.35 + ((prev.p + p.p) / 2) * 0.65) *
        (stroke.brush === "marker" ? 1.6 : 1);
      if (stroke.brush === "spray") dot(p, i);
      else {
        c.beginPath();
        c.moveTo(prev.x * w, prev.y * h);
        c.quadraticCurveTo(p.x * w, p.y * h, mx, my);
        c.stroke();
      }
      prev = { ...p, x: mx / w, y: my / h };
    }
    c.restore();
  }
  composite(source, w, h) {
    const c = this.under.getContext("2d"),
      sw = source.videoWidth || source.naturalWidth || source.width,
      sh = source.videoHeight || source.naturalHeight || source.height,
      scale = Math.max(w / sw, h / sh);
    c.globalAlpha = 1;
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    c.drawImage(
      source,
      (w - sw * scale) / 2,
      (h - sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    c.globalAlpha = this.opacity;
    c.drawImage(this.canvas, 0, 0);
    c.globalAlpha = 1;
    return this.under;
  }
}
