import { crc32, deflateSync } from 'node:zlib';

/**
 * A tiny RGBA pixel canvas with a PNG encoder, for art that is too large to ship as SVG
 * rects. The Sentosa panorama is 480×270 — 129,600 cells — which is a 20 kB PNG and would
 * be a megabyte of `<rect>`s (ADR-022).
 *
 * Coordinates are *art units*, and a canvas may draw more than one pixel per unit
 * (ADR-023). At `scale: 1` a unit is a pixel and the output is the chunky classic
 * backdrop; at `scale: 2` circles, curves, diagonals, dithering and scatter are computed
 * in the finer grid, so the same drawing code yields genuinely finer art rather than the
 * same art blown up. Everything is deliberate pixel pushing: no antialiasing, no
 * blending, so the output survives `image-rendering: pixelated` at any size.
 */

export function hexToRgba(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const number = Number.parseInt(full.slice(0, 6), 16);
  const alpha = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) : 255;
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255, alpha];
}

export class Canvas {
  constructor(units, unitsHigh, scale = 1) {
    this.scale = scale;
    this.units = units;
    this.unitsHigh = unitsHigh;
    this.width = units * scale;
    this.height = unitsHigh * scale;
    this.data = new Uint8Array(this.width * this.height * 4);
  }

  /** Writes one device pixel. Out-of-bounds writes are dropped. */
  setFine(x, y, colour) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const [r, g, b, a] = typeof colour === 'string' ? hexToRgba(colour) : colour;
    if (a === 0) return;
    const index = (py * this.width + px) * 4;
    this.data[index] = r;
    this.data[index + 1] = g;
    this.data[index + 2] = b;
    this.data[index + 3] = a;
  }

  /** Writes one art unit: a scale×scale block. */
  set(x, y, colour) {
    const ox = Math.round(x) * this.scale;
    const oy = Math.round(y) * this.scale;
    for (let dy = 0; dy < this.scale; dy += 1) {
      for (let dx = 0; dx < this.scale; dx += 1) this.setFine(ox + dx, oy + dy, colour);
    }
  }

  getFine(x, y) {
    const index = (y * this.width + x) * 4;
    return [this.data[index], this.data[index + 1], this.data[index + 2], this.data[index + 3]];
  }

  get(x, y) {
    return this.getFine(Math.round(x) * this.scale, Math.round(y) * this.scale);
  }

  /** Scatter counts and sample steps scale with area, so texture density is constant. */
  density(count) {
    return Math.round(count * this.scale * this.scale);
  }

  fineRect(x, y, w, h, colour) {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) this.setFine(px, py, colour);
    }
  }

  rect(x, y, w, h, colour) {
    const s = this.scale;
    this.fineRect(Math.round(x) * s, Math.round(y) * s, Math.round(w) * s, Math.round(h) * s, colour);
  }

  hLine(x0, x1, y, colour) {
    const [from, to] = x0 <= x1 ? [x0, x1] : [x1, x0];
    this.rect(from, y, to - from + 1, 1, colour);
  }

  vLine(x, y0, y1, colour) {
    const [from, to] = y0 <= y1 ? [y0, y1] : [y1, y0];
    this.rect(x, from, 1, to - from + 1, colour);
  }

  /** Bresenham in the device grid: at scale 2 the staircase halves but the line keeps its weight. */
  line(x0, y0, x1, y1, colour) {
    const s = this.scale;
    let x = Math.round(x0 * s);
    let y = Math.round(y0 * s);
    const ex = Math.round(x1 * s);
    const ey = Math.round(y1 * s);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.fineRect(x, y, s, s, colour);
      if (x === ex && y === ey) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  disc(cx, cy, radius, colour) {
    const s = this.scale;
    const [fx, fy, fr] = [cx * s, cy * s, radius * s];
    for (let y = -fr; y <= fr + s; y += 1) {
      for (let x = -fr; x <= fr + s; x += 1) {
        if (x * x + y * y <= fr * fr) this.setFine(fx + x, fy + y, colour);
      }
    }
  }

  ring(cx, cy, radius, colour, thickness = 1) {
    const s = this.scale;
    const [fx, fy, fr] = [cx * s, cy * s, radius * s];
    const inner = (fr - thickness * s) * (fr - thickness * s);
    for (let y = -fr; y <= fr + s; y += 1) {
      for (let x = -fr; x <= fr + s; x += 1) {
        const d = x * x + y * y;
        if (d <= fr * fr && d > inner) this.setFine(fx + x, fy + y, colour);
      }
    }
  }

  /** Filled triangle by scanline — used for roofs, sails and hillsides. */
  triangle(points, colour) {
    const s = this.scale;
    const fine = points.map(([x, y]) => [x * s, y * s]);
    const ys = fine.map((p) => p[1]);
    for (let y = Math.round(Math.min(...ys)); y <= Math.max(...ys); y += 1) {
      const xs = [];
      for (let i = 0; i < 3; i += 1) {
        const [ax, ay] = fine[i];
        const [bx, by] = fine[(i + 1) % 3];
        if (ay === by) continue;
        if (y >= Math.min(ay, by) && y <= Math.max(ay, by)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      if (xs.length > 0) this.fineRect(Math.round(Math.min(...xs)), y, Math.round(Math.max(...xs) - Math.min(...xs)) + s, 1, colour);
    }
  }

  /** Samples a quadratic curve densely enough that no pixel gap opens up. */
  curve(from, control, to, colour, steps = 160) {
    const s = this.scale;
    for (let i = 0; i <= steps * s; i += 1) {
      const t = i / (steps * s);
      const inv = 1 - t;
      const x = inv * inv * from[0] + 2 * inv * t * control[0] + t * t * to[0];
      const y = inv * inv * from[1] + 2 * inv * t * control[1] + t * t * to[1];
      this.fineRect(Math.round(x * s), Math.round(y * s), s, s, colour);
    }
  }

  /** Draws a grid of role keys (hand-drawn sprites) at an offset. */
  stamp(x, y, rows, palette) {
    rows.forEach((row, dy) => {
      [...row].forEach((key, dx) => {
        const colour = palette[key];
        if (colour) this.set(x + dx, y + dy, colour);
      });
    });
  }
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Ordered dithering between two colours, in the device grid: a hard band across the sky
 * looks like a mistake, a dithered one looks like 1995, and at scale 2 the pattern is
 * twice as fine rather than twice as big.
 */
export function ditherBand(canvas, y0, y1, top, bottom) {
  const s = canvas.scale;
  const [from, to] = [Math.round(y0 * s), Math.round(y1 * s)];
  for (let y = from; y < to; y += 1) {
    const mix = (y - from) / Math.max(1, to - from - 1);
    for (let x = 0; x < canvas.width; x += 1) {
      const threshold = (BAYER[y % 4][x % 4] + 0.5) / 16;
      canvas.setFine(x, y, mix > threshold ? bottom : top);
    }
  }
}

/**
 * Draws a one-art-unit outline into the transparent pixels around whatever the canvas
 * already holds. A pixel-art figure on a busy background needs a contour or it dissolves
 * into it; doing it here means the artwork itself never has to be outlined by hand.
 */
export function outlineCanvas(canvas, colour) {
  const { width, height, scale } = canvas;
  const solid = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) solid[y * width + x] = canvas.getFine(x, y)[3] > 0 ? 1 : 0;
  }
  const isNear = (x, y) => {
    for (let dy = -scale; dy <= scale; dy += 1) {
      for (let dx = -scale; dx <= scale; dx += 1) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (solid[ny * width + nx] === 1) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid[y * width + x] === 0 && isNear(x, y)) canvas.setFine(x, y, colour);
    }
  }
  return canvas;
}

/** Copies every non-transparent pixel of `source` onto `target` at an art-unit offset. */
export function stampCanvas(target, source, x, y) {
  const [ox, oy] = [Math.round(x) * target.scale, Math.round(y) * target.scale];
  for (let py = 0; py < source.height; py += 1) {
    for (let px = 0; px < source.width; px += 1) {
      const pixel = source.getFine(px, py);
      if (pixel[3] > 0) target.setFine(ox + px, oy + py, pixel);
    }
  }
  return target;
}

export function encodePng(canvas) {
  const { width, height, data } = canvas;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([length, typed, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
