// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSpectacleStage } from './createSpectacleStage';

const mocks = vi.hoisted(() => {
  const instance = { update: vi.fn(() => 'done') };
  const handle = { finished: Promise.resolve(), stop: vi.fn() };
  const layers = { dispose: vi.fn() };
  const scheduler = { add: vi.fn(() => handle), stopAll: vi.fn(), dispose: vi.fn() };
  return {
    instance,
    handle,
    layers,
    scheduler,
    create: vi.fn((ctx: { announce: (text: string) => void }) => {
      ctx.announce('ready');
      return instance;
    }),
    createLayers: vi.fn(() => layers),
    createScheduler: vi.fn(() => scheduler),
  };
});
vi.mock('./effectRegistry', () => ({
  effectRegistry: { flash: { id: 'flash', layer: 'light-overlay', create: mocks.create } },
}));
vi.mock('./layers', () => ({ createLayerRegistry: mocks.createLayers }));
vi.mock('./effectScheduler', () => ({ createEffectScheduler: mocks.createScheduler }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createLayers.mockReturnValue(mocks.layers);
  mocks.createScheduler.mockReturnValue(mocks.scheduler);
  mocks.scheduler.add.mockReturnValue(mocks.handle);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
});
afterEach(() => vi.unstubAllGlobals());
describe('createSpectacleStage', () => {
  it('composes defaults and forwards typed play calls without an announcer', () => {
    const host = document.createElement('div');
    const stage = createSpectacleStage({ host });
    expect(stage.qualityTier).toBe('high');
    expect(mocks.createLayers).toHaveBeenCalledWith(host, expect.objectContaining({ tier: 'high' }));
    expect(stage.play('flash', {})).toBe(mocks.handle);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ reducedMotion: false, quality: expect.objectContaining({ tier: 'high' }) }),
      {}
    );
    expect(mocks.scheduler.add).toHaveBeenCalledWith('light-overlay', mocks.instance);
    stage.stopAll();
    stage.dispose();
    expect(mocks.scheduler.stopAll).toHaveBeenCalledOnce();
    expect(mocks.scheduler.dispose).toHaveBeenCalledOnce();
    expect(mocks.layers.dispose).toHaveBeenCalledOnce();
  });

  it('honours explicit quality, announcements, and later reduced-motion changes', () => {
    const onAnnounce = vi.fn();
    const stage = createSpectacleStage({
      host: document.createElement('section'),
      quality: 'low',
      reducedMotion: true,
      onAnnounce,
    });
    expect(stage.qualityTier).toBe('low');
    stage.play('flash', { durationMs: 10 });
    expect(onAnnounce).toHaveBeenCalledWith('ready');
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true }), { durationMs: 10 });
    stage.setReducedMotion(false);
    stage.play('flash', {});
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: false }), {});
  });
});
