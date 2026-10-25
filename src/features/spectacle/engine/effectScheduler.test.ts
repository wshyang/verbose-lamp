// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerId } from '../model/types';
import type { EffectInstance } from './types';
import { createEffectScheduler } from './effectScheduler';
import type { LayerRegistry } from './layers';

type FrameCallback = (now: number) => void;

let frames: FrameCallback[] = [];
let now = 0;

function createRegistry() {
  const prepared: LayerId[] = [];
  const layer = { canvas: document.createElement('canvas'), ctx: document.createElement('canvas').getContext('2d')! };
  const registry: LayerRegistry = {
    ensure: vi.fn(() => layer),
    prepare: vi.fn((id: LayerId) => {
      prepared.push(id);
      return layer;
    }),
    get: vi.fn(() => layer),
    clearAll: vi.fn(),
    cancelIdleDispose: vi.fn(),
    dispose: vi.fn(),
  };
  return { registry, layer, prepared };
}

function instanceOf(updates: number[]): EffectInstance {
  return {
    update: vi.fn((elapsed: number) => {
      updates.push(elapsed);
      return updates.length >= 3 ? 'done' : 'running';
    }),
  };
}

function runFrames(count: number, step = 16) {
  for (let i = 0; i < count; i += 1) {
    now += step;
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(now);
  }
}

const host = () => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: 320, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: 200, configurable: true });
  return element;
};

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createEffectScheduler', () => {
  it('draws an effect until it reports done, then clears the layers', async () => {
    const { registry, prepared } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    const updates: number[] = [];
    const handle = scheduler.add('light-overlay', instanceOf(updates));

    expect(registry.cancelIdleDispose).toHaveBeenCalled();
    expect(registry.ensure).toHaveBeenCalledWith('light-overlay');
    expect(frames).toHaveLength(1);

    runFrames(1);
    runFrames(1);
    runFrames(1);

    await handle.finished;
    expect(updates).toHaveLength(3);
    expect(prepared.every((id) => id === 'light-overlay')).toBe(true);
    expect(registry.clearAll).toHaveBeenCalled();
  });

  it('fades a stopped effect out and resolves it', async () => {
    const { registry } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    const updates: number[] = [];
    const handle = scheduler.add('solid-overlay', instanceOf(updates));

    runFrames(1);
    handle.stop();
    runFrames(1);
    runFrames(25, 16);
    await handle.finished;
    expect(registry.clearAll).toHaveBeenCalled();
  });

  it('stops everything at once and keeps a single loop', async () => {
    const { registry } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    const first: number[] = [];
    const second: number[] = [];
    const firstHandle = scheduler.add('light-overlay', instanceOf(first));
    const secondHandle = scheduler.add('light-backdrop', instanceOf(second));

    expect(frames).toHaveLength(1);
    scheduler.stopAll();
    runFrames(30, 16);
    await Promise.all([firstHandle.finished, secondHandle.finished]);
    expect(registry.clearAll).toHaveBeenCalled();
  });

  it('resolves live effects and refuses new frames after dispose', async () => {
    const { registry } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    const handle = scheduler.add('light-overlay', instanceOf([]));
    scheduler.dispose();
    await handle.finished;
    expect(registry.clearAll).not.toHaveBeenCalled();

    frames = [];
    scheduler.add('light-overlay', instanceOf([]));
    expect(frames).toHaveLength(0);
  });

  it('creates only one animation loop for concurrent effects', async () => {
    const { registry } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    scheduler.add('light-overlay', instanceOf([]));
    scheduler.add('light-backdrop', instanceOf([]));
    runFrames(1);
    expect(frames).toHaveLength(1);
    scheduler.dispose();
  });
});

describe('effect scheduler bookkeeping', () => {
  it('ignores a second stop and a stopAll after stopping', () => {
    const { registry } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    const handle = scheduler.add('light-overlay', instanceOf([]));
    handle.stop();
    expect(() => handle.stop()).not.toThrow();
    expect(() => scheduler.stopAll()).not.toThrow();
    scheduler.dispose();
  });

  it('shares one prepared layer between effects on the same layer', () => {
    const { registry, prepared } = createRegistry();
    const scheduler = createEffectScheduler(registry, host());
    scheduler.add('light-overlay', instanceOf([0, 0]));
    scheduler.add('light-overlay', instanceOf([0, 0]));
    runFrames(1);
    expect(prepared.filter((id) => id === 'light-overlay')).toHaveLength(1);
    scheduler.dispose();
  });
});
