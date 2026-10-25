// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useSpectacleStage } from './useSpectacleStage';

import { createSpectacleStage } from '../engine/createSpectacleStage';

const stageCalls = vi.hoisted(() => ({
  created: [] as string[],
  disposed: 0,
  play: vi.fn(),
  stopAll: vi.fn(),
  setReducedMotion: vi.fn(),
}));
vi.mock('../engine/createSpectacleStage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../engine/createSpectacleStage')>()),
  createSpectacleStage: vi.fn(() => {
    stageCalls.created.push('stage');
    return {
      play: stageCalls.play,
      stopAll: stageCalls.stopAll,
      qualityTier: 'high' as const,
      setReducedMotion: stageCalls.setReducedMotion,
      dispose: () => {
        stageCalls.disposed += 1;
      },
    };
  }),
}));
const ORIGIN = { x: 0.5, y: 0.5 };
describe('useSpectacleStage', () => {
  beforeEach(() => {
    stageCalls.created = [];
    stageCalls.disposed = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setup({ withHost = true } = {}) {
    const host = withHost ? document.createElement('div') : null;
    const hostRef = { current: host };
    const onAnnounce = vi.fn();
    const hook = renderHook(
      (props: { reducedMotion: boolean }) =>
        useSpectacleStage({ hostRef, reducedMotion: props.reducedMotion, onAnnounce }),
      { initialProps: { reducedMotion: false } }
    );
    return { host, hook };
  }

  it('creates the stage once the host exists and reports readiness', () => {
    const { host, hook } = setup();
    expect(createSpectacleStage).toHaveBeenCalledOnce();
    expect(createSpectacleStage).toHaveBeenCalledWith(
      expect.objectContaining({ host, reducedMotion: false, onAnnounce: expect.any(Function) })
    );
    expect(hook.result.current.isReady).toBe(true);
    expect(hook.result.current.qualityTier).toBe('high');
  });

  it('stays unready without a host element', () => {
    const { hook } = setup({ withHost: false });
    expect(createSpectacleStage).not.toHaveBeenCalled();
    expect(hook.result.current.isReady).toBe(false);
    expect(hook.result.current.qualityTier).toBeNull();
  });

  it('hands back a stoppable handle when there is no stage yet', async () => {
    const { hook } = setup({ withHost: false });
    const handle = hook.result.current.play('sparkler', { origin: ORIGIN, count: 2 });
    expect(() => handle.stop()).not.toThrow();
    await expect(handle.finished).resolves.toBeUndefined();
    expect(stageCalls.play).not.toHaveBeenCalled();
  });

  it('forwards play and stopAll to the stage', () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.play('sparkler', { origin: ORIGIN, count: 2 });
    });
    expect(stageCalls.play).toHaveBeenCalledWith('sparkler', { origin: ORIGIN, count: 2 });
    act(() => hook.result.current.stopAll());
    expect(stageCalls.stopAll).toHaveBeenCalledOnce();
  });

  it('returns a no-op handle before the stage exists', async () => {
    const { hook } = setup({ withHost: false });
    const handle = hook.result.current.play('sparkler', { origin: ORIGIN, count: 1 });
    expect(handle.stop).toBeTypeOf('function');
    await expect(handle.finished).resolves.toBeUndefined();
    expect(() => act(() => hook.result.current.stopAll())).not.toThrow();
    expect(stageCalls.stopAll).not.toHaveBeenCalled();
  });

  it('pushes reduced-motion changes into the live stage', () => {
    const { hook } = setup();
    act(() => hook.rerender({ reducedMotion: true }));
    expect(stageCalls.setReducedMotion).toHaveBeenCalledWith(true);
    act(() => hook.rerender({ reducedMotion: false }));
    expect(stageCalls.setReducedMotion).toHaveBeenLastCalledWith(false);
    expect(createSpectacleStage).toHaveBeenCalledOnce();
  });

  it('disposes the stage and clears readiness on unmount', () => {
    const { hook } = setup();
    hook.unmount();
    expect(stageCalls.disposed).toBe(1);
  });
});
