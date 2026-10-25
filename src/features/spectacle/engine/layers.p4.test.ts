// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLayerRegistry } from './layers';

import { qualitySettings } from '../model/quality';

interface ObserverStub {
  callback: ResizeObserverCallback;
}
let observers_p4: ObserverStub[] = [];
function installObserver(): void {
  observers_p4 = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly entry: ObserverStub;
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback };
        observers_p4.push(this.entry);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {
        observers_p4 = observers_p4.filter((entry) => entry !== this.entry);
      }
    }
  );
}
function makeHost(width = 400, height = 300): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: height });
  document.body.appendChild(host);
  return host;
}
function canvases(host: HTMLElement): HTMLCanvasElement[] {
  return Array.from(host.querySelectorAll('canvas'));
}
describe('createLayerRegistry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('creates a layer once, sizes it for the device and stacks it on the host', () => {
    installObserver();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));

    const layer = registry.ensure('light-overlay');
    expect(registry.ensure('light-overlay')).toBe(layer);
    expect(canvases(host)).toHaveLength(1);
    expect(layer.canvas.width).toBe(400);
    expect(layer.canvas.height).toBe(300);
    expect(layer.canvas.style.zIndex).toBe('40');
    expect(layer.canvas.style.mixBlendMode).toBe('screen');
    expect(registry.get('light-overlay')).toBe(layer);
    expect(registry.get('solid-overlay')).toBeUndefined();
  });

  it('caps device pixel ratio by the quality tier', () => {
    installObserver();
    const host = makeHost();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const registry = createLayerRegistry(host, qualitySettings('low'));
    const layer = registry.ensure('light-backdrop');
    expect(layer.canvas.width).toBe(500);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  });

  it('resizes every layer when the host resizes', () => {
    installObserver();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    const layer = registry.ensure('light-overlay');
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 800 });
    observers_p4[0].callback([], {} as ResizeObserver);
    expect(layer.canvas.width).toBe(800);
  });

  it('clears a solid layer instead of fading it', () => {
    installObserver();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    const { ctx } = registry.prepare('solid-overlay');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(registry.get('solid-overlay')).toBeDefined();
  });

  it('clears every canvas and disposes them after the idle window', () => {
    installObserver();
    vi.useFakeTimers();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    registry.ensure('light-backdrop');
    registry.ensure('light-overlay');
    registry.clearAll();
    expect(canvases(host)).toHaveLength(2);
    vi.advanceTimersByTime(9_999);
    expect(canvases(host)).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(canvases(host)).toHaveLength(0);
    expect(registry.get('light-overlay')).toBeUndefined();
  });

  it('cancels the idle disposal when effects resume', () => {
    installObserver();
    vi.useFakeTimers();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    registry.ensure('light-overlay');
    registry.clearAll();
    registry.cancelIdleDispose();
    vi.advanceTimersByTime(20_000);
    expect(canvases(host)).toHaveLength(1);
  });

  it('removes canvases and stops observing on dispose', () => {
    installObserver();
    const host = makeHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    registry.ensure('light-overlay');
    registry.dispose();
    expect(canvases(host)).toHaveLength(0);
    expect(observers_p4).toHaveLength(0);
  });
});
describe('device pixel ratio without a value', () => {
  it('falls back to 1 when the browser reports no ratio', () => {
    installObserver();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    const host = makeHost(400, 300);
    const registry = createLayerRegistry(host, qualitySettings('high'));
    const layer = registry.ensure('solid-overlay');
    expect(layer.canvas.width).toBe(400);
    expect(layer.canvas.height).toBe(300);
  });
});
