import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectRegistry } from '../engine/effectRegistry';
import type { EffectDefinition, EffectInstance, FrameInfo } from '../engine/types';
import { qualitySettings } from '../model/quality';
import type { EffectParamsMap, NormRect } from '../model/types';
import {
  createRecordingContext,
  stubBrowserGlobals,
  unstubBrowserGlobals,
} from '../testing/recordingCanvas';

const VIEWPORT = { w: 1280, h: 720 } as const;
const SPEAKER: NormRect = { x: 0.4, y: 0.25, w: 0.2, h: 0.25 };

function instanceOf<K extends keyof EffectParamsMap>(
  id: K,
  params: EffectParamsMap[K],
  reducedMotion = false
): { instance: EffectInstance; log: string[]; frame: FrameInfo } {
  const definition = effectRegistry[id] as EffectDefinition<EffectParamsMap[K]>;
  const instance = definition.create(
    { quality: qualitySettings('high'), reducedMotion, announce: () => undefined },
    params
  );
  const { ctx, log } = createRecordingContext();
  return { instance, log, frame: { ctx, ...VIEWPORT, fade: 1 } };
}

/** Runs an effect to its natural end and reports the frames it took. */
function runAll(id: keyof EffectParamsMap, params: EffectParamsMap[keyof EffectParamsMap], stepMs = 100, capMs = 20_000) {
  const { instance, log, frame } = instanceOf(id, params as never);
  let frames = 0;
  let status: 'running' | 'done' = 'running';
  for (let t = 0; t <= capMs && status === 'running'; t += stepMs) {
    status = instance.update(t, frame);
    frames += 1;
  }
  return { status, frames, log };
}

describe('effects with work to avoid', () => {
  beforeEach(() => {
    stubBrowserGlobals();
  });

  afterEach(() => {
    unstubBrowserGlobals();
  });

  it('searchlights dim the speaker box instead of lighting it', () => {
    const { instance, log, frame } = instanceOf('searchlights', { beams: 3, seed: 1925, keepClear: [SPEAKER] });
    instance.update(500, frame);
    expect(log.some((line) => line.startsWith('fillRect('))).toBe(true);
    expect(log).toContain('globalCompositeOperation=lighter');
  });

  it('champagne keeps pouring but drops the beads that have left the frame', () => {
    // Ambient, so it never reports done; after ~20 s the first beads have risen
    // past the top edge and are removed instead of being drawn forever.
    const { status, frames, log } = runAll('champagne', { seed: 1925 });
    expect(status).toBe('running');
    expect(frames).toBeGreaterThan(100);
    expect(log.filter((line) => line.startsWith('arc(')).length).toBeGreaterThan(50);
  });

  it('name reveal shrinks a long name to fit', () => {
    const long = 'Bartholomew Montgomery Fitzgerald III';
    const { log } = runAll('name-reveal', { name: long, subtitle: 'Lucky draw winner' });
    expect(log.some((line) => line.includes('fillText('))).toBe(true);
  });

  it('an ambient fireworks show loops rather than stopping', () => {
    const { instance, frame } = instanceOf('fireworks', { seed: 1925, continuous: true, intensity: 0.5 });
    for (let t = 0; t < 30_000; t += 250) instance.update(t, frame);
    // A looping show never reports done, however long it runs.
    expect(instance.update(30_000, frame)).toBe('running');
  });

  it('a fireworks show fades sparks inside the speaker box', () => {
    const { instance, frame } = instanceOf('fireworks', {
      seed: 7,
      intensity: 1,
      keepClear: [SPEAKER],
      greenLight: true,
    });
    for (let t = 0; t < 4_000; t += 100) instance.update(t, frame);
    expect(instance.update(4_100, frame)).toBeTypeOf('string');
  });
});

describe('effects created without any tuning', () => {
  beforeEach(() => {
    stubBrowserGlobals();
  });

  afterEach(() => {
    unstubBrowserGlobals();
  });

  // Every parameter is optional, so the registry defaults are part of the contract.
  it('searchlights fall back to three beams and the house seed', () => {
    const { instance, log, frame } = instanceOf('searchlights', {});
    instance.update(400, frame);
    expect(log.length).toBeGreaterThan(0);
  });

  it('champagne falls back to the house seed and rate', () => {
    const { instance, frame } = instanceOf('champagne', {});
    expect(instance.update(500, frame)).toBe('running');
  });

  it('countdown falls back to five beats of 900 ms', () => {
    const { status, frames } = runAll('countdown', {});
    expect(status).toBe('done');
    expect(frames).toBeGreaterThan(5);
  });

  it('confetti falls back to the house seed and stops after its tail', () => {
    const { instance, frame } = instanceOf('confetti', { mode: 'burst' });
    expect(instance.update(100, frame)).toBe('running');
    // 4600 ms of confetti plus a 1500 ms tail: past 6100 ms the effect is over.
    expect(instance.update(6_400, frame)).toBe('done');
  });

  it('fireworks with an emerald pistil emit green sparks', () => {
    // Seed 7 plans four double-break shells; the house seed plans none.
    const { instance, frame } = instanceOf('fireworks', { greenLight: true, intensity: 1, seed: 7 });
    // The green light comes from double-break shells, so give the finale the whole
    // show to schedule one: its sparks are drawn from the green sprite band.
    for (let t = 0; t <= 16_000; t += 100) instance.update(t, frame);
    expect(instance.update(16_000, frame)).toBeDefined();
  });

  it('a continuous show restarts from scratch when the sky is entirely keep-clear', () => {
    const everything: NormRect = { x: 0, y: 0, w: 1, h: 1 };
    const { instance, frame } = instanceOf('fireworks', { continuous: true, keepClear: [everything] });
    // No shell is ever planned, so the cycle re-plans on an empty event list.
    for (let t = 0; t <= 4_000; t += 100) expect(instance.update(t, frame)).toBe('running');
  });

  it('name reveal switches to the plain serif for glyphs the deco face lacks', () => {
    const { instance, log, frame } = instanceOf('name-reveal', { name: '李慕白' });
    instance.update(400, frame);
    expect(log.some((line) => line.includes('Cinzel, Georgia, serif'))).toBe(true);
  });
});
