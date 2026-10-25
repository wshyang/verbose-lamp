import { hash01 } from '@/shared/lib/random';

export interface PixelPoint {
  x: number;
  y: number;
}

export interface WandGeometryRequest {
  tip: PixelPoint;
  direction: PixelPoint;
  lengthPx: number;
  burnProgress: number;
  swayPx: number;
}

export interface WandGeometry {
  tip: PixelPoint;
  burnFront: PixelPoint;
  handle: PixelPoint;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function normalized(direction: PixelPoint): PixelPoint {
  const length = Math.hypot(direction.x, direction.y);
  return length < 1e-9 ? { x: 0, y: 1 } : { x: direction.x / length, y: direction.y / length };
}

/** A hand-held party sparkler: burning tip first, wire handle trailing behind. */
export function wandGeometry(request: WandGeometryRequest): WandGeometry {
  const direction = normalized(request.direction);
  const perpendicular = { x: -direction.y, y: direction.x };
  const handle = {
    x: request.tip.x - direction.x * request.lengthPx + perpendicular.x * request.swayPx,
    y: request.tip.y - direction.y * request.lengthPx + perpendicular.y * request.swayPx,
  };
  const burn = clamp01(request.burnProgress);
  return {
    tip: { ...request.tip },
    burnFront: {
      x: request.tip.x + (handle.x - request.tip.x) * burn,
      y: request.tip.y + (handle.y - request.tip.y) * burn,
    },
    handle,
  };
}

export interface FlickerRequest {
  seed: number;
  timeMs: number;
}

/** Deterministic 45 ms-bucket brightness jitter for the incandescent tip. */
export function sparklerFlicker({ seed, timeMs }: FlickerRequest): number {
  const bucket = Math.floor(timeMs / 45);
  return 0.82 + hash01(seed * 7919 + 17, bucket) * 0.28;
}
