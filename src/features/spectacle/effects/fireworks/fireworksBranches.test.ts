import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { fireworksEffect } from './fireworksEffect';
import { planShow } from './show';

const CONTEXT = {
  quality: qualitySettings('high'), reducedMotion: false, announce: () => undefined,
};

function frame(): FrameInfo {
  return { ctx: createRecordingContext().ctx, w: 1280, h: 720, fade: 1 };
}

beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);

describe('fireworks schedule branches', () => {
  it('returns no events when every candidate overlaps a full-screen keep-clear', () => {
    const whole = [{ x: -1, y: -1, w: 3, h: 3 }];
    expect(planShow({ seed: 1, keepClear: whole, durationMs: 5000 })).toEqual([]);
    expect(planShow({ seed: 1, keepClear: whole, durationMs: 5000, finale: true })).toEqual([]);
  });

  it('defaults the show seed to 1925', () => {
    expect(planShow({ durationMs: 4000 })).toEqual(planShow({ seed: 1925, durationMs: 4000 }));
  });

  it('finishes a short empty show and recycles a continuous one with default seed', () => {
    const once = fireworksEffect.create(CONTEXT, { durationMs: 100, intensity: 0 });
    expect(once.update(6000, frame())).toBe('done');
    const continuous = fireworksEffect.create(CONTEXT, {
      durationMs: 100, intensity: 0, continuous: true,
    });
    expect(continuous.update(3000, frame())).toBe('running');
    expect(continuous.update(3100, frame())).toBe('running');
  });

  it('explodes crossette splits and emerald double-break pistils from a real planned show', () => {
    let found: { seed: number; crossette: number; doubleBreak: number } | undefined;
    for (let seed = 0; seed < 1000 && !found; seed += 1) {
      const events = planShow({ seed, intensity: 1, durationMs: 12000, aspect: 1280 / 720 });
      const crossette = events.find((event) => event.type === 'crossette');
      const doubleBreak = events.find((event) => event.type === 'double-break');
      if (crossette && doubleBreak) found = { seed, crossette: crossette.tMs, doubleBreak: doubleBreak.tMs };
    }
    expect(found).toBeDefined();
    const { seed, crossette, doubleBreak } = found!;
    const effect = fireworksEffect.create(CONTEXT, {
      seed, intensity: 1, durationMs: 12000, greenLight: true,
    });
    const at = Math.max(crossette, doubleBreak);
    expect(effect.update(at, frame())).toBe('running');
    expect(effect.update(at + 1000, frame())).toBe('running');
  });

  it('applies keep-clear fading to falling sparks', () => {
    const effect = fireworksEffect.create(CONTEXT, {
      seed: 1925, intensity: 1, durationMs: 12000,
      keepClear: [{ x: 0, y: 0.5, w: 1, h: 0.5 }],
    });
    for (let time = 0; time <= 6000; time += 500) {
      expect(effect.update(time, frame())).toBe('running');
    }
  });
});
