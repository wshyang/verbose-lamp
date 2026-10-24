import { PolylineSpec, Point2 } from './types';
import { BaseGenome, SIGNATURE_GENOME } from './genome';

/* -------------------------------------------------------------------------- */
/*  REUSABLE ART DECO ARCHITECTURAL ORNAMENT PRIMITIVES                       */
/* -------------------------------------------------------------------------- */

/** Symmetrical cut-corner octagon split into left & right grow-from-top-center halves so it draws symmetrically */
export function addCutOctagon(
  list: PolylineSpec[],
  hw: number,
  hh: number,
  cut: number,
  width: number,
  depth: number,
  z: number,
  delay: number,
  genome: BaseGenome = SIGNATURE_GENOME
) {
  const c = Math.min(cut * genome.cornerScale, hw * 0.45, hh * 0.45);
  // Right half first, matching the original emit order.
  for (const signX of [1, -1] as const) {
    list.push({
      points: octagonHalf(signX, hw, hh, c, genome.cornerProfile),
      width,
      depth,
      z,
      delay,
      kind: 'frame',
      partDir: signX,
    });
  }
}

/**
 * One half of a cut-corner plate, from top-centre to bottom-centre.
 * p = -1 notches the corner inward, 0 is today's straight 45-degree chamfer,
 * +1 rounds it outward with a three-point arc. The profile never changes the cut depth,
 * so the plate envelope is stable across the whole gene range.
 */
function octagonHalf(signX: number, hw: number, hh: number, c: number, profile: number): Point2[] {
  const start: Point2 = { x: 0, y: hh };
  if (profile > 0.02) {
    const r = c * profile;
    const apex = { x: signX * hw, y: hh - c };
    return [
      start,
      { x: signX * (hw - c), y: hh },
      { x: signX * (hw - r * 0.29), y: hh - r * 0.29 },
      apex,
      { x: signX * hw, y: -hh + c },
      { x: signX * (hw - c), y: -hh },
      { x: 0, y: -hh },
    ];
  }
  if (profile < -0.02) {
    const notch = c * -profile * 0.55;
    return [
      start,
      { x: signX * (hw - c), y: hh },
      { x: signX * (hw - c + notch), y: hh - c + notch },
      { x: signX * (hw - c * 0.35), y: hh - c },
      { x: signX * hw, y: hh - c * 0.35 },
      { x: signX * hw, y: -hh + c * 0.35 },
      { x: signX * (hw - c * 0.35), y: -hh + c },
      { x: signX * (hw - c + notch), y: -hh + c - notch },
      { x: signX * (hw - c), y: -hh },
      { x: 0, y: -hh },
    ];
  }
  return [
    start,
    { x: signX * (hw - c), y: hh },
    { x: signX * hw, y: hh - c },
    { x: signX * hw, y: -hh + c },
    { x: signX * (hw - c), y: -hh },
    { x: 0, y: -hh },
  ];
}

/** Symmetrical stepped Skyscraper Ziggurat rectangle (3-step Art Deco corners) */
export function addZigguratFrame(
  list: PolylineSpec[],
  hw: number,
  hh: number,
  stepSize: number,
  width: number,
  depth: number,
  z: number,
  delay: number,
  genome: BaseGenome = SIGNATURE_GENOME
) {
  // The total setback is preserved: more stairs means shallower stairs, so the plate
  // keeps the same silhouette footprint at every zigguratSteps setting.
  const setback = stepSize * 2 * genome.cornerScale;
  const s = setback / genome.zigguratSteps;
  const steps = genome.zigguratSteps;

  for (const signX of [-1, 1] as const) {
    const points: Point2[] = [{ x: 0, y: hh }];
    for (let k = steps; k >= 1; k -= 1) {
      points.push({ x: signX * (hw - k * s), y: hh - (steps - k) * s });
      points.push({ x: signX * (hw - k * s), y: hh - (steps - k + 1) * s });
    }
      points.push({ x: signX * hw, y: hh - steps * s });
      points.push({ x: signX * hw, y: -hh + steps * s });
      for (let k = 1; k <= steps; k += 1) {
      points.push({ x: signX * (hw - k * s), y: -hh + (steps - k + 1) * s });
      points.push({ x: signX * (hw - k * s), y: -hh + (steps - k) * s });
    }
    points.push({ x: 0, y: -hh });
    list.push({ points, width, depth, z, delay, kind: 'frame', partDir: signX });
  }
}

/** Diamond medallion centered at (cx, cy) */
export function addDiamond(
  list: PolylineSpec[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  width: number,
  depth: number,
  z: number,
  delay: number,
  partDir?: number
) {
  list.push({
    points: [
      { x: cx, y: cy + ry },
      { x: cx + rx, y: cy },
      { x: cx, y: cy - ry },
      { x: cx - rx, y: cy },
    ],
    closed: true,
    width,
    depth,
    z,
    delay,
    kind: 'diamond',
    partDir: partDir ?? (cx < 0 ? -1 : 1),
  });
}

/** Radial Chrysler Building sunburst fan rays */
export function addSunburstFan(
  list: PolylineSpec[],
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  rayCount: number,
  spreadAngle: number,
  pointingUp: boolean,
  width: number,
  depth: number,
  z: number,
  baseDelay: number,
  genome: BaseGenome = SIGNATURE_GENOME
) {
  // Ray counts stay odd so a centre ray always exists.
  const rays = Math.max(1, Math.round(rayCount * genome.rayDensity) | 1);
  const spread = spreadAngle * genome.raySpread;
  const reach = outerR * genome.rayReach;
  const baseA = pointingUp ? Math.PI * 0.5 : -Math.PI * 0.5;
  for (let i = 0; i < rays; i++) {
    const frac = rays === 1 ? 0.5 : i / (rays - 1);
    const offsetFromCenter = Math.abs(frac - 0.5) * 2; // 0 at center, 1 at outer rays
    const angle = baseA + (frac - 0.5) * spread;
    const rLen = reach * (1.0 - offsetFromCenter * 0.34);
    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * rLen;
    const y2 = cy + Math.sin(angle) * rLen;

    list.push({
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ],
      width: offsetFromCenter < 0.12 ? width * 1.35 : width,
      depth,
      z,
      delay: baseDelay + offsetFromCenter * 0.16,
      kind: 'ray',
      partDir: x2 < -0.01 ? -1 : 1,
    });
  }

  // Semicircular base arch tying rays together
  const archPtsR: Point2[] = [];
  const archPtsL: Point2[] = [];
  const segs = 12;
  for (let s = 0; s <= segs; s++) {
    const aR = baseA - (s / segs) * (spread * 0.52);
    const aL = baseA + (s / segs) * (spread * 0.52);
    archPtsR.push({ x: cx + Math.cos(aR) * innerR, y: cy + Math.sin(aR) * innerR });
    archPtsL.push({ x: cx + Math.cos(aL) * innerR, y: cy + Math.sin(aL) * innerR });
  }
  list.push({ points: archPtsR, width: width * 1.15, depth, z, delay: baseDelay, kind: 'arch', partDir: 1 });
  list.push({ points: archPtsL, width: width * 1.15, depth, z, delay: baseDelay, kind: 'arch', partDir: -1 });
}

/** Symmetrical center-out horizontal gold rule */
export function addSplitRule(
  list: PolylineSpec[],
  y: number,
  innerX: number,
  outerX: number,
  width: number,
  depth: number,
  z: number,
  delay: number
) {
  list.push({
    points: [
      { x: innerX, y },
      { x: outerX, y },
    ],
    width,
    depth,
    z,
    delay,
    kind: 'rule',
    partDir: 1,
  });
  list.push({
    points: [
      { x: -innerX, y },
      { x: -outerX, y },
    ],
    width,
    depth,
    z,
    delay,
    kind: 'rule',
    partDir: -1,
  });
}

/** Flanking Art Deco 45° chevron wings */
export function addChevronWings(
  list: PolylineSpec[],
  startX: number,
  wingCount: number,
  spacing: number,
  wingW: number,
  wingH: number,
  width: number,
  depth: number,
  z: number,
  baseDelay: number,
  genome: BaseGenome = SIGNATURE_GENOME
) {
  const count = Math.max(0, wingCount + genome.wingDelta);
  for (let i = 0; i < count; i++) {
    const xBase = startX + i * spacing;
    const h = wingH * (1 - i * 0.14);
    const sweep = wingW * genome.wingSweep;
    for (const signX of [-1, 1] as const) {
      list.push({
        points: [
          { x: signX * xBase, y: h },
          { x: signX * (xBase + sweep), y: 0 },
          { x: signX * xBase, y: -h },
        ],
        width,
        depth,
        z,
        delay: baseDelay + i * 0.06,
        kind: 'chevron',
        partDir: signX,
      });
    }
  }
}

