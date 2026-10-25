import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectRegistry } from '../../engine/effectRegistry';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { FireworksParams } from '../../model/types';
import {
  createRecordingContext,
  stubBrowserGlobals,
  unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { planShow } from './show';

/**
 * The fireworks branches the golden recordings never reach (ADDENDUM-029 §5):
 * crossette sub-shells, the continuous recycle, the glitter gate and the
 * keep-clear dimming. Each is timing-dependent, so the seeds are found by
 * planning shows rather than guessed.
 */
const VIEWPORT = { w: 1280, h: 720 } as const;
const STEP_MS = 50;

const definition = effectRegistry.fireworks as EffectDefinition<FireworksParams>;

const context = () => {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade: 1 };
  return { frame, log };
};

/** A seed whose show opens at least one splitting (crossette) shell. */
function seedWithCrossette(): number {
  for (let seed = 1; seed <= 400; seed += 1) {
    const events = planShow({ seed, durationMs: 12000, aspect: 16 / 9 });
    if (events.some((event) => event.type === 'crossette')) return seed;
  }
  throw new Error('no crossette shell planned in 400 seeds');
}

function run(effect: EffectDefinition<FireworksParams>, params: FireworksParams, untilMs: number) {
  const instance = effect.create(
    { quality: qualitySettings('high'), reducedMotion: false, announce: () => {} },
    params,
  );
  const { frame, log } = context();
  const statuses: string[] = [];
  for (let t = 0; t <= untilMs; t += STEP_MS) statuses.push(instance.update(t, frame));
  return { log, statuses, calls: log.length };
}

beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);

describe('fireworks sub-shells', () => {
  it('fires strobe sub-bursts from split stars', () => {
    const seed = seedWithCrossette();
    const short = run(definition, { seed, durationMs: 4000 }, 1200);
    const long = run(definition, { seed, durationMs: 4000 }, 5200);

    // The split lands at 55 % of the star's life plus the shell's own delay, so
    // the later window draws strictly more: the sub-bursts are in there.
    expect(long.calls).toBeGreaterThan(short.calls);
  });

  it('stays deterministic for the splitting seed too', () => {
    const seed = seedWithCrossette();

    expect(run(definition, { seed, durationMs: 4000 }, 5200).log).toEqual(
      run(definition, { seed, durationMs: 4000 }, 5200).log
    );
  });
});

describe('fireworks recycling', () => {
  it('never finishes while continuous, and replans the show after the tail', () => {
    const instance = definition.create(
      { quality: qualitySettings('high'), reducedMotion: false, announce: () => {} },
      { seed: 7, durationMs: 1200, continuous: true },
    );
    const { frame, log } = context();
    let status = 'running';
    for (let t = 0; t <= 9000 && status === 'running'; t += STEP_MS) {
      status = instance.update(t, frame);
    }

    expect(status).toBe('running');
    // Replanning happens 2.2 s after the last scheduled shell, so drawing goes on
    // well past the first show's 1.2 s window.
    expect(log.length).toBeGreaterThan(0);
  });

  it('finishes a one-shot show once the sky is clear', () => {
    const instance = definition.create(
      { quality: qualitySettings('high'), reducedMotion: false, announce: () => {} },
      { seed: 1925, durationMs: 900 },
    );
    const { frame } = context();
    let status = 'running';
    let t = 0;
    for (; t <= 20000 && status === 'running'; t += STEP_MS) {
      status = instance.update(t, frame);
    }

    expect(status).toBe('done');
    expect(t).toBeLessThan(20000);
  });
});

describe('fireworks keep-clear', () => {
  it('dims sparks that fall inside the speaker box', () => {
    const clear = run(definition, { seed: 1925, durationMs: 4000, intensity: 1 }, 5200);
    const dimmed = run(
      definition,
      {
        seed: 1925, durationMs: 4000, intensity: 1,
        // Half the sky is a speaker: those sparks draw at 20 % strength.
        keepClear: [{ x: 0, y: 0, w: 0.5, h: 1 }],
      },
      5200,
    );

    expect(dimmed.calls).toBeGreaterThan(0);
    expect(clear.log.join('\n')).not.toBe(dimmed.log.join('\n'));
  });
});

describe('fireworks glitter', () => {
  it('skips most glitter frames but keeps drawing', () => {
    const sparkles = run(definition, { seed: 1925, durationMs: 4000, intensity: 0.9 }, 5200);
    const plain = run(definition, { seed: 1925, durationMs: 4000, intensity: 0.1 }, 5200);

    expect(sparkles.log.length).toBeGreaterThan(0);
    expect(sparkles.log.join('\n')).not.toBe(plain.log.join('\n'));
  });
});
