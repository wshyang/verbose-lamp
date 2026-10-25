// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupDomTests } from '@/test/dom';
import {
  circleOverlapsRect,
  farthestCornerDistance,
  offscreenTargets,
  pointFromElement,
  pointInRect,
  rectFromElement,
} from './geometry';

setupDomTests();

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

const host = (box: DOMRect) => {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => box;
  return element;
};

describe('element geometry', () => {
  it('normalises an element centre against the viewport', () => {
    window.innerWidth = 1000;
    window.innerHeight = 500;

    const point = pointFromElement(host(rect(100, 50, 200, 100)));

    expect(point).toEqual({ x: 200 / 1000, y: 100 / 500 });
  });

  it('normalises an element box, keeping its origin', () => {
    window.innerWidth = 800;
    window.innerHeight = 400;

    const box = rectFromElement(host(rect(80, 40, 160, 80)));

    expect(box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });
});

describe('farthestCornerDistance', () => {
  it('measures the far corner with the aspect applied to x', () => {
    expect(farthestCornerDistance({ x: 0.5, y: 0.5 }, 2)).toBeCloseTo(Math.hypot(1, 0.5));
    expect(farthestCornerDistance({ x: 0.1, y: 0.9 }, 1)).toBeCloseTo(Math.hypot(0.9, 0.9));
  });

  it('grows as the origin moves toward a corner', () => {
    const centre = farthestCornerDistance({ x: 0.5, y: 0.5 }, 1.78);
    const corner = farthestCornerDistance({ x: 0.02, y: 0.02 }, 1.78);

    expect(corner).toBeGreaterThan(centre);
  });
});

describe('offscreenTargets', () => {
  it('puts the side targets beyond the left and right edges', () => {
    const targets = offscreenTargets({ x: 0.3, y: 0.7 }, 'sides');

    expect(targets).toHaveLength(2);
    expect(targets[0]).toEqual({ x: -0.15, y: 0.7 });
    expect(targets[1]).toEqual({ x: 1.15, y: 0.7 });
  });

  it('puts the corner targets beyond all four corners', () => {
    const targets = offscreenTargets({ x: 0.5, y: 0.5 }, 'corners');

    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.x < 0 || target.x > 1).toBe(true);
      expect(target.y < 0 || target.y > 1).toBe(true);
    }
  });

  it('passes explicit targets through untouched', () => {
    const explicit = [{ x: 2, y: 3 }];

    expect(offscreenTargets({ x: 0, y: 0 }, explicit)).toBe(explicit);
  });
});

describe('pointInRect', () => {
  const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };

  it('includes the edges', () => {
    expect(pointInRect({ x: 0.2, y: 0.2 }, box)).toBe(true);
    expect(pointInRect({ x: 0.6, y: 0.4 }, box)).toBe(true);
    expect(pointInRect({ x: 0.4, y: 0.3 }, box)).toBe(true);
  });

  it('excludes a point outside either axis', () => {
    expect(pointInRect({ x: 0.61, y: 0.3 }, box)).toBe(false);
    expect(pointInRect({ x: 0.4, y: 0.41 }, box)).toBe(false);
  });
});

describe('circleOverlapsRect', () => {
  const box = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };

  it('counts a circle inside the box as an overlap', () => {
    expect(circleOverlapsRect({ centre: { x: 0.5, y: 0.5 }, radius: 0.01, rect: box, aspect: 1.78 })).toBe(true);
  });

  it('counts a circle just outside the edge within its radius', () => {
    expect(circleOverlapsRect({ centre: { x: 0.5, y: 0.35 }, radius: 0.06, rect: box, aspect: 1.78 })).toBe(true);
    expect(circleOverlapsRect({ centre: { x: 0.5, y: 0.35 }, radius: 0.04, rect: box, aspect: 1.78 })).toBe(false);
  });

  it('stretches the x gap by the aspect, so a wide viewport separates further', () => {
    // The raw x gap is 0.2; at aspect 2 the corrected gap is 0.4, past the radius.
    const query = { centre: { x: 0.2, y: 0.5 }, radius: 0.3, rect: box };

    expect(circleOverlapsRect({ ...query, aspect: 1 })).toBe(true);
    expect(circleOverlapsRect({ ...query, aspect: 2 })).toBe(false);
  });
});
