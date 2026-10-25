import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectContext, EffectDefinition, FrameInfo } from '../engine/types';
import { qualitySettings } from '../model/quality';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../testing/recordingCanvas';
import { champagneEffect } from './champagne/champagneEffect';
import { confettiEffect } from './confetti/confettiEffect';
import { countdownEffect } from './countdown/countdownEffect';
import { flashEffect } from './flash/flashEffect';
import { nameRevealEffect } from './nameReveal/nameRevealEffect';
import { searchlightsEffect } from './searchlights/searchlightsEffect';
import { planSparklerTransition } from './sparklers/sparklerPlan';

const CONTEXT: EffectContext = {
  quality: qualitySettings('high'), reducedMotion: false, announce: () => undefined,
};

function run<P>(definition: EffectDefinition<P>, params: P, times: readonly number[], size = { w: 1280, h: 720 }) {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...size, fade: 1 };
  const instance = definition.create(CONTEXT, params);
  const statuses = times.map((time) => instance.update(time, frame));
  return { statuses, log };
}

beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);

describe('effect parameter-default and lifecycle branches', () => {
  it('defaults searchlight beams/seed and dims a supplied keep-clear rect', () => {
    const plain = run(searchlightsEffect, {}, [0]);
    const cleared = run(searchlightsEffect, { keepClear: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] }, [0]);
    expect(plain.statuses).toEqual(['running']);
    expect(cleared.log).toContain('globalCompositeOperation=destination-out');
    expect(cleared.log.some((entry) => entry.startsWith('fillRect(128,72'))).toBe(true);
  });

  it('defaults champagne seed/rate and removes beads above the viewport', () => {
    const result = run(champagneEffect, {}, [1000, 30_000]);
    expect(result.statuses).toEqual(['running', 'running']);
  });

  it('defaults confetti seed and finishes after its tail', () => {
    expect(run(confettiEffect, { mode: 'rain' }, [6101]).statuses).toEqual(['done']);
  });

  it('defaults countdown start/beat and flash origin', () => {
    expect(run(countdownEffect, {}, [0]).statuses).toEqual(['running']);
    expect(run(flashEffect, {}, [100]).statuses).toEqual(['running']);
  });

  it('fits a long non-Deco name without a subtitle', () => {
    const result = run(nameRevealEffect, { name: 'Zoë Extraordinarily Long' }, [600], { w: 200, h: 1000 });
    expect(result.statuses).toEqual(['running']);
    expect(result.log.some((entry) => entry.includes('Cinzel, Georgia, serif'))).toBe(true);
  });

  it('plans a degenerate sparkler track at the origin', () => {
    const origin = { x: 0.5, y: 0.5 };
    const plan = planSparklerTransition({ origin, pattern: [origin], direction: 'outward' });
    expect(plan.tracks[0].control).toEqual(origin);
  });
});
