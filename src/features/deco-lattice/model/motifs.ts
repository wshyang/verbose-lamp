import type { Pt } from './lattice';

/**
 * Octagram {8/2}: union of square [-a,a]² and its 45° rotation, in closed
 * form. Vertices alternate a√2 at kπ/4 and a·sec(π/8) at π/8 + kπ/4.
 */
export function octagram(a: number): readonly Pt[] {
  const rOut = a * Math.SQRT2;
  const rIn = a / Math.cos(Math.PI / 8);
  const pts: Pt[] = [];
  for (let k = 0; k < 8; k += 1) {
    const a0 = (k * Math.PI) / 4;
    const a1 = a0 + Math.PI / 8;
    pts.push({ x: Math.cos(a0) * rOut, y: Math.sin(a0) * rOut });
    pts.push({ x: Math.cos(a1) * rIn, y: Math.sin(a1) * rIn });
  }
  return pts;
}

export function nestedOctagram(a: number, k: number, ratio: number): readonly (readonly Pt[])[] {
  return Array.from({ length: k }, (_, i) => octagram(a * Math.pow(ratio, i)));
}

export function cornerDiamond(at: Pt, r: number): readonly Pt[] {
  return [
    { x: at.x, y: at.y - r }, { x: at.x + r, y: at.y },
    { x: at.x, y: at.y + r }, { x: at.x - r, y: at.y },
  ];
}

/** Castellated corner staircase from (hx−steps·d, hy) to (hx, hy−steps·d). */
export interface StaircaseSpec {
  /** Half extents of the rectangle the staircase belongs to. */
  hx: number;
  hy: number;
  steps: number;
  /** Size of one step. */
  d: number;
}

export function cornerSteps(spec: StaircaseSpec): readonly Pt[] {
  const { hx, hy, steps, d } = spec;
  const pts: Pt[] = [{ x: hx - steps * d, y: hy }];
  let x = hx - steps * d;
  let y = hy;
  for (let i = 0; i < steps; i += 1) {
    y -= d;
    pts.push({ x, y });
    x += d;
    pts.push({ x, y });
  }
  return pts;
}

/** Closed stepped border of a rectangle, corners built from one staircase. */
export function steppedBorder(spec: StaircaseSpec): readonly Pt[] {
  const tr = cornerSteps(spec);
  const br = tr.map((p) => ({ x: p.x, y: -p.y })).reverse();
  const bl = tr.map((p) => ({ x: -p.x, y: -p.y }));
  const tl = tr.map((p) => ({ x: -p.x, y: p.y })).reverse();
  return [...tr, ...br, ...bl, ...tl];
}

/** Mid-edge clasp: a long hexagon with 45° ends, centred on the x axis. */
export function trapezoidClasp(span: number, height: number): readonly Pt[] {
  const hh = height / 2;
  return [
    { x: -span / 2, y: 0 }, { x: -span / 2 + hh, y: -hh }, { x: span / 2 - hh, y: -hh },
    { x: span / 2, y: 0 }, { x: span / 2 - hh, y: hh }, { x: -span / 2 + hh, y: hh },
  ];
}

export function claspChevron(span: number, height: number): readonly Pt[] {
  return [
    { x: -span / 2, y: height / 2 }, { x: 0, y: -height / 2 }, { x: span / 2, y: height / 2 },
  ];
}

/** Thick diagonal X band arm, from centre out at 45°, width w. */
export function diagonalArm(len: number, w: number): readonly Pt[] {
  const s = Math.SQRT1_2;
  const nx = -s * w;
  const ny = s * w;
  const ex = len * s;
  const ey = len * s;
  return [
    { x: nx, y: ny }, { x: ex + nx, y: ey + ny },
    { x: ex - nx, y: ey - ny }, { x: -nx, y: -ny },
  ];
}

/** Outward chevron on the +x axis at distance d. */
export function axisArrow(d: number, len: number): readonly Pt[] {
  return [{ x: d, y: -len / 2 }, { x: d + len / 2, y: 0 }, { x: d, y: len / 2 }];
}

export interface ReedRowOptions {
  from: Pt;
  to: Pt;
  tickLen: number;
  barW: number;
  gap: number;
}

/**
 * Equal-gap reed tiling: n = ⌊(L−g)/(w+g)⌋, exact gap g' = (L−n·w)/(n+1).
 * Each reed is a 2-point tick perpendicular to the band.
 */
export function reedRow(opts: ReedRowOptions): readonly (readonly Pt[])[] {
  const dx = opts.to.x - opts.from.x;
  const dy = opts.to.y - opts.from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const n = Math.max(1, Math.floor((len - opts.gap) / (opts.barW + opts.gap)));
  const g = (len - n * opts.barW) / (n + 1);
  return Array.from({ length: n }, (_, i) => {
    const c = g + i * (opts.barW + g) + opts.barW / 2;
    const cx = opts.from.x + ux * c;
    const cy = opts.from.y + uy * c;
    return [
      { x: cx + uy * opts.tickLen / 2, y: cy - ux * opts.tickLen / 2 },
      { x: cx - uy * opts.tickLen / 2, y: cy + ux * opts.tickLen / 2 },
    ];
  });
}