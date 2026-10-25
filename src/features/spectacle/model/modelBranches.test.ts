// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { chasePattern } from './chasePattern';
import { offscreenTargets, pointFromElement, pointInRect, rectFromElement } from './geometry';
import { sanitizeFlashPlan } from './motionPolicy';
import { detectQualityEnv } from './quality';

describe('spectacle geometry helpers', () => {
  it('reads element centres/rects in normalized viewport coordinates', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 20, top: 10, width: 40, height: 20, right: 60, bottom: 30, x: 20, y: 10,
      toJSON: () => ({}),
    });
    expect(pointFromElement(el)).toEqual({ x: 0.2, y: 0.2 });
    expect(rectFromElement(el)).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it('passes custom offscreen targets through and tests every rect edge', () => {
    const custom = [{ x: 2, y: 3 }];
    expect(offscreenTargets({ x: 0.5, y: 0.5 }, custom)).toBe(custom);
    const rect = { x: 0.2, y: 0.3, w: 0.4, h: 0.2 };
    expect(pointInRect({ x: 0.4, y: 0.4 }, rect)).toBe(true);
    expect(pointInRect({ x: 0.1, y: 0.4 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.7, y: 0.4 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.4, y: 0.2 }, rect)).toBe(false);
    expect(pointInRect({ x: 0.4, y: 0.6 }, rect)).toBe(false);
  });
});

describe('remaining model branches', () => {
  it('lights a sparkle bulb above the hash threshold and leaves small flashes unchanged', () => {
    expect(chasePattern(0, 1, 'sparkle')).toBe(1);
    const small = [{ startMs: 0, attackMs: 10, holdMs: 1, decayMs: 1, peak: 0.6 }];
    expect(sanitizeFlashPlan(small)[0]).toMatchObject({ attackMs: 80, peak: 0.6 });
  });

  it('detects browser quality with missing hardware concurrency', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    Object.defineProperty(window.navigator, 'hardwareConcurrency', { configurable: true, value: undefined });
    expect(detectQualityEnv()).toEqual({ coarsePointer: true, cores: 8 });
    vi.unstubAllGlobals();
  });
});
