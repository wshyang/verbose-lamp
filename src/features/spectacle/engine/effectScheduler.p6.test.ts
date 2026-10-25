// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type LayerRegistry } from './layers';

import { createEffectScheduler } from './effectScheduler';

import { type EffectInstance, type FrameInfo } from './types';

import { type LayerId } from '../model/types';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/** A frame loop the test drives by hand, so timing is exact. */
function stubRaf() {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    id += 1;
    queue.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => queue.delete(handle));
  return {
    get pending() {
      return queue.size;
    },
    run(time: number) {
      const callbacks = [...queue.entries()];
      queue.clear();
      for (const [, callback] of callbacks) callback(time);
    },
  };
}
function fakeLayers_p6() {
  const ctx = { globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
  const order: string[] = [];
  const layer = { canvas: {} as HTMLCanvasElement, ctx };
  const registry: LayerRegistry = {
    ensure: vi.fn((id: LayerId) => {
      order.push(`ensure:${id}`);
      return layer;
    }),
    prepare: vi.fn((id: LayerId) => {
      order.push(`prepare:${id}`);
      return layer;
    }),
    get: vi.fn(() => layer),
    clearAll: vi.fn(() => order.push('clearAll')),
    cancelIdleDispose: vi.fn(() => order.push('cancelIdleDispose')),
    dispose: vi.fn(),
  };
  return { registry, order, ctx };
}
function effect(
  update: (elapsedMs: number, info: FrameInfo) => 'running' | 'done'
): EffectInstance & { calls: Array<[number, FrameInfo]> } {
  const calls: Array<[number, FrameInfo]> = [];
  return {
    calls,
    update: (elapsedMs, info) => {
      calls.push([elapsedMs, info]);
      return update(elapsedMs, info);
    },
  };
}
const host_p6 = () => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 640, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: 360, configurable: true });
  return element;
};
const FRAME = 16;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
describe('createEffectScheduler', () => {
  it('starts a frame loop only once, and only for the first effect', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());

    scheduler.add('light-backdrop', effect(() => 'running'));
    expect(raf.pending).toBe(1);
    scheduler.add('light-overlay', effect(() => 'running'));
    expect(raf.pending).toBe(1);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('cancels the idle disposal and prepares each layer once per frame', () => {
    const raf = stubRaf();
    const { registry, order } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const a = effect(() => 'running');
    const b = effect(() => 'running');

    scheduler.add('light-backdrop', a);
    scheduler.add('light-backdrop', b);
    raf.run(FRAME);

    expect(order).toContain('cancelIdleDispose');
    expect(registry.prepare).toHaveBeenCalledTimes(1);
    expect(registry.get).toHaveBeenCalledWith('light-backdrop');
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('reports elapsed time and the frame geometry to the effect', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const instance = effect(() => 'running');

    scheduler.add('light-overlay', instance);
    raf.run(perfFrom(0));
    raf.run(perfFrom(48));

    expect(instance.calls[0][0]).toBeCloseTo(0, 0);
    expect(instance.calls[1][0]).toBeGreaterThanOrEqual(48);
    expect(instance.calls[0][1]).toMatchObject({ w: 640, h: 360, fade: 1 });

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('retires an effect when it reports done, and clears the layers when idle', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    let frames = 0;
    const handle = scheduler.add('light-backdrop', effect(() => (++frames >= 2 ? 'done' : 'running')));

    raf.run(FRAME);
    expect(registry.clearAll).not.toHaveBeenCalled();
    expect(raf.pending).toBe(1);

    raf.run(FRAME * 2);
    expect(registry.clearAll).toHaveBeenCalledTimes(1);
    expect(raf.pending).toBe(0);
    return handle.finished.then(() => scheduler.dispose()).finally(() => vi.useRealTimers());
  });

  it('resolves the handle when its effect finishes', async () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const handle = scheduler.add('light-backdrop', effect(() => 'done'));

    raf.run(FRAME);
    await expect(handle.finished).resolves.toBeUndefined();
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('fades a stopped effect out over 300 ms and then stops it', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const instance = effect(() => 'running');
    const handle = scheduler.add('light-backdrop', instance);

    raf.run(perfFrom(0));
    handle.stop();
    scheduler.add('light-overlay', effect(() => 'running'));

    raf.run(perfFrom(150));
    const fading = instance.calls.at(-1)![1].fade;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);

    raf.run(perfFrom(400));
    expect(instance.calls.at(-1)![1].fade).toBe(0);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('stopping twice keeps the original stop time', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const instance = effect(() => 'running');
    const handle = scheduler.add('light-backdrop', instance);

    handle.stop();
    raf.run(perfFrom(100));
    const first = instance.calls.at(-1)![1].fade;
    handle.stop();
    raf.run(perfFrom(100));
    expect(instance.calls.at(-1)![1].fade).toBe(first);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('stopAll fades every live effect together', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const a = effect(() => 'running');
    const b = effect(() => 'running');
    scheduler.add('light-backdrop', a);
    scheduler.add('light-overlay', b);

    raf.run(perfFrom(0));
    scheduler.stopAll();
    raf.run(perfFrom(300));

    expect(a.calls.at(-1)![1].fade).toBeLessThanOrEqual(0);
    expect(b.calls.at(-1)![1].fade).toBeLessThanOrEqual(0);
    expect(registry.clearAll).toHaveBeenCalled();

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('starts a fresh loop for an effect added after the loop went idle', () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());

    scheduler.add('light-backdrop', effect(() => 'done'));
    raf.run(FRAME);
    expect(raf.pending).toBe(0);

    scheduler.add('light-overlay', effect(() => 'running'));
    expect(raf.pending).toBe(1);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it('disposes cleanly: no loop, no new work, handles resolved', async () => {
    const raf = stubRaf();
    const { registry } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());
    const handle = scheduler.add('light-backdrop', effect(() => 'running'));

    scheduler.dispose();

    expect(raf.pending).toBe(0);
    await expect(handle.finished).resolves.toBeUndefined();

    scheduler.add('light-backdrop', effect(() => 'running'));
    expect(raf.pending).toBe(0);
    vi.useRealTimers();
  });

  it('resets the fade of the shared context after each effect', () => {
    const raf = stubRaf();
    const { registry, ctx } = fakeLayers_p6();
    const scheduler = createEffectScheduler(registry, host_p6());

    scheduler.add('light-backdrop', {
      update: () => {
        ctx.globalAlpha = 0.25;
        return 'running';
      },
    });
    raf.run(FRAME);

    expect(ctx.globalAlpha).toBe(1);
    scheduler.dispose();
    vi.useRealTimers();
  });
});
/** performance.now() is faked; the loop reports absolute times. */
function perfFrom(offset: number): number {
  return performance.now() + offset;
}
