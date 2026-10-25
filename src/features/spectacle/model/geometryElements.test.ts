// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  circleOverlapsRect,
  farthestCornerDistance,
  offscreenTargets,
  pointFromElement,
  pointInRect,
  rectFromElement,
} from './geometry';

function element(rect: Partial<DOMRect>): Element {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
  return el;
}

describe('element geometry in viewport fractions', () => {
  it('maps an element centre and box into 0..1 space', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    const el = element({ left: 100, top: 50, width: 200, height: 100 });

    expect(pointFromElement(el)).toEqual({ x: 0.2, y: 0.2 });
    expect(rectFromElement(el)).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it('measures to the farthest corner in aspect-corrected units', () => {
    // Farthest, not nearest: from the top-left the far corner is bottom-right.
    expect(farthestCornerDistance({ x: 0.1, y: 0.1 }, 2)).toBeCloseTo(Math.hypot(1.8, 0.9), 6);
    expect(farthestCornerDistance({ x: 0.9, y: 0.9 }, 2)).toBeCloseTo(Math.hypot(1.8, 0.9), 6);
    expect(farthestCornerDistance({ x: 0.5, y: 0.5 }, 2)).toBeCloseTo(Math.hypot(1, 0.5), 6);
  });
});

describe('offscreenTargets', () => {
  it('places side targets just outside the left and right edges', () => {
    expect(offscreenTargets({ x: 0.5, y: 0.4 }, 'sides')).toEqual([
      { x: -0.15, y: 0.4 },
      { x: 1.15, y: 0.4 },
    ]);
  });

  it('places one target per corner', () => {
    expect(offscreenTargets({ x: 0.5, y: 0.5 }, 'corners')).toHaveLength(4);
  });

  it('passes a custom list through untouched', () => {
    const custom = [{ x: 2, y: 2 }] as const;
    expect(offscreenTargets({ x: 0, y: 0 }, custom)).toBe(custom);
  });
});

describe('pointInRect', () => {
  const rect = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };

  it('accepts points on the edges and inside', () => {
    expect(pointInRect({ x: 0.2, y: 0.2 }, rect)).toBe(true);
    expect(pointInRect({ x: 0.6, y: 0.4 }, rect)).toBe(true);
    expect(pointInRect({ x: 0.4, y: 0.3 }, rect)).toBe(true);
  });

  it('rejects points outside on either axis', () => {
    expect(pointInRect({ x: 0.1, y: 0.3 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.4, y: 0.5 }, rect)).toBe(false);
  });
});

describe('circleOverlapsRect', () => {
  const rect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

  it('detects a hit inside the box and just outside its edge', () => {
    expect(circleOverlapsRect({ centre: { x: 0.5, y: 0.5 }, radius: 0.01, rect, aspect: 2 })).toBe(true);
    expect(circleOverlapsRect({ centre: { x: 0.7, y: 0.5 }, radius: 0.2, rect, aspect: 2 })).toBe(true);
  });

  it('misses a circle that is far from the box', () => {
    expect(circleOverlapsRect({ centre: { x: 0.1, y: 0.1 }, radius: 0.05, rect, aspect: 2 })).toBe(false);
  });
});
