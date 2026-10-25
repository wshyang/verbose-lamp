// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QualitySettings } from '../model/types';
import { createLayerRegistry } from './layers';

const SETTINGS: QualitySettings = {
  tier: 'high', sparkCap: 10, trailSamples: 2, persistence: 0.75, dprCap: 1.5, shellScale: 1,
};

type FakeContext = {
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string;
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
};

const contexts = new WeakMap<HTMLCanvasElement, FakeContext>();
const observers: Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: ResizeObserverCallback) {
    observers.push(this);
  }
}

function contextFor(canvas: HTMLCanvasElement): FakeContext {
  const existing = contexts.get(canvas);
  if (existing) return existing;
  const ctx: FakeContext = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
  };
  contexts.set(canvas, ctx);
  return ctx;
}

function host(width = 200, height = 100): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperties(element, {
    clientWidth: { configurable: true, get: () => width },
    clientHeight: { configurable: true, get: () => height },
  });
  document.body.append(element);
  return element;
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return contextFor(this) as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createLayerRegistry', () => {
  it('creates each styled layer once, sizes for capped DPR, and resizes', () => {
    const element = host();
    const registry = createLayerRegistry(element, SETTINGS);
    expect(registry.get('light-overlay')).toBeUndefined();
    const backdrop = registry.ensure('light-backdrop');
    const overlay = registry.ensure('light-overlay');
    const solid = registry.ensure('solid-overlay');
    expect(registry.ensure('light-overlay')).toBe(overlay);
    expect([backdrop.canvas.width, backdrop.canvas.height]).toEqual([300, 150]);
    expect(backdrop.canvas.style.zIndex).toBe('1');
    expect(overlay.canvas.style.zIndex).toBe('40');
    expect(solid.canvas.style.zIndex).toBe('41');
    expect(solid.canvas.style.mixBlendMode).toBe('normal');
    expect(observers[0].observe).toHaveBeenCalledWith(element);

    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 });
    observers[0].callback([], observers[0] as unknown as ResizeObserver);
    expect([backdrop.canvas.width, backdrop.canvas.height]).toEqual([200, 100]);
    registry.dispose();
    expect(element.querySelectorAll('canvas')).toHaveLength(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it('prepares light layers with afterimage fading and solid layers with a clear', () => {
    const registry = createLayerRegistry(host(50, 25), SETTINGS);
    const light = registry.prepare('light-backdrop');
    const lightCtx = contextFor(light.canvas);
    expect(lightCtx.globalCompositeOperation).toBe('lighter');
    expect(lightCtx.fillStyle).toBe('rgba(0,0,0,0.25)');
    expect(lightCtx.fillRect).toHaveBeenCalledWith(0, 0, 50, 25);

    const solid = registry.prepare('solid-overlay');
    const solidCtx = contextFor(solid.canvas);
    expect(solidCtx.globalCompositeOperation).toBe('source-over');
    expect(solidCtx.clearRect).toHaveBeenCalledWith(0, 0, 50, 25);
    registry.dispose();
  });

  it('clears now, can cancel idle disposal, and removes after ten idle seconds', () => {
    vi.useFakeTimers();
    const element = host(0, 0);
    const registry = createLayerRegistry(element, SETTINGS);
    const layer = registry.ensure('light-overlay');
    expect([layer.canvas.width, layer.canvas.height]).toEqual([1, 1]);
    registry.clearAll();
    expect(contextFor(layer.canvas).clearRect).toHaveBeenCalledWith(0, 0, 0, 0);
    registry.cancelIdleDispose();
    vi.advanceTimersByTime(10_000);
    expect(registry.get('light-overlay')).toBe(layer);
    registry.clearAll();
    vi.advanceTimersByTime(10_000);
    expect(registry.get('light-overlay')).toBeUndefined();
    expect(element.contains(layer.canvas)).toBe(false);
    registry.dispose();
  });
});
