// Bounded, session-only artwork. Settings may persist; media and strokes never leave this device.
export const THEMES = ["purple", "red", "blue", "green", "ultraviolet"];
const clamp = (n, a = 0, b = 1) =>
  Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
export const validColor = (v) =>
  typeof v === "string" && /^#[\da-f]{6}$/i.test(v)
    ? v.toLowerCase()
    : "#ff3645";
export function hsvToHex(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60;
  s = clamp(s);
  v = clamp(v);
  const c = v * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = v - c;
  const a =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    a
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function hexToHsv(hex) {
  const a = validColor(hex)
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255),
    [r, g, b] = a,
    v = Math.max(...a),
    lo = Math.min(...a),
    d = v - lo;
  let h = !d
    ? 0
    : v === r
      ? ((g - b) / d + 6) % 6
      : v === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, v ? d / v : 0, v];
}
export function normalizeDrawing(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  return {
    brush: ["pen", "neon", "marker", "spray", "eraser"].includes(raw.brush)
      ? raw.brush
      : "pen",
    size: clamp(raw.size ?? 8, 1, 80),
    opacity: clamp(raw.opacity ?? 1),
    color: validColor(raw.color),
    placement: raw.placement === "under" ? "under" : "top",
    fadeMode: ["fade", "trail"].includes(raw.fadeMode) ? raw.fadeMode : "off",
    fadeSeconds: clamp(raw.fadeSeconds ?? 6, 0.5, 30),
    enabled: raw.enabled !== false,
    pulseSource: ["low", "mid", "high", "beat", "bpm"].includes(raw.pulseSource)
      ? raw.pulseSource
      : "low",
    pulse: clamp(raw.pulse ?? 0),
    colors: [
      ...new Set(
        (Array.isArray(raw.colors) ? raw.colors.slice(0, 64) : [])
          .filter((v) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v))
          .map(validColor),
      ),
    ].slice(0, 12),
  };
}
const point = (x, y, p, t) => ({
  x: clamp(x),
  y: clamp(y),
  p: clamp(p),
  t: Number.isFinite(t) ? t : 0,
});
export class DrawingState {
  constructor(settings = {}) {
    this.settings = normalizeDrawing(settings);
    this.strokes = [];
    this.current = null;
    this.cleared = null;
    this.revision = 0;
  }
  begin(x, y, p = 0.5, t = 0) {
    this.end();
    this.cleared = null;
    this.current = {
      ...this.settings,
      points: [point(x, y, p, t)],
      started: t,
      ended: t,
      seed: this.revision + 1,
    };
    this.revision++;
  }
  point(x, y, p = 0.5, t = 0) {
    if (!this.current) return;
    const a = this.current.points;
    if (a.length >= 256) this.current.points = a.filter((_, i) => i % 2 === 0);
    this.current.points.push(point(x, y, p, t));
    this.revision++;
  }
  end() {
    if (!this.current) return;
    this.current.ended = this.current.points.at(-1).t;
    this.strokes.push(this.current);
    if (this.strokes.length > 128) this.strokes.shift();
    this.current = null;
    this.revision++;
  }
  undo() {
    if (this.current) this.current = null;
    else if (this.cleared) {
      this.strokes = this.cleared;
      this.cleared = null;
    } else this.strokes.pop();
    this.revision++;
  }
  clear() {
    this.current = null;
    this.cleared = this.strokes;
    this.strokes = [];
    this.revision++;
  }
  expire(time, epoch = 0) {
    if (this.settings.fadeMode === "off" || !this.strokes.length) return;
    const next = this.strokes.filter(
      (s) => time - Math.max(epoch, s.ended) < this.settings.fadeSeconds,
    );
    if (next.length !== this.strokes.length) {
      this.strokes = next;
      this.revision++;
    }
  }
  snapshot() {
    return structuredClone({ strokes: this.strokes, settings: this.settings });
  }
  restore(snapshot) {
    this.current = null;
    this.cleared = null;
    this.strokes = structuredClone(snapshot?.strokes || []).slice(-128);
    if (snapshot?.settings) this.settings = normalizeDrawing(snapshot.settings);
    this.revision++;
  }
  get hasInk() {
    return this.strokes.length > 0 || !!this.current;
  }
}
