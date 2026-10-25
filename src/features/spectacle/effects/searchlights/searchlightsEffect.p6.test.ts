// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { type FrameInfo, type EffectDefinition } from '../../engine/types';

import { qualitySettings } from '../../model/quality';

import { createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals } from '../../testing/recordingCanvas';

import { searchlightsEffect } from './searchlightsEffect';

import { type SearchlightParams } from '../../model/types';

/**
 * The keep-clear pass is the one part of the searchlights the golden recordings
 * never reach: every shipped plan passes an empty rect list. It punches the
 * speaker's box out of the additive haze with `destination-out`, then restores
 * `lighter` so the next beam composes normally.
 */
const VIEWPORT = { w: 1280, h: 720 } as const;
const instance = (params: SearchlightParams, reducedMotion = false) => {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade: 1 };
  const effect = searchlightsEffect as EffectDefinition<SearchlightParams>;
  const running = effect.create(
    { quality: qualitySettings('high'), reducedMotion, announce: () => {} },
    params,
  );

  running.update(1200, frame);

  return { log, ctx };
};
beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);
describe('searchlights keep-clear', () => {
  it('draws three beams and no cut-out when nothing is reserved', () => {
    const { log } = instance({ beams: 3, seed: 1925 });

    expect(log.some((line) => line.startsWith('fillRect'))).toBe(false);
    expect(log.filter((line) => line.startsWith('globalCompositeOperation=destination-out'))).toHaveLength(0);
    // Each beam is two cone fills.
    expect(log.filter((line) => line === 'fill()')).toHaveLength(6);
  });

  it('punches each reserved rect out in device pixels, then restores additive blending', () => {
    const { log } = instance({
      beams: 2,
      seed: 7,
      keepClear: [
        { x: 0.1, y: 0.5, w: 0.25, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ],
    });

    const rects = log.filter((line) => line.startsWith('fillRect'));
    expect(rects).toEqual(['fillRect(128,360,320,360)', 'fillRect(640,360,640,360)']);

    const cutOut = log.indexOf('globalCompositeOperation=destination-out');
    const restore = log.indexOf('globalCompositeOperation=lighter', cutOut);
    expect(cutOut).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(cutOut);
    expect(log[cutOut + 1]).toBe('fillStyle=rgba(0,0,0,0.55)');
  });

  it('halves the sweep speed under reduced motion', () => {
    const full = instance({ beams: 2, seed: 7 }).log;
    const reduced = instance({ beams: 2, seed: 7 }, true).log;

    expect(reduced).not.toEqual(full);
    expect(reduced.filter((line) => line === 'fill()')).toHaveLength(4);
  });

  it('defaults to three beams and the house seed', () => {
    const plain = instance({}).log;
    const explicit = instance({ beams: 3, seed: 1925 }).log;

    expect(plain).toEqual(explicit);
  });
});
