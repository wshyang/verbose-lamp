// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectRegistry } from './effectRegistry';
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

  it('builds the effect with the stage settings and announces', () => {
    const announce = vi.fn();
    const create = vi.spyOn(effectRegistry.sparklers, 'create');
    const stage = createSpectacleStage({ host, quality: 'low', reducedMotion: true, onAnnounce: announce });

    stage.play('sparklers', { count: 2 });
    const [context] = create.mock.calls[0];
    expect(context.quality.tier).toBe('low');
    expect(context.reducedMotion).toBe(true);
    context.announce('Sparklers lit');
    expect(announce).toHaveBeenCalledWith('Sparklers lit');
    expect(frames).toHaveLength(1);
  });

  it('switches reduced motion on for later effects', () => {
    const create = vi.spyOn(effectRegistry.sparklers, 'create');
    const stage = createSpectacleStage({ host, quality: 'high' });
    expect(create).not.toHaveBeenCalled();
    stage.setReducedMotion(true);
    stage.play('sparklers', { count: 1 });
    expect(create.mock.calls[0][0].reducedMotion).toBe(true);
  });

  it('runs without an announce callback', () => {
    const stage = createSpectacleStage({ host, quality: 'high' });
    const handle = stage.play('flash', {});
    runFrame(16);
    expect(handle.finished).toBeInstanceOf(Promise);
    stage.stopAll();
  });

  it('disposes the scheduler and the canvases', () => {
    const stage = createSpectacleStage({ host, quality: 'high' });
    stage.play('sparklers', { count: 2 });
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    stage.dispose();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });
});
