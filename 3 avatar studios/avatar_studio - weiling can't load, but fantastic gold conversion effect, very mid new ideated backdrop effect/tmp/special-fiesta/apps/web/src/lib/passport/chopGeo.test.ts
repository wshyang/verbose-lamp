import { describe, expect, it } from 'vitest';
import {
  CELL,
  arcPath,
  blobPath,
  bracketPath,
  circlePath,
  circlePerimeter,
  ellipsePath,
  ellipsePerimeter,
  polygonPath,
  polygonPerimeter,
  rectPerimeter,
  roundedRectPath,
  rulePath,
  scrawlPath,
  starPath,
  starRingPath,
  ticksPath,
  wavyPath,
} from './chopGeo.js';
import { boundsOf, extentsOf, numbersIn, pointsOf } from '../../test-utils/pathData.js';

/**
 * ADR-242 — the geometry the dies are composed from.
 *
 * These are the invariants every die inherits: numbers written to two decimals so that a seed
 * renders the same text on every engine, shapes centred on the origin so a turn pivots where the
 * stamp was pressed, and outlines whose length a gap can be measured against.
 */

const TWO_PLACES = /(^|[\s,])-?\d+(?:\.\d{1,2})?(?=[\s,]|$)/u;

describe('ADR-242 — the chop geometry', () => {
  it('writes the cell every die is drawn into', () => {
    expect(CELL).toEqual({ width: 200, height: 120 });
  });

  it('draws a rectangle with no corner as four straight edges', () => {
    expect(roundedRectPath({ width: 100, height: 60 })).toBe('M -50 -30 H 50 V 30 H -50 Z');
  });

  it('turns a corner through an arc that leaves the edges where they should meet it', () => {
    expect(roundedRectPath({ width: 100, height: 60, corner: 12 })).toBe(
      'M -38 -30 H 38 A 12 12 0 0 1 50 -18 V 18 A 12 12 0 0 1 38 30 H -38 ' +
        'A 12 12 0 0 1 -50 18 V -18 A 12 12 0 0 1 -38 -30 Z',
    );
  });

  it('clamps a corner bigger than the shape to the shape', () => {
    expect(roundedRectPath({ width: 100, height: 60, corner: 80 })).toContain('M -20 -30');
  });

  it('centres a shape on the origin and moves it off it only when told to', () => {
    expect(boundsOf(roundedRectPath({ width: 100, height: 60 }))).toEqual({
      minX: -50,
      maxX: 50,
      minY: -30,
      maxY: 30,
    });
    expect(ellipsePath({ radiusX: 20, radiusY: 20, cx: -46, cy: 4 })).toContain('M -66 4');
  });

  it('draws an oval as two halves, and a circle as an oval with the radii equal', () => {
    expect(ellipsePath({ radiusX: 62, radiusY: 45 })).toBe(
      'M -62 0 A 62 45 0 0 1 62 0 A 62 45 0 0 1 -62 0 Z',
    );
    expect(circlePath(20)).toBe(ellipsePath({ radiusX: 20, radiusY: 20 }));
  });

  it('lays a polygon from the right and turns it with the rotation it is given', () => {
    expect(polygonPath({ radius: 40, sides: 4 })).toBe('M 40 0 L 0 40 L -40 0 L 0 -40 Z');
    expect(polygonPath({ radius: 40, sides: 4, rotation: 45 })).toBe(
      'M 28.28 28.28 L -28.28 28.28 L -28.28 -28.28 L 28.28 -28.28 Z',
    );
  });

  it('stands a star on one point, outer and inner vertices alternating', () => {
    const star = starPath({ cx: 0, cy: 0, outer: 10, inner: 4, points: 5 });
    expect(star).toContain('M 0 -10');
    expect(pointsOf(star)).toHaveLength(10);
    expect(star.endsWith('Z')).toBe(true);
  });

  it('puts a ring of stars on the radius, each standing up the same way', () => {
    const ring = starRingPath({ count: 12, radius: 46.5, size: 2.8 });
    expect(ring.match(/M/gu)).toHaveLength(12);
    expect(ring).toContain('M 0 -49.3');
  });

  it('runs ticks between two radii, starting where the rotation says', () => {
    expect(ticksPath({ count: 4, inner: 10, outer: 20 })).toBe(
      'M 10 0 L 20 0 M 0 10 L 0 20 M -10 0 L -20 0 M 0 -10 L 0 -20',
    );
    expect(ticksPath({ count: 4, inner: 10, outer: 20, rotation: 90 })).toContain('M 0 10 L 0 20');
  });

  it('keeps a wave inside its amplitude and its span, and leaves it open', () => {
    const wave = wavyPath({ fromX: 0, toX: 60, y: 10, amplitude: 4, waves: 2 });
    expect(wave).toBe('M 0 10 C 10 6 20 6 30 10 C 40 14 50 14 60 10');
    const bounds = boundsOf(wave);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(60);
    expect(bounds.minY).toBeGreaterThanOrEqual(10 - 4);
    expect(bounds.maxY).toBeLessThanOrEqual(10 + 4);
  });

  it('marks four corners and draws nothing between them', () => {
    expect(bracketPath({ width: 100, height: 60, arm: 10 })).toBe(
      'M -50 -20 V -30 H -40 M 40 -30 H 50 V -20 M 50 20 V 30 H 40 M -40 30 H -50 V 20',
    );
  });

  it('pools ink around a radius that swells and settles', () => {
    const tight = blobPath({ cx: 0, cy: 0, radius: 10, lobes: 1, lumpiness: 0.2 });
    const loose = blobPath({ cx: 0, cy: 0, radius: 10, lobes: 3, lumpiness: 0.5 });
    expect(tight.match(/Q/gu)).toHaveLength(12);
    expect(loose.match(/Q/gu)).toHaveLength(24);
    expect(loose.endsWith('Z')).toBe(true);
    const bounds = boundsOf(loose);
    expect(bounds.maxX).toBeLessThanOrEqual(15.01);
    expect(bounds.minX).toBeGreaterThanOrEqual(-15.01);
  });

  it('loops a scrawl forward and does not close it', () => {
    const scrawl = scrawlPath({ x: 0, y: 0, width: 50, height: 10, loops: 1 });
    expect(pointsOf(scrawl)).toHaveLength(11);
    expect(scrawl.includes('Z')).toBe(false);
    const bounds = boundsOf(scrawl);
    // The pen is sampled at tenths of a turn, so it misses the exact top of the loop by a whisker.
    expect(bounds.minY).toBeGreaterThanOrEqual(-5);
    expect(bounds.maxY).toBeLessThanOrEqual(5);
    expect(bounds.maxY).toBeGreaterThan(4);
    expect(bounds.minY).toBeLessThan(-4);
  });

  it('carries type over the top one way and under the bottom the other', () => {
    const over = arcPath({ radius: 30, from: -148, to: -32 });
    const under = arcPath({ radius: 30, from: 148, to: 32 });
    expect(over).toBe('M -25.44 -15.9 A 30 30 0 0 1 25.44 -15.9');
    expect(under).toBe('M -25.44 15.9 A 30 30 0 0 0 25.44 15.9');
  });

  it('asks for the long way round only when the arc really is the long way', () => {
    expect(arcPath({ radius: 30, from: -170, to: 170 })).toContain(' A 30 30 0 1 1 ');
  });

  it('puts both ends of an arc on the radius, wherever the centre is', () => {
    const cases = [
      { d: arcPath({ radius: 30, from: -148, to: -32 }), cx: 0, cy: 0, radius: 30 },
      { d: arcPath({ radius: 21, from: -152, to: -28, cx: -46, cy: 6 }), cx: -46, cy: 6, radius: 21 },
    ];
    for (const item of cases) {
      for (const point of pointsOf(item.d)) {
        expect(Math.hypot(point.x - item.cx, point.y - item.cy)).toBeCloseTo(item.radius, 1);
      }
    }
  });

  it('counts the bulge of an arc as part of the shape that drew it', () => {
    const oval = ellipsePath({ radiusX: 62, radiusY: 45 });
    expect(pointsOf(oval).every((point) => point.y === 0)).toBe(true);
    expect(boundsOf(oval).maxY).toBe(45);
    expect(extentsOf(oval)).toHaveLength(pointsOf(oval).length + 4);
  });

  it('draws a rule as one straight line', () => {
    expect(rulePath(-20, 20, 5)).toBe('M -20 5 L 20 5');
  });

  it('measures an outline so a gap can be a share of it', () => {
    const corners = 12;
    const expected = 2 * (176 - 2 * corners) + 2 * (92 - 2 * corners) + 2 * Math.PI * corners;
    expect(rectPerimeter({ width: 176, height: 92, corner: corners })).toBeCloseTo(expected, 8);
    expect(rectPerimeter({ width: 100, height: 60 })).toBe(320);
    expect(circlePerimeter(10)).toBeCloseTo(2 * Math.PI * 10, 8);
    expect(ellipsePerimeter(10, 10)).toBeCloseTo(circlePerimeter(10), 8);
    expect(ellipsePerimeter(62, 45)).toBeGreaterThan(circlePerimeter(45));
    expect(ellipsePerimeter(62, 45)).toBeLessThan(circlePerimeter(62));
    expect(polygonPerimeter({ radius: 40, sides: 6 })).toBeCloseTo(240, 6);
  });

  it('writes no number with more than two decimals, and no trailing zeros', () => {
    const shapes = [
      roundedRectPath({ width: 101.7, height: 61.3, corner: 12.456 }),
      ellipsePath({ radiusX: 61.987, radiusY: 44.1 }),
      polygonPath({ radius: 56.5, sides: 6, rotation: 22.5 }),
      starRingPath({ count: 12, radius: 46.5, size: 2.8 }),
      wavyPath({ fromX: -6, toX: 93.5, y: -20.5, amplitude: 3.25, waves: 6 }),
      arcPath({ radius: 33.33, from: -148, to: -32 }),
    ];
    for (const shape of shapes) {
      expect(shape).toMatch(TWO_PLACES);
      expect(shape).not.toMatch(/\.\d{3,}/u);
      expect(shape).not.toMatch(/\.\d*0(\s|$)/u);
      expect(numbersIn(shape).every((value) => Math.abs(value) <= 200)).toBe(true);
    }
  });
});
