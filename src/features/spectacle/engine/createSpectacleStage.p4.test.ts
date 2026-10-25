// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSpectacleStage } from './createSpectacleStage';

let frames: FrameRequestCallback[] = [];
function runFrame(at: number): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(at);
}
function makeHost(): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 640 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 360 });
  document.body.appendChild(host);
  return host;
}
describe('createSpectacleStage', () => {
  let host: HTMLElement;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    host = makeHost();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('resolves the requested quality tier', () => {
    expect(createSpectacleStage({ host, quality: 'high' }).qualityTier).toBe('high');
    expect(createSpectacleStage({ host, quality: 'low' }).qualityTier).toBe('low');
    // `auto` reads the live environment: plenty of cores and a fine pointer → high.
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    expect(createSpectacleStage({ host }).qualityTier).toBe('high');
    // A coarse pointer demotes to low even on a fast device.
    const coarse = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(createSpectacleStage({ host }).qualityTier).toBe('low');
    coarse.mockRestore();
  });

  it('runs without an announce callback', () => {
    const stage = createSpectacleStage({ host, quality: 'high' });
    const handle = stage.play('flash', {});
    runFrame(16);
    expect(handle.finished).toBeInstanceOf(Promise);
    stage.stopAll();
  });
});
