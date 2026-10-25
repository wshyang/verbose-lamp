import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectContext, FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { sparklersEffect } from './sparklersEffect';

const VIEWPORT = { w: 1280, h: 720 } as const;
const ORIGIN = { x: 0.5, y: 0.5 } as const;

function create(overrides: Partial<EffectContext> = {}, params: Parameters<typeof sparklersEffect.create>[1] = { origin: ORIGIN, seed: 1925 }) {
  return sparklersEffect.create(
    { quality: qualitySettings('high'), reducedMotion: false, announce: () => undefined, ...overrides },
    params,
  );
}

function frameWith(fade = 1) {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade };
  return { frame, log };
}

const sprites = (log: readonly string[]) => log.filter((line) => line.startsWith('drawImage(')).length;
const radialGradients = (log: readonly string[]) => log.filter((line) => line.startsWith('createRadialGradient')).length;
const linearGradients = (log: readonly string[]) => log.filter((line) => line.startsWith('createLinearGradient')).length;

describe('sparklersEffect', () => {
  beforeEach(stubBrowserGlobals);
  afterEach(unstubBrowserGlobals);

  it('sits on the light overlay layer under the id the registry uses', () => {
    expect(sparklersEffect.id).toBe('sparkler');
    expect(sparklersEffect.layer).toBe('light-overlay');
  });

  it('lights a head and throws sparks while it burns', () => {
    const { frame, log } = frameWith();
    const effect = create();

    effect.update(0, frame);
    effect.update(400, frame);
    effect.update(800, frame);

    expect(radialGradients(log)).toBeGreaterThan(0);
    expect(sprites(log)).toBeGreaterThan(0);
  });

  it('keeps the warm head but drops the spray under reduced motion', () => {
    const full = frameWith();
    const still = frameWith();
    const motion = create();
    const reduced = create({ reducedMotion: true });

    for (const t of [200, 400, 800]) {
      motion.update(t, full.frame);
      reduced.update(t, still.frame);
    }

    expect(radialGradients(still.log)).toBeGreaterThan(0);
    expect(sprites(still.log)).toBe(0);
    expect(sprites(full.log)).toBeGreaterThan(0);
  });

  it('throws crackle rays from the head in full motion only', () => {
    const full = frameWith();
    const still = frameWith();

    create().update(300, full.frame);
    create({ reducedMotion: true }).update(300, still.frame);

    expect(linearGradients(full.log)).toBeGreaterThan(0);
    expect(linearGradients(still.log)).toBe(0);
  });

  it('draws nothing before it is struck', () => {
    const { frame, log } = frameWith();

    create().update(0, frame);

    expect(radialGradients(log)).toBe(0);
    expect(sprites(log)).toBe(0);
  });

  it('draws nothing once faded out completely', () => {
    const { frame, log } = frameWith(0);

    create().update(600, frame);

    expect(radialGradients(log)).toBe(0);
  });

  it('runs until the head burns out and the last spark dies, then reports done', () => {
    const { frame } = frameWith();
    const effect = create({}, { origin: ORIGIN, seed: 1925, durationMs: 1000 });

    expect(effect.update(500, frame)).toBe('running');
    expect(effect.update(1000, frame)).toBe('running');
    // The head is out from here, but sparks born at the last frame are still flying, so the
    // effect must not report done on the head alone.
    expect(effect.update(1100, frame)).toBe('running');
    let status: 'running' | 'done' = 'running';
    for (let t = 1200; t <= 4000 && status === 'running'; t += 100) status = effect.update(t, frame);

    expect(status).toBe('done');
  });

  it('is done as soon as the head is out when nothing was thrown', () => {
    const { frame } = frameWith();
    const effect = create({ reducedMotion: true }, { origin: ORIGIN, seed: 1925, durationMs: 800 });

    expect(effect.update(400, frame)).toBe('running');
    expect(effect.update(900, frame)).toBe('done');
  });

  it('does not emit again when time does not advance', () => {
    const a = frameWith();
    const b = frameWith();
    const once = create();
    const twice = create();

    once.update(600, a.frame);
    twice.update(600, b.frame);
    twice.update(600, b.frame);

    expect(sprites(b.log)).toBe(sprites(a.log) * 2);
  });

  it('draws one head per sparkler in a fan', () => {
    const single = frameWith();
    const fan = frameWith();
    create({ reducedMotion: true }).update(400, single.frame);
    create({ reducedMotion: true }, { origin: ORIGIN, seed: 1925, count: 5 }).update(400, fan.frame);

    expect(radialGradients(fan.log)).toBe(radialGradients(single.log) * 5);
  });

  it('is repeatable for a seed and varies with it', () => {
    const run = (seed: number) => {
      const { frame, log } = frameWith();
      const effect = create({}, { origin: ORIGIN, seed });
      for (const t of [200, 500, 900]) effect.update(t, frame);
      return log.join('\n');
    };

    expect(run(1925)).toBe(run(1925));
    expect(run(1925)).not.toBe(run(7));
  });

  // Both shipped tiers' spark caps (2000, 6000) are above the effect's own 1400 ceiling, so the
  // tiers differ here only in how finely each trail is sampled.
  it('draws coarser trails on the low tier', () => {
    const low = frameWith();
    const high = frameWith();
    const params = { origin: ORIGIN, seed: 1925, count: 5, intensity: 1 };
    const lowEffect = create({ quality: qualitySettings('low') }, params);
    const highEffect = create({ quality: qualitySettings('high') }, params);

    for (const t of [300, 600, 900]) {
      lowEffect.update(t, low.frame);
      highEffect.update(t, high.frame);
    }

    expect(sprites(low.log)).toBeLessThan(sprites(high.log));
  });

  it('honours a tier whose spark cap is below the effect ceiling', () => {
    const capped = frameWith();
    const roomy = frameWith();
    const params = { origin: ORIGIN, seed: 1925, count: 5, intensity: 1 };
    const tight = create({ quality: { ...qualitySettings('high'), sparkCap: 40 } }, params);
    const normal = create({ quality: qualitySettings('high') }, params);

    for (const t of [300, 600, 900]) {
      tight.update(t, capped.frame);
      normal.update(t, roomy.frame);
    }

    expect(sprites(capped.log)).toBeGreaterThan(0);
    expect(sprites(capped.log)).toBeLessThan(sprites(roomy.log));
  });
});
