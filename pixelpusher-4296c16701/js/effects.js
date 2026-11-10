// Original effect definitions; shared by renderer, console schema and controls.
const p = (name, value) => ({ name, value });
export const EFFECTS = [
  {
    id: "rgb",
    name: "RGB split",
    tag: "CHROMA",
    mode: 1,
    params: [p("Distance", 0.25), p("Angle", 0.1)],
  },
  {
    id: "smear",
    name: "Block smear",
    tag: "FLOW MEMORY",
    mode: 2,
    params: [p("Persistence", 0.7), p("Block size", 0.35), p("Flow", 0.65)],
  },
  {
    id: "sort",
    name: "Pixel drift",
    tag: "SORT APPROX.",
    mode: 3,
    params: [
      p("Length", 0.45),
      p("Threshold low", 0.15),
      p("Threshold high", 0.85),
      p("Direction / angle", 0),
    ],
  },
  {
    id: "vhs",
    name: "Tape scan",
    tag: "SIGNAL",
    mode: 4,
    params: [
      p("Scanlines", 0.35),
      p("Tracking / wobble", 0.3),
      p("Noise", 0.2),
      p("Chroma bleed", 0.4),
    ],
  },
  {
    id: "wave",
    name: "Displacement",
    tag: "WAVE",
    mode: 5,
    params: [p("Depth", 0.3), p("Frequency", 0.35), p("Speed", 0.3)],
  },
  {
    id: "trails",
    name: "Feedback trails",
    tag: "ZOOM / ROTATE",
    mode: 6,
    params: [p("Persistence", 0.65), p("Zoom", 0.35), p("Rotation", 0.53)],
  },
  {
    id: "crush",
    name: "Bit crush",
    tag: "TONE",
    mode: 7,
    params: [p("Color steps", 0.35), p("Pixel size", 0.12)],
  },
  {
    id: "lattice",
    name: "Lattice shear",
    tag: "ORIGINAL / 01",
    mode: 8,
    params: [p("Shear", 0.3), p("Cell density", 0.4), p("Pulse", 0.4)],
  },
  {
    id: "fold",
    name: "Signal fold",
    tag: "ORIGINAL / 02",
    mode: 9,
    params: [p("Fold", 0.4), p("Bands", 0.35), p("Phase", 0.4)],
  },
  {
    id: "slit",
    name: "Time ribbon",
    tag: "SLIT SCAN",
    mode: 10,
    params: [p("Time depth", 0.85), p("Direction", 0.25), p("Sweep", 0.2)],
  },
  {
    id: "kaleido",
    name: "Mirror chamber",
    tag: "KALEIDOSCOPE",
    mode: 11,
    params: [p("Segments", 0.3), p("Rotation", 0.1), p("Mirror / radius", 0.6)],
  },
  {
    id: "shuffle",
    name: "Block exchange",
    tag: "SHUFFLE",
    mode: 12,
    params: [p("Disorder", 0.5), p("Grid", 0.4), p("Rate", 0.3)],
  },
  {
    id: "glyph",
    name: "Signal glyph",
    tag: "ASCII / DITHER",
    mode: 13,
    params: [
      p("Cell size", 0.4),
      p("ASCII ↔ dither", 0.25),
      p("Contrast", 0.5),
    ],
  },
  {
    id: "chroma",
    name: "Spectral wave",
    tag: "CHROMATIC WARP",
    mode: 14,
    params: [p("Amplitude", 0.45), p("Frequency", 0.4), p("Speed", 0.4)],
  },
  {
    id: "jitter",
    name: "Line rupture",
    tag: "SCANLINE JITTER",
    mode: 15,
    params: [p("Offset", 0.4), p("Line width", 0.25), p("Rate", 0.4)],
  },
  {
    id: "neon",
    name: "Neon contour",
    tag: "POSTER / EDGE",
    mode: 16,
    params: [p("Poster levels", 0.35), p("Edge glow", 0.65), p("Palette", 0.3)],
  },
  {
    id: "beat",
    name: "Pulse gate",
    tag: "STROBE / STUTTER",
    mode: 17,
    params: [
      p("Stutter ↔ strobe", 0.15),
      p("Pulse width", 0.35),
      p("Division", 0.3),
    ],
  },
];

EFFECTS.push({
  id: "hue",
  name: "Hue rotate",
  tag: "COLOR PHASE",
  mode: 18,
  params: [
    { name: "Angle", value: 1 / 3, max: 360, unit: "°" },
    { name: "Speed", value: 0, max: 1, unit: "Hz" },
    p("Mix", 1),
  ],
});

export function formatParam(param, value) {
  return param?.unit === "°"
    ? Math.round(value * 360) + "°"
    : param?.unit === "Hz"
      ? value.toFixed(2) + " Hz"
      : Math.round(value * 100) + "%";
}
