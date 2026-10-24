/**
 * A grid of *role keys*, not colours — the avatar equivalent of pixel-canvas.mjs
 * (ADR-026). Every cell holds a role (`s` skin, `h` hair, `t` outfit…) that the
 * participant's own palette resolves at render time, so one drawing serves 1.2 million
 * appearances.
 *
 * At 64×64 a face is 4 096 cells: too many to hand-type as ASCII and still see what you
 * are doing, and far too many to keep symmetric by eye. So the art is written as shapes
 * with hand-chosen coordinates — the same way the Sentosa panorama is written — plus
 * `mirrorLeft()`, which makes a face symmetric by construction and halves the drawing.
 */

export const TRANSPARENT = '.';

export class KeyCanvas {
  constructor(size) {
    this.size = size;
    this.cells = new Array(size * size).fill(TRANSPARENT);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  set(x, y, key) {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (this.inside(px, py)) this.cells[py * this.size + px] = key;
    return this;
  }

  get(x, y) {
    return this.inside(x, y) ? this.cells[y * this.size + x] : TRANSPARENT;
  }

  /** Inclusive horizontal run — the workhorse: most of this art is spans per row. */
  span(y, x0, x1, key) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) this.set(x, y, key);
    return this;
  }

  /** `{ 12: [[20, 30]], 13: [[18, 32], [40, 44]] }` — rows of spans, read like a drawing. */
  rows(map, key) {
    for (const [y, spans] of Object.entries(map)) {
      for (const [x0, x1] of spans) this.span(Number(y), x0, x1, key);
    }
    return this;
  }

  rect(x, y, w, h, key) {
    for (let py = y; py < y + h; py += 1) this.span(py, x, x + w - 1, key);
    return this;
  }

  ellipse(cx, cy, rx, ry, key) {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
      const dy = (y - cy) / ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      this.span(y, Math.round(cx - half), Math.round(cx + half), key);
    }
    return this;
  }

  disc(cx, cy, r, key) {
    return this.ellipse(cx, cy, r, r, key);
  }

  /** Quadratic curve, stamped with a square brush so a stroke never breaks. */
  curve(from, control, to, key, thickness = 1, steps = 96) {
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * to[0];
      const y = (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * to[1];
      for (let dy = 0; dy < thickness; dy += 1) {
        for (let dx = 0; dx < thickness; dx += 1) this.set(Math.round(x) + dx, Math.round(y) + dy, key);
      }
    }
    return this;
  }

  triangle(points, key) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const sign = (a, b, c) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
        const d1 = sign([x, y], points[0], points[1]);
        const d2 = sign([x, y], points[1], points[2]);
        const d3 = sign([x, y], points[2], points[0]);
        const negative = d1 < 0 || d2 < 0 || d3 < 0;
        const positive = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(negative && positive)) this.set(x, y, key);
      }
    }
    return this;
  }

  /** Copies the left half onto the right — a face is symmetric, so it is drawn once. */
  mirrorLeft() {
    const middle = this.size / 2;
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < middle; x += 1) {
        this.set(this.size - 1 - x, y, this.get(x, y));
      }
    }
    return this;
  }

  /** Stamps another canvas on top, transparent cells passing through. */
  stamp(other, dx = 0, dy = 0) {
    for (let y = 0; y < other.size; y += 1) {
      for (let x = 0; x < other.size; x += 1) {
        const key = other.get(x, y);
        if (key !== TRANSPARENT) this.set(x + dx, y + dy, key);
      }
    }
    return this;
  }

  /** Replaces one role with another everywhere — cheap way to shade a finished shape. */
  swap(from, to) {
    this.cells = this.cells.map((key) => (key === from ? to : key));
    return this;
  }

  /**
   * Traces `key` into the transparent cells around everything drawn so far. Anime faces
   * are defined by their contour; without one a pale character dissolves into a pale
   * backdrop, exactly as the Merlion did (ADR-023).
   */
  outline(key, { corners = false } = {}) {
    const neighbours = corners
      ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const additions = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.get(x, y) !== TRANSPARENT) continue;
        const touches = neighbours.some(([dx, dy]) => {
          const found = this.get(x + dx, y + dy);
          return found !== TRANSPARENT && found !== key;
        });
        if (touches) additions.push([x, y]);
      }
    }
    for (const [x, y] of additions) this.set(x, y, key);
    return this;
  }

  toRows() {
    const out = [];
    for (let y = 0; y < this.size; y += 1) {
      out.push(this.cells.slice(y * this.size, (y + 1) * this.size).join(''));
    }
    return out;
  }
}

export function canvas(size) {
  return new KeyCanvas(size);
}
