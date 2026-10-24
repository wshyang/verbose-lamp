import { describe, expect, it } from 'vitest';
import { getCinemaCameraPose, resolveViewportFit } from './responsiveLayout';

describe('responsive viewport framing', () => {
  it('scales and levels the composition on a portrait touch viewport', () => {
    const viewport = resolveViewportFit(390, 844, true);
    const pose = getCinemaCameraPose(viewport, { x: 0.8, y: -0.6 }, 42);

    expect(viewport.isMobile).toBe(true);
    expect(viewport.cardScale).toBeCloseTo(390 / 844 / 0.9);
    expect(viewport.cameraPullback).toBe(5.8);
    expect(pose).toEqual({ x: 0, y: 0, targetX: 0, targetY: 0, roll: 0 });
  });

  it('keeps mobile landscape level without unnecessary scaling', () => {
    const viewport = resolveViewportFit(844, 390, true);
    const pose = getCinemaCameraPose(viewport, { x: -1, y: 1 }, 8);

    expect(viewport.isMobile).toBe(true);
    expect(viewport.cardScale).toBe(1);
    expect(viewport.cameraPullback).toBe(0);
    expect(pose.roll).toBe(0);
  });

  it('preserves desktop parallax and full-scale artwork', () => {
    const viewport = resolveViewportFit(1440, 900, false);
    const pose = getCinemaCameraPose(viewport, { x: 1, y: -0.5 }, 0);

    expect(viewport.isMobile).toBe(false);
    expect(viewport.cardScale).toBe(1);
    expect(pose.x).toBeCloseTo(0.56);
    expect(pose.y).toBeCloseTo(0.02);
    expect(pose.targetX).toBeCloseTo(0.18);
    expect(pose.targetY).toBeCloseTo(-0.24);
    expect(pose.roll).toBeCloseTo(-0.018);
  });
});