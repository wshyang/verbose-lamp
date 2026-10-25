// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectDefinition } from './types';
import { createSpectacleStage } from './createSpectacleStage';

const registry = vi.hoisted(() => ({
  create: vi.fn((_options: unknown) => ({ update: () => 'done' as const })),
}));

vi.mock('./effectRegistry', () => ({
  effectRegistry: {
    'name-reveal': {
      id: 'name-reveal',
      layer: 'solid-overlay',
      create: registry.create,
    } satisfies EffectDefinition<unknown>,
  },
}));

const scheduler = vi.hoisted(() => ({
  add: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
  stopAll: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('./effectScheduler', () => ({ createEffectScheduler: () => scheduler }));
vi.mock('./layers', () => ({
  createLayerRegistry: () => ({ dispose: vi.fn(), ensure: vi.fn(), prepare: vi.fn(), get: vi.fn() }),
}));

function host() {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('createSpectacleStage', () => {
  it('exposes the resolved quality tier and plays effects on their layer', () => {
    const onAnnounce = vi.fn();
    const stage = createSpectacleStage({ host: host(), quality: 'high', onAnnounce });
    expect(stage.qualityTier).toBe('high');

    const handle = stage.play('name-reveal', { name: 'Jay Gatsby' });
    expect(scheduler.add).toHaveBeenCalledWith('solid-overlay', expect.anything());
    expect(handle.finished).toBeInstanceOf(Promise);

    const options = registry.create.mock.calls[0][0] as {
      quality: { tier: string };
      reducedMotion: boolean;
      announce: (text: string) => void;
    };
    expect(options.quality.tier).toBe('high');
    expect(options.reducedMotion).toBe(false);
    options.announce('Jay Gatsby');
    expect(onAnnounce).toHaveBeenCalledWith('Jay Gatsby');
  });

  it('defaults to auto quality, no announcements and motion allowed', () => {
    const stage = createSpectacleStage({ host: host() });
    expect(['low', 'high']).toContain(stage.qualityTier);
    stage.play('name-reveal', { name: 'Daisy' });
    const options = registry.create.mock.calls[0][0] as {
      reducedMotion: boolean;
      announce: (text: string) => void;
    };
    expect(options.reducedMotion).toBe(false);
    expect(() => options.announce('Daisy')).not.toThrow();
  });

  it('remembers a reduced-motion change for later effects', () => {
    const stage = createSpectacleStage({ host: host(), reducedMotion: true });
    stage.setReducedMotion(true);
    stage.play('name-reveal', { name: 'Daisy' });
    expect((registry.create.mock.calls[0][0] as { reducedMotion: boolean }).reducedMotion).toBe(true);

    stage.setReducedMotion(false);
    stage.play('name-reveal', { name: 'Daisy' });
    expect((registry.create.mock.calls[1][0] as { reducedMotion: boolean }).reducedMotion).toBe(false);
  });

  it('stops everything and disposes the scheduler with the layers', () => {
    const stage = createSpectacleStage({ host: host() });
    stage.stopAll();
    expect(scheduler.stopAll).toHaveBeenCalledTimes(1);
    stage.dispose();
    expect(scheduler.dispose).toHaveBeenCalledTimes(1);
  });
});
