import type { NormPoint, NormRect } from './types';

/** Centre of a host element in normalized viewport space. */
export function pointFromElement(el: Element): NormPoint {
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height / 2) / window.innerHeight,
  };
}

export function rectFromElement(el: Element): NormRect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left / window.innerWidth,
    y: r.top / window.innerHeight,
    w: r.width / window.innerWidth,
    h: r.height / window.innerHeight,
  };
}

/**
 * Distance from a point to the farthest viewport corner, measured in
 * aspect-corrected units (x scaled by aspect) so circles stay circular.
 */
export function farthestCornerDistance(origin: NormPoint, aspect: number): number {
  const dx = Math.max(origin.x, 1 - origin.x) * aspect;
  const dy = Math.max(origin.y, 1 - origin.y);
  return Math.hypot(dx, dy);
}

/** Off-screen orb targets for the two named patterns. Always outside 0..1. */
export function offscreenTargets(
  origin: NormPoint,
  pattern: 'sides' | 'corners' | readonly NormPoint[],
): readonly NormPoint[] {
  if (pattern === 'sides') {
    return [
      { x: -0.15, y: origin.y },
      { x: 1.15, y: origin.y },
    ];
  }
  if (pattern === 'corners') {
    return [
      { x: -0.1, y: -0.1 },
      { x: 1.1, y: -0.1 },
      { x: -0.1, y: 1.1 },
      { x: 1.1, y: 1.1 },
    ];
  }
  return pattern;
}

export function pointInRect(p: NormPoint, r: NormRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Circle (aspect-corrected) vs rect overlap, used by the show scheduler. */
export interface CircleOverlapQuery {
  centre: NormPoint;
  radius: number;
  rect: NormRect;
  aspect: number;
}

export function circleOverlapsRect(query: CircleOverlapQuery): boolean {
  const { centre, radius, rect, aspect } = query;
  const cx = centre.x * aspect;
  const cy = centre.y;
  const nx = Math.max(rect.x * aspect, Math.min(cx, (rect.x + rect.w) * aspect));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return Math.hypot(cx - nx, cy - ny) < radius;
}