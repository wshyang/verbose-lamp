/**
 * Nine-slice decomposition for non-square frames (ADDENDUM-021 §3.4):
 * square D4 corner blocks, 1D frieze edge bands and a clear centre.
 * Coordinates are half-extents around the origin throughout.
 */

export interface NineSliceRect {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export interface NineSlice {
  /** Full side length of one square corner block. */
  cornerSize: number;
  corners: readonly NineSliceRect[];
  topEdge: NineSliceRect;
  bottomEdge: NineSliceRect;
  leftEdge: NineSliceRect;
  rightEdge: NineSliceRect;
  /** The clear centre left for content. */
  aperture: { hw: number; hh: number };
}

export interface NineSliceQuery {
  hw: number;
  hh: number;
  /** Corner side as a fraction of the shorter full extent. Default 0.32. */
  cornerRatio?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function decomposeNineSlice({ hw, hh, cornerRatio = 0.32 }: NineSliceQuery): NineSlice {
  const cornerSize = clamp01(cornerRatio) * 2 * Math.min(hw, hh);
  const half = cornerSize / 2;
  const cx = hw - half;
  const cy = hh - half;
  const aperture = { hw: Math.max(0, hw - cornerSize), hh: Math.max(0, hh - cornerSize) };
  const corner = (sx: number, sy: number): NineSliceRect => ({
    cx: sx * cx, cy: sy * cy, hw: half, hh: half,
  });
  return {
    cornerSize,
    corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    topEdge: { cx: 0, cy, hw: aperture.hw, hh: half },
    bottomEdge: { cx: 0, cy: -cy, hw: aperture.hw, hh: half },
    leftEdge: { cx: -cx, cy: 0, hw: half, hh: aperture.hh },
    rightEdge: { cx, cy: 0, hw: half, hh: aperture.hh },
    aperture,
  };
}

export interface FriezeQuery {
  length: number;
  period: number;
}

/** Whole frieze periods in a band; the remainder is centred as a clasp. */
export function friezePeriods({ length, period }: FriezeQuery): { count: number; remainder: number } {
  if (period <= 0) return { count: 0, remainder: length };
  const count = Math.floor(length / period);
  return { count, remainder: length - count * period };
}
