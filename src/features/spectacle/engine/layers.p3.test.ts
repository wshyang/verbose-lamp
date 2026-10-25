// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLayerRegistry } from './layers';

import { qualitySettings } from '../model/quality';

let resizeCallback: (() => void) | null = null;
function createHost(): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(host);
  return host;
}
beforeEach(() => {
  resizeCallback = null;
  const NativeResizeObserver = globalThis.ResizeObserver;
  class ObservingResize {
    constructor(callback: () => void) {
      resizeCallback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ObservingResize ?? NativeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
describe('createLayerRegistry', () => {
  it('lazily creates a scaled canvas per layer with its blend mode and z-index', () => {
    const host = createHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));

    expect(registry.get('light-overlay')).toBeUndefined();
    const layer = registry.ensure('light-overlay');
    expect(host.contains(layer.canvas)).toBe(true);
    expect(layer.canvas.style.position).toBe('absolute');
    expect(layer.canvas.style.mixBlendMode).toBe('screen');
    expect(layer.canvas.style.zIndex).toBe('40');
    expect(layer.canvas.style.pointerEvents).toBe('none');
    expect(layer.canvas.width).toBe(Math.round(800 * Math.min(2, window.devicePixelRatio || 1)));

    expect(registry.ensure('light-overlay')).toBe(layer);
    registry.dispose();
  });

  it('fades light layers and clears the solid overlay before each frame', () => {
    const host = createHost();
    const registry = createLayerRegistry(host, qualitySettings('low'));
    const light = registry.prepare('light-backdrop');
    const lightCtx = light.ctx as unknown as Record<string, unknown>;
    const lightFill = vi.spyOn(light.ctx, 'fillRect');
    const lightClear = vi.spyOn(light.ctx, 'clearRect');
    registry.prepare('light-backdrop');

    expect(lightFill).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(lightClear).not.toHaveBeenCalled();
    expect(lightCtx.globalCompositeOperation).toBe('lighter');

    const solid = registry.prepare('solid-overlay');
    expect(solid.canvas.style.mixBlendMode).toBe('normal');
    expect(solid.canvas.style.zIndex).toBe('41');
    registry.dispose();
  });

  it('resizes every live layer when the host changes size', () => {
    const host = createHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    const layer = registry.ensure('light-overlay');
    Object.defineProperty(host, 'clientWidth', { value: 400, configurable: true });
    resizeCallback?.();
    expect(layer.canvas.width).toBe(Math.round(400 * Math.min(2, window.devicePixelRatio || 1)));
    registry.dispose();
  });

  it('clears, then schedules disposal only while idle', () => {
    vi.useFakeTimers();
    const host = createHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    registry.ensure('light-overlay');
    const clearRect = vi.spyOn(registry.get('light-overlay')!.ctx, 'clearRect');

    registry.clearAll();
    expect(clearRect).toHaveBeenCalled();
    registry.cancelIdleDispose();
    vi.advanceTimersByTime(20000);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);

    registry.clearAll();
    vi.advanceTimersByTime(10001);
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
    registry.dispose();
  });

  it('disconnects the observer and removes canvases on dispose', () => {
    const host = createHost();
    const registry = createLayerRegistry(host, qualitySettings('high'));
    registry.ensure('light-overlay');
    registry.ensure('solid-overlay');
    expect(host.querySelectorAll('canvas')).toHaveLength(2);
    registry.dispose();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
  });
});
describe('layers on a display that reports no pixel ratio', () => {
  it('falls back to a ratio of one', () => {
    const host = createHost();
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    const registry = createLayerRegistry(host, qualitySettings('high'));
    const layer = registry.ensure('light-overlay');
    expect(layer.canvas.width).toBe(800);
    expect(layer.canvas.height).toBe(600);
    registry.dispose();
    Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
  });
});
