// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';

setupDomTests();

/**
 * The stage is a thin composition: quality in, layers and scheduler out, every
 * `play` forwarded to the registered definition. The engine's own pieces are
 * covered by their unit suites, so here they are doubled to prove the wiring.
 */
const engine = vi.hoisted(() => ({
  settings: { tier: 'high' as const, dprCap: 2, persistence: 0.8, sparkCap: 900, trailSamples: 8, shellScale: 1 },
  resolveQuality: vi.fn((preference: string, env: unknown) => ({ preference, env })),
  qualitySettings: vi.fn(),
  detectQualityEnv: vi.fn(() => ({ coarsePointer: false })),
  layers: { dispose: vi.fn(), size: vi.fn() },
  scheduler: { add: vi.fn(), stopAll: vi.fn(), dispose: vi.fn() },
  create: vi.fn(),
  announce: vi.fn(),
}));

vi.mock('../model/quality', () => ({
  detectQualityEnv: engine.detectQualityEnv,
  qualitySettings: engine.qualitySettings,
  resolveQuality: engine.resolveQuality,
}));
vi.mock('./layers', () => ({ createLayerRegistry: vi.fn(() => engine.layers) }));
vi.mock('./effectScheduler', () => ({ createEffectScheduler: vi.fn(() => engine.scheduler) }));
vi.mock('./effectRegistry', () => ({
  effectRegistry: {
    confetti: {
      layer: 'foreground',
      create: engine.create,
    },
  },
}));

import { createSpectacleStage } from './createSpectacleStage';

beforeEach(() => {
  vi.clearAllMocks();
  engine.qualitySettings.mockReturnValue(engine.settings);
  engine.scheduler.add.mockReturnValue({ finished: Promise.resolve(), stop: vi.fn() });
  engine.create.mockReturnValue({ instance: true });
});

const stage = (options: Partial<Parameters<typeof createSpectacleStage>[0]> = {}) =>
  createSpectacleStage({ host: document.createElement('div'), ...options });

describe('createSpectacleStage', () => {
  it('resolves the quality preference into settings once', () => {
    const result = stage({ quality: 'low' });

    expect(engine.detectQualityEnv).toHaveBeenCalledTimes(1);
    expect(engine.resolveQuality).toHaveBeenCalledWith('low', { coarsePointer: false });
    expect(engine.qualitySettings).toHaveBeenCalledTimes(1);
    expect(result.qualityTier).toBe('high');
  });

  it('defaults the preference to auto', () => {
    stage();

    expect(engine.resolveQuality).toHaveBeenCalledWith('auto', expect.anything());
  });

  it('builds the canvas layers and the frame scheduler on the host', () => {
    const host = document.createElement('div');
    createSpectacleStage({ host });

    expect(engine.layers).toBeDefined();
    expect(engine.scheduler.add).toBeDefined();
    // The layer registry is sized from the resolved settings.
    expect(engine.qualitySettings).toHaveBeenCalledTimes(1);
  });

  it('creates the effect with the stage environment and schedules its layer', () => {
    const handle = { finished: Promise.resolve(), stop: vi.fn() };
    engine.scheduler.add.mockReturnValue(handle);
    const result = stage();

    const played = result.play('confetti', { mode: 'burst' });

    expect(engine.create).toHaveBeenCalledWith(
      {
        quality: engine.settings,
        reducedMotion: false,
        announce: expect.any(Function),
      },
      { mode: 'burst' }
    );
    expect(engine.scheduler.add).toHaveBeenCalledWith('foreground', { instance: true });
    expect(played).toBe(handle);
  });

  it('forwards announcements to the host callback', () => {
    const onAnnounce = vi.fn();
    const result = stage({ onAnnounce });

    result.play('confetti', { mode: 'rain' });

    const environment = engine.create.mock.calls[0][0] as { announce: (text: string) => void };
    environment.announce('Confetti');
    expect(onAnnounce).toHaveBeenCalledWith('Confetti');
  });

  it('tolerates a stage with nobody listening for announcements', () => {
    const result = stage();

    result.play('confetti', { mode: 'rain' });

    const environment = engine.create.mock.calls[0][0] as { announce: (text: string) => void };
    expect(() => environment.announce('Confetti')).not.toThrow();
  });

  it('applies later reduced-motion changes to new effects only', () => {
    const result = stage();

    result.play('confetti', { mode: 'burst' });
    result.setReducedMotion(true);
    result.play('confetti', { mode: 'burst' });

    expect(engine.create.mock.calls[0][0]).toMatchObject({ reducedMotion: false });
    expect(engine.create.mock.calls[1][0]).toMatchObject({ reducedMotion: true });
  });

  it('honours reduced motion asked for at construction', () => {
    const result = stage({ reducedMotion: true });

    result.play('confetti', { mode: 'burst' });

    expect(engine.create.mock.calls[0][0]).toMatchObject({ reducedMotion: true });
  });

  it('stops every running effect on request', () => {
    const result = stage();

    result.stopAll();

    expect(engine.scheduler.stopAll).toHaveBeenCalledTimes(1);
  });

  it('tears the scheduler down before the layers', () => {
    const order: string[] = [];
    engine.scheduler.dispose.mockImplementation(() => order.push('scheduler'));
    engine.layers.dispose.mockImplementation(() => order.push('layers'));

    stage().dispose();

    expect(order).toEqual(['scheduler', 'layers']);
  });
});
