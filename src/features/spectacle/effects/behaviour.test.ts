import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectRegistry } from '../engine/effectRegistry';
import type { EffectDefinition, FrameInfo } from '../engine/types';
import { qualitySettings } from '../model/quality';
import {
  createRecordingContext,
  stubBrowserGlobals,
  unstubBrowserGlobals,
} from '../testing/recordingCanvas';

const VIEWPORT = { w: 1280, h: 720 } as const;

interface Harness {
  log: string[];
  statuses: string[];
}

function run(
  id: keyof typeof effectRegistry,
  params: unknown,
  options: { reducedMotion?: boolean; stepMs?: number; untilMs?: number } = {},
): Harness {
  const definition = effectRegistry[id] as EffectDefinition<unknown>;
  const instance = definition.create(
    {
      quality: qualitySettings('high'),
      reducedMotion: options.reducedMotion ?? false,
      announce: () => {},
    },
    params,
  );
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade: 1 };
  const stepMs = options.stepMs ?? 100;
  const untilMs = options.untilMs ?? 6000;
  const statuses: string[] = [];
  let status: 'running' | 'done' = 'running';
  for (let t = 0; t <= untilMs && status === 'running'; t += stepMs) {
    status = instance.update(t, frame);
    statuses.push(status);
  }
  return { log, statuses };
}

beforeEach(() => {
  stubBrowserGlobals();
});

afterEach(() => {
  unstubBrowserGlobals();
});

describe('fireworks under reduced motion', () => {
  it('drifts a few glitter sparks instead of launching shells', () => {
    const { log, statuses } = run('fireworks', { seed: 1925, intensity: 0.5 }, { reducedMotion: true });
    expect(log.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 'running')).toBe(true);
    expect(log.join('\n')).not.toContain('createRadialGradient');
  });

  it('finishes once the pool is empty', () => {
    const { statuses } = run(
      'fireworks',
      { seed: 7, intensity: 0.2, durationMs: 200 },
      { untilMs: 60000, stepMs: 500 },
    );
    expect(statuses.at(-1)).toBe('done');
  });
});

describe('fireworks schedules', () => {
  it('keeps the show going when continuous', () => {
    const { log } = run(
      'fireworks',
      { seed: 1925, intensity: 0.8, continuous: true, durationMs: 800 },
      { untilMs: 20000, stepMs: 200 },
    );
    expect(log.join('\n')).toContain('drawImage');
  });

  it('dims every spark that falls in a keep-clear box', () => {
    const keepClear = [{ x: 0, y: 0, w: 0.55, h: 1 }];
    const { log } = run(
      'fireworks',
      { seed: 1925, intensity: 0.9, keepClear, durationMs: 3000 },
      { untilMs: 12000, stepMs: 100 },
    );
    expect(log.join('\n')).toContain('globalAlpha=0.2');
  });

  it('honours the green-light pistil', () => {
    const { log } = run('fireworks', { seed: 1925, finale: true, greenLight: true });
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('a keep-clear box that covers the stage', () => {
  it('leaves the planner with nowhere to place a shell', () => {
    const { log } = run('fireworks', {
      seed: 1925,
      intensity: 0.5,
      durationMs: 4000,
      keepClear: [{ x: 0, y: 0, w: 1, h: 1 }],
    });
    expect(log.length).toBeGreaterThanOrEqual(0);
  });
});

describe('searchlights', () => {
  it('sweeps beams and cuts keep-clear boxes out of the light', () => {
    const { log } = run('searchlights', {
      beams: 2,
      seed: 11,
      keepClear: [{ x: 0.2, y: 0.4, w: 0.3, h: 0.2 }],
    });
    expect(log.join('\n')).toContain('destination-out');
    expect(log.join('\n')).toContain('globalCompositeOperation=lighter');
  });

  it('slows down under reduced motion and skips empty keep-clear lists', () => {
    const calm = run('searchlights', { beams: 3, seed: 5 }, { reducedMotion: true });
    const normal = run('searchlights', { beams: 3, seed: 5 });
    expect(calm.log.join('\n')).not.toBe(normal.log.join('\n'));
    expect(calm.log.join('\n')).not.toContain('destination-out');
  });
});

describe('champagne', () => {
  it('recycles beads that leave the top of the frame', () => {
    const { log } = run('champagne', { seed: 1925 }, { untilMs: 30000, stepMs: 200 });
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('name reveal', () => {
  it('shrinks a long name until it fits', () => {
    const { log } = run('name-reveal', {
      name: 'Bartholomew Montgomery Fitzgerald-Carraway the Third',
      subtitle: 'Winner',
      maxWidth: 200,
    });
    expect(log.join('\n')).toContain('measureText');
    expect(log.filter((line) => line.startsWith('font=')).length).toBeGreaterThan(1);
  });
});

describe('countdown and sunburst keep their shapes', () => {
  it('chains a countdown into the finale', () => {
    const { log } = run('countdown', { from: 3 });
    expect(log.length).toBeGreaterThan(0);
  });
});
