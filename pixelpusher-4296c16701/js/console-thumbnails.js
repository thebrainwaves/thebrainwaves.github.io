// Original static signal studies. No media reads, GPU contexts or per-frame drawing.
const cache = new Map();
export const thumbnailStats = { draws: 0, pixels: 0 };
const colors = ["#4169e1", "#7650d1", "#df3644", "#58a77b"];
export function thumbnail(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement("canvas");
  c.width = 112;
  c.height = 64;
  c.className = "tile-thumbnail";
  c.setAttribute("aria-hidden", "true");
  const x = c.getContext("2d", { alpha: false });
  x.fillStyle = "#090e19";
  x.fillRect(0, 0, 112, 64);
  x.lineWidth = 1;
  x.strokeStyle = "#1b2538";
  for (let i = 0; i < 112; i += 16) {
    x.beginPath();
    x.moveTo(i + 0.5, 0);
    x.lineTo(i + 0.5, 64);
    x.stroke();
  }
  for (let i = 0; i < 64; i += 16) {
    x.beginPath();
    x.moveTo(0, i + 0.5);
    x.lineTo(112, i + 0.5);
    x.stroke();
  }
  let seed = [...id].reduce((a, b) => (a * 31 + b.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },
    color = (i) => colors[(i + (seed % 3)) % colors.length];
  const line = (points, stroke) => {
    x.strokeStyle = stroke;
    x.beginPath();
    points.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.stroke();
  };
  if (id === "rgb") {
    for (let k = 0; k < 3; k++) {
      x.strokeStyle = colors[k];
      x.strokeRect(28 + k * 5, 12 + k * 2, 42, 38);
      x.strokeRect(36 + k * 4, 20, 22, 22);
    }
  } else if (id === "kaleido") {
    x.save();
    x.translate(56, 32);
    for (let k = 0; k < 8; k++) {
      x.rotate(Math.PI / 4);
      line(
        [
          [0, 0],
          [18, -14],
          [28, 0],
          [18, 14],
          [0, 0],
        ],
        colors[k % 3],
      );
    }
    x.restore();
  } else if (id === "trails") {
    for (let k = 0; k < 7; k++) {
      x.strokeStyle = colors[k % 3];
      x.globalAlpha = 0.25 + k * 0.1;
      x.strokeRect(10 + k * 7, 8 + k * 2, 40, 38 - k * 2);
    }
    x.globalAlpha = 1;
  } else if (id === "slit") {
    for (let k = 0; k < 18; k++) {
      x.fillStyle = colors[k % 3];
      x.fillRect(
        7 + k * 5.5,
        8 + Math.sin(k * 0.4) * 9,
        3,
        40 - Math.cos(k * 0.3) * 8,
      );
    }
  } else if (id === "beat") {
    for (let k = 0; k < 6; k++) {
      x.strokeStyle = colors[k % 3];
      x.strokeRect(10 + k * 15, 15 + (k % 2) * 6, 9, 30 - (k % 2) * 12);
      if (k % 2 === 0) {
        x.fillStyle = colors[k % 3];
        x.fillRect(11 + k * 15, 16, 7, 28);
      }
    }
  } else if (id === "shader:custom") {
    for (let k = 0; k < 9; k++) {
      x.strokeStyle = colors[k % 3];
      x.beginPath();
      x.ellipse(56, 32, 6 + k * 5, 4 + k * 3, 0, 0, Math.PI * 2);
      x.stroke();
    }
  } else if (id === "shuffle") {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 6; col++) {
        const d = rand();
        x.strokeStyle = colors[(col + row) % 3];
        x.strokeRect(8 + col * 16 + d * 7, 6 + row * 13, 12, 10);
        if (d > 0.65) {
          x.fillStyle = colors[row % 3];
          x.fillRect(9 + col * 16, 7 + row * 13, 10, 8);
        }
      }
  } else if (id === "sort") {
    for (let k = 0; k < 22; k++) {
      x.fillStyle = colors[k % 3];
      x.globalAlpha = 0.4 + rand() * 0.6;
      x.fillRect(8 + k * 4.3, 8 + rand() * 15, 2, 20 + rand() * 18);
    }
    x.globalAlpha = 1;
  } else if (id === "jitter") {
    for (let k = 0; k < 12; k++) {
      const d = ((k % 3) - 1) * 6;
      x.strokeStyle = colors[k % 3];
      x.strokeRect(28 + d, 8 + k * 4, 48, 2);
    }
  } else if (id === "shader:tunnel" || id === "fold") {
    for (let i = 0; i < 7; i++) {
      const w = 12 + i * 14,
        h = 6 + i * 8;
      x.strokeStyle = colors[i % 3];
      x.save();
      x.translate(56, 32);
      x.rotate(i * (id === "fold" ? 0.16 : 0.035));
      x.strokeRect(-w / 2, -h / 2, w, h);
      x.restore();
    }
  } else if (id === "shader:particles") {
    for (let i = 0; i < 56; i++) {
      x.fillStyle = color(i);
      const size = i % 8 === 0 ? 2 : 1;
      x.fillRect(8 + rand() * 96, 6 + rand() * 52, size, size);
    }
  } else if (id === "shader:mesh" || id === "lattice") {
    for (let j = 0; j < 6; j++) {
      const pts = [];
      for (let i = 0; i < 12; i++)
        pts.push([
          i * 11,
          14 +
            j * 7 +
            (id === "lattice"
              ? Math.sin(i * 1.4 + j * 0.8) * 4
              : Math.sin(i * 0.6 + j * 0.4) * 9),
        ]);
      line(pts, colors[j % 3]);
    }
  } else if (id === "shader:wireframe") {
    for (let j = 0; j < 4; j++) {
      const d = j * 5;
      line(
        [
          [30 + d, 12],
          [79, 18 + d],
          [79 - d, 51],
          [25, 43 - d],
          [30 + d, 12],
          [79 - d, 51],
        ],
        colors[j % 3],
      );
    }
    line(
      [
        [25, 43],
        [79, 18],
      ],
      colors[2],
    );
  } else if (id === "neon" || id === "shader:fractal") {
    for (let j = 0; j < 7; j++) {
      x.save();
      x.translate(56, 32);
      x.rotate(j * (id === "neon" ? 0.04 : 0.47));
      x.strokeStyle = colors[j % 3];
      x.strokeRect(-22 + j, -18 + j, 44 - j * 2, 36 - j * 2);
      x.restore();
    }
  } else if (id === "glyph" || id === "crush" || id === "shader:custom") {
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 14; col++) {
        const v = rand();
        if (v > 0.35) {
          x.fillStyle = colors[(row + col) % 3];
          x.fillRect(
            5 + col * 7.5,
            5 + row * 8,
            Math.round(v * 5),
            v > 0.65 ? 4 : 1,
          );
        }
      }
  } else if (id.startsWith("group:")) {
    for (let i = 0; i < 4; i++) {
      x.strokeStyle = colors[i];
      x.strokeRect(13 + i * 21, 12 + (i % 2) * 8, 20, 34);
    }
    line(
      [
        [23, 29],
        [46, 38],
        [68, 29],
        [87, 38],
      ],
      "#a0acc8",
    );
  } else if (["rgb", "chroma", "wave", "jitter"].includes(id)) {
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i < 112; i++)
        pts.push([
          i,
          32 +
            Math.sin(i * (id === "chroma" ? 0.14 : 0.075) + k * 0.45) *
              (id === "chroma" ? 13 : 8) +
            k * 3 -
            4,
        ]);
      line(pts, colors[k]);
    }
  } else if (["slit", "trails", "beat", "vhs"].includes(id)) {
    for (let i = 0; i < 15; i++) {
      x.fillStyle = colors[i % 3];
      const d = rand();
      x.globalAlpha = 0.35 + d * 0.6;
      x.fillRect(
        9 + d * 14,
        6 + i * 3.5,
        65 + rand() * 20,
        i % 4 === 0 ? 2 : 1,
      );
    }
    x.globalAlpha = 1;
  } else {
    for (let j = 0; j < 16; j++) {
      x.fillStyle = color(j);
      const y = 6 + j * 3.2,
        w = 12 + rand() * 70;
      x.fillRect(10 + rand() * 12, y, w, j % 4 === 0 ? 4 : 2);
    }
  }
  x.fillStyle = "#c1cbdf";
  x.fillRect(5, 5, 2, 2);
  x.fillStyle = "#263249";
  x.fillRect(103, 56, 4, 2);
  cache.set(id, c);
  thumbnailStats.draws++;
  thumbnailStats.pixels += 112 * 64;
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return c;
}

export function pruneThumbnails(ids) {
  for (const id of cache.keys())
    if (id.startsWith("group:") && !ids.has(id)) cache.delete(id);
  thumbnailStats.pixels = cache.size * 112 * 64;
}
