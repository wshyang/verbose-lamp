import type { AvatarFrame } from './types';

/**
 * Frame geometry, analytic per pixel so the medallion's alpha edge and its gold rim are
 * exactly concentric and equally anti-aliased at any size.
 *
 * `coverage` is the output alpha (0–1); `rim` is how much gold paint covers the pixel and
 * `brightness` where on the gold ramp that paint sits (lit from the top).
 */
export interface FramePaint {
  readonly coverage: number;
  readonly rim: number;
  readonly brightness: number;
}

/** Rim width as a share of the avatar edge (≈ 18 px at 512). */
const RIM_SHARE = 0.035;
const BEZEL_SHARE = 0.04;

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function medallionAt(x: number, y: number, size: number): FramePaint {
  const u = (x + 0.5) / size - 0.5;
  const v = (y + 0.5) / size - 0.5;
  const radius = Math.hypot(u, v) * 2;
  const pixel = 2 / size;
  const rimWidth = RIM_SHARE * 2;
  const coverage = clampUnit((1 - radius) / pixel + 0.5);
  const across = clampUnit((radius - (1 - rimWidth)) / rimWidth);
  const rim = clampUnit((radius - (1 - rimWidth)) / pixel + 0.5);
  const groove = across < 0.14 ? -0.22 : 0;
  const crest = Math.sin(Math.PI * clampUnit((across - 0.14) / 0.86));
  return { coverage, rim, brightness: 0.42 + 0.46 * crest + groove + 0.12 * (0.5 - v) };
}

/** Stepped Art Deco bezel: bright outer band, dark groove, mid inner band. */
function plaqueAt(x: number, y: number, size: number): FramePaint {
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y) + 0.5;
  const bezel = Math.max(1, size * BEZEL_SHARE);
  const v = (y + 0.5) / size - 0.5;
  const rim = clampUnit(bezel - edge + 0.5);
  const step = edge < bezel * 0.45 ? 0.86 : edge < bezel * 0.62 ? 0.3 : 0.66;
  return { coverage: 1, rim, brightness: step + 0.1 * (0.5 - v) };
}

const PAINTERS: Readonly<Record<AvatarFrame, (x: number, y: number, size: number) => FramePaint>> = Object.freeze({
  medallion: medallionAt,
  plaque: plaqueAt,
});

export function framePaintAt(frame: AvatarFrame, point: { x: number; y: number }, size: number): FramePaint {
  return PAINTERS[frame](point.x, point.y, size);
}
