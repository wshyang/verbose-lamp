/**
 * Nine-slice rectangle layout (ADDENDUM-021 §3.4). D4 symmetry only holds
 * for squares, so a wide frame is decomposed into square corner blocks
 * (placed by D2) and straight edge bands tiled with a whole number of
 * periods; the leftover length is centred so a band never ends mid-motif.
 * Pure layout math — renderers decide what to draw in each cell.
 */

export interface NineSliceRequest {
  hw: number;
  hh: number;
  /** Corner block side as a fraction of the shorter half extent (default 0.62). */
  cornerRatio?: number;
  /** Edge-band tile period; defaults to half the corner block. */
  period?: number;
}

export interface CornerCell {
  cx: number;
  cy: number;
  size: number;
}

export interface BandLayout {
  /** Straight run between the corner blocks. */
  length: number;
  period: number;
  /** Whole tiles that fit: floor(length / period). */
  periods: number;
  /** length − periods·period, centred (the clasp takes this space). */
  remainder: number;
}

export interface NineSliceLayout {
  cornerSize: number;
  corners: readonly CornerCell[];
  horizontal: BandLayout;
  vertical: BandLayout;
}

function safePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampRatio(value: number | undefined): number {
  const ratio = value ?? 0.62;
  if (!Number.isFinite(ratio)) return 0.62;
  return Math.min(1, Math.max(0.1, ratio));
}

function bandLayout(length: number, period: number): BandLayout {
  const periods = Math.max(0, Math.floor(length / period));
  return { length, period, periods, remainder: length - periods * period };
}

export function nineSliceLayout(request: NineSliceRequest): NineSliceLayout {
  const hw = safePositive(request.hw, 1);
  const hh = safePositive(request.hh, 1);
  const cornerSize = Math.min(hw, hh) * clampRatio(request.cornerRatio);
  const period = safePositive(request.period ?? 0, cornerSize / 2);
  const cx = hw - cornerSize / 2;
  const cy = hh - cornerSize / 2;
  return {
    cornerSize,
    corners: [
      { cx, cy, size: cornerSize },
      { cx: -cx, cy, size: cornerSize },
      { cx, cy: -cy, size: cornerSize },
      { cx: -cx, cy: -cy, size: cornerSize },
    ],
    horizontal: bandLayout(Math.max(0, 2 * (hw - cornerSize)), period),
    vertical: bandLayout(Math.max(0, 2 * (hh - cornerSize)), period),
  };
}

/** Tile centres along a band, symmetric about the band's middle. */
export function bandCentres(band: BandLayout): readonly number[] {
  const filled = band.periods * band.period;
  const start = -filled / 2 + band.period / 2;
  return Array.from({ length: band.periods }, (_, i) => start + i * band.period);
}

export interface HalfExtents {
  hw: number;
  hh: number;
}

/** The clear interior a nine-sliced border leaves for content. */
export function apertureForLayout(layout: NineSliceLayout, frame: HalfExtents): HalfExtents {
  const inset = layout.cornerSize * 0.6;
  return {
    hw: Math.max(0.05, safePositive(frame.hw, 1) - inset),
    hh: Math.max(0.05, safePositive(frame.hh, 1) - inset),
  };
}
