// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type LayerRegistry } from './layers';

import { createEffectScheduler } from './effectScheduler';

import { type EffectInstance } from './types';

let now = 1000;
let nextRaf = 1;
const frames = new Map<number, FrameRequestCallback>();
function runFrame(time: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(time));
}
function fakeLayers() {
  const layer = { canvas: document.createElement('canvas'), ctx: { globalAlpha: 0.2 } };
  const layers = {
    ensure: vi.fn(() => layer),
    prepare: vi.fn(() => layer),
    get: vi.fn(() => layer),
    clearAll: vi.fn(),
    cancelIdleDispose: vi.fn(),
    dispose: vi.fn(),
  } as unknown as LayerRegistry;
  return { layers, layer };
}
function fakeHost() {
  const element = document.createElement('div');
  Object.defineProperties(element, {
    clientWidth: { value: 640 }, clientHeight: { value: 360 },
  });
  return element;
}
beforeEach(() => {
  now = 1000;
  nextRaf = 1;
  frames.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextRaf++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('createEffectScheduler', () => {
  it('prepares each touched layer once per frame and resolves finished effects', async () => {
    const { layers, layer } = fakeLayers();
    const scheduler = createEffectScheduler(layers, fakeHost());
    const first: EffectInstance = { update: vi.fn()
      .mockReturnValueOnce('running').mockReturnValue('done') };
    const second: EffectInstance = { update: vi.fn()
      .mockReturnValueOnce('running').mockReturnValue('done') };
    const a = scheduler.add('light-overlay', first);
    const b = scheduler.add('light-overlay', second);
    expect(layers.cancelIdleDispose).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(1);

    runFrame(1016);
    expect(layers.prepare).toHaveBeenCalledOnce();
    expect(layers.get).toHaveBeenCalledOnce();
    expect(first.update).toHaveBeenCalledWith(16, { ctx: layer.ctx, w: 640, h: 360, fade: 1 });
    expect(layer.ctx.globalAlpha).toBe(1);
    runFrame(1032);
    await expect(a.finished).resolves.toBeUndefined();
    await expect(b.finished).resolves.toBeUndefined();
    expect(layers.clearAll).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('fades individual and global stops over 300 ms without resetting stop time', async () => {
    const { layers } = fakeLayers();
    const scheduler = createEffectScheduler(layers, fakeHost());
    const instance: EffectInstance = { update: vi.fn(() => 'running' as const) };
    const other: EffectInstance = { update: vi.fn(() => 'running' as const) };
    const handle = scheduler.add('solid-overlay', instance);
    const otherHandle = scheduler.add('light-backdrop', other);
    runFrame(1000);
    now = 1100;
    handle.stop();
    now = 1200;
    handle.stop();
    scheduler.stopAll();
    scheduler.stopAll();
    runFrame(1250);
    expect(instance.update).toHaveBeenLastCalledWith(250, expect.objectContaining({ fade: 0.5 }));
    runFrame(1600);
    await expect(handle.finished).resolves.toBeUndefined();
    await expect(otherHandle.finished).resolves.toBeUndefined();
  });

  it('dispose cancels RAF and resolves active effects; additions afterwards do not restart', async () => {
    const { layers } = fakeLayers();
    const scheduler = createEffectScheduler(layers, fakeHost());
    const handle = scheduler.add('light-overlay', { update: vi.fn(() => 'running' as const) });
    scheduler.dispose();
    await expect(handle.finished).resolves.toBeUndefined();
    expect(frames.size).toBe(0);
    const late = scheduler.add('light-overlay', { update: vi.fn(() => 'running' as const) });
    expect(frames.size).toBe(0);
    scheduler.dispose();
    await expect(late.finished).resolves.toBeUndefined();
  });
});
