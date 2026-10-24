import { describe, expect, it } from 'vitest';
import { FRAME_SOURCES, PolylineSpec } from './index';
import { buildPosterBorderSpecs } from './posterBorder';
import { DEFAULT_POSTER_BORDER_STYLE } from './types';

const geometryKey = (spec: PolylineSpec, mirrorX = false, mirrorY = false) =>
  JSON.stringify(
    spec.points
      .map((point) => [
        Math.round(point.x * (mirrorX ? -1 : 1) * 1e5) / 1e5,
        Math.round(point.y * (mirrorY ? -1 : 1) * 1e5) / 1e5,
      ])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  ) + `|${Math.round(spec.width * 1e5)}|${Math.round(spec.z * 1e5)}`;

const makeSpecs = (level: number, intricacy = 0.5) =>
  buildPosterBorderSpecs({
    halfWidth: 1.65,
    halfHeight: 0.93,
    style: { level, intricacy },
  });

describe('poster perimeter is a distinct surface', () => {
  it('is not a title-card genesis source', () => {
    expect(FRAME_SOURCES.map((source) => source.id)).toEqual([
      'authored',
      'fractal',
      'rosette',
      'arcade',
    ]);
  });

  it('has one full closed primary frame inset to the viewport perimeter', () => {
    const frames = makeSpecs(2).filter((spec) => spec.kind === 'frame');
    expect(frames).toHaveLength(1);
    expect(frames[0].closed).toBe(true);
    const maxX = Math.max(...frames[0].points.map((point) => Math.abs(point.x)));
    const maxY = Math.max(...frames[0].points.map((point) => Math.abs(point.y)));
    expect(maxX).toBeCloseTo(1.65 * 0.95, 6);
    expect(maxY).toBeCloseTo(0.93 * 0.95, 6);
  });

  it('builds four-fold symmetric rays, arcs, clasps, and margin rules', () => {
    const specs = makeSpecs(4, 1).filter((spec) => spec.kind !== 'frame');
    const all = new Set(specs.map((spec) => geometryKey(spec)));
    for (const spec of specs) {
      expect(all.has(geometryKey(spec, true))).toBe(true);
      expect(all.has(geometryKey(spec, false, true))).toBe(true);
      expect(all.has(geometryKey(spec, true, true))).toBe(true);
    }
  });

  it('increases rail count with level and detail, deterministically', () => {
    const levelCounts = [1, 2, 3, 4].map((level) => makeSpecs(level).length);
    const detailCounts = [0, 0.25, 0.5, 0.75, 1].map((detail) => makeSpecs(3, detail).length);
    expect(levelCounts).toEqual([...levelCounts].sort((a, b) => a - b));
    expect(detailCounts).toEqual([...detailCounts].sort((a, b) => a - b));
    const first = makeSpecs(4, 1);
    const second = makeSpecs(4, 1);
    expect(second).toEqual(first);
    expect(first.reduce((count, spec) => count + spec.points.length, 0)).toBeLessThan(1200);
    for (const spec of first) {
      for (const point of spec.points) {
        expect(Math.abs(point.x) + spec.width * 0.5).toBeLessThan(1.65);
        expect(Math.abs(point.y) + spec.width * 0.5).toBeLessThan(0.93);
      }
    }
  });

  it('keeps the high-detail border inside portrait and ultrawide viewports', () => {
    const viewports = [
      { halfWidth: 0.43, halfHeight: 0.93 },
      { halfWidth: 2.75, halfHeight: 0.93 },
    ];
    for (const viewport of viewports) {
      const specs = buildPosterBorderSpecs({
        ...viewport,
        style: { level: 4, intricacy: 1 },
      });
      for (const spec of specs) {
        for (const point of spec.points) {
          expect(Math.abs(point.x) + spec.width * 0.5).toBeLessThan(viewport.halfWidth);
          expect(Math.abs(point.y) + spec.width * 0.5).toBeLessThan(viewport.halfHeight);
        }
      }
    }
  });

  it('uses the same 50-point baseline detail as title frames', () => {
    expect(DEFAULT_POSTER_BORDER_STYLE.intricacy).toBe(0.5);
    expect(makeSpecs(2, DEFAULT_POSTER_BORDER_STYLE.intricacy)).toEqual(makeSpecs(2, 0.5));
  });
});