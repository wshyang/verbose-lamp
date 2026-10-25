// @vitest-environment jsdom
// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type LayerRegistry, type Layer } from './layers';

import { createEffectScheduler } from './effectScheduler';

import { type EffectInstance, type FrameInfo } from './types';

import { type LayerId } from '../model/types';

let nowMs = 0;
let rafQueue: FrameRequestCallback[] = [];
const raf = vi.fn((cb: FrameRequestCallback) => {
  rafQueue.push(cb);
  return rafQueue.length;
});
const cancelRaf = vi.fn();
function pump(timestamp: number) {
  const callbacks = rafQueue;
  rafQueue = [];
  for (const cb of callbacks) cb(timestamp);
}
function fakeRegistry() {
  const byId = new Map<LayerId, Layer>();
  const layerFor = (id: LayerId): Layer => {
    const existing = byId.get(id);
    if (existing) return existing;
    const layer = {
      canvas: document.createElement('canvas'),
      ctx: { globalAlpha: 1 } as CanvasRenderingContext2D,
    };
    byId.set(id, layer);
    return layer;
  };
  const registry: LayerRegistry = {
    ensure: vi.fn(layerFor),
    prepare: vi.fn(layerFor),
    get: vi.fn((id: LayerId) => byId.get(id)),
    clearAll: vi.fn(),
    cancelIdleDispose: vi.fn(),
    dispose: vi.fn(),
  };
  return registry;
}
function fakeHost_p5(): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperties(host, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  return host;
}
function fakeInstance(update: EffectInstance['update']): EffectInstance {
  return { update: vi.fn(update) };
}
beforeEach(() => {
  nowMs = 0;
  rafQueue = [];
  raf.mockClear();
  cancelRaf.mockClear();
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', cancelRaf);
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('createEffectScheduler', () => {
  it('runs an effect to completion, then clears the idle stage', async () => {
    const layers = fakeRegistry();
    const scheduler = createEffectScheduler(layers, fakeHost_p5());
    const seen: FrameInfo[] = [];
    nowMs = 1000;
    const handle = scheduler.add(
      'light-overlay',
      fakeInstance((_elapsed, frame) => {
        seen.push(frame);
        frame.ctx.globalAlpha = 0.25; // the scheduler must reset this
        return 'done';
      }),
    );

    pump(1016);
    await handle.finished;

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ w: 800, h: 600, fade: 1 });
    expect(seen[0].ctx.globalAlpha).toBe(1);
    expect(layers.clearAll).toHaveBeenCalledOnce();
    expect(layers.cancelIdleDispose).toHaveBeenCalledOnce();
    expect(rafQueue).toHaveLength(0);
  });

  it('prepares a shared layer once per frame and schedules a single loop', async () => {
    const layers = fakeRegistry();
    const scheduler = createEffectScheduler(layers, fakeHost_p5());
    let frames = 0;
    const twoFrames = () => {
      frames += 1;
      return frames > 2 ? 'done' : 'running';
    };
    const first = scheduler.add('light-backdrop', fakeInstance(twoFrames));
    const second = scheduler.add('light-backdrop', fakeInstance(twoFrames));
    expect(raf).toHaveBeenCalledOnce();

    pump(16);
    expect(layers.prepare).toHaveBeenCalledOnce();
    expect(layers.get).toHaveBeenCalledOnce();

    pump(32);
    await Promise.all([first.finished, second.finished]);
    expect(layers.clearAll).toHaveBeenCalledOnce();
  });

  it('ramps the fade over 300 ms after stop and ignores a second stop', async () => {
    const scheduler = createEffectScheduler(fakeRegistry(), fakeHost_p5());
    const fades: number[] = [];
    const handle = scheduler.add(
      'solid-overlay',
      fakeInstance((_elapsed, frame) => {
        fades.push(frame.fade);
        return 'running';
      }),
    );

    pump(16);
    nowMs = 100;
    handle.stop();
    handle.stop();
    pump(250);
    pump(400);
    await handle.finished;

    expect(fades).toEqual([1, 0.5, 0]);
  });

  it('dispose resolves live effects and blocks new scheduling', async () => {
    const scheduler = createEffectScheduler(fakeRegistry(), fakeHost_p5());
    const live = scheduler.add('light-overlay', fakeInstance(() => 'running'));

    scheduler.dispose();
    await live.finished;
    expect(cancelRaf).toHaveBeenCalled();

    raf.mockClear();
    scheduler.add('light-overlay', fakeInstance(() => 'running'));
    expect(raf).not.toHaveBeenCalled();
    scheduler.dispose();
  });
});
