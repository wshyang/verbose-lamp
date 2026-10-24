import type { PixelPoint } from '../types';

/**
 * The reference studio drew on a 128-cell grid. Every pattern measures in those cells, so
 * a 512 px render and a 128 px preview show the same artwork at different resolutions.
 */
export const REFERENCE_GRID = 128;

/** Pixel centre as an offset from the panel centre, in reference cells. */
export function centredOffset(point: PixelPoint, size: number): { dx: number; dy: number } {
  const scale = REFERENCE_GRID / size;
  return {
    dx: (point.x + 0.5) * scale - REFERENCE_GRID / 2,
    dy: (point.y + 0.5) * scale - REFERENCE_GRID / 2,
  };
}
