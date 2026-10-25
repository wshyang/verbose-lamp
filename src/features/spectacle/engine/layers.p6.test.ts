// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type QualitySettings } from '../model/types';

import { createLayerRegistry } from './layers';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/** jsdom has no canvas backend, so the 2D context is a recording stub. */
const drawCalls: string[] = [];
function stubCanvas() {
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'setTransform' || prop === 'clearRect' || prop === 'fillRect') {
        return (...args: number[]) => drawCalls.push(`${prop}(${args.join(',')})`);
      }
      return target[prop];
    },
    set(target, prop: string, value) {
      target[prop] = value;
      drawCalls.push(`${prop}=${String(value)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return ctx;
}
/** A ResizeObserver that hands its callback back, so resizing can be driven. */
function capturingResizeObserver() {
  const observers: Array<() => void> = [];
  class Capturing {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Capturing);
  return { fire: () => observers.forEach((callback) => callback()) };
}
const settings: QualitySettings = {
  tier: 'high',
  dprCap: 2,
  persistence: 0.8,
  sparkCap: 1200,
  trailSamples: 8,
  shellScale: 1,
};
function host_p6(width = 800, height = 400) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true });
  document.body.append(element);
  return element;
}
beforeEach(() => {
  drawCalls.length = 0;
  stubCanvas();
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('createLayerRegistry', () => {
  it('creates canvases lazily, stacked and blended by role', () => {
    const element = host_p6();
    const registry = createLayerRegistry(element, settings);
    expect(element.children).toHaveLength(0);

    const backdrop = registry.ensure('light-backdrop');
    const overlay = registry.ensure('solid-overlay');

    expect(element.children).toHaveLength(2);
    expect(backdrop.canvas.style.mixBlendMode).toBe('screen');
    expect(backdrop.canvas.style.zIndex).toBe('1');
    expect(overlay.canvas.style.mixBlendMode).toBe('normal');
    expect(overlay.canvas.style.pointerEvents).toBe('none');
    expect(overlay.canvas.style.position).toBe('absolute');
    registry.dispose();
  });

  it('sizes the canvas in device pixels and scales the context back', () => {
    const element = host_p6(800, 400);
    const registry = createLayerRegistry(element, settings);

    const layer = registry.ensure('light-overlay');

    expect(layer.canvas.width).toBe(1600);
    expect(layer.canvas.height).toBe(800);
    expect(drawCalls).toContain('setTransform(2,0,0,2,0,0)');
    registry.dispose();
  });

  it('returns the same canvas for the same id', () => {
    const registry = createLayerRegistry(host_p6(), settings);
    expect(registry.ensure('light-backdrop')).toBe(registry.ensure('light-backdrop'));
    expect(registry.get('light-backdrop')).toBe(registry.ensure('light-backdrop'));
    expect(registry.get('solid-overlay')).toBeUndefined();
    registry.dispose();
  });

  it('fades the light layers and clears the solid one', () => {
    const element = host_p6(640, 360);
    const registry = createLayerRegistry(element, settings);

    const light = registry.prepare('light-backdrop');
    // destination-out with the persistence inverse, then additive light.
    expect(drawCalls).toContain('globalCompositeOperation=destination-out');
    expect(drawCalls).toContain(`fillStyle=rgba(0,0,0,${1 - settings.persistence})`);
    expect(light.ctx.globalCompositeOperation).toBe('lighter');

    drawCalls.length = 0;
    const solid = registry.prepare('solid-overlay');
    expect(drawCalls).toContain('clearRect(0,0,640,360)');
    expect(solid.ctx.globalCompositeOperation).toBe('source-over');
    expect(drawCalls).not.toContain('globalCompositeOperation=destination-out');
    registry.dispose();
  });

  it('clears every canvas and disposes them after the idle window', () => {
    vi.useFakeTimers();
    const element = host_p6();
    const registry = createLayerRegistry(element, settings);
    registry.ensure('light-backdrop');
    registry.ensure('solid-overlay');

    registry.clearAll();
    expect(element.children).toHaveLength(2);

    vi.advanceTimersByTime(9999);
    expect(element.children).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(element.children).toHaveLength(0);
    expect(registry.get('light-backdrop')).toBeUndefined();

    registry.dispose();
    vi.useRealTimers();
  });

  it('cancels the idle disposal when the show starts again', () => {
    vi.useFakeTimers();
    const element = host_p6();
    const registry = createLayerRegistry(element, settings);
    registry.ensure('light-backdrop');

    registry.clearAll();
    registry.cancelIdleDispose();
    vi.advanceTimersByTime(20000);

    expect(element.children).toHaveLength(1);
    registry.dispose();
    vi.useRealTimers();
  });

  it('resizes every layer when the host resizes', () => {
    const resize = capturingResizeObserver();
    const element = host_p6(800, 400);
    const registry = createLayerRegistry(element, settings);
    const layer = registry.ensure('light-backdrop');
    const other = registry.ensure('solid-overlay');
    expect(layer.canvas.width).toBe(1600);

    Object.defineProperty(element, 'clientWidth', { value: 400, configurable: true });
    resize.fire();

    expect(layer.canvas.width).toBe(800);
    expect(other.canvas.width).toBe(800);
    registry.dispose();
  });

  it('never creates a zero-sized canvas for a collapsed host', () => {
    const registry = createLayerRegistry(host_p6(0, 0), settings);
    const layer = registry.ensure('light-backdrop');
    expect(layer.canvas.width).toBe(1);
    expect(layer.canvas.height).toBe(1);
    registry.dispose();
  });

  it('removes everything and disconnects on dispose', () => {
    const element = host_p6();
    const registry = createLayerRegistry(element, settings);
    registry.ensure('light-backdrop');

    registry.dispose();

    expect(element.children).toHaveLength(0);
    expect(registry.get('light-backdrop')).toBeUndefined();
  });

  it('falls back to a DPR of 1 when the window reports none', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    const registry = createLayerRegistry(host_p6(300, 200), settings);

    const layer = registry.ensure('light-backdrop');
    expect(layer.canvas.width).toBe(300);
    expect(layer.canvas.height).toBe(200);
    registry.dispose();
  });
});
