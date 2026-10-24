import { FrameArchetype } from '../../types/sequence';
import { buildCoreFrameSpecs } from './archetypes';
import { FrameFormula, Point2, PolylineSpec, RailKind } from './types';

/* -------------------------------------------------------------------------- */
/*  SHARED MACHINERY (pure, no Three.js — ADDENDUM-004 §2.1)                   */
/* -------------------------------------------------------------------------- */

interface Box {
  hw: number;
  hh: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;

export function clampGenesisLevel(level: number): number {
  if (!Number.isFinite(level)) return 2;
  return Math.min(4, Math.max(1, Math.round(level)));
}

/** Half-extents shared with the authored frames, so typography clearance is stable. */
export function frameBox(archetype: FrameArchetype, mainWidth: number): Box {
  switch (archetype) {
    case 'monogram_gate':
      return { hw: 2.9, hh: 3.2 };
    case 'ziggurat_chevron':
      return { hw: Math.max(4.4, mainWidth * 0.56 + 0.75), hh: 1.68 };
    case 'sunburst_octagon':
      return { hw: Math.max(4.5, mainWidth * 0.56 + 0.8), hh: 1.85 };
    case 'diamond_gateway':
      return { hw: Math.max(4.3, mainWidth * 0.56 + 0.8), hh: 1.75 };
    case 'gatsby_hero':
    default:
      return { hw: Math.max(4.45, mainWidth * 0.54 + 0.78), hh: 2.15 };
  }
}

function rail(
  points: Point2[],
  width: number,
  kind: RailKind,
  delay: number,
  z: number,
  closed = false
): PolylineSpec {
  return { points, width, depth: 0.09, z, delay, kind, closed };
}

/** Right-half specs become both halves; left is a pure reflection with partDir −1. */
export function mirrorHalves(right: PolylineSpec[]): PolylineSpec[] {
  const rightSide = right.map((s) => ({ ...s, partDir: 1, points: s.points.map((p) => ({ ...p })) }));
  const leftSide = right.map((s) => ({
    ...s,
    partDir: -1,
    points: s.points.map((p) => ({ x: -p.x, y: p.y })),
  }));
  return [...rightSide, ...leftSide];
}

/** Half-outline: top-centre → right → bottom-centre. Closed Minimal frame when mirrored. */
function primaryHalfRing(hw: number, hh: number, chamfer: number, width: number): PolylineSpec {
  const c = Math.min(chamfer, hw * 0.3, hh * 0.3);
  return rail(
    [
      { x: 0, y: hh },
      { x: hw - c, y: hh },
      { x: hw, y: hh - c },
      { x: hw, y: -hh + c },
      { x: hw - c, y: -hh },
      { x: 0, y: -hh },
    ],
    width,
    'frame',
    0,
    0
  );
}

/* -------------------------------------------------------------------------- */
/*  FRACTAL — Cantor rails on φ-inset rings                                    */
/* -------------------------------------------------------------------------- */

export function cantorSegments(a: number, b: number, depth: number): Array<[number, number]> {
  if (depth <= 0 || b - a < 1e-4) return [[a, b]];
  const third = (b - a) / 3;
  return [...cantorSegments(a, a + third, depth - 1), ...cantorSegments(b - third, b, depth - 1)];
}

function buildFractal(box: Box, level: number): PolylineSpec[] {
  const { hw, hh } = box;
  const out: PolylineSpec[] = [primaryHalfRing(hw, hh, 0.55, 0.062)];
  const cantorDepth = Math.min(3, level - 1);

  for (let i = 0; i < level; i++) {
    const scale = Math.pow(1 / PHI, i + 1);
    const iw = hw * scale;
    const ih = hh * scale;
    const ic = Math.min(0.42 * scale, iw * 0.3, ih * 0.3);
    const width = 0.042 * Math.pow(0.7, i);
    const z = -0.1 * (i + 1);

    out.push(
      rail(
        [
          { x: 0, y: ih },
          { x: iw - ic, y: ih },
          { x: iw, y: ih - ic },
          { x: iw, y: -ih + ic },
          { x: iw - ic, y: -ih },
          { x: 0, y: -ih },
        ],
        width,
        'arch',
        0.06 + 0.05 * i,
        z
      )
    );

    const segments = cantorSegments(0, Math.max(0.15, iw - ic), cantorDepth);
    segments.forEach(([a, b], idx) => {
      const delay = 0.1 + 0.02 * i + 0.015 * idx;
      out.push(rail([{ x: a, y: ih }, { x: b, y: ih }], width * 0.66, 'arch', delay, z + 0.04));
      out.push(rail([{ x: a, y: -ih }, { x: b, y: -ih }], width * 0.66, 'arch', delay + 0.02, z + 0.04));
    });

    out.push(
      rail(
        [
          { x: iw, y: 0 },
          { x: iw + 0.12, y: 0.13 },
          { x: iw + 0.24, y: 0 },
          { x: iw + 0.12, y: -0.13 },
        ],
        0.022,
        'diamond',
        0.2 + 0.03 * i,
        z + 0.05,
        true
      )
    );
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  ROSETTE — superellipse modulated by a harmonic rose                        */
/* -------------------------------------------------------------------------- */

function buildRosette(box: Box, level: number): PolylineSpec[] {
  const { hw, hh } = box;
  const lobes = 3 + level;
  const exponent = 2 + 1.2 * level;
  const amplitude = 0.045 + 0.018 * level;
  const samples = 40 + 6 * level;

  const pointAt = (t: number, scale: number): Point2 => {
    const theta = Math.PI / 2 - t * Math.PI;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const sx = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / exponent);
    const sy = Math.sign(st) * Math.pow(Math.abs(st), 2 / exponent);
    const modulation = 1 + amplitude * Math.cos(lobes * theta);
    return {
      x: Math.max(0, hw * 0.94 * sx * modulation * scale),
      y: hh * sy * modulation * scale,
    };
  };

  const ring = (scale: number): Point2[] =>
    Array.from({ length: samples + 1 }, (_, i) => pointAt(i / samples, scale));

  const out: PolylineSpec[] = [
    rail(ring(1), 0.06, 'frame', 0, 0),
    rail(ring(0.8), 0.028, 'arch', 0.1, -0.1),
    rail(ring(0.64), 0.022, 'arch', 0.16, -0.18),
  ];

  for (let j = 0; j < lobes; j++) {
    const t = (j + 1) / (lobes + 1);
    out.push(rail([pointAt(t, 0.84), pointAt(t, 1.02)], 0.024, 'ray', 0.2 + 0.02 * j, -0.06));
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  ARCADE — recursive bays of stepped arches between piers                    */
/* -------------------------------------------------------------------------- */

function buildArcade(box: Box, level: number): PolylineSpec[] {
  const { hw, hh } = box;
  const bays = level + 2;
  const out: PolylineSpec[] = [primaryHalfRing(hw, hh, 0.5, 0.06)];

  for (let b = 0; b < bays; b++) {
    const x0 = (b / bays) * hw;
    const x1 = ((b + 0.82) / bays) * hw;
    const apex = hh * (0.55 + 0.06 * (b % 2));
    const delay = 0.08 + 0.03 * b;

    const arch = (inset: number): Point2[] => [
      { x: x0 + inset, y: -apex + inset },
      { x: x0 + inset, y: apex - 0.16 - inset * 0.3 },
      { x: x0 + 0.1, y: apex - inset * 0.3 },
      { x: x1 - 0.1, y: apex - inset * 0.3 },
      { x: x1 - inset, y: apex - 0.16 - inset * 0.3 },
      { x: x1 - inset, y: -apex + inset },
    ];

    out.push(rail(arch(0), 0.03, 'arch', delay, -0.08));
    for (let r = 1; r <= Math.min(level, 3); r++) {
      const inset = 0.12 * r;
      if (x1 - x0 > 2.4 * inset) {
        out.push(rail(arch(inset), 0.018, 'arch', delay + 0.03 * r, -0.08 - 0.05 * r));
      }
    }

    out.push(rail([{ x: x0, y: -hh * 0.92 }, { x: x0, y: hh * 0.92 }], 0.026, 'arch', 0.06 + 0.02 * b, -0.04));

    const keystoneX = (x0 + x1) / 2;
    out.push(
      rail(
        [
          { x: keystoneX, y: hh * 0.96 },
          { x: keystoneX + 0.1, y: hh * 0.82 },
          { x: keystoneX, y: hh * 0.68 },
          { x: keystoneX - 0.1, y: hh * 0.82 },
        ],
        0.02,
        'diamond',
        0.18,
        -0.02,
        true
      )
    );
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  PUBLIC                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generative core for a non-authored formula. Right half is built, then mirrored.
 * For the monogram archetype the authored G/pinstripe letterforms are preserved.
 */
export function buildGenerativeFrameSpecs(
  archetype: FrameArchetype,
  mainWidth: number,
  formula: FrameFormula,
  options: { includePrimaryFrame?: boolean; includeMonogram?: boolean } = {}
): PolylineSpec[] {
  const box = frameBox(archetype, mainWidth);
  const level = clampGenesisLevel(formula.level);

  const rightHalf =
    formula.source === 'fractal'
      ? buildFractal(box, level)
      : formula.source === 'rosette'
        ? buildRosette(box, level)
        : buildArcade(box, level);

  const pattern = options.includePrimaryFrame === false ? rightHalf.slice(1) : rightHalf;
  const specs = mirrorHalves(pattern);
  if (archetype !== 'monogram_gate' || options.includeMonogram === false) return specs;

  const glyph = buildCoreFrameSpecs('monogram_gate', mainWidth).filter(
    (s) => s.kind === 'monogram' || s.kind === 'pinstripe'
  );
  return [...specs, ...glyph];
}
