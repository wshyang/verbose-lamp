import { PolylineSpec, Point2 } from './types';

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
  delay: number
) {
  const c = Math.min(cut, hw * 0.45, hh * 0.45);
  // Right half: top-center -> top-right -> right -> bottom-right -> bottom-center
  list.push({
    points: [
      { x: 0, y: hh },
      { x: hw - c, y: hh },
      { x: hw, y: hh - c },
      { x: hw, y: -hh + c },
      { x: hw - c, y: -hh },
      { x: 0, y: -hh },
    ],
    width,
    depth,
    z,
    delay,
    kind: 'frame',
    partDir: 1,
  });
  // Left half: top-center -> top-left -> left -> bottom-left -> bottom-center
  list.push({
    points: [
      { x: 0, y: hh },
      { x: -hw + c, y: hh },
      { x: -hw, y: hh - c },
      { x: -hw, y: -hh + c },
      { x: -hw + c, y: -hh },
      { x: 0, y: -hh },
    ],
    width,
    depth,
    z,
    delay,
    kind: 'frame',
    partDir: -1,
  });
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
  delay: number
) {
  const s = stepSize;
  for (const signX of [-1, 1] as const) {
    list.push({
      points: [
        { x: 0, y: hh },
        { x: signX * (hw - 2 * s), y: hh },
        { x: signX * (hw - 2 * s), y: hh - s },
        { x: signX * (hw - s), y: hh - s },
        { x: signX * (hw - s), y: hh - 2 * s },
        { x: signX * hw, y: hh - 2 * s },
        { x: signX * hw, y: -hh + 2 * s },
        { x: signX * (hw - s), y: -hh + 2 * s },
        { x: signX * (hw - s), y: -hh + s },
        { x: signX * (hw - 2 * s), y: -hh + s },
        { x: signX * (hw - 2 * s), y: -hh },
        { x: 0, y: -hh },
      ],
      width,
      depth,
      z,
      delay,
      kind: 'frame',
      partDir: signX,
    });
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
  baseDelay: number
) {
  const baseA = pointingUp ? Math.PI * 0.5 : -Math.PI * 0.5;
  for (let i = 0; i < rayCount; i++) {
    const frac = rayCount === 1 ? 0.5 : i / (rayCount - 1);
    const offsetFromCenter = Math.abs(frac - 0.5) * 2; // 0 at center, 1 at outer rays
    const angle = baseA + (frac - 0.5) * spreadAngle;
    const rLen = outerR * (1.0 - offsetFromCenter * 0.34);
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
    const aR = baseA - (s / segs) * (spreadAngle * 0.52);
    const aL = baseA + (s / segs) * (spreadAngle * 0.52);
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
  baseDelay: number
) {
  for (let i = 0; i < wingCount; i++) {
    const xBase = startX + i * spacing;
    const h = wingH * (1 - i * 0.14);
    for (const signX of [-1, 1] as const) {
      list.push({
        points: [
          { x: signX * xBase, y: h },
          { x: signX * (xBase + wingW), y: 0 },
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

