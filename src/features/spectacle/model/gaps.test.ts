// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectQualityEnv, qualitySettings } from './quality';
import { sanitizeFlashPlan } from './motionPolicy';
import {
  circleOverlapsRect,
  farthestCornerDistance,
  offscreenTargets,
  pointFromElement,
  pointInRect,
  rectFromElement,
} from './geometry';
import { blackbodyColor, rgbCss } from '../particles/blackbody';
import { createSpriteCache } from '../particles/sparkRenderer';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detectQualityEnv', () => {
  it('reads the pointer and core count from the browser', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 12, configurable: true });
    expect(detectQualityEnv()).toEqual({ coarsePointer: true, cores: 12 });
  });

  it('assumes a desktop with eight cores without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});

describe('qualitySettings', () => {
  it('names the tier it was asked for', () => {
    expect(qualitySettings('low').tier).toBe('low');
    expect(qualitySettings('high').shellScale).toBe(1);
  });
});

describe('sanitizeFlashPlan', () => {
  it('dims a fourth large flash inside one second', () => {
    const segments = Array.from({ length: 4 }, (_, index) => ({
      startMs: index * 100,
      attackMs: 90,
      holdMs: 40,
      decayMs: 120,
      peak: 1,
    }));
    const plan = sanitizeFlashPlan(segments);
    expect(plan[3].peak).toBe(0.3);
    expect(plan[0].peak).toBe(1);
  });

  it('leaves a small flash untouched', () => {
    const [small] = sanitizeFlashPlan([
      { startMs: 0, attackMs: 90, holdMs: 10, decayMs: 50, peak: 0.4 },
    ]);
    expect(small.peak).toBe(0.4);
  });
});

describe('geometry', () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 };

  it('converts an element box into normalized space', () => {
    const element = {
      getBoundingClientRect: () => ({ ...rect, left: 10, top: 20, width: 100, height: 50 }),
    } as unknown as Element;
    expect(pointFromElement(element)).toEqual({
      x: (10 + 50) / window.innerWidth,
      y: (20 + 25) / window.innerHeight,
    });
    expect(rectFromElement(element)).toEqual({
      x: 10 / window.innerWidth,
      y: 20 / window.innerHeight,
      w: 100 / window.innerWidth,
      h: 50 / window.innerHeight,
    });
  });

  it('measures to the farthest corner with the aspect applied', () => {
    expect(farthestCornerDistance({ x: 0.5, y: 0.5 }, 1)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(farthestCornerDistance({ x: 0, y: 1 }, 2)).toBeCloseTo(Math.hypot(2, 1), 5);
  });

  it('offers off-screen targets for both named patterns and a custom list', () => {
    expect(offscreenTargets({ x: 0.5, y: 0.25 }, 'sides')).toEqual([
      { x: -0.15, y: 0.25 },
      { x: 1.15, y: 0.25 },
    ]);
    expect(offscreenTargets({ x: 0.5, y: 0.5 }, 'corners')).toHaveLength(4);
    const custom = [{ x: 2, y: 2 }];
    expect(offscreenTargets({ x: 0.5, y: 0.5 }, custom)).toBe(custom);
  });

  it('decides whether a point and a circle touch a rectangle', () => {
    expect(pointInRect({ x: 50, y: 30 }, { x: 0, y: 0, w: 100, h: 100 } as never)).toBe(true);
    expect(pointInRect({ x: 150, y: 30 }, { x: 0, y: 0, w: 100, h: 100 } as never)).toBe(false);
    expect(
      circleOverlapsRect({ centre: { x: 0.5, y: 0.5 }, radius: 0.1, rect: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 }, aspect: 1 }),
    ).toBe(true);
    expect(
      circleOverlapsRect({ centre: { x: 0.1, y: 0.1 }, radius: 0.05, rect: { x: 0.8, y: 0.8, w: 0.1, h: 0.1 }, aspect: 1 }),
    ).toBe(false);
  });
});

describe('blackbody', () => {
  it('interpolates the ramp and clamps outside it', () => {
    expect(blackbodyColor(1)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
    expect(blackbodyColor(5)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
    expect(blackbodyColor(-1)).toEqual({ r: 1, g: 1, b: 0.97 });
    const mid = blackbodyColor(0.3);
    expect(mid.g).toBeGreaterThan(0.78);
    expect(mid.g).toBeLessThan(0.93);
  });

  it('writes an rgba string', () => {
    expect(rgbCss({ r: 1, g: 0.5, b: 0 }, 0.5)).toBe('rgba(255,128,0,0.5)');
  });
});

describe('createSpriteCache', () => {
  it('snaps a band to the nearest of its sprites and builds the green light once', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          createRadialGradient: () => ({ addColorStop: () => {} }),
          fillRect: () => {},
        }),
      }),
    });
    const cache = createSpriteCache();
    expect(cache.get(-0.5)).toBe(cache.get(0));
    expect(cache.get(0.5)).toBe(cache.get(0.5));
    expect(cache.get(9)).toBe(cache.get(1));
    expect(cache.green()).toBe(cache.green());
  });
});
