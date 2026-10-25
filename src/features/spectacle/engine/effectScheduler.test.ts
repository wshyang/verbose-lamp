// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qualitySettings } from '../model/quality';
import type { EffectInstance } from './types';
import { createEffectScheduler } from './effectScheduler';
import { createLayerRegistry } from './layers';

/**
 * Deterministic animation frames: the scheduler owns a rAF loop, so the test
 * drains a queue instead of waiting on the browser clock.
 */
let frames: FrameRequestCallback[] = [];
let nextFrameId = 1;

function runFrame(at: number): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(at);
}

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 320 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 180 });
  document.body.appendChild(host);
  return host;
}

function makeInstance(statuses: Array<'running' | 'done'> = ['running', 'done']) {
  let call = 0;
  const update = vi.fn<EffectInstance['update']>(() => {
    const status = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    return status;
  });
  return { instance: { update }, update };
}

describe('createEffectScheduler', () => {
  let host: HTMLElement;

  beforeEach(() => {
    frames = [];
    nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return nextFrameId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      if (id > 0) frames = [];
    });
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    host = makeHost();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function setup() {
    const layers = createLayerRegistry(host, qualitySettings('high'));
    return { layers, scheduler: createEffectScheduler(layers, host) };
  }

  it('starts a frame loop and stops when the effect reports done', async () => {
    const { scheduler } = setup();
    const { instance, update } = makeInstance(['running', 'done']);
    let finished = false;
    const handle = scheduler.add('light-overlay', instance);
    void handle.finished.then(() => {
      finished = true;
    });

    expect(frames).toHaveLength(1);
    performance.now = vi.fn(() => 1_016);
    runFrame(1_016);
    expect(update).toHaveBeenCalledWith(16, expect.objectContaining({ w: 320, h: 180, fade: 1 }));
    expect(frames).toHaveLength(1);
    runFrame(1_032);
    await Promise.resolve();
    expect(finished).toBe(true);
    expect(frames).toHaveLength(0);
  });

  it('shares one prepared layer across effects drawing on the same layer in a frame', () => {
    const { scheduler, layers } = setup();
    const prepare = vi.spyOn(layers, 'prepare');
    const first = makeInstance(['running', 'running', 'done']);
    const second = makeInstance(['running', 'running', 'done']);
    scheduler.add('light-overlay', first.instance);
    scheduler.add('light-overlay', second.instance);
    expect(frames).toHaveLength(1);

    runFrame(1_016);
    expect(prepare).toHaveBeenCalledTimes(1);
    runFrame(1_032);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('fades a stopped effect out over 300 ms', () => {
    const { scheduler } = setup();
    const { instance, update } = makeInstance(['running']);
    const handle = scheduler.add('light-overlay', instance);
    performance.now = vi.fn(() => 1_000);
    handle.stop();
    performance.now = vi.fn(() => 1_150);
    runFrame(1_150);
    expect(update).toHaveBeenLastCalledWith(150, expect.objectContaining({ fade: 0.5 }));
    performance.now = vi.fn(() => 1_300);
    runFrame(1_300);
    expect(frames).toHaveLength(0);
  });

  it('stops everything at once', () => {
    const { scheduler } = setup();
    const first = makeInstance(['running']);
    const second = makeInstance(['running']);
    scheduler.add('light-overlay', first.instance);
    scheduler.add('solid-overlay', second.instance);
    scheduler.stopAll();
    performance.now = vi.fn(() => 1_400);
    runFrame(1_400);
    // Stopped at the same instant the loop starts, so the 300 ms fade is already over.
    expect(first.update).toHaveBeenLastCalledWith(400, expect.objectContaining({ fade: 0 }));
    expect(second.update).toHaveBeenCalled();
  });

  it('resolves pending work and refuses new frames once disposed', async () => {
    const { scheduler } = setup();
    const { instance } = makeInstance(['running']);
    const handle = scheduler.add('light-overlay', instance);
    const settled = vi.fn();
    void handle.finished.then(settled);
    scheduler.dispose();
    await Promise.resolve();
    expect(settled).toHaveBeenCalled();
    expect(frames).toHaveLength(0);

    scheduler.add('light-overlay', instance);
    expect(frames).toHaveLength(0);
  });

  it('stops scheduling after the last effect and clears the canvases', () => {
    const { scheduler, layers } = setup();
    const clearAll = vi.spyOn(layers, 'clearAll');
    const { instance } = makeInstance(['done']);
    scheduler.add('light-overlay', instance);
    runFrame(1_016);
    expect(clearAll).toHaveBeenCalledOnce();
  });

    it('keeps the first stop time when stop() is called twice', async () => {
      const { scheduler } = setup();
      const { instance } = makeInstance(['running']);
      const handle = scheduler.add('light-overlay', instance);
      handle.stop();
      performance.now = vi.fn(() => 9_999);
      handle.stop(); // the second call must not move the fade clock
      performance.now = vi.fn(() => 1_016);
      runFrame(1_016);
      // Fading from the first stop: a second stop at 9999 would have left the
      // effect at full strength because its clock would sit in the future.
      const fade = (instance.update as unknown as { mock: { calls: Array<[number, { fade: number }]> } }).mock
        .calls[0][1].fade;
      expect(fade).toBeGreaterThan(0.9);
      expect(fade).toBeLessThan(1);
      scheduler.dispose();
      await expect(handle.finished).resolves.toBeUndefined();
    });

    it('stopAll leaves an effect that is already stopping alone', () => {
      const { scheduler } = setup();
      const { instance } = makeInstance(['running']);
      const handle = scheduler.add('light-overlay', instance);
      handle.stop();
      performance.now = vi.fn(() => 1_400);
      scheduler.stopAll();
      performance.now = vi.fn(() => 1_416);
      runFrame(1_416);
      // 416 ms after the first stop the fade is over; a reset at 1400 would have
      // brought the effect back to nearly full strength.
      const fade = (instance.update as unknown as { mock: { calls: Array<[number, { fade: number }]> } }).mock
        .calls[0][1].fade;
      expect(fade).toBe(0);
      scheduler.dispose();
    });
});
