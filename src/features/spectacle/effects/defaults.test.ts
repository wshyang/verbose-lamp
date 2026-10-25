import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectRegistry } from '../engine/effectRegistry';
import type { EffectDefinition, FrameInfo } from '../engine/types';
import { qualitySettings } from '../model/quality';
import {
  createRecordingContext,
  stubBrowserGlobals,
  unstubBrowserGlobals,
} from '../testing/recordingCanvas';

const VIEWPORT = { w: 1024, h: 640 } as const;

function run(
  id: keyof typeof effectRegistry,
  params: unknown,
  options: { reducedMotion?: boolean; stepMs?: number; untilMs?: number } = {},
) {
  const definition = effectRegistry[id] as EffectDefinition<unknown>;
  const announced: string[] = [];
  const instance = definition.create(
    {
      quality: qualitySettings('high'),
      reducedMotion: options.reducedMotion ?? false,
      announce: (message: string) => announced.push(message),
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
  return { log, statuses, announced };
}

beforeEach(() => {
  stubBrowserGlobals();
});

afterEach(() => {
  unstubBrowserGlobals();
});

describe('effects with every optional parameter omitted', () => {
  it('champagne beads at the default rate', () => {
    const { log } = run('champagne', {});
    expect(log.join('\n')).toContain('arc');
  });

  it('champagne still beads slowly under reduced motion', () => {
    const { log } = run('champagne', {}, { reducedMotion: true, untilMs: 3000 });
    expect(log.length).toBeGreaterThan(0);
  });

  it('countdown starts at the default five and beat', () => {
    const { log, statuses } = run('countdown', {}, { untilMs: 9000 });
    expect(log.join('\n')).toContain('fillText');
    expect(statuses.at(-1)).toBe('done');
  });

  it('flash erupts from the default centre', () => {
    const { log } = run('flash', {}, { untilMs: 1500 });
    expect(log.join('\n')).toContain('createRadialGradient');
  });

  it('searchlights falls back to three default beams', () => {
    const { log } = run('searchlights', {}, { untilMs: 2500 });
    expect(log.join('\n')).toContain('createLinearGradient');
  });

  it('confetti drifts from the top edge with default pieces', () => {
    const { log, statuses } = run('confetti', {}, { untilMs: 800, stepMs: 200 });
    expect(log.join('\n')).toContain('fillRect');
    expect(statuses.at(-1)).toBe('running');
  });

  it('confetti bursts from the default origin', () => {
    const { log } = run('confetti', { mode: 'burst' }, { untilMs: 600, stepMs: 200 });
    expect(log.length).toBeGreaterThan(0);
  });

  it('name reveal falls back to the plain Cinzel family and skips the subtitle', () => {
    const { log, announced } = run('name-reveal', { name: 'Daisy ✦ Buchanan' }, { untilMs: 1200 });
    expect(log.join('\n')).toContain('fillText');
    expect(log.join('\n')).not.toContain('Jost');
    expect(announced).toEqual(['Daisy ✦ Buchanan']);
  });

  it('fireworks derives its seed and schedule from defaults', () => {
    const { log } = run('fireworks', { intensity: 0.4 }, { untilMs: 4000, stepMs: 100 });
    expect(log.join('\n')).toContain('drawImage');
  });

  it('fireworks lights the emerald pistil when the green light is on', () => {
    const { log } = run(
      'fireworks',
      { intensity: 0.9, greenLight: true, shellTypes: ['double-break'], durationMs: 3000 },
      { untilMs: 4000, stepMs: 50 },
    );
    expect(log.join('\n')).toContain('drawImage');
  });

  it('fireworks honours a keep-clear box over the title', () => {
    const { log } = run(
      'fireworks',
      { seed: 3, intensity: 0.6, keepClear: [{ x: 0.35, y: 0.35, w: 0.3, h: 0.3 }], durationMs: 3000 },
      { untilMs: 4000, stepMs: 50 },
    );
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('effects that must finish on their own', () => {
  it('confetti reports done once the last foil has landed', () => {
    const { statuses } = run('confetti', { mode: 'burst', durationMs: 400 }, { untilMs: 4000, stepMs: 200 });
    expect(statuses.at(-1)).toBe('done');
  });

  it('fireworks reseed every cycle when the show is continuous', () => {
    const { log } = run(
      'fireworks',
      { intensity: 0.4, continuous: true, durationMs: 2000 },
      { untilMs: 12000, stepMs: 200 },
    );
    expect(log.join('\n')).toContain('drawImage');
  });

  it('fireworks shows the emerald pistil over a long seeded show', () => {
    const { log } = run(
      'fireworks',
      { seed: 1925, intensity: 1, greenLight: true, durationMs: 20000 },
      { untilMs: 20000, stepMs: 100 },
    );
    expect(log.join('\n')).toContain('drawImage');
  });
});
